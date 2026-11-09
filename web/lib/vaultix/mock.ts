/**
 * In-memory `VaultixClient` that implements the program's state machine
 * (specs/02-backend.md §1.3–1.5): deadlines, fee math, dispute split and
 * close rules. Used by web and backend until X-01 (`NEXT_PUBLIC_USE_MOCK`).
 *
 * Builders return real, signable `Transaction`s whose single instruction
 * carries a mock-only payload. `applyTransaction` decodes and executes it
 * atomically, the way the cluster would after the sponsor co-signs.
 *
 * Check order: status first (`InvalidStatus`), then authority (`NotSeller`,
 * `NotBuyer`, `NotArbiter`), then the instruction's own rules.
 */
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  DEFAULT_PROTOCOL,
  FINAL_STATUSES,
  VaultixError,
  type BuildCloseOrderParams,
  type BuildConfirmReceiptParams,
  type BuildCreateOrderParams,
  type BuildMarkShippedParams,
  type BuildOpenDisputeParams,
  type BuildPayParams,
  type BuildPermissionlessParams,
  type BuildResolveDisputeParams,
  type BuildWithdrawUsdcParams,
  type ConfigAccount,
  type OrderAccount,
  type OrderFilter,
  type OrderRecord,
  type VaultixClient,
  type VaultixEvent,
} from "./contract";
import {
  PROGRAM_ID,
  associatedTokenAddress,
  configPda,
  orderPda,
  vaultAddress,
} from "./pdas";
import {
  checkedU64,
  computeDisputeSplit,
  computeReleaseSplit,
  disputeDepositFor,
} from "../fees";

// Fee math lives in ../fees (shared with the UI and the backend).
export {
  computeDisputeSplit,
  computeReleaseSplit,
  disputeDepositFor,
  type DisputeSplit,
  type ReleaseSplit,
} from "../fees";

// ---------------------------------------------------------------------------
// Mock instruction payload
// ---------------------------------------------------------------------------

const MOCK_DATA_PREFIX = "vaultix-mock:";
/** Placeholder blockhash (valid base58, 32 bytes). The real client fetches one. */
export const MOCK_BLOCKHASH = PublicKey.default.toBase58();

type MockAction =
  | { ix: "createOrder"; seller: PublicKey; orderId: bigint; amount: bigint; listingHash: Uint8Array }
  | { ix: "pay"; order: PublicKey; buyer: PublicKey }
  | { ix: "markShipped"; order: PublicKey; seller: PublicKey; trackingHash: Uint8Array | null }
  | { ix: "confirmReceipt"; order: PublicKey; buyer: PublicKey }
  | { ix: "release"; order: PublicKey }
  | { ix: "refundUnshipped"; order: PublicKey }
  | { ix: "openDispute"; order: PublicKey; buyer: PublicKey }
  | { ix: "resolveDispute"; order: PublicKey; arbiter: PublicKey; buyerShareBps: number }
  | { ix: "closeOrder"; order: PublicKey; authority: PublicKey }
  | { ix: "withdrawUsdc"; owner: PublicKey; destination: PublicKey; amount: bigint };

type Encoded =
  | string
  | number
  | boolean
  | null
  | { $pk: string }
  | { $n: string }
  | { $b: string }
  | { [key: string]: Encoded };

function encodeValue(value: unknown): Encoded {
  if (value instanceof PublicKey) return { $pk: value.toBase58() };
  if (typeof value === "bigint") return { $n: value.toString() };
  if (value instanceof Uint8Array) return { $b: Buffer.from(value).toString("hex") };
  if (value === null || typeof value !== "object") return value as Encoded;
  const out: { [key: string]: Encoded } = {};
  for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v);
  return out;
}

function decodeValue(value: Encoded): unknown {
  if (value === null || typeof value !== "object") return value;
  if ("$pk" in value && typeof value.$pk === "string") return new PublicKey(value.$pk);
  if ("$n" in value && typeof value.$n === "string") return BigInt(value.$n);
  if ("$b" in value && typeof value.$b === "string") {
    return new Uint8Array(Buffer.from(value.$b, "hex"));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v);
  return out;
}

function encodeAction(action: MockAction): Buffer {
  return Buffer.from(MOCK_DATA_PREFIX + JSON.stringify(encodeValue(action)), "utf8");
}

function decodeAction(data: Buffer): MockAction | null {
  const text = data.toString("utf8");
  if (!text.startsWith(MOCK_DATA_PREFIX)) return null;
  return decodeValue(JSON.parse(text.slice(MOCK_DATA_PREFIX.length)) as Encoded) as MockAction;
}

function assertHash(hash: Uint8Array, field: string): void {
  if (hash.length !== 32) throw new RangeError(`${field} must be 32 bytes`);
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface MockVaultixClientOptions {
  programId?: PublicKey;
  feePayer?: PublicKey;
  /** `null` simulates a cluster where `initialize_config` has not run. */
  config?: Partial<ConfigAccount> | null;
  /** Initial clock, unix seconds. */
  now?: bigint;
}

export interface ApplyOptions {
  /** Extra signers to assume (e.g. a wallet adapter that signed out of band). */
  signers?: PublicKey[];
}

export interface MockTxResult {
  signature: string;
  events: VaultixEvent[];
}

function envFeePayer(): PublicKey | null {
  const value = process.env.NEXT_PUBLIC_FEE_PAYER_PUBKEY;
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

export class MockVaultixClient implements VaultixClient {
  readonly programId: PublicKey;
  readonly feePayer: PublicKey;

  private now: bigint;
  private config: ConfigAccount | null;
  private orders = new Map<string, OrderAccount>();
  /** Token account address (base58) → balance in minimum units. */
  private balances = new Map<string, bigint>();
  private log: VaultixEvent[] = [];
  private txCount = 0;

  constructor(options: MockVaultixClientOptions = {}) {
    this.programId = options.programId ?? PROGRAM_ID;
    this.feePayer = options.feePayer ?? envFeePayer() ?? Keypair.generate().publicKey;
    this.now = options.now ?? BigInt(Math.floor(Date.now() / 1000));
    if (options.config === null) {
      this.config = null;
    } else {
      const allowedMint = options.config?.allowedMint ?? Keypair.generate().publicKey;
      const treasuryOwner = Keypair.generate().publicKey;
      this.config = {
        admin: Keypair.generate().publicKey,
        arbiter: Keypair.generate().publicKey,
        treasury: associatedTokenAddress(treasuryOwner, allowedMint),
        allowedMint,
        ...DEFAULT_PROTOCOL,
        bump: 255,
        ...options.config,
      };
    }
  }

  // ----- test / dev controls -----

  get clock(): bigint {
    return this.now;
  }

  setClock(unixSeconds: bigint): void {
    this.now = unixSeconds;
  }

  advanceClock(seconds: bigint): void {
    this.now += seconds;
  }

  /** Simulates `update_config` (admin-only on-chain; existing orders keep their snapshot). */
  setConfig(patch: Partial<ConfigAccount>): void {
    this.config = { ...this.requireConfig(), ...patch };
  }

  /** Credits USDC to the owner's ATA (like the Circle faucet). */
  mintUsdc(owner: PublicKey, amount: bigint): void {
    this.credit(this.ataOf(owner), amount);
  }

  /** Credits a token account directly (e.g. a stray transfer into a vault). */
  mintToTokenAccount(tokenAccount: PublicKey, amount: bigint): void {
    this.credit(tokenAccount, amount);
  }

  tokenBalance(tokenAccount: PublicKey): bigint {
    return this.balances.get(tokenAccount.toBase58()) ?? 0n;
  }

  get events(): readonly VaultixEvent[] {
    return this.log;
  }

  // ----- reads -----

  async getConfig(): Promise<ConfigAccount | null> {
    return this.config ? { ...this.config } : null;
  }

  async getOrder(address: PublicKey): Promise<OrderAccount | null> {
    const order = this.orders.get(address.toBase58());
    return order ? { ...order } : null;
  }

  async getOrders(filter: OrderFilter = {}): Promise<OrderRecord[]> {
    const out: OrderRecord[] = [];
    for (const [address, account] of this.orders) {
      if (filter.seller && !account.seller.equals(filter.seller)) continue;
      if (filter.buyer && !(account.buyer?.equals(filter.buyer) ?? false)) continue;
      if (filter.status && account.status !== filter.status) continue;
      out.push({ address: new PublicKey(address), account: { ...account } });
    }
    return out.sort((a, b) =>
      a.account.createdAt === b.account.createdAt
        ? 0
        : a.account.createdAt > b.account.createdAt
          ? -1
          : 1,
    );
  }

  async getUsdcBalance(owner: PublicKey): Promise<bigint> {
    return this.config ? this.tokenBalance(this.ataOf(owner)) : 0n;
  }

  // ----- builders -----

  private build(
    action: MockAction,
    keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
    feePayer: PublicKey = this.feePayer,
  ): Promise<Transaction> {
    const tx = new Transaction({ feePayer, recentBlockhash: MOCK_BLOCKHASH });
    tx.add(
      new TransactionInstruction({
        programId: this.programId,
        keys: [{ pubkey: configPda(this.programId), isSigner: false, isWritable: false }, ...keys],
        data: encodeAction(action),
      }),
    );
    return Promise.resolve(tx);
  }

  async buildCreateOrderTx(params: BuildCreateOrderParams): Promise<Transaction> {
    assertHash(params.listingHash, "listingHash");
    const order = orderPda(params.seller, params.orderId, this.programId);
    return this.build({ ix: "createOrder", ...params }, [
      { pubkey: order, isSigner: false, isWritable: true },
      { pubkey: params.seller, isSigner: true, isWritable: false },
    ]);
  }

  async buildPayTx(params: BuildPayParams): Promise<Transaction> {
    return this.build({ ix: "pay", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
      { pubkey: params.buyer, isSigner: true, isWritable: false },
    ]);
  }

  async buildMarkShippedTx(params: BuildMarkShippedParams): Promise<Transaction> {
    if (params.trackingHash) assertHash(params.trackingHash, "trackingHash");
    return this.build({ ix: "markShipped", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
      { pubkey: params.seller, isSigner: true, isWritable: false },
    ]);
  }

  async buildConfirmReceiptTx(params: BuildConfirmReceiptParams): Promise<Transaction> {
    return this.build({ ix: "confirmReceipt", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
      { pubkey: params.buyer, isSigner: true, isWritable: false },
    ]);
  }

  async buildReleaseTx(params: BuildPermissionlessParams): Promise<Transaction> {
    return this.build({ ix: "release", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
    ]);
  }

  async buildRefundUnshippedTx(params: BuildPermissionlessParams): Promise<Transaction> {
    return this.build({ ix: "refundUnshipped", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
    ]);
  }

  async buildOpenDisputeTx(params: BuildOpenDisputeParams): Promise<Transaction> {
    return this.build({ ix: "openDispute", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
      { pubkey: params.buyer, isSigner: true, isWritable: false },
    ]);
  }

  async buildResolveDisputeTx(params: BuildResolveDisputeParams): Promise<Transaction> {
    // The arbiter signs and pays with their own account: no sponsor.
    return this.build(
      { ix: "resolveDispute", ...params },
      [
        { pubkey: params.order, isSigner: false, isWritable: true },
        { pubkey: params.arbiter, isSigner: true, isWritable: true },
      ],
      params.arbiter,
    );
  }

  async buildCloseOrderTx(params: BuildCloseOrderParams): Promise<Transaction> {
    return this.build({ ix: "closeOrder", ...params }, [
      { pubkey: params.order, isSigner: false, isWritable: true },
      { pubkey: params.authority, isSigner: true, isWritable: false },
    ]);
  }

  async buildWithdrawUsdcTx(params: BuildWithdrawUsdcParams): Promise<Transaction> {
    return this.build({ ix: "withdrawUsdc", ...params }, [
      { pubkey: this.ataOf(params.owner), isSigner: false, isWritable: true },
      { pubkey: this.ataOf(params.destination), isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: true, isWritable: false },
    ]);
  }

  // ----- execution -----

  /**
   * Executes a transaction built by this client. Signers are the keys with a
   * valid signature on `tx`, plus the sponsor fee payer (the sponsor co-signs)
   * and `options.signers`. All-or-nothing: on error, state is rolled back.
   */
  applyTransaction(tx: Transaction, options: ApplyOptions = {}): MockTxResult {
    const signers = new Set<string>([this.feePayer.toBase58()]);
    for (const s of options.signers ?? []) signers.add(s.toBase58());
    if (tx.signatures.some((s) => s.signature !== null)) {
      if (!tx.verifySignatures(false)) {
        throw new VaultixError("MissingRequiredSignature", "Invalid signature");
      }
      for (const s of tx.signatures) {
        if (s.signature !== null) signers.add(s.publicKey.toBase58());
      }
    }

    const ordersBefore = new Map(this.orders);
    const balancesBefore = new Map(this.balances);
    const logLength = this.log.length;
    try {
      for (const ix of tx.instructions) {
        if (!ix.programId.equals(this.programId)) continue;
        const action = decodeAction(ix.data);
        if (!action) throw new Error("Unknown instruction data");
        this.execute(action, signers);
      }
    } catch (error) {
      this.orders = ordersBefore;
      this.balances = balancesBefore;
      this.log.length = logLength;
      throw error;
    }

    this.txCount += 1;
    return {
      signature: `mock-signature-${this.txCount}`,
      events: this.log.slice(logLength),
    };
  }

  private execute(action: MockAction, signers: Set<string>): void {
    const requireSigner = (key: PublicKey) => {
      if (!signers.has(key.toBase58())) {
        throw new VaultixError("MissingRequiredSignature", `${key.toBase58()} did not sign`);
      }
    };
    const timestamp = this.now;

    if (action.ix === "createOrder") {
      requireSigner(action.seller);
      const config = this.requireConfig();
      const address = orderPda(action.seller, action.orderId, this.programId);
      if (this.orders.has(address.toBase58())) throw new VaultixError("AccountAlreadyInUse");
      if (action.amount <= 0n) throw new VaultixError("InvalidAmount");
      if (action.amount > config.maxOrderAmount) throw new VaultixError("AmountExceedsMax");
      this.orders.set(address.toBase58(), {
        status: "Created",
        seller: action.seller,
        buyer: null,
        orderId: action.orderId,
        mint: config.allowedMint,
        amount: action.amount,
        feeBps: config.feeBps,
        disputeDepositBps: config.disputeDepositBps,
        shipDeadlineSecs: config.shipDeadlineSecs,
        claimWindowSecs: config.claimWindowSecs,
        listingHash: action.listingHash,
        trackingHash: null,
        disputeDeposit: 0n,
        createdAt: timestamp,
        paidAt: 0n,
        shippedAt: 0n,
        rentPayer: this.feePayer,
        bump: 255,
      });
      this.balances.set(vaultAddress(address, config.allowedMint).toBase58(), 0n);
      this.log.push({
        name: "OrderCreated",
        order: address,
        timestamp,
        seller: action.seller,
        orderId: action.orderId,
        amount: action.amount,
        listingHash: action.listingHash,
      });
      return;
    }

    if (action.ix === "withdrawUsdc") {
      // An SPL transfer between USDC accounts; no order involved.
      requireSigner(action.owner);
      if (action.amount <= 0n) throw new VaultixError("InvalidAmount");
      this.transfer(this.ataOf(action.owner), this.ataOf(action.destination), action.amount);
      return;
    }

    const address = action.order;
    const order = this.requireOrder(address);
    const vault = vaultAddress(address, order.mint);
    const update = (patch: Partial<OrderAccount>) =>
      this.orders.set(address.toBase58(), { ...order, ...patch });
    const expectStatus = (...allowed: OrderAccount["status"][]) => {
      if (!allowed.includes(order.status)) throw new VaultixError("InvalidStatus");
    };

    switch (action.ix) {
      case "pay": {
        expectStatus("Created");
        requireSigner(action.buyer);
        if (action.buyer.equals(order.seller)) throw new VaultixError("SellerCannotBuy");
        update({ status: "Paid", buyer: action.buyer, paidAt: timestamp });
        this.transfer(this.ataOf(action.buyer, order.mint), vault, order.amount);
        this.log.push({ name: "OrderPaid", order: address, timestamp, buyer: action.buyer, amount: order.amount });
        return;
      }
      case "markShipped": {
        expectStatus("Paid");
        if (!action.seller.equals(order.seller)) throw new VaultixError("NotSeller");
        requireSigner(action.seller);
        update({ status: "Shipped", trackingHash: action.trackingHash, shippedAt: timestamp });
        this.log.push({ name: "OrderShipped", order: address, timestamp, trackingHash: action.trackingHash });
        return;
      }
      case "confirmReceipt": {
        expectStatus("Shipped");
        this.requireBuyer(order, action.buyer);
        requireSigner(action.buyer);
        this.settleRelease(address, order, vault, false);
        return;
      }
      case "release": {
        expectStatus("Shipped");
        if (!(timestamp > this.add(order.shippedAt, order.claimWindowSecs))) {
          throw new VaultixError("DeadlineNotReached");
        }
        this.settleRelease(address, order, vault, true);
        return;
      }
      case "refundUnshipped": {
        expectStatus("Paid");
        if (!(timestamp > this.add(order.paidAt, order.shipDeadlineSecs))) {
          throw new VaultixError("DeadlineNotReached");
        }
        const buyer = this.mustHaveBuyer(order);
        update({ status: "Refunded" });
        this.transfer(vault, this.ataOf(buyer, order.mint), order.amount);
        this.log.push({ name: "OrderRefunded", order: address, timestamp, buyerAmount: order.amount });
        return;
      }
      case "openDispute": {
        expectStatus("Shipped");
        this.requireBuyer(order, action.buyer);
        requireSigner(action.buyer);
        if (timestamp > this.add(order.shippedAt, order.claimWindowSecs)) {
          throw new VaultixError("ClaimWindowClosed");
        }
        const deposit = disputeDepositFor(order.amount, order.disputeDepositBps);
        update({ status: "Disputed", disputeDeposit: deposit });
        this.transfer(this.ataOf(action.buyer, order.mint), vault, deposit);
        this.log.push({ name: "DisputeOpened", order: address, timestamp, deposit });
        return;
      }
      case "resolveDispute": {
        expectStatus("Disputed");
        const config = this.requireConfig();
        if (!action.arbiter.equals(config.arbiter)) throw new VaultixError("NotArbiter");
        requireSigner(action.arbiter);
        const split = computeDisputeSplit(
          order.amount,
          order.feeBps,
          action.buyerShareBps,
          order.disputeDeposit,
        );
        const buyer = this.mustHaveBuyer(order);
        update({ status: "Resolved" });
        this.transfer(vault, this.ataOf(buyer, order.mint), split.buyerTotal);
        this.transfer(vault, this.ataOf(order.seller, order.mint), split.sellerTotal);
        this.transfer(vault, config.treasury, split.fee);
        this.log.push({
          name: "DisputeResolved",
          order: address,
          timestamp,
          buyerShareBps: action.buyerShareBps,
          buyerAmount: split.buyerTotal,
          sellerAmount: split.sellerTotal,
          fee: split.fee,
          depositToBuyer: split.depositToBuyer,
        });
        return;
      }
      case "closeOrder": {
        if (order.status === "Created") {
          if (!action.authority.equals(order.seller)) throw new VaultixError("NotSeller");
        } else if (!FINAL_STATUSES.includes(order.status)) {
          throw new VaultixError("InvalidStatus");
        }
        requireSigner(action.authority);
        if (this.tokenBalance(vault) !== 0n) throw new VaultixError("VaultNotEmpty");
        this.orders.delete(address.toBase58());
        this.balances.delete(vault.toBase58());
        this.log.push({ name: "OrderClosed", order: address, timestamp, rentPayer: order.rentPayer });
        return;
      }
    }
  }

  private settleRelease(
    address: PublicKey,
    order: OrderAccount,
    vault: PublicKey,
    byTimeout: boolean,
  ): void {
    const config = this.requireConfig();
    const { fee, sellerNet } = computeReleaseSplit(order.amount, order.feeBps);
    this.orders.set(address.toBase58(), { ...order, status: "Released" });
    this.transfer(vault, this.ataOf(order.seller, order.mint), sellerNet);
    this.transfer(vault, config.treasury, fee);
    this.log.push({
      name: "OrderReleased",
      order: address,
      timestamp: this.now,
      sellerAmount: sellerNet,
      fee,
      byTimeout,
    });
  }

  // ----- helpers -----

  private requireConfig(): ConfigAccount {
    if (!this.config) throw new VaultixError("AccountNotInitialized", "Config not initialized");
    return this.config;
  }

  private requireOrder(address: PublicKey): OrderAccount {
    const order = this.orders.get(address.toBase58());
    if (!order) throw new VaultixError("AccountNotInitialized", "Order not found");
    return order;
  }

  private requireBuyer(order: OrderAccount, signer: PublicKey): void {
    if (!order.buyer || !order.buyer.equals(signer)) throw new VaultixError("NotBuyer");
  }

  private mustHaveBuyer(order: OrderAccount): PublicKey {
    if (!order.buyer) throw new VaultixError("NotBuyer");
    return order.buyer;
  }

  private add(a: bigint, b: bigint): bigint {
    const sum = a + b;
    // i64 bound.
    if (sum > (1n << 63n) - 1n) throw new VaultixError("MathOverflow");
    return sum;
  }

  private ataOf(owner: PublicKey, mint?: PublicKey): PublicKey {
    return associatedTokenAddress(owner, mint ?? this.requireConfig().allowedMint);
  }

  private credit(account: PublicKey, amount: bigint): void {
    const key = account.toBase58();
    this.balances.set(key, checkedU64((this.balances.get(key) ?? 0n) + amount));
  }

  /** SPL transfer; zero-amount transfers are skipped (02 §1.5). */
  private transfer(from: PublicKey, to: PublicKey, amount: bigint): void {
    if (amount === 0n) return;
    const key = from.toBase58();
    const balance = this.balances.get(key) ?? 0n;
    if (balance < amount) throw new VaultixError("InsufficientFunds");
    this.balances.set(key, balance - amount);
    this.credit(to, amount);
  }
}

export function createMockVaultixClient(
  options?: MockVaultixClientOptions,
): MockVaultixClient {
  return new MockVaultixClient(options);
}

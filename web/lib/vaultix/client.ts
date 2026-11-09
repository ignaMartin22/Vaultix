/**
 * The real `VaultixClient` (Anchor IDL + @solana/web3.js) and the factory that
 * picks it or the mock by `NEXT_PUBLIC_USE_MOCK` (specs/04-tareas.md W-03).
 *
 * Builders return unsigned legacy transactions with `feePayer` (the sponsor,
 * or the arbiter for `resolve_dispute`) and a recent blockhash. Every account
 * is passed explicitly (`accountsStrict`): nothing is resolved behind our back.
 */
import { BN, Program, utils, type Provider } from "@anchor-lang/core";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  type GetProgramAccountsFilter,
  type TransactionInstruction,
} from "@solana/web3.js";

import {
  ORDER_STATUSES,
  USDC_DECIMALS,
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
} from "./contract";
import { UserFacingError } from "../tx/errors";
import { decodeConfigAccount, decodeOrderAccount, ORDER_DISCRIMINATOR, ORDER_OFFSETS } from "./decode";
import idl from "./idl.json";
import { createMockVaultixClient, type MockVaultixClient } from "./mock";
import { USE_MOCK } from "./mode";
import { ASSOCIATED_TOKEN_PROGRAM_ID, associatedTokenAddress, configPda, orderPda, PROGRAM_ID, TOKEN_PROGRAM_ID } from "./pdas";
import type { VaultixEscrow } from "./vaultix_escrow";

/** memcmp filters take base58. */
function bs58Bytes(bytes: Uint8Array): string {
  return utils.bytes.bs58.encode(bytes);
}

export interface AnchorClientOptions {
  connection: Connection;
  feePayer: PublicKey;
  programId?: PublicKey;
}

export class AnchorVaultixClient implements VaultixClient {
  readonly programId: PublicKey;
  readonly feePayer: PublicKey;
  private readonly connection: Connection;
  private readonly program: Program<VaultixEscrow>;
  private configCache: ConfigAccount | null = null;
  private tokenProgramCache: PublicKey | null = null;

  constructor({ connection, feePayer, programId = PROGRAM_ID }: AnchorClientOptions) {
    this.connection = connection;
    this.feePayer = feePayer;
    this.programId = programId;
    // Only instruction encoding is used: no wallet, nothing is signed here.
    const provider = { connection } as Provider;
    this.program = new Program<VaultixEscrow>({ ...(idl as VaultixEscrow), address: programId.toBase58() }, provider);
  }

  // ----- reads -----

  async getConfig(): Promise<ConfigAccount | null> {
    const info = await this.connection.getAccountInfo(configPda(this.programId), "confirmed");
    if (!info || !info.owner.equals(this.programId)) return null;
    this.configCache = decodeConfigAccount(info.data);
    return this.configCache;
  }

  async getOrder(address: PublicKey): Promise<OrderAccount | null> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    if (!info || !info.owner.equals(this.programId)) return null;
    return decodeOrderAccount(info.data);
  }

  async getOrders(filter: OrderFilter = {}): Promise<OrderRecord[]> {
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: bs58Bytes(ORDER_DISCRIMINATOR) } },
    ];
    if (filter.status) {
      const index = ORDER_STATUSES.indexOf(filter.status);
      filters.push({ memcmp: { offset: ORDER_OFFSETS.status, bytes: bs58Bytes(Uint8Array.of(index)) } });
    }
    if (filter.seller) {
      filters.push({ memcmp: { offset: ORDER_OFFSETS.seller, bytes: filter.seller.toBase58() } });
    }
    if (filter.buyer) {
      const tagged = Uint8Array.of(1, ...filter.buyer.toBytes());
      filters.push({ memcmp: { offset: ORDER_OFFSETS.buyerTag, bytes: bs58Bytes(tagged) } });
    }
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      commitment: "confirmed",
      filters,
    });
    return accounts.map(({ pubkey, account }) => ({ address: pubkey, account: decodeOrderAccount(account.data) }));
  }

  /** Many orders in one round trip per 100 (`getMultipleAccountsInfo`); null if closed. */
  async getOrdersByAddress(addresses: PublicKey[]): Promise<(OrderAccount | null)[]> {
    const out: (OrderAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const infos = await this.connection.getMultipleAccountsInfo(addresses.slice(i, i + 100), "confirmed");
      for (const info of infos) {
        out.push(info && info.owner.equals(this.programId) ? decodeOrderAccount(info.data) : null);
      }
    }
    return out;
  }

  async getUsdcBalance(owner: PublicKey): Promise<bigint> {
    const config = await this.config();
    const ata = associatedTokenAddress(owner, config.allowedMint, await this.tokenProgram());
    try {
      const { value } = await this.connection.getTokenAccountBalance(ata, "confirmed");
      return BigInt(value.amount);
    } catch {
      return 0n; // The account doesn't exist yet.
    }
  }

  // ----- builders -----

  async buildCreateOrderTx(p: BuildCreateOrderParams): Promise<Transaction> {
    const { mint, tokenProgram } = await this.mintInfo();
    const order = orderPda(p.seller, p.orderId, this.programId);
    // The seller's USDC account must exist to get paid later (01 §5.2).
    const sellerAta = createAssociatedTokenAccountIdempotentInstruction(
      this.feePayer,
      associatedTokenAddress(p.seller, mint, tokenProgram),
      p.seller,
      mint,
      tokenProgram,
    );
    const ix = await this.program.methods
      .createOrder(new BN(p.orderId.toString()), new BN(p.amount.toString()), [...p.listingHash])
      .accountsStrict({
        seller: p.seller,
        payer: this.feePayer,
        config: configPda(this.programId),
        mint,
        order,
        vault: associatedTokenAddress(order, mint, tokenProgram),
        tokenProgram,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return this.tx([sellerAta, ix]);
  }

  async buildPayTx(p: BuildPayParams): Promise<Transaction> {
    const { mint, tokenProgram } = await this.mintInfo();
    const ix = await this.program.methods
      .pay()
      .accountsStrict({
        buyer: p.buyer,
        order: p.order,
        mint,
        buyerToken: associatedTokenAddress(p.buyer, mint, tokenProgram),
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildMarkShippedTx(p: BuildMarkShippedParams): Promise<Transaction> {
    const ix = await this.program.methods
      .markShipped(p.trackingHash ? [...p.trackingHash] : null)
      .accountsStrict({ seller: p.seller, order: p.order })
      .instruction();
    return this.tx([ix]);
  }

  async buildConfirmReceiptTx(p: BuildConfirmReceiptParams): Promise<Transaction> {
    const { order, mint, tokenProgram, config } = await this.orderContext(p.order);
    const ix = await this.program.methods
      .confirmReceipt()
      .accountsStrict({
        buyer: p.buyer,
        order: p.order,
        config: configPda(this.programId),
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        sellerToken: associatedTokenAddress(order.seller, mint, tokenProgram),
        treasury: config.treasury,
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildReleaseTx(p: BuildPermissionlessParams): Promise<Transaction> {
    const { order, mint, tokenProgram, config } = await this.orderContext(p.order);
    const ix = await this.program.methods
      .release()
      .accountsStrict({
        order: p.order,
        config: configPda(this.programId),
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        sellerToken: associatedTokenAddress(order.seller, mint, tokenProgram),
        treasury: config.treasury,
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildRefundUnshippedTx(p: BuildPermissionlessParams): Promise<Transaction> {
    const { order, mint, tokenProgram } = await this.orderContext(p.order);
    const ix = await this.program.methods
      .refundUnshipped()
      .accountsStrict({
        order: p.order,
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        buyerToken: associatedTokenAddress(this.buyerOf(order), mint, tokenProgram),
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildOpenDisputeTx(p: BuildOpenDisputeParams): Promise<Transaction> {
    const { mint, tokenProgram } = await this.mintInfo();
    const ix = await this.program.methods
      .openDispute()
      .accountsStrict({
        buyer: p.buyer,
        order: p.order,
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        buyerToken: associatedTokenAddress(p.buyer, mint, tokenProgram),
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildResolveDisputeTx(p: BuildResolveDisputeParams): Promise<Transaction> {
    const { order, mint, tokenProgram, config } = await this.orderContext(p.order);
    const ix = await this.program.methods
      .resolveDispute(p.buyerShareBps)
      .accountsStrict({
        arbiter: p.arbiter,
        config: configPda(this.programId),
        order: p.order,
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        buyerToken: associatedTokenAddress(this.buyerOf(order), mint, tokenProgram),
        sellerToken: associatedTokenAddress(order.seller, mint, tokenProgram),
        treasury: config.treasury,
        tokenProgram,
      })
      .instruction();
    // The arbiter pays for this one: it never goes through the sponsor (03 §4).
    return this.tx([ix], p.arbiter);
  }

  async buildCloseOrderTx(p: BuildCloseOrderParams): Promise<Transaction> {
    const { order, mint, tokenProgram } = await this.orderContext(p.order);
    const ix = await this.program.methods
      .closeOrder()
      .accountsStrict({
        caller: p.authority,
        order: p.order,
        mint,
        vault: associatedTokenAddress(p.order, mint, tokenProgram),
        rentPayer: order.rentPayer,
        tokenProgram,
      })
      .instruction();
    return this.tx([ix]);
  }

  async buildWithdrawUsdcTx(p: BuildWithdrawUsdcParams): Promise<Transaction> {
    const { mint, tokenProgram } = await this.mintInfo();
    // A token account pasted as the destination would get an account of its
    // own that nobody can spend from. Wallets are system accounts (or empty).
    const info = await this.connection.getAccountInfo(p.destination, "confirmed");
    if (info && (info.owner.equals(tokenProgram) || info.owner.equals(TOKEN_PROGRAM_ID))) {
      throw new UserFacingError(
        "Esa dirección es una cuenta de USDC, no la de una billetera. Pegá la dirección de la cuenta que te da la app (Lemon, Ripio, Phantom).",
      );
    }
    const source = associatedTokenAddress(p.owner, mint, tokenProgram);
    const destination = associatedTokenAddress(p.destination, mint, tokenProgram);
    return this.tx([
      // Vaultix pays the destination's account rent if it doesn't exist yet.
      createAssociatedTokenAccountIdempotentInstruction(this.feePayer, destination, p.destination, mint, tokenProgram),
      createTransferCheckedInstruction(source, mint, destination, p.owner, p.amount, USDC_DECIMALS, [], tokenProgram),
    ]);
  }

  // ----- helpers -----

  private async tx(instructions: TransactionInstruction[], feePayer = this.feePayer): Promise<Transaction> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    return new Transaction({ feePayer, blockhash, lastValidBlockHeight }).add(...instructions);
  }

  private async config(): Promise<ConfigAccount> {
    const config = this.configCache ?? (await this.getConfig());
    if (!config) throw new Error("Vaultix config is not initialized on this cluster");
    return config;
  }

  private async tokenProgram(): Promise<PublicKey> {
    if (!this.tokenProgramCache) {
      const { allowedMint } = await this.config();
      const info = await this.connection.getAccountInfo(allowedMint, "confirmed");
      if (!info) throw new Error(`Mint ${allowedMint.toBase58()} not found`);
      this.tokenProgramCache = info.owner;
    }
    return this.tokenProgramCache;
  }

  private async mintInfo() {
    const config = await this.config();
    return { config, mint: config.allowedMint, tokenProgram: await this.tokenProgram() };
  }

  private async orderContext(address: PublicKey) {
    const [order, info] = await Promise.all([this.getOrder(address), this.mintInfo()]);
    if (!order) throw new Error(`Order ${address.toBase58()} not found`);
    // Orders keep their own mint; it's the allowed one unless config changed.
    return { ...info, order, mint: order.mint };
  }

  private buyerOf(order: OrderAccount): PublicKey {
    if (!order.buyer) throw new Error("Order has no buyer yet");
    return order.buyer;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export { USE_MOCK };


export function solanaRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("devnet");
}

let client: VaultixClient | undefined;

/** One client per page load: the mock keeps its in-memory state across hooks. */
export function getVaultixClient(): VaultixClient {
  if (!client) {
    if (USE_MOCK) {
      client = createMockVaultixClient();
    } else {
      const feePayer = process.env.NEXT_PUBLIC_FEE_PAYER_PUBKEY;
      if (!feePayer) throw new Error("NEXT_PUBLIC_FEE_PAYER_PUBKEY is required when NEXT_PUBLIC_USE_MOCK=false");
      client = new AnchorVaultixClient({
        connection: new Connection(solanaRpcUrl(), "confirmed"),
        feePayer: new PublicKey(feePayer),
      });
    }
  }
  return client;
}

export function isMockClient(c: VaultixClient): c is MockVaultixClient {
  return "applyTransaction" in c;
}


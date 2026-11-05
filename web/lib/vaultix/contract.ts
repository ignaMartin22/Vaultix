/**
 * Hand-written TypeScript mirror of the `vaultix_escrow` program contract
 * (specs/02-backend.md §1). Frozen in task C-02: web and backend code against
 * these types until X-01 swaps the mock for the real Anchor client.
 *
 * Conventions:
 * - Every `u64` / `i64` (amounts, ids, timestamps, durations) is a `bigint`.
 *   Timestamps are unix seconds, as returned by `Clock::unix_timestamp`.
 * - Every `u16` (basis points) is a `number`.
 * - Pubkeys are `PublicKey`; `[u8; 32]` hashes are `Uint8Array` of length 32.
 * - Instruction builders return an unsigned legacy `Transaction` with
 *   `feePayer` and `recentBlockhash` already set (specs/01-arquitectura.md §5.1).
 */
import type { PublicKey, Transaction } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Constants (constants.rs)
// ---------------------------------------------------------------------------

export const MAX_FEE_BPS = 500;
export const MAX_DISPUTE_DEPOSIT_BPS = 2_000;
export const BPS_DENOMINATOR = 10_000n;
export const CONFIG_SEED = "config";
export const ORDER_SEED = "order";
export const U64_MAX = (1n << 64n) - 1n;
export const USDC_DECIMALS = 6;

/** Protocol defaults (specs/01-arquitectura.md §8). Used by the mock and the seed. */
export const DEFAULT_PROTOCOL = {
  feeBps: 150,
  disputeDepositBps: 500,
  shipDeadlineSecs: 432_000n,
  claimWindowSecs: 864_000n,
  maxOrderAmount: 500_000_000n,
} as const;

// ---------------------------------------------------------------------------
// Accounts (state.rs)
// ---------------------------------------------------------------------------

/** Same order as the Rust enum: the discriminant is the index (u8). */
export const ORDER_STATUSES = [
  "Created",
  "Paid",
  "Shipped",
  "Disputed",
  "Released",
  "Refunded",
  "Resolved",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** States in which `close_order` is allowed for anyone. */
export const FINAL_STATUSES: readonly OrderStatus[] = [
  "Released",
  "Refunded",
  "Resolved",
];

export interface ConfigAccount {
  admin: PublicKey;
  arbiter: PublicKey;
  /** Token account (ATA of `allowedMint`) that collects fees. */
  treasury: PublicKey;
  allowedMint: PublicKey;
  feeBps: number;
  disputeDepositBps: number;
  shipDeadlineSecs: bigint;
  claimWindowSecs: bigint;
  maxOrderAmount: bigint;
  bump: number;
}

export interface OrderAccount {
  status: OrderStatus;
  seller: PublicKey;
  /** `null` until `pay`; the first payer is fixed. */
  buyer: PublicKey | null;
  orderId: bigint;
  mint: PublicKey;
  /** Minimum units (USDC: 6 decimals). */
  amount: bigint;
  feeBps: number;
  disputeDepositBps: number;
  shipDeadlineSecs: bigint;
  claimWindowSecs: bigint;
  listingHash: Uint8Array;
  trackingHash: Uint8Array | null;
  /** 0 unless the order went through `open_dispute`. */
  disputeDeposit: bigint;
  /** Unix seconds; 0n if it has not happened yet. */
  createdAt: bigint;
  paidAt: bigint;
  shippedAt: bigint;
  rentPayer: PublicKey;
  bump: number;
}

/** An `Order` account together with its PDA address. */
export interface OrderRecord {
  address: PublicKey;
  account: OrderAccount;
}

// ---------------------------------------------------------------------------
// Instruction args (as they go on the wire)
// ---------------------------------------------------------------------------

/** Args of `initialize_config` and `update_config` (admin/scripts only). */
export interface ConfigArgs {
  arbiter: PublicKey;
  treasury: PublicKey;
  allowedMint: PublicKey;
  feeBps: number;
  disputeDepositBps: number;
  shipDeadlineSecs: bigint;
  claimWindowSecs: bigint;
  maxOrderAmount: bigint;
}

export interface CreateOrderArgs {
  orderId: bigint;
  amount: bigint;
  listingHash: Uint8Array;
}

export interface MarkShippedArgs {
  trackingHash: Uint8Array | null;
}

export interface ResolveDisputeArgs {
  /** 0..=10_000. */
  buyerShareBps: number;
}

// ---------------------------------------------------------------------------
// Builder params (args + the accounts the caller has to name)
// ---------------------------------------------------------------------------

export interface BuildCreateOrderParams extends CreateOrderArgs {
  seller: PublicKey;
}

export interface BuildPayParams {
  order: PublicKey;
  buyer: PublicKey;
}

export interface BuildMarkShippedParams extends MarkShippedArgs {
  order: PublicKey;
  seller: PublicKey;
}

export interface BuildConfirmReceiptParams {
  order: PublicKey;
  buyer: PublicKey;
}

/** `release` and `refund_unshipped` are permissionless: only the fee payer signs. */
export interface BuildPermissionlessParams {
  order: PublicKey;
}

export interface BuildOpenDisputeParams {
  order: PublicKey;
  buyer: PublicKey;
}

export interface BuildResolveDisputeParams extends ResolveDisputeArgs {
  order: PublicKey;
  /** Signs and pays itself: the arbiter does not go through the sponsor (03 §4). */
  arbiter: PublicKey;
}

export interface BuildCloseOrderParams {
  order: PublicKey;
  /** Must be the seller while the order is `Created`; anyone in a final state. */
  authority: PublicKey;
}

// ---------------------------------------------------------------------------
// Events (events.rs). Every event carries `order` (or `config`) and `timestamp`.
// ---------------------------------------------------------------------------

interface OrderEventBase {
  order: PublicKey;
  timestamp: bigint;
}

export interface OrderCreatedEvent extends OrderEventBase {
  name: "OrderCreated";
  seller: PublicKey;
  orderId: bigint;
  amount: bigint;
  listingHash: Uint8Array;
}

export interface OrderPaidEvent extends OrderEventBase {
  name: "OrderPaid";
  buyer: PublicKey;
  amount: bigint;
}

export interface OrderShippedEvent extends OrderEventBase {
  name: "OrderShipped";
  trackingHash: Uint8Array | null;
}

export interface OrderReleasedEvent extends OrderEventBase {
  name: "OrderReleased";
  sellerAmount: bigint;
  fee: bigint;
  /** true for `release` (claim window expired), false for `confirm_receipt`. */
  byTimeout: boolean;
}

export interface OrderRefundedEvent extends OrderEventBase {
  name: "OrderRefunded";
  buyerAmount: bigint;
}

export interface DisputeOpenedEvent extends OrderEventBase {
  name: "DisputeOpened";
  deposit: bigint;
}

export interface DisputeResolvedEvent extends OrderEventBase {
  name: "DisputeResolved";
  buyerShareBps: number;
  /** Total transferred to the buyer, deposit included when it goes to them. */
  buyerAmount: bigint;
  /** Total transferred to the seller (net of fee), deposit included when it goes to them. */
  sellerAmount: bigint;
  fee: bigint;
  depositToBuyer: boolean;
}

export interface OrderClosedEvent extends OrderEventBase {
  name: "OrderClosed";
  rentPayer: PublicKey;
}

export interface ConfigUpdatedEvent {
  name: "ConfigUpdated";
  config: PublicKey;
  timestamp: bigint;
}

export type OrderEvent =
  | OrderCreatedEvent
  | OrderPaidEvent
  | OrderShippedEvent
  | OrderReleasedEvent
  | OrderRefundedEvent
  | DisputeOpenedEvent
  | DisputeResolvedEvent
  | OrderClosedEvent;

export type VaultixEvent = OrderEvent | ConfigUpdatedEvent;

// ---------------------------------------------------------------------------
// Errors (errors.rs). Anchor numbers custom errors from 6000 in declaration order.
// ---------------------------------------------------------------------------

export const VAULTIX_ERROR_NAMES = [
  "InvalidStatus",
  "NotSeller",
  "NotBuyer",
  "NotArbiter",
  "NotAdmin",
  "SellerCannotBuy",
  "InvalidMint",
  "InvalidAmount",
  "AmountExceedsMax",
  "FeeTooHigh",
  "DepositTooHigh",
  "InvalidDeadline",
  "InvalidShareBps",
  "DeadlineNotReached",
  "ClaimWindowClosed",
  "VaultNotEmpty",
  "MathOverflow",
] as const;

export type VaultixErrorName = (typeof VAULTIX_ERROR_NAMES)[number];

export const ANCHOR_CUSTOM_ERROR_OFFSET = 6000;

export const VAULTIX_ERROR_CODES = Object.fromEntries(
  VAULTIX_ERROR_NAMES.map((name, i) => [name, ANCHOR_CUSTOM_ERROR_OFFSET + i]),
) as Record<VaultixErrorName, number>;

/**
 * Failures that do not come from `errors.rs` but that the client still has to
 * tell apart: missing accounts, a colliding `order_id` (W-04 retries), the SPL
 * Token program rejecting a transfer, or a missing signature.
 */
export type ExternalErrorName =
  | "AccountNotInitialized"
  | "AccountAlreadyInUse"
  | "InsufficientFunds"
  | "MissingRequiredSignature";

export type VaultixErrorCode = VaultixErrorName | ExternalErrorName;

export class VaultixError extends Error {
  readonly code: VaultixErrorCode;

  constructor(code: VaultixErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VaultixError";
    this.code = code;
  }
}

export function isVaultixError(
  error: unknown,
  code?: VaultixErrorCode,
): error is VaultixError {
  return (
    error instanceof VaultixError && (code === undefined || error.code === code)
  );
}

// ---------------------------------------------------------------------------
// Client interface: implemented by `mock.ts` now and by the Anchor client (W-03).
// ---------------------------------------------------------------------------

export interface OrderFilter {
  seller?: PublicKey;
  buyer?: PublicKey;
  status?: OrderStatus;
}

export interface VaultixClient {
  readonly programId: PublicKey;
  /** Sponsor fee payer (`NEXT_PUBLIC_FEE_PAYER_PUBKEY`). */
  readonly feePayer: PublicKey;

  // Reads
  getConfig(): Promise<ConfigAccount | null>;
  getOrder(address: PublicKey): Promise<OrderAccount | null>;
  getOrders(filter?: OrderFilter): Promise<OrderRecord[]>;
  /** USDC balance (minimum units) of the owner's ATA; 0n if it does not exist. */
  getUsdcBalance(owner: PublicKey): Promise<bigint>;

  // Instruction builders (unsigned; fee payer + blockhash set)
  buildCreateOrderTx(params: BuildCreateOrderParams): Promise<Transaction>;
  buildPayTx(params: BuildPayParams): Promise<Transaction>;
  buildMarkShippedTx(params: BuildMarkShippedParams): Promise<Transaction>;
  buildConfirmReceiptTx(params: BuildConfirmReceiptParams): Promise<Transaction>;
  buildReleaseTx(params: BuildPermissionlessParams): Promise<Transaction>;
  buildRefundUnshippedTx(params: BuildPermissionlessParams): Promise<Transaction>;
  buildOpenDisputeTx(params: BuildOpenDisputeParams): Promise<Transaction>;
  buildResolveDisputeTx(params: BuildResolveDisputeParams): Promise<Transaction>;
  buildCloseOrderTx(params: BuildCloseOrderParams): Promise<Transaction>;
}

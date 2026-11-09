/**
 * Anti-abuse rules for `/api/tx/sponsor` (specs/01-arquitectura.md §6). Pure:
 * takes the decoded transaction and the caller's accounts, throws `ApiError`
 * on the first violation. The fee payer co-signs only what passes here.
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";

import idl from "../vaultix/idl.json";
import { MIN_WITHDRAW_UNITS, WITHDRAW_USDC } from "../withdraw";
import { USDC_DECIMALS } from "../vaultix/contract";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  associatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../vaultix/pdas";
import { ApiError } from "./errors";

/** Instructions users may get sponsored. `resolve_dispute` and config are excluded. */
export const SPONSORED_INSTRUCTIONS = [
  "create_order",
  "pay",
  "mark_shipped",
  "confirm_receipt",
  "release",
  "refund_unshipped",
  "open_dispute",
  "close_order",
] as const;

/**
 * The only account slots where the fee payer may appear: it pays rent
 * (`create_order.payer`) or receives it back (`close_order.rent_payer`).
 */
const FEE_PAYER_SLOTS: Record<string, readonly string[]> = {
  create_order: ["payer"],
  close_order: ["rent_payer"],
};

export const MAX_INSTRUCTIONS = 6;
/** Caps what a user can make the fee payer spend on priority fees. */
export const MAX_COMPUTE_UNIT_LIMIT = 400_000;
export const MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 100_000n;

const ATA_CREATE_IDEMPOTENT = 1;
/** SPL Token `TransferChecked`: tag, amount (u64 LE), decimals (u8). */
const TOKEN_TRANSFER_CHECKED = 12;
const CU_SET_LIMIT = 2;
const CU_SET_PRICE = 3;

interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: { name: string }[];
}

const SPONSORED = new Map(
  (idl.instructions as IdlInstruction[])
    .filter((ix) => (SPONSORED_INSTRUCTIONS as readonly string[]).includes(ix.name))
    .map((ix) => [Buffer.from(ix.discriminator).toString("hex"), ix]),
);

export interface SponsorContext {
  feePayer: PublicKey;
  /** Every Solana account of the Privy user (`AuthUser.solanaPubkeys`). */
  userPubkeys: readonly string[];
  programId: PublicKey;
  usdcMint: PublicKey;
}

function reject(message: string): never {
  throw new ApiError("bad_request", `No podemos procesar esta operación: ${message}.`);
}

/** Base64 wire transaction → legacy `Transaction` (the builders only make legacy ones). */
export function decodeTransaction(base64: unknown): Transaction {
  if (typeof base64 !== "string" || base64.length === 0) reject("falta la transacción");
  try {
    const bytes = Buffer.from(base64, "base64");
    if (VersionedTransaction.deserialize(bytes).version !== "legacy") reject("formato no soportado");
    return Transaction.from(bytes);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    reject("la transacción está mal formada");
  }
}

function checkComputeBudget(ix: TransactionInstruction, seen: Set<number>) {
  const kind = ix.data[0];
  if (seen.has(kind)) reject("instrucción de cómputo repetida");
  seen.add(kind);
  if (kind === CU_SET_LIMIT && ix.data.length === 5) {
    if (ix.data.readUInt32LE(1) > MAX_COMPUTE_UNIT_LIMIT) reject("límite de cómputo demasiado alto");
    return;
  }
  if (kind === CU_SET_PRICE && ix.data.length === 9) {
    if (ix.data.readBigUInt64LE(1) > MAX_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS) reject("prioridad demasiado alta");
    return;
  }
  reject("instrucción de cómputo no permitida");
}

function checkAtaCreate(ix: TransactionInstruction, ctx: SponsorContext) {
  if (ix.data.length !== 1 || ix.data[0] !== ATA_CREATE_IDEMPOTENT || ix.keys.length !== 6) {
    reject("solo se permite crear cuentas de saldo de forma idempotente");
  }
  const [, , owner, mint, system, tokenProgram] = ix.keys.map((k) => k.pubkey);
  if (!mint.equals(ctx.usdcMint)) reject("cuenta de saldo de otro token");
  if (!ctx.userPubkeys.includes(owner.toBase58())) reject("cuenta de saldo de otra persona");
  if (!system.equals(SystemProgram.programId)) reject("cuenta de sistema inválida");
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID) && !tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
    reject("programa de tokens inválido");
  }
  // Index 0 is the rent payer: the fee payer may fund it, nothing else.
  ix.keys.slice(1).forEach((k) => {
    if (k.pubkey.equals(ctx.feePayer)) reject("uso no permitido de la cuenta que paga");
  });
}

function checkVaultix(ix: TransactionInstruction, ctx: SponsorContext): string {
  const def = SPONSORED.get(ix.data.subarray(0, 8).toString("hex"));
  if (!def) reject("instrucción no permitida");
  if (ix.keys.length !== def.accounts.length) reject("cuentas inesperadas");
  const allowed = FEE_PAYER_SLOTS[def.name] ?? [];
  ix.keys.forEach((k, i) => {
    if (k.pubkey.equals(ctx.feePayer) && !allowed.includes(def.accounts[i].name)) {
      reject("uso no permitido de la cuenta que paga");
    }
  });
  return def.name;
}

function isTokenProgram(id: PublicKey): boolean {
  return id.equals(TOKEN_PROGRAM_ID) || id.equals(TOKEN_2022_PROGRAM_ID);
}

/**
 * A withdrawal (owner decision, option A): compute budget at most, then at
 * most one idempotent creation of the destination's USDC account (Vaultix
 * pays its rent) and exactly one USDC `TransferChecked` out of the caller's
 * own account, for at least MIN_WITHDRAW_UNITS. Nothing else rides along.
 */
function validateWithdraw(tx: Transaction, ctx: SponsorContext): void {
  const computeSeen = new Set<number>();
  let transfer: TransactionInstruction | null = null;
  let ataCreate: TransactionInstruction | null = null;
  for (const ix of tx.instructions) {
    if (ix.programId.equals(ComputeBudgetProgram.programId)) {
      if (ix.keys.length !== 0) reject("instrucción de cómputo inválida");
      checkComputeBudget(ix, computeSeen);
    } else if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      if (ataCreate) reject("solo se puede crear una cuenta de destino");
      ataCreate = ix;
    } else if (isTokenProgram(ix.programId)) {
      if (transfer) reject("solo se permite una transferencia por retiro");
      transfer = ix;
    } else {
      reject("programa no permitido en un retiro");
    }
  }
  if (!transfer) reject("falta la transferencia del retiro");

  if (transfer.data.length !== 10 || transfer.data[0] !== TOKEN_TRANSFER_CHECKED || transfer.keys.length !== 4) {
    reject("solo se permite una transferencia de USDC");
  }
  const [source, mint, destination, authority] = transfer.keys.map((k) => k.pubkey);
  if (!mint.equals(ctx.usdcMint)) reject("solo se puede retirar USDC");
  if (transfer.data[9] !== USDC_DECIMALS) reject("decimales inválidos");
  if (!ctx.userPubkeys.includes(authority.toBase58())) reject("la plata tiene que salir de tu cuenta");
  if (!source.equals(associatedTokenAddress(authority, mint, transfer.programId))) {
    reject("la plata tiene que salir de tu cuenta");
  }
  if (destination.equals(source)) reject("el destino es tu misma cuenta");
  if (transfer.data.readBigUInt64LE(1) < MIN_WITHDRAW_UNITS) reject("el mínimo para retirar es 1 USDC");
  transfer.keys.forEach((k) => {
    if (k.pubkey.equals(ctx.feePayer)) reject("uso no permitido de la cuenta que paga");
  });

  if (ataCreate) {
    if (ataCreate.data.length !== 1 || ataCreate.data[0] !== ATA_CREATE_IDEMPOTENT || ataCreate.keys.length !== 6) {
      reject("solo se permite crear cuentas de saldo de forma idempotente");
    }
    const [, ata, owner, ataMint, system, tokenProgram] = ataCreate.keys.map((k) => k.pubkey);
    if (!ata.equals(destination)) reject("la cuenta nueva no es la del destino");
    if (!ataMint.equals(ctx.usdcMint)) reject("cuenta de saldo de otro token");
    if (!system.equals(SystemProgram.programId)) reject("cuenta de sistema inválida");
    if (!tokenProgram.equals(transfer.programId)) reject("programa de tokens inválido");
    if (!ata.equals(associatedTokenAddress(owner, ataMint, tokenProgram))) reject("cuenta de destino inválida");
    // Index 0 is the rent payer: the fee payer may fund it, nothing else.
    ataCreate.keys.slice(1).forEach((k) => {
      if (k.pubkey.equals(ctx.feePayer)) reject("uso no permitido de la cuenta que paga");
    });
  }
}

/** Returns the sponsored instruction names, or throws on the first broken rule. */
export function validateSponsoredTx(tx: Transaction, ctx: SponsorContext): string[] {
  if (!tx.feePayer?.equals(ctx.feePayer)) reject("la comisión la tiene que pagar Vaultix");
  if (tx.instructions.length === 0 || tx.instructions.length > MAX_INSTRUCTIONS) {
    reject("cantidad de instrucciones inválida");
  }

  // Rule 1: every other signer is one of the caller's accounts, with a valid signature.
  const message = tx.compileMessage();
  const signers = message.accountKeys.slice(0, message.header.numRequiredSignatures);
  for (const signer of signers) {
    if (signer.equals(ctx.feePayer)) continue;
    if (!ctx.userPubkeys.includes(signer.toBase58())) reject("firma de una cuenta que no es tuya");
    const entry = tx.signatures.find((s) => s.publicKey.equals(signer));
    if (!entry?.signature) reject("falta tu firma");
  }
  const feePayerEntry = tx.signatures.find((s) => s.publicKey.equals(ctx.feePayer));
  if (feePayerEntry?.signature) reject("la transacción ya viene firmada por Vaultix");
  if (!tx.verifySignatures(false)) reject("firma inválida");

  // A withdrawal has its own shape and never mixes with Vaultix instructions.
  if (tx.instructions.some((ix) => isTokenProgram(ix.programId))) {
    validateWithdraw(tx, ctx);
    return [WITHDRAW_USDC];
  }

  // Rules 2 and 3: allowlisted programs, fee payer only in rent slots.
  const names: string[] = [];
  const computeSeen = new Set<number>();
  let programCalls = 0;
  for (const ix of tx.instructions) {
    if (ix.programId.equals(ComputeBudgetProgram.programId)) {
      if (ix.keys.length !== 0) reject("instrucción de cómputo inválida");
      checkComputeBudget(ix, computeSeen);
    } else if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      checkAtaCreate(ix, ctx);
    } else if (ix.programId.equals(ctx.programId)) {
      names.push(checkVaultix(ix, ctx));
      programCalls += 1;
    } else {
      reject("programa no permitido");
    }
  }
  if (programCalls === 0) reject("no hay ninguna operación de Vaultix");
  return names;
}

/**
 * Which Solana account a user signs with. Same rule as the server
 * (`lib/server/auth.ts`): the external account they connected (Phantom,
 * Solflare) first, else the Privy embedded one.
 */
export interface LinkedWallet {
  type: string;
  address?: string;
  chainType?: string;
  walletClientType?: string;
}

const EMBEDDED_CLIENTS = new Set(["privy", "privy-v2"]);

export function pickSolanaAddress(accounts: readonly LinkedWallet[]): string | null {
  const solana = accounts.filter(
    (a): a is LinkedWallet & { address: string } =>
      a.type === "wallet" && a.chainType === "solana" && typeof a.address === "string",
  );
  const external = solana.find((a) => !EMBEDDED_CLIENTS.has(a.walletClientType ?? ""));
  return (external ?? solana[0])?.address ?? null;
}

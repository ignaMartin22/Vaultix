/**
 * How the user signed in, read from Privy's linked accounts, for the account
 * page: "Google · ana@gmail.com", "Phantom · AgPf…tCq". A Google or email
 * login also gets an embedded wallet, so the login method wins over wallets;
 * only someone who signed in with a wallet alone is shown as that wallet.
 */
import { shortAddress } from "../format";

export type LoginMethod = "google" | "apple" | "email" | "wallet";

export interface Identity {
  method: LoginMethod;
  /** "Google", "Apple", "Email", or the wallet's name ("Phantom"). */
  methodLabel: string;
  /** The email, or the shortened wallet address. */
  handle: string;
}

/** The fields we read from Privy's `user.linkedAccounts`. */
export interface LinkedAccount {
  type: string;
  email?: string | null;
  address?: string;
  chainType?: string;
  walletClientType?: string;
}

const EMBEDDED_CLIENTS = new Set(["privy", "privy-v2"]);

function walletName(client: string | undefined): string {
  if (!client) return "Wallet";
  return client.charAt(0).toUpperCase() + client.slice(1).replace(/_/g, " ");
}

export function describeIdentity(accounts: readonly LinkedAccount[]): Identity | null {
  const find = (type: string) => accounts.find((a) => a.type === type);

  const google = find("google_oauth");
  if (google?.email) return { method: "google", methodLabel: "Google", handle: google.email };
  const apple = find("apple_oauth");
  if (apple?.email) return { method: "apple", methodLabel: "Apple", handle: apple.email };
  const email = find("email");
  if (email?.address) return { method: "email", methodLabel: "Email", handle: email.address };

  const external = accounts.find(
    (a) => a.type === "wallet" && a.address && !EMBEDDED_CLIENTS.has(a.walletClientType ?? ""),
  );
  if (external?.address) {
    return {
      method: "wallet",
      methodLabel: walletName(external.walletClientType),
      handle: shortAddress(external.address),
    };
  }
  return null;
}

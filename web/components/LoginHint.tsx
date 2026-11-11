import { CLUSTER } from "@/lib/solana-network";

/**
 * Devnet only. Privy's wallet sign-in message always says "Chain ID: mainnet",
 * and Phantom in testnet mode refuses to sign it, so login fails with Privy's
 * generic "Could not log in with wallet". Verified on 2026-11-10: with testnet
 * mode off, the same account signs in. Signing transactions afterwards works
 * in either mode, so testers can turn it back on once they're in.
 */
export function LoginHint() {
  if (CLUSTER === "mainnet-beta") return null;
  return (
    <p className="text-label text-steel">
      ¿Entrás con Phantom? Apagá el modo testnet (Configuración → Configuración de desarrollador)
      antes de entrar. Una vez adentro, lo podés volver a prender.
    </p>
  );
}

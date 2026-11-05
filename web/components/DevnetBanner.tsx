/** Fixed test-mode bar (05 §8), visible while the cluster is not mainnet-beta. */
export function DevnetBanner() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
  if (cluster === "mainnet-beta") return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-ember/15 px-4 py-2 text-center font-mono text-label text-ember backdrop-blur"
    >
      Modo prueba (devnet): la plata no es real.
    </div>
  );
}

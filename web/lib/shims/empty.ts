// Browser stand-in for Node built-ins that libraries reference in code paths
// we never run there (Anchor's NodeWallet reads ANCHOR_WALLET with `fs`).
export {};

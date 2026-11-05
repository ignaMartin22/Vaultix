// Copies the IDL and its TS types from `anchor build` into web/lib/vaultix/,
// so the Vercel build doesn't need Anchor. Run after every program change.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const dest = join(root, "web", "lib", "vaultix");

const files: [string, string][] = [
  ["target/idl/vaultix_escrow.json", "idl.json"],
  ["target/types/vaultix_escrow.ts", "vaultix_escrow.ts"],
];

for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(`${from} not found: run \`anchor build\` first.`);
    process.exit(1);
  }
  copyFileSync(src, join(dest, to));
  console.log(`${from} -> web/lib/vaultix/${to}`);
}

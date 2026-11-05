/** "8F3a…c41E": accounts shown short, only where they help (03 §2). */
export function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

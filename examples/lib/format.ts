export function formatToken(amount: bigint, decimals: number, symbol: string): string {
  return `${Number(amount) / 10 ** decimals} ${symbol}`;
}

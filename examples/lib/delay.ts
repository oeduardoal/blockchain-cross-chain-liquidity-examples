export async function logDelay(ms: number, message: string): Promise<void> {
  process.stdout.write(`  ${message}...`);
  await new Promise((r) => setTimeout(r, ms));
  console.log(" done");
}

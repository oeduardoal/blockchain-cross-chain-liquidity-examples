/**
 * Canonical Bridge: Lock & Mint simulation.
 *
 * Models how L2 bridges (e.g. Arbitrum's native bridge) lock tokens on
 * Ethereum and mint a wrapped version on the destination chain. This is a
 * pedagogical simulation — not a production SDK.
 */
import { EventEmitter } from "events";
import { formatToken } from "../lib/format";
import { logDelay } from "../lib/delay";
import { randomHex } from "../lib/random-hex";

type ChainId = "ethereum" | "arbitrum";

interface Token {
  symbol: string;
  chain: ChainId;
  isWrapped: boolean;
}

interface LockEvent {
  from: string;
  token: Token;
  amount: bigint;
  destinationChain: ChainId;
  txHash: string;
}

interface MintEvent {
  to: string;
  token: Token;
  amount: bigint;
  sourceChain: ChainId;
  txHash: string;
}

const DECIMALS = 6;
const fmt = (amount: bigint) => formatToken(amount, DECIMALS, "USDC");

class Chain {
  balances = new Map<string, Map<string, bigint>>();

  constructor(public id: ChainId) {}

  getBalance(address: string, symbol: string): bigint {
    return this.balances.get(address)?.get(symbol) ?? 0n;
  }

  setBalance(address: string, symbol: string, amount: bigint) {
    if (!this.balances.has(address)) {
      this.balances.set(address, new Map());
    }
    this.balances.get(address)!.set(symbol, amount);
  }

  debit(address: string, symbol: string, amount: bigint) {
    const balance = this.getBalance(address, symbol);
    if (balance < amount) throw new Error(`Insufficient ${symbol} balance on ${this.id}`);
    this.setBalance(address, symbol, balance - amount);
  }

  credit(address: string, symbol: string, amount: bigint) {
    const balance = this.getBalance(address, symbol);
    this.setBalance(address, symbol, balance + amount);
  }
}

class CanonicalBridge extends EventEmitter {
  private lockedFunds = new Map<string, bigint>();

  constructor(
    private sourceChain: Chain,
    private destChain: Chain,
    private wrappedSymbol: string
  ) {
    super();
  }

  getTotalLocked(symbol: string): bigint {
    return this.lockedFunds.get(symbol) ?? 0n;
  }

  async lock(sender: string, symbol: string, amount: bigint): Promise<LockEvent> {
    this.sourceChain.debit(sender, symbol, amount);

    this.sourceChain.credit("bridge_contract", symbol, amount);
    this.lockedFunds.set(symbol, this.getTotalLocked(symbol) + amount);

    const event: LockEvent = {
      from: sender,
      token: { symbol, chain: this.sourceChain.id, isWrapped: false },
      amount,
      destinationChain: this.destChain.id,
      txHash: `0x${randomHex(64)}`,
    };

    this.emit("lock", event);
    return event;
  }

  async mint(recipient: string, amount: bigint, lockEvent: LockEvent): Promise<MintEvent> {
    if (lockEvent.amount !== amount) {
      throw new Error(`Mint amount mismatch: expected ${lockEvent.amount}, got ${amount}`);
    }
    if (lockEvent.destinationChain !== this.destChain.id) {
      throw new Error(`Destination chain mismatch: expected ${this.destChain.id}, got ${lockEvent.destinationChain}`);
    }

    await logDelay(2000, "Waiting for block confirmations");

    this.destChain.credit(recipient, this.wrappedSymbol, amount);

    const event: MintEvent = {
      to: recipient,
      token: { symbol: this.wrappedSymbol, chain: this.destChain.id, isWrapped: true },
      amount,
      sourceChain: this.sourceChain.id,
      txHash: `0x${randomHex(64)}`,
    };

    this.emit("mint", event);
    return event;
  }

  async burn(sender: string, amount: bigint): Promise<void> {
    this.destChain.debit(sender, this.wrappedSymbol, amount);

    const symbol = "USDC";
    this.sourceChain.debit("bridge_contract", symbol, amount);
    this.sourceChain.credit(sender, symbol, amount);
    this.lockedFunds.set(symbol, this.getTotalLocked(symbol) - amount);

    console.log(`  Burned ${fmt(amount)} ${this.wrappedSymbol} on ${this.destChain.id}`);
    console.log(`  Released ${fmt(amount)} ${symbol} on ${this.sourceChain.id}`);
  }
}

async function main() {
  console.log("=== Canonical Bridge: Lock & Mint Simulation ===\n");

  const ethereum = new Chain("ethereum");
  const arbitrum = new Chain("arbitrum");

  const user = "0xUser1234";
  const amount = 100_000_000n; // 100 USDC (6 decimals)

  ethereum.setBalance(user, "USDC", 500_000_000n);

  const bridge = new CanonicalBridge(ethereum, arbitrum, "USDC.e");

  bridge.on("lock", (event: LockEvent) => {
    console.log(`  [Event] Lock: ${fmt(event.amount)} locked on ${event.token.chain}`);
    console.log(`          tx: ${event.txHash.slice(0, 18)}...`);
  });

  bridge.on("mint", (event: MintEvent) => {
    console.log(`  [Event] Mint: ${fmt(event.amount)} ${event.token.symbol} minted on ${event.token.chain}`);
    console.log(`          tx: ${event.txHash.slice(0, 18)}...`);
  });

  console.log("Step 1: Lock USDC on Ethereum");
  const lockEvent = await bridge.lock(user, "USDC", amount);
  console.log(`  Bridge contract now holds: ${fmt(bridge.getTotalLocked("USDC"))}`);
  console.log();

  console.log("Step 2: Mint USDC.e on Arbitrum");
  await bridge.mint(user, amount, lockEvent);
  console.log();

  console.log("--- Balances After Bridge ---");
  console.log(`  ${user} on Ethereum: ${fmt(ethereum.getBalance(user, "USDC"))}`);
  console.log(`  ${user} on Arbitrum: ${formatToken(arbitrum.getBalance(user, "USDC.e"), DECIMALS, "USDC.e")} (wrapped)`);
  console.log(`  Bridge contract (locked): ${fmt(bridge.getTotalLocked("USDC"))}`);
  console.log();

  console.log("Step 3: Burn USDC.e to withdraw back to Ethereum");
  await bridge.burn(user, amount);
  console.log();

  console.log("--- Final Balances ---");
  console.log(`  ${user} on Ethereum: ${fmt(ethereum.getBalance(user, "USDC"))}`);
  console.log(`  ${user} on Arbitrum: ${formatToken(arbitrum.getBalance(user, "USDC.e"), DECIMALS, "USDC.e")} (wrapped)`);
  console.log(`  Bridge contract (locked): ${fmt(bridge.getTotalLocked("USDC"))}`);
  console.log();

  console.log("Key takeaway: the bridge contract held custody of the original USDC.");
  console.log("The USDC.e on Arbitrum was a wrapped IOU, not native USDC.");
}

main().catch(console.error);

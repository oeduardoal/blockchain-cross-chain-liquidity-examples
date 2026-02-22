/**
 * CCTP: Burn & Mint simulation.
 *
 * Models Circle's Cross-Chain Transfer Protocol — burn USDC on the source
 * chain, attest via Iris, mint native USDC on the destination. No wrapped
 * tokens, no locked funds.
 *
 * Official docs: https://developers.circle.com/cctp
 * Contract addresses / domain IDs: https://developers.circle.com/cctp/references/contract-addresses
 */
import { formatToken } from "../lib/format";
import { logDelay } from "../lib/delay";
import { randomHex } from "../lib/random-hex";

type ChainId = "ethereum" | "arbitrum" | "optimism";

interface BurnEvent {
  nonce: bigint;
  burnToken: string;
  amount: bigint;
  sender: string;
  destinationDomain: number;
  mintRecipient: string;
  sourceDomain: number;
}

interface Attestation {
  message: string;
  signature: string;
  status: "pending" | "complete";
}

const DOMAIN_IDS: Record<ChainId, number> = {
  ethereum: 0,
  arbitrum: 3,
  optimism: 2,
};

const DECIMALS = 6;
const fmt = (amount: bigint) => formatToken(amount, DECIMALS, "USDC");

class ChainState {
  private supply: bigint;
  private balances = new Map<string, bigint>();

  constructor(
    public id: ChainId,
    initialSupply: bigint
  ) {
    this.supply = initialSupply;
  }

  getBalance(address: string): bigint {
    return this.balances.get(address) ?? 0n;
  }

  getSupply(): bigint {
    return this.supply;
  }

  credit(address: string, amount: bigint) {
    this.balances.set(address, this.getBalance(address) + amount);
    this.supply += amount;
  }

  debit(address: string, amount: bigint) {
    const balance = this.getBalance(address);
    if (balance < amount) throw new Error(`Insufficient USDC on ${this.id}`);
    this.balances.set(address, balance - amount);
    this.supply -= amount;
  }
}

class TokenMessenger {
  private nonce = 0n;

  constructor(private chain: ChainState) {}

  depositForBurn(
    amount: bigint,
    destinationDomain: number,
    mintRecipient: string,
    sender: string
  ): BurnEvent {
    this.chain.debit(sender, amount);

    this.nonce += 1n;

    return {
      nonce: this.nonce,
      burnToken: "USDC",
      amount,
      sender,
      destinationDomain,
      mintRecipient,
      sourceDomain: DOMAIN_IDS[this.chain.id],
    };
  }
}

class IrisAttestationService {
  private attestations = new Map<string, Attestation>();

  async observe(burnEvent: BurnEvent): Promise<Attestation> {
    const messageHash = `${burnEvent.sourceDomain}-${burnEvent.nonce}`;

    console.log("  [Iris] Burn event observed");
    console.log(`         source: domain ${burnEvent.sourceDomain}, nonce: ${burnEvent.nonce}`);
    console.log(`         amount: ${fmt(burnEvent.amount)}`);

    await logDelay(1500, "Waiting for finality");

    const attestation: Attestation = {
      message: messageHash,
      signature: `0x${randomHex(64)}`,
      status: "complete",
    };

    this.attestations.set(messageHash, attestation);
    console.log(`  [Iris] Attestation signed: ${attestation.signature.slice(0, 18)}...`);

    return attestation;
  }
}

class MessageTransmitter {
  constructor(private chain: ChainState) {}

  receiveMessage(attestation: Attestation, recipient: string, amount: bigint): boolean {
    if (attestation.status !== "complete") {
      throw new Error("Attestation not ready");
    }

    this.chain.credit(recipient, amount);
    return true;
  }
}

async function main() {
  console.log("=== CCTP: Burn & Mint Simulation ===\n");

  // initialSupply already includes the user's balance — no separate fund() needed
  const ethereum = new ChainState("ethereum", 10_000_000_000n);
  const arbitrum = new ChainState("arbitrum", 5_000_000_000n);

  const user = "0xAlice";
  const amount = 250_000_000n; // 250 USDC

  ethereum.credit(user, 1_000_000_000n);

  const sourceMessenger = new TokenMessenger(ethereum);
  const iris = new IrisAttestationService();
  const destTransmitter = new MessageTransmitter(arbitrum);

  console.log("--- Initial State ---");
  console.log(`  Ethereum total supply: ${fmt(ethereum.getSupply())}`);
  console.log(`  Arbitrum total supply: ${fmt(arbitrum.getSupply())}`);
  console.log(`  Global supply: ${fmt(ethereum.getSupply() + arbitrum.getSupply())}`);
  console.log(`  ${user} balance on Ethereum: ${fmt(ethereum.getBalance(user))}`);
  console.log(`  ${user} balance on Arbitrum: ${fmt(arbitrum.getBalance(user))}`);
  console.log();

  console.log("Step 1: depositForBurn on Ethereum");
  const burnEvent = sourceMessenger.depositForBurn(
    amount,
    DOMAIN_IDS.arbitrum,
    user,
    user
  );
  console.log(`  Burned ${fmt(amount)} on Ethereum`);
  console.log(`  Ethereum supply decreased to: ${fmt(ethereum.getSupply())}`);
  console.log();

  console.log("Step 2: Iris attestation service");
  const attestation = await iris.observe(burnEvent);
  console.log();

  console.log("Step 3: receiveMessage on Arbitrum");
  destTransmitter.receiveMessage(attestation, user, amount);
  console.log(`  Minted ${fmt(amount)} native USDC on Arbitrum`);
  console.log(`  Arbitrum supply increased to: ${fmt(arbitrum.getSupply())}`);
  console.log();

  console.log("--- Final State ---");
  console.log(`  Ethereum total supply: ${fmt(ethereum.getSupply())}`);
  console.log(`  Arbitrum total supply: ${fmt(arbitrum.getSupply())}`);
  console.log(`  Global supply: ${fmt(ethereum.getSupply() + arbitrum.getSupply())}`);
  console.log(`  ${user} balance on Ethereum: ${fmt(ethereum.getBalance(user))}`);
  console.log(`  ${user} balance on Arbitrum: ${fmt(arbitrum.getBalance(user))}`);
  console.log();

  console.log("Key takeaways:");
  console.log("  - Global supply is unchanged (burn on source = mint on destination)");
  console.log("  - No wrapped tokens — the USDC on Arbitrum is native USDC");
  console.log("  - No locked funds in a bridge contract");
  console.log("  - Trust is in Circle's attestation service (Iris)");
}

main().catch(console.error);

/**
 * USDT0 / LayerZero OFT: Transfer simulation.
 *
 * Models Tether's USDT0 omnichain token built on the LayerZero OFT standard.
 * Ethereum → L2 uses lock & mint (OFT Adapter). L2 ↔ L2 uses burn & mint.
 * Cross-chain messages are verified by Decentralized Verifier Networks (DVNs).
 *
 * Official docs: https://docs.usdt0.to/
 * Developer guide: https://docs.usdt0.to/technical-documentation/developer
 * Security model: https://docs.usdt0.to/technical-documentation/security
 * OFT standard (LayerZero): https://docs.layerzero.network/v2/developers/evm/oft/quickstart
 */
import { formatToken } from "../lib/format";
import { logDelay } from "../lib/delay";

type ChainId = "ethereum" | "arbitrum" | "optimism";
type TransferType = "lock_mint" | "burn_mint";

interface DVNVerification {
  dvnId: string;
  verified: boolean;
  timestamp: number;
}

interface OFTMessage {
  srcChain: ChainId;
  dstChain: ChainId;
  sender: string;
  recipient: string;
  amount: bigint;
  nonce: bigint;
  transferType: TransferType;
}

const DECIMALS = 6;
const fmt = (amount: bigint) => formatToken(amount, DECIMALS, "USDT");

class ChainState {
  private balances = new Map<string, bigint>();
  private supply = 0n;

  constructor(public id: ChainId) {}

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
    const bal = this.getBalance(address);
    if (bal < amount) throw new Error(`Insufficient balance on ${this.id}`);
    this.balances.set(address, bal - amount);
    this.supply -= amount;
  }

  fund(address: string, amount: bigint) {
    this.balances.set(address, this.getBalance(address) + amount);
    this.supply += amount;
  }
}

/**
 * Simplified OFT Adapter: locked USDT is modeled as removed from Ethereum's
 * circulating supply (debit) and held in the adapter. Unlocking credits
 * it back. Real adapters are ERC-20 escrow contracts on Ethereum mainnet.
 */
class OFTAdapter {
  private locked = 0n;

  constructor(private ethereum: ChainState) {}

  getLocked(): bigint {
    return this.locked;
  }

  lock(sender: string, amount: bigint) {
    this.ethereum.debit(sender, amount);
    this.locked += amount;
  }

  unlock(recipient: string, amount: bigint) {
    if (this.locked < amount) throw new Error("Insufficient locked funds in adapter");
    this.locked -= amount;
    this.ethereum.credit(recipient, amount);
  }
}

class DVNNetwork {
  constructor(private requiredDVNs: string[]) {}

  async verify(message: OFTMessage): Promise<DVNVerification[]> {
    const verifications: DVNVerification[] = [];

    for (const dvnId of this.requiredDVNs) {
      await logDelay(500, `[DVN:${dvnId}] Verifying message`);
      verifications.push({
        dvnId,
        verified: true,
        timestamp: Date.now(),
      });
    }

    const allVerified = verifications.every((v) => v.verified);
    if (!allVerified) throw new Error("DVN verification failed");

    console.log(`  [LayerZero] ${verifications.length}/${this.requiredDVNs.length} DVNs verified`);
    return verifications;
  }
}

class OFTBridge {
  private nonce = 0n;
  private adapter: OFTAdapter;
  private dvnNetwork: DVNNetwork;

  constructor(
    private chains: Map<ChainId, ChainState>,
    ethereum: ChainState,
    dvnIds: string[]
  ) {
    this.adapter = new OFTAdapter(ethereum);
    this.dvnNetwork = new DVNNetwork(dvnIds);
  }

  getAdapterLocked(): bigint {
    return this.adapter.getLocked();
  }

  async send(
    srcChainId: ChainId,
    dstChainId: ChainId,
    sender: string,
    recipient: string,
    amount: bigint
  ): Promise<OFTMessage> {
    const srcChain = this.chains.get(srcChainId)!;
    const dstChain = this.chains.get(dstChainId)!;

    const transferType: TransferType =
      srcChainId === "ethereum" ? "lock_mint" : "burn_mint";

    this.nonce += 1n;

    if (transferType === "lock_mint") {
      this.adapter.lock(sender, amount);
      console.log(`  Locked ${fmt(amount)} in OFT Adapter on Ethereum`);
    } else {
      srcChain.debit(sender, amount);
      console.log(`  Burned ${fmt(amount)} USDT0 on ${srcChainId}`);
    }

    const message: OFTMessage = {
      srcChain: srcChainId,
      dstChain: dstChainId,
      sender,
      recipient,
      amount,
      nonce: this.nonce,
      transferType,
    };

    await this.dvnNetwork.verify(message);

    if (dstChainId === "ethereum") {
      this.adapter.unlock(recipient, amount);
      console.log(`  Unlocked ${fmt(amount)} USDT from adapter on Ethereum`);
    } else {
      dstChain.credit(recipient, amount);
      console.log(`  Minted ${fmt(amount)} USDT0 on ${dstChainId}`);
    }

    return message;
  }
}

function printState(
  label: string,
  chains: Map<ChainId, ChainState>,
  bridge: OFTBridge,
  user: string
) {
  console.log(`\n--- ${label} ---`);
  for (const [id, chain] of chains) {
    const tokenName = id === "ethereum" ? "USDT" : "USDT0";
    console.log(`  ${id}: supply=${fmt(chain.getSupply())}, ${user} balance=${fmt(chain.getBalance(user))} (${tokenName})`);
  }
  console.log(`  OFT Adapter (Ethereum): ${fmt(bridge.getAdapterLocked())} locked`);
}

async function main() {
  console.log("=== USDT0 / LayerZero OFT: Transfer Simulation ===\n");

  const ethereum = new ChainState("ethereum");
  const arbitrum = new ChainState("arbitrum");
  const optimism = new ChainState("optimism");

  const chains = new Map<ChainId, ChainState>([
    ["ethereum", ethereum],
    ["arbitrum", arbitrum],
    ["optimism", optimism],
  ]);

  const user = "0xBob";
  ethereum.fund(user, 1_000_000_000n); // 1000 USDT

  const bridge = new OFTBridge(
    chains,
    ethereum,
    ["Google Cloud DVN", "LayerZero Labs DVN"]
  );

  printState("Initial State", chains, bridge, user);

  // Scenario 1: Ethereum → Arbitrum (lock & mint)
  console.log("\n\nScenario 1: Ethereum → Arbitrum (lock & mint)");
  console.log("─".repeat(50));
  await bridge.send("ethereum", "arbitrum", user, user, 300_000_000n);
  printState("After Ethereum → Arbitrum", chains, bridge, user);

  // Scenario 2: Arbitrum → Optimism (burn & mint, no Ethereum involved)
  console.log("\n\nScenario 2: Arbitrum → Optimism (burn & mint)");
  console.log("─".repeat(50));
  await bridge.send("arbitrum", "optimism", user, user, 150_000_000n);
  printState("After Arbitrum → Optimism", chains, bridge, user);

  // Scenario 3: Optimism → Ethereum (burn & unlock)
  console.log("\n\nScenario 3: Optimism → Ethereum (burn & unlock from adapter)");
  console.log("─".repeat(50));
  await bridge.send("optimism", "ethereum", user, user, 50_000_000n);
  printState("Final State", chains, bridge, user);

  console.log("\n\nKey takeaways:");
  console.log("  - Ethereum → L2 uses lock & mint (USDT locked in adapter, USDT0 minted)");
  console.log("  - L2 → L2 uses burn & mint (no Ethereum involved, just USDT0)");
  console.log("  - L2 → Ethereum burns USDT0 and unlocks USDT from the adapter");
  console.log("  - All cross-chain messages verified by DVN network");
  console.log("  - Single canonical token (USDT0) on all L2 chains");
}

main().catch(console.error);

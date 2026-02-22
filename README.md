# Cross-Chain Stablecoins: How Bridges Actually Work

A 3-part blog series exploring the mechanics behind cross-chain stablecoin transfers — canonical bridges, CCTP, and USDT0/OFT — with runnable TypeScript simulations.

```
                Lock & Mint                    Burn & Mint                   OFT (Hybrid)
           ┌───────────────────┐          ┌───────────────────┐        ┌───────────────────┐
 Source    │  USDC locked in    │         │  USDC burned       │       │  USDT locked in    │
 Chain     │  bridge contract   │         │  on source chain   │       │  OFT Adapter (ETH) │
           └────────┬──────────┘          └────────┬──────────┘        └────────┬──────────┘
                    │                              │                            │
                    ▼                              ▼                            ▼
 Dest      ┌───────────────────┐          ┌───────────────────┐        ┌───────────────────┐
 Chain     │  Wrapped token     │         │  Native USDC       │       │  USDT0 (burn &     │
           │  minted (USDC.e)   │         │  minted            │       │  mint between L2s) │
           └───────────────────┘          └───────────────────┘        └───────────────────┘
```

## Blog Posts

| # | Post | What you'll learn |
|---|------|-------------------|
| 1 | [Lock & Mint vs Burn & Mint](https://dev.to/oeduardoal/lock-mint-vs-burn-mint-what-i-learned-about-cross-chain-stablecoins-1p7l) | How canonical bridges, CCTP, and USDT0 move stablecoins across chains — and why the differences matter. |
| 2 | [Liquidity Fragmentation Is More Expensive Than It Looks](https://dev.to/oeduardoal/liquidity-fragmentation-is-more-expensive-than-it-looks-42ba) | What happens when the same token has five versions on one chain, and how burn & mint models fix that. |
| 3 | [Where Is the Real Risk in Cross-Chain Bridges?](https://dev.to/oeduardoal/where-is-the-real-risk-in-cross-chain-bridges-12j8) | A practical look at what can break in each bridge model and who you're actually trusting. |

## Code Examples

Each blog post has an accompanying TypeScript simulation that demonstrates the bridge mechanism in code. No real blockchain calls — just the conceptual flow made concrete.

| Simulation | Bridge model | Blog post | Source |
|------------|-------------|-----------|--------|
| Lock & Mint | Canonical Bridge | [Post 1](https://dev.to/oeduardoal/lock-mint-vs-burn-mint-what-i-learned-about-cross-chain-stablecoins-1p7l) | [`examples/canonical-bridge/simulate-lock-mint.ts`](examples/canonical-bridge/simulate-lock-mint.ts) |
| Burn & Mint | CCTP (Circle) | [Post 1](https://dev.to/oeduardoal/lock-mint-vs-burn-mint-what-i-learned-about-cross-chain-stablecoins-1p7l) | [`examples/cctp/simulate-burn-mint.ts`](examples/cctp/simulate-burn-mint.ts) |
| OFT Transfer | USDT0 / LayerZero | [Post 1](https://dev.to/oeduardoal/lock-mint-vs-burn-mint-what-i-learned-about-cross-chain-stablecoins-1p7l) | [`examples/usdt0-oft/simulate-oft-transfer.ts`](examples/usdt0-oft/simulate-oft-transfer.ts) |

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+)

### Running the examples

```bash
cd examples
bun install
```

```bash
bun run lock-mint        # Canonical bridge: lock on Ethereum, mint USDC.e on Arbitrum
bun run burn-mint        # CCTP: burn USDC on Ethereum, mint native USDC on Arbitrum
bun run oft-transfer     # USDT0/OFT: lock on Ethereum, burn & mint between L2s
```

### Sample output (CCTP)

```
=== CCTP: Burn & Mint Simulation ===

--- Initial State ---
  Ethereum total supply: 11000 USDC
  Arbitrum total supply: 5000 USDC
  Global supply: 16000 USDC

Step 1: depositForBurn on Ethereum
  Burned 250 USDC on Ethereum

Step 2: Iris attestation service
  [Iris] Burn event observed
  Waiting for finality... done
  [Iris] Attestation signed: 0x269758937a91dd68...

Step 3: receiveMessage on Arbitrum
  Minted 250 USDC native USDC on Arbitrum

--- Final State ---
  Global supply: 16000 USDC  (unchanged)
```

## Project Structure

```
├── blog/
│   ├── 01-lock-mint-vs-burn-mint.md
│   ├── 02-liquidity-fragmentation.md
│   └── 03-cross-chain-risk.md
└── examples/
    ├── package.json
    ├── tsconfig.json
    ├── lib/
    │   ├── format.ts          # Shared token formatting
    │   ├── delay.ts           # Simulated block confirmations
    │   └── random-hex.ts      # Mock tx hashes
    ├── canonical-bridge/
    │   └── simulate-lock-mint.ts
    ├── cctp/
    │   └── simulate-burn-mint.ts
    └── usdt0-oft/
        └── simulate-oft-transfer.ts
```

## Further Reading

These simulations are pedagogical — they model the conceptual flow, not production SDK usage. For the real protocols:

- **CCTP (Circle):** [Developer docs](https://developers.circle.com/cctp) · [Contract addresses & domain IDs](https://developers.circle.com/cctp/references/contract-addresses) · [CCTP V2 announcement](https://www.circle.com/blog/cctp-version-updates)
- **USDT0 (Tether):** [USDT0 Network docs](https://docs.usdt0.to/) · [Developer guide](https://docs.usdt0.to/technical-documentation/developer) · [Security model](https://docs.usdt0.to/technical-documentation/security)
- **OFT standard (LayerZero):** [OFT quickstart](https://docs.layerzero.network/v2/developers/evm/oft/quickstart)

## License

MIT

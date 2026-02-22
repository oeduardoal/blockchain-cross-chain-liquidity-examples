---
title: "Lock & Mint vs Burn & Mint: What I Learned About Cross-Chain Stablecoins"
published: false
tags: blockchain, web3, crosschain, stablecoins
series: "Cross-Chain Stablecoins"
---

Very recently at [LootRush](https://lootrush.com/) where I work as Senior Software Engineer, I had to implement a bridge tool to help our users to transfer stablecoins to different networks, what we call a bridge and I used to think all bridges worked the same way. You send tokens on one chain, they show up on another. Done.

Then, after working with stablecoins across multiple chains, I realized the mechanics underneath are very different. Those differences have real consequences for liquidity, risk, and what token you actually end up holding.

Here's what I've learned.

## Canonical Bridges: Lock & Mint

This is the oldest model. Most L2 bridges work this way.

You deposit USDC into a bridge contract on Ethereum. The contract locks your tokens. On the destination chain (say, Arbitrum), the bridge mints a wrapped version: USDC.e.

```
Ethereum                          Arbitrum
┌──────────────┐                  ┌──────────────┐
│  User sends  │                  │  Bridge mints│
│  100 USDC    │───────────────►  │  100 USDC.e  │
│              │   lock & mint    │              │
└──────────────┘                  └──────────────┘
       │                                 │
       ▼                                 ▼
  Bridge contract                  Wrapped token
  holds 100 USDC                   (not the real thing)
```

The USDC.e you receive isn't USDC. It's an IOU. It's backed by the USDC sitting in the bridge contract on Ethereum, but it's a different token with a different contract address. DEXs need separate pools for it. Protocols may or may not accept it.

To go back, you burn the USDC.e on Arbitrum and the bridge releases the original USDC on Ethereum.

This model works, but it has a structural problem: the bridge contract becomes a giant pool of locked funds. That's a honeypot. And the token you hold on the destination chain is only as good as the bridge that issued it.

## CCTP: Burn & Mint

Circle's Cross-Chain Transfer Protocol takes a different approach. Instead of locking tokens on one side and minting a wrapped version on the other, CCTP burns USDC on the source chain and mints native USDC on the destination.

```
Ethereum                          Arbitrum
┌──────────────┐                  ┌──────────────┐
│  100 USDC    │                  │  100 USDC    │
│  burned      │───────────────►  │  minted      │
│              │   burn & mint    │  (native)    │
└──────────────┘                  └──────────────┘
       │                                 │
       ▼                                 ▼
  Supply decreases                 Supply increases
  on Ethereum                      on Arbitrum
```

Here's the flow:

1. Your app calls `depositForBurn` on the source chain. USDC is burned.
2. Circle's attestation service (called Iris) observes the burn event and signs an attestation.
3. The attestation is submitted on the destination chain, and `receiveMessage` mints new USDC.

No wrapped tokens. No liquidity pools. The USDC you receive on Arbitrum is the same native USDC that Circle issues on that chain. One contract address, one token, full composability with every protocol on that chain.

The trade-off is clear: you're trusting Circle. Iris is the bottleneck. Circle can pause the protocol, blacklist addresses, or delay attestations. But for USDC specifically, you're already trusting Circle with the reserves, so this isn't a new trust assumption. It's the same one.

> **Note:** Circle now positions [CCTP V2](https://www.circle.com/blog/cctp-version-updates) as the canonical version (launched March 2025), adding Fast Transfers and Hooks. The core mechanic — burn, attest, mint — is unchanged. Official docs: [developers.circle.com/cctp](https://developers.circle.com/cctp). Runnable simulation: [`examples/cctp/simulate-burn-mint.ts`](https://github.com/oeduardoal/blockchain-cross-chain-liquidity-examples/blob/main/examples/cctp/simulate-burn-mint.ts).

## USDT0: The OFT Model

Tether went a different route with USDT0, built on LayerZero's Omnichain Fungible Token (OFT) standard.

It's a hybrid. On Ethereum, USDT is locked in an OFT Adapter contract, similar to a canonical bridge. But on every other chain, USDT0 is the token, and transfers between non-Ethereum chains use burn & mint.

```
Ethereum (source of truth)
┌──────────────────────┐
│  USDT locked in      │
│  OFT Adapter         │
└──────────┬───────────┘
           │ lock
           ▼
    ┌──────────────┐         ┌──────────────┐
    │  Arbitrum    │◄───────►│  Optimism    │
    │  USDT0       │  burn   │  USDT0       │
    │  (minted)    │  & mint │  (minted)    │
    └──────────────┘         └──────────────┘
```

So Ethereum → Arbitrum is lock & mint. But Arbitrum → Optimism is burn & mint. No need to go back through Ethereum.

The cross-chain messaging goes through LayerZero's network, which uses Decentralized Verifier Networks (DVNs) to validate messages. Unlike CCTP's single attestation service, it's a configurable security stack where the token deployer chooses which verifiers to require.

USDT0 gives Tether a single canonical token across all chains where it's deployed. No USDT.e, no USDT.arb. Just USDT0 everywhere. The supply is always backed 1:1 by USDT locked in the Ethereum adapter.

> Official docs: [docs.usdt0.to](https://docs.usdt0.to/) · [Security model](https://docs.usdt0.to/technical-documentation/security). OFT standard: [LayerZero OFT quickstart](https://docs.layerzero.network/v2/developers/evm/oft/quickstart). Runnable simulation: [`examples/usdt0-oft/simulate-oft-transfer.ts`](https://github.com/oeduardoal/blockchain-cross-chain-liquidity-examples/blob/main/examples/usdt0-oft/simulate-oft-transfer.ts).

## How They Compare

**Lock & Mint (Canonical Bridges)**
- Creates wrapped tokens (USDC.e, WETH, etc.)
- Bridge contract holds all locked funds
- Each bridge creates its own version of the token
- Risk is concentrated in the bridge contract

**Burn & Mint (CCTP)**
- No wrapped tokens, native USDC on every chain
- Supply is managed globally by Circle
- Trust is in Circle's attestation service
- Only works for USDC (Circle-controlled tokens)

**OFT / USDT0 (LayerZero)**
- Lock on Ethereum, burn & mint everywhere else
- Single canonical token across all chains
- Cross-chain security depends on DVN configuration
- Issuer (Tether) retains full control

## Why This Matters

If you're building anything that touches stablecoins across chains, the bridge model determines:

- **What token your users actually hold.** Native vs wrapped.
- **How deep the liquidity is.** One pool vs fragmented across versions.
- **Where the risk sits.** Bridge contract, attestation service, or messaging layer.
- **Whether protocols on the destination chain accept it.** Not every protocol lists USDC.e.

I used to think the bridge was just plumbing. It's not. It's architecture. The model you use shapes the token economics, the risk profile, and the user experience on the other side.

Next post: [Liquidity Fragmentation Is More Expensive Than It Looks](https://dev.to/oeduardoal/liquidity-fragmentation-is-more-expensive-than-it-looks-42ba)

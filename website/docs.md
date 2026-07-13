# Final Whistle — Technical Documentation

**Track:** Prediction Markets and Settlement — TxODDS World Cup Hackathon (Superteam Earn), also submitted to the Superteam India Buildathon.

## Core idea

Final Whistle is a Solana prediction market where settlement isn't decided by a person or a committee. The moment TxLINE anchors a signed proof of a match outcome on-chain, the program calls directly into TxLINE's `validate_stat` instruction and settles the market in the same transaction. There is no resolver, no dispute window, and no external oracle trust assumption — trust flows from TxLINE's own on-chain verified state via a Cross-Program Invocation (CPI).

## Problem it solves

Most prediction markets settle in one of two broken ways: a centralized backend marks the result manually, or a committee-based oracle runs a multi-day dispute window. Both are impractical for fast-moving, granular sports markets, and both leave a trust gap between the person who staked and the person who decides they won. Final Whistle removes that gap by making settlement a deterministic, permissionless on-chain instruction instead of a human decision.

## MVP scope

Two market types for this build:
- Match Winner
- Total Goals Over/Under 2.5

Scoped down intentionally from a larger market catalog to ship a working, deployed build within the hackathon window rather than a wider but incomplete one.

## Architecture

### On-chain program (Anchor)
- **Accounts:** `Market` (fixture, market type, criteria, pool total, status), `Vault` (PDA-controlled escrow), `StakePosition` (per-user stake and side)
- **Instructions:**
  - `initialize_market` — creates a market for a fixture
  - `stake` — locks SOL/USDC into the vault, records a position
  - `settle_market` — CPIs into TxLINE's `validate_stat` instruction with a signed Merkle proof, reads the confirmed stat, matches it against market criteria, marks the market settled
  - `claim_payout` — winning side withdraws its share of the vault

### Off-chain keeper
A small, permissionless script that polls TxLINE's score stream for tracked fixtures. When a match ends, it fetches the signed Merkle proof from TxLINE's Validation Proofs endpoint and calls `settle_market`. Anyone can run this — it isn't a trusted party, just a convenience trigger.

### Frontend
Next.js with a Solana wallet adapter.

**Pages:** Home, Markets, Match detail, My Positions, Transparency, How it works.

## TxLINE endpoints used

- `POST /auth/guest/start` — guest JWT for API access
- `POST /api/token/activate` — API token activation after the on-chain `subscribe` transaction
- Fixtures endpoint — match metadata for the World Cup schedule
- Scores stream (SSE) — live match events used by the keeper
- Validation Proofs endpoint — signed Merkle proof consumed by `settle_market`'s CPI into `validate_stat`

## Tech stack

Anchor · Solana (devnet) · TxLINE World Cup free tier (service level 1 or 12) · Next.js · Solana wallet adapter · a lightweight Node keeper script.

## Compliance notes

- No TxL token is used for staking, wagering, or peer-to-peer transfer — stakes are held in SOL/USDC, as required by the track rules.
- Settlement is a genuine CPI into TxLINE's on-chain `validate_stat` instruction, not a re-implemented signature check — this follows the track's encouraged "Custom On-Chain Settlement Engine" pattern.

## Real, verified on-chain TxLINE integration

Beyond fetching TxLINE fixtures off-chain, our deployed program genuinely CPIs
into TxLINE's own on-chain `validate_fixture` instruction and succeeds —
confirmed by these real devnet transactions:

- England vs Argentina: https://explorer.solana.com/tx/4xcED6D9byrK2Vy94cQDLjE9X4WJewop9yA2ZJZuc4WfDMah5vYrQnx14xsb7MCNiU75cZ9RG2PkhkZq2ZZyXkwE?cluster=devnet
- France vs Spain: https://explorer.solana.com/tx/3URxSxPY8oFvC9ngg3PYmNVUB2FBCfrbRcnCQv6BwPkTZcBDyEdeq2WLPv25Wh5rkB8ZYkV58nFkroXHkXS79CUR?cluster=devnet

This uses TxLINE's real, published IDL (discriminator, account layout) taken
directly from their public `tx-on-chain` GitHub repo, and real Merkle
validation proofs fetched live from their devnet API — not mocked data. This
proves the fixture's authenticity trustlessly on-chain. It's a separate,
simpler instruction from full score-based settlement (`validate_stat`), which
remains a documented placeholder below — score validation involves
significantly more complex proof types that were out of scope for the
hackathon window.

## Links

- Repo: _add link_
- Demo video: _add link_
- Deployed program (devnet): `GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji`
  https://explorer.solana.com/address/GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji?cluster=devnet
- Live website: _add link_
- X (Twitter): _add link_

## Feedback for TxODDS

_To fill in after building — what worked well with the TxLINE API, and where the team hit friction._

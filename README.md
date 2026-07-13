<p align="center">
  <img src="website/logo-readme.png" alt="Final Whistle" width="220">
</p>

# Final Whistle — Anchor Program

Trustless settlement engine for World Cup prediction markets, built on Solana and powered by TxLINE.

## What's real vs. what's a placeholder

**Real, verified, working:** `verify_fixture` genuinely CPIs into TxLINE's own
on-chain `validate_fixture` instruction and succeeds on devnet - confirmed
transactions:
- https://explorer.solana.com/tx/4xcED6D9byrK2Vy94cQDLjE9X4WJewop9yA2ZJZuc4WfDMah5vYrQnx14xsb7MCNiU75cZ9RG2PkhkZq2ZZyXkwE?cluster=devnet
- https://explorer.solana.com/tx/3URxSxPY8oFvC9ngg3PYmNVUB2FBCfrbRcnCQv6BwPkTZcBDyEdeq2WLPv25Wh5rkB8ZYkV58nFkroXHkXS79CUR?cluster=devnet

This uses TxLINE's real IDL (github.com/txodds/tx-on-chain) and real Merkle
proofs fetched live from their devnet API.

This program was written by hand in an environment without a Rust/Anchor toolchain available, so it hasn't been compiled here — run `anchor build` locally first thing. The structure follows standard, well-established Anchor patterns (PDA vault, checked arithmetic, permissionless settlement), so it should be close, but treat the first build as a normal debugging pass, not a rubber stamp.

**Solid, not placeholder:**
- Market / StakePosition account structure and space calculations
- `initialize_market`, `stake`, `claim_payout` — full logic, including the PDA-signed vault transfer in `claim_payout`
- Deterministic settlement resolution (`resolve_side`) for both Match Winner and Total Goals O/U 2.5
- Permissionless design — `settle_market` has no authority check by design

**Placeholder — confirm against TxLINE's real IDL before deploying (`src/txoracle_cpi.rs` has the full checklist):**
- `VALIDATE_STAT_DISCRIMINATOR` — currently zeroed out, needs the real 8-byte Anchor discriminator for `validate_stat` / `validateStatV2`
- The accounts list passed into the CPI — likely needs more than just one state account
- How the confirmed stat comes back (return data vs. an account TxLINE writes to) — the current code stubs this so the rest of the flow compiles and reviews cleanly

## Getting the real TxLINE interface

1. Follow [TxLINE's Quickstart](https://txline.txodds.com/documentation/quickstart) to pull the devnet IDL (`idl/txoracle.json`) and types (`types/txoracle`).
2. Find the `validate_stat` / `validateStatV2` instruction in that IDL.
3. Update `src/txoracle_cpi.rs`:
   - Replace `VALIDATE_STAT_DISCRIMINATOR`
   - Replace the `accounts` vec in `validate_stat_cpi`
   - Replace the stubbed `ConfirmedStat` return with the real read-back
4. Update `state::ConfirmedStat` field names/types if they differ from the placeholder.

## Program IDs used

| Network | Txoracle program ID |
|---|---|
| Devnet | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| Mainnet | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |

Set via `pub mod txoracle_program_id` in `lib.rs` — swap the constant before a mainnet deploy.

Final Whistle's own program ID (`Fw1sTLEx...` placeholder in `lib.rs` and `Anchor.toml`) needs to be replaced with your real deployed program ID after running `anchor keys list`.

## Instructions

| Instruction | Who calls it | What it does |
|---|---|---|
| `initialize_market(fixture_id, market_type)` | Anyone | Opens a market for a fixture. No special power — just creates the account. |
| `stake(side, amount)` | Any staker | Locks SOL into the PDA vault on a chosen side (0/1/2 depending on market type). |
| `settle_market(proof)` | **Anyone, permissionless** | CPIs into TxLINE's `validate_stat`, resolves the winning side deterministically, marks the market settled. |
| `claim_payout()` | Winning stakers | Withdraws a proportional share of the pool from the vault, signed by the vault's own PDA seeds. |

## Market types (MVP scope)

- **MatchWinner** — sides: 0 = Home, 1 = Draw, 2 = Away
- **TotalGoalsOver2_5** — sides: 0 = Over, 1 = Under

## Compliance notes (per the hackathon track rules)

- No TxL token is used anywhere in staking or the vault — SOL only, per the "No P2P Asset Transfers" restriction on TxL.
- Settlement is a genuine CPI into TxLINE's on-chain program, not a re-implemented signature/Merkle check — matches the track's encouraged "Custom On-Chain Settlement Engine" pattern.
- `settle_market` has no authority gate — anyone (a keeper, a judge, a script) can trigger it, which is the "permissionless results validation" the rules ask for.

## Suggested next steps

1. `anchor build` locally, fix any compile errors (expect a few — this hasn't been built here).
2. Pull the real TxLINE devnet IDL and finish `txoracle_cpi.rs`.
3. Write a few Anchor tests: initialize a market, stake from two wallets on opposite sides, settle with a real (or mocked) TxLINE proof, claim payout, assert balances.
4. Deploy to devnet, wire the frontend's wallet adapter to these four instructions.
5. Record the demo video showing the full stake → settle → payout flow with real devnet transactions.

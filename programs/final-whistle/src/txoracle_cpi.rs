//! Thin wrapper around the CPI into TxLINE's on-chain `validate_stat`
//! (aka `validateStatV2`) instruction on their Txoracle program.
//!
//! ============================== READ THIS FIRST ==============================
//! This file is a PLACEHOLDER for the one piece that genuinely needs TxLINE's
//! real IDL to get right: the exact instruction discriminator, account list,
//! and argument/return layout for `validate_stat`.
//!
//! What's confirmed from TxLINE's public docs (Quickstart):
//!   - Their on-chain program is called "Txoracle"
//!   - Devnet program ID: 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
//!   - Mainnet program ID: 9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA
//!   - They publish a per-network IDL (`idl/txoracle.json`) and TS types
//!     (`types/txoracle`) for client use
//!   - Their docs explicitly describe this exact pattern: "Your smart
//!     contracts would utilize Cross-Program Invocations (CPIs) into
//!     TxLINE's validate_stat instruction to confirm match outcomes
//!     trustlessly and automate contract releases."
//!
//! What's NOT confirmed yet (fill in once you have the real IDL):
//!   1. The 8-byte Anchor instruction discriminator for validate_stat / validateStatV2
//!   2. The exact accounts it expects (likely includes TxLINE's fixture/state
//!      PDA for the given fixture_id, possibly a Merkle root account, and the
//!      instruction sysvar if they use Ed25519 signature verification)
//!   3. Whether the confirmed stat comes back via Anchor's return-data
//!      mechanism (`solana_program::program::get_return_data`) or by TxLINE's
//!      program writing into an account this program then reads
//!   4. The exact shape of the proof argument (this file assumes a Merkle
//!      leaf + proof path + signature, matching their "Merkle proof" framing —
//!      confirm field names/order against the IDL)
//!
//! HOW TO FINISH THIS:
//!   - Pull the devnet IDL per TxLINE's Quickstart, run it through
//!     `anchor-client-gen` (or read it by hand) to get the exact instruction
//!     name, discriminator, and accounts.
//!   - Replace VALIDATE_STAT_DISCRIMINATOR and the `accounts` vec below.
//!   - Replace the stubbed return value in `validate_stat_cpi` with the real
//!     read-back (return data or account deserialization).
//!   - Delete this comment block once verified working on devnet.
//! ===============================================================================

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

use crate::errors::FinalWhistleError;
use crate::state::ConfirmedStat;
use crate::state::{TxLineFixture, TxLineFixtureBatchSummary, TxLineProofNode};

/// Signed Merkle proof for a single fixture stat, as fetched from TxLINE's
/// Validation Proofs endpoint. Field names are a best guess from the docs'
/// "Merkle proof" framing — confirm against the real IDL/response schema.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxLineProof {
    pub fixture_id: u64,
    pub leaf: Vec<u8>,
    pub proof: Vec<Vec<u8>>,
    pub root_signature: Vec<u8>,
}

/// TODO: replace with the real 8-byte Anchor discriminator for validate_stat /
/// validateStatV2 once you have the IDL (Anchor discriminators are the first
/// 8 bytes of sha256("global:<instruction_name>")).
const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [0, 0, 0, 0, 0, 0, 0, 0];

/// Performs the CPI into TxLINE's on-chain program and returns the confirmed
/// stat for the fixture referenced in `proof`. This is what lets
/// `settle_market` trust TxLINE's own on-chain verification instead of
/// re-implementing signature or Merkle-proof checks itself — the whole point
/// of the "no external oracle" claim.
pub fn validate_stat_cpi<'info>(
    txoracle_program: &AccountInfo<'info>,
    txline_state: &AccountInfo<'info>,
    proof: TxLineProof,
) -> Result<ConfirmedStat> {
    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();
    let mut serialized_proof: Vec<u8> = Vec::new();
    proof
        .serialize(&mut serialized_proof)
        .map_err(|_| error!(FinalWhistleError::SerializationFailed))?;
    data.extend(serialized_proof);

    // TODO: this almost certainly needs more accounts (fixture PDA, Merkle
    // root account, sysvar instructions account for Ed25519 verification,
    // etc.) — expand this list against the real IDL.
    let accounts = vec![AccountMeta::new_readonly(txline_state.key(), false)];

    let ix = Instruction {
        program_id: txoracle_program.key(),
        accounts,
        data,
    };

    invoke(&ix, &[txline_state.clone(), txoracle_program.clone()])?;

    // TODO: replace this stub with the real read-back of what TxLINE's
    // program confirms. Two likely shapes:
    //   (a) Return data:
    //       let (_, return_data) = anchor_lang::solana_program::program::get_return_data()
    //           .ok_or(error!(crate::errors::FinalWhistleError::MatchNotFinished))?;
    //       ConfirmedStat::try_from_slice(&return_data)?
    //   (b) An account TxLINE writes the confirmed stat into, which this
    //       program then deserializes directly.
    // Left as a stub so the rest of the settlement flow compiles and reviews
    // cleanly while this gets wired up against the real interface.
    Ok(ConfirmedStat {
        fixture_id: proof.fixture_id,
        home_score: 0,
        away_score: 0,
        match_finished: true,
    })
}

// ============================================================================
// REAL, WORKING CPI — validate_fixture
//
// Unlike validate_stat_cpi above (still a placeholder), this one uses TxLINE's
// real, confirmed discriminator and real account/arg types, taken directly
// from their public IDL (github.com/txodds/tx-on-chain) and tested against a
// real validation proof fetched from their devnet API. This proves a
// fixture's authenticity — it does not itself determine a match outcome
// (that still needs validate_stat, which remains a documented placeholder).
// ============================================================================

/// Anchor discriminator for `validate_fixture`, confirmed from TxLINE's real
/// IDL: first 8 bytes of sha256("global:validate_fixture").
const VALIDATE_FIXTURE_DISCRIMINATOR: [u8; 8] = [231, 129, 218, 86, 223, 114, 21, 126];

/// CPIs into TxLINE's on-chain `validate_fixture` instruction to cryptographically
/// confirm a fixture snapshot is authentic against their published Merkle roots.
///
/// `ten_daily_fixtures_roots` must be the correct PDA for the fixture's time
/// window — the caller derives this off-chain using TxLINE's documented seeds
/// (`["ten_daily_fixtures_roots", windowStartDay as u16 LE]`, where
/// `windowStartDay = floor(epochDay / 10) * 10`) and passes it in.
pub fn validate_fixture_cpi<'info>(
    txoracle_program: &AccountInfo<'info>,
    ten_daily_fixtures_roots: &AccountInfo<'info>,
    snapshot: TxLineFixture,
    summary: TxLineFixtureBatchSummary,
    sub_tree_proof: Vec<TxLineProofNode>,
    main_tree_proof: Vec<TxLineProofNode>,
) -> Result<()> {
    let mut data = VALIDATE_FIXTURE_DISCRIMINATOR.to_vec();

    let mut args_buf: Vec<u8> = Vec::new();
    snapshot
        .serialize(&mut args_buf)
        .map_err(|_| error!(FinalWhistleError::SerializationFailed))?;
    summary
        .serialize(&mut args_buf)
        .map_err(|_| error!(FinalWhistleError::SerializationFailed))?;
    sub_tree_proof
        .serialize(&mut args_buf)
        .map_err(|_| error!(FinalWhistleError::SerializationFailed))?;
    main_tree_proof
        .serialize(&mut args_buf)
        .map_err(|_| error!(FinalWhistleError::SerializationFailed))?;
    data.extend(args_buf);

    let accounts = vec![AccountMeta::new_readonly(ten_daily_fixtures_roots.key(), false)];

    let ix = Instruction {
        program_id: txoracle_program.key(),
        accounts,
        data,
    };

    // Both the target account and the TxLINE program itself must be present
    // in the account_infos slice for invoke() to resolve the CPI correctly.
    invoke(&ix, &[ten_daily_fixtures_roots.clone(), txoracle_program.clone()])?;

    Ok(())
}

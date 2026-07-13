use anchor_lang::prelude::*;

use crate::errors::FinalWhistleError;

/// Max outcomes any market on Final Whistle supports. Match Winner uses 3
/// (Home / Draw / Away), Total Goals O/U uses 2 (Over / Under).
pub const MAX_SIDES: usize = 3;

#[account]
pub struct Market {
    pub authority: Pubkey,       // who created the market (informational only — settlement is permissionless)
    pub fixture_id: u64,         // TxLINE fixture identifier
    pub market_type: MarketType,
    pub num_sides: u8,
    pub pools: [u64; MAX_SIDES], // lamports staked per side
    pub total_pool: u64,         // sum of all pools
    pub status: MarketStatus,
    pub outcome_side: i8,        // -1 until settled, then the winning side index
    pub vault_bump: u8,
    pub bump: u8,
    pub created_at: i64,
    pub settled_at: i64,
    pub fixture_verified: bool,
}

impl Market {
    pub const SIZE: usize = 8 // discriminator
        + 32   // authority
        + 8    // fixture_id
        + 1    // market_type
        + 1    // num_sides
        + (8 * MAX_SIDES) // pools
        + 8    // total_pool
        + 1    // status
        + 1    // outcome_side
        + 1    // vault_bump
        + 1    // bump
        + 8    // created_at
        + 8    // settled_at
        + 1;   // fixture_verified
}

#[account]
pub struct StakePosition {
    pub market: Pubkey,
    pub staker: Pubkey,
    pub side: u8,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl StakePosition {
    pub const SIZE: usize = 8 + 32 + 32 + 1 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketType {
    /// sides: 0 = Home, 1 = Draw, 2 = Away
    MatchWinner,
    /// sides: 0 = Over, 1 = Under
    TotalGoalsOver2_5,
}

pub fn num_sides_for(market_type: MarketType) -> u8 {
    match market_type {
        MarketType::MatchWinner => 3,
        MarketType::TotalGoalsOver2_5 => 2,
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketStatus {
    Open,
    Settled,
}

/// The stat TxLINE's validate_stat CPI confirms on-chain for a fixture.
///
/// PLACEHOLDER SHAPE — confirm field names/types against the real Txoracle
/// IDL before relying on this. See src/txoracle_cpi.rs for what else needs
/// wiring up alongside this struct.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct ConfirmedStat {
    pub fixture_id: u64,
    pub home_score: u8,
    pub away_score: u8,
    pub match_finished: bool,
}

/// Deterministic, on-chain resolution — no human judgment call, just the
/// confirmed stat mapped to a side index.
pub fn resolve_side(market_type: MarketType, stat: &ConfirmedStat) -> Result<u8> {
    match market_type {
        MarketType::MatchWinner => {
            if stat.home_score > stat.away_score {
                Ok(0)
            } else if stat.home_score == stat.away_score {
                Ok(1)
            } else {
                Ok(2)
            }
        }
        MarketType::TotalGoalsOver2_5 => {
            let total = stat.home_score as u16 + stat.away_score as u16;
            if total > 2 {
                Ok(0)
            } else {
                Ok(1)
            }
        }
    }
}

pub fn require_valid_side(side: u8, num_sides: u8) -> Result<()> {
    require!((side as usize) < MAX_SIDES && side < num_sides, FinalWhistleError::InvalidSide);
    Ok(())
}

// ============================================================
// TxLINE's real on-chain types, matching their published IDL
// exactly (idl/txoracle.json), used for the verify_fixture CPI
// into their validate_fixture instruction.
// ============================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxLineFixture {
    pub ts: i64,
    pub start_time: i64,
    pub competition: String,
    pub competition_id: i32,
    pub fixture_group_id: i32,
    pub participant1_id: i32,
    pub participant1: String,
    pub participant2_id: i32,
    pub participant2: String,
    pub fixture_id: i64,
    pub participant1_is_home: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxLineFixtureUpdateStats {
    pub update_count: u32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxLineFixtureBatchSummary {
    pub fixture_id: i64,
    pub competition_id: i32,
    pub competition: String,
    pub update_stats: TxLineFixtureUpdateStats,
    pub update_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct TxLineProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

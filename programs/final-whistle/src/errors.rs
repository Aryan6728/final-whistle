use anchor_lang::prelude::*;

#[error_code]
pub enum FinalWhistleError {
    #[msg("This market is not open for staking.")]
    MarketNotOpen,
    #[msg("Stake amount must be greater than zero.")]
    ZeroStake,
    #[msg("This side does not exist on this market.")]
    InvalidSide,
    #[msg("This market has not been settled yet.")]
    MarketNotSettled,
    #[msg("This market has already been settled.")]
    AlreadySettled,
    #[msg("This position has already been claimed.")]
    AlreadyClaimed,
    #[msg("This position was on the losing side.")]
    LosingPosition,
    #[msg("The winning pool is empty — nothing to distribute.")]
    EmptyPool,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("The TxLINE proof does not match this market's fixture.")]
    FixtureMismatch,
    #[msg("The TxLINE proof is for a match that has not finished.")]
    MatchNotFinished,
    #[msg("Failed to serialize the TxLINE proof for the CPI call.")]
    SerializationFailed,
}

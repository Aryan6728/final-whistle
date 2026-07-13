use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub mod errors;
pub mod state;
pub mod txoracle_cpi;

use errors::FinalWhistleError;
use state::*;
use txoracle_cpi::{validate_stat_cpi, TxLineProof};

declare_id!("GmpCe863ZJD1WrbPAg1Di3Bgfg7CGaR1NGGyBJejMWji");

/// TxLINE's on-chain Txoracle program. Devnet ID per their published
/// Quickstart docs — swap for the mainnet ID before a mainnet deploy.
pub mod txoracle_program_id {
    use anchor_lang::prelude::*;
    declare_id!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
}

#[program]
pub mod final_whistle {
    use super::*;

    /// Creates a market for a fixture. Anyone can call this — it just opens
    /// the market, it doesn't grant any special settlement power.
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        fixture_id: u64,
        market_type: MarketType,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.authority = ctx.accounts.authority.key();
        market.fixture_id = fixture_id;
        market.market_type = market_type;
        market.num_sides = num_sides_for(market_type);
        market.pools = [0u64; MAX_SIDES];
        market.total_pool = 0;
        market.status = MarketStatus::Open;
        market.outcome_side = -1;
        market.vault_bump = ctx.bumps.vault;
        market.bump = ctx.bumps.market;
        market.created_at = Clock::get()?.unix_timestamp;
        market.settled_at = 0;
        Ok(())
    }

    /// Locks SOL into the market's PDA vault on a chosen side. Multiple
    /// stakes from the same wallet on the same market accumulate into one
    /// position.
    pub fn stake(ctx: Context<Stake>, side: u8, amount: u64) -> Result<()> {
        require!(ctx.accounts.market.status == MarketStatus::Open, FinalWhistleError::MarketNotOpen);
        require!(amount > 0, FinalWhistleError::ZeroStake);
        require_valid_side(side, ctx.accounts.market.num_sides)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.staker.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let position = &mut ctx.accounts.position;
        position.market = ctx.accounts.market.key();
        position.staker = ctx.accounts.staker.key();
        position.side = side;
        position.amount = position.amount.checked_add(amount).ok_or(FinalWhistleError::Overflow)?;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        let market = &mut ctx.accounts.market;
        market.total_pool = market.total_pool.checked_add(amount).ok_or(FinalWhistleError::Overflow)?;
        market.pools[side as usize] = market.pools[side as usize]
            .checked_add(amount)
            .ok_or(FinalWhistleError::Overflow)?;

        Ok(())
    }

    /// Permissionless: anyone — a keeper bot, a judge testing the build, you —
    /// can call this once TxLINE has anchored the fixture's final signed
    /// stat. This is the whole point of Final Whistle: settlement is a CPI
    /// into TxLINE's own on-chain verification, not a human decision or a
    /// dispute vote.
    pub fn settle_market(ctx: Context<SettleMarket>, proof: TxLineProof) -> Result<()> {
        require!(ctx.accounts.market.status == MarketStatus::Open, FinalWhistleError::AlreadySettled);
        require!(proof.fixture_id == ctx.accounts.market.fixture_id, FinalWhistleError::FixtureMismatch);

        let confirmed = validate_stat_cpi(
            &ctx.accounts.txoracle_program,
            &ctx.accounts.txline_state,
            proof,
        )?;
        require!(confirmed.match_finished, FinalWhistleError::MatchNotFinished);

        let market_type = ctx.accounts.market.market_type;
        let winning_side = resolve_side(market_type, &confirmed)?;

        let market = &mut ctx.accounts.market;
        market.status = MarketStatus::Settled;
        market.outcome_side = winning_side as i8;
        market.settled_at = Clock::get()?.unix_timestamp;

        emit!(MarketSettled {
            market: market.key(),
            fixture_id: market.fixture_id,
            winning_side,
            home_score: confirmed.home_score,
            away_score: confirmed.away_score,
            settled_at: market.settled_at,
        });

        Ok(())
    }

    /// Winning side withdraws its proportional share of the pool. Losing
    /// positions simply have nothing to claim — there's no separate
    /// "refund the losers" step because their stake correctly funded the
    /// winners' payout.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        require!(ctx.accounts.market.status == MarketStatus::Settled, FinalWhistleError::MarketNotSettled);
        require!(!ctx.accounts.position.claimed, FinalWhistleError::AlreadyClaimed);

        let outcome_side = ctx.accounts.market.outcome_side;
        let position_side = ctx.accounts.position.side;
        require!(
            outcome_side >= 0 && position_side as i8 == outcome_side,
            FinalWhistleError::LosingPosition
        );

        let winning_pool = ctx.accounts.market.pools[position_side as usize];
        require!(winning_pool > 0, FinalWhistleError::EmptyPool);

        let position_amount = ctx.accounts.position.amount;
        let total_pool = ctx.accounts.market.total_pool;

        let payout: u64 = (position_amount as u128)
            .checked_mul(total_pool as u128)
            .ok_or(FinalWhistleError::Overflow)?
            .checked_div(winning_pool as u128)
            .ok_or(FinalWhistleError::Overflow)?
            .try_into()
            .map_err(|_| FinalWhistleError::Overflow)?;

        let market_key = ctx.accounts.market.key();
        let vault_bump = ctx.accounts.market.vault_bump;
        let vault_seeds: &[&[u8]] = &[b"vault", market_key.as_ref(), &[vault_bump]];
        let signer_seeds: &[&[&[u8]]] = &[vault_seeds];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.staker.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;

        ctx.accounts.position.claimed = true;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(fixture_id: u64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Market::SIZE,
        seeds = [b"market", fixture_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA vault — holds SOL directly, no account data, validated by seeds.
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    /// CHECK: PDA vault validated by seeds against the market it belongs to.
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = staker,
        space = StakePosition::SIZE,
        seeds = [b"position", market.key().as_ref(), staker.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, StakePosition>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    /// Permissionless — anyone can be the caller, they just pay the tx fee.
    /// No special authority is checked here on purpose.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, Market>,

    /// CHECK: TxLINE's on-chain Txoracle program — address-checked against
    /// the known devnet/mainnet constant before being invoked.
    #[account(address = txoracle_program_id::ID)]
    pub txoracle_program: AccountInfo<'info>,

    /// CHECK: TODO — replace with TxLINE's actual fixture/state account for
    /// this proof once confirmed against their IDL (see txoracle_cpi.rs).
    pub txline_state: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    pub market: Account<'info, Market>,

    /// CHECK: PDA vault validated by seeds against the market it belongs to.
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"position", market.key().as_ref(), staker.key().as_ref()],
        bump = position.bump,
        has_one = staker,
    )]
    pub position: Account<'info, StakePosition>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct MarketSettled {
    pub market: Pubkey,
    pub fixture_id: u64,
    pub winning_side: u8,
    pub home_score: u8,
    pub away_score: u8,
    pub settled_at: i64,
}

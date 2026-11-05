use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{
    constants::{CONFIG_SEED, MAX_DISPUTE_DEPOSIT_BPS, MAX_FEE_BPS},
    errors::VaultixError,
    events::ConfigUpdated,
    state::Config,
};

/// Protocol parameters shared by `initialize_config` and `update_config`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigArgs {
    pub arbiter: Pubkey,
    pub fee_bps: u16,
    pub dispute_deposit_bps: u16,
    pub ship_deadline_secs: i64,
    pub claim_window_secs: i64,
    pub max_order_amount: u64,
}

impl ConfigArgs {
    pub fn validate(&self) -> Result<()> {
        require!(self.fee_bps <= MAX_FEE_BPS, VaultixError::FeeTooHigh);
        require!(
            self.dispute_deposit_bps <= MAX_DISPUTE_DEPOSIT_BPS,
            VaultixError::DepositTooHigh
        );
        require!(
            self.ship_deadline_secs > 0 && self.claim_window_secs > 0,
            VaultixError::InvalidDeadline
        );
        Ok(())
    }

    /// Writes the mutable parameters into `config`.
    pub fn apply(&self, config: &mut Config, treasury: Pubkey) {
        config.arbiter = self.arbiter;
        config.treasury = treasury;
        config.fee_bps = self.fee_bps;
        config.dispute_deposit_bps = self.dispute_deposit_bps;
        config.ship_deadline_secs = self.ship_deadline_secs;
        config.claim_window_secs = self.claim_window_secs;
        config.max_order_amount = self.max_order_amount;
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,

    pub allowed_mint: InterfaceAccount<'info, Mint>,

    #[account(constraint = treasury.mint == allowed_mint.key() @ VaultixError::InvalidMint)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
    args.validate()?;

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.allowed_mint = ctx.accounts.allowed_mint.key();
    config.bump = ctx.bumps.config;
    args.apply(config, ctx.accounts.treasury.key());

    emit!(ConfigUpdated {
        config: config.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

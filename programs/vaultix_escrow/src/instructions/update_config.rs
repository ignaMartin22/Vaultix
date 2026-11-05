use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    constants::CONFIG_SEED, errors::VaultixError, events::ConfigUpdated,
    instructions::initialize_config::ConfigArgs, state::Config,
};

/// Updates the protocol parameters. `admin` and `allowed_mint` stay fixed;
/// existing orders keep the snapshot they were created with.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ VaultixError::NotAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(constraint = treasury.mint == config.allowed_mint @ VaultixError::InvalidMint)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
}

pub fn handle_update_config(ctx: Context<UpdateConfig>, args: ConfigArgs) -> Result<()> {
    args.validate()?;

    let config = &mut ctx.accounts.config;
    args.apply(config, ctx.accounts.treasury.key());

    emit!(ConfigUpdated {
        config: config.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

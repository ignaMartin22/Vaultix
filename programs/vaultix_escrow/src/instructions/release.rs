use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{CONFIG_SEED, ORDER_SEED},
    errors::VaultixError,
    instructions::shared::payout::settle_release,
    state::{Config, Order, OrderStatus},
};

/// Permissionless: once the claim window closes without a dispute, anyone
/// (the crank) can pay the seller: `Shipped → Released`.
#[derive(Accounts)]
pub struct Release<'info> {
    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
    )]
    pub order: Account<'info, Order>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = order.mint @ VaultixError::InvalidMint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = order,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = seller_token.mint == order.mint @ VaultixError::InvalidMint,
        constraint = seller_token.owner == order.seller @ VaultixError::NotSeller,
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, address = config.treasury)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.order.status == OrderStatus::Shipped,
        VaultixError::InvalidStatus
    );
    let claim_deadline = a
        .order
        .shipped_at
        .checked_add(a.order.claim_window_secs)
        .ok_or(VaultixError::MathOverflow)?;
    require!(
        Clock::get()?.unix_timestamp > claim_deadline,
        VaultixError::DeadlineNotReached
    );
    settle_release(
        &a.token_program,
        &a.mint,
        &a.vault,
        &mut a.order,
        a.seller_token.to_account_info(),
        a.treasury.to_account_info(),
        true,
    )
}

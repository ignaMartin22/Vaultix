use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{CONFIG_SEED, ORDER_SEED},
    errors::VaultixError,
    instructions::shared::payout::settle_release,
    state::{Config, Order, OrderStatus},
};

/// The buyer confirms they got the product: `Shipped → Released`.
#[derive(Accounts)]
pub struct ConfirmReceipt<'info> {
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        constraint = order.buyer == Some(buyer.key()) @ VaultixError::NotBuyer,
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

pub fn handle_confirm_receipt(ctx: Context<ConfirmReceipt>) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.order.status == OrderStatus::Shipped,
        VaultixError::InvalidStatus
    );
    settle_release(
        &a.token_program,
        &a.mint,
        &a.vault,
        &mut a.order,
        a.seller_token.to_account_info(),
        a.treasury.to_account_info(),
        false,
    )
}

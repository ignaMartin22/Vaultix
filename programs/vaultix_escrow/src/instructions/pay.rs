use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::ORDER_SEED,
    errors::VaultixError,
    events::OrderPaid,
    state::{Order, OrderStatus},
};

/// The first account that pays becomes the order's buyer.
#[derive(Accounts)]
pub struct Pay<'info> {
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
    )]
    pub order: Account<'info, Order>,

    #[account(address = order.mint @ VaultixError::InvalidMint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = buyer_token.mint == order.mint @ VaultixError::InvalidMint,
        constraint = buyer_token.owner == buyer.key() @ VaultixError::NotBuyer,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = order,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_pay(ctx: Context<Pay>) -> Result<()> {
    let buyer = ctx.accounts.buyer.key();
    let order = &mut ctx.accounts.order;
    require!(
        order.status == OrderStatus::Created,
        VaultixError::InvalidStatus
    );
    require_keys_neq!(buyer, order.seller, VaultixError::SellerCannotBuy);

    let now = Clock::get()?.unix_timestamp;
    order.status = OrderStatus::Paid;
    order.buyer = Some(buyer);
    order.paid_at = now;
    let amount = order.amount;

    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.buyer_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(OrderPaid {
        order: ctx.accounts.order.key(),
        buyer,
        amount,
        timestamp: now,
    });
    Ok(())
}

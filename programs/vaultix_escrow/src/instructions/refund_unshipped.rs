use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::ORDER_SEED,
    errors::VaultixError,
    events::OrderRefunded,
    state::{Order, OrderStatus},
};

/// Permissionless: once the ship deadline passes, anyone (the crank) can
/// return the full amount to the buyer, with no fee.
#[derive(Accounts)]
pub struct RefundUnshipped<'info> {
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
        associated_token::mint = mint,
        associated_token::authority = order,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token.mint == order.mint @ VaultixError::InvalidMint,
        constraint = Some(buyer_token.owner) == order.buyer @ VaultixError::NotBuyer,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_refund_unshipped(ctx: Context<RefundUnshipped>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;
    require!(
        order.status == OrderStatus::Paid,
        VaultixError::InvalidStatus
    );
    let deadline = order
        .paid_at
        .checked_add(order.ship_deadline_secs)
        .ok_or(VaultixError::MathOverflow)?;
    require!(now > deadline, VaultixError::DeadlineNotReached);

    order.status = OrderStatus::Refunded;
    let amount = order.amount;

    let order_id = order.order_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        ORDER_SEED,
        order.seller.as_ref(),
        &order_id,
        std::slice::from_ref(&order.bump),
    ];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.buyer_token.to_account_info(),
                authority: order.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    emit!(OrderRefunded {
        order: order.key(),
        buyer_amount: amount,
        timestamp: now,
    });
    Ok(())
}

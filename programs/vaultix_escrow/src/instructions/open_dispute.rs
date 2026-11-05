use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::ORDER_SEED,
    errors::VaultixError,
    events::DisputeOpened,
    instructions::shared::payout::bps_of,
    state::{Order, OrderStatus},
};

/// The buyer opens a claim inside the claim window, locking a deposit of
/// `amount × dispute_deposit_bps / 10 000` in the vault: `Shipped → Disputed`.
#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        constraint = order.buyer == Some(buyer.key()) @ VaultixError::NotBuyer,
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
        constraint = buyer_token.owner == buyer.key() @ VaultixError::NotBuyer,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;
    require!(
        order.status == OrderStatus::Shipped,
        VaultixError::InvalidStatus
    );
    let claim_deadline = order
        .shipped_at
        .checked_add(order.claim_window_secs)
        .ok_or(VaultixError::MathOverflow)?;
    require!(now <= claim_deadline, VaultixError::ClaimWindowClosed);

    let deposit = bps_of(order.amount, order.dispute_deposit_bps)?;
    order.status = OrderStatus::Disputed;
    order.dispute_deposit = deposit;

    if deposit > 0 {
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
            deposit,
            ctx.accounts.mint.decimals,
        )?;
    }

    emit!(DisputeOpened {
        order: ctx.accounts.order.key(),
        deposit,
        timestamp: now,
    });
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    constants::{CONFIG_SEED, ORDER_SEED},
    errors::VaultixError,
    events::DisputeResolved,
    instructions::shared::payout::{dispute_split, transfer_from_vault},
    state::{Config, Order, OrderStatus},
};

/// The arbiter splits the vault (02 §1.5): `Disputed → Resolved`.
#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(address = config.arbiter @ VaultixError::NotArbiter)]
    pub arbiter: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

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

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>, buyer_share_bps: u16) -> Result<()> {
    let a = ctx.accounts;
    require!(
        a.order.status == OrderStatus::Disputed,
        VaultixError::InvalidStatus
    );
    let split = dispute_split(a.order.amount, a.order.fee_bps, buyer_share_bps)?;
    let deposit = a.order.dispute_deposit;
    let (buyer_deposit, seller_deposit) = if split.deposit_to_buyer {
        (deposit, 0)
    } else {
        (0, deposit)
    };
    let buyer_amount = split
        .buyer_part
        .checked_add(buyer_deposit)
        .ok_or(VaultixError::MathOverflow)?;
    let seller_amount = split
        .seller_net
        .checked_add(seller_deposit)
        .ok_or(VaultixError::MathOverflow)?;

    a.order.status = OrderStatus::Resolved;

    let (program, mint, vault, order) = (&a.token_program, &a.mint, &a.vault, &a.order);
    transfer_from_vault(
        program,
        mint,
        vault,
        order,
        a.buyer_token.to_account_info(),
        buyer_amount,
    )?;
    transfer_from_vault(
        program,
        mint,
        vault,
        order,
        a.seller_token.to_account_info(),
        seller_amount,
    )?;
    transfer_from_vault(
        program,
        mint,
        vault,
        order,
        a.treasury.to_account_info(),
        split.fee,
    )?;

    emit!(DisputeResolved {
        order: order.key(),
        buyer_share_bps,
        buyer_amount,
        seller_amount,
        fee: split.fee,
        deposit_to_buyer: split.deposit_to_buyer,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

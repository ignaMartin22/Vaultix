use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface};

use crate::{
    constants::ORDER_SEED,
    errors::VaultixError,
    events::OrderClosed,
    state::{Order, OrderStatus},
};

/// Closes the vault and the order, returning both rents to `rent_payer`.
/// Allowed in `Created` (seller only) and in any final status (anyone).
#[derive(Accounts)]
pub struct CloseOrder<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        has_one = rent_payer,
        close = rent_payer,
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

    #[account(mut)]
    pub rent_payer: SystemAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_close_order(ctx: Context<CloseOrder>) -> Result<()> {
    let order = &ctx.accounts.order;
    match order.status {
        OrderStatus::Created => require_keys_eq!(
            ctx.accounts.caller.key(),
            order.seller,
            VaultixError::NotSeller
        ),
        OrderStatus::Released | OrderStatus::Refunded | OrderStatus::Resolved => {}
        _ => return err!(VaultixError::InvalidStatus),
    }
    require!(ctx.accounts.vault.amount == 0, VaultixError::VaultNotEmpty);

    let order_id = order.order_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        ORDER_SEED,
        order.seller.as_ref(),
        &order_id,
        std::slice::from_ref(&order.bump),
    ];
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.rent_payer.to_account_info(),
            authority: order.to_account_info(),
        },
        &[seeds],
    ))?;

    emit!(OrderClosed {
        order: order.key(),
        rent_payer: order.rent_payer,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

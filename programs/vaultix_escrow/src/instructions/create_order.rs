use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::{CONFIG_SEED, ORDER_SEED},
    errors::VaultixError,
    events::OrderCreated,
    state::{Config, Order, OrderStatus},
};

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct CreateOrder<'info> {
    pub seller: Signer<'info>,

    /// Fee payer: pays rent for the order and its vault and gets it back on close.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(address = config.allowed_mint @ VaultixError::InvalidMint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + Order::INIT_SPACE,
        seeds = [ORDER_SEED, seller.key().as_ref(), &order_id.to_le_bytes()],
        bump,
    )]
    pub order: Account<'info, Order>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = order,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_order(
    ctx: Context<CreateOrder>,
    order_id: u64,
    amount: u64,
    listing_hash: [u8; 32],
) -> Result<()> {
    let config = &ctx.accounts.config;
    require!(amount > 0, VaultixError::InvalidAmount);
    require!(
        amount <= config.max_order_amount,
        VaultixError::AmountExceedsMax
    );

    let now = Clock::get()?.unix_timestamp;
    let order = &mut ctx.accounts.order;
    order.set_inner(Order {
        status: OrderStatus::Created,
        seller: ctx.accounts.seller.key(),
        buyer: None,
        order_id,
        mint: ctx.accounts.mint.key(),
        amount,
        // Snapshot: later config changes don't affect this order.
        fee_bps: config.fee_bps,
        dispute_deposit_bps: config.dispute_deposit_bps,
        ship_deadline_secs: config.ship_deadline_secs,
        claim_window_secs: config.claim_window_secs,
        listing_hash,
        tracking_hash: None,
        dispute_deposit: 0,
        created_at: now,
        paid_at: 0,
        shipped_at: 0,
        rent_payer: ctx.accounts.payer.key(),
        bump: ctx.bumps.order,
    });

    emit!(OrderCreated {
        order: order.key(),
        seller: order.seller,
        order_id,
        amount,
        listing_hash,
        timestamp: now,
    });
    Ok(())
}

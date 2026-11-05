use anchor_lang::prelude::*;

use crate::{
    constants::ORDER_SEED,
    errors::VaultixError,
    events::OrderShipped,
    state::{Order, OrderStatus},
};

/// Starts the claim window. The tracking hash is optional in the MVP.
#[derive(Accounts)]
pub struct MarkShipped<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [ORDER_SEED, order.seller.as_ref(), &order.order_id.to_le_bytes()],
        bump = order.bump,
        has_one = seller @ VaultixError::NotSeller,
    )]
    pub order: Account<'info, Order>,
}

pub fn handle_mark_shipped(
    ctx: Context<MarkShipped>,
    tracking_hash: Option<[u8; 32]>,
) -> Result<()> {
    let order = &mut ctx.accounts.order;
    require!(
        order.status == OrderStatus::Paid,
        VaultixError::InvalidStatus
    );

    let now = Clock::get()?.unix_timestamp;
    order.status = OrderStatus::Shipped;
    order.shipped_at = now;
    order.tracking_hash = tracking_hash;

    emit!(OrderShipped {
        order: order.key(),
        tracking_hash,
        timestamp: now,
    });
    Ok(())
}

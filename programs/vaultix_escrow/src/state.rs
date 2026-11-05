use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub arbiter: Pubkey,
    /// Token account (ATA of `allowed_mint`) that collects fees.
    pub treasury: Pubkey,
    pub allowed_mint: Pubkey,
    pub fee_bps: u16,
    pub dispute_deposit_bps: u16,
    pub ship_deadline_secs: i64,
    pub claim_window_secs: i64,
    pub max_order_amount: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum OrderStatus {
    Created,
    Paid,
    Shipped,
    Disputed,
    Released,
    Refunded,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct Order {
    /// Must stay the first field (offset 8) so off-chain filters can `memcmp` on it.
    pub status: OrderStatus,
    pub seller: Pubkey,
    pub buyer: Option<Pubkey>,
    pub order_id: u64,
    pub mint: Pubkey,
    pub amount: u64,
    pub fee_bps: u16,
    pub dispute_deposit_bps: u16,
    pub ship_deadline_secs: i64,
    pub claim_window_secs: i64,
    pub listing_hash: [u8; 32],
    pub tracking_hash: Option<[u8; 32]>,
    pub dispute_deposit: u64,
    pub created_at: i64,
    pub paid_at: i64,
    pub shipped_at: i64,
    pub rent_payer: Pubkey,
    pub bump: u8,
}

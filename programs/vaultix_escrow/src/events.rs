use anchor_lang::prelude::*;

#[event]
pub struct OrderCreated {
    pub order: Pubkey,
    pub seller: Pubkey,
    pub order_id: u64,
    pub amount: u64,
    pub listing_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct OrderPaid {
    pub order: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct OrderShipped {
    pub order: Pubkey,
    pub tracking_hash: Option<[u8; 32]>,
    pub timestamp: i64,
}

#[event]
pub struct OrderReleased {
    pub order: Pubkey,
    pub seller_amount: u64,
    pub fee: u64,
    pub by_timeout: bool,
    pub timestamp: i64,
}

#[event]
pub struct OrderRefunded {
    pub order: Pubkey,
    pub buyer_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct DisputeOpened {
    pub order: Pubkey,
    pub deposit: u64,
    pub timestamp: i64,
}

#[event]
pub struct DisputeResolved {
    pub order: Pubkey,
    pub buyer_share_bps: u16,
    pub buyer_amount: u64,
    pub seller_amount: u64,
    pub fee: u64,
    pub deposit_to_buyer: bool,
    pub timestamp: i64,
}

#[event]
pub struct OrderClosed {
    pub order: Pubkey,
    pub rent_payer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdated {
    pub config: Pubkey,
    pub timestamp: i64,
}

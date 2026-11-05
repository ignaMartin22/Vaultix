use anchor_lang::prelude::*;

#[error_code]
pub enum VaultixError {
    #[msg("Order is not in the required status for this instruction")]
    InvalidStatus,
    #[msg("Signer is not the seller of this order")]
    NotSeller,
    #[msg("Signer is not the buyer of this order")]
    NotBuyer,
    #[msg("Signer is not the configured arbiter")]
    NotArbiter,
    #[msg("Signer is not the configured admin")]
    NotAdmin,
    #[msg("Seller cannot pay their own order")]
    SellerCannotBuy,
    #[msg("Token mint does not match the allowed mint")]
    InvalidMint,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Amount exceeds the maximum order amount")]
    AmountExceedsMax,
    #[msg("Fee basis points exceed the maximum allowed")]
    FeeTooHigh,
    #[msg("Dispute deposit basis points exceed the maximum allowed")]
    DepositTooHigh,
    #[msg("Deadlines must be greater than zero")]
    InvalidDeadline,
    #[msg("Share basis points must be at most 10000")]
    InvalidShareBps,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Claim window is closed")]
    ClaimWindowClosed,
    #[msg("Vault still holds tokens")]
    VaultNotEmpty,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

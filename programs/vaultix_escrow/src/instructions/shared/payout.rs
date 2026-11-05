use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::{BPS_DENOMINATOR, ORDER_SEED},
    errors::VaultixError,
    events::OrderReleased,
    state::{Order, OrderStatus},
};

/// `amount * bps / 10_000`, rounded down.
pub fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    let value = u128::from(amount)
        .checked_mul(u128::from(bps))
        .and_then(|v| v.checked_div(u128::from(BPS_DENOMINATOR)))
        .ok_or(VaultixError::MathOverflow)?;
    u64::try_from(value).map_err(|_| error!(VaultixError::MathOverflow))
}

/// Release split (02 §1.5): returns `(seller_net, fee)`.
pub fn release_split(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = bps_of(amount, fee_bps)?;
    let seller_net = amount.checked_sub(fee).ok_or(VaultixError::MathOverflow)?;
    Ok((seller_net, fee))
}

/// Dispute resolution amounts (02 §1.5), deposit excluded.
#[derive(Debug, PartialEq, Eq)]
pub struct DisputeSplit {
    pub buyer_part: u64,
    pub seller_net: u64,
    pub fee: u64,
    /// The dispute deposit goes back to the buyer when they get ≥ 50%.
    pub deposit_to_buyer: bool,
}

pub fn dispute_split(amount: u64, fee_bps: u16, buyer_share_bps: u16) -> Result<DisputeSplit> {
    require!(
        u64::from(buyer_share_bps) <= BPS_DENOMINATOR,
        VaultixError::InvalidShareBps
    );
    let buyer_part = bps_of(amount, buyer_share_bps)?;
    let seller_gross = amount
        .checked_sub(buyer_part)
        .ok_or(VaultixError::MathOverflow)?;
    let (seller_net, fee) = release_split(seller_gross, fee_bps)?;
    Ok(DisputeSplit {
        buyer_part,
        seller_net,
        fee,
        deposit_to_buyer: buyer_share_bps >= 5_000,
    })
}

/// Transfers `amount` out of the order's vault, signed by the order PDA.
/// Zero-amount transfers are skipped.
pub fn transfer_from_vault<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    order: &Account<'info, Order>,
    to: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let order_id = order.order_id.to_le_bytes();
    let seeds: &[&[u8]] = &[
        ORDER_SEED,
        order.seller.as_ref(),
        &order_id,
        std::slice::from_ref(&order.bump),
    ];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to,
                authority: order.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

/// `Shipped → Released`: pays the seller `amount − fee` and the treasury `fee`
/// using the order's fee snapshot. Shared by `confirm_receipt` and `release`.
pub fn settle_release<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    order: &mut Account<'info, Order>,
    seller_token: AccountInfo<'info>,
    treasury: AccountInfo<'info>,
    by_timeout: bool,
) -> Result<()> {
    order.status = OrderStatus::Released;
    let (seller_net, fee) = release_split(order.amount, order.fee_bps)?;

    transfer_from_vault(token_program, mint, vault, order, seller_token, seller_net)?;
    transfer_from_vault(token_program, mint, vault, order, treasury, fee)?;

    emit!(OrderReleased {
        order: order.key(),
        seller_amount: seller_net,
        fee,
        by_timeout,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_split_rounds_fee_down() {
        assert_eq!(
            release_split(100_000_000, 150).unwrap(),
            (98_500_000, 1_500_000)
        );
        // 1.5% of 1 unit rounds to 0: the seller keeps the remainder.
        assert_eq!(release_split(1, 150).unwrap(), (1, 0));
        assert_eq!(release_split(66, 150).unwrap(), (66, 0));
        assert_eq!(release_split(67, 150).unwrap(), (66, 1));
        assert_eq!(release_split(1_000, 0).unwrap(), (1_000, 0));
    }

    #[test]
    fn dispute_split_matches_spec() {
        let split = |share| dispute_split(100_000_000, 150, share).unwrap();
        let all_seller = split(0);
        assert_eq!(
            (all_seller.buyer_part, all_seller.seller_net, all_seller.fee),
            (0, 98_500_000, 1_500_000)
        );
        assert!(!all_seller.deposit_to_buyer);

        // 33.33%: buyer 33_330_000; seller gross 66_670_000, fee 1_000_050.
        let third = split(3_333);
        assert_eq!(
            (third.buyer_part, third.seller_net, third.fee),
            (33_330_000, 65_669_950, 1_000_050)
        );
        assert!(!third.deposit_to_buyer);

        let half = split(5_000);
        assert_eq!(
            (half.buyer_part, half.seller_net, half.fee),
            (50_000_000, 49_250_000, 750_000)
        );
        assert!(half.deposit_to_buyer);

        let all_buyer = split(10_000);
        assert_eq!(
            (all_buyer.buyer_part, all_buyer.seller_net, all_buyer.fee),
            (100_000_000, 0, 0)
        );
        assert!(all_buyer.deposit_to_buyer);
    }

    #[test]
    fn dispute_split_always_adds_up_to_amount() {
        for amount in [1, 7, 67, 999_999, 500_000_000] {
            for share in [0, 1, 3_333, 4_999, 5_000, 9_999, 10_000] {
                let s = dispute_split(amount, 150, share).unwrap();
                assert_eq!(s.buyer_part + s.seller_net + s.fee, amount);
            }
        }
    }

    #[test]
    fn dispute_split_rejects_share_above_100_percent() {
        assert!(dispute_split(100, 150, 10_001).is_err());
    }

    #[test]
    fn bps_of_does_not_overflow_on_max_amount() {
        assert_eq!(bps_of(u64::MAX, 10_000).unwrap(), u64::MAX);
        assert_eq!(
            bps_of(u64::MAX, 500).unwrap(),
            u64::MAX / 10_000 * 500 + (u64::MAX % 10_000) * 500 / 10_000
        );
    }
}

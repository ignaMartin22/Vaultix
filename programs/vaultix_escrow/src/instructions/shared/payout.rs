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
    fn bps_of_does_not_overflow_on_max_amount() {
        assert_eq!(bps_of(u64::MAX, 10_000).unwrap(), u64::MAX);
        assert_eq!(
            bps_of(u64::MAX, 500).unwrap(),
            u64::MAX / 10_000 * 500 + (u64::MAX % 10_000) * 500 / 10_000
        );
    }
}

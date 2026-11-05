mod common;

use anchor_lang::prelude::Pubkey;
use common::{
    assert_program_error, ata, confirm_receipt_ix, default_config_args, mark_shipped_ix, pay_ix,
    release_ix, update_config_ix, Protocol, TestEnv, TxResult, ONE_USDC, START_TS,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;
/// 1.5% of AMOUNT with the default `fee_bps = 150`.
const FEE: u64 = 1_500_000;
/// Default `claim_window_secs` (10 days).
const CLAIM_WINDOW: i64 = 864_000;

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    seller_token: Pubkey,
    order: Pubkey,
    buyer: Keypair,
}

/// An order of `amount`, created and paid but not shipped.
fn paid_with(amount: u64) -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let seller_token = env.create_ata(&protocol.mint, &seller.pubkey());
    let order = env.create_order(&protocol, &seller, 1, amount);
    let (buyer, buyer_token) = env.funded_user(&protocol, amount);
    let ix = pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
    env.send(&[ix], &[&buyer]).unwrap();
    Setup {
        env,
        protocol,
        seller,
        seller_token,
        order,
        buyer,
    }
}

/// An order of `amount`, shipped at `START_TS`.
fn shipped_with(amount: u64) -> Setup {
    let mut s = paid_with(amount);
    let ix = mark_shipped_ix(s.order, s.seller.pubkey(), None);
    let seller = s.seller.insecure_clone();
    s.env.send(&[ix], &[&seller]).unwrap();
    s
}

fn shipped() -> Setup {
    shipped_with(AMOUNT)
}

// TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
#[allow(clippy::result_large_err)]
fn confirm(s: &mut Setup, signer: &Keypair) -> TxResult {
    let ix = confirm_receipt_ix(
        s.order,
        s.protocol.mint,
        signer.pubkey(),
        s.seller_token,
        s.protocol.treasury,
    );
    s.env.send(&[ix], &[signer])
}

#[allow(clippy::result_large_err)]
fn release(s: &mut Setup) -> TxResult {
    let ix = release_ix(
        s.order,
        s.protocol.mint,
        s.seller_token,
        s.protocol.treasury,
    );
    // Permissionless: only the fee payer signs.
    s.env.send(&[ix], &[])
}

fn vault(s: &Setup) -> Pubkey {
    ata(&s.order, &s.protocol.mint)
}

fn assert_released(s: &Setup, seller_amount: u64, fee: u64) {
    assert_eq!(s.env.read_order(&s.order).status, OrderStatus::Released);
    assert_eq!(s.env.token_balance(&s.seller_token), seller_amount);
    assert_eq!(s.env.token_balance(&s.protocol.treasury), fee);
    assert_eq!(s.env.token_balance(&vault(s)), 0);
}

// ---------- confirm_receipt ----------

#[test]
fn buyer_confirms_and_seller_gets_amount_minus_fee() {
    let mut s = shipped();
    let buyer = s.buyer.insecure_clone();
    confirm(&mut s, &buyer).unwrap();
    assert_released(&s, AMOUNT - FEE, FEE);
}

#[test]
fn buyer_can_confirm_after_claim_window() {
    let mut s = shipped();
    s.env.advance_time(CLAIM_WINDOW + 1);
    let buyer = s.buyer.insecure_clone();
    confirm(&mut s, &buyer).unwrap();
    assert_released(&s, AMOUNT - FEE, FEE);
}

#[test]
fn only_buyer_can_confirm_receipt() {
    let mut s = shipped();
    let seller = s.seller.insecure_clone();
    let res = confirm(&mut s, &seller);
    assert_program_error(&res, VaultixError::NotBuyer);

    let intruder = s.env.funded_keypair();
    let res = confirm(&mut s, &intruder);
    assert_program_error(&res, VaultixError::NotBuyer);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

#[test]
fn confirm_receipt_requires_buyer_signature() {
    let mut s = shipped();
    let mut ix = confirm_receipt_ix(
        s.order,
        s.protocol.mint,
        s.buyer.pubkey(),
        s.seller_token,
        s.protocol.treasury,
    );
    ix.accounts[0].is_signer = false;
    assert!(s.env.send(&[ix], &[]).is_err());
}

#[test]
fn confirm_receipt_only_in_shipped() {
    let mut s = paid_with(AMOUNT);
    let buyer = s.buyer.insecure_clone();
    let res = confirm(&mut s, &buyer);
    assert_program_error(&res, VaultixError::InvalidStatus);

    let mut s = shipped();
    confirm_by_buyer(&mut s).unwrap();
    let res = confirm_by_buyer(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

fn buyer_of(s: &Setup) -> Keypair {
    s.buyer.insecure_clone()
}

#[allow(clippy::result_large_err)]
fn confirm_by_buyer(s: &mut Setup) -> TxResult {
    let buyer = buyer_of(s);
    confirm(s, &buyer)
}

// ---------- release ----------

#[test]
fn release_fails_before_claim_window_closes() {
    let mut s = shipped();
    let res = release(&mut s);
    assert_program_error(&res, VaultixError::DeadlineNotReached);

    // Exactly at the deadline is still inside the window.
    s.env.set_time(START_TS + CLAIM_WINDOW);
    let res = release(&mut s);
    assert_program_error(&res, VaultixError::DeadlineNotReached);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

#[test]
fn release_after_claim_window_pays_seller() {
    let mut s = shipped();
    s.env.set_time(START_TS + CLAIM_WINDOW + 1);
    release(&mut s).unwrap();
    assert_released(&s, AMOUNT - FEE, FEE);
}

#[test]
fn release_only_in_shipped() {
    // Paid but never shipped: release must not pay the seller.
    let mut s = paid_with(AMOUNT);
    s.env.advance_time(CLAIM_WINDOW * 2);
    let res = release(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);

    // Already released.
    let mut s = shipped();
    s.env.advance_time(CLAIM_WINDOW + 1);
    release(&mut s).unwrap();
    let res = release(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);
    let res = confirm_by_buyer(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

// ---------- destination accounts ----------

#[test]
fn payout_rejects_seller_token_not_owned_by_seller() {
    let mut s = shipped();
    let thief = s.env.funded_keypair().pubkey();
    let thief_token = s.env.create_ata(&s.protocol.mint, &thief);
    let ix = confirm_receipt_ix(
        s.order,
        s.protocol.mint,
        s.buyer.pubkey(),
        thief_token,
        s.protocol.treasury,
    );
    let buyer = buyer_of(&s);
    let res = s.env.send(&[ix], &[&buyer]);
    assert_program_error(&res, VaultixError::NotSeller);
}

#[test]
fn payout_rejects_seller_token_of_other_mint() {
    let mut s = shipped();
    s.env.advance_time(CLAIM_WINDOW + 1);
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());
    let wrong_token = s.env.create_ata(&other_mint, &s.seller.pubkey());
    let ix = release_ix(s.order, s.protocol.mint, wrong_token, s.protocol.treasury);
    let res = s.env.send(&[ix], &[]);
    assert_program_error(&res, VaultixError::InvalidMint);
}

#[test]
fn payout_rejects_fake_treasury() {
    let mut s = shipped();
    s.env.advance_time(CLAIM_WINDOW + 1);
    let stranger = s.env.funded_keypair().pubkey();
    let fake_treasury = s.env.create_ata(&s.protocol.mint, &stranger);
    let ix = release_ix(s.order, s.protocol.mint, s.seller_token, fake_treasury);
    assert!(s.env.send(&[ix], &[]).is_err());
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

// ---------- fee math ----------

#[test]
fn fee_uses_order_snapshot_after_update_config() {
    let mut s = shipped();
    let admin = s.protocol.admin.insecure_clone();
    let args = vaultix_escrow::instructions::ConfigArgs {
        fee_bps: 500,
        ..default_config_args(s.protocol.arbiter.pubkey())
    };
    let ix = update_config_ix(admin.pubkey(), s.protocol.treasury, args);
    s.env.send(&[ix], &[&admin]).unwrap();

    confirm_by_buyer(&mut s).unwrap();
    assert_released(&s, AMOUNT - FEE, FEE);
}

#[test]
fn fee_rounds_down_and_vault_ends_empty() {
    // 67 * 150 / 10_000 = 1.005 → fee 1, seller 66.
    let mut s = shipped_with(67);
    confirm_by_buyer(&mut s).unwrap();
    assert_released(&s, 66, 1);

    // Fee rounds to 0: the transfer is skipped and the seller gets it all.
    let mut s = shipped_with(66);
    confirm_by_buyer(&mut s).unwrap();
    assert_released(&s, 66, 0);
}

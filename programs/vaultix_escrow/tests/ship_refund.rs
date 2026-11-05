mod common;

use anchor_lang::prelude::Pubkey;
use common::{
    assert_program_error, ata, mark_shipped_ix, pay_ix, refund_unshipped_ix, Protocol, TestEnv,
    TxResult, ONE_USDC, START_TS,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;
/// Default `ship_deadline_secs` (5 days).
const SHIP_DEADLINE: i64 = 432_000;
const TRACKING: [u8; 32] = [9; 32];

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    order: Pubkey,
    buyer: Keypair,
    buyer_token: Pubkey,
}

/// An order paid at `START_TS`.
fn paid() -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    let (buyer, buyer_token) = env.funded_user(&protocol, AMOUNT);
    let ix = pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
    env.send(&[ix], &[&buyer]).unwrap();
    Setup {
        env,
        protocol,
        seller,
        order,
        buyer,
        buyer_token,
    }
}

// TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
#[allow(clippy::result_large_err)]
fn ship(s: &mut Setup, signer: &Keypair, hash: Option<[u8; 32]>) -> TxResult {
    let ix = mark_shipped_ix(s.order, signer.pubkey(), hash);
    s.env.send(&[ix], &[signer])
}

#[allow(clippy::result_large_err)]
fn refund(s: &mut Setup) -> TxResult {
    let ix = refund_unshipped_ix(s.order, s.protocol.mint, s.buyer_token);
    // Permissionless: only the fee payer signs.
    s.env.send(&[ix], &[])
}

fn vault(s: &Setup) -> Pubkey {
    ata(&s.order, &s.protocol.mint)
}

// ---------- mark_shipped ----------

#[test]
fn seller_marks_shipped_with_tracking_hash() {
    let mut s = paid();
    s.env.advance_time(3_600);
    let seller = s.seller.insecure_clone();
    ship(&mut s, &seller, Some(TRACKING)).unwrap();

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Shipped);
    assert_eq!(order.shipped_at, START_TS + 3_600);
    assert_eq!(order.tracking_hash, Some(TRACKING));
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

#[test]
fn seller_marks_shipped_without_tracking_hash() {
    let mut s = paid();
    let seller = s.seller.insecure_clone();
    ship(&mut s, &seller, None).unwrap();

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Shipped);
    assert_eq!(order.tracking_hash, None);
}

#[test]
fn only_seller_can_mark_shipped() {
    let mut s = paid();
    let buyer = s.buyer.insecure_clone();
    let res = ship(&mut s, &buyer, None);
    assert_program_error(&res, VaultixError::NotSeller);

    let intruder = s.env.funded_keypair();
    let res = ship(&mut s, &intruder, None);
    assert_program_error(&res, VaultixError::NotSeller);
}

#[test]
fn mark_shipped_requires_seller_signature() {
    let mut s = paid();
    let mut ix = mark_shipped_ix(s.order, s.seller.pubkey(), None);
    ix.accounts[0].is_signer = false;
    assert!(s.env.send(&[ix], &[]).is_err());
}

#[test]
fn mark_shipped_only_in_paid() {
    // Created: nobody paid yet.
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    let res = env.send(&[mark_shipped_ix(order, seller.pubkey(), None)], &[&seller]);
    assert_program_error(&res, VaultixError::InvalidStatus);

    // Already shipped.
    let mut s = paid();
    let seller = s.seller.insecure_clone();
    ship(&mut s, &seller, None).unwrap();
    let res = ship(&mut s, &seller, Some(TRACKING));
    assert_program_error(&res, VaultixError::InvalidStatus);
}

#[test]
fn cannot_ship_after_unshipped_refund() {
    let mut s = paid();
    s.env.advance_time(SHIP_DEADLINE + 1);
    refund(&mut s).unwrap();
    let seller = s.seller.insecure_clone();
    let res = ship(&mut s, &seller, None);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

// ---------- refund_unshipped ----------

#[test]
fn refund_fails_before_ship_deadline() {
    let mut s = paid();
    let res = refund(&mut s);
    assert_program_error(&res, VaultixError::DeadlineNotReached);

    // Exactly at the deadline is still too early.
    s.env.set_time(START_TS + SHIP_DEADLINE);
    let res = refund(&mut s);
    assert_program_error(&res, VaultixError::DeadlineNotReached);
}

#[test]
fn refund_after_ship_deadline_returns_full_amount() {
    let mut s = paid();
    s.env.set_time(START_TS + SHIP_DEADLINE + 1);
    refund(&mut s).unwrap();

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Refunded);
    assert_eq!(s.env.token_balance(&s.buyer_token), AMOUNT);
    assert_eq!(s.env.token_balance(&vault(&s)), 0);
    assert_eq!(s.env.token_balance(&s.protocol.treasury), 0);
}

#[test]
fn refund_only_in_paid() {
    // Shipped orders can't be refunded as unshipped, even after the deadline.
    let mut s = paid();
    let seller = s.seller.insecure_clone();
    ship(&mut s, &seller, None).unwrap();
    s.env.advance_time(SHIP_DEADLINE + 1);
    let res = refund(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);

    // A second refund fails too.
    let mut s = paid();
    s.env.advance_time(SHIP_DEADLINE + 1);
    refund(&mut s).unwrap();
    let res = refund(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

#[test]
fn refund_rejects_token_account_not_owned_by_buyer() {
    let mut s = paid();
    s.env.advance_time(SHIP_DEADLINE + 1);
    let thief_token = s.env.create_ata(&s.protocol.mint, &s.seller.pubkey());
    let ix = refund_unshipped_ix(s.order, s.protocol.mint, thief_token);
    let res = s.env.send(&[ix], &[]);
    assert_program_error(&res, VaultixError::NotBuyer);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

#[test]
fn refund_rejects_token_account_of_other_mint() {
    let mut s = paid();
    s.env.advance_time(SHIP_DEADLINE + 1);
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());
    let wrong_token = s.env.create_ata(&other_mint, &s.buyer.pubkey());
    let ix = refund_unshipped_ix(s.order, s.protocol.mint, wrong_token);
    let res = s.env.send(&[ix], &[]);
    assert_program_error(&res, VaultixError::InvalidMint);
}

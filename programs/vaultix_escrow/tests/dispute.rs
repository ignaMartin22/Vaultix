mod common;

use anchor_lang::prelude::Pubkey;
use common::{
    assert_program_error, ata, mark_shipped_ix, open_dispute_ix, pay_ix, release_ix,
    resolve_dispute_ix, Parties, Protocol, TestEnv, TxResult, ONE_USDC, START_TS,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;
/// 5% of AMOUNT with the default `dispute_deposit_bps = 500`.
const DEPOSIT: u64 = 5 * ONE_USDC;
/// Default `claim_window_secs` (10 days).
const CLAIM_WINDOW: i64 = 864_000;

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    order: Pubkey,
    buyer: Keypair,
    parties: Parties,
}

fn shipped() -> Setup {
    shipped_with(DEPOSIT)
}

/// An order paid and shipped at `START_TS`. The buyer keeps `leftover` after paying.
fn shipped_with(leftover: u64) -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let seller_token = env.create_ata(&protocol.mint, &seller.pubkey());
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    let (buyer, buyer_token) = env.funded_user(&protocol, AMOUNT + leftover);
    let pay = pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
    env.send(&[pay], &[&buyer]).unwrap();
    let ship = mark_shipped_ix(order, seller.pubkey(), None);
    env.send(&[ship], &[&seller]).unwrap();
    let parties = Parties {
        buyer_token,
        seller_token,
        treasury: protocol.treasury,
    };
    Setup {
        env,
        protocol,
        seller,
        order,
        buyer,
        parties,
    }
}

fn disputed() -> Setup {
    let mut s = shipped();
    open(&mut s).unwrap();
    s
}

// TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
#[allow(clippy::result_large_err)]
fn open_as(s: &mut Setup, signer: &Keypair, token: Pubkey) -> TxResult {
    let ix = open_dispute_ix(s.order, s.protocol.mint, signer.pubkey(), token);
    s.env.send(&[ix], &[signer])
}

#[allow(clippy::result_large_err)]
fn open(s: &mut Setup) -> TxResult {
    let buyer = s.buyer.insecure_clone();
    let token = s.parties.buyer_token;
    open_as(s, &buyer, token)
}

#[allow(clippy::result_large_err)]
fn resolve_as(s: &mut Setup, signer: &Keypair, share: u16) -> TxResult {
    let ix = resolve_dispute_ix(s.order, s.protocol.mint, signer.pubkey(), &s.parties, share);
    s.env.send(&[ix], &[signer])
}

#[allow(clippy::result_large_err)]
fn resolve(s: &mut Setup, share: u16) -> TxResult {
    let arbiter = s.protocol.arbiter.insecure_clone();
    resolve_as(s, &arbiter, share)
}

fn vault(s: &Setup) -> Pubkey {
    ata(&s.order, &s.protocol.mint)
}

// ---------- open_dispute ----------

#[test]
fn open_dispute_locks_deposit_in_vault() {
    let mut s = shipped();
    open(&mut s).unwrap();

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Disputed);
    assert_eq!(order.dispute_deposit, DEPOSIT);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT + DEPOSIT);
    assert_eq!(s.env.token_balance(&s.parties.buyer_token), 0);
}

#[test]
fn open_dispute_works_until_the_last_second_of_the_claim_window() {
    let mut s = shipped();
    s.env.set_time(START_TS + CLAIM_WINDOW);
    open(&mut s).unwrap();
}

#[test]
fn open_dispute_fails_after_claim_window() {
    let mut s = shipped();
    s.env.set_time(START_TS + CLAIM_WINDOW + 1);
    let res = open(&mut s);
    assert_program_error(&res, VaultixError::ClaimWindowClosed);
}

#[test]
fn only_buyer_can_open_dispute() {
    let mut s = shipped();
    let seller = s.seller.insecure_clone();
    let seller_token = s.parties.seller_token;
    let res = open_as(&mut s, &seller, seller_token);
    assert_program_error(&res, VaultixError::NotBuyer);

    let (intruder, intruder_token) = s.env.funded_user(&s.protocol, DEPOSIT);
    let res = open_as(&mut s, &intruder, intruder_token);
    assert_program_error(&res, VaultixError::NotBuyer);
}

#[test]
fn open_dispute_only_in_shipped() {
    // Paid, not shipped yet.
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    let (buyer, buyer_token) = env.funded_user(&protocol, AMOUNT + DEPOSIT);
    env.send(
        &[pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token)],
        &[&buyer],
    )
    .unwrap();
    let ix = open_dispute_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
    let res = env.send(&[ix], &[&buyer]);
    assert_program_error(&res, VaultixError::InvalidStatus);

    // Already disputed.
    let mut s = disputed();
    let res = open(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

#[test]
fn open_dispute_fails_without_funds_for_deposit() {
    let mut s = shipped_with(DEPOSIT - 1);
    assert!(open(&mut s).is_err());
    assert_eq!(s.env.read_order(&s.order).status, OrderStatus::Shipped);
}

#[test]
fn release_is_blocked_while_disputed() {
    let mut s = disputed();
    s.env.set_time(START_TS + CLAIM_WINDOW + 1);
    let ix = release_ix(
        s.order,
        s.protocol.mint,
        s.parties.seller_token,
        s.parties.treasury,
    );
    let res = s.env.send(&[ix], &[]);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

// ---------- resolve_dispute ----------

/// Resolves with `share` and checks every balance: (buyer, seller, treasury).
fn assert_resolution(share: u16, buyer: u64, seller: u64, fee: u64) {
    let mut s = disputed();
    resolve(&mut s, share).unwrap();

    assert_eq!(s.env.read_order(&s.order).status, OrderStatus::Resolved);
    assert_eq!(
        s.env.token_balance(&s.parties.buyer_token),
        buyer,
        "buyer, share {share}"
    );
    assert_eq!(
        s.env.token_balance(&s.parties.seller_token),
        seller,
        "seller, share {share}"
    );
    assert_eq!(
        s.env.token_balance(&s.parties.treasury),
        fee,
        "fee, share {share}"
    );
    assert_eq!(s.env.token_balance(&vault(&s)), 0, "vault, share {share}");
    assert_eq!(buyer + seller + fee, AMOUNT + DEPOSIT);
}

#[test]
fn resolve_all_to_seller_gives_deposit_to_seller() {
    // Seller: 100 − 1.5% = 98.5, plus the 5 deposit.
    assert_resolution(0, 0, 98_500_000 + DEPOSIT, 1_500_000);
}

#[test]
fn resolve_one_third_to_buyer_gives_deposit_to_seller() {
    // Buyer 33.33; seller gross 66.67, fee 1.00005, net 65.66995 + 5 deposit.
    assert_resolution(3_333, 33_330_000, 65_669_950 + DEPOSIT, 1_000_050);
}

#[test]
fn resolve_half_returns_deposit_to_buyer() {
    // Buyer 50 + 5 deposit; seller 50 − 1.5% = 49.25.
    assert_resolution(5_000, 50_000_000 + DEPOSIT, 49_250_000, 750_000);
}

#[test]
fn resolve_all_to_buyer_charges_no_fee() {
    assert_resolution(10_000, AMOUNT + DEPOSIT, 0, 0);
}

#[test]
fn resolve_rejects_share_above_100_percent() {
    let mut s = disputed();
    let res = resolve(&mut s, 10_001);
    assert_program_error(&res, VaultixError::InvalidShareBps);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT + DEPOSIT);
}

#[test]
fn only_arbiter_can_resolve() {
    let mut s = disputed();
    for signer in [
        s.protocol.admin.insecure_clone(),
        s.buyer.insecure_clone(),
        s.seller.insecure_clone(),
    ] {
        let res = resolve_as(&mut s, &signer, 10_000);
        assert_program_error(&res, VaultixError::NotArbiter);
    }
}

#[test]
fn resolve_requires_arbiter_signature() {
    let mut s = disputed();
    let mut ix = resolve_dispute_ix(
        s.order,
        s.protocol.mint,
        s.protocol.arbiter.pubkey(),
        &s.parties,
        5_000,
    );
    ix.accounts[0].is_signer = false;
    assert!(s.env.send(&[ix], &[]).is_err());
}

#[test]
fn resolve_only_in_disputed() {
    let mut s = shipped();
    let res = resolve(&mut s, 5_000);
    assert_program_error(&res, VaultixError::InvalidStatus);

    let mut s = disputed();
    resolve(&mut s, 5_000).unwrap();
    let res = resolve(&mut s, 5_000);
    assert_program_error(&res, VaultixError::InvalidStatus);
}

#[test]
fn resolve_rejects_wrong_destination_accounts() {
    let mut s = disputed();
    let stranger = s.env.funded_keypair();
    let stranger_token = s.env.create_ata(&s.protocol.mint, &stranger.pubkey());
    let arbiter = s.protocol.arbiter.insecure_clone();

    let parties = Parties {
        buyer_token: stranger_token,
        ..s.parties
    };
    let ix = resolve_dispute_ix(s.order, s.protocol.mint, arbiter.pubkey(), &parties, 5_000);
    let res = s.env.send(&[ix], &[&arbiter]);
    assert_program_error(&res, VaultixError::NotBuyer);

    let parties = Parties {
        seller_token: stranger_token,
        ..s.parties
    };
    let ix = resolve_dispute_ix(s.order, s.protocol.mint, arbiter.pubkey(), &parties, 5_000);
    let res = s.env.send(&[ix], &[&arbiter]);
    assert_program_error(&res, VaultixError::NotSeller);

    let parties = Parties {
        treasury: stranger_token,
        ..s.parties
    };
    let ix = resolve_dispute_ix(s.order, s.protocol.mint, arbiter.pubkey(), &parties, 5_000);
    assert!(s.env.send(&[ix], &[&arbiter]).is_err());

    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT + DEPOSIT);
}

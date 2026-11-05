mod common;

use anchor_lang::{prelude::Pubkey, solana_program::instruction::Instruction};
use common::{assert_program_error, ata, pay_ix, Protocol, TestEnv, ONE_USDC, START_TS};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    order: Pubkey,
    buyer: Keypair,
    buyer_token: Pubkey,
}

fn setup() -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    let (buyer, buyer_token) = env.funded_user(&protocol, 2 * AMOUNT);
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
fn pay(s: &mut Setup) -> common::TxResult {
    let ix = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), s.buyer_token);
    let buyer = s.buyer.insecure_clone();
    s.env.send(&[ix], &[&buyer])
}

fn vault(s: &Setup) -> Pubkey {
    ata(&s.order, &s.protocol.mint)
}

#[test]
fn pay_moves_amount_to_vault_and_sets_buyer() {
    let mut s = setup();
    s.env.advance_time(60);
    pay(&mut s).unwrap();

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Paid);
    assert_eq!(order.buyer, Some(s.buyer.pubkey()));
    assert_eq!(order.paid_at, START_TS + 60);
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
    assert_eq!(s.env.token_balance(&s.buyer_token), AMOUNT);
}

#[test]
fn seller_cannot_pay_own_order() {
    let mut s = setup();
    let seller_token = s.env.create_ata(&s.protocol.mint, &s.seller.pubkey());
    let authority = s.protocol.mint_authority.insecure_clone();
    s.env
        .mint_to(&s.protocol.mint, &authority, &seller_token, AMOUNT);

    let ix = pay_ix(s.order, s.protocol.mint, s.seller.pubkey(), seller_token);
    let seller = s.seller.insecure_clone();
    let res = s.env.send(&[ix], &[&seller]);
    assert_program_error(&res, VaultixError::SellerCannotBuy);
}

#[test]
fn second_payment_fails() {
    let mut s = setup();
    pay(&mut s).unwrap();

    // Same buyer again.
    let res = pay(&mut s);
    assert_program_error(&res, VaultixError::InvalidStatus);

    // A different buyer.
    let (other, other_token) = s.env.funded_user(&s.protocol, AMOUNT);
    let ix = pay_ix(s.order, s.protocol.mint, other.pubkey(), other_token);
    let res = s.env.send(&[ix], &[&other]);
    assert_program_error(&res, VaultixError::InvalidStatus);

    let order = s.env.read_order(&s.order);
    assert_eq!(order.buyer, Some(s.buyer.pubkey()));
    assert_eq!(s.env.token_balance(&vault(&s)), AMOUNT);
}

#[test]
fn pay_rejects_token_account_of_other_mint() {
    let mut s = setup();
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());
    let wrong_token = s.env.create_ata(&other_mint, &s.buyer.pubkey());
    s.env.mint_to(&other_mint, &authority, &wrong_token, AMOUNT);

    let ix = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), wrong_token);
    let buyer = s.buyer.insecure_clone();
    let res = s.env.send(&[ix], &[&buyer]);
    assert_program_error(&res, VaultixError::InvalidMint);
}

#[test]
fn pay_rejects_token_account_of_other_authority() {
    let mut s = setup();
    let (_victim, victim_token) = s.env.funded_user(&s.protocol, AMOUNT);

    let ix = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), victim_token);
    let buyer = s.buyer.insecure_clone();
    let res = s.env.send(&[ix], &[&buyer]);
    assert_program_error(&res, VaultixError::NotBuyer);
    assert_eq!(s.env.token_balance(&victim_token), AMOUNT);
}

#[test]
fn pay_rejects_mint_other_than_order_mint() {
    let mut s = setup();
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());

    let mut ix: Instruction = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), s.buyer_token);
    ix.accounts[2].pubkey = other_mint;
    let buyer = s.buyer.insecure_clone();
    let res = s.env.send(&[ix], &[&buyer]);
    assert_program_error(&res, VaultixError::InvalidMint);
}

#[test]
fn pay_rejects_fake_vault() {
    let mut s = setup();
    // A token account of the right mint that is not the order's ATA.
    let fake_vault = s.env.create_ata(&s.protocol.mint, &s.seller.pubkey());

    let mut ix = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), s.buyer_token);
    ix.accounts[4].pubkey = fake_vault;
    let buyer = s.buyer.insecure_clone();
    assert!(s.env.send(&[ix], &[&buyer]).is_err());
    assert_eq!(s.env.token_balance(&fake_vault), 0);
}

#[test]
fn pay_requires_buyer_signature() {
    let mut s = setup();
    let mut ix = pay_ix(s.order, s.protocol.mint, s.buyer.pubkey(), s.buyer_token);
    ix.accounts[0].is_signer = false;
    assert!(s.env.send(&[ix], &[]).is_err());
    assert_eq!(s.env.token_balance(&s.buyer_token), 2 * AMOUNT);
}

#[test]
fn pay_fails_without_enough_funds() {
    let mut s = setup();
    let (poor, poor_token) = s.env.funded_user(&s.protocol, AMOUNT - 1);
    let ix = pay_ix(s.order, s.protocol.mint, poor.pubkey(), poor_token);
    assert!(s.env.send(&[ix], &[&poor]).is_err());

    let order = s.env.read_order(&s.order);
    assert_eq!(order.status, OrderStatus::Created);
    assert_eq!(order.buyer, None);
}

mod common;

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, system_program, InstructionData,
    ToAccountMetas,
};
use common::{
    assert_program_error, ata, order_pda, Protocol, TestEnv, TxResult, ONE_USDC, START_TS,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const ORDER_ID: u64 = 42;
const AMOUNT: u64 = 100 * ONE_USDC;
const LISTING_HASH: [u8; 32] = [7; 32];

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    /// Pays the rent of the order and vault (separate from the seller).
    rent_payer: Keypair,
}

fn setup() -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let rent_payer = env.funded_keypair();
    Setup {
        env,
        protocol,
        seller,
        rent_payer,
    }
}

// TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
#[allow(clippy::result_large_err)]
fn create_with(s: &mut Setup, mint: Pubkey, order_id: u64, amount: u64) -> TxResult {
    let seller = s.seller.pubkey();
    let order = order_pda(&seller, order_id);
    let ix = Instruction {
        program_id: s.env.program_id,
        accounts: vaultix_escrow::accounts::CreateOrder {
            seller,
            payer: s.rent_payer.pubkey(),
            config: s.protocol.config,
            mint,
            order,
            vault: ata(&order, &mint),
            token_program: anchor_spl::token::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::CreateOrder {
            order_id,
            amount,
            listing_hash: LISTING_HASH,
        }
        .data(),
    };
    let (seller_kp, payer_kp) = (s.seller.insecure_clone(), s.rent_payer.insecure_clone());
    s.env.send(&[ix], &[&seller_kp, &payer_kp])
}

#[allow(clippy::result_large_err)]
fn create(s: &mut Setup, amount: u64) -> TxResult {
    let mint = s.protocol.mint;
    create_with(s, mint, ORDER_ID, amount)
}

#[allow(clippy::result_large_err)]
fn close(s: &mut Setup, caller: &Keypair, rent_payer: Pubkey) -> TxResult {
    let order = order_pda(&s.seller.pubkey(), ORDER_ID);
    let mint = s.protocol.mint;
    let ix = Instruction {
        program_id: s.env.program_id,
        accounts: vaultix_escrow::accounts::CloseOrder {
            caller: caller.pubkey(),
            order,
            mint,
            vault: ata(&order, &mint),
            rent_payer,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::CloseOrder {}.data(),
    };
    s.env.send(&[ix], &[caller])
}

fn order_address(s: &Setup) -> Pubkey {
    order_pda(&s.seller.pubkey(), ORDER_ID)
}

fn set_status(s: &mut Setup, status: OrderStatus) {
    let address = order_address(s);
    let mut order = s.env.read_order(&address);
    order.status = status;
    s.env.write_order(&address, &order);
}

// ---------- create_order ----------

#[test]
fn create_order_stores_order_and_config_snapshot() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();

    let address = order_address(&s);
    let order = s.env.read_order(&address);
    assert_eq!(order.status, OrderStatus::Created);
    assert_eq!(order.seller, s.seller.pubkey());
    assert_eq!(order.buyer, None);
    assert_eq!(order.order_id, ORDER_ID);
    assert_eq!(order.mint, s.protocol.mint);
    assert_eq!(order.amount, AMOUNT);
    assert_eq!(order.listing_hash, LISTING_HASH);
    assert_eq!(order.tracking_hash, None);
    assert_eq!(order.dispute_deposit, 0);
    assert_eq!(order.created_at, START_TS);
    assert_eq!((order.paid_at, order.shipped_at), (0, 0));
    assert_eq!(order.rent_payer, s.rent_payer.pubkey());

    let defaults = common::default_config_args(s.protocol.arbiter.pubkey());
    assert_eq!(order.fee_bps, defaults.fee_bps);
    assert_eq!(order.dispute_deposit_bps, defaults.dispute_deposit_bps);
    assert_eq!(order.ship_deadline_secs, defaults.ship_deadline_secs);
    assert_eq!(order.claim_window_secs, defaults.claim_window_secs);

    let vault = ata(&address, &s.protocol.mint);
    assert_eq!(s.env.token_balance(&vault), 0);
}

#[test]
fn create_order_accepts_amount_equal_to_max() {
    let mut s = setup();
    create(&mut s, 500 * ONE_USDC).unwrap();
}

#[test]
fn create_order_rejects_zero_amount() {
    let mut s = setup();
    let res = create(&mut s, 0);
    assert_program_error(&res, VaultixError::InvalidAmount);
}

#[test]
fn create_order_rejects_amount_above_max() {
    let mut s = setup();
    let res = create(&mut s, 500 * ONE_USDC + 1);
    assert_program_error(&res, VaultixError::AmountExceedsMax);
}

#[test]
fn create_order_rejects_mint_not_allowed() {
    let mut s = setup();
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());
    let res = create_with(&mut s, other_mint, ORDER_ID, AMOUNT);
    assert_program_error(&res, VaultixError::InvalidMint);
}

#[test]
fn create_order_rejects_duplicate_pda() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();
    assert!(create(&mut s, AMOUNT).is_err());
}

#[test]
fn create_order_requires_seller_signature() {
    let mut s = setup();
    let mint = s.protocol.mint;
    let seller = s.seller.pubkey();
    let order = order_pda(&seller, ORDER_ID);
    let mut accounts = vaultix_escrow::accounts::CreateOrder {
        seller,
        payer: s.rent_payer.pubkey(),
        config: s.protocol.config,
        mint,
        order,
        vault: ata(&order, &mint),
        token_program: anchor_spl::token::ID,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    accounts[0].is_signer = false;
    let ix = Instruction {
        program_id: s.env.program_id,
        accounts,
        data: vaultix_escrow::instruction::CreateOrder {
            order_id: ORDER_ID,
            amount: AMOUNT,
            listing_hash: LISTING_HASH,
        }
        .data(),
    };
    let payer = s.rent_payer.insecure_clone();
    assert!(s.env.send(&[ix], &[&payer]).is_err());
}

// ---------- close_order ----------

#[test]
fn seller_closes_created_order_and_rent_returns_to_rent_payer() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();
    let order = order_address(&s);
    let vault = ata(&order, &s.protocol.mint);
    let rent_payer = s.rent_payer.pubkey();
    let expected = s.env.lamports(&rent_payer) + s.env.lamports(&order) + s.env.lamports(&vault);

    let seller = s.seller.insecure_clone();
    close(&mut s, &seller, rent_payer).unwrap();

    assert!(!s.env.account_exists(&order));
    assert!(!s.env.account_exists(&vault));
    assert_eq!(s.env.lamports(&rent_payer), expected);
}

#[test]
fn non_seller_cannot_close_created_order() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();
    let intruder = s.env.funded_keypair();
    let rent_payer = s.rent_payer.pubkey();
    let res = close(&mut s, &intruder, rent_payer);
    assert_program_error(&res, VaultixError::NotSeller);
}

#[test]
fn close_order_rejects_wrong_rent_payer() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();
    let seller = s.seller.insecure_clone();
    let thief = s.env.funded_keypair().pubkey();
    assert!(close(&mut s, &seller, thief).is_err());
    assert!(s.env.account_exists(&order_address(&s)));
}

#[test]
fn anyone_closes_order_in_final_status() {
    for status in [
        OrderStatus::Released,
        OrderStatus::Refunded,
        OrderStatus::Resolved,
    ] {
        let mut s = setup();
        create(&mut s, AMOUNT).unwrap();
        set_status(&mut s, status);
        let anyone = s.env.funded_keypair();
        let rent_payer = s.rent_payer.pubkey();
        close(&mut s, &anyone, rent_payer).unwrap();
        assert!(!s.env.account_exists(&order_address(&s)));
    }
}

#[test]
fn close_order_rejects_non_final_status() {
    for status in [
        OrderStatus::Paid,
        OrderStatus::Shipped,
        OrderStatus::Disputed,
    ] {
        let mut s = setup();
        create(&mut s, AMOUNT).unwrap();
        set_status(&mut s, status);
        let seller = s.seller.insecure_clone();
        let rent_payer = s.rent_payer.pubkey();
        let res = close(&mut s, &seller, rent_payer);
        assert_program_error(&res, VaultixError::InvalidStatus);
    }
}

#[test]
fn close_order_rejects_vault_with_balance() {
    let mut s = setup();
    create(&mut s, AMOUNT).unwrap();
    let vault = ata(&order_address(&s), &s.protocol.mint);
    let (mint, authority) = (s.protocol.mint, s.protocol.mint_authority.insecure_clone());
    s.env.mint_to(&mint, &authority, &vault, 1);

    let seller = s.seller.insecure_clone();
    let rent_payer = s.rent_payer.pubkey();
    let res = close(&mut s, &seller, rent_payer);
    assert_program_error(&res, VaultixError::VaultNotEmpty);
}

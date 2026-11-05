mod common;

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, system_program, AccountDeserialize,
    InstructionData, ToAccountMetas,
};
use common::{assert_program_error, TestEnv, TxResult, ONE_USDC};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{
    constants::{CONFIG_SEED, MAX_DISPUTE_DEPOSIT_BPS, MAX_FEE_BPS},
    errors::VaultixError,
    instructions::ConfigArgs,
    state::Config,
};

struct Setup {
    env: TestEnv,
    admin: Keypair,
    mint: Pubkey,
    treasury: Pubkey,
    config: Pubkey,
}

fn setup() -> Setup {
    let mut env = TestEnv::new();
    let admin = env.funded_keypair();
    let mint_authority = env.funded_keypair();
    let mint = env.create_mint(&mint_authority.pubkey());
    let treasury = env.create_ata(&mint, &admin.pubkey());
    let (config, _) = Pubkey::find_program_address(&[CONFIG_SEED], &env.program_id);
    Setup {
        env,
        admin,
        mint,
        treasury,
        config,
    }
}

fn default_args() -> ConfigArgs {
    ConfigArgs {
        arbiter: Pubkey::new_unique(),
        fee_bps: 150,
        dispute_deposit_bps: 500,
        ship_deadline_secs: 432_000,
        claim_window_secs: 864_000,
        max_order_amount: 500 * ONE_USDC,
    }
}

// TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
#[allow(clippy::result_large_err)]
fn initialize(s: &mut Setup, mint: Pubkey, treasury: Pubkey, args: ConfigArgs) -> TxResult {
    let ix = Instruction {
        program_id: s.env.program_id,
        accounts: vaultix_escrow::accounts::InitializeConfig {
            admin: s.admin.pubkey(),
            config: s.config,
            allowed_mint: mint,
            treasury,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::InitializeConfig { args }.data(),
    };
    let admin = s.admin.insecure_clone();
    s.env.send(&[ix], &[&admin])
}

#[allow(clippy::result_large_err)]
fn update(s: &mut Setup, signer: &Keypair, treasury: Pubkey, args: ConfigArgs) -> TxResult {
    let ix = Instruction {
        program_id: s.env.program_id,
        accounts: vaultix_escrow::accounts::UpdateConfig {
            admin: signer.pubkey(),
            config: s.config,
            treasury,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::UpdateConfig { args }.data(),
    };
    s.env.send(&[ix], &[signer])
}

fn initialized() -> Setup {
    let mut s = setup();
    let (mint, treasury) = (s.mint, s.treasury);
    initialize(&mut s, mint, treasury, default_args()).unwrap();
    s
}

fn read_config(s: &Setup) -> Config {
    let account = s.env.svm.get_account(&s.config).unwrap();
    Config::try_deserialize(&mut account.data.as_slice()).unwrap()
}

fn other_mint_ata(s: &mut Setup) -> Pubkey {
    let authority = s.env.funded_keypair();
    let other_mint = s.env.create_mint(&authority.pubkey());
    let owner = s.admin.pubkey();
    s.env.create_ata(&other_mint, &owner)
}

// ---------- initialize_config ----------

#[test]
fn initialize_config_stores_all_fields() {
    let s = initialized();
    let args = default_args();
    let config = read_config(&s);

    assert_eq!(config.admin, s.admin.pubkey());
    assert_eq!(config.allowed_mint, s.mint);
    assert_eq!(config.treasury, s.treasury);
    assert_eq!(config.fee_bps, args.fee_bps);
    assert_eq!(config.dispute_deposit_bps, args.dispute_deposit_bps);
    assert_eq!(config.ship_deadline_secs, args.ship_deadline_secs);
    assert_eq!(config.claim_window_secs, args.claim_window_secs);
    assert_eq!(config.max_order_amount, args.max_order_amount);
    let (_, bump) = Pubkey::find_program_address(&[CONFIG_SEED], &s.env.program_id);
    assert_eq!(config.bump, bump);
}

#[test]
fn initialize_config_accepts_max_fee_and_deposit() {
    let mut s = setup();
    let (mint, treasury) = (s.mint, s.treasury);
    let args = ConfigArgs {
        fee_bps: MAX_FEE_BPS,
        dispute_deposit_bps: MAX_DISPUTE_DEPOSIT_BPS,
        ..default_args()
    };
    initialize(&mut s, mint, treasury, args).unwrap();
}

#[test]
fn second_initialize_config_fails() {
    let mut s = initialized();
    let (mint, treasury) = (s.mint, s.treasury);
    assert!(initialize(&mut s, mint, treasury, default_args()).is_err());
}

#[test]
fn initialize_config_rejects_fee_above_max() {
    let mut s = setup();
    let (mint, treasury) = (s.mint, s.treasury);
    let args = ConfigArgs {
        fee_bps: MAX_FEE_BPS + 1,
        ..default_args()
    };
    let res = initialize(&mut s, mint, treasury, args);
    assert_program_error(&res, VaultixError::FeeTooHigh);
}

#[test]
fn initialize_config_rejects_deposit_above_max() {
    let mut s = setup();
    let (mint, treasury) = (s.mint, s.treasury);
    let args = ConfigArgs {
        dispute_deposit_bps: MAX_DISPUTE_DEPOSIT_BPS + 1,
        ..default_args()
    };
    let res = initialize(&mut s, mint, treasury, args);
    assert_program_error(&res, VaultixError::DepositTooHigh);
}

#[test]
fn initialize_config_rejects_non_positive_deadlines() {
    let cases = [(0, 864_000), (432_000, 0), (-1, 864_000), (432_000, -1)];
    for (ship, claim) in cases {
        let mut s = setup();
        let (mint, treasury) = (s.mint, s.treasury);
        let args = ConfigArgs {
            ship_deadline_secs: ship,
            claim_window_secs: claim,
            ..default_args()
        };
        let res = initialize(&mut s, mint, treasury, args);
        assert_program_error(&res, VaultixError::InvalidDeadline);
    }
}

#[test]
fn config_rejects_zero_max_order_amount() {
    let mut s = setup();
    let (mint, treasury) = (s.mint, s.treasury);
    let zero_cap = || ConfigArgs {
        max_order_amount: 0,
        ..default_args()
    };
    let res = initialize(&mut s, mint, treasury, zero_cap());
    assert_program_error(&res, VaultixError::InvalidAmount);

    let mut s = initialized();
    let admin = s.admin.insecure_clone();
    let treasury = s.treasury;
    let res = update(&mut s, &admin, treasury, zero_cap());
    assert_program_error(&res, VaultixError::InvalidAmount);
    assert_eq!(
        read_config(&s).max_order_amount,
        default_args().max_order_amount
    );
}

#[test]
fn initialize_config_rejects_treasury_of_other_mint() {
    let mut s = setup();
    let mint = s.mint;
    let wrong_treasury = other_mint_ata(&mut s);
    let res = initialize(&mut s, mint, wrong_treasury, default_args());
    assert_program_error(&res, VaultixError::InvalidMint);
}

// ---------- update_config ----------

#[test]
fn update_config_by_admin_changes_params() {
    let mut s = initialized();
    let admin = s.admin.insecure_clone();
    let new_owner = s.env.funded_keypair();
    let mint = s.mint;
    let new_treasury = s.env.create_ata(&mint, &new_owner.pubkey());
    let args = ConfigArgs {
        arbiter: Pubkey::new_unique(),
        fee_bps: 200,
        dispute_deposit_bps: 1_000,
        ship_deadline_secs: 100,
        claim_window_secs: 200,
        max_order_amount: 10 * ONE_USDC,
    };
    update(&mut s, &admin, new_treasury, args.clone()).unwrap();

    let config = read_config(&s);
    assert_eq!(config.arbiter, args.arbiter);
    assert_eq!(config.treasury, new_treasury);
    assert_eq!(config.fee_bps, 200);
    assert_eq!(config.dispute_deposit_bps, 1_000);
    assert_eq!(config.ship_deadline_secs, 100);
    assert_eq!(config.claim_window_secs, 200);
    assert_eq!(config.max_order_amount, 10 * ONE_USDC);
    // Fixed fields don't change.
    assert_eq!(config.admin, admin.pubkey());
    assert_eq!(config.allowed_mint, mint);
}

#[test]
fn update_config_by_non_admin_fails() {
    let mut s = initialized();
    let intruder = s.env.funded_keypair();
    let treasury = s.treasury;
    let res = update(&mut s, &intruder, treasury, default_args());
    assert_program_error(&res, VaultixError::NotAdmin);
}

#[test]
fn update_config_runs_the_same_validations() {
    let mut s = initialized();
    let admin = s.admin.insecure_clone();
    let treasury = s.treasury;

    let res = update(
        &mut s,
        &admin,
        treasury,
        ConfigArgs {
            fee_bps: MAX_FEE_BPS + 1,
            ..default_args()
        },
    );
    assert_program_error(&res, VaultixError::FeeTooHigh);

    let res = update(
        &mut s,
        &admin,
        treasury,
        ConfigArgs {
            dispute_deposit_bps: MAX_DISPUTE_DEPOSIT_BPS + 1,
            ..default_args()
        },
    );
    assert_program_error(&res, VaultixError::DepositTooHigh);

    let res = update(
        &mut s,
        &admin,
        treasury,
        ConfigArgs {
            claim_window_secs: 0,
            ..default_args()
        },
    );
    assert_program_error(&res, VaultixError::InvalidDeadline);

    let wrong_treasury = other_mint_ata(&mut s);
    let res = update(&mut s, &admin, wrong_treasury, default_args());
    assert_program_error(&res, VaultixError::InvalidMint);
}

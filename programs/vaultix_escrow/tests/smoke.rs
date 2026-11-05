mod common;

use common::{TestEnv, ONE_USDC, START_TS};
use solana_signer::Signer;

#[test]
fn program_is_deployed() {
    let env = TestEnv::new();
    let account = env.svm.get_account(&env.program_id).unwrap();
    assert!(account.executable);
}

#[test]
fn usdc_mint_and_token_accounts_work() {
    let mut env = TestEnv::new();
    let mint_authority = env.funded_keypair();
    let owner = env.funded_keypair();

    let mint = env.create_mint(&mint_authority.pubkey());
    let ata = env.create_ata(&mint, &owner.pubkey());
    env.mint_to(&mint, &mint_authority, &ata, 5 * ONE_USDC);

    assert_eq!(env.token_balance(&ata), 5 * ONE_USDC);
}

#[test]
fn clock_can_be_set_and_advanced() {
    let mut env = TestEnv::new();
    assert_eq!(env.now(), START_TS);

    env.advance_time(5 * 24 * 60 * 60);
    assert_eq!(env.now(), START_TS + 432_000);

    env.set_time(START_TS - 1);
    assert_eq!(env.now(), START_TS - 1);
}

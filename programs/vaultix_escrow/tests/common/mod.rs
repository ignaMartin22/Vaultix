//! Shared LiteSVM harness for the vaultix_escrow integration tests.
// Each test file uses a different subset of these helpers.
#![allow(dead_code)]

use anchor_lang::{
    error::ERROR_CODE_OFFSET, prelude::Pubkey, solana_program::instruction::Instruction,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use litesvm_token::{
    get_spl_account, spl_token::state::Account as TokenAccount, CreateAssociatedTokenAccount,
    CreateMint, MintTo,
};
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use vaultix_escrow::errors::VaultixError;

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
pub const USDC_DECIMALS: u8 = 6;
pub const ONE_USDC: u64 = 1_000_000;
/// 2026-01-01T00:00:00Z, so tests never depend on the host clock.
pub const START_TS: i64 = 1_767_225_600;

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub struct TestEnv {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    /// Pays fees and rent in every transaction, like the backend fee payer.
    pub payer: Keypair,
}

impl TestEnv {
    pub fn new() -> Self {
        let program_id = vaultix_escrow::id();
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(
            env!("CARGO_TARGET_TMPDIR"),
            "/../deploy/vaultix_escrow.so"
        ));
        svm.add_program(program_id, bytes).unwrap();

        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();

        let mut env = Self {
            svm,
            program_id,
            payer,
        };
        env.set_time(START_TS);
        env
    }

    /// A new keypair with 1 SOL, for signers that must exist on-chain.
    pub fn funded_keypair(&mut self) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), LAMPORTS_PER_SOL).unwrap();
        kp
    }

    /// A 6-decimal mint standing in for devnet USDC.
    pub fn create_mint(&mut self, authority: &Pubkey) -> Pubkey {
        CreateMint::new(&mut self.svm, &self.payer)
            .authority(authority)
            .decimals(USDC_DECIMALS)
            .send()
            .unwrap()
    }

    pub fn create_ata(&mut self, mint: &Pubkey, owner: &Pubkey) -> Pubkey {
        CreateAssociatedTokenAccount::new(&mut self.svm, &self.payer, mint)
            .owner(owner)
            .send()
            .unwrap()
    }

    pub fn mint_to(&mut self, mint: &Pubkey, authority: &Keypair, dest: &Pubkey, amount: u64) {
        MintTo::new(&mut self.svm, &self.payer, mint, dest, amount)
            .owner(authority)
            .send()
            .unwrap();
    }

    pub fn token_balance(&self, token_account: &Pubkey) -> u64 {
        get_spl_account::<TokenAccount>(&self.svm, token_account)
            .unwrap()
            .amount
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    pub fn advance_time(&mut self, secs: i64) {
        let now = self.now();
        self.set_time(now + secs);
    }

    /// Sends `ixs` with `self.payer` as fee payer plus the extra `signers`.
    /// Expires the blockhash first so identical transactions don't collide.
    // TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
    #[allow(clippy::result_large_err)]
    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&self.payer.pubkey()), &blockhash);
        let mut all_signers: Vec<&Keypair> = vec![&self.payer];
        all_signers.extend_from_slice(signers);
        let tx =
            VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &all_signers).unwrap();
        self.svm.send_transaction(tx)
    }
}

/// Asserts the transaction failed with the given program error.
pub fn assert_program_error(res: &TxResult, expected: VaultixError) {
    let code = ERROR_CODE_OFFSET + expected as u32;
    match res {
        Ok(_) => panic!("expected error {code}, but the transaction succeeded"),
        Err(e) => assert!(
            format!("{:?}", e.err).contains(&format!("Custom({code})")),
            "expected Custom({code}), got {:?}\nlogs: {:#?}",
            e.err,
            e.meta.logs
        ),
    }
}

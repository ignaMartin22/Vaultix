//! Shared LiteSVM harness for the vaultix_escrow integration tests.
// Each test file uses a different subset of these helpers.
#![allow(dead_code)]

use anchor_lang::{
    error::ERROR_CODE_OFFSET, prelude::Pubkey, solana_program::instruction::Instruction,
    system_program, AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas,
};
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
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
use vaultix_escrow::{
    constants::{CONFIG_SEED, ORDER_SEED},
    errors::VaultixError,
    instructions::ConfigArgs,
    state::Order,
};

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

// ---------- protocol helpers ----------

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &vaultix_escrow::id()).0
}

pub fn order_pda(seller: &Pubkey, order_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[ORDER_SEED, seller.as_ref(), &order_id.to_le_bytes()],
        &vaultix_escrow::id(),
    )
    .0
}

/// ATA under the classic SPL Token program (what the test mints use).
pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &anchor_spl::token::ID)
}

pub fn default_config_args(arbiter: Pubkey) -> ConfigArgs {
    ConfigArgs {
        arbiter,
        fee_bps: 150,
        dispute_deposit_bps: 500,
        ship_deadline_secs: 432_000,
        claim_window_secs: 864_000,
        max_order_amount: 500 * ONE_USDC,
    }
}

/// An initialized Config with its mint and treasury.
pub struct Protocol {
    pub admin: Keypair,
    pub arbiter: Keypair,
    pub mint_authority: Keypair,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub config: Pubkey,
}

impl TestEnv {
    pub fn init_protocol(&mut self) -> Protocol {
        let admin = self.funded_keypair();
        let arbiter = self.funded_keypair();
        let mint_authority = self.funded_keypair();
        let mint = self.create_mint(&mint_authority.pubkey());
        let treasury = self.create_ata(&mint, &admin.pubkey());
        let config = config_pda();
        let ix = Instruction {
            program_id: self.program_id,
            accounts: vaultix_escrow::accounts::InitializeConfig {
                admin: admin.pubkey(),
                config,
                allowed_mint: mint,
                treasury,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: vaultix_escrow::instruction::InitializeConfig {
                args: default_config_args(arbiter.pubkey()),
            }
            .data(),
        };
        self.send(&[ix], &[&admin]).unwrap();
        Protocol {
            admin,
            arbiter,
            mint_authority,
            mint,
            treasury,
            config,
        }
    }

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.svm.get_account(address).map_or(0, |a| a.lamports)
    }

    pub fn account_exists(&self, address: &Pubkey) -> bool {
        self.svm
            .get_account(address)
            .is_some_and(|a| a.lamports > 0)
    }

    pub fn read_order(&self, order: &Pubkey) -> Order {
        let account = self.svm.get_account(order).unwrap();
        Order::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    /// Overwrites an order in place, to reach states whose instructions
    /// are tested elsewhere.
    pub fn write_order(&mut self, address: &Pubkey, order: &Order) {
        let mut account = self.svm.get_account(address).unwrap();
        order
            .try_serialize(&mut account.data.as_mut_slice())
            .unwrap();
        self.svm.set_account(*address, account).unwrap();
    }

    /// Creates an order in `Created` (the seller also pays the rent) and
    /// returns its address.
    pub fn create_order(
        &mut self,
        protocol: &Protocol,
        seller: &Keypair,
        order_id: u64,
        amount: u64,
    ) -> Pubkey {
        let order = order_pda(&seller.pubkey(), order_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: vaultix_escrow::accounts::CreateOrder {
                seller: seller.pubkey(),
                payer: seller.pubkey(),
                config: protocol.config,
                mint: protocol.mint,
                order,
                vault: ata(&order, &protocol.mint),
                token_program: anchor_spl::token::ID,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: vaultix_escrow::instruction::CreateOrder {
                order_id,
                amount,
                listing_hash: [0; 32],
            }
            .data(),
        };
        self.send(&[ix], &[seller]).unwrap();
        order
    }

    /// A funded keypair with an ATA of the protocol mint holding `amount`.
    pub fn funded_user(&mut self, protocol: &Protocol, amount: u64) -> (Keypair, Pubkey) {
        let user = self.funded_keypair();
        let token = self.create_ata(&protocol.mint, &user.pubkey());
        let authority = protocol.mint_authority.insecure_clone();
        self.mint_to(&protocol.mint, &authority, &token, amount);
        (user, token)
    }
}

pub fn pay_ix(order: Pubkey, mint: Pubkey, buyer: Pubkey, buyer_token: Pubkey) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::Pay {
            buyer,
            order,
            mint,
            buyer_token,
            vault: ata(&order, &mint),
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::Pay {}.data(),
    }
}

pub fn mark_shipped_ix(
    order: Pubkey,
    seller: Pubkey,
    tracking_hash: Option<[u8; 32]>,
) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::MarkShipped { seller, order }.to_account_metas(None),
        data: vaultix_escrow::instruction::MarkShipped { tracking_hash }.data(),
    }
}

pub fn refund_unshipped_ix(order: Pubkey, mint: Pubkey, buyer_token: Pubkey) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::RefundUnshipped {
            order,
            mint,
            vault: ata(&order, &mint),
            buyer_token,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::RefundUnshipped {}.data(),
    }
}

pub fn confirm_receipt_ix(
    order: Pubkey,
    mint: Pubkey,
    buyer: Pubkey,
    seller_token: Pubkey,
    treasury: Pubkey,
) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::ConfirmReceipt {
            buyer,
            order,
            config: config_pda(),
            mint,
            vault: ata(&order, &mint),
            seller_token,
            treasury,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::ConfirmReceipt {}.data(),
    }
}

pub fn release_ix(
    order: Pubkey,
    mint: Pubkey,
    seller_token: Pubkey,
    treasury: Pubkey,
) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::Release {
            order,
            config: config_pda(),
            mint,
            vault: ata(&order, &mint),
            seller_token,
            treasury,
            token_program: anchor_spl::token::ID,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::Release {}.data(),
    }
}

pub fn update_config_ix(admin: Pubkey, treasury: Pubkey, args: ConfigArgs) -> Instruction {
    Instruction {
        program_id: vaultix_escrow::id(),
        accounts: vaultix_escrow::accounts::UpdateConfig {
            admin,
            config: config_pda(),
            treasury,
        }
        .to_account_metas(None),
        data: vaultix_escrow::instruction::UpdateConfig { args }.data(),
    }
}

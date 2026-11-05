//! `close_order` after reaching each status through the real instructions.
mod common;

use anchor_lang::prelude::Pubkey;
use common::{
    assert_program_error, ata, close_order_ix, confirm_receipt_ix, mark_shipped_ix,
    open_dispute_ix, pay_ix, refund_unshipped_ix, resolve_dispute_ix, Parties, Protocol, TestEnv,
    ONE_USDC,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;
const DEPOSIT: u64 = 5 * ONE_USDC;
/// Default `ship_deadline_secs` (5 days).
const SHIP_DEADLINE: i64 = 432_000;

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    buyer: Keypair,
    order: Pubkey,
    parties: Parties,
}

impl Setup {
    fn paid() -> Self {
        let mut env = TestEnv::new();
        let protocol = env.init_protocol();
        let seller = env.funded_keypair();
        let seller_token = env.create_ata(&protocol.mint, &seller.pubkey());
        // `create_order` makes the seller the rent payer.
        let order = env.create_order(&protocol, &seller, 1, AMOUNT);
        let (buyer, buyer_token) = env.funded_user(&protocol, AMOUNT + DEPOSIT);
        let ix = pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
        env.send(&[ix], &[&buyer]).unwrap();
        let parties = Parties {
            buyer_token,
            seller_token,
            treasury: protocol.treasury,
        };
        Self {
            env,
            protocol,
            seller,
            buyer,
            order,
            parties,
        }
    }

    fn shipped() -> Self {
        let mut s = Self::paid();
        let ix = mark_shipped_ix(s.order, s.seller.pubkey(), None);
        s.env.send(&[ix], &[&s.seller]).unwrap();
        s
    }

    fn disputed() -> Self {
        let mut s = Self::shipped();
        let ix = open_dispute_ix(
            s.order,
            s.protocol.mint,
            s.buyer.pubkey(),
            s.parties.buyer_token,
        );
        s.env.send(&[ix], &[&s.buyer]).unwrap();
        s
    }

    fn released() -> Self {
        let mut s = Self::shipped();
        let ix = confirm_receipt_ix(
            s.order,
            s.protocol.mint,
            s.buyer.pubkey(),
            s.parties.seller_token,
            s.parties.treasury,
        );
        s.env.send(&[ix], &[&s.buyer]).unwrap();
        s
    }

    fn refunded() -> Self {
        let mut s = Self::paid();
        s.env.advance_time(SHIP_DEADLINE + 1);
        let ix = refund_unshipped_ix(s.order, s.protocol.mint, s.parties.buyer_token);
        s.env.send(&[ix], &[]).unwrap();
        s
    }

    fn resolved() -> Self {
        let mut s = Self::disputed();
        let ix = resolve_dispute_ix(
            s.order,
            s.protocol.mint,
            s.protocol.arbiter.pubkey(),
            &s.parties,
            3_333,
        );
        s.env.send(&[ix], &[&s.protocol.arbiter]).unwrap();
        s
    }

    fn vault(&self) -> Pubkey {
        ata(&self.order, &self.protocol.mint)
    }

    // TxResult is LiteSVM's own result type; boxing it would only add noise in tests.
    #[allow(clippy::result_large_err)]
    fn close_by(&mut self, caller: &Keypair) -> common::TxResult {
        let ix = close_order_ix(
            self.order,
            self.protocol.mint,
            caller.pubkey(),
            self.seller.pubkey(),
        );
        self.env.send(&[ix], &[caller])
    }
}

#[test]
fn anyone_closes_final_orders_and_rent_returns_to_rent_payer() {
    let cases: [(fn() -> Setup, OrderStatus); 3] = [
        (Setup::released, OrderStatus::Released),
        (Setup::refunded, OrderStatus::Refunded),
        (Setup::resolved, OrderStatus::Resolved),
    ];
    for (reach, status) in cases {
        let mut s = reach();
        assert_eq!(s.env.read_order(&s.order).status, status);
        assert_eq!(s.env.token_balance(&s.vault()), 0, "{status:?}");

        let rent_payer = s.seller.pubkey();
        let expected =
            s.env.lamports(&rent_payer) + s.env.lamports(&s.order) + s.env.lamports(&s.vault());

        let stranger = s.env.funded_keypair();
        s.close_by(&stranger).unwrap();

        assert!(!s.env.account_exists(&s.order), "{status:?}");
        assert!(!s.env.account_exists(&s.vault()), "{status:?}");
        assert_eq!(s.env.lamports(&rent_payer), expected, "{status:?}");
    }
}

#[test]
fn close_fails_while_funds_are_locked() {
    let cases: [(fn() -> Setup, OrderStatus); 3] = [
        (Setup::paid, OrderStatus::Paid),
        (Setup::shipped, OrderStatus::Shipped),
        (Setup::disputed, OrderStatus::Disputed),
    ];
    for (reach, status) in cases {
        let mut s = reach();
        assert_eq!(s.env.read_order(&s.order).status, status);
        let vault_before = s.env.token_balance(&s.vault());

        // Not even the seller can close.
        let seller = s.seller.insecure_clone();
        let res = s.close_by(&seller);
        assert_program_error(&res, VaultixError::InvalidStatus);
        assert!(s.env.account_exists(&s.order), "{status:?}");
        assert_eq!(s.env.token_balance(&s.vault()), vault_before);
    }
}

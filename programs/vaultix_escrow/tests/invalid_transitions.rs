//! Table test: every instruction × every status it doesn't accept → `InvalidStatus`.
//!
//! The order is paid for real (buyer set, vault funded) and then its status is
//! overwritten, so each case passes the account constraints and only the status
//! check can reject it. Signers are always the legitimate ones.
mod common;

use anchor_lang::{prelude::Pubkey, solana_program::instruction::Instruction};
use common::{
    assert_program_error, close_order_ix, confirm_receipt_ix, mark_shipped_ix, open_dispute_ix,
    pay_ix, refund_unshipped_ix, release_ix, resolve_dispute_ix, Parties, Protocol, TestEnv,
    ONE_USDC,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use vaultix_escrow::{errors::VaultixError, state::OrderStatus};

const AMOUNT: u64 = 100 * ONE_USDC;

const ALL_STATUSES: [OrderStatus; 7] = [
    OrderStatus::Created,
    OrderStatus::Paid,
    OrderStatus::Shipped,
    OrderStatus::Disputed,
    OrderStatus::Released,
    OrderStatus::Refunded,
    OrderStatus::Resolved,
];

#[derive(Clone, Copy, Debug)]
enum Ix {
    Pay,
    MarkShipped,
    RefundUnshipped,
    ConfirmReceipt,
    Release,
    OpenDispute,
    ResolveDispute,
    CloseOrder,
}

impl Ix {
    const ALL: [Ix; 8] = [
        Ix::Pay,
        Ix::MarkShipped,
        Ix::RefundUnshipped,
        Ix::ConfirmReceipt,
        Ix::Release,
        Ix::OpenDispute,
        Ix::ResolveDispute,
        Ix::CloseOrder,
    ];

    /// Entry statuses from the state machine (02 §1.3–1.4).
    fn allowed(self) -> &'static [OrderStatus] {
        use OrderStatus::*;
        match self {
            Ix::Pay => &[Created],
            Ix::MarkShipped | Ix::RefundUnshipped => &[Paid],
            Ix::ConfirmReceipt | Ix::Release | Ix::OpenDispute => &[Shipped],
            Ix::ResolveDispute => &[Disputed],
            Ix::CloseOrder => &[Created, Released, Refunded, Resolved],
        }
    }
}

struct Setup {
    env: TestEnv,
    protocol: Protocol,
    seller: Keypair,
    buyer: Keypair,
    order: Pubkey,
    parties: Parties,
}

fn paid_order() -> Setup {
    let mut env = TestEnv::new();
    let protocol = env.init_protocol();
    let seller = env.funded_keypair();
    let seller_token = env.create_ata(&protocol.mint, &seller.pubkey());
    let order = env.create_order(&protocol, &seller, 1, AMOUNT);
    // Enough left after paying to cover a dispute deposit.
    let (buyer, buyer_token) = env.funded_user(&protocol, 2 * AMOUNT);
    let ix = pay_ix(order, protocol.mint, buyer.pubkey(), buyer_token);
    env.send(&[ix], &[&buyer]).unwrap();
    let parties = Parties {
        buyer_token,
        seller_token,
        treasury: protocol.treasury,
    };
    Setup {
        env,
        protocol,
        seller,
        buyer,
        order,
        parties,
    }
}

/// The instruction plus its legitimate signer (`None` = permissionless).
fn build(s: &Setup, ix: Ix) -> (Instruction, Option<&Keypair>) {
    let (order, mint, p) = (s.order, s.protocol.mint, &s.parties);
    match ix {
        Ix::Pay => (
            pay_ix(order, mint, s.buyer.pubkey(), p.buyer_token),
            Some(&s.buyer),
        ),
        Ix::MarkShipped => (
            mark_shipped_ix(order, s.seller.pubkey(), None),
            Some(&s.seller),
        ),
        Ix::RefundUnshipped => (refund_unshipped_ix(order, mint, p.buyer_token), None),
        Ix::ConfirmReceipt => (
            confirm_receipt_ix(order, mint, s.buyer.pubkey(), p.seller_token, p.treasury),
            Some(&s.buyer),
        ),
        Ix::Release => (release_ix(order, mint, p.seller_token, p.treasury), None),
        Ix::OpenDispute => (
            open_dispute_ix(order, mint, s.buyer.pubkey(), p.buyer_token),
            Some(&s.buyer),
        ),
        Ix::ResolveDispute => (
            resolve_dispute_ix(order, mint, s.protocol.arbiter.pubkey(), p, 5_000),
            Some(&s.protocol.arbiter),
        ),
        Ix::CloseOrder => (
            close_order_ix(order, mint, s.seller.pubkey(), s.seller.pubkey()),
            Some(&s.seller),
        ),
    }
}

#[test]
fn every_instruction_rejects_every_status_outside_the_state_machine() {
    let mut cases = 0;
    for ix in Ix::ALL {
        for status in ALL_STATUSES {
            if ix.allowed().contains(&status) {
                continue;
            }
            let mut s = paid_order();
            let mut order = s.env.read_order(&s.order);
            order.status = status;
            s.env.write_order(&s.order, &order);

            let (instruction, signer) = build(&s, ix);
            let signer = signer.map(Keypair::insecure_clone);
            let signers: Vec<&Keypair> = signer.iter().collect();
            let res = s.env.send(&[instruction], &signers);

            assert!(
                res.is_err(),
                "{ix:?} should fail in {status:?}, but it succeeded"
            );
            assert_program_error(&res, VaultixError::InvalidStatus);
            assert_eq!(
                s.env.read_order(&s.order).status,
                status,
                "{ix:?} changed the status from {status:?}"
            );
            cases += 1;
        }
    }
    // 8 instructions × 7 statuses − 11 allowed pairs.
    assert_eq!(cases, 45);
}

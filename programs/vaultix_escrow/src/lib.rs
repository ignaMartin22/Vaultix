use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg");

#[program]
pub mod vaultix_escrow {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, args: ConfigArgs) -> Result<()> {
        handle_initialize_config(ctx, args)
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: ConfigArgs) -> Result<()> {
        handle_update_config(ctx, args)
    }

    pub fn create_order(
        ctx: Context<CreateOrder>,
        order_id: u64,
        amount: u64,
        listing_hash: [u8; 32],
    ) -> Result<()> {
        handle_create_order(ctx, order_id, amount, listing_hash)
    }

    pub fn pay(ctx: Context<Pay>) -> Result<()> {
        handle_pay(ctx)
    }

    pub fn close_order(ctx: Context<CloseOrder>) -> Result<()> {
        handle_close_order(ctx)
    }
}

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;

declare_id!("Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg");

#[program]
pub mod vaultix_escrow {}

use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum PriceValidationInstruction {
    InitializeState {

        price_feed_pubkey: Pubkey,
        tolerance_basis_points: u16,
    },
    UpdateConfig {

        price_feed_pubkey: Option<Pubkey>,
        
        tolerance_basis_points: Option<u16>,
    },
} 
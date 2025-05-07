use anchor_lang::prelude::*;
use num_derive::FromPrimitive;
use solana_program::{
    program_error::ProgramError,
    decode_error::DecodeError,
};
use thiserror::Error;

#[derive(Error, Debug, Clone, FromPrimitive)]
pub enum PriceValidationError {
    #[error("Invalid oracle feed")]
    InvalidOracleFeed,
    
    #[error("Invalid oracle data")]
    InvalidOracleData,
    
    #[error("Price out of acceptable range")]
    PriceOutOfRange,
}

impl From<PriceValidationError> for ProgramError {
    fn from(e: PriceValidationError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for PriceValidationError {
    fn type_of() -> &'static str {
        "PriceValidationError"
    }
} 
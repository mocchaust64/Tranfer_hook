use anchor_lang::prelude::*;
use num_derive::FromPrimitive;
use solana_program::{
    program_error::ProgramError,
    decode_error::DecodeError,
};
use thiserror::Error;

#[derive(Error, Debug, Clone, FromPrimitive)]
pub enum EarthquakeInsuranceError {
    #[error("Invalid Switchboard feed")]
    InvalidFeed,
    
    #[error("Invalid Switchboard data")]
    InvalidOracleData,
    
    #[error("Earthquake magnitude is below threshold")]
    MagnitudeBelowThreshold,

    #[error("User location not registered")]
    UserLocationNotRegistered,

    #[error("Region not supported")]
    RegionNotSupported,

    #[error("Invalid instruction")]
    InvalidInstruction,

    #[error("Destination not authorized for claim")]
    UnauthorizedClaim,

    #[error("Invalid user account data")]
    InvalidUserData,

    #[error("Insurance claim already processed")]
    ClaimAlreadyProcessed,
    
    #[error("Insurance policy expired")]
    PolicyExpired,
    
    #[error("Insurance policy not active yet")]
    PolicyNotActive,
    
    #[error("Claim amount exceeds insured amount")]
    ExcessClaimAmount,
    
    #[error("Premium payment insufficient")]
    InsufficientPremium,
}

impl From<EarthquakeInsuranceError> for ProgramError {
    fn from(e: EarthquakeInsuranceError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for EarthquakeInsuranceError {
    fn type_of() -> &'static str {
        "EarthquakeInsuranceError"
    }
} 
use anchor_lang::prelude::*;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::sysvar::{Sysvar, rent::Rent};
use anchor_lang::solana_program::program_error::ProgramError;
use std::str::FromStr;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;

declare_id!("BVXu4oZsj9EHbthGov1ygmVx333cUoT1HaiD6DJS7aph");

#[error_code]
pub enum PriceValidationError {
    #[msg("Payment price is outside of the allowed range")]
    PriceOutOfRange,
    #[msg("Invalid instruction")]
    InvalidInstruction,
}


#[program]
pub mod price_validation_transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        let (state_pubkey, _) = Pubkey::find_program_address(&[b"state_v3"], ctx.program_id);
        msg!("Initializing extra account meta list for mint: {}", ctx.accounts.mint.key);
        msg!("State PDA: {}", state_pubkey);
        
        let extra_account_metas = vec![
            (
                state_pubkey,  
                false,        
                false,         
            ),
        ];
        
        let account_metas_size = 1 + extra_account_metas.len() * 34; 
        
        if ctx.accounts.extra_account_metas.owner != ctx.program_id {
            let rent = Rent::get()?;
            let lamports = rent.minimum_balance(account_metas_size);
            
            msg!("Creating account with {} lamports for rent exemption", lamports);
            invoke(
                &system_instruction::create_account(
                    ctx.accounts.authority.key,
                    ctx.accounts.extra_account_metas.key,
                    lamports,
                    account_metas_size as u64,
                    ctx.program_id,
                ),
                &[
                    ctx.accounts.authority.to_account_info(),
                    ctx.accounts.extra_account_metas.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            msg!("Account created successfully");
        }        
        msg!("Initializing extra account meta data");

        let mut data = ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
        data.fill(0);
        data[0] = extra_account_metas.len() as u8;
        msg!("Number of extra account metas: {}", data[0]);
        let mut offset = 1;
        for (pubkey, is_signer, is_writable) in extra_account_metas {
            data[offset..offset+32].copy_from_slice(pubkey.as_ref());
            data[offset+32] = is_signer as u8;
            data[offset+33] = is_writable as u8;
            msg!("Added extra account meta: {}", pubkey);
            msg!("is_signer: {}, is_writable: {}", is_signer, is_writable);
            offset += 34; 
        }   
        msg!("Extra account meta list initialized successfully");
        Ok(())
    }

    pub fn transfer_hook(_ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        msg!("Transfer hook called - UPDATED");
        
        let current_price = amount / 1_000_000_000;
        
        let expected_price: u64 = 1000;
        let tolerance_basis_points: u64 = 2000;
        
        let lower_bound = expected_price - (expected_price * tolerance_basis_points / 10000);
        let upper_bound = expected_price + (expected_price * tolerance_basis_points / 10000);
        
        msg!("PRICE DETAILS - Amount: {}, current: {}, expected: {}, range: [{}, {}]", 
             amount, current_price, expected_price, lower_bound, upper_bound);
        
        if current_price >= lower_bound && current_price <= upper_bound {
            msg!("Valid price, allowing token transfer");
            Ok(())
        } else {
            msg!("Invalid price ({}), rejecting token transfer", current_price);
            Err(PriceValidationError::PriceOutOfRange.into())
        }
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        msg!("Fallback called - UPDATED");
        
        let instruction = match TransferHookInstruction::unpack(data) {
            Ok(ix) => ix,
            Err(err) => {
                msg!("Error parsing instruction: {}", err);
                return Err(PriceValidationError::InvalidInstruction.into());
            }
        };
        
        match instruction {
            TransferHookInstruction::Execute { amount } => {
                msg!("Execute with amount: {}", amount);
                
                let current_price = amount / 1_000_000_000;
                
                let expected_price: u64 = 1000;
                let tolerance_basis_points: u64 = 2000;
                
                let lower_bound = expected_price - (expected_price * tolerance_basis_points / 10000);
                let upper_bound = expected_price + (expected_price * tolerance_basis_points / 10000);
                
                msg!("PRICE DETAILS - Amount: {}, current: {}, expected: {}, range: [{}, {}]", 
                     amount, current_price, expected_price, lower_bound, upper_bound);
                
                if current_price >= lower_bound && current_price <= upper_bound {
                    msg!("Valid price, allowing token transfer");
                    Ok(())
                } else {
                    msg!("Invalid price ({}), rejecting token transfer", current_price);
                    return Err(PriceValidationError::PriceOutOfRange.into());
                }
            }
            _ => {
                msg!("Instruction not supported");
                return Err(PriceValidationError::InvalidInstruction.into());
            }
        }
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: Passed from token program via CPI, no additional checks needed
    pub source: AccountInfo<'info>,
    /// CHECK: Passed from token program via CPI, no additional checks needed
    pub mint: AccountInfo<'info>,
    /// CHECK: Passed from token program via CPI, no additional checks needed
    pub destination: AccountInfo<'info>,
    /// CHECK: Passed from token program via CPI, no additional checks needed
    pub owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    /// CHECK: This account will be created in the initialize_extra_account_meta_list function
    pub extra_account_metas: AccountInfo<'info>,
    /// CHECK: Token mint used to create extra account meta list
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}





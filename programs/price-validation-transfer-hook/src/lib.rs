use anchor_lang::prelude::*;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::sysvar::{Sysvar, rent::Rent};
use anchor_lang::solana_program::program_error::ProgramError;
use std::str::FromStr;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;
use switchboard_v2::{AggregatorAccountData, SwitchboardDecimal};

declare_id!("BVXu4oZsj9EHbthGov1ygmVx333cUoT1HaiD6DJS7aph");

#[error_code]
pub enum PriceValidationError {
    #[msg("Payment price is outside of the allowed range")]
    PriceOutOfRange,
    #[msg("Invalid instruction")]
    InvalidInstruction,
    #[msg("Failed to get price from Switchboard feed")]
    SwitchboardError,
    #[msg("Price validation is not active")]
    PriceValidationNotActive,
}


#[program]
pub mod price_validation_transfer_hook {
    use super::*;


    pub fn initialize_state(
        ctx: Context<InitializeState>,
        tolerance_basis_points: u64,
        is_price_validation_active: bool
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.product_price_feed_pubkey = ctx.accounts.product_price_feed.key();
        state.token_usd_price_feed_pubkey = ctx.accounts.token_usd_price_feed.key();
        state.tolerance_basis_points = tolerance_basis_points;
        state.is_price_validation_active = is_price_validation_active;

        msg!("State initialized with product price feed: {}", state.product_price_feed_pubkey);
        msg!("State initialized with token/USD price feed: {}", state.token_usd_price_feed_pubkey);
        msg!("Tolerance basis points: {}", state.tolerance_basis_points);
        msg!("Price validation active: {}", state.is_price_validation_active);

        Ok(())
    }

    pub fn update_price_validation_config(
        ctx: Context<UpdateConfig>,
        product_price_feed_pubkey: Option<Pubkey>,
        token_usd_price_feed_pubkey: Option<Pubkey>,
        is_active: Option<bool>,
        tolerance_basis_points: Option<u64>,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        
        if let Some(feed) = product_price_feed_pubkey {
            state.product_price_feed_pubkey = feed;
            msg!("Updated product price feed: {}", feed);
        }
        
        if let Some(feed) = token_usd_price_feed_pubkey {
            state.token_usd_price_feed_pubkey = feed;
            msg!("Updated token/USD price feed: {}", feed);
        }
        
        if let Some(active) = is_active {
            state.is_price_validation_active = active;
            msg!("Updated price validation active status: {}", active);
        }
        
        if let Some(tolerance) = tolerance_basis_points {
            state.tolerance_basis_points = tolerance;
            msg!("Updated tolerance basis points: {}", tolerance);
        }
        
        Ok(())
    }

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        let (state_pubkey, _) = Pubkey::find_program_address(&[b"state_v3"], ctx.program_id);
        msg!("Initializing extra account meta list for mint: {}", ctx.accounts.mint.key);
        msg!("State PDA: {}", state_pubkey);
        
        // Lấy địa chỉ của hai feed giá
        let (product_price_feed_pubkey, _) = Pubkey::find_program_address(&[b"product_price_feed"], ctx.program_id);
        let (token_usd_price_feed_pubkey, _) = Pubkey::find_program_address(&[b"token_usd_price_feed"], ctx.program_id);
        
        msg!("Product price feed PDA: {}", product_price_feed_pubkey);
        msg!("Token/USD price feed PDA: {}", token_usd_price_feed_pubkey);
        
        let extra_account_metas = vec![
            (
                state_pubkey, 
                false,        
                false,        
            ),
            (
                product_price_feed_pubkey,
                false,            
                false,            
            ),
            (
                token_usd_price_feed_pubkey,
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

    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        msg!("Transfer hook executing with amount: {}", amount);
        
        let state = &ctx.accounts.state;
        
    
        if !state.is_price_validation_active {
            msg!("Price validation is not active, allowing transfer");
            return Ok(());
        }
        
     
        let product_price_feed = &ctx.accounts.product_price_feed;
        let product_feed_data = match AggregatorAccountData::new(product_price_feed) {
            Ok(data) => data,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };
        
        let product_price_result = match product_feed_data.get_result() {
            Ok(result) => result,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };
        
        let product_price = product_price_result.mantissa / 10u128.pow(product_price_result.scale as u32);
        let product_price = match u64::try_from(product_price) {
            Ok(price) => price,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };
        
        
        let token_usd_price_feed = &ctx.accounts.token_usd_price_feed;
        let token_usd_feed_data = match AggregatorAccountData::new(token_usd_price_feed) {
            Ok(data) => data,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };
        
        let token_usd_price_result = match token_usd_feed_data.get_result() {
            Ok(result) => result,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };
        
        let token_usd_price = token_usd_price_result.mantissa / 10u128.pow(token_usd_price_result.scale as u32);
        let token_usd_price = match u64::try_from(token_usd_price) {
            Ok(price) => price,
            Err(_) => return Err(PriceValidationError::SwitchboardError.into()),
        };

        msg!("Product price from Switchboard: {}", product_price);
        msg!("Token/USD price from Switchboard: {}", token_usd_price);

       
        let expected_token_amount = if token_usd_price > 0 {
            (product_price * 1_000_000_000) / token_usd_price
        } else {
            return Err(PriceValidationError::SwitchboardError.into());
        };
        
        let deviation_amount = (expected_token_amount * state.tolerance_basis_points) / 10000;
        let min_acceptable_amount = expected_token_amount.saturating_sub(deviation_amount);
        let max_acceptable_amount = expected_token_amount.saturating_add(deviation_amount);

        msg!("Expected token amount: {}", expected_token_amount);
        msg!("Acceptable amount range: [{}, {}]", min_acceptable_amount, max_acceptable_amount);

        if amount >= min_acceptable_amount && amount <= max_acceptable_amount {
            msg!("Valid amount ({}), allowing token transfer", amount);
            Ok(())
        } else {
            msg!("Invalid amount ({}), rejecting token transfer", amount);
            Err(PriceValidationError::PriceOutOfRange.into())
        }
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        msg!("Fallback called");
        
        let instruction = match TransferHookInstruction::unpack(data) {
            Ok(ix) => ix,
            Err(_) => {
                msg!("Error parsing instruction");
                return Err(PriceValidationError::InvalidInstruction.into());
            }
        };
        
        match instruction {
            TransferHookInstruction::Execute { amount } => {
                msg!("Execute with amount: {}", amount);
                
                if accounts.len() < 8 {
                    msg!("Not enough accounts provided");
                    return Err(PriceValidationError::InvalidInstruction.into());
                }
                
                let state_account = &accounts[5];
                let product_price_feed_account = &accounts[6];
                let token_usd_price_feed_account = &accounts[7];
                
                let state_data = state_account.try_borrow_data()?;
                if state_data.len() < 8 + 32 + 32 + 8 + 1 { 
                    msg!("Invalid state account data");
                    return Err(PriceValidationError::InvalidInstruction.into());
                }
                
                let is_validation_active = state_data[72] != 0;
                if !is_validation_active {
                    msg!("Price validation is not active, allowing transfer");
                    return Ok(());
                }
                
                let tolerance_basis_points = u64::from_le_bytes([
                    state_data[64], state_data[65], state_data[66], state_data[67],
                    state_data[68], state_data[69], state_data[70], state_data[71],
                ]);
                
                let product_feed_data = match AggregatorAccountData::new(product_price_feed_account) {
                    Ok(data) => data,
                    Err(_) => {
                        msg!("Failed to read product price aggregator data");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                let product_price_result = match product_feed_data.get_result() {
                    Ok(result) => result,
                    Err(_) => {
                        msg!("Failed to get result from product price aggregator");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                let product_price = product_price_result.mantissa / 10u128.pow(product_price_result.scale as u32);
                let product_price = match u64::try_from(product_price) {
                    Ok(price) => price,
                    Err(_) => {
                        msg!("Failed to convert product price to u64");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                let token_usd_feed_data = match AggregatorAccountData::new(token_usd_price_feed_account) {
                    Ok(data) => data,
                    Err(_) => {
                        msg!("Failed to read token/USD price aggregator data");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                let token_usd_price_result = match token_usd_feed_data.get_result() {
                    Ok(result) => result,
                    Err(_) => {
                        msg!("Failed to get result from token/USD price aggregator");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                let token_usd_price = token_usd_price_result.mantissa / 10u128.pow(token_usd_price_result.scale as u32);
                let token_usd_price = match u64::try_from(token_usd_price) {
                    Ok(price) => price,
                    Err(_) => {
                        msg!("Failed to convert token/USD price to u64");
                        return Err(PriceValidationError::SwitchboardError.into());
                    }
                };
                
                msg!("Product price from Switchboard: {}", product_price);
                msg!("Token/USD price from Switchboard: {}", token_usd_price);
                
                let expected_token_amount = if token_usd_price > 0 {
                    (product_price * 1_000_000_000) / token_usd_price
                } else {
                    return Err(PriceValidationError::SwitchboardError.into());
                };
                
                let deviation_amount = (expected_token_amount * tolerance_basis_points) / 10000;
                let min_acceptable_amount = expected_token_amount.saturating_sub(deviation_amount);
                let max_acceptable_amount = expected_token_amount.saturating_add(deviation_amount);
                
                msg!("PRICE DETAILS - Expected token amount: {}, Proposed: {}, Range: [{}, {}]", 
                     expected_token_amount, amount, min_acceptable_amount, max_acceptable_amount);
                
                if amount >= min_acceptable_amount && amount <= max_acceptable_amount {
                    msg!("Valid amount, allowing token transfer");
                    Ok(())
                } else {
                    msg!("Invalid amount ({}), rejecting token transfer", amount);
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


#[account]
pub struct PriceValidationState {
    pub product_price_feed_pubkey: Pubkey,
    pub token_usd_price_feed_pubkey: Pubkey,
    pub tolerance_basis_points: u64,
    pub is_price_validation_active: bool,
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
    /// CHECK: Extra account meta list
    pub extra_account_meta_list: AccountInfo<'info>,
    /// State account containing configuration
    #[account(seeds = [b"state_v3"], bump)]
    pub state: Account<'info, PriceValidationState>,
    /// CHECK: Switchboard product price feed account
    pub product_price_feed: AccountInfo<'info>,
    /// CHECK: Switchboard token/USD price feed account
    pub token_usd_price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(mut, seeds = [b"state_v3"], bump)]
    pub state: Account<'info, PriceValidationState>,
    #[account(mut)]
    pub authority: Signer<'info>,
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

#[derive(Accounts)]
pub struct InitializeState<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 8 + 1, 
        seeds = [b"state_v3"],
        bump
    )]
    pub state: Account<'info, PriceValidationState>,
    /// CHECK: Switchboard product price feed account
    pub product_price_feed: AccountInfo<'info>,
    /// CHECK: Switchboard token/USD price feed account
    pub token_usd_price_feed: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}





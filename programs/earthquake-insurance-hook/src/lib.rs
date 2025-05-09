use anchor_lang::prelude::*;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::sysvar::{Sysvar, rent::Rent};
use anchor_lang::solana_program::system_instruction;
use spl_transfer_hook_interface::instruction::TransferHookInstruction;
use switchboard_v2::{AggregatorAccountData, SwitchboardDecimal};

pub mod error;
pub mod instruction;

use error::EarthquakeInsuranceError;
use instruction::{InsuranceInstruction, Region};

declare_id!("Eq5YbT6NWnB44SRaxF1PkNamVdfTPkvieYRyuRQXiXMn");

#[program]
pub mod earthquake_insurance_hook {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>, threshold_magnitude: f64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        
     
        if threshold_magnitude < 2.0 || threshold_magnitude > 9.0 {
            return Err(error!(EarthquakeInsuranceError::InvalidOracleData));
        }
        
     
        config.threshold_magnitude = (threshold_magnitude * 100.0) as u64;
        config.authority = ctx.accounts.authority.key();
        
        msg!("Earthquake insurance config initialized with threshold: {}", threshold_magnitude);
        Ok(())
    }

    pub fn update_region_feed(
        ctx: Context<UpdateRegionFeed>,
        region: Region,
        feed_pubkey: Pubkey
    ) -> Result<()> {
        let feeds = &mut ctx.accounts.region_feeds;
        
        match region {
            Region::Northeast => feeds.northeast_feed = feed_pubkey,
            Region::Southeast => feeds.southeast_feed = feed_pubkey,
            Region::Midwest => feeds.midwest_feed = feed_pubkey,
            Region::Southwest => feeds.southwest_feed = feed_pubkey,
            Region::West => feeds.west_feed = feed_pubkey,
        }
        
        msg!("Updated feed for region {:?}: {}", region, feed_pubkey);
        Ok(())
    }

    pub fn register_user_location(
        ctx: Context<RegisterUserLocation>,
        region: Region,
        insurance_amount: u64,
        premium: u64,
        duration_in_days: u64
    ) -> Result<()> {
        let mut user_account_data = ctx.accounts.user_account.load_init()?;
        let user = &ctx.accounts.user;
        
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp;
        let end_timestamp = current_timestamp + (duration_in_days as i64 * 24 * 60 * 60);
        
        user_account_data.owner = user.key();
        user_account_data.region = region as u8;
        user_account_data.has_claimed = false;
        user_account_data.insurance_amount = insurance_amount;
        user_account_data.premium_paid = premium;
        user_account_data.policy_start_time = current_timestamp;
        user_account_data.policy_end_time = end_timestamp;
        
        msg!("User {} registered in region {:?}", user.key(), region);
        msg!("Insurance amount: {}, Premium: {}, Validity: {} days", 
            insurance_amount, premium, duration_in_days);
        Ok(())
    }

    pub fn initialize_extra_account_meta_list(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
        let (config_pubkey, _) = Pubkey::find_program_address(&[b"config"], ctx.program_id);
        let (region_feeds_pubkey, _) = Pubkey::find_program_address(&[b"region_feeds"], ctx.program_id);
        
        msg!("Initializing extra account meta list for mint: {}", ctx.accounts.mint.key());
        msg!("Config PDA: {}", config_pubkey);
        msg!("Region feeds PDA: {}", region_feeds_pubkey);
        
     
        let extra_account_metas = vec![
            (
                config_pubkey,
                false,
                false,
            ),
            (
                region_feeds_pubkey,
                false,
                false,
            ),
           
            (
                Pubkey::default(), 
                false,
                true, 
            ),
            (
                Pubkey::default(), 
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
        msg!("Transfer hook executing for earthquake insurance claim with amount: {}", amount);

        let user_data = ctx.accounts.user_account.load::<UserAccount>()?;
        
        // Kiểm tra người dùng và quyền sở hữu
        if user_data.owner != ctx.accounts.owner.key() {
            msg!("User not registered or mismatch");
            return Err(error!(EarthquakeInsuranceError::UserLocationNotRegistered));
        }
        
        // Kiểm tra đã claim chưa
        if user_data.has_claimed {
            msg!("User has already claimed insurance");
            return Err(error!(EarthquakeInsuranceError::ClaimAlreadyProcessed));
        }
        
        // Kiểm tra thời gian hiệu lực
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        if current_time < user_data.policy_start_time || current_time > user_data.policy_end_time {
            msg!("Insurance policy expired or not active");
            return Err(error!(EarthquakeInsuranceError::UnauthorizedClaim));
        }
        
        // Kiểm tra số tiền claim có phù hợp không
        if amount > user_data.insurance_amount {
            msg!("Claim amount exceeds insured amount");
            return Err(error!(EarthquakeInsuranceError::UnauthorizedClaim));
        }

        let config = &ctx.accounts.config;
        let region_feeds = &ctx.accounts.region_feeds;
        

        let region = match Region::from_u8(user_data.region) {
            Some(r) => r,
            None => return Err(error!(EarthquakeInsuranceError::RegionNotSupported)),
        };
        
        let feed_pubkey = match region {
            Region::Northeast => region_feeds.northeast_feed,
            Region::Southeast => region_feeds.southeast_feed,
            Region::Midwest => region_feeds.midwest_feed,
            Region::Southwest => region_feeds.southwest_feed,
            Region::West => region_feeds.west_feed,
        };
        
        let switchboard_feed = &ctx.accounts.switchboard_feed;
            
     
        if switchboard_feed.key() != feed_pubkey {
            msg!("Feed not matching configured feed for region. Expected: {}, Got: {}", 
                 feed_pubkey, switchboard_feed.key());
            return Err(error!(EarthquakeInsuranceError::InvalidFeed));
        }
        
 
        let feed_data = match AggregatorAccountData::new(switchboard_feed) {
            Ok(data) => data,
            Err(_) => return Err(error!(EarthquakeInsuranceError::InvalidOracleData)),
        };
        
        let magnitude_result = match feed_data.get_result() {
            Ok(result) => result,
            Err(_) => return Err(error!(EarthquakeInsuranceError::InvalidOracleData)),
        };
        
    
        let magnitude = magnitude_result.mantissa as f64 / 10f64.powi(magnitude_result.scale as i32);
        let magnitude_scaled = (magnitude * 100.0) as u64;
        
        msg!("Region: {:?}, Magnitude from feed: {}", region, magnitude);
        msg!("Threshold magnitude: {}", config.threshold_magnitude as f64 / 100.0);
        
     
        if magnitude_scaled >= config.threshold_magnitude {
            msg!("Magnitude {} exceeds threshold {}, allowing insurance claim", 
                magnitude, config.threshold_magnitude as f64 / 100.0);
            
         
            let mut user_account_data = ctx.accounts.user_account.load_mut::<UserAccount>()?;
            user_account_data.has_claimed = true;
            
            Ok(())
        } else {
            msg!("Magnitude {} below threshold {}, rejecting claim", 
                magnitude, config.threshold_magnitude as f64 / 100.0);
            Err(error!(EarthquakeInsuranceError::MagnitudeBelowThreshold))
        }
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        msg!("Fallback function called");
        
        let instruction = match TransferHookInstruction::unpack(data) {
            Ok(ix) => ix,
            Err(_) => {
                msg!("Error parsing instruction");
                return Err(error!(EarthquakeInsuranceError::InvalidInstruction));
            }
        };
        
        match instruction {
            TransferHookInstruction::Execute { amount } => {
                msg!("Execute with amount: {}", amount);
                
                if accounts.len() < 9 {
                    msg!("Not enough accounts provided. Expected at least 9, got {}", accounts.len());
                    return Err(error!(EarthquakeInsuranceError::InvalidInstruction));
                }
                
                let source_account = &accounts[0];
                let mint_account = &accounts[1];
                let destination_account = &accounts[2];
                let owner_account = &accounts[3];
                let extra_meta_account = &accounts[4];
                let config_account = &accounts[5];
                let region_feeds_account = &accounts[6];
                let user_account = &accounts[7];
                let switchboard_feed = &accounts[8];
                
                // Lấy dữ liệu từ config account
                let config_data = config_account.try_borrow_data()?;
                if config_data.len() < 8 + 8 + 32 {
                    msg!("Invalid config account data");
                    return Err(error!(EarthquakeInsuranceError::InvalidInstruction));
                }
                
                // Đọc threshold_magnitude (u64 = 8 bytes sau 8 bytes discriminator)
                let threshold_magnitude = u64::from_le_bytes([
                    config_data[8], config_data[9], config_data[10], config_data[11],
                    config_data[12], config_data[13], config_data[14], config_data[15],
                ]);
                
                // Lấy dữ liệu từ user account
                let user_data = user_account.try_borrow_data()?;
                if user_data.len() < 8 + 32 + 1 + 1 + 8 + 8 + 8 + 8 {
                    msg!("Invalid user account data");
                    return Err(error!(EarthquakeInsuranceError::InvalidUserData));
                }
                
                // Đọc owner, region và has_claimed
                let mut owner_bytes = [0u8; 32];
                owner_bytes.copy_from_slice(&user_data[8..40]); // 8 byte discriminator + 32 byte pubkey
                let owner_pubkey = Pubkey::new_from_array(owner_bytes);
                
                if owner_pubkey != *owner_account.key {
                    msg!("Owner mismatch");
                    return Err(error!(EarthquakeInsuranceError::UserLocationNotRegistered));
                }
                
                let region_value = user_data[40]; 
                let has_claimed = user_data[41] != 0; 
                
                if has_claimed {
                    msg!("User has already claimed insurance");
                    return Err(error!(EarthquakeInsuranceError::ClaimAlreadyProcessed));
                }
                
         
                let insurance_amount_bytes = &user_data[42..50]; 
                let insurance_amount = u64::from_le_bytes([
                    insurance_amount_bytes[0], insurance_amount_bytes[1], insurance_amount_bytes[2], 
                    insurance_amount_bytes[3], insurance_amount_bytes[4], insurance_amount_bytes[5], 
                    insurance_amount_bytes[6], insurance_amount_bytes[7]
                ]);
                
               
                let policy_start_time_bytes = &user_data[58..66]; 
                let policy_end_time_bytes = &user_data[66..74]; 
                
                let policy_start_time = i64::from_le_bytes([
                    policy_start_time_bytes[0], policy_start_time_bytes[1], policy_start_time_bytes[2], 
                    policy_start_time_bytes[3], policy_start_time_bytes[4], policy_start_time_bytes[5], 
                    policy_start_time_bytes[6], policy_start_time_bytes[7]
                ]);
                
                let policy_end_time = i64::from_le_bytes([
                    policy_end_time_bytes[0], policy_end_time_bytes[1], policy_end_time_bytes[2], 
                    policy_end_time_bytes[3], policy_end_time_bytes[4], policy_end_time_bytes[5], 
                    policy_end_time_bytes[6], policy_end_time_bytes[7]
                ]);
                
           
                let clock = Clock::get()?;
                let current_time = clock.unix_timestamp;
                
                if current_time < policy_start_time {
                    msg!("Insurance policy not active yet");
                    return Err(error!(EarthquakeInsuranceError::PolicyNotActive));
                }
                
                if current_time > policy_end_time {
                    msg!("Insurance policy has expired");
                    return Err(error!(EarthquakeInsuranceError::PolicyExpired));
                }
                
           
                if amount > insurance_amount {
                    msg!("Claim amount exceeds insured amount: {} > {}", amount, insurance_amount);
                    return Err(error!(EarthquakeInsuranceError::ExcessClaimAmount));
                }
                
                
                let region_feeds_data = region_feeds_account.try_borrow_data()?;
                if region_feeds_data.len() < 8 + 32 * 5 {
                    msg!("Invalid region feeds account data");
                    return Err(error!(EarthquakeInsuranceError::InvalidInstruction));
                }
                
               
                let region_offset = 8 + (region_value as usize) * 32;
                let mut feed_pubkey_bytes = [0u8; 32];
                feed_pubkey_bytes.copy_from_slice(&region_feeds_data[region_offset..region_offset+32]);
                let expected_feed_pubkey = Pubkey::new_from_array(feed_pubkey_bytes);
                
                if expected_feed_pubkey != *switchboard_feed.key {
                    msg!("Feed mismatch for region. Expected: {}, Got: {}", 
                         expected_feed_pubkey, switchboard_feed.key());
                    return Err(error!(EarthquakeInsuranceError::InvalidFeed));
                }
                
        
                let feed_data = match AggregatorAccountData::new(switchboard_feed) {
                    Ok(data) => data,
                    Err(_) => {
                        msg!("Failed to read switchboard feed data");
                        return Err(error!(EarthquakeInsuranceError::InvalidOracleData));
                    }
                };
                
                let magnitude_result = match feed_data.get_result() {
                    Ok(result) => result,
                    Err(_) => {
                        msg!("Failed to get result from switchboard feed");
                        return Err(error!(EarthquakeInsuranceError::InvalidOracleData));
                    }
                };
                
              
                let magnitude = magnitude_result.mantissa as f64 / 10f64.powi(magnitude_result.scale as i32);
                let magnitude_scaled = (magnitude * 100.0) as u64;
                
                msg!("Magnitude from feed: {}, threshold: {}", 
                    magnitude, threshold_magnitude as f64 / 100.0);
                
                if magnitude_scaled >= threshold_magnitude {
               
                    if user_account.is_writable {
                        let mut user_data = user_account.try_borrow_mut_data()?;
                        if user_data.len() > 41 {
                            user_data[41] = 1;
                        }
                    }
                    
                    msg!("Magnitude {} exceeds threshold, allowing insurance claim for amount {}", 
                        magnitude, amount);
                    Ok(())
                } else {
                    msg!("Magnitude {} below threshold, rejecting claim", magnitude);
                    Err(error!(EarthquakeInsuranceError::MagnitudeBelowThreshold))
                }
            }
            _ => {
                msg!("Instruction not supported");
                Err(error!(EarthquakeInsuranceError::InvalidInstruction))
            }
        }
    }

    pub fn record_disaster_event(
        ctx: Context<RecordDisasterEvent>,
        region: Region,
        magnitude: f64,
    ) -> Result<()> {
        let disaster_event = &mut ctx.accounts.disaster_event;
        let clock = Clock::get()?;
        
     
        if ctx.accounts.config.authority != ctx.accounts.authority.key() {
            return Err(error!(EarthquakeInsuranceError::UnauthorizedClaim));
        }
        
   
        if magnitude < 2.0 || magnitude > 9.0 {
            return Err(error!(EarthquakeInsuranceError::InvalidOracleData));
        }
        
        disaster_event.region = region as u8;
        disaster_event.magnitude = (magnitude * 100.0) as u64;
        disaster_event.timestamp = clock.unix_timestamp;
        disaster_event.verified = true;
        
        msg!("Disaster event recorded: Region {:?}, Magnitude {}, Time {}", 
             region, magnitude, clock.unix_timestamp);
        
        Ok(())
    }

    pub fn update_insurance_policy(
        ctx: Context<UpdateInsurancePolicy>,
        insurance_amount: Option<u64>,
        premium: Option<u64>,
        duration_extension_days: Option<u64>
    ) -> Result<()> {
        let mut user_account_data = ctx.accounts.user_account.load_mut::<UserAccount>()?;
        
   
        if user_account_data.owner != ctx.accounts.user.key() {
            return Err(error!(EarthquakeInsuranceError::UserLocationNotRegistered));
        }
        
      
        if user_account_data.has_claimed {
            return Err(error!(EarthquakeInsuranceError::ClaimAlreadyProcessed));
        }
        
   
        if let Some(amount) = insurance_amount {
            user_account_data.insurance_amount = amount;
            msg!("Updated insurance amount to: {}", amount);
        }
        
   
        if let Some(new_premium) = premium {
            user_account_data.premium_paid = new_premium;
            msg!("Updated premium to: {}", new_premium);
        }
        
      
        if let Some(days) = duration_extension_days {
            let extension_seconds = (days as i64) * 24 * 60 * 60;
            user_account_data.policy_end_time += extension_seconds;
            
            msg!("Extended policy end time by {} days to: {}", 
                days, user_account_data.policy_end_time);
        }
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 8 + 32, // discriminator + threshold_magnitude + authority
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, InsuranceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRegionFeed<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 * 5, 
        seeds = [b"region_feeds"],
        bump
    )]
    pub region_feeds: Account<'info, RegionFeeds>,
    
    #[account(
        mut,
        seeds = [b"config"],
        bump,
        constraint = config.authority == authority.key() @ EarthquakeInsuranceError::UnauthorizedClaim
    )]
    pub config: Account<'info, InsuranceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterUserLocation<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 1 + 1 + 8 + 8 + 8 + 8, 
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_account: AccountLoader<'info, UserAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {

    pub extra_account_metas: AccountInfo<'info>,
    

    pub mint: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
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
    
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, InsuranceConfig>,
    
    #[account(seeds = [b"region_feeds"], bump)]
    pub region_feeds: Account<'info, RegionFeeds>,
    
    #[account(
        mut,
        seeds = [b"user", owner.key().as_ref()],
        bump
    )]
    pub user_account: AccountLoader<'info, UserAccount>,
    
    /// CHECK: Switchboard feed account provided by transfer hook
    pub switchboard_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordDisasterEvent<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 1 + 8 + 8 + 1, 
        seeds = [b"disaster", region.to_string().as_bytes()],
        bump
    )]
    pub disaster_event: Account<'info, DisasterEvent>,
    
    #[account(
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, InsuranceConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateInsurancePolicy<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_account: AccountLoader<'info, UserAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[account]
pub struct InsuranceConfig {

    pub threshold_magnitude: u64,
    pub authority: Pubkey,
}

#[account]
pub struct RegionFeeds {
    pub northeast_feed: Pubkey,
    pub southeast_feed: Pubkey,
    pub midwest_feed: Pubkey,
    pub southwest_feed: Pubkey,
    pub west_feed: Pubkey,
}

#[account(zero_copy)]
pub struct UserAccount {
    pub owner: Pubkey,
    pub region: u8,
    pub has_claimed: bool,
    pub insurance_amount: u64,    
    pub premium_paid: u64,       
    pub policy_start_time: i64,   
    pub policy_end_time: i64,    
}


#[account]
pub struct DisasterEvent {
    pub region: u8,             
    pub magnitude: u64,          
    pub timestamp: i64,           
    pub verified: bool,           
} 
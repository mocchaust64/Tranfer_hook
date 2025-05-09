use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum Region {
    Northeast = 0,
    Southeast = 1,
    Midwest = 2,
    Southwest = 3,
    West = 4,
}

impl Region {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Region::Northeast),
            1 => Some(Region::Southeast),
            2 => Some(Region::Midwest),
            3 => Some(Region::Southwest),
            4 => Some(Region::West),
            _ => None,
        }
    }

    pub fn to_switchboard_pubkey(&self, program_id: &Pubkey) -> Pubkey {
        let seed = match self {
            Region::Northeast => b"northeast_feed",
            Region::Southeast => b"southeast_feed",
            Region::Midwest => b"midwest_feed",
            Region::Southwest => b"southwest_feed",
            Region::West => b"west_feed",
        };

        let (pubkey, _) = Pubkey::find_program_address(&[seed], program_id);
        pubkey
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum InsuranceInstruction {
  
    InitConfig {
  
        threshold_magnitude: f64,
    },


    RegisterUserLocation {
        region: Region,
        insurance_amount: u64,
        premium: u64,
        duration_in_days: u64,
    },


    UpdateRegionFeed {
        region: Region,
        feed_pubkey: Pubkey,
    },


    InitializeExtraAccountMetaList,

  
    ClaimInsurance {
        amount: u64,
    },

    RecordDisasterEvent {
        region: Region,
        magnitude: f64,
    }
} 
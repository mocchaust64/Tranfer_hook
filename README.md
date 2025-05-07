# Price Token Validation With Transfer Hook

A program that validates price when transferring tokens on Solana using Token Extensions.

## Overview

This project implements a transfer hook on Solana to verify token price validity during transfer transactions. The hook compares the amount of tokens being transferred (representing the token price) with a fixed expected price, and only allows the transaction if the price falls within an acceptable tolerance range (±20%).

## System Requirements

- Solana CLI ≥ 2.2
- Anchor Framework ≥ 0.31.0
- Rust

## Installation

```bash
# Clone repository
git clone <repository-url>
cd price-validation-transfer-hook

# Install dependencies
npm install

# Build Anchor program
anchor build
```

## How It Works

The transfer hook processes each token transfer by:

1. Receiving the transferred token amount (amount)
2. Converting the amount to the current price (dividing by 10^9 due to 9 decimals)
3. Comparing with a fixed expected price (1000)
4. Accepting the transaction if the price is within the ±20% range (800-1200)
5. Rejecting the transaction if the price is outside the acceptable range

## Testing

To run the test cases:

```bash
anchor test
```

The test cases include:
1. Transferring 1000 tokens (within the acceptable range) - succeeds
2. Transferring 2000 tokens (outside the acceptable range) - fails

## Deployment to Solana

```bash
# Deploy to localnet
anchor deploy

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

Note: When deploying, keep the keypair file to avoid changing the Program ID.

## Project Structure

```
├── programs/
│   └── price-validation-transfer-hook/  # Rust source code for Transfer Hook
│       ├── src/
│       │   ├── lib.rs                   # Price validation logic
│       │   ├── instruction.rs           # Instruction definitions
│       │   └── error.rs                 # Error code definitions
├── tests/
│   └── create_token_and_full_test.js    # Test case
├── Anchor.toml                          # Anchor configuration
└── README.md
```

## Development Roadmap

Currently, the program uses a fixed price to validate transactions. In the future, we plan to:

1. Integrate Switchboard Oracle to fetch real-time prices instead of using hardcoded values
2. Add configurable parameters for price tolerance
3. Support multiple token types and different price data sources

## License

MIT 
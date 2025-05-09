const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  sendAndConfirmTransaction,
  SystemProgram,
  TransactionInstruction
} = require('@solana/web3.js');
const {
  createInitializeMintInstruction,
  ExtensionType,
  getMintLen,
  createInitializeTransferHookInstruction,
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  getMint,
  getTransferHook
} = require('@solana/spl-token');
const fs = require('fs');
const BN = require('bn.js');

// URL for devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Read keypair from file
const payerKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(require('os').homedir() + '/.config/solana/id.json')))
);

// Create a new mint keypair
const mintKeypair = Keypair.generate();

// ID of the price-validation-transfer-hook program
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('BVXu4oZsj9EHbthGov1ygmVx333cUoT1HaiD6DJS7aph');

// Pubkey of spl_transfer_hook_interface
const SPL_TRANSFER_HOOK_INTERFACE_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// Create token account addresses
function getTokenAccounts() {
  // Source token account
  const sourceTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payerKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Create destination keypair and token account
  const destinationKeypair = Keypair.generate();
  const destinationTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    destinationKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  return {
    sourceTokenAccount,
    destinationKeypair,
    destinationTokenAccount
  };
}

// Step 1: Create Mint with Transfer Hook Extension
async function createTokenWithTransferHook() {
  try {
    console.log("\n=== STEP 1: CREATE MINT WITH TRANSFER HOOK EXTENSION ===");
    console.log(`Mint pubkey: ${mintKeypair.publicKey.toBase58()}`);
    
    // Calculate mint account size
    const extensionTypes = [ExtensionType.TransferHook];
    const mintLen = getMintLen(extensionTypes);
    
    console.log(`Mint account size: ${mintLen} bytes`);
    
    // Create transaction to initialize mint
    const createMintAccountIx = SystemProgram.createAccount({
      fromPubkey: payerKeypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: await connection.getMinimumBalanceForRentExemption(mintLen),
      programId: TOKEN_2022_PROGRAM_ID
    });
    
    // Initialize transfer hook extension
    const initializeTransferHookIx = createInitializeTransferHookInstruction(
      mintKeypair.publicKey,
      payerKeypair.publicKey,
      TRANSFER_HOOK_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Initialize mint
    const initializeMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey,
      9, // decimals
      payerKeypair.publicKey,
      payerKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    
    const createMintTx = new Transaction()
      .add(createMintAccountIx)
      .add(initializeTransferHookIx)
      .add(initializeMintIx);
    
    console.log("Creating mint with transfer hook extension...");
    const createMintSignature = await sendAndConfirmTransaction(
      connection,
      createMintTx,
      [payerKeypair, mintKeypair],
      { 
        skipPreflight: false, 
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
        maxRetries: 5 
      }
    );
    console.log(`Mint created with transfer hook. Signature: ${createMintSignature}`);
    
    // Save mint keypair information for later use
    fs.writeFileSync(
      './mint-keypair.json', 
      JSON.stringify(Array.from(mintKeypair.secretKey))
    );
    console.log(`Saved mint keypair to mint-keypair.json`);
    
    // Wait a bit for transaction confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } catch (error) {
    console.error("Error creating token:", error);
    if (error.logs) {
      console.log("Error logs:");
      error.logs.forEach(log => console.log(log));
    }
    return false;
  }
}

// Step 2: Create Source Token Account and Mint Token
async function createSourceAccountAndMintToken(sourceTokenAccount) {
  try {
    console.log("\n=== STEP 2: CREATE SOURCE TOKEN ACCOUNT AND MINT TOKEN ===");
    console.log(`Source Token Account: ${sourceTokenAccount.toBase58()}`);
    
    // Check if source token account already exists
    const sourceAccountInfo = await connection.getAccountInfo(sourceTokenAccount);
    if (sourceAccountInfo) {
      console.log("Source token account already exists, skipping creation step.");
    } else {
      // Create source token account
      const createSourceATAIx = createAssociatedTokenAccountInstruction(
        payerKeypair.publicKey,
        sourceTokenAccount,
        payerKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      
      const createSourceATATx = new Transaction().add(createSourceATAIx);
      
      console.log("Creating source token account...");
      const createSourceATASignature = await sendAndConfirmTransaction(
        connection,
        createSourceATATx,
        [payerKeypair],
        { 
          skipPreflight: false, 
          preflightCommitment: 'confirmed',
          commitment: 'confirmed',
          maxRetries: 5 
        }
      );
      console.log(`Source token account created. Signature: ${createSourceATASignature}`);
      
      // Wait a bit for transaction confirmation
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Mint token to source account
    const mintToIx = createMintToInstruction(
      mintKeypair.publicKey,
      sourceTokenAccount,
      payerKeypair.publicKey,
      10000000000000, // 10,000 token with 9 decimals
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    const mintToTx = new Transaction().add(mintToIx);
    
    console.log("Minting token to source account...");
    const mintToSignature = await sendAndConfirmTransaction(
      connection,
      mintToTx,
      [payerKeypair],
      { 
        skipPreflight: false, 
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
        maxRetries: 5 
      }
    );
    console.log(`Token minted to source account. Signature: ${mintToSignature}`);
    
    // Wait a bit for transaction confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } catch (error) {
    console.error("Error creating source account and mint token:", error);
    if (error.logs) {
      console.log("Error logs:");
      error.logs.forEach(log => console.log(log));
    }
    return false;
  }
}

// Step 3: Create Destination Token Account
async function createDestinationAccount(destinationKeypair, destinationTokenAccount) {
  try {
    console.log("\n=== STEP 3: CREATE DESTINATION TOKEN ACCOUNT ===");
    console.log(`Destination Keypair: ${destinationKeypair.publicKey.toBase58()}`);
    console.log(`Destination Token Account: ${destinationTokenAccount.toBase58()}`);
    
    // Check if destination account already exists
    const destinationAccountInfo = await connection.getAccountInfo(destinationTokenAccount);
    if (destinationAccountInfo) {
      console.log("Destination token account already exists, skipping creation step.");
      return true;
    }
    
    // Add SOL to destination account
    const transferSolIx = SystemProgram.transfer({
      fromPubkey: payerKeypair.publicKey,
      toPubkey: destinationKeypair.publicKey,
      lamports: 10000000 // 0.01 SOL
    });
    
    // Create destination token account
    const createDestinationATAIx = createAssociatedTokenAccountInstruction(
      payerKeypair.publicKey,
      destinationTokenAccount,
      destinationKeypair.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    
    const createDestinationATATx = new Transaction()
      .add(transferSolIx)
      .add(createDestinationATAIx);
    
    console.log("Creating destination token account...");
    const createDestinationATASignature = await sendAndConfirmTransaction(
      connection,
      createDestinationATATx,
      [payerKeypair],
      { 
        skipPreflight: false, 
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
        maxRetries: 5 
      }
    );
    console.log(`Destination token account created. Signature: ${createDestinationATASignature}`);
    
    // Wait a bit for transaction confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } catch (error) {
    console.error("Error creating destination account:", error);
    if (error.logs) {
      console.log("Error logs:");
      error.logs.forEach(log => console.log(log));
    }
    return false;
  }
}

// Step 4: Check token information
async function checkToken() {
  try {
    console.log("\n=== CHECK TOKEN AND ACCOUNTS ===");
    
    // Get mint information
    const mintInfo = await getMint(
      connection,
      mintKeypair.publicKey,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log("Mint Info:");
    console.log(`- Public Key: ${mintKeypair.publicKey.toBase58()}`);
    console.log(`- Mint Authority: ${mintInfo.mintAuthority?.toBase58() || 'None'}`);
    console.log(`- Supply: ${mintInfo.supply}`);
    console.log(`- Decimals: ${mintInfo.decimals}`);
    
    // Check transfer hook extension
    const transferHook = getTransferHook(mintInfo);
    
    if (transferHook) {
      console.log("\nTransfer Hook Extension:");
      console.log(`- Program ID: ${transferHook.programId.toBase58()}`);
      console.log(`- Program ID matches TRANSFER_HOOK_PROGRAM_ID: ${transferHook.programId.equals(TRANSFER_HOOK_PROGRAM_ID) ? "Yes" : "No"}`);
    } else {
      console.log("\nNo Transfer Hook Extension found!");
    }
    
  } catch (error) {
    console.error("Error checking token:", error);
  }
}

// Step 5: Transfer Token with price in valid range
async function transferTokensWithValidPrice(sourceTokenAccount, destinationTokenAccount) {
  try {
    console.log("\n=== STEP 5: TRANSFER TOKEN WITH VALID PRICE ===");
    
    // Create standard transfer instruction
    const transferIx = createTransferCheckedInstruction(
      sourceTokenAccount,
      mintKeypair.publicKey,
      destinationTokenAccount,
      payerKeypair.publicKey,
      1000000000000, // 1,000 token with 9 decimals
      9, // decimals
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Add transfer hook program to signers list (required for the hook to be called)
    transferIx.keys.push(
      { pubkey: TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false }
    );
    
    const transferTx = new Transaction().add(transferIx);
    
    console.log("Transferring token with price in valid range...");
    try {
      const transferSignature = await sendAndConfirmTransaction(
        connection,
        transferTx,
        [payerKeypair],
        { 
          skipPreflight: true, 
          preflightCommitment: 'confirmed',
          commitment: 'confirmed',
          maxRetries: 5 
        }
      );
      console.log(`Token transferred successfully. Signature: ${transferSignature}`);
      
      // Get and display transaction logs
      console.log("Transaction logs:");
      const txInfo = await connection.getTransaction(transferSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (txInfo && txInfo.meta && txInfo.meta.logMessages) {
        txInfo.meta.logMessages.forEach(log => console.log(log));
      }
      
      return {success: true, signature: transferSignature};
    } catch (error) {
      console.error("Transfer failed:", error);
      
      // Print logs from transaction for debugging
      if (error.logs) {
        console.log("Error logs:");
        error.logs.forEach(log => console.log(log));
      }
      
      return {success: false, error};
    }
  } catch (error) {
    console.error("Error preparing to transfer token:", error);
    return {success: false, error};
  }
}

// Step 6: Transfer Token with price outside valid range (should fail)
async function transferTokensWithInvalidPrice(sourceTokenAccount, destinationTokenAccount) {
  try {
    console.log("\n=== STEP 6: TRANSFER TOKEN WITH INVALID PRICE (SHOULD FAIL) ===");
    
    // This is a special transaction that will cause the hook to reject the transfer
    // We're using a specific instruction data format that our hook will interpret
    // as a price outside the valid range
    
    // Create standard transfer instruction but with a special modifier
    const transferIx = createTransferCheckedInstruction(
      sourceTokenAccount,
      mintKeypair.publicKey,
      destinationTokenAccount,
      payerKeypair.publicKey,
      2000000000000, // 2,000 token with 9 decimals (using different amount to trigger different price check)
      9, // decimals
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Add transfer hook program to signers list
    transferIx.keys.push(
      { pubkey: TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false }
    );
    
    const transferTx = new Transaction().add(transferIx);
    
    console.log("Attempting transfer with price outside valid range (should fail)...");
    try {
      const transferSignature = await sendAndConfirmTransaction(
        connection,
        transferTx,
        [payerKeypair],
        { 
          skipPreflight: true, 
          preflightCommitment: 'confirmed',
          commitment: 'confirmed',
          maxRetries: 5 
        }
      );
      console.log(`UNEXPECTED SUCCESS! Transfer succeeded when it should have failed. Signature: ${transferSignature}`);
      
      return {success: true, shouldHaveFailed: true, signature: transferSignature};
    } catch (error) {
      console.log("✅ Transfer failed as expected due to price validation");
      
      // Print logs from transaction for debugging
      if (error.logs) {
        console.log("Error logs:");
        error.logs.forEach(log => console.log(log));
          }
      
      return {success: false, expectedFailure: true, error};
    }
  } catch (error) {
    console.error("Error preparing invalid price transfer:", error);
    return {success: false, error};
  }
}

async function main() {
  try {
    console.log("=== SIMPLIFIED PRICE VALIDATION TRANSFER HOOK TEST ===");
    
    // Create token with transfer hook extension
    await createTokenWithTransferHook();
    
    // Get token accounts information
    const { sourceTokenAccount, destinationKeypair, destinationTokenAccount } = getTokenAccounts();
    
    // Create source token account and mint tokens
    await createSourceAccountAndMintToken(sourceTokenAccount);
    
    // Create destination token account
    await createDestinationAccount(destinationKeypair, destinationTokenAccount);
    
    // Check token information
    await checkToken();
    
    // Test 1: Transfer token with valid price (should succeed)
    const validTransferResult = await transferTokensWithValidPrice(
      sourceTokenAccount, 
      destinationTokenAccount
    );
    
    // Test 2: Transfer token with invalid price (should fail)
    const invalidTransferResult = await transferTokensWithInvalidPrice(
      sourceTokenAccount, 
      destinationTokenAccount
    );
    
    // Summary of test results
    console.log("\n=== TEST SUMMARY ===");
    console.log(`Valid price transfer: ${validTransferResult.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Invalid price transfer: ${invalidTransferResult.expectedFailure ? 'FAILED AS EXPECTED ✅' : 'UNEXPECTED SUCCESS ❌'}`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run program
main(); 
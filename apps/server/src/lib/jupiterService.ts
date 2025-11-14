/**
 * Jupiter Swap Service
 * 
 * Integrates with Jupiter Aggregator v6 API for Solana token swaps
 * Supports Grid wallet signing via transaction building
 */

import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { createGridClient } from './gridClient';

/**
 * Jupiter API endpoints (updated to new hostnames as of Oct 2025)
 * Free tier: lite-api.jup.ag (no API key required)
 * Pro tier: api.jup.ag (requires API key from portal.jup.ag)
 * 
 * Reference: https://hub.jup.ag/docs/
 * Migration guide: Old endpoints deprecated as of Oct 1, 2025
 */
const JUPITER_LITE_API = 'https://lite-api.jup.ag/swap/v1';
const JUPITER_PRO_API = 'https://api.jup.ag/swap/v1';

/**
 * Get the appropriate Jupiter API base URL based on API key availability
 */
function getJupiterApiBase(): string {
  return process.env.JUPITER_API_KEY ? JUPITER_PRO_API : JUPITER_LITE_API;
}

/**
 * Jupiter quote response
 */
export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

/**
 * Jupiter swap quote request
 */
export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number; // In smallest units (lamports for SOL, base units for SPL)
  slippageBps?: number; // Default: 50 (0.5%)
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
}

/**
 * Jupiter swap execution request
 */
export interface JupiterSwapRequest {
  quoteResponse: JupiterQuote;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
  feeAccount?: string;
}

/**
 * Jupiter swap result
 */
export interface JupiterSwapResult {
  quote: JupiterQuote;
  transaction: VersionedTransaction;
  signature?: string;
}

/**
 * Get Jupiter swap quote
 */
export async function getJupiterQuote(
  request: JupiterQuoteRequest
): Promise<JupiterQuote> {
  const {
    inputMint,
    outputMint,
    amount,
    slippageBps = 50,
    onlyDirectRoutes = false,
    asLegacyTransaction = false
  } = request;

  console.log('📊 [Jupiter] Fetching quote:', {
    inputMint,
    outputMint,
    amount,
    slippageBps
  });

  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
      onlyDirectRoutes: onlyDirectRoutes.toString(),
      asLegacyTransaction: asLegacyTransaction.toString()
    });

    // Use lite API for free tier (no API key needed)
    // Switch to pro API if JUPITER_API_KEY is set
    const apiBase = getJupiterApiBase();
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };
    
    // Add API key header if available (for pro tier)
    if (process.env.JUPITER_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JUPITER_API_KEY}`;
    }

    const response = await fetch(`${apiBase}/quote?${params}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jupiter quote API error: ${response.status} - ${error}`);
    }

    const quote = await response.json() as JupiterQuote;
    
    console.log('✅ [Jupiter] Quote received:', {
      inputAmount: quote.inAmount,
      outputAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      routes: quote.routePlan.length
    });

    return quote;
  } catch (error) {
    console.error('❌ [Jupiter] Quote fetch error:', error);
    throw error;
  }
}

/**
 * Build Jupiter swap transaction (unsigned)
 */
export async function buildJupiterSwapTransaction(
  request: JupiterSwapRequest
): Promise<string> {
  const {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol = true,
    feeAccount
  } = request;

  console.log('🔧 [Jupiter] Building swap transaction...');

  try {
    const body: any = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol,
      asLegacyTransaction: false, // Use versioned transactions
      prioritizationFeeLamports: 'auto'
    };

    if (feeAccount) {
      body.feeAccount = feeAccount;
    }

    // Use lite API for free tier (no API key needed)
    // Switch to pro API if JUPITER_API_KEY is set
    const apiBase = getJupiterApiBase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Add API key header if available (for pro tier)
    if (process.env.JUPITER_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JUPITER_API_KEY}`;
    }

    const response = await fetch(`${apiBase}/swap`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jupiter swap API error: ${response.status} - ${error}`);
    }

    const responseData = await response.json() as { swapTransaction: string };
    const { swapTransaction } = responseData;
    
    console.log('✅ [Jupiter] Swap transaction built');

    return swapTransaction; // Base64 serialized transaction
  } catch (error) {
    console.error('❌ [Jupiter] Transaction build error:', error);
    throw error;
  }
}

/**
 * Execute Jupiter swap with Grid wallet signing
 */
export async function executeJupiterSwap(
  quote: JupiterQuote,
  gridWalletAddress: string,
  gridSessionSecrets: any,
  gridSession: any,
  rpcUrl?: string
): Promise<JupiterSwapResult> {
  console.log('💱 [Jupiter] Executing swap via Grid wallet...');

  try {
    // Build unsigned transaction
    const swapTransactionBase64 = await buildJupiterSwapTransaction({
      quoteResponse: quote,
      userPublicKey: gridWalletAddress,
      wrapAndUnwrapSol: true
    });

    // Create Grid client
    const gridClient = createGridClient();

    // Prepare transaction via Grid SDK
    console.log('🔐 [Jupiter] Preparing transaction via Grid...');
    const transactionPayload = await gridClient.prepareArbitraryTransaction(
      gridWalletAddress,
      {
        transaction: swapTransactionBase64,
        fee_config: {
          currency: 'sol',
          payer_address: gridWalletAddress,
          self_managed_fees: false
        }
      }
    );

    if (!transactionPayload || !transactionPayload.data) {
      throw new Error('Failed to prepare transaction via Grid');
    }

    console.log('✅ [Jupiter] Transaction prepared');

    // Normalize sessionSecrets: Convert object with numeric keys to array if needed
    // Grid SDK expects sessionSecrets to be an array, but sometimes it comes as an object
    let normalizedSessionSecrets = gridSessionSecrets;
    if (gridSessionSecrets && !Array.isArray(gridSessionSecrets) && typeof gridSessionSecrets === 'object') {
      const keys = Object.keys(gridSessionSecrets);
      // Check if all keys are numeric strings (indicating it should be an array)
      const allNumericKeys = keys.every(key => /^\d+$/.test(key));
      if (allNumericKeys && keys.length > 0) {
        // Convert object with numeric keys to array
        normalizedSessionSecrets = keys
          .map(key => parseInt(key, 10))
          .sort((a, b) => a - b)
          .map(index => gridSessionSecrets[index.toString()]);
        console.log('🔄 [Jupiter] Normalized sessionSecrets from object to array:', {
          originalKeys: keys,
          arrayLength: normalizedSessionSecrets.length
        });
      }
    }

    // Normalize session: If it's an array, extract the first element
    // Grid SDK expects session to be an object, not an array
    let normalizedSession = gridSession;
    if (Array.isArray(gridSession) && gridSession.length > 0) {
      normalizedSession = gridSession[0];
      console.log('🔄 [Jupiter] Normalized session from array to object:', {
        arrayLength: gridSession.length,
        extractedElementType: typeof normalizedSession
      });
    } else if (gridSession && !Array.isArray(gridSession) && typeof gridSession === 'object') {
      // If session is an object with numeric keys, try to convert to array first, then extract first element
      const keys = Object.keys(gridSession);
      const allNumericKeys = keys.every(key => /^\d+$/.test(key));
      if (allNumericKeys && keys.length > 0) {
        const sessionArray = keys
          .map(key => parseInt(key, 10))
          .sort((a, b) => a - b)
          .map(index => gridSession[index.toString()]);
        normalizedSession = sessionArray[0];
        console.log('🔄 [Jupiter] Normalized session from object with numeric keys to first element:', {
          originalKeys: keys,
          extractedElementType: typeof normalizedSession
        });
      }
    }

    // Sign and send via Grid
    console.log('✍️ [Jupiter] Signing and sending transaction...');
    const result = await gridClient.signAndSend({
      sessionSecrets: normalizedSessionSecrets,
      session: normalizedSession,
      transactionPayload: transactionPayload.data,
      address: gridWalletAddress
    });

    const signature = result.transaction_signature;
    console.log('✅ [Jupiter] Swap executed:', signature);

    // Deserialize transaction for result
    const connection = new Connection(
      rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    const swapTransactionBuffer = Buffer.from(swapTransactionBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuffer);

    return {
      quote,
      transaction,
      signature
    };
  } catch (error) {
    console.error('❌ [Jupiter] Swap execution error:', error);
    throw error;
  }
}

/**
 * Get token decimals (for amount conversion)
 */
export async function getTokenDecimals(
  mintAddress: string,
  rpcUrl?: string
): Promise<number> {
  const connection = new Connection(
    rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  try {
    const mintPublicKey = new PublicKey(mintAddress);
    const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
    
    if (!mintInfo.value) {
      throw new Error('Mint account not found');
    }

    const data = mintInfo.value.data;
    if ('parsed' in data) {
      return data.parsed.info.decimals;
    }

    throw new Error('Failed to parse mint info');
  } catch (error) {
    console.error('❌ [Jupiter] Error fetching token decimals:', error);
    // Default fallbacks
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      return 9; // SOL
    }
    if (mintAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
      return 6; // USDC
    }
    return 6; // Default to 6 decimals
  }
}

/**
 * Convert human-readable amount to smallest units
 */
export async function convertToSmallestUnits(
  amount: number,
  mintAddress: string,
  rpcUrl?: string
): Promise<number> {
  const decimals = await getTokenDecimals(mintAddress, rpcUrl);
  return Math.floor(amount * Math.pow(10, decimals));
}

/**
 * Convert smallest units to human-readable amount
 */
export async function convertFromSmallestUnits(
  amount: number,
  mintAddress: string,
  rpcUrl?: string
): Promise<number> {
  const decimals = await getTokenDecimals(mintAddress, rpcUrl);
  return amount / Math.pow(10, decimals);
}

/**
 * Get popular Solana token mints
 */
export const SOLANA_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'
};

/**
 * Helper: Get Jupiter quote for USDC -> Token swap
 */
export async function getUsdcToTokenQuote(
  outputMint: string,
  usdcAmount: number,
  slippageBps: number = 50
): Promise<JupiterQuote> {
  const usdcAmountSmallest = await convertToSmallestUnits(
    usdcAmount,
    SOLANA_TOKEN_MINTS.USDC
  );

  return getJupiterQuote({
    inputMint: SOLANA_TOKEN_MINTS.USDC,
    outputMint,
    amount: usdcAmountSmallest,
    slippageBps
  });
}

/**
 * Helper: Get Jupiter quote for Token -> USDC swap
 */
export async function getTokenToUsdcQuote(
  inputMint: string,
  tokenAmount: number,
  slippageBps: number = 50
): Promise<JupiterQuote> {
  const tokenAmountSmallest = await convertToSmallestUnits(
    tokenAmount,
    inputMint
  );

  return getJupiterQuote({
    inputMint,
    outputMint: SOLANA_TOKEN_MINTS.USDC,
    amount: tokenAmountSmallest,
    slippageBps
  });
}


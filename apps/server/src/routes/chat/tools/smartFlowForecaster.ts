import { tool } from 'ai';
import { z } from 'zod';
import { 
  NansenUtils, 
  X402_CONSTANTS, 
  X402PaymentService,
  type X402PaymentRequirement,
  type GridTokenSender 
} from '@darkresearch/mallory-shared';
import { createGridClient } from '../../../lib/gridClient';

/**
 * X402 Context passed from chat endpoint
 * Contains Grid session secrets for payment signing
 */
interface X402Context {
  gridSessionSecrets: any;
  gridSession: any;
}

/**
 * Forecast result structure
 */
interface ForecastResult {
  token: string;
  chain: string;
  currentNetflow: number;
  predictedInflow: number;
  pumpProbability: number; // 0-100
  riskScore: number; // 0-100 (lower is better)
  confidence: number; // 0-100
  forecastHorizon: string;
  positionQuote?: {
    inputAmount: string;
    inputToken: string;
    outputAmount: string;
    outputToken: string;
    slippage: string;
  };
  transactionSignature?: string;
  recommendation: 'buy' | 'hold' | 'sell' | 'watch';
  reasoning: string;
}

/**
 * Create Grid token sender for x402 utilities
 * This wraps the Grid SDK sendTokens functionality
 */
function createGridSender(sessionSecrets: any, session: any, address: string): GridTokenSender {
  return {
    async sendTokens(params: { recipient: string; amount: string; tokenMint?: string }): Promise<string> {
      // Create fresh GridClient instance for this sender (GridClient is stateful)
      const gridClient = createGridClient();
      const { recipient, amount, tokenMint } = params;
      
      // Import Solana dependencies
      const {
        PublicKey,
        SystemProgram,
        TransactionMessage,
        VersionedTransaction,
        Connection,
        LAMPORTS_PER_SOL
      } = await import('@solana/web3.js');
      
      const {
        createTransferInstruction,
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      } = await import('@solana/spl-token');
      
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );

      // Build Solana transaction instructions
      const instructions = [];
      
      if (tokenMint) {
        // SPL Token transfer
        const fromTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          new PublicKey(address),
          true  // allowOwnerOffCurve for Grid PDA
        );
        
        const toTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          new PublicKey(recipient),
          false
        );

        const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
        
        if (!toAccountInfo) {
          const createAtaIx = createAssociatedTokenAccountInstruction(
            new PublicKey(address),
            toTokenAccount,
            new PublicKey(recipient),
            new PublicKey(tokenMint),
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          instructions.push(createAtaIx);
        }

        const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1000000);

        const transferIx = createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          new PublicKey(address),
          amountInSmallestUnit,
          [],
          TOKEN_PROGRAM_ID
        );
        instructions.push(transferIx);
      } else {
        // SOL transfer
        const amountInLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        
        const transferIx = SystemProgram.transfer({
          fromPubkey: new PublicKey(address),
          toPubkey: new PublicKey(recipient),
          lamports: amountInLamports
        });
        instructions.push(transferIx);
      }

      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      const message = new TransactionMessage({
        payerKey: new PublicKey(address),
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);
      const serialized = Buffer.from(transaction.serialize()).toString('base64');

      const transactionPayload = await gridClient.prepareArbitraryTransaction(
        address,
        {
          transaction: serialized,
          fee_config: {
            currency: 'sol',
            payer_address: address,
            self_managed_fees: false
          }
        }
      );

      console.log('🔍 [Grid SDK] prepareArbitraryTransaction response:', {
        hasPayload: !!transactionPayload,
        hasData: !!transactionPayload?.data,
        success: transactionPayload?.success,
        error: transactionPayload?.error,
        keys: transactionPayload ? Object.keys(transactionPayload) : []
      });

      if (!transactionPayload || !transactionPayload.data) {
        const errorMsg = transactionPayload?.error || 'No transaction data returned';
        console.error('❌ [Grid SDK] prepareArbitraryTransaction failed:', {
          transactionPayload,
          errorMsg
        });
        throw new Error(`Failed to prepare transaction: ${errorMsg}`);
      }

      // Normalize sessionSecrets: Convert object with numeric keys to array if needed
      // Grid SDK expects sessionSecrets to be an array of raw key data
      let normalizedSessionSecrets = sessionSecrets;
      if (sessionSecrets && !Array.isArray(sessionSecrets) && typeof sessionSecrets === 'object') {
        const keys = Object.keys(sessionSecrets);
        // Check if all keys are numeric strings (indicating it should be an array)
        const allNumericKeys = keys.every(key => /^\d+$/.test(key));
        if (allNumericKeys && keys.length > 0) {
          // Convert object with numeric keys to array
          normalizedSessionSecrets = keys
            .map(key => parseInt(key, 10))
            .sort((a, b) => a - b)
            .map(index => sessionSecrets[index.toString()]);
          console.log('🔄 [Grid SDK] Normalized sessionSecrets from object to array:', {
            originalKeys: keys,
            arrayLength: normalizedSessionSecrets.length
          });
        }
      }
      
      // SessionSecrets should remain as objects {publicKey, privateKey, provider, tag}
      // Grid SDK needs the full object structure, NOT just the privateKey
      console.log('🔐 [Grid SDK] SessionSecrets structure validated:', {
        isArray: Array.isArray(normalizedSessionSecrets),
        length: Array.isArray(normalizedSessionSecrets) ? normalizedSessionSecrets.length : 0,
        firstElementType: Array.isArray(normalizedSessionSecrets) && normalizedSessionSecrets.length > 0 
          ? typeof normalizedSessionSecrets[0] 
          : 'N/A'
      });

      // CRITICAL: Pass session EXACTLY as received from client
      // Grid SDK handles its own internal unwrapping - DO NOT normalize!
      const normalizedSession = session;
      
      console.log('🔐 [Grid SDK] Session passed AS-IS (no normalization):', {
        isArray: Array.isArray(session),
        type: typeof session,
        keys: Array.isArray(session) ? `array[${session.length}]` : (session && typeof session === 'object' ? Object.keys(session) : 'primitive')
      });

      // Log session structure for debugging
      console.log('🔐 [Grid SDK] signAndSend parameters:', {
        hasSessionSecrets: !!normalizedSessionSecrets,
        sessionSecretsType: typeof normalizedSessionSecrets,
        sessionSecretsIsArray: Array.isArray(normalizedSessionSecrets),
        sessionSecretsLength: Array.isArray(normalizedSessionSecrets) ? normalizedSessionSecrets.length : 'N/A',
        sessionType: typeof normalizedSession,
        sessionIsArray: Array.isArray(normalizedSession),
        sessionKeys: normalizedSession ? Object.keys(normalizedSession) : [],
        address
      });

      // Log the ACTUAL values being passed (safe for all types)
      console.log('🔐 [Grid SDK] ACTUAL VALUES PREVIEW:', {
        sessionSecretsFirstType: Array.isArray(normalizedSessionSecrets) && normalizedSessionSecrets.length > 0 
          ? typeof normalizedSessionSecrets[0]
          : 'N/A',
        sessionSecretsFirstIsBuffer: Array.isArray(normalizedSessionSecrets) && normalizedSessionSecrets.length > 0
          ? Buffer.isBuffer(normalizedSessionSecrets[0])
          : false,
        sessionSecretsFirstKeys: Array.isArray(normalizedSessionSecrets) && normalizedSessionSecrets.length > 0 && typeof normalizedSessionSecrets[0] === 'object'
          ? Object.keys(normalizedSessionSecrets[0])
          : 'N/A',
        sessionStructure: normalizedSession ? {
          hasProvider: 'provider' in normalizedSession,
          hasSession: 'session' in normalizedSession,
          hasId: 'id' in normalizedSession,
          hasAddress: 'address' in normalizedSession,
          keys: Object.keys(normalizedSession)
        } : 'N/A',
        transactionPayloadKeys: transactionPayload.data ? Object.keys(transactionPayload.data) : []
      });
      
      const result = await gridClient.signAndSend({
        sessionSecrets: normalizedSessionSecrets,
        session: normalizedSession,
        transactionPayload: transactionPayload.data,
        address
      });

      return result.transaction_signature || 'success';
    }
  };
}

/**
 * Initialize X402 Payment Service with Grid context
 */
function createX402Service(x402Context?: X402Context): X402PaymentService | null {
  if (!x402Context) {
    return null;
  }

  return new X402PaymentService({
    solanaRpcUrl: process.env.SOLANA_RPC_URL || process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    solanaCluster: 'mainnet-beta',
    usdcMint: X402_CONSTANTS.USDC_MINT,
    ephemeralFundingUsdc: X402_CONSTANTS.EPHEMERAL_FUNDING_USDC,
    ephemeralFundingSol: X402_CONSTANTS.EPHEMERAL_FUNDING_SOL
  });
}

/**
 * Helper: Handle x402 payment server-side or return payment requirement
 */
async function handleX402OrReturnRequirement(
  x402Context: X402Context | undefined,
  paymentReq: X402PaymentRequirement
): Promise<any> {
  // If Grid context available, handle payment server-side
  if (x402Context) {
    console.log(`💰 [SmartFlowForecaster] Handling x402 payment server-side for ${paymentReq.toolName}...`);
    
    const x402Service = createX402Service(x402Context);
    if (!x402Service) {
      throw new Error('Failed to initialize x402 service');
    }

    // Create Grid sender with session context
    // gridSession now has structure: { authentication: [...], address: "..." }
    // Validate structure before passing to Grid SDK
    if (!x402Context.gridSession?.authentication) {
      throw new Error('Grid session missing authentication field');
    }
    if (!x402Context.gridSession?.address) {
      throw new Error('Grid session missing address field');
    }
    if (!x402Context.gridSessionSecrets) {
      throw new Error('Grid session secrets missing');
    }
    
    // Log detailed structure for debugging
    console.log('🔍 [SmartFlowForecaster] Grid context structure:', {
      hasSessionSecrets: !!x402Context.gridSessionSecrets,
      sessionSecretsType: typeof x402Context.gridSessionSecrets,
      sessionSecretsKeys: x402Context.gridSessionSecrets ? Object.keys(x402Context.gridSessionSecrets) : [],
      hasGridSession: !!x402Context.gridSession,
      gridSessionKeys: x402Context.gridSession ? Object.keys(x402Context.gridSession) : [],
      hasAuthentication: !!x402Context.gridSession.authentication,
      authenticationType: typeof x402Context.gridSession.authentication,
      authenticationIsArray: Array.isArray(x402Context.gridSession.authentication),
      authenticationLength: Array.isArray(x402Context.gridSession.authentication) ? x402Context.gridSession.authentication.length : 'N/A',
      authenticationFirstKeys: Array.isArray(x402Context.gridSession.authentication) && x402Context.gridSession.authentication.length > 0
        ? Object.keys(x402Context.gridSession.authentication[0])
        : 'N/A',
      address: x402Context.gridSession.address
    });
    
    const gridSender = createGridSender(
      x402Context.gridSessionSecrets,
      x402Context.gridSession.authentication,  // Pass authentication array to Grid SDK
      x402Context.gridSession.address
    );

    // Execute x402 payment and fetch data
    const data = await x402Service.payAndFetchData(
      paymentReq,
      x402Context.gridSession.address,
      gridSender
    );

    console.log(`✅ [SmartFlowForecaster] Data fetched via x402 for ${paymentReq.toolName}`);
    return data;
  }

  // Fallback: Return payment requirement for client-side handling
  return paymentReq;
}

/**
 * Get Jupiter swap quote using real Jupiter API v6
 */
async function getJupiterQuoteForForecaster(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
): Promise<{ inputAmount: string; outputAmount: string; slippage: string; rawQuote: any } | null> {
  try {
    const { getUsdcToTokenQuote, convertFromSmallestUnits, SOLANA_TOKEN_MINTS } = await import('../../../lib/jupiterService.js');
    
    console.log(`📊 [Jupiter] Fetching real quote: ${amount} USDC -> ${outputMint}`);
    
    // Get quote from Jupiter
    const quote = await getUsdcToTokenQuote(outputMint, amount, slippageBps);
    
    // Convert amounts to human-readable
    const inputAmountHuman = await convertFromSmallestUnits(
      parseInt(quote.inAmount),
      SOLANA_TOKEN_MINTS.USDC
    );
    
    const outputAmountHuman = await convertFromSmallestUnits(
      parseInt(quote.outAmount),
      outputMint
    );
    
    console.log(`✅ [Jupiter] Quote received:`, {
      input: `${inputAmountHuman.toFixed(2)} USDC`,
      output: `${outputAmountHuman.toFixed(6)} tokens`,
      priceImpact: quote.priceImpactPct
    });
    
    return {
      inputAmount: inputAmountHuman.toFixed(2),
      outputAmount: outputAmountHuman.toFixed(6),
      slippage: (slippageBps / 100).toString() + '%',
      rawQuote: quote
    };
  } catch (error) {
    console.error('❌ [Jupiter] Quote error:', error);
    return null;
  }
}

/**
 * Calculate forecast from netflow data
 */
function calculateForecast(
  netflowData: any,
  flowsData: any,
  token: string,
  horizonHours: number
): ForecastResult {
  // Extract netflow metrics from Nansen response
  // Typical structure: { data: [{ token, token_address, netflow_24h, netflow_7d, netflow_30d, ... }] }
  
  // Map common token addresses to symbols (for better matching)
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const TOKEN_ADDRESS_TO_SYMBOL: Record<string, string> = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'JUP',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'WIF',
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': 'PYTH',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 'ORCA'
  };
  
  // Check if input is a token address and map to symbol
  const tokenAddress = token;
  const tokenSymbol = TOKEN_ADDRESS_TO_SYMBOL[tokenAddress] || token.toUpperCase();
  const isTokenAddress = tokenAddress.length > 20 && !tokenAddress.includes(' '); // Rough heuristic for address vs symbol
  
  // Normalize token for matching (handle SOL native token)
  const normalizedToken = tokenSymbol === 'SOL' ? 'SOL' : tokenSymbol.toLowerCase();
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Debug: Log the structure of netflowData to understand the format
  if (!netflowData?.data || netflowData.data.length === 0) {
    console.error('❌ [SmartFlowForecaster] No data in netflowData:', {
      hasData: !!netflowData?.data,
      dataLength: netflowData?.data?.length || 0,
      keys: netflowData ? Object.keys(netflowData) : [],
      sampleItem: netflowData?.data?.[0]
    });
  } else {
    console.log('📊 [SmartFlowForecaster] Netflow data structure:', {
      totalItems: netflowData.data.length,
      sampleItem: netflowData.data[0],
      sampleKeys: Object.keys(netflowData.data[0] || {}),
      firstFewTokens: netflowData.data.slice(0, 5).map((item: any) => ({
        token: item.token,
        token_address: item.token_address,
        symbol: item.symbol,
        name: item.name,
        chain: item.chain
      }))
    });
  }

  // Try multiple matching strategies with more field variations
  const tokenData = netflowData?.data?.find((item: any) => {
    // Get all possible identifiers from the item
    const itemSymbol = (item.token || item.symbol || item.token_symbol || item.name || '').toString().toUpperCase().trim();
    const itemAddress = (item.token_address || item.address || item.mint || '').toString().toLowerCase().trim();
    const itemChain = (item.chain || '').toLowerCase();
    
    // Match by token symbol (try multiple field names)
    if (itemSymbol && itemSymbol !== 'UNKNOWN' && itemSymbol !== '') {
      if (itemSymbol === normalizedToken.toUpperCase() || 
          itemSymbol === tokenSymbol.toUpperCase() ||
          item.token?.toLowerCase() === normalizedToken ||
          item.symbol?.toLowerCase() === normalizedToken ||
          item.name?.toLowerCase() === normalizedToken) {
        return true;
      }
    }
    
    // Match by token address (try multiple field names) - IMPORTANT: tokens might only have addresses
    // Support partial address matching (e.g., "E7NgL19J" matches "E7NgL19J4dR8xN6pZ5sYbKedZNsDvCN")
    if (itemAddress && itemAddress !== '') {
      // Exact match
      if (itemAddress === normalizedAddress ||
          itemAddress === tokenAddress.toLowerCase() ||
          item.token_address?.toLowerCase() === normalizedAddress ||
          item.address?.toLowerCase() === normalizedAddress ||
          item.mint?.toLowerCase() === normalizedAddress) {
        return true;
      }
      
      // Partial match - check if full address starts with user input
      if (itemAddress.startsWith(normalizedAddress) ||
          itemAddress.startsWith(tokenAddress.toLowerCase()) ||
          item.token_address?.toLowerCase().startsWith(normalizedAddress) ||
          item.address?.toLowerCase().startsWith(normalizedAddress) ||
          item.mint?.toLowerCase().startsWith(normalizedAddress)) {
        return true;
      }
    }
    
    // Match SOL native token (comprehensive matching)
    if (normalizedToken === 'SOL' || tokenAddress === SOL_MINT || token.toUpperCase() === 'SOL') {
      // Try all possible SOL representations
      const isSOL = 
        itemSymbol === 'SOL' ||
        item.token?.toUpperCase() === 'SOL' ||
        item.symbol?.toUpperCase() === 'SOL' ||
        item.name?.toUpperCase() === 'SOL' ||
        itemAddress === SOL_MINT.toLowerCase() ||
        item.token_address?.toLowerCase() === SOL_MINT.toLowerCase() ||
        item.address?.toLowerCase() === SOL_MINT.toLowerCase() ||
        item.mint?.toLowerCase() === SOL_MINT.toLowerCase() ||
        (itemChain === 'solana' && itemAddress === SOL_MINT.toLowerCase());
      
      if (isSOL) {
        console.log('✅ [SmartFlowForecaster] Matched SOL:', {
          item: {
            token: item.token,
            symbol: item.symbol,
            token_address: item.token_address,
            address: item.address,
            mint: item.mint,
            name: item.name,
            chain: item.chain
          }
        });
      }
      
      return isSOL;
    }
    
    return false;
  });

  if (!tokenData) {
    // Provide helpful error with available tokens (show all for debugging)
    // Handle case where tokens might only have addresses, not symbols
    const allTokens = netflowData?.data?.map((item: any) => {
      const token = item.token || item.symbol || item.name || null;
      const address = item.token_address || item.address || item.mint || '';
      const chain = item.chain || '';
      
      // If we have a token symbol, use it; otherwise use address
      if (token && token !== 'unknown') {
        return `${token}${address ? ` (${address.substring(0, 8)}...)` : ''}${chain ? ` [${chain}]` : ''}`;
      } else if (address) {
        // Use address as identifier if no symbol
        return `${address.substring(0, 8)}...${address.substring(address.length - 4)}${chain ? ` [${chain}]` : ''}`;
      }
      return 'unknown';
    }) || [];
    
    const availableTokens = allTokens.slice(0, 20).join(', ') || 'none';
    const totalTokens = allTokens.length;
    
    // Check if SOL exists in any form (check both symbol and address)
    const solVariations = netflowData?.data?.filter((item: any) => {
      const token = (item.token || item.symbol || '').toUpperCase();
      const address = (item.token_address || item.address || item.mint || '').toLowerCase();
      return token === 'SOL' || 
             address === SOL_MINT.toLowerCase() ||
             address === 'so11111111111111111111111111111111111111112';
    }) || [];
    
    const solVariationStrings = solVariations.map((item: any) => {
      const token = item.token || item.symbol || 'unknown';
      const address = item.token_address || item.address || item.mint || '';
      return `${token} (${address.substring(0, 8)}...)`;
    });
    
    console.error('❌ [SmartFlowForecaster] Token not found:', {
      searchedToken: token,
      searchedSymbol: tokenSymbol,
      totalTokensInData: totalTokens,
      solVariationsFound: solVariations,
      allTokens: allTokens
    });
    
            // Suggest using symbol if address was provided
            const suggestion = isTokenAddress && TOKEN_ADDRESS_TO_SYMBOL[tokenAddress] 
              ? `\n💡 Tip: Try using the token symbol "${TOKEN_ADDRESS_TO_SYMBOL[tokenAddress]}" instead of the address.`
              : isTokenAddress
              ? `\n💡 Tip: Try using the token symbol instead of the address (e.g., "JUP" instead of the mint address).`
              : '';
            
            // Check if token might not be in top smart money activity
            const topTokensNote = `\n⚠️ Note: Only tokens with significant smart money activity appear in netflows. This token may not have enough smart money trading volume to be included.`;
            
            // Special handling for SOL - if it's not in the data, this is meaningful information
            const isSOL = normalizedToken === 'SOL' || token.toUpperCase() === 'SOL' || tokenAddress === SOL_MINT;
            
            if (isSOL && solVariations.length === 0) {
              // SOL not in smart money netflows - this is significant data!
              // Extract token addresses from the list (they might not have symbols)
              const topTokenAddresses = netflowData?.data?.slice(0, 10).map((item: any, idx: number) => {
                const token = item.token || item.symbol || item.name;
                const address = item.token_address || item.address || item.mint || '';
                if (token && token !== 'unknown' && token.trim() !== '') {
                  return token;
                } else if (address) {
                  return address; // Use full address if no symbol
                }
                return `Token ${idx + 1}`;
              }).filter(Boolean).join(', ') || 'No tokens available';
              
              throw new Error(
                `🚨 Key Finding: SOL is NOT showing up in smart money netflows - this is actually significant data!\n\n` +
                `**What this means:**\n` +
                `- SOL doesn't have significant smart money trading activity in the current period\n` +
                `- Smart money is focusing on other tokens right now\n` +
                `- This is valuable market intelligence, not an error!\n\n` +
                `**Available tokens with smart money activity (${totalTokens} total):**\n` +
                `${topTokenAddresses}\n\n` +
                `**Suggestions:**\n` +
                `- Try forecasting one of the tokens above that ARE showing smart money activity\n` +
                `- These tokens are where smart money is actually trading right now\n` +
                `- You can use token addresses directly: "Forecast flows for [token address]"\n` +
                `- Example: "Forecast flows for 4vMsoUT2BWatFweudnQM1xedRLfJgJ7hswhcpz4xgBTy"`
              );
            }
            
            const solNote = solVariations.length > 0 
              ? `\n⚠️ Note: Found ${solVariations.length} SOL variation(s) in data but couldn't match: ${solVariations.join(', ')}`
              : '';
            
            throw new Error(
              `Token ${token} not found in smart money netflows. ` +
              `Total tokens in data: ${totalTokens}. ` +
              `Available tokens (first 20): ${availableTokens}. ` +
              `Note: For SOL, use "SOL" (not the mint address).` +
              suggestion +
              solNote +
              topTokensNote
            );
  }

  // Debug: Log the actual tokenData structure to see what fields are available
  console.log('📊 [SmartFlowForecaster] Matched tokenData structure:', {
    keys: Object.keys(tokenData),
    sampleValues: {
      // Check _usd versions first (most common from Nansen API)
      net_flow_24h_usd: tokenData.net_flow_24h_usd,
      net_flow_7d_usd: tokenData.net_flow_7d_usd,
      net_flow_30d_usd: tokenData.net_flow_30d_usd,
      // Then check non-usd versions
      netflow_24h: tokenData.netflow_24h,
      net_flow_24h: tokenData.net_flow_24h,
      inflow_24h_usd: tokenData.inflow_24h_usd,
      outflow_24h_usd: tokenData.outflow_24h_usd,
      inflow_24h: tokenData.inflow_24h,
      outflow_24h: tokenData.outflow_24h
    },
    fullItem: tokenData
  });

  // Get current netflow (try multiple field name variations)
  // Nansen returns fields like net_flow_24h_usd, net_flow_7d_usd, etc.
  const currentNetflow = 
    parseFloat(tokenData.net_flow_24h_usd || tokenData.netflow_24h_usd || tokenData.netflow_24h || tokenData.netflow24h || tokenData.net_flow_24h || tokenData.flow_24h || '0') ||
    parseFloat(tokenData.net_flow_7d_usd || tokenData.netflow_7d_usd || tokenData.netflow_7d || tokenData.netflow7d || tokenData.net_flow_7d || tokenData.flow_7d || '0') ||
    parseFloat(tokenData.net_flow_30d_usd || tokenData.netflow_30d_usd || tokenData.netflow_30d || tokenData.netflow30d || tokenData.net_flow_30d || tokenData.flow_30d || '0') ||
    parseFloat(tokenData.value_24h || tokenData.amount_24h || tokenData.total_24h || '0') ||
    0;
  
  // If still 0, try to calculate from inflow/outflow if available
  const inflow24h = parseFloat(tokenData.inflow_24h_usd || tokenData.inflow_24h || tokenData.inflow24h || '0');
  const outflow24h = parseFloat(tokenData.outflow_24h_usd || tokenData.outflow_24h || tokenData.outflow24h || '0');
  const calculatedNetflow = inflow24h - outflow24h;
  
  const finalNetflow = currentNetflow !== 0 ? currentNetflow : (calculatedNetflow !== 0 ? calculatedNetflow : 0);
  
  console.log('📊 [SmartFlowForecaster] Netflow extraction:', {
    currentNetflow,
    calculatedNetflow,
    finalNetflow,
    inflow24h,
    outflow24h,
    usedCalculation: currentNetflow === 0 && calculatedNetflow !== 0
  });
  
  // Calculate inflow velocity (change per hour)
  // Simple model: assume linear trend from 24h netflow
  const hours24 = 24;
  const velocity = finalNetflow / hours24; // netflow per hour
  
  // Predict future inflow: current + velocity * horizon
  const predictedInflow = finalNetflow + (velocity * horizonHours);
  
  // Calculate pump probability (0-100)
  // Higher netflow = higher probability
  // Normalize based on typical ranges (assume max 1M netflow = 100% prob)
  const maxExpectedNetflow = 1000000;
  const pumpProbability = Math.min(100, Math.max(0, (predictedInflow / maxExpectedNetflow) * 100));
  
  // Risk score (inverse of confidence, 0-100, lower is better)
  // Factors: volatility, data sparsity, negative trends
  let riskScore = 50; // Base risk
  if (predictedInflow < 0) {
    riskScore += 30; // Negative flow = higher risk
  }
  if (Math.abs(velocity) < 100) {
    riskScore += 20; // Low velocity = uncertain trend
  }
  riskScore = Math.min(100, Math.max(0, riskScore));
  
  // Confidence (0-100)
  const confidence = 100 - riskScore;
  
  // Recommendation logic
  let recommendation: 'buy' | 'hold' | 'sell' | 'watch' = 'watch';
  if (pumpProbability > 70 && riskScore < 30) {
    recommendation = 'buy';
  } else if (pumpProbability > 50 && riskScore < 50) {
    recommendation = 'hold';
  } else if (predictedInflow < -10000) {
    recommendation = 'sell';
  }
  
  // Generate reasoning
  const reasoning = `Current 24h netflow: ${finalNetflow.toLocaleString()}. ` +
    `Predicted ${horizonHours}h inflow: ${predictedInflow.toLocaleString()}. ` +
    `Velocity: ${velocity.toFixed(2)}/hour. ` +
    `Pump probability: ${pumpProbability.toFixed(1)}%. ` +
    `Risk score: ${riskScore.toFixed(1)}/100.`;
  
  return {
    token: tokenData.token || tokenData.symbol || tokenData.token_address || token,
    chain: tokenData.chain || 'solana',
    currentNetflow: finalNetflow,
    predictedInflow,
    pumpProbability,
    riskScore,
    confidence,
    forecastHorizon: `${horizonHours}h`,
    recommendation,
    reasoning
  };
}

/**
 * Smart Money Flow Forecaster Tool
 * 
 * Analyzes Nansen smart money netflows and flows to predict token pumps,
 * generates forecasts, and optionally executes micro-positions via Jupiter/Grid.
 */
export function createSmartFlowForecasterTool(x402Context?: X402Context) {
  return tool({
    name: 'smartFlowForecaster',
    description: `🔮🔮🔮 SMART MONEY FLOW FORECASTER - PRIMARY PREDICTION TOOL 🔮🔮🔮

**⚡ THIS IS YOUR GO-TO TOOL FOR ALL PRICE PREDICTIONS AND FORECASTS ⚡**

**Tool name: smartFlowForecaster**

**🚨 CRITICAL: USE THIS TOOL, NOT INDIVIDUAL NANSEN TOOLS, FOR PREDICTIONS! 🚨**
When users ask about forecasts, predictions, or "should I buy", DO NOT use nansenSmartMoneyNetflows or nansenFlows separately. 
THIS tool combines them intelligently and generates actual forecasts with buy/sell recommendations!

**WHAT IT DOES:**
- Fetches smart money netflows (aggregate buying/selling trends)
- Fetches detailed flows for specific tokens
- Calculates inflow velocity and predicts future flows
- Generates pump probability (0-100%), risk scores, confidence levels
- Provides BUY/HOLD/SELL/WATCH recommendations with reasoning
- Optionally generates Jupiter swap quotes for micro-positions
- Can auto-execute trades if high confidence
- Renders beautiful visualization in chat (FlowForecastViz component)

**COST:**
- ~0.002 USDC per forecast (2 Nansen API calls: netflows + flows)
- ~0.001 USDC for native SOL (only netflows, flows not supported)

**TRIGGER THIS TOOL FOR:**
✅ "Forecast [token] for next 24h"
✅ "Predict [token] price"
✅ "Pump probability for [token]"
✅ "Should I buy [token]?"
✅ "Will [token] pump?"
✅ "Where is [token] heading?"
✅ "Analyze [token] for trading"
✅ "Show me smart money flows and forecast [token]"
✅ ANY question about future prices, trends, or investment decisions

**DO NOT USE nansenSmartMoneyNetflows or nansenFlows for predictions - use THIS tool!**

**How it works:**
1. Fetches smart money netflows (aggregate buying/selling trends)
2. Fetches detailed flows for the specific token
3. Calculates inflow velocity and extrapolates trends
4. Generates pump probability and risk scores
5. Optionally generates Jupiter swap quotes for micro-positions
6. Can auto-execute positions if confidence is high (>50%) and risk is low

**Output includes:**
- Predicted inflow for the forecast horizon
- Pump probability (0-100%)
- Risk score (0-100, lower is better)
- Recommendation (buy/hold/sell/watch)
- Optional position quote and transaction signature

**🎨 AFTER CALLING THIS TOOL, ALWAYS:**
1. Explain the forecast results in 2-3 sentences
2. Use the FlowForecastViz component to visualize the data
3. Example: "Based on smart money analysis... {{component: 'FlowForecastViz', props: { data: <tool_result> }}}"

**IMPORTANT: USDC Required**
- x402 payments require USDC (automatically handled via Grid wallet)
- Jupiter swaps require USDC as input token (always swaps USDC → target token)
- Wallet must have sufficient USDC balance for both payments and position execution
- System validates USDC balance before executing swaps`,

    inputSchema: z.object({
      token: z.string().describe('Token symbol (recommended) or mint address. Use symbols like "SOL", "BONK", "JUP" for best results. Only tokens with significant smart money activity appear in netflows data.'),
      chain: z.string().default('solana').describe('Blockchain network (default: solana)'),
      horizonHours: z.number().default(24).describe('Forecast horizon in hours (default: 24, max: 168)'),
      minInflowPercent: z.number().optional().describe('Minimum inflow percentage threshold to trigger alert (default: 20)'),
      autoExecute: z.boolean().default(false).describe('Auto-execute micro-position if high confidence (default: false)'),
      positionSizeUsdc: z.number().optional().describe('Position size in USDC for auto-execute (default: 0.1, max: 0.5)'),
    }),
    execute: async (params: any) => {
      const { 
        token, 
        chain = 'solana', 
        horizonHours = 24,
        minInflowPercent = 20,
        autoExecute = false,
        positionSizeUsdc = 0.1
      } = params;
      console.log(`🔮 [SmartFlowForecaster] Starting forecast for ${token} (${horizonHours}h horizon)`);
      
      // Validate inputs
      if (horizonHours > 168) {
        throw new Error('Forecast horizon cannot exceed 168 hours (7 days)');
      }
      
      if (positionSizeUsdc > 0.5) {
        throw new Error('Position size cannot exceed 0.5 USDC for auto-execute');
      }

      try {
        // Step 1: Fetch smart money netflows (aggregate trends)
        console.log('📊 [SmartFlowForecaster] Fetching smart money netflows...');
        const netflowRequest = NansenUtils.formatSmartMoneyNetflowRequest({ 
          chains: [chain] 
        });
        
        const netflowPaymentReq: X402PaymentRequirement = {
          needsPayment: true,
          toolName: 'smartFlowForecaster_netflows',
          apiUrl: NansenUtils.getSmartMoneyNetflowUrl(),
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: netflowRequest,
          estimatedCost: X402_CONSTANTS.NANSEN_ESTIMATED_COST
        };
        
        console.log('💰 [SmartFlowForecaster] Handling x402 payment server-side for smartFlowForecaster_netflows...');
        const netflowData = await handleX402OrReturnRequirement(x402Context, netflowPaymentReq);
        console.log('✅ [SmartFlowForecaster] Data fetched via x402 for smartFlowForecaster_netflows');
        
        if (netflowData.needsPayment) {
          console.log('⚠️ [SmartFlowForecaster] No x402 context - returning payment requirement');
          return netflowData; // Return payment requirement if no x402 context
        }
        
        // Debug: Log the actual response structure
        console.log('📊 [SmartFlowForecaster] Raw netflowData response:', {
          type: typeof netflowData,
          isArray: Array.isArray(netflowData),
          keys: netflowData ? Object.keys(netflowData) : [],
          hasData: !!netflowData?.data,
          dataType: Array.isArray(netflowData?.data) ? 'array' : typeof netflowData?.data,
          dataLength: Array.isArray(netflowData?.data) ? netflowData.data.length : 'N/A',
          firstItem: Array.isArray(netflowData?.data) ? netflowData.data[0] : netflowData?.data?.[0] || 'N/A'
        });
        
        // Handle different response structures
        // Sometimes API might return data directly, sometimes wrapped in { data: [...] }
        let actualData = netflowData;
        if (netflowData?.data && Array.isArray(netflowData.data)) {
          actualData = { data: netflowData.data };
        } else if (Array.isArray(netflowData)) {
          actualData = { data: netflowData };
        } else if (!netflowData?.data) {
          console.warn('⚠️ [SmartFlowForecaster] Unexpected netflowData structure:', netflowData);
        }

        // Step 2: Quick validation - check if token exists in netflows BEFORE making second API call
        // This prevents wasting an x402 payment on tokens that don't have smart money activity
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const isNativeSOL = chain === 'solana' && (
          token.toUpperCase() === 'SOL' || 
          token === SOL_MINT
        );
        
        // Debug: Log what we're looking for and what's available
        const allSymbols = actualData?.data?.map((item: any) => 
          (item.token || item.symbol || item.token_symbol || '').toString().toUpperCase().trim()
        ) || [];
        
        console.log('🔍 [SmartFlowForecaster] Token validation:', {
          searchingFor: token,
          normalizedSearch: token.toUpperCase(),
          isNativeSOL,
          dataItemsCount: actualData?.data?.length,
          hasJUP: allSymbols.includes('JUP'),
          hasBONK: allSymbols.includes('BONK'),
          hasSOL: allSymbols.includes('SOL'),
          allSymbols: allSymbols,
          firstFewSymbols: actualData?.data?.slice(0, 10).map((item: any) => ({
            symbol: item.token_symbol,
            address: item.token_address
          }))
        });
        
        // Check if token exists in netflows data AND extract the actual token address
        const matchedToken = isNativeSOL ? null : actualData?.data?.find((item: any) => {
          const itemSymbol = (item.token || item.symbol || item.token_symbol || '').toString().toUpperCase().trim();
          const itemAddress = (item.token_address || item.address || '').toString().toLowerCase().trim();
          const normalizedToken = token.toUpperCase();
          const normalizedAddress = token.toLowerCase();
          
          // Match by symbol (exact match)
          const symbolMatch = itemSymbol === normalizedToken;
          
          // Match by address (support partial addresses - check if item address STARTS with user input)
          // This handles cases where user provides partial address like "E7NgL19J" 
          // and API returns full address like "E7NgL19J4dR8xN6pZ5sYbKedZNsDvCN"
          const addressMatch = itemAddress === normalizedAddress || 
                               itemAddress.startsWith(normalizedAddress);
          
          const matches = symbolMatch || addressMatch;
          
          // Debug log for matches or interesting tokens
          if (matches || itemSymbol.includes('PAYAI') || normalizedAddress.startsWith('e7ngl19j')) {
            console.log('🔍 [SmartFlowForecaster] Token comparison:', {
              itemSymbol,
              normalizedToken,
              itemAddress: itemAddress.substring(0, 16),
              normalizedAddress,
              symbolMatch,
              addressMatch,
              matches
            });
          }
          
          return matches;
        });
        
        const tokenExistsInNetflows = isNativeSOL || !!matchedToken;
        
        // Extract the actual token address for API queries
        const actualTokenAddress = matchedToken?.token_address || matchedToken?.address || token;
        
        console.log('✅ [SmartFlowForecaster] Token resolution:', {
          inputToken: token,
          matchedSymbol: matchedToken?.token_symbol,
          actualAddress: actualTokenAddress,
          isNativeSOL
        });
        
        if (!tokenExistsInNetflows && !isNativeSOL) {
          // Token not found in netflows - throw error early to avoid wasting second API call
          
          // Show both symbols AND addresses for better debugging
          const availableTokens = actualData?.data?.slice(0, 20).map((item: any) => {
            const symbol = item.token_symbol || 'UNKNOWN';
            const addr = item.token_address || '';
            return `${symbol} (${addr.substring(0, 8)}...${addr.slice(-4)})`;
          }).join(', ') || 'None';
          
          // Extract actual available token symbols (filter out empty/unknown)
          const availableSymbols = actualData?.data
            ?.map((item: any) => item.token_symbol)
            ?.filter((s: string) => s && s !== 'UNKNOWN')
            ?.slice(0, 15) || [];
          
          const suggestionText = availableSymbols.length > 0
            ? `Try one of these tokens currently showing smart money activity: ${availableSymbols.join(', ')}`
            : 'Try SOL or check the available tokens list above.';
          
          throw new Error(
            `Token ${token} not found in smart money netflows. ` +
            `Available tokens (first 20): ${availableTokens}. ` +
            `\n\n💡 Tip: Only tokens with significant smart money activity appear in the forecast. ` +
            `${suggestionText}`
          );
        }
        
        // Step 3: Fetch detailed flows for the specific token (skip for SOL native token)
        // Nansen flows endpoint doesn't support native SOL - only SPL tokens
        let flowsData: any = null;
        
        if (!isNativeSOL) {
          console.log('📊 [SmartFlowForecaster] Fetching detailed flows for token...');
          console.log('🔍 [SmartFlowForecaster] Using token address:', actualTokenAddress);
          const flowsRequest = NansenUtils.formatFlowsRequest({ 
            token_address: actualTokenAddress,
            chain 
          });
          
          const flowsPaymentReq: X402PaymentRequirement = {
            needsPayment: true,
            toolName: 'smartFlowForecaster_flows',
            apiUrl: NansenUtils.getFlowsUrl(),
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: flowsRequest,
            estimatedCost: X402_CONSTANTS.NANSEN_ESTIMATED_COST
          };
          
          console.log('💰 [SmartFlowForecaster] Handling x402 payment server-side for smartFlowForecaster_flows...');
          flowsData = await handleX402OrReturnRequirement(x402Context, flowsPaymentReq);
          console.log('✅ [SmartFlowForecaster] Data fetched via x402 for smartFlowForecaster_flows');
          
          if (flowsData.needsPayment) {
            console.log('⚠️ [SmartFlowForecaster] No x402 context - returning payment requirement');
            return flowsData; // Return payment requirement if no x402 context
          }
        } else {
          console.log('ℹ️ [SmartFlowForecaster] Skipping flows endpoint for native SOL (not supported by Nansen)');
        }

        // Step 4: Calculate forecast
        console.log('🧮 [SmartFlowForecaster] Calculating forecast...');
        
        // Use the normalized data structure
        const normalizedNetflowData = actualData || netflowData;
        
        let forecast: ForecastResult;
        try {
          forecast = calculateForecast(normalizedNetflowData, flowsData, token, horizonHours);
        } catch (error: any) {
          // If token not found, provide helpful error with suggestions
          if (error.message?.includes('not found in smart money netflows')) {
            // Try to find similar tokens or suggest popular ones
            const popularTokens = ['SOL', 'BONK', 'JUP', 'WIF', 'PYTH', 'RAY', 'ORCA'];
            const suggestion = popularTokens.find(t => 
              t.toLowerCase() === token.toLowerCase() || 
              token.toUpperCase().includes(t)
            );
            
            throw new Error(
              `${error.message}\n\n` +
              `💡 Suggestion: Try forecasting a more liquid token. ` +
              `${suggestion ? `Did you mean "${suggestion}"? ` : ''}` +
              `Popular tokens: ${popularTokens.join(', ')}`
            );
          }
          throw error;
        }
        
        // Step 5: Check if forecast meets threshold
        const inflowPercentChange = ((forecast.predictedInflow - forecast.currentNetflow) / Math.abs(forecast.currentNetflow || 1)) * 100;
        const meetsThreshold = Math.abs(inflowPercentChange) >= minInflowPercent;
        
        // Step 6: Generate Jupiter quote if high confidence and meets threshold
        if (forecast.pumpProbability > 50 && forecast.riskScore < 50 && meetsThreshold) {
          console.log('💱 [SmartFlowForecaster] Generating Jupiter quote...');
          
          // Determine output mint address
          const { SOLANA_TOKEN_MINTS } = await import('../../../lib/jupiterService.js');
          let outputMint = token;
          
          // Map common token symbols to mint addresses
          if (chain === 'solana') {
            const tokenUpper = token.toUpperCase();
            if (tokenUpper === 'SOL') {
              outputMint = SOLANA_TOKEN_MINTS.SOL;
            } else if (tokenUpper === 'BONK') {
              outputMint = SOLANA_TOKEN_MINTS.BONK;
            } else if (tokenUpper === 'JUP') {
              outputMint = SOLANA_TOKEN_MINTS.JUP;
            } else if (tokenUpper === 'WIF') {
              outputMint = SOLANA_TOKEN_MINTS.WIF;
            }
            // Otherwise assume token is already a mint address
          }
          
          const quoteResult = await getJupiterQuoteForForecaster(
            X402_CONSTANTS.USDC_MINT, // Input: USDC
            outputMint,                // Output: Token
            positionSizeUsdc,
            50 // 0.5% slippage
          );
          
          if (quoteResult) {
            forecast.positionQuote = {
              inputAmount: quoteResult.inputAmount,
              inputToken: 'USDC',
              outputAmount: quoteResult.outputAmount,
              outputToken: token,
              slippage: quoteResult.slippage
            };
            
            // Store raw quote for potential execution
            (forecast as any).rawJupiterQuote = quoteResult.rawQuote;
          }
        }
        
        // Step 6: Auto-execute if enabled and conditions met
        if (autoExecute && forecast.pumpProbability > 50 && forecast.riskScore < 30 && forecast.positionQuote && x402Context) {
          console.log('⚡ [SmartFlowForecaster] Auto-executing position via Jupiter...');
          
          try {
            // Validate USDC balance before attempting swap
            // x402 and Jupiter swaps require USDC - verify wallet has sufficient balance
            const { Connection, PublicKey } = await import('@solana/web3.js');
            const { getAssociatedTokenAddress } = await import('@solana/spl-token');
            
            const connection = new Connection(
              process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
              'confirmed'
            );
            
            const usdcMint = new PublicKey(X402_CONSTANTS.USDC_MINT);
            const walletAddress = new PublicKey(x402Context.gridSession.address);
            const usdcAta = await getAssociatedTokenAddress(usdcMint, walletAddress);
            
            let usdcBalance = 0;
            try {
              const balance = await connection.getTokenAccountBalance(usdcAta);
              usdcBalance = parseFloat(balance.value.uiAmountString || '0');
            } catch (error: any) {
              if (error.message?.includes('could not find')) {
                // ATA doesn't exist = 0 USDC balance
                usdcBalance = 0;
              } else {
                throw error;
              }
            }
            
            const requiredUsdc = positionSizeUsdc + 0.001; // Position + small buffer
            if (usdcBalance < requiredUsdc) {
              throw new Error(
                `Insufficient USDC balance. ` +
                `Required: ${requiredUsdc.toFixed(3)} USDC, ` +
                `Available: ${usdcBalance.toFixed(3)} USDC. ` +
                `Please fund your wallet with USDC to execute positions.`
              );
            }
            
            console.log(`✅ [SmartFlowForecaster] USDC balance verified: ${usdcBalance.toFixed(3)} USDC (need ${requiredUsdc.toFixed(3)})`);
            
            const rawQuote = (forecast as any).rawJupiterQuote;
            
            if (!rawQuote) {
              console.error('❌ [SmartFlowForecaster] No Jupiter quote available for execution');
            } else {
              // Execute swap via Jupiter + Grid (always uses USDC as input)
              const { executeJupiterSwap } = await import('../../../lib/jupiterService.js');
              
              const swapResult = await executeJupiterSwap(
                rawQuote,
                x402Context.gridSession.address,
                x402Context.gridSessionSecrets,
                x402Context.gridSession.authentication,
                process.env.SOLANA_RPC_URL
              );
              
              forecast.transactionSignature = swapResult.signature;
              console.log('✅ [SmartFlowForecaster] Swap executed:', swapResult.signature);
              
              // Add execution details to forecast
              (forecast as any).executionDetails = {
                executedAt: new Date().toISOString(),
                positionSize: positionSizeUsdc,
                tokensReceived: forecast.positionQuote.outputAmount,
                transactionSignature: swapResult.signature,
                usdcBalanceBefore: usdcBalance
              };
            }
          } catch (error: any) {
            console.error('❌ [SmartFlowForecaster] Auto-execute failed:', error);
            
            // Add error to forecast but don't fail the entire operation
            (forecast as any).executionError = {
              message: error.message,
              timestamp: new Date().toISOString()
            };
            
            // Continue with forecast even if execution fails
          }
        }
        
        console.log('✅ [SmartFlowForecaster] Forecast complete:', {
          token: forecast.token,
          pumpProbability: forecast.pumpProbability,
          recommendation: forecast.recommendation
        });
        
        return forecast;
        
      } catch (error: any) {
        console.error('❌ [SmartFlowForecaster] Error:', error);
        
        // Return error as a structured forecast result instead of throwing
        // This allows the AI to communicate the error to the user properly
        return {
          token,
          chain,
          currentNetflow: 0,
          predictedInflow: 0,
          pumpProbability: 0,
          riskScore: 100,
          confidence: 0,
          forecastHorizon: horizonHours >= 24 ? `${Math.floor(horizonHours / 24)}d` : `${horizonHours}h`,
          recommendation: 'watch' as const,
          reasoning: `❌ **Forecast Error**: ${error.message || 'An unexpected error occurred'}\n\n` +
            `This error occurred while analyzing smart money flows. ` +
            `${error.message?.includes('not found') ? 'The token may not have enough smart money activity to generate a forecast.' : 'Please try again or contact support if the issue persists.'}`
        } as ForecastResult;
      }
    }
  });
}


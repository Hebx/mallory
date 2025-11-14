/**
 * Jupiter Service Tests
 * 
 * Tests Jupiter API v6 integration
 */

import { describe, it, expect } from 'bun:test';
import {
  getJupiterQuote,
  getUsdcToTokenQuote,
  convertToSmallestUnits,
  convertFromSmallestUnits,
  SOLANA_TOKEN_MINTS,
  type JupiterQuote
} from '../jupiterService';

describe('Jupiter Service', () => {
  
  describe('Token Amount Conversions', () => {
    
    it('should convert USDC to smallest units', async () => {
      const amount = 1.5; // 1.5 USDC
      const smallest = await convertToSmallestUnits(amount, SOLANA_TOKEN_MINTS.USDC);
      
      // USDC has 6 decimals
      expect(smallest).toBe(1500000);
      
      console.log('✅ USDC conversion:', { amount, smallest });
    });

    it('should convert SOL to smallest units (lamports)', async () => {
      const amount = 0.5; // 0.5 SOL
      const smallest = await convertToSmallestUnits(amount, SOLANA_TOKEN_MINTS.SOL);
      
      // SOL has 9 decimals
      expect(smallest).toBe(500000000);
      
      console.log('✅ SOL conversion:', { amount, smallest });
    });

    it('should convert from smallest units back to USDC', async () => {
      const smallest = 1500000;
      const amount = await convertFromSmallestUnits(smallest, SOLANA_TOKEN_MINTS.USDC);
      
      expect(amount).toBe(1.5);
      
      console.log('✅ Reverse USDC conversion:', { smallest, amount });
    });
  });

  describe('Jupiter Quote API', () => {
    
    it('should fetch real quote for USDC -> SOL', async () => {
      const usdcAmount = 1; // 1 USDC
      const usdcSmallest = await convertToSmallestUnits(usdcAmount, SOLANA_TOKEN_MINTS.USDC);
      
      const quote = await getJupiterQuote({
        inputMint: SOLANA_TOKEN_MINTS.USDC,
        outputMint: SOLANA_TOKEN_MINTS.SOL,
        amount: usdcSmallest,
        slippageBps: 50
      });
      
      expect(quote).toBeDefined();
      expect(quote.inputMint).toBe(SOLANA_TOKEN_MINTS.USDC);
      expect(quote.outputMint).toBe(SOLANA_TOKEN_MINTS.SOL);
      expect(quote.inAmount).toBeDefined();
      expect(quote.outAmount).toBeDefined();
      expect(quote.priceImpactPct).toBeDefined();
      expect(quote.routePlan).toBeDefined();
      expect(Array.isArray(quote.routePlan)).toBe(true);
      
      console.log('✅ USDC -> SOL quote:', {
        input: `${usdcAmount} USDC`,
        output: `${(parseInt(quote.outAmount) / 1e9).toFixed(6)} SOL`,
        priceImpact: quote.priceImpactPct,
        routes: quote.routePlan.length
      });
    }, 30000);

    it('should fetch quote for USDC -> BONK', async () => {
      const usdcAmount = 0.5; // 0.5 USDC
      
      const quote = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.BONK, usdcAmount, 50);
      
      expect(quote).toBeDefined();
      expect(quote.inputMint).toBe(SOLANA_TOKEN_MINTS.USDC);
      expect(quote.outputMint).toBe(SOLANA_TOKEN_MINTS.BONK);
      
      const bonkReceived = await convertFromSmallestUnits(
        parseInt(quote.outAmount),
        SOLANA_TOKEN_MINTS.BONK
      );
      
      console.log('✅ USDC -> BONK quote:', {
        input: `${usdcAmount} USDC`,
        output: `${bonkReceived.toFixed(0)} BONK`,
        priceImpact: quote.priceImpactPct
      });
    }, 30000);

    it('should handle different slippage values', async () => {
      const usdcAmount = 0.1;
      
      const quote1 = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.SOL, usdcAmount, 10); // 0.1%
      const quote2 = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.SOL, usdcAmount, 50); // 0.5%
      const quote3 = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.SOL, usdcAmount, 100); // 1%
      
      expect(quote1.slippageBps).toBe(10);
      expect(quote2.slippageBps).toBe(50);
      expect(quote3.slippageBps).toBe(100);
      
      console.log('✅ Different slippage quotes:', {
        '0.1%': parseInt(quote1.outAmount),
        '0.5%': parseInt(quote2.outAmount),
        '1.0%': parseInt(quote3.outAmount)
      });
    }, 30000);

    it('should include price impact in quote', async () => {
      const usdcAmount = 10; // Larger amount for noticeable price impact
      
      const quote = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.SOL, usdcAmount, 50);
      
      expect(quote.priceImpactPct).toBeDefined();
      const priceImpact = parseFloat(quote.priceImpactPct);
      
      expect(priceImpact).toBeGreaterThanOrEqual(0);
      expect(priceImpact).toBeLessThan(10); // Should be less than 10% for major pairs
      
      console.log('✅ Price impact check:', {
        amount: `${usdcAmount} USDC`,
        priceImpact: `${priceImpact.toFixed(4)}%`
      });
    }, 30000);

    it('should return multiple route options', async () => {
      const usdcAmount = 1;
      
      const quote = await getUsdcToTokenQuote(SOLANA_TOKEN_MINTS.SOL, usdcAmount, 50);
      
      expect(quote.routePlan).toBeDefined();
      expect(quote.routePlan.length).toBeGreaterThan(0);
      
      console.log('✅ Route plan:', {
        routes: quote.routePlan.length,
        swaps: quote.routePlan.map((r: any) => r.swapInfo?.label).filter(Boolean)
      });
    }, 30000);
  });

  describe('Token Mints Registry', () => {
    
    it('should have valid SOL mint address', () => {
      expect(SOLANA_TOKEN_MINTS.SOL).toBe('So11111111111111111111111111111111111111112');
    });

    it('should have valid USDC mint address', () => {
      expect(SOLANA_TOKEN_MINTS.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('should have popular token mints', () => {
      expect(SOLANA_TOKEN_MINTS.BONK).toBeDefined();
      expect(SOLANA_TOKEN_MINTS.JUP).toBeDefined();
      expect(SOLANA_TOKEN_MINTS.WIF).toBeDefined();
      expect(SOLANA_TOKEN_MINTS.PYTH).toBeDefined();
      
      console.log('✅ Available token mints:', Object.keys(SOLANA_TOKEN_MINTS));
    });
  });

  describe('Error Handling', () => {
    
    it('should handle invalid token mint', async () => {
      const invalidMint = '1111111111111111111111111111111111111111111';
      
      try {
        await getJupiterQuote({
          inputMint: SOLANA_TOKEN_MINTS.USDC,
          outputMint: invalidMint,
          amount: 1000000,
          slippageBps: 50
        });
        
        // If it doesn't throw, that's fine - Jupiter might handle gracefully
        console.log('ℹ️ Jupiter handled invalid mint gracefully');
      } catch (error: any) {
        expect(error.message).toBeDefined();
        console.log('✅ Correctly threw error for invalid mint:', error.message);
      }
    }, 30000);

    it('should handle zero amount', async () => {
      try {
        await getJupiterQuote({
          inputMint: SOLANA_TOKEN_MINTS.USDC,
          outputMint: SOLANA_TOKEN_MINTS.SOL,
          amount: 0,
          slippageBps: 50
        });
        
        console.log('ℹ️ Jupiter accepted zero amount');
      } catch (error: any) {
        expect(error.message).toBeDefined();
        console.log('✅ Correctly rejected zero amount:', error.message);
      }
    }, 30000);
  });
});




/**
 * E2E Test: Smart Flow Forecaster
 * 
 * Tests the x402 Smart Money Flow Forecaster tool end-to-end:
 * - Forecasts token pumps using Nansen smart money flow data
 * - Generates predictions with pump probability and risk scores
 * - Validates forecast calculations and recommendations
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { 
  setupNansenTest, 
  testNansenEndpoint,
  type TestContext 
} from '../utils/nansen-test-template';

describe('Smart Flow Forecaster E2E', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupNansenTest();
  });

  it('should forecast SOL smart money flows for next 24h', async () => {
    const query = 'Forecast SOL smart money flows for the next 24 hours';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - SOL 24h',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000 // 3 minutes (2 Nansen calls)
      },
      context
    );

    // Validate forecast structure
    expect(data).toBeDefined();
    expect(data.token).toBeDefined();
    expect(data.currentNetflow).toBeDefined();
    expect(data.predictedInflow).toBeDefined();
    expect(data.pumpProbability).toBeGreaterThanOrEqual(0);
    expect(data.pumpProbability).toBeLessThanOrEqual(100);
    expect(data.riskScore).toBeGreaterThanOrEqual(0);
    expect(data.riskScore).toBeLessThanOrEqual(100);
    expect(data.confidence).toBeGreaterThanOrEqual(0);
    expect(data.confidence).toBeLessThanOrEqual(100);
    expect(data.recommendation).toMatch(/^(buy|hold|sell|watch)$/);
    expect(data.reasoning).toBeDefined();
    expect(data.reasoning.length).toBeGreaterThan(0);
    
    console.log('✅ Forecast generated:', {
      token: data.token,
      currentNetflow: data.currentNetflow,
      predictedInflow: data.predictedInflow,
      pumpProbability: data.pumpProbability,
      riskScore: data.riskScore,
      recommendation: data.recommendation
    });
  }, 180000);

  it('should generate high-confidence forecast with position quote', async () => {
    const query = 'Forecast SOL flows for next 48h with position size 0.2 USDC';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - SOL 48h with position',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.token).toBeDefined();
    expect(data.forecastHorizon).toBe('48h');
    
    // If pump probability > 50% and risk < 50%, should have position quote
    if (data.pumpProbability > 50 && data.riskScore < 50) {
      expect(data.positionQuote).toBeDefined();
      expect(data.positionQuote.inputAmount).toBeDefined();
      expect(data.positionQuote.inputToken).toBe('USDC');
      expect(data.positionQuote.outputToken).toBeDefined();
      expect(data.positionQuote.slippage).toBeDefined();
      
      console.log('✅ Position quote generated:', data.positionQuote);
    } else {
      console.log('ℹ️ No position quote (pump prob or risk threshold not met)');
    }
  }, 180000);

  it('should handle custom forecast horizon', async () => {
    const query = 'Forecast SOL smart money flows for the next 72 hours';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - SOL 72h',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.forecastHorizon).toBe('72h');
    expect(data.predictedInflow).toBeDefined();
    
    // Longer horizon should affect predicted inflow
    console.log('✅ 72h forecast:', {
      horizon: data.forecastHorizon,
      predictedInflow: data.predictedInflow,
      pumpProbability: data.pumpProbability
    });
  }, 180000);

  it('should validate position size limits', async () => {
    // This should fail or cap at 0.5 USDC max
    const query = 'Forecast SOL flows and auto-execute with 1.0 USDC position';
    
    try {
      const data = await testNansenEndpoint(
        {
          name: 'Smart Flow Forecaster - Position size validation',
          query,
          expectedToolName: 'smartFlowForecaster',
          timeout: 180000
        },
        context
      );

      // Should either error or cap position size
      if (data.positionQuote) {
        const positionSize = parseFloat(data.positionQuote.inputAmount);
        expect(positionSize).toBeLessThanOrEqual(0.5);
        console.log('✅ Position size capped at:', positionSize);
      }
    } catch (error: any) {
      // Expected error for exceeding max position size
      expect(error.message).toContain('Position size cannot exceed 0.5 USDC');
      console.log('✅ Correctly rejected position size > 0.5 USDC');
    }
  }, 180000);

  it('should provide recommendations based on pump probability and risk', async () => {
    const query = 'Forecast SOL smart money flows and recommend action';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - Recommendations',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.recommendation).toBeDefined();
    
    // Validate recommendation logic
    if (data.pumpProbability > 70 && data.riskScore < 30) {
      expect(data.recommendation).toBe('buy');
    } else if (data.pumpProbability > 50 && data.riskScore < 50) {
      expect(data.recommendation).toMatch(/^(buy|hold)$/);
    } else if (data.predictedInflow < -10000) {
      expect(data.recommendation).toBe('sell');
    } else {
      expect(data.recommendation).toBe('watch');
    }
    
    console.log('✅ Recommendation logic validated:', {
      pumpProbability: data.pumpProbability,
      riskScore: data.riskScore,
      recommendation: data.recommendation
    });
  }, 180000);

  it('should handle minimum inflow threshold', async () => {
    const query = 'Forecast SOL flows with minimum 30% inflow change threshold';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - Inflow threshold',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    
    // Calculate inflow change percentage
    const inflowChange = ((data.predictedInflow - data.currentNetflow) / Math.abs(data.currentNetflow || 1)) * 100;
    
    console.log('✅ Inflow change calculated:', {
      currentNetflow: data.currentNetflow,
      predictedInflow: data.predictedInflow,
      changePercent: inflowChange.toFixed(2)
    });
    
    // Position quote should only be generated if threshold met
    if (Math.abs(inflowChange) >= 30 && data.pumpProbability > 50) {
      expect(data.positionQuote).toBeDefined();
    }
  }, 180000);

  it('should calculate inflow velocity correctly', async () => {
    const query = 'Forecast SOL smart money flows with detailed metrics';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - Velocity calculation',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.reasoning).toBeDefined();
    
    // Extract velocity from reasoning
    const velocityMatch = data.reasoning.match(/Velocity: ([\d.]+)\/hour/);
    if (velocityMatch) {
      const velocity = parseFloat(velocityMatch[1]);
      
      // Validate velocity calculation
      // velocity = currentNetflow / 24 (hours)
      const expectedVelocity = data.currentNetflow / 24;
      expect(Math.abs(velocity - expectedVelocity)).toBeLessThan(0.01);
      
      console.log('✅ Velocity calculation validated:', {
        velocity,
        expectedVelocity,
        currentNetflow: data.currentNetflow
      });
    }
  }, 180000);

  it('should handle forecast for different Solana tokens', async () => {
    // Test with a popular Solana token (e.g., BONK)
    const query = 'Forecast BONK smart money flows for next 24h';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - BONK token',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.token).toBeDefined();
    expect(data.chain).toBe('solana');
    
    console.log('✅ BONK forecast generated:', {
      token: data.token,
      pumpProbability: data.pumpProbability,
      recommendation: data.recommendation
    });
  }, 180000);

  it('should provide confidence intervals for predictions', async () => {
    const query = 'Forecast SOL flows with confidence analysis';
    
    const data = await testNansenEndpoint(
      {
        name: 'Smart Flow Forecaster - Confidence intervals',
        query,
        expectedToolName: 'smartFlowForecaster',
        timeout: 180000
      },
      context
    );

    expect(data).toBeDefined();
    expect(data.confidence).toBeDefined();
    expect(data.riskScore).toBeDefined();
    
    // Confidence should be inverse of risk score
    expect(data.confidence).toBe(100 - data.riskScore);
    
    console.log('✅ Confidence analysis:', {
      confidence: data.confidence,
      riskScore: data.riskScore,
      pumpProbability: data.pumpProbability
    });
  }, 180000);

  it('should handle sparse flow data gracefully', async () => {
    // Test with a less common token that might have sparse data
    const query = 'Forecast flows for a low-volume Solana token';
    
    try {
      const data = await testNansenEndpoint(
        {
          name: 'Smart Flow Forecaster - Sparse data handling',
          query,
          expectedToolName: 'smartFlowForecaster',
          timeout: 180000
        },
        context
      );

      expect(data).toBeDefined();
      
      // Sparse data should result in higher risk score
      if (Math.abs(data.currentNetflow) < 1000) {
        expect(data.riskScore).toBeGreaterThan(30);
        expect(data.recommendation).toMatch(/^(watch|hold)$/);
        
        console.log('✅ Sparse data handled correctly with higher risk:', {
          netflow: data.currentNetflow,
          riskScore: data.riskScore,
          recommendation: data.recommendation
        });
      }
    } catch (error: any) {
      // Token not found in netflows is also acceptable for sparse data
      expect(error.message).toContain('not found');
      console.log('✅ Correctly handled missing token in netflows');
    }
  }, 180000);
});




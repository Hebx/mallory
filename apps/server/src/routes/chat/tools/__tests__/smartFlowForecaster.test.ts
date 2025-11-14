/**
 * Unit Tests: Smart Flow Forecaster
 * 
 * Tests the forecasting calculation logic without making actual API calls
 */

import { describe, it, expect } from 'bun:test';

/**
 * Mock calculateForecast function (copy from smartFlowForecaster.ts for testing)
 */
function calculateForecast(
  netflowData: any,
  flowsData: any,
  token: string,
  horizonHours: number
): any {
  const tokenData = netflowData?.data?.find((item: any) => 
    item.token?.toLowerCase() === token.toLowerCase() ||
    item.token_address?.toLowerCase() === token.toLowerCase()
  );

  if (!tokenData) {
    throw new Error(`Token ${token} not found in smart money netflows`);
  }

  const currentNetflow = tokenData.netflow_24h || tokenData.netflow_7d || tokenData.netflow_30d || 0;
  const hours24 = 24;
  const velocity = currentNetflow / hours24;
  const predictedInflow = currentNetflow + (velocity * horizonHours);
  const maxExpectedNetflow = 1000000;
  const pumpProbability = Math.min(100, Math.max(0, (predictedInflow / maxExpectedNetflow) * 100));
  
  let riskScore = 50;
  if (predictedInflow < 0) {
    riskScore += 30;
  }
  if (Math.abs(velocity) < 100) {
    riskScore += 20;
  }
  riskScore = Math.min(100, Math.max(0, riskScore));
  
  const confidence = 100 - riskScore;
  
  let recommendation: 'buy' | 'hold' | 'sell' | 'watch' = 'watch';
  if (pumpProbability > 70 && riskScore < 30) {
    recommendation = 'buy';
  } else if (pumpProbability > 50 && riskScore < 50) {
    recommendation = 'hold';
  } else if (predictedInflow < -10000) {
    recommendation = 'sell';
  }
  
  const reasoning = `Current 24h netflow: ${currentNetflow.toLocaleString()}. ` +
    `Predicted ${horizonHours}h inflow: ${predictedInflow.toLocaleString()}. ` +
    `Velocity: ${velocity.toFixed(2)}/hour. ` +
    `Pump probability: ${pumpProbability.toFixed(1)}%. ` +
    `Risk score: ${riskScore.toFixed(1)}/100.`;
  
  return {
    token,
    chain: tokenData.chain || 'solana',
    currentNetflow,
    predictedInflow,
    pumpProbability,
    riskScore,
    confidence,
    forecastHorizon: `${horizonHours}h`,
    recommendation,
    reasoning
  };
}

describe('Smart Flow Forecaster - Unit Tests', () => {
  
  describe('calculateForecast', () => {
    
    it('should calculate positive flow forecast correctly', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            token_address: 'So11111111111111111111111111111111111111112',
            chain: 'solana',
            netflow_24h: 240000, // Positive netflow
            netflow_7d: 1500000,
            netflow_30d: 5000000
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      expect(forecast.token).toBe('SOL');
      expect(forecast.currentNetflow).toBe(240000);
      expect(forecast.predictedInflow).toBe(480000); // 240000 + (240000/24) * 24 = 480000
      expect(forecast.pumpProbability).toBeGreaterThan(40);
      expect(forecast.riskScore).toBeLessThanOrEqual(50);
      expect(forecast.confidence).toBeGreaterThan(50);
      expect(forecast.recommendation).toMatch(/^(buy|hold)$/);
      
      console.log('✅ Positive flow forecast:', forecast);
    });

    it('should handle negative flow forecast', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: -120000 // Negative netflow (selling pressure)
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      expect(forecast.currentNetflow).toBe(-120000);
      expect(forecast.predictedInflow).toBe(-240000);
      expect(forecast.riskScore).toBeGreaterThan(50); // Higher risk for negative flow
      expect(forecast.recommendation).toMatch(/^(sell|watch)$/);
      
      console.log('✅ Negative flow forecast:', forecast);
    });

    it('should calculate velocity correctly', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 48000
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // velocity = 48000 / 24 = 2000 per hour
      const expectedVelocity = 2000;
      const velocityMatch = forecast.reasoning.match(/Velocity: ([\d.]+)\/hour/);
      
      expect(velocityMatch).toBeDefined();
      const actualVelocity = parseFloat(velocityMatch![1]);
      expect(Math.abs(actualVelocity - expectedVelocity)).toBeLessThan(0.01);
      
      console.log('✅ Velocity calculation:', actualVelocity, 'expected:', expectedVelocity);
    });

    it('should recommend buy for high pump probability and low risk', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 800000 // Very high netflow
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // High netflow should result in high pump probability
      expect(forecast.pumpProbability).toBeGreaterThan(70);
      expect(forecast.riskScore).toBeLessThanOrEqual(50);
      expect(forecast.recommendation).toBe('buy');
      
      console.log('✅ Buy recommendation:', forecast);
    });

    it('should recommend sell for large negative inflow', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: -500000 // Large negative netflow
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 48);

      // Large negative flow should trigger sell recommendation
      expect(forecast.predictedInflow).toBeLessThan(-10000);
      expect(forecast.recommendation).toBe('sell');
      
      console.log('✅ Sell recommendation:', forecast);
    });

    it('should recommend watch for low velocity', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 1200 // Low netflow (velocity = 50/hour < 100)
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // Low velocity should increase risk score and result in watch
      expect(forecast.riskScore).toBeGreaterThan(50);
      expect(forecast.recommendation).toBe('watch');
      
      console.log('✅ Watch recommendation for low velocity:', forecast);
    });

    it('should scale predictions with forecast horizon', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 240000
          }
        ]
      };

      const forecast24h = calculateForecast(mockNetflowData, {}, 'SOL', 24);
      const forecast48h = calculateForecast(mockNetflowData, {}, 'SOL', 48);
      const forecast72h = calculateForecast(mockNetflowData, {}, 'SOL', 72);

      // Predicted inflow should scale linearly with horizon
      expect(forecast48h.predictedInflow).toBeGreaterThan(forecast24h.predictedInflow);
      expect(forecast72h.predictedInflow).toBeGreaterThan(forecast48h.predictedInflow);
      
      console.log('✅ Horizon scaling:', {
        '24h': forecast24h.predictedInflow,
        '48h': forecast48h.predictedInflow,
        '72h': forecast72h.predictedInflow
      });
    });

    it('should throw error for token not found', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 240000
          }
        ]
      };

      expect(() => {
        calculateForecast(mockNetflowData, {}, 'UNKNOWN_TOKEN', 24);
      }).toThrow('Token UNKNOWN_TOKEN not found in smart money netflows');
      
      console.log('✅ Correctly throws error for missing token');
    });

    it('should handle fallback to 7d and 30d netflows', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            // No netflow_24h
            netflow_7d: 1500000,
            netflow_30d: 5000000
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // Should use netflow_7d as fallback
      expect(forecast.currentNetflow).toBe(1500000);
      
      console.log('✅ Fallback to 7d netflow:', forecast.currentNetflow);
    });

    it('should cap pump probability at 100%', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 2000000 // Very high netflow (> 1M max)
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 48);

      // Pump probability should be capped at 100%
      expect(forecast.pumpProbability).toBeLessThanOrEqual(100);
      expect(forecast.pumpProbability).toBeGreaterThan(80);
      
      console.log('✅ Pump probability capped:', forecast.pumpProbability);
    });

    it('should cap risk score at 100', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: -50 // Negative + low velocity
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // Risk score should be capped at 100
      expect(forecast.riskScore).toBeLessThanOrEqual(100);
      expect(forecast.riskScore).toBeGreaterThan(70);
      
      console.log('✅ Risk score capped:', forecast.riskScore);
    });

    it('should calculate confidence as inverse of risk', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 240000
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      // Confidence should equal 100 - riskScore
      expect(forecast.confidence).toBe(100 - forecast.riskScore);
      
      console.log('✅ Confidence calculation:', {
        confidence: forecast.confidence,
        riskScore: forecast.riskScore
      });
    });
  });

  describe('Edge cases', () => {
    
    it('should handle zero netflow', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 0
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      expect(forecast.currentNetflow).toBe(0);
      expect(forecast.predictedInflow).toBe(0);
      expect(forecast.recommendation).toBe('watch');
      
      console.log('✅ Zero netflow handled:', forecast);
    });

    it('should handle very small netflow', () => {
      const mockNetflowData = {
        data: [
          {
            token: 'SOL',
            chain: 'solana',
            netflow_24h: 50 // Very small
          }
        ]
      };

      const forecast = calculateForecast(mockNetflowData, {}, 'SOL', 24);

      expect(forecast.riskScore).toBeGreaterThan(50); // Low velocity = higher risk
      expect(forecast.recommendation).toBe('watch');
      
      console.log('✅ Small netflow handled:', forecast);
    });
  });
});


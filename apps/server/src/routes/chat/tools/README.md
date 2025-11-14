# Smart Flow Forecaster Tool

AI-powered prediction tool that analyzes Nansen smart money flows to forecast token pump probability and generate actionable trading recommendations.

## Features

- **Real-time Smart Money Analysis**: Fetches netflow and flow data from Nansen API
- **Predictive Forecasting**: Calculates inflow velocity and extrapolates future trends
- **Risk Assessment**: Generates pump probability (0-100%) and risk scores
- **Auto-Execution**: Optionally executes micro-positions via Jupiter DEX
- **X402 Payment Integration**: Server-side micropayment handling via Grid wallet
- **Beautiful Visualizations**: Renders forecast data with FlowForecastViz component

## How It Works

1. Fetches smart money netflows (aggregate buying/selling trends)
2. Fetches detailed flows for specific token
3. Calculates inflow velocity and predicts future flows
4. Generates pump probability and risk scores
5. Provides BUY/HOLD/SELL/WATCH recommendations
6. Optionally generates Jupiter swap quotes and executes positions

## Usage

```typescript
// AI triggers this tool when user asks:
// "Forecast SOL for next 24h"
// "Should I buy BONK?"
// "Will JUP pump?"

const result = await smartFlowForecaster({
  token: 'SOL',
  chain: 'solana',
  horizonHours: 24,
  autoExecute: false,
  positionSizeUsdc: 0.1
});
```

## Output Structure

```typescript
interface ForecastResult {
  token: string;
  chain: string;
  currentNetflow: number;
  predictedInflow: number;
  pumpProbability: number;      // 0-100
  riskScore: number;             // 0-100 (lower is better)
  confidence: number;            // 0-100
  forecastHorizon: string;
  recommendation: 'buy' | 'hold' | 'sell' | 'watch';
  reasoning: string;
  positionQuote?: {              // Optional Jupiter quote
    inputAmount: string;
    inputToken: string;
    outputAmount: string;
    outputToken: string;
    slippage: string;
  };
  transactionSignature?: string; // If auto-executed
}
```

## Cost

- ~0.002 USDC per forecast (2 Nansen API calls)
- ~0.001 USDC for native SOL (only netflows)

## Requirements

- USDC balance for X402 payments
- Grid wallet for payment signing
- Valid Nansen API access

## Integration Points

- **Nansen API**: Smart money netflows and flows data
- **Jupiter DEX**: Token swap quotes and execution
- **Grid Protocol**: Wallet signing and x402 payments
- **Supabase**: Flow alert persistence (via cron scheduler)

## Related Files

- `smartFlowForecaster.ts` - Main tool implementation
- `jupiterService.ts` - Jupiter swap integration
- `FlowForecastViz.tsx` - Visualization component
- `flowForecasterScheduler.ts` - Background alert polling


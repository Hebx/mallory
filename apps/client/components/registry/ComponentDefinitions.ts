import { ComponentDefinition } from './ComponentRegistry';

// Import dynamic components (LLM-controlled only)
// Only components from the ui/ directory should be in the registry
import { InlineCitationWrapper } from '../ui/InlineCitationWrapper';
import { FlowForecastViz } from '../chat/FlowForecastViz';

/**
 * Dynamic component definitions
 * These components are rendered based on LLM responses
 * 
 * IMPORTANT: Only components from the ui/ directory should be defined here.
 * These are dynamic components that the LLM can choose to render when necessary.
 * 
 * Components from other directories (like chat/) should be imported and used
 * directly in their respective contexts, not through the registry system.
 */
export const dynamicComponents: ComponentDefinition[] = [
  {
    name: 'InlineCitation',
    component: InlineCitationWrapper,
    category: 'dynamic',
    description: 'Displays inline citations for AI-generated content with sources. Shows a citation badge that opens a modal with source details.',
    propsSchema: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          description: 'The text content that has citations' 
        },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { 
                type: 'string', 
                description: 'Source title' 
              },
              url: { 
                type: 'string', 
                description: 'Source URL (required)' 
              },
              description: { 
                type: 'string', 
                description: 'Brief description of the source' 
              },
              quote: { 
                type: 'string', 
                description: 'Relevant excerpt or quote from the source' 
              }
            },
            required: ['url']
          },
          description: 'Array of source citations. At least one source with a URL is required.'
        }
      },
      required: ['text', 'sources']
    },
    examples: [
      {
        text: 'According to recent studies, artificial intelligence has shown remarkable progress in natural language processing.',
        sources: [
          {
            title: 'AI Advances 2024',
            url: 'https://example.com/ai-advances',
            description: 'A comprehensive study on recent AI breakthroughs',
            quote: 'Machine learning models have achieved unprecedented accuracy in natural language processing tasks.'
          }
        ]
      },
      {
        text: 'The technology continues to evolve rapidly, with new breakthroughs announced regularly.',
        sources: [
          {
            title: 'Tech Evolution Report',
            url: 'https://example.com/tech-report',
            description: 'Analysis of technological trends and future predictions'
          },
          {
            title: 'Future of AI - MIT Technology Review',
            url: 'https://example.com/future-ai',
            description: 'Predictions and emerging patterns in artificial intelligence',
            quote: 'The next decade will see AI systems becoming increasingly sophisticated.'
          }
        ]
      },
      {
        text: 'Recent findings suggest a 45% increase in AI adoption across enterprises.',
        sources: [
          {
            title: 'Enterprise AI Survey 2024',
            url: 'https://example.com/enterprise-ai-survey'
          }
        ]
      }
    ]
  },
  {
    name: 'FlowForecastViz',
    component: FlowForecastViz,
    category: 'dynamic',
    description: 'Displays smart money flow forecast visualization with animated charts, pump probability, risk assessment, and trade recommendations. Used for the Smart Flow Forecaster tool.',
    propsSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            token: { 
              type: 'string', 
              description: 'Token symbol (e.g., SOL, BONK)' 
            },
            chain: { 
              type: 'string', 
              description: 'Blockchain name (e.g., solana, ethereum)' 
            },
            currentNetflow: { 
              type: 'number', 
              description: 'Current smart money netflow in USD' 
            },
            predictedInflow: { 
              type: 'number', 
              description: 'Predicted inflow in USD over forecast horizon' 
            },
            pumpProbability: { 
              type: 'number', 
              description: 'Probability of price increase (0-100)' 
            },
            riskScore: { 
              type: 'number', 
              description: 'Risk assessment score (0-100, higher = riskier)' 
            },
            confidence: { 
              type: 'number', 
              description: 'Model confidence in prediction (0-100)' 
            },
            forecastHorizon: { 
              type: 'string', 
              description: 'Forecast time horizon (e.g., "24h", "7d")' 
            },
            recommendation: { 
              type: 'string',
              enum: ['buy', 'hold', 'sell', 'watch'],
              description: 'Trade recommendation based on forecast' 
            },
            reasoning: { 
              type: 'string', 
              description: 'Explanation of the forecast and recommendation' 
            },
            positionQuote: {
              type: 'object',
              properties: {
                inputAmount: { type: 'string', description: 'Input amount with units' },
                inputToken: { type: 'string', description: 'Input token symbol' },
                outputAmount: { type: 'string', description: 'Output amount with units' },
                outputToken: { type: 'string', description: 'Output token symbol' },
                slippage: { type: 'string', description: 'Expected slippage percentage' }
              },
              description: 'Optional Jupiter swap quote for suggested position'
            }
          },
          required: ['token', 'chain', 'currentNetflow', 'predictedInflow', 'pumpProbability', 'riskScore', 'confidence', 'forecastHorizon', 'recommendation', 'reasoning']
        }
      },
      required: ['data']
    },
    examples: [
      {
        data: {
          token: 'SOL',
          chain: 'solana',
          currentNetflow: -125000,
          predictedInflow: 480000,
          pumpProbability: 72.5,
          riskScore: 35,
          confidence: 81,
          forecastHorizon: '24h',
          recommendation: 'buy',
          reasoning: 'Strong bullish signal: current smart money outflow of $125K is predicted to reverse into $480K inflow over next 24h. High pump probability (72.5%) with moderate risk. Confidence is solid at 81%.',
          positionQuote: {
            inputAmount: '10 USDC',
            inputToken: 'USDC',
            outputAmount: '0.045 SOL',
            outputToken: 'SOL',
            slippage: '0.5%'
          }
        }
      },
      {
        data: {
          token: 'BONK',
          chain: 'solana',
          currentNetflow: 85000,
          predictedInflow: 120000,
          pumpProbability: 58.3,
          riskScore: 45,
          confidence: 65,
          forecastHorizon: '48h',
          recommendation: 'hold',
          reasoning: 'Moderate bullish signal: smart money already flowing in ($85K), expected to increase to $120K over 48h. Pump probability is moderate (58.3%) with elevated risk (45). Lower confidence (65%) suggests caution.'
        }
      }
    ]
  }
];

/**
 * All dynamic components (this is now the same as dynamicComponents)
 * Static components are not part of the registry system
 */
export const allComponents: ComponentDefinition[] = dynamicComponents;

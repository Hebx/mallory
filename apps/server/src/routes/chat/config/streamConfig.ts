/**
 * StreamText configuration builder
 * Assembles all options for the AI streaming call
 */
// import { AnthropicProviderOptions } from '@ai-sdk/anthropic';

import { UIMessage, convertToModelMessages } from 'ai';
import { getToolDisplayName, formatToolResultsForLog } from '../../../lib/toolDisplayNames';

interface StreamConfigOptions {
  model: any;
  processedMessages: UIMessage[];
  systemPrompt: string;
  tools: any;
  strategy: {
    useExtendedThinking: boolean;
    useInfiniteMemory: boolean;
  };
}

/**
 * Build complete configuration for streamText
 */
export function buildStreamConfig(options: StreamConfigOptions) {
  const { model, processedMessages, systemPrompt, tools, strategy } = options;
  
  const modelMessages = convertToModelMessages(
    processedMessages.map(({ id, ...rest }) => rest)
  );
  
  return {
    model,
    messages: modelMessages,
    system: systemPrompt,
    temperature: 0.8, // Higher temperature for more creative/agentic behavior
    
    tools,
    
    // CRITICAL FIX: Remove maxSteps limit - let the agent run until naturally complete
    // Setting this to a low number might cause premature stopping
    // The system prompt has multiple explicit instructions to continue after tool calls
    maxSteps: 50, // Unlimited steps - let agent continue until it's actually done
    
    // Force continuation after tool calls (WORKAROUND for Claude multi-step bug)
    // The idea: If step finishes with tool-calls, inject a continuation prompt
    async onStepFinish({ text, toolCalls, toolResults, finishReason, isContinued, ...step }: any) {
      const stepNumber = (step as any).stepNumber || 'unknown';
      console.log(`🤖 AGENT STEP ${stepNumber} COMPLETED:`);
      console.log('- Text generated:', !!text);
      console.log('- Tool calls:', toolCalls.length, toolCalls.length > 0 ? `(${toolCalls.map((tc: any) => getToolDisplayName(tc.toolName)).join(', ')})` : '');
      console.log('- Tool results:', toolResults.length);
      console.log('- Finish reason:', finishReason);
      console.log('- Is continued:', isContinued);
      console.log('- Step text preview:', text?.substring(0, 100) + '...');
      console.log('- Current step number:', stepNumber);
      console.log('- Has tool results to process:', toolResults.length > 0);
      
      // Debug: Why is the agent stopping?
      if (finishReason === 'tool-calls' && toolResults.length > 0) {
        console.log('🚨 AGENT ISSUE: Finished after tool calls without generating response!');
        console.log('- Tool results available:', formatToolResultsForLog(toolResults));
        console.log('- Expected: AI should continue to generate response using these results');
        console.log('- Full tool results:', JSON.stringify(toolResults, null, 2));
        console.log('- isContinued flag:', isContinued);
        console.log('⚠️ This indicates the multi-step agent is not continuing properly');
        console.log('💡 This is a KNOWN LIMITATION of the AI SDK with Claude multi-step agents');
        console.log('💡 Recommendation: Switch to OpenAI (gpt-4-turbo/gpt-4o) for proper multi-step behavior');
      }
    },
    
    // Disabling thinking for now given bugs
    // TODO: Re-enable
    // Enable extended thinking based on smart strategy decision
    // ...(strategy.useExtendedThinking ? {
    //   headers: {
    //     'anthropic-beta': 'interleaved-thinking-2025-05-14',
    //   },
    //   providerOptions: {
    //     anthropic: {
    //       thinking: { type: 'enabled', budgetTokens: 15000 },
    //       sendReasoning: true,
    //     } satisfies AnthropicProviderOptions,
    //   },
    // } : {}),
    
    onError: (error: any) => {
      console.error('❌ AI streaming error:', error);
    }
  };
}

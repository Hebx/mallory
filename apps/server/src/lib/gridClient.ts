import { GridClient } from '@sqds/grid';

/**
 * Create a new GridClient instance
 * 
 * GridClient is stateful, so we need to create a fresh instance for each
 * request/operation to avoid state pollution between concurrent requests.
 * 
 * @returns A new GridClient instance configured with environment variables
 */
export function createGridClient(): GridClient {
  // IMPORTANT: Must match client environment (EXPO_PUBLIC_GRID_ENV)
  // Client and server MUST use the same Grid environment for sessionSecrets to work
  const gridEnv = (process.env.EXPO_PUBLIC_GRID_ENV || process.env.GRID_ENV || 'production') as 'sandbox' | 'production';
  
  return new GridClient({
    environment: gridEnv,
    apiKey: process.env.GRID_API_KEY!,
    baseUrl: 'https://grid.squads.xyz'
  });
}


/**
 * @stockcheck/runtime — Low-level JSON-RPC client
 *
 * Provides typed, structured JSON-RPC communication for Surfpool and Solana RPC nodes.
 */

export const DEFAULT_SURFPOOL_RPC_URL = "http://127.0.0.1:8899";

/**
 * Execute a standard JSON-RPC 2.0 request.
 *
 * @param method - JSON-RPC method name
 * @param params - Method parameters array
 * @param rpcUrl - Endpoint URL (defaults to Surfpool default)
 */
export async function rpc<T = unknown>(
  method: string,
  params: unknown[] = [],
  rpcUrl = DEFAULT_SURFPOOL_RPC_URL
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Surfpool RPC ${method} failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as { result?: T; error?: { message: string } };

  if (json.error != null) {
    throw new Error(`Surfpool RPC ${method} error: ${json.error.message}`);
  }

  return json.result as T;
}

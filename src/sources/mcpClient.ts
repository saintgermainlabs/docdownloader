import type { FetchLike } from './probe';

/** Minimal MCP client: call a tool and get its text result. */
export interface McpClient {
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

/**
 * MCP client over streamable HTTP (JSON-RPC `tools/call`), accepting JSON or SSE responses.
 *
 * @throws on HTTP errors (message includes the status) and on tool results with `isError`.
 */
export function httpMcpClient(
  endpoint = 'https://mcp.deepwiki.com/mcp',
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): McpClient {
  let id = 0;
  return {
    async callTool(name, args) {
      const res = await (fetchImpl as any)(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'User-Agent': 'doc-dl',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }),
        signal: AbortSignal.timeout(120000),
      });
      if (res.status >= 400) throw new Error(`MCP HTTP ${res.status} from ${endpoint}`);
      const text: string = await res.text();
      const payloads = text.includes('data:')
        ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5))
        : [text];
      for (const p of payloads) {
        let msg: any;
        try {
          msg = JSON.parse(p);
        } catch {
          continue;
        }
        if (msg.error) throw new Error(`MCP error: ${msg.error.message ?? JSON.stringify(msg.error)}`);
        if (msg.result) {
          const out = (msg.result.content ?? [])
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          if (msg.result.isError) throw new Error(`MCP tool ${name} failed: ${out}`);
          return out;
        }
      }
      throw new Error(`MCP tool ${name}: no result in response`);
    },
  };
}

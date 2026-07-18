export const EVIDENCE_TOOLS = [
  {
    name: 'list_tree',
    description: 'List indexed snapshot paths below an optional path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 12 } }, additionalProperties: false }
  },
  {
    name: 'search',
    description: 'Search literal text in indexed snapshot files.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, path: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }
  },
  {
    name: 'read_range',
    description: 'Read at most 200 numbered lines from one indexed snapshot file.',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, start_line: { type: 'integer', minimum: 1 }, end_line: { type: 'integer', minimum: 1 } }, additionalProperties: false }
  },
  {
    name: 'get_metadata',
    description: 'Get size, line count, and hash for one indexed snapshot file.',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false }
  }
];

export async function handleMcpRequest(request, broker) {
  let result;
  if (request.method === 'initialize') {
    result = { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'plan-mirror-evidence', version: '0.1.0' } };
  } else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/list') result = { tools: EVIDENCE_TOOLS };
  else if (request.method === 'tools/call') {
    const payload = await broker.call(request.params?.name, request.params?.arguments ?? {});
    result = { content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload, isError: false };
  } else throw new Error(`method not found: ${request.method}`);
  return { jsonrpc: '2.0', id: request.id, result };
}

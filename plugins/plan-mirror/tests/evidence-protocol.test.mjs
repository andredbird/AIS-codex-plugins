import test from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE_TOOLS, handleMcpRequest } from '../src/evidence-protocol.mjs';

test('MCP protocol exposes exactly four read-only tools', async () => {
  assert.deepEqual(EVIDENCE_TOOLS.map((tool) => tool.name), ['list_tree', 'search', 'read_range', 'get_metadata']);
  const listed = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, null);
  assert.equal(listed.result.tools, EVIDENCE_TOOLS);
});

test('MCP tool calls return structured evidence payloads', async () => {
  const broker = { call: async (name, args) => ({ evidence_id: 'ev-0123456789abcdef', name, args }) };
  const response = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_range', arguments: { path: 'a.txt' } } }, broker);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.evidence_id, 'ev-0123456789abcdef');
  assert.equal(response.result.content[0].type, 'text');
});

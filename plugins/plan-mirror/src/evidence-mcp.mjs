#!/usr/bin/env node
import readline from 'node:readline';
import { EvidenceBroker } from './evidence-broker.mjs';
import { handleMcpRequest } from './evidence-protocol.mjs';
import { parseArgs } from './util.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.snapshot || !args.audit) throw new Error('--snapshot and --audit are required');
const broker = await new EvidenceBroker({
  snapshot: args.snapshot,
  audit: args.audit,
  maxRequests: Number(args.max_requests ?? 150),
  maxBytes: Number(args.max_bytes ?? 4_194_304)
}).initialize();

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  let request;
  try { request = JSON.parse(line); } catch { continue; }
  if (request.id === undefined) continue;
  try {
    send(await handleMcpRequest(request, broker));
  } catch (error) {
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message } });
  }
}

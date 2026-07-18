import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256, relativeSafe } from './util.mjs';

export class EvidenceBroker {
  constructor({ snapshot, audit, maxRequests = 150, maxBytes = 4_194_304 }) {
    this.snapshot = path.resolve(snapshot);
    this.audit = path.resolve(audit);
    this.maxRequests = maxRequests;
    this.maxBytes = maxBytes;
    this.requests = 0;
    this.bytes = 0;
    this.manifest = null;
  }

  async initialize() {
    this.manifest = JSON.parse(await readFile(path.join(this.snapshot, '.plan-mirror-manifest.json'), 'utf8'));
    return this;
  }

  resolve(relative = '') {
    const normalized = path.posix.normalize(String(relative).replaceAll('\\', '/')).replace(/^\.\//, '');
    if (!normalized || normalized === '.') return { relative: '', absolute: this.snapshot };
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) throw new Error('path traversal blocked');
    const absolute = path.resolve(this.snapshot, ...normalized.split('/'));
    if (!relativeSafe(this.snapshot, absolute)) throw new Error('path traversal blocked');
    return { relative: normalized, absolute };
  }

  async record(tool, args, payload, { bytes = 0, truncated = false, error = null } = {}) {
    this.requests += 1;
    if (this.requests > this.maxRequests) throw new Error('evidence request limit exceeded');
    if (this.bytes + bytes > this.maxBytes) throw new Error('evidence byte limit exceeded');
    this.bytes += bytes;
    const evidenceId = `ev-${sha256(`${this.requests}\0${tool}\0${JSON.stringify(args)}\0${JSON.stringify(payload)}`).slice(0, 16)}`;
    const entry = { evidence_id: evidenceId, tool, args, bytes, truncated, error, at: new Date().toISOString() };
    await appendFile(this.audit, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    return { evidence_id: evidenceId, ...payload, truncated };
  }

  async recordFailure(tool, args, message) {
    const evidenceId = `ev-${sha256(`error\0${this.requests}\0${tool}\0${JSON.stringify(args)}\0${message}`).slice(0, 16)}`;
    await appendFile(this.audit, `${JSON.stringify({ evidence_id: evidenceId, tool, args, bytes: 0, truncated: false, error: message, at: new Date().toISOString() })}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  async listTree(args = {}) {
    const prefix = this.resolve(args.path ?? '').relative;
    const depth = Math.max(1, Math.min(Number(args.depth ?? 4), 12));
    const baseParts = prefix ? prefix.split('/').length : 0;
    const paths = this.manifest.files.map((file) => file.path)
      .filter((file) => (!prefix || file === prefix || file.startsWith(`${prefix}/`)) && file.split('/').length - baseParts <= depth)
      .slice(0, 2_000);
    return this.record('list_tree', args, { paths }, { truncated: paths.length === 2_000 });
  }

  async getMetadata(args = {}) {
    const { relative } = this.resolve(args.path);
    const file = this.manifest.files.find((entry) => entry.path === relative);
    if (!file) throw new Error('file is not in snapshot');
    return this.record('get_metadata', args, { file });
  }

  async readRange(args = {}) {
    const { relative, absolute } = this.resolve(args.path);
    const file = this.manifest.files.find((entry) => entry.path === relative);
    if (!file) throw new Error('file is not in snapshot');
    const start = Math.max(1, Number(args.start_line ?? 1));
    const requestedEnd = Math.max(start, Number(args.end_line ?? start + 199));
    const end = Math.min(requestedEnd, start + 199);
    const lines = (await readFile(absolute, 'utf8')).split('\n');
    const text = lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join('\n');
    const bytes = Buffer.byteLength(text);
    return this.record('read_range', args, { path: relative, start_line: start, end_line: Math.min(end, lines.length), text }, { bytes, truncated: requestedEnd > end || end < lines.length });
  }

  async search(args = {}) {
    const query = String(args.query ?? '');
    if (!query || query.length > 256) throw new Error('query must contain 1-256 characters');
    const prefix = this.resolve(args.path ?? '').relative;
    const limit = Math.max(1, Math.min(Number(args.max_results ?? 50), 100));
    const results = [];
    let bytes = 0;
    for (const file of this.manifest.files) {
      if (prefix && file.path !== prefix && !file.path.startsWith(`${prefix}/`)) continue;
      if (this.bytes + bytes + file.bytes > this.maxBytes) throw new Error('evidence byte limit exceeded');
      const content = await readFile(path.join(this.snapshot, ...file.path.split('/')), 'utf8');
      bytes += file.bytes;
      const lines = content.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
          const match = { path: file.path, line: index + 1, text: lines[index].slice(0, 500) };
          results.push(match);
          if (results.length >= limit) return this.record('search', args, { results }, { bytes, truncated: true });
        }
      }
    }
    return this.record('search', args, { results }, { bytes });
  }

  async call(name, args) {
    const methods = { list_tree: 'listTree', search: 'search', read_range: 'readRange', get_metadata: 'getMetadata' };
    if (!methods[name]) throw new Error(`unknown tool: ${name}`);
    try {
      return await this[methods[name]](args);
    } catch (error) {
      try { await this.recordFailure(name, args, error.message); } catch { /* original error wins */ }
      throw error;
    }
  }
}

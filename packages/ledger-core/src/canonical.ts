import { createHash } from 'node:crypto';

export type Hex = string;

/**
 * Deterministic JSON serialization: object keys are sorted recursively so the
 * same logical value always hashes to the same digest regardless of key order.
 * Undefined object values are dropped (same behavior as JSON.stringify).
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot canonicalize a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}';
  }
  throw new Error('Cannot canonicalize value of type ' + typeof value);
}

export function sha256Hex(input: string): Hex {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashObject(value: unknown): Hex {
  return sha256Hex(canonicalize(value));
}

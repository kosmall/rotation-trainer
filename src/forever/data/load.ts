import paramsJson from './params.json';
import type { Params } from '../types';

type RawParams = Record<string, { value: unknown; verify?: boolean; source: string }>;

/** Resolved parameter values, optionally overridden (for sensitivity runs and the CLI). */
export function loadParams(overrides: Partial<Params> = {}): Params {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(paramsJson as unknown as RawParams)) {
    if (key.startsWith('_')) continue;
    out[key] = entry.value;
  }
  return { ...(out as unknown as Params), ...overrides };
}

export interface VerifyItem {
  path: string;
  source: string;
}

/** Walks any JSON value and returns every object that carries `verify: true`. */
export function walkVerify(node: unknown, path: string, out: VerifyItem[]): VerifyItem[] {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkVerify(child, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj.verify === true) out.push({ path, source: String(obj.source ?? obj.reason ?? '') });
    for (const [key, child] of Object.entries(obj)) walkVerify(child, path === '' ? key : `${path}.${key}`, out);
  }
  return out;
}

/** The raw params JSON, for tests and the verify registry. */
export const RAW_PARAMS: unknown = paramsJson;

// Allowlist proxy decision logic (pure apart from the injected DNS lookup). The server in
// `server.ts` asks `decide()` about every CONNECT and dials only the address it returns.
import { BlockList, isIP } from 'node:net';

/** Addresses the proxy never dials: everything that isn't public unicast, plus the metadata server. */
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23],
  ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(net, bits, 'ipv6');
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is checked against the IPv4 rules by BlockList itself.

/** Names denied even if someone adds them to PROXY_ALLOW. */
const BLOCKED_NAMES = new Set(['metadata.google.internal', 'metadata', 'localhost']);

/** True if the proxy must never connect to this resolved address. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  return BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** Parses `PROXY_ALLOW` (comma/space separated hostnames) into a normalised set. */
export function parseAllow(list: string): Set<string> {
  return new Set(list.split(/[\s,]+/).map(normalise).filter((h) => h !== ''));
}

function normalise(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export type Decision =
  | { allow: true; host: string; port: number; address: string; family: 4 | 6 }
  | { allow: false; host: string; port: number; reason: string };

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

/**
 * Decides a CONNECT request for `authority` (`host:port`). Order matters: the hostname is checked
 * against the allowlist *before* any DNS lookup, so a denied name never leaves the proxy (no DNS
 * exfiltration); then every resolved address must be public, and the caller dials `address`
 * itself rather than resolving again (no DNS rebinding between check and connect).
 */
export async function decide(authority: string, allow: Set<string>, lookup: Lookup): Promise<Decision> {
  const m = /^(\[[^\]]*\]|[^:]*):(\d{1,5})$/.exec(authority);
  const host = normalise(m?.[1] ?? authority);
  const port = Number(m?.[2] ?? 0);
  const deny = (reason: string): Decision => ({ allow: false, host, port, reason });
  if (!m) return deny('malformed authority');
  if (port !== 443) return deny('port not 443');
  if (host.includes(':') || host.startsWith('[') || isIP(host) !== 0) return deny('ip literal');
  // WHATWG URL parsing treats any host whose last label is numeric (decimal/hex/octal) as IPv4.
  if (/(^|\.)(0x[0-9a-f]*|\d+)$/.test(host)) return deny('ip literal');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return deny('invalid hostname');
  if (BLOCKED_NAMES.has(host)) return deny('blocked name');
  if (!allow.has(host)) return deny('not in allowlist');
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host);
  } catch {
    return deny('dns failure');
  }
  const first = addrs[0];
  if (!first) return deny('dns empty');
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) return deny(`resolves to blocked address ${bad.address}`);
  return { allow: true, host, port, address: first.address, family: first.family === 6 ? 6 : 4 };
}

// Allowlist proxy decisions (harness/proxy/policy.ts): allowlist before DNS, IP literals in every
// form, private/metadata resolutions, and dialing the address that was checked.
import { describe, expect, it, vi } from 'vitest';
import { decide, isBlockedAddress, parseAllow, type Lookup } from '../proxy/policy.ts';

const allow = parseAllow('api.anthropic.com, Example.ORG.');
const resolvesTo = (...addrs: string[]) =>
  vi.fn<Lookup>(async () => addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
const PUBLIC = '160.79.104.10';

describe('parseAllow', () => {
  it('normalises case, trailing dots and separators', () => {
    expect([...allow]).toEqual(['api.anthropic.com', 'example.org']);
  });
});

describe('decide', () => {
  it('allows an allowlisted host on 443 and returns the resolved address to dial', async () => {
    const lookup = resolvesTo(PUBLIC, '2607:6bc0::10');
    const d = await decide('API.Anthropic.com.:443', allow, lookup);
    expect(d).toEqual({ allow: true, host: 'api.anthropic.com', port: 443, address: PUBLIC, family: 4 });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each(['example.com:443', 'evil.api.anthropic.com:443', 'api.anthropic.com.evil.com:443'])(
    'denies %s without resolving it (no DNS exfiltration)',
    async (authority) => {
      const lookup = resolvesTo(PUBLIC);
      const d = await decide(authority, allow, lookup);
      expect(d.allow).toBe(false);
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it.each(['api.anthropic.com:80', 'api.anthropic.com:8443', 'api.anthropic.com', 'api.anthropic.com:', ''])(
    'denies wrong port or malformed authority %j',
    async (authority) => {
      expect((await decide(authority, allow, resolvesTo(PUBLIC))).allow).toBe(false);
    },
  );

  it.each([
    '1.1.1.1', '127.0.0.1', '169.254.169.254', '10.0.0.1', '2130706433', '0x7f000001', '0x7f.1',
    '0177.0.0.1', '127.1', '[::1]', '[::ffff:127.0.0.1]', '[fd00::1]', '[2607:f8b0::1]', '::1',
  ])('denies IP literal %s', async (host) => {
    const lookup = resolvesTo(PUBLIC);
    const d = await decide(`${host}:443`, parseAllow(host), lookup);
    expect(d.allow).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(['metadata.google.internal', 'localhost', 'a_b.example', 'xn--.com%2f', 'a..b'])(
    'denies blocked or invalid name %s even if allowlisted',
    async (host) => {
      expect((await decide(`${host}:443`, parseAllow(host), resolvesTo(PUBLIC))).allow).toBe(false);
    },
  );

  it.each([
    ['private v4', '10.1.2.3'], ['loopback', '127.0.0.1'], ['metadata', '169.254.169.254'],
    ['CGNAT', '100.64.0.1'], ['multicast', '224.0.0.1'], ['unspecified', '0.0.0.0'],
    ['ULA', 'fd12::1'], ['link-local v6', 'fe80::1'], ['mapped private', '::ffff:192.168.1.1'],
    ['v6 loopback', '::1'],
  ])('denies an allowlisted name that resolves to %s', async (_name, addr) => {
    const d = await decide('api.anthropic.com:443', allow, resolvesTo(PUBLIC, addr));
    expect(d).toMatchObject({ allow: false, reason: `resolves to blocked address ${addr}` });
  });

  it('denies on DNS failure or empty answer', async () => {
    const failing: Lookup = async () => { throw new Error('ENOTFOUND'); };
    expect(await decide('api.anthropic.com:443', allow, failing)).toMatchObject({ allow: false, reason: 'dns failure' });
    expect(await decide('api.anthropic.com:443', allow, resolvesTo())).toMatchObject({ allow: false, reason: 'dns empty' });
  });
});

describe('isBlockedAddress', () => {
  it('passes public unicast and blocks junk', () => {
    expect(isBlockedAddress(PUBLIC)).toBe(false);
    expect(isBlockedAddress('2607:6bc0::10')).toBe(false);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('255.255.255.255')).toBe(true);
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

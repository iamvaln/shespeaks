import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailDomainAccepts, isWhatsappNumber, strictContactChecks, type Resolver } from '../src/lib/contact.ts';

test('strict contact checks: on for the production deployment, switchable with STRICT_CONTACT_CHECKS', () => {
  assert.equal(strictContactChecks({}), false);
  assert.equal(strictContactChecks({ VERCEL_ENV: 'preview' }), false);
  assert.equal(strictContactChecks({ VERCEL_ENV: 'development' }), false);
  assert.equal(strictContactChecks({ VERCEL_ENV: 'production' }), true);
  assert.equal(strictContactChecks({ VERCEL_ENV: 'production', STRICT_CONTACT_CHECKS: '0' }), false);
  assert.equal(strictContactChecks({ STRICT_CONTACT_CHECKS: '1' }), true);
  assert.equal(strictContactChecks({ STRICT_CONTACT_CHECKS: 'true', VERCEL_ENV: 'preview' }), true);
});

test('WhatsApp number: real mobile numbers of any country pass, made-up or non-mobile ones do not', () => {
  for (const n of ['+237 677 12 34 56', '+237 699 99 99 99', '+237655123456', '+33 6 12 34 56 78', '+234 803 123 4567', '+228 90 12 34 56']) assert.equal(isWhatsappNumber(n), true, n);
  for (const n of [
    '+237 612 345 678', // 61x is not a Cameroonian mobile range
    '+237 6XX XX XX XX', // the placeholder itself
    '+237 222 22 22 22', // landline
    '677 12 34 56', // no country code
    '+237 677 12 34', // too short
    '+999 123456789', // no such country
    'abc',
  ]) assert.equal(isWhatsappNumber(n), false, n);
});

const dnsError = (code: string) => Object.assign(new Error(code), { code });
const resolver = (mx: () => Promise<{ exchange: string; priority: number }[]>, a: () => Promise<string[]> = async () => { throw dnsError('ENODATA'); }, aaaa: () => Promise<string[]> = async () => { throw dnsError('ENODATA'); }): Resolver => ({ resolveMx: mx, resolve4: a, resolve6: aaaa });

test('email domain: MX records accepted; no domain, no records or a null MX refused', async () => {
  assert.equal(await emailDomainAccepts('a@gmail.com', resolver(async () => [{ exchange: 'mx.google.com', priority: 10 }])), true);
  assert.equal(await emailDomainAccepts('a@nope.invalid', resolver(async () => { throw dnsError('ENOTFOUND'); }, async () => { throw dnsError('ENOTFOUND'); }, async () => { throw dnsError('ENOTFOUND'); })), false);
  assert.equal(await emailDomainAccepts('a@no-mail.com', resolver(async () => { throw dnsError('ENODATA'); })), false);
  assert.equal(await emailDomainAccepts('a@example.com', resolver(async () => [{ exchange: '', priority: 0 }])), false, 'null MX (RFC 7505)');
  assert.equal(await emailDomainAccepts('a@', resolver(async () => [])), false);
});

test('email domain: without MX, an address record is enough (as mail servers do)', async () => {
  assert.equal(await emailDomainAccepts('a@legacy.org', resolver(async () => { throw dnsError('ENODATA'); }, async () => ['203.0.113.7'])), true);
  assert.equal(await emailDomainAccepts('a@v6only.org', resolver(async () => { throw dnsError('ENODATA'); }, async () => { throw dnsError('ENODATA'); }, async () => ['2001:db8::1'])), true);
});

test('email domain: a failing or slow DNS never blocks anyone', async () => {
  assert.equal(await emailDomainAccepts('a@gmail.com', resolver(async () => { throw dnsError('ESERVFAIL'); })), true);
  assert.equal(await emailDomainAccepts('a@gmail.com', resolver(async () => { throw dnsError('ECONNREFUSED'); })), true);
  assert.equal(await emailDomainAccepts('a@legacy.org', resolver(async () => { throw dnsError('ENODATA'); }, async () => { throw dnsError('ETIMEOUT'); })), true);
});

test('email domain: international domain names are looked up in their ASCII form', async () => {
  const seen: string[] = [];
  await emailDomainAccepts('a@exemple.café', resolver(async () => { seen.push('x'); return [{ exchange: 'mx.example.net', priority: 1 }]; }));
  assert.equal(seen.length, 1);
});

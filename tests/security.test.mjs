import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validSlug, isHttpImage, planLimit, cleanText } from '../src/lib/utils.mjs';
import { hmac, verifyHexSignature } from '../src/lib/security.mjs';

test('slug formatting is stable and disallows invalid characters',()=>{
  assert.equal(slugify('Vrisama Fashion & AI!'), 'vrisama-fashion-ai');
  assert.equal(validSlug('vrisama-ai'),true);
  assert.equal(validSlug('not--valid'),false);
  assert.equal(validSlug('../admin'),false);
});
test('only https product images are accepted',()=>{
  assert.equal(isHttpImage('https://images.example.com/item.png'),true);
  assert.equal(isHttpImage('javascript:alert(1)'),false);
  assert.equal(isHttpImage('http://insecure.example.com'),false);
});
test('AI quotas vary by paid plan',()=>{
  assert.equal(planLimit('trial'),10);
  assert.equal(planLimit('business'),300);
  assert.equal(planLimit('unknown'),0);
});
test('signature rejects tampering',()=>{
  const payload=JSON.stringify({orgId:'test',type:'lead.created'});
  const signature=hmac(payload,'test-secret');
  assert.equal(verifyHexSignature(payload,'test-secret',signature),true);
  assert.equal(verifyHexSignature(payload+'x','test-secret',signature),false);
  assert.equal(verifyHexSignature(payload,'test-secret','invalid'),false);
});
test('text fields have bounded size',()=>{
  assert.equal(cleanText('  hello  ',500),'hello');
  assert.equal(cleanText('x'.repeat(800),100).length,100);
});

import { isUuid, isEntitled, hasAutomation, billingStatusFor, safeNextPath, clientIp } from '../src/lib/utils.mjs';

test('uuid validation rejects non-UUIDs', () => {
  assert.equal(isUuid('3f2b8c1e-8d4a-4b5e-9c1d-2a7e6f0b1c3d'), true);
  assert.equal(isUuid("1; drop table users"), false);
  assert.equal(isUuid(undefined), false);
});

test('entitlement follows trial, active, and paid-through cancellation', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  assert.equal(isEntitled(null, now), false);
  assert.equal(isEntitled({ status: 'trialing', trial_ends_at: '2026-06-20T00:00:00Z' }, now), true);
  assert.equal(isEntitled({ status: 'trialing', trial_ends_at: '2026-06-10T00:00:00Z' }, now), false);
  assert.equal(isEntitled({ status: 'active' }, now), true);
  assert.equal(isEntitled({ status: 'authenticated' }, now), true);
  assert.equal(isEntitled({ status: 'cancelled', current_period_end: '2026-06-30T00:00:00Z' }, now), true);
  assert.equal(isEntitled({ status: 'cancelled', current_period_end: '2026-06-01T00:00:00Z' }, now), false);
  assert.equal(isEntitled({ status: 'cancelled', current_period_end: null }, now), false);
  for (const s of ['halted', 'paused', 'completed', 'pending']) assert.equal(isEntitled({ status: s }, now), false, s);
});

test('automation is a paid Business/Growth feature, never during trial', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  assert.equal(hasAutomation({ status: 'trialing', plan: 'business', trial_ends_at: '2026-06-20T00:00:00Z' }, now), false);
  assert.equal(hasAutomation({ status: 'active', plan: 'starter' }, now), false);
  assert.equal(hasAutomation({ status: 'active', plan: 'business' }, now), true);
  assert.equal(hasAutomation({ status: 'active', plan: 'growth' }, now), true);
  assert.equal(hasAutomation({ status: 'halted', plan: 'growth' }, now), false);
});

test('webhook event mapping', () => {
  assert.equal(billingStatusFor('subscription.activated'), 'active');
  assert.equal(billingStatusFor('subscription.charged'), 'active');
  assert.equal(billingStatusFor('subscription.pending'), 'pending');
  assert.equal(billingStatusFor('subscription.cancelled'), 'cancelled');
  assert.equal(billingStatusFor('subscription.updated', 'halted'), 'halted');
  assert.equal(billingStatusFor('subscription.updated', 'created'), null);
  assert.equal(billingStatusFor('payment.captured'), null);
});

test('redirect targets are same-site paths only', () => {
  assert.equal(safeNextPath('/auth/reset'), '/auth/reset');
  assert.equal(safeNextPath('//evil.com'), '/dashboard');
  assert.equal(safeNextPath('https://evil.com'), '/dashboard');
  assert.equal(safeNextPath('/\\evil.com'), '/dashboard');
  assert.equal(safeNextPath(null), '/dashboard');
});

test('client ip comes from first forwarded hop', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
  assert.equal(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientIp(new Headers()), 'unknown');
});

import { generateKeyPairSync, createVerify } from 'node:crypto';
import { normalizeSearchTerm, searchTokens, searchProducts, loggableSearchTerm } from '../src/lib/search.mjs';
import { signServiceAccountJwt, getAccessToken, fetchSearchRows, aggregateBySlug, defaultDateRange } from '../src/lib/gsc.mjs';

test('search normalization keeps Indian scripts and strips accents/punctuation', () => {
  assert.equal(normalizeSearchTerm('  Café  KURTA!! '), 'cafe kurta');
  assert.equal(normalizeSearchTerm('सिल्क साड़ी'), 'सिल्क साड़ी');
  assert.deepEqual(searchTokens('best silk sarees for the wedding'), ['silk', 'saree', 'wedding']);
});

test('product search ranks name over description and tolerates plurals/partials', () => {
  const products = [
    { id: 1, name: 'Cotton Kurta', description: 'Soft daily wear' },
    { id: 2, name: 'Pure Silk Saree', description: 'Wedding collection' },
    { id: 3, name: 'Scarf', description: 'Matches any silk saree' },
  ];
  assert.deepEqual(searchProducts(products, 'silk sarees').map(p => p.id), [2, 3]);
  assert.deepEqual(searchProducts(products, 'kurt').map(p => p.id), [1]);
  assert.deepEqual(searchProducts(products, 'laptop'), []);
  assert.deepEqual(searchProducts(products, 'the'), []);
});

test('search terms that look like personal data are never logged', () => {
  assert.equal(loggableSearchTerm('Silk Saree'), 'silk saree');
  assert.equal(loggableSearchTerm('me@example.com'), null);
  assert.equal(loggableSearchTerm('call 9876543210'), null);
  assert.equal(loggableSearchTerm('a'), null);
});

test('service-account JWT is a valid RS256 signature over the right claims', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = signServiceAccountJwt({ email: 'svc@proj.iam.gserviceaccount.com', privateKey: pem.replace(/\n/g, '\\n'), nowSeconds: 1000 });
  const [h, c, sig] = jwt.split('.');
  assert.equal(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), true);
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, 'svc@proj.iam.gserviceaccount.com');
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3300);
});

test('Search Console client: token exchange, paging, and per-storefront aggregation', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body });
    if (String(url).startsWith('https://oauth2.googleapis.com')) return Response.json({ access_token: 'tok_123' });
    const body = JSON.parse(init.body);
    assert.equal(init.headers.authorization, 'Bearer tok_123');
    assert.deepEqual(body.dimensions, ['page', 'query']);
    assert.equal(body.dimensionFilterGroups[0].filters[0].expression, '/s/');
    if (body.startRow >= 4) return Response.json({});
    return Response.json({ rows: body.startRow === 0
      ? [{ keys: ['https://app.test/s/alpha-shop', 'silk saree'], clicks: 3, impressions: 100, position: 4 },
         { keys: ['https://app.test/s/alpha-shop?utm=x', 'silk saree'], clicks: 1, impressions: 100, position: 8 }]
      : [{ keys: ['https://app.test/s/beta-shop/', 'kurta'], clicks: 0, impressions: 10, position: 12 },
         { keys: ['https://app.test/dashboard', 'ignored'], clicks: 9, impressions: 9, position: 1 }] });
  };
  const token = await getAccessToken({ email: 'svc@x.iam.gserviceaccount.com', privateKey: pem, fetchImpl: fakeFetch });
  assert.equal(token, 'tok_123');
  const range = defaultDateRange(new Date('2026-10-22T00:00:00Z'));
  assert.deepEqual(range, { startDate: '2026-09-22', endDate: '2026-10-19' });
  const rows = await fetchSearchRows({ siteUrl: 'sc-domain:app.test', token, ...range, fetchImpl: fakeFetch, rowLimit: 2 });
  assert.equal(rows.length, 4);
  assert.ok(calls.some(c => c.url.includes('sites/sc-domain%3Aapp.test/searchAnalytics/query')));
  const grouped = aggregateBySlug(rows);
  assert.deepEqual([...grouped.keys()].sort(), ['alpha-shop', 'beta-shop']);
  assert.deepEqual(grouped.get('alpha-shop'), [{ query: 'silk saree', clicks: 4, impressions: 200, ctr: 0.02, position: 6, }]);
  assert.equal(grouped.get('beta-shop')[0].query, 'kurta');
});

test('Search Console errors surface as errors, not silent empty data', async () => {
  await assert.rejects(() => fetchSearchRows({ siteUrl: 'x', token: 't', startDate: 'a', endDate: 'b', fetchImpl: async () => new Response('no', { status: 403 }) }), /gsc_query_403/);
  await assert.rejects(() => getAccessToken({ email: 'e', privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }), fetchImpl: async () => new Response('x', { status: 401 }) }), /google_token_401/);
});

require('reflect-metadata');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { BadRequestException } = require('@nestjs/common');
const { SourceReaderService } = require('../dist/modules/smart-publishing/source-reader.service');

function response(statusCode, headers = {}, body = '') {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  stream.statusCode = statusCode;
  stream.headers = headers;
  return stream;
}

test('SourceReader rejects private, loopback, link-local and metadata IP representations', async () => {
  const service = new SourceReaderService();
  const blockedUrls = [
    'http://0.0.0.0/',
    'http://10.0.0.1/',
    'http://127.0.0.1/',
    'http://0x7f000001/',
    'http://100.64.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://168.63.129.16/',
    'http://192.168.0.1/',
    'http://198.18.0.1/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:a9fe:a9fe]/',
    'http://[::ffff:c0a8:101]/',
    'http://[2600::5efe:7f00:1]/',
  ];

  for (const url of blockedUrls) {
    await assert.rejects(
      () => service.assertPublicUrl(url),
      (error) => error instanceof BadRequestException,
      `expected ${url} to be blocked`,
    );
  }
});

test('SourceReader keeps globally routable IPv4 and IPv6 literals available', async () => {
  const service = new SourceReaderService();

  const ipv4 = await service.assertPublicUrl('https://8.8.8.8/feed');
  const ipv6 = await service.assertPublicUrl('https://[2606:4700:4700::1111]/feed');

  assert.deepEqual(ipv4.addresses, [{ address: '8.8.8.8', family: 4 }]);
  assert.deepEqual(ipv6.addresses, [{ address: '2606:4700:4700::1111', family: 6 }]);
});

test('SourceReader rejects a hostname when any DNS answer is non-public', async () => {
  const service = new SourceReaderService();
  service.resolveAddresses = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '::ffff:7f00:1', family: 6 },
  ];

  await assert.rejects(
    () => service.assertPublicUrl('https://feeds.example/rss.xml'),
    (error) => error instanceof BadRequestException,
  );
});

test('SourceReader pins the socket address while preserving HTTPS Host and SNI', () => {
  const service = new SourceReaderService();
  const options = service.createPinnedRequestOptions(
    new URL('https://feeds.example:8443/rss.xml?lang=fa'),
    { address: '93.184.216.34', family: 4 },
    { Accept: 'application/rss+xml' },
  );

  assert.equal(options.hostname, '93.184.216.34');
  assert.equal(options.family, 4);
  assert.equal(options.servername, 'feeds.example');
  assert.equal(options.path, '/rss.xml?lang=fa');
  assert.equal(options.headers.Host, 'feeds.example:8443');
  assert.equal(options.lookup, undefined);
});

test('SourceReader validates every redirect before opening the next connection', async () => {
  const service = new SourceReaderService();
  let connectionCount = 0;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async (_url, address) => {
    connectionCount += 1;
    assert.equal(address.address, '93.184.216.34');
    return response(302, { location: 'http://[::ffff:7f00:1]/admin' });
  };

  await assert.rejects(
    () => service.safeFetchText('https://feeds.example/rss.xml', 1024, ['application/rss+xml']),
    (error) => error instanceof BadRequestException,
  );
  assert.equal(connectionCount, 1, 'the internal redirect target must never be contacted');
});

test('credentialed outbound POST requests are pinned to the validated address', async () => {
  const service = new SourceReaderService();
  let observed;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async (url, address, headers, _signal, method, body) => {
    observed = { url: url.toString(), address, headers, method, body: body.toString('utf8') };
    return response(200, { 'content-type': 'application/json' }, '{"ok":true}');
  };

  const result = await service.safeRequest('https://api.example/v1/models', {
    method: 'POST',
    headers: { Authorization: 'Bearer redacted', 'Content-Type': 'application/json' },
    body: '{"probe":true}',
    acceptedTypes: ['application/json'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.json(), { ok: true });
  assert.equal(observed.address.address, '93.184.216.34');
  assert.equal(observed.method, 'POST');
  assert.equal(observed.body, '{"probe":true}');
  assert.equal(observed.headers.Authorization, 'Bearer redacted');
});

test('credentialed outbound requests never follow redirects', async () => {
  const service = new SourceReaderService();
  let requests = 0;
  service.resolveAddresses = async () => [{ address: '93.184.216.34', family: 4 }];
  service.requestAddress = async () => {
    requests += 1;
    return response(302, { location: 'https://other.example/steal' });
  };

  await assert.rejects(
    () => service.safeRequest('https://api.example/v1/models', {
      headers: { Authorization: 'Bearer must-not-be-forwarded' },
    }),
    /آدرس نهایی سرویس/,
  );
  assert.equal(requests, 1);
});

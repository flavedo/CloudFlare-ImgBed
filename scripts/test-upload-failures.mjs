import assert from 'node:assert/strict';
import { uploadFailureLogging, redactError, FAILURE_PREFIX } from '../functions/utils/uploadFailureLog.js';
import { onRequestGet } from '../functions/api/manage/uploadFailures.js';
const stored = new Map();
const kv = {
    put: async (key, value, options) => { assert.deepEqual(options, {}); stored.set(key, value); },
    get: async key => stored.get(key),
    list: async () => ({ keys: [...stored.keys()].sort().map(name => ({ name })), list_complete: true })
};
function context(response, details = {}) {
    return { env: { img_url: kv }, data: { uploadLogDetails: details },
        request: new Request('https://example.com/upload?chunked=true&uploadChannel=telegram'),
        next: async () => response };
}
const failure = context(new Response('upstream https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUV/getFile token=secret', { status: 500 }),
    { uploadId: 'upload_test', fileName: '<img src=x onerror=alert(1)>.mp4', fileSizeBytes: 3 * 1024 ** 3, chunkIndex: 2, chunkSizeBytes: 16 * 1024 ** 2 });
failure.request = new Request(failure.request,{headers:{'X-Upload-Request-ID':'12345678-1234-1234-1234-123456789012','CF-Ray':'ray-test-AMS'}});
const response = await uploadFailureLogging(failure);
assert.equal(response.headers.get('X-Upload-Request-ID'),'12345678-1234-1234-1234-123456789012');
assert.equal(response.headers.get('X-Upload-Log-Stored'),'true');
assert.equal(response.status, 500);
assert.match(await response.text(), /token=secret/); // Original response is preserved.
assert.equal(stored.size, 1);
const record = JSON.parse([...stored.values()][0]);
assert.equal(record.uploadId, 'upload_test');
assert.equal(record.requestId,'12345678-1234-1234-1234-123456789012');
assert.equal(record.rayId,'ray-test-AMS');
assert.equal(record.timings[0].phase,'request_received');
assert.equal(record.fileSizeBytes, 3 * 1024 ** 3);
assert.equal(record.stage, 'chunk');
assert.equal(record.chunkIndex, 2);
assert.ok(!record.error.includes('secret'));
assert.ok(!record.error.includes('ABCDEFGHIJKLMNOPQRSTUV'));
assert.ok([...stored.keys()][0].startsWith(FAILURE_PREFIX));
await uploadFailureLogging(context(new Response('ok')));
await uploadFailureLogging(context(new Response('no', { status: 401 })));
assert.equal(stored.size, 3);
const successes = [...stored.values()].map(JSON.parse);
assert.equal(successes[1].outcome, "success");
assert.equal(successes[1].error, null);
assert.equal(successes[2].outcome, "failure");
assert.ok(successes.every(r => r.durationMs >= 0));
const thrown = context(null); thrown.next = async () => { throw new Error('failed'); };
await assert.rejects(uploadFailureLogging(thrown), /failed/);
assert.equal(stored.size, 4);
const unavailable = context(new Response('original', { status: 502 }));
unavailable.env.img_url.put = async () => { throw new Error('quota'); };
const missingLog = await uploadFailureLogging(unavailable);
assert.equal(missingLog.status,502);
assert.equal(missingLog.headers.get('X-Upload-Log-Stored'),'false');
assert.equal(redactError('password=abc'), 'password=[redacted]');
const query = await onRequestGet({ env: { img_url: kv }, request: new Request('https://example.com/api/manage/uploadFailures') });
assert.equal(query.headers.get('Cache-Control'), 'no-store');
assert.equal((await query.json()).records.length, 4);
const page = await onRequestGet({ env: {}, request: new Request('https://example.com/api/manage/uploadFailures?view=1') });
const html = await page.text();
assert.ok(html.includes('td.textContent=v'));
assert.ok(!html.includes(record.fileName));
console.log('Passed: durable records, fields, redaction, success/auth recording, exceptions, quota failure isolation, query and safe HTML rendering.');

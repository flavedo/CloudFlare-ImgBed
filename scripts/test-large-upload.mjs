import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';

const source = fs.readFileSync('functions/upload/chunkUpload.js', 'utf8');
let listCalls = 0, getCalls = 0, deleteCalls = 0;
const records = Array.from({ length: 640 }, (_, i) => ({
    name: `chunk_test_${String(i).padStart(3, '0')}`,
    metadata: { status: 'completed', chunkSize: 16 * 1024 ** 2, uploadResult: { size: 16 * 1024 ** 2 } }
}));
const db = {
    list: async ({ cursor }) => {
        listCalls++;
        return cursor ? { keys: records.slice(320), list_complete: true }
            : { keys: records.slice(0, 320), list_complete: false, cursor: 'next' };
    },
    getWithMetadata: async () => { getCalls++; return null; },
    delete: async () => { deleteCalls++; },
    put: async (_key, _value, options) => assert.equal(options.expirationTtl, 86400)
};
const context = vm.createContext({
    getDatabase: () => db, checkDatabaseConfig: () => ({ usingD1: false }),
    createResponse: (body, options) => ({ body, ...options }),
    getUploadIp: () => '', getIPAddress: async () => '',
    Date, Math, JSON, Number, Map, console
});
const constants = source.slice(source.indexOf('const UPLOAD_SESSION_TTL'), source.indexOf('// 初始化分块上传'));
const init = source.slice(source.indexOf('export async function initializeChunkedUpload'), source.indexOf('// 处理客户端分块上传'));
const statuses = source.slice(source.indexOf('export async function checkChunkUploadStatuses'), source.indexOf('// 清理上传会话'));
vm.runInContext(constants + init.replaceAll('export ', '') + statuses.replaceAll('export ', ''), context);
const result = await context.checkChunkUploadStatuses({}, 'test', 640);
assert.equal(result.length, 640);
assert.equal(result.reduce((n, r) => n + r.uploadResult.size, 0), 10 * 1024 ** 3);
assert.equal(listCalls, 2);
assert.equal(getCalls, 0);
await context.cleanupChunkData({}, 'test', 640);
assert.equal(deleteCalls, 0);
await context.cleanupChunkData({}, 'test', 2);
assert.equal(deleteCalls, 3);
for (const [chunks, expected] of [[640, 200], [2560, 200], [2561, 413], [-1, 413]]) {
    const values = { originalFileName: 'video.mp4', originalFileType: 'video/mp4', totalChunks: String(chunks) };
    const response = await context.initializeChunkedUpload({
        env: {}, data: {}, url: new URL('https://test/upload?uploadChannel=telegram'),
        request: { formData: async () => ({ get: key => values[key] }) }
    });
    assert.equal(response.status, expected);
}
records[0].metadata.status = 'failed';
const failed = await context.checkChunkUploadStatuses({}, 'test', 640);
assert.equal(failed[0].status, 'missing');
assert.equal(getCalls, 1);
const frontend = fs.readFileSync('js/' + fs.readdirSync('js').find(n => /^273\..*\.js$/.test(n)), 'utf8');
const expression = frontend.match(/s\.size\/1024\/1024<=\d+\|\|"telegram"!==this\.uploadChannel/)[0];
for (const [bytes, expected] of [[3 * 1024 ** 3, true], [10 * 1024 ** 3, true], [10 * 1024 ** 3 + 1, false]]) {
    assert.equal(vm.runInNewContext(expression, { s: { size: bytes }, uploadChannel: 'telegram' }), expected);
}
for (const file of ['index.html', ...fs.readdirSync('js').filter(n => /^(app\.|273\.)/.test(n) && !n.endsWith('.gz')).map(n => 'js/' + n)]) {
    if (fs.existsSync(file + '.gz')) assert.deepEqual(gunzipSync(fs.readFileSync(file + '.gz')), fs.readFileSync(file));
}
const html = fs.readFileSync('index.html', 'utf8');
for (const [, asset] of html.matchAll(/(?:src|href)="\/(js\/[^" ]+|css\/[^" ]+)"/g)) assert.ok(fs.existsSync(asset), asset);
console.log('Passed: 3/10 GiB boundaries, 640-chunk pagination, 24h TTL, oversized sessions, failed chunks, cleanup, gzip and asset references.');

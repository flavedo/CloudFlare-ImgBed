import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('functions/upload/_middleware.js','utf8');
let sentry=0,telemetry=0;
const ctx=vm.createContext({URL,Response,errorHandling:async c=>{sentry++;return c.next()},telemetryData:async c=>{telemetry++;return c.next()}});
vm.runInContext(source.slice(source.indexOf('async function chunkErrorHandling'),source.indexOf('export const onRequest')),ctx);
for(const suffix of ['?chunked=true','?initChunked=true','?uploadStatus=true','/report']){
 const c={data:{},request:new Request('https://test/upload'+suffix),next:async()=>new Response('ok')};
 await ctx.chunkErrorHandling(c);await ctx.chunkTelemetry(c);
}
assert.equal(sentry,0);assert.equal(telemetry,0);
const normal={data:{},request:new Request('https://test/upload'),next:async()=>new Response('ok')};
await ctx.chunkErrorHandling(normal);await ctx.chunkTelemetry(normal);
assert.equal(sentry,1);assert.equal(telemetry,1);
const failed={data:{},request:new Request('https://test/upload?chunked=true'),next:async()=>{throw new Error('storage failed')}};
assert.equal((await ctx.chunkErrorHandling(failed)).status,500);
console.log('Passed: chunk lifecycle bypasses Sentry, ordinary uploads retain it, exceptions still return failures for durable logging.');

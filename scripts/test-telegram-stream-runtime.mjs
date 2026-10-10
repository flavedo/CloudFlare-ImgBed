import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import http from 'node:http';
const server=http.createServer(async(req,res)=>{let text='';for await(const part of req)text+=part;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({length:req.headers['content-length'],text}))});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const target='http://127.0.0.1:'+server.address().port;
import assert from 'node:assert/strict';
const source=fs.readFileSync('functions/upload/telegramStream.js','utf8');
const helper=source.slice(source.indexOf('export function multipartStream'),source.indexOf('export async function handleTelegramStream')).replace('export ','');
const mf=new Miniflare({modules:true,compatibilityDate:'2025-01-01',script:helper+`\nexport default {async fetch(request){const abort=new AbortController();const m=multipartStream(request.body,{chat_id:'123'},'v.mkv',4,abort.signal);const fixed=new FixedLengthStream(m.length);const pump=m.stream.pipeTo(fixed.writable);const downstream=await fetch('${target}',{method:'POST',body:fixed.readable});const result=await downstream.json();await pump;return Response.json({...result,expected:m.length})}}`});
try{const response=await mf.dispatchFetch('https://test',{method:'POST',body:'ABCD'});assert.equal(response.status,200);const result=await response.json();assert.equal(Number(result.length),result.expected);assert.ok(result.text.includes('ABCD'));console.log('Passed: real Workers runtime streams multipart with FixedLengthStream and inferred Content-Length.')}finally{await mf.dispose();await new Promise(resolve=>server.close(resolve))}

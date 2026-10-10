import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('js/'+fs.readdirSync('js').find(p=>/^273\..*\.js$/.test(p)),'utf8');
const start=source.indexOf('async uploadFileInChunks(e){');
const method=source.slice(start,source.indexOf(',handleRemove(e)',start)).replace('async uploadFileInChunks(e)','async function(e)');
const calls=[],completed=new Set();let fail=true,resource=false,initializations=0,merges=0;
class Form {constructor(){this.values=new Map()}append(key,value){this.values.set(key,value)}get(key){return this.values.get(key)}}
const axios=async options=>{
 const url=new URL(options.url,'https://test');
 if(url.searchParams.has('initChunked')){initializations++;return {data:{success:true,uploadId:'same-session'}}}
 if(url.searchParams.has('uploadStatus'))return {data:{success:true,completed:[...completed]}};
 if(url.searchParams.has('merge')){merges++;return {data:{success:true}}}
 const index=Number(url.searchParams.get('chunkIndex') ?? options.data.get('chunkIndex'));calls.push(index);
 options.onUploadProgress?.({loaded:16,total:16});
 if(fail&&index===1){const error=new Error('503');error.response={status:503,data:resource?{error_code:1102,retryable:false}:'upstream unavailable'};throw error}
 completed.add(index);return {data:{success:true}};
};
const ctx=vm.createContext({crypto:globalThis.crypto,FormData:Form,AbortController,Set,Map,console:{log(){},warn(){},error(){}},setTimeout:fn=>fn(),ht:{A:axios},CustomEvent:class{constructor(type,options){this.detail=options.detail}},window:{uploadErrorDiagnostics:()=>({}),isUploadResourceLimit:e=>e.response?.data?.error_code===1102,describeUploadError:e=>e.response?.data||e.message,dispatchEvent(){}},Math,Promise});
const upload=vm.runInContext('('+method+')',ctx);
const item={uid:'f',uploadChannel:'telegram',serverCompress:false,chunkSizeBytes:16*1024**2};
const message=()=>{};message.closeAll=()=>{};
const state={fileList:[item],abortControllers:new Map(),exceptionList:[],uploadChannel:'telegram',autoRetry:true,uploadNameType:'default',uploadFolder:'',channelName:'',$message:message,onUploadComplete(){},cleanupUploadResources(){throw new Error('Retry must preserve session')}};
const file={uid:'f',name:'video.mkv',type:'video/x-matroska',size:48*1024**2,slice:(start,end)=>({size:end-start})};
let successes=0,failures=0;const request={file,onProgress(){},onSuccess(){successes++},onError(){failures++}};
await upload.call(state,request);
assert.equal(failures,1);assert.equal(item.uploadId,'same-session');assert.ok(completed.has(0));
const before=calls.length;fail=false;
await upload.call(state,request);
assert.equal(initializations,1);assert.equal(successes,1);assert.equal(merges,1);
assert.ok(calls.slice(before).every(index=>!completed.has(index)||index===1));
assert.deepEqual(calls.slice(before),[1]);
completed.clear();delete item.uploadId;fail=true;resource=true;
const resourceStart=calls.length;await upload.call(state,request);
assert.equal(item.resourceLimitBlocked,true);assert.equal(calls.slice(resourceStart).filter(i=>i===1).length,1);
completed.clear();delete item.uploadId;delete item.chunkSizeBytes;fail=false;resource=false;
const safeStart=calls.length;await upload.call(state,request);
assert.equal(calls.length-safeStart,12);assert.equal(item.chunkSizeBytes,4*1024**2);
console.log('Passed: 1102 stops retrying, new Telegram sessions use 4 MiB chunks;  failed upload preserves session, whole-file retry reuses ID and skips acknowledged chunks, then merges once.');

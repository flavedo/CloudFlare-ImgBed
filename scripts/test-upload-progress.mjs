import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path = 'js/' + fs.readdirSync('js').find(p => /^273\..*\.js$/.test(p));
const source = fs.readFileSync(path, 'utf8');
const callback = source.match(/onUploadProgress:o=>\{if\(y\|\|k\)return;.*?chunkPercent:s\}\)\}/)[0].replace('onUploadProgress:', '');
const percentages = [], events = [];
const ctx = vm.createContext({y:false,k:false,t:0,l:16,i:35,g:[0,0,0],highWater:0,m:{size:16},done:new Set(),e:{file:{},onProgress: v => percentages.push(v.percent)},emit:(stage, info)=>events.push({stage,...info})});
vm.runInContext('var update = '+callback, ctx);
ctx.update({loaded:16,total:16});
assert.ok(percentages[0] > 45 && percentages[0] < 46);
ctx.update({loaded:1,total:16}); // Retry must not reset the overall progress.
assert.equal(percentages[1], percentages[0]);
ctx.t=1; ctx.update({loaded:16,total:16});
ctx.t=2; ctx.update({loaded:3,total:3});
assert.equal(percentages.at(-1),99); // Reserve completion for server merge response.
assert.ok(events.every(v => Number.isFinite(v.percent)));
assert.match(source,/done.add\(t\);g\[t\]=100;emit/);
console.log('Passed: byte-weighted progress, short last chunk, retry monotonicity, merge completion reservation and acknowledgement updates.');

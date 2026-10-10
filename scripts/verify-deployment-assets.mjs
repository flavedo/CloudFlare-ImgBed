import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const tracked=new Set(execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n'));
const html=fs.readFileSync('index.html','utf8');
for(const [,url] of html.matchAll(/(?:src|href)="\/(js\/[^" ]+|css\/[^" ]+|static\/[^" ]+)"/g)){
 const asset=url.split('?')[0];
 assert.ok(fs.existsSync(asset),'Missing local asset: '+asset);
 assert.ok(tracked.has(asset),'Referenced asset is not staged/tracked for deployment: '+asset);
}
const chunk='js/'+fs.readdirSync('js').find(p=>/^273\..*\.js$/.test(p));
assert.ok(tracked.has(chunk),'Upload chunk is not staged/tracked: '+chunk);
console.log('Passed: homepage runtime, styles, helper scripts and upload chunk are present in Git for deployment.');

import { getDatabase } from '../../utils/databaseAdapter.js';
import { FAILURE_PREFIX } from '../../utils/uploadFailureLog.js';

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };
    if (url.searchParams.get('view') === '1') {
        return new Response(PAGE, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff' } });
    }
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor && cursor.length > 2048) return new Response('{"error":"Invalid cursor"}', { status: 400, headers });
    const db = getDatabase(context.env);
    const page = await db.list({ prefix: FAILURE_PREFIX, limit: 20, ...(cursor ? { cursor } : {}) });
    const records = await Promise.all(page.keys.map(async key => {
        if (!key.name.startsWith(FAILURE_PREFIX)) return null;
        const value = await db.get(key.name);
        try { return value ? JSON.parse(value) : null; } catch { return null; }
    }));
    return new Response(JSON.stringify({ records: records.filter(Boolean), cursor: page.list_complete ? null : page.cursor }), { headers });
}

const PAGE = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上传失败日志</title>
<style>body{font:15px system-ui;margin:0;background:#f5f7fa;color:#263445}main{max-width:1400px;margin:32px auto;padding:0 20px}a{color:#2563eb}header{display:flex;justify-content:space-between;align-items:center}.tools{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}input,select,button{font:inherit;padding:10px;border:1px solid #ccd5df;border-radius:8px;background:white}button{cursor:pointer}input{min-width:280px}.scroll{overflow:auto;background:white;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1000px}th,td{padding:12px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}td{overflow-wrap:anywhere}td:last-child{max-width:420px}#status{margin:16px 0}button:disabled{opacity:.5;cursor:default}</style>
<main><header><h1>上传失败日志</h1><a href="/dashboard">返回管理后台</a></header><p>按时间倒序保留服务端失败记录。分块编号从 1 开始显示，API 中从 0 开始。大小未知时显示“未知”。</p>
<div class="tools"><input id="search" placeholder="筛选已加载记录：文件名、上传 ID、错误"><select id="stage"><option value="">全部阶段</option><option value="initialize">初始化</option><option value="chunk">分块上传</option><option value="merge">合并</option><option value="upload">普通上传</option></select><button id="refresh">刷新</button><button id="more" disabled>加载更多</button></div><div id="status" role="status"></div>
<div class="scroll"><table><thead><tr><th>时间</th><th>上传 ID</th><th>文件名</th><th>完整文件大小</th><th>阶段</th><th>分块 / 大小</th><th>渠道</th><th>HTTP</th><th>错误原因</th></tr></thead><tbody id="rows"></tbody></table></div></main>
<script>
const $=id=>document.getElementById(id);let records=[],cursor=null,busy=false;
const stages={initialize:'初始化',chunk:'分块上传',merge:'合并',upload:'普通上传'};
function size(n){return n==null?'未知':n.toLocaleString()+' 字节 ('+(n/1024/1024).toFixed(2)+' MiB)'}
function render(){const q=$('search').value.toLowerCase(),stage=$('stage').value;const shown=records.filter(r=>(!stage||r.stage===stage)&&(!q||[r.uploadId,r.fileName,r.error].some(v=>String(v||'').toLowerCase().includes(q))));$('rows').replaceChildren();for(const r of shown){const tr=document.createElement('tr');for(const v of [new Date(r.time).toLocaleString(),r.uploadId,r.fileName||'未知',size(r.fileSizeBytes),stages[r.stage]||r.stage,r.chunkIndex==null?'—':(r.chunkIndex+1)+' / '+size(r.chunkSizeBytes),r.channel,r.status,r.error]){const td=document.createElement('td');td.textContent=v;tr.append(td)}$('rows').append(tr)}$('status').textContent='已加载 '+records.length+' 条，显示 '+shown.length+' 条'+(!records.length?'；暂无失败记录':'');$('more').disabled=busy||!cursor}
async function load(reset){if(busy)return;busy=true;$('more').disabled=true;$('refresh').disabled=true;$('status').textContent='正在加载…';try{const query=new URLSearchParams();if(!reset&&cursor)query.set('cursor',cursor);const response=await fetch('/api/manage/uploadFailures?'+query,{cache:'no-store'});if(!response.ok)throw new Error('查询失败 HTTP '+response.status+'，请确认管理员认证');const data=await response.json();records=reset?data.records:[...records,...data.records];cursor=data.cursor;busy=false;render()}catch(e){$('status').textContent=e.message}finally{busy=false;$('refresh').disabled=false;$('more').disabled=!cursor}}
$('refresh').onclick=()=>load(true);$('more').onclick=()=>load(false);$('search').oninput=render;$('stage').onchange=render;load(true);
</script></html>`;

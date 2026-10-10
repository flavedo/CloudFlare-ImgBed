(() => {
    const records = new Map();
    const storageKey = 'upload-client-failures-v1';
    const redact = value => String(value || '').replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]').replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token redacted]').replace(/((?:authorization|password|secret|token|api[_-]?key|authCode)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]').slice(0,2000);
    window.describeUploadError = error => {
        let body = error.response?.data;
        if (typeof body === 'object') body = JSON.stringify(body);
        if (typeof body === 'string' && /<html|<!doctype/i.test(body)) {
            const doc = new DOMParser().parseFromString(body, 'text/html');
            body = [doc.title, doc.body?.textContent].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,1200);
        }
        return redact([error.message, body, error.response?.headers?.['cf-ray'] ? 'CF-Ray '+error.response.headers['cf-ray'] : ''].filter(Boolean).join(' · '));
    };
    const style = document.createElement('style');
    style.textContent = '.upload-inline-details{font:13px system-ui;text-align:left;overflow-wrap:anywhere;color:var(--el-text-color-primary,#263445);margin-top:10px;width:100%}.upload-inline-details p{margin:6px 0}.upload-inline-details summary{cursor:pointer;color:var(--el-color-primary,#409eff)}.upload-inline-details pre{white-space:pre-wrap;max-height:180px;overflow:auto;text-align:left;font-size:12px}.upload-list-item-content:has(.upload-inline-details){align-items:stretch}.upload-log-shortcut{display:block;text-align:right;margin:10px 0;color:var(--el-color-primary,#409eff)}';
    document.head.append(style);
    let lastRender = 0;
    function render() {
        for (const r of records.values()) {
            const item = [...document.querySelectorAll('.upload-list-item')].find(el => el.dataset.uploadUid === String(r.uid));
            const host = item?.querySelector('.upload-list-item-content');
            if (!host) continue;
            let details = host.querySelector('.upload-inline-details');
            if (!details) {
                details = document.createElement('section'); details.className = 'upload-inline-details';
                details.innerHTML = '<p class="upload-stage"></p><details><summary>过程与错误详情</summary><p class="upload-id"></p><pre></pre><a href="/upload-failures.html">查看全部上传日志</a></details>';
                host.append(details);
            }
            details.querySelector('.upload-stage').textContent = `${r.stage} · ${(r.percent||0).toFixed(2)}% · 已确认 ${r.completedChunks||0}/${r.totalChunks||'?'} 块 · ${(r.fileSize/1024**3).toFixed(2)} GiB`;
            details.querySelector('.upload-id').textContent = '上传 ID：'+r.uploadId;
            details.querySelector('pre').textContent = r.events.join('\n');
            if (r.stage === '上传失败') details.querySelector('details').open = true;
        }
        const home = document.querySelector('.upload-home');
        if (home && !home.querySelector('.upload-log-shortcut')) {
            const link = document.createElement('a'); link.className = 'upload-log-shortcut'; link.href='/upload-failures.html';link.textContent='上传日志';
            const form = home.querySelector('.upload-list-item')?.parentElement;
            (form || home).append(link);
        }
        lastRender = Date.now();
    }
    function readFailures() { try { return JSON.parse(localStorage.getItem(storageKey)||'[]'); } catch { return []; } }
    let syncing = false;
    async function syncFailures() {
        if (syncing || !window.sendUploadReport) return;
        syncing = true;
        try {
            for (const log of readFailures().filter(r=>!r.synced).slice(-20)) {
                try {
                    const response = await window.sendUploadReport(log);
                    if (!response.data?.success) break;
                    const logs=readFailures();const target=logs.find(r=>r.id===log.id);if(target)target.synced=true;
                    localStorage.setItem(storageKey,JSON.stringify(logs));
                } catch { break; }
            }
        } finally { syncing=false; }
    }
    addEventListener('upload-detail', ({detail:d}) => {
        const key=String(d.uid||d.uploadId),r=records.get(key)||{events:[]}; Object.assign(r,d);
        if(d.stage!=='上传分块') {
            r.events.push(`${new Date().toLocaleTimeString()} ${d.stage}${d.chunkIndex==null?'':' · 分块 '+(d.chunkIndex+1)+'/'+d.totalChunks}${d.attempt?' · 尝试 '+d.attempt:''}${d.error?' · '+redact(d.error):''}`);
            r.events=r.events.slice(-200);
        }
        if(d.error) {
            const logs=readFailures();logs.push({id:crypto.randomUUID(),uploadId:d.uploadId,fileName:d.fileName,fileSizeBytes:d.fileSize,chunkIndex:d.chunkIndex??null,stage:d.chunkIndex==null?'upload':'chunk',status:d.status||500,error:redact(d.error),time:Date.now(),source:'browser',outcome:'failure',channel:'telegram',synced:false});
            try {localStorage.setItem(storageKey,JSON.stringify(logs.slice(-2000)));} catch {r.events.push('本机日志保存失败：浏览器存储空间不足');}
            syncFailures();
        }
        records.set(key,r);
        if(d.stage!=='上传分块'||Date.now()-lastRender>500)render();
    });
    setInterval(syncFailures,30000);
    let scheduled=false;
    new MutationObserver(()=>{
        if(scheduled)return;
        if([...records.values()].every(r=>document.querySelector(`.upload-inline-details`)) && document.querySelector('.upload-log-shortcut'))return;
        scheduled=true;requestAnimationFrame(()=>{scheduled=false;render()});
    }).observe(document.getElementById('app'),{childList:true,subtree:true});
    render();
})();

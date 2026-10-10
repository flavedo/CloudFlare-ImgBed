(() => {
    const records = new Map();
    let panel;
    const style = document.createElement('style');
    style.textContent = '.upload-details{max-width:1100px;margin:16px auto;padding:18px;border:1px solid #bdd5f2;border-radius:16px;background:var(--el-bg-color,#fff);color:var(--el-text-color-primary,#263445);font:14px system-ui}.upload-details header{display:flex;justify-content:space-between;gap:16px}.upload-details article{padding:12px 0;border-top:1px solid #ddd;margin-top:12px}.upload-details progress{width:100%;height:14px}.upload-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto}.upload-details a{color:var(--el-color-primary,#409eff)}';
    document.head.append(style);
    function render() {
        if (!panel) {
            const home = document.querySelector('.upload-home');
            if (!home) return;
            panel = document.createElement('section');
            panel.className = 'upload-details';
            home.append(panel);
        }
        panel.replaceChildren();
        const header = document.createElement('header');
        const title = document.createElement('strong'); title.textContent = '上传详情';
        const link = document.createElement('a'); link.href = '/upload-failures.html'; link.textContent = '查看全部上传日志';
        header.append(title, link); panel.append(header);
        for (const r of records.values()) {
            const article = document.createElement('article');
            const name = document.createElement('strong'); name.textContent = r.fileName;
            const info = document.createElement('p');
            info.textContent = `${r.stage} · 整体 ${(r.percent || 0).toFixed(2)}% · 服务端已确认 ${r.completedChunks || 0}/${r.totalChunks} 块 · 文件 ${(r.fileSize / 1024 ** 3).toFixed(2)} GiB · ID ${r.uploadId}`;
            const bar = document.createElement('progress'); bar.max = 100; bar.value = r.percent || 0;
            const events = document.createElement('pre'); events.textContent = r.events.join('\n');
            article.append(name, info, bar, events); panel.append(article);
        }
    }
    addEventListener('upload-detail', ({detail: d}) => {
        const r = records.get(d.uploadId) || {events: []};
        Object.assign(r, d);
        if (d.stage !== '上传分块') {
            r.events.push(`${new Date().toLocaleTimeString()} ${d.stage}${d.chunkIndex == null ? '' : ' · 分块 '+(d.chunkIndex+1)+'/'+d.totalChunks}${d.attempt ? ' · 尝试 '+d.attempt : ''}${d.error ? ' · '+d.error : ''}`);
            r.events = r.events.slice(-100);
        }
        records.set(d.uploadId, r); render();
    });
    let scheduled = false;
    new MutationObserver(() => {
        if (!document.querySelector('.upload-home')) { panel = null; return; }
        if (panel?.isConnected || scheduled) return;
        scheduled = true; requestAnimationFrame(() => { scheduled = false; render(); });
    }).observe(document.getElementById('app'), {childList:true,subtree:true});
    render();
})();

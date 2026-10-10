(() => {
    const navigation = document.createElement('nav');
    navigation.setAttribute('aria-label', '管理导航');
    Object.assign(navigation.style, { position: 'fixed', bottom: '24px', right: '24px', zIndex: '1000' });
    const link = document.createElement('a');
    Object.assign(link.style, { display: 'inline-block', padding: '10px 16px', borderRadius: '10px',
        background: '#2563eb', color: '#fff', textDecoration: 'none', font: '14px system-ui',
        boxShadow: '0 3px 12px #0002' });
    navigation.append(link);
    document.body.append(navigation);
    function update() {
        const dashboard = location.pathname.startsWith('/dashboard');
        navigation.hidden = !(dashboard || location.pathname === '/' || location.pathname === '/index.html');
        link.textContent = dashboard ? '上传失败日志' : '管理后台';
        link.href = dashboard ? '/api/manage/uploadFailures?view=1' : '/dashboard';
    }
    // Vue's router uses history.pushState; update the entry after navigation.
    for (const method of ['pushState', 'replaceState']) {
        const original = history[method];
        history[method] = function (...args) { const result = original.apply(this, args); update(); return result; };
    }
    addEventListener('popstate', update);
    update();
})();

(() => {
    const style = document.createElement('style');
    style.textContent = `
      .admin-menu-entry { position:fixed; bottom:50px; right:30px; width:40px; height:40px;
        display:flex; align-items:center; justify-content:center; padding:0; opacity:0;
        visibility:hidden; pointer-events:none; transform:translateY(0);
        transition:transform .4s cubic-bezier(.68,-.55,.27,1.55),opacity .3s ease,visibility .3s;
        text-decoration:none; }
      .admin-menu-entry.active { opacity:1; visibility:visible; pointer-events:auto;
        transform:translateY(-145px); }
      /* Outrank the Vue-scoped toolbar hover rule, even when its lazy CSS loads later. */
      .upload-home .toolbar a.admin-menu-entry.active:hover,
      .upload-home .toolbar a.admin-menu-entry.active:focus-visible {
        transform:translateY(-145px);
      }
      .admin-menu-entry:focus-visible, .admin-log-entry:focus-visible {
        outline:2px solid var(--el-color-primary); outline-offset:4px; }
      .admin-log-entry { text-decoration:none; margin-right:12px; }
    `;
    document.head.append(style);
    const link = document.createElement('a');
    link.setAttribute('data-admin-navigation', '');
    const icon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zm0 7h8v11h-8V10zM3 13h8v8H3v-8z"/></svg>';
    let mode = '';
    function update() {
        const home = location.pathname === '/' || location.pathname === '/index.html';
        const dashboard = location.pathname.startsWith('/dashboard');
        const host = home ? document.querySelector('.upload-home .toolbar')
            : dashboard ? document.querySelector('.header-content .actions, .header-action') : null;
        if (!host) { link.remove(); mode = ''; return; }
        const nextMode = home ? 'home' : 'dashboard';
        if (mode !== nextMode) {
            mode = nextMode;
            if (home) {
                link.href = '/dashboard';
                link.title = '管理后台';
                link.setAttribute('aria-label', '管理后台');
                link.innerHTML = icon;
                // Match the existing Vue scoped toolbar style, including dark mode.
                link.setAttribute('data-v-1c133c47', '');
            } else {
                link.href = '/api/manage/uploadFailures?view=1';
                link.title = '上传失败日志';
                link.setAttribute('aria-label', '上传失败日志');
                link.textContent = '上传失败日志';
                link.removeAttribute('data-v-1c133c47');
            }
        }
        const opened = home && document.querySelector('.toolbar-manage-button.active');
        const classes = home ? 'el-button el-button--large is-circle toolbar-button admin-menu-entry' + (opened ? ' active' : '')
            : 'el-button admin-log-entry';
        if (link.className !== classes) link.className = classes;
        const tabIndex = home && !opened ? -1 : 0;
        if (link.tabIndex !== tabIndex) link.tabIndex = tabIndex;
        if (link.parentElement !== host) host.prepend(link);
    }
    // Observe Vue route renders and menu state without wrapping browser history.
    const observer = new MutationObserver(update);
    observer.observe(document.getElementById('app'), { childList:true, subtree:true,
        attributes:true, attributeFilter:['class'] });
    addEventListener('popstate', update);
    update();
})();

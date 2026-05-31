(() => {
    const { wgArticleId, wgCurRevisionId, wgRevisionId, wgNamespaceNumber } = mw.config.get([
        'wgArticleId',
        'wgCurRevisionId',
        'wgRevisionId',
        'wgNamespaceNumber',
    ]);

    if (wgNamespaceNumber < 0 || wgArticleId <= 0) {
        return;
    }

    const links = [
        { param: `curid=${wgArticleId}`, label: '本页短链' },
        { param: `oldid=${wgCurRevisionId}`, label: '最新版本' },
        { param: `diff=${wgRevisionId}`, label: '最新差异' },
    ];

    for (const { param, label } of links) {
        const url = `/?${param}`;
        const element = mw.util.addPortletLink('p-tb', url, label);

        if (!element) {
            return;
        }

        element.title = '点击复制链接';
        element.addEventListener('click', async e => {
            e.preventDefault();
            try {
                await navigator.clipboard.writeText(location.origin + url);
                mw.notify('复制成功', { type: 'success' });
            } catch (err) {
                mw.notify('复制失败，请打开控制台查看详细信息', { type: 'error' });
                console.error('复制失败', err);
            }
            return false;
        });
    }
})();

(async () => {
    const { wgIsArticle, wgAction } = mw.config.get(['wgIsArticle', 'wgAction']);
    if (wgIsArticle && wgAction === 'view') {
        mw.loader.load('//fastly.jsdelivr.net/npm/wikiplus-highlight@latest');
    }
})();

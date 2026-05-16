
(() => {
    const createBanner = () => {
        if (document.getElementById('top-banner-link')) {
            return;
        }

        const bannerLink = document.createElement('a');
        bannerLink.id = 'top-banner-link';

        const wikiHome = '/Home';

        bannerLink.href = wikiHome;
        bannerLink.title = '返回后室中文数据库首页';

        bannerLink.setAttribute('aria-label', '返回网站首页的顶部横幅');

        const siteHeader = document.querySelector('.citizen-header, .mw-header');
        if (siteHeader && siteHeader.parentNode) {
            siteHeader.parentNode.insertBefore(bannerLink, siteHeader.nextSibling);
        } else {
            document.body.insertBefore(bannerLink, document.body.firstChild);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBanner);
    } else {
        createBanner();
    }
})();

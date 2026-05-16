// 为顶部固定横幅创建并注入链接元素
(function () {
    const createBanner = () => {
        // 如果横幅已经存在，则不再创建
        if (document.getElementById('top-banner-link')) {
            return;
        }

        // 1. 创建链接元素
        var bannerLink = document.createElement('a');
        bannerLink.id = 'top-banner-link';

        // 2. 设置链接属性：指向Wiki首页
        // 站点主页
        var wikiHome = '/Home';
        // 如果上述方法因页面名问题不生效，可以使用根路径

        bannerLink.href = wikiHome;
        bannerLink.title = '返回后室中文数据库首页';

        // 3. 可选的：添加无障碍属性
        bannerLink.setAttribute('aria-label', '返回网站首页的顶部横幅');

        // 4. 插入到页面中（放在body的最开始，确保在CSS中能定位到）
        // 注意：需确保它在Citizen皮肤的头部元素之后，以免被覆盖
        var siteHeader = document.querySelector('.citizen-header, .mw-header');
        if (siteHeader && siteHeader.parentNode) {
            // 插入到站点头部元素之后
            siteHeader.parentNode.insertBefore(bannerLink, siteHeader.nextSibling);
        } else {
            // 备用方案：插入到body的最开始
            document.body.insertBefore(bannerLink, document.body.firstChild);
        }
    };

    // 等待页面DOM内容加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBanner);
    } else {
        // 如果DOM已经加载完成，则直接执行
        createBanner();
    }
})();

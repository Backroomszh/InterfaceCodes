/**
 * Citizen 皮肤 DOM 调整
 *
 * 1. 侧边栏「工具 → 最近更改」改为带过滤参数的高级搜索 URL
 * 2. 用户菜单「登录」链接改为固定 URL（returnto=Home&usesul3=0）
 *
 * 两个目标节点均由服务端直接输出，DOMContentLoaded 后改写一次即可。
 */
( function () {
    'use strict';

    const RECENT_CHANGES_HREF =
        '/Special:RecentChanges?hidebots=1&translations=filter&hideWikibase=1' +
        '&namespace=5510%3B5511&invert=1&limit=50&days=30&enhanced=1&urlversion=2';

    const LOGIN_HREF = '/Special:UserLogin?returnto=Home&usesul3=0';

    // 统一配置，后续新增替换项只需在这里加一行
    const PATCHES = [
        { selector: '#n-recentchanges a', href: RECENT_CHANGES_HREF },
        { selector: '#pt-login a', href: LOGIN_HREF },
    ];

    /** 对配置中的每个选择器写入目标 href（幂等） */
    function patchLinks() {
        for ( const { selector, href } of PATCHES ) {
            document.querySelectorAll( selector ).forEach( ( link ) => {
                if ( link.getAttribute( 'href' ) !== href ) {
                    link.setAttribute( 'href', href );
                }
            } );
        }
    }

    // ---- 入口 ----
    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', patchLinks, { once: true } );
    } else {
        patchLinks();
    }
}() );
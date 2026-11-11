/* ===== 用户菜单：我的草稿（新版沙盒） + 沙盒（旧版） ===== */
( function () {
    'use strict';

    function init() {
        var sandboxLi = document.getElementById( 'pt-sandbox' );
        if ( !sandboxLi ) return;

        // 1) 把“沙盒”文字改成“沙盒（旧版）”
        var label = sandboxLi.querySelector( 'a > span:not(.citizen-ui-icon)' );
        if ( label ) label.textContent = '沙盒（旧版）';

        var sandboxA = sandboxLi.querySelector( 'a' );
        if ( sandboxA ) sandboxA.title = '沙盒（旧版）';

        // 2) 在沙盒之前插入“我的草稿（新版沙盒）”
        var draftLi = document.createElement( 'li' );
        draftLi.id = 'pt-mydrafts';
        draftLi.className = 'mw-list-item';
        draftLi.innerHTML =
            '<a href="/The_Backrooms_Wiki:' + encodeURIComponent( '作家助手' ) + '" title="我的草稿（新版沙盒）">' +
                '<span class="citizen-ui-icon mw-ui-icon-article mw-ui-icon-wikimedia-article"></span> ' +
                '<span>我的草稿（新版沙盒）</span>' +
            '</a>';

        sandboxLi.parentNode.insertBefore( draftLi, sandboxLi );
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
}() );

/* ===== 更多编辑方式：Wikidot 语法 / 纯写作模式 ===== */
( function () {
    'use strict';

    if ( mw.config.get( 'wgAction' ) !== 'view' ) return;
    if ( !mw.config.get( 'wgIsProbablyEditable' ) ) return;
    if ( mw.config.get( 'wgNamespaceNumber' ) < 0 ) return;

    // ── 避免在 The_Backrooms_Wiki: 命名空间运行 ──────────────────────────
    var nsIds = mw.config.get( 'wgNamespaceIds' ) || {};
    var excludedNsIds = [ 4 ];
    var aliasId = nsIds[ 'the_backrooms_wiki' ];
    if ( aliasId !== undefined && excludedNsIds.indexOf( aliasId ) === -1 ) {
        excludedNsIds.push( aliasId );
    }
    if ( excludedNsIds.indexOf( mw.config.get( 'wgNamespaceNumber' ) ) !== -1 ) return;
    // ─────────────────────────────────────────────────────────────────────

    var pageName = mw.config.get( 'wgPageName' );

    // 跳过带文件后缀的页面（.js / .lua / .css / .json / .txt 等）
    var FILE_EXT = /\.(?:js|mjs|cjs|lua|css|less|scss|sass|json|txt|md|markdown|xml|html?|svg|png|jpe?g|gif|webp|ico|bmp|pdf|zip|tar|gz|7z|rar|woff2?|ttf|otf|eot|map)$/i;
    if ( FILE_EXT.test( pageName ) ) return;

    var wdEditUrl = mw.util.getUrl( pageName, {
        action: 'edit',
        editor: 'wd'
    } );

    var novelEditUrl = mw.util.getUrl( pageName, {
        action: 'edit',
        editor: 'novel'
    } );

    var tries = 0;

    function attempt() {
        var pCactions = document.getElementById( 'p-cactions' );
        if ( !pCactions || !pCactions.parentNode ) {
            if ( tries++ < 50 ) setTimeout( attempt, 100 );
            return;
        }
        if ( document.getElementById( 'p-wd-edit' ) ) return;

        var nav = document.createElement( 'nav' );
        nav.id = 'p-wd-edit';
        nav.className = 'citizen-menu mw-portlet mw-portlet-wd-edit';
        nav.setAttribute( 'aria-label', '更多编辑方式' );
        nav.innerHTML =
            '<div class="citizen-menu__heading">更多编辑方式</div>' +
            '<div class="citizen-menu__content">' +
                '<ul class="citizen-menu__content-list">' +
                    '<li id="ca-edit-wd" class="mw-list-item">' +
                        '<a href="' + wdEditUrl + '" rel="nofollow" ' +
                            'title="使用 Wikidot 语法编辑本页">' +
                            '<span style="display:inline-flex;align-items:center;gap:6px;">' +
                                '<svg xmlns="http://www.w3.org/2000/svg" ' +
                                    'width="20" height="20" viewBox="0 0 20 20" ' +
                                    'aria-hidden="true">' +
                                    '<path d="M3 4 L5.5 16 L10 7 L14.5 16 L17 4" ' +
                                        'fill="none" stroke="currentColor" ' +
                                        'stroke-width="2" ' +
                                        'stroke-linejoin="round" ' +
                                        'stroke-linecap="round"/>' +
                                '</svg>' +
                                '<span>使用wikidot语法编辑</span>' +
                            '</span>' +
                        '</a>' +
                    '</li>' +
                    '<li id="ca-edit-novel" class="mw-list-item">' +
                        '<a href="' + novelEditUrl + '" rel="nofollow" ' +
                            'title="使用纯写作模式编辑本页">' +
                            '<span style="display:inline-flex;align-items:center;gap:6px;">' +
                                '<svg xmlns="http://www.w3.org/2000/svg" ' +
                                    'width="20" height="20" viewBox="0 0 20 20" ' +
                                    'aria-hidden="true">' +
                                    '<path d="M14 3 L17 6 L9 15 L4 16 L5 11 Z" ' +
                                        'fill="none" stroke="currentColor" ' +
                                        'stroke-width="2" ' +
                                        'stroke-linejoin="round" ' +
                                        'stroke-linecap="round"/>' +
                                    '<path d="M11.5 5.5 L14.5 8.5" ' +
                                        'fill="none" stroke="currentColor" ' +
                                        'stroke-width="2" ' +
                                        'stroke-linecap="round"/>' +
                                '</svg>' +
                                '<span>使用纯写作模式编辑</span>' +
                            '</span>' +
                        '</a>' +
                    '</li>' +
                '</ul>' +
            '</div>';

        pCactions.parentNode.insertBefore( nav, pCactions );
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', attempt );
    } else {
        attempt();
    }
}() );

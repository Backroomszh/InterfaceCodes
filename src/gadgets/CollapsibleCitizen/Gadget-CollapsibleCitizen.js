/* MediaWiki:Gadget-CollapsibleCitizen.js */
( function () {
    'use strict';

    console.log( 'Gadget-CollapsibleCitizen.js loaded' );

    // 执行标记：在控制台执行 window.__ccLoaded 可确认本脚本是否被执行
    window.__ccLoaded = true;

    var DEFAULT_EXPANDED_INDEXES = [ 1, 2, 3 ];
    var initialized = false;

    function init() {
        if ( initialized ) return;

        var headings = document.querySelectorAll( '.citizen-menu__heading' );
        if ( !headings.length ) return;

        initialized = true;
        window.__ccInitialized = true;

        var menus = document.querySelectorAll( '.citizen-menu' );

        // 1. 默认折叠
        menus.forEach( function ( menu, i ) {
            if ( DEFAULT_EXPANDED_INDEXES.indexOf( i ) === -1 ) {
                menu.classList.add( 'citizen-collapsed' );
            }
        } );

        // 2. 父容器 flex 布局
        var firstMenu = menus[0];
        if ( firstMenu && firstMenu.parentElement ) {
            var container = firstMenu.parentElement;
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.justifyContent = 'flex-start';
            container.classList.add( 'citizen-collapsible-container' );
        }

        // 3. 绑定点击
        headings.forEach( function ( heading ) {
            var menu = heading.closest( '.citizen-menu' );
            if ( !menu ) return;

            var initiallyCollapsed = menu.classList.contains( 'citizen-collapsed' );

            var clone = heading.cloneNode( true );
            clone.classList.add( 'citizen-heading-bound' );
            clone.setAttribute( 'role', 'button' );
            clone.setAttribute( 'tabindex', '0' );
            clone.setAttribute( 'aria-expanded', initiallyCollapsed ? 'false' : 'true' );
            heading.parentNode.replaceChild( clone, heading );

            function toggle( e ) {
                if ( e ) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                var collapsed = menu.classList.toggle( 'citizen-collapsed' );
                clone.setAttribute( 'aria-expanded', collapsed ? 'false' : 'true' );
            }

            clone.addEventListener( 'click', function ( e ) {
                if ( e.target.closest( 'a' ) ) return;
                toggle( e );
            } );
            clone.addEventListener( 'keydown', function ( e ) {
                if ( e.key === 'Enter' || e.key === ' ' ) toggle( e );
            } );
        } );

        // 4. 顶部提示
        if ( firstMenu && firstMenu.parentElement &&
             !document.getElementById( 'citizen-collapsible-hint' ) ) {
            var hint = document.createElement( 'div' );
            hint.id = 'citizen-collapsible-hint';
            hint.textContent = '点击分类标题可展开或折叠';
            firstMenu.parentElement.insertBefore( hint, firstMenu.parentElement.firstChild );
        }
    }

    // 保险 1：立即尝试
    init();

    // 保险 2：观察整个 documentElement（body 不存在时也安全）
    if ( !initialized ) {
        try {
            var observer = new MutationObserver( function () {
                init();
                if ( initialized ) observer.disconnect();
            } );
            observer.observe( document.documentElement, { childList: true, subtree: true } );
        } catch ( e ) {
            // 观察失败时交给轮询
        }
    }

    // 保险 3：轮询兜底（每 200ms 检查一次，最多 50 次 = 10 秒）
    if ( !initialized ) {
        var tries = 0;
        var timer = setInterval( function () {
            init();
            if ( initialized || ++tries > 50 ) {
                clearInterval( timer );
            }
        }, 200 );
    }
}() );
/* MediaWiki:Gadget-CollapsibleCitizen.js */
( function () {
    'use strict';

    // 需要默认展开的菜单索引（从 0 开始）：第 2、3、4 个
    var DEFAULT_EXPANDED_INDEXES = [ 1, 2, 3 ];

    function init() {
        var menus = document.querySelectorAll( '.citizen-menu' );
        var headings = document.querySelectorAll( '.citizen-menu__heading' );
        if ( !headings.length ) return;

        // 1. 默认折叠：跳过指定索引
        menus.forEach( function ( menu, i ) {
            if ( DEFAULT_EXPANDED_INDEXES.indexOf( i ) === -1 ) {
                menu.classList.add( 'citizen-collapsed' );
            }
        } );

        // 2. 父容器改为 flex 列布局，并加底部留白类
        var firstMenu = menus[0];
        if ( firstMenu && firstMenu.parentElement ) {
            var container = firstMenu.parentElement;
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.justifyContent = 'flex-start';
            container.classList.add( 'citizen-collapsible-container' );
        }

        // 3. 绑定点击（克隆替换，清除 Citizen 原有监听器）
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

        // 4. 顶部灰色提示
        if ( firstMenu && firstMenu.parentElement &&
             !document.getElementById( 'citizen-collapsible-hint' ) ) {
            var hint = document.createElement( 'div' );
            hint.id = 'citizen-collapsible-hint';
            hint.textContent = '点击分类标题可展开或折叠';
            firstMenu.parentElement.insertBefore( hint, firstMenu.parentElement.firstChild );
        }
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
}() );
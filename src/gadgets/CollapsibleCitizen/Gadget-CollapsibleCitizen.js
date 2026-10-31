/* MediaWiki:Gadget-citizenCollapsibleSidebar.js */
( function () {
    'use strict';
    var STORAGE_KEY = 'citizenSidebarCollapseState_v3';
    var DEFAULT_COLLAPSED = false; // 改为 true 可默认折叠所有菜单

    function initIcon() {
        // 确保图标模块已加载（保证 ResourceLoader 缓存可用）
        mw.loader.load( 'skins.citizen.icons' );
        var loadScript = mw.config.get( 'wgLoadScript' );
        if ( !loadScript ) return;
        var lang = mw.config.get( 'wgContentLanguage' ) || 'en';
        var iconUrl = loadScript +
            '?modules=skins.citizen.icons&image=collapse&format=original' +
            '&lang=' + encodeURIComponent( lang ) + '&skin=citizen';
        document.documentElement.style.setProperty(
            '--citizen-collapse-icon',
            'url("' + iconUrl + '")'
        );
    }

    function init() {
        initIcon();

        var lists = document.querySelectorAll( 'ul.citizen-menu__content-list' );
        if ( !lists.length ) return;

        var state = loadState();

        lists.forEach( function ( list ) {
            var trigger = list.closest( '.citizen-menu' ) || list.parentElement;
            if ( !trigger || trigger.dataset.citizenSidebarBound ) return;

            trigger.dataset.citizenSidebarBound = '1';
            makeToggle( trigger, list, state );
        } );
    }

    function makeToggle( trigger, list, state ) {
        var firstLink = list.querySelector( 'a' );
        var key = firstLink ? ( firstLink.id || firstLink.textContent.trim() ) : '';
        if ( !key ) return;

        var isCollapsed = state.hasOwnProperty( key ) ? state[ key ] : DEFAULT_COLLAPSED;
        applyState( list, trigger, isCollapsed );

        trigger.setAttribute( 'role', 'button' );
        trigger.setAttribute( 'tabindex', '0' );
        trigger.style.cursor = 'pointer';

        function toggle() {
            var willCollapse = list.style.display !== 'none';
            applyState( list, trigger, willCollapse );
            state[ key ] = willCollapse;
            saveState( state );
        }

        trigger.addEventListener( 'click', function ( e ) {
            if ( e.target.closest( 'a' ) ) return; // 点击链接不触发折叠
            toggle();
        } );

        trigger.addEventListener( 'keydown', function ( e ) {
            if ( e.key === 'Enter' || e.key === ' ' ) {
                e.preventDefault();
                toggle();
            }
        } );
    }

    function applyState( list, trigger, collapsed ) {
        if ( collapsed ) {
            list.style.display = 'none';
            trigger.classList.add( 'citizen-sidebar--collapsed' );
            trigger.setAttribute( 'aria-expanded', 'false' );
        } else {
            list.style.display = '';
            trigger.classList.remove( 'citizen-sidebar--collapsed' );
            trigger.setAttribute( 'aria-expanded', 'true' );
        }
    }

    function loadState() {
        try { return JSON.parse( localStorage.getItem( STORAGE_KEY ) ) || {}; }
        catch ( e ) { return {}; }
    }
    function saveState( state ) {
        try { localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) ); } catch ( e ) {}
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
}() );
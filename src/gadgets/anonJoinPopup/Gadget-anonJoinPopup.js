/*!
 * 未登录用户「加入网站」左下角弹窗
 * 要求：关闭后进入新页面仍然弹出；所有皮肤展示
 */
( function () {
    'use strict';

    var POPUP_ID = 'anon-join-popup';

    function injectStyles() {
        if ( document.getElementById( 'anon-join-popup-style' ) ) {
            return;
        }
        var style = document.createElement( 'style' );
        style.id = 'anon-join-popup-style';
        style.textContent = [
            '.anon-join-popup {',
            '    position: fixed;',
            '    bottom: max(1rem, env(safe-area-inset-bottom));',
            '    left: max(1rem, env(safe-area-inset-left));',
            '    z-index: 400;',
            '    box-sizing: border-box;',
            '    width: min(22rem, calc(100vw - 2rem));',
            '    padding: 1rem 2.5rem 1rem 1.125rem;',
            '    background-color: var(--color-surface-1, #fff);',
            '    color: var(--color-base, #202122);',
            '    border: 1px solid var(--border-color-base, #c8ccd1);',
            '    border-radius: var(--border-radius-base, 8px);',
            '    box-shadow: var(--box-shadow-card, 0 2px 8px rgba(0, 0, 0, .15));',
            '    font-size: var(--font-size-small, .875rem);',
            '    line-height: 1.55;',
            '    animation: anon-join-popup-in .25s ease-out both;',
            '}',
            '.anon-join-popup__text { margin: 0; }',
            '.anon-join-popup__link {',
            '    color: var(--color-primary, #36c);',
            '    font-weight: 600;',
            '    text-decoration: none;',
            '    white-space: nowrap;',
            '}',
            '.anon-join-popup__link:hover { text-decoration: underline; }',
            '.anon-join-popup__close {',
            '    position: absolute;',
            '    top: .375rem;',
            '    right: .375rem;',
            '    width: 1.75rem;',
            '    height: 1.75rem;',
            '    padding: 0;',
            '    border: 0;',
            '    border-radius: 50%;',
            '    background: transparent;',
            '    color: var(--color-subtle, #72777d);',
            '    font-size: 1.25rem;',
            '    line-height: 1;',
            '    cursor: pointer;',
            '}',
            '.anon-join-popup__close:hover {',
            '    background-color: var(--color-surface-3, #eaecf0);',
            '    color: var(--color-base, #202122);',
            '}',
            '.anon-join-popup--closing {',
            '    animation: anon-join-popup-out .2s ease-in both;',
            '}',
            '@keyframes anon-join-popup-in {',
            '    from { opacity: 0; transform: translateY(1rem); }',
            '    to { opacity: 1; transform: none; }',
            '}',
            '@keyframes anon-join-popup-out {',
            '    from { opacity: 1; transform: none; }',
            '    to { opacity: 0; transform: translateY(.5rem); }',
            '}',
            '@media (prefers-reduced-motion: reduce) {',
            '    .anon-join-popup, .anon-join-popup--closing { animation: none; }',
            '}',
            '@media print { .anon-join-popup { display: none !important; } }'
        ].join( '\n' );
        document.head.appendChild( style );
    }

    // 关闭：只移除当前页面的弹窗，不写任何存储
    function dismiss( popup ) {
        popup.classList.add( 'anon-join-popup--closing' );
        window.setTimeout( function () {
            if ( popup.parentNode ) {
                popup.parentNode.removeChild( popup );
            }
        }, 220 );
    }

    function buildLoginUrl() {
        var params = { returnto: mw.config.get( 'wgPageName' ) };
        if ( location.search.length > 1 ) {
            params.returntoquery = location.search.slice( 1 );
        }
        return mw.util.getUrl( 'Special:UserLogin', params );
    }

    function createPopup() {
        var popup = document.createElement( 'div' );
        popup.id = POPUP_ID;
        popup.className = 'anon-join-popup';
        popup.setAttribute( 'role', 'dialog' );
        popup.setAttribute( 'aria-label', '加入网站提示' );

        var close = document.createElement( 'button' );
        close.type = 'button';
        close.className = 'anon-join-popup__close';
        close.setAttribute( 'aria-label', '关闭提示' );
        close.textContent = '\u00D7';

        var text = document.createElement( 'p' );
        text.className = 'anon-join-popup__text';
        text.appendChild( document.createTextNode( '您还没有加入网站，请点击 ' ) );

        var link = document.createElement( 'a' );
        link.className = 'anon-join-popup__link';
        link.href = buildLoginUrl();
        link.textContent = '登录 / 注册';
        text.appendChild( link );

        text.appendChild( document.createTextNode( ' 页面注册或登录账号加入网站。' ) );

        popup.appendChild( close );
        popup.appendChild( text );

        close.addEventListener( 'click', function () {
            dismiss( popup );
        } );

        document.addEventListener( 'keydown', function ( ev ) {
            if ( ev.key === 'Escape' && document.body.contains( popup ) ) {
                dismiss( popup );
            }
        } );

        document.body.appendChild( popup );
    }

    mw.loader.using( [ 'mediawiki.user', 'mediawiki.util' ] ).then( function () {
        // 已登录用户不显示
        if ( !mw.user.isAnon() ) {
            return;
        }

        // 登录 / 注册页面本身不弹，避免干扰
        var special = mw.config.get( 'wgCanonicalSpecialPageName' );
        if ( special === 'Userlogin' || special === 'CreateAccount' ) {
            return;
        }

        // 不做皮肤判断：所有皮肤都展示
        injectStyles();
        createPopup();
    } );
}() );
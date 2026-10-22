( function () {
    'use strict';

    var OVERLAY_CLASS = 'read-more-hover-overlay';
    var DEFAULT_IMAGE = "url('https://static.wikitide.net/backroomszhwiki/9/95/Level0Original.jpg')";
    var prefetchedLists = new WeakSet();

    function normalizeTitle( t ) {
        return ( t || '' ).replace( /_/g, ' ' ).trim();
    }

    /* 卡片一出现就批量请求原图，写入 li.dataset.originalImage */
    function prefetchImages( list ) {
        if ( prefetchedLists.has( list ) ) return;
        prefetchedLists.add( list );

        var titleToLi = new Map();
        var titles = [];
        list.querySelectorAll( ':scope > li' ).forEach( function ( li ) {
            var t = normalizeTitle( li.getAttribute( 'title' ) );
            if ( t && !titleToLi.has( t ) ) {
                titleToLi.set( t, li );
                titles.push( t );
            }
        } );
        if ( !titles.length ) return;

        for ( var i = 0; i < titles.length; i += 50 ) {
            ( function ( batch ) {
                new mw.Api().get( {
                    action: 'query',
                    prop: 'pageimages',
                    piprop: 'original',
                    titles: batch.join( '|' ),
                    formatversion: 2,
                    redirects: 1
                } ).then( function ( data ) {
                    var pages = ( data.query && data.query.pages ) || [];
                    pages.forEach( function ( page ) {
                        if ( page.original && page.original.source && page.title ) {
                            var li = titleToLi.get( normalizeTitle( page.title ) );
                            if ( li ) {
                                li.dataset.originalImage = page.original.source;
                            }
                        }
                    } );
                } ).catch( function () {} );
            } )( titles.slice( i, i + 50 ) );
        }
    }

    function initContainer( container ) {
        var list = container.querySelector( '.read-more-container-card-list' );
        if ( !list ) return;

        /* 卡片一渲染就预取，不等 hover */
        prefetchImages( list );

        var overlay = container.querySelector( '.' + OVERLAY_CLASS );
        if ( !overlay ) {
            overlay = document.createElement( 'div' );
            overlay.className = OVERLAY_CLASS;
            container.insertBefore( overlay, container.firstChild );
        }

        if ( container.dataset.hoverBound ) return;
        container.dataset.hoverBound = '1';

        list.addEventListener( 'mouseover', function ( e ) {
            var link = e.target.closest( 'a' );
            if ( !link || !list.contains( link ) ) return;
            var li = link.closest( 'li' );
            if ( !li ) return;

            var url = li.dataset.originalImage;
            if ( url ) {
                overlay.style.backgroundImage = 'url("' + url.replace( /"/g, '\\"' ) + '")';
            }
            /* 无原图时保持默认 Level0 背景，不切空 */
        } );

        list.addEventListener( 'mouseleave', function () {
            overlay.style.backgroundImage = DEFAULT_IMAGE;   /* 恢复默认图 */
        } );
    }

    function scan() {
        document.querySelectorAll( '.read-more-container-large' ).forEach( initContainer );
    }

    mw.loader.using( 'mediawiki.api' ).then( function () {
        if ( document.readyState === 'loading' ) {
            document.addEventListener( 'DOMContentLoaded', scan );
        } else {
            scan();
        }

        if ( 'MutationObserver' in window ) {
            var timer;
            new MutationObserver( function () {
                clearTimeout( timer );
                timer = setTimeout( scan, 120 );
            } ).observe( document.body, { childList: true, subtree: true } );
        }
    } );
}() );
( function () {
    'use strict';

    var OVERLAY_CLASS = 'read-more-hover-overlay';
    var LAYER_A_CLASS = 'read-more-hover-overlay-hover-a';
    var LAYER_B_CLASS = 'read-more-hover-overlay-hover-b';
    var prefetchedLists = new WeakSet();

    function normalizeTitle( t ) {
        return ( t || '' ).replace( /_/g, ' ' ).trim();
    }

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

        prefetchImages( list );

        var overlay = container.querySelector( '.' + OVERLAY_CLASS );
        if ( !overlay ) {
            overlay = document.createElement( 'div' );
            overlay.className = OVERLAY_CLASS;
            container.insertBefore( overlay, container.firstChild );
        }

        var layerA = container.querySelector( '.' + LAYER_A_CLASS );
        if ( !layerA ) {
            layerA = document.createElement( 'div' );
            layerA.className = LAYER_A_CLASS;
            container.insertBefore( layerA, overlay.nextSibling );
        }

        var layerB = container.querySelector( '.' + LAYER_B_CLASS );
        if ( !layerB ) {
            layerB = document.createElement( 'div' );
            layerB.className = LAYER_B_CLASS;
            container.insertBefore( layerB, layerA.nextSibling );
        }

        if ( container.dataset.hoverBound ) return;
        container.dataset.hoverBound = '1';

        var layers = [ layerA, layerB ];
        var activeIndex = 0;

        function hideHoverLayers() {
            layers[ 0 ].classList.remove( 'is-visible' );
            layers[ 1 ].classList.remove( 'is-visible' );
        }

        function showImage( url ) {
            if ( !url ) {
                overlay.classList.remove( 'is-dimmed' );
                hideHoverLayers();
                return;
            }

            overlay.classList.add( 'is-dimmed' );

            var nextIndex = activeIndex === 0 ? 1 : 0;
            var nextLayer = layers[ nextIndex ];
            var prevLayer = layers[ activeIndex ];

            nextLayer.style.backgroundImage = 'url("' + url.replace( /"/g, '\\"' ) + '")';
            nextLayer.offsetHeight;

            nextLayer.classList.add( 'is-visible' );
            prevLayer.classList.remove( 'is-visible' );

            activeIndex = nextIndex;
        }

        function hideImage() {
            overlay.classList.remove( 'is-dimmed' );
            hideHoverLayers();
        }

        list.addEventListener( 'mouseover', function ( e ) {
            var link = e.target.closest( 'a' );
            if ( !link || !list.contains( link ) ) return;
            var li = link.closest( 'li' );
            if ( !li ) return;

            showImage( li.dataset.originalImage );
        } );

        list.addEventListener( 'mouseleave', hideImage );
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

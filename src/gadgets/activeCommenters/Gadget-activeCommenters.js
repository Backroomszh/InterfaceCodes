( function () {
'use strict';

if ( typeof mw === 'undefined' || typeof mw.Api !== 'function' || typeof mw.util === 'undefined' ) {
    return;
}

function runAll() {
    var SNAPSHOT_VERSION = 1;

    var ALLOWED_PAGES = {
        global:  [ 'The_Backrooms_Wiki:全站评论最活跃' ],
        monthly: [ 'The_Backrooms_Wiki:本月评论最活跃' ]
    };

    function isAllowedPage( mode ) {
        var pageName = mw.config.get( 'wgPageName' ) || '';
        var list = ALLOWED_PAGES[ mode ] || [];
        for ( var i = 0; i < list.length; i++ ) {
            if ( list[ i ] === pageName ) return true;
        }
        return false;
    }

    function getCSNamespaceId() {
        var ids = mw.config.get( 'wgNamespaceIds' ) || {};
        if ( typeof ids.commentstreams === 'number' && ids.commentstreams >= 0 ) {
            return ids.commentstreams;
        }
        for ( var name in ids ) {
            if ( typeof ids[ name ] === 'number' && ids[ name ] >= 0
                && name.toLowerCase() === 'commentstreams' ) {
                return ids[ name ];
            }
        }
        return null;
    }

    function getSnapshotPrefix() {
        var ids = mw.config.get( 'wgNamespaceIds' ) || {};
        if ( typeof ids.votingdata === 'number' && ids.votingdata >= 0 ) {
            return 'VotingData:ActiveCommenters/';
        }
        return 'Project:Votes/ActiveCommenters/';
    }

    function getGlobalSnapshotTitle() { return getSnapshotPrefix() + 'Global'; }
    function getMonthlySnapshotTitle( month ) { return getSnapshotPrefix() + month; }

    function isoMonth() { return new Date().toISOString().slice( 0, 7 ); }
    function nowSec() { return Math.floor( Date.now() / 1000 ); }

    function el( tag, className, text ) {
        var e = document.createElement( tag );
        if ( className ) e.className = className;
        if ( text !== undefined ) e.textContent = String( text );
        return e;
    }

    function safeGet( obj, path ) {
        var parts = path.split( '.' );
        var cur = obj;
        for ( var i = 0; i < parts.length; i++ ) {
            if ( cur === null || cur === undefined ) return undefined;
            cur = cur[ parts[ i ] ];
        }
        return cur;
    }

    function canRefreshSnapshot() {
        var rights = mw.config.get( 'wgUserRights' ) || [];
        if ( rights.indexOf( 'voting-review' ) !== -1 ) return true;
        if ( rights.indexOf( 'editinterface' ) !== -1 ) return true;
        var groups = mw.config.get( 'wgUserGroups' ) || [];
        if ( groups.indexOf( 'sysop' ) !== -1 ) return true;
        if ( groups.indexOf( 'bureaucrat' ) !== -1 ) return true;
        return false;
    }

    function readSnapshot( title ) {
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: title, formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            if ( p.missing !== undefined ) return { invalid: true, snapshot: null };
            var content = safeGet( p, 'revisions.0.slots.main.content' ) || '';
            var re = new RegExp( '<!-- ACTIVE_COMMENTERS_v' + SNAPSHOT_VERSION + ':(\\d{4}-\\d{2}-\\d{2}T[^|]+)\\|([\\s\\S]+?)\\s*-->', 'g' );
            var lastSnap = null;
            var m;
            while ( ( m = re.exec( content ) ) !== null ) {
                try {
                    var obj = JSON.parse( m[ 2 ] );
                    if ( obj && Array.isArray( obj.rows ) ) {
                        lastSnap = {
                            ts: Math.floor( new Date( m[ 1 ] ).getTime() / 1000 ),
                            rows: obj.rows,
                            done: ( typeof obj.done === 'number' ) ? obj.done : obj.rows.length,
                            total: ( typeof obj.total === 'number' ) ? obj.total : obj.rows.length,
                            complete: ( typeof obj.complete === 'undefined' ) ? true : ( obj.complete === 1 || obj.complete === true )
                        };
                    }
                } catch ( e ) {}
            }
            if ( !lastSnap ) return { invalid: true, snapshot: null };
            return { invalid: false, snapshot: lastSnap };
        } ).catch( function () {
            return { invalid: true, snapshot: null };
        } );
    }

    function writeSnapshot( title, rows, extra ) {
        var now = nowSec();
        var iso = new Date( now * 1000 ).toISOString();
        var obj = { rows: rows };
        if ( extra ) { for ( var k in extra ) obj[ k ] = extra[ k ]; }
        var json = JSON.stringify( obj );
        var content = '<!-- ACTIVE_COMMENTERS_v' + SNAPSHOT_VERSION + ':' + iso + '|' + json + ' -->';
        return new mw.Api().postWithToken( 'csrf', {
            action: 'edit', title: title, text: content,
            summary: 'votemark:snapshot|active-commenters|v' + SNAPSHOT_VERSION + '|' + rows.length,
            minor: true
        } ).then( function () { return true; } ).catch( function () { return false; } );
    }

    function writeSnapshotSafe( title, rows, extra ) {
        if ( !extra || extra.complete === 1 ) return writeSnapshot( title, rows, extra );
        return readSnapshot( title ).then( function ( cur ) {
            if ( cur.snapshot && cur.snapshot.complete ) return false;
            return writeSnapshot( title, rows, extra );
        } );
    }

    function fetchAllCommentCreators( csNS, onProgress ) {
        var results = [];
        var cont = null;
        var fetchNext = function () {
            var params = {
                action: 'query', list: 'logevents',
                letype: 'create', lenamespace: csNS,
                lelimit: 500, formatversion: 2
            };
            if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }

            return new mw.Api().get( params ).then( function ( res ) {
                var logevents = ( res.query && res.query.logevents ) || [];
                logevents.forEach( function ( le ) {
                    if ( le.user && le.timestamp ) {
                        results.push( {
                            user: le.user,
                            timestamp: Math.floor( new Date( le.timestamp ).getTime() / 1000 )
                        } );
                    }
                } );
                if ( onProgress ) onProgress( results.length );
                if ( res.continue ) {
                    cont = res.continue;
                    return fetchNext();
                }
                return results;
            } );
        };
        return fetchNext();
    }

    function aggregateByUser( records, month ) {
        var byUser = {};
        for ( var i = 0; i < records.length; i++ ) {
            var r = records[ i ];
            if ( month ) {
                var d = new Date( r.timestamp * 1000 );
                var mm = d.getUTCMonth() + 1;
                var ym = d.getUTCFullYear() + '-' + ( mm < 10 ? '0' : '' ) + mm;
                if ( ym !== month ) continue;
            }
            if ( !byUser[ r.user ] ) byUser[ r.user ] = 0;
            byUser[ r.user ]++;
        }
        var rows = [];
        for ( var user in byUser ) {
            rows.push( { user: user, count: byUser[ user ] } );
        }
        return rows;
    }

    function sortRows( rows, order ) {
        var asc = order === 'asc';
        rows.sort( function ( a, b ) {
            var ca = Number( a.count ) || 0;
            var cb = Number( b.count ) || 0;
            if ( ca !== cb ) {
                var cmp = ca < cb ? -1 : 1;
                return asc ? cmp : -cmp;
            }
            return String( a.user ).localeCompare( String( b.user ) );
        } );
        return rows;
    }

    function getControls( container ) {
        return container.querySelector( '.active-commenters-controls' );
    }

    function renderBody( container, content ) {
        var controls = getControls( container );
        container.innerHTML = '';
        if ( controls ) container.appendChild( controls );
        if ( content ) container.appendChild( content );
    }

    function renderTable( container, rows, limit, embedMode ) {
        limit = limit || 0;
        var displayRows = ( limit > 0 && limit < rows.length ) ? rows.slice( 0, limit ) : rows;

        if ( !displayRows.length ) {
            if ( embedMode ) {
                renderBody( container, null );
            } else {
                renderBody( container, el( 'p', null, '暂无评论数据。' ) );
            }
            return;
        }

        var wrapper = el( 'div', 'active-commenters-table' );

        var table = el( 'table', 'wikitable' );
        var thead = el( 'thead' );
        var headRow = el( 'tr' );
        headRow.appendChild( el( 'th', null, '#' ) );
        headRow.appendChild( el( 'th', null, '用户' ) );
        headRow.appendChild( el( 'th', null, '评论数' ) );
        thead.appendChild( headRow );
        table.appendChild( thead );

        var tbody = el( 'tbody' );
        for ( var i = 0; i < displayRows.length; i++ ) {
            var r = displayRows[ i ];
            var tr = el( 'tr' );
            tr.appendChild( el( 'td', null, i + 1 ) );
            var userTd = el( 'td' );
            var userText = String( r.user || '' );
            var userTitle = mw.Title.newFromText( userText, 2 );
            if ( userTitle ) {
                var a = el( 'a', null, userText );
                a.href = userTitle.getUrl();
                userTd.appendChild( a );
            } else {
                userTd.textContent = userText;
            }
            tr.appendChild( userTd );
            tr.appendChild( el( 'td', null, Number( r.count ) || 0 ) );
            tbody.appendChild( tr );
        }
        table.appendChild( tbody );
        wrapper.appendChild( table );

        if ( !embedMode && limit > 0 && rows.length > limit ) {
            wrapper.appendChild( el( 'p', null,
                '显示前 ' + limit + ' 条，共 ' + rows.length + ' 条。' ) );
        }

        renderBody( container, wrapper );
    }

    function buildControls( container, mode, order, limit, csNS ) {
        var bar = el( 'div', 'active-commenters-controls' );

        var toggleOrder = order === 'asc' ? 'desc' : 'asc';
        var toggleLabel = order === 'asc' ? '切换到降序（高到低）' : '切换到升序（低到高）';
        var toggleUrl = new URL( location.href );
        toggleUrl.searchParams.set( 'order', toggleOrder );
        var toggleLink = el( 'a', null, toggleLabel );
        toggleLink.href = toggleUrl.toString();
        bar.appendChild( toggleLink );

        if ( canRefreshSnapshot() ) {
            bar.appendChild( document.createTextNode( ' ' ) );
            var refreshBtn = el( 'button', null, '强制刷新' );
            refreshBtn.type = 'button';
            refreshBtn.addEventListener( 'click', function () {
                if ( !confirm( '确定强制刷新快照？将重新拉取全部评论数据。' ) ) return;
                refreshBtn.disabled = true;
                refreshBtn.textContent = '重算中……';

                var snapshotTitle = ( mode === 'global' )
                    ? getGlobalSnapshotTitle()
                    : getMonthlySnapshotTitle( isoMonth() );
                var month = ( mode === 'monthly' ) ? isoMonth() : null;

                fetchAllCommentCreators( csNS, null ).then( function ( records ) {
                    var rows = sortRows( aggregateByUser( records, month ), 'desc' );
                    return writeSnapshot( snapshotTitle, rows, {
                        done: rows.length, total: rows.length, complete: 1
                    } );
                } ).then( function () {
                    location.reload();
                } ).catch( function ( err ) {
                    console.error( '[ActiveCommenters] refresh failed:', err );
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = '强制刷新';
                    alert( '刷新失败：' + ( err && err.error ? err.error.info : String( err ) ) );
                } );
            } );
            bar.appendChild( refreshBtn );
        }

        container.insertBefore( bar, container.firstChild );
    }

    function initContainer( container, csNS ) {
        var mode = container.dataset.mode;
        if ( !mode ) return;
        if ( container.dataset.loaded === '1' ) return;
        container.dataset.loaded = '1';

        var limit = parseInt( container.dataset.limit || '0', 10 );
        if ( isNaN( limit ) || limit < 0 ) limit = 0;

        var urlParams = new URLSearchParams( location.search );
        var order = urlParams.get( 'order' );
        if ( order !== 'asc' && order !== 'desc' ) order = 'desc';

        var month = ( mode === 'monthly' ) ? isoMonth() : null;
        var snapshotTitle = ( mode === 'global' )
            ? getGlobalSnapshotTitle()
            : getMonthlySnapshotTitle( month );

        var embedMode = !isAllowedPage( mode );

        container.innerHTML = '';

        if ( !embedMode ) {
            buildControls( container, mode, order, limit, csNS );
        }

        renderBody( container, el( 'p', null, '加载中……' ) );

        readSnapshot( snapshotTitle ).then( function ( result ) {
            var snapshot = result.snapshot;

            if ( snapshot && snapshot.complete ) {
                renderTable( container, sortRows( snapshot.rows, order ), limit, embedMode );
                return;
            }

            var hasPartial = snapshot && snapshot.rows && snapshot.rows.length > 0;
            if ( hasPartial ) {
                renderTable( container, sortRows( snapshot.rows, order ), limit, embedMode );
            }

            fetchAllCommentCreators( csNS, function ( count ) {
                if ( hasPartial || embedMode ) return;
                renderBody( container, el( 'p', null, '加载中…… 已收集 ' + count + ' 条评论' ) );
            } ).then( function ( records ) {
                var rows = sortRows( aggregateByUser( records, month ), order );
                writeSnapshot( snapshotTitle, rows, {
                    done: rows.length, total: rows.length, complete: 1
                } ).catch( function () {} );
                renderTable( container, rows, limit, embedMode );
            } ).catch( function ( e ) {
                console.error( '[ActiveCommenters]', mode, 'failed:', e );
                if ( !hasPartial ) {
                    if ( embedMode ) {
                        renderBody( container, null );
                    } else {
                        renderBody( container, el( 'p', null,
                            '加载失败：' + ( e && e.error ? e.error.info : String( e ) ) ) );
                    }
                }
            } );
        } );
    }

    function init() {
        var containers = document.querySelectorAll( '.active-commenters[data-mode]' );
        if ( !containers.length ) return;

        var csNS = getCSNamespaceId();
        if ( csNS === null ) {
            for ( var i = 0; i < containers.length; i++ ) {
                containers[ i ].innerHTML = '<p>未检测到 CommentStreams 扩展。</p>';
            }
            return;
        }

        for ( var j = 0; j < containers.length; j++ ) {
            try { initContainer( containers[ j ], csNS ); } catch ( e ) {}
        }
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
}

runAll();

} )();
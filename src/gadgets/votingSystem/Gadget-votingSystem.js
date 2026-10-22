( function () {
'use strict';

function runAll() {
    var VOTING_PANEL_SELECTOR = '.voting-panel';
    var PLACEHOLDER_CLASS = 'voting-panel-placeholder';
    var ANCHOR_ID = 'voting-panel-anchor';
    var ALL_RECORDS_CACHE_TTL = 30 * 60 * 1000;

    var SNAPSHOT_VERSION = 2;
    var RANKING_SNAPSHOT_MAX_AGE = 120;
    var RANKING_SNAPSHOT_DEBOUNCE = 60;
    var RANKING_RENDER_CHUNK = 100;

    var ALLOWED_PAGES = {
        globalRanking:  [ 'The_Backrooms_Wiki:全站投票排名' ],
        monthlyRanking: [ 'The_Backrooms_Wiki:月度新页面投票' ],
        rewriteForm:    [ 'The_Backrooms_Wiki:申请重写参与评分' ],
        rewriteReview:  [ 'The_Backrooms_Wiki:审核重写申请' ]
    };

    function isAllowed( kind ) {
        var pageName = mw.config.get( 'wgPageName' ) || '';
        var list = ALLOWED_PAGES[ kind ] || [];
        for ( var i = 0; i < list.length; i++ ) {
            if ( list[ i ] === pageName ) return true;
        }
        if ( hasRight( 'voting-review' ) ) {
            var userName = mw.config.get( 'wgUserName' ) || '';
            if ( userName ) {
                var prefix = 'User:' + userName.replace( / /g, '_' ) + '/';
                if ( pageName.indexOf( prefix ) === 0 ) return true;
            }
        }
        return false;
    }

    function getVotingDataNS() {
        var ids = mw.config.get( 'wgNamespaceIds' ) || {};
        if ( typeof ids.votingdata === 'number' && ids.votingdata >= 0 ) return ids.votingdata;
        return 4;
    }
    function getDataPageTitle( subpath ) {
        var ids = mw.config.get( 'wgNamespaceIds' ) || {};
        if ( typeof ids.votingdata === 'number' && ids.votingdata >= 0 ) return 'VotingData:' + subpath;
        return 'Project:Votes/' + subpath.replace( /^Votes\//, '' );
    }
    function getGlobalSnapshotTitle() { return getDataPageTitle( 'GlobalRanking' ); }
    function getMonthlySnapshotTitle( month ) { return getDataPageTitle( 'MonthlyRanking/' + month ); }

    function vsNotify( text, opts ) {
        try {
            if ( typeof mw !== 'undefined' && typeof mw.notify === 'function' ) {
                mw.notify( text, opts || {} );
            }
        } catch ( e ) {}
    }

    var MSG_FALLBACK = {
        'vote-success': '投票成功',
        'vote-error': '投票失败，请重试。',
        'vote-login-required': '请先登录后再投票。',
        'vote-rate-limited': '投票过于频繁，请稍后再试。',
        'vote-comment-required': '必须填写投票理由才能投票。',
        'vote-autoconfirmed-required': '您没有投票权限。',
        'vote-comment-prompt': '写投票理由可以让你的票更有分量，也让评分更有意义。',
        'vote-no-comment-hint': '不写理由也可以投票，但权重会大幅降低。',
        'vote-comment-placeholder': '请写下你投票的理由……',
        'vote-submit': '仅投票',
        'vote-submit-with-comment': '发表评论并投票',
        'vote-cancel': '取消',
        'vote-hide-score': '隐藏我的投分',
        'vote-weight-info': '本次投票权重：$1',
        'vote-title-score': '投出了 $1 分',
        'vote-title-hidden': '投出了一票（分数已隐藏）',
        'panel-title': '为本文投票：',
        'panel-login': '请先登录后才能投票。',
        'panel-details-toggle': '查看投票详情',
        'panel-details-hide': '收起',
        'panel-details-loading': '加载中……',
        'panel-details-error': '加载失败。',
        'panel-details-empty': '暂无投票。',
        'panel-details-user': '用户',
        'panel-details-value': '投票',
        'panel-details-weight': '权重',
        'panel-details-time': '时间',
        'panel-details-delete': '撤销',
        'panel-details-delete-confirm': '确定要撤销该投票吗？评论不会被删除。',
        'panel-details-delete-error': '撤销失败。',
        'panel-scoring-root-note': '本页面的投票计入 $1 的评分。',
        'panel-not-saved': '此页面尚未保存，无法投票。',
        'rewrite-login-required': '请先登录后再提交申请。',
        'rewrite-title': '申请重写页面参与评分',
        'rewrite-page-label': '页面名称：',
        'rewrite-page-placeholder': '例如：Main Page',
        'rewrite-reason-label': '申请理由：',
        'rewrite-reason-placeholder': '至少填写 10 个字符，说明为何需要重新评分',
        'rewrite-reason-too-short': '申请理由至少需要 10 个字符。',
        'rewrite-submit-btn': '提交申请',
        'rewrite-invalid-page': '页面不存在。',
        'rewrite-invalid-namespace': '只能对普通命名空间的页面提交申请。',
        'rewrite-submitted': '申请已提交，请等待站务组审核。',
        'rewrite-already-pending': '您已经为该页面提交过申请，请等待审核。',
        'rewrite-my-requests': '我的申请记录',
        'rewrite-table-page': '页面',
        'rewrite-table-status': '状态',
        'rewrite-table-time': '申请时间',
        'rewrite-status-pending': '待审核',
        'rewrite-status-approved': '已通过',
        'rewrite-status-rejected': '已拒绝',
        'rewrite-status-unknown': '未知',
        'review-title': '审核重写申请',
        'review-no-permission': '您没有权限审核重写申请。',
        'review-no-pending': '目前没有待审核的申请。',
        'review-table-page': '页面',
        'review-table-user': '申请人',
        'review-table-reason': '理由',
        'review-table-time': '申请时间',
        'review-table-actions': '操作',
        'review-approve': '通过',
        'review-reject': '拒绝',
        'review-approved': '已通过该申请。',
        'review-rejected': '已拒绝该申请。',
        'table-rank': '#',
        'table-page': '页面',
        'table-score': '分数',
        'table-votecount': '投票人数',
        'order-asc': '切换到升序（低到高）',
        'order-desc': '切换到降序（高到低）',
        'showing-partial': '显示前 $1 条，共 $2 条。',
        'ranking-loading': '加载中……',
        'ranking-error': '加载失败：',
        'ranking-last-updated': '最后更新：$1',
        'ranking-snapshot-loading': '加载排名快照……',
        'ranking-first-calc': '首次生成排名，请稍候……',
        'ranking-refresh-now': '立即刷新快照',
        'ranking-refreshing': '重算中……'
    };

    function msg( key ) {
        var fullKey = 'votingsystem-' + key;
        try {
            var m = mw.message.new( fullKey );
            if ( m.exists() ) {
                var args = Array.prototype.slice.call( arguments, 1 );
                if ( args.length ) m.params( args );
                return m.text();
            }
        } catch ( e ) {}
        var fb = MSG_FALLBACK[ key ];
        if ( fb === undefined ) return fullKey;
        var args2 = Array.prototype.slice.call( arguments, 1 );
        if ( args2.length ) {
            return fb.replace( /\$(\d+)/g, function ( _, n ) {
                var v = args2[ n - 1 ];
                return String( v !== undefined && v !== null ? v : '' );
            } );
        }
        return fb;
    }

    function uuid() {
        if ( window.crypto && crypto.randomUUID ) return crypto.randomUUID().replace( /-/g, '' ).slice( 0, 16 );
        return 'xxxxxxxxxxxxxxxx'.replace( /x/g, function () {
            return ( ( Math.random() * 16 ) | 0 ).toString( 16 );
        } );
    }
    function nowSec() { return Math.floor( Date.now() / 1000 ); }
    function isoMonth() { return new Date().toISOString().slice( 0, 7 ); }

    function formatScore( v ) {
        var n = Number( v );
        if ( n > 0 ) return '+' + n.toFixed( 1 ).replace( /\.0$/, '' );
        if ( n < 0 ) return n.toFixed( 1 ).replace( /\.0$/, '' );
        return '0';
    }

    function getUserGroups() { return mw.config.get( 'wgUserGroups' ) || []; }

    function hasRight( right ) {
        var rights = mw.config.get( 'wgUserRights' ) || [];
        var groups = mw.config.get( 'wgUserGroups' ) || [];
        if ( rights.indexOf( right ) !== -1 ) return true;
        switch ( right ) {
            case 'voting':
                if ( rights.indexOf( 'edit' ) !== -1 ) return true;
                if ( groups.indexOf( 'autoconfirmed' ) !== -1 ) return true;
                if ( groups.indexOf( 'rollbacker' ) !== -1 ) return true;
                if ( groups.indexOf( 'patroller' ) !== -1 ) return true;
                if ( groups.indexOf( 'sysop' ) !== -1 ) return true;
                if ( groups.indexOf( 'bureaucrat' ) !== -1 ) return true;
                if ( groups.indexOf( 'verified' ) !== -1 ) return true;
                if ( groups.indexOf( 'interface-admin' ) !== -1 ) return true;
                return false;
            case 'voting-review':
            case 'voting-delete':
                if ( groups.indexOf( 'sysop' ) !== -1 ) return true;
                if ( groups.indexOf( 'bureaucrat' ) !== -1 ) return true;
                return false;
            case 'voting-verified':
                return groups.indexOf( 'verified' ) !== -1;
            default: return false;
        }
    }

    function isLoggedIn() { return !!mw.config.get( 'wgUserName' ); }

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

    var cachedConfig = null;
    function loadConfig() {
        if ( cachedConfig ) return Promise.resolve( cachedConfig );
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: 'MediaWiki:Votingsystem-config.json', formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            var text = ( p.missing === undefined ) ? ( safeGet( p, 'revisions.0.slots.main.content' ) || '' ) : '';
            try { cachedConfig = text ? JSON.parse( text ) : {}; }
            catch ( e ) { cachedConfig = {}; }
            return cachedConfig;
        } ).catch( function () { cachedConfig = {}; return cachedConfig; } );
    }

    var cachedPrefixes = null;
    function loadIndependentPrefixes() {
        if ( cachedPrefixes ) return Promise.resolve( cachedPrefixes );
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: 'MediaWiki:Votingsystem-independent-prefixes', formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            var text = ( p.missing === undefined ) ? ( safeGet( p, 'revisions.0.slots.main.content' ) || '' ) : '';
            cachedPrefixes = text.split( '\n' ).map( function ( s ) { return s.trim(); } )
                .filter( function ( s ) { return s && s.charAt( 0 ) !== '#'; } );
            return cachedPrefixes;
        } ).catch( function () { cachedPrefixes = []; return cachedPrefixes; } );
    }

    var cachedExcluded = null;
    function loadExcludedList() {
        if ( cachedExcluded ) return Promise.resolve( cachedExcluded );
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: 'MediaWiki:Votingsystem-excluded-pages', formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            var text = ( p.missing === undefined ) ? ( safeGet( p, 'revisions.0.slots.main.content' ) || '' ) : '';
            cachedExcluded = text.split( '\n' ).map( function ( s ) { return s.trim(); } )
                .filter( function ( s ) { return s && s.charAt( 0 ) !== '#'; } );
            return cachedExcluded;
        } ).catch( function () { cachedExcluded = []; return cachedExcluded; } );
    }

    var scoringRootCache = {};
    function resolveScoringRoot( pageId, title, ns ) {
        if ( scoringRootCache[ pageId ] !== undefined ) return Promise.resolve( scoringRootCache[ pageId ] );
        if ( !title || typeof title !== 'string' ) {
            scoringRootCache[ pageId ] = pageId;
            return Promise.resolve( pageId );
        }
        var parts = title.split( '/' );
        if ( parts.length <= 1 ) {
            scoringRootCache[ pageId ] = pageId;
            return Promise.resolve( pageId );
        }
        return loadIndependentPrefixes().then( function ( prefixes ) {
            var deepest = -1;
            for ( var i = 0; i < parts.length; i++ ) {
                for ( var j = 0; j < prefixes.length; j++ ) {
                    var prefix = prefixes[ j ];
                    if ( prefix && parts[ i ].indexOf( prefix ) === 0 ) {
                        deepest = i;
                        break;
                    }
                }
            }
            var rootText = deepest === -1 ? parts[ 0 ] : parts.slice( 0, deepest + 1 ).join( '/' );
            if ( rootText === title ) {
                scoringRootCache[ pageId ] = pageId;
                return pageId;
            }
            return new mw.Api().get( {
                action: 'query', titles: rootText, formatversion: 2, prop: 'info'
            } ).then( function ( res ) {
                var p = res.query.pages[ 0 ];
                if ( p && p.missing === undefined && p.pageid ) {
                    scoringRootCache[ pageId ] = p.pageid;
                    return p.pageid;
                }
                scoringRootCache[ pageId ] = pageId;
                return pageId;
            } ).catch( function () {
                scoringRootCache[ pageId ] = pageId;
                return pageId;
            } );
        } ).catch( function () {
            scoringRootCache[ pageId ] = pageId;
            return pageId;
        } );
    }

    function getPageTitle( pageId ) {
        return new mw.Api().get( {
            action: 'query', pageids: String( pageId ), formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            return ( p && p.missing === undefined && p.title ) ? p.title : null;
        } ).catch( function () { return null; } );
    }

    function isExcludedPage( pageName, pageId, title, ns ) {
        return loadExcludedList().then( function ( list ) {
            if ( !list.length ) return false;
            var plain = ( pageName || '' ).replace( /_/g, ' ' );
            if ( list.indexOf( plain ) !== -1 ) return true;
            return resolveScoringRoot( pageId, title, ns ).then( function ( rootId ) {
                if ( rootId === pageId ) return false;
                return getPageTitle( rootId ).then( function ( rootTitle ) {
                    return rootTitle ? list.indexOf( rootTitle ) !== -1 : false;
                } );
            } );
        } ).catch( function () { return false; } );
    }

    function computeWeight( hasComment ) {
        return loadConfig().then( function ( cfg ) {
            var ncw = ( cfg.noCommentWeight !== undefined && cfg.noCommentWeight !== null ) ? cfg.noCommentWeight : 0.2;
            if ( !hasComment ) return ncw;
            var map = cfg.baseWeightByGroup || { default: 1.0 };
            var bonus = ( cfg.commentBonus !== undefined && cfg.commentBonus !== null ) ? cfg.commentBonus : 2.0;
            var base = Number( map.default !== undefined && map.default !== null ? map.default : 1.0 );
            var groups = getUserGroups();
            for ( var i = 0; i < groups.length; i++ ) {
                var g = groups[ i ];
                if ( map[ g ] !== undefined && Number( map[ g ] ) > base ) base = Number( map[ g ] );
            }
            return +( base + bonus ).toFixed( 2 );
        } );
    }

    function rateLimited() {
        var key = 'voting_rl_' + ( mw.config.get( 'wgUserName' ) || 'anon' );
        var store = JSON.parse( localStorage.getItem( key ) || '{"h":[],"d":[]}' );
        var now = nowSec();
        store.h = store.h.filter( function ( t ) { return now - t < 3600; } );
        store.d = store.d.filter( function ( t ) { return now - t < 86400; } );
        if ( store.h.length >= 10 || store.d.length >= 50 ) return true;
        store.h.push( now );
        store.d.push( now );
        localStorage.setItem( key, JSON.stringify( store ) );
        return false;
    }

    var cachedAllRecords = null;
    var cachedAllRecordsAt = 0;

    function invalidateAllRecords() {
        cachedAllRecords = null;
        cachedAllRecordsAt = 0;
    }

    function getAllRecords( forceRefresh ) {
        var now = Date.now();
        if ( !forceRefresh && cachedAllRecords && now - cachedAllRecordsAt < ALL_RECORDS_CACHE_TTL ) {
            return Promise.resolve( cachedAllRecords );
        }
        var titles = [];
        var seenTitles = {};
        var fetchForNS = function ( ns, cont ) {
            var params = {
                action: 'query', list: 'allpages',
                apnamespace: ns, aplimit: 500, formatversion: 2
            };
            if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }
            return new mw.Api().get( params ).then( function ( res ) {
                ( res.query.allpages || [] ).forEach( function ( p ) {
                    var titlePart = p.title.replace( /^[^:]+:/, '' );
                    if ( titlePart.indexOf( 'Votes/' ) === 0 && !seenTitles[ p.title ] ) {
                        seenTitles[ p.title ] = true;
                        titles.push( p.title );
                    }
                } );
                if ( res.continue ) return fetchForNS( ns, res.continue );
            } ).catch( function () {} );
        };
        var ids = mw.config.get( 'wgNamespaceIds' ) || {};
        var vns = ( typeof ids.votingdata === 'number' ) ? ids.votingdata : 4;
        var nsToQuery = [];
        if ( vns !== 4 ) nsToQuery.push( vns );
        nsToQuery.push( 4 );
        var chain = Promise.resolve();
        nsToQuery.forEach( function ( ns ) {
            chain = chain.then( function () { return fetchForNS( ns, null ); } );
        } );

        return chain.then( function () {
            var allVotes = {};
            var allDeletes = {};
            var fetchBatch = function ( start ) {
                if ( start >= titles.length ) return Promise.resolve();
                var batch = titles.slice( start, start + 50 );
                return new mw.Api().get( {
                    action: 'query', prop: 'revisions', rvprop: 'content',
                    rvslots: 'main', titles: batch.join( '|' ), formatversion: 2
                } ).then( function ( res ) {
                    for ( var i = 0; i < res.query.pages.length; i++ ) {
                        var p = res.query.pages[ i ];
                        var content = safeGet( p, 'revisions.0.slots.main.content' ) || '';
                        var voteRe = /<!--\s*V\s+v1\s+u=([^\s|]+)\s+p=(\d+)\s+v=([\-\d.]+)\s+w=([\d.]+)\s+t=(\d+)\s+h=([01])\s+c=(\d+)\s+id=([\w-]+)\s*-->/g;
                        var delRe = /<!--\s*V\s+v1\s+del\s+id=([\w-]+)\s+by=[^\s]+\s+t=\d+\s*-->/g;
                        var m;
                        while ( ( m = voteRe.exec( content ) ) ) {
                            allVotes[ m[ 8 ] ] = {
                                id: m[ 8 ], user: m[ 1 ], page: parseInt( m[ 2 ], 10 ),
                                value: parseFloat( m[ 3 ] ), weight: parseFloat( m[ 4 ] ),
                                timestamp: parseInt( m[ 5 ], 10 ), hide: m[ 6 ] === '1',
                                cid: parseInt( m[ 7 ], 10 )
                            };
                        }
                        while ( ( m = delRe.exec( content ) ) ) allDeletes[ m[ 1 ] ] = true;
                    }
                    return fetchBatch( start + 50 );
                } );
            };
            return fetchBatch( 0 ).then( function () {
                var byUserPage = {};
                for ( var id in allVotes ) {
                    if ( allDeletes[ id ] ) continue;
                    var rec = allVotes[ id ];
                    var key = rec.user + '|' + rec.page;
                    if ( !byUserPage[ key ] || byUserPage[ key ].timestamp < rec.timestamp ) {
                        byUserPage[ key ] = rec;
                    }
                }
                cachedAllRecords = byUserPage;
                cachedAllRecordsAt = now;
                return byUserPage;
            } );
        } );
    }

    function getRecordsForPage( rootId ) {
        return getAllRecords().then( function ( all ) {
            var list = [];
            for ( var key in all ) if ( all[ key ].page === rootId ) list.push( all[ key ] );
            list.sort( function ( a, b ) { return b.timestamp - a.timestamp; } );
            return list;
        } );
    }

    function getRecordForUserPage( user, rootId ) {
        return getAllRecords().then( function ( all ) {
            return all[ user + '|' + rootId ] || null;
        } );
    }

    function getAllNSMainPageIds() {
        var tryFetch = function ( filter ) {
            return new Promise( function ( resolve ) {
                var pages = [];
                var fetch = function ( cont ) {
                    var params = {
                        action: 'query', list: 'allpages',
                        apnamespace: 0, aplimit: 500, formatversion: 2
                    };
                    if ( filter ) params.apfilterredir = filter;
                    if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }
                    new mw.Api().get( params ).then( function ( res ) {
                        ( res.query.allpages || [] ).forEach( function ( p ) { pages.push( p.pageid ); } );
                        if ( res.continue ) return fetch( res.continue );
                        resolve( pages );
                    }, function () {
                        resolve( pages );
                    } );
                };
                fetch( null );
            } );
        };

        return tryFetch( 'nonredirects' ).then( function ( pages ) {
            if ( pages.length > 0 ) return pages;
            return tryFetch( 'all' );
        } );
    }

    function computeScore( weighted ) {
        var n = weighted.length;
        if ( n === 0 ) return { score: null, count: 0 };
        var W = 0, S = 0, cs = [];
        for ( var i = 0; i < n; i++ ) {
            var c = weighted[ i ].value * weighted[ i ].weight;
            cs.push( c ); W += weighted[ i ].weight; S += c;
        }
        if ( n >= 3 && W >= 3 ) {
            cs.sort( function ( a, b ) { return a - b; } );
            cs.shift(); cs.pop();
            var sum = 0;
            for ( var j = 0; j < cs.length; j++ ) sum += cs[ j ];
            return { score: sum / ( W - 2 ), count: n };
        }
        var C = 3, m = 0;
        return { score: ( C * m + S ) / ( C + W ), count: n };
    }

    function appendVote( line, summary ) {
        return new mw.Api().postWithToken( 'csrf', {
            action: 'edit', title: getDataPageTitle( 'Votes/' + isoMonth() ),
            appendtext: '\n' + line, summary: summary
        } );
    }

    function purgePages( titles ) {
        if ( !titles || !titles.length ) return Promise.resolve();
        var uniq = [], seen = {};
        for ( var i = 0; i < titles.length; i++ ) {
            if ( !seen[ titles[ i ] ] ) { seen[ titles[ i ] ] = true; uniq.push( titles[ i ] ); }
        }
        return new mw.Api().postWithToken( 'csrf', {
            action: 'purge', titles: uniq.join( '|' )
        } ).catch( function () {} );
    }

    function readSnapshot( title, marker ) {
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: title, formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            if ( p.missing !== undefined ) return { invalid: true, snapshot: null, reason: 'missing' };
            var content = safeGet( p, 'revisions.0.slots.main.content' ) || '';

            var invalidMatch = content.match( /<!--\s*INVALIDATE:(\d+)\s*-->/ );
            var invalidTs = invalidMatch ? parseInt( invalidMatch[ 1 ], 10 ) : 0;

            var re = new RegExp( '<!--\\s*' + marker + '_v' + SNAPSHOT_VERSION
                + ':(\\d{4}-\\d{2}-\\d{2}T[^|]+)\\|([\\s\\S]+?)\\s*-->', 'g' );
            var lastSnap = null;
            var m;
            while ( ( m = re.exec( content ) ) !== null ) {
                try {
                    var obj = JSON.parse( m[ 2 ] );
                    if ( obj && Array.isArray( obj.rows ) ) {
                        lastSnap = { ts: Math.floor( new Date( m[ 1 ] ).getTime() / 1000 ), rows: obj.rows };
                    }
                } catch ( e ) {}
            }

            if ( !lastSnap ) return { invalid: true, snapshot: null, reason: 'no-snapshot' };
            if ( invalidTs > lastSnap.ts ) return { invalid: true, snapshot: lastSnap, reason: 'invalidated' };
            return { invalid: false, snapshot: lastSnap };
        } ).catch( function () {
            return { invalid: true, snapshot: null, reason: 'error' };
        } );
    }

    function writeSnapshot( title, marker, rows ) {
        var now = nowSec();
        var iso = new Date( now * 1000 ).toISOString();
        var json = JSON.stringify( { rows: rows } );
        var line = '<!-- ' + marker + '_v' + SNAPSHOT_VERSION + ':' + iso + '|' + json + ' -->';
        return new mw.Api().postWithToken( 'csrf', {
            action: 'edit', title: title,
            appendtext: '\n' + line,
            summary: 'votemark:snapshot|' + marker.toLowerCase() + '|v' + SNAPSHOT_VERSION + '|' + rows.length,
            minor: true
        } ).then( function () { return true; } ).catch( function () { return false; } );
    }

    function markSnapshotStale( title, summary ) {
        return new mw.Api().postWithToken( 'csrf', {
            action: 'edit', title: title,
            appendtext: '\n<!-- INVALIDATE:' + nowSec() + ' -->',
            summary: summary, minor: true
        } ).catch( function () {} );
    }

    function readGlobalSnapshot() { return readSnapshot( getGlobalSnapshotTitle(), 'SNAPSHOT' ); }
    function writeGlobalSnapshot( rows ) { return writeSnapshot( getGlobalSnapshotTitle(), 'SNAPSHOT', rows ); }
    function readMonthlySnapshot( month ) { return readSnapshot( getMonthlySnapshotTitle( month ), 'SNAPSHOT' ); }
    function writeMonthlySnapshot( month, rows ) { return writeSnapshot( getMonthlySnapshotTitle( month ), 'SNAPSHOT', rows ); }

    function computeGlobalRankingRows( onProgress ) {
        return getAllNSMainPageIds().then( function ( pageIds ) {
            if ( !pageIds.length ) return [];
            var infoMap = {};
            var fetchInfo = function ( startIdx ) {
                if ( startIdx >= pageIds.length ) return Promise.resolve();
                var batch = pageIds.slice( startIdx, startIdx + 50 );
                return new mw.Api().get( {
                    action: 'query', pageids: batch.join( '|' ),
                    prop: 'info', formatversion: 2
                } ).then( function ( res ) {
                    for ( var i = 0; i < res.query.pages.length; i++ ) {
                        var p = res.query.pages[ i ];
                        if ( p.missing !== undefined ) continue;
                        if ( p.redirect !== undefined ) continue;
                        infoMap[ p.pageid ] = p.title;
                    }
                    if ( onProgress ) onProgress( { phase: 'info', done: Math.min( startIdx + 50, pageIds.length ), total: pageIds.length } );
                    return fetchInfo( startIdx + 50 );
                } );
            };
            return fetchInfo( 0 ).then( function () {
                return Promise.all( [ getAllRecords(), loadConfig(), loadExcludedList() ] );
            } ).then( function ( results ) {
                var all = results[ 0 ], cfg = results[ 1 ], excludedList = results[ 2 ];
                var ncw = ( cfg.noCommentWeight !== undefined && cfg.noCommentWeight !== null ) ? cfg.noCommentWeight : 0.2;

                var filtered = [];
                var filterIdx = 0;
                var doFilterBatch = function () {
                    if ( filterIdx >= pageIds.length ) return Promise.resolve();
                    var end = Math.min( filterIdx + 50, pageIds.length );
                    var chain = Promise.resolve();
                    for ( var i = filterIdx; i < end; i++ ) {
                        ( function ( pid ) {
                            chain = chain.then( function () {
                                if ( !infoMap[ pid ] ) return;
                                var t = infoMap[ pid ];
                                if ( excludedList.indexOf( t ) !== -1 ) return;
                                return resolveScoringRoot( pid, t, 0 ).then( function ( rootId ) {
                                    if ( rootId !== pid ) return;
                                    filtered.push( pid );
                                } );
                            } );
                        } )( pageIds[ i ] );
                    }
                    return chain.then( function () {
                        filterIdx = end;
                        if ( onProgress ) onProgress( { phase: 'filter', done: filterIdx, total: pageIds.length } );
                        return doFilterBatch();
                    } );
                };

                return doFilterBatch().then( function () {
                    var rows = [];
                    var calcIdx = 0;
                    var doCalcBatch = function () {
                        if ( calcIdx >= filtered.length ) return Promise.resolve( rows );
                        var end = Math.min( calcIdx + 100, filtered.length );
                        for ( var i = calcIdx; i < end; i++ ) {
                            var pid = filtered[ i ];
                            var recs = [];
                            for ( var key in all ) {
                                var r = all[ key ];
                                if ( r.page === pid ) recs.push( { value: r.value, weight: r.cid > 0 ? r.weight : ncw } );
                            }
                            var s = computeScore( recs );
                            rows.push( {
                                pageId: pid, title: infoMap[ pid ],
                                score: s.score === null ? 0 : s.score,
                                count: s.count
                            } );
                        }
                        calcIdx = end;
                        if ( onProgress ) onProgress( { phase: 'calc', done: calcIdx, total: filtered.length, rows: rows } );
                        return new Promise( function ( r ) { setTimeout( r, 0 ); } ).then( doCalcBatch );
                    };
                    return doCalcBatch();
                } );
            } );
        } );
    }

    function getMonthlyNewPageIds( month, onProgress ) {
        var start = new Date( month + '-01T00:00:00Z' ).getTime() / 1000;
        var next = new Date( month + '-01T00:00:00Z' );
        next.setUTCMonth( next.getUTCMonth() + 1 );
        var end = next.getTime() / 1000;

        function pad( n ) { return n < 10 ? '0' + n : String( n ); }
        function mwTs( sec ) {
            var d = new Date( sec * 1000 );
            return '' + d.getUTCFullYear() + pad( d.getUTCMonth() + 1 ) + pad( d.getUTCDate() )
                + pad( d.getUTCHours() ) + pad( d.getUTCMinutes() ) + pad( d.getUTCSeconds() );
        }

        var candidates = {};

        var fetchNew = function ( cont ) {
            var params = {
                action: 'query', list: 'recentchanges', rctype: 'new', rcnamespace: 0,
                rcprop: 'title|timestamp|pageid', rclimit: 500,
                rcstart: mwTs( end ), rcend: mwTs( start ), formatversion: 2
            };
            if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }
            return new mw.Api().get( params ).then( function ( res ) {
                ( res.query.recentchanges || [] ).forEach( function ( rc ) {
                    if ( rc.type === 'new' && rc.pageid ) candidates[ rc.pageid ] = true;
                } );
                if ( res.continue ) return fetchNew( res.continue );
            } ).catch( function () {} );
        };

        var fetchCreated = function ( cont ) {
            var params = {
                action: 'query', list: 'logevents',
                letype: 'create', lenamespace: 0, lelimit: 500,
                lestart: mwTs( end ), leend: mwTs( start ), formatversion: 2
            };
            if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }
            return new mw.Api().get( params ).then( function ( res ) {
                ( res.query.logevents || [] ).forEach( function ( le ) {
                    if ( le.pageid ) candidates[ le.pageid ] = true;
                } );
                if ( res.continue ) return fetchCreated( res.continue );
            } ).catch( function () {} );
        };

        var fetchRestored = function ( cont ) {
            var params = {
                action: 'query', list: 'logevents',
                letype: 'delete', leaction: 'delete/restore', lenamespace: 0, lelimit: 500,
                lestart: mwTs( end ), leend: mwTs( start ), formatversion: 2
            };
            if ( cont ) { for ( var k in cont ) params[ k ] = cont[ k ]; }
            return new mw.Api().get( params ).then( function ( res ) {
                ( res.query.logevents || [] ).forEach( function ( le ) {
                    if ( le.pageid ) candidates[ le.pageid ] = true;
                } );
                if ( res.continue ) return fetchRestored( res.continue );
            } ).catch( function () {} );
        };

        var fetchApproved = function () {
            return readRewriteRequests().then( function ( content ) {
                var submits = parseRewrite( content );
                for ( var id in submits ) {
                    if ( submits[ id ].status === 1 ) candidates[ submits[ id ].page ] = true;
                }
            } );
        };

        var progress = function ( step ) {
            if ( onProgress ) {
                onProgress( {
                    phase: 'fallback',
                    done: step, total: 4,
                    found: Object.keys( candidates ).length
                } );
            }
        };

        return fetchNew( null ).then( function () {
            progress( 1 );
            return fetchCreated( null );
        } ).then( function () {
            progress( 2 );
            return fetchRestored( null );
        } ).then( function () {
            progress( 3 );
            return fetchApproved();
        } ).then( function () {
            progress( 4 );
            return Object.keys( candidates ).map( Number );
        } );
    }

    function computeMonthlyRankingRows( month, onProgress ) {
        return getMonthlyNewPageIds( month, onProgress ).then( function ( candidateIds ) {
            if ( !candidateIds.length ) return [];
            var infoMap = {};
            var fetchInfo = function ( startIdx ) {
                if ( startIdx >= candidateIds.length ) return Promise.resolve();
                var batch = candidateIds.slice( startIdx, startIdx + 50 );
                return new mw.Api().get( {
                    action: 'query', pageids: batch.join( '|' ),
                    prop: 'info', formatversion: 2
                } ).then( function ( res ) {
                    for ( var i = 0; i < res.query.pages.length; i++ ) {
                        var p = res.query.pages[ i ];
                        if ( p.missing !== undefined ) continue;
                        if ( p.redirect !== undefined ) continue;
                        infoMap[ p.pageid ] = p.title;
                    }
                    return fetchInfo( startIdx + 50 );
                } );
            };
            return fetchInfo( 0 ).then( function () {
                return Promise.all( [ getAllRecords(), loadConfig(), loadExcludedList() ] );
            } ).then( function ( results ) {
                var all = results[ 0 ], cfg = results[ 1 ], excludedList = results[ 2 ];
                var ncw = ( cfg.noCommentWeight !== undefined && cfg.noCommentWeight !== null ) ? cfg.noCommentWeight : 0.2;

                var filtered = [];
                var filterIdx = 0;
                var doFilterBatch = function () {
                    if ( filterIdx >= candidateIds.length ) return Promise.resolve();
                    var end = Math.min( filterIdx + 50, candidateIds.length );
                    var chain = Promise.resolve();
                    for ( var i = filterIdx; i < end; i++ ) {
                        ( function ( pid ) {
                            chain = chain.then( function () {
                                if ( !infoMap[ pid ] ) return;
                                var t = infoMap[ pid ];
                                if ( excludedList.indexOf( t ) !== -1 ) return;
                                return resolveScoringRoot( pid, t, 0 ).then( function ( rootId ) {
                                    if ( rootId !== pid ) return;
                                    filtered.push( pid );
                                } );
                            } );
                        } )( candidateIds[ i ] );
                    }
                    return chain.then( function () {
                        filterIdx = end;
                        if ( onProgress ) onProgress( { phase: 'filter', done: filterIdx, total: candidateIds.length } );
                        return doFilterBatch();
                    } );
                };

                return doFilterBatch().then( function () {
                    var rows = [];
                    var calcIdx = 0;
                    var doCalcBatch = function () {
                        if ( calcIdx >= filtered.length ) return Promise.resolve( rows );
                        var end = Math.min( calcIdx + 100, filtered.length );
                        for ( var i = calcIdx; i < end; i++ ) {
                            var pid = filtered[ i ];
                            var recs = [];
                            for ( var key in all ) {
                                var r = all[ key ];
                                if ( r.page === pid ) recs.push( { value: r.value, weight: r.cid > 0 ? r.weight : ncw } );
                            }
                            var s = computeScore( recs );
                            rows.push( {
                                pageId: pid, title: infoMap[ pid ],
                                score: s.score === null ? 0 : s.score,
                                count: s.count
                            } );
                        }
                        calcIdx = end;
                        if ( onProgress ) onProgress( { phase: 'calc', done: calcIdx, total: filtered.length, rows: rows } );
                        return new Promise( function ( r ) { setTimeout( r, 0 ); } ).then( doCalcBatch );
                    };
                    return doCalcBatch();
                } );
            } );
        } );
    }

    function renderRankingRows( wrap, rows, opts ) {
        var order = opts.order || 'desc';
        var limit = opts.limit || 0;
        var ts = opts.ts;
        var mode = opts.mode;
        var month = opts.month;
        var appendOnly = !!opts.appendOnly;
        var progressText = opts.progressText;
        var embedMode = !!opts.embedMode;

        var asc = order === 'asc';
        var total = rows.length;
        var displayRows;

        if ( appendOnly ) {
            displayRows = rows;
        } else {
            rows = rows.slice();
            rows.sort( function ( a, b ) {
                if ( a.score !== b.score ) {
                    var cmp = a.score < b.score ? -1 : 1;
                    return asc ? cmp : -cmp;
                }
                if ( a.count !== b.count ) {
                    var cmp2 = a.count < b.count ? -1 : 1;
                    return asc ? cmp2 : -cmp2;
                }
                return String( a.title ).localeCompare( String( b.title ) );
            } );
            displayRows = ( limit > 0 && limit < total ) ? rows.slice( 0, limit ) : rows;
        }

        var renderedCount = parseInt( wrap.dataset.renderedCount || '0', 10 );

        if ( !appendOnly ) {
            renderedCount = 0;
            wrap.dataset.renderedCount = '0';
            wrap.innerHTML = '';
            var wrapper = el( 'div', 'voting-scores-wrapper' );

            if ( !embedMode ) {
                var controls = el( 'div', 'voting-controls' );

                var toggleOrder = asc ? 'desc' : 'asc';
                var toggleLabel = asc ? msg( 'order-desc' ) : msg( 'order-asc' );
                var toggleUrl = new URL( location.href );
                toggleUrl.searchParams.set( 'order', toggleOrder );
                if ( limit > 0 ) toggleUrl.searchParams.set( 'limit', String( limit ) );
                else toggleUrl.searchParams.delete( 'limit' );
                if ( mode === 'monthly' && month ) toggleUrl.searchParams.set( 'month', month );
                var toggleLink = el( 'a', 'voting-toggle-order', toggleLabel );
                toggleLink.href = toggleUrl.toString();
                controls.appendChild( toggleLink );

                if ( ts ) {
                    var tsEl = el( 'span', 'voting-last-updated',
                        msg( 'ranking-last-updated',
                            new Date( ts * 1000 ).toISOString().slice( 0, 16 ).replace( 'T', ' ' ) ) );
                    controls.appendChild( tsEl );
                }

                if ( hasRight( 'voting-review' ) ) {
                    var refreshLink = el( 'a', 'voting-refresh-snapshot', msg( 'ranking-refresh-now' ) );
                    refreshLink.href = 'javascript:void(0)';
                    refreshLink.addEventListener( 'click', function ( e ) {
                        e.preventDefault();
                        refreshLink.textContent = msg( 'ranking-refreshing' );
                        refreshLink.style.pointerEvents = 'none';
                        var compute = ( mode === 'monthly' )
                            ? computeMonthlyRankingRows( month ).then( function ( rows ) { return writeMonthlySnapshot( month, rows ); } )
                            : computeGlobalRankingRows().then( function ( rows ) { return writeGlobalSnapshot( rows ); } );
                        compute.then( function () {
                            vsNotify( '快照已刷新', { type: 'success' } );
                            location.reload();
                        } ).catch( function ( err ) {
                            refreshLink.textContent = msg( 'ranking-refresh-now' );
                            refreshLink.style.pointerEvents = '';
                            vsNotify( '刷新失败：' + err, { type: 'error' } );
                        } );
                    } );
                    controls.appendChild( refreshLink );
                }

                wrapper.appendChild( controls );

                if ( progressText ) {
                    wrapper.appendChild( el( 'div', 'voting-streaming-progress', progressText ) );
                }
            }

            var table = el( 'table', 'wikitable voting-scores-table' );
            var thead = el( 'thead' );
            var headRow = el( 'tr' );
            var heads = [ 'table-rank', 'table-page', 'table-score', 'table-votecount' ];
            for ( var h = 0; h < heads.length; h++ ) headRow.appendChild( el( 'th', null, msg( heads[ h ] ) ) );
            thead.appendChild( headRow );
            table.appendChild( thead );
            table.appendChild( el( 'tbody' ) );
            wrapper.appendChild( table );

            if ( !displayRows.length ) {
                wrapper.appendChild( el( 'p', null, msg( 'panel-details-empty' ) ) );
                wrap.appendChild( wrapper );
                return;
            }

            wrap.appendChild( wrapper );
        }

        var tbody = wrap.querySelector( '.voting-scores-table tbody' );
        if ( !tbody ) return;

        var newRows = displayRows.slice( renderedCount );
        var frag = document.createDocumentFragment();
        for ( var i = 0; i < newRows.length; i++ ) {
            ( function ( r, idx ) {
                var tr = el( 'tr' );
                tr.appendChild( el( 'td', null, idx + 1 ) );
                var pageTd = el( 'td' );
                var a = el( 'a', null, r.title );
                a.href = mw.util.getUrl( r.title );
                pageTd.appendChild( a );
                tr.appendChild( pageTd );
                tr.appendChild( el( 'td', null, r.score.toFixed( 4 ) ) );
                tr.appendChild( el( 'td', null, r.count ) );
                frag.appendChild( tr );
            } )( newRows[ i ], renderedCount + i );
        }
        tbody.appendChild( frag );
        wrap.dataset.renderedCount = String( displayRows.length );

        if ( progressText && !embedMode ) {
            var progressEl = wrap.querySelector( '.voting-streaming-progress' );
            if ( progressEl ) progressEl.textContent = progressText;
        }

        if ( !appendOnly && !embedMode && total > displayRows.length ) {
            var wrapperEl = wrap.querySelector( '.voting-scores-wrapper' );
            if ( wrapperEl ) {
                wrapperEl.appendChild( el( 'p', null,
                    msg( 'showing-partial', String( displayRows.length ), String( total ) ) ) );
            }
        }
    }

    function refreshSnapshotInBackground( reason, mode, month ) {
        var key = 'voting_snapshot_refresh_' + mode + '_' + ( month || '' ) + '_'
            + ( mw.config.get( 'wgUserName' ) || 'anon' );
        var last = parseInt( sessionStorage.getItem( key ) || '0', 10 );
        var now = nowSec();
        if ( now - last < RANKING_SNAPSHOT_DEBOUNCE ) return;
        sessionStorage.setItem( key, String( now ) );

        setTimeout( function () {
            var compute;
            if ( mode === 'monthly' ) {
                compute = computeMonthlyRankingRows( month ).then( function ( rows ) {
                    return writeMonthlySnapshot( month, rows );
                } );
            } else {
                compute = computeGlobalRankingRows().then( function ( rows ) {
                    return writeGlobalSnapshot( rows );
                } );
            }
            compute.catch( function () {} );
        }, 1500 );
    }

    function initGlobalRanking( wrap, order, limit, opts ) {
        opts = opts || {};
        wrap.innerHTML = '';
        wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-snapshot-loading' ) ) );

        return readGlobalSnapshot().then( function ( result ) {
            var now = nowSec();
            var snapshot = result.snapshot;
            var invalid = result.invalid;

            if ( snapshot && !invalid ) {
                renderRankingRows( wrap, snapshot.rows, {
                    order: order, limit: limit, ts: snapshot.ts, mode: 'global',
                    embedMode: opts.embedMode
                } );
                if ( now - snapshot.ts > RANKING_SNAPSHOT_MAX_AGE ) {
                    refreshSnapshotInBackground( 'stale-' + ( now - snapshot.ts ), 'global' );
                }
                return;
            }

            wrap.innerHTML = '';
            wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-first-calc' ) ) );

            return computeGlobalRankingRows( function ( progress ) {
                if ( progress.phase === 'info' ) {
                    var l = wrap.querySelector( '.voting-ranking-loading' );
                    if ( l ) l.textContent = '正在获取页面标题…… ' + progress.done + '/' + progress.total;
                } else if ( progress.phase === 'filter' ) {
                    if ( progress.done === progress.total || progress.done % 200 === 0 ) {
                        var l2 = wrap.querySelector( '.voting-ranking-loading' );
                        if ( l2 ) l2.textContent = '正在过滤评分根…… ' + progress.done + '/' + progress.total;
                    }
                } else if ( progress.phase === 'calc' ) {
                    var txt = '正在计算 ' + progress.done + '/' + progress.total + '，已完成 ' + progress.rows.length + ' 行';
                    renderRankingRows( wrap, progress.rows, {
                        order: order, limit: limit, ts: now, mode: 'global',
                        appendOnly: true, progressText: txt, embedMode: opts.embedMode
                    } );
                }
            } ).then( function ( rows ) {
                renderRankingRows( wrap, rows, {
                    order: order, limit: limit, ts: now, mode: 'global',
                    progressText: '计算完成，共 ' + rows.length + ' 行',
                    embedMode: opts.embedMode
                } );
                writeGlobalSnapshot( rows );
            } ).catch( function ( e ) {
                wrap.innerHTML = '';
                wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-error' ) + String( e ) ) );
            } );
        } );
    }

    function initMonthlyRanking( wrap, month, order, limit, opts ) {
        opts = opts || {};
        wrap.innerHTML = '';
        wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-snapshot-loading' ) ) );

        return readMonthlySnapshot( month ).then( function ( result ) {
            var now = nowSec();
            var snapshot = result.snapshot;
            var invalid = result.invalid;

            if ( snapshot && !invalid ) {
                renderRankingRows( wrap, snapshot.rows, {
                    order: order, limit: limit, ts: snapshot.ts, mode: 'monthly', month: month,
                    embedMode: opts.embedMode
                } );
                if ( now - snapshot.ts > RANKING_SNAPSHOT_MAX_AGE ) {
                    refreshSnapshotInBackground( 'stale-' + ( now - snapshot.ts ), 'monthly', month );
                }
                return;
            }

            wrap.innerHTML = '';
            wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-first-calc' ) ) );

            return computeMonthlyRankingRows( month, function ( progress ) {
                if ( progress.phase === 'fallback' ) {
                    if ( progress.done === progress.total || progress.done % 100 === 0 ) {
                        var l = wrap.querySelector( '.voting-ranking-loading' );
                        if ( l ) l.textContent = '正在检查当月新页面…… ' + progress.done + '/' + progress.total
                            + '，已找到 ' + progress.found + ' 个';
                    }
                } else if ( progress.phase === 'filter' ) {
                    var l2 = wrap.querySelector( '.voting-ranking-loading' );
                    if ( l2 && progress.done === progress.total ) l2.textContent = '正在过滤评分根……';
                } else if ( progress.phase === 'calc' ) {
                    var txt = '正在计算 ' + progress.done + '/' + progress.total + '，已完成 ' + progress.rows.length + ' 行';
                    renderRankingRows( wrap, progress.rows, {
                        order: order, limit: limit, ts: now, mode: 'monthly', month: month,
                        appendOnly: true, progressText: txt, embedMode: opts.embedMode
                    } );
                }
            } ).then( function ( rows ) {
                renderRankingRows( wrap, rows, {
                    order: order, limit: limit, ts: now, mode: 'monthly', month: month,
                    progressText: '计算完成，共 ' + rows.length + ' 行',
                    embedMode: opts.embedMode
                } );
                writeMonthlySnapshot( month, rows );
            } ).catch( function ( e ) {
                wrap.innerHTML = '';
                wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-error' ) + String( e ) ) );
            } );
        } );
    }

    /* ============================================================
     * 排名入口（嵌入模式绕过白名单）
     * ============================================================ */
    function initRanking() {
        var allowGlobal = isAllowed( 'globalRanking' );
        var allowMonthly = isAllowed( 'monthlyRanking' );

        var wraps = document.querySelectorAll( '.voting-ranking' );
        if ( !wraps.length ) return;

        var urlParams = new URLSearchParams( location.search );
        var urlOrder = urlParams.get( 'order' );
        var urlLimit = urlParams.get( 'limit' );

        for ( var i = 0; i < wraps.length; i++ ) {
            ( function ( wrap ) {
                if ( wrap.dataset.loaded === '1' ) return;
                var isMonthly = wrap.classList.contains( 'voting-ranking--monthly' );
                var embedMode = wrap.classList.contains( 'voting-ranking--embed' );

                /* 非嵌入模式才检查白名单 */
                if ( !embedMode ) {
                    if ( isMonthly && !allowMonthly ) return;
                    if ( !isMonthly && !allowGlobal ) return;
                }

                wrap.dataset.loaded = '1';

                var order = ( urlOrder === 'asc' || urlOrder === 'desc' ) ? urlOrder : 'desc';

                var limit = 0;
                if ( embedMode && wrap.dataset.limit ) {
                    var dl = parseInt( wrap.dataset.limit, 10 );
                    if ( dl > 0 ) limit = dl;
                } else if ( urlLimit !== null ) {
                    var n = parseInt( urlLimit, 10 );
                    if ( n > 0 ) limit = n;
                }

                var opts = { embedMode: embedMode };

                if ( isMonthly ) {
                    var month = urlParams.get( 'month' ) || new Date().toISOString().slice( 0, 7 );
                    initMonthlyRanking( wrap, month, order, limit, opts ).catch( function ( e ) {
                        wrap.innerHTML = '';
                        wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-error' ) + String( e ) ) );
                    } );
                } else {
                    initGlobalRanking( wrap, order, limit, opts ).catch( function ( e ) {
                        wrap.innerHTML = '';
                        wrap.appendChild( el( 'div', 'voting-ranking-loading', msg( 'ranking-error' ) + String( e ) ) );
                    } );
                }
            } )( wraps[ i ] );
        }
    }

    function doVote( panel, value, commentText, hideScore, messageEl ) {
        if ( !isLoggedIn() ) { vsNotify( msg( 'vote-login-required' ), { type: 'error' } ); return Promise.resolve(); }
        if ( !hasRight( 'voting' ) ) { vsNotify( msg( 'vote-autoconfirmed-required' ), { type: 'error' } ); return Promise.resolve(); }
        if ( rateLimited() ) { vsNotify( msg( 'vote-rate-limited' ), { type: 'error' } ); return Promise.resolve(); }

        var pageId = parseInt( panel.dataset.pageId, 10 );
        var rootId = panel.dataset.scoringRootId ? parseInt( panel.dataset.scoringRootId, 10 ) : pageId;
        var hasComment = commentText.trim().length > 0;

        return loadConfig().then( function ( cfg ) {
            if ( cfg.requireComment && !hasComment ) {
                vsNotify( msg( 'vote-comment-required' ), { type: 'error' } );
                return;
            }
            return computeWeight( hasComment ).then( function ( weight ) {
                var commentPromise = hasComment ? tryPostComment( pageId, commentText, value, hideScore ) : Promise.resolve( 0 );
                return commentPromise.then( function ( commentId ) {
                    var line = '<!-- V v1 u=' + mw.config.get( 'wgUserName' )
                        + ' p=' + rootId + ' v=' + value + ' w=' + weight + ' t=' + nowSec()
                        + ' h=' + ( hideScore ? 1 : 0 ) + ' c=' + commentId + ' id=' + uuid() + ' -->';
                    var summary = 'votemark:vote|' + value + '|' + weight + '|' + ( hideScore ? 1 : 0 );
                    return appendVote( line, summary ).then( function () {
                        invalidateAllRecords();
                        return purgePages( [ getDataPageTitle( 'Votes/' + isoMonth() ), mw.config.get( 'wgPageName' ) ] );
                    } ).then( function () {
                        var curMonth = isoMonth();
                        return Promise.all( [
                            markSnapshotStale( getGlobalSnapshotTitle(), 'votemark:snapshot|invalidate|global' ),
                            markSnapshotStale( getMonthlySnapshotTitle( curMonth ), 'votemark:snapshot|invalidate|monthly-' + curMonth )
                        ] );
                    } ).then( function () {
                        if ( messageEl ) {
                            messageEl.textContent = msg( 'vote-success' ) + ' ' + msg( 'vote-weight-info', weight );
                            messageEl.className = 'voting-panel-message voting-success';
                        }
                        vsNotify( msg( 'vote-success' ), { type: 'success' } );
                        setTimeout( function () { location.reload(); }, 400 );
                    } ).catch( function ( e ) {
                        var err = ( e && e.error && e.error.info ) || String( e );
                        if ( messageEl ) {
                            messageEl.textContent = err;
                            messageEl.className = 'voting-panel-message voting-error';
                        }
                        vsNotify( msg( 'vote-error' ) + ': ' + err, { type: 'error' } );
                    } );
                } );
            } );
        } );
    }

    function revokeVote( voteId, btn ) {
        if ( !confirm( msg( 'panel-details-delete-confirm' ) ) ) return;
        btn.disabled = true;
        var line = '<!-- V v1 del id=' + voteId + ' by=' + mw.config.get( 'wgUserName' ) + ' t=' + nowSec() + ' -->';
        appendVote( line, 'votemark:delete|' + voteId ).then( function () {
            invalidateAllRecords();
            return purgePages( [ getDataPageTitle( 'Votes/' + isoMonth() ) ] );
        } ).then( function () {
            var curMonth = isoMonth();
            return Promise.all( [
                markSnapshotStale( getGlobalSnapshotTitle(), 'votemark:snapshot|invalidate|global' ),
                markSnapshotStale( getMonthlySnapshotTitle( curMonth ), 'votemark:snapshot|invalidate|monthly-' + curMonth )
            ] );
        } ).then( function () {
            location.reload();
        } ).catch( function () {
            btn.disabled = false;
            vsNotify( msg( 'panel-details-delete-error' ), { type: 'error' } );
        } );
    }

    function showCommentDialog( panel, pageId, value ) {
        var exist = panel.querySelector( '.voting-comment-overlay' );
        if ( exist ) exist.parentNode.removeChild( exist );

        var overlay = el( 'div', 'voting-comment-overlay' );
        var dialog = el( 'div', 'voting-comment-dialog' );
        dialog.appendChild( el( 'div', 'voting-comment-prompt', msg( 'vote-comment-prompt' ) ) );
        dialog.appendChild( el( 'div', 'voting-comment-no-comment-hint', msg( 'vote-no-comment-hint' ) ) );

        var ta = el( 'textarea', 'voting-comment-textarea' );
        ta.rows = 4; ta.placeholder = msg( 'vote-comment-placeholder' );
        dialog.appendChild( ta );

        var hideRow = el( 'label', 'voting-comment-hide-row' );
        var hideCb = el( 'input', 'voting-comment-hide-checkbox' );
        hideCb.type = 'checkbox';
        hideRow.appendChild( hideCb );
        hideRow.appendChild( el( 'span', 'voting-comment-hide-label', msg( 'vote-hide-score' ) ) );
        dialog.appendChild( hideRow );

        var btnRow = el( 'div', 'voting-comment-buttons' );
        var submitWithComment = el( 'button', 'voting-comment-submit', msg( 'vote-submit-with-comment' ) );
        submitWithComment.type = 'button';
        var submitWithoutComment = el( 'button', 'voting-comment-skip', msg( 'vote-submit' ) );
        submitWithoutComment.type = 'button';
        var cancelBtn = el( 'button', 'voting-comment-cancel', msg( 'vote-cancel' ) );
        cancelBtn.type = 'button';
        btnRow.appendChild( submitWithComment );
        btnRow.appendChild( submitWithoutComment );
        btnRow.appendChild( cancelBtn );
        dialog.appendChild( btnRow );
        overlay.appendChild( dialog );
        panel.appendChild( overlay );

        var messageEl = panel.querySelector( '.voting-panel-message' );

        function clearActive() {
            var btns = panel.querySelectorAll( '.voting-btn' );
            for ( var i = 0; i < btns.length; i++ ) btns[ i ].classList.remove( 'voting-active' );
        }

        cancelBtn.onclick = function () { overlay.parentNode.removeChild( overlay ); clearActive(); };
        submitWithComment.onclick = function () {
            var txt = ta.value.trim();
            if ( !txt ) { ta.classList.add( 'voting-comment-error' ); ta.focus(); return; }
            overlay.parentNode.removeChild( overlay );
            doVote( panel, value, txt, hideCb.checked, messageEl );
        };
        submitWithoutComment.onclick = function () {
            overlay.parentNode.removeChild( overlay );
            doVote( panel, value, '', hideCb.checked, messageEl );
        };
        ta.addEventListener( 'keydown', function ( e ) {
            if ( e.ctrlKey && e.key === 'Enter' ) submitWithComment.click();
        } );
        ta.focus();
    }

    function tryPostComment( pageId, text, value, hideScore ) {
        var title = hideScore ? msg( 'vote-title-hidden' ) : msg( 'vote-title-score', formatScore( value ) );
        return new mw.Api().postWithToken( 'csrf', {
            action: 'cspostcomment', associatedid: pageId,
            commenttitle: title, wikitext: text, format: 'json'
        } ).then( function ( res ) {
            var obj = res.cspostcomment || {};
            return obj.id || obj.commentid || obj.commentId || 0;
        } ).catch( function () { return 0; } );
    }

    function buildBasePanel( pageId ) {
        var panel = el( 'div', 'voting-panel' );
        panel.dataset.pageId = String( pageId );
        var header = el( 'div', 'voting-panel-header' );
        header.appendChild( el( 'div', 'voting-panel-title', msg( 'panel-title' ) ) );
        header.appendChild( el( 'span', 'voting-panel-details-button-slot' ) );
        panel.appendChild( header );

        var btns = el( 'div', 'voting-panel-buttons' );
        var values = [
            { label: '-1', value: '-1' }, { label: '-0.5', value: '-0.5' },
            { label: '0', value: '0' }, { label: '+0.5', value: '0.5' }, { label: '+1', value: '1' }
        ];
        for ( var i = 0; i < values.length; i++ ) {
            var b = el( 'button', 'voting-btn', values[ i ].label );
            b.type = 'button';
            b.dataset.value = values[ i ].value;
            btns.appendChild( b );
        }
        panel.appendChild( btns );
        panel.appendChild( el( 'div', 'voting-panel-message' ) );
        var details = el( 'div', 'voting-panel-details' );
        details.style.display = 'none';
        panel.appendChild( details );
        panel.appendChild( el( 'div', 'voting-panel-login-slot' ) );
        return panel;
    }

    function enhancePanelAsync( panel, pageId, title, ns, pageName ) {
        isExcludedPage( pageName, pageId, title, ns ).then( function ( excluded ) {
            if ( excluded ) {
                if ( panel.parentNode ) panel.parentNode.removeChild( panel );
                return;
            }
            resolveScoringRoot( pageId, title, ns ).then( function ( rootId ) {
                if ( rootId !== pageId ) {
                    panel.dataset.scoringRootId = String( rootId );
                    getPageTitle( rootId ).then( function ( rootTitle ) {
                        if ( !rootTitle ) return;
                        var note = el( 'div', 'voting-panel-note' );
                        var parts = msg( 'panel-scoring-root-note', '__ROOT__' ).split( '__ROOT__' );
                        note.appendChild( document.createTextNode( parts[ 0 ] || '' ) );
                        var a = el( 'a', null, rootTitle );
                        a.href = mw.util.getUrl( rootTitle );
                        note.appendChild( a );
                        note.appendChild( document.createTextNode( parts[ 1 ] || '' ) );
                        var loginSlot = panel.querySelector( '.voting-panel-login-slot' );
                        if ( loginSlot ) panel.insertBefore( note, loginSlot );
                        else panel.appendChild( note );
                    } ).catch( function () {} );
                }
                highlightMyVote( panel, pageId );
            } ).catch( function () { highlightMyVote( panel, pageId ); } );
        } ).catch( function () { highlightMyVote( panel, pageId ); } );
    }

    function initPanels() {
        var panels = document.querySelectorAll( VOTING_PANEL_SELECTOR );
        for ( var i = 0; i < panels.length; i++ ) {
            ( function ( panel ) {
                if ( panel.dataset.bound === '1' ) return;
                panel.dataset.bound = '1';
                var pageId = parseInt( panel.dataset.pageId, 10 );
                if ( !pageId ) return;

                var buttons = panel.querySelectorAll( '.voting-btn' );
                for ( var j = 0; j < buttons.length; j++ ) {
                    ( function ( btn ) {
                        btn.addEventListener( 'click', function () {
                            for ( var k = 0; k < buttons.length; k++ ) buttons[ k ].classList.remove( 'voting-active' );
                            btn.classList.add( 'voting-active' );
                            showCommentDialog( panel, pageId, btn.dataset.value );
                        } );
                    } )( buttons[ j ] );
                }

                var slot = panel.querySelector( '.voting-panel-details-button-slot' );
                if ( slot && hasRight( 'voting-review' ) && !slot.querySelector( '.voting-panel-toggle' ) ) {
                    var t = el( 'button', 'voting-panel-toggle', msg( 'panel-details-toggle' ) );
                    t.type = 'button';
                    t.addEventListener( 'click', function () { loadDetails( panel, pageId ); } );
                    slot.appendChild( t );
                }

                if ( !isLoggedIn() ) {
                    var loginSlot = panel.querySelector( '.voting-panel-login-slot' );
                    if ( loginSlot && loginSlot.dataset.filled !== '1' ) {
                        loginSlot.dataset.filled = '1';
                        var wrap = el( 'div', 'voting-panel-login' );
                        wrap.appendChild( document.createTextNode( msg( 'panel-login' ) + ' ' ) );
                        var a = el( 'a', null, '登录' );
                        a.href = mw.util.getUrl( 'Special:Userlogin' );
                        wrap.appendChild( a );
                        loginSlot.appendChild( wrap );
                    }
                }
            } )( panels[ i ] );
        }
    }

    function highlightMyVote( panel, pageId ) {
        if ( !isLoggedIn() ) return;
        var rootId = panel.dataset.scoringRootId ? parseInt( panel.dataset.scoringRootId, 10 ) : pageId;
        var user = mw.config.get( 'wgUserName' );
        getRecordForUserPage( user, rootId ).then( function ( rec ) {
            if ( !rec ) return;
            var btns = panel.querySelectorAll( '.voting-btn' );
            for ( var i = 0; i < btns.length; i++ ) {
                if ( Math.abs( parseFloat( btns[ i ].dataset.value ) - rec.value ) < 0.01 ) {
                    btns[ i ].classList.add( 'voting-active' );
                }
            }
        } ).catch( function () {} );
    }

    function loadDetails( panel, pageId ) {
        if ( !hasRight( 'voting-review' ) ) return;
        var box = panel.querySelector( '.voting-panel-details' );
        if ( !box ) return;
        var opening = box.style.display === 'none' || box.style.display === '';
        if ( !opening ) {
            box.style.display = 'none';
            var toggle = panel.querySelector( '.voting-panel-toggle' );
            if ( toggle ) toggle.textContent = msg( 'panel-details-toggle' );
            return;
        }
        box.style.display = 'block';
        var toggleEl = panel.querySelector( '.voting-panel-toggle' );
        if ( toggleEl ) toggleEl.textContent = msg( 'panel-details-hide' );
        if ( box.dataset.loaded === '1' ) return;

        box.innerHTML = '';
        box.appendChild( el( 'div', 'voting-panel-details-loading', msg( 'panel-details-loading' ) ) );
        var rootId = panel.dataset.scoringRootId ? parseInt( panel.dataset.scoringRootId, 10 ) : pageId;
        getRecordsForPage( rootId ).then( function ( records ) {
            renderDetailsTable( box, records );
            box.dataset.loaded = '1';
            if ( hasRight( 'voting-delete' ) ) bindDeleteButtons( box );
        } ).catch( function () {
            box.innerHTML = '';
            box.appendChild( el( 'div', 'voting-panel-details-empty', msg( 'panel-details-error' ) ) );
        } );
    }

    function renderDetailsTable( box, records ) {
        box.innerHTML = '';
        if ( !records.length ) {
            box.appendChild( el( 'div', 'voting-panel-details-empty', msg( 'panel-details-empty' ) ) );
            return;
        }
        var canDelete = hasRight( 'voting-delete' );
        var table = el( 'table', 'voting-panel-details-table' );
        var thead = el( 'thead' );
        var headRow = el( 'tr' );
        var headers = [ 'user', 'value', 'weight', 'time' ];
        for ( var i = 0; i < headers.length; i++ ) headRow.appendChild( el( 'th', null, msg( 'panel-details-' + headers[ i ] ) ) );
        if ( canDelete ) headRow.appendChild( el( 'th' ) );
        thead.appendChild( headRow );
        table.appendChild( thead );
        var tbody = el( 'tbody' );
        for ( var j = 0; j < records.length; j++ ) {
            var r = records[ j ];
            var tr = el( 'tr' );
            tr.dataset.voteId = r.id;
            var userTd = el( 'td' );
            var userLink = el( 'a', null, r.user );
            userLink.href = mw.util.getUrl( 'User:' + r.user );
            userTd.appendChild( userLink );
            tr.appendChild( userTd );
            tr.appendChild( el( 'td', 'voting-details-value', formatScore( r.value ) ) );
            tr.appendChild( el( 'td', 'voting-details-weight', r.weight.toFixed( 2 ) ) );
            var time = new Date( r.timestamp * 1000 ).toISOString().slice( 0, 16 ).replace( 'T', ' ' );
            tr.appendChild( el( 'td', 'voting-details-time', time ) );
            if ( canDelete ) tr.appendChild( el( 'td' ) );
            tbody.appendChild( tr );
        }
        table.appendChild( tbody );
        box.appendChild( table );
    }

    function bindDeleteButtons( box ) {
        var rows = box.querySelectorAll( 'tr[data-vote-id]' );
        for ( var i = 0; i < rows.length; i++ ) {
            ( function ( tr ) {
                if ( tr.querySelector( '.voting-details-delete' ) ) return;
                var lastTd = tr.querySelector( 'td:last-child' );
                if ( !lastTd ) return;
                var btn = el( 'button', 'voting-details-delete', msg( 'panel-details-delete' ) );
                btn.type = 'button';
                btn.addEventListener( 'click', function () { revokeVote( tr.dataset.voteId, btn ); } );
                lastTd.appendChild( btn );
            } )( rows[ i ] );
        }
    }

    function fillPlaceholders( panel ) {
        var placeholders = document.querySelectorAll( '.' + PLACEHOLDER_CLASS );
        if ( !placeholders.length ) return false;
        var first = true;
        for ( var i = 0; i < placeholders.length; i++ ) {
            var ph = placeholders[ i ];
            if ( first && panel ) {
                var wrap = document.createElement( 'div' );
                wrap.id = ANCHOR_ID;
                wrap.appendChild( panel );
                ph.parentNode.replaceChild( wrap, ph );
                first = false;
            } else {
                ph.parentNode.removeChild( ph );
            }
        }
        return true;
    }

    function autoInjectPanel( panel ) {
        if ( !panel ) return false;
        if ( document.querySelector( VOTING_PANEL_SELECTOR ) ) return false;
        var content = document.querySelector( '.mw-parser-output' )
            || document.querySelector( '#mw-content-text' )
            || document.querySelector( '.mw-body-content' );
        if ( !content ) return false;
        var wrap = document.createElement( 'div' );
        wrap.id = ANCHOR_ID;
        wrap.appendChild( panel );
        content.appendChild( wrap );
        return true;
    }

    function dedupePanels() {
        var panels = document.querySelectorAll( VOTING_PANEL_SELECTOR );
        if ( panels.length <= 1 ) return;
        for ( var i = 1; i < panels.length; i++ ) panels[ i ].parentNode.removeChild( panels[ i ] );
    }

    function repositionPanel() {
        var anchor = document.getElementById( ANCHOR_ID );
        if ( !anchor ) return;
        var bodyContent = document.querySelector( '.mw-body-content' );
        if ( !bodyContent ) return;
        if ( anchor.parentNode === bodyContent && bodyContent.lastElementChild === anchor ) return;
        bodyContent.appendChild( anchor );
    }

    function setupPanels() {
        var ns = mw.config.get( 'wgNamespaceNumber' );
        var action = mw.config.get( 'wgAction' ) || 'view';
        var isRedirect = mw.config.get( 'wgIsRedirect' ) === true;
        var pageId = parseInt( mw.config.get( 'wgArticleId' ), 10 ) || 0;
        var title = mw.config.get( 'wgTitle' ) || '';
        var pageName = mw.config.get( 'wgPageName' ) || '';

        var hasPlaceholder = document.querySelector( '.' + PLACEHOLDER_CLASS );
        var hasPanel = document.querySelector( VOTING_PANEL_SELECTOR );
        var canAutoInject = !hasPanel && ns === 0 && action === 'view' && !isRedirect && pageId > 0;

        if ( !hasPlaceholder && !canAutoInject ) {
            if ( hasPanel ) initPanels();
            return;
        }
        if ( pageId <= 0 && hasPlaceholder ) {
            fillPlaceholders( el( 'div', 'voting-panel-error', msg( 'panel-not-saved' ) ) );
            return;
        }
        var panel = buildBasePanel( pageId );
        if ( hasPlaceholder ) fillPlaceholders( panel );
        else autoInjectPanel( panel );
        dedupePanels();
        repositionPanel();
        initPanels();
        enhancePanelAsync( panel, pageId, title, ns, pageName );
    }

    function readRewriteRequests() {
        return new mw.Api().get( {
            action: 'query', prop: 'revisions', rvprop: 'content',
            rvslots: 'main', titles: getDataPageTitle( 'RewriteRequests' ), formatversion: 2
        } ).then( function ( res ) {
            var p = res.query.pages[ 0 ];
            if ( p.missing !== undefined ) return '';
            return safeGet( p, 'revisions.0.slots.main.content' ) || '';
        } ).catch( function () { return ''; } );
    }

    function parseRewrite( content ) {
        var submits = {};
        var lines = content.split( '\n' );
        for ( var i = 0; i < lines.length; i++ ) {
            var line = lines[ i ];
            var m = line.match( /<!--\s*REWRITE:submit\|id=([\w-]+)\|page=(\d+)\|user=([^|]+)\|reason=([^|]+)\|t=(\d+)\s*-->/ );
            if ( m ) {
                submits[ m[ 1 ] ] = { id: m[ 1 ], page: +m[ 2 ], user: m[ 3 ], reason: m[ 4 ], t: +m[ 5 ], status: 0 };
                continue;
            }
            m = line.match( /<!--\s*REWRITE:update\|id=([\w-]+)\|status=([012])\|by=[^|]+\|t=(\d+)\s*-->/ );
            if ( m && submits[ m[ 1 ] ] ) {
                submits[ m[ 1 ] ].status = +m[ 2 ];
                submits[ m[ 1 ] ].reviewT = +m[ 3 ];
            }
        }
        return submits;
    }

    function initRewriteForm() {
        if ( !isAllowed( 'rewriteForm' ) ) return;
        var wrap = document.querySelector( '.rewrite-form-wrap' );
        if ( !wrap || wrap.dataset.bound === '1' ) return;
        wrap.dataset.bound = '1';
        wrap.innerHTML = '';
        wrap.appendChild( el( 'h2', null, msg( 'rewrite-title' ) ) );
        if ( !isLoggedIn() ) {
            wrap.appendChild( el( 'p', null, msg( 'rewrite-login-required' ) ) );
            return;
        }

        var form = el( 'form', 'rewrite-form' );
        var pageLabel = el( 'label', null, msg( 'rewrite-page-label' ) );
        var pageInput = el( 'input' );
        pageInput.type = 'text'; pageInput.name = 'page'; pageInput.required = true;
        pageInput.placeholder = msg( 'rewrite-page-placeholder' );
        form.appendChild( pageLabel );
        form.appendChild( pageInput );
        form.appendChild( el( 'br' ) );

        var reasonLabel = el( 'label', null, msg( 'rewrite-reason-label' ) );
        var reasonInput = el( 'textarea' );
        reasonInput.name = 'reason'; reasonInput.rows = 5; reasonInput.required = true;
        reasonInput.placeholder = msg( 'rewrite-reason-placeholder' );
        form.appendChild( reasonLabel );
        form.appendChild( reasonInput );
        form.appendChild( el( 'br' ) );

        var submitBtn = el( 'button', null, msg( 'rewrite-submit-btn' ) );
        submitBtn.type = 'submit';
        form.appendChild( submitBtn );
        wrap.appendChild( form );

        var myBox = el( 'div', 'rewrite-my-requests' );
        wrap.appendChild( myBox );

        form.addEventListener( 'submit', function ( e ) {
            e.preventDefault();
            var pageName = pageInput.value.trim();
            var reason = reasonInput.value.trim();
            if ( reason.length < 10 ) {
                vsNotify( msg( 'rewrite-reason-too-short' ), { type: 'error' } );
                return;
            }
            new mw.Api().get( { action: 'query', titles: pageName, formatversion: 2 } ).then( function ( q ) {
                var p = q.query.pages[ 0 ];
                if ( p.missing !== undefined ) { vsNotify( msg( 'rewrite-invalid-page' ), { type: 'error' } ); return; }
                if ( p.ns !== 0 ) { vsNotify( msg( 'rewrite-invalid-namespace' ), { type: 'error' } ); return; }
                return readRewriteRequests().then( function ( content ) {
                    var submits = parseRewrite( content );
                    var user = mw.config.get( 'wgUserName' );
                    for ( var id in submits ) {
                        var s = submits[ id ];
                        if ( s.page === p.pageid && s.user === user && s.status === 0 ) {
                            vsNotify( msg( 'rewrite-already-pending' ), { type: 'error' } );
                            return;
                        }
                    }
                    var newId = uuid();
                    var safeReason = reason.replace( /\|/g, ' ' ).replace( /\n/g, ' ' );
                    var line = '<!-- REWRITE:submit|id=' + newId + '|page=' + p.pageid
                        + '|user=' + user + '|reason=' + safeReason + '|t=' + nowSec() + ' -->';
                    return new mw.Api().postWithToken( 'csrf', {
                        action: 'edit', title: getDataPageTitle( 'RewriteRequests' ),
                        appendtext: '\n' + line, summary: 'votemark:rewrite|submit|' + newId
                    } ).then( function () {
                        vsNotify( msg( 'rewrite-submitted' ), { type: 'success' } );
                        form.reset();
                        loadMyRequests( myBox );
                    } ).catch( function ( err ) {
                        var info = ( err && err.error && err.error.info ) || err;
                        vsNotify( '提交失败：' + info, { type: 'error' } );
                    } );
                } );
            } );
        } );
        loadMyRequests( myBox );
    }

    function loadMyRequests( box ) {
        if ( !box ) return;
        readRewriteRequests().then( function ( content ) {
            var submits = parseRewrite( content );
            var user = mw.config.get( 'wgUserName' );
            var mine = [];
            for ( var id in submits ) if ( submits[ id ].user === user ) mine.push( submits[ id ] );
            mine.sort( function ( a, b ) { return b.t - a.t; } );
            box.innerHTML = '';
            if ( !mine.length ) return;
            var statusMsg = { 0: 'rewrite-status-pending', 1: 'rewrite-status-approved', 2: 'rewrite-status-rejected' };
            var titles = {}, uniqIds = [], seen = {};
            for ( var i = 0; i < mine.length; i++ ) if ( !seen[ mine[ i ].page ] ) { seen[ mine[ i ].page ] = true; uniqIds.push( mine[ i ].page ); }
            var fetchTitles = function ( startIdx ) {
                if ( startIdx >= uniqIds.length ) return Promise.resolve();
                var batch = uniqIds.slice( startIdx, startIdx + 50 );
                return new mw.Api().get( { action: 'query', pageids: batch.join( '|' ), formatversion: 2 } ).then( function ( res ) {
                    for ( var j = 0; j < res.query.pages.length; j++ ) titles[ +res.query.pages[ j ].pageid ] = res.query.pages[ j ].title;
                    return fetchTitles( startIdx + 50 );
                } );
            };
            fetchTitles( 0 ).then( function () {
                box.appendChild( el( 'h2', null, msg( 'rewrite-my-requests' ) ) );
                var table = el( 'table', 'wikitable' );
                var headRow = el( 'tr' );
                var heads = [ 'rewrite-table-page', 'rewrite-table-status', 'rewrite-table-time' ];
                for ( var k = 0; k < heads.length; k++ ) headRow.appendChild( el( 'th', null, msg( heads[ k ] ) ) );
                table.appendChild( headRow );
                mine.forEach( function ( s ) {
                    var t = titles[ s.page ] || ( '#' + s.page );
                    var st = msg( statusMsg[ s.status ] || 'rewrite-status-unknown' );
                    var d = new Date( s.t * 1000 ).toISOString().slice( 0, 16 ).replace( 'T', ' ' );
                    var tr = el( 'tr' );
                    tr.appendChild( el( 'td', null, t ) );
                    tr.appendChild( el( 'td', null, st ) );
                    tr.appendChild( el( 'td', null, d ) );
                    table.appendChild( tr );
                } );
                box.appendChild( table );
            } );
        } );
    }

    function initReview() {
        if ( !isAllowed( 'rewriteReview' ) ) return;
        var wrap = document.querySelector( '.rewrite-review-wrap' );
        if ( !wrap || wrap.dataset.bound === '1' ) return;
        wrap.dataset.bound = '1';
        wrap.innerHTML = '';
        wrap.appendChild( el( 'h2', null, msg( 'review-title' ) ) );
        if ( !hasRight( 'voting-review' ) ) {
            wrap.appendChild( el( 'p', null, msg( 'review-no-permission' ) ) );
            return;
        }

        var pendingSection = el( 'div', 'rewrite-pending-section' );
        var reviewedSection = el( 'div', 'rewrite-reviewed-section' );
        wrap.appendChild( pendingSection );
        wrap.appendChild( reviewedSection );

        function fetchTitles( pageIds, cb ) {
            var titles = {};
            var uniq = [], seen = {};
            for ( var i = 0; i < pageIds.length; i++ ) {
                if ( !seen[ pageIds[ i ] ] ) { seen[ pageIds[ i ] ] = true; uniq.push( pageIds[ i ] ); }
            }
            var doFetch = function ( startIdx ) {
                if ( startIdx >= uniq.length ) { cb( titles ); return; }
                var batch = uniq.slice( startIdx, startIdx + 50 );
                new mw.Api().get( {
                    action: 'query', pageids: batch.join( '|' ), formatversion: 2
                } ).then( function ( res ) {
                    for ( var j = 0; j < res.query.pages.length; j++ ) {
                        titles[ +res.query.pages[ j ].pageid ] = res.query.pages[ j ].title;
                    }
                    doFetch( startIdx + 50 );
                } ).catch( function () {
                    doFetch( startIdx + 50 );
                } );
            };
            doFetch( 0 );
        }

        function submitUpdate( id, status, actionLabel, onSuccess, onError ) {
            var line = '<!-- REWRITE:update|id=' + id + '|status=' + status
                + '|by=' + mw.config.get( 'wgUserName' ) + '|t=' + nowSec() + ' -->';
            new mw.Api().postWithToken( 'csrf', {
                action: 'edit', title: getDataPageTitle( 'RewriteRequests' ),
                appendtext: '\n' + line,
                summary: 'votemark:rewrite|' + actionLabel + '|' + id
            } ).then( function () {
                onSuccess();
            } ).catch( function ( e ) {
                var info = ( e && e.error && e.error.info ) || String( e );
                onError( info );
            } );
        }

        function rerender() {
            readRewriteRequests().then( function ( content ) {
                var submits = parseRewrite( content );
                var pending = [];
                var reviewed = [];
                for ( var id in submits ) {
                    var s = submits[ id ];
                    if ( s.status === 0 ) pending.push( s );
                    else if ( s.reviewT ) reviewed.push( s );
                }
                pending.sort( function ( a, b ) { return a.t - b.t; } );
                reviewed.sort( function ( a, b ) { return ( b.reviewT || 0 ) - ( a.reviewT || 0 ); } );
                if ( reviewed.length > 50 ) reviewed = reviewed.slice( 0, 50 );

                var allPageIds = [];
                for ( var i = 0; i < pending.length; i++ ) allPageIds.push( pending[ i ].page );
                for ( var j = 0; j < reviewed.length; j++ ) allPageIds.push( reviewed[ j ].page );

                fetchTitles( allPageIds, function ( titles ) {
                    renderPending( pending, titles );
                    renderReviewed( reviewed, titles );
                } );
            } );
        }

        function renderPending( pending, titles ) {
            pendingSection.innerHTML = '';
            pendingSection.appendChild( el( 'h3', null, '待审核（' + pending.length + '）' ) );
            if ( !pending.length ) {
                pendingSection.appendChild( el( 'p', null, msg( 'review-no-pending' ) ) );
                return;
            }
            var table = el( 'table', 'wikitable' );
            var headRow = el( 'tr' );
            var heads = [ 'review-table-page', 'review-table-user', 'review-table-reason',
                'review-table-time', 'review-table-actions' ];
            for ( var k = 0; k < heads.length; k++ ) headRow.appendChild( el( 'th', null, msg( heads[ k ] ) ) );
            table.appendChild( headRow );

            pending.forEach( function ( s ) {
                var t = titles[ s.page ] || ( '#' + s.page );
                var d = new Date( s.t * 1000 ).toISOString().slice( 0, 16 ).replace( 'T', ' ' );
                var tr = el( 'tr' );
                tr.dataset.id = s.id;
                tr.appendChild( el( 'td', null, t ) );
                tr.appendChild( el( 'td', null, s.user ) );
                tr.appendChild( el( 'td', null, s.reason ) );
                tr.appendChild( el( 'td', null, d ) );

                var actionTd = el( 'td' );
                var approveBtn = el( 'button', null, msg( 'review-approve' ) );
                approveBtn.type = 'button';
                var rejectBtn = el( 'button', null, msg( 'review-reject' ) );
                rejectBtn.type = 'button';

                approveBtn.addEventListener( 'click', function () {
                    if ( !confirm( '确定通过该申请？' ) ) return;
                    approveBtn.disabled = true;
                    rejectBtn.disabled = true;
                    submitUpdate( s.id, 1, 'approve', function () {
                        vsNotify( msg( 'review-approved' ), { type: 'success' } );
                        rerender();
                    }, function ( err ) {
                        approveBtn.disabled = false;
                        rejectBtn.disabled = false;
                        vsNotify( '失败：' + err, { type: 'error' } );
                    } );
                } );
                rejectBtn.addEventListener( 'click', function () {
                    if ( !confirm( '确定拒绝该申请？' ) ) return;
                    approveBtn.disabled = true;
                    rejectBtn.disabled = true;
                    submitUpdate( s.id, 2, 'reject', function () {
                        vsNotify( msg( 'review-rejected' ), { type: 'success' } );
                        rerender();
                    }, function ( err ) {
                        approveBtn.disabled = false;
                        rejectBtn.disabled = false;
                        vsNotify( '失败：' + err, { type: 'error' } );
                    } );
                } );

                actionTd.appendChild( approveBtn );
                actionTd.appendChild( document.createTextNode( ' ' ) );
                actionTd.appendChild( rejectBtn );
                tr.appendChild( actionTd );
                table.appendChild( tr );
            } );
            pendingSection.appendChild( table );
        }

        function renderReviewed( reviewed, titles ) {
            reviewedSection.innerHTML = '';
            if ( !reviewed.length ) return;
            reviewedSection.appendChild( el( 'h3', null,
                '最近已审核（' + reviewed.length + '，可撤销）' ) );

            var table = el( 'table', 'wikitable' );
            var headRow = el( 'tr' );
            var heads = [ 'review-table-page', 'review-table-user', 'review-table-reason',
                'review-table-time', 'review-table-actions' ];
            for ( var k = 0; k < heads.length; k++ ) headRow.appendChild( el( 'th', null, msg( heads[ k ] ) ) );
            table.appendChild( headRow );

            reviewed.forEach( function ( s ) {
                var t = titles[ s.page ] || ( '#' + s.page );
                var d = new Date( s.t * 1000 ).toISOString().slice( 0, 16 ).replace( 'T', ' ' );
                var tr = el( 'tr' );
                tr.dataset.id = s.id;
                tr.appendChild( el( 'td', null, t ) );
                tr.appendChild( el( 'td', null, s.user ) );
                tr.appendChild( el( 'td', null, s.reason ) );
                tr.appendChild( el( 'td', null, d ) );

                var actionTd = el( 'td' );
                var statusSpan = el( 'span', 'rewrite-review-status',
                    s.status === 1 ? '已通过' : '已拒绝' );
                actionTd.appendChild( statusSpan );
                actionTd.appendChild( document.createTextNode( ' ' ) );

                var undoBtn = el( 'button', null, '撤销' );
                undoBtn.type = 'button';
                undoBtn.className = 'rewrite-review-undo';
                undoBtn.addEventListener( 'click', function () {
                    if ( !confirm( '确定撤销该申请的审核？申请将回到待审核状态。' ) ) return;
                    undoBtn.disabled = true;
                    submitUpdate( s.id, 0, 'undo', function () {
                        vsNotify( '已撤销审核', { type: 'success' } );
                        rerender();
                    }, function ( err ) {
                        undoBtn.disabled = false;
                        vsNotify( '撤销失败：' + err, { type: 'error' } );
                    } );
                } );
                actionTd.appendChild( undoBtn );
                tr.appendChild( actionTd );
                table.appendChild( tr );
            } );
            reviewedSection.appendChild( table );
        }

        rerender();
    }

    function hideRCVotes() {
        var page = mw.config.get( 'wgCanonicalSpecialPageName' );
        if ( page !== 'Recentchanges' && page !== 'Watchlist' ) return;
        function clean() {
            var lines = document.querySelectorAll( '.mw-changeslist-line' );
            for ( var i = lines.length - 1; i >= 0; i-- ) {
                var el2 = lines[ i ];
                if ( el2.querySelector( '.mw-tag-marker-votemark' ) ||
                     el2.querySelector( 'a[href*="votemark"], a[href*="tag/votemark"]' ) ) {
                    el2.parentNode.removeChild( el2 );
                }
            }
        }
        clean();
        new MutationObserver( clean ).observe( document.body, { childList: true, subtree: true } );
    }

    function init() {
        try { setupPanels(); } catch ( e ) {}
        try { initRanking(); } catch ( e ) {}
        try { initRewriteForm(); } catch ( e ) {}
        try { initReview(); } catch ( e ) {}
        try { hideRCVotes(); } catch ( e ) {}
    }

    if ( document.readyState === 'loading' ) {
        document.addEventListener( 'DOMContentLoaded', init );
    } else {
        init();
    }
}

if ( typeof mw === 'undefined' ) return;
if ( typeof mw.Api === 'function' && typeof mw.util !== 'undefined' ) {
    runAll();
    return;
}
if ( typeof mw.loader === 'undefined' || typeof mw.loader.using !== 'function' ) return;
mw.loader.using( [ 'mediawiki.api', 'mediawiki.util' ] ).then( function () {
    runAll();
} ).catch( function () {} );

} )();

( function () {
    'use strict';

    var PREFIX = '编号预定';
    var DATA_PAGE = PREFIX + '/预定列表';
    var MAIN_PAGE = PREFIX;
    var POPUP_WINDOW_DAYS = 3;
    var MAX_EXTENSIONS = 3;
    var RULES_PAGE = 'The_Backrooms_Wiki:方针';

    var CACHE_KEY = 'resv-data-v1';
    var CACHE_TTL = 5 * 60 * 1000;

    var PRIVILEGED_GROUPS = [
        'sysop',
        'bureaucrat',
        'interface-admin',
        'moderator',
        'patroller',
        'rollbacker'
    ];

    var pageName = mw.config.get( 'wgPageName' );

    // ---------- 权限 ----------

    function canBookForOthers() {
        var groups = mw.config.get( 'wgUserGroups' ) || [];
        for ( var i = 0; i < PRIVILEGED_GROUPS.length; i++ ) {
            if ( groups.indexOf( PRIVILEGED_GROUPS[ i ] ) !== -1 ) return true;
        }
        return false;
    }

    // ---------- 用户名规范化 ----------

    /**
     * 统一用户名比较键：
     * - 下划线转空格（MediaWiki 用户名中两者等价）
     * - 压缩连续空格、去首尾空格
     * - 首字母大写（MediaWiki 用户名首字母不区分大小写）
     * 其余字母保持原样（MediaWiki 用户名其余部分区分大小写）
     */
    function userNameKey( name ) {
        if ( !name ) return '';
        var s = String( name )
            .replace( /_/g, ' ' )
            .replace( /\s+/g, ' ' )
            .replace( /^\s+|\s+$/g, '' );
        if ( !s ) return '';
        return s.charAt( 0 ).toUpperCase() + s.slice( 1 );
    }

    function normalizeUserName( name ) {
        return userNameKey( name );
    }

    // ---------- 工具 ----------

    function parseTable( content ) {
        var rows = [];
        var inTable = false;
        var currentRow = null;
        var lines = content.split( '\n' );
        for ( var i = 0; i < lines.length; i++ ) {
            var line = lines[ i ].replace( /^\s+|\s+$/g, '' );
            if ( line.indexOf( '{|' ) === 0 ) { inTable = true; continue; }
            if ( line.indexOf( '|}' ) === 0 ) {
                inTable = false;
                if ( currentRow ) { rows.push( currentRow ); currentRow = null; }
                continue;
            }
            if ( !inTable ) continue;
            if ( line.indexOf( '!' ) === 0 ) continue;
            if ( line.indexOf( '|+' ) === 0 ) continue;
            if ( line.indexOf( '|-' ) === 0 ) {
                if ( currentRow ) rows.push( currentRow );
                currentRow = [];
                continue;
            }
            if ( currentRow !== null && line !== '' ) {
                var parts = line.split( '||' );
                for ( var j = 0; j < parts.length; j++ ) {
                    var cell = parts[ j ].replace( /^\s+|\s+$/g, '' );
                    if ( cell !== '' ) currentRow.push( cell );
                }
            }
        }
        if ( currentRow ) rows.push( currentRow );
        return rows;
    }

    function extractPageName( cell ) {
        var m = cell.match( /\[\[([^\]|]+)/ );
        return m ? m[ 1 ] : cell;
    }

    function extractUserName( cell ) {
        var s = cell.replace( /^\s+|\s+$/g, '' );
        var m = s.match( /\[\[\s*(?:User|用户)\s*:\s*([^\]|]+)/i );
        if ( m ) return m[ 1 ].replace( /^\s+|\s+$/g, '' );
        s = s.replace( /^(?:User|用户)\s*:\s*/i, '' );
        return s.replace( /^\s+|\s+$/g, '' );
    }

    function normalizeTitle( s ) {
        try {
            return new mw.Title( s ).getPrefixedDb();
        } catch ( e ) {
            return s;
        }
    }

    function todayStr() {
        var d = new Date();
        return d.getFullYear() + '-' +
            ( '0' + ( d.getMonth() + 1 ) ).slice( -2 ) + '-' +
            ( '0' + d.getDate() ).slice( -2 );
    }

    function parseDateStr( s ) {
        var m = s.match( /(\d{4})-(\d{1,2})-(\d{1,2})/ );
        if ( !m ) return null;
        return new Date( parseInt( m[ 1 ], 10 ), parseInt( m[ 2 ], 10 ) - 1,
                         parseInt( m[ 3 ], 10 ), 12, 0, 0 );
    }

    function isEditAction() {
        var action = mw.config.get( 'wgAction' );
        if ( action === 'edit' || action === 'submit' ) return true;
        var veaction = mw.util.getParamValue( 'veaction' );
        if ( veaction === 'edit' || veaction === 'editsource' ) return true;
        return false;
    }

    function idle( fn, timeout ) {
        if ( window.requestIdleCallback ) {
            window.requestIdleCallback( fn, { timeout: timeout || 3000 } );
        } else {
            setTimeout( fn, timeout || 1500 );
        }
    }

    // ---------- 数据页读取（缓存 + 合并） ----------

    var dataPromise = null;

    function fetchDataPage() {
        return new mw.Api().get( {
            action: 'query',
            titles: DATA_PAGE,
            prop: 'revisions',
            rvprop: 'content|timestamp',
            rvslots: 'main'
        } ).then( function ( data ) {
            if ( !data.query || !data.query.pages ) {
                throw new Error( 'query-failed' );
            }
            var pages = data.query.pages;
            for ( var id in pages ) {
                var page = pages[ id ];
                if ( 'missing' in page ) {
                    return {
                        content: '{| class="wikitable"\n! 页面名 !! 用户名 !! 预定日期 !! 延期次数\n|}',
                        timestamp: null
                    };
                }
                var rev = page.revisions[ 0 ];
                return {
                    content: rev.slots.main[ '*' ],
                    timestamp: rev.timestamp
                };
            }
        } );
    }

    function readDataPage() {
        try {
            var raw = mw.storage.get( CACHE_KEY );
            if ( raw ) {
                var obj = JSON.parse( raw );
                if ( obj && obj.t && ( Date.now() - obj.t ) < CACHE_TTL &&
                     typeof obj.content === 'string' ) {
                    return Promise.resolve( {
                        content: obj.content,
                        timestamp: obj.timestamp || null
                    } );
                }
            }
        } catch ( e ) { /* 忽略缓存异常 */ }

        return fetchDataPage().then( function ( result ) {
            try {
                mw.storage.set( CACHE_KEY, JSON.stringify( {
                    t: Date.now(),
                    content: result.content,
                    timestamp: result.timestamp
                } ) );
            } catch ( e ) { /* 忽略写入异常 */ }
            return result;
        } );
    }

    function getData() {
        if ( !dataPromise ) {
            dataPromise = readDataPage();
        }
        return dataPromise;
    }

    function invalidateCache() {
        try { mw.storage.remove( CACHE_KEY ); } catch ( e ) {}
        dataPromise = null;
    }

    // ---------- 表格行操作 ----------

    function removeRowFromContent( content, fullTitle ) {
        var lines = content.split( '\n' );
        var result = [];
        var i = 0;
        var removed = false;
        var escaped = fullTitle.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
        var re = new RegExp( '\\[\\[' + escaped + '(?:\\||\\]\\])' );

        while ( i < lines.length ) {
            var line = lines[ i ];
            var trimmed = line.replace( /^\s+|\s+$/g, '' );

            if ( trimmed.indexOf( '|-' ) === 0 ) {
                var rowLines = [ line ];
                i++;
                while ( i < lines.length ) {
                    var t = lines[ i ].replace( /^\s+|\s+$/g, '' );
                    if ( t.indexOf( '|-' ) === 0 || t.indexOf( '|}' ) === 0 ) break;
                    rowLines.push( lines[ i ] );
                    i++;
                }
                var rowText = rowLines.join( '\n' );
                if ( !removed && re.test( rowText ) ) {
                    removed = true;
                } else {
                    result = result.concat( rowLines );
                }
            } else {
                result.push( line );
                i++;
            }
        }

        return removed ? result.join( '\n' ) : null;
    }

    function updateExtensionInContent( content, fullTitle ) {
        var lines = content.split( '\n' );
        var result = [];
        var i = 0;
        var found = false;
        var escaped = fullTitle.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
        var re = new RegExp( '\\[\\[' + escaped + '(?:\\||\\]\\])' );

        while ( i < lines.length ) {
            var line = lines[ i ];
            var trimmed = line.replace( /^\s+|\s+$/g, '' );

            if ( trimmed.indexOf( '|-' ) === 0 ) {
                var rowLines = [ line ];
                i++;
                while ( i < lines.length ) {
                    var t = lines[ i ].replace( /^\s+|\s+$/g, '' );
                    if ( t.indexOf( '|-' ) === 0 || t.indexOf( '|}' ) === 0 ) break;
                    rowLines.push( lines[ i ] );
                    i++;
                }
                var rowText = rowLines.join( '\n' );
                if ( !found && re.test( rowText ) ) {
                    found = true;
                    var newRowText = rowText.replace( /(\|\|)\s*(\d+)(\s*)$/m, function ( m, p1, p2, p3 ) {
                        return p1 + ' ' + ( parseInt( p2, 10 ) + 1 ) + p3;
                    } );
                    result.push( newRowText );
                } else {
                    result.push( rowText );
                }
            } else {
                result.push( line );
                i++;
            }
        }

        return found ? result.join( '\n' ) : null;
    }

    // ---------- 主页面：表单 ----------

    function initForm() {
        var container = document.getElementById( 'reservation-form' );
        if ( !container ) {
            container = document.createElement( 'div' );
            container.id = 'reservation-form';
            var content = document.getElementById( 'mw-content-text' );
            if ( content ) content.insertBefore( container, content.firstChild );
        }

        var privileged = canBookForOthers();

        var ownerFieldHtml = privileged
            ? '<div class="resv-field">' +
              '<label for="resv-owner">预定者</label>' +
              '<input class="resv-input" id="resv-owner" type="text" placeholder="留空则为自己预定" />' +
              '</div>'
            : '';

        container.innerHTML =
            '<div class="resv-form">' +
            '<div class="resv-form-title">新增预定</div>' +
            '<div class="resv-field">' +
            '<label for="resv-input">页面名称</label>' +
            '<input class="resv-input" id="resv-input" type="text" placeholder="输入主命名空间页面名，例如 Level CN 11" />' +
            '</div>' +
            ownerFieldHtml +
            '<button class="resv-btn" id="resv-submit" type="button">提交预定</button>' +
            '<div class="resv-status" id="resv-status"></div>' +
            '</div>';

        document.getElementById( 'resv-submit' ).addEventListener( 'click', doSubmit );
        document.getElementById( 'resv-input' ).addEventListener( 'keydown', function ( e ) {
            if ( e.key === 'Enter' ) doSubmit();
        } );

        var ownerInputEl = document.getElementById( 'resv-owner' );
        if ( ownerInputEl ) {
            ownerInputEl.addEventListener( 'keydown', function ( e ) {
                if ( e.key === 'Enter' ) doSubmit();
            } );
        }
    }

    function doSubmit() {
        var input = document.getElementById( 'resv-input' );
        var ownerInput = document.getElementById( 'resv-owner' );
        var status = document.getElementById( 'resv-status' );
        var shortName = input.value.replace( /^\s+|\s+$/g, '' );
        var currentUser = mw.config.get( 'wgUserName' );

        if ( !shortName ) { status.textContent = '请输入页面名称。'; return; }
        if ( !currentUser ) { status.textContent = '请先登录。'; return; }

        var fullTitle = normalizeTitle( shortName );

        if ( fullTitle === normalizeTitle( MAIN_PAGE ) ||
             fullTitle === normalizeTitle( DATA_PAGE ) ) {
            status.textContent = '此名称为系统保留，请换一个。';
            return;
        }

        var ownerRaw = '';
        if ( canBookForOthers() && ownerInput ) {
            ownerRaw = ownerInput.value.replace( /^\s+|\s+$/g, '' );
        }

        var owner = normalizeUserName( ownerRaw || currentUser );
        var ownerCell = '[[User:' + owner + '|' + owner + ']]';

        status.textContent = '正在检查页面...';

        new mw.Api().get( {
            action: 'query',
            titles: fullTitle,
            prop: 'info'
        } ).then( function ( data ) {
            if ( !data.query || !data.query.pages ) {
                throw new Error( 'query-failed' );
            }
            var pages = data.query.pages;
            var exists = false;
            for ( var id in pages ) {
                if ( !( 'missing' in pages[ id ] ) ) exists = true;
            }
            if ( exists ) {
                status.textContent = '此页面已有文章，请换编号。';
                return null;
            }

            status.textContent = '正在写入预定...';

            return new mw.Api().edit( DATA_PAGE, function ( revision ) {
                var content = revision.content;
                var rows = parseTable( content );
                for ( var i = 0; i < rows.length; i++ ) {
                    if ( rows[ i ].length >= 1 && normalizeTitle( extractPageName( rows[ i ][ 0 ] ) ) === fullTitle ) {
                        throw new Error( 'already-reserved' );
                    }
                }
                var newRow = '|-\n| [[' + fullTitle + ']] || ' + ownerCell + ' || ' + todayStr() + ' || 0';
                var idx = content.lastIndexOf( '|}' );
                if ( idx === -1 ) throw new Error( 'data-page-broken' );
                var newContent = content.substring( 0, idx ) + newRow + '\n' + content.substring( idx );
                return {
                    text: newContent,
                    summary: '新增预定：' + fullTitle + '（预定者：' + owner + '）',
                    basetimestamp: revision.timestamp
                };
            } ).then( function () {
                invalidateCache();
                status.textContent = '预定成功：' + fullTitle + '（预定者：' + owner + '）';
                input.value = '';
                if ( ownerInput ) ownerInput.value = '';
                setTimeout( function () { location.reload(); }, 600 );
            } );
        } ).catch( function ( error ) {
            var msg = ( error && error.message ) ? error.message : String( error );
            if ( msg === 'already-reserved' ) {
                status.textContent = '此页面已被预定。';
            } else if ( msg === 'editconflict' ) {
                status.textContent = '提交失败：其他人刚刚编辑了预定列表，请稍后重试。';
            } else if ( msg === 'data-page-broken' ) {
                status.textContent = '提交失败：数据页面表格结构异常。';
            } else if ( msg === 'query-failed' ) {
                status.textContent = '提交失败：查询页面状态失败，请稍后重试。';
            } else {
                status.textContent = '提交失败：' + msg;
            }
        } );
    }

    // ---------- 目标页面：查看页注入提示 / 完成删行 ----------

    function findNoticeSlot() {
        var custom = document.getElementById( 'resv-notice-slot' );
        if ( custom && custom.parentNode ) {
            return { mode: 'before', el: custom };
        }

        var contentSub = document.getElementById( 'contentSub' );
        if ( contentSub && contentSub.parentNode ) {
            return { mode: 'after', el: contentSub };
        }

        var indicators = document.getElementById( 'mw-indicators' );
        if ( indicators && indicators.parentNode ) {
            return { mode: 'after', el: indicators };
        }

        var content = document.getElementById( 'mw-content-text' );
        if ( content ) {
            var parserOutput = content.querySelector( '.mw-parser-output' );
            return { mode: 'prepend', el: parserOutput || content };
        }

        return null;
    }

    function injectNotice( text, variant ) {
        var slot = findNoticeSlot();
        if ( !slot ) return;

        var notice = document.createElement( 'div' );
        notice.className = 'resv-notice' + ( variant === 'success' ? ' resv-notice--success' : '' );
        notice.textContent = text;

        if ( slot.mode === 'before' ) {
            slot.el.parentNode.insertBefore( notice, slot.el );
        } else if ( slot.mode === 'after' ) {
            slot.el.parentNode.insertBefore( notice, slot.el.nextSibling );
        } else {
            slot.el.insertBefore( notice, slot.el.firstChild );
        }
    }

    function removeRowAndNotify() {
        new mw.Api().edit( DATA_PAGE, function ( revision ) {
            var newContent = removeRowFromContent( revision.content, pageName );
            if ( newContent === null ) throw new Error( 'row-not-found' );
            return {
                text: newContent,
                summary: '投稿完成，移除预定：' + pageName,
                basetimestamp: revision.timestamp
            };
        } ).then( function () {
            invalidateCache();
            injectNotice( '预定已完成，预定列表中的对应行已移除。', 'success' );
        } ).catch( function () {} );
    }

    function initNotice() {
        if ( pageName === MAIN_PAGE || pageName === DATA_PAGE ) return;

        getData().then( function ( data ) {
            if ( !data || !data.content ) return;
            var rows = parseTable( data.content );
            var targetTitle = normalizeTitle( pageName );
            var currentUser = mw.config.get( 'wgUserName' );
            var pageExists = mw.config.get( 'wgArticleId' ) > 0;

            for ( var i = 0; i < rows.length; i++ ) {
                if ( rows[ i ].length < 2 ) continue;
                if ( normalizeTitle( extractPageName( rows[ i ][ 0 ] ) ) !== targetTitle ) continue;

                var owner = extractUserName( rows[ i ][ 1 ] );

                if ( pageExists && currentUser &&
                     userNameKey( currentUser ) === userNameKey( owner ) ) {
                    removeRowAndNotify();
                    return;
                }
                if ( pageExists ) {
                    injectNotice( '此页面已被 ' + owner + ' 预定，但已被他人填充，待管理员处理。' );
                    return;
                }
                injectNotice( '此页面已被 ' + owner + ' 预定，请勿编辑或移动文章至此。' );
                return;
            }
        } ).catch( function () {} );
    }

    // ---------- 编辑页拦截遮罩 ----------

    function blockEditing( owner ) {
        var content = document.getElementById( 'mw-content-text' );
        if ( content ) content.style.display = 'none';

        var selectors = [
            '#editform', '#wpTextbox1',
            '.ve-init-mw-desktopArticleTarget',
            '.ve-ui-surface', '.ve-ui-toolbar', '.mw-editform'
        ];
        for ( var s = 0; s < selectors.length; s++ ) {
            var els = document.querySelectorAll( selectors[ s ] );
            for ( var k = 0; k < els.length; k++ ) {
                els[ k ].style.display = 'none';
            }
        }

        var overlay = document.createElement( 'div' );
        overlay.className = 'resv-overlay';

        var card = document.createElement( 'div' );
        card.className = 'resv-block-card';

        var title = document.createElement( 'div' );
        title.className = 'resv-block-title';
        title.textContent = '无权编辑';

        var msg = document.createElement( 'div' );
        msg.className = 'resv-block-msg';
        msg.innerHTML =
            '此页面已被 <strong>' + mw.html.escape( owner ) + '</strong> 预定。<br>' +
            '若要写文章请选择其它编号，请确保自己遵守' +
            '<a href="' + mw.util.getUrl( RULES_PAGE ) + '" target="_blank">' +
            mw.html.escape( RULES_PAGE ) + '</a>。';

        var back = document.createElement( 'a' );
        back.className = 'resv-block-back';
        back.href = mw.util.getUrl( pageName );
        back.textContent = '返回页面';

        card.appendChild( title );
        card.appendChild( msg );
        card.appendChild( back );
        overlay.appendChild( card );
        document.body.appendChild( overlay );
    }

    function initEditGuard() {
        if ( pageName === MAIN_PAGE || pageName === DATA_PAGE ) return;
        if ( !isEditAction() ) return;

        getData().then( function ( data ) {
            if ( !data || !data.content ) return;
            var rows = parseTable( data.content );
            var targetTitle = normalizeTitle( pageName );
            var currentUser = mw.config.get( 'wgUserName' );

            for ( var i = 0; i < rows.length; i++ ) {
                if ( rows[ i ].length < 2 ) continue;
                if ( normalizeTitle( extractPageName( rows[ i ][ 0 ] ) ) !== targetTitle ) continue;
                var owner = extractUserName( rows[ i ][ 1 ] );
                if ( !currentUser ||
                     userNameKey( currentUser ) !== userNameKey( owner ) ) {
                    blockEditing( owner );
                }
                return;
            }
        } ).catch( function () {} );
    }

    // ---------- 临期弹窗 ----------

    var popupQueue = [];
    var popupActive = false;

    function enqueuePopup( p ) {
        popupQueue.push( p );
        if ( !popupActive ) showNextPopup();
    }

    function showNextPopup() {
        if ( popupQueue.length === 0 ) { popupActive = false; return; }
        popupActive = true;
        var p = popupQueue.shift();
        showPopup( p, function () {
            showNextPopup();
        } );
    }

    function storageKey( pageFullName, ext ) {
        return 'resv-popup:' + pageFullName + ':' + ext;
    }

    function doExtend( pageFullName, onDone ) {
        new mw.Api().edit( DATA_PAGE, function ( revision ) {
            var newContent = updateExtensionInContent( revision.content, pageFullName );
            if ( newContent === null ) throw new Error( 'row-not-found' );
            return {
                text: newContent,
                summary: '延期预定：' + pageFullName,
                basetimestamp: revision.timestamp
            };
        } ).then( function () {
            invalidateCache();
            onDone( true );
        } ).catch( function () {
            onDone( false );
        } );
    }

    function doCancel( pageFullName, onDone ) {
        new mw.Api().edit( DATA_PAGE, function ( revision ) {
            var newContent = removeRowFromContent( revision.content, pageFullName );
            if ( newContent === null ) throw new Error( 'row-not-found' );
            return {
                text: newContent,
                summary: '取消预定：' + pageFullName,
                basetimestamp: revision.timestamp
            };
        } ).then( function () {
            invalidateCache();
            onDone( true );
        } ).catch( function () {
            onDone( false );
        } );
    }

    function showPopup( p, onClose ) {
        var overlay = document.createElement( 'div' );
        overlay.className = 'resv-popup-overlay';

        var box = document.createElement( 'div' );
        box.className = 'resv-popup';

        if ( p.pure ) {
            var closeBtn = document.createElement( 'button' );
            closeBtn.className = 'resv-popup-close';
            closeBtn.textContent = '×';
            closeBtn.addEventListener( 'click', function () {
                mw.storage.set( storageKey( p.pageFullName, p.extensions ), '1' );
                document.body.removeChild( overlay );
                onClose();
            } );
            box.appendChild( closeBtn );
        }

        var title = document.createElement( 'h3' );
        title.className = 'resv-popup-title';
        title.textContent = p.pure ? '预定即将结束' : '预定即将到期';
        box.appendChild( title );

        var info = document.createElement( 'div' );
        info.className = 'resv-popup-info';
        var pageUrl = mw.util.getUrl( p.pageFullName );
        info.innerHTML =
            '页面：<a href="' + pageUrl + '" target="_blank">' +
            mw.html.escape( p.pageFullName ) + '</a><br>' +
            '剩余天数：<span class="resv-remain">' + p.remainDays + ' 天</span><br>' +
            '已延期次数：' + p.extensions + ' / ' + MAX_EXTENSIONS;
        box.appendChild( info );

        if ( p.pure ) {
            var tip = document.createElement( 'p' );
            tip.className = 'resv-popup-tip';
            tip.textContent = '你的文章即将失去预定，请尽快完成投稿。';
            box.appendChild( tip );
        } else {
            var actions = document.createElement( 'div' );
            actions.className = 'resv-popup-actions';

            var extendBtn = document.createElement( 'button' );
            extendBtn.className = 'resv-btn';
            extendBtn.textContent = '确认延期';
            extendBtn.addEventListener( 'click', function () {
                extendBtn.disabled = true;
                extendBtn.textContent = '处理中...';
                doExtend( p.pageFullName, function ( ok ) {
                    if ( ok ) mw.storage.set( storageKey( p.pageFullName, p.extensions ), '1' );
                    document.body.removeChild( overlay );
                    onClose();
                } );
            } );
            actions.appendChild( extendBtn );

            var cancelBtn = document.createElement( 'button' );
            cancelBtn.className = 'resv-btn resv-btn--danger';
            cancelBtn.textContent = '取消预定';
            cancelBtn.addEventListener( 'click', function () {
                if ( !confirm( '确定取消预定吗？此操作会删除预定列表中的行。' ) ) return;
                cancelBtn.disabled = true;
                cancelBtn.textContent = '处理中...';
                doCancel( p.pageFullName, function ( ok ) {
                    if ( ok ) mw.storage.set( storageKey( p.pageFullName, p.extensions ), '1' );
                    document.body.removeChild( overlay );
                    onClose();
                } );
            } );
            actions.appendChild( cancelBtn );

            box.appendChild( actions );
        }

        overlay.appendChild( box );
        document.body.appendChild( overlay );
    }

    function checkPopups() {
        if ( !mw.config.get( 'wgUserName' ) ) return;

        getData().then( function ( data ) {
            if ( !data || !data.content ) return;
            var rows = parseTable( data.content );
            var currentUser = mw.config.get( 'wgUserName' );
            var today = new Date();
            today.setHours( 12, 0, 0, 0 );

            for ( var i = 0; i < rows.length; i++ ) {
                if ( rows[ i ].length < 4 ) continue;
                var pageFullName = extractPageName( rows[ i ][ 0 ] );
                var owner = extractUserName( rows[ i ][ 1 ] );
                if ( userNameKey( owner ) !== userNameKey( currentUser ) ) continue;

                var reservedDate = parseDateStr( rows[ i ][ 2 ] );
                if ( !reservedDate ) continue;

                var extensions = parseInt( rows[ i ][ 3 ], 10 ) || 0;
                var deadline = new Date( reservedDate.getTime() + ( 30 * ( extensions + 1 ) ) * 86400000 );
                var remainDays = Math.ceil( ( deadline - today ) / 86400000 );

                if ( remainDays > POPUP_WINDOW_DAYS || remainDays < 0 ) continue;

                var key = storageKey( pageFullName, extensions );
                if ( mw.storage.get( key ) ) continue;

                enqueuePopup( {
                    pageFullName: pageFullName,
                    extensions: extensions,
                    remainDays: remainDays,
                    pure: extensions >= MAX_EXTENSIONS
                } );
            }
        } ).catch( function () {} );
    }

    function initPopupCheck() {
        if ( !mw.config.get( 'wgUserName' ) ) return;
        if ( mw.config.get( 'wgAction' ) !== 'view' ) return;
        idle( checkPopups, 2000 );
    }

    // ---------- 入口 ----------

    $( function () {
        if ( pageName === MAIN_PAGE ) {
            initForm();
        } else if ( pageName !== DATA_PAGE ) {
            if ( isEditAction() ) {
                idle( initEditGuard, 200 );
            } else {
                idle( initNotice, 200 );
            }
        }
        initPopupCheck();
    } );

} )();

/* ============================================================
 * 表单编辑器 for MediaWiki
 * 小工具：formEditor
 *
 * 用法：
 *   1. 访问 ?action=edit&editor=form 进入表单模式（接管原生编辑表单）
 *   2. 或脚本调用：
 *        mw.formEditor.mount( 容器 )            // 显式嵌入
 *        mw.formEditor.buildWikitext( ... )     // 纯函数生成
 *        mw.formEditor.fetchOrgTemplates()      // 检索组织版式
 *
 * 设计要点：
 *   - 与 mw.novelEditor 同构：URL 参数驱动 + 接管 #editform
 *   - 不再依赖 {{文章模板}}：直接把 includeonly 分支平铺为正文
 *   - 组织版式从 Category:组织版式 检索，默认 Template:M.E.G.S.K.
 *   - 保存走原生 form.submit()，wpSave 补丁 + dispatch submit 两遍写
 *   - 不输出 {{Redirect}} / {{Author}} / 任何分类
 *   - 整个表单是一个编辑区域（单一 paper），保存按钮在底部
 *   - textarea 里的单换行自动展开为双换行（段落分隔）
 *   - 组织版式 / DISPLAYTITLE / 类别首句 三行紧凑，不留空行
 * ============================================================ */
( function () {
    'use strict';

    var ACTION = mw.config.get( 'wgAction' );
    var PAGE   = mw.config.get( 'wgPageName' );

    /* ==========================================================
     * 常量与配置
     * ========================================================== */
    var ORG_CATEGORY  = 'Category:组织版式';
    var DEFAULT_ORG   = 'Template:M.E.G.S.K.';
    var TEMPLATE_NS   = 10;
    var DRAFT_PREFIX  = 'formEditor:draft:v6:';

    /* 类别顺序 */
    var CATEGORY_ORDER = [ '物品', '效应', '实体', '层级', '特殊层级' ];

    /* 每类独有字段 */
    var CATEGORY_FIELDS = {
        '物品': [
            { key: '描述',     label: '描述',     type: 'textarea', rows: 6, required: true },
            { key: '性质',     label: '性质',     type: 'textarea', rows: 4, required: true },
            { key: '获取方式', label: '获取方式', type: 'textarea', rows: 4, required: true }
        ],
        '效应': [
            { key: '描述',     label: '描述',     type: 'textarea', rows: 6, required: true },
            { key: '影响',     label: '影响',     type: 'textarea', rows: 4, required: true },
            { key: '应对措施', label: '应对措施', type: 'textarea', rows: 4, required: true }
        ],
        '实体': [
            { key: '描述',       label: '描述',       type: 'textarea', rows: 6, required: true },
            { key: '生物学特征', label: '生物学特征', type: 'textarea', rows: 4, required: true },
            { key: '行为准则',   label: '行为准则',   type: 'textarea', rows: 4, required: true },
            { key: '栖息地',     label: '栖息地',     type: 'textarea', rows: 4, required: true },
            { key: '应对措施',   label: '应对措施',   type: 'textarea', rows: 4, required: true }
        ],
        '层级': [
            { key: '生存难度',   label: '生存难度',   type: 'select',
              options: [ '宜居', '0', '1', '2', '3', '4', '5', '死区' ],
              default: '0', required: true },
            { key: '描述',       label: '描述',       type: 'textarea', rows: 6, required: true },
            { key: '实体描述',   label: '实体描述',   type: 'textarea', rows: 4, required: true },
            { key: '入口描述',   label: '入口描述',   type: 'textarea', rows: 4, required: true },
            { key: '出口描述',   label: '出口描述',   type: 'textarea', rows: 4, required: true }
        ],
        '特殊层级': [
            { key: '生存难度',   label: '生存难度',   type: 'select',
              options: [ '宜居', '0', '1', '2', '3', '4', '5', '死区' ],
              default: '0', required: true },
            { key: '描述',       label: '描述',       type: 'textarea', rows: 6, required: true },
            { key: '实体描述',   label: '实体描述',   type: 'textarea', rows: 4, required: true },
            { key: '入口描述',   label: '入口描述',   type: 'textarea', rows: 4, required: true },
            { key: '出口描述',   label: '出口描述',   type: 'textarea', rows: 4, required: true }
        ]
    };

    /* 各类别的 DISPLAYTITLE 前缀 */
    var CATEGORY_META = {
        '物品':    { prefix: 'Object CN ' },
        '效应':    { prefix: 'Phenomenon CN ' },
        '实体':    { prefix: 'Entity CN ' },
        '层级':    { prefix: 'Level CN ' },
        '特殊层级': { prefix: '' }
    };

    /* Level Class 模板（照抄原文章模板 includeonly） */
    var LEVEL_CLASSES = {
        '宜居': '{{Level Class|background_color=linear-gradient(to right, #005100 0%, #00e700 40%)|class=宜居|safety=安全|security=宜居聚居地|entity=实体绝迹|sd_color=#FFFFFF|bullet_color=#002000|border_color=#005100}}',
        '0':    '{{Level Class|background_color=linear-gradient(to right, #875100 0%, #eae768 40%)|class=0|safety=安全|security=稳定|entity=实体绝迹|bullet_color=#000000|border_color=black}}',
        '1':    '{{Level Class|class=1|safety=安全|security=稳定|entity=少量实体|background_color=linear-gradient(to right, #f9e79f 30%, #f4f6f7)|border_color=#17202a|bullet_color=#212f3d}}',
        '2':    '{{Level Class|class=2|1=不安全|2=稳定|3=少量实体|background_color=linear-gradient(to right, #874800 0%, #c49102 40%)|sd_color=#FFFFFF|bullet_color=#874800|border_color=#874800}}',
        '3':    '{{Level Class|class=3|safety=不安全|security=不稳定|entity=中量实体|background_color=linear-gradient(to right, #6e2e00 0%, #c25100 40%)|border_color=#6e2e00|sd_color=#FFFFFF|bullet_color=#6e2e00}}',
        '4':    '{{Level Class|class=4|safety=不安全|security=不稳定|entity=大量实体|background_color=linear-gradient(to right, #7A1912 0%, #EE1601 40%)|border_color=#7A1912|sd_color=#FFFFFF|bullet_color=#7A1912}}',
        '5':    '{{Level Class|background_color=linear-gradient(to right, #560602 0%, #AC0A02 90%)|border_color=#e60000 |sd_color=#FFFFFF |image=C_5.svg|class=5|bullet_color=#AA6000|safety=不安全|security=不稳定|entity=实体横行}}',
        '死区': '{{Level Class|background_color=linear-gradient(to right, #571A19 40%, #2A0B0A 50%)|border_color=#571A19 |sd_color=#FFFFFF |class=死区|bullet_color=#571A19|safety=不安全且不稳定|security=不适宜生命存在|entity=潜在的异常实体}}'
    };

    /* ==========================================================
     * MediaWiki API
     * ========================================================== */
    var apiReady = null;

    function ensureApi() {
        if ( apiReady ) return apiReady;

        apiReady = new Promise( function ( resolve, reject ) {
            if ( !window.mw || !mw.loader || !mw.loader.using ) {
                reject( new Error( 'MediaWiki API 不可用' ) );
                return;
            }
            mw.loader.using( [ 'mediawiki.api', 'jquery' ] ).then(
                function () { resolve(); },
                function ( err ) { reject( err ); }
            );
        } );

        apiReady.catch( function () { apiReady = null; } );
        return apiReady;
    }

    /* 检索 Category:组织版式 里的模板 */
    function fetchOrgTemplates() {
        return ensureApi().then( function () {
            return new mw.Api().get( {
                action: 'query',
                list: 'categorymembers',
                cmtitle: ORG_CATEGORY,
                cmnamespace: TEMPLATE_NS,
                cmlimit: 'max',
                format: 'json',
                formatversion: 2
            } );
        } ).then( function ( res ) {
            var members = ( res && res.query && res.query.categorymembers ) || [];
            return members.map( function ( m ) {
                return { title: m.title, pageid: m.pageid };
            } );
        } );
    }

    /* 读取模板的 templatedata 参数 */
    function fetchTemplateParams( title ) {
        return ensureApi().then( function () {
            return new mw.Api().get( {
                action: 'templatedata',
                titles: title,
                format: 'json',
                formatversion: 2
            } );
        } ).then( function ( res ) {
            var pages = ( res && res.pages ) || {};
            var page = null;

            for ( var k in pages ) {
                if ( Object.prototype.hasOwnProperty.call( pages, k ) &&
                     pages[ k ] && pages[ k ].title === title ) {
                    page = pages[ k ];
                    break;
                }
            }

            if ( !page || !page.params ) return [];

            var params = page.params;
            var order = page.paramOrder ? page.paramOrder.map( String ) : [];

            Object.keys( params ).forEach( function ( key ) {
                if ( order.indexOf( key ) === -1 ) order.push( key );
            } );

            return order.map( function ( key ) {
                var p = params[ key ];
                if ( !p ) return null;
                return {
                    key: key,
                    label: typeof p.label === 'string' ? p.label : key,
                    description: typeof p.description === 'string' ? p.description : '',
                    default: typeof p.default === 'string' ? p.default : '',
                    required: !!p.required,
                    example: typeof p.example === 'string' ? p.example : '',
                    type: p.type || 'string'
                };
            } ).filter( Boolean );
        } );
    }

    /* ==========================================================
     * 通用工具
     * ========================================================== */
    /* 段落字段：一个换行 → 一个空行（\n\n），多个换行压缩为一个空行 */
    function v( values, key, fallback ) {
        var val = values[ key ];
        if ( val == null || String( val ).trim() === '' ) {
            return fallback == null ? '不知道' : fallback;
        }
        return String( val )
            .replace( /\r\n?/g, '\n' )
            .replace( /\n+/g, '\n\n' );
    }

    /* 单行字段：清掉所有换行和多余空白（用于 DISPLAYTITLE / 首句） */
    function vInline( values, key, fallback ) {
        var val = values[ key ];
        if ( val == null || String( val ).trim() === '' ) {
            return fallback == null ? '不知道' : fallback;
        }
        return String( val ).replace( /\s+/g, ' ' ).trim();
    }

    function buildOrgInvocation( org, orgParams ) {
        if ( !org ) return '';

        var name = org;
        if ( name.indexOf( 'Template:' ) === 0 ) {
            name = name.slice( 'Template:'.length );
        }

        var pairs = [];
        if ( orgParams ) {
            Object.keys( orgParams ).forEach( function ( key ) {
                var value = orgParams[ key ];
                if ( value == null || String( value ).trim() === '' ) return;
                pairs.push( key + '=' + String( value ) );
            } );
        }

        return pairs.length
            ? '{{' + name + '|' + pairs.join( '|' ) + '}}'
            : '{{' + name + '}}';
    }

    function appendSection( lines, title, content ) {
        lines.push( '<h2>' + title + '</h2>' );
        lines.push( '' );
        lines.push( content );
        lines.push( '' );
    }

    function buildDisplayTitle( category, values ) {
        var meta = CATEGORY_META[ category ];
        return '{{DISPLAYTITLE:' + meta.prefix +
            vInline( values, '编号' ) + ' - “' + vInline( values, '名称' ) + '”}}';
    }

    /* 按顶层分隔符拆分，保护 {{...}} 与 [[...]] */
    function splitTopLevel( text, delimiter ) {
        var parts = [];
        var buf = '';
        var curly = 0;
        var square = 0;

        for ( var i = 0; i < text.length; i++ ) {
            var ch = text.charAt( i );
            var next = text.charAt( i + 1 );

            if ( ch === '{' && next === '{' ) {
                curly++; buf += '{{'; i++;
            } else if ( ch === '}' && next === '}' && curly > 0 ) {
                curly--; buf += '}}'; i++;
            } else if ( ch === '[' && next === '[' ) {
                square++; buf += '[['; i++;
            } else if ( ch === ']' && next === ']' && square > 0 ) {
                square--; buf += ']]'; i++;
            } else if ( ch === delimiter && curly === 0 && square === 0 ) {
                parts.push( buf );
                buf = '';
            } else {
                buf += ch;
            }
        }

        parts.push( buf );
        return parts;
    }

    function findTopLevelEquals( text ) {
        var curly = 0;
        var square = 0;

        for ( var i = 0; i < text.length; i++ ) {
            var ch = text.charAt( i );
            var next = text.charAt( i + 1 );

            if ( ch === '{' && next === '{' ) {
                curly++; i++;
            } else if ( ch === '}' && next === '}' && curly > 0 ) {
                curly--; i++;
            } else if ( ch === '[' && next === '[' ) {
                square++; i++;
            } else if ( ch === ']' && next === ']' && square > 0 ) {
                square--; i++;
            } else if ( ch === '=' && curly === 0 && square === 0 ) {
                return i;
            }
        }

        return -1;
    }

    function findTemplateEnd( text, start ) {
        var depth = 0;

        for ( var i = start; i < text.length - 1; i++ ) {
            if ( text.charAt( i ) === '{' && text.charAt( i + 1 ) === '{' ) {
                depth++; i++;
            } else if ( text.charAt( i ) === '}' && text.charAt( i + 1 ) === '}' ) {
                depth--; i++;
                if ( depth === 0 ) return i + 1;
            }
        }

        return -1;
    }

    /* 从已有 wikitext 里解析 {{文章模板|...}} 的参数（用于预填） */
    function parseArticleTemplate( wikitext ) {
        var text = String( wikitext == null ? '' : wikitext ).replace( /\r\n?/g, '\n' );
        var i = 0;

        while ( i < text.length ) {
            var start = text.indexOf( '{{', i );
            if ( start === -1 ) break;

            var end = findTemplateEnd( text, start );
            if ( end === -1 ) break;

            var inner = text.slice( start + 2, end - 2 );
            var parts = splitTopLevel( inner, '|' );
            var name = ( parts.shift() || '' ).trim();

            if ( name === '文章模板' || name === 'Template:文章模板' ) {
                var params = {};
                for ( var p = 0; p < parts.length; p++ ) {
                    var eq = findTopLevelEquals( parts[ p ] );
                    if ( eq === -1 ) continue;
                    var key = parts[ p ].slice( 0, eq ).trim();
                    var value = parts[ p ].slice( eq + 1 ).trim();
                    if ( key ) params[ key ] = value;
                }
                return params;
            }

            i = start + 2;
        }

        return null;
    }

    /* ==========================================================
     * Wikitext 生成器
     * ==========================================================
     * 开头三行紧凑排列：
     *   {{组织版式}}
     *   {{DISPLAYTITLE:...}}
     *   类别首句 / 类别首句 + Level Class
     * 之间不留空行。
     */
    function buildWikitext( category, values, org, orgParams ) {
        var meta = CATEGORY_META[ category ];
        if ( !meta ) throw new Error( '未知类别：' + category );

        values = values || {};
        var lines = [];

        /* ① 组织版式（第一行，不跟空行） */
        var orgInvocation = buildOrgInvocation( org, orgParams );
        if ( orgInvocation ) {
            lines.push( orgInvocation );
        }

        /* ② DISPLAYTITLE（紧接上一行） */
        lines.push( buildDisplayTitle( category, values ) );

        /* ③ 类别头部（紧接 DISPLAYTITLE，不留空行） */
        if ( category === '层级' ) {
            lines.push(
                'Level CN ' + vInline( values, '编号' ) +
                '是后室CN层群的第' + vInline( values, '编号' ) + '层。'
            );
            lines.push( '' );
            lines.push(
                LEVEL_CLASSES[ vInline( values, '生存难度' ) ] ||
                LEVEL_CLASSES[ '0' ]
            );
            lines.push( '' );
        } else if ( category === '特殊层级' ) {
            lines.push(
                LEVEL_CLASSES[ vInline( values, '生存难度' ) ] ||
                LEVEL_CLASSES[ '0' ]
            );
            lines.push( '' );
        }

        /* ④ 各类别专属内容 */
        if ( category === '物品' ) {
            appendSection( lines, '描述',     v( values, '描述' ) );
            appendSection( lines, '性质',     v( values, '性质' ) );
            appendSection( lines, '获取方式', v( values, '获取方式' ) );
        } else if ( category === '效应' ) {
            appendSection( lines, '描述',     v( values, '描述' ) );
            appendSection( lines, '影响',     v( values, '影响' ) );
            appendSection( lines, '应对措施', v( values, '应对措施' ) );
        } else if ( category === '实体' ) {
            appendSection( lines, '描述',       v( values, '描述' ) );
            appendSection( lines, '生物学特征', v( values, '生物学特征' ) );
            appendSection( lines, '行为准则',   v( values, '行为准则' ) );
            appendSection( lines, '栖息地',     v( values, '栖息地' ) );
            appendSection( lines, '应对措施',   v( values, '应对措施' ) );
        } else if ( category === '层级' || category === '特殊层级' ) {
            appendSection( lines, '描述', v( values, '描述' ) );
            appendSection( lines, '实体', v( values, '实体描述' ) );

            lines.push( '<h2>入口与出口</h2>' );
            lines.push( '<h3>入口</h3>' );
            lines.push( '' );
            lines.push( v( values, '入口描述' ) );
            lines.push( '' );
            lines.push( '<h3>出口</h3>' );
            lines.push( '' );
            lines.push( v( values, '出口描述' ) );
            lines.push( '' );
        }

        /* ⑤ 附录 */
        if ( values[ '是否附录' ] === '是' ) {
            appendSection( lines, '附录', v( values, '附录内容' ) );
        }

        return lines.join( '\n' )
            .replace( /\n{3,}/g, '\n\n' )
            .replace( /^\n+|\n+$/g, '' ) + '\n';
    }

    /* ==========================================================
     * DOM 工具
     * ========================================================== */
    function el( tag, className, text ) {
        var node = document.createElement( tag );
        if ( className ) node.className = className;
        if ( text != null ) node.textContent = text;
        return node;
    }

    function draftKey() {
        return DRAFT_PREFIX + ( PAGE || 'draft' );
    }

    /* ==========================================================
     * 表单编辑器工厂
     * ========================================================== */
    function createEditor( host, options ) {
        options = options || {};

        var root = el( 'div', 'fe-root' );

        var state = {
            category: options.initialCategory || '物品',
            values: options.initialValues
                ? Object.assign( {}, options.initialValues )
                : {},
            orgTemplates: [],
            orgSelected: DEFAULT_ORG,
            orgParams: {},
            orgParamDefs: [],
            orgLoading: false,
            orgError: ''
        };

        var refs = {};
        var orgParamToken = 0;

        /* ---------- 草稿 ---------- */
        function saveDraft() {
            try {
                localStorage.setItem( draftKey(), JSON.stringify( {
                    category: state.category,
                    values: state.values,
                    orgSelected: state.orgSelected,
                    orgParams: state.orgParams,
                    ts: Date.now()
                } ) );
            } catch ( e ) {}
        }

        function loadDraft() {
            try {
                var raw = localStorage.getItem( draftKey() );
                if ( !raw ) return;
                var data = JSON.parse( raw );
                if ( !data ) return;

                if ( CATEGORY_ORDER.indexOf( data.category ) !== -1 ) {
                    state.category = data.category;
                }
                if ( data.values && typeof data.values === 'object' ) {
                    state.values = Object.assign( state.values, data.values );
                }
                if ( typeof data.orgSelected === 'string' && data.orgSelected ) {
                    state.orgSelected = data.orgSelected;
                }
                if ( data.orgParams && typeof data.orgParams === 'object' ) {
                    state.orgParams = Object.assign( state.orgParams, data.orgParams );
                }
            } catch ( e ) {}
        }

        function notifyDirty() {
            if ( typeof options.onDirty === 'function' ) {
                options.onDirty();
            }
        }

        /* ==========================================================
         * 组织版式 group
         * ========================================================== */
        function buildOrgGroup() {
            var group = el( 'div', 'fe-group fe-group-org' );
            group.appendChild( el( 'h3', 'fe-group-title', '组织版式' ) );
            group.appendChild( el( 'div', 'fe-hint',
                '从 Category:组织版式 检索到的模板。必选其一，生成时放在页面最前。' ) );

            var field = el( 'div', 'fe-field' );
            var label = el( 'label', 'fe-label', '组织版式模板' );
            label.appendChild( el( 'span', 'fe-required', ' *' ) );
            field.appendChild( label );

            var select = document.createElement( 'select' );
            select.className = 'fe-input fe-select';
            select.required = true;
            field.appendChild( select );
            refs.orgSelect = select;

            group.appendChild( field );

            refs.orgStatus = el( 'div', 'fe-org-status' );
            group.appendChild( refs.orgStatus );

            refs.orgParamsWrap = el( 'div', 'fe-org-params' );
            group.appendChild( refs.orgParamsWrap );

            return group;
        }

        function renderOrgSelect() {
            var select = refs.orgSelect;
            if ( !select ) return;

            select.textContent = '';

            var list = state.orgTemplates.slice();
            var hasDefault = list.some( function ( t ) {
                return t.title === DEFAULT_ORG;
            } );
            if ( !hasDefault ) {
                list.unshift( { title: DEFAULT_ORG, pageid: 0, virtual: true } );
            }

            list.forEach( function ( t ) {
                var opt = document.createElement( 'option' );
                opt.value = t.title;
                var display = t.title.replace( /^Template:/, '' );
                if ( t.virtual ) display += '（默认）';
                opt.textContent = display;
                select.appendChild( opt );
            } );

            var exists = false;
            for ( var i = 0; i < select.options.length; i++ ) {
                if ( select.options[ i ].value === state.orgSelected ) {
                    exists = true;
                    break;
                }
            }
            select.value = exists ? state.orgSelected : DEFAULT_ORG;
            if ( !exists ) state.orgSelected = DEFAULT_ORG;

            updateOrgStatus();
        }

        function updateOrgStatus() {
            var status = refs.orgStatus;
            if ( !status ) return;
            status.textContent = '';
            status.className = 'fe-org-status';

            if ( state.orgLoading ) {
                status.classList.add( 'is-loading' );
                status.textContent = '正在检索 ' + ORG_CATEGORY + ' …';
                return;
            }

            if ( state.orgError ) {
                status.classList.add( 'is-error' );
                status.textContent = state.orgError +
                    '（仍可使用默认模板 ' + DEFAULT_ORG + '）';
                return;
            }

            var current = null;
            state.orgTemplates.forEach( function ( t ) {
                if ( t.title === state.orgSelected ) current = t;
            } );

            if ( current ) {
                status.textContent = '已从分类中找到 ' +
                    state.orgTemplates.length + ' 个组织版式模板。';
            } else if ( state.orgSelected === DEFAULT_ORG ) {
                status.classList.add( 'is-warn' );
                status.textContent =
                    '默认模板 ' + DEFAULT_ORG +
                    ' 未在分类中找到（可能未加分类，或分类为空）。';
            } else {
                status.textContent = '当前选择的模板可能不在分类中。';
            }
        }

        function renderOrgParams() {
            var wrap = refs.orgParamsWrap;
            if ( !wrap ) return;
            wrap.textContent = '';

            if ( !state.orgParamDefs.length ) return;

            wrap.appendChild( el( 'div', 'fe-hint', '组织版式参数（可选）' ) );

            state.orgParamDefs.forEach( function ( def ) {
                var field = el( 'div', 'fe-field' );

                var label = el( 'label', 'fe-label', def.label || def.key );
                if ( def.required ) label.appendChild( el( 'span', 'fe-required', ' *' ) );
                label.title = '原始参数名：' + def.key;
                field.appendChild( label );

                var input;
                if ( def.type === 'boolean' ) {
                    input = document.createElement( 'select' );
                    [ '', '是', '否' ].forEach( function ( vv ) {
                        var o = document.createElement( 'option' );
                        o.value = vv;
                        o.textContent = vv || '（不设置）';
                        input.appendChild( o );
                    } );
                    input.value = state.orgParams[ def.key ] || '';
                } else if ( def.type === 'string' && def.description &&
                            def.description.length > 80 ) {
                    input = document.createElement( 'textarea' );
                    input.rows = 3;
                    input.value = state.orgParams[ def.key ] != null
                        ? state.orgParams[ def.key ] : ( def.default || '' );
                } else {
                    input = document.createElement( 'input' );
                    input.type = 'text';
                    input.value = state.orgParams[ def.key ] != null
                        ? state.orgParams[ def.key ] : ( def.default || '' );
                }

                input.className = 'fe-input';

                var hints = [];
                if ( def.description ) hints.push( def.description );
                if ( def.example ) hints.push( '示例：' + def.example );
                if ( def.required ) hints.push( '必填' );
                if ( hints.length ) {
                    input.title = hints.join( '；' );
                    if ( input.tagName !== 'SELECT' ) {
                        input.placeholder = hints.join( '；' );
                    }
                }

                input.addEventListener( 'input', function () {
                    state.orgParams[ def.key ] = input.value;
                    saveDraft();
                    notifyDirty();
                } );

                field.appendChild( input );
                wrap.appendChild( field );
            } );
        }

        function loadOrgParams() {
            state.orgParamDefs = [];
            renderOrgParams();

            if ( !state.orgSelected ) return;

            var token = ++orgParamToken;
            fetchTemplateParams( state.orgSelected ).then( function ( defs ) {
                if ( token !== orgParamToken ) return;
                state.orgParamDefs = defs || [];
                renderOrgParams();
            }, function () {
                if ( token !== orgParamToken ) return;
                state.orgParamDefs = [];
                renderOrgParams();
            } );
        }

        /* ==========================================================
         * 类别 group
         * ========================================================== */
        function buildCategoryGroup() {
            var group = el( 'div', 'fe-group fe-group-category' );
            group.appendChild( el( 'h3', 'fe-group-title', '文章类别' ) );

            var radioGroup = el( 'div', 'fe-radio-group' );

            CATEGORY_ORDER.forEach( function ( id ) {
                var label = el( 'label', 'fe-radio' );
                var input = document.createElement( 'input' );
                input.type = 'radio';
                input.name = 'fe-category';
                input.value = id;
                input.checked = id === state.category;

                input.addEventListener( 'change', function () {
                    if ( !input.checked ) return;
                    state.category = id;
                    refreshCategoryFields();
                    saveDraft();
                    notifyDirty();
                } );

                label.appendChild( input );
                label.appendChild( document.createTextNode( ' ' + id ) );
                radioGroup.appendChild( label );
            } );

            group.appendChild( radioGroup );
            return group;
        }

        /* ==========================================================
         * 字段
         * ========================================================== */
        function makeField( def ) {
            var wrap = el( 'div', 'fe-field' );

            var label = el( 'label', 'fe-label', def.label );
            if ( def.required ) label.appendChild( el( 'span', 'fe-required', ' *' ) );
            wrap.appendChild( label );

            var input;

            if ( def.type === 'select' ) {
                input = document.createElement( 'select' );
                ( def.options || [] ).forEach( function ( opt ) {
                    var o = document.createElement( 'option' );
                    o.value = opt;
                    o.textContent = opt;
                    input.appendChild( o );
                } );
                input.value = state.values[ def.key ] != null &&
                    state.values[ def.key ] !== ''
                    ? state.values[ def.key ]
                    : ( def.default || ( def.options && def.options[ 0 ] ) || '' );
                if ( input.value ) state.values[ def.key ] = input.value;
            } else if ( def.type === 'textarea' ) {
                input = document.createElement( 'textarea' );
                input.rows = def.rows || 4;
                input.value = state.values[ def.key ] != null
                    ? state.values[ def.key ] : ( def.default || '' );
            } else {
                input = document.createElement( 'input' );
                input.type = 'text';
                input.value = state.values[ def.key ] != null
                    ? state.values[ def.key ] : ( def.default || '' );
            }

            input.className = 'fe-input';
            input.name = def.key;
            if ( def.placeholder ) input.placeholder = def.placeholder;
            if ( def.required ) input.required = true;

            input.addEventListener( 'input', function () {
                state.values[ def.key ] = input.value;
                saveDraft();
                notifyDirty();
                if ( def.key === '是否附录' ) refreshAppendixVisibility();
            } );
            input.addEventListener( 'change', function () {
                state.values[ def.key ] = input.value;
                if ( def.key === '是否附录' ) refreshAppendixVisibility();
            } );

            wrap.appendChild( input );
            return wrap;
        }

        function buildFieldsHost() {
            var hostEl = el( 'div', 'fe-fields-host' );
            refs.fieldsHost = hostEl;
            refreshCategoryFields();
            return hostEl;
        }

        function refreshCategoryFields() {
            var hostEl = refs.fieldsHost;
            if ( !hostEl ) return;
            hostEl.textContent = '';

            /* 基本信息 */
            var basicGroup = el( 'div', 'fe-group fe-group-basic' );
            basicGroup.appendChild( el( 'h3', 'fe-group-title', '基本信息' ) );

            [
                { key: '编号', label: '编号', type: 'text', required: true,
                  placeholder: '例如 001' },
                { key: '名称', label: '名称', type: 'text', required: true,
                  placeholder: '文章 / 页面名称' }
            ].forEach( function ( def ) {
                basicGroup.appendChild( makeField( def ) );
            } );
            hostEl.appendChild( basicGroup );

            /* 类别内容 */
            var fields = CATEGORY_FIELDS[ state.category ] || [];
            if ( fields.length ) {
                var contentGroup = el( 'div', 'fe-group fe-group-content' );
                contentGroup.appendChild( el( 'h3', 'fe-group-title',
                    state.category + '内容' ) );
                fields.forEach( function ( def ) {
                    contentGroup.appendChild( makeField( def ) );
                } );
                hostEl.appendChild( contentGroup );
            }

            /* 附录 */
            var appendixGroup = el( 'div', 'fe-group fe-group-appendix' );
            appendixGroup.appendChild( el( 'h3', 'fe-group-title', '附录（可选）' ) );
            appendixGroup.appendChild( makeField( {
                key: '是否附录', label: '是否包含附录', type: 'select',
                options: [ '否', '是' ], default: '否', required: true
            } ) );

            var appendixWrap = el( 'div', 'fe-appendix-content' );
            refs.appendixWrap = appendixWrap;
            appendixWrap.appendChild( makeField( {
                key: '附录内容', label: '附录内容', type: 'textarea', rows: 6
            } ) );
            appendixGroup.appendChild( appendixWrap );
            hostEl.appendChild( appendixGroup );

            refreshAppendixVisibility();
        }

        function refreshAppendixVisibility() {
            var wrap = refs.appendixWrap;
            if ( !wrap ) return;
            wrap.style.display = state.values[ '是否附录' ] === '是' ? '' : 'none';
        }

        /* ==========================================================
         * 组装
         * ========================================================== */
        var paper = el( 'div', 'fe-paper' );
        paper.appendChild( buildOrgGroup() );
        paper.appendChild( buildCategoryGroup() );
        paper.appendChild( buildFieldsHost() );

        root.appendChild( paper );
        host.appendChild( root );

        refs.orgSelect.addEventListener( 'change', function () {
            state.orgSelected = refs.orgSelect.value;
            state.orgParams = {};
            updateOrgStatus();
            loadOrgParams();
            saveDraft();
            notifyDirty();
        } );

        /* ---------- 初始化 ---------- */
        if ( !options.initialValues ) loadDraft();
        renderOrgSelect();
        refreshCategoryFields();

        state.orgLoading = true;
        updateOrgStatus();

        fetchOrgTemplates().then( function ( list ) {
            state.orgTemplates = list || [];
            state.orgLoading = false;
            state.orgError = '';
            renderOrgSelect();
            loadOrgParams();
        }, function ( err ) {
            state.orgLoading = false;
            state.orgError = '检索失败：' +
                ( err && err.message ? err.message : '未知错误' );
            renderOrgSelect();
            loadOrgParams();
        } );

        /* ==========================================================
         * 对外接口
         * ========================================================== */
        return {
            element: root,

            getWikitext: function () {
                return buildWikitext(
                    state.category,
                    state.values,
                    state.orgSelected,
                    state.orgParams
                );
            },

            getValues: function () {
                return JSON.parse( JSON.stringify( state.values ) );
            },

            setValues: function ( values ) {
                state.values = Object.assign( {}, values || {} );
                refreshCategoryFields();
            },

            setCategory: function ( category ) {
                if ( CATEGORY_ORDER.indexOf( category ) === -1 ) return;
                state.category = category;
                var radios = root.querySelectorAll( 'input[name="fe-category"]' );
                for ( var i = 0; i < radios.length; i++ ) {
                    radios[ i ].checked = radios[ i ].value === category;
                }
                refreshCategoryFields();
            },

            refreshOrgTemplates: function () {
                state.orgLoading = true;
                updateOrgStatus();
                return fetchOrgTemplates().then( function ( list ) {
                    state.orgTemplates = list || [];
                    state.orgLoading = false;
                    state.orgError = '';
                    renderOrgSelect();
                    loadOrgParams();
                }, function () {
                    state.orgLoading = false;
                    state.orgError = '检索失败';
                    renderOrgSelect();
                } );
            },

            destroy: function () {
                if ( root.parentNode ) root.parentNode.removeChild( root );
            }
        };
    }

    /* ==========================================================
     * 页面模式：接管原生编辑表单
     * ========================================================== */
    function buildFormEditor( form, textarea ) {
        var existing = textarea.value || '';
        var prefilled = parseArticleTemplate( existing );
        var hasExisting = !!existing.trim();

        /* 隐藏原生表单 */
        Array.prototype.forEach.call( form.children, function ( child ) {
            if ( child.tagName === 'INPUT' && child.type === 'hidden' ) return;
            child.style.display = 'none';
        } );
        [ 'toolbar', 'editpage-toolbar', 'wikiPreview',
          'editpage-copywarn', 'editpage-editarea' ].forEach( function ( id ) {
            var el = document.getElementById( id );
            if ( el ) el.style.display = 'none';
        } );

        /* 容器 */
        var container = el( 'div', 'fe-page' );
        container.id = 'form-editor-container';

        /* 顶部 */
        var head = el( 'div', 'fe-head' );

        var back = document.createElement( 'a' );
        back.className = 'fe-back';
        back.href = mw.util.getUrl( PAGE );
        back.textContent = '← 返回';

        var title = el( 'span', 'fe-title', PAGE );

        var statusEl = el( 'span', 'fe-status', '未保存' );
        statusEl.classList.add( 'is-dirty' );

        head.appendChild( back );
        head.appendChild( title );
        head.appendChild( statusEl );
        container.appendChild( head );

        /* 已有内容提示 */
        if ( prefilled ) {
            container.appendChild( el( 'div', 'fe-info',
                '检测到页面中的 {{文章模板}}，已自动预填表单。保存时会覆盖为平铺格式。' ) );
        } else if ( hasExisting ) {
            container.appendChild( el( 'div', 'fe-warn',
                '此页面已有内容，但无法从 {{文章模板}} 中解析参数。' +
                '保存时会用表单内容完全覆盖现有页面。' ) );
        }

        /* 表单主体 */
        var mountEl = el( 'div', 'fe-mount' );
        container.appendChild( mountEl );

        /* 底部 */
        var footer = el( 'div', 'fe-footer' );

        var summaryInput = document.createElement( 'input' );
        summaryInput.type = 'text';
        summaryInput.className = 'fe-summary';
        summaryInput.placeholder = '编辑摘要（可选）';
        summaryInput.setAttribute( 'aria-label', '编辑摘要' );

        var saveBtn = el( 'button', 'fe-save-btn', '保存页面' );
        saveBtn.type = 'button';

        footer.appendChild( summaryInput );
        footer.appendChild( saveBtn );
        container.appendChild( footer );

        form.parentNode.insertBefore( container, form );

        var initialCategory = prefilled && prefilled[ '文章类型' ]
            ? prefilled[ '文章类型' ]
            : '物品';
        if ( CATEGORY_ORDER.indexOf( initialCategory ) === -1 ) {
            initialCategory = '物品';
        }

        var initialValues = null;
        if ( prefilled ) {
            initialValues = {};
            Object.keys( prefilled ).forEach( function ( key ) {
                if ( key === '文章类型' ) return;
                initialValues[ key ] = prefilled[ key ];
            } );
        }

        var editor = createEditor( mountEl, {
            initialValues: initialValues,
            initialCategory: initialCategory,
            onDirty: function () {
                statusEl.textContent = '未保存';
                statusEl.classList.add( 'is-dirty' );
            }
        } );

        /* 保存 */
        function save() {
            var wikitext = editor.getWikitext();
            var summary = summaryInput.value || '';
            var summaryField = document.getElementById( 'wpSummary' );

            textarea.value = wikitext;
            if ( summaryField ) summaryField.value = summary;

            var saveFlag = form.querySelector( 'input[type="hidden"][name="wpSave"]' );
            if ( !saveFlag ) {
                saveFlag = document.createElement( 'input' );
                saveFlag.type = 'hidden';
                saveFlag.name = 'wpSave';
                saveFlag.value = '1';
                form.appendChild( saveFlag );
            }

            try {
                if ( !/[?&]action=submit(?:&|$)/.test( form.action ) ) {
                    form.action = mw.util.getUrl( PAGE, { action: 'submit' } );
                }
            } catch ( e ) {}

            saveBtn.disabled = true;
            saveBtn.textContent = '保存中…';
            statusEl.textContent = '保存中…';
            statusEl.classList.remove( 'is-dirty' );

            try {
                var ev;
                try {
                    ev = new Event( 'submit', { bubbles: true, cancelable: true } );
                } catch ( e1 ) {
                    ev = document.createEvent( 'Event' );
                    ev.initEvent( 'submit', true, true );
                }
                form.dispatchEvent( ev );
            } catch ( e ) {}

            textarea.value = wikitext;
            if ( summaryField ) summaryField.value = summary;

            HTMLFormElement.prototype.submit.call( form );

            setTimeout( function () {
                saveBtn.disabled = false;
                saveBtn.textContent = '保存页面';
                statusEl.textContent = '未保存';
                statusEl.classList.add( 'is-dirty' );
            }, 1500 );
        }

        saveBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            save();
        } );

        container.addEventListener( 'keydown', function ( e ) {
            var mod = e.ctrlKey || e.metaKey;
            if ( mod && !e.altKey && ( e.key || '' ).toLowerCase() === 's' ) {
                if ( e.target && e.target.tagName === 'TEXTAREA' ) return;
                e.preventDefault();
                save();
            }
        } );

        window.addEventListener( 'beforeunload', function ( e ) {
            if ( saveBtn.disabled ) return;
            var message = '未保存的更改将会丢失。';
            e.preventDefault();
            e.returnValue = message;
            return message;
        } );

        return {
            container: container,
            editor: editor,
            save: save
        };
    }

    /* ==========================================================
     * 页面模式入口
     * ========================================================== */
    function initFormEditor() {
        if ( ACTION !== 'edit' ) return;

        var params = new URLSearchParams( location.search );
        if ( params.get( 'editor' ) !== 'form' ) return;

        var retries = 0;

        function trySetup() {
            var form = document.getElementById( 'editform' );
            var textarea = document.getElementById( 'wpTextbox1' );

            if ( !form || !textarea ) {
                if ( retries++ < 50 ) setTimeout( trySetup, 100 );
                return;
            }
            if ( document.getElementById( 'form-editor-container' ) ) return;

            buildFormEditor( form, textarea );
        }

        if ( document.readyState === 'loading' ) {
            document.addEventListener( 'DOMContentLoaded', trySetup );
        } else {
            trySetup();
        }
    }

    /* ==========================================================
     * 对外导出
     * ========================================================== */
    mw.formEditor = {
        buildWikitext: buildWikitext,
        parseArticleTemplate: parseArticleTemplate,

        CATEGORY_ORDER: CATEGORY_ORDER.slice(),
        CATEGORY_FIELDS: CATEGORY_FIELDS,
        CATEGORY_META: CATEGORY_META,
        LEVEL_CLASSES: LEVEL_CLASSES,

        fetchOrgTemplates: fetchOrgTemplates,
        fetchTemplateParams: fetchTemplateParams,

        mount: function ( container, options ) {
            var host = typeof container === 'string'
                ? document.querySelector( container )
                : container;

            if ( !host ) {
                throw new Error( 'mw.formEditor.mount: 容器不存在' );
            }

            return createEditor( host, options );
        }
    };

    /* 页面模式自动执行 */
    initFormEditor();

}() );

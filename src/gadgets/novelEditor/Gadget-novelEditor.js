/* ============================================================
 * 小说写作模式 for MediaWiki
 * 小工具：novelEditor
 * 用法：访问 ?action=edit&editor=novel
 * 静态样式：同目录 Gadget-novelEditor.css（definition.yaml 中一并声明）
 *
 * 设计目标：
 *   - 全屏写作台：自己的顶栏、工具栏、纸张正文、字数状态栏
 *   - 正文区域独立滚动，滚动条始终可见、样式统一
 *   - 回车即分段：编辑器里的一个段落 = Wikitext 里的一个空行
 *   - 所有格式输出为 Wikitext，不使用 Wikidot 语法：
 *       '''粗体'''      ''斜体''      <u>下划线</u>
 *       <s>删除线</s>   == 标题 ==
 *       <div style="text-align:center">居中内容</div>
 *   - 纯文字模式：代码块、模板、表格、链接、魔术字、HTML 标签
 *     在读入时直接排除；在写出时把语法字符转义，正文里写不出代码
 *   - 对外接口与 Gadget-wikidotEditor 的 mw.wikidotEditor 保持同构：
 *       mw.novelEditor.mount( container, initialSource )
 *       mw.novelEditor.toStorage( source )
 *       mw.novelEditor.fromStorage( storage )
 *       mw.novelEditor.convertWikitextToHtml( wikitext )
 *       mw.novelEditor.convertHtmlToWikitext( html )
 * ============================================================ */
( function () {
    'use strict';

    var ACTION = mw.config.get( 'wgAction' );
    var PAGE   = mw.config.get( 'wgPageName' );

    var LS = {
        recent: 'novel-editor:recent-chars',
        chars:  'novel-editor:chars-open',
        structure: 'novel-editor:structure'
    };

    var APOS = '\u0000NVAPOS\u0000';

    /* ==========================================================
     * 特殊字符库
     * ========================================================== */
    var CHAR_CATEGORIES = [
        { id: 'recent', name: '最近使用', chars: [] },
        { id: 'cn', name: '中文标点', chars: [
            '，', '。', '、', '；', '：', '？', '！', '“', '”', '‘', '’',
            '「', '」', '『', '』', '（', '）', '《', '》', '〈', '〉',
            '【', '】', '〔', '〕', '［', '］', '…', '—', '–', '·',
            '～', '‥', '•', '＿', '／'
        ] },
        { id: 'en', name: '西文标点', chars: [
            ',', '.', ';', ':', '?', '!', '"', "'", '(', ')', '[', ']',
            '{', '}', '<', '>', '/', '\\', '|', '@', '#', '$', '%',
            '^', '&', '*', '-', '+', '=', '_', '~', '`'
        ] },
        { id: 'typo', name: '排版符号', chars: [
            '§', '¶', '†', '‡', '•', '‥', '‰', '‱', '№', '℡', '©',
            '®', '™', '℠', '°', '′', '″', '※', '⁂', '⁎', '⁑'
        ] },
        { id: 'math', name: '数学符号', chars: [
            '±', '×', '÷', '=', '≠', '≈', '≡', '≤', '≥', '≪', '≫',
            '∞', '√', '∛', '∜', '∑', '∏', '∫', '∬', '∭', '∮', '∂',
            '∇', '∝', '∥', '⊥', '∠', '°', '′', '″', '‰', '∴', '∵',
            '∈', '∉', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '∅', '∀', '∃',
            '¬', '∧', '∨', '⊕', '⊗', '⊙', '⌈', '⌉', '⌊', '⌋', '⟨', '⟩'
        ] },
        { id: 'arrow', name: '箭头', chars: [
            '←', '→', '↑', '↓', '↔', '↕', '⇐', '⇒', '⇑', '⇓', '⇔',
            '⇕', '↖', '↗', '↘', '↙', '⟵', '⟶', '⟷', '⟹', '⟸', '⟺',
            '↦', '↩', '↪', '⤴', '⤵', '⇠', '⇢', '⇡', '⇣', '⇄', '⇅'
        ] },
        { id: 'greek', name: '希腊字母', chars: [
            'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Ι', 'Κ', 'Λ', 'Μ',
            'Ν', 'Ξ', 'Ο', 'Π', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω',
            'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ',
            'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'
        ] },
        { id: 'num', name: '数字序号', chars: [
            '½', '⅓', '⅔', '¼', '¾', '⅕', '⅖', '⅗', '⅘', '⅙', '⅚',
            '⅛', '⅜', '⅝', '⅞', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ',
            'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', '①', '②', '③', '④', '⑤', '⑥',
            '⑦', '⑧', '⑨', '⑩', '⓪', '⁰', '¹', '²', '³', '⁴', '⁵',
            '⁶', '⁷', '⁸', '⁹', '₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'
        ] },
        { id: 'geo', name: '几何图形', chars: [
            '■', '□', '▪', '▫', '▬', '▲', '△', '▶', '▷', '▼', '▽',
            '◀', '◁', '◆', '◇', '○', '●', '◉', '◎', '◈', '☆', '★',
            '◐', '◑', '◒', '◓', '◧', '◨', '◩', '◪', '◢', '◣', '◤', '◥'
        ] },
        { id: 'deco', name: '文字装饰', chars: [
            '✓', '✔', '✕', '✖', '✗', '✘', '✚', '✛', '✜', '✟', '✠',
            '✦', '✧', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '✰', '✱',
            '✲', '✳', '✴', '✵', '✶', '✷', '✸', '✹', '✺', '✻', '✼',
            '✽', '❀', '❁', '❂', '❃', '❄', '❅', '❆', '❇', '❈', '❉',
            '❊', '❋', '❖'
        ] },
        { id: 'box', name: '框线', chars: [
            '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
            '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
            '╭', '╮', '╯', '╰', '━', '┃', '┏', '┓', '┗', '┛', '┣',
            '┫', '┳', '┻', '╋'
        ] },
        { id: 'currency', name: '货币单位', chars: [
            '$', '¢', '£', '¤', '¥', '€', '₹', '₽', '₩', '₪', '₫',
            '₴', '₦', '₱', '₮', '₸', '₺', '₼', '₾', '℃', '℉', 'µ',
            'Ω', 'Å', '㏄', '㎜', '㎝', '㎞', '㎎', '㎏', '㎡'
        ] }
    ];

    /* ==========================================================
     * 图标
     * ========================================================== */
    var ICONS = {
        center: '<path d="M4 6.5h16M8 11h8M5 15.5h14M9.5 20h5"/>',
        rule: '<path d="M4 12h16"/><path d="M4 6.5h7M4 17.5h7"/>',
        clear: '<path d="M5 19h14"/><path d="M7 15l8.5-8.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L10 18H7z"/>',
        chars: '<path d="M4 20c0-6 3.2-10 8-10s8 4 8 10"/><circle cx="12" cy="6.5" r="2.5"/>',
        template: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.4"/><path d="M21 16l-4.5-4.5L8 20"/>',
        back: '<path d="M15 5l-7 7 7 7"/>',
        dot: '<circle cx="12" cy="12" r="3"/>'
    };

    function svg( name ) {
        var body = ICONS[ name ] || '';
        return '<svg class="nv-icon" viewBox="0 0 24 24" aria-hidden="true" ' +
            'focusable="false" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round" ' +
            'stroke-linejoin="round">' + body + '</svg>';
    }

    /* ==========================================================
     * 基础工具
     * ========================================================== */
    function fireInput( el ) {
        var ev;
        try {
            ev = new Event( 'input', { bubbles: true } );
        } catch ( e ) {
            ev = document.createEvent( 'Event' );
            ev.initEvent( 'input', true, true );
        }
        el.dispatchEvent( ev );
    }

    function storageGet( key ) {
        try { return localStorage.getItem( key ); } catch ( e ) { return null; }
    }

    function storageSet( key, value ) {
        try { localStorage.setItem( key, value ); } catch ( e ) {}
    }

    function repeatChar( ch, count ) {
        return new Array( count + 1 ).join( ch );
    }

    function formatNumber( n ) {
        return String( n ).replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
    }

    function escapeBasic( s ) {
        return String( s )
            .replace( /&/g, '&amp;' )
            .replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' );
    }

    /* 手动解码常用实体，避免用 innerHTML 解析页面内容 */
    function decodeEntities( text ) {
        return String( text ).replace(
            /&(?:#(\d+)|#[xX]([0-9A-Fa-f]+)|(amp|lt|gt|quot|apos|nbsp));/g,
            function ( m, dec, hex, name ) {
                if ( dec ) return String.fromCharCode( parseInt( dec, 10 ) );
                if ( hex ) return String.fromCharCode( parseInt( hex, 16 ) );
                switch ( String( name ).toLowerCase() ) {
                    case 'amp': return '&';
                    case 'lt': return '<';
                    case 'gt': return '>';
                    case 'quot': return '"';
                    case 'apos': return "'";
                    case 'nbsp': return ' ';
                }
                return m;
            }
        );
    }

    /* ==========================================================
     * 模板 / 图片渲染
     * ========================================================== */

    /*
     * 常用模板列表：以后要加模板，直接往这里追加即可。
     * 这里只是下拉框的快捷选项，不会限制用户手输其它命名空间的模板。
     */
    var COMMON_TEMPLATES = [
        'Template:XLCS',
        'Template:XECS',
        'Template:XOCS',
        'Template:XPCS'
    ];

    /*
     * X-CS 分级系统内置中文说明。
     * 来源：星澜联合组织关于应用 X-CS 分级系统的说明。
     * 参数表单优先用模板自己的 templatedata / #switch 文案；
     * 这里只补空缺，并把预设值的中文含义放进选项提示。
     * XECS / XOCS 文档标注“尚未完成”，因此不凭空补参数。
     */
    var COMMON_TEMPLATE_META = {
        'template:xlcs': {
            label: '层级分级',
            params: {
                entity: {
                    label: '统合实体等级',
                    description: '描述层级中实体的数量以及敌意。',
                    presets: '0~5、6、variable、pending、none、safe、-1'
                },
                space: {
                    label: '空间不稳定度',
                    description: '描述层级的空间特性。',
                    presets: '0~5、6、variable、pending、none、safe'
                },
                material: {
                    label: '物资缺乏可能',
                    description: '描述层级中物资的密度和获取难度。',
                    presets: '0~5、6、variable、pending、none、-1'
                },
                escape: {
                    label: '层级脱离难度',
                    description: '表示层级出口是否易于抵达和使用。',
                    presets: '0~5、6、variable、pending、none、-1'
                },
                exit: {
                    label: '层级出口风险',
                    description: '表明从常规出口离开层级这一行为的危险性。',
                    presets: '0~5、6、variable、pending、none'
                },
                mental: {
                    label: '层级异常效应',
                    description: '说明层级是否拥有异常效应，通常是精神或概念层面的效应。不符合预设时可直接写自定义描述。',
                    presets: 'none、pending、delta、lambda、sigma、sigma+、sigma-、psi'
                }
            },
            values: {
                __general: {
                    variable: '特性变动：可能因时间、流浪者行为或所处区域而不同，通常难以直接列举。',
                    pending: '待分级/调查中：正在进行调查，或现有数据无法得出规律。',
                    none: '不适用：仅在极其严苛的条件下使用。'
                },
                entity: {
                    safe: '层级中的实体以友善实体为主。',
                    '-1': '层级主要危害来自非实体因素，不代表完全没有实体危害。'
                },
                space: {
                    safe: '层级中有流浪者组织建立的宜居聚居地。'
                },
                material: {
                    '-1': '层级中的部分或全部物资存在异常效应。'
                },
                escape: {
                    '-1': '层级出口过多，可能发生意外脱离，需要留意。'
                },
                exit: {
                    none: '层级没有出口。'
                },
                mental: {
                    none: '无需要说明的异常效应。',
                    pending: '已确认有异常效应，但尚未完全确认异常类型。',
                    delta: '认知篡改：层级会扭曲进入者的认知，导致思维逻辑悖论或身份认知丧失。',
                    'Δ': '认知篡改：层级会扭曲进入者的认知，导致思维逻辑悖论或身份认知丧失。',
                    lambda: '时空病态：层级的时空结构不同于人类认知的基准空间，并可能传染给进入者。',
                    'Λ': '时空病态：层级的时空结构不同于人类认知的基准空间，并可能传染给进入者。',
                    sigma: '模因危害：层级中存在或本身即为致命模因触媒，被认知后可能致命。',
                    'sigma+': '模因危害：层级中存在或本身即为致命模因触媒，被认知后可能致命。',
                    'Σ+': '模因危害：层级中存在或本身即为致命模因触媒，被认知后可能致命。',
                    'sigma-': '逆模因危害：用于描述层级的信息会被逆模因效应抹除，包括认知该层级的流浪者。',
                    'Σ-': '逆模因危害：用于描述层级的信息会被逆模因效应抹除，包括认知该层级的流浪者。',
                    psi: '感知坍缩：层级向流浪者灌输极端感官输入并无限放大，最终导致精神失常，可能脑死亡。',
                    'Ψ': '感知坍缩：层级向流浪者灌输极端感官输入并无限放大，最终导致精神失常，可能脑死亡。'
                }
            }
        },
        'template:xecs': {
            label: '实体分级',
            params: {},
            values: {}
        },
        'template:xocs': {
            label: '物品分级',
            params: {},
            values: {}
        },
        'template:xpcs': {
            label: '效应分级',
            params: {
                freq: {
                    label: '效应发生频率',
                    description: '表明效应发生的频率。',
                    presets: '0~3、element、conditional、region、variable、pending、none'
                },
                scope: {
                    label: '效应存在范围',
                    description: '表明效应存在的层级、子层级或界域等。',
                    presets: 'wide、cn、only、part、variable、pending、none'
                },
                harm: {
                    label: '效应危害可能',
                    description: '描述效应对流浪者带来危害的可能性。',
                    presets: '0~3、-1、safe、variable、pending、none'
                },
                target: {
                    label: '效应作用对象',
                    description: '描述效应作用的目标。',
                    presets: 'human、entity、allentity、level、concept、information、multiple、variable、pending、none'
                }
            },
            values: {
                __general: {
                    variable: '特性变动：可能因时间、流浪者行为或所处区域而不同，通常难以直接列举。',
                    pending: '待分级/调查中：正在进行调查，或现有数据无法得出规律。',
                    none: '不适用：仅在极其严苛的条件下使用。'
                },
                freq: {
                    element: '效应作为规律存在，而不是会发生的“事件”。',
                    conditional: '效应总是在一些通常不应被视为效应一部分的其它事件后发生。',
                    region: '发生频率根据流浪者所处区域而变化。'
                },
                scope: {
                    wide: '效应在全后室范围广泛发生，但不一定发生在每一个层级。',
                    cn: '效应只发生在 CN 层群。',
                    only: '效应局限于单个或少数几个特定层级。',
                    part: '效应仅发生于一些层级的特定区域。'
                },
                harm: {
                    '-1': '以间接性危害为主：乍看危害不大，但最终总会因某种原因对流浪者造成危害。',
                    safe: '效应对流浪者无显著危害。'
                },
                target: {
                    human: '效应只会影响流浪者。',
                    entity: '效应作用于非流浪者实体。',
                    allentity: '效应同时作用于实体和流浪者。',
                    level: '效应作用于层级中的物质或层级本身的特性。',
                    concept: '效应作用于某种原本普适的概念或物理规律。',
                    information: '效应作用于信息，往往意味着信息或认知危害。',
                    multiple: '效应存在多种复合影响。'
                }
            }
        }
    };

    function normalizeMetaTitle( title ) {
        return String( title == null ? '' : title )
            .replace( /_/g, ' ' )
            .replace( /\s+/g, ' ' )
            .trim()
            .toLowerCase();
    }

    function commonTemplateMeta( title ) {
        var key = normalizeMetaTitle( title );
        if ( !key ) return null;
        if ( COMMON_TEMPLATE_META[ key ] ) return COMMON_TEMPLATE_META[ key ];

        if ( key.indexOf( 'template:' ) !== 0 ) {
            var withNs = 'template:' + key;
            if ( COMMON_TEMPLATE_META[ withNs ] ) return COMMON_TEMPLATE_META[ withNs ];
        }

        return null;
    }

    function applyCommonParamLabels( title, defs ) {
        var meta = commonTemplateMeta( title );
        if ( !meta || !defs ) return;

        for ( var i = 0; i < defs.length; i++ ) {
            var def = defs[ i ];
            var info = meta.params[ def.key ] ||
                meta.params[ String( def.key ).toLowerCase() ];
            if ( !info ) continue;

            /* 常用模板以 X-CS 文档的中文名称为准 */
            if ( info.label ) def.label = info.label;
            if ( !def.description && info.description ) {
                def.description = info.description;
            }
            if ( !def.presets && info.presets ) def.presets = info.presets;
        }
    }

    function commonValueHint( title, key, value ) {
        var meta = commonTemplateMeta( title );
        if ( !meta || !meta.values ) return '';

        var map = meta.values[ key ] ||
            meta.values[ String( key ).toLowerCase() ];
        var general = meta.values.__general || {};
        var v = String( value == null ? '' : value );
        var lv = v.toLowerCase();

        if ( map ) {
            if ( map[ v ] ) return map[ v ];
            if ( map[ lv ] ) return map[ lv ];
        }

        return general[ v ] || general[ lv ] || '';
    }

    function applyCommonValueHints( title, defs ) {
        if ( !defs ) return;

        for ( var i = 0; i < defs.length; i++ ) {
            var def = defs[ i ];
            if ( !def.options || !def.options.length ) continue;

            for ( var j = 0; j < def.options.length; j++ ) {
                var hint = commonValueHint( title, def.key, def.options[ j ].value );
                if ( hint ) def.options[ j ].hint = hint;
            }
        }
    }

    var apiReady = null;
    var templateCache = Object.create( null );
    var templateInfoCache = Object.create( null );
    var imageCache = Object.create( null );
    var seenHeadLinks = Object.create( null );
    var seenHeadStyles = Object.create( null );
    var loadedModules = Object.create( null );
    var lastHeadHtml = null;

    /* 当前页面自己的 {{CSS}} / <templatestyles> 等，渲染模板时一起送进 parse，
       这样模板预览和正文使用同一套样式上下文。 */
    var activePageMeta = [];

    function extractErrorInfo( err ) {
        if ( !err ) return '未知错误';
        if ( err.error && err.error.info ) return err.error.info;
        if ( err.info ) return err.info;
        if ( typeof err === 'string' ) return err;
        try { return JSON.stringify( err ); } catch ( e ) { return '未知错误'; }
    }

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

        apiReady.catch( function () {
            apiReady = null;
        } );

        return apiReady;
    }

    function rememberHeadStyle( css, attrName, nonce ) {
        var text = String( css == null ? '' : css );
        if ( !text.trim() || seenHeadStyles[ text ] ) return;
        seenHeadStyles[ text ] = true;

        var style = document.createElement( 'style' );
        style.textContent = text;
        style.setAttribute( attrName || 'data-nv-widget-css', '1' );
        if ( nonce ) style.setAttribute( 'nonce', nonce );
        document.head.appendChild( style );
    }

    function rememberHeadLink( href ) {
        var url = String( href == null ? '' : href ).trim();
        if ( !url ) return;

        /* mw-data: 是 MediaWiki 去重后的内联样式占位，不能直接当 URL 下载；
           对应内容已经在返回的 <style> 里，会由 rememberHeadStyle 处理。 */
        if ( /^mw-data:/i.test( url ) ) return;
        if ( seenHeadLinks[ url ] ) return;
        seenHeadLinks[ url ] = true;

        var link = document.createElement( 'link' );
        link.rel = 'stylesheet';
        link.href = url;
        link.setAttribute( 'data-nv-widget-css', '1' );
        document.head.appendChild( link );
    }

    /* 把预览 HTML 里的 <style>/<link> 提到全局，保证控件、布置虚影、
       以及参数重渲染之后都能拿到模板样式。 */
    function contentStyles( container ) {
        if ( !container ) return;

        var styles = [];
        var i;
        var nodes = container.querySelectorAll( 'style' );
        for ( i = 0; i < nodes.length; i++ ) styles.push( nodes[ i ] );
        for ( i = 0; i < styles.length; i++ ) {
            rememberHeadStyle(
                styles[ i ].textContent,
                'data-nv-widget-css',
                styles[ i ].getAttribute( 'nonce' )
            );
            if ( styles[ i ].parentNode ) {
                styles[ i ].parentNode.removeChild( styles[ i ] );
            }
        }

        var links = [];
        nodes = container.querySelectorAll(
            'link[rel="stylesheet"],link[rel="mw-deduplicated-inline-style"]'
        );
        for ( i = 0; i < nodes.length; i++ ) links.push( nodes[ i ] );
        for ( i = 0; i < links.length; i++ ) {
            rememberHeadLink( links[ i ].getAttribute( 'href' ) );
            if ( links[ i ].parentNode ) {
                links[ i ].parentNode.removeChild( links[ i ] );
            }
        }
    }

    function processHeadHtml( headhtml ) {
        if ( !headhtml || headhtml === lastHeadHtml ) return;
        lastHeadHtml = headhtml;

        var temp = document.createElement( 'div' );
        temp.innerHTML = headhtml;

        var links = temp.querySelectorAll(
            'link[rel="stylesheet"],link[rel="mw-deduplicated-inline-style"]'
        );
        for ( var i = 0; i < links.length; i++ ) {
            rememberHeadLink( links[ i ].getAttribute( 'href' ) );
        }

        var styles = temp.querySelectorAll( 'style' );
        for ( var j = 0; j < styles.length; j++ ) {
            rememberHeadStyle(
                styles[ j ].textContent,
                'data-nv-widget-css',
                styles[ j ].getAttribute( 'nonce' )
            );
        }
    }

    function renderTemplate( invocation ) {
        var metaText = activePageMeta.join( '\n' );
        var cacheKey = ( metaText ? metaText + '\u0001' : '' ) + invocation;

        if ( templateCache[ cacheKey ] ) {
            return Promise.resolve( templateCache[ cacheKey ] );
        }

        return ensureApi().then( function () {
            var api = new mw.Api();
            return api.post( {
                action: 'parse',
                /* 带上页面级 CSS / templatestyles，让 MediaWiki 在渲染模板时
                   一并产出对应样式，而不是只返回裸 HTML。 */
                text: ( metaText ? metaText + '\n' : '' ) + invocation,
                contentmodel: 'wikitext',
                title: PAGE,
                prop: 'text|modules|headhtml',
                disablelimitreport: 1,
                disableeditsection: 1,
                disabletoc: 1,
                preview: 1,
                format: 'json',
                formatversion: 2
            } );
        } ).then( function ( res ) {
            if ( !res || !res.parse || typeof res.parse.text !== 'string' ) {
                throw new Error( '模板返回结果异常' );
            }

            processHeadHtml( res.parse.headhtml );

            var modules = ( res.parse.modules || [] ).filter( function ( name ) {
                if ( loadedModules[ name ] ) return false;
                loadedModules[ name ] = true;
                return true;
            } );

            var html = res.parse.text;
            templateCache[ cacheKey ] = html;

            if ( modules.length && mw.loader && mw.loader.using ) {
                return mw.loader.using( modules ).then(
                    function () { return html; },
                    function () { return html; }
                );
            }
            return html;
        } );
    }

    function resolveImageUrl( name ) {
        if ( imageCache[ name ] ) return Promise.resolve( imageCache[ name ] );

        /* 只允许站内已上传文件，不接受外链 URL */
        return ensureApi().then( function () {
            var api = new mw.Api();
            return api.get( {
                action: 'query',
                format: 'json',
                formatversion: 2,
                titles: 'File:' + name,
                prop: 'imageinfo',
                iiprop: 'url|size',
                iiurlwidth: 1200
            } );
        } ).then( function ( res ) {
            var pages = res && res.query && res.query.pages;
            if ( !pages || !pages.length ) throw new Error( '找不到文件' );

            var page = pages[ 0 ];
            if ( page.missing ) throw new Error( '文件不存在' );

            var info = page.imageinfo && page.imageinfo[ 0 ];
            if ( !info ) throw new Error( '无法读取图片信息' );

            var url = info.thumburl || info.url;
            if ( !url ) throw new Error( '无法读取图片地址' );

            imageCache[ name ] = url;
            return url;
        } );
    }

    function findTemplateEndAt( text, start ) {
        var depth = 0;

        for ( var i = start; i < text.length - 1; i++ ) {
            if ( text.charAt( i ) === '{' && text.charAt( i + 1 ) === '{' ) {
                depth++;
                i++;
            } else if ( text.charAt( i ) === '}' && text.charAt( i + 1 ) === '}' ) {
                depth--;
                i++;
                if ( depth === 0 ) return i + 1;
            }
        }

        return -1;
    }

    function isSingleTemplate( text ) {
        var s = String( text == null ? '' : text ).trim();
        if ( s.indexOf( '{{' ) !== 0 || s.slice( -2 ) !== '}}' ) return false;

        var end = findTemplateEndAt( s, 0 );
        return end === s.length;
    }

    /* 页面布局 / 解析函数不属于正文模板，直接排除 */
    function isMetaTemplate( invocation ) {
        var inner = String( invocation )
            .replace( /^\{\{/, '' )
            .replace( /\}\}$/, '' )
            .trim();

        var name = inner.split( '|' )[ 0 ].trim();
        if ( !name ) return true;
        if ( name.charAt( 0 ) === '#' ) return true;

        var lower = name.toLowerCase();
        var base = lower.split( ':' )[ 0 ];

        return /^(nosidebar|css|displaytitle|defaultsort|toc|clear|clearleft|clearright|notoc|!)$/
            .test( base ) ||
            /^(pagename|fullpagename|namespace|namespacenumber|currentyear|currentmonth|currentday|sitename|server|servername|scriptpath|stylepath|contentlanguage|numberofpages)$/
            .test( base );
    }

    /* 按顶层分隔符拆分模板参数，保护嵌套 {{...}} 与 [[...]] */
    function splitTopLevel( text, delimiter ) {
        var parts = [];
        var buf = '';
        var curly = 0;
        var square = 0;

        for ( var i = 0; i < text.length; i++ ) {
            var ch = text.charAt( i );
            var next = text.charAt( i + 1 );

            if ( ch === '{' && next === '{' ) {
                curly++;
                buf += '{{';
                i++;
            } else if ( ch === '}' && next === '}' && curly > 0 ) {
                curly--;
                buf += '}}';
                i++;
            } else if ( ch === '[' && next === '[' ) {
                square++;
                buf += '[[';
                i++;
            } else if ( ch === ']' && next === ']' && square > 0 ) {
                square--;
                buf += ']]';
                i++;
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
                curly++;
                i++;
            } else if ( ch === '}' && next === '}' && curly > 0 ) {
                curly--;
                i++;
            } else if ( ch === '[' && next === '[' ) {
                square++;
                i++;
            } else if ( ch === ']' && next === ']' && square > 0 ) {
                square--;
                i++;
            } else if ( ch === '=' && curly === 0 && square === 0 ) {
                return i;
            }
        }

        return -1;
    }

    function parseTemplateInvocation( invocation ) {
        var s = String( invocation == null ? '' : invocation ).trim();
        if ( !isSingleTemplate( s ) ) return null;

        var parts = splitTopLevel( s.slice( 2, -2 ), '|' );
        var name = ( parts.shift() || '' ).trim();
        if ( !name ) return null;

        var params = [];

        for ( var i = 0; i < parts.length; i++ ) {
            var part = parts[ i ];
            var eq = findTopLevelEquals( part );

            if ( eq === -1 ) {
                params.push( { key: '', value: part, positional: true } );
            } else {
                params.push( {
                    key: part.slice( 0, eq ).trim(),
                    value: part.slice( eq + 1 ),
                    positional: false
                } );
            }
        }

        return { name: name, params: params };
    }

    function buildTemplateInvocation( name, params ) {
        var out = '{{' + name;

        for ( var i = 0; i < params.length; i++ ) {
            var p = params[ i ];
            out += '|' + ( p.key ? p.key + '=' : '' ) + p.value;
        }

        return out + '}}';
    }

    function normalizeTemplateTitle( name ) {
        var n = String( name == null ? '' : name ).trim();
        if ( !n ) return '';

        n = n.replace( /^(?:subst|safesubst)\s*:/i, '' ).trim();
        n = n.replace( /^:/, '' ).trim();
        if ( !n ) return '';
        if ( n.indexOf( ':' ) === -1 ) return 'Template:' + n;
        return n;
    }

    /* 解析 {{#switch:值|键=显示文字|...}}，用于把参数变成下拉选项 */
    function parseSwitchExpression( expr ) {
        var s = String( expr == null ? '' : expr ).trim();
        if ( !/^\{\{\s*#switch\s*:/i.test( s ) ) return null;
        if ( !isSingleTemplate( s ) ) return null;

        var inner = s.slice( 2, -2 );
        var colon = inner.indexOf( ':' );
        if ( colon === -1 ) return null;

        var body = inner.slice( colon + 1 );
        var parts = splitTopLevel( body, '|' );
        var test = String( parts[ 0 ] || '' ).trim();
        var options = [];
        var seen = Object.create( null );
        var defaultLabel = '';

        for ( var i = 1; i < parts.length; i++ ) {
            var part = parts[ i ];
            var eq = findTopLevelEquals( part );
            if ( eq === -1 ) continue;

            var key = part.slice( 0, eq ).trim();
            var label = part.slice( eq + 1 ).trim();

            if ( key === '#default' ) {
                defaultLabel = label;
                continue;
            }

            if ( !key || seen[ key ] ) continue;
            seen[ key ] = true;
            options.push( { value: key, label: label || key } );
        }

        return { test: test, options: options, defaultLabel: defaultLabel };
    }

    /* 从 switch 的 test 表达式里取“默认键”：
       {{{entity|0}}} -> 0；{{{entity}}} -> 空；字面量键 -> 自身 */
    function switchDefaultValue( test, sw ) {
        var t = String( test == null ? '' : test ).trim();
        var direct = /^\{\{\{([\s\S]*?)\}\}\}$/.exec( t );

        if ( direct ) {
            var parts = splitTopLevel( direct[ 1 ], '|' );
            return parts.length > 1 ? parts.slice( 1 ).join( '|' ).trim() : '';
        }

        var scanned = scanTripleBraces( t );
        if ( scanned.length ) return scanned[ 0 ].default || '';

        if ( sw && sw.options ) {
            for ( var i = 0; i < sw.options.length; i++ ) {
                if ( String( sw.options[ i ].value ) === t ) return t;
            }
        }

        return '';
    }

    function cleanOptionLabel( label ) {
        var s = String( label == null ? '' : label ).trim();
        s = s.replace( /\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2' );
        s = s.replace( /\[\[([^\]]+)\]\]/g, '$1' );
        s = s.replace( /'''/g, '' ).replace( /''/g, '' );
        s = s.replace( /<[^>]*>/g, '' );
        return s.trim();
    }

    function optionDisplayText( opt ) {
        if ( !opt ) return '';

        var text = cleanOptionLabel( opt.label );
        var value = String( opt.value );

        /* 模板里如果还是英文选项文案，优先换成 X-CS 文档里的中文含义 */
        if ( opt.hint && ( !text || text === value ||
             !/[一-鿿]/.test( text ) ) ) {
            return opt.hint;
        }

        if ( !text ) return value;
        return text;
    }

    function optionLabel( options, value ) {
        if ( !options ) return '';
        var v = String( value == null ? '' : value );

        for ( var i = 0; i < options.length; i++ ) {
            if ( String( options[ i ].value ) === v ) {
                return optionDisplayText( options[ i ] );
            }
        }
        return '';
    }

    /* 扫描源码里的 #switch，把选项挂到它 test 里用到的参数上 */
    function collectSwitchParamOptions( text ) {
        var map = Object.create( null );
        var i = 0;

        while ( i < text.length ) {
            var start = text.indexOf( '{{', i );
            if ( start === -1 ) break;

            var end = findTemplateEndAt( text, start );
            if ( end === -1 ) break;

            var invocation = text.slice( start, end );
            var sw = parseSwitchExpression( invocation );

            if ( sw ) {
                var testParams = scanTripleBraces( sw.test );

                for ( var j = 0; j < testParams.length; j++ ) {
                    var name = testParams[ j ].name;
                    if ( !name || map[ name ] ) continue;

                    map[ name ] = {
                        options: sw.options,
                        defaultValue: switchDefaultValue( sw.test, sw ),
                        defaultLabel: sw.defaultLabel
                    };
                }
            }

            /* 进入嵌套模板继续找 switch */
            i = start + 2;
        }

        return map;
    }

    /* 正确匹配三花括号的结束位置：
       {{{a|{{#switch:...}}}}}} 这类结束时会出现连续 5 个 }，
       要先关掉内层的 {{...}}，再关掉外层的 {{{...}}}。 */
    function findTripleBraceEnd( text, start ) {
        var stack = [ 'triple' ];
        var i = start + 3;

        while ( i < text.length ) {
            if ( text.substr( i, 3 ) === '{{{' ) {
                stack.push( 'triple' );
                i += 3;
                continue;
            }

            if ( text.substr( i, 2 ) === '{{' ) {
                stack.push( 'double' );
                i += 2;
                continue;
            }

            if ( text.charAt( i ) === '}' ) {
                var top = stack[ stack.length - 1 ];

                if ( top === 'triple' && text.substr( i, 3 ) === '}}}' ) {
                    stack.pop();
                    i += 3;
                    if ( !stack.length ) return i;
                    continue;
                }

                if ( top === 'double' && text.substr( i, 2 ) === '}}' ) {
                    stack.pop();
                    i += 2;
                    continue;
                }

                i++;
                continue;
            }

            i++;
        }

        return -1;
    }

    /* 扫描 {{{参数名|默认值}}}，支持嵌套三花括号 */
    function scanTripleBraces( text ) {
        var found = [];
        var seen = Object.create( null );
        var i = 0;

        while ( i < text.length ) {
            var start = text.indexOf( '{{{', i );
            if ( start === -1 ) break;

            var end = findTripleBraceEnd( text, start );
            if ( end === -1 ) break;

            var inner = text.slice( start + 3, end - 3 );
            var parts = splitTopLevel( inner, '|' );
            var name = String( parts[ 0 ] || '' ).trim();

            if ( name && !/[{}]/.test( name ) && !seen[ name ] ) {
                var defText = parts.length > 1
                    ? parts.slice( 1 ).join( '|' ).trim()
                    : '';
                var options = null;
                var switchDefaultLabel = '';
                var skip = false;

                /* 参数默认值本身就是一个 #switch：它其实是在选这个参数的值 */
                var sw = defText ? parseSwitchExpression( defText ) : null;
                if ( sw ) {
                    var testParams = scanTripleBraces( sw.test );
                    var testName = testParams.length ? testParams[ 0 ].name : '';

                    if ( testName && testName !== name ) {
                        /* 外层只是把 switch 结果再包一层，真正可填的是 test 参数 */
                        skip = true;
                    } else {
                        options = sw.options;
                        switchDefaultLabel = sw.defaultLabel;
                        defText = switchDefaultValue( sw.test, sw );
                    }
                }

                if ( !skip ) {
                    seen[ name ] = true;
                    found.push( {
                        name: name,
                        default: defText,
                        options: options,
                        switchDefaultLabel: switchDefaultLabel
                    } );
                }
            }

            /* 继续扫描内部，嵌套参数（如 {{{a|{{{b|}}}}}}）也能读到 */
            i = start + 3;
        }

        return found;
    }

    function extractTemplateParamDefs( source ) {
        var rawText = String( source == null ? '' : source )
            .replace( /<!--[\s\S]*?-->/g, '' );
        var text = rawText
            .replace( /<noinclude\b[^>]*>[\s\S]*?<\/noinclude\s*>/gi, '' )
            .replace(
                /<(nowiki|pre|code|syntaxhighlight|source)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
                ''
            );

        var defs = [];
        var byKey = Object.create( null );

        var td = null;
        /* templatedata 有时放在 <noinclude> 文档区，所以从原文找 */
        var tdMatch = /<templatedata\b[^>]*>([\s\S]*?)<\/templatedata\s*>/i.exec( rawText );
        if ( tdMatch ) {
            try { td = JSON.parse( tdMatch[ 1 ] ); } catch ( e ) { td = null; }
        }

        if ( td && td.params && typeof td.params === 'object' ) {
            var order = Array.isArray( td.paramOrder )
                ? td.paramOrder.map( String )
                : [];

            /* paramOrder 只规定展示顺序，不能漏掉没列进去的参数 */
            Object.keys( td.params ).forEach( function ( key ) {
                if ( order.indexOf( key ) === -1 ) order.push( key );
            } );

            for ( var i = 0; i < order.length; i++ ) {
                var key = String( order[ i ] );
                if ( !key || byKey[ key ] !== undefined ) continue;
                if ( !Object.prototype.hasOwnProperty.call( td.params, key ) ) continue;

                var p = td.params[ key ] || {};
                if ( p.deprecated ) {
                    /* 标记为已读，避免下面的源码扫描又把它加回来 */
                    byKey[ key ] = { key: key, deprecated: true };
                    continue;
                }

                var def = {
                    key: key,
                    label: typeof p.label === 'string' ? p.label : '',
                    description: typeof p.description === 'string' ? p.description : '',
                    default: typeof p.default === 'string' ? p.default : '',
                    required: !!p.required,
                    example: typeof p.example === 'string' ? p.example : '',
                    options: null,
                    switchDefaultLabel: ''
                };

                byKey[ key ] = def;
                defs.push( def );
            }
        }

        /* templatedata 只是文档，真正用到的参数以模板源码为准 */
        var scanText = tdMatch
            ? text.replace( /<templatedata\b[^>]*>[\s\S]*?<\/templatedata\s*>/gi, '' )
            : text;

        var scanned = scanTripleBraces( scanText );

        for ( var j = 0; j < scanned.length; j++ ) {
            var item = scanned[ j ];
            var name = item.name;

            if ( byKey[ name ] ) {
                if ( !byKey[ name ].default && item.default ) {
                    byKey[ name ].default = item.default;
                }
                if ( !byKey[ name ].options && item.options ) {
                    byKey[ name ].options = item.options;
                }
                if ( !byKey[ name ].switchDefaultLabel && item.switchDefaultLabel ) {
                    byKey[ name ].switchDefaultLabel = item.switchDefaultLabel;
                }
                continue;
            }

            var auto = {
                key: name,
                label: /^\d+$/.test( name ) ? '位置参数 ' + name : '',
                description: '',
                default: item.default || '',
                required: false,
                example: '',
                options: item.options || null,
                switchDefaultLabel: item.switchDefaultLabel || ''
            };

            byKey[ name ] = auto;
            defs.push( auto );
        }

        /* 参数是 #switch 的 test 时（{{#switch:{{{entity|0}}}|...}}），
           也从 switch 里补出下拉选项和默认键 */
        var switchMap = collectSwitchParamOptions( scanText );

        for ( var k = 0; k < defs.length; k++ ) {
            var info = switchMap[ defs[ k ].key ];
            if ( !info ) continue;

            if ( !defs[ k ].options || !defs[ k ].options.length ) {
                defs[ k ].options = info.options;
            }
            if ( !defs[ k ].default && info.defaultValue ) {
                defs[ k ].default = info.defaultValue;
            }
            if ( !defs[ k ].switchDefaultLabel ) {
                defs[ k ].switchDefaultLabel = info.defaultLabel;
            }
        }

        return defs;
    }

    function applyTemplateSourceStyles( source ) {
        if ( !source ) return;

        /* 模板页面自己的 {{CSS|...}} / <templatestyles> 也一并加载 */
        var info = extractPageMeta( source );
        if ( info.css && info.css.length ) applyPageCss( info.css );
    }

    /* 原生编辑器把正文藏在 CodeMirror 里时，直接读当前页面源码兜底 */
    function fetchPageSource() {
        return ensureApi().then( function () {
            var api = new mw.Api();
            return api.get( {
                action: 'query',
                format: 'json',
                formatversion: 2,
                titles: PAGE,
                prop: 'revisions',
                rvprop: 'content',
                rvslots: 'main',
                rvlimit: 1
            } );
        } ).then( function ( res ) {
            var pages = res && res.query && res.query.pages;
            var page = pages && pages[ 0 ];
            if ( !page || page.missing ) return '';

            var rev = page.revisions && page.revisions[ 0 ];
            var content = '';

            if ( rev ) {
                if ( rev.slots && rev.slots.main ) {
                    content = rev.slots.main.content;
                    if ( content == null ) content = rev.slots.main[ '*' ];
                }
                if ( content == null ) content = rev[ '*' ];
            }

            return typeof content === 'string' ? content : '';
        } );
    }

    function fetchTemplateInfo( name ) {
        var title = normalizeTemplateTitle( name );
        if ( !title ) return Promise.reject( new Error( '模板名为空' ) );
        if ( templateInfoCache[ title ] ) return templateInfoCache[ title ];

        var promise = ensureApi().then( function () {
            var api = new mw.Api();
            return api.get( {
                action: 'query',
                format: 'json',
                formatversion: 2,
                titles: title,
                redirects: 1,
                prop: 'revisions',
                rvprop: 'content',
                rvslots: 'main',
                rvlimit: 1
            } );
        } ).then( function ( res ) {
            var pages = res && res.query && res.query.pages;
            var page = pages && pages[ 0 ];

            if ( !page || page.missing ) throw new Error( '模板页面不存在' );

            var rev = page.revisions && page.revisions[ 0 ];
            var source = '';

            if ( rev ) {
                if ( rev.slots && rev.slots.main ) {
                    source = rev.slots.main.content;
                    if ( source == null ) source = rev.slots.main[ '*' ];
                }
                if ( source == null && rev[ '*' ] != null ) source = rev[ '*' ];
            }

            source = String( source || '' );
            if ( !source.trim() ) throw new Error( '模板页面没有内容' );

            applyTemplateSourceStyles( source );

            var pageTitle = page.title || title;
            var params = extractTemplateParamDefs( source );

            /* X-CS 文档内置中文名/说明，只补模板自己没写的部分 */
            applyCommonParamLabels( pageTitle, params );
            applyCommonValueHints( pageTitle, params );

            return {
                title: pageTitle,
                source: source,
                params: params
            };
        } );

        templateInfoCache[ title ] = promise;
        promise.catch( function () { delete templateInfoCache[ title ]; } );

        return promise;
    }

    function looksLikeCss( value ) {
        var v = String( value == null ? '' : value ).trim();
        if ( !v ) return false;
        if ( /\.css(?:\?|$)/i.test( v ) ) return false;

        return /[{};]/.test( v ) ||
            /(?:^|[\s;])(?:color|background|margin|padding|border|font|display|width|height|position|text-align)\s*:/i.test( v );
    }

    /* 抽取页面级样式 / 布局魔术模板，编辑区不显示，但保存时保留 */
    function isInsideComment( text, index ) {
        var before = text.slice( 0, index );
        var open = before.lastIndexOf( '<!--' );
        if ( open === -1 ) return false;
        return before.lastIndexOf( '-->' ) < open;
    }

    function extractPageMeta( raw ) {
        var text = String( raw == null ? '' : raw ).replace( /\r\n?/g, '\n' );
        var metaItems = [];
        var cssItems = [];

        function remember( item, pos ) {
            if ( item ) metaItems.push( { item: item, pos: pos } );
        }

        function addCss( entry, pos ) {
            cssItems.push( { entry: entry, pos: pos } );
        }

        /* 页面级 <templatestyles src="..." />：MediaWiki 的标准样式扩展标签 */
        var tagRe = /<templatestyles\b([^>]*?)\/?>/gi;
        var tagMatch;
        while ( ( tagMatch = tagRe.exec( text ) ) !== null ) {
            if ( isInsideComment( text, tagMatch.index ) ) continue;

            var attrs = tagMatch[ 1 ] || '';
            var srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec( attrs );
            var src = '';

            if ( srcMatch ) {
                src = srcMatch[ 1 ] != null ? srcMatch[ 1 ] :
                    ( srcMatch[ 2 ] != null ? srcMatch[ 2 ] : srcMatch[ 3 ] );
            }

            src = String( src || '' ).trim();
            if ( src ) addCss( { type: 'link', target: src }, tagMatch.index );
            remember( tagMatch[ 0 ], tagMatch.index );
        }

        /* {{#tag:templatestyles|src=...}} 写法 */
        var tagFuncRe = /\{\{#tag:\s*templatestyles\s*\|\s*src\s*=\s*([^}|]+?)\s*\}\}/gi;
        var funcMatch;
        while ( ( funcMatch = tagFuncRe.exec( text ) ) !== null ) {
            if ( isInsideComment( text, funcMatch.index ) ) continue;

            var funcSrc = String( funcMatch[ 1 ] || '' ).trim();
            if ( funcSrc ) addCss( { type: 'link', target: funcSrc }, funcMatch.index );
            remember( funcMatch[ 0 ], funcMatch.index );
        }

        var i = 0;
        while ( i < text.length ) {
            var start = text.indexOf( '{{', i );
            if ( start === -1 ) break;

            var end = findTemplateEndAt( text, start );
            if ( end === -1 ) break;

            var invocation = text.slice( start, end );
            var parsed = parseTemplateInvocation( invocation );
            i = end;

            if ( !parsed ) continue;
            if ( isInsideComment( text, start ) ) continue;

            var lname = parsed.name.toLowerCase();
            var base = lname.split( ':' )[ 0 ];

            if ( lname === 'css' || base === 'css' ) {
                var first = parsed.params[ 0 ];

                if ( first ) {
                    var key = String( first.key || '' ).trim().toLowerCase();
                    var value = String( first.value || '' ).trim();

                    if ( first.positional ) {
                        if ( value ) {
                            if ( looksLikeCss( value ) ) {
                                addCss( { type: 'inline', text: first.value }, start );
                            } else {
                                addCss( { type: 'link', target: value }, start );
                            }
                        }
                    } else if ( /^(content|css|style|text|1)$/.test( key ) ) {
                        addCss( { type: 'inline', text: first.value }, start );
                    } else if ( /^(url|src|file|href|page|target|path)$/.test( key ) ) {
                        if ( value ) addCss( { type: 'link', target: value }, start );
                    } else if ( value ) {
                        if ( looksLikeCss( value ) ) {
                            addCss( { type: 'inline', text: first.value }, start );
                        } else {
                            addCss( { type: 'link', target: value }, start );
                        }
                    }
                }

                remember( invocation, start );
            } else if ( /^(nosidebar|displaytitle|defaultsort)$/.test( base ) ) {
                remember( invocation, start );
            }
        }

        metaItems.sort( function ( a, b ) { return a.pos - b.pos; } );
        cssItems.sort( function ( a, b ) { return a.pos - b.pos; } );

        var meta = [];
        for ( var m = 0; m < metaItems.length; m++ ) {
            if ( meta.indexOf( metaItems[ m ].item ) === -1 ) {
                meta.push( metaItems[ m ].item );
            }
        }

        var css = [];
        for ( var c = 0; c < cssItems.length; c++ ) {
            css.push( cssItems[ c ].entry );
        }

        return { meta: meta, css: css };
    }

    function applyPageCss( styles ) {
        if ( !styles || !styles.length ) return;

        for ( var i = 0; i < styles.length; i++ ) {
            var item = styles[ i ];
            if ( !item ) continue;

            if ( item.type === 'inline' ) {
                var css = String( item.text || '' ).replace( /^\n+|\n+$/g, '' );
                rememberHeadStyle( css, 'data-nv-page-css' );
            } else if ( item.type === 'link' && item.target ) {
                var target = String( item.target ).trim();
                if ( !target ) continue;

                var href;

                if ( /^(?:https?:)?\/\//i.test( target ) ) {
                    href = target;
                } else if ( window.mw && mw.util && mw.util.getUrl ) {
                    href = mw.util.getUrl( target, {
                        action: 'raw',
                        ctype: 'text/css'
                    } );
                } else {
                    href = target;
                }

                rememberHeadLink( href );
            }
        }
    }

    /* ==========================================================
     * 纯文字过滤：读出页面时排除代码 / 表格，保留模板和图片控件
     * ========================================================== */

    /* 去掉 {{...}}，支持嵌套 */
    function removeTemplates( text ) {
        var out = '';
        var i = 0;

        while ( i < text.length ) {
            var start = text.indexOf( '{{', i );
            if ( start === -1 ) {
                out += text.slice( i );
                break;
            }

            out += text.slice( i, start );

            var depth = 0;
            var j = start;
            var end = -1;

            while ( j < text.length - 1 ) {
                if ( text.charAt( j ) === '{' && text.charAt( j + 1 ) === '{' ) {
                    depth++;
                    j += 2;
                } else if ( text.charAt( j ) === '}' && text.charAt( j + 1 ) === '}' ) {
                    depth--;
                    j += 2;
                    if ( depth === 0 ) {
                        end = j;
                        break;
                    }
                } else {
                    j++;
                }
            }

            if ( end === -1 ) {
                /* 没有闭合的模板，剩余部分直接丢弃 */
                break;
            }
            i = end;
        }

        return out;
    }

    /* 先把居中块保护起来，避免接下来的标签清理误伤 */
    function protectCenterBlocks( text ) {
        var vault = [];

        function hold( inner ) {
            var id = '\u0000NVC' + vault.length + '\u0000';
            vault.push( inner );
            return id;
        }

        text = text.replace(
            /<div\b([^>]*)>([\s\S]*?)<\/div\s*>/gi,
            function ( m, attrs, inner ) {
                if ( !/text-align\s*:\s*center/i.test( attrs ) ) return m;
                return hold( inner );
            }
        );

        text = text.replace(
            /<center\b[^>]*>([\s\S]*?)<\/center\s*>/gi,
            function ( m, inner ) {
                return hold( inner );
            }
        );

        return { text: text, vault: vault };
    }

    /* 只保留排版需要的行内标签 */
    function stripUnknownTags( text ) {
        return text.replace(
            /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
            function ( m, name ) {
                var n = name.toLowerCase();
                if ( /^(b|strong|i|em|u|s|del|strike|br)$/.test( n ) ) {
                    return m;
                }
                if ( /^(p|div|section|article|blockquote|li|ul|ol|tr|td|th|table|h[1-6])$/.test( n ) ) {
                    return '\n';
                }
                return '';
            }
        );
    }

    /* 把“div 包着单个模板”的控件外壳整体保护起来 */
    function protectTemplateWrappers( text, vault ) {
        return text.replace(
            /<div\b([^>]*)>([\s\S]*?)<\/div\s*>/gi,
            function ( m, attrs, inner ) {
                if ( !/(float\s*:\s*(?:left|right)|text-align\s*:\s*center|clear\s*:\s*both|margin-left\s*:)/i.test( attrs ) ) {
                    return m;
                }
                if ( !isSingleTemplate( inner ) ) return m;
                if ( isMetaTemplate( inner ) ) return m;

                var id = '\u0000NVW' + vault.length + '\u0000';
                vault.push( m );
                return id;
            }
        );
    }

    /* 保留正文模板，剔除布局模板与解析函数 */
    function protectTemplates( text, vault ) {
        var out = '';
        var i = 0;

        while ( i < text.length ) {
            var start = text.indexOf( '{{', i );
            if ( start === -1 ) {
                out += text.slice( i );
                break;
            }

            out += text.slice( i, start );

            var end = findTemplateEndAt( text, start );
            if ( end === -1 ) {
                out += text.slice( start );
                break;
            }

            var invocation = text.slice( start, end );
            if ( !isMetaTemplate( invocation ) ) {
                var id = '\u0000NVT' + vault.length + '\u0000';
                vault.push( invocation );
                out += id;
            }

            i = end;
        }

        return out;
    }

    function protectImages( text, vault ) {
        return text.replace(
            /\[\[(?:File|Image):[^\]\n]*\]\]/gi,
            function ( m ) {
                var id = '\u0000NVI' + vault.length + '\u0000';
                vault.push( m );
                return id;
            }
        );
    }

    function stripCodeConstructs( wikitext, dropWidgets ) {
        var src = String( wikitext == null ? '' : wikitext )
            .replace( /\r\n?/g, '\n' );

        var centerVault = [];
        var wrapperVault = [];
        var templateVault = [];
        var imageVault = [];

        if ( !dropWidgets ) {
            /* 控件外壳先整体保护，居中模板的 margin/clear 也原样保留 */
            src = protectTemplateWrappers( src, wrapperVault );
        }

        var guarded = protectCenterBlocks( src );
        src = guarded.text;
        centerVault = guarded.vault;

        if ( dropWidgets ) {
            /* 粘贴 / 拖入：模板与图片全部去掉 */
            src = removeTemplates( src );
            src = src.replace( /\[\[(?:File|Image):[^\]\n]*\]\]/gi, '' );
        } else {
            src = protectTemplates( src, templateVault );
            src = protectImages( src, imageVault );
        }

        /* 注释 */
        src = src.replace( /<!--[\s\S]*?-->/g, '' );

        /* 代码 / 扩展标签：连内容一起移除 */
        src = src.replace(
            /<(syntaxhighlight|source|pre|code|nowiki|script|style|math|gallery|tabber|ref|references|templatedata|mapframe|maplink)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
            '\n\n'
        );
        src = src.replace(
            /<(?:ref|references)\b[^>]*\/>/gi,
            ''
        );

        /* 表格 */
        src = src.replace( /\{\|[\s\S]*?\|\}/g, '' );

        /* 普通链接只保留显示文字 */
        src = src.replace( /\[\[([^\]\n|]+)\|([^\]\n]*)\]\]/g, '$2' );
        src = src.replace( /\[\[([^\]\n]+)\]\]/g, '$1' );

        /* 外部链接只保留文字 */
        src = src.replace( /\[https?:\/\/[^\s\]]+\s+([^\]]*)\]/gi, '$1' );
        src = src.replace( /\[https?:\/\/[^\]]*\]/gi, '' );

        /* 魔术字 */
        src = src.replace( /__[A-Z]+__/g, '' );

        /* 行首列表 / 缩进标记压平成普通文字 */
        src = src.replace( /^[ \t]*[#*;:]+\s?/gm, '' );

        /* 段落标签先转成空行，再清理其它标签 */
        src = src.replace( /<p\b[^>]*>/gi, '\n\n' );
        src = src.replace( /<\/p\s*>/gi, '\n\n' );
        src = stripUnknownTags( src );

        /* 还原居中块 */
        src = src.replace( /\u0000NVC(\d+)\u0000/g, function ( m, i ) {
            var inner = centerVault[ parseInt( i, 10 ) ] || '';
            inner = stripCodeConstructs( inner, dropWidgets );
            inner = inner.replace( /^\n+|\n+$/g, '' );

            var parts = inner.split( /\n\s*\n/ );
            var out = [];

            for ( var k = 0; k < parts.length; k++ ) {
                var p = parts[ k ].replace( /^\n+|\n+$/g, '' );
                if ( !p.trim() ) continue;
                p = p.replace( /\n/g, '<br>' );
                out.push( '<div style="text-align:center">' + p + '</div>' );
            }

            return out.length ? out.join( '\n\n' ) : '';
        } );

        /* 控件外壳 / 图片 / 模板：循环还原，处理相互嵌套 */
        for ( var pass = 0; pass < 2; pass++ ) {
            src = src.replace( /\u0000NVW(\d+)\u0000/g, function ( m, i ) {
                return wrapperVault[ parseInt( i, 10 ) ] || '';
            } );
            src = src.replace( /\u0000NVI(\d+)\u0000/g, function ( m, i ) {
                return imageVault[ parseInt( i, 10 ) ] || '';
            } );
            src = src.replace( /\u0000NVT(\d+)\u0000/g, function ( m, i ) {
                return templateVault[ parseInt( i, 10 ) ] || '';
            } );
        }

        return src;
    }

    function looksLikeMarkup( text ) {
        return /<\/?[a-zA-Z][^>]*>|\{\{|\{\||\[\[|'''|''|^={1,6}\s|^[ \t]*[#*;:]|^-{4,}\s*$|__[A-Z]+__/m
            .test( String( text == null ? '' : text ) );
    }

    /* 判断页面里是否有需要排除的代码 / 表格 / 解析函数 */
    function hasCodeLike( text ) {
        return /<!--|<(syntaxhighlight|source|pre|code|nowiki|script|style|math|gallery|tabber|ref|references)\b|\{\||__[A-Z]+__|^[ \t]*[#*;:]|\{\{\s*#/i
            .test( String( text == null ? '' : text ) );
    }

    /* 粘贴 / 拖入时使用的纯文字清洗 */
    function plainProse( text ) {
        var out = stripCodeConstructs( text, true );

        out = out.replace( /'''/g, '' ).replace( /''/g, '' );
        out = out.replace( /^={1,6}\s*(.*?)\s*={1,6}$/gm, '$1' );
        out = out.replace( /^(-{4,})\s*$/gm, '' );
        out = out.replace( /<\/?[a-zA-Z][^>]*>/g, '' );
        out = out.replace( /\u0000NVC\d+\u0000/g, '' );
        out = decodeEntities( out );

        return out
            .replace( /\n{3,}/g, '\n\n' )
            .replace( /^\n+|\n+$/g, '' );
    }

    /* ==========================================================
     * Wikitext -> 编辑器 HTML
     * ========================================================== */
    function inlineToHtml( text ) {
        /*
         * &#39; 是正文里真正的撇号，不是 Wikitext 的粗体/斜体标记。
         * 先换成哨兵，等引号语法解析完再还原。
         */
        var source = String( text ).replace( /&#0*39;|&#[xX]0*27;/g, APOS );
        var s = escapeBasic( decodeEntities( source ) );

        s = s.replace( /&lt;br\s*\/?&gt;/gi, '<br>' );
        s = s.replace( /&lt;(\/?)(u|s|b|i|strong|em|del|strike)&gt;/gi, '<$1$2>' );

        s = s.replace( /'''''([\s\S]+?)'''''/g, '<strong><em>$1</em></strong>' );
        s = s.replace( /'''([\s\S]+?)'''/g, '<strong>$1</strong>' );
        s = s.replace( /''([\s\S]+?)''/g, '<em>$1</em>' );

        s = s.replace( new RegExp( APOS, 'g' ), "'" );

        s = s.replace(
            /\u0000NVK(IO|IC|I|CO|CC|B)(\d+)\u0000/g,
            function ( m, kind, idStr ) {
                var token = currentConversionVault &&
                    currentConversionVault[ parseInt( idStr, 10 ) ];
                if ( !token ) return '';

                if ( kind === 'IO' ) {
                    return token.kind === 'inline-open'
                        ? inlineContainerOpenHtml( token )
                        : inlineCodeHtml( token, false );
                }

                if ( kind === 'IC' ) return '</span>';
                if ( kind === 'I' ) return inlineCodeHtml( token, false );
                if ( kind === 'B' ) return inlineCodeHtml( token, true );

                if ( kind === 'CO' ) {
                    return token.kind === 'block-open' && token.closeRaw
                        ? blockContainerOpenHtml( token )
                        : inlineCodeHtml( token, true );
                }

                if ( kind === 'CC' ) return '</div>';

                return '';
            }
        );

        s = s.replace( /\n/g, '<br>' );

        return s;
    }

    function isCenterOpenTag( line ) {
        var m = /^<div\b([^>]*)>$/i.exec( line );
        if ( !m ) return false;
        return /text-align\s*:\s*center/i.test( m[ 1 ] );
    }

    function isCenterWrapTag( line ) {
        var m = /^<div\b([^>]*)>([\s\S]*?)<\/div\s*>$/i.exec( line );
        if ( !m ) return null;
        if ( !/text-align\s*:\s*center/i.test( m[ 1 ] ) ) return null;
        return m[ 2 ];
    }

    function parseImageSpec( body ) {
        var parts = body.split( '|' );
        var name = ( parts.shift() || '' ).trim();
        if ( !name ) return null;
        if ( /[\[\]\n]/.test( name ) ) return null;

        var pos = '';
        var width = 0;
        var isThumb = false;

        for ( var i = 0; i < parts.length; i++ ) {
            var p = parts[ i ].trim();
            if ( !p ) continue;

            if ( /^(left|right|center)$/i.test( p ) ) {
                pos = p.toLowerCase();
            } else if ( /^(\d+)(?:x\d+)?(?:px)?$/i.test( p ) ) {
                width = parseInt( p, 10 );
            } else if ( /^thumb(?:nail)?$/i.test( p ) ) {
                isThumb = true;
            }
        }

        if ( !pos ) pos = isThumb ? 'right' : 'center';

        return {
            type: 'image',
            name: name,
            width: width,
            pos: pos
        };
    }

    function classifyBlock( content, center ) {
        var trimmed = content.trim();

        var codeMatch = /^\u0000NVK(CO|CC|B)(\d+)\u0000$/.exec( trimmed );
        if ( codeMatch ) {
            return {
                type: 'code',
                kind: codeMatch[ 1 ],
                id: parseInt( codeMatch[ 2 ], 10 )
            };
        }

        if ( center && isSingleTemplate( trimmed ) ) {
            return { type: 'template', invocation: trimmed, pos: 'center' };
        }

        /* div 外壳包裹的模板 */
        var wm = /^<div\b([^>]*)>([\s\S]*?)<\/div\s*>$/i.exec( trimmed );
        if ( wm && isSingleTemplate( wm[ 2 ] ) ) {
            var attrs = wm[ 1 ];
            var pos = 'grid';
            var offset = 0;

            if ( /float\s*:\s*left/i.test( attrs ) ) {
                pos = 'left';
            } else if ( /float\s*:\s*right/i.test( attrs ) ) {
                pos = 'right';
            } else if ( /text-align\s*:\s*center/i.test( attrs ) ) {
                pos = 'center';
            } else {
                var ml = /margin-left\s*:\s*(-?\d+(?:\.\d+)?)px/i.exec( attrs );
                if ( ml ) {
                    offset = Math.max( 0, Math.round( parseFloat( ml[ 1 ] ) ) );
                }
            }

            return {
                type: 'template',
                invocation: wm[ 2 ].trim(),
                pos: pos,
                offset: offset
            };
        }

        /* 单独成行的模板 */
        if ( isSingleTemplate( trimmed ) ) {
            return { type: 'template', invocation: trimmed, pos: 'grid', offset: 0 };
        }

        /* 单独成行的图片 */
        var im = /^\[\[(?:File|Image):([^\]\n]+)\]\]$/i.exec( trimmed );
        if ( im ) {
            var spec = parseImageSpec( im[ 1 ] );
            if ( spec ) return spec;
        }

        return { type: 'text', center: center, text: content };
    }

    /* ==========================================================
     * 隐藏代码：保留原文，不显示，也不允许误删
     * ========================================================== */

    var currentConversionVault = null;

    function findTagEnd( text, start ) {
        var quote = null;

        for ( var i = start + 1; i < text.length; i++ ) {
            var ch = text.charAt( i );

            if ( quote ) {
                if ( ch === quote ) quote = null;
            } else if ( ch === '"' || ch === "'" ) {
                quote = ch;
            } else if ( ch === '>' ) {
                return i + 1;
            }
        }

        return -1;
    }

    function parseTagAt( text, start ) {
        if ( text.charAt( start ) !== '<' ) return null;

        var end = findTagEnd( text, start );
        if ( end === -1 ) return null;

        var raw = text.slice( start, end );
        var m = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([\s\S]*?)>$/.exec( raw );
        if ( !m ) return null;

        return {
            raw: raw,
            start: start,
            end: end,
            close: !!m[ 1 ],
            tag: m[ 2 ].toLowerCase(),
            attrs: m[ 3 ] || '',
            selfClosing: /\/\s*>$/.test( raw )
        };
    }

    function isFormattingTag( tag ) {
        return /^(b|strong|i|em|u|s|del|strike|br)$/.test( tag );
    }

    function isVoidTag( tag ) {
        return /^(area|base|br|col|embed|hr|img|input|link|meta|param|track|wbr)$/.test( tag );
    }

    function isRawCodeTag( tag ) {
        return /^(style|script|pre|code|syntaxhighlight|source|nowiki|math|gallery|tabber|ref|references|templatedata|mapframe|maplink|noinclude|includeonly|onlyinclude|inputbox|score|timeline|graph|categorytree|imagemap|ce|chem)$/.test( tag );
    }

    function isBlockContainerTag( tag ) {
        return /^(div|section|article|blockquote|center|figure|figcaption|details|summary|poem|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|ul|ol|li|dl|dt|dd)$/.test( tag );
    }

    function isInlineContainerTag( tag ) {
        return /^(span|a|font|small|big|sub|sup|abbr|q|mark|time|bdi|bdo|ruby|rt|rp|ins|kbd|samp|var|cite|dfn|p|h[1-6])$/.test( tag );
    }

    function findMatchingCloseTag( text, from, tag ) {
        var depth = 1;
        var i = from;

        while ( i < text.length ) {
            var lt = text.indexOf( '<', i );
            if ( lt === -1 ) return null;

            if ( text.substr( lt, 4 ) === '<!--' ) {
                var cmt = text.indexOf( '-->', lt + 4 );
                if ( cmt === -1 ) return null;
                i = cmt + 3;
                continue;
            }

            var t = parseTagAt( text, lt );
            if ( !t ) {
                i = lt + 1;
                continue;
            }

            if ( t.tag !== tag && isRawCodeTag( t.tag ) && !t.close && !t.selfClosing ) {
                var skip = findMatchingCloseTag( text, t.end, t.tag );
                if ( skip ) {
                    i = skip.end;
                    continue;
                }
            }

            if ( t.tag === tag ) {
                if ( t.close ) {
                    depth--;
                    if ( depth === 0 ) return t;
                } else if ( !t.selfClosing && !isVoidTag( t.tag ) ) {
                    depth++;
                }
            }

            i = t.end;
        }

        return null;
    }

    function isBlockLike( text, start, end ) {
        var lineStart = text.lastIndexOf( '\n', start - 1 ) + 1;
        var lineEnd = text.indexOf( '\n', end );
        if ( lineEnd === -1 ) lineEnd = text.length;

        return !text.slice( lineStart, start ).trim() &&
            !text.slice( end, lineEnd ).trim();
    }

    function isTemplateWrapperAt( text, tag ) {
        if ( tag.tag !== 'div' ) return false;
        if ( !/(float\s*:\s*(?:left|right)|text-align\s*:\s*center|clear\s*:\s*both|margin-left\s*:)/i.test( tag.attrs ) ) {
            return false;
        }

        var close = findMatchingCloseTag( text, tag.end, 'div' );
        if ( !close ) return false;

        var inner = text.slice( tag.end, close.start ).trim();
        return isSingleTemplate( inner );
    }

    function findWikitextTableEnd( text, start ) {
        var depth = 0;
        var i = start;

        while ( i < text.length ) {
            var lineEnd = text.indexOf( '\n', i );
            if ( lineEnd === -1 ) lineEnd = text.length;

            var line = text.slice( i, lineEnd );

            if ( /^\s*\{\|/.test( line ) ) depth++;
            if ( /^\s*\|\}/.test( line ) ) {
                depth--;
                if ( depth === 0 ) return lineEnd;
            }

            i = lineEnd + 1;
        }

        return -1;
    }

    function codeLabel( raw ) {
        var s = String( raw || '' ).replace( /\s+/g, ' ' ).trim();

        if ( s.indexOf( '<!--' ) === 0 ) return '注释';
        if ( s.indexOf( '{|' ) === 0 ) return '表格';

        var tag = /^<\s*\/?\s*([a-zA-Z0-9]+)/.exec( s );
        if ( tag ) return '<' + tag[ 1 ].toLowerCase() + '>';

        var tmpl = /^\{\{\s*([^|}\s]+)/.exec( s );
        if ( tmpl ) return '{{' + tmpl[ 1 ] + '}}';

        if ( s.indexOf( '__' ) === 0 ) return s.slice( 0, 24 );

        return s.slice( 0, 28 ) || '代码';
    }

    /*
     * 把代码/结构替换成哨兵，保留在原文位置：
     *   行内叶子代码   \0NVKI<id>\0
     *   块级叶子代码   \0NVKB<id>\0
     *   块级容器开/关  \0NVKCO<id>\0 / \0NVKCC<id>\0
     *   行内容器开/关  \0NVKIO<id>\0 / \0NVKIC<id>\0
     * vault[id] 里保存原始开闭标签，序列化时原样写回。
     */
    function tokenizeWikitext( wikitext ) {
        var text = String( wikitext == null ? '' : wikitext )
            .replace( /\r\n?/g, '\n' );
        var out = '';
        var vault = [];
        var blockStack = [];
        var inlineStack = [];
        var i = 0;

        function pushLeaf( raw, block ) {
            var id = vault.length;
            vault.push( {
                id: id,
                kind: block ? 'leaf' : 'inline-leaf',
                raw: raw,
                block: !!block,
                label: codeLabel( raw )
            } );

            var token = '\u0000NVK' + ( block ? 'B' : 'I' ) + id + '\u0000';
            return block ? '\n\n' + token + '\n\n' : token;
        }

        function pushBlockOpen( raw, tag ) {
            var id = vault.length;
            vault.push( {
                id: id,
                kind: 'block-open',
                tag: tag,
                openRaw: raw,
                closeRaw: '',
                label: tag
            } );
            blockStack.push( id );
            return '\n\n\u0000NVKCO' + id + '\u0000\n\n';
        }

        function closeBlock( raw, tag ) {
            for ( var k = blockStack.length - 1; k >= 0; k-- ) {
                var id = blockStack[ k ];
                if ( vault[ id ].tag !== tag ) continue;

                for ( var m = blockStack.length - 1; m > k; m-- ) {
                    vault[ blockStack[ m ] ].kind = 'leaf';
                    vault[ blockStack[ m ] ].raw = vault[ blockStack[ m ] ].openRaw;
                }

                blockStack.length = k;
                vault[ id ].closeRaw = raw;
                return '\n\n\u0000NVKCC' + id + '\u0000\n\n';
            }

            return pushLeaf( raw, true );
        }

        function pushInlineOpen( raw, tag ) {
            var id = vault.length;
            vault.push( {
                id: id,
                kind: 'inline-open',
                tag: tag,
                openRaw: raw,
                closeRaw: '',
                label: tag
            } );
            inlineStack.push( id );
            return '\u0000NVKIO' + id + '\u0000';
        }

        function closeInline( raw, tag ) {
            for ( var k = inlineStack.length - 1; k >= 0; k-- ) {
                var id = inlineStack[ k ];
                if ( vault[ id ].tag !== tag ) continue;

                for ( var m = inlineStack.length - 1; m > k; m-- ) {
                    vault[ inlineStack[ m ] ].kind = 'inline-leaf';
                    vault[ inlineStack[ m ] ].raw = vault[ inlineStack[ m ] ].openRaw;
                }

                inlineStack.length = k;
                vault[ id ].closeRaw = raw;
                return '\u0000NVKIC' + id + '\u0000';
            }

            return pushLeaf( raw, false );
        }

        while ( i < text.length ) {
            var ch = text.charAt( i );

            /* 注释 */
            if ( ch === '<' && text.substr( i, 4 ) === '<!--' ) {
                var cmt = text.indexOf( '-->', i + 4 );
                var cmtEnd = cmt === -1 ? text.length : cmt + 3;
                var cmtRaw = text.slice( i, cmtEnd );
                out += pushLeaf(
                    cmtRaw,
                    cmtRaw.indexOf( '\n' ) !== -1 ||
                        isBlockLike( text, i, cmtEnd )
                );
                i = cmtEnd;
                continue;
            }

            /* HTML 标签 */
            if ( ch === '<' ) {
                var tag = parseTagAt( text, i );

                if ( tag ) {
                    var tname = tag.tag;

                    if ( tname === 'templatestyles' ) {
                        var tsEnd = tag.end;
                        if ( !tag.selfClosing && !tag.close ) {
                            var tsClose = findMatchingCloseTag( text, tag.end, tname );
                            tsEnd = tsClose ? tsClose.end : -1;
                        }
                        if ( tsEnd !== -1 ) {
                            out += pushLeaf( text.slice( i, tsEnd ), true );
                            i = tsEnd;
                            continue;
                        }
                    }

                    if ( isFormattingTag( tname ) ) {
                        out += tag.raw;
                        i = tag.end;
                        continue;
                    }

                    if ( isVoidTag( tname ) ) {
                        out += pushLeaf(
                            tag.raw,
                            tname !== 'br' && isBlockLike( text, i, tag.end )
                        );
                        i = tag.end;
                        continue;
                    }

                    if ( isRawCodeTag( tname ) ) {
                        if ( tag.close || tag.selfClosing ) {
                            out += pushLeaf(
                                tag.raw,
                                isBlockLike( text, i, tag.end )
                            );
                            i = tag.end;
                            continue;
                        }

                        var rawClose = findMatchingCloseTag( text, tag.end, tname );
                        if ( rawClose ) {
                            var rawCode = text.slice( i, rawClose.end );
                            out += pushLeaf(
                                rawCode,
                                rawCode.indexOf( '\n' ) !== -1 ||
                                    isBlockLike( text, i, rawClose.end )
                            );
                            i = rawClose.end;
                            continue;
                        }

                        out += pushLeaf( tag.raw, true );
                        i = tag.end;
                        continue;
                    }

                    if ( isBlockContainerTag( tname ) ) {
                        if ( tname === 'div' && !tag.close && !tag.selfClosing &&
                             isTemplateWrapperAt( text, tag ) ) {
                            var wrap = findMatchingCloseTag( text, tag.end, 'div' );
                            out += text.slice( i, wrap.end );
                            i = wrap.end;
                            continue;
                        }

                        if ( tag.close ) {
                            out += closeBlock( tag.raw, tname );
                        } else if ( tag.selfClosing ) {
                            out += pushLeaf( tag.raw, true );
                        } else {
                            out += pushBlockOpen( tag.raw, tname );
                        }

                        i = tag.end;
                        continue;
                    }

                    if ( isInlineContainerTag( tname ) ) {
                        if ( tag.close ) {
                            out += closeInline( tag.raw, tname );
                        } else if ( tag.selfClosing ) {
                            out += pushLeaf( tag.raw, false );
                        } else {
                            out += pushInlineOpen( tag.raw, tname );
                        }

                        i = tag.end;
                        continue;
                    }

                    /* 未知标签：成对内容整体隐藏，避免把扩展代码显示出来 */
                    if ( !tag.close && !tag.selfClosing ) {
                        var unknownClose = findMatchingCloseTag( text, tag.end, tname );
                        if ( unknownClose ) {
                            out += pushLeaf(
                                text.slice( i, unknownClose.end ),
                                true
                            );
                            i = unknownClose.end;
                            continue;
                        }
                    }

                    out += pushLeaf(
                        tag.raw,
                        isBlockLike( text, i, tag.end )
                    );
                    i = tag.end;
                    continue;
                }
            }

            /* 三花括号参数 */
            if ( ch === '{' && text.substr( i, 3 ) === '{{{' ) {
                var tpEnd = findTripleBraceEnd( text, i );
                if ( tpEnd !== -1 ) {
                    out += pushLeaf(
                        text.slice( i, tpEnd ),
                        isBlockLike( text, i, tpEnd )
                    );
                    i = tpEnd;
                    continue;
                }
            }

            /* 模板 / 解析函数 */
            if ( ch === '{' && text.substr( i, 2 ) === '{{' ) {
                var tplEnd = findTemplateEndAt( text, i );
                if ( tplEnd !== -1 ) {
                    var invocation = text.slice( i, tplEnd );

                    if ( isMetaTemplate( invocation ) ) {
                        out += pushLeaf(
                            invocation,
                            invocation.indexOf( '\n' ) !== -1 ||
                                isBlockLike( text, i, tplEnd )
                        );
                    } else if ( invocation.indexOf( '\n' ) !== -1 ||
                                isBlockLike( text, i, tplEnd ) ) {
                        /* 整行模板保留为可视化控件 */
                        out += invocation;
                    } else {
                        /* 行内模板不显示代码 */
                        out += pushLeaf( invocation, false );
                    }

                    i = tplEnd;
                    continue;
                }
            }

            /* 图片：整行保留为控件，行内图片隐藏 */
            if ( ch === '[' && text.substr( i, 2 ) === '[[' &&
                 /^\[\[\s*(?:File|Image|Media)\s*:/i.test( text.slice( i ) ) ) {
                var imgEnd = text.indexOf( ']]', i + 2 );
                if ( imgEnd !== -1 ) {
                    var imgRaw = text.slice( i, imgEnd + 2 );
                    out += isBlockLike( text, i, imgEnd + 2 )
                        ? imgRaw
                        : pushLeaf( imgRaw, false );
                    i = imgEnd + 2;
                    continue;
                }
            }

            /* 内链：保留目标与显示文字，括号隐藏 */
            if ( ch === '[' && text.substr( i, 2 ) === '[[' ) {
                var linkEnd = text.indexOf( ']]', i + 2 );
                if ( linkEnd !== -1 ) {
                    var linkInner = text.slice( i + 2, linkEnd );

                    if ( /^\s*(?:category|分类)\s*:/i.test( linkInner ) ) {
                        out += pushLeaf(
                            text.slice( i, linkEnd + 2 ),
                            isBlockLike( text, i, linkEnd + 2 )
                        );
                        i = linkEnd + 2;
                        continue;
                    }

                    if ( linkInner.indexOf( '{{' ) !== -1 ||
                         linkInner.indexOf( '[[' ) !== -1 ) {
                        out += pushLeaf( text.slice( i, linkEnd + 2 ), false );
                        i = linkEnd + 2;
                        continue;
                    }

                    var pipe = linkInner.indexOf( '|' );

                    if ( pipe === -1 ) {
                        if ( !linkInner.trim() ) {
                            out += pushLeaf( text.slice( i, linkEnd + 2 ), false );
                        } else {
                            out += pushInlineOpen( '[[', 'a' );
                            out += linkInner;
                            out += closeInline( ']]', 'a' );
                        }
                    } else {
                        var target = linkInner.slice( 0, pipe );
                        var label = linkInner.slice( pipe + 1 );

                        if ( !target.trim() || !label.trim() ) {
                            out += pushLeaf( text.slice( i, linkEnd + 2 ), false );
                        } else {
                            out += pushInlineOpen( '[[' + target + '|', 'a' );
                            out += label;
                            out += closeInline( ']]', 'a' );
                        }
                    }

                    i = linkEnd + 2;
                    continue;
                }
            }

            /* 外链 */
            if ( ch === '[' &&
                 /^\[(?:\/\/|https?:\/\/)/i.test( text.slice( i ) ) ) {
                var extEnd = text.indexOf( ']', i + 1 );
                if ( extEnd !== -1 ) {
                    var extInner = text.slice( i + 1, extEnd );
                    var space = extInner.search( /\s/ );

                    if ( space === -1 || !extInner.slice( space + 1 ).trim() ) {
                        out += pushLeaf( text.slice( i, extEnd + 1 ), false );
                    } else {
                        var url = extInner.slice( 0, space );
                        var extLabel = extInner.slice( space + 1 );
                        out += pushInlineOpen( '[' + url + ' ', 'a' );
                        out += extLabel;
                        out += closeInline( ']', 'a' );
                    }

                    i = extEnd + 1;
                    continue;
                }
            }

            /* wikitext 表格 */
            if ( ch === '{' && text.charAt( i + 1 ) === '|' ) {
                var tableEnd = findWikitextTableEnd( text, i );
                if ( tableEnd !== -1 ) {
                    out += pushLeaf( text.slice( i, tableEnd ), true );
                    i = tableEnd;
                    continue;
                }
            }

            /* 魔术字 */
            if ( ch === '_' && /^__[A-Z]+__/.test( text.slice( i ) ) ) {
                var magic = /^__[A-Z]+__/.exec( text.slice( i ) )[ 0 ];
                out += pushLeaf(
                    magic,
                    isBlockLike( text, i, i + magic.length )
                );
                i += magic.length;
                continue;
            }

            out += ch;
            i++;
        }

        /* 未闭合容器：只保留原开标签，不补结束标签 */
        for ( var bi = 0; bi < blockStack.length; bi++ ) {
            var btok = vault[ blockStack[ bi ] ];
            btok.kind = 'leaf';
            btok.raw = btok.openRaw;
        }
        for ( var ii = 0; ii < inlineStack.length; ii++ ) {
            var itok = vault[ inlineStack[ ii ] ];
            itok.kind = 'inline-leaf';
            itok.raw = itok.openRaw;
        }

        return { text: out, vault: vault };
    }

    function splitWikitextBlocks( wikitext ) {
        var text = stripCodeConstructs( wikitext );

        var lines = text.split( '\n' );
        var blocks = [];
        var buf = [];
        var center = false;

        function flush() {
            if ( !buf.length ) return;
            var content = buf.join( '\n' ).replace( /^\n+|\n+$/g, '' );
            buf = [];
            if ( !content.trim() ) return;
            blocks.push( classifyBlock( content, center ) );
        }

        for ( var i = 0; i < lines.length; i++ ) {
            var raw = lines[ i ];
            var t = raw.trim();

            if ( isCenterOpenTag( t ) ) {
                flush();
                center = true;
                continue;
            }
            if ( center && /^<\/div\s*>$/i.test( t ) ) {
                flush();
                center = false;
                continue;
            }
            if ( /^<center\s*>$/i.test( t ) ) {
                flush();
                center = true;
                continue;
            }
            if ( center && /^<\/center\s*>$/i.test( t ) ) {
                flush();
                center = false;
                continue;
            }

            var inner = isCenterWrapTag( t );
            if ( inner !== null ) {
                flush();
                blocks.push( classifyBlock( inner, true ) );
                continue;
            }

            var c = /^<center\s*>([\s\S]*?)<\/center\s*>$/i.exec( t );
            if ( c ) {
                flush();
                blocks.push( classifyBlock( c[ 1 ], true ) );
                continue;
            }

            if ( !t ) {
                flush();
                continue;
            }
            buf.push( raw );
        }

        flush();
        return blocks;
    }

    function escapeAttr( text ) {
        return escapeBasic( text )
            .replace( /"/g, '&quot;' )
            .replace( /'/g, '&#39;' );
    }

    function templateWidgetHtml( spec ) {
        var pos = spec.pos || 'grid';
        var offset = Math.max( 0, Math.round( parseInt( spec.offset, 10 ) || 0 ) );
        var legacy = /^(left|right|center)$/.test( pos );
        var cls = 'nv-widget nv-widget-template' +
            ( legacy ? ' nv-pos-' + pos : ' nv-template-block' );
        var style = offset > 0
            ? ' style="margin-left:' + offset + 'px;"'
            : '';

        return '<div class="' + cls + '"' +
            ' contenteditable="false" draggable="false"' +
            ' data-nv-type="template"' +
            ' data-nv-pos="' + pos + '"' +
            ' data-nv-offset="' + offset + '"' +
            ' data-nv-invocation="' + escapeAttr( spec.invocation ) + '"' +
            style + '>' +
            '<div class="nv-widget-body mw-parser-output">' +
            '<div class="nv-widget-loading">正在渲染模板…</div>' +
            '</div>' +
            '</div>';
    }

    function imageWidgetHtml( spec ) {
        return '<div class="nv-widget nv-widget-image nv-pos-' + spec.pos + '"' +
            ' contenteditable="false" draggable="false"' +
            ' data-nv-type="image"' +
            ' data-nv-pos="' + spec.pos + '"' +
            ' data-nv-name="' + escapeAttr( spec.name ) + '"' +
            ' data-nv-width="' + ( spec.width || 0 ) + '">' +
            '<div class="nv-widget-body">' +
            '<div class="nv-widget-loading">正在载入图片…</div>' +
            '</div>' +
            '<span class="nv-widget-badge"></span>' +
            '<span class="nv-resize-handle" data-nv-handle="1"></span>' +
            '</div>';
    }

    function codePreview( raw ) {
        var s = String( raw || '' ).replace( /\s+/g, ' ' ).trim();
        return s.length > 72 ? s.slice( 0, 72 ) + '…' : s;
    }

    function blockCodeHtml( token ) {
        if ( !token ) return '';

        var raw = token.raw || token.openRaw || '';
        return '<div class="nv-code-block" contenteditable="false"' +
            ' data-nv-code-id="' + token.id + '"' +
            ' data-nv-code="' + escapeAttr( raw ) + '"' +
            ' data-nv-label="' + escapeAttr( token.label || codeLabel( raw ) ) + '"' +
            ' data-nv-preview="' + escapeAttr( codePreview( raw ) ) + '"></div>';
    }

    function blockContainerOpenHtml( token ) {
        if ( !token ) return '';

        var tag = token.tag || 'div';
        var center = tag === 'center' ||
            /text-align\s*:\s*center/i.test( token.openRaw || '' );

        return '<div class="nv-code-container nv-tag-' + escapeAttr( tag ) +
            ( center ? ' nv-tag-center' : '' ) + '"' +
            ' data-nv-container-id="' + token.id + '"' +
            ' data-nv-open="' + escapeAttr( token.openRaw || '' ) + '"' +
            ' data-nv-close="' + escapeAttr( token.closeRaw || '' ) + '"' +
            ' data-nv-tag="' + escapeAttr( tag ) + '"' +
            ' data-nv-label="' + escapeAttr( tag ) + '">';
    }

    function inlineCodeHtml( token, blocky ) {
        if ( !token ) return '';

        var raw = token.raw || token.openRaw || '';
        return '<span class="nv-code-inline' +
            ( blocky ? ' nv-code-block-inline' : '' ) + '"' +
            ' contenteditable="false"' +
            ' data-nv-code-id="' + token.id + '"' +
            ' data-nv-code="' + escapeAttr( raw ) + '"' +
            ' data-nv-label="' + escapeAttr( token.label || codeLabel( raw ) ) + '"' +
            ' data-nv-preview="' + escapeAttr( codePreview( raw ) ) + '"></span>';
    }

    function inlineContainerOpenHtml( token ) {
        if ( !token ) return '';

        var tag = token.tag || 'span';
        return '<span class="nv-code-container-inline nv-tag-' + escapeAttr( tag ) + '"' +
            ' data-nv-container-id="' + token.id + '"' +
            ' data-nv-open="' + escapeAttr( token.openRaw || '' ) + '"' +
            ' data-nv-close="' + escapeAttr( token.closeRaw || '' ) + '"' +
            ' data-nv-tag="' + escapeAttr( tag ) + '"' +
            ' data-nv-label="' + escapeAttr( tag ) + '">';
    }

    function blockToHtml( block ) {
        if ( block.type === 'code' ) {
            var token = currentConversionVault &&
                currentConversionVault[ block.id ];
            if ( !token ) return '';

            if ( block.kind === 'CO' ) {
                if ( token.kind === 'block-open' && token.closeRaw ) {
                    return blockContainerOpenHtml( token );
                }
                return blockCodeHtml( token );
            }

            if ( block.kind === 'CC' ) {
                return token.kind === 'block-open' ? '</div>' : '';
            }

            if ( block.kind === 'B' ) {
                return blockCodeHtml( token );
            }

            return '';
        }

        if ( block.type === 'template' ) return templateWidgetHtml( block );
        if ( block.type === 'image' ) return imageWidgetHtml( block );

        var text = block.text.replace( /^\n+|\n+$/g, '' );
        var trimmed = text.trim();
        if ( !trimmed ) return '';

        var hm = /^(={1,6})\s*([\s\S]*?)\s*\1\s*$/.exec( trimmed );
        if ( hm && text.indexOf( '\n' ) === -1 ) {
            var level = hm[ 1 ].length;
            var attr = block.center
                ? ' class="nv-center" style="text-align:center"'
                : '';
            return '<h' + level + attr + '>' +
                inlineToHtml( hm[ 2 ] ) +
                '</h' + level + '>';
        }

        if ( /^-{4,}\s*$/.test( trimmed ) ) {
            return '<hr>';
        }

        var body = inlineToHtml( text );
        if ( !body ) body = '<br>';
        return '<div' +
            ( block.center ? ' class="nv-center" style="text-align:center"' : '' ) +
            '>' + body + '</div>';
    }

    function wikitextToEditorHtml( wikitext ) {
        var prepared = tokenizeWikitext( wikitext );
        currentConversionVault = prepared.vault;

        try {
            var blocks = splitWikitextBlocks( prepared.text );
            var html = '';

            for ( var i = 0; i < blocks.length; i++ ) {
                html += blockToHtml( blocks[ i ] );
            }

            return html || '<div><br></div>';
        } finally {
            currentConversionVault = null;
        }
    }

    /* ==========================================================
     * 编辑器 DOM -> Wikitext
     * ========================================================== */
    function isBlockTag( tag ) {
        return /^(DIV|P|H[1-6]|HR|BLOCKQUOTE|PRE|UL|OL|LI)$/.test( tag );
    }

    function isCentered( node ) {
        if ( !node || node.nodeType !== 1 ) return false;
        if ( typeof node.className === 'string' &&
             /(?:^|\s)nv-center(?:\s|$)/.test( node.className ) ) {
            return true;
        }
        return /text-align\s*:\s*center/i.test(
            node.getAttribute( 'style' ) || ''
        );
    }

    /*
     * 正文里的 Wikitext 语法字符全部转成实体：
     * 页面上仍然显示原来的字符，但不会被解析成模板、链接、标题、表格等。
     * 我们自己生成的 ''' '' == <u> <s> <br /> 不经过这个函数。
     */
    function escapeWikiText( text ) {
        return String( text )
            .replace( /&/g, '&amp;' )
            .replace( /</g, '&lt;' )
            .replace( /'/g, '&#39;' )
            .replace( /\{/g, '&#123;' )
            .replace( /\}/g, '&#125;' )
            .replace( /\[/g, '&#91;' )
            .replace( /\]/g, '&#93;' )
            .replace( /\|/g, '&#124;' )
            .replace( /=/g, '&#61;' )
            .replace( /~/g, '&#126;' )
            .replace( /_/g, '&#95;' );
    }

    /* 行首的列表、缩进、分隔线标记同样压成实体 */
    function escapeLineStart( text ) {
        var out = text.replace( /^ +/, function ( m ) {
            return repeatChar( '&#32;', m.length );
        } );

        out = out.replace( /^([#*;:])/, function ( m ) {
            return '&#' + m.charCodeAt( 0 ) + ';';
        } );

        out = out.replace( /^(-{4,})/, function ( m ) {
            return repeatChar( '&#45;', m.length );
        } );

        return out;
    }

    function serializeInline( node ) {
        var out = '';
        var children = node.childNodes;

        for ( var i = 0; i < children.length; i++ ) {
            var child = children[ i ];

            if ( child.nodeType === 3 ) {
                out += escapeWikiText( child.nodeValue );
                continue;
            }
            if ( child.nodeType !== 1 ) continue;

            if ( isWidgetNode( child ) ) {
                out += serializeWidgetInline( child );
                continue;
            }

            if ( isInlineCodeContainerNode( child ) ) {
                out += ( child.getAttribute( 'data-nv-open' ) || '' ) +
                    serializeInline( child ) +
                    ( child.getAttribute( 'data-nv-close' ) || '' );
                continue;
            }

            if ( isCodeLeafNode( child ) ) {
                out += child.getAttribute( 'data-nv-code' ) || '';
                continue;
            }

            var tag = child.tagName.toLowerCase();
            var inner = serializeInline( child );

            if ( tag === 'br' ) {
                out += '<br />';
            } else if ( tag === 'b' || tag === 'strong' ) {
                out += "'''" + inner + "'''";
            } else if ( tag === 'i' || tag === 'em' ) {
                out += "''" + inner + "''";
            } else if ( tag === 'u' ) {
                out += '<u>' + inner + '</u>';
            } else if ( tag === 's' || tag === 'strike' || tag === 'del' ) {
                out += '<s>' + inner + '</s>';
            } else if ( tag === 'span' ) {
                /* 浏览器有时会把粗体写成带样式的 span */
                var st = child.getAttribute( 'style' ) || '';
                if ( /font-weight\s*:\s*(?:bold|[6-9]00)/i.test( st ) ) {
                    out += "'''" + inner + "'''";
                } else if ( /font-style\s*:\s*italic/i.test( st ) ) {
                    out += "''" + inner + "''";
                } else if ( /text-decoration[^;]*underline/i.test( st ) ) {
                    out += '<u>' + inner + '</u>';
                } else if ( /text-decoration[^;]*line-through/i.test( st ) ) {
                    out += '<s>' + inner + '</s>';
                } else {
                    out += inner;
                }
            } else {
                /* a、font、img 等一律只保留文字，不生成链接/媒体语法 */
                out += inner;
            }
        }

        return out;
    }

    function trimTrailingBreaks( text ) {
        return text.replace( /(?:<br \/>[ \t]*)+$/, '' ).replace( /\s+$/, '' );
    }

    function isWidgetNode( node ) {
        return !!node && node.nodeType === 1 &&
            typeof node.className === 'string' &&
            /(?:^|\s)nv-widget(?:\s|$)/.test( node.className );
    }

    function hasClass( node, name ) {
        return !!node && node.nodeType === 1 && node.classList &&
            node.classList.contains( name );
    }

    function isCodeContainerNode( node ) {
        return hasClass( node, 'nv-code-container' );
    }

    function isInlineCodeContainerNode( node ) {
        return hasClass( node, 'nv-code-container-inline' );
    }

    function isCodeLeafNode( node ) {
        return hasClass( node, 'nv-code-inline' ) ||
            hasClass( node, 'nv-code-block' );
    }

    function imageSyntax( node ) {
        var name = node.getAttribute( 'data-nv-name' ) || '';
        if ( !name ) return '';

        var pos = node.getAttribute( 'data-nv-pos' ) || 'center';
        if ( pos !== 'left' && pos !== 'right' && pos !== 'center' ) {
            pos = 'center';
        }

        var width = parseInt( node.getAttribute( 'data-nv-width' ), 10 ) || 0;
        var syntax = '[[File:' + name + '|' + pos;

        if ( width > 0 ) {
            syntax += '|' + Math.max( 1, Math.round( width ) ) + 'px';
        }
        return syntax + ']]';
    }

    function serializeWidgetInline( node ) {
        var type = node.getAttribute( 'data-nv-type' );

        if ( type === 'template' ) {
            return node.getAttribute( 'data-nv-invocation' ) || '';
        }
        if ( type === 'image' ) {
            return imageSyntax( node );
        }
        return '';
    }

    function serializeWidget( node ) {
        var type = node.getAttribute( 'data-nv-type' );
        var pos = node.getAttribute( 'data-nv-pos' ) || 'grid';
        if ( pos !== 'left' && pos !== 'right' && pos !== 'center' ) {
            pos = 'grid';
        }

        if ( type === 'template' ) {
            var invocation = node.getAttribute( 'data-nv-invocation' ) || '';
            if ( !invocation ) return '';

            if ( pos === 'left' ) {
                return '<div style="float:left; margin:0 1.1em 1em 0; max-width:100%;">' +
                    invocation + '</div>';
            }
            if ( pos === 'right' ) {
                return '<div style="float:right; margin:0 0 1em 1.1em; max-width:100%;">' +
                    invocation + '</div>';
            }
            if ( pos === 'center' ) {
                return '<div style="clear:both; text-align:center; margin:1.4em 0;">' +
                    invocation + '</div>';
            }

            var offset = Math.max(
                0,
                Math.round( parseInt( node.getAttribute( 'data-nv-offset' ), 10 ) || 0 )
            );

            return '<div style="clear:both; margin-left:' + offset +
                'px; max-width:100%;">' + invocation + '</div>';
        }

        if ( type === 'image' ) {
            return imageSyntax( node );
        }

        return '';
    }

    function serializeBlock( node ) {
        var tag = node.tagName.toUpperCase();
        if ( tag === 'HR' ) return '----';

        var inline = trimTrailingBreaks( serializeInline( node ) );
        if ( !inline.trim() ) return '';

        if ( /^H[1-6]$/.test( tag ) ) {
            var level = parseInt( tag.charAt( 1 ), 10 );
            var eq = repeatChar( '=', level );
            var line = eq + ' ' + inline.trim() + ' ' + eq;
            if ( isCentered( node ) ) {
                return '<div style="text-align:center">\n\n' + line + '\n\n</div>';
            }
            return line;
        }

        var body = escapeLineStart( inline );
        if ( isCentered( node ) ) {
            return '<div style="text-align:center">' + body + '</div>';
        }
        return body;
    }

    function serializeBlockContainer( node ) {
        var open = node.getAttribute( 'data-nv-open' ) || '';
        var close = node.getAttribute( 'data-nv-close' ) || '';
        var inner = serializeBlockSequence( node );

        if ( !inner.trim() ) return open + close;
        return open + '\n' + inner + '\n' + close;
    }

    function serializeBlockSequence( root ) {
        var parts = [];
        var buffer = [];

        function flushBuffer() {
            if ( !buffer.length ) return;

            var holder = document.createElement( 'div' );
            for ( var i = 0; i < buffer.length; i++ ) {
                holder.appendChild( buffer[ i ].cloneNode( true ) );
            }

            var inline = trimTrailingBreaks( serializeInline( holder ) );
            buffer = [];
            if ( !inline.trim() ) return;
            parts.push( escapeLineStart( inline ) );
        }

        var children = root.childNodes;

        for ( var i = 0; i < children.length; i++ ) {
            var node = children[ i ];

            if ( node.nodeType === 3 ) {
                if ( node.nodeValue && node.nodeValue.trim() ) {
                    buffer.push( node );
                }
                continue;
            }
            if ( node.nodeType !== 1 ) continue;

            if ( isWidgetNode( node ) ) {
                flushBuffer();
                var widget = serializeWidget( node );
                if ( widget ) parts.push( widget );
                continue;
            }

            if ( isCodeContainerNode( node ) ) {
                flushBuffer();
                var container = serializeBlockContainer( node );
                if ( container ) parts.push( container );
                continue;
            }

            if ( isCodeLeafNode( node ) ) {
                flushBuffer();
                var code = node.getAttribute( 'data-nv-code' ) || '';
                if ( code ) parts.push( code );
                continue;
            }

            if ( node.tagName === 'BR' ) {
                flushBuffer();
                continue;
            }

            if ( !isBlockTag( node.tagName ) ) {
                buffer.push( node );
                continue;
            }

            flushBuffer();
            var block = serializeBlock( node );
            if ( block ) parts.push( block );
        }

        flushBuffer();
        return parts.join( '\n\n' );
    }

    function editorToWikitext( root ) {
        return serializeBlockSequence( root );
    }

    /* 记录初始结构代码，保存前检查有没有被误删 */
    function snapshotCodeIds( root ) {
        if ( !root ) return;

        root._nvCodeIds = {
            leaf: Array.prototype.map.call(
                root.querySelectorAll( '[data-nv-code-id]' ),
                function ( el ) { return el.getAttribute( 'data-nv-code-id' ); }
            ),
            container: Array.prototype.map.call(
                root.querySelectorAll( '[data-nv-container-id]' ),
                function ( el ) { return el.getAttribute( 'data-nv-container-id' ); }
            )
        };
    }

    function missingCodeIds( root ) {
        var ids = root && root._nvCodeIds;
        if ( !ids ) return [];

        var missing = [];

        ids.leaf.forEach( function ( id ) {
            if ( !root.querySelector( '[data-nv-code-id="' + id + '"]' ) ) {
                missing.push( id );
            }
        } );

        ids.container.forEach( function ( id ) {
            if ( !root.querySelector( '[data-nv-container-id="' + id + '"]' ) ) {
                missing.push( id );
            }
        } );

        return missing;
    }

    function htmlToWikitext( html ) {
        var temp = document.createElement( 'div' );
        temp.innerHTML = html;

        /* 外部传入的 HTML 里即使有脚本/样式也不进入正文 */
        var bad = temp.querySelectorAll(
            'script,style,iframe,object,embed,link,meta,img,video,audio'
        );
        for ( var i = 0; i < bad.length; i++ ) {
            if ( bad[ i ].parentNode ) {
                bad[ i ].parentNode.removeChild( bad[ i ] );
            }
        }

        return editorToWikitext( temp );
    }

    /* ==========================================================
     * 存储协议
     * ========================================================== */
    function nvToStorage( source ) {
        /* 代码结构已经在编辑器里原位保留，这里只做换行归一化，不再删除任何内容 */
        var text = String( source == null ? '' : source )
            .replace( /\r\n?/g, '\n' )
            .replace( /^\n+|\n+$/g, '' );

        return text ? text + '\n' : '';
    }

    function nvFromStorage( storage ) {
        var text = String( storage == null ? '' : storage )
            .replace( /\r\n?/g, '\n' );

        var info = extractPageMeta( text );
        var before = text.replace( /^\n+|\n+$/g, '' );

        return {
            /* 完整源码交给编辑器：代码会显示为隐藏锚点/灰色结构，不会被删掉 */
            source: before,
            reverseConverted: false,
            codeHidden: hasCodeLike( before ),
            codeRemoved: false,
            meta: info.meta,
            css: info.css
        };
    }

    /*
     * 有些站点的原生编辑器是 CodeMirror：
     * 正文只在 CodeMirror 的文档里，textarea.value 可能一直是空的，
     * 直到原生 submit 才同步。这里优先读 textarea，空的话再读 CodeMirror。
     */
    function readNativeEditorContent( textarea ) {
        var value = textarea && textarea.value ? textarea.value : '';
        if ( value.trim() ) return value;

        var cm = document.querySelector( '.cm-editor' );
        if ( !cm ) return value;

        /* CodeMirror 5 */
        try {
            if ( textarea && textarea.CodeMirror &&
                 typeof textarea.CodeMirror.getValue === 'function' ) {
                return textarea.CodeMirror.getValue();
            }
        } catch ( e ) {}

        /* CodeMirror 6：部分集成会把 EditorView 挂在 DOM 上 */
        try {
            var view = cm.cmView || cm._cmView || cm.CodeMirror || null;
            if ( view && view.view ) view = view.view;

            if ( view && view.state && view.state.doc &&
                 typeof view.state.doc.toString === 'function' ) {
                return view.state.doc.toString();
            }
            if ( view && typeof view.getValue === 'function' ) {
                return view.getValue();
            }
        } catch ( e ) {}

        /* 最后从 CodeMirror 的可见行还原，避免编辑器空白 */
        var content = cm.querySelector( '.cm-content' );
        if ( content ) {
            var lines = content.querySelectorAll( '.cm-line' );
            if ( lines.length ) {
                var out = [];
                for ( var i = 0; i < lines.length; i++ ) {
                    out.push( lines[ i ].textContent || '' );
                }
                return out.join( '\n' );
            }
        }

        return value;
    }

    /* 静态样式位于同目录 Gadget-novelEditor.css，由 ResourceLoader 随小工具一起加载。 */

    /* ==========================================================
     * 工作区
     * ========================================================== */
    function createWorkspace( opts ) {
        opts = opts || {};

        var root = document.createElement( 'div' );
        root.className = 'nv-root' + ( opts.app ? ' nv-page' : ' nv-embed' );

        var docListeners = [];

        function listen( target, type, fn, capture ) {
            target.addEventListener( type, fn, !!capture );
            docListeners.push( [ target, type, fn, !!capture ] );
        }

        function on( target, type, fn ) {
            target.addEventListener( type, fn );
            docListeners.push( [ target, type, fn, false ] );
        }

        /* ---------- 纸张与写作区 ---------- */
        var main = document.createElement( 'div' );
        main.className = 'nv-main';

        var paper = document.createElement( 'div' );
        paper.className = 'nv-paper';

        var editor = document.createElement( 'div' );
        editor.className = 'nv-editor';
        editor.contentEditable = 'true';
        editor.setAttribute( 'spellcheck', 'false' );
        editor.setAttribute( 'role', 'textbox' );
        editor.setAttribute( 'aria-multiline', 'true' );
        editor.setAttribute( 'aria-label', '小说正文' );
        editor.setAttribute( 'data-placeholder', opts.placeholder || '开始写你的故事……' );

        paper.appendChild( editor );
        main.appendChild( paper );

        try {
            document.execCommand( 'defaultParagraphSeparator', false, 'div' );
            document.execCommand( 'styleWithCSS', false, false );
        } catch ( e ) {}

        /* ---------- 选择工具 ---------- */
        function getSelectionRange() {
            var sel = window.getSelection();
            if ( !sel || !sel.rangeCount ) return null;
            var range = sel.getRangeAt( 0 );
            if ( !editor.contains( range.commonAncestorContainer ) ) return null;
            return range;
        }

        function closestBlock( node ) {
            while ( node && node !== editor ) {
                if ( node.nodeType === 1 && isBlockTag( node.tagName ) ) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        }

        /*
         * 只收集真正承载文字的段落块：
         * 结构容器本身不能作为格式操作对象，否则标题/清除格式会把容器连代码一起换掉。
         */
        function getTopBlocks() {
            var out = [];
            var all = editor.querySelectorAll(
                'div,p,h1,h2,h3,h4,h5,h6,blockquote,li'
            );

            for ( var i = 0; i < all.length; i++ ) {
                var n = all[ i ];

                if ( n === editor ) continue;
                if ( isWidgetNode( n ) ||
                     isCodeContainerNode( n ) ||
                     isCodeLeafNode( n ) ||
                     isInlineCodeContainerNode( n ) ) {
                    continue;
                }

                var hasBlockChild = false;
                for ( var c = n.firstElementChild; c; c = c.nextElementSibling ) {
                    if ( isBlockTag( c.tagName ) ) {
                        hasBlockChild = true;
                        break;
                    }
                }
                if ( hasBlockChild ) continue;

                if ( n.parentNode === editor || isCodeContainerNode( n.parentNode ) ) {
                    out.push( n );
                }
            }

            return out;
        }

        function getSelectedBlocks() {
            var range = getSelectionRange();
            if ( !range ) return [];

            var blocks = getTopBlocks();
            var selected = [];

            for ( var i = 0; i < blocks.length; i++ ) {
                var inside = false;
                try {
                    inside = range.intersectsNode( blocks[ i ] );
                } catch ( e ) {
                    inside = false;
                }
                if ( inside ) selected.push( blocks[ i ] );
            }

            if ( !selected.length ) {
                var block = closestBlock( range.startContainer );
                if ( block && block.parentNode === editor &&
                     !isWidgetNode( block ) &&
                     !isCodeContainerNode( block ) &&
                     !isCodeLeafNode( block ) ) {
                    selected.push( block );
                }
            }
            return selected;
        }

        function makeEmptyBlock() {
            var div = document.createElement( 'div' );
            div.appendChild( document.createElement( 'br' ) );
            return div;
        }

        function setCaretInside( block ) {
            var range = document.createRange();
            range.selectNodeContents( block );
            range.collapse( true );
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange( range );
        }

        function ensureEditorBlocks() {
            var child = editor.firstChild;
            var pending = null;

            while ( child ) {
                var next = child.nextSibling;

                if ( child.nodeType === 3 ) {
                    if ( !pending ) {
                        pending = document.createElement( 'div' );
                        editor.insertBefore( pending, child );
                    }
                    pending.appendChild( child );
                    child = next;
                    continue;
                }

                if ( child.nodeType === 1 && child.tagName === 'BR' ) {
                    if ( !pending ) {
                        pending = document.createElement( 'div' );
                        editor.insertBefore( pending, child );
                    }
                    pending.appendChild( child );
                    pending = null;
                    child = next;
                    continue;
                }

                if ( child.nodeType === 1 && isBlockTag( child.tagName ) ) {
                    pending = null;
                    child = next;
                    continue;
                }

                if ( !pending ) {
                    pending = document.createElement( 'div' );
                    editor.insertBefore( pending, child );
                }
                pending.appendChild( child );
                child = next;
            }

            if ( !editor.firstChild ) {
                editor.appendChild( makeEmptyBlock() );
            }
        }

        /* ---------- 选区存取 ---------- */
        function saveSelection() {
            var sel = window.getSelection();
            if ( !sel || !sel.rangeCount ) return null;
            var range = sel.getRangeAt( 0 );

            var start = document.createElement( 'span' );
            start.className = 'nv-marker';
            var end = document.createElement( 'span' );
            end.className = 'nv-marker';

            var endRange = range.cloneRange();
            endRange.collapse( false );
            endRange.insertNode( end );

            var startRange = range.cloneRange();
            startRange.collapse( true );
            startRange.insertNode( start );

            return { start: start, end: end };
        }

        function restoreSelection( saved ) {
            if ( !saved || !saved.start || !saved.end ) return;
            var sel = window.getSelection();
            var range = document.createRange();
            try {
                range.setStartAfter( saved.start );
                range.setEndBefore( saved.end );
            } catch ( e ) {
                return;
            }
            sel.removeAllRanges();
            sel.addRange( range );
            if ( saved.start.parentNode ) saved.start.parentNode.removeChild( saved.start );
            if ( saved.end.parentNode ) saved.end.parentNode.removeChild( saved.end );
        }

        /* ---------- 插入 ---------- */
        function insertTextAtCaret( text ) {
            editor.focus();

            var range = getSelectionRange();
            if ( !range ) {
                var last = editor.lastElementChild || editor;
                range = document.createRange();
                range.selectNodeContents( last );
                range.collapse( false );
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange( range );
            }

            var ok = false;
            try {
                ok = document.execCommand( 'insertText', false, text );
            } catch ( e ) {
                ok = false;
            }

            if ( !ok ) {
                var r = getSelectionRange();
                if ( r ) {
                    r.deleteContents();
                    var tn = document.createTextNode( text );
                    r.insertNode( tn );
                    r.setStartAfter( tn );
                    r.collapse( true );
                }
            }

            afterEdit();
        }

        function insertLineBreak() {
            editor.focus();
            var ok = false;
            try {
                ok = document.execCommand( 'insertLineBreak' );
            } catch ( e ) {
                ok = false;
            }
            if ( !ok ) {
                var range = getSelectionRange();
                if ( range ) {
                    range.deleteContents();
                    var br = document.createElement( 'br' );
                    range.insertNode( br );
                    range.setStartAfter( br );
                    range.collapse( true );
                }
            }
            afterEdit();
        }

        function insertParagraph() {
            var range = getSelectionRange();
            if ( !range ) return;

            editor.focus();
            range.deleteContents();

            var block = closestBlock( range.startContainer );

            if ( block && isWidgetNode( block ) ) {
                var afterWidget = makeEmptyBlock();
                block.parentNode.insertBefore( afterWidget, block.nextSibling );
                setCaretInside( afterWidget );
                afterEdit();
                return;
            }

            /* 光标直接在结构容器上：在容器内部新建段落，别把容器拆开 */
            if ( block && isCodeContainerNode( block ) ) {
                var insideBlock = makeEmptyBlock();
                var ref = null;

                if ( range.startContainer === block ) {
                    ref = block.childNodes[ range.startOffset ] || null;
                } else {
                    var n = range.startContainer;
                    while ( n && n.parentNode !== block ) n = n.parentNode;
                    ref = n ? n.nextSibling : null;
                }

                block.insertBefore( insideBlock, ref );
                setCaretInside( insideBlock );
                afterEdit();
                return;
            }

            /* 段落块在结构容器里时，回车要继续留在容器内部 */
            if ( !block ||
                 ( block.parentNode !== editor &&
                   !isCodeContainerNode( block.parentNode ) ) ) {
                var last = editor.lastElementChild;
                var fresh = makeEmptyBlock();
                if ( last ) {
                    last.parentNode.insertBefore( fresh, last.nextSibling );
                } else {
                    editor.appendChild( fresh );
                }
                setCaretInside( fresh );
                afterEdit();
                return;
            }

            var after = document.createRange();
            after.selectNodeContents( block );
            after.setStart( range.endContainer, range.endOffset );

            var frag = after.extractContents();

            var next = document.createElement( 'div' );
            next.appendChild( frag );
            if ( !next.textContent && !next.querySelector( 'br,img,hr' ) ) {
                next.appendChild( document.createElement( 'br' ) );
            }

            var lastChild = block.lastChild;
            if ( lastChild && lastChild.nodeType === 1 &&
                 lastChild.tagName === 'BR' ) {
                block.removeChild( lastChild );
            }
            if ( !block.textContent && !block.querySelector( 'br,img,hr' ) ) {
                block.appendChild( document.createElement( 'br' ) );
            }

            block.parentNode.insertBefore( next, block.nextSibling );
            setCaretInside( next );
            afterEdit();
        }

        function insertRule() {
            var range = getSelectionRange();
            if ( !range ) return;

            editor.focus();
            range.deleteContents();

            var block = closestBlock( range.startContainer );
            var hr = document.createElement( 'hr' );
            var tail = makeEmptyBlock();

            if ( block && isWidgetNode( block ) ) {
                block.parentNode.insertBefore( hr, block.nextSibling );
                block.parentNode.insertBefore( tail, hr.nextSibling );
            } else if ( block && block.parentNode === editor ) {
                var after = document.createRange();
                after.selectNodeContents( block );
                after.setStart( range.endContainer, range.endOffset );
                var frag = after.extractContents();

                tail = document.createElement( 'div' );
                tail.appendChild( frag );
                if ( !tail.textContent && !tail.querySelector( 'br,img,hr' ) ) {
                    tail.appendChild( document.createElement( 'br' ) );
                }

                var lastChild = block.lastChild;
                if ( lastChild && lastChild.nodeType === 1 &&
                     lastChild.tagName === 'BR' ) {
                    block.removeChild( lastChild );
                }
                if ( !block.textContent && !block.querySelector( 'br,img,hr' ) ) {
                    block.appendChild( document.createElement( 'br' ) );
                }

                block.parentNode.insertBefore( hr, block.nextSibling );
                block.parentNode.insertBefore( tail, hr.nextSibling );
            } else {
                editor.appendChild( hr );
                editor.appendChild( tail );
            }

            setCaretInside( tail );
            afterEdit();
        }

        /* ---------- 格式 ---------- */
        function execFormat( cmd ) {
            editor.focus();
            try { document.execCommand( 'styleWithCSS', false, false ); } catch ( e ) {}
            try { document.execCommand( cmd, false, null ); } catch ( e ) {}
            afterEdit();
        }

        function applyHeading( level ) {
            ensureEditorBlocks();

            var blocks = getSelectedBlocks();
            if ( !blocks.length ) return;

            var saved = saveSelection();
            var tag = 'h' + level;
            var allSame = true;

            for ( var i = 0; i < blocks.length; i++ ) {
                if ( blocks[ i ].tagName.toLowerCase() !== tag ) {
                    allSame = false;
                    break;
                }
            }

            for ( var j = 0; j < blocks.length; j++ ) {
                var block = blocks[ j ];
                var repl = document.createElement( allSame ? 'div' : tag );

                if ( isCentered( block ) ) {
                    repl.style.textAlign = 'center';
                    repl.classList.add( 'nv-center' );
                }

                while ( block.firstChild ) {
                    repl.appendChild( block.firstChild );
                }
                if ( !repl.firstChild ) {
                    repl.appendChild( document.createElement( 'br' ) );
                }

                block.parentNode.replaceChild( repl, block );
            }

            restoreSelection( saved );
            editor.focus();
            afterEdit();
        }

        function toggleCenter() {
            ensureEditorBlocks();

            var blocks = getSelectedBlocks();
            if ( !blocks.length ) return;

            var allCentered = true;
            for ( var i = 0; i < blocks.length; i++ ) {
                if ( !isCentered( blocks[ i ] ) ) {
                    allCentered = false;
                    break;
                }
            }

            for ( var j = 0; j < blocks.length; j++ ) {
                var block = blocks[ j ];
                if ( allCentered ) {
                    block.classList.remove( 'nv-center' );
                    block.style.textAlign = '';
                } else {
                    block.classList.add( 'nv-center' );
                    block.style.textAlign = 'center';
                }
            }

            editor.focus();
            afterEdit();
        }

        function clearFormat() {
            editor.focus();

            var range = getSelectionRange();
            var inContainer = false;

            if ( range ) {
                var n = range.commonAncestorContainer;
                if ( n && n.nodeType !== 1 ) n = n.parentNode;

                while ( n && n !== editor ) {
                    if ( isCodeContainerNode( n ) ||
                         isInlineCodeContainerNode( n ) ) {
                        inContainer = true;
                        break;
                    }
                    n = n.parentNode;
                }
            }

            /* 选区碰到结构代码时不做 removeFormat，避免把隐藏锚点/容器拆掉 */
            if ( !inContainer && ( !range || !rangeTouchesCode( range ) ) ) {
                try { document.execCommand( 'removeFormat' ); } catch ( e ) {}
            }

            ensureEditorBlocks();

            var blocks = getSelectedBlocks();
            if ( blocks.length ) {
                var saved = saveSelection();

                for ( var i = 0; i < blocks.length; i++ ) {
                    var block = blocks[ i ];
                    var plain = document.createElement( 'div' );

                    while ( block.firstChild ) {
                        plain.appendChild( block.firstChild );
                    }
                    if ( !plain.firstChild ) {
                        plain.appendChild( document.createElement( 'br' ) );
                    }
                    block.parentNode.replaceChild( plain, block );
                }

                restoreSelection( saved );
            }

            editor.focus();
            afterEdit();
        }

        /* ---------- 状态 ---------- */
        var statsTimer = null;
        var stateFrame = 0;
        var statsRefs = [];
        var saveStateEl = null;
        var dirty = false;

        function updatePlaceholder() {
            var hasText = !!( editor.textContent && editor.textContent.trim() );
            var hasRule = !!editor.querySelector( 'hr' );
            var hasWidget = !!editor.querySelector( '.nv-widget' );
            editor.classList.toggle( 'is-empty', !hasText && !hasRule && !hasWidget );
        }

        function scheduleStats() {
            if ( statsTimer ) return;
            statsTimer = setTimeout( function () {
                statsTimer = null;
                updateStats();
            }, 160 );
        }

        function updateStats() {
            /* 统计正文时不把模板/图片控件内部的文字算进字数 */
            var text = '';
            for ( var w = 0; w < editor.children.length; w++ ) {
                var child = editor.children[ w ];
                if ( isWidgetNode( child ) ) continue;
                text += ( child.innerText || child.textContent || '' ) + '\n';
            }

            var words = 0;
            var inWord = false;

            for ( var i = 0; i < text.length; i++ ) {
                var c = text.charCodeAt( i );

                if ( c === 10 || c === 13 ) {
                    inWord = false;
                    continue;
                }
                if ( ( c >= 0x4e00 && c <= 0x9fff ) ||
                     ( c >= 0x3400 && c <= 0x4dbf ) ) {
                    words++;
                    inWord = false;
                    continue;
                }
                if ( ( c >= 48 && c <= 57 ) ||
                     ( c >= 65 && c <= 90 ) ||
                     ( c >= 97 && c <= 122 ) ||
                     c === 95 ) {
                    if ( !inWord ) {
                        words++;
                        inWord = true;
                    }
                } else {
                    inWord = false;
                }
            }

            var paragraphs = 0;
            for ( var b = 0; b < editor.children.length; b++ ) {
                var el = editor.children[ b ];
                if ( el.tagName === 'HR' || isWidgetNode( el ) ) continue;
                if ( el.textContent && el.textContent.trim() ) paragraphs++;
            }

            if ( statsRefs[ 0 ] ) statsRefs[ 0 ].textContent = formatNumber( words );
            if ( statsRefs[ 1 ] ) statsRefs[ 1 ].textContent = formatNumber( paragraphs );
        }

        function updateSaveState() {
            if ( !saveStateEl ) return;
            saveStateEl.textContent = dirty ? '未保存' : '已保存';
            saveStateEl.classList.toggle( 'is-dirty', dirty );
        }

        function setSaveState( mode ) {
            if ( mode === 'saving' ) {
                if ( saveStateEl ) {
                    saveStateEl.textContent = '保存中…';
                    saveStateEl.classList.remove( 'is-dirty' );
                }
                return;
            }
            if ( mode === 'saved' ) dirty = false;
            else if ( mode === 'dirty' ) dirty = true;
            updateSaveState();
        }

        function selectionInside() {
            var sel = window.getSelection();
            if ( !sel || !sel.rangeCount ) return false;
            return editor.contains( sel.getRangeAt( 0 ).commonAncestorContainer );
        }

        function scheduleStateSync() {
            if ( stateFrame ) return;
            stateFrame = window.requestAnimationFrame
                ? window.requestAnimationFrame( syncState )
                : setTimeout( syncState, 16 );
        }

        function commandState( cmd ) {
            try { return document.queryCommandState( cmd ); } catch ( e ) { return false; }
        }

        function setPressed( btn, on ) {
            if ( !btn ) return;
            btn.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
        }

        function syncState() {
            stateFrame = 0;
            if ( !selectionInside() ) return;

            setPressed( formatButtons.bold, commandState( 'bold' ) );
            setPressed( formatButtons.italic, commandState( 'italic' ) );
            setPressed( formatButtons.underline, commandState( 'underline' ) );
            setPressed( formatButtons.strike, commandState( 'strikeThrough' ) );

            var blocks = getSelectedBlocks();
            var sameTag = blocks.length ? blocks[ 0 ].tagName.toLowerCase() : '';
            var allCentered = blocks.length > 0;

            for ( var i = 0; i < blocks.length; i++ ) {
                if ( blocks[ i ].tagName.toLowerCase() !== sameTag ) sameTag = '';
                if ( !isCentered( blocks[ i ] ) ) allCentered = false;
            }

            for ( var level = 1; level <= 6; level++ ) {
                setPressed( headingButtons[ level ], sameTag === 'h' + level );
            }
            setPressed( formatButtons.center, allCentered );
        }

        var toast = document.createElement( 'div' );
        toast.className = 'nv-toast';
        root.appendChild( toast );

        var toastTimer = null;
        var toastHideTimer = null;

        function showToast( message, ms ) {
            toast.textContent = message;
            toast.classList.add( 'is-show' );

            if ( toastTimer ) clearTimeout( toastTimer );
            if ( toastHideTimer ) clearTimeout( toastHideTimer );

            toastTimer = setTimeout( function () {
                toast.classList.remove( 'is-show' );
                toastHideTimer = setTimeout( function () {
                    toast.textContent = '';
                }, 240 );
            }, ms || 2600 );
        }

        function afterEdit() {
            dirty = true;
            updateSaveState();
            updatePlaceholder();
            scheduleStats();
            scheduleStateSync();

            /* 控件换位 / 缩放 / 删除也属于内容变化，通知嵌入方 */
            try {
                var ev;
                if ( typeof window.CustomEvent === 'function' ) {
                    ev = new window.CustomEvent( 'nv-change', { bubbles: true } );
                } else {
                    ev = document.createEvent( 'CustomEvent' );
                    ev.initCustomEvent( 'nv-change', true, true, null );
                }
                editor.dispatchEvent( ev );
            } catch ( e ) {}
        }

        function setHtml( html ) {
            editor.innerHTML = html || '';
            ensureEditorBlocks();
            hydrateWidgets();
            snapshotCodeIds( editor );
            updatePlaceholder();
            scheduleStats();
            scheduleStateSync();
            paper.scrollTop = 0;
        }

        function getWikitext() {
            return editorToWikitext( editor );
        }

        /* ==========================================================
         * 模板 / 图片控件
         * ========================================================== */
        function setWidgetPos( widget, pos, silent ) {
            if ( pos !== 'left' && pos !== 'right' && pos !== 'center' ) {
                pos = 'center';
            }
            widget.setAttribute( 'data-nv-pos', pos );
            widget.classList.remove( 'nv-pos-left', 'nv-pos-right', 'nv-pos-center' );
            widget.classList.add( 'nv-pos-' + pos );

            if ( !silent ) scheduleStats();
        }

        function setWidgetGridOffset( widget, offset ) {
            offset = Math.max( 0, Math.round( parseInt( offset, 10 ) || 0 ) );

            widget.setAttribute( 'data-nv-pos', 'grid' );
            widget.setAttribute( 'data-nv-offset', String( offset ) );
            widget.classList.remove( 'nv-pos-left', 'nv-pos-right', 'nv-pos-center' );
            widget.classList.add( 'nv-template-block' );
            widget.style.marginLeft = offset ? offset + 'px' : '0px';
        }

        /* 参数变化后模板可能变宽，把格子偏移夹回正文宽度内 */
        function clampWidgetGridOffset( widget ) {
            if ( !widget || !editor ) return;
            if ( widget.getAttribute( 'data-nv-type' ) !== 'template' ) return;
            if ( widget.getAttribute( 'data-nv-pos' ) !== 'grid' ) return;

            var offset = parseInt( widget.getAttribute( 'data-nv-offset' ), 10 ) || 0;
            if ( offset <= 0 ) return;

            var edStyle = window.getComputedStyle( editor );
            var padLeft = parseFloat( edStyle.paddingLeft ) || 0;
            var padRight = parseFloat( edStyle.paddingRight ) || 0;
            var width = editor.clientWidth || editor.getBoundingClientRect().width || 0;
            var widgetWidth = widget.getBoundingClientRect().width ||
                widget.offsetWidth || 0;

            if ( !width ) return;

            var max = Math.max( 0, width - padLeft - padRight - widgetWidth );
            if ( offset > max ) setWidgetGridOffset( widget, Math.floor( max ) );
        }

        function updateWidthBadge( widget ) {
            var badge = widget.querySelector( '.nv-widget-badge' );
            if ( !badge ) return;

            var width = parseInt( widget.getAttribute( 'data-nv-width' ), 10 ) || 0;
            if ( widget.getAttribute( 'data-nv-type' ) === 'image' && width > 0 ) {
                badge.textContent = Math.round( width ) + 'px';
            } else {
                badge.textContent = '';
            }
        }

        function widgetError( body, message ) {
            body.innerHTML = '<div class="nv-widget-error">' +
                '<span>' + escapeBasic( message ) + '</span>' +
                '<button type="button" data-nv-retry="1">重试</button>' +
                '</div>';
        }

        function fireWidgetContent( widget ) {
            try {
                var body = widget.querySelector( '.nv-widget-body' );
                if ( body && window.mw && mw.hook && window.jQuery ) {
                    mw.hook( 'wikipage.content' ).fire( window.jQuery( body ) );
                }
            } catch ( e ) {}
        }

        function renderWidget( widget, force ) {
            if ( !force && widget.getAttribute( 'data-nv-rendered' ) === '1' ) {
                return;
            }

            var type = widget.getAttribute( 'data-nv-type' );
            var body = widget.querySelector( '.nv-widget-body' );
            if ( !body ) return;

            widget.setAttribute( 'data-nv-rendered', '0' );
            body.innerHTML = '<div class="nv-widget-loading">' +
                ( type === 'template' ? '正在渲染模板…' : '正在载入图片…' ) +
                '</div>';

            if ( type === 'template' ) {
                var invocation = widget.getAttribute( 'data-nv-invocation' ) || '';
                renderTemplate( invocation ).then( function ( html ) {
                    body.innerHTML = html || '';
                    contentStyles( body );
                    widget.setAttribute( 'data-nv-rendered', '1' );
                    clampWidgetGridOffset( widget );
                    fireWidgetContent( widget );
                    updatePlaceholder();
                }, function ( err ) {
                    widgetError( body, '模板渲染失败：' + extractErrorInfo( err ) );
                } );
            } else if ( type === 'image' ) {
                var name = widget.getAttribute( 'data-nv-name' ) || '';
                var width = parseInt( widget.getAttribute( 'data-nv-width' ), 10 ) || 0;

                resolveImageUrl( name ).then( function ( url ) {
                    var img = document.createElement( 'img' );
                    img.src = url;
                    img.alt = name;
                    img.draggable = false;
                    if ( width > 0 ) img.style.width = width + 'px';
                    img.style.height = 'auto';

                    body.innerHTML = '';
                    body.appendChild( img );
                    widget.setAttribute( 'data-nv-rendered', '1' );
                    updateWidthBadge( widget );
                    updatePlaceholder();
                }, function ( err ) {
                    widgetError( body, '图片载入失败：' + extractErrorInfo( err ) );
                } );
            }
        }

        function decorateWidget( widget ) {
            if ( !widget ) return;

            widget.setAttribute( 'contenteditable', 'false' );
            widget.setAttribute( 'draggable', 'false' );

            var type = widget.getAttribute( 'data-nv-type' );
            var isTemplate = type === 'template';

            if ( !widget.querySelector( '.nv-widget-tools' ) ) {
                var tools = document.createElement( 'div' );
                tools.className = 'nv-widget-tools';
                tools.setAttribute( 'contenteditable', 'false' );
                tools.innerHTML = isTemplate
                    ? '<button type="button" data-nv-param="1" title="编辑参数">参数</button>' +
                      '<button type="button" data-nv-del="1" title="删除">×</button>'
                    : '<button type="button" data-nv-pos-btn="left" title="靠左">左</button>' +
                      '<button type="button" data-nv-pos-btn="center" title="居中">中</button>' +
                      '<button type="button" data-nv-pos-btn="right" title="靠右">右</button>' +
                      '<button type="button" data-nv-del="1" title="删除">×</button>';
                widget.appendChild( tools );
            }

            if ( !isTemplate ) {
                if ( !widget.querySelector( '.nv-widget-badge' ) ) {
                    var badge = document.createElement( 'span' );
                    badge.className = 'nv-widget-badge';
                    widget.appendChild( badge );
                }
                if ( !widget.querySelector( '.nv-resize-handle' ) ) {
                    var handle = document.createElement( 'span' );
                    handle.className = 'nv-resize-handle';
                    handle.setAttribute( 'data-nv-handle', '1' );
                    widget.appendChild( handle );
                }
            }

            if ( isTemplate && widget.getAttribute( 'data-nv-pos' ) === 'grid' ) {
                setWidgetGridOffset( widget, widget.getAttribute( 'data-nv-offset' ) );
            } else {
                setWidgetPos(
                    widget,
                    widget.getAttribute( 'data-nv-pos' ) || 'center',
                    true
                );
            }

            updateWidthBadge( widget );
        }

        function hydrateWidgets() {
            var widgets = editor.querySelectorAll( '.nv-widget' );
            for ( var i = 0; i < widgets.length; i++ ) {
                decorateWidget( widgets[ i ] );
                renderWidget( widgets[ i ] );
            }
        }

        function removeWidget( widget ) {
            if ( !widget || !widget.parentNode ) return;

            var prev = widget.previousSibling;
            var next = widget.nextSibling;
            widget.parentNode.removeChild( widget );

            function isEmptyBlock( n ) {
                return n && n.nodeType === 1 && isBlockTag( n.tagName ) &&
                    !isWidgetNode( n ) && !n.textContent.trim() &&
                    !n.querySelector( 'hr,img' );
            }

            if ( isEmptyBlock( prev ) ) prev.parentNode.removeChild( prev );
            if ( isEmptyBlock( next ) ) next.parentNode.removeChild( next );
            if ( !editor.firstChild ) editor.appendChild( makeEmptyBlock() );
        }

        /* ---------- 模板参数编辑 ---------- */
        var paramModal = document.createElement( 'div' );
        paramModal.className = 'nv-modal';
        paramModal.hidden = true;
        paramModal.innerHTML =
            '<div class="nv-modal-backdrop" data-nv-modal-close="1"></div>' +
            '<div class="nv-modal-dialog" role="dialog" aria-modal="true" aria-label="模板参数">' +
                '<div class="nv-modal-head">' +
                    '<span class="nv-modal-title">模板参数</span>' +
                    '<button type="button" class="nv-modal-x" data-nv-modal-close="1" aria-label="关闭">×</button>' +
                '</div>' +
                '<div class="nv-modal-name"></div>' +
                '<div class="nv-param-hint">参数名自动读取自模板页面；值留空即使用模板默认值。</div>' +
                '<div class="nv-param-list"></div>' +
                '<button type="button" class="nv-param-add">＋ 自定义参数</button>' +
                '<div class="nv-modal-actions">' +
                    '<button type="button" class="nv-modal-cancel" data-nv-modal-close="1">取消</button>' +
                    '<button type="button" class="nv-modal-apply">应用</button>' +
                '</div>' +
            '</div>';
        root.appendChild( paramModal );

        var paramNameEl = paramModal.querySelector( '.nv-modal-name' );
        var paramListEl = paramModal.querySelector( '.nv-param-list' );
        var paramHintEl = paramModal.querySelector( '.nv-param-hint' );
        var paramApplyBtn = paramModal.querySelector( '.nv-modal-apply' );
        var paramWidget = null;
        var paramLoadToken = 0;
        var paramDefaults = Object.create( null );
        var paramRequired = Object.create( null );
        var paramOriginalKeys = Object.create( null );

        function resetParamState() {
            paramDefaults = Object.create( null );
            paramRequired = Object.create( null );
            paramOriginalKeys = Object.create( null );
        }

        paramModal.addEventListener( 'click', function ( e ) {
            var close = e.target.closest &&
                e.target.closest( '[data-nv-modal-close]' );
            if ( close ) {
                e.preventDefault();
                closeParamEditor();
            }
        } );

        paramModal.querySelector( '.nv-param-add' )
            .addEventListener( 'click', function ( e ) {
                e.preventDefault();
                addParamRow( '', '', { auto: false } );
                var rows = paramListEl.querySelectorAll( '.nv-param-row' );
                var last = rows[ rows.length - 1 ];
                if ( last ) last.querySelector( '.nv-param-key' ).focus();
            } );

        paramApplyBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            applyParamEditor();
        } );

        function openParamEditor( widget, options ) {
            if ( !widget ) return;

            var opts = options || {};
            var auto = !!opts.auto;

            var parsed = parseTemplateInvocation(
                widget.getAttribute( 'data-nv-invocation' ) || ''
            );
            if ( !parsed ) {
                showToast( '无法解析模板参数' );
                return;
            }

            closeAllPops();
            hideMenu();
            hideWidgetMenu();

            paramWidget = widget;

            var commonMeta = commonTemplateMeta( parsed.name );
            paramNameEl.textContent = commonMeta && commonMeta.label
                ? parsed.name + ' · ' + commonMeta.label
                : parsed.name;

            if ( commonMeta && commonMeta.label &&
                 ( !commonMeta.params ||
                   !Object.keys( commonMeta.params ).length ) ) {
                paramHintEl.textContent = commonMeta.label +
                    '的 X-CS 参数说明尚未完成，参数名暂按模板原文显示。';
            } else {
                paramHintEl.textContent =
                    '参数名自动读取自模板页面；值留空即使用模板默认值。';
            }

            resetParamState();
            paramListEl.innerHTML =
                '<div class="nv-param-loading">正在读取模板页面中的参数…</div>';
            paramApplyBtn.disabled = true;
            paramModal.hidden = false;

            var token = ++paramLoadToken;

            fetchTemplateInfo( parsed.name ).then( function ( info ) {
                if ( token !== paramLoadToken || !paramWidget ) return;
                buildParamForm( parsed, info.params || [], auto, '' );
            }, function ( err ) {
                if ( token !== paramLoadToken || !paramWidget ) return;
                buildParamForm(
                    parsed,
                    [],
                    auto,
                    '读取模板参数失败：' + extractErrorInfo( err ) +
                    '。仍可填写已有参数或手动添加。'
                );
            } );
        }

        function buildParamForm( parsed, defs, auto, note ) {
            paramListEl.textContent = '';
            paramApplyBtn.disabled = false;
            resetParamState();

            var existing = Object.create( null );
            var positional = [];

            parsed.params.forEach( function ( p ) {
                if ( p.positional ) {
                    positional.push( p.value );
                } else {
                    existing[ p.key ] = p.value;
                    paramOriginalKeys[ p.key ] = true;
                }
            } );

            positional.forEach( function ( value, idx ) {
                var key = String( idx + 1 );
                if ( !( key in existing ) ) {
                    existing[ key ] = value;
                    paramOriginalKeys[ key ] = true;
                }
            } );

            var used = Object.create( null );
            var rows = 0;

            for ( var i = 0; i < defs.length; i++ ) {
                var def = defs[ i ];
                var key = String( def.key );

                if ( !key || used[ key ] ) continue;
                used[ key ] = true;

                paramDefaults[ key ] = def.default || '';
                if ( def.required ) paramRequired[ key ] = true;

                var value = Object.prototype.hasOwnProperty.call( existing, key )
                    ? existing[ key ]
                    : ( def.default || '' );

                var defaultLabel = optionLabel( def.options, def.default ) ||
                    def.switchDefaultLabel || '';

                addParamRow( key, value, {
                    auto: true,
                    label: def.label,
                    description: def.description,
                    example: def.example,
                    presets: def.presets,
                    required: !!def.required,
                    options: def.options || null,
                    defaultLabel: defaultLabel
                } );
                rows++;
            }

            Object.keys( existing ).forEach( function ( key ) {
                if ( used[ key ] ) return;
                used[ key ] = true;
                rows++;
                addParamRow( key, existing[ key ], { auto: false } );
            } );

            if ( note ) {
                var noteEl = document.createElement( 'div' );
                noteEl.className = 'nv-param-note-line';
                noteEl.textContent = note;
                paramListEl.insertBefore( noteEl, paramListEl.firstChild );
            }

            if ( !rows ) {
                /* 放置后自动弹出的场景：没有参数就不打扰用户 */
                if ( auto && !note ) {
                    closeParamEditor();
                    showToast( '该模板没有需要填写的参数' );
                    return;
                }

                var empty = document.createElement( 'div' );
                empty.className = 'nv-param-empty';
                empty.textContent =
                    '该模板没有可自动识别的参数。可点“自定义参数”手动添加。';
                paramListEl.appendChild( empty );
            }

            var focusTarget =
                paramListEl.querySelector( '.nv-param-custom:not([hidden])' ) ||
                paramListEl.querySelector( '.nv-param-value' );

            if ( focusTarget ) {
                focusTarget.focus();
            } else {
                var addBtn = paramModal.querySelector( '.nv-param-add' );
                if ( addBtn ) addBtn.focus();
            }
        }

        function closeParamEditor() {
            paramLoadToken++;
            paramModal.hidden = true;
            paramWidget = null;
            paramListEl.textContent = '';
            resetParamState();
        }

        function addParamRow( key, value, meta ) {
            var info = meta || {};

            var row = document.createElement( 'div' );
            row.className = 'nv-param-row';

            var line = document.createElement( 'div' );
            line.className = 'nv-param-line';

            var keyInput = document.createElement( 'input' );
            keyInput.type = 'text';
            keyInput.className = 'nv-input nv-param-key';
            keyInput.placeholder = '参数名（留空=位置参数）';
            keyInput.value = key || '';

            if ( info.auto ) {
                keyInput.readOnly = true;
                keyInput.title = info.label
                    ? info.label + '（' + ( key || '' ) + '）'
                    : '参数名自动读取自模板页面';
            }

            var titleEl = null;
            if ( info.auto && info.label ) {
                titleEl = document.createElement( 'div' );
                titleEl.className = 'nv-param-title';

                var titleCn = document.createElement( 'span' );
                titleCn.className = 'nv-param-title-cn';
                titleCn.textContent = info.label;
                titleEl.appendChild( titleCn );

                /* 原始键名只在悬停提示里保留，表单主显示全中文 */
                if ( key ) titleEl.title = '原始参数名：' + key;
                keyInput.hidden = true;
            }

            var valueInput;
            var customInput = null;
            var optionValues = Object.create( null );
            var currentValue = String( value == null ? '' : value );

            if ( info.options && info.options.length ) {
                /* 模板用 #switch 枚举了可选值：直接给下拉框，写回的是 case 键 */
                valueInput = document.createElement( 'select' );
                valueInput.className = 'nv-input nv-param-value nv-param-select';

                for ( var oi = 0; oi < info.options.length; oi++ ) {
                    var opt = info.options[ oi ];
                    var ov = String( opt.value );

                    if ( !ov || optionValues[ ov ] ) continue;
                    optionValues[ ov ] = true;

                    var option = document.createElement( 'option' );
                    option.value = ov;
                    option.textContent = optionDisplayText( opt );
                    if ( opt.hint ) option.title = opt.hint;
                    valueInput.appendChild( option );
                }

                /* 当前值不在枚举里（或被文档建议自定义）时，走“自定义…” */
                var isCustom = !!currentValue && !optionValues[ currentValue ];

                if ( !currentValue ) {
                    var blank = document.createElement( 'option' );
                    blank.value = '';
                    blank.textContent = '使用模板默认值';
                    valueInput.insertBefore( blank, valueInput.firstChild );
                }

                var customOption = document.createElement( 'option' );
                customOption.value = '__nv_custom__';
                customOption.textContent = '自定义…';
                valueInput.appendChild( customOption );

                customInput = document.createElement( 'textarea' );
                customInput.className = 'nv-input nv-param-custom';
                customInput.rows = 2;
                customInput.placeholder = '输入自定义值' +
                    ( info.presets ? '（预设：' + info.presets + '）' : '' );
                customInput.value = isCustom ? currentValue : '';
                customInput.hidden = !isCustom;

                valueInput.value = isCustom ? '__nv_custom__' : currentValue;

                valueInput.addEventListener( 'change', function () {
                    var custom = valueInput.value === '__nv_custom__';
                    customInput.hidden = !custom;
                    if ( custom ) customInput.focus();
                } );

                if ( info.description ) valueInput.title = info.description;
            } else {
                valueInput = document.createElement( 'textarea' );
                valueInput.className = 'nv-input nv-param-value';
                valueInput.rows = 2;

                var hints = [];
                if ( info.description ) hints.push( info.description );
                if ( info.presets ) hints.push( '预设：' + info.presets );
                if ( info.example ) hints.push( '示例：' + info.example );
                if ( info.required ) hints.push( '必填' );

                valueInput.placeholder = hints.length
                    ? hints.join( '；' )
                    : '参数值（留空使用模板默认值）';
                valueInput.value = currentValue;
                if ( info.description ) valueInput.title = info.description;
            }

            var remove = document.createElement( 'button' );
            remove.type = 'button';
            remove.className = 'nv-param-remove';
            remove.title = '删除参数';
            remove.textContent = '×';
            remove.addEventListener( 'click', function ( e ) {
                e.preventDefault();
                if ( row.parentNode ) row.parentNode.removeChild( row );
            } );

            if ( titleEl ) row.appendChild( titleEl );

            line.appendChild( keyInput );
            line.appendChild( valueInput );
            line.appendChild( remove );
            row.appendChild( line );

            if ( customInput ) row.appendChild( customInput );

            var notes = [];

            if ( info.description && info.options && info.options.length ) {
                notes.push( info.description );
            }

            if ( info.required ) notes.push( '必填' );

            var defValue = paramDefaults[ key ];
            if ( defValue !== undefined && defValue !== '' ) {
                notes.push( '默认：' + ( info.defaultLabel || defValue ) );
            } else if ( info.defaultLabel ) {
                notes.push( '默认：' + info.defaultLabel );
            }

            if ( info.options && info.options.length ) {
                notes.push( '选项来自模板 #switch' );
            }

            if ( notes.length ) {
                var noteEl = document.createElement( 'div' );
                noteEl.className = 'nv-param-note';
                noteEl.textContent = notes.join( ' · ' );
                row.appendChild( noteEl );
            }

            paramListEl.appendChild( row );
        }

        function applyParamEditor() {
            if ( !paramWidget ) return;

            var parsed = parseTemplateInvocation(
                paramWidget.getAttribute( 'data-nv-invocation' ) || ''
            );
            if ( !parsed ) return;

            var params = [];
            var missingRequired = [];
            var rows = paramListEl.querySelectorAll( '.nv-param-row' );

            for ( var i = 0; i < rows.length; i++ ) {
                var row = rows[ i ];
                var keyEl = row.querySelector( '.nv-param-key' );
                var valueEl = row.querySelector( '.nv-param-value' );
                if ( !keyEl || !valueEl ) continue;

                var key = keyEl.value.trim();
                var value;

                if ( valueEl.tagName === 'SELECT' &&
                     valueEl.value === '__nv_custom__' ) {
                    var customEl = row.querySelector( '.nv-param-custom' );
                    value = customEl ? customEl.value : '';
                } else {
                    value = valueEl.value;
                }

                if ( !key && !value.trim() ) continue;

                if ( key ) {
                    var isOriginal = !!paramOriginalKeys[ key ];
                    var def = paramDefaults[ key ];
                    var hasDefault = def !== undefined && def !== '';
                    var isEmpty = !value.trim();

                    if ( isEmpty && paramRequired[ key ] && !isOriginal ) {
                        missingRequired.push( key );
                    }

                    /* 空值且不是原本显式传入的，直接省略，让模板套自己的默认值 */
                    if ( isEmpty && !isOriginal && !paramRequired[ key ] ) {
                        continue;
                    }

                    /* 没有改动的默认值也省略 */
                    if ( !isOriginal && hasDefault && value === def ) {
                        continue;
                    }
                }

                params.push( { key: key, value: value } );
            }

            if ( missingRequired.length ) {
                showToast(
                    '必填参数为空：' + missingRequired.join( '、' ),
                    3200
                );
            }

            var invocation = buildTemplateInvocation( parsed.name, params );
            if ( !isSingleTemplate( invocation ) ) {
                showToast( '参数格式不正确' );
                return;
            }

            var widget = paramWidget;
            widget.setAttribute( 'data-nv-invocation', invocation );
            widget.setAttribute( 'data-nv-rendered', '0' );

            var body = widget.querySelector( '.nv-widget-body' );
            if ( body ) {
                body.innerHTML =
                    '<div class="nv-widget-loading">正在渲染模板…</div>';
            }

            closeParamEditor();

            renderTemplate( invocation ).then( function ( html ) {
                if ( !body ) return;
                body.innerHTML = html || '';
                contentStyles( body );
                widget.setAttribute( 'data-nv-rendered', '1' );
                clampWidgetGridOffset( widget );
                fireWidgetContent( widget );
                afterEdit();
            }, function ( err ) {
                if ( body ) {
                    widgetError( body, '模板渲染失败：' + extractErrorInfo( err ) );
                }
                afterEdit();
                showToast( '模板渲染失败：' + extractErrorInfo( err ), 4200 );
            } );
        }

        function caretRangeFromPoint( x, y ) {
            var range = null;

            try {
                if ( document.caretRangeFromPoint ) {
                    range = document.caretRangeFromPoint( x, y );
                } else if ( document.caretPositionFromPoint ) {
                    var pos = document.caretPositionFromPoint( x, y );
                    if ( pos ) {
                        range = document.createRange();
                        range.setStart( pos.offsetNode, pos.offset );
                        range.collapse( true );
                    }
                }
            } catch ( e ) {}

            if ( range && editor.contains( range.startContainer ) ) return range;

            /* 点在行距 / 留白里时，按纵向位置找最近段落 */
            var children = editor.children;
            if ( children.length ) {
                var firstRect = children[ 0 ].getBoundingClientRect();
                if ( y < firstRect.top ) {
                    var atStart = document.createRange();
                    atStart.selectNodeContents( children[ 0 ] );
                    atStart.collapse( true );
                    return atStart;
                }
            }

            for ( var i = 0; i < children.length; i++ ) {
                var rect = children[ i ].getBoundingClientRect();
                if ( y >= rect.top && y <= rect.bottom ) {
                    var near = document.createRange();
                    near.selectNodeContents( children[ i ] );
                    near.collapse( y < rect.top + rect.height / 2 );
                    return near;
                }
            }

            if ( children.length ) {
                var atEnd = document.createRange();
                atEnd.selectNodeContents( children[ children.length - 1 ] );
                atEnd.collapse( false );
                return atEnd;
            }

            return null;
        }

        function insertWidgetAtRange( widget, range, y ) {
            if ( !range ) {
                var last = editor.lastElementChild;
                var tailEnd = makeEmptyBlock();
                if ( last ) {
                    last.parentNode.insertBefore( widget, last.nextSibling );
                    widget.parentNode.insertBefore( tailEnd, widget.nextSibling );
                } else {
                    editor.appendChild( widget );
                    editor.appendChild( tailEnd );
                }
                setCaretInside( tailEnd );
                return;
            }

            var block = closestBlock( range.startContainer );

            /* 落在已有控件上 */
            if ( block && isWidgetNode( block ) ) {
                var rect = block.getBoundingClientRect();
                var before = y < rect.top + rect.height / 2;
                var tailWidget = makeEmptyBlock();

                if ( before ) {
                    block.parentNode.insertBefore( widget, block );
                    block.parentNode.insertBefore( tailWidget, block );
                } else {
                    block.parentNode.insertBefore( widget, block.nextSibling );
                    block.parentNode.insertBefore( tailWidget, widget.nextSibling );
                }
                setCaretInside( tailWidget );
                return;
            }

            /* 落在分隔线上 */
            if ( block && block.tagName === 'HR' ) {
                var tailHr = makeEmptyBlock();
                block.parentNode.insertBefore( widget, block.nextSibling );
                block.parentNode.insertBefore( tailHr, widget.nextSibling );
                setCaretInside( tailHr );
                return;
            }

            if ( block && block.parentNode === editor ) {
                var tailRange = document.createRange();
                tailRange.selectNodeContents( block );
                tailRange.setStart( range.startContainer, range.startOffset );

                var frag = tailRange.extractContents();
                var tail = document.createElement( 'div' );
                tail.appendChild( frag );
                if ( !tail.textContent && !tail.querySelector( 'br,img,hr' ) ) {
                    tail.appendChild( document.createElement( 'br' ) );
                }

                var lastChild = block.lastChild;
                if ( lastChild && lastChild.nodeType === 1 &&
                     lastChild.tagName === 'BR' ) {
                    block.removeChild( lastChild );
                }

                var blockEmpty = !block.textContent.trim() &&
                    !block.querySelector( 'br,img,hr' );

                if ( blockEmpty ) {
                    block.parentNode.replaceChild( widget, block );
                    widget.parentNode.insertBefore( tail, widget.nextSibling );
                } else {
                    block.parentNode.insertBefore( widget, block.nextSibling );
                    block.parentNode.insertBefore( tail, widget.nextSibling );
                }

                setCaretInside( tail );
                return;
            }

            /* 编辑器空白处：追加到末尾 */
            var end = editor.lastElementChild;
            var tailEnd2 = makeEmptyBlock();
            if ( end ) {
                end.parentNode.insertBefore( widget, end.nextSibling );
                widget.parentNode.insertBefore( tailEnd2, widget.nextSibling );
            } else {
                editor.appendChild( widget );
                editor.appendChild( tailEnd2 );
            }
            setCaretInside( tailEnd2 );
        }

        /* ---------- 跟随鼠标的布置状态 ---------- */
        var placing = null;

        function beginPlacement( widget ) {
            if ( placing ) cancelPlacement();

            decorateWidget( widget );

            var paperRect = paper.getBoundingClientRect();
            var editorRect = editor.getBoundingClientRect();
            var edStyle = window.getComputedStyle( editor );
            var padLeft = parseFloat( edStyle.paddingLeft ) || 0;
            var padRight = parseFloat( edStyle.paddingRight ) || 0;

            var contentLeft = editorRect.left + padLeft;
            var contentWidth = Math.max( 120, editorRect.width - padLeft - padRight );
            var top = paperRect.top;
            var height = paperRect.height;

            /* 离屏测量控件实际宽度 */
            var measure = document.createElement( 'div' );
            measure.className = 'nv-widget-measure';
            measure.style.width = contentWidth + 'px';
            measure.style.maxWidth = contentWidth + 'px';

            var clone = widget.cloneNode( true );
            var cloneTools = clone.querySelector( '.nv-widget-tools' );
            if ( cloneTools ) cloneTools.parentNode.removeChild( cloneTools );

            measure.appendChild( clone );
            root.appendChild( measure );

            var clonedBody = clone.querySelector( '.nv-widget-body' );
            var measureRoot = clonedBody;

            if ( measureRoot ) {
                var first = measureRoot.firstElementChild;
                if ( first && first.classList &&
                     first.classList.contains( 'mw-parser-output' ) ) {
                    measureRoot = first;
                }
            }

            var measured = 0;
            if ( measureRoot ) {
                var kids = measureRoot.children;
                for ( var k = 0; k < kids.length; k++ ) {
                    var kw = Math.round( kids[ k ].getBoundingClientRect().width );
                    if ( kw > measured ) measured = kw;
                }
                if ( !measured ) {
                    measured = Math.round( measureRoot.getBoundingClientRect().width );
                }
            }

            var ghostWidth = measured ||
                Math.round( clone.getBoundingClientRect().width ) || 320;

            if ( widget.getAttribute( 'data-nv-type' ) === 'image' ) {
                ghostWidth = parseInt( widget.getAttribute( 'data-nv-width' ), 10 ) ||
                    ghostWidth || 320;
            }
            measure.parentNode.removeChild( measure );

            ghostWidth = Math.max( 80, Math.min( contentWidth, ghostWidth ) );

            var ghost = document.createElement( 'div' );
            ghost.className = 'nv-ghost';
            ghost.style.width = ghostWidth + 'px';

            var ghostBody = document.createElement( 'div' );
            ghostBody.className = 'nv-ghost-inner mw-parser-output';
            ghostBody.innerHTML = widget.querySelector( '.nv-widget-body' ).innerHTML;
            contentStyles( ghostBody );
            ghost.appendChild( ghostBody );

            var overlay = document.createElement( 'div' );
            overlay.className = 'nv-placement';
            overlay.style.left = paperRect.left + 'px';
            overlay.style.top = top + 'px';
            overlay.style.width = paperRect.width + 'px';
            overlay.style.height = height + 'px';

            var hint = document.createElement( 'div' );
            hint.className = 'nv-place-hint';
            hint.textContent = '移动鼠标选择位置 · 点击放置 · Esc 取消';

            root.appendChild( overlay );
            root.appendChild( ghost );
            root.appendChild( hint );

            var colWidth = contentWidth / 3;
            var labels = [ '左', '中', '右' ];
            var positions = [ 'left', 'center', 'right' ];
            var slots = [];

            for ( var i = 0; i < 3; i++ ) {
                ( function ( idx ) {
                    var slot = document.createElement( 'div' );
                    slot.className = 'nv-slot';
                    slot.style.left = ( contentLeft - paperRect.left + idx * colWidth ) + 'px';
                    slot.style.width = colWidth + 'px';

                    var label = document.createElement( 'span' );
                    label.className = 'nv-slot-label';
                    label.textContent = labels[ idx ];
                    slot.appendChild( label );

                    overlay.appendChild( slot );
                    slots.push( slot );
                } )( i );
            }

            var allowed = [ 'left', 'center', 'right' ];
            var type = widget.getAttribute( 'data-nv-type' );

            /*
             * 按模板的实际宽度给出可用格子：
             * 太宽的模板放在左右会挤掉正文，所以只给“居中”。
             */
            if ( type === 'template' && ghostWidth > contentWidth * 0.62 ) {
                allowed = [ 'center' ];
            }

            for ( var s = 0; s < slots.length; s++ ) {
                if ( allowed.indexOf( positions[ s ] ) === -1 ) {
                    slots[ s ].classList.add( 'is-disabled' );
                }
            }

            if ( allowed.length === 1 ) {
                hint.textContent = '此模板较宽，仅支持居中 · 点击放置 · Esc 取消';
            }

            var active = 'center';
            var lastX = null;
            var lastY = null;

            function relayout() {
                paperRect = paper.getBoundingClientRect();
                editorRect = editor.getBoundingClientRect();
                contentLeft = editorRect.left + padLeft;
                contentWidth = Math.max( 120, editorRect.width - padLeft - padRight );
                top = paperRect.top;
                height = paperRect.height;

                overlay.style.left = paperRect.left + 'px';
                overlay.style.top = top + 'px';
                overlay.style.width = paperRect.width + 'px';
                overlay.style.height = height + 'px';

                colWidth = contentWidth / 3;
                for ( var i = 0; i < slots.length; i++ ) {
                    slots[ i ].style.left =
                        ( contentLeft - paperRect.left + i * colWidth ) + 'px';
                    slots[ i ].style.width = colWidth + 'px';
                }

                if ( lastX !== null ) update( lastX, lastY );
            }

            function update( x, y ) {
                lastX = x;
                lastY = y;

                var inside = x >= paperRect.left && x <= paperRect.right &&
                    y >= top && y <= top + height;

                if ( !inside ) {
                    ghost.style.opacity = '0';
                    return;
                }

                ghost.style.opacity = '0.95';

                var idx = Math.max( 0, Math.min( 2,
                    Math.floor( ( x - contentLeft ) / colWidth ) ) );
                var pos = positions[ idx ];

                if ( allowed.indexOf( pos ) === -1 ) {
                    pos = 'center';
                    idx = 1;
                }

                active = pos;

                for ( var k = 0; k < slots.length; k++ ) {
                    slots[ k ].classList.toggle( 'is-active', positions[ k ] === pos );
                }

                var gx = contentLeft + idx * colWidth + colWidth / 2 - ghostWidth / 2;
                var minX = contentLeft;
                var maxX = contentLeft + contentWidth - ghostWidth;
                if ( maxX < minX ) maxX = minX;
                gx = Math.max( minX, Math.min( maxX, gx ) );

                var ghostHeight = ghost.getBoundingClientRect().height || 160;
                var gy = y - ghostHeight / 2;
                gy = Math.max( top + 8, Math.min( top + height - ghostHeight - 8, gy ) );

                ghost.style.left = gx + 'px';
                ghost.style.top = gy + 'px';
            }

            function onMove( e ) {
                update( e.clientX, e.clientY );
            }

            function onDown( e ) {
                if ( !placing ) return;

                /* 布置期间拦截所有点击，避免误触工具栏或链接 */
                e.preventDefault();
                e.stopPropagation();

                var rect = paper.getBoundingClientRect();
                if ( e.clientX < rect.left || e.clientX > rect.right ||
                     e.clientY < rect.top || e.clientY > rect.bottom ) {
                    cancelPlacement();
                    return;
                }

                update( e.clientX, e.clientY );
                if ( allowed.indexOf( active ) === -1 ) return;

                setWidgetPos( widget, active, true );

                var range = caretRangeFromPoint( e.clientX, e.clientY );
                insertWidgetAtRange( widget, range, e.clientY );

                cancelPlacement( true );
                fireWidgetContent( widget );
                afterEdit();
                editor.focus();
            }

            function onKey( e ) {
                if ( e.key === 'Escape' ) {
                    e.preventDefault();
                    cancelPlacement();
                }
            }

            function onContext( e ) {
                e.preventDefault();
                e.stopPropagation();
                cancelPlacement();
            }

            function onResize() {
                cancelPlacement();
            }

            placing = {
                widget: widget,
                ghost: ghost,
                overlay: overlay,
                hint: hint,
                listeners: [
                    [ document, 'pointermove', onMove, true ],
                    [ document, 'pointerdown', onDown, true ],
                    [ document, 'keydown', onKey, true ],
                    [ document, 'contextmenu', onContext, true ],
                    [ window, 'scroll', relayout, true ],
                    [ window, 'resize', onResize, false ]
                ]
            };

            for ( var l = 0; l < placing.listeners.length; l++ ) {
                placing.listeners[ l ][ 0 ].addEventListener(
                    placing.listeners[ l ][ 1 ],
                    placing.listeners[ l ][ 2 ],
                    placing.listeners[ l ][ 3 ]
                );
            }

            editor.setAttribute( 'contenteditable', 'false' );
            editor.classList.add( 'nv-placing' );

            update( contentLeft + contentWidth / 2, top + height / 2 );
        }

        function cancelPlacement( keepWidget ) {
            if ( !placing ) return;

            for ( var i = 0; i < placing.listeners.length; i++ ) {
                var l = placing.listeners[ i ];
                try {
                    l[ 0 ].removeEventListener( l[ 1 ], l[ 2 ], l[ 3 ] );
                } catch ( e ) {}
            }

            if ( placing.ghost.parentNode ) placing.ghost.parentNode.removeChild( placing.ghost );
            if ( placing.overlay.parentNode ) placing.overlay.parentNode.removeChild( placing.overlay );
            if ( placing.hint.parentNode ) placing.hint.parentNode.removeChild( placing.hint );

            editor.setAttribute( 'contenteditable', 'true' );
            editor.classList.remove( 'nv-placing' );

            if ( !keepWidget && placing.widget && placing.widget.parentNode ) {
                placing.widget.parentNode.removeChild( placing.widget );
            }

            placing = null;
        }

        /* ---------- 模板：按 JS 计算出的格子布置 ---------- */
        function beginTemplatePlacement( widget ) {
            if ( placing ) cancelPlacement();

            decorateWidget( widget );

            var paperRect = paper.getBoundingClientRect();
            var editorRect = editor.getBoundingClientRect();
            var edStyle = window.getComputedStyle( editor );
            var padLeft = parseFloat( edStyle.paddingLeft ) || 0;
            var padRight = parseFloat( edStyle.paddingRight ) || 0;
            var padTop = parseFloat( edStyle.paddingTop ) || 0;

            var contentLeft = editorRect.left + padLeft;
            var contentWidth = Math.max( 120, editorRect.width - padLeft - padRight );
            var textTop = Math.max( paperRect.top + 6, editorRect.top + padTop );
            var textHeight = Math.max( 120, paperRect.bottom - 6 - textTop );
            var lineHeight = parseFloat( edStyle.lineHeight );
            var rowHeight = lineHeight > 10 ? Math.round( lineHeight ) : 32;

            /* 离屏测量模板真实宽高 */
            var measure = document.createElement( 'div' );
            measure.className = 'nv-widget-measure';
            measure.style.width = contentWidth + 'px';
            measure.style.maxWidth = contentWidth + 'px';

            var clone = widget.cloneNode( true );
            var cloneTools = clone.querySelector( '.nv-widget-tools' );
            if ( cloneTools ) cloneTools.parentNode.removeChild( cloneTools );
            measure.appendChild( clone );
            root.appendChild( measure );

            var clonedBody = clone.querySelector( '.nv-widget-body' );
            var measureRoot = clonedBody;

            if ( measureRoot ) {
                var first = measureRoot.firstElementChild;
                if ( first && first.classList &&
                     first.classList.contains( 'mw-parser-output' ) ) {
                    measureRoot = first;
                }
            }

            var tplWidth = 0;
            var tplHeight = 0;

            if ( measureRoot ) {
                var kids = measureRoot.children;
                for ( var k = 0; k < kids.length; k++ ) {
                    var kw = Math.round( kids[ k ].getBoundingClientRect().width );
                    var kh = Math.round( kids[ k ].getBoundingClientRect().height );
                    if ( kw > tplWidth ) tplWidth = kw;
                    if ( kh > tplHeight ) tplHeight = kh;
                }
                if ( !tplWidth ) {
                    tplWidth = Math.round( measureRoot.getBoundingClientRect().width );
                }
                if ( !tplHeight ) {
                    tplHeight = Math.round( measureRoot.getBoundingClientRect().height );
                }
            }
            measure.parentNode.removeChild( measure );

            tplWidth = Math.max( 80, Math.min( contentWidth, tplWidth || 300 ) );
            tplHeight = Math.max( 60, tplHeight || 160 );

            /* JS 按模板宽度算出允许的列起点 */
            var columns = 12;
            var step = contentWidth / columns;
            var maxOffset = Math.max( 0, contentWidth - tplWidth );
            var offsets = [];

            for ( var o = 0; o <= maxOffset + 0.5; o += step ) {
                offsets.push( Math.round( o ) );
            }
            if ( !offsets.length ) offsets.push( 0 );

            var rowSpan = Math.max( 1, Math.ceil( tplHeight / rowHeight ) );

            var ghost = document.createElement( 'div' );
            ghost.className = 'nv-ghost nv-template-ghost';
            ghost.style.width = tplWidth + 'px';

            var ghostBody = document.createElement( 'div' );
            ghostBody.className = 'nv-ghost-inner mw-parser-output';
            ghostBody.innerHTML = widget.querySelector( '.nv-widget-body' ).innerHTML;
            contentStyles( ghostBody );
            ghost.appendChild( ghostBody );

            var overlay = document.createElement( 'div' );
            overlay.className = 'nv-placement nv-template-grid';
            overlay.style.left = contentLeft + 'px';
            overlay.style.top = textTop + 'px';
            overlay.style.width = contentWidth + 'px';
            overlay.style.height = textHeight + 'px';
            overlay.style.setProperty( '--nv-grid-w', step + 'px' );
            overlay.style.setProperty( '--nv-grid-h', rowHeight + 'px' );

            var cell = document.createElement( 'div' );
            cell.className = 'nv-grid-cell';
            overlay.appendChild( cell );

            var hint = document.createElement( 'div' );
            hint.className = 'nv-place-hint';
            hint.textContent = '移动鼠标选择格子 · 点击放置 · Esc 取消';

            root.appendChild( overlay );
            root.appendChild( ghost );
            root.appendChild( hint );

            var activeOffset = 0;
            var activeRow = 0;
            var lastX = null;
            var lastY = null;

            function nearestOffset( x ) {
                var desired = x - contentLeft - tplWidth / 2;
                var best = offsets[ 0 ];
                var bestDist = Infinity;

                for ( var i = 0; i < offsets.length; i++ ) {
                    var d = Math.abs( offsets[ i ] - desired );
                    if ( d < bestDist ) {
                        bestDist = d;
                        best = offsets[ i ];
                    }
                }
                return best;
            }

            function reposition() {
                paperRect = paper.getBoundingClientRect();
                editorRect = editor.getBoundingClientRect();
                contentLeft = editorRect.left + padLeft;
                contentWidth = Math.max( 120, editorRect.width - padLeft - padRight );
                textTop = Math.max( paperRect.top + 6, editorRect.top + padTop );
                textHeight = Math.max( 120, paperRect.bottom - 6 - textTop );

                overlay.style.left = contentLeft + 'px';
                overlay.style.top = textTop + 'px';
                overlay.style.width = contentWidth + 'px';
                overlay.style.height = textHeight + 'px';

                if ( lastX !== null ) update( lastX, lastY );
            }

            function update( x, y ) {
                lastX = x;
                lastY = y;

                var inside = x >= paperRect.left && x <= paperRect.right &&
                    y >= paperRect.top && y <= paperRect.bottom;

                if ( !inside ) {
                    ghost.style.opacity = '0';
                    cell.style.opacity = '0';
                    return;
                }

                ghost.style.opacity = '0.95';
                cell.style.opacity = '1';

                activeOffset = nearestOffset( x );

                var maxRow = Math.max( 0,
                    Math.floor( ( textHeight - rowSpan * rowHeight ) / rowHeight ) );
                var row = Math.round( ( y - textTop ) / rowHeight );
                row = Math.max( 0, Math.min( maxRow, row ) );
                activeRow = row;

                var gx = contentLeft + activeOffset;
                var gy = textTop + activeRow * rowHeight;
                var ghostHeight = ghost.getBoundingClientRect().height || tplHeight;

                gx = Math.max( contentLeft,
                    Math.min( contentLeft + contentWidth - tplWidth, gx ) );
                gy = Math.max( textTop,
                    Math.min( textTop + textHeight - ghostHeight, gy ) );

                ghost.style.left = gx + 'px';
                ghost.style.top = gy + 'px';

                cell.style.left = activeOffset + 'px';
                cell.style.top = ( activeRow * rowHeight ) + 'px';
                cell.style.width = tplWidth + 'px';
                cell.style.height = ( rowSpan * rowHeight ) + 'px';
            }

            function onMove( e ) {
                update( e.clientX, e.clientY );
            }

            function onDown( e ) {
                if ( !placing ) return;

                e.preventDefault();
                e.stopPropagation();

                var rect = paper.getBoundingClientRect();
                if ( e.clientX < rect.left || e.clientX > rect.right ||
                     e.clientY < rect.top || e.clientY > rect.bottom ) {
                    cancelPlacement();
                    return;
                }

                update( e.clientX, e.clientY );
                setWidgetGridOffset( widget, activeOffset );

                var range = caretRangeFromPoint( e.clientX, e.clientY );
                insertWidgetAtRange( widget, range, e.clientY );

                cancelPlacement( true );
                fireWidgetContent( widget );
                afterEdit();
                editor.focus();

                /* 放置点击后弹出参数表单（模板没有参数时自动不打扰） */
                setTimeout( function () {
                    if ( widget.parentNode ) {
                        openParamEditor( widget, { auto: true } );
                    }
                }, 80 );
            }

            function onKey( e ) {
                if ( e.key === 'Escape' ) {
                    e.preventDefault();
                    cancelPlacement();
                }
            }

            function onContext( e ) {
                e.preventDefault();
                e.stopPropagation();
                cancelPlacement();
            }

            function onResize() {
                cancelPlacement();
            }

            placing = {
                widget: widget,
                ghost: ghost,
                overlay: overlay,
                hint: hint,
                listeners: [
                    [ document, 'pointermove', onMove, true ],
                    [ document, 'pointerdown', onDown, true ],
                    [ document, 'keydown', onKey, true ],
                    [ document, 'contextmenu', onContext, true ],
                    [ window, 'scroll', reposition, true ],
                    [ window, 'resize', onResize, false ]
                ]
            };

            for ( var l = 0; l < placing.listeners.length; l++ ) {
                placing.listeners[ l ][ 0 ].addEventListener(
                    placing.listeners[ l ][ 1 ],
                    placing.listeners[ l ][ 2 ],
                    placing.listeners[ l ][ 3 ]
                );
            }

            editor.setAttribute( 'contenteditable', 'false' );
            editor.classList.add( 'nv-placing' );

            update( contentLeft + contentWidth / 2, textTop + textHeight / 2 );
        }

        /* ---------- 控件交互 ---------- */
        editor.addEventListener( 'click', function ( e ) {
            var target = e.target;
            if ( !target || !target.closest ) return;

            var widget = target.closest( '.nv-widget' );
            if ( !widget || !editor.contains( widget ) ) return;

            if ( target.closest( '[data-nv-param]' ) ) {
                e.preventDefault();
                e.stopPropagation();
                openParamEditor( widget );
                return;
            }

            var posBtn = target.closest( '[data-nv-pos-btn]' );
            if ( posBtn ) {
                e.preventDefault();
                e.stopPropagation();
                setWidgetPos( widget, posBtn.getAttribute( 'data-nv-pos-btn' ) );
                afterEdit();
                return;
            }

            if ( target.closest( '[data-nv-del]' ) ) {
                e.preventDefault();
                e.stopPropagation();
                removeWidget( widget );
                afterEdit();
                return;
            }

            if ( target.closest( '[data-nv-retry]' ) ) {
                e.preventDefault();
                e.stopPropagation();
                renderWidget( widget, true );
                return;
            }

            /* 编辑状态下不跳转模板内部的链接；Ctrl/Cmd + 点击仍可打开 */
            if ( target.closest( 'a' ) && !( e.ctrlKey || e.metaKey ) ) {
                e.preventDefault();
            }
        } );

        editor.addEventListener( 'mousedown', function ( e ) {
            var target = e.target;
            if ( !target || !target.closest ) return;
            if ( target.closest( '.nv-widget-tools, .nv-resize-handle' ) ) {
                e.preventDefault();
            }
        } );

        editor.addEventListener( 'pointerdown', function ( e ) {
            var target = e.target;
            if ( !target || !target.closest ) return;

            var handle = target.closest( '.nv-resize-handle' );
            if ( !handle ) return;

            var widget = handle.closest( '.nv-widget' );
            var img = widget && widget.querySelector( 'img' );
            if ( !img ) return;

            e.preventDefault();
            e.stopPropagation();

            var pos = widget.getAttribute( 'data-nv-pos' ) || 'center';
            var startX = e.clientX;
            var startWidth = parseInt( widget.getAttribute( 'data-nv-width' ), 10 ) ||
                Math.round( img.getBoundingClientRect().width ) ||
                Math.round( img.width ) || 320;

            var edStyle = window.getComputedStyle( editor );
            var baseWidth = editor.clientWidth || paper.clientWidth ||
                window.innerWidth || 800;
            var maxWidth = Math.max(
                120,
                baseWidth -
                ( parseFloat( edStyle.paddingLeft ) || 0 ) -
                ( parseFloat( edStyle.paddingRight ) || 0 )
            );

            document.body.style.cursor = 'ew-resize';

            function move( ev ) {
                var dx = ev.clientX - startX;
                var width = pos === 'right' ? startWidth - dx : startWidth + dx;
                width = Math.max( 80, Math.min( maxWidth, width ) );

                img.style.width = width + 'px';
                img.style.height = 'auto';
                widget.setAttribute( 'data-nv-width', String( Math.round( width ) ) );
                updateWidthBadge( widget );
            }

            function up() {
                document.body.style.cursor = '';
                document.removeEventListener( 'pointermove', move, true );
                document.removeEventListener( 'pointerup', up, true );
                afterEdit();
            }

            document.addEventListener( 'pointermove', move, true );
            document.addEventListener( 'pointerup', up, true );
        } );

        /* ---------- 右键菜单 ---------- */
        var menu = document.createElement( 'div' );
        menu.className = 'nv-menu';
        menu.hidden = true;
        root.appendChild( menu );

        var widgetMenu = document.createElement( 'div' );
        widgetMenu.className = 'nv-menu';
        widgetMenu.hidden = true;
        root.appendChild( widgetMenu );

        function hideWidgetMenu() {
            widgetMenu.hidden = true;
        }

        function positionMenu( el, x, y ) {
            el.hidden = false;
            el.style.left = '0px';
            el.style.top = '0px';

            var rect = el.getBoundingClientRect();
            var left = Math.max( 8, Math.min( x, window.innerWidth - rect.width - 8 ) );
            var top = Math.max( 8, Math.min( y, window.innerHeight - rect.height - 8 ) );

            el.style.left = left + 'px';
            el.style.top = top + 'px';
        }

        function showWidgetMenu( widget, x, y ) {
            widgetMenu.textContent = '';

            var type = widget.getAttribute( 'data-nv-type' );
            var items = [];

            if ( type === 'template' ) {
                items.push( {
                    label: '编辑参数',
                    action: function () { openParamEditor( widget ); }
                } );
                items.push( {
                    label: '删除',
                    action: function () {
                        removeWidget( widget );
                        afterEdit();
                    }
                } );
            } else {
                items.push( {
                    label: '靠左',
                    action: function () { setWidgetPos( widget, 'left' ); afterEdit(); }
                } );
                items.push( {
                    label: '居中',
                    action: function () { setWidgetPos( widget, 'center' ); afterEdit(); }
                } );
                items.push( {
                    label: '靠右',
                    action: function () { setWidgetPos( widget, 'right' ); afterEdit(); }
                } );
                items.push( {
                    label: '删除',
                    action: function () {
                        removeWidget( widget );
                        afterEdit();
                    }
                } );
            }

            items.forEach( function ( item ) {
                var btn = document.createElement( 'button' );
                btn.type = 'button';
                btn.textContent = item.label;

                btn.addEventListener( 'mousedown', function ( e ) {
                    e.preventDefault();
                } );
                btn.addEventListener( 'click', function ( e ) {
                    e.preventDefault();
                    hideWidgetMenu();
                    item.action();
                } );

                widgetMenu.appendChild( btn );
            } );

            positionMenu( widgetMenu, x, y );
        }

        function placeCaretAtPoint( x, y ) {
            var range = null;
            if ( document.caretRangeFromPoint ) {
                range = document.caretRangeFromPoint( x, y );
            } else if ( document.caretPositionFromPoint ) {
                var pos = document.caretPositionFromPoint( x, y );
                if ( pos ) {
                    range = document.createRange();
                    range.setStart( pos.offsetNode, pos.offset );
                    range.collapse( true );
                }
            }
            if ( range && editor.contains( range.startContainer ) ) {
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange( range );
            }
        }

        function runMenuCommand( cmd ) {
            hideMenu();
            editor.focus();

            if ( cmd === 'bold' ) execFormat( 'bold' );
            else if ( cmd === 'italic' ) execFormat( 'italic' );
            else if ( cmd === 'underline' ) execFormat( 'underline' );
            else if ( cmd === 'strike' ) execFormat( 'strikeThrough' );
            else if ( cmd === 'center' ) toggleCenter();
            else if ( cmd === 'h1' ) applyHeading( 1 );
            else if ( cmd === 'h2' ) applyHeading( 2 );
            else if ( cmd === 'h3' ) applyHeading( 3 );
            else if ( cmd === 'rule' ) insertRule();
            else if ( cmd === 'clear' ) clearFormat();
        }

        function hideMenu() {
            menu.hidden = true;
        }

        function showMenu( x, y ) {
            positionMenu( menu, x, y );
        }

        ( function buildMenu() {
            var items = [
                { cmd: 'bold', label: '粗体', key: 'Ctrl+B' },
                { cmd: 'italic', label: '斜体', key: 'Ctrl+I' },
                { cmd: 'underline', label: '下划线', key: 'Ctrl+U' },
                { cmd: 'strike', label: '删除线' },
                { sep: true },
                { cmd: 'center', label: '居中' },
                { cmd: 'h1', label: '一级标题' },
                { cmd: 'h2', label: '二级标题' },
                { cmd: 'h3', label: '三级标题' },
                { sep: true },
                { cmd: 'rule', label: '分隔线' },
                { cmd: 'clear', label: '清除格式' }
            ];

            items.forEach( function ( item ) {
                if ( item.sep ) {
                    var sep = document.createElement( 'div' );
                    sep.className = 'nv-menu-sep';
                    menu.appendChild( sep );
                    return;
                }

                var btn = document.createElement( 'button' );
                btn.type = 'button';
                btn.setAttribute( 'data-cmd', item.cmd );
                btn.appendChild( document.createTextNode( item.label ) );

                if ( item.key ) {
                    var kbd = document.createElement( 'kbd' );
                    kbd.textContent = item.key;
                    btn.appendChild( kbd );
                }

                btn.addEventListener( 'mousedown', function ( e ) {
                    e.preventDefault();
                } );
                btn.addEventListener( 'click', function ( e ) {
                    e.preventDefault();
                    runMenuCommand( item.cmd );
                } );

                menu.appendChild( btn );
            } );
        }() );

        /* ---------- 工具栏 ---------- */
        var formatButtons = {};
        var headingButtons = {};

        function makeButton( o ) {
            var btn = document.createElement( 'button' );
            btn.type = 'button';
            btn.className = 'nv-btn' + ( o.cls ? ' ' + o.cls : '' );

            if ( o.title ) {
                btn.title = o.title;
                btn.setAttribute( 'aria-label', o.title );
            }
            if ( o.html ) btn.innerHTML = o.html;
            else if ( o.label ) btn.textContent = o.label;

            btn.addEventListener( 'mousedown', function ( e ) {
                e.preventDefault();
            } );
            btn.addEventListener( 'click', function ( e ) {
                e.preventDefault();
                if ( o.action ) o.action();
            } );

            return btn;
        }

        formatButtons.bold = makeButton( {
            html: '<span class="nv-glyph nv-glyph-b">B</span>',
            title: '粗体（Ctrl+B）',
            action: function () { execFormat( 'bold' ); }
        } );

        formatButtons.italic = makeButton( {
            html: '<span class="nv-glyph nv-glyph-i">I</span>',
            title: '斜体（Ctrl+I）',
            action: function () { execFormat( 'italic' ); }
        } );

        formatButtons.underline = makeButton( {
            html: '<span class="nv-glyph nv-glyph-u">U</span>',
            title: '下划线（Ctrl+U）',
            action: function () { execFormat( 'underline' ); }
        } );

        formatButtons.strike = makeButton( {
            html: '<span class="nv-glyph nv-glyph-s">S</span>',
            title: '删除线',
            action: function () { execFormat( 'strikeThrough' ); }
        } );

        formatButtons.center = makeButton( {
            html: svg( 'center' ),
            title: '居中',
            action: toggleCenter
        } );

        var headingGroup = [];
        for ( var level = 1; level <= 6; level++ ) {
            ( function ( lv ) {
                var btn = makeButton( {
                    html: '<span class="nv-glyph nv-glyph-h">H' + lv + '</span>',
                    title: lv + ' 级标题',
                    action: function () { applyHeading( lv ); }
                } );
                headingButtons[ lv ] = btn;
                headingGroup.push( btn );
            } )( level );
        }

        var ruleBtn = makeButton( {
            html: svg( 'rule' ),
            title: '分隔线',
            action: insertRule
        } );

        var clearBtn = makeButton( {
            html: svg( 'clear' ),
            title: '清除格式',
            action: clearFormat
        } );

        var structureBtn = makeButton( {
            html: '<span class="nv-glyph">▤</span><span>结构</span>',
            title: '显示或隐藏代码嵌套结构',
            action: function () {
                setStructure( !root.classList.contains( 'nv-show-structure' ) );
            }
        } );
        structureBtn.setAttribute( 'aria-pressed', 'false' );

        function setStructure( on ) {
            root.classList.toggle( 'nv-show-structure', !!on );
            structureBtn.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
            storageSet( LS.structure, on ? '1' : '0' );
        }

        /* ---------- 模板 / 图片插入面板 ---------- */
        var templatePop = document.createElement( 'div' );
        templatePop.className = 'nv-pop';
        templatePop.hidden = true;
        templatePop.innerHTML =
            '<div class="nv-pop-title">插入模板</div>' +
            '<label class="nv-pop-label">常用模板</label>' +
            '<select class="nv-input nv-select" data-nv-common></select>' +
            '<label class="nv-pop-label">模板名（不限命名空间）</label>' +
            '<input class="nv-input" type="text" data-nv-template-name ' +
            'placeholder="例如 Template:XLCS 或 User:.../模板">' +
            '<div class="nv-pop-hint">XLCS 层级 · XECS 实体 · XOCS 物品 · XPCS 效应。' +
            '下拉框只是快捷选项，也可以直接输入任意页面名。</div>' +
            '<div class="nv-pop-actions">' +
            '<button type="button" class="nv-pop-primary" data-nv-template-insert>插入</button>' +
            '</div>';

        var templateSelect = templatePop.querySelector( '[data-nv-common]' );
        var templateInput = templatePop.querySelector( '[data-nv-template-name]' );
        var templateInsertBtn = templatePop.querySelector( '[data-nv-template-insert]' );

        ( function fillTemplateSelect() {
            var placeholder = document.createElement( 'option' );
            placeholder.value = '';
            placeholder.textContent = '选择常用模板…';
            templateSelect.appendChild( placeholder );

            COMMON_TEMPLATES.forEach( function ( name ) {
                var opt = document.createElement( 'option' );
                var meta = commonTemplateMeta( name );

                opt.value = name;
                opt.textContent = meta && meta.label
                    ? name + '（' + meta.label + '）'
                    : name;
                templateSelect.appendChild( opt );
            } );

            var custom = document.createElement( 'option' );
            custom.value = '__custom__';
            custom.textContent = '自定义…';
            templateSelect.appendChild( custom );
        }() );

        templateSelect.addEventListener( 'change', function () {
            var value = templateSelect.value;
            if ( value === '__custom__' ) {
                templateInput.value = '';
                templateInput.focus();
            } else if ( value ) {
                templateInput.value = value;
                templateInput.focus();
            }
        } );

        var imagePop = document.createElement( 'div' );
        imagePop.className = 'nv-pop';
        imagePop.hidden = true;
        imagePop.innerHTML =
            '<div class="nv-pop-title">插入图片</div>' +
            '<label class="nv-pop-label">站内图片文件</label>' +
            '<input class="nv-input" type="text" data-nv-image-name ' +
            'placeholder="例如 封面.png">' +
            '<label class="nv-pop-label">初始宽度（px）</label>' +
            '<input class="nv-input nv-input-number" type="number" value="320" ' +
            'min="80" max="2000" step="10" data-nv-image-width>' +
            '<div class="nv-pop-hint">只输入站内已上传文件的文件名，不接受外链或网址。</div>' +
            '<div class="nv-pop-actions">' +
            '<button type="button" class="nv-pop-primary" data-nv-image-insert>插入</button>' +
            '</div>';

        var imageInput = imagePop.querySelector( '[data-nv-image-name]' );
        var imageWidthInput = imagePop.querySelector( '[data-nv-image-width]' );
        var imageInsertBtn = imagePop.querySelector( '[data-nv-image-insert]' );

        function normalizeTemplateInput( value ) {
            var name = String( value || '' ).trim();
            if ( /^\{\{[\s\S]*\}\}$/.test( name ) ) {
                name = name.slice( 2, -2 ).trim();
            }
            return name;
        }

        function insertTemplateFromPicker() {
            var name = normalizeTemplateInput( templateInput.value );
            if ( !name ) {
                showToast( '请选择或输入模板名' );
                return;
            }

            var invocation = '{{' + name + '}}';
            if ( !isSingleTemplate( invocation ) ) {
                showToast( '模板名格式不正确' );
                return;
            }
            if ( isMetaTemplate( invocation ) ) {
                showToast( '这不是正文模板' );
                return;
            }

            closeAllPops();
            showToast( '正在渲染模板…' );

            renderTemplate( invocation ).then( function ( html ) {
                var spec = {
                    type: 'template',
                    invocation: invocation,
                    pos: 'grid',
                    offset: 0
                };
                var temp = document.createElement( 'div' );
                temp.innerHTML = templateWidgetHtml( spec );
                var widget = temp.firstElementChild;
                var body = widget.querySelector( '.nv-widget-body' );

                body.innerHTML = html || '';
                contentStyles( body );
                widget.setAttribute( 'data-nv-rendered', '1' );

                /* 预读模板页面参数，放置后的参数表直接就是填好的 */
                var parsed = parseTemplateInvocation( invocation );
                if ( parsed ) fetchTemplateInfo( parsed.name ).catch( function () {} );

                decorateWidget( widget );
                beginTemplatePlacement( widget );
            }, function ( err ) {
                showToast( '模板渲染失败：' + extractErrorInfo( err ), 4200 );
            } );
        }

        function normalizeImageName( value ) {
            return String( value || '' )
                .trim()
                .replace( /^(?:File|Image|Media):/i, '' )
                .trim();
        }

        function insertImageFromPicker() {
            var raw = imageInput.value.trim();
            if ( !raw ) {
                showToast( '请输入站内图片文件名' );
                return;
            }

            if ( /^(?:https?:)?\/\//i.test( raw ) || /^data:/i.test( raw ) ) {
                showToast(
                    '只支持站内文件，请输入文件名',
                    3600
                );
                return;
            }

            var name = normalizeImageName( raw );
            if ( !name || /[|\]\n]/.test( name ) ) {
                showToast( '图片名不能包含 | ] 或换行' );
                return;
            }

            var width = parseInt( imageWidthInput.value, 10 );
            if ( isNaN( width ) ) width = 320;
            width = Math.max( 80, Math.min( 2000, Math.round( width ) ) );

            var edStyle = window.getComputedStyle( editor );
            var baseWidth = editor.clientWidth || paper.clientWidth ||
                window.innerWidth || 800;
            var maxW = Math.max(
                80,
                baseWidth -
                ( parseFloat( edStyle.paddingLeft ) || 0 ) -
                ( parseFloat( edStyle.paddingRight ) || 0 )
            );
            width = Math.min( width, Math.round( maxW ) );

            closeAllPops();
            showToast( '正在载入图片…' );

            resolveImageUrl( name ).then( function ( url ) {
                var spec = { type: 'image', name: name, width: width, pos: 'center' };
                var temp = document.createElement( 'div' );
                temp.innerHTML = imageWidgetHtml( spec );
                var widget = temp.firstElementChild;
                var body = widget.querySelector( '.nv-widget-body' );

                var img = document.createElement( 'img' );
                img.src = url;
                img.alt = name;
                img.draggable = false;
                img.style.width = width + 'px';
                img.style.height = 'auto';

                body.innerHTML = '';
                body.appendChild( img );
                widget.setAttribute( 'data-nv-rendered', '1' );

                decorateWidget( widget );
                beginPlacement( widget );
            }, function ( err ) {
                showToast( '图片载入失败：' + extractErrorInfo( err ), 4200 );
            } );
        }

        templateInsertBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            insertTemplateFromPicker();
        } );

        imageInsertBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            insertImageFromPicker();
        } );

        templateInput.addEventListener( 'keydown', function ( e ) {
            if ( e.key === 'Enter' ) {
                e.preventDefault();
                insertTemplateFromPicker();
            }
        } );

        imageInput.addEventListener( 'keydown', function ( e ) {
            if ( e.key === 'Enter' ) {
                e.preventDefault();
                insertImageFromPicker();
            }
        } );

        imageWidthInput.addEventListener( 'keydown', function ( e ) {
            if ( e.key === 'Enter' ) {
                e.preventDefault();
                insertImageFromPicker();
            }
        } );

        /* ---------- 特殊字符面板 ---------- */
        var charPanel = document.createElement( 'div' );
        charPanel.className = 'nv-chars';
        charPanel.hidden = true;

        ( function buildCharPanel() {
            var tabsEl = document.createElement( 'div' );
            tabsEl.className = 'nv-char-tabs';

            var grid = document.createElement( 'div' );
            grid.className = 'nv-char-grid';

            var cats = CHAR_CATEGORIES.map( function ( c ) {
                return {
                    id: c.id,
                    name: c.name,
                    chars: c.chars.slice( 0 )
                };
            } );

            var recent = [];
            try {
                var raw = storageGet( LS.recent );
                var arr = raw ? JSON.parse( raw ) : [];
                if ( Object.prototype.toString.call( arr ) === '[object Array]' ) {
                    recent = arr.filter( function ( x ) {
                        return typeof x === 'string' && x.length > 0;
                    } ).slice( 0, 48 );
                }
            } catch ( e ) {
                recent = [];
            }
            cats[ 0 ].chars = recent;

            var activeId = recent.length ? 'recent' : 'cn';
            var tabButtons = {};

            function getCat( id ) {
                for ( var i = 0; i < cats.length; i++ ) {
                    if ( cats[ i ].id === id ) return cats[ i ];
                }
                return cats[ 0 ];
            }

            function remember( ch ) {
                recent = [ ch ].concat( recent.filter( function ( x ) {
                    return x !== ch;
                } ) ).slice( 0, 48 );
                storageSet( LS.recent, JSON.stringify( recent ) );
                cats[ 0 ].chars = recent;

                var btn = tabButtons.recent;
                if ( btn ) {
                    var count = btn.querySelector( '.nv-char-count' );
                    if ( count ) count.textContent = recent.length;
                }
                if ( activeId === 'recent' ) renderGrid();
            }

            function renderGrid() {
                var cat = getCat( activeId );
                grid.textContent = '';

                if ( !cat.chars.length ) {
                    var empty = document.createElement( 'div' );
                    empty.className = 'nv-char-empty';
                    empty.textContent = '点击任意字符后，会在这里留下记录。';
                    grid.appendChild( empty );
                    return;
                }

                var frag = document.createDocumentFragment();

                cat.chars.forEach( function ( ch ) {
                    var btn = document.createElement( 'button' );
                    btn.type = 'button';
                    btn.className = 'nv-char';
                    btn.textContent = ch;
                    btn.title = '插入 ' + ch;
                    btn.setAttribute( 'aria-label', '插入字符 ' + ch );

                    btn.addEventListener( 'mousedown', function ( e ) {
                        e.preventDefault();
                    } );
                    btn.addEventListener( 'click', function ( e ) {
                        e.preventDefault();
                        insertTextAtCaret( ch );
                        remember( ch );
                    } );

                    frag.appendChild( btn );
                } );

                grid.appendChild( frag );
            }

            function selectCat( id ) {
                activeId = id;
                for ( var key in tabButtons ) {
                    if ( Object.prototype.hasOwnProperty.call( tabButtons, key ) ) {
                        tabButtons[ key ].classList.toggle( 'is-active', key === id );
                    }
                }
                renderGrid();
            }

            cats.forEach( function ( cat ) {
                var btn = document.createElement( 'button' );
                btn.type = 'button';
                btn.className = 'nv-char-tab';
                btn.appendChild( document.createTextNode( cat.name ) );

                var count = document.createElement( 'span' );
                count.className = 'nv-char-count';
                count.textContent = cat.chars.length;
                count.style.marginLeft = '4px';
                count.style.opacity = '0.55';
                btn.appendChild( count );

                btn.addEventListener( 'click', function () {
                    selectCat( cat.id );
                } );

                tabButtons[ cat.id ] = btn;
                tabsEl.appendChild( btn );
            } );

            charPanel.appendChild( tabsEl );
            charPanel.appendChild( grid );
            selectCat( activeId );
        }() );

        var charsBtn = makeButton( {
            html: svg( 'chars' ) + '<span class="nv-glyph-chars">特殊字符</span>',
            title: '展开或收起特殊字符',
            action: function () {
                var open = charPanel.hidden;
                closeAllPops( 'chars' );
                charPanel.hidden = !open;
                charsBtn.setAttribute( 'aria-pressed', open ? 'true' : 'false' );
                storageSet( LS.chars, charPanel.hidden ? '0' : '1' );
            }
        } );
        charsBtn.setAttribute( 'aria-pressed', 'false' );

        var charsAnchor = document.createElement( 'div' );
        charsAnchor.className = 'nv-chars-anchor';
        charsAnchor.appendChild( charsBtn );
        charsAnchor.appendChild( charPanel );

        var templateBtn = makeButton( {
            html: svg( 'template' ) + '<span>模板</span>',
            title: '插入模板',
            action: function () {
                var open = templatePop.hidden;
                closeAllPops( 'template' );
                templatePop.hidden = !open;
                templateBtn.setAttribute( 'aria-pressed', open ? 'true' : 'false' );
                if ( open ) {
                    placePopover( templatePop );
                    templateInput.focus();
                }
            }
        } );
        templateBtn.setAttribute( 'aria-pressed', 'false' );

        var templateAnchor = document.createElement( 'div' );
        templateAnchor.className = 'nv-pop-anchor';
        templateAnchor.appendChild( templateBtn );
        templateAnchor.appendChild( templatePop );

        var imageBtn = makeButton( {
            html: svg( 'image' ) + '<span>图片</span>',
            title: '插入图片',
            action: function () {
                var open = imagePop.hidden;
                closeAllPops( 'image' );
                imagePop.hidden = !open;
                imageBtn.setAttribute( 'aria-pressed', open ? 'true' : 'false' );
                if ( open ) {
                    placePopover( imagePop );
                    imageInput.focus();
                }
            }
        } );
        imageBtn.setAttribute( 'aria-pressed', 'false' );

        var imageAnchor = document.createElement( 'div' );
        imageAnchor.className = 'nv-pop-anchor';
        imageAnchor.appendChild( imageBtn );
        imageAnchor.appendChild( imagePop );

        function closeTemplatePop() {
            templatePop.hidden = true;
            templateBtn.setAttribute( 'aria-pressed', 'false' );
        }
        function closeImagePop() {
            imagePop.hidden = true;
            imageBtn.setAttribute( 'aria-pressed', 'false' );
        }
        function closeCharsPop() {
            charPanel.hidden = true;
            charsBtn.setAttribute( 'aria-pressed', 'false' );
            storageSet( LS.chars, '0' );
        }
        function closeAllPops( except ) {
            if ( except !== 'template' ) closeTemplatePop();
            if ( except !== 'image' ) closeImagePop();
            if ( except !== 'chars' ) closeCharsPop();
        }

        /* 面板靠近屏幕右侧时向左收，避免溢出 */
        function placePopover( pop ) {
            pop.style.left = '0px';

            var rect = pop.getBoundingClientRect();
            var shift = Math.min( 0, window.innerWidth - 12 - rect.right );
            var minShift = 12 - rect.left;
            if ( shift < minShift ) shift = minShift;

            pop.style.left = shift + 'px';
        }

        var toolbar = document.createElement( 'div' );
        toolbar.className = 'nv-toolbar';
        toolbar.appendChild( formatButtons.bold );
        toolbar.appendChild( formatButtons.italic );
        toolbar.appendChild( formatButtons.underline );
        toolbar.appendChild( formatButtons.strike );

        var sep1 = document.createElement( 'span' );
        sep1.className = 'nv-sep';
        toolbar.appendChild( sep1 );
        toolbar.appendChild( formatButtons.center );

        var sep2 = document.createElement( 'span' );
        sep2.className = 'nv-sep';
        toolbar.appendChild( sep2 );
        headingGroup.forEach( function ( btn ) { toolbar.appendChild( btn ); } );

        var sepEmbed = document.createElement( 'span' );
        sepEmbed.className = 'nv-sep';
        toolbar.appendChild( sepEmbed );
        toolbar.appendChild( templateAnchor );
        toolbar.appendChild( imageAnchor );

        var sep3 = document.createElement( 'span' );
        sep3.className = 'nv-sep';
        toolbar.appendChild( sep3 );
        toolbar.appendChild( ruleBtn );
        toolbar.appendChild( clearBtn );
        toolbar.appendChild( structureBtn );

        var spacer = document.createElement( 'span' );
        spacer.className = 'nv-spacer';
        toolbar.appendChild( spacer );
        toolbar.appendChild( charsAnchor );

        try {
            if ( storageGet( LS.chars ) === '1' ) {
                charPanel.hidden = false;
                charsBtn.setAttribute( 'aria-pressed', 'true' );
            }
        } catch ( e ) {}

        try {
            setStructure( storageGet( LS.structure ) === '1' );
        } catch ( e ) {}

        /* ---------- 顶栏 ---------- */
        var topbar = null;
        var saveBtn = null;
        var summaryInput = null;

        if ( opts.app ) {
            topbar = document.createElement( 'div' );
            topbar.className = 'nv-topbar';

            var back = document.createElement( 'a' );
            back.className = 'nv-back';
            back.href = opts.cancelHref || '#';
            back.innerHTML = svg( 'back' ) +
                '<span class="nv-back-text">返回</span>';

            var brand = document.createElement( 'span' );
            brand.className = 'nv-brand';
            brand.textContent = '小说写作';

            topbar.appendChild( back );
            topbar.appendChild( brand );

            if ( opts.docTitle ) {
                var docTitle = document.createElement( 'span' );
                docTitle.className = 'nv-doc-title';
                docTitle.textContent = opts.docTitle;
                docTitle.title = opts.docTitle;
                topbar.appendChild( docTitle );
            }

            var topRight = document.createElement( 'div' );
            topRight.className = 'nv-topbar-right';

            saveStateEl = document.createElement( 'span' );
            saveStateEl.className = 'nv-save-state';
            saveStateEl.textContent = '已保存';

            summaryInput = document.createElement( 'input' );
            summaryInput.type = 'text';
            summaryInput.className = 'nv-summary';
            summaryInput.placeholder = '编辑摘要（可选）';
            summaryInput.setAttribute( 'aria-label', '编辑摘要' );

            saveBtn = document.createElement( 'button' );
            saveBtn.type = 'button';
            saveBtn.className = 'nv-save-btn';
            saveBtn.textContent = '保存';
            saveBtn.addEventListener( 'click', function ( e ) {
                e.preventDefault();
                if ( opts.onSave ) opts.onSave();
            } );

            topRight.appendChild( saveStateEl );
            topRight.appendChild( summaryInput );
            topRight.appendChild( saveBtn );
            topbar.appendChild( topRight );
        }

        /* ---------- 底部状态栏 ---------- */
        var statusbar = document.createElement( 'div' );
        statusbar.className = 'nv-statusbar';

        var statusGroup = document.createElement( 'span' );
        statusGroup.className = 'nv-status-group';
        statusGroup.innerHTML =
            '<span class="nv-status-item">字数 <b>0</b></span>' +
            '<span class="nv-status-item">段落 <b>0</b></span>';

        var modeBadge = document.createElement( 'span' );
        modeBadge.className = 'nv-mode-badge';
        modeBadge.textContent = '正文模式';
        modeBadge.title = '代码、脚本、表格不会进入正文；模板与图片以可视化控件插入';

        statusGroup.appendChild( modeBadge );

        var statusRight = document.createElement( 'span' );
        statusRight.className = 'nv-status-right';

        var hint = document.createElement( 'span' );
        hint.className = 'nv-status-hint';
        hint.textContent = opts.onSave
            ? 'Ctrl+B 粗体 · Ctrl+I 斜体 · Ctrl+S 保存'
            : 'Ctrl+B 粗体 · Ctrl+I 斜体';

        statusRight.appendChild( hint );

        if ( opts.switchHref ) {
            var switchLink = document.createElement( 'a' );
            switchLink.className = 'nv-status-link';
            switchLink.href = opts.switchHref;
            switchLink.textContent = '标准编辑器';
            statusRight.appendChild( switchLink );
        }

        statusbar.appendChild( statusGroup );
        statusbar.appendChild( statusRight );

        statsRefs = statusGroup.querySelectorAll( 'b' );

        /* ---------- 组装 ---------- */
        var topchrome = document.createElement( 'div' );
        topchrome.className = 'nv-topchrome';
        if ( topbar ) topchrome.appendChild( topbar );
        topchrome.appendChild( toolbar );

        root.appendChild( topchrome );
        root.appendChild( main );
        root.appendChild( statusbar );

        /* ---------- 事件 ---------- */
        on( editor, 'input', afterEdit );

        /* 结构代码删除保护：退格、剪切、整段删除、拖放都不能带走代码 */
        function rangeTouchesCode( range ) {
            if ( !range ) return false;

            /* 真正的代码叶子：只要被选区碰到就不允许删 */
            var leaves = editor.querySelectorAll(
                '.nv-code-inline, .nv-code-block'
            );
            for ( var i = 0; i < leaves.length; i++ ) {
                try {
                    if ( range.intersectsNode( leaves[ i ] ) ) return true;
                } catch ( e ) {}
            }

            /*
             * 结构容器：只有整个容器都被选区包住时才算删代码。
             * 选区在容器内部、或只跨过某一侧边界，都只删正文，容器标签保留。
             */
            var containers = editor.querySelectorAll(
                '.nv-code-container, .nv-code-container-inline'
            );
            for ( var j = 0; j < containers.length; j++ ) {
                var c = containers[ j ];
                var nr = document.createRange();
                nr.selectNode( c );

                var covers = false;
                try {
                    covers =
                        range.compareBoundaryPoints( Range.START_TO_START, nr ) <= 0 &&
                        range.compareBoundaryPoints( Range.END_TO_END, nr ) >= 0;
                } catch ( e ) {
                    covers = false;
                }

                if ( covers ) return true;
            }

            return false;
        }

        function caretAdjacentCode( range, type ) {
            if ( !range || !range.collapsed ) return false;

            /* 退格只管光标前方，Delete 只管光标后方，避免误拦纯文字删除 */
            var backward = !/forward/i.test( type );
            var forward = !/backward/i.test( type );

            function isCode( n ) {
                return n && n.nodeType === 1 &&
                    ( hasClass( n, 'nv-code-inline' ) ||
                      hasClass( n, 'nv-code-block' ) ||
                      hasClass( n, 'nv-code-container' ) ||
                      hasClass( n, 'nv-code-container-inline' ) );
            }

            var node = range.startContainer;
            var offset = range.startOffset;

            if ( node.nodeType === 1 ) {
                if ( backward && isCode( node.childNodes[ offset - 1 ] ) ) {
                    return true;
                }
                if ( forward && isCode( node.childNodes[ offset ] ) ) {
                    return true;
                }

                /* 光标停在块的首/尾时，退格/Delete 会碰到相邻的代码块 */
                if ( backward && offset === 0 &&
                     isCode( node.previousSibling ) ) {
                    return true;
                }
                if ( forward && offset === node.childNodes.length &&
                     isCode( node.nextSibling ) ) {
                    return true;
                }

                return false;
            }

            if ( node.nodeType === 3 ) {
                var parent = node.parentNode;

                if ( backward && offset === 0 ) {
                    var prev = node.previousSibling;
                    while ( prev && prev.nodeType === 3 && !prev.nodeValue ) {
                        prev = prev.previousSibling;
                    }
                    if ( isCode( prev ) ) return true;

                    if ( parent && parent !== editor &&
                         isCode( parent.previousSibling ) ) {
                        return true;
                    }
                }

                if ( forward && offset === node.nodeValue.length ) {
                    var next = node.nextSibling;
                    while ( next && next.nodeType === 3 && !next.nodeValue ) {
                        next = next.nextSibling;
                    }
                    if ( isCode( next ) ) return true;

                    if ( parent && parent !== editor &&
                         isCode( parent.nextSibling ) ) {
                        return true;
                    }
                }
            }

            return false;
        }

        editor.addEventListener( 'beforeinput', function ( e ) {
            var type = e.inputType || '';
            if ( type.indexOf( 'delete' ) !== 0 && type !== 'insertFromDrop' ) {
                return;
            }

            var sel = window.getSelection();
            if ( !sel || !sel.rangeCount ) return;
            var range = sel.getRangeAt( 0 );

            if ( !range.collapsed ) {
                if ( rangeTouchesCode( range ) ) {
                    e.preventDefault();
                    showToast( '结构代码已锁定，不能删除' );
                }
                return;
            }

            if ( caretAdjacentCode( range, type ) ) {
                e.preventDefault();
                showToast( '结构代码已锁定，不能删除' );
            }
        } );

        editor.addEventListener( 'keydown', function ( e ) {
            if ( e.isComposing || e.keyCode === 229 ) return;

            var mod = e.ctrlKey || e.metaKey;
            var key = ( e.key || '' ).toLowerCase();

            if ( mod && !e.altKey ) {
                if ( key === 'b' ) {
                    e.preventDefault();
                    execFormat( 'bold' );
                    return;
                }
                if ( key === 'i' ) {
                    e.preventDefault();
                    execFormat( 'italic' );
                    return;
                }
                if ( key === 'u' ) {
                    e.preventDefault();
                    execFormat( 'underline' );
                    return;
                }
            }

            if ( e.key === 'Enter' ) {
                if ( e.shiftKey ) {
                    e.preventDefault();
                    insertLineBreak();
                } else {
                    e.preventDefault();
                    insertParagraph();
                }
            }
        } );

        /* 粘贴：只接收纯文字，并且先清掉标记 */
        editor.addEventListener( 'paste', function ( e ) {
            var cd = e.clipboardData || window.clipboardData;
            var text = cd ? cd.getData( 'text/plain' ) : '';

            e.preventDefault();

            if ( !text ) {
                showToast( '小说模式只接受纯文字' );
                return;
            }

            if ( looksLikeMarkup( text ) ) {
                showToast( '已忽略粘贴内容中的代码与标记' );
            }

            insertProse( text );
        } );

        editor.addEventListener( 'dragover', function ( e ) {
            if ( e.dataTransfer ) e.preventDefault();
        } );

        editor.addEventListener( 'drop', function ( e ) {
            e.preventDefault();

            var dt = e.dataTransfer;
            var text = dt ? dt.getData( 'text/plain' ) : '';

            if ( !text ) {
                showToast( '小说模式只接受纯文字' );
                return;
            }

            placeCaretAtPoint( e.clientX, e.clientY );

            if ( looksLikeMarkup( text ) ) {
                showToast( '已忽略拖入内容中的代码与标记' );
            }

            insertProse( text );
        } );

        function insertProse( text ) {
            var cleaned = plainProse( text );
            if ( !cleaned ) return;

            var lines = cleaned.split( '\n' );
            var first = true;

            for ( var i = 0; i < lines.length; i++ ) {
                var line = lines[ i ];
                if ( !line.trim() ) continue;
                if ( !first ) insertParagraph();
                insertTextAtCaret( line );
                first = false;
            }

            afterEdit();
        }

        editor.addEventListener( 'contextmenu', function ( e ) {
            if ( e.shiftKey ) return;

            var widget = e.target.closest && e.target.closest( '.nv-widget' );
            if ( widget && editor.contains( widget ) ) {
                e.preventDefault();
                hideMenu();
                showWidgetMenu( widget, e.clientX, e.clientY );
                return;
            }

            e.preventDefault();
            hideWidgetMenu();

            var sel = window.getSelection();
            if ( !sel || !sel.rangeCount || sel.isCollapsed ) {
                placeCaretAtPoint( e.clientX, e.clientY );
            }
            showMenu( e.clientX, e.clientY );
        } );

        editor.addEventListener( 'keyup', scheduleStateSync );
        editor.addEventListener( 'mouseup', scheduleStateSync );
        editor.addEventListener( 'focus', function () {
            scheduleStateSync();
            updatePlaceholder();
        } );

        listen( document, 'selectionchange', function () {
            if ( selectionInside() ) scheduleStateSync();
        } );

        listen( document, 'mousedown', function ( e ) {
            if ( !menu.hidden && !menu.contains( e.target ) ) hideMenu();
            if ( !widgetMenu.hidden && !widgetMenu.contains( e.target ) ) hideWidgetMenu();
            if ( !charPanel.hidden && !charsAnchor.contains( e.target ) ) closeCharsPop();
            if ( !templatePop.hidden && !templateAnchor.contains( e.target ) ) closeTemplatePop();
            if ( !imagePop.hidden && !imageAnchor.contains( e.target ) ) closeImagePop();
        } );

        listen( document, 'keydown', function ( e ) {
            if ( e.key !== 'Escape' ) return;

            if ( !paramModal.hidden ) {
                closeParamEditor();
                return;
            }

            hideMenu();
            hideWidgetMenu();
            closeAllPops();
        } );

        listen( window, 'scroll', function () {
            hideMenu();
            hideWidgetMenu();
        }, true );

        listen( window, 'resize', function () {
            hideMenu();
            hideWidgetMenu();
        } );

        /* Ctrl+S 无论在摘要框还是正文里都保存 */
        root.addEventListener( 'keydown', function ( e ) {
            var mod = e.ctrlKey || e.metaKey;
            if ( mod && !e.altKey && ( e.key || '' ).toLowerCase() === 's' ) {
                if ( !opts.onSave ) return;
                e.preventDefault();
                opts.onSave();
            }
        } );

        /* ---------- 初始内容 ---------- */
        setHtml( opts.initialHtml || '' );
        updateStats();

        function destroy() {
            for ( var i = 0; i < docListeners.length; i++ ) {
                var l = docListeners[ i ];
                try {
                    l[ 0 ].removeEventListener( l[ 1 ], l[ 2 ], l[ 3 ] );
                } catch ( e ) {}
            }
            docListeners = [];

            if ( statsTimer ) {
                clearTimeout( statsTimer );
                statsTimer = null;
            }
            if ( toastTimer ) clearTimeout( toastTimer );
            if ( toastHideTimer ) clearTimeout( toastHideTimer );

            if ( placing ) cancelPlacement();

            if ( root.parentNode ) root.parentNode.removeChild( root );
        }

        return {
            root: root,
            editor: editor,
            paper: paper,
            toolbar: toolbar,
            charPanel: charPanel,
            statusbar: statusbar,
            saveBtn: saveBtn,
            summaryInput: summaryInput,
            getValue: getWikitext,
            getWikitext: getWikitext,
            setValue: function ( wikitext ) {
                setHtml( wikitextToEditorHtml( wikitext ) );
            },
            setHtml: setHtml,
            setSaveState: setSaveState,
            showToast: showToast,
            updateStats: updateStats,
            destroy: destroy
        };
    }

    /* ==========================================================
     * 入口
     * ========================================================== */
    function initNovelEditor() {
        if ( ACTION !== 'edit' ) return;

        var params = new URLSearchParams( location.search );
        if ( params.get( 'editor' ) !== 'novel' ) return;

        var sectionEdit = !!params.get( 'section' );
        var retries = 0;
        var fetchingInitial = false;

        function trySetup() {
            var form = document.getElementById( 'editform' );
            var textarea = document.getElementById( 'wpTextbox1' );

            if ( !form || !textarea ) {
                if ( retries++ < 50 ) setTimeout( trySetup, 100 );
                return;
            }
            if ( document.getElementById( 'novel-editor-container' ) ) return;
            if ( fetchingInitial ) return;

            var nativeText = readNativeEditorContent( textarea );

            /*
             * 整页编辑且 textarea 有值：直接用。
             * 分节编辑（?section=…）或 textarea 为空：优先拉整页源码，
             * 否则 CodeMirror 只给可见行，或者会把整页误当成某一节。
             */
            if ( textarea.value.trim() && !sectionEdit ) {
                buildEditor( form, textarea, textarea.value, false );
                return;
            }

            fetchingInitial = true;

            var settled = false;
            var timer = setTimeout( function () {
                if ( settled ) return;
                settled = true;
                fetchingInitial = false;
                if ( !document.getElementById( 'novel-editor-container' ) ) {
                    buildEditor( form, textarea, nativeText, sectionEdit );
                }
            }, 4000 );

            fetchPageSource().then( function ( source ) {
                if ( settled ) return;
                settled = true;
                clearTimeout( timer );
                fetchingInitial = false;

                if ( document.getElementById( 'novel-editor-container' ) ) return;
                buildEditor(
                    form,
                    textarea,
                    source && source.trim() ? source : nativeText,
                    false
                );
            }, function () {
                if ( settled ) return;
                settled = true;
                clearTimeout( timer );
                fetchingInitial = false;

                if ( document.getElementById( 'novel-editor-container' ) ) return;
                buildEditor( form, textarea, nativeText, sectionEdit );
            } );
        }

        if ( document.readyState === 'loading' ) {
            document.addEventListener( 'DOMContentLoaded', trySetup );
        } else {
            trySetup();
        }
    }

    /* ==========================================================
     * 页面编辑模式
     * ========================================================== */
    function buildEditor( form, textarea, prefetchedSource, preserveSection ) {

        var nativeSource = typeof prefetchedSource === 'string'
            ? prefetchedSource
            : readNativeEditorContent( textarea );
        var stored = nvFromStorage( nativeSource );
        var initialSource = stored.source;
        var pageMeta = stored.meta || [];

        /* 页面里的 {{CSS|...}} / <templatestyles> 先注入；
           同时在渲染模板时把这些 meta 一起送进 parse。 */
        activePageMeta = pageMeta.slice();
        applyPageCss( stored.css );

        /* 隐藏 MediaWiki 原生编辑界面 */
        Array.prototype.forEach.call( form.children, function ( child ) {
            if ( child.tagName === 'INPUT' && child.type === 'hidden' ) return;
            child.style.display = 'none';
        } );
        [ 'toolbar', 'editpage-toolbar', 'wikiPreview',
          'editpage-copywarn', 'editpage-editarea' ].forEach( function ( id ) {
            var el = document.getElementById( id );
            if ( el ) el.style.display = 'none';
        } );

        var ws;

        function save() {
            /* 结构代码必须原样保留；如果被误删就阻止保存，避免把页面写坏 */
            var missing = missingCodeIds( ws.editor );
            if ( missing.length ) {
                ws.showToast(
                    '检测到结构代码被删除，已阻止保存。请撤销后重试。',
                    5200
                );
                return;
            }

            var raw = ws.getWikitext();
            var wikitext = nvToStorage( raw );
            var summaryField = document.getElementById( 'wpSummary' );
            var summaryValue = ws.summaryInput ? ws.summaryInput.value : '';

            /* 先写一遍，万一下面的 submit 事件触发了原生编辑器的自动提交 */
            textarea.value = wikitext;
            if ( summaryField && summaryValue ) {
                summaryField.value = summaryValue;
            }

            /*
             * form.submit() 不会带上提交按钮的 name/value。
             * MediaWiki 靠 wpSave 判断是“保存”而不是再次显示编辑表单，
             * 所以必须补一个隐藏字段，否则看起来就是没保存。
             */
            var saveFlag = form.querySelector(
                'input[type="hidden"][name="wpSave"]'
            );
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

            saving = true;
            ws.setSaveState( 'saving' );

            /*
             * 解除编辑提醒。这个 submit 事件会让 CodeMirror / WikiEditor
             * 等原生编辑器把它们内部的旧内容同步回 textarea，
             * 所以最终正文必须在它之后再写一次，确保新内容不被覆盖。
             */
            releaseEditWarning();

            textarea.value = wikitext;
            if ( summaryField && summaryValue ) {
                summaryField.value = summaryValue;
            }

            HTMLFormElement.prototype.submit.call( form );

            setTimeout( function () {
                saving = false;
                ws.setSaveState( 'dirty' );
            }, 1500 );
        }

        ws = createWorkspace( {
            app: true,
            initialHtml: wikitextToEditorHtml( initialSource ),
            placeholder: '在这里开始写你的故事……',
            docTitle: PAGE,
            cancelHref: mw.util.getUrl( PAGE ),
            switchHref: mw.util.getUrl( PAGE, { action: 'edit' } ),
            onSave: save
        } );

        var container = ws.root;
        container.id = 'novel-editor-container';

        /* 嵌回原编辑表单的位置，保持页面普通排版，不做全屏接管 */
        form.parentNode.insertBefore( container, form );

        if ( stored.codeHidden ) {
            setTimeout( function () {
                ws.showToast( '已隐藏页面中的代码结构（保存时原样保留）' );
            }, 350 );
        }

        var sectionField = form.querySelector( 'input[name="wpSection"]' );
        if ( sectionField && !preserveSection ) sectionField.value = '';

        /* ---------- 离开提醒 ---------- */
        var initialSourceSnapshot = ws.getWikitext();
        var initialSummary = ws.summaryInput ? ws.summaryInput.value : '';
        var saving = false;
        var editWarningEnabled = true;

        try {
            editWarningEnabled = !!mw.user.options.get( 'useeditwarning' );
        } catch ( e ) {}

        function editorHasChanges() {
            var summary = ws.summaryInput ? ws.summaryInput.value : '';
            return ws.getWikitext() !== initialSourceSnapshot ||
                summary !== initialSummary;
        }

        window.addEventListener( 'beforeunload', function ( e ) {
            if ( !editWarningEnabled || saving || !editorHasChanges() ) return;

            var message = '未保存的更改将会丢失。';
            e.preventDefault();
            e.returnValue = message;
            return message;
        } );

        window.addEventListener( 'pageshow', function () {
            saving = false;
        } );

        function releaseEditWarning() {
            var ev;
            try {
                ev = new Event( 'submit', {
                    bubbles: true,
                    cancelable: true
                } );
            } catch ( e ) {
                ev = document.createEvent( 'Event' );
                ev.initEvent( 'submit', true, true );
            }

            try {
                form.dispatchEvent( ev );
            } catch ( e ) {}
        }
    }

    /* ==========================================================
     * 可嵌入实例
     * ========================================================== */

    /**
     * 在任意容器里创建一个独立的小说写作区。
     *
     * 与 buildEditor() 的区别：
     *   - 不依赖 #editform / #wpTextbox1
     *   - 不隐藏原生编辑表单
     *   - 不绑定原生 form.submit 保存
     *   - 返回实例，供外部脚本通过统一接口读写
     *
     * getValue / setValue / toStorage / fromStorage
     * 全部使用 Wikitext，语义与 mw.wikidotEditor 保持同构。
     */
    function mountNovelEditor( container, initialSource ) {
        var host = typeof container === 'string'
            ? document.querySelector( container )
            : container;

        if ( !host ) {
            throw new Error( 'novelEditor.mount: 容器不存在' );
        }


        var parsed = nvFromStorage( initialSource || '' );
        var mountMeta = parsed.meta || [];

        activePageMeta = mountMeta.slice();
        applyPageCss( parsed.css );

        var ws = createWorkspace( {
            app: false,
            initialHtml: wikitextToEditorHtml( parsed.source ),
            placeholder: '开始写你的故事……'
        } );

        host.appendChild( ws.root );

        if ( parsed.codeHidden ) {
            setTimeout( function () {
                ws.showToast( '已隐藏内容中的代码结构（保存时原样保留）' );
            }, 350 );
        }

        return {
            element: ws.root,
            editor: ws.editor,

            /* 与 mw.wikidotEditor.mount() 的字段名保持一致；
               读写内容请使用 getValue / setValue。 */
            textarea: ws.editor,

            getValue: function () {
                return ws.getWikitext();
            },

            setValue: function ( value ) {
                ws.setValue( value == null ? '' : String( value ) );
                fireInput( ws.editor );
            },

            onChange: function ( cb ) {
                var handler = function () {
                    cb( ws.getWikitext() );
                };
                ws.editor.addEventListener( 'nv-change', handler );
                return function () {
                    ws.editor.removeEventListener( 'nv-change', handler );
                };
            },

            destroy: ws.destroy,

            /* 存储协议：与页面编辑模式的保存格式完全一致 */
            toStorage: function ( source ) {
                return nvToStorage( source );
            },

            fromStorage: nvFromStorage
        };
    }

    /* ==========================================================
     * 对外导出：与 mw.wikidotEditor 同构
     * ========================================================== */
    mw.novelEditor = {
        mount: mountNovelEditor,
        toStorage: nvToStorage,
        fromStorage: nvFromStorage,

        /* 方便调试或其他脚本复用 */
        convertWikitextToHtml: wikitextToEditorHtml,
        convertHtmlToWikitext: htmlToWikitext,
        snapshotCodeIds: snapshotCodeIds,
        missingCodeIds: missingCodeIds
    };

    initNovelEditor();
}() );

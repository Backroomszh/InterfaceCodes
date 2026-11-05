/* ============================================================
 * Wikidot 语法编辑器 for MediaWiki
 * 小工具：wikidotEditor
 * 用法：在参数设置中启用后，访问 ?action=edit&editor=wd
 * 样式：随小工具加载 Gadget-wikidotEditor.css
 * 保存时：Wikidot -> Wikitext + <!--WIKIDOT ... WIKIDOT--> 注释
 * 纯 MediaWiki 页面会自动反向生成 Wikidot 源码；
 * 注释过期时也会根据当前 Wikitext 重新反向生成。
 *
 * 界面：
 *   - 选项卡式工具栏：格式 / 段落 / 插入 / 特殊字符 / 帮助
 *   - 预览与语法高亮开关位于工具栏右侧
 *   - 右侧分栏实时预览，分隔条可拖动，双击恢复均分
 *   - 内置大型特殊字符库，按语系分类，自动记录最近使用
 *   - 语法高亮可随时开关，输入法组合期间自动让位
 *
 * 性能：
 *   - 预览仅在有修改时请求，连续输入只保留最后一次
 *   - 新请求会中止旧请求，避免过期结果覆盖
 *   - 模板模块与 headhtml 去重缓存
 *   - 状态栏、高亮、预览分别节流，互不阻塞输入
 *   - 高亮在浏览器空闲帧内重绘，超长文档自动暂停
 * ============================================================ */
( function () {
    'use strict';

    var ACTION = mw.config.get( 'wgAction' );
    var PAGE   = mw.config.get( 'wgPageName' );
    var COMMENT_RE = /<!--WIKIDOT\n([\s\S]*?)\nWIKIDOT-->/;

    /* ==========================================================
     * 配置
     * ========================================================== */
    var NOSIDEBAR_TEMPLATE = 'NOSIDEBAR';
    var TOC_MAGIC = '__TOC__';
    var WD_CSS_TEMPLATE = '{{CSS|User:QiuxiMeow/代码/wd适配.css}}';

    var LS = {
        highlight: 'wd-editor:highlight',
        split:     'wd-editor:split',
        recent:    'wd-editor:recent-chars',
        tab:       'wd-editor:tab'
    };

    var HL_LIMIT = 200000;
    var PREVIEW_DELAY = 1100;
    var SPLIT_WIDTH = 9;

    var INCLUDE_MAP = {
        'preview':         'Preview',
        'translations':    'Translations',
        'open':            'License Open',
        'close':           'License Close',
        'level-class':     'Level Class',
        'image-block':     'Image Block',
        'license-box':     'License Box',
        'license-box-end': 'License Box End',
        'cecs':            'CECS'
    };

    var REVERSE_INCLUDE_MAP = ( function () {
        var map = {};
        for ( var key in INCLUDE_MAP ) {
            if ( Object.prototype.hasOwnProperty.call( INCLUDE_MAP, key ) ) {
                map[ INCLUDE_MAP[ key ].toLowerCase() ] = key;
            }
        }
        return map;
    }() );

    /* ==========================================================
     * 图标（全部为内联线条图，不使用 emoji）
     * ========================================================== */
    var ICONS = {
        preview: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
        highlight: '<path d="M4 20l4.2-1 9.3-9.3-3.2-3.2L5 15.8 4 20Z"/><path d="M13.5 7.5l3 3"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.4 1.4"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.4-1.4"/>',
        external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
        user: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6"/>',
        image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.2" cy="10" r="1.4"/><path d="M21 15.5l-4.6-4.6L8 19"/>',
        attach: '<path d="M20 11.5l-8.4 8.4a4.8 4.8 0 0 1-6.8-6.8L13 5a3.2 3.2 0 0 1 4.5 4.5l-8.2 8.2a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6"/>',
        table: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 9.5v10M15 9.5v10"/>',
        quote: '<path d="M6.5 7.5h4v4.5c0 2.6-1.5 4.2-4 4.8"/><path d="M13.5 7.5h4v4.5c0 2.6-1.5 4.2-4 4.8"/>',
        rule: '<path d="M4 12h16"/><path d="M4 6.5h7M4 17.5h7"/>',
        lineBreak: '<path d="M4 7h16"/><path d="M12 7v9"/><path d="M9 13l3 3 3-3"/>',
        center: '<path d="M4 6.5h16M7 11h10M5 15.5h14M8.5 20h7"/>',
        collapse: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17"/><path d="M9 13l3 3 3-3"/>',
        div: '<path d="M8 4.5H5.5a1 1 0 0 0-1 1V8M16 4.5h2.5a1 1 0 0 1 1 1V8M8 19.5H5.5a1 1 0 0 1-1-1V16M16 19.5h2.5a1 1 0 0 0 1-1V16"/>',
        tabs: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M8 6V3.5M16 6V3.5"/>',
        footnote: '<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5"/><path d="M9 13h6M9 16.5h4"/>',
        toc: '<path d="M4 6h16M4 11h12M4 16h16M4 21h10"/>',
        code: '<path d="M9 7.5L4.5 12 9 16.5"/><path d="M15 7.5l4.5 4.5-4.5 4.5"/>',
        codeBlock: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9 9.5L6 12l3 2.5"/><path d="M15 9.5l3 2.5-3 2.5"/>',
        math: '<path d="M5 19.5L11 4.5l6 15"/><path d="M7.3 14h7.4"/>',
        comment: '<path d="M4 5.5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
        color: '<path d="M12 4a8 8 0 1 0 0 16c1.5 0 2-1 1.5-2s0-2 1.5-2H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9Z"/><circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none"/>',
        size: '<path d="M4 18V6M4 6h7M4 12h5"/><path d="M14 18V9M14 9h6M14 13.5h5"/>'
    };

    /* ==========================================================
     * 特殊字符库
     * ========================================================== */
    var CHAR_CATEGORIES = [
        { id: 'recent', name: '最近使用', chars: [] },
        { id: 'punct', name: '标点符号', chars: [
            '，', '。', '、', '；', '：', '？', '！', '“', '”', '‘', '’',
            '「', '」', '『', '』', '（', '）', '《', '》', '〈', '〉',
            '【', '】', '〔', '〕', '［', '］', '…', '—', '–', '·',
            '•', '‥', '～', '＿', '＼',
            ',', '.', ';', ':', '?', '!', '"', "'", '(', ')', '[', ']',
            '{', '}', '<', '>', '/', '|', '@', '#', '$', '%', '^', '&',
            '*', '-', '+', '=', '_', '~', '`', '\\'
        ] },
        { id: 'math', name: '数学符号', chars: [
            '±', '×', '÷', '=', '≠', '≈', '≉', '≡', '≢', '≤', '≥',
            '≪', '≫', '∞', '√', '∛', '∜', '∑', '∏', '∫', '∬', '∭',
            '∮', '∂', '∇', '∝', '∥', '∦', '⊥', '∠', '∡', '°', '′',
            '″', '‰', '‱', '∴', '∵', '∈', '∉', '∋', '⊂', '⊃', '⊆',
            '⊇', '⊄', '⊅', '∪', '∩', '∅', '∀', '∃', '∄', '¬', '∧',
            '∨', '⊕', '⊖', '⊗', '⊘', '⊙', '⊚', '⊛', '≅', '≌', '≜',
            '≐', '⌈', '⌉', '⌊', '⌋', '⟨', '⟩'
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
            'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω',
            'ς', 'ϑ', 'ϕ', 'ϖ'
        ] },
        { id: 'greekext', name: '希腊字母扩展', chars: [
            'ἀ', 'ἁ', 'ἂ', 'ἃ', 'ἄ', 'ἅ', 'ἆ', 'ἇ', 'ἐ', 'ἑ', 'ἒ',
            'ἓ', 'ἔ', 'ἕ', 'ἠ', 'ἡ', 'ἢ', 'ἣ', 'ἤ', 'ἥ', 'ἦ', 'ἧ',
            'ἰ', 'ἱ', 'ἲ', 'ἳ', 'ἴ', 'ἵ', 'ἶ', 'ἷ', 'ὀ', 'ὁ', 'ὂ',
            'ὃ', 'ὄ', 'ὅ', 'ὐ', 'ὑ', 'ὒ', 'ὓ', 'ὔ', 'ὕ', 'ὖ', 'ὗ',
            'ὠ', 'ὡ', 'ὢ', 'ὣ', 'ὤ', 'ὥ', 'ὦ', 'ὧ', 'Ὠ', 'Ὡ', 'Ὢ',
            'Ὣ', 'Ὤ', 'Ὥ', 'Ὦ', 'Ὧ', 'ὰ', 'ά', 'ὲ', 'έ', 'ὴ', 'ή',
            'ὶ', 'ί', 'ὸ', 'ό', 'ὺ', 'ύ', 'ὼ', 'ώ'
        ] },
        { id: 'latin', name: '拉丁扩展', chars: [
            'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë',
            'Ì', 'Í', 'Î', 'Ï', 'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø',
            'Ù', 'Ú', 'Û', 'Ü', 'Ý', 'Þ', 'ß', 'à', 'á', 'â', 'ã', 'ä',
            'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï', 'ð',
            'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ù', 'ú', 'û', 'ü', 'ý',
            'þ', 'ÿ', 'Ā', 'ā', 'Ă', 'ă', 'Ą', 'ą', 'Ć', 'ć', 'Č', 'č',
            'Ď', 'ď', 'Ē', 'ē', 'Ė', 'ė', 'Ę', 'ę', 'Ğ', 'ğ', 'Ī', 'ī',
            'İ', 'ı', 'Ł', 'ł', 'Ń', 'ń', 'Ň', 'ň', 'Ō', 'ō', 'Ő', 'ő',
            'Œ', 'œ', 'Ŕ', 'ŕ', 'Ř', 'ř', 'Ś', 'ś', 'Š', 'š', 'Ū', 'ū',
            'Ů', 'ů', 'Ű', 'ű', 'Ź', 'ź', 'Ż', 'ż', 'Ž', 'ž'
        ] },
        { id: 'ipa', name: '国际音标', chars: [
            'ɑ', 'ɐ', 'ɒ', 'æ', 'ɓ', 'ʙ', 'β', 'ɔ', 'ɕ', 'ç', 'ð',
            'ɗ', 'ɖ', 'ə', 'ɘ', 'ɚ', 'ɛ', 'ɜ', 'ɞ', 'ɟ', 'ɡ', 'ɠ',
            'ɢ', 'ɣ', 'ɤ', 'ɥ', 'ɦ', 'ɧ', 'ɪ', 'ʝ', 'ɨ', 'ʄ', 'ʉ',
            'ɯ', 'ɰ', 'ŋ', 'ɲ', 'ɳ', 'ɴ', 'ø', 'ɵ', 'ɸ', 'θ', 'œ',
            'ɶ', 'ʘ', 'ɹ', 'ɺ', 'ɻ', 'ɽ', 'ɾ', 'ʀ', 'ʁ', 'ʂ', 'ʃ',
            'ʈ', 'ʧ', 'ʊ', 'ʋ', 'ⱱ', 'ʌ', 'ʍ', 'χ', 'ʎ', 'ʏ', 'ʐ',
            'ʑ', 'ʒ', 'ʔ', 'ʕ', 'ʡ', 'ʢ', 'ʜ', 'ˈ', 'ˌ', 'ː', 'ˑ',
            'ˀ', 'ˁ', 'ʰ', 'ʲ', 'ʷ', 'ˠ', 'ˤ'
        ] },
        { id: 'cyrillic', name: '西里尔字母', chars: [
            'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й', 'К',
            'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц',
            'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я',
            'а', 'б', 'в', 'г', 'д', 'е', 'ё', 'ж', 'з', 'и', 'й', 'к',
            'л', 'м', 'н', 'о', 'п', 'р', 'с', 'т', 'у', 'ф', 'х', 'ц',
            'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я',
            'І', 'і', 'Ї', 'ї', 'Є', 'є', 'Ґ', 'ґ'
        ] },
        { id: 'hebrew', name: '希伯来字母', chars: [
            'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'ך',
            'ל', 'מ', 'ם', 'נ', 'ן', 'ס', 'ע', 'פ', 'ף', 'צ', 'ץ', 'ק',
            'ר', 'ש', 'ת', 'ְ', 'ֱ', 'ֲ', 'ֳ', 'ִ', 'ֵ', 'ֶ', 'ַ',
            'ָ', 'ֹ', 'ֻ', 'ּ', 'ׁ', 'ׂ'
        ] },
        { id: 'arabic', name: '阿拉伯字母', chars: [
            'ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س',
            'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م',
            'ن', 'ه', 'و', 'ي', 'ة', 'ى', 'ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ',
            'ً', 'ٌ', 'ٍ', 'َ', 'ُ', 'ِ', 'ّ', 'ْ'
        ] },
        { id: 'arabicext', name: '阿拉伯字母扩展', chars: [
            'ٱ', 'ٲ', 'ٳ', 'ٴ', 'ٵ', 'ٶ', 'ٷ', 'ٸ', 'ٹ', 'ٺ', 'ٻ',
            'ټ', 'ٽ', 'پ', 'ٿ', 'ڀ', 'ځ', 'ڂ', 'ڃ', 'ڄ', 'څ', 'چ',
            'ڇ', 'ڈ', 'ډ', 'ڊ', 'ڋ', 'ڌ', 'ڍ', 'ڎ', 'ڏ', 'ڐ', 'ڑ',
            'ڒ', 'ړ', 'ڔ', 'ڕ', 'ږ', 'ڗ', 'ژ', 'ڙ', 'ښ', 'ڛ', 'ڜ',
            'ڝ', 'ڞ', 'ڟ', 'ڠ', 'ڡ', 'ڢ', 'ڣ', 'ڤ', 'ڥ', 'ڦ', 'ڧ',
            'ڨ', 'ک', 'ڪ', 'ګ', 'ڬ', 'ڭ', 'ڮ', 'گ', 'ڰ', 'ڱ', 'ڲ',
            'ڳ', 'ڴ', 'ڵ', 'ڶ', 'ڷ', 'ڸ', 'ڹ', 'ں', 'ڻ', 'ڼ', 'ڽ',
            'ھ', 'ڿ', 'ۀ', 'ہ', 'ۂ', 'ۃ', 'ۄ', 'ۅ', 'ۆ', 'ۇ', 'ۈ',
            'ۉ', 'ۊ', 'ۋ', 'ی', 'ۍ', 'ێ', 'ۏ', 'ې', 'ۑ', 'ے', 'ۓ'
        ] },
        { id: 'devanagari', name: '天城文', chars: [
            'अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ',
            'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ', 'ट',
            'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न', 'प', 'फ',
            'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह',
            'ऽ', '्', 'ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ',
            'ं', 'ः', '०', '१', '२', '३', '४', '५', '६', '७', '८', '९'
        ] },
        { id: 'bengali', name: '孟加拉语', chars: [
            'অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'ঌ', 'এ', 'ঐ', 'ও',
            'ঔ', 'ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ',
            'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন', 'প',
            'ফ', 'ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ', 'স', 'হ',
            'ঽ', 'ৎ', '্', 'ং', 'ঃ', 'ঁ', 'া', 'ি', 'ী', 'ু', 'ূ',
            'ৃ', 'ৄ', 'ে', 'ৈ', 'ো', 'ৌ', 'ৗ', '০', '১', '২', '৩',
            '৪', '৫', '৬', '৭', '৮', '৯'
        ] },
        { id: 'tamil', name: '泰米尔语', chars: [
            'அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ',
            'ஔ', 'ஃ', 'க', 'ங', 'ச', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ப',
            'ம', 'ய', 'ர', 'ல', 'வ', 'ழ', 'ள', 'ற', 'ன', 'ஜ', 'ஷ',
            'ஸ', 'ஹ', '்', 'ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை',
            'ொ', 'ோ', 'ௌ', 'ௗ', 'ௐ', '௦', '௧', '௨', '௩', '௪', '௫',
            '௬', '௭', '௮', '௯'
        ] },
        { id: 'telugu', name: '泰卢固语', chars: [
            'అ', 'ఆ', 'ఇ', 'ఈ', 'ఉ', 'ఊ', 'ఋ', 'ఌ', 'ఎ', 'ఏ', 'ఐ',
            'ఒ', 'ఓ', 'ఔ', 'క', 'ఖ', 'గ', 'ఘ', 'ఙ', 'చ', 'ఛ', 'జ',
            'ఝ', 'ఞ', 'ట', 'ఠ', 'డ', 'ఢ', 'ణ', 'త', 'థ', 'ద', 'ధ',
            'న', 'ప', 'ఫ', 'బ', 'భ', 'మ', 'య', 'ర', 'ల', 'వ', 'శ',
            'ష', 'స', 'హ', 'ళ', 'ఽ', '్', 'ం', 'ః', 'ఁ', 'ా', 'ి',
            'ీ', 'ు', 'ూ', 'ృ', 'ౄ', 'ె', 'ే', 'ై', 'ొ', 'ో', 'ౌ',
            '౦', '౧', '౨', '౩', '౪', '౫', '౬', '౭', '౮', '౯'
        ] },
        { id: 'sinhala', name: '僧伽罗语', chars: [
            'අ', 'ආ', 'ඇ', 'ඈ', 'ඉ', 'ඊ', 'උ', 'ඌ', 'ඍ', 'ඎ', 'ඏ',
            'ඐ', 'එ', 'ඒ', 'ඓ', 'ඔ', 'ඕ', 'ඖ', 'ක', 'ඛ', 'ග', 'ඝ',
            'ඞ', 'ඟ', 'ච', 'ඡ', 'ජ', 'ඣ', 'ඤ', 'ඥ', 'ඦ', 'ට', 'ඨ',
            'ඩ', 'ඪ', 'ණ', 'ඬ', 'ත', 'ථ', 'ද', 'ධ', 'න', 'ඳ', 'ප',
            'ඵ', 'බ', 'භ', 'ම', 'ඹ', 'ය', 'ර', 'ල', 'ව', 'ශ', 'ෂ',
            'ස', 'හ', 'ළ', 'ෆ', '්', 'ා', 'ැ', 'ෑ', 'ි', 'ී', 'ු',
            'ූ', 'ෘ', 'ෙ', 'ේ', 'ෛ', 'ො', 'ෝ', 'ෞ', 'ෟ', 'ෲ', 'ෳ',
            '෴'
        ] },
        { id: 'gujarati', name: '古吉拉特语', chars: [
            'અ', 'આ', 'ઇ', 'ઈ', 'ઉ', 'ઊ', 'ઋ', 'ઌ', 'એ', 'ઐ', 'ઓ',
            'ઔ', 'ક', 'ખ', 'ગ', 'ઘ', 'ઙ', 'ચ', 'છ', 'જ', 'ઝ', 'ઞ',
            'ટ', 'ઠ', 'ડ', 'ઢ', 'ણ', 'ત', 'થ', 'દ', 'ધ', 'ન', 'પ',
            'ફ', 'બ', 'ભ', 'મ', 'ય', 'ર', 'લ', 'વ', 'શ', 'ષ', 'સ',
            'હ', 'ળ', 'ઽ', '્', 'ં', 'ઃ', 'ઁ', 'ૐ', 'ા', 'િ', 'ી',
            'ુ', 'ૂ', 'ૃ', 'ૄ', 'ે', 'ૈ', 'ો', 'ૌ', '૦', '૧', '૨',
            '૩', '૪', '૫', '૬', '૭', '૮', '૯'
        ] },
        { id: 'thai', name: '泰文字符', chars: [
            'ก', 'ข', 'ฃ', 'ค', 'ฅ', 'ฆ', 'ง', 'จ', 'ฉ', 'ช', 'ซ',
            'ฌ', 'ญ', 'ฎ', 'ฏ', 'ฐ', 'ฑ', 'ฒ', 'ณ', 'ด', 'ต', 'ถ',
            'ท', 'ธ', 'น', 'บ', 'ป', 'ผ', 'ฝ', 'พ', 'ฟ', 'ภ', 'ม',
            'ย', 'ร', 'ล', 'ว', 'ศ', 'ษ', 'ส', 'ห', 'ฬ', 'อ', 'ฮ',
            'ะ', 'า', 'ำ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', 'เ', 'แ',
            'โ', 'ใ', 'ไ', '่', '้', '๊', '๋', '์',
            '๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'
        ] },
        { id: 'lao', name: '老挝语', chars: [
            'ກ', 'ຂ', '຃', 'ຄ', '຅', 'ຆ', 'ງ', 'ຈ', 'ຉ', 'ຊ', '຋',
            'ຌ', 'ຍ', 'ຎ', 'ຏ', 'ຐ', 'ຑ', 'ຒ', 'ຓ', 'ດ', 'ຕ', 'ຖ',
            'ທ', 'ຘ', 'ນ', 'ບ', 'ປ', 'ຜ', 'ຝ', 'ພ', 'ຟ', 'ຠ', 'ມ',
            'ຢ', 'ຣ', '຤', 'ລ', '຦', 'ວ', 'ຨ', 'ຩ', 'ສ', 'ຫ', 'ຬ',
            'ອ', 'ຮ', 'ຯ', 'ະ', 'ັ', 'າ', 'ຳ', 'ິ', 'ີ', 'ຶ', 'ື',
            'ຸ', 'ູ', '຺', 'ົ', 'ຼ', 'ຽ', 'ເ', 'ແ', 'ໂ', 'ໃ', 'ໄ',
            'ໆ', '່', '້', '໊', '໋', '໌', 'ໍ', '໐', '໑', '໒', '໓',
            '໔', '໕', '໖', '໗', '໘', '໙'
        ] },
        { id: 'khmer', name: '高棉语', chars: [
            'ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ', 'ឈ', 'ញ', 'ដ',
            'ឋ', 'ឌ', 'ឍ', 'ណ', 'ត', 'ថ', 'ទ', 'ធ', 'ន', 'ប', 'ផ',
            'ព', 'ភ', 'ម', 'យ', 'រ', 'ល', 'វ', 'ឝ', 'ឞ', 'ស', 'ហ',
            'ឡ', 'អ', 'ឣ', 'ឤ', 'ឥ', 'ឦ', 'ឧ', 'ឨ', 'ឩ', 'ឪ', 'ឫ',
            'ឬ', 'ឭ', 'ឮ', 'ឯ', 'ឰ', 'ឱ', 'ឲ', 'ឳ', '឴', '឵', 'ា',
            'ិ', 'ី', 'ឹ', 'ឺ', 'ុ', 'ូ', 'ួ', 'ើ', 'ឿ', 'ៀ', 'េ',
            'ែ', 'ៃ', 'ោ', 'ៅ', 'ំ', 'ះ', 'ៈ', '៉', '៊', '់', '៌',
            '៍', '៎', '៏', '័', '៑', '្', '៓', '។', '៕', '៖', '០',
            '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'
        ] },
        { id: 'runes', name: '卢恩字母', chars: [
            'ᚠ', 'ᚡ', 'ᚢ', 'ᚣ', 'ᚤ', 'ᚥ', 'ᚦ', 'ᚧ', 'ᚨ', 'ᚩ',
            'ᚪ', 'ᚫ', 'ᚬ', 'ᚭ', 'ᚮ', 'ᚯ', 'ᚰ', 'ᚱ', 'ᚲ', 'ᚳ',
            'ᚴ', 'ᚵ', 'ᚶ', 'ᚷ', 'ᚸ', 'ᚹ', 'ᚺ', 'ᚻ', 'ᚼ', 'ᚽ',
            'ᚾ', 'ᚿ', 'ᛀ', 'ᛁ', 'ᛂ', 'ᛃ', 'ᛄ', 'ᛅ', 'ᛆ', 'ᛇ',
            'ᛈ', 'ᛉ', 'ᛊ', 'ᛋ', 'ᛌ', 'ᛍ', 'ᛎ', 'ᛏ', 'ᛐ', 'ᛑ',
            'ᛒ', 'ᛓ', 'ᛔ', 'ᛕ', 'ᛖ', 'ᛗ', 'ᛘ', 'ᛙ', 'ᛚ', 'ᛛ',
            'ᛜ', 'ᛝ', 'ᛞ', 'ᛟ'
        ] },
        { id: 'canadian', name: '加拿大原住民音节', chars: [
            'ᐁ', 'ᐃ', 'ᐅ', 'ᐇ', 'ᐉ', 'ᐋ', 'ᐍ', 'ᐏ', 'ᐑ', 'ᐓ', 'ᐕ',
            'ᐗ', 'ᐙ', 'ᐛ', 'ᐝ', 'ᐟ', 'ᐠ', 'ᐡ', 'ᐢ', 'ᐣ', 'ᐤ', 'ᐥ',
            'ᐦ', 'ᐧ', 'ᐨ', 'ᐩ', 'ᐪ', 'ᐫ', 'ᐬ', 'ᐭ', 'ᐮ', 'ᐯ', 'ᐰ',
            'ᐱ', 'ᐲ', 'ᐳ', 'ᐴ', 'ᐵ', 'ᐶ', 'ᐷ', 'ᐸ', 'ᐹ', 'ᐺ', 'ᐻ',
            'ᐼ', 'ᐽ', 'ᐾ', 'ᐿ', 'ᑀ', 'ᑁ', 'ᑂ', 'ᑃ', 'ᑄ', 'ᑅ', 'ᑆ',
            'ᑇ', 'ᑈ', 'ᑉ', 'ᑊ', 'ᑋ', 'ᑌ', 'ᑍ', 'ᑎ', 'ᑏ', 'ᑐ', 'ᑑ',
            'ᑒ', 'ᑓ', 'ᑔ', 'ᑕ', 'ᑖ', 'ᑗ', 'ᑘ', 'ᑙ', 'ᑚ', 'ᑛ', 'ᑜ',
            'ᑝ', 'ᑞ', 'ᑟ', 'ᑠ', 'ᑡ', 'ᑢ', 'ᑣ', 'ᑤ', 'ᑥ', 'ᑦ', 'ᑧ',
            'ᑨ', 'ᑩ', 'ᑪ', 'ᑫ', 'ᑬ', 'ᑭ', 'ᑮ', 'ᑯ', 'ᑰ', 'ᑱ', 'ᑲ',
            'ᑳ', 'ᑴ', 'ᑵ', 'ᑶ', 'ᑷ', 'ᑸ', 'ᑹ', 'ᑺ', 'ᑻ', 'ᑼ', 'ᑽ',
            'ᑾ', 'ᑿ', 'ᒀ', 'ᒁ', 'ᒂ', 'ᒃ', 'ᒄ', 'ᒅ', 'ᒆ', 'ᒇ', 'ᒈ',
            'ᒉ', 'ᒊ', 'ᒋ', 'ᒌ', 'ᒍ', 'ᒎ', 'ᒏ', 'ᒐ', 'ᒑ', 'ᒒ', 'ᒓ',
            'ᒔ', 'ᒕ', 'ᒖ', 'ᒗ', 'ᒘ', 'ᒙ', 'ᒚ', 'ᒛ', 'ᒜ', 'ᒝ', 'ᒞ',
            'ᒟ'
        ] },
        { id: 'box', name: '制表与框线', chars: [
            '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
            '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
            '╭', '╮', '╯', '╰', '━', '┃', '┏', '┓', '┗', '┛', '┣',
            '┫', '┳', '┻', '╋', '▏', '▎', '▍', '▌', '▋', '▊', '▉'
        ] },
        { id: 'geometric', name: '几何图形', chars: [
            '■', '□', '▪', '▫', '▬', '▲', '△', '▶', '▷', '▼', '▽',
            '◀', '◁', '◆', '◇', '○', '●', '◉', '◎', '◈', '☆', '★',
            '◐', '◑', '◒', '◓', '◧', '◨', '◩', '◪', '◢', '◣', '◤',
            '◥'
        ] },
        { id: 'currency', name: '货币与单位', chars: [
            '$', '¢', '£', '¤', '¥', '€', '₹', '₽', '₩', '₪', '₫',
            '₴', '₦', '₱', '₮', '₸', '₺', '₼', '₾', '℃', '℉', '°',
            '′', '″', 'µ', 'Ω', '℧', 'Å', '㏄', '㎜', '㎝', '㎞', '㎎',
            '㎏', '㎡'
        ] },
        { id: 'fractions', name: '分数与数字', chars: [
            '½', '⅓', '⅔', '¼', '¾', '⅕', '⅖', '⅗', '⅘', '⅙',
            '⅚', '⅛', '⅜', '⅝', '⅞', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ',
            'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', '①', '②', '③',
            '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⓪', '⁰', '¹',
            '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '₀', '₁', '₂',
            '₃', '₄', '₅', '₆', '₇', '₈', '₉'
        ] },
        { id: 'symbols', name: '杂项符号', chars: [
            '†', '‡', '§', '¶', '©', '®', '™', '℠', '№', '℡', '‰',
            '‱', '※', '⁂', '⁎', '⁑', '☉', '☌', '☍', '☐', '☑', '☒',
            '☞', '☜', '☝', '☟', '♠', '♣', '♥', '♦', '♀', '♂', '⚥',
            '⚢', '⚣', '⚤', '⚥', '✡', '✝', '☦', '⌘', '⌥', '⌃',
            '⌄', '⇧', '⇪', '⌫', '⌦', '⌁', '⌘', '℔', '⅍', '℅', '℆'
        ] },
        { id: 'dingbats', name: '文字装饰', chars: [
            '✓', '✔', '✕', '✖', '✗', '✘', '✚', '✛', '✜', '✟',
            '✠', '✦', '✧', '✩', '✪', '✫', '✬', '✭', '✮', '✯',
            '✰', '✱', '✲', '✳', '✴', '✵', '✶', '✷', '✸', '✹',
            '✺', '✻', '✼', '✽', '❀', '❁', '❂', '❃', '❄', '❅',
            '❆', '❇', '❈', '❉', '❊', '❋', '❖', '❘', '❙', '❚'
        ] },
        { id: 'combining', name: '组合附加符', chars: [
            '́', '̀', '̂', '̃', '̄', '̅', '̆', '̇', '̈', '̉', '̊',
            '̋', '̌', '̍', '̎', '̏', '̐', '̑', '̒', '̓', '̔', '̕',
            '̖', '̗', '̘', '̙', '̚', '̛', '̣', '̤', '̥', '̦', '̧',
            '̨', '̩', '̪', '̫', '̬', '̭', '̮', '̯', '̰', '̱', '̲',
            '̳', '̹', '̺', '̻', '̼', '̽', '̾', '̿'
        ] }
    ];

    /* ==========================================================
     * 通用小工具
     * ========================================================== */
    function svg( name ) {
        var body = ICONS[ name ] || '';
        return '<svg class="wd-icon" viewBox="0 0 24 24" aria-hidden="true" ' +
            'focusable="false" fill="none" stroke="currentColor" ' +
            'stroke-width="1.6" stroke-linecap="round" ' +
            'stroke-linejoin="round">' + body + '</svg>';
    }

    function escapeHtml( s ) {
        return String( s )
            .replace( /&/g, '&amp;' )
            .replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' )
            .replace( /"/g, '&quot;' )
            .replace( /'/g, '&#39;' );
    }

    function fireInput( ta ) {
        var ev;
        try {
            ev = new Event( 'input', { bubbles: true } );
        } catch ( e ) {
            ev = document.createEvent( 'Event' );
            ev.initEvent( 'input', true, true );
        }
        ta.dispatchEvent( ev );
    }

    function storageGet( key ) {
        try { return localStorage.getItem( key ); } catch ( e ) { return null; }
    }

    function storageSet( key, value ) {
        try { localStorage.setItem( key, value ); } catch ( e ) {}
    }

    /* ==========================================================
     * 编辑器插入操作
     * ========================================================== */
    function applyInsert( ta, text, selStart, selEnd ) {
        try { ta.focus(); } catch ( e ) {}
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var ok = false;

        try {
            ok = document.execCommand( 'insertText', false, text );
        } catch ( e ) {
            ok = false;
        }

        if ( !ok ) {
            var value = ta.value;
            ta.value = value.slice( 0, start ) + text + value.slice( end );
            if ( selStart == null ) {
                ta.selectionStart = ta.selectionEnd = start + text.length;
            }
        }

        if ( selStart != null ) {
            try {
                ta.setSelectionRange(
                    selStart,
                    selEnd == null ? selStart : selEnd
                );
            } catch ( e ) {}
        }

        fireInput( ta );
    }

    function insertPlain( ta, text ) {
        var start = ta.selectionStart;
        applyInsert( ta, text, start + text.length, start + text.length );
    }

    function wrapInline( ta, before, after, placeholder ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var selected = ta.value.slice( start, end );
        var inner = selected || placeholder || '';
        applyInsert(
            ta,
            before + inner + after,
            start + before.length,
            start + before.length + inner.length
        );
    }

    function prefixLine( ta, prefix ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var value = ta.value;
        var lineStart = value.lastIndexOf( '\n', start - 1 ) + 1;

        try { ta.focus(); } catch ( e ) {}
        ta.setSelectionRange( lineStart, lineStart );
        applyInsert(
            ta,
            prefix,
            start + prefix.length,
            end + prefix.length
        );
    }

    function setHeading( ta, level ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var value = ta.value;
        var lineStart = value.lastIndexOf( '\n', start - 1 ) + 1;
        var lineEnd = value.indexOf( '\n', start );
        if ( lineEnd === -1 ) lineEnd = value.length;

        var line = value.slice( lineStart, lineEnd );
        var body = line.replace( /^\s*\+{1,6}\s*/, '' );
        var hadBody = body.length > 0;
        var prefix = new Array( level + 1 ).join( '+' ) + ' ';
        var next = prefix + ( hadBody ? body : '标题' );

        var selStart = lineStart + ( hadBody ? next.length : prefix.length );
        var selEnd   = lineStart + next.length;

        try { ta.focus(); } catch ( e ) {}
        ta.setSelectionRange( lineStart, lineEnd );
        applyInsert( ta, next, selStart, selEnd );
    }

    function insertExternalLink( ta ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var selected = ta.value.slice( start, end );
        var url = 'https://example.com';
        var text = selected || '链接文字';
        var snippet = '[' + url + ' ' + text + ']';

        applyInsert(
            ta,
            snippet,
            start + 1,
            start + 1 + url.length
        );
    }

    function insertTable( ta ) {
        var start = ta.selectionStart;
        var snippet = '\n||~ 表头一 ||~ 表头二 ||\n|| 内容 || 内容 ||\n';
        var bodyStart = start + 1 + 4;

        applyInsert( ta, snippet, bodyStart, bodyStart + 3 );
    }

    function insertCodeBlock( ta ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var selected = ta.value.slice( start, end );
        var inner = selected || '代码';
        var open = '[[code]]\n';
        var close = '\n[[/code]]';

        applyInsert(
            ta,
            open + inner + close,
            start + open.length,
            start + open.length + inner.length
        );
    }

    function insertMathBlock( ta ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var selected = ta.value.slice( start, end );
        var inner = selected || 'x^2 + y^2 = z^2';
        var open = '[[math]]\n';
        var close = '\n[[/math]]';

        applyInsert(
            ta,
            open + inner + close,
            start + open.length,
            start + open.length + inner.length
        );
    }

    function insertBlockSnippet( ta, open, close, placeholder ) {
        var start = ta.selectionStart;
        var end   = ta.selectionEnd;
        var selected = ta.value.slice( start, end );
        var inner = selected || placeholder || '';

        applyInsert(
            ta,
            open + inner + close,
            start + open.length,
            start + open.length + inner.length
        );
    }

    function insertTableSnippet( ta ) {
        insertTable( ta );
    }

    /* ==========================================================
     * 语法高亮
     * ========================================================== */
    var INLINE_HIGHLIGHT_RE = new RegExp(
        '(\\[!--[\\s\\S]*?--\\])' +                    // 0 注释
        '|(\\[\\[\\[[^\\n]*?\\]\\]\\])' +             // 1 三重链接
        '|(\\[\\[[^\\]\\n]*\\]\\])' +                 // 2 标签
        '|(\\[https?:\\/\\/[^\\]\\n]*\\])' +          // 3 外部链接
        '|(https?:\\/\\/[^\\s<>"\')\\]\\u4e00-\\u9fff]+)' + // 4 裸网址
        '|(\\*\\*[^\\n]+?\\*\\*)' +                   // 5 粗体
        '|(\\/\\/[^\\n]+?\\/\\/)' +                   // 6 斜体
        '|(__[^\\n]+?__)' +                           // 7 下划线
        '|(--[^\\n]+?--)' +                           // 8 删除线
        '|(\\^\\^[^\\n]+?\\^\\^)' +                   // 9 上标
        '|(,,(?:[^,\\n]|,(?!,))+,,' + ')' +           // 10 下标
        '|(\\{\\{[^\\n]+?\\}\\})' +                   // 11 行内代码
        '|(@@[^\\n]+?@@)' +                           // 12 原文
        '|(##[^|\\n]+?\\|[^\\n]*?##)',                // 13 颜色
        'g'
    );

    var INLINE_CLASSES = [
        'wd-h-comment',
        'wd-h-link',
        'wd-h-tag',
        'wd-h-link',
        'wd-h-url',
        'wd-h-strong',
        'wd-h-em',
        'wd-h-under',
        'wd-h-strike',
        'wd-h-sup',
        'wd-h-sub',
        'wd-h-code',
        'wd-h-nowiki',
        'wd-h-color'
    ];

    function highlightInline( line ) {
        var out = '';
        var last = 0;
        var m;

        INLINE_HIGHLIGHT_RE.lastIndex = 0;
        while ( ( m = INLINE_HIGHLIGHT_RE.exec( line ) ) !== null ) {
            out += escapeHtml( line.slice( last, m.index ) );

            var cls = 'wd-h-tag';
            for ( var i = 1; i < m.length; i++ ) {
                if ( m[ i ] !== undefined ) {
                    cls = INLINE_CLASSES[ i - 1 ] || cls;
                    break;
                }
            }

            out += '<span class="' + cls + '">' +
                escapeHtml( m[ 0 ] ) + '</span>';
            last = m.index + m[ 0 ].length;
        }

        out += escapeHtml( line.slice( last ) );
        return out;
    }

    function highlightSource( src ) {
        var lines = src.split( '\n' );
        var out = [];
        var inCode = false;

        for ( var i = 0; i < lines.length; i++ ) {
            var line = lines[ i ];

            if ( inCode ) {
                out.push( '<span class="wd-h-codeblock">' +
                    escapeHtml( line ) + '</span>' );
                if ( /\[\[\/code\]\]/i.test( line ) ) inCode = false;
                continue;
            }

            if ( /^\s*\[\[code(?:\s[^\]]*)?\]\]/i.test( line ) ) {
                inCode = true;
                out.push( '<span class="wd-h-codeblock">' +
                    escapeHtml( line ) + '</span>' );
                continue;
            }

            var m;

            m = line.match( /^(\+{1,6})(\s.*)$/ );
            if ( m ) {
                out.push(
                    '<span class="wd-h-mark">' + escapeHtml( m[ 1 ] ) +
                    '</span><span class="wd-h-heading">' +
                    highlightInline( m[ 2 ] ) + '</span>'
                );
                continue;
            }

            if ( /^\s*(?:-{4,}|={5,})\s*$/.test( line ) ) {
                out.push( '<span class="wd-h-mark">' +
                    escapeHtml( line ) + '</span>' );
                continue;
            }

            m = line.match( /^(\s*[#*]+)(\s.*)$/ );
            if ( m ) {
                out.push(
                    '<span class="wd-h-mark">' + escapeHtml( m[ 1 ] ) +
                    '</span>' + highlightInline( m[ 2 ] )
                );
                continue;
            }

            m = line.match( /^(\s*>)(.*)$/ );
            if ( m ) {
                out.push(
                    '<span class="wd-h-quote">' + escapeHtml( m[ 1 ] ) +
                    '</span>' + highlightInline( m[ 2 ] )
                );
                continue;
            }

            out.push( highlightInline( line ) );
        }

        return out.join( '\n' );
    }

    function createHighlighter( stage, ta, button ) {
        var layer = document.createElement( 'div' );
        layer.className = 'wd-highlight';
        layer.setAttribute( 'aria-hidden', 'true' );
        stage.insertBefore( layer, ta );

        var enabled = storageGet( LS.highlight ) !== '0';
        var frame = 0;
        var width = 0;
        var lastValue = null;

        function applyState() {
            stage.classList.toggle( 'is-hl-off', !enabled );
            if ( button ) {
                button.setAttribute( 'aria-pressed', enabled ? 'true' : 'false' );
            }
        }

        function syncScroll() {
            layer.style.transform =
                'translate(' + ( -ta.scrollLeft ) + 'px,' +
                ( -ta.scrollTop ) + 'px)';
        }

        function measure() {
            var w = ta.clientWidth;
            if ( w && w !== width ) {
                width = w;
                layer.style.width = w + 'px';
                return true;
            }
            return false;
        }

        function render() {
            frame = 0;
            if ( !enabled ) return;

            measure();

            var value = ta.value;
            if ( value.length > HL_LIMIT ) {
                enabled = false;
                layer.innerHTML = '';
                applyState();
                stage.classList.add( 'is-hl-off' );
                return;
            }

            if ( value === lastValue && layer.firstChild ) {
                syncScroll();
                return;
            }
            lastValue = value;

            layer.innerHTML = highlightSource( value ) + '​';
            syncScroll();
        }

        function schedule() {
            if ( !enabled || frame ) return;
            frame = window.requestAnimationFrame
                ? window.requestAnimationFrame( render )
                : window.setTimeout( render, 16 );
        }

        function setEnabled( on ) {
            enabled = !!on;
            storageSet( LS.highlight, enabled ? '1' : '0' );
            applyState();
            if ( enabled ) {
                render();
            } else {
                layer.innerHTML = '';
            }
        }

        ta.addEventListener( 'scroll', syncScroll, { passive: true } );

        ta.addEventListener( 'compositionstart', function () {
            stage.classList.add( 'is-composing' );
        } );

        ta.addEventListener( 'compositionend', function () {
            stage.classList.remove( 'is-composing' );
            schedule();
        } );

        if ( window.ResizeObserver ) {
            var ro = new window.ResizeObserver( function () {
                if ( measure() ) {
                    if ( enabled ) render();
                }
                syncScroll();
            } );
            ro.observe( ta );
        } else {
            window.addEventListener( 'resize', function () {
                if ( measure() && enabled ) render();
                syncScroll();
            } );
        }

        applyState();
        if ( enabled ) render();

        return {
            schedule: schedule,
            setEnabled: setEnabled,
            isEnabled: function () { return enabled; },
            refresh: render
        };
    }

    /* ==========================================================
     * 入口
     * ========================================================== */
    function initWikidotEditor() {
        if ( ACTION !== 'edit' ) return;

        var params = new URLSearchParams( location.search );
        if ( params.get( 'editor' ) !== 'wd' ) return;

        var retries = 0;
        function trySetup() {
            var form = document.getElementById( 'editform' );
            var textarea = document.getElementById( 'wpTextbox1' );
            if ( !form || !textarea ) {
                if ( retries++ < 50 ) setTimeout( trySetup, 100 );
                return;
            }
            if ( document.getElementById( 'wikidot-editor-container' ) ) return;
            buildEditor( form, textarea );
        }

        if ( document.readyState === 'loading' ) {
            document.addEventListener( 'DOMContentLoaded', trySetup );
        } else {
            trySetup();
        }
    }

    /* ==========================================================
     * 构建编辑器
     * ========================================================== */
    function buildEditor( form, textarea ) {
        var originalValue = textarea.value;
        var commentMatch = originalValue.match( COMMENT_RE );
        var cleanWikitext = originalValue
            .replace( /<!--WIKIDOT\n[\s\S]*?\nWIKIDOT-->/g, '' )
            .replace( /^\n+|\n+$/g, '' );

        var wikidotSource;
        var reverseConverted = false;

        if ( commentMatch ) {
            var storedSource = commentMatch[ 1 ].replace( /--&gt;/g, '-->' );
            var storedWikitext = buildWikitextDocument( storedSource );

            /*
             * 用注释里的源码重新前向转换，和当前页面 Wikitext 对比：
             * 一致 -> 注释是最新的，直接复用原始 Wikidot 源码；
             * 不一致 -> 页面在 MediaWiki 模式下被改过，反向重建源码。
             */
            if ( normalizeWikitextForCompare( storedWikitext ) ===
                 normalizeWikitextForCompare( cleanWikitext ) ) {
                wikidotSource = storedSource;
            } else {
                wikidotSource = convertWikitextToWikidot( cleanWikitext );
                reverseConverted = true;
            }
        } else {
            wikidotSource = convertWikitextToWikidot( cleanWikitext );
            reverseConverted = true;
        }

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

        var container = document.createElement( 'div' );
        container.id = 'wikidot-editor-container';

        /* ---------- 标题栏 ---------- */
        var header = document.createElement( 'div' );
        header.className = 'wd-header';

        var headerMain = document.createElement( 'div' );
        headerMain.className = 'wd-header-main';

        var title = document.createElement( 'h2' );
        title.className = 'wd-title';
        title.textContent = 'Wikidot 源码';

        var subtitle = document.createElement( 'p' );
        subtitle.className = 'wd-subtitle';
        subtitle.textContent =
            '使用 Wikidot 语法书写，保存时自动转换为 Wikitext。' +
            ( reverseConverted
                ? ' 本次已根据当前 Wikitext 反向生成源码。'
                : '' );

        headerMain.appendChild( title );
        headerMain.appendChild( subtitle );

        var switchLink = document.createElement( 'a' );
        switchLink.className = 'wd-switch-link';
        switchLink.href = mw.util.getUrl( PAGE, { action: 'edit' } );
        switchLink.textContent = '切换至标准编辑器';

        header.appendChild( headerMain );
        header.appendChild( switchLink );
        container.appendChild( header );

        /* ---------- 文本域 ---------- */
        var ta = document.createElement( 'textarea' );
        ta.id = 'wikidot-textarea';
        ta.value = wikidotSource;
        ta.spellcheck = false;
        ta.setAttribute( 'wrap', 'soft' );
        ta.setAttribute( 'aria-label', 'Wikidot 源代码' );

        /* ---------- 工具栏 ---------- */
        var hooks = {
            nodes: null,
            togglePreview: null,
            toggleHighlight: null
        };
        var toolbar = buildToolbar( ta, hooks );
        container.appendChild( toolbar );

        /* ---------- 编辑 / 预览主区域 ---------- */
        var main = document.createElement( 'div' );
        main.className = 'wd-main';
        main.id = 'wikidot-main';

        var editorPane = document.createElement( 'div' );
        editorPane.className = 'wd-editor-pane';

        var stage = document.createElement( 'div' );
        stage.className = 'wd-editor-stage';
        stage.appendChild( ta );

        editorPane.appendChild( stage );
        main.appendChild( editorPane );

        var resizer = document.createElement( 'div' );
        resizer.className = 'wd-resizer';
        resizer.id = 'wikidot-resizer';
        resizer.setAttribute( 'role', 'separator' );
        resizer.setAttribute( 'aria-orientation', 'vertical' );
        resizer.setAttribute( 'aria-label', '调整编辑区与预览区宽度' );
        resizer.setAttribute( 'tabindex', '0' );
        resizer.title = '拖动调整宽度，双击恢复均分';
        main.appendChild( resizer );

        var previewPane = document.createElement( 'div' );
        previewPane.className = 'wd-preview-pane';
        previewPane.id = 'wikidot-preview-pane';
        previewPane.innerHTML =
            '<div class="wd-preview-progress" id="wikidot-preview-progress"></div>' +
            '<div class="wd-preview-header">' +
                '<div class="wd-preview-heading">' +
                    '<span class="wd-preview-dot" aria-hidden="true"></span>' +
                    '<span class="wd-preview-title">实时预览</span>' +
                    '<span class="wd-preview-state" id="wikidot-preview-state">待更新</span>' +
                '</div>' +
                '<button type="button" class="wd-preview-close" ' +
                'id="wikidot-preview-close">' +
                    svg( 'close' ) + '<span>关闭</span>' +
                '</button>' +
            '</div>' +
            '<div class="wd-preview-content" id="wikidot-preview-content"></div>';
        main.appendChild( previewPane );
        container.appendChild( main );

        /* ---------- 状态栏 ---------- */
        var statusbar = document.createElement( 'div' );
        statusbar.className = 'wd-statusbar';

        var statusText = document.createElement( 'span' );
        statusText.className = 'wd-status-text';
        statusText.innerHTML =
            '<span class="wd-status-item">字符 <b>0</b></span>' +
            '<span class="wd-status-item">汉字/词 <b>0</b></span>' +
            '<span class="wd-status-item">行 <b>1</b></span>' +
            '<span class="wd-status-item">光标 <b>1:1</b></span>';
        var statusRefs = statusText.querySelectorAll( 'b' );

        var statusHint = document.createElement( 'span' );
        statusHint.className = 'wd-status-hint';
        statusHint.textContent = 'Ctrl+B 粗体 · Ctrl+I 斜体 · Ctrl+S 保存';

        statusbar.appendChild( statusText );
        statusbar.appendChild( statusHint );
        container.appendChild( statusbar );

        /* ---------- 底部操作栏 ---------- */
        var actions = document.createElement( 'div' );
        actions.className = 'wd-actions';

        var summaryWrap = document.createElement( 'div' );
        summaryWrap.className = 'wd-summary-wrap';

        var summaryLabel = document.createElement( 'label' );
        summaryLabel.setAttribute( 'for', 'wikidot-summary' );
        summaryLabel.textContent = '编辑摘要';

        var summaryInput = document.createElement( 'input' );
        summaryInput.type = 'text';
        summaryInput.id = 'wikidot-summary';
        summaryInput.className = 'wd-summary-input';
        summaryInput.placeholder = '可选，简要说明本次修改';

        summaryWrap.appendChild( summaryLabel );
        summaryWrap.appendChild( summaryInput );
        actions.appendChild( summaryWrap );

        var btnGroup = document.createElement( 'div' );
        btnGroup.className = 'wd-btn-group';

        var saveBtn = document.createElement( 'button' );
        saveBtn.type = 'button';
        saveBtn.className = 'wd-btn wd-btn-primary';
        saveBtn.id = 'wikidot-save';
        saveBtn.textContent = '保存编辑';

        var cancel = document.createElement( 'a' );
        cancel.href = mw.util.getUrl( PAGE );
        cancel.className = 'wd-btn wd-btn-link';
        cancel.textContent = '取消';

        btnGroup.appendChild( saveBtn );
        btnGroup.appendChild( cancel );
        actions.appendChild( btnGroup );
        container.appendChild( actions );

        form.parentNode.insertBefore( container, form );

        var sectionField = form.querySelector( 'input[name="wpSection"]' );
        if ( sectionField ) sectionField.value = '';

        /* ==========================================================
         * 状态栏
         * ========================================================== */
        var statusTimer = null;

        function updateStatus() {
            var text = ta.value;
            var chars = text.length;
            var lines = 1;
            var words = 0;
            var inWord = false;

            for ( var i = 0; i < chars; i++ ) {
                var c = text.charCodeAt( i );
                if ( c === 10 ) {
                    lines++;
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

            var pos = ta.selectionStart || 0;
            var line = 1;
            var lineStart = 0;
            for ( var j = 0; j < pos && j < text.length; j++ ) {
                if ( text.charCodeAt( j ) === 10 ) {
                    line++;
                    lineStart = j + 1;
                }
            }
            var column = pos - lineStart + 1;

            if ( statusRefs[ 0 ] ) statusRefs[ 0 ].textContent = chars;
            if ( statusRefs[ 1 ] ) statusRefs[ 1 ].textContent = words;
            if ( statusRefs[ 2 ] ) statusRefs[ 2 ].textContent = lines;
            if ( statusRefs[ 3 ] ) {
                statusRefs[ 3 ].textContent = line + ':' + column;
            }
        }

        function scheduleStatus() {
            if ( statusTimer ) return;
            statusTimer = setTimeout( function () {
                statusTimer = null;
                updateStatus();
            }, 160 );
        }

        /* ==========================================================
         * 语法高亮控制器
         * ========================================================== */
        var highlighter = createHighlighter(
            stage,
            ta,
            hooks.nodes ? hooks.nodes.highlightBtn : null
        );

        hooks.toggleHighlight = function () {
            highlighter.setEnabled( !highlighter.isEnabled() );
            if ( highlighter.isEnabled() && ta.value.length > HL_LIMIT ) {
                highlighter.setEnabled( false );
            }
        };

        /* 样式表异步到达后，重新测量一次高亮层 */
        window.addEventListener( 'load', function () {
            highlighter.refresh();
        } );
        setTimeout( function () { highlighter.refresh(); }, 300 );
        setTimeout( function () { highlighter.refresh(); }, 1200 );

        /* ==========================================================
         * 预览
         * ========================================================== */
        var previewContent  = document.getElementById( 'wikidot-preview-content' );
        var previewProgress = document.getElementById( 'wikidot-preview-progress' );
        var previewState    = document.getElementById( 'wikidot-preview-state' );
        var previewBtn      = hooks.nodes ? hooks.nodes.previewBtn : null;
        var previewLabel    = hooks.nodes ? hooks.nodes.previewLabel : null;

        var previewOpen = false;
        var previewTimer = null;
        var previewReqId = 0;
        var previewHasContent = false;
        var lastRenderedSource = null;
        var lastRenderedHtml = null;
        var lastHeadHtml = null;
        var activeRequest = null;

        var seenStyleUrls = Object.create( null );
        var loadedModules = Object.create( null );
        var injectedTemplates = Object.create( null );

        var apiReady = mw.loader.using( [ 'mediawiki.api', 'jquery' ] );

        function setPreviewState( text, spinning ) {
            if ( previewState ) previewState.textContent = text;
            if ( previewProgress ) {
                previewProgress.classList.toggle( 'is-active', !!spinning );
            }
        }

        function buildWikitextDocument( src ) {
            var placeholders = [];
            var wikitext = convertWikidotToWikitext( src, placeholders, true );
            wikitext = restorePlaceholders( wikitext, placeholders );

            if ( wikitext.indexOf( WD_CSS_TEMPLATE ) === -1 ) {
                wikitext = WD_CSS_TEMPLATE + '\n' + wikitext;
            }
            return wikitext;
        }

        function loadCSSFromTemplates( wikitext ) {
            var re = /\{\{CSS\s*\|\s*([^}|]+?)\s*\}\}/gi;
            var m;

            while ( ( m = re.exec( wikitext ) ) !== null ) {
                var target = m[ 1 ].trim();
                if ( /^content\s*=/i.test( target ) ) continue;
                if ( injectedTemplates[ target ] ) continue;
                injectedTemplates[ target ] = true;

                mw.loader.load( mw.util.getUrl( target, {
                    action: 'raw',
                    ctype:  'text/css'
                } ) );
            }
        }

        function processHeadHtml( headhtml ) {
            if ( !headhtml || headhtml === lastHeadHtml ) return;
            lastHeadHtml = headhtml;

            var temp = document.createElement( 'div' );
            temp.innerHTML = headhtml;

            temp.querySelectorAll( 'link[rel="stylesheet"]' )
                .forEach( function ( l ) {
                    var href = l.getAttribute( 'href' );
                    if ( !href || seenStyleUrls[ href ] ) return;
                    seenStyleUrls[ href ] = true;

                    var copy = document.createElement( 'link' );
                    copy.rel = 'stylesheet';
                    copy.href = href;
                    copy.dataset.wdPreview = '1';
                    document.head.appendChild( copy );
                } );

            temp.querySelectorAll( 'style' ).forEach( function ( s ) {
                var copy = document.createElement( 'style' );
                copy.textContent = s.textContent;
                copy.dataset.wdPreview = '1';
                document.head.appendChild( copy );
            } );
        }

        function renderPreview( force ) {
            if ( !previewOpen ) return;

            var src = ta.value;
            if ( !force && src === lastRenderedSource ) {
                previewBtn.classList.remove( 'is-stale' );
                setPreviewState( '已更新', false );
                return;
            }

            lastRenderedSource = src;
            previewBtn.classList.remove( 'is-stale' );

            var wikitext = buildWikitextDocument( src );
            loadCSSFromTemplates( wikitext );

            var reqId = ++previewReqId;
            if ( activeRequest ) {
                try { activeRequest.abort(); } catch ( e ) {}
                activeRequest = null;
            }

            if ( previewHasContent ) {
                previewContent.classList.add( 'loading' );
            } else {
                previewContent.innerHTML =
                    '<div class="wd-preview-loading">正在生成预览</div>';
            }
            setPreviewState( '生成中', true );

            apiReady.then( function () {
                if ( reqId !== previewReqId ) return;

                var api = new mw.Api();
                var req = api.post( {
                    action: 'parse',
                    text: wikitext,
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

                activeRequest = req;

                req.then( function ( res ) {
                    if ( reqId !== previewReqId ) return;
                    activeRequest = null;

                    previewContent.classList.remove( 'loading' );
                    setPreviewState( '已更新', false );

                    if ( !res || !res.parse ||
                         typeof res.parse.text !== 'string' ) {
                        previewContent.innerHTML =
                            '<div class="wd-preview-error">' +
                            '预览失败：返回结果异常</div>';
                        previewHasContent = false;
                        return;
                    }

                    processHeadHtml( res.parse.headhtml );

                    if ( res.parse.text !== lastRenderedHtml ) {
                        var scrollTop = previewContent.scrollTop;
                        previewContent.innerHTML = res.parse.text;
                        previewContent.scrollTop = scrollTop;
                        lastRenderedHtml = res.parse.text;
                    }

                    previewHasContent = true;

                    var modules = ( res.parse.modules || [] ).filter(
                        function ( name ) {
                            if ( loadedModules[ name ] ) return false;
                            loadedModules[ name ] = true;
                            return true;
                        }
                    );

                    var fire = function () {
                        if ( window.mw && mw.hook ) {
                            mw.hook( 'wikipage.content' ).fire(
                                $( previewContent )
                            );
                        }
                    };

                    if ( modules.length ) {
                        mw.loader.using( modules ).then( fire, fire );
                    } else {
                        fire();
                    }
                }, function ( err ) {
                    if ( reqId !== previewReqId ) return;
                    activeRequest = null;

                    previewContent.classList.remove( 'loading' );

                    if ( err && ( err.textStatus === 'abort' ||
                                  err.error === 'aborted' ) ) {
                        return;
                    }
                    if ( !previewOpen ) return;

                    previewContent.innerHTML =
                        '<div class="wd-preview-error">预览失败：' +
                        escapeHtml( extractErrorInfo( err ) ) + '</div>';
                    previewHasContent = false;
                    lastRenderedHtml = null;
                    setPreviewState( '生成失败', false );
                } );
            }, function ( err ) {
                if ( reqId !== previewReqId ) return;
                previewContent.classList.remove( 'loading' );
                previewContent.innerHTML =
                    '<div class="wd-preview-error">预览组件加载失败：' +
                    escapeHtml( extractErrorInfo( err ) ) + '</div>';
                previewHasContent = false;
                setPreviewState( '生成失败', false );
            } );
        }

        function schedulePreview() {
            if ( !previewOpen ) return;

            if ( previewBtn ) previewBtn.classList.add( 'is-stale' );
            setPreviewState( '待更新', false );

            clearTimeout( previewTimer );
            previewTimer = setTimeout( function () {
                var run = function () { renderPreview( false ); };
                if ( window.requestIdleCallback ) {
                    window.requestIdleCallback( run, { timeout: 900 } );
                } else {
                    run();
                }
            }, PREVIEW_DELAY );
        }

        var savedSplit = 0.5;
        try {
            var storedSplit = parseFloat( storageGet( LS.split ) );
            if ( storedSplit >= 0.2 && storedSplit <= 0.8 ) {
                savedSplit = storedSplit;
            }
        } catch ( e ) {}

        function applySplit( ratio ) {
            if ( window.innerWidth <= 900 ) return;
            main.style.gridTemplateColumns =
                ( ratio * 100 ).toFixed( 2 ) + '% ' +
                SPLIT_WIDTH + 'px minmax(0, 1fr)';
        }

        function togglePreview( force ) {
            var open = force === undefined ? !previewOpen : !!force;
            if ( open === previewOpen ) return;

            previewOpen = open;

            if ( open ) {
                main.classList.add( 'preview-mode' );
                if ( previewBtn ) {
                    previewBtn.setAttribute( 'aria-pressed', 'true' );
                    previewBtn.setAttribute( 'aria-label', '收起预览' );
                    previewBtn.title = '收起实时预览';
                    previewBtn.classList.remove( 'is-stale' );
                }
                if ( previewLabel ) previewLabel.textContent = '收起预览';
                applySplit( savedSplit );
                renderPreview( true );
            } else {
                main.classList.remove( 'preview-mode' );
                if ( previewBtn ) {
                    previewBtn.setAttribute( 'aria-pressed', 'false' );
                    previewBtn.setAttribute( 'aria-label', '预览' );
                    previewBtn.title = '打开实时预览';
                    previewBtn.classList.remove( 'is-stale' );
                }
                if ( previewLabel ) previewLabel.textContent = '预览';
                clearTimeout( previewTimer );
                if ( activeRequest ) {
                    try { activeRequest.abort(); } catch ( e ) {}
                    activeRequest = null;
                }
                setPreviewState( '待更新', false );
            }
        }

        hooks.togglePreview = function () { togglePreview(); };

        if ( previewBtn ) {
            previewBtn.addEventListener( 'click', function ( e ) {
                e.preventDefault();
                hooks.togglePreview();
            } );
        }

        document.getElementById( 'wikidot-preview-close' )
            .addEventListener( 'click', function () {
                togglePreview( false );
            } );

        /* ---------- 分隔条 ---------- */
        var dragging = false;

        resizer.addEventListener( 'pointerdown', function ( e ) {
            if ( !previewOpen ) return;
            dragging = true;
            resizer.classList.add( 'dragging' );
            try { resizer.setPointerCapture( e.pointerId ); } catch ( err ) {}
            e.preventDefault();
        } );

        resizer.addEventListener( 'pointermove', function ( e ) {
            if ( !dragging ) return;
            var rect = main.getBoundingClientRect();
            if ( !rect.width ) return;

            var ratio = ( e.clientX - rect.left ) / rect.width;
            ratio = Math.max( 0.2, Math.min( 0.8, ratio ) );
            savedSplit = ratio;
            applySplit( ratio );
        } );

        function stopDrag() {
            if ( !dragging ) return;
            dragging = false;
            resizer.classList.remove( 'dragging' );
            storageSet( LS.split, String( savedSplit ) );
        }

        resizer.addEventListener( 'pointerup', stopDrag );
        resizer.addEventListener( 'pointercancel', stopDrag );

        resizer.addEventListener( 'dblclick', function () {
            savedSplit = 0.5;
            applySplit( savedSplit );
            storageSet( LS.split, String( savedSplit ) );
        } );

        resizer.addEventListener( 'keydown', function ( e ) {
            if ( e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' ) return;
            e.preventDefault();
            savedSplit += ( e.key === 'ArrowLeft' ? -0.02 : 0.02 );
            savedSplit = Math.max( 0.2, Math.min( 0.8, savedSplit ) );
            applySplit( savedSplit );
            storageSet( LS.split, String( savedSplit ) );
        } );

        /* ---------- 输入与快捷键 ---------- */
        ta.addEventListener( 'input', function () {
            scheduleStatus();
            highlighter.schedule();
            schedulePreview();
        } );

        ta.addEventListener( 'keyup', scheduleStatus );
        ta.addEventListener( 'click', scheduleStatus );
        ta.addEventListener( 'select', scheduleStatus );

        document.addEventListener( 'selectionchange', function () {
            if ( document.activeElement === ta ) scheduleStatus();
        } );

        container.addEventListener( 'keydown', function ( e ) {
            var mod = e.ctrlKey || e.metaKey;
            if ( !mod || e.altKey ) return;

            var key = ( e.key || '' ).toLowerCase();

            if ( key === 's' ) {
                e.preventDefault();
                save();
                return;
            }

            if ( e.target !== ta ) return;

            if ( key === 'b' ) {
                e.preventDefault();
                wrapInline( ta, '**', '**', '粗体' );
            } else if ( key === 'i' ) {
                e.preventDefault();
                wrapInline( ta, '//', '//', '斜体' );
            } else if ( key === 'u' ) {
                e.preventDefault();
                wrapInline( ta, '__', '__', '下划线' );
            }
        } );

        /* ---------- 离开提醒 ---------- */
        var initialSource = ta.value;
        var initialSummary = summaryInput.value;
        var saving = false;
        var editWarningEnabled = true;

        try {
            editWarningEnabled =
                !!mw.user.options.get( 'useeditwarning' );
        } catch ( e ) {}

        function editorHasChanges() {
            return ta.value !== initialSource ||
                summaryInput.value !== initialSummary;
        }

        window.addEventListener( 'beforeunload', function ( e ) {
            /*
             * 自定义文本框的内容不会同步回原生 #wpTextbox1，
             * 所以单独维护离开提醒；保存时由 saving 临时放行。
             */
            if ( !editWarningEnabled || saving || !editorHasChanges() ) return;

            var message = '未保存的更改将会丢失。';
            e.preventDefault();
            e.returnValue = message;
            return message;
        } );

        /* 从往返缓存恢复时，确保提醒重新生效 */
        window.addEventListener( 'pageshow', function () {
            saving = false;
        } );

        /* ---------- 保存 ---------- */
        function releaseEditWarning() {
            /*
             * MediaWiki 的 editWarning 在 #editform 的 submit 事件里调用
             * allowCloseWindow.release()。form.submit() 不会触发该事件，
             * 所以保存前先派发一次 submit，解除“未保存”提示；
             * 用户真正主动离开页面时，这个提示仍然有效。
             */
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

        function save() {
            var src = ta.value;
            var wikitext = buildWikitextDocument( src );

            var safe = src.replace( /-->/g, '--&gt;' );
            textarea.value =
                wikitext + '\n<!--WIKIDOT\n' + safe + '\nWIKIDOT-->\n';

            var summaryField = document.getElementById( 'wpSummary' );
            if ( summaryField && summaryInput.value ) {
                summaryField.value = summaryInput.value;
            }

            saving = true;
            releaseEditWarning();
            HTMLFormElement.prototype.submit.call( form );

            /*
             * 正常提交会离开页面；若提交被拦截或失败而页面仍在，
             * 1.5 秒后恢复离开提醒，避免提示被永久关掉。
             */
            setTimeout( function () { saving = false; }, 1500 );
        }

        saveBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            save();
        } );

        updateStatus();

        var firstHeading = document.querySelector(
            '#firstHeading, .firstHeading, .citizen-page-header__title'
        );
        if ( firstHeading &&
             firstHeading.textContent.indexOf( 'Wikidot' ) === -1 ) {
            firstHeading.textContent += '（Wikidot 模式）';
        }
    }

    /* ==========================================================
     * 工具栏
     * ========================================================== */
    function buildToolbar( ta, hooks ) {
        var toolbar = document.createElement( 'div' );
        toolbar.className = 'wd-toolbar';

        var row = document.createElement( 'div' );
        row.className = 'wd-toolbar-row';

        var tabs = document.createElement( 'div' );
        tabs.className = 'wd-tabs';
        tabs.setAttribute( 'role', 'tablist' );

        var panes = document.createElement( 'div' );
        panes.className = 'wd-panes';

        var TAB_DEFS = [
            [ 'format', '格式' ],
            [ 'paragraph', '段落' ],
            [ 'insert', '插入' ],
            [ 'chars', '特殊字符' ],
            [ 'help', '帮助' ]
        ];

        var tabButtons = {};
        var paneEls = {};

        TAB_DEFS.forEach( function ( def, index ) {
            var id = def[ 0 ];

            var btn = document.createElement( 'button' );
            btn.type = 'button';
            btn.className = 'wd-tab';
            btn.id = 'wd-tab-' + id;
            btn.setAttribute( 'role', 'tab' );
            btn.textContent = def[ 1 ];
            btn.addEventListener( 'click', function () { selectTab( id ); } );
            btn.addEventListener( 'keydown', function ( e ) {
                if ( e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' ) return;
                e.preventDefault();
                var next = index + ( e.key === 'ArrowRight' ? 1 : -1 );
                if ( next < 0 ) next = TAB_DEFS.length - 1;
                if ( next >= TAB_DEFS.length ) next = 0;
                selectTab( TAB_DEFS[ next ][ 0 ] );
                tabButtons[ TAB_DEFS[ next ][ 0 ] ].focus();
            } );

            tabs.appendChild( btn );
            tabButtons[ id ] = btn;

            var pane = document.createElement( 'div' );
            pane.className = 'wd-pane';
            pane.id = 'wd-pane-' + id;
            pane.setAttribute( 'role', 'tabpanel' );
            pane.setAttribute( 'aria-labelledby', 'wd-tab-' + id );
            pane.hidden = true;
            panes.appendChild( pane );
            paneEls[ id ] = pane;
        } );

        function selectTab( id ) {
            if ( !paneEls[ id ] ) id = 'format';

            TAB_DEFS.forEach( function ( def ) {
                var key = def[ 0 ];
                var on = key === id;
                var btn = tabButtons[ key ];
                var pane = paneEls[ key ];

                btn.setAttribute( 'aria-selected', on ? 'true' : 'false' );
                btn.tabIndex = on ? 0 : -1;
                pane.classList.toggle( 'is-active', on );

                if ( on ) {
                    pane.removeAttribute( 'hidden' );
                } else {
                    pane.setAttribute( 'hidden', '' );
                }
            } );

            try { sessionStorage.setItem( LS.tab, id ); } catch ( e ) {}
        }

        function addGroup( pane, label, tools ) {
            var group = document.createElement( 'div' );
            group.className = 'wd-group';

            if ( label ) {
                var l = document.createElement( 'span' );
                l.className = 'wd-group-label';
                l.textContent = label;
                group.appendChild( l );
            }

            tools.forEach( function ( tool ) {
                group.appendChild( tool );
            } );

            pane.appendChild( group );
        }

        function tool( opts ) {
            var btn = document.createElement( 'button' );
            btn.type = 'button';
            btn.className = 'wd-tool';

            if ( opts.title ) {
                btn.title = opts.title;
                btn.setAttribute( 'aria-label', opts.title );
            }

            var html = '';
            if ( opts.icon ) html += svg( opts.icon );
            if ( opts.html ) html += opts.html;
            if ( opts.label ) {
                html += '<span class="wd-tool-text">' +
                    escapeHtml( opts.label ) + '</span>';
            }
            btn.innerHTML = html;

            btn.addEventListener( 'click', function ( e ) {
                e.preventDefault();
                if ( opts.action ) opts.action();
            } );

            return btn;
        }

        /* ---------- 格式 ---------- */
        var formatPane = paneEls.format;

        addGroup( formatPane, '字形', [
            tool( {
                html: '<span class="wd-glyph wd-glyph-b">B</span>',
                title: '粗体（Ctrl+B）',
                action: function () { wrapInline( ta, '**', '**', '粗体' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-i">I</span>',
                title: '斜体（Ctrl+I）',
                action: function () { wrapInline( ta, '//', '//', '斜体' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-u">U</span>',
                title: '下划线（Ctrl+U）',
                action: function () { wrapInline( ta, '__', '__', '下划线' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-s">S</span>',
                title: '删除线',
                action: function () { wrapInline( ta, '--', '--', '删除线' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-bi">BI</span>',
                title: '粗斜体',
                action: function () { wrapInline( ta, '//**', '**//', '粗斜体' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-sup">x<sup>2</sup></span>',
                title: '上标',
                action: function () { wrapInline( ta, '^^', '^^', '上标' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-sub">x<sub>2</sub></span>',
                title: '下标',
                action: function () { wrapInline( ta, ',,', ',,', '下标' ); }
            } )
        ] );

        addGroup( formatPane, '行内', [
            tool( {
                icon: 'code',
                label: '行内代码',
                title: '行内代码 {{代码}}',
                action: function () { wrapInline( ta, '{{', '}}', '代码' ); }
            } ),
            tool( {
                icon: 'color',
                label: '颜色',
                title: '文字颜色 ##c0392b|文字##',
                action: function () {
                    wrapInline( ta, '##c0392b|', '##', '文字' );
                }
            } ),
            tool( {
                icon: 'size',
                label: '字号',
                title: '文字字号 [[size 120%]]文字[[/size]]',
                action: function () {
                    wrapInline( ta, '[[size 120%]]', '[[/size]]', '文字' );
                }
            } ),
            tool( {
                label: '原文',
                title: '原文保护 @@文字@@',
                action: function () { wrapInline( ta, '@@', '@@', '原文' ); }
            } )
        ] );

        /* ---------- 段落 ---------- */
        var paragraphPane = paneEls.paragraph;
        var headingTools = [];

        for ( var h = 1; h <= 6; h++ ) {
            ( function ( level ) {
                headingTools.push( tool( {
                    html: '<span class="wd-glyph wd-glyph-h">H' + level + '</span>',
                    title: level + ' 级标题（行首 ' +
                        new Array( level + 1 ).join( '+' ) + '）',
                    action: function () { setHeading( ta, level ); }
                } ) );
            } )( h );
        }

        addGroup( paragraphPane, '标题', headingTools );

        addGroup( paragraphPane, '列表', [
            tool( {
                html: '<span class="wd-glyph wd-glyph-list">•</span>',
                label: '无序',
                title: '无序列表（行首星号）',
                action: function () { prefixLine( ta, '* ' ); }
            } ),
            tool( {
                html: '<span class="wd-glyph wd-glyph-list">1.</span>',
                label: '有序',
                title: '有序列表（行首井号）',
                action: function () { prefixLine( ta, '# ' ); }
            } )
        ] );

        addGroup( paragraphPane, '块级', [
            tool( {
                icon: 'quote',
                label: '引用',
                title: '引用（行首大于号）',
                action: function () { prefixLine( ta, '> ' ); }
            } ),
            tool( {
                icon: 'rule',
                label: '分隔线',
                title: '插入分隔线',
                action: function () { insertPlain( ta, '\n----\n' ); }
            } ),
            tool( {
                icon: 'lineBreak',
                label: '换行',
                title: '强制换行 @@@@',
                action: function () { insertPlain( ta, '@@@@' ); }
            } ),
            tool( {
                icon: 'center',
                label: '居中',
                title: '居中区块 [[=]] 内容 [[/=]]',
                action: function () {
                    insertBlockSnippet( ta, '[[=]]\n', '\n[[/=]]', '居中内容' );
                }
            } )
        ] );

        addGroup( paragraphPane, '容器', [
            tool( {
                icon: 'collapse',
                label: '折叠块',
                title: '插入可折叠区块',
                action: function () {
                    insertBlockSnippet(
                        ta,
                        '[[collapsible show="展开" hide="收起"]]\n',
                        '\n[[/collapsible]]',
                        '折叠内容'
                    );
                }
            } ),
            tool( {
                icon: 'div',
                label: '容器',
                title: '插入 div 容器',
                action: function () {
                    insertBlockSnippet(
                        ta,
                        '[[div class="block"]]\n',
                        '\n[[/div]]',
                        '容器内容'
                    );
                }
            } ),
            tool( {
                icon: 'tabs',
                label: '标签页',
                title: '插入 tabview 标签页',
                action: function () {
                    var start = ta.selectionStart;
                    var snippet =
                        '[[tabview]]\n' +
                        '[[tab 标签一]]\n内容一\n[[/tab]]\n' +
                        '[[tab 标签二]]\n内容二\n[[/tab]]\n' +
                        '[[/tabview]]';
                    var bodyStart = start +
                        '[[tabview]]\n[[tab 标签一]]\n'.length;
                    applyInsert(
                        ta,
                        snippet,
                        bodyStart,
                        bodyStart + 3
                    );
                }
            } )
        ] );

        /* ---------- 插入 ---------- */
        var insertPane = paneEls.insert;

        addGroup( insertPane, '链接', [
            tool( {
                icon: 'link',
                label: '内部链接',
                title: '内部链接 [[[页面名]]]',
                action: function () { wrapInline( ta, '[[[', ']]]', '页面名' ); }
            } ),
            tool( {
                icon: 'external',
                label: '外部链接',
                title: '外部链接 [网址 文字]',
                action: function () { insertExternalLink( ta ); }
            } ),
            tool( {
                icon: 'user',
                label: '用户',
                title: '提及用户 [[*user 用户名]]',
                action: function () { wrapInline( ta, '[[*user ', ']]', '用户名' ); }
            } )
        ] );

        addGroup( insertPane, '媒体', [
            tool( {
                icon: 'image',
                label: '图片',
                title: '插入图片 [[image 文件名]]',
                action: function () { wrapInline( ta, '[[image ', ']]', '文件名'); }
            } ),
            tool( {
                icon: 'attach',
                label: '附件',
                title: '附件链接 [[file 文件名]]',
                action: function () { wrapInline( ta, '[[file ', ']]', '文件名'); }
            } ),
            tool( {
                icon: 'table',
                label: '表格',
                title: '插入表格',
                action: function () { insertTableSnippet( ta ); }
            } )
        ] );

        addGroup( insertPane, '引用', [
            tool( {
                icon: 'footnote',
                label: '脚注',
                title: '插入脚注',
                action: function () {
                    wrapInline( ta, '[[footnote]]', '[[/footnote]]', '注释内容' );
                }
            } ),
            tool( {
                icon: 'footnote',
                label: '脚注列表',
                title: '插入脚注列表 [[footnoteblock]]',
                action: function () { insertPlain( ta, '[[footnoteblock]]' ); }
            } ),
            tool( {
                icon: 'toc',
                label: '目录',
                title: '插入目录 [[toc]]',
                action: function () { insertPlain( ta, '[[toc]]' ); }
            } )
        ] );

        addGroup( insertPane, '代码', [
            tool( {
                icon: 'codeBlock',
                label: '代码块',
                title: '插入代码块',
                action: function () { insertCodeBlock( ta ); }
            } ),
            tool( {
                icon: 'math',
                label: '数学',
                title: '插入数学公式',
                action: function () { insertMathBlock( ta ); }
            } ),
            tool( {
                icon: 'comment',
                label: '注释',
                title: '插入注释 [!-- 注释 --]',
                action: function () {
                    wrapInline( ta, '[!-- ', ' --]', '注释' );
                }
            } )
        ] );

        /* ---------- 特殊字符 ---------- */
        fillCharPane( paneEls.chars, ta );

        /* ---------- 帮助 ---------- */
        fillHelpPane( paneEls.help );

        /* ---------- 右侧动作 ---------- */
        var actions = document.createElement( 'div' );
        actions.className = 'wd-toolbar-actions';

        var highlightBtn = document.createElement( 'button' );
        highlightBtn.type = 'button';
        highlightBtn.className = 'wd-action';
        highlightBtn.id = 'wikidot-highlight-btn';
        highlightBtn.setAttribute( 'aria-pressed', 'true' );
        highlightBtn.setAttribute( 'aria-label', '语法高亮' );
        highlightBtn.title = '开关语法高亮';
        highlightBtn.innerHTML = svg( 'highlight' ) +
            '<span class="wd-action-label">语法高亮</span>';
        highlightBtn.addEventListener( 'click', function ( e ) {
            e.preventDefault();
            if ( hooks.toggleHighlight ) hooks.toggleHighlight();
        } );

        var previewBtn = document.createElement( 'button' );
        previewBtn.type = 'button';
        previewBtn.className = 'wd-action wd-action-primary wd-action-preview';
        previewBtn.id = 'wikidot-preview-btn';
        previewBtn.setAttribute( 'aria-pressed', 'false' );
        previewBtn.setAttribute( 'aria-label', '预览' );
        previewBtn.title = '打开实时预览';
        previewBtn.innerHTML = svg( 'preview' ) +
            '<span class="wd-action-label">预览</span>';

        actions.appendChild( highlightBtn );
        actions.appendChild( previewBtn );

        row.appendChild( tabs );
        row.appendChild( actions );
        toolbar.appendChild( row );
        toolbar.appendChild( panes );

        hooks.nodes = {
            highlightBtn: highlightBtn,
            previewBtn: previewBtn,
            previewLabel: previewBtn.querySelector( '.wd-action-label' )
        };

        var initialTab = 'format';
        try {
            var savedTab = sessionStorage.getItem( LS.tab );
            if ( savedTab && paneEls[ savedTab ] ) initialTab = savedTab;
        } catch ( e ) {}
        selectTab( initialTab );

        return toolbar;
    }

    /* ==========================================================
     * 特殊字符面板
     * ========================================================== */
    function loadRecentChars() {
        try {
            var raw = storageGet( LS.recent );
            var arr = raw ? JSON.parse( raw ) : [];
            if ( Object.prototype.toString.call( arr ) !== '[object Array]' ) {
                return [];
            }
            return arr.filter( function ( x ) {
                return typeof x === 'string' && x.length > 0;
            } ).slice( 0, 48 );
        } catch ( e ) {
            return [];
        }
    }

    function fillCharPane( pane, ta ) {
        pane.classList.add( 'wd-pane-chars' );

        var index = document.createElement( 'div' );
        index.className = 'wd-char-index';

        var main = document.createElement( 'div' );
        main.className = 'wd-char-main';

        var head = document.createElement( 'div' );
        head.className = 'wd-char-head';

        var title = document.createElement( 'span' );
        title.className = 'wd-char-title';

        var meta = document.createElement( 'span' );
        meta.className = 'wd-char-meta';

        head.appendChild( title );
        head.appendChild( meta );

        var grid = document.createElement( 'div' );
        grid.className = 'wd-char-grid';

        main.appendChild( head );
        main.appendChild( grid );
        pane.appendChild( index );
        pane.appendChild( main );

        var cats = CHAR_CATEGORIES.map( function ( c ) {
            return {
                id: c.id,
                name: c.name,
                chars: c.chars.slice( 0 )
            };
        } );

        var recent = loadRecentChars();
        cats[ 0 ].chars = recent;

        var activeId = 'recent';
        var catButtons = {};

        function getCat( id ) {
            for ( var i = 0; i < cats.length; i++ ) {
                if ( cats[ i ].id === id ) return cats[ i ];
            }
            return cats[ 0 ];
        }

        function updateCount( id ) {
            var btn = catButtons[ id ];
            if ( !btn ) return;
            var count = btn.querySelector( '.wd-char-cat-count' );
            if ( count ) {
                var cat = getCat( id );
                count.textContent = cat.chars.length;
            }
        }

        function renderGrid() {
            var cat = getCat( activeId );
            grid.textContent = '';
            title.textContent = cat.name;
            meta.textContent = cat.chars.length
                ? '共 ' + cat.chars.length + ' 个字符'
                : '';

            if ( !cat.chars.length ) {
                var empty = document.createElement( 'div' );
                empty.className = 'wd-char-empty';
                empty.textContent =
                    '点击任意字符后，会在这里留下记录。';
                grid.appendChild( empty );
                return;
            }

            var frag = document.createDocumentFragment();

            cat.chars.forEach( function ( ch ) {
                var b = document.createElement( 'button' );
                b.type = 'button';
                b.className = 'wd-char';
                b.textContent = ch;
                b.title = '插入 ' + ch;
                b.setAttribute( 'aria-label', '插入字符 ' + ch );
                b.addEventListener( 'click', function () {
                    insertPlain( ta, ch );
                    remember( ch );
                } );
                frag.appendChild( b );
            } );

            grid.appendChild( frag );
        }

        function remember( ch ) {
            recent = [ ch ].concat( recent.filter( function ( x ) {
                return x !== ch;
            } ) ).slice( 0, 48 );

            storageSet( LS.recent, JSON.stringify( recent ) );
            cats[ 0 ].chars = recent;
            updateCount( 'recent' );

            if ( activeId === 'recent' ) renderGrid();
        }

        function selectCategory( id ) {
            activeId = id;

            cats.forEach( function ( c ) {
                var btn = catButtons[ c.id ];
                if ( btn ) {
                    btn.classList.toggle( 'is-active', c.id === id );
                }
            } );

            renderGrid();
        }

        cats.forEach( function ( c ) {
            var btn = document.createElement( 'button' );
            btn.type = 'button';
            btn.className = 'wd-char-cat';
            btn.setAttribute( 'role', 'option' );
            btn.appendChild( document.createTextNode( c.name ) );

            var count = document.createElement( 'span' );
            count.className = 'wd-char-cat-count';
            count.textContent = c.chars.length;
            btn.appendChild( count );

            btn.addEventListener( 'click', function () {
                selectCategory( c.id );
            } );

            catButtons[ c.id ] = btn;
            index.appendChild( btn );
        } );

        selectCategory( recent.length ? 'recent' : 'punct' );
    }

    /* ==========================================================
     * 帮助面板
     * ========================================================== */
    function fillHelpPane( pane ) {
        pane.classList.add( 'wd-pane-help' );

        var rows = [
            [ '+ 标题', '一级标题；++ 为二级，依此类推至 ++++++' ],
            [ '**粗体**', '粗体文字' ],
            [ '//斜体//', '斜体文字' ],
            [ '__下划线__', '下划线文字' ],
            [ '--删除线--', '删除线文字' ],
            [ '{{代码}}', '行内代码' ],
            [ '[[[页面名]]]', '站内链接' ],
            [ '[[[页面名|显示文字]]]', '带显示文字的站内链接' ],
            [ '[https://example.com 文字]', '外部链接' ],
            [ '[[*user 用户名]]', '提及用户' ],
            [ '[[image 文件名]]', '插入图片' ],
            [ '[[file 文件名]]', '附件链接' ],
            [ '||~ 表头 ||~ 表头 ||', '表格；下一行用 || 单元格 ||' ],
            [ '[[footnote]]注释[[/footnote]]', '脚注' ],
            [ '[[footnoteblock]]', '脚注列表' ],
            [ '[[toc]]', '目录' ],
            [ '[[code]]…[[/code]]', '代码块' ],
            [ '[[raw]]…[[/raw]]', '原样保留 Wikitext，反向转换会自动使用' ],
            [ '[[collapsible show="展开"]]…[[/collapsible]]', '折叠块' ],
            [ '[[div class="类名"]]…[[/div]]', '容器' ],
            [ '[[=]]…[[/=]]', '居中区块' ],
            [ '@@@@', '强制换行' ],
            [ '##c0392b|文字##', '文字颜色' ],
            [ '[[size 120%]]文字[[/size]]', '文字字号' ],
            [ 'Ctrl+B / I / U', '粗体、斜体、下划线' ],
            [ 'Ctrl+S', '保存编辑' ],
            [ '工具栏右侧', '预览开关与语法高亮开关' ]
        ];

        var table = document.createElement( 'table' );
        table.className = 'wd-help-table';

        var thead = document.createElement( 'thead' );
        var headRow = document.createElement( 'tr' );
        var th1 = document.createElement( 'th' );
        th1.textContent = '语法';
        var th2 = document.createElement( 'th' );
        th2.textContent = '说明';
        headRow.appendChild( th1 );
        headRow.appendChild( th2 );
        thead.appendChild( headRow );
        table.appendChild( thead );

        var tbody = document.createElement( 'tbody' );

        rows.forEach( function ( row ) {
            var tr = document.createElement( 'tr' );
            var td1 = document.createElement( 'td' );
            var code = document.createElement( 'code' );
            code.textContent = row[ 0 ];
            td1.appendChild( code );

            var td2 = document.createElement( 'td' );
            td2.textContent = row[ 1 ];

            tr.appendChild( td1 );
            tr.appendChild( td2 );
            tbody.appendChild( tr );
        } );

        table.appendChild( tbody );
        pane.appendChild( table );
    }

    /* ==========================================================
     * 转换辅助
     * ========================================================== */
    function extractErrorInfo( err ) {
        if ( !err ) return '未知错误';
        if ( err.error && err.error.info ) return err.error.info;
        if ( err.info ) return err.info;
        if ( typeof err === 'string' ) return err;
        try { return JSON.stringify( err ); } catch ( e ) { return '未知错误'; }
    }

    function ph( placeholders, html ) {
        var id = '\u0000PH' + placeholders.length + '\u0000';
        placeholders.push( html );
        return id;
    }

    function convertNestedTag( src, tagName, buildFn, placeholders, closeTag ) {
        if ( !closeTag ) closeTag = '[[' + '/' + tagName + ']]';
        var closeEscaped = closeTag.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );

        var re = new RegExp(
            '\\[\\[' + tagName + '(?:\\s+([^\\]]*))?\\]\\]' +
            '((?:(?!\\[\\[' + tagName + '\\b)[\\s\\S])*?)' +
            closeEscaped,
            'i'
        );

        var changed = true;
        while ( changed ) {
            changed = false;
            var m = src.match( re );
            if ( m ) {
                var replacement = buildFn( m[ 1 ] || '', m[ 2 ] );
                src = src.substring( 0, m.index ) +
                      ph( placeholders, replacement ) +
                      src.substring( m.index + m[ 0 ].length );
                changed = true;
            }
        }
        return src;
    }

    function extractDivAttrs( attrs ) {
        var result = '';
        if ( !attrs ) return result;

        var idMatch    = attrs.match( /\bid\s*=\s*"([^"]*)"/i );
        var classMatch = attrs.match( /\bclass\s*=\s*"([^"]*)"/i );
        var styleMatch = attrs.match( /\bstyle\s*=\s*"([^"]*)"/i );

        if ( idMatch && idMatch[ 1 ] ) {
            result += ' id="' + idMatch[ 1 ] + '"';
        }
        if ( classMatch && classMatch[ 1 ] ) {
            result += ' class="' + classMatch[ 1 ] + '"';
        }
        if ( styleMatch && styleMatch[ 1 ] ) {
            result += ' style="' + styleMatch[ 1 ] + '"';
        }
        return result;
    }

    /* ==========================================================
     * Wikitext -> Wikidot 反向转换
     * 用于：纯 MediaWiki 页面，或 WIKIDOT 注释已因 MediaWiki 编辑而过期
     * ========================================================== */
    function normalizeWikitextForCompare( text ) {
        return String( text )
            .replace( /\r\n?/g, '\n' )
            .replace( /[ \t]+$/gm, '' )
            .replace( /^\n+|\n+$/g, '' );
    }

    function convertWikitextToWikidot( wikitext ) {
        var placeholders = [];

        function P( text ) {
            var id = '\u0000RW' + placeholders.length + '\u0000';
            placeholders.push( text );
            return id;
        }

        function restore( text ) {
            var prev;
            do {
                prev = text;
                text = text.replace( /\u0000RW(\d+)\u0000/g, function ( m, i ) {
                    return placeholders[ parseInt( i, 10 ) ];
                } );
            } while ( text !== prev );
            return text;
        }

        var src = String( wikitext ).replace( /\r\n?/g, '\n' );

        /* 代码 / 数学 / nowiki / 脚本 / 注释：先保护，避免被后续规则改写 */
        src = src.replace(
            /<syntaxhighlight\b([^>]*)>([\s\S]*?)<\/syntaxhighlight>/gi,
            function ( m, attrs, code ) {
                var lang = '';
                var lm = attrs.match( /\blang\s*=\s*"([^"]*)"/i );
                if ( lm ) lang = lm[ 1 ];
                return P(
                    '[[code' + ( lang ? ' type="' + lang + '"' : '' ) +
                    ']]\n' + code.replace( /^\n|\n$/g, '' ) + '\n[[/code]]'
                );
            }
        );
        src = src.replace( /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, function ( m, code ) {
            return P( '[[code]]\n' + code.replace( /^\n|\n$/g, '' ) + '\n[[/code]]' );
        } );
        src = src.replace( /<math\b[^>]*>([\s\S]*?)<\/math>/gi, function ( m, body ) {
            return P( '[[math]]\n' + body.replace( /^\n|\n$/g, '' ) + '\n[[/math]]' );
        } );
        src = src.replace( /<nowiki\b[^>]*>([\s\S]*?)<\/nowiki>/gi, function ( m, body ) {
            return P( '@@' + body + '@@' );
        } );
        src = src.replace( /<script\b[^>]*>[\s\S]*?<\/script>/gi, function ( m ) {
            return P( m );
        } );
        src = src.replace( /<style\b[^>]*>[\s\S]*?<\/style>/gi, function ( m ) {
            return P( m );
        } );
        src = src.replace( /<!--([\s\S]*?)-->/g, function ( m, body ) {
            return P( '[!--' + body + '--]' );
        } );
        src = src.replace( /<code>([\s\S]*?)<\/code>/gi, function ( m, body ) {
            return P( '{{' + body + '}}' );
        } );

        /* 编辑器自动注入的包裹（代码等已先保护） */
        src = src.replace(
            /\{\{CSS\|User:QiuxiMeow\/代码\/wd适配\.css\}\}\n?/g,
            ''
        );
        src = src.replace( /\{\{NOSIDEBAR\}\}\n?/g, '' );

        /* #REDIRECT / #重定向 整行原样保留，避免被列表转换改写 */
        src = src.replace(
            /^(\s*#(?:REDIRECT|重定向)(?=\s|\[|$)[^\n]*)$/gim,
            function ( m ) {
                return P( '[[raw]]' + m + '[[/raw]]' );
            }
        );

        /* 模板 -> include；复杂/解析函数 -> raw */
        src = convertWikitextTemplates( src, P );

        /* 目录与双下划线魔术字 */
        src = src.replace( /__TOC__/g, function () {
            return P( '[[toc]]' );
        } );
        src = src.replace(
            /__(?:NOTOC|NOEDITSECTION|NOGALLERY|FORCETOC|NEWSECTIONLINK|NOCONTENTCONVERT|NOCC|NOTITLECONVERT|NOTC|INDEX|NOINDEX|STATICREDIRECT|DISAMBIG)__/g,
            function ( m ) {
                return P( '[[raw]]' + m + '[[/raw]]' );
            }
        );

        /* 图片 / 媒体链接先于普通内链 */
        src = src.replace(
            /\[\[(?:File|Image):([^\]\n]+)\]\]/gi,
            function ( m, body ) {
                var parts = body.split( '|' );
                var name = parts.shift().trim();
                var width = '';
                var alt = '';
                var complex = false;

                parts.forEach( function ( part ) {
                    part = part.trim();
                    if ( /^\d+(?:x\d+)?(?:px)?$/i.test( part ) ) {
                        width = part;
                    } else if ( /^alt\s*=/i.test( part ) ) {
                        alt = part.substring( part.indexOf( '=' ) + 1 ).trim();
                    } else if ( part ) {
                        complex = true;
                    }
                } );

                if ( !name || complex ) return P( m );

                var out = '[[image ' + name;
                if ( width ) out += ' width="' + width + '"';
                if ( alt ) out += ' alt="' + alt + '"';
                return P( out + ']]' );
            }
        );
        src = src.replace( /\[\[Media:([^\]\n]+)\]\]/gi, function ( m, body ) {
            var parts = body.split( '|' );
            var name = parts[ 0 ].trim();
            if ( !name ) return P( m );
            var label = parts.length > 1
                ? parts.slice( 1 ).join( '|' ).trim()
                : name;
            return P( '[[file ' + name + '|' + label + ']]' );
        } );

        /* 普通内链 */
        src = src.replace( /\[\[([^\[\]\n]+?)\]\]/g, function ( m, inner ) {
            /*
             * MediaWiki 的 [[#章节]] 与编辑器内部锚点语法冲突，
             * 用 raw 原样保留，避免保存时被转成 <span id>。
             */
            if ( inner.charAt( 0 ) === '#' ) {
                return P( '[[raw]][[' + inner + ']][[/raw]]' );
            }
            return '[[[' + inner + ']]]';
        } );

        /* 标题 */
        src = src.replace( /^(={1,6})\s*(.*?)\s*\1\s*$/gm, function ( m, eq, text ) {
            return new Array( eq.length + 1 ).join( '+' ) + ' ' + text;
        } );

        /* 脚注 */
        src = src.replace( /<ref\b([^>]*)>([\s\S]*?)<\/ref>/gi, function ( m, attrs, inner ) {
            if ( /\bname\s*=/.test( attrs ) ) return P( m );
            return P(
                '[[footnote]]' +
                convertWikitextToWikidot( inner ) +
                '[[/footnote]]'
            );
        } );
        src = src.replace( /<ref\b[^>]*\/>/gi, function () {
            return P( '[[footnote]][[/footnote]]' );
        } );
        src = src.replace( /<references\s*\/>/gi, function () {
            return P( '[[footnoteblock]]' );
        } );
        src = src.replace( /<references\s*>[\s\S]*?<\/references>/gi, function () {
            return P( '[[footnoteblock]]' );
        } );

        /* 居中 / 引用 */
        src = src.replace(
            /<div style="text-align:center">([\s\S]*?)<\/div>/gi,
            function ( m, inner ) {
                return P(
                    '[[=]]\n' +
                    convertWikitextToWikidot( inner ) +
                    '\n[[/=]]'
                );
            }
        );
        src = src.replace(
            /<blockquote class="wikidot-quote">([\s\S]*?)<\/blockquote>/gi,
            function ( m, inner ) {
                return P(
                    '[[>]]' +
                    convertWikitextToWikidot( inner ) +
                    '[[/>]]'
                );
            }
        );
        src = src.replace( /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, function ( m, inner ) {
            return inner.split( '\n' ).map( function ( line ) {
                return '> ' + line;
            } ).join( '\n' );
        } );

        /* 标签页 */
        src = convertWikitextTabber( src, P );

        /* 常见容器 / 行内样式 */
        src = convertWikitextDivs( src );
        src = convertWikitextSpans( src );

        /* 内联标签 */
        src = src.replace( /<br\s*\/?>/gi, '@@@@' );
        src = src.replace( /<strong>([\s\S]*?)<\/strong>/gi, '**$1**' );
        src = src.replace( /<b>([\s\S]*?)<\/b>/gi, '**$1**' );
        src = src.replace( /<em>([\s\S]*?)<\/em>/gi, '//$1//' );
        src = src.replace( /<i>([\s\S]*?)<\/i>/gi, '//$1//' );
        src = src.replace( /<u>([\s\S]*?)<\/u>/gi, '__$1__' );
        src = src.replace( /<s>([\s\S]*?)<\/s>/gi, '--$1--' );
        src = src.replace( /<sup>([\s\S]*?)<\/sup>/gi, '^^$1^^' );
        src = src.replace( /<sub>([\s\S]*?)<\/sub>/gi, ',,$1,,' );

        /* MediaWiki 粗体 / 斜体 */
        src = src.replace( /'''''([\s\S]*?)'''''/g, '//**$1**//' );
        src = src.replace( /'''([\s\S]*?)'''/g, '**$1**' );
        src = src.replace( /''([\s\S]*?)''/g, '//$1//' );

        return restore( src );
    }

    function convertWikitextTemplates( src, P ) {
        var out = '';
        var i = 0;

        while ( i < src.length ) {
            var start = src.indexOf( '{{', i );
            if ( start === -1 ) {
                out += src.slice( i );
                break;
            }

            out += src.slice( i, start );

            /* 三层大括号是模板参数，顶层出现时原样保留 */
            if ( src.charAt( start + 2 ) === '{' ) {
                var tripleEnd = src.indexOf( '}}}', start + 3 );
                if ( tripleEnd === -1 ) {
                    out += src.slice( start );
                    break;
                }
                out += P( '[[raw]]' + src.slice( start, tripleEnd + 3 ) + '[[/raw]]' );
                i = tripleEnd + 3;
                continue;
            }

            var end = findTemplateEnd( src, start );
            if ( end === -1 ) {
                out += src.slice( start );
                break;
            }

            out += convertOneTemplate( src.slice( start + 2, end - 2 ), P );
            i = end;
        }

        return out;
    }

    function findTemplateEnd( src, start ) {
        var depth = 0;

        for ( var i = start; i < src.length - 1; i++ ) {
            if ( src.charAt( i ) === '{' && src.charAt( i + 1 ) === '{' ) {
                depth++;
                i++;
            } else if ( src.charAt( i ) === '}' && src.charAt( i + 1 ) === '}' ) {
                depth--;
                i++;
                if ( depth === 0 ) return i + 1;
            }
        }

        return -1;
    }

    function convertOneTemplate( inner, P ) {
        var raw = '[[raw]]{{' + inner + '}}[[/raw]]';
        var trimmed = inner.trim();

        if ( !trimmed ||
             /\n/.test( inner ) ||
             /[{}]/.test( inner ) ||
             /\[\[|\]\]/.test( inner ) ||
             /^[#:]/.test( trimmed ) ) {
            return P( raw );
        }

        var parts = inner.split( '|' );
        var name = parts.shift().trim();
        if ( !name || /[=\[\]]/.test( name ) ) return P( raw );

        var args = [];
        for ( var i = 0; i < parts.length; i++ ) {
            var part = parts[ i ].trim();
            var eq = part.indexOf( '=' );

            if ( eq === -1 ) {
                args.push( ( i + 1 ) + '=' + part );
            } else {
                var key = part.substring( 0, eq ).trim();
                if ( !key ) return P( raw );
                args.push( key + '=' + part.substring( eq + 1 ).trim() );
            }
        }

        var canonical = REVERSE_INCLUDE_MAP[ name.toLowerCase() ];
        var moduleName = canonical || name;
        var include = '[[include ' +
            ( canonical ? ':component:' : 'component:' ) + moduleName;

        for ( var j = 0; j < args.length; j++ ) {
            include += '\n| ' + args[ j ];
        }
        include += ( args.length ? '\n]]' : ']]' );

        return P( include );
    }

    function convertWikitextTabber( src, P ) {
        return src.replace( /<tabber>([\s\S]*?)<\/tabber>/gi, function ( m, inner ) {
            var parts = inner.split( /\n\|\-\|/ );
            var tabs = [];

            for ( var i = 0; i < parts.length; i++ ) {
                var part = parts[ i ].replace( /^\n+|\n+$/g, '' );
                if ( !part ) continue;

                var eq = part.indexOf( '=' );
                if ( eq === -1 ) continue;

                var title = part.substring( 0, eq ).trim();
                var body = part.substring( eq + 1 ).replace( /^\n+|\n+$/g, '' );
                tabs.push(
                    '[[tab ' + title + ']]\n' +
                    convertWikitextToWikidot( body ) +
                    '\n[[/tab]]'
                );
            }

            if ( !tabs.length ) return P( m );

            return P( '[[tabview]]\n' + tabs.join( '\n' ) + '\n[[/tabview]]' );
        } );
    }

    function reverseDivAttrs( attrs ) {
        if ( !attrs || !attrs.trim() ) return '';

        var id = attrs.match( /\bid\s*=\s*"([^"]*)"/i );
        var cls = attrs.match( /\bclass\s*=\s*"([^"]*)"/i );
        var style = attrs.match( /\bstyle\s*=\s*"([^"]*)"/i );

        var rest = attrs
            .replace( /\bid\s*=\s*"[^"]*"/ig, '' )
            .replace( /\bclass\s*=\s*"[^"]*"/ig, '' )
            .replace( /\bstyle\s*=\s*"[^"]*"/ig, '' )
            .trim();

        if ( rest ) return null;

        var out = '';
        if ( id ) out += ' id="' + id[ 1 ] + '"';
        if ( cls ) out += ' class="' + cls[ 1 ] + '"';
        if ( style ) out += ' style="' + style[ 1 ] + '"';
        return out;
    }

    function convertWikitextDivs( src ) {
        var re = /<div([^>]*)>((?:(?!<div\b)[\s\S])*?)<\/div>/i;
        var guard = 0;

        while ( guard++ < 1000 ) {
            var changed = false;

            src = src.replace( re, function ( m, attrs, inner ) {
                var clean = reverseDivAttrs( attrs );
                if ( clean === null ) return m;
                changed = true;
                return '[[div' + clean + ']]' + inner + '[[/div]]';
            } );

            if ( !changed ) break;
        }

        return src;
    }

    function convertWikitextSpans( src ) {
        return src.replace( /<span([^>]*)>([\s\S]*?)<\/span>/gi, function ( m, attrs, inner ) {
            var id = attrs.match( /\bid\s*=\s*"([^"]*)"/i );
            if ( id && !inner.trim() &&
                 !attrs.replace( /\bid\s*=\s*"[^"]*"/i, '' ).trim() ) {
                return '[[#' + id[ 1 ] + ']]';
            }

            var styleMatch = attrs.match( /\bstyle\s*=\s*"([^"]*)"/i );
            if ( !styleMatch ) return m;

            var rest = attrs.replace( /\bstyle\s*=\s*"[^"]*"/ig, '' ).trim();
            if ( rest ) return m;

            var style = styleMatch[ 1 ].trim();
            var color = /^color\s*:\s*([^;]+)\s*;?$/i.exec( style );
            var size = /^font-size\s*:\s*([^;]+)\s*;?$/i.exec( style );

            if ( color ) {
                var c = color[ 1 ].trim().replace( /^#/, '' );
                return '##' + c + '|' + inner + '##';
            }
            if ( size ) {
                return '[[size ' + size[ 1 ].trim() + ']]' + inner + '[[/size]]';
            }

            return '[[span style="' + style + '"]]' + inner + '[[/span]]';
        } );
    }

    /* ==========================================================
     * Wikidot -> Wikitext 转换器
     * ========================================================== */
    function convertWikidotToWikitext( src, placeholders, isTopLevel ) {
        if ( !placeholders ) placeholders = [];
        if ( isTopLevel === undefined ) isTopLevel = true;

        function P( html ) { return ph( placeholders, html ); }

        /* 0. 代码块最先保护，内部内容不再参与后续语法转换 */
        src = convertNestedTag( src, 'code', function ( attrs, content ) {
            var lang = '';
            if ( attrs ) {
                var lm = attrs.match( /type\s*=\s*"([^"]+)"/i );
                if ( lm ) lang = lm[ 1 ];
            }
            content = content.replace( /^\n|\n$/g, '' );
            if ( lang ) {
                return '<syntaxhighlight lang="' + lang + '">\n' +
                       content + '\n</syntaxhighlight>';
            }
            return '<pre>' + content + '</pre>';
        }, placeholders );

        /* 0.1 raw 原样块：反向转换时用来保存无法映射的 Wikitext */
        src = convertNestedTag( src, 'raw', function ( attrs, content ) {
            return P( content );
        }, placeholders );

        /* 0.2 注释 [!-- 注释 --] -> <!-- 注释 --> */
        src = src.replace( /\[!--([\s\S]*?)--\]/g, function ( m, content ) {
            return P( '<!--' + content + '-->' );
        } );

        /* 0.2 include -> 模板调用 */
        src = processIncludes( src, P );

        /* 0.5 [[=image 站内文件]] -> [[File:文件]] */
        src = src.replace(
            /\[\[=image\s+([^\]]+)\]\]/gi,
            function ( m, attrs ) {
                var fnMatch = attrs.match( /^\s*(\S+)/ );
                var filename = fnMatch ? fnMatch[ 1 ] : '';
                var wMatch = attrs.match( /width\s*=\s*"([^"]*)"/i );
                var aMatch = attrs.match( /alt\s*=\s*"([^"]*)"/i );
                var result = '[[File:' + filename;
                if ( wMatch ) result += '|' + wMatch[ 1 ];
                if ( aMatch ) result += '|alt=' + aMatch[ 1 ];
                result += ']]';
                return result;
            }
        );

        /* 0.6 [[image ...]] */
        src = src.replace(
            /\[\[image\s+([^\]]+)\]\]/gi,
            function ( m, attrs ) {
                var fnMatch = attrs.match( /^\s*(\S+)/ );
                if ( !fnMatch ) return m;
                var first = fnMatch[ 1 ];

                if ( /^https?:\/\//i.test( first ) ) {
                    return P( '<nowiki>' + m + '</nowiki>' );
                }

                var wMatch = attrs.match( /width\s*=\s*"([^"]*)"/i );
                var aMatch = attrs.match( /alt\s*=\s*"([^"]*)"/i );
                var result = '[[File:' + first;
                if ( wMatch ) result += '|' + wMatch[ 1 ];
                if ( aMatch ) result += '|alt=' + aMatch[ 1 ];
                result += ']]';
                return result;
            }
        );

        /* 0.7 [[file 文件名]] -> [[Media:文件名|显示文字]] */
        src = src.replace(
            /\[\[file\s+([^\]]+)\]\]/gi,
            function ( m, body ) {
                var parts = body.split( '|' );
                var name = parts[ 0 ].trim();
                var label = parts.length > 1
                    ? parts.slice( 1 ).join( '|' ).trim()
                    : name;
                return '[[Media:' + name + '|' + label + ']]';
            }
        );

        /* 1. 保护 URL */
        src = src.replace( /https?:\/\/[^\s<>"'\]]+/gi, function ( m ) {
            return P( m );
        } );

        /* 3. @@@@ */
        src = src.replace( /@@@@/g, function () { return P( '<br />' ); } );

        /* 4. @@...@@ */
        src = src.replace( /@@([\s\S]*?)@@/g, function ( m, content ) {
            return P( '<nowiki>' + content + '</nowiki>' );
        } );

        /* 5. ---- */
        src = src.replace( /^----+\s*$/gm, function () { return P( '----' ); } );

        /* 6. 行首空格清理 */
        src = src.split( '\n' ).map( function ( l ) {
            return l.replace( /^ +/, '' );
        } ).join( '\n' );

        /* 7. [[module CSS]] -> {{CSS|content=...}} */
        src = src.replace(
            /\[\[module\s+CSS\]\]([\s\S]*?)\[\[\/module\]\]/gi,
            function ( m, css ) {
                css = css.replace( /^\n|\n$/g, '' );
                return P( '{{CSS|content=' + css + '\n}}' );
            }
        );

        /* 8. collapsible */
        src = convertNestedTag( src, 'collapsible', function ( attrs, content ) {
            var showMatch = attrs && attrs.match( /show\s*=\s*"([^"]*)"/i );
            var show = showMatch ? showMatch[ 1 ] : '展开';
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return '<div class="mw-collapsible mw-collapsed">' +
                   '<div class="mw-collapsible-toggle">' + show + '</div>' +
                   '<div class="mw-collapsible-content">' + inner + '</div>' +
                   '</div>';
        }, placeholders );

        /* 9. footnote */
        src = convertNestedTag( src, 'footnote', function ( attrs, content ) {
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return '<ref>' + inner + '</ref>';
        }, placeholders );

        /* 9.5 math -> <math> */
        src = convertNestedTag( src, 'math', function ( attrs, content ) {
            return '<math>' + content.replace( /^\n|\n$/g, '' ) + '</math>';
        }, placeholders );

        /* 10. div（保留 id/class/style） */
        src = convertNestedTag( src, 'div', function ( attrs, content ) {
            var attrStr = extractDivAttrs( attrs );
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return '<div' + attrStr + '>' + inner + '</div>';
        }, placeholders );

        /* 11. iftags */
        src = convertNestedTag( src, 'iftags', function ( attrs, content ) {
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return '<!-- iftags: ' + attrs + ' -->\n' +
                   inner + '\n<!-- /iftags -->';
        }, placeholders );

        /* 12. [[>]]...[[/>]] */
        src = convertNestedTag( src, '>', function ( attrs, content ) {
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return '<blockquote class="wikidot-quote">' + inner + '</blockquote>';
        }, placeholders, '[[/>]]' );

        /* 13. = text 居中 */
        src = src.replace( /^=\s*(.+)$/gm, function ( m, text ) {
            return P( '<div style="text-align:center">' ) +
                   text +
                   P( '</div>' );
        } );

        /* 14. 标题 */
        src = src.replace( /^(\+{1,6})\s+(.*)$/gm, function ( m, plus, text ) {
            var level = plus.length;
            if ( level > 6 ) level = 6;
            var eq = new Array( level + 1 ).join( '=' );
            return eq + ' ' + text + ' ' + eq;
        } );

        /* 15. ===== */
        src = src.replace( /^=====+\s*$/gm, function () { return P( '----' ); } );

        /* 16. tabview */
        src = src.replace(
            /\[\[tabview\]\]([\s\S]*?)\[\[\/tabview\]\]/gi,
            function ( m, content ) {
                var tabs = [];
                var tabRe = /\[\[tab\s+([^\]]+)\]\]([\s\S]*?)\[\[\/tab\]\]/gi;
                var tm;
                while ( ( tm = tabRe.exec( content ) ) !== null ) {
                    var title = tm[ 1 ].trim();
                    var body = convertWikidotToWikitext(
                        tm[ 2 ], placeholders, false
                    );
                    tabs.push( '|-|' + title + '=\n' + body );
                }
                return P( '<tabber>\n' + tabs.join( '\n' ) + '\n</tabber>' );
            }
        );

        /* 17. [[=]] / [[/=]] */
        src = src.replace( /\[\[=\]\]/g, function () {
            return P( '<div style="text-align:center">' );
        } );
        src = src.replace( /\[\[\/=\]\]/g, function () {
            return P( '</div>' );
        } );

        /* 18. toc / NOSIDEBAR */
        if ( isTopLevel ) {
            var hasToc = /\[\[toc\]\]/i.test( src );
            if ( hasToc ) {
                src = src.replace( /\[\[toc\]\]/gi, function () {
                    return P( TOC_MAGIC );
                } );
            } else {
                src = P( '{{' + NOSIDEBAR_TEMPLATE + '}}' ) + '\n' + src;
            }
        }

        /* 19. footnoteblock */
        src = src.replace( /\[\[footnoteblock\]\]/gi, '<references/>' );

        /* 20. 引用 > */
        src = src.replace( /^((?:>.*\n?)+)/gm, function ( m ) {
            var lines = m.replace( /\n$/, '' ).split( '\n' );
            var content = lines.map( function ( l ) {
                return l.replace( /^>\s?/, '' );
            } ).join( '\n' );
            var inner = convertWikidotToWikitext( content, placeholders, false );
            return P( '<blockquote>' + inner + '</blockquote>' );
        } );

        /* 20.5 [#anchor text] / [#anchor] */
        src = src.replace(
            /\[#([^\s\]]+)\s+([^\]]+)\]/g,
            function ( m, anchor, text ) {
                var cleanAnchor = anchor.replace( /^u-/, '' );
                return P( '[[#' + cleanAnchor + '|' + text + ']]' );
            }
        );
        src = src.replace( /\[#([^\s\]]+)\]/g, function ( m, anchor ) {
            var cleanAnchor = anchor.replace( /^u-/, '' );
            return P( '[[#' + cleanAnchor + ']]' );
        } );

        /* 20.8 颜色（须早于列表，避免行首 ## 被当作有序列表） */
        src = src.replace(
            /##([^|#\n]+)\|([^\n]*?)##/g,
            function ( m, color, text ) {
                color = color.trim();
                if ( /^(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test( color ) ) {
                    color = '#' + color;
                }
                return '<span style="color:' + color + '">' + text + '</span>';
            }
        );

        /* 21. 列表 */
        src = convertLists( src );

        /* 22. 表格 */
        src = convertTables( src );

        /* 23. span */
        src = src.replace(
            /\[\[span\s+style\s*=\s*"([^"]*)"\]\]([\s\S]*?)\[\[\/span\]\]/gi,
            '<span style="$1">$2</span>'
        );

        /* 24. size */
        src = src.replace(
            /\[\[size\s+([^\]]+)\]\]([\s\S]*?)\[\[\/size\]\]/gi,
            '<span style="font-size:$1">$2</span>'
        );

        /* 25. [[[page]]] */
        src = src.replace( /\[\[\[([^\]|]+)\|([^\]]+)\]\]\]/g, '[[$1|$2]]' );
        src = src.replace( /\[\[\[([^\]|]+)\]\]\]/g, '[[$1]]' );

        /* 27. user */
        src = src.replace(
            /\[\[\*user\s+([^\]]+)\]\]/gi,
            function ( m, name ) {
                name = name.trim();
                return '[[User:' + name + '|' + name + ']]';
            }
        );
        src = src.replace(
            /\[\[user\s+\*?\s*([^\]]+)\]\]/gi,
            function ( m, name ) {
                name = name.trim();
                return '[[User:' + name + '|' + name + ']]';
            }
        );

        /* 28. [[# anchor]] */
        src = src.replace( /\[\[#\s*([^\]|]+)\]\]/gi, function ( m, name ) {
            return P( '<span id="' + name.trim() + '"></span>' );
        } );

        /* 29. 无效单方括号 */
        src = src.replace(
            /(^|[^\[])\[([^\[\]\n]+?)\](?!\])/g,
            function ( m, pre, inner ) {
                if ( /^https?:\/\//i.test( inner.trim() ) ) return m;
                return pre + inner;
            }
        );

        /* 30. 未闭合标签保护 */
        src = protectStrayTags( src, placeholders );

        /* 31. 3+ 波浪线 */
        src = src.replace( /~{3,}/g, function ( m ) {
            return P( '<nowiki>' + m + '</nowiki>' );
        } );

        /* 32. 行内格式 */
        src = src.replace( /\/\/\*\*([^\n]+?)\*\*\/\//g, "'''''$1'''''" );
        src = src.replace( /\*\*([^\n]+?)\*\*/g, "'''$1'''" );
        src = src.replace( /\/\/([^\n]+?)\/\//g, "''$1''" );
        src = src.replace( /__([^\n]+?)__/g, '<u>$1</u>' );
        src = src.replace( /--([^\n]+?)--/g, '<s>$1</s>' );
        src = src.replace( /\^\^([^\n]+?)\^\^/g, '<sup>$1</sup>' );
        src = src.replace( /,,([^\n]+?),,/g, '<sub>$1</sub>' );
        src = src.replace( /\{\{([^\n]+?)\}\}/g, '<code>$1</code>' );

        return src;
    }

    function protectStrayTags( src, placeholders ) {
        function P( m ) {
            return ph( placeholders, '<nowiki>' + m + '</nowiki>' );
        }

        var PAIRED = [
            'code', 'collapsible', 'footnote', 'div', 'iftags',
            'span', 'size', 'tabview', 'tab', 'raw'
        ];
        var pairedRe = new RegExp(
            '\\[\\[\\/?(?:' + PAIRED.join( '|' ) + ')(?:\\s+[^\\]]*)?\\]\\]',
            'gi'
        );
        src = src.replace( pairedRe, P );

        src = src.replace( /\[\[module\s+CSS(?:\s+[^\]]*)?\]\]/gi, P );
        src = src.replace( /\[\[module\s+[^\]]*\]\]/gi, P );
        src = src.replace( /\[\[\/module\]\]/gi, P );
        src = src.replace( /\[\[(?:toc|footnoteblock)\]\]/gi, P );
        src = src.replace( /\[\[include\b[^\]]*?\]\]/gi, P );
        src = src.replace( /\[\[\/?=\]\]/g, P );
        src = src.replace( /\[\[=image[^\]]*\]\]/gi, P );
        src = src.replace( /\[\[\/?>\]\]/g, P );

        return src;
    }

    function processIncludes( src, P ) {
        return src.replace(
            /\[\[include\s+([^\]]+?)\]\]/gi,
            function ( m, body ) {
                var lines = body.split( '\n' );
                var firstLine = lines[ 0 ].trim();
                var pipeIdx = firstLine.indexOf( '|' );
                var moduleName, firstRest;
                if ( pipeIdx === -1 ) {
                    moduleName = firstLine;
                    firstRest = '';
                } else {
                    moduleName = firstLine.substring( 0, pipeIdx ).trim();
                    firstRest = firstLine.substring( pipeIdx );
                }

                var args = [];
                if ( firstRest ) parseArgs( firstRest, args );
                for ( var i = 1; i < lines.length; i++ ) {
                    parseArgs( lines[ i ], args );
                }

                var tmplName = mapIncludeName( moduleName );
                var params = args.map( function ( kv ) {
                    return kv[ 0 ] + '=' + cleanArgValue( kv[ 1 ] );
                } ).join( '|' );

                return P( '{{' + tmplName +
                          ( params ? '|' + params : '' ) + '}}' );
            }
        );
    }

    function parseArgs( line, out ) {
        line = line.trim();
        if ( !line ) return;
        if ( line.charAt( 0 ) === '|' ) line = line.substring( 1 ).trim();
        if ( !line ) return;
        var eq = line.indexOf( '=' );
        if ( eq === -1 ) return;
        out.push( [ line.substring( 0, eq ).trim(),
                    line.substring( eq + 1 ).trim() ] );
    }

    function normalizeModuleName( raw ) {
        var n = String( raw ).trim();
        n = n.replace( /^:[^:]+:/, '' );
        n = n.replace( /^component[:\-]/i, '' );
        return n;
    }

    function mapIncludeName( raw ) {
        var n = normalizeModuleName( raw );
        // 仅查找键转小写，返回名保留原始大小写（XLCS 不应变成 Xlcs）
        var key = n.toLowerCase();
        if ( INCLUDE_MAP[ key ] ) return INCLUDE_MAP[ key ];
        return n.replace( /-/g, ' ' ).replace( /\b\w/g, function ( c ) {
            return c.toUpperCase();
        } );
    }

    function cleanArgValue( v ) {
        return v.replace( /\[([^\[\]\n]+?)\]/g, function ( m, inner ) {
            if ( /^https?:\/\//i.test( inner.trim() ) ) return m;
            return inner;
        } );
    }

    function convertLists( text ) {
        var lines = text.split( '\n' );
        var result = [];
        var i = 0;

        var itemRe = /^([ \t]*)([#*])(?!\*)\s*(.*)$/;

        while ( i < lines.length ) {
            var m = lines[ i ].match( itemRe );
            if ( !m ) {
                result.push( lines[ i ] );
                i++;
                continue;
            }

            var items = [];
            while ( i < lines.length ) {
                var lm = lines[ i ].match( itemRe );
                if ( !lm ) break;
                var indentStr = lm[ 1 ].replace( /\t/g, '  ' );
                items.push( {
                    indent: indentStr.length,
                    marker: lm[ 2 ],
                    content: lm[ 3 ]
                } );
                i++;
            }

            var minIndent = Math.min.apply( null, items.map( function ( x ) {
                return x.indent;
            } ) );

            var stack = [];
            items.forEach( function ( item ) {
                var depth = Math.floor( ( item.indent - minIndent ) / 2 );
                if ( depth < 0 ) depth = 0;
                stack = stack.slice( 0, depth );
                stack[ depth ] = item.marker;
                result.push( stack.join( '' ) + ' ' + item.content );
            } );
        }

        return result.join( '\n' );
    }

    function convertTables( text ) {
        var lines = text.split( '\n' );
        var result = [];
        var i = 0;

        while ( i < lines.length ) {
            if ( !/^\s*\|\|/.test( lines[ i ] ) ) {
                result.push( lines[ i ] );
                i++;
                continue;
            }

            var tableLines = [];
            while ( i < lines.length && /^\s*\|\|/.test( lines[ i ] ) ) {
                tableLines.push( lines[ i ] );
                i++;
            }

            result.push( '{| class="wikitable"' );

            tableLines.forEach( function ( tl ) {
                var inner = tl.trim()
                    .replace( /^\|\|/, '' )
                    .replace( /\|\|\s*$/, '' );
                var cells = inner.split( '||' ).map( function ( c ) {
                    return c.trim();
                } );
                var allHeader = cells.every( function ( c ) {
                    return /^~/.test( c );
                } );

                if ( allHeader ) {
                    var headers = cells.map( function ( c ) {
                        return c.replace( /^~\s*/, '' );
                    } );
                    result.push( '! ' + headers.join( ' !! ' ) );
                } else {
                    var data = cells.map( function ( c ) {
                        return c.replace( /^~\s*/, '' );
                    } );
                    result.push( '|-' );
                    result.push( '| ' + data.join( ' || ' ) );
                }
            } );

            result.push( '|}' );
        }

        return result.join( '\n' );
    }

    function restorePlaceholders( text, placeholders ) {
        var prev;
        do {
            prev = text;
            text = text.replace( /\u0000PH(\d+)\u0000/g, function ( m, i ) {
                return placeholders[ parseInt( i, 10 ) ];
            } );
        } while ( text !== prev );
        return text;
    }

    /* ==========================================================
     * 启动
     * ========================================================== */
    initWikidotEditor();
}() );

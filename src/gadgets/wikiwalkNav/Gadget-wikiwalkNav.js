/* global mw, CustomEvent */
/**
 * WikiWalk 页脚导航小工具
 * 适用：MediaWiki 1.46+（Vector / Vector 2022 / Minerva 等）
 *
 * 支持页面命名（空格 / _ / %20 均可作分隔）：
 *   1. Level 123              → 前后 Level 122 / Level 124
 *   2. Level 123 CN 456       → 前后 Level 123 CN 455 / Level 123 CN 457
 *   3. Entity CN 1            → 前后 Entity CN 0 / Entity CN 2
 *
 * 其它命名一律不注入；子页面（含 "/"）不注入；
 * 页面里存在 .wikiwalk-off / .no-wikiwalk / .wikiwalk-disabled 也不注入。
 */
(function () {
    'use strict';

    function start() {
        /* 防止重复加载 */
        if (window.wikiwalkNav && window.wikiwalkNav.__loaded) {
            return;
        }

        var API = (window.wikiwalkNav = window.wikiwalkNav || {});
        API.__loaded = true;

        /* ============================================================
         *  配置
         * ============================================================ */
        API.config = {
            /* 允许的前缀 */
            prefixes: ['Level', 'Object', 'Entity', 'Phenomenon'],

            /* 是子页面（标题含 "/"）时不注入 */
            skipSubpages: true,

            /* 页面里存在这些类名任一，则不注入 */
            offClasses: ['.wikiwalk-off', '.no-wikiwalk', '.wikiwalk-disabled'],

            /* 边距（可自行调整） */
            marginTop: '0.5em',     /* 一小点上边距 */
            marginBottom: '3em'     /* 一大点下边距 */
        };

        /* 脚本级开关 */
        API.disabled = false;
        API.disable = function () { API.disabled = true; };
        API.enable = function () { API.disabled = false; };

        /* ============================================================
         *  hover 样式注入（幂等）
         * ============================================================ */
        function injectHoverStyle() {
            if (document.getElementById('wikiwalk-nav-style')) {
                return;
            }
            var s = document.createElement('style');
            s.id = 'wikiwalk-nav-style';
            s.textContent = [
                '.footer-wikiwalk-nav a { transition: 0.5s; text-decoration: none; }',
                '.footer-wikiwalk-nav a:hover { font-size: 150%; color: #ff6d6d; }'
            ].join('\n');
            document.head.appendChild(s);
        }

        /* ============================================================
         *  正则构造
         * ============================================================ */
        var SEP = '(?:[ _]|%20)';
        var PREFIX = '(?:' + API.config.prefixes.map(function (p) {
            return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|') + ')';

        var PATTERNS = [
            /* Level 123 CN 456  →  改最后的 456 */
            {
                re: new RegExp('^(' + PREFIX + ')' + SEP + '(\\d+)' + SEP + 'CN' + SEP + '(\\d+)$'),
                build: function (m, delta) {
                    var n = shiftNum(m[3], delta);
                    if (n === null) { return null; }
                    return m[1] + ' ' + m[2] + ' CN ' + n;
                }
            },
            /* Entity CN 1  →  改最后的 1 */
            {
                re: new RegExp('^(' + PREFIX + ')' + SEP + 'CN' + SEP + '(\\d+)$'),
                build: function (m, delta) {
                    var n = shiftNum(m[2], delta);
                    if (n === null) { return null; }
                    return m[1] + ' CN ' + n;
                }
            },
            /* Level 123  →  改 123 */
            {
                re: new RegExp('^(' + PREFIX + ')' + SEP + '(\\d+)$'),
                build: function (m, delta) {
                    var n = shiftNum(m[2], delta);
                    if (n === null) { return null; }
                    return m[1] + ' ' + n;
                }
            }
        ];

        function shiftNum(str, delta) {
            var n = parseInt(str, 10);
            if (isNaN(n)) { return null; }
            n += delta;
            if (n < 0) { return null; }
            var out = String(n);
            if (/^0\d/.test(str)) {
                while (out.length < str.length) { out = '0' + out; }
            }
            return out;
        }

        function buildTitles(pageTitle) {
            for (var i = 0; i < PATTERNS.length; i++) {
                var m = PATTERNS[i].re.exec(pageTitle);
                if (m) {
                    return {
                        prev: PATTERNS[i].build(m, -1),
                        next: PATTERNS[i].build(m, +1)
                    };
                }
            }
            return null;
        }

        /* ============================================================
         *  链接地址
         * ============================================================ */
        function getUrl(title) {
            try {
                if (mw.util && typeof mw.util.getUrl === 'function') {
                    return mw.util.getUrl(title);
                }
            } catch (e) { /* 忽略 */ }
            var path = mw.config.get('wgArticlePath') || '/wiki/$1';
            return path.replace('$1', encodeURIComponent(title.replace(/ /g, '_')));
        }

        /* ============================================================
         *  DOM 构建
         * ============================================================ */
        function makeAnchor(title) {
            var a = document.createElement('a');
            a.href = getUrl(title);
            a.title = title;
            a.textContent = title;
            return a;
        }

        function buildNav(pageTitle, prevTitle, nextTitle) {
            var wrapper = document.createElement('div');
            wrapper.className = 'footer-wikiwalk-wrapper';
            wrapper.style.cssText = [
                'clear:both',
                'margin-top:' + API.config.marginTop,
                'margin-bottom:' + API.config.marginBottom,
                'height:2em',
                'display:flex',
                'justify-content:space-evenly',
                'align-content:center',
                'flex-direction:column-reverse'
            ].join(';') + ';';

            var nav = document.createElement('div');
            nav.className = 'footer-wikiwalk-nav';
            nav.style.cssText = 'font-weight:bold;font-size:80%;';

            var center = document.createElement('center');
            center.appendChild(document.createTextNode('<< '));
            if (prevTitle) { center.appendChild(makeAnchor(prevTitle)); }
            center.appendChild(document.createTextNode(' | '));
            center.appendChild(document.createTextNode(pageTitle));
            center.appendChild(document.createTextNode(' | '));
            if (nextTitle) { center.appendChild(makeAnchor(nextTitle)); }
            center.appendChild(document.createTextNode(' >>'));

            nav.appendChild(center);
            wrapper.appendChild(nav);
            return wrapper;
        }

        /* ============================================================
         *  注入位置 / 关闭检测
         * ============================================================ */
        function getContentRoot() {
            return document.querySelector('#mw-content-text .mw-parser-output')
                || document.querySelector('#mw-content-text')
                || document.querySelector('#bodyContent')
                || null;
        }

        function hasOffMarker() {
            try {
                return !!document.querySelector(API.config.offClasses.join(', '));
            } catch (e) {
                return false;
            }
        }

        /* ============================================================
         *  执行
         * ============================================================ */
        function init() {
            if (API.disabled) { return; }
            if (hasOffMarker()) { return; }

            var isArticle = mw.config.get('wgIsArticle');
            if (isArticle !== undefined && isArticle !== true) { return; }

            var root = getContentRoot();
            if (!root) { return; }

            if (document.querySelector('.footer-wikiwalk-wrapper')) { return; }

            var raw = mw.config.get('wgPageName')
                || mw.config.get('wgTitle')
                || '';
            var pageTitle = raw.replace(/_/g, ' ');

            if (API.config.skipSubpages && raw.indexOf('/') !== -1) { return; }

            var titles = buildTitles(pageTitle);
            if (!titles) { return; }

            injectHoverStyle();

            var node = buildNav(pageTitle, titles.prev, titles.next);

            /* 事件级取消钩子 */
            var ev = new CustomEvent('wikiwalk:before-inject', {
                cancelable: true,
                detail: {
                    pageTitle: pageTitle,
                    prev: titles.prev,
                    next: titles.next,
                    node: node,
                    config: API.config
                }
            });

            if (!document.dispatchEvent(ev) || API.disabled) { return; }

            root.appendChild(node);
        }

        init();
    }

    /* ============================================================
     *  启动（等 DOM 就绪）
     * ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
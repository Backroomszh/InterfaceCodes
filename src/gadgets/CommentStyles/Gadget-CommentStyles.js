/* ============================================================
 * CommentStyles —— 用户专属评论样式管理器
 * 与 StaffComment 互斥：有站务样式的评论不套用个人专属样式
 * 页面加载时自动把 MediaWiki:CommentStyles.css 内联到元素上
 * 失败时静默处理
 * ============================================================ */
(function () {
    'use strict';

    var CONFIG_PAGE = 'MediaWiki:CommentStyles.json';
    var CSS_PAGE    = 'MediaWiki:CommentStyles.css';
    var STAFF_CLASS = 'staff-mode-comment';   // 站务样式类名，互斥用
    var INLINE_ATTR = 'data-cs-inline-props'; // 记录被内联的属性，便于清理

    var configCache = null;
    var cssCache    = null;

    /* ---------- 通用：抓取 wiki 页面原始内容 ---------- */
    function fetchRaw(page) {
        var url = mw.config.get('wgScriptPath') + '/index.php?title=' +
                  encodeURIComponent(page) + '&action=raw';
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.text(); });
    }

    /* ---------- 加载 JSON 配置 ---------- */
    function loadConfig() {
        if (configCache) return Promise.resolve(configCache);
        return fetchRaw(CONFIG_PAGE)
            .then(function (text) {
                try {
                    configCache = JSON.parse(text);
                } catch (e) {
                    configCache = { users: {} };
                }
                return configCache;
            })
            .catch(function () {
                configCache = { users: {} };
                return configCache;
            });
    }

    /* ---------- 加载并解析 CSS ---------- */
    function loadCss() {
        if (cssCache) return Promise.resolve(cssCache);
        return fetchRaw(CSS_PAGE)
            .then(function (text) {
                cssCache = { text: text || '', rules: parseCssRules(text || '') };
                return cssCache;
            })
            .catch(function () {
                cssCache = { text: '', rules: [] };
                return cssCache;
            });
    }

    /* 用「离线文档」解析 CSS，避免规则直接生效 */
    function parseCssRules(text) {
        var out = [];
        if (!text) return out;
        try {
            var doc   = document.implementation.createHTMLDocument('');
            var style = doc.createElement('style');
            style.textContent = text;
            doc.head.appendChild(style);
            if (style.sheet) collectRules(style.sheet.cssRules, out, false);
        } catch (e) { /* 静默失败 */ }
        return out;
    }

    function collectRules(list, out, inMedia) {
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (r.type === 1) {                        // 普通样式规则
                // @media 内的规则无法内联（内联没有媒体条件），跳过
                if (!inMedia && r.style && r.style.length) {
                    out.push({ selector: r.selectorText, style: r.style });
                }
            } else if (r.type === 4 && r.cssRules) {   // @media
                collectRules(r.cssRules, out, true);
            }
        }
    }

    /* ---------- 把整段 CSS 注入页面（主要给 ::before / ::after 用） ---------- */
    function injectCss(text) {
        if (!text) return;
        if (document.getElementById('comment-styles-css')) return;
        var style = document.createElement('style');
        style.id = 'comment-styles-css';
        style.textContent = text;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ---------- 伪类 / 伪元素选择器没法内联，跳过 ---------- */
    var SKIP_SELECTOR = /::|:(?:hover|active|focus|focus-within|focus-visible|visited|target|checked|disabled|enabled|required|optional|valid|invalid|placeholder-shown|default|indeterminate|in-range|out-of-range|read-only|read-write)\b/i;

    /* ---------- 核心：把匹配到的 CSS 规则写成元素的内联样式 ---------- */
    function applyInlineCss(rules) {
        if (!rules || !rules.length) return;

        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (SKIP_SELECTOR.test(rule.selector)) continue;

            var nodes;
            try {
                nodes = document.querySelectorAll(rule.selector);
            } catch (e) {
                continue;              // 选择器不合法，跳过
            }

            for (var n = 0; n < nodes.length; n++) {
                inlineNode(nodes[n], rule.style);
            }
        }
    }

    /* 把一条规则的所有声明写进元素 style，保留 !important */
    function inlineNode(el, style) {
        var props   = (el.getAttribute(INLINE_ATTR) || '').split('|');
        var changed = false;

        for (var i = 0; i < style.length; i++) {
            var prop = style.item(i);
            var val  = style.getPropertyValue(prop);
            if (!val) continue;

            el.style.setProperty(prop, val, style.getPropertyPriority(prop));

            if (props.indexOf(prop) === -1) {
                props.push(prop);
                changed = true;
            }
        }

        if (changed) {
            el.setAttribute(INLINE_ATTR, props.filter(Boolean).join('|'));
        }
    }

    /* ---------- 清理内联样式（互斥时回滚） ---------- */
    function clearInline(el) {
        var raw = el.getAttribute(INLINE_ATTR);
        if (!raw) return;
        raw.split('|').forEach(function (p) {
            if (p) el.style.removeProperty(p);
        });
        el.removeAttribute(INLINE_ATTR);
    }

    function clearInlineTree(root) {
        if (!root) return;
        if (root.hasAttribute && root.hasAttribute(INLINE_ATTR)) clearInline(root);
        if (!root.querySelectorAll) return;
        var list = root.querySelectorAll('[' + INLINE_ATTR + ']');
        for (var i = 0; i < list.length; i++) clearInline(list[i]);
    }

    /* ---------- 给评论套上对应 class ---------- */
    function applyStyles(config) {
        if (!config || !config.users) return;

        document.querySelectorAll('.cs-comment').forEach(function (comment) {

            // 互斥：已有站务样式 → 移除个人专属样式 + 清掉内联样式
            if (comment.classList.contains(STAFF_CLASS)) {
                if (comment.dataset.csClass) {
                    comment.classList.remove(comment.dataset.csClass);
                    delete comment.dataset.csClass;
                }
                clearInlineTree(comment);
                return;
            }

            if (comment.dataset.csStyled) return;

            var link = comment.querySelector('.cs-comment-author a');
            if (!link) return;

            var m = (link.getAttribute('href') || '').match(/\/User:([^\/]+)/);
            if (!m) return;

            var name;
            try {
                name = decodeURIComponent(m[1]);
            } catch (e) {
                name = m[1];
            }

            var cfg = config.users[name];
            if (cfg && cfg.enabled !== false && cfg.class) {
                comment.classList.add(cfg.class);
                comment.dataset.csClass = cfg.class;   // 记录，便于互斥时移除
                comment.dataset.csUser = name;
            }
            comment.dataset.csStyled = '1';
        });
    }

    /* ---------- 一次完整的刷新：类名 + 内联样式 ---------- */
    function refresh(config, rules) {
        applyStyles(config);
        applyInlineCss(rules);
    }

    /* ---------- 监听 body（childList + class 变化 + 防抖） ---------- */
    function observePage(fn) {
        var timer = null;
        function debounced() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(fn, 200);
        }

        try {
            new MutationObserver(debounced).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,                    // 监听 class 变化
                attributeFilter: ['class']           // 只关心 class 属性
            });
        } catch (e) { /* 静默失败 */ }
    }

    /* ---------- 渲染管理界面 ---------- */
    function renderManager(container, config) {
        var users = config.users || {};
        var names = Object.keys(users);
        var editUrl = mw.util.getUrl(CONFIG_PAGE, { action: 'edit' });

        var html = '<div style="border:2px solid #FFC9C9;border-radius:16px;' +
            'padding:16px;background:#fff8fb;margin:16px 0;">';

        html += '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:12px;">';
        html += '<b style="font-size:18px;color:#FF69B4;">🌸 评论样式管理</b>';
        html += '<a href="' + editUrl + '" style="background:#FFB6C1;color:#fff;' +
            'padding:6px 14px;border-radius:20px;text-decoration:none;">编辑配置</a>';
        html += '</div>';

        if (!names.length) {
            html += '<div style="color:#999;">还没有任何用户配置，点右上角「编辑配置」添加。</div>';
        } else {
            html += '<table style="width:100%;border-collapse:collapse;font-size:14px;">';
            html += '<tr style="background:#FFC9C9;color:#fff;">' +
                    '<th style="padding:8px;">用户名</th>' +
                    '<th style="padding:8px;">标签</th>' +
                    '<th style="padding:8px;">Class</th>' +
                    '<th style="padding:8px;">状态</th>' +
                    '<th style="padding:8px;">预览</th></tr>';

            names.forEach(function (name) {
                var u = users[name];
                var on = u.enabled !== false;
                html += '<tr style="border-bottom:1px solid #FFEBF0;">' +
                    '<td style="padding:8px;"><a href="' +
                        mw.util.getUrl('User:' + name) + '">' + name + '</a></td>' +
                    '<td style="padding:8px;">' + (u.label || '-') + '</td>' +
                    '<td style="padding:8px;"><code>' + (u.class || '-') + '</code></td>' +
                    '<td style="padding:8px;">' + (on ? '✅ 启用' : '❌ 禁用') + '</td>' +
                    '<td style="padding:8px;"><div class="cs-comment ' +
                        (u.class || '') + '" style="pointer-events:none;padding:10px;' +
                        'font-size:12px;">样式预览</div></td>' +
                    '</tr>';
            });
            html += '</table>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    /* ---------- 初始化 ---------- */
    function init() {
        try {
            Promise.all([loadConfig(), loadCss()]).then(function (res) {
                var config = res[0];
                var css    = res[1];

                try {
                    injectCss(css.text);              // 伪元素 / 兜底
                    refresh(config, css.rules);       // 内联样式

                    observePage(function () {
                        refresh(config, css.rules);
                    });

                    var mgr = document.getElementById('comment-style-manager');
                    if (mgr) renderManager(mgr, config);
                } catch (e) { /* 静默失败 */ }
            });
        } catch (e) { /* 静默失败 */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

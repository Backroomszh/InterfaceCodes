/* ============================================================
 * CommentStyles —— 用户专属评论样式管理器
 * 监听 body（只监听 childList + 防抖）
 * 失败时静默处理
 * ============================================================ */
(function () {
    'use strict';

    var CONFIG_PAGE = 'MediaWiki:CommentStyles.json';
    var configCache = null;

    /* ---------- 加载 JSON 配置 ---------- */
    function loadConfig() {
        if (configCache) return Promise.resolve(configCache);
        var url = mw.config.get('wgScriptPath') + '/index.php?title=' +
                  encodeURIComponent(CONFIG_PAGE) + '&action=raw';
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.text(); })
            .then(function (text) {
                try {
                    configCache = JSON.parse(text);
                    return configCache;
                } catch (e) {
                    configCache = { users: {} };
                    return configCache;
                }
            })
            .catch(function () {
                configCache = { users: {} };
                return configCache;
            });
    }

    /* ---------- 给评论套上对应 class ---------- */
    function applyStyles(config) {
        if (!config || !config.users) return;

        document.querySelectorAll('.cs-comment').forEach(function (comment) {
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
                comment.dataset.csUser = name;
            }
            comment.dataset.csStyled = '1';
        });
    }

    /* ---------- 监听 body（只监听 childList + 防抖） ---------- */
    function observePage(fn) {
        var timer = null;
        function debounced() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(fn, 200);
        }

        try {
            new MutationObserver(debounced).observe(document.body, {
                childList: true,
                subtree: true
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
            loadConfig().then(function (config) {
                try {
                    // 初次执行
                    applyStyles(config);

                    // 监听 body，任何 DOM 变化都会触发（防抖后）
                    observePage(function () { applyStyles(config); });

                    // 渲染管理界面
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

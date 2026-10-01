/* ============================================================
 * StaffComment —— 站务专属工作评论样式
 * 监听 body（只监听 childList + 防抖）
 * 触发方式：评论中含 .staff-trigger 元素（由 {{站务工作}} 模板输出）
 * 失败时静默处理
 * ============================================================ */
(function () {
    'use strict';

    var STAFF_PAGE = 'MediaWiki:StaffList.json';
    var STAFF_CLASS = 'staff-mode-comment';
    var staffCache = null;

    /* ---------- 加载站务名单 ---------- */
    function loadStaff() {
        if (staffCache) return Promise.resolve(staffCache);
        var url = mw.config.get('wgScriptPath') + '/index.php?title=' +
                  encodeURIComponent(STAFF_PAGE) + '&action=raw';
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.text(); })
            .then(function (text) {
                try {
                    staffCache = JSON.parse(text);
                    return staffCache;
                } catch (e) {
                    staffCache = { staff: [] };
                    return staffCache;
                }
            })
            .catch(function () {
                staffCache = { staff: [] };
                return staffCache;
            });
    }

    /* ---------- 给站务的工作评论套上专属类 ---------- */
    function applyStaffStyles(config) {
        if (!config || !config.staff) return;

        var staffSet = {};
        config.staff.forEach(function (name) { staffSet[name] = true; });

        document.querySelectorAll('.cs-comment').forEach(function (comment) {
            if (comment.dataset.staffStyled) return;

            var link = comment.querySelector('.cs-comment-author a');
            if (!link) return;

            var m = (link.getAttribute('href') || '').match(/\/User:([^\/]+)/);
            if (!m) return;

            var name;
            try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; }

            // 非站务成员跳过
            if (!staffSet[name]) {
                comment.dataset.staffStyled = '1';
                return;
            }

            var body = comment.querySelector('.cs-comment-body');
            if (!body) return;

            // 检查是否含 .staff-trigger 元素
            if (body.querySelector('.staff-trigger')) {
                comment.classList.add(STAFF_CLASS);
                comment.dataset.staffUser = name;
            }
            comment.dataset.staffStyled = '1';
        });
    }

    /* ---------- 监听 body ---------- */
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

    /* ---------- 初始化 ---------- */
    function init() {
        try {
            loadStaff().then(function (config) {
                try {
                    applyStaffStyles(config);
                    observePage(function () { applyStaffStyles(config); });
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
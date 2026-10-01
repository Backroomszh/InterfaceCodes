/**
 * Gadget-versionNav
 *
 * 只为 CNList 卡片内、紧贴链接两侧的 VN-arrow 箭头绑定点击/键盘跳转。
 * 三重防护，绝不误伤其它元素：
 *   1) 选择器要求同时满足：.CNList > .VN-arrow[role="button"][data-page]
 *   2) 绑定前二次校验父节点确实是 .CNList
 *   3) 每个元素只绑定一次（dataset.vnBound 标记）
 */
(function () {
    'use strict';

    var SELECTOR = '.CNList > .VN-arrow[role="button"][data-page]';

    function urlFor(page) {
        if (window.mw && mw.util && typeof mw.util.getUrl === 'function') {
            return mw.util.getUrl(page);
        }
        return '/wiki/' + encodeURIComponent(String(page).replace(/ /g, '_'));
    }

    function bindOne(btn) {
        if (btn.dataset.vnBound === '1') {
            return;
        }

        if (btn.getAttribute('role') !== 'button') {
            return;
        }
        if (!btn.hasAttribute('data-page')) {
            return;
        }
        var parent = btn.parentElement;
        if (!parent || !parent.classList || !parent.classList.contains('CNList')) {
            return;
        }

        btn.dataset.vnBound = '1';

        function jump() {
            var page = btn.getAttribute('data-page');
            if (page) {
                window.location.href = urlFor(page);
            }
        }

        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            jump();
        });

        btn.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                jump();
            }
        });
    }

    function init(root) {
        var scope = root && root.querySelectorAll ? root : document;
        var list = scope.querySelectorAll(SELECTOR);
        for (var i = 0; i < list.length; i++) {
            bindOne(list[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            init(document);
        });
    } else {
        init(document);
    }

    if (window.mw && mw.hook) {
        mw.hook('wikipage.content').add(function ($content) {
            var el = $content && $content[0] ? $content[0] : document;
            init(el);
        });
    }
})();
/**
 * Gadget-versionNav
 *
 * 点击 CNList 卡片里的左右箭头，切换中间链接（不跳转）。
 * 切换时同步更新 href、textContent 和红链/蓝链 class。
 * 只有点击中间链接本身才会跳转到对应页面。
 */
(function () {
    'use strict';

    function urlFor(page) {
        if (window.mw && mw.util && typeof mw.util.getUrl === 'function') {
            return mw.util.getUrl(page);
        }
        return '/wiki/' + encodeURIComponent(String(page).replace(/ /g, '_'));
    }

    function initOne(nav) {
        if (nav.dataset.vnReady === '1') return;
        nav.dataset.vnReady = '1';

        // 1. 读全部版本
        var versions = [];
        var stash = nav.querySelectorAll('.VN-ver');
        for (var i = 0; i < stash.length; i++) {
            versions.push({
                page:   stash[i].getAttribute('data-page')  || '',
                label:  stash[i].getAttribute('data-label') || '',
                exists: stash[i].getAttribute('data-exists') === '1',
            });
        }
        if (versions.length === 0) return;

        // 2. 中间链接 = CNList 里唯一的 <a>
        var titleLink = nav.querySelector('a');
        var prevBtn   = nav.querySelector('.VN-prev');
        var nextBtn   = nav.querySelector('.VN-next');

        var cur = parseInt(nav.getAttribute('data-cur'), 10) || versions.length;
        if (cur < 1 || cur > versions.length) cur = versions.length;

        // 3. 渲染：更新中间链接 + 箭头禁用状态
        function render() {
            var v = versions[cur - 1];

            if (titleLink) {
                titleLink.href = urlFor(v.page);
                titleLink.textContent = v.label;

                // 同步红链/蓝链 class
                if (v.exists) {
                    titleLink.classList.remove('new');
                    titleLink.classList.remove('mw-new');
                } else {
                    titleLink.classList.add('new');
                }
            }

            if (prevBtn) {
                if (cur <= 1) prevBtn.setAttribute('data-disabled', '1');
                else          prevBtn.removeAttribute('data-disabled');
            }
            if (nextBtn) {
                if (cur >= versions.length) nextBtn.setAttribute('data-disabled', '1');
                else                        nextBtn.removeAttribute('data-disabled');
            }
        }

        function go(delta) {
            var nxt = cur + delta;
            if (nxt < 1 || nxt > versions.length) return;
            cur = nxt;
            render();
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                go(-1);
            });
            prevBtn.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    go(-1);
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                go(1);
            });
            nextBtn.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    go(1);
                }
            });
        }

        render();
    }

    function init(root) {
        var scope = (root && root.querySelectorAll) ? root : document;
        var list = scope.querySelectorAll('.CNList.VN-root');
        for (var i = 0; i < list.length; i++) initOne(list[i]);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            init(document);
        });
    } else {
        init(document);
    }

    if (window.mw && mw.hook) {
        mw.hook('wikipage.content').add(function ($c) {
            init(($c && $c[0]) ? $c[0] : document);
        });
    }
})();

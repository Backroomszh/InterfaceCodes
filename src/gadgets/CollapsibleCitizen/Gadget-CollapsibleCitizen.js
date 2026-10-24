/* MediaWiki:Gadget-citizenCollapsibleSidebar.js */(function () {
    'use strict'; var STORAGE_KEY = 'citizenCollapsibleSidebarState'; function getSidebarRoot() {
         // Citizen 侧边栏可能出现在常规侧栏或抽屉中，优先使用更具体的容器
        return document.querySelector('.citizen-sidebar, .citizen-drawer__menu');
    }
    function getMenuHeadings(root) {
        if (!root) return []; // 菜单标题带有 citizen-menu__heading 类
        return root.querySelectorAll('.citizen-menu__heading');
    }
    function getTargetList(heading) {
         // 标题的相邻下一个元素通常是 <ul>，但需跳过非列表节点
        var el = heading.nextElementSibling; while (el && el.tagName !== 'UL') {
            el = el.nextElementSibling;
        }
        return el;
    }
    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw): {
            };
        }
        catch (e) {
            return {
            };
        }
    }
    function saveState(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
        catch (e) {
             // localStorage 不可用时静默失败
        }
    }
    function makeHeadingInteractive(heading, list, state) {
        var key = heading.id || heading.textContent.trim().slice(0, 50); if (!key) return; // 如果状态中已记录为折叠，则立即应用
        if (state[key] === true) {
            list.style.display = 'none'; heading.classList.add('citizen-sidebar-heading--collapsed');
        }
         // 添加可点击的视觉提示（CSS 中控制箭头等）
        heading.classList.add('citizen-sidebar-heading--collapsible'); heading.setAttribute('role', 'button'); heading.setAttribute('tabindex', '0'); heading.setAttribute('aria-expanded', state[key] === true ? 'false': 'true'); function toggle() {
            var isCollapsed = list.style.display === 'none'; if (isCollapsed) {
                list.style.display = ''; heading.classList.remove('citizen-sidebar-heading--collapsed'); heading.setAttribute('aria-expanded', 'true'); delete state[key];
            }
            else {
                list.style.display = 'none'; heading.classList.add('citizen-sidebar-heading--collapsed'); heading.setAttribute('aria-expanded', 'false'); state[key] = true;
            }
            saveState(state);
        }
        heading.addEventListener('click', toggle); heading.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); toggle();
            }
        });
    }
    function init() {
        var root = getSidebarRoot(); if (!root) return; var headings = getMenuHeadings(root); if (!headings.length) return; var state = loadState(); headings.forEach(function (heading) {
            var list = getTargetList(heading); if (list) {
                makeHeadingInteractive(heading, list, state);
            }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    }
    else {
        init();
    }
}
());

/* MediaWiki:Gadget-pc-inline-comments.js
 * 纯前端段落评论 —— 右侧抽屉 / 移动端底部滑出
 */
(function () {
  'use strict';

  if (mw.config.get('wgNamespaceNumber') !== 0) return;
  if (document.querySelector('meta[name="pc-disable"], [data-pc-disable]')) return;

  var CONFIG = {
    storageNs: 'Storage', storagePrefix: 'InlineComments/',
    summaryPrefix: 'mwlfg:', rateLimitMs: 8000, maxRetries: 4,
    visibleKey: 'pc_visible', lastEditKey: 'pc_last_edit',
    excludeClass: 'pc-no-comments', excludeAttr: 'data-pc-no-comments',
    avatarDefaultUrl: 'https://static.wikitide.net/backroomszhwiki/upv2avatars/default.png'
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var state = {
    pageName: null, storageTitle: null, comments: [], revid: null,
    visible: true, inflight: false, panelOpen: false,
    activeSectionKey: null, activeParagraphEl: null,
    toggleBtns: [], // 支持注入多个按钮
    panelEl: null, panelListEl: null,
    panelTa: null, panelSend: null, panelHint: null,
    avatarIds: {}, avatarUrls: {}, avatarPending: {}
  };

  var api = new mw.Api();
  var pcInitDone = false;

  // ================= 工具函数 =================
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function nowIso() { return new Date().toISOString(); }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function hashStr(s) {
    var h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function errCode(e) { if (typeof e === 'string') return e; if (e && e.code) return e.code; return null; }
  function makeSummary(action) {
    var s = CONFIG.summaryPrefix + ' ' + action + ' on ' + state.pageName;
    if (s.length > 240) s = s.slice(0, 237) + '...';
    return s;
  }
  function cleanText(el) {
    var s = '', i, n;
    for (i = 0; i < el.childNodes.length; i++) {
      n = el.childNodes[i];
      if (n.nodeType === 1 && n.classList && n.classList.contains('pc-bubble')) continue;
      s += n.textContent || '';
    }
    return s.trim().replace(/\s+/g, ' ');
  }
  function makeKey(el, index) { return 'p' + index + '_' + hashStr(cleanText(el).slice(0, 120)); }
  function emptyData() { return { version: 1, page: state.pageName, updated: nowIso(), sections: [] }; }
  function normalizeData(d) {
    if (!d || typeof d !== 'object') d = emptyData();
    if (!Array.isArray(d.sections)) d.sections = [];
    d.sections.forEach(function (s) {
      if (!Array.isArray(s.threads)) s.threads = [];
      s.threads.forEach(function (t) { if (!Array.isArray(t.replies)) t.replies = []; });
    });
    return d;
  }
  function formatTime(ts) {
    try {
      var t = ts * 1000, d = new Date(t), diff = Math.floor((Date.now() - t) / 1000);
      if (diff < 60) return '刚刚';
      if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
      if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
      return d.toLocaleString();
    } catch (e) { return String(ts); }
  }

  // ================= SVG 图标（仅用于段落气泡与面板） =================
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    return el;
  }
  function iconComment(size) {
    size = size || 14;
    var svg = svgEl('svg', { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', { d: 'M3 3h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 3v-3H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round' }));
    return svg;
  }
  function iconClose(size) {
    size = size || 18;
    var svg = svgEl('svg', { viewBox: '0 0 20 20', width: size, height: size, 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', { d: 'M5 5l10 10M15 5L5 15', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', fill: 'none' }));
    return svg;
  }

  // ================= 头像逻辑 =================
  function buildInitialAvatar(name) {
    var span = document.createElement('span');
    span.className = 'pc-avatar pc-avatar-initial';
    var h = parseInt(hashStr(name), 36) % 360;
    span.style.background = 'hsl(' + h + ', 60%, 45%)';
    var chars = Array.from(String(name || '?'));
    span.textContent = (chars[0] || '?').toUpperCase();
    span.title = name;
    return span;
  }

  function fetchAvatarUrl(name) {
    if (state.avatarUrls[name]) return Promise.resolve(state.avatarUrls[name]);
    if (state.avatarPending[name]) return state.avatarPending[name];
    if (mw.util.isIPAddress(name)) {
       state.avatarUrls[name] = CONFIG.avatarDefaultUrl;
       return Promise.resolve(CONFIG.avatarDefaultUrl);
    }

    var p = api.get({
      action: 'query', formatversion: 2, 
      list: 'queryuserprofilev2', user_name: name, maxage: 0
    }).then(function(data) {
      var row = data.query && data.query[0];
      var url = row && row['profile-avatar'] ? row['profile-avatar'] : CONFIG.avatarDefaultUrl;
      if (url.indexOf('//') === 0) url = 'https:' + url;
      else if (url.charAt(0) === '/') url = location.protocol + url;
      state.avatarUrls[name] = url;
      delete state.avatarPending[name];
      return url;
    }).catch(function() {
      state.avatarUrls[name] = CONFIG.avatarDefaultUrl;
      delete state.avatarPending[name];
      return CONFIG.avatarDefaultUrl;
    });
    
    state.avatarPending[name] = p;
    return p;
  }

  function renderAvatar(name) {
    var userUrl = mw.util.getUrl('User:' + name);
    var container = document.createElement('a');
    container.href = userUrl;
    container.className = 'pc-avatar-wrap';
    container.title = name;
    
    var fallback = buildInitialAvatar(name);
    container.appendChild(fallback);

    fetchAvatarUrl(name).then(function(url) {
      if (!container.parentNode) return;
      var img = document.createElement('img');
      img.className = 'pc-avatar';
      img.src = url;
      img.alt = name;
      img.onerror = function() { state.avatarUrls[name] = CONFIG.avatarDefaultUrl; };
      img.onload = function() {
        if (fallback.parentNode === container) container.replaceChild(img, fallback);
      };
    });

    return container;
  }

  // ================= 限频 & 存储读写 =================
  function checkRateLimit() {
    var last = parseInt(localStorage.getItem(CONFIG.lastEditKey) || '0', 10);
    var diff = Date.now() - last;
    if (diff < CONFIG.rateLimitMs) {
      mw.notify('操作过于频繁，请 ' + Math.ceil((CONFIG.rateLimitMs - diff) / 1000) + ' 秒后再试', { type: 'warn' });
      return false;
    }
    return true;
  }
  function markEdit() { localStorage.setItem(CONFIG.lastEditKey, String(Date.now())); }

  function loadStorage() {
    return api.get({
      action: 'query', prop: 'revisions', titles: state.storageTitle,
      rvprop: 'content|ids|timestamp', rvslots: 'main', formatversion: 2
    }).then(function (res) {
      var page = res.query.pages[0];
      if (page.missing) return { data: emptyData(), revid: null };
      var rev = page.revisions[0], slot = rev.slots.main;
      var content = slot.content != null ? slot.content : slot['*'];
      try { return { data: normalizeData(JSON.parse(content)), revid: rev.revid }; }
      catch (e) { return { data: emptyData(), revid: rev.revid }; }
    });
  }

  function saveStorage(data, baserevid) {
    data.updated = nowIso();
    var params = {
      action: 'edit', title: state.storageTitle, text: JSON.stringify(data, null, 2),
      summary: makeSummary('update inline comments'), formatversion: 2
    };
    if (baserevid != null) params.baserevid = baserevid;
    else params.createonly = true;
    
    return api.postWithToken('csrf', params).then(function (res) {
      if (res.edit && res.edit.result === 'Success') return res.edit.newrevid;
      throw new Error('edit failed');
    });
  }

  function appendComment(sectionKey, anchorText, text) {
    var cid = uid('c_');
    var comment = { id: cid, user: mw.config.get('wgUserName') || '匿名', timestamp: nowSec(), text: text, replies: [] };
    var attempt = 0;
    
    function tryOnce() {
      if (attempt >= CONFIG.maxRetries) return Promise.reject(new Error('多次编辑冲突，保存失败'));
      attempt++;
      return loadStorage().then(function (r) {
        var data = r.data, section = null, i;
        for (i = 0; i < data.sections.length; i++) {
          if (data.sections[i].key === sectionKey) { section = data.sections[i]; break; }
        }
        if (!section) {
          section = { key: sectionKey, anchor: (anchorText || '').slice(0, 80), threads: [] };
          data.sections.push(section);
        }
        if (!section.threads.some(function (t) { return t.id === cid; })) section.threads.push(comment);
        
        return saveStorage(data, r.revid).then(function (newRev) {
          state.revid = newRev; 
          state.comments = data.sections; 
          return data;
        }).catch(function (e) {
          var code = errCode(e);
          if ((code === 'editconflict' || code === 'articleexists' || code === 'pagedeleted') && attempt < CONFIG.maxRetries) {
            return sleep(400 + Math.random() * 600 * attempt).then(tryOnce);
          }
          throw e;
        });
      });
    }
    return tryOnce();
  }

  // ================= 段落收集与渲染 =================
  function isExcluded(el) {
    return !!(el.closest && el.closest('.' + CONFIG.excludeClass + ', [' + CONFIG.excludeAttr + ']'));
  }

  function collectParagraphs() {
    var root = document.querySelector('.mw-parser-output');
    if (!root) return [];
    var list = [];
    root.querySelectorAll('p, blockquote').forEach(function (el, i) {
      if (cleanText(el).length < 2 || isExcluded(el)) return;
      var key = makeKey(el, i);
      el.dataset.pcKey = key;
      list.push({ el: el, key: key });
    });
    return list;
  }

  function makeBubble(count, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pc-bubble' + (count ? ' pc-bubble-has' : '');
    btn.title = count ? '查看本段评论（' + count + '）' : '评论本段';
    btn.setAttribute('aria-label', btn.title);
    btn.appendChild(iconComment(14));
    if (count) {
      var badge = document.createElement('span');
      badge.className = 'pc-bubble-count';
      badge.textContent = String(count);
      btn.appendChild(badge);
    }
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }

  function renderBubbles() {
    document.querySelectorAll('.pc-bubble').forEach(function (b) { b.remove(); });
    if (!state.visible) return;
    
    var paragraphs = collectParagraphs(), map = {};
    state.comments.forEach(function (s) { map[s.key] = s; });
    
    paragraphs.forEach(function (p) {
      var sec = map[p.key], count = 0;
      if (sec) sec.threads.forEach(function (t) { count += 1 + (t.replies ? t.replies.length : 0); });
      p.el.appendChild(makeBubble(count, function () {
        if (state.panelOpen && state.activeSectionKey === p.key) {
          closePanel();
        } else {
          openPanel(p.key, p.el);
        }
      }));
    });
  }

  function refreshAll() {
    return loadStorage().then(function (r) {
      state.comments = r.data.sections; state.revid = r.revid;
      renderBubbles();
      if (state.panelOpen) renderPanel();
    });
  }

  // ================= 面板渲染 =================
  function buildPanel() {
    if (state.panelEl) return state.panelEl;
    
    var panel = document.createElement('aside');
    panel.className = 'pc-panel';
    panel.innerHTML = 
      '<div class="pc-panel-handle"></div>' +
      '<div class="pc-panel-head">' +
        '<div class="pc-panel-title">段落评论</div>' +
        '<button type="button" class="pc-panel-close" aria-label="关闭"></button>' +
      '</div>' +
      '<div class="pc-panel-list"></div>' +
      '<form class="pc-panel-form">' +
        '<textarea class="pc-panel-input" placeholder="写下你对该段落的评论…" rows="3"></textarea>' +
        '<div class="pc-panel-foot">' +
          '<span class="pc-panel-hint"></span>' +
          '<button type="submit" class="pc-panel-send">发布</button>' +
        '</div>' +
      '</form>';
    
    panel.querySelector('.pc-panel-close').appendChild(iconClose(18));
    panel.querySelector('.pc-panel-close').addEventListener('click', closePanel);
    panel.querySelector('.pc-panel-form').addEventListener('submit', onSubmit);
    document.body.appendChild(panel);
    
    state.panelEl = panel;
    state.panelListEl = panel.querySelector('.pc-panel-list');
    state.panelTa = panel.querySelector('.pc-panel-input');
    state.panelSend = panel.querySelector('.pc-panel-send');
    state.panelHint = panel.querySelector('.pc-panel-hint');
    return panel;
  }

  function renderPanel() {
    var list = state.panelListEl;
    while (list.firstChild) list.removeChild(list.firstChild);
    
    var section = null;
    state.comments.forEach(function (s) { if (s.key === state.activeSectionKey) section = s; });
    
    if (!section || !section.threads.length) {
      var empty = document.createElement('div');
      empty.className = 'pc-empty';
      empty.textContent = '还没有评论，来说两句吧～';
      list.appendChild(empty);
      return;
    }
    
    section.threads.forEach(function (t) {
      var item = document.createElement('div');
      item.className = 'pc-thread';
      
      var meta = document.createElement('div');
      meta.className = 'pc-thread-meta';
      
      var avatar = renderAvatar(t.user);
      
      var userUrl = mw.util.getUrl('User:' + t.user);
      var user = document.createElement('a');
      user.className = 'pc-thread-user';
      user.href = userUrl;
      user.textContent = t.user;
      
      var time = document.createElement('span');
      time.className = 'pc-thread-time';
      time.textContent = formatTime(t.timestamp);
      
      meta.appendChild(avatar);
      meta.appendChild(user);
      meta.appendChild(time);
      
      var body = document.createElement('div');
      body.className = 'pc-thread-body';
      body.textContent = t.text;
      
      item.appendChild(meta);
      item.appendChild(body);
      list.appendChild(item);
    });
    
    setTimeout(function() { list.scrollTop = list.scrollHeight; }, 50);
  }

  function openPanel(sectionKey, paragraphEl) {
    var panel = buildPanel();
    state.activeSectionKey = sectionKey;
    state.activeParagraphEl = paragraphEl;
    renderPanel();
    
    document.querySelectorAll('.pc-bubble.pc-bubble-active').forEach(function (b) { b.classList.remove('pc-bubble-active'); });
    if (paragraphEl) {
      var b = paragraphEl.querySelector('.pc-bubble');
      if (b) b.classList.add('pc-bubble-active');
    }
    
    void panel.offsetWidth;
    panel.classList.add('pc-panel-open');
    state.panelOpen = true;
    document.addEventListener('mousedown', onDocDown, true);
  }

  function closePanel() {
    if (!state.panelEl || !state.panelOpen) return;
    state.panelEl.classList.remove('pc-panel-open');
    state.panelOpen = false;
    state.activeSectionKey = null;
    state.activeParagraphEl = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.querySelectorAll('.pc-bubble.pc-bubble-active').forEach(function (b) { b.classList.remove('pc-bubble-active'); });
  }

  function onDocDown(e) {
    if (!state.panelOpen) return;
    if (state.panelEl && state.panelEl.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.pc-bubble, .pc-toggle, .pc-toggle-wrapper, .pc-toggle-li')) return;
    closePanel();
  }

  function onSubmit(e) {
    e.preventDefault();
    if (state.inflight) return;
    var ta = state.panelTa, text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    if (!checkRateLimit()) return;
    if (!state.activeSectionKey || !state.activeParagraphEl) return;
    
    state.inflight = true;
    state.panelSend.disabled = true;
    state.panelSend.textContent = '发送中…';
    state.panelHint.textContent = '';
    
    appendComment(state.activeSectionKey, cleanText(state.activeParagraphEl), text)
      .then(function () { markEdit(); return refreshAll(); })
      .then(function () {
        ta.value = '';
        mw.notify('评论已发布', { type: 'success' });
      }).catch(function (err) {
        mw.notify('发布失败：' + (errCode(err) || err), { type: 'error' });
      }).then(function () {
        state.inflight = false;
        state.panelSend.disabled = false;
        state.panelSend.textContent = '发布';
      });
  }

  // ================= 开关按钮 =================
  function syncToggleState() {
    state.toggleBtns.forEach(function(btn) {
      if (!btn) return;
      if (state.visible) {
        btn.title = '隐藏段落评论';
        btn.setAttribute('aria-label', '隐藏段落评论');
        btn.classList.add('pc-toggle-on');
        btn.classList.remove('pc-toggle-off');
      } else {
        btn.title = '显示段落评论';
        btn.setAttribute('aria-label', '显示段落评论');
        btn.classList.remove('pc-toggle-on');
        btn.classList.add('pc-toggle-off');
      }
    });
  }

  function toggleVisible() {
    state.visible = !state.visible;
    localStorage.setItem(CONFIG.visibleKey, state.visible ? '1' : '0');
    document.body.classList.toggle('pc-hidden', !state.visible);
    syncToggleState();
    if (state.visible) renderBubbles();
    else { if (state.panelOpen) closePanel(); document.querySelectorAll('.pc-bubble').forEach(function (b) { b.remove(); }); }
  }

  function createToggle(isSticky) {
    var btn = document.createElement('button');
    btn.type = 'button'; 
    
    btn.className = 'pc-toggle cdx-button cdx-button--weight-quiet cdx-button--icon-only';
    if (isSticky) {
       btn.classList.add('citizen-cdx-button--size-large', 'citizen-sticky-header-fake-button');
       btn.setAttribute('tabindex', '-1'); // 符合 sticky header 原生规范
    } else if (mw.config.get('skin') === 'citizen') {
       btn.classList.add('citizen-cdx-button--size-large');
    }

    var wrap = document.createElement('span');
    wrap.className = 'pc-icon-wrap';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'pc-icon-bubble';
    wrap.appendChild(iconSpan);

    btn.appendChild(wrap);
    
    var textSpan = document.createElement('span');
    textSpan.className = 'pc-toggle-text';
    textSpan.textContent = '段落评论';
    btn.appendChild(textSpan);
    
    btn.addEventListener('click', function (e) { e.preventDefault(); toggleVisible(); });
    
    state.toggleBtns.push(btn);
    return btn;
  }

  function injectToggle() {
    var skin = mw.config.get('skin') || '';

    if (skin === 'citizen') {
      // 1. 主头部注入
      var actions = document.querySelector('.citizen-page-actions');
      if (actions && !actions.querySelector('.pc-toggle')) {
        var wrapper = document.createElement('div');
        wrapper.className = 'citizen-header__item pc-toggle-wrapper';
        wrapper.appendChild(createToggle(false));
        
        // 寻找分享按钮
        var shareBtn = actions.querySelector('.citizen-share-trigger');
        if (shareBtn) {
          // 放在分享按钮右侧
          if (shareBtn.nextSibling) {
            actions.insertBefore(wrapper, shareBtn.nextSibling);
          } else {
            actions.appendChild(wrapper);
          }
        } else {
          // 找不到分享按钮的兜底（防止结构性缺失）
          var langDropdown = actions.querySelector('#citizen-page-languages-dropdown');
          if (langDropdown && langDropdown.parentNode === actions) {
            actions.insertBefore(wrapper, langDropdown);
          } else {
            actions.appendChild(wrapper);
          }
        }
      }

      // 2. 吸顶栏注入
      var stickyEnd = document.querySelector('.citizen-sticky-header-end');
      if (stickyEnd && !stickyEnd.querySelector('.pc-toggle')) {
        var stickyBtn = createToggle(true);
        
        // 寻找吸顶栏的分享按钮
        var stickyShare = stickyEnd.querySelector('#citizen-share-sticky-header');
        if (stickyShare) {
          // 放在分享按钮右侧
          if (stickyShare.nextSibling) {
            stickyEnd.insertBefore(stickyBtn, stickyShare.nextSibling);
          } else {
            stickyEnd.appendChild(stickyBtn);
          }
        } else {
          // 找不到吸顶栏分享按钮的兜底
          var stickyLang = stickyEnd.querySelector('#citizen-sticky-header-languages');
          if (stickyLang && stickyLang.parentNode === stickyEnd) {
            stickyEnd.insertBefore(stickyBtn, stickyLang);
          } else {
            stickyEnd.appendChild(stickyBtn);
          }
        }
      }
      
      syncToggleState();
      return;
    }

    // 其他皮肤逻辑...
    if (document.querySelector('.pc-toggle')) return;
    var btn = createToggle(false);
    var containers = ['#p-views', '#p-cactions', '.page-actions', '#p-associated-pages', '#right-navigation'];
    var container = null;
    for (var i = 0; i < containers.length; i++) {
      var el = document.querySelector(containers[i]);
      if (el) { container = el; break; }
    }

    if (!container) {
      btn.classList.add('pc-toggle-floating');
      document.body.appendChild(btn);
      syncToggleState();
      return;
    }

    if (container.tagName === 'UL') {
      var li = document.createElement('li');
      li.className = 'pc-toggle-li'; 
      li.appendChild(btn); 
      container.appendChild(li);
    } else {
      var ul = container.querySelector('ul');
      if (ul) {
        var li = document.createElement('li');
        li.className = 'pc-toggle-li'; 
        li.appendChild(btn); 
        ul.appendChild(li);
      } else {
        var wrapper = document.createElement('div');
        wrapper.className = 'pc-toggle-wrapper';
        wrapper.appendChild(btn);
        container.appendChild(wrapper);
      }
    }
    syncToggleState();
  }

  // ================= Init =================
  function init() {
    if (pcInitDone) return;
    if (!document.querySelector('.mw-parser-output')) {
      setTimeout(init, 500);
      return;
    }
    
    pcInitDone = true;
    state.pageName = mw.config.get('wgPageName');
    state.storageTitle = CONFIG.storageNs + ':' + CONFIG.storagePrefix + state.pageName;
    state.visible = localStorage.getItem(CONFIG.visibleKey) !== '0';
    document.body.classList.toggle('pc-hidden', !state.visible);
    
    injectToggle();

    // 监听 Citizen 吸顶栏可能延迟渲染的情况
    if (mw.config.get('skin') === 'citizen' && window.MutationObserver) {
      var observer = new MutationObserver(function() {
        var stickyEnd = document.querySelector('.citizen-sticky-header-end');
        if (stickyEnd && !stickyEnd.querySelector('.pc-toggle')) {
          var stickyBtn = createToggle(true);
          var stickyShare = stickyEnd.querySelector('#citizen-share-sticky-header');
          if (stickyShare) {
            if (stickyShare.nextSibling) {
              stickyEnd.insertBefore(stickyBtn, stickyShare.nextSibling);
            } else {
              stickyEnd.appendChild(stickyBtn);
            }
          } else {
            var stickyLang = stickyEnd.querySelector('#citizen-sticky-header-languages');
            if (stickyLang && stickyLang.parentNode === stickyEnd) {
              stickyEnd.insertBefore(stickyBtn, stickyLang);
            } else {
              stickyEnd.appendChild(stickyBtn);
            }
          }
          syncToggleState();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    loadStorage().then(function (r) {
      state.comments = r.data.sections; state.revid = r.revid; renderBubbles();
    }).catch(function () { renderBubbles(); });
  }

  mw.loader.using(['mediawiki.api', 'mediawiki.util', 'mediawiki.notification']).then(function() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });
})();

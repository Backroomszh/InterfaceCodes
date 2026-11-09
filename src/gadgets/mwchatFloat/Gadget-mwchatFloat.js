/*!
 * Backrooms 中文 Wiki（Miraheze）—— 右下角悬浮聊天室
 * 单文件 Gadget，直接粘贴到 MediaWiki:Common.js
 *
 * 全部读写只经过站内 api.php（mw.Api），不使用 WebSocket / EventSource /
 * 外部 HTTP 服务 / CDN / iframe。所有写操作均带 assert: 'user'。
 */
(function () {
    'use strict';

    // 1. 未登录用户直接退出，不初始化聊天组件
    if (!mw.config.get('wgUserName')) return;

    // 2. 没有完成入站确认（cookie 缺失）的用户不加载聊天室
    function hasOobeCompleted() {
        return document.cookie.split(';').some(function (item) {
            return item.trim().startsWith('oobe_completed=true');
        });
    }
    if (!hasOobeCompleted()) return;

    // 3. 防止同一页面重复注入
    if (window.__mwchatFloatLoaded) return;
    window.__mwchatFloatLoaded = true;

    /* ============================ 配置 ============================ */
    const CONFIG = {
        // 存储页面
        CHAT_PAGE: 'Storage:Chat',
        BLACKLIST_PAGE: 'MediaWiki:ChatBlacklist',

        // 所有编辑摘要必须以此前缀开头，否则会被 AbuseFilter 拦截
        SUMMARY_PREFIX: 'mwlfg: ',

        // 头像
        AVATAR_URL_TPL: 'https://static.wikitide.net/backroomszhwiki/upv2avatars/avatar_{ID}.{EXT}',
        AVATAR_EXTS: ['png', 'gif', 'jpg', 'jpeg'], // 与 UserProfileV2 的查找顺序一致
        AVATAR_DEFAULT_URL: 'https://static.wikitide.net/backroomszhwiki/upv2avatars/default.png',
        AVATAR_BATCH: 50,
        AVATAR_RETRY_MS: 60 * 1000,           // 用户 ID 查询失败后的重试间隔
        AVATAR_IMG_RETRY_MS: 30 * 1000,       // 图片加载失败后的基础退避
        AVATAR_URL_LOOKUP_TTL_MS: 6 * 60 * 60 * 1000, // 头像文件名的缓存时间
        AVATAR_REFRESH_MS: 10 * 60 * 1000,    // 每 10 分钟换一次缓存戳，拾取换头像
        AVATAR_POOL_MAX: 20,                  // 每个用户名最多复用多少个头像节点

        // 本地存储前缀（mw.storage）
        STORAGE_ROOT: 'mwchat.',

        // 轮询
        POLL_OPEN_MS: 150,
        POLL_CLOSED_MS: 800,

        // 全局写预算：60 秒内最多 90 次（照顾 Miraheze 服务器）
        WRITE_WINDOW_MS: 60000,
        WRITE_MAX: 90,

        // 消息分页（只在本地渲染层分页）
        INITIAL_VISIBLE: 100,
        LOAD_MORE_STEP: 100,

        // 自动归档：旧消息移动到独立归档页，绝不直接丢弃
        ARCHIVE_ENABLED: true,         // 改为 false 可关闭自动归档（仍可加载已有归档）
        ARCHIVE_TRIM_LIVE: true,       // true=复制后从实时页移走；false=只备份、不移动
        ARCHIVE_PAGE_PREFIX: 'Storage:Chat/Archive/',
        ARCHIVE_THRESHOLD: 400,        // 实时页超过 400 条才触发
        ARCHIVE_KEEP_LIVE: 200,        // 实时页至少保留 200 条
        ARCHIVE_BATCH: 200,            // 每次最多移动 200 条
        ARCHIVE_COOLDOWN_MS: 5 * 60 * 1000,
        ARCHIVE_INDEX_TTL_MS: 60 * 1000,

        // 黑名单复查间隔（写入前还会强制实时复查）
        BLACKLIST_RECHECK_OPEN_MS: 10000,
        BLACKLIST_RECHECK_CLOSED_MS: 30000,

        // 等级（与站内 userlevel v6 完全一致）
        LEVEL_RETRY_MS: 5 * 60 * 1000,
        LEVEL_MAX_USERS_PER_ROUND: 8,           // 每轮最多精算多少名“他人”
        LEVEL_STATS_TTL_MS: 10 * 60 * 1000,     // 本地等级结果缓存（与 Gadget 一致）
        LEVEL_METRICS_TTL_MS: 60 * 60 * 1000,   // 贡献统计缓存
        LEVEL_CREATOR_TTL_MS: 24 * 60 * 60 * 1000,
        LEVEL_PUBLISHED_TTL_MS: 7 * 24 * 60 * 60 * 1000,
        LEVEL_MAX_REQUESTS: 60,                 // usercontribs / logevents 分页上限
        LEVEL_SNAPSHOT_TITLE: 'Storage:Userlevel',
        LEVEL_SNAPSHOT_BUCKETS: 256,
        LEVEL_COMMENT_NS_FALLBACK: 844,
        LEVEL_RANKING_TITLE: 'Storage:GlobalRanking',
        LEVEL_RANKING_MARKER: 'SNAPSHOT',
        LEVEL_RANKING_VERSION: 3,
        LEVEL_WEIGHTS: { comment: 0.15, login: 0.10, create: 0.40, edit: 0.35 },
        LEVEL_REF: { comment: 100, login: 180, create: 30, edit: 1000 },
        LEVEL_BASE_SCORE_MAX: 10000,
        LEVEL_THRESHOLD: 15,
        LEVEL_EXP: 2,
        LEVEL_VOTE_MAX: 5,
        LEVEL_AVG_MIN_COUNT: 1,
        LEVEL_BONUS_PER_PAGE: 1000,
        LEVEL_BONUS_MAX: 5000,

        // 交互
        MENTION_MAX: 8,
        NOTICE_MS: 9000,
        MAX_MESSAGE_LEN: 1000,
        MAX_LINE_LEN: 1600, // 含 reply/tweet 元数据的整行上限
        REPLY_EXCERPT_LEN: 120,

        // 面板尺寸
        PANEL_MIN_W: 320,
        PANEL_MIN_H: 380,
        PANEL_MAX_W: 720,
        PANEL_MAX_H: 800
    };

    const KEY_AVATARS = CONFIG.STORAGE_ROOT + 'avatars.v2';
    const KEY_PANEL = CONFIG.STORAGE_ROOT + 'panel.rect.v3'; // 位置 + 尺寸
    const KEY_ARCHIVE = CONFIG.STORAGE_ROOT + 'lastArchive.v1';
    // v6：与站内 userlevel v6 对齐的完整统计结果。
    // 旧版按“快照 + 评论数×2”算出的 v3 值会把高等级算成 Lv4，直接丢弃。
    const KEY_LEVEL = function (name) { return CONFIG.STORAGE_ROOT + 'level.v7.' + name; };
    const KEY_LEVEL_METRICS = function (name) { return CONFIG.STORAGE_ROOT + 'level.v7.metrics.' + name; };
    const KEY_LEVEL_CREATORS = CONFIG.STORAGE_ROOT + 'level.v7.creators';
    const KEY_LEVEL_RANKING = CONFIG.STORAGE_ROOT + 'level.v7.ranking';

    /* ============================ 状态 ============================ */
    let API = null;
    function getApi() {
        if (!API) API = new mw.Api();
        return API;
    }

    const state = {
        me: null,
        isAdmin: false,
        blacklisted: false,
        lockedOut: false,       // 运行中被判定为黑名单后，彻底卸载
        open: false,
        loaded: false,          // 是否至少成功读取过一次
        initialized: false,     // 是否已经完成首屏基线（用于决定是否弹 @ 提醒）
        content: '',
        revid: undefined,
        messages: [],
        visibleCount: CONFIG.INITIAL_VISIBLE, // 当前渲染的最近消息条数
        loadingOlder: false,
        preserveScrollAnchor: false,
        // 归档
        archiving: false,
        lastArchive: 0,
        archiveIndex: [],
        archiveIndexTs: 0,
        archiveIndexKnown: false,
        archiveIndexLoading: false,
        archiveLoaded: new Set(),
        archiveOldestTs: Infinity,
        archiveOldestTitle: '',
        archiveNewestTs: -Infinity,
        archiveLoading: false,
        archivedMessages: [],
        archivedKeys: new Set(),
        pending: new Map(),
        userSet: new Set(),
        levels: Object.create(null),       // 用户名 -> 数字等级（仅成功值）
        levelStats: Object.create(null),   // 用户名 -> 完整 v6 统计
        levelMetrics: new Map(),           // 用户名 -> { ts, data } 贡献统计
        levelFailedAt: Object.create(null),// 用户名 -> 失败时间戳
        levelPending: new Set(),
        levelFresh: new Set(),             // 本次会话已得到可用等级的用户
        avatarIds: Object.create(null),    // 用户名 -> ID | null
        avatarPending: new Set(),
        avatarFailedAt: Object.create(null),   // 用户 ID 查询失败时间
        avatarImgFailedAt: Object.create(null), // 图片加载失败时间
        avatarImgFailCount: Object.create(null),
        avatarOkUrl: Object.create(null),      // 用户名 -> 头像文件路径（不含缓存戳）
        avatarUrlTs: Object.create(null),      // 用户名 -> 文件名查询时间
        avatarUrlPending: new Set(),
        avatarUrlFailedAt: Object.create(null),
        avatarBust: String(Date.now()),        // 本页的缓存戳，定期更换以拾取换头像
        avatarPool: new Map(),                 // 用户名 -> 可复用的头像节点
        notified: new Set(),
        writeTimes: [],
        polling: false,
        pollTimer: null,
        renderTimer: null,
        statusTimer: null,
        lastBlacklistCheck: 0,
        blacklistChecking: false,
        noticeStack: null,
        noticeCards: [],
        composer: null, // { type: 'tweet', page } | { type: 'reply', target }
        mention: { open: false, items: [], index: -1, start: -1, end: -1 }
    };

    let els = {};

    /* ============================ 小工具 ============================ */
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function nowTime() {
        const d = new Date();
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // 统一生成编辑摘要，保证每个写操作都带 AbuseFilter 要求的 mwlfg: 前缀
    function editSummary(text) {
        return CONFIG.SUMMARY_PREFIX + String(text || '');
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 回复引用用 base64url 存进行内注释，避免 | 和 > 破坏格式
    function b64urlEncode(str) {
        try {
            const bytes = new TextEncoder().encode(String(str));
            let bin = '';
            bytes.forEach(function (b) { bin += String.fromCharCode(b); });
            return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (e) {
            return '';
        }
    }

    function b64urlDecode(str) {
        try {
            let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
            while (s.length % 4) s += '=';
            const bin = atob(s);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder().decode(bytes);
        } catch (e) {
            return '';
        }
    }

    function clamp(v, min, max) {
        return Math.min(max, Math.max(min, v));
    }

    function isMobile() {
        return window.matchMedia('(max-width: 720px)').matches;
    }

    function isLoggedIn() {
        return !!state.me && !mw.user.isAnon();
    }

    function isTweetPage() {
        return mw.config.get('wgNamespaceNumber') === 0 &&
            mw.config.get('wgIsArticle') === true;
    }

    function describeError(e) {
        if (!e) return '未知错误';
        if (typeof e === 'string') return e;
        if (e.info) return e.info;
        if (e.error) return e.error;
        if (e.code) return e.code;
        if (e.message) return e.message;
        return '未知错误';
    }

    // mw.Api 在不同版本里可能以字符串或 { code } 形式 reject
    function isEditConflict(e) {
        return e === 'editconflict' || (e && e.code === 'editconflict');
    }

    // FNV-1a：与站内 userlevel 脚本一致的桶分配算法（仅用于读取快照）
    function hash32(str) {
        let h = 2166136261;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // 64 位左右的内容指纹，用作归档页标题；同一批文本永远得到同一标题
    function hash64(str) {
        const s = String(str);
        return hash32(s).toString(16).padStart(8, '0') +
            hash32('\u0001' + s + '\u0002').toString(16).padStart(8, '0');
    }

    function guardWrite() {
        if (state.blacklisted || state.lockedOut) throw new Error('blacklisted');
    }

    // 60 秒滑动窗口写预算
    async function waitWriteBudget() {
        for (;;) {
            const now = Date.now();
            state.writeTimes = state.writeTimes.filter(function (t) {
                return now - t < CONFIG.WRITE_WINDOW_MS;
            });
            if (state.writeTimes.length < CONFIG.WRITE_MAX) {
                state.writeTimes.push(now);
                return;
            }
            const wait = CONFIG.WRITE_WINDOW_MS - (now - state.writeTimes[0]) + 25;
            await sleep(Math.max(50, Math.min(wait, 5000)));
        }
    }

    /* ============================ 写入队列 ============================ */
    // 所有对 Storage:Chat 的写操作都按顺序排队：
    //   - 前一笔没完成，后一笔不会开始；
    //   - 遇到 editconflict 时重新读取最新版本再试，而不是直接放弃；
    //   - 最多重试若干次，仍失败才放行下一笔。
    const chatWriteQueue = [];
    let chatWriteRunning = false;

    function enqueueChatWrite(task) {
        return new Promise(function (resolve, reject) {
            chatWriteQueue.push({ task: task, resolve: resolve, reject: reject });
            drainChatWriteQueue();
        });
    }

    async function drainChatWriteQueue() {
        if (chatWriteRunning) return;
        chatWriteRunning = true;
        try {
            while (chatWriteQueue.length) {
                const item = chatWriteQueue.shift();
                try {
                    item.resolve(await item.task());
                } catch (e) {
                    item.reject(e);
                }
                if (chatWriteQueue.length) await sleep(120);
            }
        } finally {
            chatWriteRunning = false;
            if (chatWriteQueue.length) drainChatWriteQueue();
        }
    }

    // task 内部必须自己重新读取页面并带 baserevid；冲突时整个 task 重跑
    async function withEditConflictRetry(task, attempts, label) {
        let lastError = null;
        const max = attempts || 6;
        for (let i = 0; i < max; i++) {
            try {
                return await task();
            } catch (e) {
                lastError = e;
                if (!isEditConflict(e) || i === max - 1) throw e;
                setStatus((label || '编辑冲突') + '，正在自动重试…', false);
                await sleep(220 + Math.random() * 180 + i * 320);
            }
        }
        throw lastError;
    }

    /* ============================ 黑名单（严格模式） ============================ */
    // 页面缺失或空内容 = 空名单；JSON 损坏、读取失败一律抛错，由调用方 fail-closed。
    // maxage/smaxage 置 0，尽量避免拿到缓存的旧名单。
    async function readBlacklistStrict() {
        const data = await getApi().get({
            action: 'query', formatversion: 2,
            prop: 'revisions', rvprop: 'content', rvslots: 'main',
            titles: CONFIG.BLACKLIST_PAGE,
            maxage: 0, smaxage: 0
        });
        const p = data.query && data.query.pages && data.query.pages[0];
        if (!p || p.missing) return [];

        const rev = p.revisions && p.revisions[0];
        const raw = rev && rev.slots && rev.slots.main && rev.slots.main.content;
        const trimmed = String(raw == null ? '' : raw).replace(/^﻿/, '').trim();
        if (!trimmed) return [];

        let list;
        try {
            list = JSON.parse(trimmed);
        } catch (e) {
            throw new Error('blacklist-invalid');
        }
        if (!Array.isArray(list)) throw new Error('blacklist-invalid');
        return list.filter(function (x) { return typeof x === 'string'; });
    }

    // 严格校验：被拉黑或无法验证（网络/JSON 错误）都返回 false。
    // 这是所有写入与打开面板前的强制检查。
    async function enforceBlacklist() {
        if (!state.me) return true; // 匿名无用户名，不可能命中名单
        if (state.blacklisted || state.lockedOut) return false;
        try {
            let list;
            try {
                list = await readBlacklistStrict();
            } catch (firstError) {
                // 单次网络抖动时重试一次；仍然失败则 fail-closed
                list = await readBlacklistStrict();
            }
            state.lastBlacklistCheck = Date.now();
            if (list.indexOf(state.me) !== -1) {
                lockOut();
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    // 定时复查：只用于“运行中被拉黑”的场景，失败不锁死（写入前仍会强制复查）
    async function recheckBlacklist() {
        if (!state.me || state.blacklisted || state.lockedOut || state.blacklistChecking) return;
        state.blacklistChecking = true;
        try {
            const list = await readBlacklistStrict();
            state.lastBlacklistCheck = Date.now();
            if (list.indexOf(state.me) !== -1) lockOut();
        } catch (e) {
            // 网络抖动时保持现状，下一次再查
        } finally {
            state.blacklistChecking = false;
        }
    }

    // 运行中被判定黑名单：停掉轮询、移除全部聊天 DOM，不留任何交互入口
    function lockOut() {
        if (state.lockedOut) return;
        state.blacklisted = true;
        state.lockedOut = true;
        tearDown();
    }

    function tearDown() {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
        if (state.renderTimer) {
            clearTimeout(state.renderTimer);
            state.renderTimer = null;
        }
        if (state.statusTimer) {
            clearTimeout(state.statusTimer);
            state.statusTimer = null;
        }
        hideMentions();
        if (els && els.panel && els.panel.parentNode) {
            els.panel.parentNode.removeChild(els.panel);
        }
        if (els && els.wrap && els.wrap.parentNode) {
            els.wrap.parentNode.removeChild(els.wrap);
        }
        clearNoticeStack();
        els = {};
        state.open = false;
    }

    async function readBlacklistPage() {
        const data = await getApi().get({
            action: 'query', formatversion: 2,
            prop: 'revisions', rvprop: 'content|ids', rvslots: 'main',
            titles: CONFIG.BLACKLIST_PAGE
        });
        const page = data.query && data.query.pages && data.query.pages[0];
        if (!page || page.missing) return { list: [], revid: null };
        const rev = page.revisions && page.revisions[0];
        const text = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '[]';
        let list = [];
        try {
            const parsed = JSON.parse(String(text).replace(/^﻿/, ''));
            if (Array.isArray(parsed)) {
                list = parsed.filter(function (x) { return typeof x === 'string'; });
            }
        } catch (e) { list = []; }
        return { list: list, revid: rev ? rev.revid : null };
    }

    async function blacklistUser(username) {
        if (!state.isAdmin) return;
        if (!isLoggedIn()) return;
        if (!confirm('将 ' + username + ' 加入聊天黑名单？')) return;
        const api = getApi();
        for (let attempt = 0; attempt < 3; attempt++) {
            const page = await readBlacklistPage();
            const list = page.list || [];
            if (list.indexOf(username) !== -1) return;
            list.push(username);
            const params = {
                action: 'edit', title: CONFIG.BLACKLIST_PAGE,
                text: JSON.stringify(list, null, 2),
                summary: editSummary('更新聊天黑名单'),
                formatversion: 2, assert: 'user', watchlist: 'nochange'
            };
            if (page.revid) params.baserevid = page.revid;
            try {
                await waitWriteBudget();
                if (!(await enforceBlacklist())) {
                    setStatus('聊天权限校验失败或你已被拉黑，操作已阻止', true);
                    return;
                }
                await api.postWithToken('csrf', params);
                setStatus('已将 ' + username + ' 加入聊天黑名单', false);
                return;
            } catch (e) {
                if (isEditConflict(e) && attempt < 2) continue;
                throw e;
            }
        }
    }

    /* ============================ 头像 ============================ */
    function loadAvatarCache() {
        try {
            const raw = mw.storage.get(KEY_AVATARS);
            if (!raw) return;
            const o = JSON.parse(raw);
            if (!o || !o.ids) return;
            Object.keys(o.ids).forEach(function (name) {
                const id = o.ids[name];
                // 只持久化真实 ID；null 是“查不到”的临时状态，不跨页面沿用
                if (typeof id === 'number' && id > 0) state.avatarIds[name] = id;
            });
            if (o.urls) {
                Object.keys(o.urls).forEach(function (name) {
                    if (typeof o.urls[name] === 'string') {
                        state.avatarOkUrl[name] = o.urls[name];
                    }
                });
            }
        } catch (e) { /* 头像缓存失败不影响聊天 */ }
    }

    function saveAvatarCache() {
        try {
            const ids = Object.create(null);
            Object.keys(state.avatarIds).forEach(function (name) {
                const id = state.avatarIds[name];
                if (typeof id === 'number' && id > 0) ids[name] = id;
            });
            const urls = Object.create(null);
            Object.keys(state.avatarOkUrl).forEach(function (name) {
                if (state.avatarOkUrl[name]) urls[name] = state.avatarOkUrl[name];
            });
            mw.storage.set(KEY_AVATARS,
                JSON.stringify({ v: 2, ts: Date.now(), ids: ids, urls: urls }));
        } catch (e) { /* 忽略配额/隐私模式错误 */ }
    }

    let avatarSaveTimer = null;
    function scheduleSaveAvatarCache() {
        if (avatarSaveTimer) return;
        avatarSaveTimer = setTimeout(function () {
            avatarSaveTimer = null;
            saveAvatarCache();
        }, 1500);
    }

    function normalizeAvatarUrl(raw) {
        let url = String(raw || '').split('?')[0].split('#')[0];
        if (!url) return '';
        if (url.indexOf('//') === 0) url = 'https:' + url;
        else if (url.charAt(0) === '/') url = location.protocol + url;
        return url;
    }

    // UserProfileV2 的 queryuserprofilev2 直接返回当前头像文件路径
    // （含正确的扩展名；默认头像是 default.png）。
    async function fetchProfileAvatarUrl(name) {
        const data = await getApi().get({
            action: 'query', formatversion: 2,
            list: 'queryuserprofilev2',
            user_name: name,
            maxage: 0, smaxage: 0
        });
        const row = data.query && data.query[0];
        return normalizeAvatarUrl(row && row['profile-avatar']);
    }

    // 头像文件名查询最多同时跑 3 个，避免一开面板就发几十个请求
    const avatarUrlQueue = [];
    let avatarUrlActive = 0;

    function pumpAvatarUrlQueue() {
        while (avatarUrlActive < 3 && avatarUrlQueue.length) {
            const name = avatarUrlQueue.shift();
            avatarUrlActive++;
            Promise.race([
                fetchProfileAvatarUrl(name),
                new Promise(function (_, reject) {
                    setTimeout(function () {
                        reject(new Error('avatar-url-timeout'));
                    }, 10000);
                })
            ]).then(function (url) {
                if (!url) return;
                const old = state.avatarOkUrl[name];
                state.avatarOkUrl[name] = url;
                state.avatarUrlTs[name] = Date.now();
                delete state.avatarUrlFailedAt[name];
                if (old !== url) {
                    state.avatarPool.delete(name);
                    delete state.avatarImgFailedAt[name];
                    delete state.avatarImgFailCount[name];
                    scheduleSaveAvatarCache();
                    scheduleRender();
                }
            }).catch(function () {
                state.avatarUrlFailedAt[name] = Date.now();
            }).finally(function () {
                avatarUrlActive--;
                state.avatarUrlPending.delete(name);
                pumpAvatarUrlQueue();
            });
        }
    }

    // 文件名缓存 6 小时；图片本身靠 avatarBust 每 10 分钟强制刷新。
    function ensureAvatarUrlFresh(name) {
        if (!name || mw.util.isIPAddress(name)) return;
        if (state.avatarUrlPending.has(name)) return;
        const ts = state.avatarUrlTs[name] || 0;
        if (ts && Date.now() - ts < CONFIG.AVATAR_URL_LOOKUP_TTL_MS) return;
        if (state.avatarUrlFailedAt[name] &&
            Date.now() - state.avatarUrlFailedAt[name] < 60 * 1000) return;

        state.avatarUrlPending.add(name);
        avatarUrlQueue.push(name);
        pumpAvatarUrlQueue();
    }

    function avatarPathCandidates(name) {
        const paths = [];
        const ok = normalizeAvatarUrl(state.avatarOkUrl[name]);

        if (ok) {
            paths.push(ok);
            // 默认头像不用再猜 avatar_<ID>.*
            if (/\/default\.(png|gif|jpe?g)$/i.test(ok)) return paths;

            const m = ok.match(/^(.*)\.(png|gif|jpe?g)$/i);
            if (m) {
                CONFIG.AVATAR_EXTS.forEach(function (ext) {
                    const p = m[1] + '.' + ext;
                    if (paths.indexOf(p) === -1) paths.push(p);
                });
            }
        }

        const id = state.avatarIds[name];
        if (id) {
            CONFIG.AVATAR_EXTS.forEach(function (ext) {
                const p = CONFIG.AVATAR_URL_TPL
                    .replace('{ID}', String(id))
                    .replace('{EXT}', ext);
                if (paths.indexOf(p) === -1) paths.push(p);
            });
        }

        // 自定义头像文件不存在时退回站内默认头像
        if ((ok || id) && paths.indexOf(CONFIG.AVATAR_DEFAULT_URL) === -1) {
            paths.push(CONFIG.AVATAR_DEFAULT_URL);
        }
        return paths;
    }

    function avatarCandidates(name) {
        const bust = state.avatarBust || String(Date.now());
        return avatarPathCandidates(name).map(function (p) {
            return p + (p.indexOf('?') === -1 ? '?' : '&') +
                'r=' + encodeURIComponent(bust);
        });
    }

    function avatarImgRetryDelay(name) {
        const n = state.avatarImgFailCount[name] || 0;
        return Math.min(10 * 60 * 1000,
            CONFIG.AVATAR_IMG_RETRY_MS * Math.pow(2, Math.min(n, 4)));
    }

    function bindAvatarClick(el, name) {
        el.onclick = function () {
            location.href = mw.util.getUrl('User:' + name);
        };
    }

    async function fetchAvatarIds(usernames) {
        const api = getApi();
        const out = Object.create(null);
        const norm = function (s) {
            return String(s || '').replace(/_/g, ' ').trim().toLowerCase();
        };
        for (let i = 0; i < usernames.length; i += CONFIG.AVATAR_BATCH) {
            const batch = usernames.slice(i, i + CONFIG.AVATAR_BATCH);
            let data;
            try {
                data = await api.get({
                    action: 'query', formatversion: 2,
                    list: 'users', ususers: batch.join('|'),
                    usprop: 'userid|centralids'
                });
            } catch (e) {
                // 网络失败：不写 null，交给 ensureAvatars 稍后重试
                continue;
            }
            const users = (data.query && data.query.users) || [];
            const returned = Object.create(null);
            users.forEach(function (u) {
                if (u && u.name) returned[norm(u.name)] = u;
            });
            batch.forEach(function (req) {
                const u = returned[norm(req)];
                if (!u || u.missing !== undefined) {
                    out[req] = null; // 确认查无此人，本次会话不重试
                    return;
                }
                const central = u.centralids && (u.centralids.central || u.centralids.local);
                const id = Number(central) || Number(u.userid) || null;
                if (id) {
                    out[req] = id;
                    out[u.name] = id;
                }
            });
        }
        return out;
    }

    function ensureAvatars(names) {
        const todo = [];
        const seen = new Set();
        names.forEach(function (name) {
            if (!name || seen.has(name)) return;
            seen.add(name);
            if (Object.prototype.hasOwnProperty.call(state.avatarIds, name)) return;
            if (state.avatarPending.has(name)) return;
            if (state.avatarFailedAt[name] &&
                Date.now() - state.avatarFailedAt[name] < CONFIG.AVATAR_RETRY_MS) return;
            todo.push(name);
        });
        if (!todo.length) return;

        todo.forEach(function (n) { state.avatarPending.add(n); });
        fetchAvatarIds(todo).then(function (map) {
            todo.forEach(function (n) {
                if (typeof map[n] === 'number') {
                    state.avatarIds[n] = map[n];
                    delete state.avatarFailedAt[n];
                } else if (map[n] === null) {
                    state.avatarIds[n] = null;
                    delete state.avatarFailedAt[n];
                } else {
                    // 请求失败/未返回：不缓存 null，60 秒后再试
                    state.avatarFailedAt[n] = Date.now();
                }
            });
            saveAvatarCache();
            scheduleRender();
        }).catch(function () {
            todo.forEach(function (n) { state.avatarFailedAt[n] = Date.now(); });
            scheduleRender();
        }).finally(function () {
            todo.forEach(function (n) { state.avatarPending.delete(n); });
        });
    }

    function buildInitialAvatar(name) {
        const span = document.createElement('span');
        span.className = 'mwchat-avatar mwchat-avatar-initial';
        span.dataset.user = name;
        const h = hash32(name) % 360;
        span.style.background = 'hsl(' + h + ',60%,45%)';
        const chars = Array.from(String(name || '?'));
        span.textContent = (chars[0] || '?').toUpperCase();
        span.title = name;
        return span;
    }

    function createAvatarElement(name) {
        const urls = avatarCandidates(name);
        if (!urls.length) return buildInitialAvatar(name);

        // 刚失败过就先显示首字母，避免每条消息都重新撞一次网络
        const failedAt = state.avatarImgFailedAt[name];
        if (failedAt && Date.now() - failedAt < avatarImgRetryDelay(name)) {
            return buildInitialAvatar(name);
        }

        const img = document.createElement('img');
        img.className = 'mwchat-avatar';
        img.dataset.user = name;
        img.alt = name;
        img.decoding = 'async';
        img.loading = 'eager'; // 自定义滚动容器里 lazy 容易一直不触发
        img.width = 24;
        img.height = 24;

        let idx = 0;
        const fail = function () {
            if (idx < urls.length) {
                img.src = urls[idx];
                return;
            }
            state.avatarImgFailedAt[name] = Date.now();
            state.avatarImgFailCount[name] = (state.avatarImgFailCount[name] || 0) + 1;
            img.dataset.failed = '1';
            const span = buildInitialAvatar(name);
            bindAvatarClick(span, name);
            if (img.parentNode) img.parentNode.replaceChild(span, img);
        };

        img.onload = function () {
            state.avatarOkUrl[name] = urls[idx] || img.currentSrc;
            delete state.avatarImgFailedAt[name];
            delete state.avatarImgFailCount[name];
            delete img.dataset.failed;
            scheduleSaveAvatarCache();
        };
        img.onerror = function () {
            idx++;
            fail();
        };

        // 先挂好事件再设 src，避免缓存命中时错过 onload/onerror
        if (urls.length) img.src = urls[idx];
        return img;
    }

    function replaceWithInitial(el, name) {
        if (!el || !el.parentNode) return;
        const span = buildInitialAvatar(name);
        bindAvatarClick(span, name);
        el.parentNode.replaceChild(span, el);
    }

    // 把上一轮渲染出来的头像节点收回来，下一轮直接复用，
    // 这样发消息触发重绘时不会把已经加载好的图片重新请求一遍。
    function collectAvatarPool() {
        if (!els.list) return;
        const nodes = els.list.querySelectorAll('.mwchat-avatar[data-user]');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            const name = el.dataset.user;
            if (!name) continue;
            let pool = state.avatarPool.get(name);
            if (!pool) {
                pool = [];
                state.avatarPool.set(name, pool);
            }
            if (pool.length < CONFIG.AVATAR_POOL_MAX) pool.push(el);
        }
    }

    function takeAvatar(name) {
        ensureAvatarUrlFresh(name);
        const pool = state.avatarPool.get(name);
        if (pool && pool.length) {
            const el = pool.shift();
            if (el.classList.contains('mwchat-avatar-initial')) {
                const failedAt = state.avatarImgFailedAt[name];
                if (!failedAt || Date.now() - failedAt >= avatarImgRetryDelay(name)) {
                    return createAvatarElement(name);
                }
            }
            return el;
        }
        return createAvatarElement(name);
    }

    /* ============================ 等级 ============================ */
    // 与站内 Gadget-userLevel v6 完全一致：
    //   积分 = Σ 权重 × (实际值 / 参考值) × 10000 + 作品评分附加分
    //   等级 = floor(sqrt(积分 / 15))
    //
    // 数据来源优先级：
    //   1) 页面自己渲染的 .ul-badge（自己 / 当前用户页主人）
    //   2) Storage:Userlevel 里 Gadget 发布的 v6 统计字段
    //   3) 本机 userlevel.v6.stats 缓存
    //   4) 本组件现场拉取 usercontribs / logevents / GlobalRanking 计算
    // 不调用 Gadget-userLevel 的任何函数。

    const LEVEL_PAGE_CACHE_MS = 30 * 1000;
    const levelPageCache = new Map();

    function fmtDay(d) {
        return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }

    function todayUTC() {
        return fmtDay(new Date());
    }

    function computeStreak(dates) {
        const today = todayUTC();
        const yest = fmtDay(new Date(Date.now() - 86400000));
        let latest = null;
        dates.forEach(function (d) { if (!latest || d > latest) latest = d; });
        if (!latest || (latest !== today && latest !== yest)) return 0;
        let n = 0;
        let cur = latest;
        while (dates.has(cur)) {
            n++;
            cur = fmtDay(new Date(Date.parse(cur + 'T00:00:00Z') - 86400000));
        }
        return n;
    }

    function bitmapToDates(bitmap, today) {
        const out = new Set();
        const todayTs = Date.parse(today + 'T00:00:00Z');
        for (let i = 0; i < 30; i++) {
            if (bitmap & (1 << i)) {
                out.add(fmtDay(new Date(todayTs - i * 86400000)));
            }
        }
        return out;
    }

    function levelToTier(level) {
        if (level >= 30) return 5;
        if (level >= 20) return 4;
        if (level >= 10) return 3;
        if (level >= 5) return 2;
        if (level >= 2) return 1;
        return 0;
    }

    function normUserName(s) {
        return String(s || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function usernameVariants(name) {
        const s = String(name || '');
        return [s, s.replace(/_/g, ' '), s.replace(/ /g, '_')];
    }

    function storageNamespaceId() {
        try {
            const id = (mw.config.get('wgNamespaceIds') || {}).storage;
            return (typeof id === 'number' && id >= 0) ? id : -1;
        } catch (e) { return -1; }
    }

    function commentNamespaceId() {
        try {
            const ids = mw.config.get('wgNamespaceIds') || {};
            if (typeof ids.comments === 'number') return ids.comments;
            if (typeof ids.comment === 'number') return ids.comment;
        } catch (e) { /* ignore */ }
        return CONFIG.LEVEL_COMMENT_NS_FALLBACK;
    }

    function levelSnapshotTitle(name) {
        const bucket = (hash32(name) % CONFIG.LEVEL_SNAPSHOT_BUCKETS)
            .toString(16).padStart(2, '0');
        return CONFIG.LEVEL_SNAPSHOT_TITLE + '/' + bucket;
    }

    // 页面快照：前 4 列是旧格式；第 5 列起是本组件/Gadget 发布的 v6 统计。
    // 第 12 列是格式版本，只有 >= 6 才视为可信，避免旧版写入的低等级继续生效。
    function findUserRecord(text, username) {
        const lines = String(text || '').split('\n');
        const target = normUserName(username);
        let current = null;

        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^==\s*(.+?)\s*==\s*$/);
            if (m) { current = normUserName(m[1]); continue; }
            if (current !== target) continue;

            const t = lines[i].trim();
            if (!t) continue;
            const p = t.split('\t');
            if (p.length < 4) continue;

            const rec = {
                lastActive: p[0],
                streak: parseInt(p[1], 10) || 0,
                totalDays: parseInt(p[2], 10) || 0,
                bitmap: parseInt(p[3], 16) || 0
            };

            if (p.length >= 12) {
                const level = parseInt(p[9], 10);
                const version = parseInt(p[11], 10) || 0;
                let ts = String(p[10] || '');
                if (/^\d+$/.test(ts)) ts = Number(ts);
                else ts = Date.parse(ts);
                if (ts && ts < 1e12) ts *= 1000;

                if (version >= 6 && isFinite(level) && ts) {
                    rec.hasStats = true;
                    rec.statsVersion = version;
                    rec.commentCount = parseInt(p[4], 10) || 0;
                    rec.editCount = parseInt(p[5], 10) || 0;
                    rec.createCount = parseInt(p[6], 10) || 0;
                    rec.bonus = parseInt(p[7], 10) || 0;
                    rec.score = parseInt(p[8], 10) || 0;
                    rec.level = Math.max(0, Math.floor(level));
                    rec.statsTs = ts;
                }
            }
            return rec;
        }
        return null;
    }

    function readLevelFromSiteUi(name) {
        if (!name) return null;
        try {
            let el = null;
            if (state.me && normUserName(name) === normUserName(state.me)) {
                el = document.querySelector(
                    '.citizen-userInfo-usergroups .userlevel-usergroup .ul-badge'
                );
            }
            if (!el && mw.config.get('wgNamespaceNumber') === 2) {
                const pageName = String(mw.config.get('wgTitle') || '');
                if (normUserName(pageName) === normUserName(name)) {
                    el = document.querySelector(
                        '.profile-header-statistics .userlevel-stat .ul-badge'
                    );
                }
            }
            if (!el) return null;
            const n = parseInt(String(el.textContent || '').trim(), 10);
            return isNaN(n) ? null : Math.max(0, n);
        } catch (e) {
            return null;
        }
    }

    function readJsonStorage(key, ttl) {
        try {
            const raw = mw.storage.get(key);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.ts || Date.now() - o.ts > ttl) return null;
            return o.data;
        } catch (e) {
            return null;
        }
    }

    function writeJsonStorage(key, data) {
        try {
            mw.storage.set(key, JSON.stringify({ ts: Date.now(), data: data }));
        } catch (e) { /* ignore */ }
    }

    function readSavedStats(name) {
        return readJsonStorage(KEY_LEVEL(name), CONFIG.LEVEL_STATS_TTL_MS);
    }

    function saveStats(name, stats) {
        if (!stats || typeof stats.level !== 'number') return;
        writeJsonStorage(KEY_LEVEL(name), stats);
    }

    function saveLevel(name, level) {
        if (typeof level !== 'number' || !isFinite(level)) return;
        const old = readSavedStats(name);
        saveStats(name, Object.assign({}, old || {}, {
            level: Math.max(0, Math.floor(level)),
            partial: false,
            ts: Date.now()
        }));
    }

    // 站内 Gadget-userLevel 自己写的 v6 统计缓存（若当前浏览器里有）
    function readUserlevelStats(name) {
        const variants = usernameVariants(name);
        let best = null;
        variants.forEach(function (v) {
            const data = readJsonStorage('userlevel.v6.stats2.' + v, CONFIG.LEVEL_STATS_TTL_MS);
            if (data && typeof data.level === 'number' &&
                (!best || data.level > best.level)) {
                best = data;
            }
        });
        return best;
    }

    function readUserlevelCache(name) {
        const local = readUserlevelStats(name);
        if (local) return local.level;
        const saved = readSavedStats(name);
        if (saved && typeof saved.level === 'number') return saved.level;
        return null;
    }

    function statsFromPublishedRecord(rec) {
        if (!rec || !rec.hasStats || typeof rec.level !== 'number') return null;
        if (rec.statsTs && Date.now() - rec.statsTs > CONFIG.LEVEL_PUBLISHED_TTL_MS) {
            return null;
        }
        return {
            level: rec.level,
            score: rec.score,
            commentCount: rec.commentCount,
            editCount: rec.editCount,
            createCount: rec.createCount,
            bonus: rec.bonus,
            totalDays: rec.totalDays,
            streak: rec.streak,
            partial: false,
            published: true,
            ts: rec.statsTs
        };
    }

    // 批量读取 Storage:Userlevel/<bucket>，返回 用户名 -> 记录
    async function fetchUserlevelRecords(names) {
        const byTitle = new Map();

        names.forEach(function (name) {
            usernameVariants(name).forEach(function (v) {
                const bucket = (hash32(v) % CONFIG.LEVEL_SNAPSHOT_BUCKETS)
                    .toString(16).padStart(2, '0');
                const title = CONFIG.LEVEL_SNAPSHOT_TITLE + '/' + bucket;
                if (!byTitle.has(title)) byTitle.set(title, []);
                const list = byTitle.get(title);
                if (list.indexOf(name) === -1) list.push(name);
            });
        });

        const titles = Array.from(byTitle.keys());
        const out = Object.create(null);
        const api = getApi();

        for (let i = 0; i < titles.length; i += 50) {
            const chunk = titles.slice(i, i + 50);
            let data;
            try {
                data = await api.get({
                    action: 'query', formatversion: 2,
                    prop: 'revisions', rvprop: 'content', rvslots: 'main',
                    titles: chunk.join('|'), redirects: 1
                });
            } catch (e) {
                chunk.forEach(function (t) {
                    (byTitle.get(t) || []).forEach(function (u) {
                        if (out[u] === undefined) out[u] = null;
                    });
                });
                continue;
            }

            const pages = (data.query && data.query.pages) || [];
            const byPage = Object.create(null);
            pages.forEach(function (p) {
                if (!p || !p.title) return;
                const t = p.title.replace(/_/g, ' ');
                byPage[t] = p;
                byPage[t.toLowerCase()] = p;
            });

            chunk.forEach(function (title) {
                const key = title.replace(/_/g, ' ');
                const page = byPage[key] || byPage[key.toLowerCase()];
                const users = byTitle.get(title) || [];
                if (!page || page.missing !== undefined) {
                    users.forEach(function (u) {
                        if (out[u] === undefined) out[u] = null;
                    });
                    return;
                }
                const rev = page.revisions && page.revisions[0];
                let text = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '';
                text = text.replace(/<\/?pre>/gi, '');
                users.forEach(function (u) {
                    const rec = findUserRecord(text, u);
                    if (rec) out[u] = rec;
                    else if (out[u] === undefined) out[u] = null;
                });
            });
        }
        return out;
    }

    async function readLevelPage(title, ttl) {
        const cached = levelPageCache.get(title);
        if (cached && Date.now() - cached.ts < (ttl || LEVEL_PAGE_CACHE_MS)) {
            return cached.text;
        }
        const data = await getApi().get({
            action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
            titles: title, formatversion: 2
        });
        const page = data.query && data.query.pages && data.query.pages[0];
        let text = '';
        if (page && page.missing === undefined) {
            const rev = page.revisions && page.revisions[0];
            text = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '';
        }
        text = text.replace(/<\/?pre>/gi, '');
        levelPageCache.set(title, { ts: Date.now(), text: text });
        return text;
    }

    // 评论、Storage 分开查，避免 Storage:Chat 的聊天记录把 usercontribs
    // 窗口挤满，导致评论数/编辑数读不到（高等级用户被算成 Lv4 的主因）。
    async function fetchNamespaceContribs(name, ns) {
        const dates = new Set();
        if (typeof ns !== 'number' || ns < 0) {
            return { count: 0, dates: dates, truncated: false };
        }

        const api = getApi();
        let count = 0;
        let cont = {};

        for (let guard = 0; guard < CONFIG.LEVEL_MAX_REQUESTS; guard++) {
            const data = await api.get(Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs',
                ucuser: name, uclimit: 'max', ucdir: 'newer',
                ucnamespace: ns, ucprop: 'timestamp'
            }, cont));

            const list = (data.query && data.query.usercontribs) || [];
            count += list.length;
            for (let i = 0; i < list.length; i++) {
                if (list[i].timestamp) dates.add(list[i].timestamp.slice(0, 10));
            }

            if (data.continue) cont = data.continue;
            else return { count: count, dates: dates, truncated: false };
        }
        return { count: count, dates: dates, truncated: true };
    }

    // 最近一年的贡献日期（从新到旧），用于连续天数；不参与计数
    async function fetchRecentDates(name) {
        const dates = new Set();
        const api = getApi();
        const now = new Date();
        const start = new Date(now.getTime() - 365 * 86400000);
        let cont = {};

        for (let guard = 0; guard < CONFIG.LEVEL_MAX_REQUESTS; guard++) {
            const data = await api.get(Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs',
                ucuser: name, uclimit: 'max', ucdir: 'older',
                ucstart: now.toISOString(), ucend: start.toISOString(),
                ucprop: 'timestamp'
            }, cont));

            const list = (data.query && data.query.usercontribs) || [];
            for (let i = 0; i < list.length; i++) {
                if (list[i].timestamp) dates.add(list[i].timestamp.slice(0, 10));
            }

            if (data.continue) cont = data.continue;
            else return { dates: dates, truncated: false };
        }
        return { dates: dates, truncated: true };
    }

    async function fetchTotalEditCount(name) {
        const data = await getApi().get({
            action: 'query', formatversion: 2, list: 'users',
            ususers: name, usprop: 'editcount'
        });
        const u = data.query && data.query.users && data.query.users[0];
        if (!u || u.missing !== undefined) return 0;
        return parseInt(u.editcount, 10) || 0;
    }

    async function fetchContribStats(name) {
        const storageNs = storageNamespaceId();
        const commentNs = commentNamespaceId();

        const results = await Promise.all([
            fetchNamespaceContribs(name, commentNs),
            fetchNamespaceContribs(name, storageNs),
            fetchRecentDates(name),
            fetchTotalEditCount(name)
        ]);

        const comments = results[0];
        const storage = results[1];
        const recent = results[2];
        const total = results[3];

        const dates = new Set();
        comments.dates.forEach(function (d) { dates.add(d); });
        storage.dates.forEach(function (d) { dates.add(d); });
        recent.dates.forEach(function (d) { dates.add(d); });

        return {
            dates: dates,
            editCount: Math.max(0, total - comments.count - storage.count),
            commentCount: comments.count,
            truncated: !!(comments.truncated || storage.truncated || recent.truncated)
        };
    }

    async function fetchCreatedPages(name) {
        const api = getApi();
        const titles = new Set();
        let cont = {};

        for (let guard = 0; guard < CONFIG.LEVEL_MAX_REQUESTS; guard++) {
            const data = await api.get(Object.assign({
                action: 'query', formatversion: 2, list: 'logevents',
                letype: 'create', lenamespace: 0, leuser: name,
                lelimit: 'max', leprop: 'title'
            }, cont));
            const list = (data.query && data.query.logevents) || [];
            list.forEach(function (le) {
                if (le && le.title) titles.add(String(le.title).replace(/_/g, ' '));
            });
            if (data.continue) cont = data.continue;
            else return { titles: titles, truncated: false };
        }
        return { titles: titles, truncated: true };
    }

    async function getMetrics(name) {
        const mem = state.levelMetrics.get(name);
        if (mem && Date.now() - mem.ts < CONFIG.LEVEL_METRICS_TTL_MS) return mem.data;

        const cached = readJsonStorage(KEY_LEVEL_METRICS(name), CONFIG.LEVEL_METRICS_TTL_MS);
        if (cached) {
            state.levelMetrics.set(name, { ts: Date.now(), data: cached });
            return cached;
        }

        // Gadget 已经为本机算过同一个用户时，直接复用它的指标，避免重复请求
        const variants = usernameVariants(name);
        for (let i = 0; i < variants.length; i++) {
            const gm = readJsonStorage(
                'userlevel.v6.metrics2.' + variants[i],
                CONFIG.LEVEL_METRICS_TTL_MS
            );
            if (gm && Array.isArray(gm.dates)) {
                state.levelMetrics.set(name, { ts: Date.now(), data: gm });
                writeJsonStorage(KEY_LEVEL_METRICS(name), gm);
                return gm;
            }
        }

        const contrib = await fetchContribStats(name);
        const created = await fetchCreatedPages(name);
        const data = {
            editCount: contrib.editCount,
            commentCount: contrib.commentCount,
            createCount: created.titles.size,
            dates: Array.from(contrib.dates).sort(),
            truncated: !!(contrib.truncated || created.truncated)
        };
        state.levelMetrics.set(name, { ts: Date.now(), data: data });
        writeJsonStorage(KEY_LEVEL_METRICS(name), data);
        return data;
    }

    async function readRankingSnapshot() {
        const cached = readJsonStorage(KEY_LEVEL_RANKING, 30 * 60 * 1000);
        if (cached) return cached;

        let text;
        try {
            text = await readLevelPage(CONFIG.LEVEL_RANKING_TITLE, 30 * 1000);
        } catch (e) {
            return null;
        }
        if (!text) return null;

        const re = new RegExp(
            '<!--\\s*' + CONFIG.LEVEL_RANKING_MARKER + '_v' + CONFIG.LEVEL_RANKING_VERSION +
            ':(\\d{4}-\\d{2}-\\d{2}T[^|]+)\\|([\\s\\S]+?)\\s*-->',
            'g'
        );
        let last = null;
        let m;
        while ((m = re.exec(text)) !== null) {
            try {
                const obj = JSON.parse(m[2]);
                if (obj && Array.isArray(obj.rows)) {
                    last = {
                        ts: Math.floor(new Date(m[1]).getTime() / 1000),
                        rows: obj.rows
                    };
                }
            } catch (e) { /* ignore */ }
        }
        writeJsonStorage(KEY_LEVEL_RANKING, last);
        return last;
    }

    async function getCreatorMap(pageIds) {
        const cached = readJsonStorage(KEY_LEVEL_CREATORS, CONFIG.LEVEL_CREATOR_TTL_MS) || {};
        const wanted = new Set(pageIds);
        const missing = [];
        wanted.forEach(function (id) {
            if (cached[id] === undefined) missing.push(id);
        });

        if (missing.length) {
            const fetched = {};
            for (let i = 0; i < missing.length; i += 50) {
                const batch = missing.slice(i, i + 50);
                try {
                    const data = await getApi().get({
                        action: 'query', formatversion: 2,
                        pageids: batch.join('|'),
                        prop: 'revisions',
                        rvprop: 'user|timestamp',
                        rvslots: 'main',
                        rvlimit: 1,
                        rvdir: 'newer'
                    });
                    const pages = (data.query && data.query.pages) || [];
                    pages.forEach(function (p) {
                        if (!p || p.missing !== undefined) return;
                        const rev = p.revisions && p.revisions[0];
                        if (rev && rev.user) fetched[p.pageid] = rev.user;
                    });
                } catch (e) { /* ignore this batch */ }
            }
            missing.forEach(function (id) {
                if (fetched[id] === undefined) fetched[id] = '';
            });
            Object.assign(cached, fetched);
            writeJsonStorage(KEY_LEVEL_CREATORS, cached);
        }

        const out = {};
        wanted.forEach(function (id) {
            if (cached[id] !== undefined) out[id] = cached[id];
        });
        return out;
    }

    async function getWorkBonus(name) {
        const snapshot = await readRankingSnapshot();
        if (!snapshot || !snapshot.rows || !snapshot.rows.length) {
            return { bonus: 0, pages: 0, avg: null, failed: false };
        }

        const voted = snapshot.rows.filter(function (r) {
            return r && typeof r.pageId === 'number' &&
                typeof r.score === 'number' && isFinite(r.score) &&
                (r.count || 0) >= CONFIG.LEVEL_AVG_MIN_COUNT;
        });
        if (!voted.length) return { bonus: 0, pages: 0, avg: null, failed: false };

        let sum = 0;
        for (let i = 0; i < voted.length; i++) sum += voted[i].score;
        const avg = sum / voted.length;

        const creators = await getCreatorMap(voted.map(function (r) { return r.pageId; }));
        let bonus = 0;
        let pages = 0;

        const target = normUserName(name);
        for (let i = 0; i < voted.length; i++) {
            const r = voted[i];
            if (normUserName(creators[r.pageId]) !== target) continue;
            if (!(r.score > avg + 1e-9)) continue;
            const room = Math.max(0.5, CONFIG.LEVEL_VOTE_MAX - avg);
            const ratio = Math.min(1, (r.score - avg) / room);
            bonus += CONFIG.LEVEL_BONUS_PER_PAGE * ratio;
            pages++;
        }

        bonus = Math.min(CONFIG.LEVEL_BONUS_MAX, Math.round(bonus));
        return { bonus: bonus, pages: pages, avg: Math.round(avg * 100) / 100, failed: false };
    }

    function dimensionRatio(value, ref) {
        if (!(value > 0) || !(ref > 0)) return 0;
        return value / ref;
    }

    function computeScoreBreakdown(counts) {
        const ratios = {
            comment: dimensionRatio(counts.commentCount, CONFIG.LEVEL_REF.comment),
            login: dimensionRatio(counts.totalDays, CONFIG.LEVEL_REF.login),
            create: dimensionRatio(counts.createCount, CONFIG.LEVEL_REF.create),
            edit: dimensionRatio(counts.editCount, CONFIG.LEVEL_REF.edit)
        };

        let weighted = 0;
        const keys = Object.keys(CONFIG.LEVEL_WEIGHTS);
        keys.forEach(function (k) {
            weighted += CONFIG.LEVEL_WEIGHTS[k] * (ratios[k] || 0);
        });

        const detail = {};
        keys.forEach(function (k) {
            detail[k] = Math.round(
                CONFIG.LEVEL_BASE_SCORE_MAX * CONFIG.LEVEL_WEIGHTS[k] * (ratios[k] || 0)
            );
        });

        return {
            base: Math.round(weighted * CONFIG.LEVEL_BASE_SCORE_MAX),
            ratios: ratios,
            detail: detail
        };
    }

    function levelFromScore(score) {
        if (!(score > 0)) return 0;
        return Math.floor(Math.pow(score / CONFIG.LEVEL_THRESHOLD, 1 / CONFIG.LEVEL_EXP));
    }

    async function buildStats(name, rec) {
        const today = todayUTC();
        const metrics = await getMetrics(name);
        const dates = new Set(metrics.dates || []);

        if (rec) {
            bitmapToDates(rec.bitmap, today).forEach(function (d) { dates.add(d); });
        }
        dates.add(today);

        const totalDays = Math.max(dates.size, rec ? rec.totalDays : 0);
        const streak = Math.max(computeStreak(dates), rec ? rec.streak : 0);

        let bonusInfo;
        try {
            bonusInfo = await getWorkBonus(name);
        } catch (e) {
            bonusInfo = { bonus: 0, pages: 0, avg: null, failed: true };
        }

        const counts = {
            commentCount: metrics.commentCount || 0,
            totalDays: totalDays,
            createCount: metrics.createCount || 0,
            editCount: metrics.editCount || 0
        };
        const breakdown = computeScoreBreakdown(counts);
        const score = breakdown.base + (bonusInfo.bonus || 0);
        const level = levelFromScore(score);

        return {
            level: level,
            score: score,
            baseScore: breakdown.base,
            bonus: bonusInfo.bonus || 0,
            workPages: bonusInfo.pages || 0,
            workAvg: bonusInfo.avg,
            streak: streak,
            totalDays: totalDays,
            commentCount: counts.commentCount,
            createCount: counts.createCount,
            editCount: counts.editCount,
            partial: !!metrics.truncated || !!bonusInfo.failed,
            ts: Date.now()
        };
    }

    async function resolveExactLevel(name, rec) {
        const ui = readLevelFromSiteUi(name);
        if (typeof ui === 'number') {
            state.levelFresh.add(name);
            return { level: ui, partial: false, source: 'ui' };
        }

        const published = statsFromPublishedRecord(rec);
        if (published) {
            state.levelStats[name] = published;
            state.levelFresh.add(name);
            return published;
        }

        const local = readUserlevelStats(name);
        if (local) {
            state.levelStats[name] = local;
            if (!local.partial) state.levelFresh.add(name);
            return local;
        }

        const saved = readSavedStats(name);
        if (saved && !saved.partial) {
            state.levelStats[name] = saved;
            state.levelFresh.add(name);
            return saved;
        }

        const stats = await buildStats(name, rec);
        state.levelStats[name] = stats;
        saveStats(name, stats);
        if (!stats.partial) state.levelFresh.add(name);
        return stats;
    }

    function ensureLevels(names) {
        const todo = [];
        const seen = new Set();

        names.forEach(function (name) {
            if (!name || seen.has(name)) return;
            seen.add(name);
            if (mw.util.isIPAddress(name)) return;
            if (state.levelPending.has(name)) return;
            if (state.levelFresh.has(name)) return;
            if (state.levelFailedAt[name] &&
                Date.now() - state.levelFailedAt[name] < CONFIG.LEVEL_RETRY_MS) return;

            const ui = readLevelFromSiteUi(name);
            if (typeof ui === 'number') {
                state.levels[name] = ui;
                state.levelFresh.add(name);
                delete state.levelFailedAt[name];
                return;
            }

            todo.push(name);
        });

        if (!todo.length) return;

        // 自己优先；其他人在发请求前截断，避免为了 8 人读取上百个快照桶
        todo.sort(function (a, b) {
            if (a === state.me) return -1;
            if (b === state.me) return 1;
            return 0;
        });
        let othersKept = 0;
        const batch = [];
        for (let i = 0; i < todo.length; i++) {
            const n = todo[i];
            if (n !== state.me) {
                if (othersKept >= CONFIG.LEVEL_MAX_USERS_PER_ROUND) continue;
                othersKept++;
            }
            batch.push(n);
        }
        todo.length = 0;
        batch.forEach(function (n) { todo.push(n); });
        todo.forEach(function (n) { state.levelPending.add(n); });

        (async function () {
            let records = {};
            try {
                records = await fetchUserlevelRecords(todo);
            } catch (e) {
                records = {};
            }

            for (let i = 0; i < todo.length; i++) {
                const name = todo[i];
                try {
                    const rec = Object.prototype.hasOwnProperty.call(records, name)
                        ? records[name]
                        : null;
                    const stats = await resolveExactLevel(name, rec);

                    if (stats && typeof stats.level === 'number') {
                        state.levels[name] = stats.level;
                        if (stats.partial) {
                            state.levelFailedAt[name] = Date.now();
                        } else {
                            delete state.levelFailedAt[name];
                        }
                    } else {
                        state.levelFailedAt[name] = Date.now();
                    }
                } catch (e) {
                    state.levelFailedAt[name] = Date.now();
                }
                scheduleRender();
            }
        })().finally(function () {
            todo.forEach(function (n) { state.levelPending.delete(n); });
        });
    }

    // Gadget 可能在本组件之后才写好缓存；只补高值，不用低缓存覆盖已算对的结果。
    function refreshAuthoritativeLevels() {
        const names = new Set();
        state.messages.forEach(function (m) { names.add(m.user); });
        state.archivedMessages.forEach(function (m) { names.add(m.user); });
        if (!names.size) return;

        let changed = false;
        names.forEach(function (name) {
            if (!name || mw.util.isIPAddress(name)) return;

            const ui = readLevelFromSiteUi(name);
            if (typeof ui === 'number') {
                const current = state.levels[name];
                if (typeof current !== 'number' || ui > current || !state.levelFresh.has(name)) {
                    state.levels[name] = ui;
                    state.levelFresh.add(name);
                    delete state.levelFailedAt[name];
                    changed = true;
                }
                return;
            }

            const local = readUserlevelStats(name);
            if (local && typeof local.level === 'number') {
                const current = state.levels[name];
                if (typeof current !== 'number' || local.level > current) {
                    state.levels[name] = local.level;
                    state.levelStats[name] = local;
                    saveStats(name, local);
                    changed = true;
                }
            }
        });

        if (changed && state.open) scheduleRender();
    }


    /* ============================ 消息解析 ============================ */
    const LINE_RE = /^\*\s*\[([^\]]+)\]\s*([^：:]+)[：:]\s*([\s\S]*)$/;
    const TAG_RE = /<!--(recalled|deleted|tweet|reply):([^>]*)-->/g;

    function parseChatLine(line) {
        if (!line || line.charAt(0) !== '*') return null;
        const m = line.match(LINE_RE);
        if (!m) return null;

        const time = m[1].trim();
        const user = m[2].trim();
        if (!time || !user) return null;

        const raw = m[3];
        const status = { recalled: false, deleted: false, tweet: null, reply: null };

        TAG_RE.lastIndex = 0;
        let tag;
        while ((tag = TAG_RE.exec(raw))) {
            if (tag[1] === 'recalled') status.recalled = true;
            else if (tag[1] === 'deleted') status.deleted = true;
            else if (tag[1] === 'tweet') status.tweet = tag[2].trim();
            else if (tag[1] === 'reply') {
                const parts = tag[2].split('|');
                if (parts.length >= 3) {
                    status.reply = {
                        time: parts[0],
                        user: parts[1],
                        excerpt: b64urlDecode(parts.slice(2).join('|'))
                    };
                }
            }
        }

        TAG_RE.lastIndex = 0;
        const text = raw.replace(TAG_RE, '').replace(/\s+$/, '');
        if (!text && !status.tweet && !status.reply) return null;

        return {
            time: time,
            user: user,
            raw: raw,
            text: text,
            status: status,
            key: time + '|' + user + '|' + text
        };
    }

    function parseChatText(text) {
        const out = [];
        let src = String(text || '');
        if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1); // 去掉 BOM
        src.split('\n').forEach(function (line) {
            const m = parseChatLine(line);
            if (m) out.push(m);
        });
        return out;
    }

    async function fetchChatContent() {
        const data = await getApi().get({
            action: 'query', formatversion: 2,
            prop: 'revisions', rvprop: 'content|ids', rvslots: 'main',
            titles: CONFIG.CHAT_PAGE
        });
        const page = data.query && data.query.pages && data.query.pages[0];
        if (!page || page.missing) return { text: '', revid: null };
        const rev = page.revisions && page.revisions[0];
        const content = (rev && rev.slots && rev.slots.main && rev.slots.main.content) ||
            (rev && rev.content) || '';
        return { text: content, revid: rev ? rev.revid : null };
    }

    async function readChatPage(force) {
        if (!force && state.loaded) {
            return { text: state.content, revid: state.revid };
        }
        return fetchChatContent();
    }

    /* ============================ 轮询 ============================ */
    function schedulePoll(delay) {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
        if (document.hidden || state.lockedOut) return;

        const wait = typeof delay === 'number'
            ? delay
            : (state.open ? CONFIG.POLL_OPEN_MS : CONFIG.POLL_CLOSED_MS);

        state.pollTimer = setTimeout(function () {
            state.pollTimer = null;
            pollOnce().then(function () { schedulePoll(); });
        }, wait);
    }

    function pollNow() {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
        if (document.hidden) return;
        pollOnce().then(function () { schedulePoll(); });
    }

    async function pollOnce() {
        if (state.polling) return;
        if (document.hidden || state.lockedOut) return;

        // 低频严格复查：运行中被加入黑名单时尽快卸载 UI
        if (state.me && !state.blacklisted) {
            const interval = state.open
                ? CONFIG.BLACKLIST_RECHECK_OPEN_MS
                : CONFIG.BLACKLIST_RECHECK_CLOSED_MS;
            if (Date.now() - state.lastBlacklistCheck >= interval) {
                state.lastBlacklistCheck = Date.now();
                recheckBlacklist();
            }
        }

        state.polling = true;
        try {
            // 先只取 revid，内容未变化时不拉全文
            const head = await getApi().get({
                action: 'query', formatversion: 2,
                prop: 'revisions', rvprop: 'ids',
                titles: CONFIG.CHAT_PAGE
            });
            const page = head.query && head.query.pages && head.query.pages[0];
            if (!page) return;
            const rev = page.revisions && page.revisions[0];
            const revid = rev ? rev.revid : null;

            if (state.loaded && revid === state.revid) return;

            const full = await fetchChatContent();
            applyContent(full.text, full.revid);
        } catch (e) {
            // 网络抖动、API 限流等：静默，下一轮继续
        } finally {
            state.polling = false;
        }
    }

    function applyContent(text, revid) {
        const first = !state.initialized;
        const oldLive = state.messages;
        const oldLen = state.messages.length;
        const oldVisibleCount = Math.max(CONFIG.INITIAL_VISIBLE, state.visibleCount);
        const oldVisibleStart = Math.max(0, oldLen - oldVisibleCount);
        const wasNearBottom = !state.open || isNearBottom();
        const oldKeys = new Set(state.messages.map(function (m) { return m.key; }));
        const messages = parseChatText(text);

        // 服务端已经出现同 key 的消息 -> 清掉乐观更新
        const serverKeys = new Set(messages.map(function (m) { return m.key; }));
        state.pending.forEach(function (p, key) {
            if (serverKeys.has(key)) state.pending.delete(key);
        });

        state.messages = messages;
        state.content = String(text || '');
        state.revid = revid;
        state.loaded = true;
        state.initialized = true;

        // 分页窗口：新消息到达时，尽量保持用户正在阅读的旧消息边界。
        // oldLen > 0 很重要：首次加载必须只展示最近 INITIAL_VISIBLE 条，
        // 不能因为“空数组算全部已加载”而把整页历史一次性铺开。
        const delta = messages.length - oldLen;
        if (delta > 0 && oldLen > 0) {
            if (state.visibleCount >= oldLen) {
                // 之前已经加载了全部历史，继续全部显示
                state.visibleCount = messages.length;
            } else if (state.visibleCount > CONFIG.INITIAL_VISIBLE || !wasNearBottom) {
                // 用户已经加载过更多历史，或正停在中间阅读：窗口随之扩大
                state.visibleCount += delta;
            }
        }
        state.visibleCount = Math.max(
            CONFIG.INITIAL_VISIBLE,
            Math.min(state.visibleCount, messages.length)
        );

        // 被归档移出实时页的消息，只有原本就在当前可见窗口里的才保留到
        // 本地归档展示，避免一次归档就把整段历史重新铺进 DOM；
        // 如果它们因为网络抖动又回到实时页，prune 会自动去重。
        pruneArchivedLiveDuplicates();
        const newKeySet = new Set(messages.map(function (m) { return m.key; }));
        if (state.open) {
            const removed = [];
            for (let i = oldVisibleStart; i < oldLive.length; i++) {
                const m = oldLive[i];
                if (!newKeySet.has(m.key)) removed.push(m);
            }
            if (removed.length) addArchivedMessages(removed, false);
        }

        // 一旦有归档内容，实时页全部显示，保证“归档在上、实时在下”的顺序
        if (state.archivedMessages.length) {
            state.visibleCount = Math.max(state.visibleCount, messages.length);
        }

        const users = new Set();
        messages.forEach(function (m) { users.add(m.user); });
        state.archivedMessages.forEach(function (m) { users.add(m.user); });
        if (state.me) users.add(state.me);
        state.userSet = users;

        // @ 提及提醒：首屏基线不弹；之后不论面板是否展开都提醒
        if (!first && state.me) {
            messages.forEach(function (m) {
                if (oldKeys.has(m.key) || state.notified.has(m.key)) return;
                if (m.user === state.me) return;
                if (m.status.recalled || m.status.deleted) return;
                if (!mentionsUser(m.text, state.me)) return;
                state.notified.add(m.key);
                showMentionNotice(m);
            });
        }

        if (state.open) decorateUsers();
        scheduleRender();
        maybeArchive();
    }

    function mentionsUser(text, name) {
        if (!text || !name) return false;
        const re = new RegExp('@' + escapeRegExp(name) + '(?![\\w\\u4e00-\\u9fa5.-])');
        return re.test(text);
    }

    function decorateUsers() {
        const names = state.messages.map(function (m) { return m.user; });
        state.archivedMessages.forEach(function (m) { names.push(m.user); });
        ensureAvatars(names);
        ensureLevels(names);
    }

    /* ============================ 自动归档 ============================
     * 归档流程是“先复制、后裁剪”：
     *   1. 把最旧的 ARCHIVE_BATCH 条消息以 createonly 写入
     *      Storage:Chat/Archive/<内容指纹>
     *   2. 用 baserevid 从实时页移除这批消息
     * 任何一步失败都不会丢消息：复制失败就不裁剪；裁剪冲突就保留实时页。
     * 归档页只创建、不编辑、不删除；同一批内容重复执行会命中同一标题。
     */
    function readArchiveStamp() {
        try {
            const n = Number(mw.storage.get(KEY_ARCHIVE));
            if (n) state.lastArchive = n;
        } catch (e) { /* ignore */ }
    }

    function archiveNamespaceInfo() {
        try {
            const t = mw.Title.newFromText(CONFIG.CHAT_PAGE);
            if (t && typeof t.namespace === 'number') {
                return { ns: t.namespace, prefix: t.title + '/Archive/' };
            }
        } catch (e) { /* ignore */ }
        return { ns: 0, prefix: CONFIG.ARCHIVE_PAGE_PREFIX };
    }

    async function fetchArchiveTitles() {
        const info = archiveNamespaceInfo();
        const titles = [];
        const seen = new Set();
        let cont = {};
        let guard = 0;

        while (guard++ < 20) {
            const params = Object.assign({
                action: 'query', formatversion: 2, list: 'allpages',
                apnamespace: info.ns,
                apprefix: info.prefix,
                aplimit: 'max',
                apfilterredir: 'nonredirects'
            }, cont);
            const data = await getApi().get(params);
            (data.query && data.query.allpages || []).forEach(function (p) {
                if (!p || !p.title || seen.has(p.title)) return;
                seen.add(p.title);
                titles.push(p.title);
            });
            if (data.continue) cont = data.continue;
            else break;
        }
        return titles;
    }

    async function fetchArchiveTimestamps(titles) {
        const out = [];
        for (let i = 0; i < titles.length; i += 50) {
            const chunk = titles.slice(i, i + 50);
            let data;
            try {
                data = await getApi().get({
                    action: 'query', formatversion: 2,
                    prop: 'revisions', rvprop: 'timestamp',
                    titles: chunk.join('|')
                });
            } catch (e) {
                continue;
            }
            const pages = (data.query && data.query.pages) || [];
            pages.forEach(function (p) {
                if (!p || p.missing || !p.title) return;
                const rev = p.revisions && p.revisions[0];
                let ts = rev && rev.timestamp ? Date.parse(rev.timestamp) : 0;
                if (isNaN(ts)) ts = 0;
                out.push({ title: p.title, ts: ts });
            });
        }
        return out;
    }

    let archiveIndexPromise = null;

    function ensureArchiveIndex(force) {
        if (archiveIndexPromise) return archiveIndexPromise;
        if (!force && state.archiveIndexKnown &&
            Date.now() - state.archiveIndexTs < CONFIG.ARCHIVE_INDEX_TTL_MS) {
            return Promise.resolve();
        }

        archiveIndexPromise = (async function () {
            try {
                const titles = await fetchArchiveTitles();
                const list = await fetchArchiveTimestamps(titles);
                list.sort(function (a, b) {
                    if (a.ts !== b.ts) return a.ts - b.ts;
                    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
                });
                state.archiveIndex = list;
                state.archiveIndexTs = Date.now();
                state.archiveIndexKnown = true;
                scheduleRender();

                // 已加载过归档的用户：补上新产生的、比已加载部分更新的归档段。
                // 只有已经加载过服务端归档段（oldestTs 有限）时才这样做，
                // 否则本地“刚移出实时页”的消息会在排序上被放到新段之后。
                if (state.archivedMessages.length && state.archiveOldestTs !== Infinity) {
                    loadNewerArchiveParts();
                }
            } catch (e) {
                // 保留旧索引；下次再试
            }
        })().finally(function () {
            archiveIndexPromise = null;
        });

        return archiveIndexPromise;
    }

    async function fetchArchiveContent(title) {
        const data = await getApi().get({
            action: 'query', formatversion: 2,
            prop: 'revisions', rvprop: 'content', rvslots: 'main',
            titles: title
        });
        const page = data.query && data.query.pages && data.query.pages[0];
        if (!page || page.missing) return '';
        const rev = page.revisions && page.revisions[0];
        return (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '';
    }

    function archiveCandidates() {
        return state.archiveIndex.filter(function (p) {
            if (state.archiveLoaded.has(p.title)) return false;
            if (state.archiveOldestTs === Infinity) return true;
            if (p.ts < state.archiveOldestTs) return true;
            if (p.ts === state.archiveOldestTs && state.archiveOldestTitle &&
                p.title < state.archiveOldestTitle) return true;
            return false;
        });
    }

    function archiveHasOlder() {
        if (!state.archiveIndexKnown) return true;
        return archiveCandidates().length > 0;
    }

    function addArchivedMessages(list, atFront) {
        if (!list || !list.length) return 0;
        const liveKeys = new Set(state.messages.map(function (m) { return m.key; }));
        const fresh = [];

        list.forEach(function (m) {
            if (!m || liveKeys.has(m.key) || state.archivedKeys.has(m.key)) return;
            m.archived = true;
            state.archivedKeys.add(m.key);
            fresh.push(m);
        });
        if (!fresh.length) return 0;

        state.archivedMessages = atFront
            ? fresh.concat(state.archivedMessages)
            : state.archivedMessages.concat(fresh);
        fresh.forEach(function (m) { state.userSet.add(m.user); });
        return fresh.length;
    }

    // 如果某条消息又回到实时页，从本地归档展示里移除，避免重复
    function pruneArchivedLiveDuplicates() {
        if (!state.archivedMessages.length) return;
        const liveKeys = new Set(state.messages.map(function (m) { return m.key; }));
        const kept = state.archivedMessages.filter(function (m) {
            return !liveKeys.has(m.key);
        });
        if (kept.length === state.archivedMessages.length) return;
        state.archivedMessages = kept;
        state.archivedKeys = new Set(kept.map(function (m) { return m.key; }));
    }

    function maybeArchive() {
        if (!CONFIG.ARCHIVE_ENABLED) return;
        if (!isLoggedIn() || state.blacklisted || state.lockedOut) return;
        if (state.archiving) return;
        if (state.messages.length <= CONFIG.ARCHIVE_THRESHOLD) return;
        if (Date.now() - state.lastArchive < CONFIG.ARCHIVE_COOLDOWN_MS) return;

        state.lastArchive = Date.now();
        try { mw.storage.set(KEY_ARCHIVE, String(state.lastArchive)); } catch (e) { /* ignore */ }
        runArchive().catch(function () { /* 失败不阻断聊天 */ });
    }

    async function runArchive() {
        if (state.archiving) return;
        state.archiving = true;
        try {
            guardWrite();
            const page = await readChatPage(true);
            const lines = page.text.split('\n');

            const msgLines = [];
            lines.forEach(function (line, i) {
                if (parseChatLine(line)) msgLines.push(i);
            });
            if (msgLines.length <= CONFIG.ARCHIVE_THRESHOLD) return;
            if (!page.revid) return; // 没有 revid 就无法安全裁剪

            const movable = msgLines.length - CONFIG.ARCHIVE_KEEP_LIVE;
            if (movable <= 0) return;
            const moveCount = Math.min(CONFIG.ARCHIVE_BATCH, movable);
            if (moveCount <= 0) return;

            // 把第 moveCount 条消息所在的原始行也一起搬走，未解析行一并保留
            const cutIndex = msgLines[moveCount - 1] + 1;
            const batchLines = lines.slice(0, cutIndex);
            const batchText = batchLines.join('\n');
            if (!batchText.trim()) return;

            const archiveTitle = CONFIG.ARCHIVE_PAGE_PREFIX + hash64(batchText);
            const api = getApi();

            // 1) 先复制到归档页（createonly；标题由内容指纹决定，重试幂等）
            await waitWriteBudget();
            if (!(await enforceBlacklist())) return;

            let archived = false;
            try {
                await api.postWithToken('csrf', {
                    action: 'edit',
                    title: archiveTitle,
                    text: batchText,
                    summary: editSummary('自动归档聊天记录'),
                    createonly: 1,
                    formatversion: 2,
                    assert: 'user',
                    watchlist: 'nochange'
                });
                archived = true;
            } catch (e) {
                if (e === 'articleexists' || (e && e.code === 'articleexists')) {
                    // 已存在同名归档页时，必须核对内容确实是这一批消息，
                    // 防止标题碰撞或恶意预建页面导致实时消息被误删。
                    try {
                        const existing = await fetchArchiveContent(archiveTitle);
                        const norm = function (t) {
                            return String(t || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
                        };
                        archived = norm(existing) === norm(batchText);
                    } catch (verifyError) {
                        archived = false;
                    }
                }
            }
            if (!archived) return; // 复制/校验失败：绝不裁剪

            if (!CONFIG.ARCHIVE_TRIM_LIVE) {
                // 只备份不移动：实时页保持原样，历史仍全部保留在 Storage:Chat
                state.archiveIndexTs = 0;
                state.archiveIndexKnown = false;
                return;
            }

            // 2) 再从实时页移除。归档页已经写好，裁剪可以安全重试：
            //    每次冲突都重新读取实时页，确认这批消息仍是页面前缀后再裁。
            try {
                await enqueueChatWrite(function () {
                    return withEditConflictRetry(async function () {
                        const fresh = await readChatPage(true);
                        const freshText = String(fresh.text || '');
                        if (freshText.indexOf(batchText) !== 0) {
                            throw new Error('archive-prefix-changed');
                        }
                        let remaining = freshText.slice(batchText.length);
                        if (remaining.charAt(0) === '\n') remaining = remaining.slice(1);

                        await waitWriteBudget();
                        if (!(await enforceBlacklist())) {
                            throw new Error('blacklist');
                        }
                        const params = {
                            action: 'edit',
                            title: CONFIG.CHAT_PAGE,
                            text: remaining,
                            summary: editSummary('归档并移出旧消息'),
                            formatversion: 2,
                            assert: 'user',
                            watchlist: 'nochange'
                        };
                        if (fresh.revid) params.baserevid = fresh.revid;
                        await getApi().postWithToken('csrf', params);
                        return true;
                    }, 8, '归档裁剪排队中');
                });
            } catch (e) {
                // 前缀已变/持续冲突：实时页保持原样；归档页已保存，不会丢消息
                return;
            }

            state.archiveIndexTs = 0;
            state.archiveIndexKnown = false;
            state.revid = undefined;
            pollNow();
        } catch (e) {
            // 静默失败，冷却后再试
        } finally {
            state.archiving = false;
        }
    }

    async function loadArchiveOlder() {
        if (state.archiveLoading || state.lockedOut) return;
        state.archiveLoading = true;
        scheduleRender();

        try {
            if (!state.archiveIndexKnown) await ensureArchiveIndex(true);
            if (!state.archiveIndexKnown) return;

            for (let guard = 0; guard < 10; guard++) {
                const candidates = archiveCandidates();
                if (!candidates.length) return;

                candidates.sort(function (a, b) {
                    if (a.ts !== b.ts) return a.ts - b.ts;
                    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
                });
                // 从最接近实时消息的一段开始，向更早的方向加载
                const part = candidates[candidates.length - 1];

                const text = await fetchArchiveContent(part.title);
                state.archiveLoaded.add(part.title);

                if (state.archiveOldestTs === Infinity ||
                    part.ts < state.archiveOldestTs ||
                    (part.ts === state.archiveOldestTs &&
                        part.title < state.archiveOldestTitle)) {
                    state.archiveOldestTs = part.ts;
                    state.archiveOldestTitle = part.title;
                }
                state.archiveNewestTs = Math.max(state.archiveNewestTs, part.ts);

                const msgs = parseChatText(text);
                const added = addArchivedMessages(msgs, true);
                if (added > 0) {
                    // 展示归档后，把实时页也全部显示，保证边界顺序正确
                    state.visibleCount = Math.max(state.visibleCount, state.messages.length);
                    decorateUsers();
                    state.preserveScrollAnchor = true;
                    renderMessages();
                    return;
                }
                // 这一段全是重复，继续向更早的一段找
            }
        } catch (e) {
            // 静默；用户可以再次上滑重试
        } finally {
            state.archiveLoading = false;
            scheduleRender();
        }
    }

    let archiveNewerLoading = false;

    // 补加载“比已加载归档段更新”的归档段（例如面板关闭期间别人归档的新批次）。
    // 这些段应追加在已有归档块之后、实时消息之前。
    async function loadNewerArchiveParts() {
        if (archiveNewerLoading || state.archiveLoading || state.lockedOut) return;
        if (!state.archivedMessages.length || state.archiveOldestTs === Infinity) return;

        archiveNewerLoading = true;
        try {
            const candidates = state.archiveIndex.filter(function (p) {
                return !state.archiveLoaded.has(p.title) && p.ts > state.archiveNewestTs;
            }).sort(function (a, b) {
                if (a.ts !== b.ts) return a.ts - b.ts;
                return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
            });

            let addedTotal = 0;
            for (let i = 0; i < candidates.length && i < 5; i++) {
                if (state.lockedOut) break;
                const part = candidates[i];
                let text;
                try {
                    text = await fetchArchiveContent(part.title);
                } catch (e) {
                    continue;
                }
                state.archiveLoaded.add(part.title);
                state.archiveNewestTs = Math.max(state.archiveNewestTs, part.ts);
                addedTotal += addArchivedMessages(parseChatText(text), false);
            }

            if (addedTotal) {
                decorateUsers();
                if (state.open) scheduleRender();
            }
        } catch (e) {
            // 静默
        } finally {
            archiveNewerLoading = false;
        }
    }

    /* ============================ 渲染 ============================ */
    // 注：本组件不做任何“压缩/截断”写入；旧消息只会被移动到归档页。
    // 初始渲染最近 INITIAL_VISIBLE 条，向上可继续加载实时历史与归档。
    function isNearBottom() {
        const scroll = els.scroll;
        if (!scroll) return true;
        return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
    }

    function hasHiddenLive() {
        return state.messages.length > Math.max(CONFIG.INITIAL_VISIBLE, state.visibleCount);
    }

    function hasOlderHistory() {
        if (hasHiddenLive()) return true;
        if (!state.archiveIndexKnown) return true;
        return archiveHasOlder();
    }

    function loadOlderMessages() {
        if (!state.open || state.lockedOut) return;

        if (hasHiddenLive()) {
            if (state.loadingOlder) return;
            state.loadingOlder = true;
            state.preserveScrollAnchor = true;
            state.visibleCount = Math.min(
                state.messages.length,
                Math.max(CONFIG.INITIAL_VISIBLE, state.visibleCount) + CONFIG.LOAD_MORE_STEP
            );
            renderMessages();
            setTimeout(function () { state.loadingOlder = false; }, 0);
            return;
        }

        if (state.archiveIndexKnown && !archiveHasOlder()) return;
        loadArchiveOlder();
    }

    function scheduleRender() {
        if (!state.open) return;
        if (state.renderTimer) return;
        state.renderTimer = setTimeout(function () {
            state.renderTimer = null;
            renderMessages();
        }, 50);
    }

    function buildLoadMoreButton(hiddenLive) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mwchat-more';

        if (state.archiveLoading) {
            btn.textContent = '正在加载归档…';
            btn.disabled = true;
        } else if (hiddenLive > 0) {
            btn.textContent = '加载更早的消息（还有 ' + hiddenLive + ' 条）';
        } else if (!state.archiveIndexKnown) {
            btn.textContent = '查找并加载更早的归档';
        } else {
            btn.textContent = '加载更早的归档消息';
        }

        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            loadOlderMessages();
        });
        return btn;
    }

    function renderMessages() {
        if (!els.list) return;
        const scroll = els.scroll;
        const nearBottom = isNearBottom();
        const prevTop = scroll ? scroll.scrollTop : 0;
        const prevHeight = scroll ? scroll.scrollHeight : 0;
        const preserveAnchor = state.preserveScrollAnchor;
        state.preserveScrollAnchor = false;

        collectAvatarPool();
        const frag = document.createDocumentFragment();
        const ctx = { me: state.me, isAdmin: state.isAdmin };

        const total = state.messages.length;
        const count = Math.max(CONFIG.INITIAL_VISIBLE, state.visibleCount);
        const start = Math.max(0, total - count);
        const visibleLive = start > 0 ? state.messages.slice(start) : state.messages;
        const archived = state.archivedMessages;

        if (hasOlderHistory()) frag.appendChild(buildLoadMoreButton(start));

        if (!archived.length && !total && !state.pending.size) {
            const empty = document.createElement('div');
            empty.className = 'mwchat-empty';
            empty.textContent = '还没有聊天记录，来打个招呼吧。';
            frag.appendChild(empty);
        }

        archived.forEach(function (m) {
            try {
                frag.appendChild(buildMessageRow(m, ctx));
            } catch (e) {
                frag.appendChild(buildFallbackRow(m));
            }
        });

        if (archived.length && (visibleLive.length || state.pending.size)) {
            const divider = document.createElement('div');
            divider.className = 'mwchat-divider';
            divider.textContent = '以下为实时消息';
            frag.appendChild(divider);
        }

        visibleLive.forEach(function (m) {
            try {
                frag.appendChild(buildMessageRow(m, ctx));
            } catch (e) {
                frag.appendChild(buildFallbackRow(m));
            }
        });
        state.pending.forEach(function (m) {
            try {
                frag.appendChild(buildMessageRow(m, ctx));
            } catch (e) {
                frag.appendChild(buildFallbackRow(m));
            }
        });

        els.list.textContent = '';
        els.list.appendChild(frag);

        if (preserveAnchor && scroll) {
            // 向上加载：保持用户原先看到的第一条消息位置不跳动
            scroll.scrollTop = prevTop + (scroll.scrollHeight - prevHeight);
        } else if (nearBottom) {
            scrollToBottom();
        } else if (scroll) {
            scroll.scrollTop = prevTop;
        }
    }

    function buildFallbackRow(m) {
        const row = document.createElement('div');
        row.className = 'mwchat-row';
        const body = document.createElement('div');
        body.className = 'mwchat-body';
        body.textContent = (m.user || '未知') + '：' + (m.text || '');
        row.appendChild(body);
        return row;
    }

    function buildMessageRow(m, ctx) {
        const row = document.createElement('div');
        row.className = 'mwchat-row';
        if (m.status.recalled) row.classList.add('is-recalled');
        if (m.status.deleted) row.classList.add('is-deleted');
        if (m.status.tweet) row.classList.add('is-tweet');
        if (m.pending) row.classList.add('is-pending');
        if (m.archived) row.classList.add('is-archived');

        // 头像：有 ID 用图片，无 ID 或加载失败用首字母占位。
        // takeAvatar 会优先复用上一轮已经加载好的节点，避免重绘时重复请求。
        const userUrl = mw.util.getUrl('User:' + m.user);
        let avatar = takeAvatar(m.user);
        if (avatar.dataset && avatar.dataset.failed === '1') {
            avatar = buildInitialAvatar(m.user);
        }
        avatar.title = m.user;
        bindAvatarClick(avatar, m.user);

        // 用户名 + 等级徽章
        const name = document.createElement('a');
        name.className = 'mwchat-name';
        name.href = userUrl;
        name.textContent = m.user;

        const level = Object.prototype.hasOwnProperty.call(state.levels, m.user)
            ? state.levels[m.user]
            : null;
        if (typeof level === 'number') {
            const lv = document.createElement('span');
            lv.className = 'mwchat-lv lv-tier-' + levelToTier(level);
            lv.textContent = 'Lv' + level;
            lv.title = '活跃等级 Lv' + level;
            name.appendChild(lv);
        }

        // 时间
        const time = document.createElement('span');
        time.className = 'mwchat-time';
        time.textContent = m.time;

        // 正文
        const body = document.createElement('div');
        body.className = 'mwchat-body';
        if (m.status.deleted) {
            body.textContent = '（此消息已被管理员删除）';
            body.classList.add('mwchat-placeholder');
        } else if (m.status.recalled) {
            body.textContent = '（此消息已撤回）';
            body.classList.add('mwchat-placeholder');
        } else {
            if (m.status.reply) body.appendChild(buildReplyQuote(m.status.reply));
            if (m.status.tweet) {
                body.appendChild(buildTweetCard(m.status.tweet, m.text));
            } else {
                appendMentionText(body, m.text);
            }
        }

        row.append(avatar, time, name, body, buildRowActions(m, ctx));
        return row;
    }

    function buildRowActions(m, ctx) {
        const box = document.createElement('div');
        box.className = 'mwchat-actions';

        if (m.pending || m.status.recalled || m.status.deleted) return box;
        if (!ctx.me) return box;

        box.appendChild(actionButton('回复', 'mwchat-act-reply', function () {
            startReply(m);
        }));

        // 归档消息本身只读：可以回复，但不能撤回/删除
        if (m.archived) return box;

        if (m.user === ctx.me) {
            box.appendChild(actionButton('撤回', 'mwchat-act-recall', function () {
                return recallMessage(m);
            }));
        } else if (ctx.isAdmin) {
            box.appendChild(actionButton('删除', 'mwchat-act-delete', function () {
                return deleteMessage(m);
            }));
            box.appendChild(actionButton('拉黑', 'mwchat-act-blacklist', function () {
                return blacklistUser(m.user);
            }));
        }
        return box;
    }

    function actionButton(label, cls, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mwchat-action ' + cls;
        b.textContent = label;
        b.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            Promise.resolve().then(fn).catch(function (e) {
                setStatus('操作失败：' + describeError(e), true);
            });
        });
        return b;
    }

    function displayPageName(page) {
        return String(page || '').replace(/_/g, ' ');
    }

    function replyExcerpt(target) {
        return String(target && target.text ? target.text : '')
            .replace(/^📢\s*/, '')
            .replace(/\[\[([^\]]+)\]\]/g, '$1')
            .trim()
            .slice(0, CONFIG.REPLY_EXCERPT_LEN);
    }

    function buildReplyTag(target) {
        return '<!--reply:' + target.time + '|' + target.user + '|' +
            b64urlEncode(replyExcerpt(target)) + '-->';
    }

    function buildReplyQuote(reply) {
        const box = document.createElement('div');
        box.className = 'mwchat-reply-quote';

        const icon = document.createElement('span');
        icon.className = 'mwchat-reply-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 7L4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6v1"/></svg>';

        const who = document.createElement('span');
        who.className = 'mwchat-reply-user';
        who.textContent = '@' + reply.user;

        const text = document.createElement('span');
        text.className = 'mwchat-reply-text';
        text.textContent = reply.excerpt || '原消息';

        box.append(icon, who, text);
        return box;
    }

    function buildTweetCard(page, text) {
        const card = document.createElement('div');
        card.className = 'mwchat-tweet';

        const icon = document.createElement('span');
        icon.className = 'mwchat-tweet-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 ' +
            '1 0 0 1 1-1z"/><path d="M14 3.5V8h4M8.5 12h7M8.5 15.5h5"/></svg>';

        const main = document.createElement('div');
        main.className = 'mwchat-tweet-main';

        const head = document.createElement('div');
        head.className = 'mwchat-tweet-head';

        const label = document.createElement('span');
        label.className = 'mwchat-tweet-label';
        label.textContent = '推文';

        const link = document.createElement('a');
        link.className = 'mwchat-tweet-link';
        link.textContent = displayPageName(page);
        try {
            link.href = mw.util.getUrl(page);
        } catch (e) {
            link.href = '#';
        }
        link.title = displayPageName(page);

        head.appendChild(label);
        head.appendChild(link);
        main.appendChild(head);

        const note = String(text || '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/^📢\s*/, '')
            .replace(/\[\[[^\]]*\]\]/g, '')
            .trim();

        if (note) {
            const noteEl = document.createElement('div');
            noteEl.className = 'mwchat-tweet-note';
            noteEl.textContent = note;
            main.appendChild(noteEl);
        }

        card.appendChild(icon);
        card.appendChild(main);
        return card;
    }

    // 高亮 @用户名
    let mentionReCache = { sig: '', re: null };

    function getMentionRegex() {
        const names = Array.from(state.userSet).filter(function (n) { return !!n; });
        const sig = names.join('\n');
        if (mentionReCache.sig === sig && mentionReCache.re) return mentionReCache.re;

        const alt = names
            .slice()
            .sort(function (a, b) { return b.length - a.length; })
            .map(escapeRegExp);

        const pattern = '@(?:' +
            (alt.length ? alt.join('|') + '|' : '') +
            '[\\w\\u4e00-\\u9fa5][\\w\\u4e00-\\u9fa5.\\-]{0,31})';

        mentionReCache = { sig: sig, re: new RegExp(pattern, 'g') };
        return mentionReCache.re;
    }

    function appendMentionText(body, text) {
        const str = String(text || '');
        const re = getMentionRegex();
        re.lastIndex = 0;

        let last = 0;
        let m;
        while ((m = re.exec(str))) {
            if (!m[0]) { re.lastIndex++; continue; }
            if (m.index > last) {
                body.appendChild(document.createTextNode(str.slice(last, m.index)));
            }
            const span = document.createElement('span');
            span.className = 'mwchat-mention';
            span.textContent = m[0];
            body.appendChild(span);
            last = m.index + m[0].length;
        }
        if (last < str.length) {
            body.appendChild(document.createTextNode(str.slice(last)));
        }
    }

    function scrollToBottom() {
        if (!els.scroll) return;
        els.scroll.scrollTop = els.scroll.scrollHeight;
    }

    function scrollToBottomSoon() {
        requestAnimationFrame(scrollToBottom);
    }

    /* ============================ 状态提示 / @ 提醒 ============================ */
    function setStatus(msg, isError) {
        if (!els.status) return;
        els.status.textContent = msg || '';
        els.status.classList.toggle('is-error', !!isError);
        els.status.classList.toggle('is-visible', !!msg);
        clearTimeout(state.statusTimer);
        if (msg) {
            state.statusTimer = setTimeout(function () {
                if (!els.status) return;
                els.status.textContent = '';
                els.status.classList.remove('is-visible');
            }, 5000);
        }
    }

    /* 右上角 @ 提醒：与面板开关无关，始终弹出；最多同时 3 条 */
    function ensureNoticeStack() {
        if (state.noticeStack && state.noticeStack.parentNode) {
            return state.noticeStack;
        }
        const stack = document.createElement('div');
        stack.className = 'mwchat-notice-stack';
        document.body.appendChild(stack);
        state.noticeStack = stack;
        state.noticeCards = [];
        return stack;
    }

    function removeNoticeCard(card) {
        if (card && card.parentNode) card.parentNode.removeChild(card);
        state.noticeCards = state.noticeCards.filter(function (c) { return c !== card; });
    }

    function clearNoticeStack() {
        if (state.noticeStack && state.noticeStack.parentNode) {
            state.noticeStack.parentNode.removeChild(state.noticeStack);
        }
        state.noticeStack = null;
        state.noticeCards = [];
    }

    function showMentionNotice(msg) {
        if (!document.body || state.lockedOut) return;
        const stack = ensureNoticeStack();

        const card = document.createElement('div');
        card.className = 'mwchat-notice';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;

        const title = document.createElement('div');
        title.className = 'mwchat-notice-title';
        title.textContent = msg.user + '正在at你';

        const text = document.createElement('div');
        text.className = 'mwchat-notice-text';
        text.textContent = msg.text.length > 80 ? msg.text.slice(0, 80) + '…' : msg.text;

        card.appendChild(title);
        card.appendChild(text);

        const close = function () { removeNoticeCard(card); };
        const jump = function () {
            close();
            try {
                if (state.open) {
                    // 面板已展开：直接滚到最新消息（被 @ 的消息就在最近窗口内）
                    scrollToBottom();
                    if (els.input) {
                        try { els.input.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
                    }
                } else {
                    try { open(); } catch (e) { /* locked out */ }
                }
            } catch (e) { /* locked out */ }
        };

        card.addEventListener('click', jump);
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                jump();
            }
        });

        stack.appendChild(card);
        state.noticeCards.push(card);

        while (state.noticeCards.length > 3) {
            removeNoticeCard(state.noticeCards[0]);
        }

        setTimeout(close, CONFIG.NOTICE_MS);
    }

    /* ============================ @ 候选列表 ============================ */
    function mentionCandidates(query) {
        const names = [];
        const seen = new Set();

        for (let i = state.messages.length - 1; i >= 0 && names.length < 60; i--) {
            const u = state.messages[i].user;
            if (!u || u === state.me || seen.has(u)) continue;
            seen.add(u);
            names.push(u);
        }
        state.userSet.forEach(function (u) {
            if (!u || u === state.me || seen.has(u)) return;
            seen.add(u);
            names.push(u);
        });

        const q = String(query || '').toLowerCase();
        return names.filter(function (n) {
            return !q || n.toLowerCase().indexOf(q) !== -1;
        }).slice(0, CONFIG.MENTION_MAX);
    }

    function renderMentionList() {
        if (!els.mentions) return;
        els.mentions.textContent = '';

        if (!state.mention.open || !state.mention.items.length) {
            els.mentions.classList.remove('is-open');
            return;
        }

        state.mention.items.forEach(function (name, idx) {
            const item = document.createElement('div');
            item.className = 'mwchat-mention-item' +
                (idx === state.mention.index ? ' is-active' : '');
            item.appendChild(buildInitialAvatar(name));

            const label = document.createElement('span');
            label.textContent = name;
            item.appendChild(label);

            item.addEventListener('mousedown', function (ev) {
                ev.preventDefault();
                insertMention(name);
            });
            els.mentions.appendChild(item);
        });
        els.mentions.classList.add('is-open');
    }

    function hideMentions() {
        state.mention = { open: false, items: [], index: -1, start: -1, end: -1 };
        if (els.mentions) els.mentions.classList.remove('is-open');
    }

    function updateMentionFromInput() {
        if (!els.input) return;
        const value = els.input.value;
        const caret = els.input.selectionStart || 0;
        const before = value.slice(0, caret);

        let at = -1;
        for (let i = caret - 1; i >= 0; i--) {
            const ch = before[i];
            if (ch === '@') { at = i; break; }
            if (/\s/.test(ch)) break;
        }
        if (at < 0) { hideMentions(); return; }

        const query = before.slice(at + 1);
        if (query.length > 32 || query.indexOf('@') !== -1) {
            hideMentions();
            return;
        }

        const items = mentionCandidates(query);
        if (!items.length) { hideMentions(); return; }

        state.mention = {
            open: true,
            items: items,
            index: 0,
            start: at,
            end: caret
        };
        renderMentionList();
    }

    function insertMention(name) {
        if (!els.input) return;
        const text = els.input.value;
        const start = state.mention.start;
        const end = state.mention.end;
        if (start < 0 || end < start) { hideMentions(); return; }

        const next = text.slice(0, start) + '@' + name + ' ' + text.slice(end);
        els.input.value = next;
        const pos = start + name.length + 2;
        try { els.input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
        hideMentions();
        els.input.focus();
    }

    /* ============================ 输入区小条：推文说明 / 回复 ============================ */
    function normalInputPlaceholder() {
        return isLoggedIn() ? '说点什么…（@ 提及他人）' : '登录后即可发言';
    }

    function setComposer(composer, preserveDraft) {
        state.composer = composer;
        if (els.composer) {
            els.composer.classList.add('is-active');
            if (composer.type === 'tweet') {
                els.composerLabel.textContent = '推文 · ' + displayPageName(composer.page);
                els.composerExcerpt.hidden = true;
                els.composerExcerpt.textContent = '';
            } else {
                els.composerLabel.textContent = '回复 @' + composer.target.user;
                els.composerExcerpt.hidden = false;
                els.composerExcerpt.textContent = replyExcerpt(composer.target) || '原消息';
            }
        }
        if (els.tweetBtn) els.tweetBtn.hidden = true;
        if (els.input) {
            els.input.placeholder = composer.type === 'tweet'
                ? '写一句推文说明（可留空）'
                : '回复此消息…';
            if (!preserveDraft) els.input.value = '';
            try { els.input.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
        hideMentions();
    }

    function clearComposer(clearInput) {
        state.composer = null;
        if (els.composer) els.composer.classList.remove('is-active');
        if (els.tweetBtn) els.tweetBtn.hidden = false;
        if (els.input) {
            els.input.placeholder = normalInputPlaceholder();
            if (clearInput) els.input.value = '';
        }
    }

    function startReply(m) {
        if (!isLoggedIn() || !m || m.pending) return;
        if (m.status.recalled || m.status.deleted) return;
        setComposer({
            type: 'reply',
            target: {
                time: m.time,
                user: m.user,
                text: m.text
            }
        });
    }

    /* ============================ 发送 / 撤回 / 删除 ============================ */
    async function sendChatText(text) {
        guardWrite();
        if (!isLoggedIn()) {
            setStatus('请先登录后再发言', true);
            throw new Error('not-logged-in');
        }

        // 注意：这里不能过滤 <!-- -->，否则会把推文自带的 <!--tweet:...--> 标记一起删掉；
        // 用户输入的注释定界符在 submitInput() / tweetPage() 入口处过滤。
        const clean = String(text == null ? '' : text)
            .replace(/[\r\n]+/g, ' ')
            .trim();
        if (!clean) return;
        if (clean.length > CONFIG.MAX_LINE_LEN) {
            setStatus('消息过长', true);
            return;
        }

        const time = nowTime();
        const line = '* [' + time + '] ' + state.me + '：' + clean;
        const parsed = parseChatLine(line);
        if (parsed) {
            parsed.pending = true;
            state.pending.set(parsed.key, parsed);
            scheduleRender();
            scrollToBottomSoon();
        }

        try {
            await enqueueChatWrite(function () {
                return withEditConflictRetry(async function () {
                    await waitWriteBudget();
                    // 紧贴写入前再校验一次，避免在等待预算期间被拉黑仍能发出
                    if (!(await enforceBlacklist())) {
                        throw new Error('聊天权限校验失败或你已被拉黑');
                    }
                    await getApi().postWithToken('csrf', {
                        action: 'edit',
                        title: CONFIG.CHAT_PAGE,
                        appendtext: '\n' + line,
                        summary: editSummary('发送聊天消息'),
                        formatversion: 2,
                        assert: 'user',
                        watchlist: 'nochange'
                    });
                    return true;
                }, 6, '发送排队中');
            });

            // 服务端内容到达后由 applyContent 自动清掉 pending；兜底 15 秒
            if (parsed) {
                setTimeout(function () {
                    if (state.pending.has(parsed.key)) {
                        state.pending.delete(parsed.key);
                        scheduleRender();
                    }
                }, 15000);
            }
            pollNow();
        } catch (e) {
            if (parsed) {
                state.pending.delete(parsed.key);
                scheduleRender();
            }
            setStatus('发送失败：' + describeError(e), true);
            throw e;
        }
    }

    async function submitInput() {
        if (!els.input) return;
        // 过滤用户输入里的注释定界符，避免伪造 recalled/deleted/tweet/reply 标记
        const note = els.input.value
            .replace(/[\r\n]+/g, ' ')
            .replace(/<!--|-->/g, '')
            .trim();

        const composer = state.composer;
        if (!composer && !note) return;
        if (!isLoggedIn()) {
            setStatus('请先登录后再发言', true);
            return;
        }
        if (composer && composer.type === 'reply' && !note) return;

        let outgoing;
        if (composer && composer.type === 'tweet') {
            outgoing = '📢 [[' + composer.page + ']]' +
                (note ? ' ' + note : '') +
                '<!--tweet:' + composer.page + '-->';
        } else if (composer && composer.type === 'reply') {
            outgoing = note + buildReplyTag(composer.target);
        } else {
            outgoing = note;
        }

        const draft = note;
        const savedComposer = composer;

        els.input.value = '';
        hideMentions();
        clearComposer(false);
        try {
            await sendChatText(outgoing);
        } catch (e) {
            if (els.input) {
                els.input.value = draft;
                if (savedComposer) setComposer(savedComposer, true);
                els.input.focus();
            }
        }
    }

    // 定位消息行并写回标记（撤回/删除共用）
    async function markChatLine(msg, kind, byUser, summary) {
        if (!msg || !byUser) return false;

        return enqueueChatWrite(function () {
            return (async function () {
                const api = getApi();
                try {
                    return await withEditConflictRetry(async function () {
                        const page = await readChatPage(true);
                        const lines = page.text.split('\n');
                        let found = -1;

                        for (let i = 0; i < lines.length; i++) {
                            const m = lines[i].match(LINE_RE);
                            if (!m) continue;
                            if (m[1].trim() === msg.time &&
                                m[2].trim() === msg.user &&
                                m[3].indexOf(msg.text) === 0) {
                                found = i;
                                break;
                            }
                        }

                        if (found < 0) {
                            setStatus('未找到该消息，可能已被存档或删除', true);
                            return false;
                        }
                        if (/<!--(recalled|deleted):/.test(lines[found])) return false;

                        lines[found] += '<!--' + kind + ':by:' + byUser + ':' +
                            new Date().toISOString() + '-->';

                        const params = {
                            action: 'edit',
                            title: CONFIG.CHAT_PAGE,
                            text: lines.join('\n'),
                            summary: editSummary(summary),
                            formatversion: 2,
                            assert: 'user',
                            watchlist: 'nochange'
                        };
                        if (page.revid) params.baserevid = page.revid;

                        await waitWriteBudget();
                        if (!(await enforceBlacklist())) {
                            setStatus('聊天权限校验失败或你已被拉黑，操作已阻止', true);
                            return false;
                        }
                        await api.postWithToken('csrf', params);
                        pollNow();
                        return true;
                    }, 6, '消息编辑冲突');
                } catch (e) {
                    setStatus('操作失败：' + describeError(e), true);
                    return false;
                }
            })();
        });
    }

    async function recallMessage(msg) {
        guardWrite();
        if (!isLoggedIn() || msg.user !== state.me) return;
        if (msg.status.recalled || msg.status.deleted) return;
        await markChatLine(msg, 'recalled', state.me, '撤回聊天消息');
    }

    async function deleteMessage(msg) {
        guardWrite();
        if (!state.isAdmin || !isLoggedIn()) return;
        if (msg.user === state.me) return;
        if (msg.status.recalled || msg.status.deleted) return;
        if (!confirm('删除 ' + msg.user + ' 的这条消息？')) return;
        await markChatLine(msg, 'deleted', state.me, '管理员删除聊天消息');
    }

    /* ============================ 推文 ============================ */
    async function tweetPage() {
        guardWrite();
        if (!isLoggedIn()) {
            setStatus('请先登录后再推文', true);
            return;
        }
        const page = mw.config.get('wgPageName');
        if (!page) return;
        // 说明文字直接在输入框里写；发送时再组合 tweet 标记
        setComposer({ type: 'tweet', page: page });
    }

    /* ============================ 面板打开 / 关闭 ============================ */
    function open() {
        guardWrite();
        if (state.open || state.lockedOut || !els.panel) return;
        state.open = true;
        dismissTriggerPeek();

        // 先在隐藏状态下完成排版/渲染，下一帧再启动过渡，打开才会顺
        restorePanelGeometry();
        decorateUsers();
        refreshAuthoritativeLevels();
        renderMessages();
        scrollToBottom();
        void els.panel.offsetWidth;

        requestAnimationFrame(function () {
            if (!state.open || !els.panel) return;
            els.panel.classList.add('is-open');
            els.wrap.classList.add('is-hidden');
            pollNow();
            // 每次展开都强制刷新归档索引，避免关闭期间新产生的归档段被漏掉
            ensureArchiveIndex(true);

            requestAnimationFrame(function () {
                if (!els.scroll) return;
                scrollToBottom();
                // 移动端不自动聚焦，避免键盘立刻弹起盖住面板
                if (!isMobile() && els.input) {
                    try { els.input.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
                }
            });
        });

        // 黑名单校验放到后台：不阻塞打开动画；命中会立即 lockOut
        if (state.me) {
            enforceBlacklist().catch(function () { /* ignore */ });
        }
    }

    function close() {
        if (!state.open) return;
        state.open = false;
        els.panel.classList.remove('is-open');
        els.wrap.classList.remove('is-hidden');
        resetTriggerScrollState();
        hideMentions();
        schedulePoll(CONFIG.POLL_CLOSED_MS);
    }

    /* ============================ 面板位置 / 四角拉伸 ============================ */
    const PANEL_MARGIN = 8;

    function applyPanelRect(left, top, width, height) {
        if (!els.panel || isMobile()) return;
        const maxW = Math.min(CONFIG.PANEL_MAX_W, window.innerWidth - PANEL_MARGIN * 2);
        const maxH = Math.min(CONFIG.PANEL_MAX_H, window.innerHeight - PANEL_MARGIN * 2);
        const w = Math.min(Math.max(width, CONFIG.PANEL_MIN_W), maxW);
        const h = Math.min(Math.max(height, CONFIG.PANEL_MIN_H), maxH);
        const l = clamp(left, PANEL_MARGIN, window.innerWidth - PANEL_MARGIN - w);
        const t = clamp(top, PANEL_MARGIN, window.innerHeight - PANEL_MARGIN - h);

        els.panel.style.left = l + 'px';
        els.panel.style.top = t + 'px';
        els.panel.style.right = 'auto';
        els.panel.style.bottom = 'auto';
        els.panel.style.width = w + 'px';
        els.panel.style.height = h + 'px';
    }

    function restorePanelGeometry() {
        if (!els.panel) return;
        if (isMobile()) {
            ['left', 'top', 'right', 'bottom', 'width', 'height'].forEach(function (p) {
                els.panel.style[p] = '';
            });
            return;
        }

        let o = null;
        try {
            const raw = mw.storage.get(KEY_PANEL);
            o = raw ? JSON.parse(raw) : null;
        } catch (e) { /* ignore */ }

        if (o && typeof o.left === 'number' && typeof o.top === 'number' &&
            typeof o.width === 'number' && typeof o.height === 'number') {
            applyPanelRect(o.left, o.top, o.width, o.height);
        } else {
            ['left', 'top', 'right', 'bottom', 'width', 'height'].forEach(function (p) {
                els.panel.style[p] = '';
            });
        }
    }

    function savePanelGeometry() {
        if (!els.panel || !state.open || isMobile()) return;
        const r = els.panel.getBoundingClientRect();
        try {
            mw.storage.set(KEY_PANEL, JSON.stringify({
                left: Math.round(r.left),
                top: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height)
            }));
        } catch (e) { /* ignore */ }
    }

    function ensureAbsoluteRect() {
        const r = els.panel.getBoundingClientRect();
        els.panel.style.left = r.left + 'px';
        els.panel.style.top = r.top + 'px';
        els.panel.style.right = 'auto';
        els.panel.style.bottom = 'auto';
        els.panel.style.width = r.width + 'px';
        els.panel.style.height = r.height + 'px';
        return r;
    }

    function bindWindowDragAndResize() {
        if (!els.panel) return;

        // 标题栏拖动窗口
        els.header.addEventListener('pointerdown', function (e) {
            if (isMobile() || e.button !== 0 || !state.open) return;
            if (e.target.closest('button, a, input, textarea, select')) return;
            e.preventDefault();

            const start = ensureAbsoluteRect();
            const sx = e.clientX;
            const sy = e.clientY;
            els.panel.classList.add('is-dragging');
            document.body.classList.add('mwchat-dragging');

            function onMove(ev) {
                if (!els.panel) return;
                const left = clamp(
                    start.left + (ev.clientX - sx),
                    PANEL_MARGIN,
                    window.innerWidth - PANEL_MARGIN - start.width
                );
                const top = clamp(
                    start.top + (ev.clientY - sy),
                    PANEL_MARGIN,
                    window.innerHeight - PANEL_MARGIN - start.height
                );
                els.panel.style.left = left + 'px';
                els.panel.style.top = top + 'px';
            }

            function onUp() {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                if (els.panel) els.panel.classList.remove('is-dragging');
                document.body.classList.remove('mwchat-dragging');
                savePanelGeometry();
            }

            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });

        // 四个角都能拉伸，但角落没有任何可见样式
        (els.resizeHandles || []).forEach(function (handle) {
            handle.addEventListener('pointerdown', function (e) {
                if (isMobile() || e.button !== 0 || !state.open) return;
                e.preventDefault();
                e.stopPropagation();

                const dir = handle.dataset.dir;
                const start = ensureAbsoluteRect();
                const sx = e.clientX;
                const sy = e.clientY;
                els.panel.classList.add('is-resizing');
                document.body.classList.add('mwchat-dragging');

                function onMove(ev) {
                    if (!els.panel) return;
                    const dx = ev.clientX - sx;
                    const dy = ev.clientY - sy;
                    const maxW = Math.min(CONFIG.PANEL_MAX_W, window.innerWidth - PANEL_MARGIN * 2);
                    const maxH = Math.min(CONFIG.PANEL_MAX_H, window.innerHeight - PANEL_MARGIN * 2);
                    const right = start.left + start.width;
                    const bottom = start.top + start.height;

                    let left = start.left;
                    let top = start.top;
                    let width = start.width;
                    let height = start.height;

                    if (dir.indexOf('e') !== -1) {
                        width = clamp(
                            start.width + dx,
                            CONFIG.PANEL_MIN_W,
                            Math.min(maxW, window.innerWidth - PANEL_MARGIN - left)
                        );
                    } else {
                        width = clamp(
                            start.width - dx,
                            CONFIG.PANEL_MIN_W,
                            Math.min(maxW, right - PANEL_MARGIN)
                        );
                        left = right - width;
                    }

                    if (dir.indexOf('s') !== -1) {
                        height = clamp(
                            start.height + dy,
                            CONFIG.PANEL_MIN_H,
                            Math.min(maxH, window.innerHeight - PANEL_MARGIN - top)
                        );
                    } else {
                        height = clamp(
                            start.height - dy,
                            CONFIG.PANEL_MIN_H,
                            Math.min(maxH, bottom - PANEL_MARGIN)
                        );
                        top = bottom - height;
                    }

                    els.panel.style.left = left + 'px';
                    els.panel.style.top = top + 'px';
                    els.panel.style.right = 'auto';
                    els.panel.style.bottom = 'auto';
                    els.panel.style.width = width + 'px';
                    els.panel.style.height = height + 'px';
                }

                function onUp() {
                    document.removeEventListener('pointermove', onMove);
                    document.removeEventListener('pointerup', onUp);
                    document.removeEventListener('pointercancel', onUp);
                    if (els.panel) els.panel.classList.remove('is-resizing');
                    document.body.classList.remove('mwchat-dragging');
                    savePanelGeometry();
                }

                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup', onUp);
                document.addEventListener('pointercancel', onUp);
            });
        });
    }

    /* ============================ DOM 构建 ============================ */
    function buildDom() {
        // 收起：右侧小竖条 + 小三角；hover 滑出「图标 + 文字」按钮
        const wrap = document.createElement('div');
        wrap.className = 'mwchat-trigger-wrap';

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'mwchat-tab';
        tab.title = '打开聊天室';
        tab.setAttribute('aria-label', '打开聊天室');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'mwchat-trigger';
        trigger.title = '打开聊天室';
        trigger.setAttribute('aria-label', '打开聊天室');
        trigger.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
            'aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 ' +
            '8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 ' +
            '8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 ' +
            '3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
            '<span class="mwchat-trigger-label">聊天室</span>';
        wrap.append(tab, trigger);

        // 聊天面板
        const panel = document.createElement('div');
        panel.className = 'mwchat-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '站内聊天室');

        const header = document.createElement('div');
        header.className = 'mwchat-header';

        const title = document.createElement('span');
        title.className = 'mwchat-title';
        title.textContent = '聊天室';

        const sub = document.createElement('span');
        sub.className = 'mwchat-sub';
        sub.textContent = isLoggedIn() ? '站内公开聊天' : '只读模式';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'mwchat-close';
        closeBtn.title = '收起聊天室';
        closeBtn.setAttribute('aria-label', '收起聊天室');
        closeBtn.textContent = '×';

        header.append(title, sub, closeBtn);

        const scroll = document.createElement('div');
        scroll.className = 'mwchat-scroll';
        const list = document.createElement('div');
        list.className = 'mwchat-list';
        scroll.appendChild(list);

        const status = document.createElement('div');
        status.className = 'mwchat-status';

        const footer = document.createElement('div');
        footer.className = 'mwchat-footer';

        const mentions = document.createElement('div');
        mentions.className = 'mwchat-mentions';
        footer.appendChild(mentions);

        let tweetBtn = null;
        if (isTweetPage()) {
            tweetBtn = document.createElement('button');
            tweetBtn.type = 'button';
            tweetBtn.className = 'mwchat-tweet-btn';
            tweetBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
                'aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 ' +
                '2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4c-.6.5-1.3 ' +
                '0-1.3-.7V5.5z"/><path d="M8 8h8M8 11.5h5"/></svg>' +
                '<span>推文当前页面</span>';
            footer.appendChild(tweetBtn);
        }

        // 推文说明 / 回复引用都走这个输入区上方的小条，不再用 prompt
        const composer = document.createElement('div');
        composer.className = 'mwchat-composer';
        const composerMain = document.createElement('div');
        composerMain.className = 'mwchat-composer-main';
        const composerLabel = document.createElement('div');
        composerLabel.className = 'mwchat-composer-label';
        const composerExcerpt = document.createElement('div');
        composerExcerpt.className = 'mwchat-composer-excerpt';
        composerExcerpt.hidden = true;
        composerMain.append(composerLabel, composerExcerpt);
        const composerCancel = document.createElement('button');
        composerCancel.type = 'button';
        composerCancel.className = 'mwchat-composer-cancel';
        composerCancel.textContent = '取消';
        composer.append(composerMain, composerCancel);
        footer.appendChild(composer);

        const inputRow = document.createElement('div');
        inputRow.className = 'mwchat-inputrow';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'mwchat-input';
        input.maxLength = CONFIG.MAX_MESSAGE_LEN;
        input.autocomplete = 'off';
        input.placeholder = normalInputPlaceholder();

        const send = document.createElement('button');
        send.type = 'button';
        send.className = 'mwchat-send';
        send.textContent = '发送';

        if (!isLoggedIn()) {
            input.disabled = true;
            send.disabled = true;
        }

        inputRow.append(input, send);
        footer.appendChild(inputRow);

        const resizeHandles = [];
        ['nw', 'ne', 'sw', 'se'].forEach(function (dir) {
            const handle = document.createElement('div');
            handle.className = 'mwchat-resize-handle mwchat-rh-' + dir;
            handle.dataset.dir = dir;
            handle.setAttribute('aria-hidden', 'true');
            resizeHandles.push(handle);
        });

        panel.append(header, scroll, status, footer);
        resizeHandles.forEach(function (handle) { panel.appendChild(handle); });
        document.body.appendChild(wrap);
        document.body.appendChild(panel);

        els = {
            wrap: wrap,
            tab: tab,
            trigger: trigger,
            panel: panel,
            header: header,
            scroll: scroll,
            list: list,
            status: status,
            footer: footer,
            mentions: mentions,
            tweetBtn: tweetBtn,
            composer: composer,
            composerLabel: composerLabel,
            composerExcerpt: composerExcerpt,
            composerCancel: composerCancel,
            input: input,
            send: send,
            closeBtn: closeBtn,
            resizeHandles: resizeHandles
        };

        bindPanelEvents();
        bindWindowDragAndResize();
    }

    function dismissTriggerPeek() {
        if (els.wrap) els.wrap.classList.remove('is-peek');
    }

    // 首次加载：桌面端先让按钮自己滑出来，停在外面；
    // 用户 hover 过再离开之后，才回到正常的小竖条收起态。
    function startTriggerPeek() {
        if (!els.wrap || state.open) return;
        let fine = false;
        try {
            fine = !!(window.matchMedia &&
                window.matchMedia('(hover: hover) and (pointer: fine)').matches);
        } catch (e) {
            fine = false;
        }
        if (!fine) return;
        // 先让浏览器画出收起态，下一帧再加类，滑出才有过渡
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (!els.wrap || state.open) return;
                els.wrap.classList.add('is-peek');
            });
        });
    }

    // 移动端跟随 Citizen 底栏：向下滚动时收起，向上滚动时回来
    let chatTriggerLastY = null;
    let chatTriggerScrollTicking = false;

    function resetTriggerScrollState() {
        // 下一次滚动事件只用来记录基准位置，避免把页面恢复的滚动当成滑动方向
        chatTriggerLastY = null;
        if (els.wrap) els.wrap.classList.remove('is-scroll-hidden');
    }

    function updateTriggerOnScroll() {
        if (!els.wrap || state.open) return;
        const y = window.scrollY || window.pageYOffset || 0;

        if (!isMobile()) {
            els.wrap.classList.remove('is-scroll-hidden');
            chatTriggerLastY = y;
            return;
        }

        if (chatTriggerLastY === null) {
            chatTriggerLastY = y;
            return;
        }
        if (y <= 8) {
            els.wrap.classList.remove('is-scroll-hidden');
            chatTriggerLastY = y;
            return;
        }

        const delta = y - chatTriggerLastY;
        if (Math.abs(delta) < 6) return;
        if (delta > 0) {
            els.wrap.classList.add('is-scroll-hidden');
        } else {
            els.wrap.classList.remove('is-scroll-hidden');
        }
        chatTriggerLastY = y;
    }

    function bindPanelEvents() {
        const tryOpen = function () {
            try { open(); } catch (e) { /* locked out */ }
        };
        els.tab.addEventListener('click', tryOpen);
        els.trigger.addEventListener('click', tryOpen);

        // 首次加载的滑出状态：指针从按钮上离开后，才收回小竖条
        els.trigger.addEventListener('mouseleave', function () {
            if (els.wrap.classList.contains('is-peek')) dismissTriggerPeek();
        });

        els.closeBtn.addEventListener('click', close);

        els.send.addEventListener('click', function () {
            submitInput();
        });

        if (els.composerCancel) {
            els.composerCancel.addEventListener('click', function () {
                clearComposer(true);
                if (els.input) els.input.focus();
            });
        }

        els.input.addEventListener('input', updateMentionFromInput);

        els.input.addEventListener('keydown', function (e) {
            if (e.isComposing || e.keyCode === 229) return;

            const mention = state.mention;
            if (mention.open && mention.items.length) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    mention.index = (mention.index + 1) % mention.items.length;
                    renderMentionList();
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    mention.index = (mention.index - 1 + mention.items.length) %
                        mention.items.length;
                    renderMentionList();
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    insertMention(mention.items[mention.index]);
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    hideMentions();
                    return;
                }
            }

            if (e.key === 'Escape' && state.composer) {
                e.preventDefault();
                clearComposer(true);
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                submitInput();
            }
        });

        // 滚到最顶部自动加载更早的消息/归档；顶部按钮也提供显式入口
        els.scroll.addEventListener('scroll', function () {
            if (!state.open || state.loadingOlder || state.archiveLoading) return;
            if (els.scroll.scrollTop <= 4 && hasOlderHistory()) {
                loadOlderMessages();
            }
        });

        if (els.tweetBtn) {
            els.tweetBtn.addEventListener('click', function () {
                tweetPage().catch(function (e) {
                    setStatus('无法开始推文：' + describeError(e), true);
                });
            });
        }

        // 点击面板其它区域时收起 @ 候选
        els.panel.addEventListener('mousedown', function (e) {
            if (e.target === els.input) return;
            if (els.mentions && els.mentions.contains(e.target)) return;
            hideMentions();
        });
    }

    function bindGlobalEvents() {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (state.pollTimer) {
                    clearTimeout(state.pollTimer);
                    state.pollTimer = null;
                }
            } else {
                pollNow();
            }
        });

        // 移动端：页面向下滚动时收起聊天按钮，向上滚动时恢复
        window.addEventListener('scroll', function () {
            if (chatTriggerScrollTicking) return;
            chatTriggerScrollTicking = true;
            requestAnimationFrame(function () {
                chatTriggerScrollTicking = false;
                updateTriggerOnScroll();
            });
        }, { passive: true });

        window.addEventListener('resize', function () {
            chatTriggerLastY = window.scrollY || window.pageYOffset || 0;
            if (!isMobile() && els.wrap) {
                els.wrap.classList.remove('is-scroll-hidden');
            }
        });

        document.addEventListener('keydown', function (e) {
            // 输入框里的 Esc 已处理 @ 候选并 preventDefault，避免顺手关掉整个面板
            if (e.defaultPrevented) return;
            if (e.key !== 'Escape') return;
            if (state.mention.open) {
                hideMentions();
                return;
            }
            if (state.open) close();
        });

        // 点击面板/候选以外的区域时收起 @ 候选
        document.addEventListener('mousedown', function (e) {
            if (!state.mention.open) return;
            if (els.input && e.target === els.input) return;
            if (els.mentions && els.mentions.contains(e.target)) return;
            hideMentions();
        });

        window.addEventListener('resize', function () {
            if (!state.open || !els.panel) return;

            if (isMobile()) {
                // 切到移动端时清掉桌面拖拽留下的内联位置，交给底部抽屉 CSS
                ['left', 'top', 'right', 'bottom', 'width', 'height'].forEach(function (p) {
                    els.panel.style[p] = '';
                });
                return;
            }

            const r = els.panel.getBoundingClientRect();
            if (els.panel.style.left ||
                r.left < PANEL_MARGIN || r.top < PANEL_MARGIN ||
                r.right > window.innerWidth - PANEL_MARGIN ||
                r.bottom > window.innerHeight - PANEL_MARGIN) {
                applyPanelRect(r.left, r.top, r.width, r.height);
            }
        });
    }

    /* ============================ 样式 ============================
       样式已拆分到独立 CSS 文件：mwchat-float.css
       请把该文件内容放进 MediaWiki:Common.css（或由 Common.css @import）。
       本 JS 不再注入任何 CSS。
       ============================================================ */

    /* ============================ 启动 ============================ */
    async function main() {
        state.me = mw.config.get('wgUserName') || null;

        // 严格黑名单（fail-closed）：
        //   - 命中：完全不挂载任何 DOM
        //   - 命中不了（读取失败 / JSON 损坏）：同样不挂载，绝不放行
        // 匿名用户没有用户名，不可能命中名单，按只读模式挂载。
        if (state.me) {
            let ok = false;
            for (let attempt = 0; attempt < 2; attempt++) {
                ok = await enforceBlacklist();
                if (ok || state.lockedOut) break;
                await sleep(600);
            }
            if (!ok) return; // 命中或无法验证：不挂载任何 DOM
            state.userSet.add(state.me);
        }
        if (!document.body) return;

        const groups = mw.config.get('wgUserGroups') || [];
        state.isAdmin = groups.indexOf('sysop') !== -1 ||
            groups.indexOf('interface-admin') !== -1;

        loadAvatarCache();
        readArchiveStamp();
        buildDom();
        restorePanelGeometry();
        bindGlobalEvents();
        startTriggerPeek();
        resetTriggerScrollState();
        schedulePoll(0);

        // userlevel 脚本可能比本组件晚几秒才写好等级缓存；多次补读，
        // 避免自己的高等级被本地快照计算值长期覆盖。
        setTimeout(refreshAuthoritativeLevels, 1000);
        setTimeout(refreshAuthoritativeLevels, 2500);
        setTimeout(refreshAuthoritativeLevels, 5000);
        setTimeout(refreshAuthoritativeLevels, 8000);
        setTimeout(refreshAuthoritativeLevels, 20000);
        // 只读 localStorage，很便宜；保证 userlevel 缓存更新后徽章能自动跟上
        setInterval(refreshAuthoritativeLevels, 60000);
        // 他人等级需要拉贡献统计，每轮限 LEVEL_MAX_USERS_PER_ROUND 个；
        // 定时处理本轮被推迟的用户，避免他们一直停在旧值。
        setInterval(function () {
            if (state.open) decorateUsers();
        }, 60000);
        // 每 30 分钟重新读一次已发布的等级快照，拾取用户当天更新后的等级；
        // 面板关着也清掉 fresh，下次打开时再算。
        setInterval(function () {
            state.levelFresh.clear();
            if (state.open) decorateUsers();
        }, 30 * 60 * 1000);
        // 头像文件名不变，换头像后必须换 URL 才能绕过浏览器缓存。
        // 每 10 分钟换一次缓存戳；下一轮渲染会用新 URL 重新拉取。
        setInterval(function () {
            state.avatarBust = String(Date.now());
            state.avatarPool.clear();
            Object.keys(state.avatarImgFailedAt).forEach(function (n) {
                delete state.avatarImgFailedAt[n];
            });
            Object.keys(state.avatarImgFailCount).forEach(function (n) {
                delete state.avatarImgFailCount[n];
            });
            if (state.open) scheduleRender();
        }, CONFIG.AVATAR_REFRESH_MS);
    }

    function start() {
        if (typeof mw === 'undefined') return;
        const ready = (mw.loader && mw.loader.using)
            ? mw.loader.using([
                'mediawiki.util',
                'mediawiki.api',
                'mediawiki.user',
                'mediawiki.storage',
                'mediawiki.Title'
            ])
            : Promise.resolve();
        ready.then(function () {
            return main();
        }).catch(function () {
            // 任何初始化失败都不应影响页面其它脚本
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

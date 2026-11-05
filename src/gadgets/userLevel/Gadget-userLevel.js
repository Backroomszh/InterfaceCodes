(function () {
    'use strict';

    const CONFIG = {
        // ================= 积分构成 =================
        // 四个维度的权重，合计必须为 1
        WEIGHTS: {
            comment: 0.15,   // 评论
            login:   0.10,   // 每天登录（累计活跃天数）
            create:  0.40,   // 主命名空间创建页面数
            edit:    0.35    // 非 Storage、非评论命名空间的编辑数
        },

        // 每个维度的参考值：达成度 = 实际值 / 参考值。
        // 达到参考值即视为“该维度满分”；超过后仍按同样比例继续计分（不封顶），
        // 所以零贡献的新用户积分为 0、等级为 Lv0，最高等级也没有上限。
        REF: {
            comment: 100,
            login:   180,
            create:  30,
            edit:    1000
        },

        // 四个维度都刚好达到参考值时的基础积分
        BASE_SCORE_MAX: 10000,

        // 等级曲线：level = floor((积分 / 15) ^ (1 / 2)) = floor(sqrt(积分 / 15))
        // 15 分即 Lv1，等级不设上限。
        LEVEL_THRESHOLD: 15,
        LEVEL_EXP: 2,

        // ================= 作品评分附加分 =================
        // 读取d投票系统写出的全站排名快照（Storage:GlobalRanking）
        RANKING_SNAPSHOT_TITLE: 'Storage:GlobalRanking',
        RANKING_SNAPSHOT_MARKER: 'SNAPSHOT',
        RANKING_SNAPSHOT_VERSION: 6,
        // 投票改为累加制后没有理论上限，作品加分改用“最高分 - 均分”作为满分参考，
        // 不再需要 VOTE_MAX。
        AVG_MIN_COUNT: 1,     // 计算均分时，只统计至少有 1 票的文章
        BONUS_PER_PAGE: 1000, // 单篇作品“高于均分且差距拉满”时的加分
        BONUS_MAX: 5000,      // 作品加分总计上限

        // ================= 活跃记录快照 =================
        LEVEL_SNAPSHOT_TITLE: 'Storage:Userlevel',
        SNAPSHOT_BUCKETS: 256,
        FILTER_PREFIX: 'mwlfg:',
        COMMENT_NS_FALLBACK: 844,

        // ================= 缓存 =================
        STATS_TTL_MS: 10 * 60 * 1000,
        METRICS_TTL_MS: 60 * 60 * 1000,
        CREATOR_TTL_MS: 24 * 60 * 60 * 1000,
        PAGE_CACHE_MS: 30 * 1000,
        // 已发布统计的刷新间隔：用户每天首次访问会写一次；
        // 等级变化较快时最多每 6 小时补写一次。
        STATS_PUBLISH_TTL_MS: 6 * 60 * 60 * 1000,
        STATS_PUBLISH_TS_KEY: 'userlevel.publish.ts',

        MAX_REQUESTS: 60,
        WAIT_TIMEOUT: 8000
    };

    const CSS = `
.userlevel-stat, .userlevel-usergroup { font-variant-numeric: tabular-nums; white-space: nowrap; }
.userlevel-stat .ul-label, .userlevel-usergroup .ul-label { font-weight: 600; opacity: .8; margin-right: 2px; }
.userlevel-stat .ul-badge, .userlevel-usergroup .ul-badge { font-weight: 700; letter-spacing: .01em; }
.userlevel-stat .ul-streak { font-weight: 600; opacity: .85; }
.userlevel-usergroup {
    background: none !important; border: none !important; box-shadow: none !important;
    padding: 0 !important; display: inline-flex !important; align-items: center; gap: 1px;
}
.userlevel-fallback { margin: 2px 0 6px; }
.userlevel-stat.ul-tier-0 .ul-badge, .userlevel-usergroup.ul-tier-0 .ul-badge { color: #9098a1; }
.userlevel-stat.ul-tier-1 .ul-badge, .userlevel-usergroup.ul-tier-1 .ul-badge { color: #4a90e2; }
.userlevel-stat.ul-tier-2 .ul-badge, .userlevel-usergroup.ul-tier-2 .ul-badge {
    background: linear-gradient(90deg,#6b8cff,#b06bff); -webkit-background-clip: text; background-clip: text;
    color: transparent; font-weight: 800;
}
.userlevel-stat.ul-tier-3 .ul-badge, .userlevel-usergroup.ul-tier-3 .ul-badge {
    background: linear-gradient(90deg,#ff6b9d,#ffb86b,#6bffb8,#6bb8ff,#b06bff,#ff6b9d);
    background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; font-weight: 800; animation: ul-flow 4s linear infinite;
}
.userlevel-stat.ul-tier-4 .ul-badge, .userlevel-usergroup.ul-tier-4 .ul-badge {
    background: linear-gradient(90deg,#ff6b9d,#ffb86b,#6bffb8,#6bb8ff,#b06bff,#ff6b9d);
    background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; font-weight: 800;
    animation: ul-flow 2.5s linear infinite;
    filter: drop-shadow(0 0 3px rgba(180,120,255,.75));
}
.userlevel-stat.ul-tier-5 .ul-badge, .userlevel-usergroup.ul-tier-5 .ul-badge {
    background: linear-gradient(90deg,#ff4d6d,#ffb84d,#6bffb8,#4dc3ff,#b06bff,#ff4d6d);
    background-size: 300% 100%; -webkit-background-clip: text; background-clip: text;
    color: transparent; font-weight: 900; letter-spacing: .04em;
    animation: ul-flow 1.8s linear infinite, ul-glow 2s ease-in-out infinite;
}
.userlevel-stat.ul-tier-4 .ul-streak, .userlevel-stat.ul-tier-5 .ul-streak { color: #b06bff; }
@keyframes ul-flow { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
@keyframes ul-glow {
    0%,100% { filter: drop-shadow(0 0 2px rgba(255,120,180,.6)) drop-shadow(0 0 4px rgba(120,180,255,.4)); }
    50%     { filter: drop-shadow(0 0 6px rgba(255,120,180,1))  drop-shadow(0 0 10px rgba(120,180,255,.85)); }
}
@media (prefers-reduced-motion: reduce) {
    .userlevel-stat .ul-badge, .userlevel-usergroup .ul-badge { animation: none !important; }
}
`;

    // ------------------------------------------------------------------
    // 通用工具
    // ------------------------------------------------------------------

    const pad = n => n < 10 ? '0' + n : '' + n;
    const fmtDate = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    const todayUTC = () => fmtDate(new Date());
    function daysBetween(a, b) {
        const [ay, am, ad] = a.split('-').map(Number);
        const [by, bm, bd] = b.split('-').map(Number);
        return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
    }
    const MASK30 = (1 << 30) - 1;

    function readCache(key, ttl) {
        try {
            const raw = mw.storage.get(key);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.ts || Date.now() - o.ts > ttl) return null;
            return o.data;
        } catch (e) { return null; }
    }
    function writeCache(key, data) {
        try { mw.storage.set(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
    }
    function dropCache(key) {
        try { mw.storage.remove(key); } catch (e) {}
    }

    function hashUsername(name) {
        let h = 2166136261;
        for (let i = 0; i < name.length; i++) {
            h ^= name.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function bucketOf(name) {
        const b = hashUsername(name) % CONFIG.SNAPSHOT_BUCKETS;
        return b.toString(16).padStart(2, '0');
    }
    function levelSnapshotTitle(name) {
        return CONFIG.LEVEL_SNAPSHOT_TITLE + '/' + bucketOf(name);
    }

    // 命名空间 ID
    function namespaceIds() { return mw.config.get('wgNamespaceIds') || {}; }
    function storageNamespaceId() {
        const id = namespaceIds().storage;
        return (typeof id === 'number' && id >= 0) ? id : -1;
    }
    function commentNamespaceId() {
        const ids = namespaceIds();
        if (typeof ids.comments === 'number') return ids.comments;
        if (typeof ids.comment === 'number') return ids.comment;
        return CONFIG.COMMENT_NS_FALLBACK;
    }

    // ------------------------------------------------------------------
    // 页面读取
    // ------------------------------------------------------------------

    const pageCache = new Map();

    async function readPageText(title, force) {
        const cached = pageCache.get(title);
        if (!force && cached && Date.now() - cached.ts < CONFIG.PAGE_CACHE_MS) return cached;

        const api = new mw.Api();
        let entry;
        try {
            const data = await api.get({
                action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
                titles: title, formatversion: 2
            });
            const page = data.query && data.query.pages && data.query.pages[0];
            if (!page || page.missing !== undefined) {
                entry = { text: '', revid: null, ts: Date.now() };
            } else {
                const rev = page.revisions && page.revisions[0];
                const content = (rev && rev.slots && rev.slots.main && rev.slots.main.content) || '';
                entry = {
                    text: content.replace(/<\/?pre>/gi, ''),
                    revid: rev ? rev.revid : null,
                    ts: Date.now()
                };
            }
        } catch (e) {
            entry = { text: '', revid: null, ts: Date.now() };
        }
        pageCache.set(title, entry);
        return entry;
    }

    // ------------------------------------------------------------------
    // 活跃记录快照（Storage:Userlevel/xx）
    // 只用来记录“每天登录”，不参与其它维度
    // ------------------------------------------------------------------

    function parseUserSection(text, username) {
        const lines = text.split('\n');
        let current = null;
        for (const line of lines) {
            const m = line.match(/^==\s*(.+?)\s*==\s*$/);
            if (m) { current = m[1].trim(); continue; }
            if (current !== username) continue;
            const t = line.trim();
            if (!t) continue;
            const p = t.split('\t');
            if (p.length >= 4) {
                const rec = {
                    lastActive: p[0],
                    streak: parseInt(p[1], 10) || 0,
                    totalDays: parseInt(p[2], 10) || 0,
                    bitmap: parseInt(p[3], 16) || 0
                };
                // 第 5 列起是发布出去的完整 v6 统计（旧记录只有 4 列）。
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
                        rec.stats = {
                            commentCount: rec.commentCount,
                            editCount: rec.editCount,
                            createCount: rec.createCount,
                            bonus: rec.bonus,
                            score: rec.score,
                            level: rec.level,
                            ts: ts
                        };
                    }
                }
                return rec;
            }
        }
        return null;
    }

    function findSectionIndex(text, username) {
        const lines = text.split('\n');
        let idx = 0;
        for (const line of lines) {
            const m = line.match(/^==\s*(.+?)\s*==\s*$/);
            if (m) {
                idx++;
                if (m[1].trim() === username) return idx;
            }
        }
        return -1;
    }

    function serializeRecord(rec) {
        const fields = [
            rec.lastActive,
            rec.streak,
            rec.totalDays,
            (rec.bitmap >>> 0).toString(16).padStart(8, '0')
        ];
        if (rec.stats && typeof rec.stats.level === 'number') {
            const s = rec.stats;
            fields.push(
                s.commentCount || 0,
                s.editCount || 0,
                s.createCount || 0,
                s.bonus || 0,
                s.score || 0,
                s.level || 0,
                s.ts || Date.now(),
                6
            );
        }
        return fields.join('\t');
    }

    function computeStreak(dates) {
        const today = todayUTC();
        const yest = fmtDate(new Date(Date.now() - 86400000));
        let latest = null;
        dates.forEach(d => { if (!latest || d > latest) latest = d; });
        if (!latest || (latest !== today && latest !== yest)) return 0;
        let n = 0, cur = latest;
        while (dates.has(cur)) {
            n++;
            cur = fmtDate(new Date(Date.parse(cur + 'T00:00:00Z') - 86400000));
        }
        return n;
    }

    function settleRecord(rec, today) {
        if (rec.lastActive === today) return rec;
        const gap = rec.lastActive ? daysBetween(rec.lastActive, today) : 9999;
        const streak = gap === 1 ? rec.streak + 1 : 1;
        const bitmap = gap >= 30 ? 1 : (((rec.bitmap << gap) | 1) & MASK30);
        return {
            lastActive: today,
            streak: streak,
            totalDays: rec.totalDays + 1,
            bitmap: bitmap,
            // 贡献统计拉取失败时，保留上一次发布的统计，别把记录退回旧格式
            stats: rec.stats
        };
    }

    function initRecord(today, editDates) {
        const all = new Set(editDates || []);
        all.add(today);
        const todayTs = Date.parse(today + 'T00:00:00Z');
        let bitmap = 0;
        all.forEach(d => {
            const idx = Math.round((todayTs - Date.parse(d + 'T00:00:00Z')) / 86400000);
            if (idx >= 0 && idx < 30) bitmap |= (1 << idx);
        });
        return {
            lastActive: today,
            streak: computeStreak(all) || 1,
            totalDays: all.size,
            bitmap: bitmap & MASK30
        };
    }

    function bitmapToDates(bitmap, today) {
        const out = new Set();
        const todayTs = Date.parse(today + 'T00:00:00Z');
        for (let i = 0; i < 30; i++) {
            if (bitmap & (1 << i)) out.add(fmtDate(new Date(todayTs - i * 86400000)));
        }
        return out;
    }

    const REC_TODAY_KEY = 'userlevel.rec.today';
    function hasRecordedToday() {
        try { return mw.storage.get(REC_TODAY_KEY) === todayUTC(); } catch (e) { return false; }
    }
    function markRecordedToday() {
        try { mw.storage.set(REC_TODAY_KEY, todayUTC()); } catch (e) {}
    }

    function readPublishTs() {
        try {
            return Number(mw.storage.get(CONFIG.STATS_PUBLISH_TS_KEY) || 0);
        } catch (e) { return 0; }
    }
    function markPublished() {
        try {
            mw.storage.set(CONFIG.STATS_PUBLISH_TS_KEY, String(Date.now()));
        } catch (e) {}
    }

    async function recordVisit(username) {
        if (mw.user.isAnon() || mw.util.isIPAddress(username)) return;

        // 今天已经写过、且发布统计还新鲜：不必再读快照页
        if (hasRecordedToday() &&
            Date.now() - readPublishTs() < CONFIG.STATS_PUBLISH_TTL_MS) return;

        const today = todayUTC();
        const title = levelSnapshotTitle(username);
        const api = new mw.Api();

        // 贡献统计只拉一次；拿不到就只写活跃记录，不发布一份错误的低等级。
        // 最多等 12 秒，避免接口卡住导致当天的活跃记录也写不进去。
        let metrics = null;
        try {
            metrics = await Promise.race([
                getMetrics(username),
                new Promise(function (_, reject) {
                    setTimeout(function () {
                        reject(new Error('metrics-timeout'));
                    }, 12000);
                })
            ]);
        } catch (e) {
            metrics = null;
        }

        for (let attempt = 0; attempt < 3; attempt++) {
            const { text } = await readPageText(title, true);

            let rec = parseUserSection(text, username);
            const sectionIdx = findSectionIndex(text, username);

            const statsStale = !rec || !rec.hasStats || !rec.statsTs ||
                Date.now() - rec.statsTs > CONFIG.STATS_PUBLISH_TTL_MS;

            if (rec && rec.lastActive === today && !statsStale) {
                markRecordedToday();
                markPublished();
                return;
            }

            if (!rec) {
                const dates = metrics && metrics.dates ? new Set(metrics.dates) : new Set();
                rec = initRecord(today, dates);
            } else if (rec.lastActive !== today) {
                rec = settleRecord(rec, today);
            }

            // 把完整 v6 统计写进同一条记录，其他浏览器直接读取，
            // 不再需要各自重新拉 usercontribs 猜等级。
            let wroteFreshStats = false;
            if (metrics) {
                try {
                    // 统计最多等 12 秒；超时就先写活跃记录，下次访问再补发布
                    const stats = await Promise.race([
                        buildStats(username, rec, metrics),
                        new Promise(function (_, reject) {
                            setTimeout(function () {
                                reject(new Error('stats-timeout'));
                            }, 12000);
                        })
                    ]);
                    if (stats && typeof stats.level === 'number') {
                        rec.stats = stats;
                        wroteFreshStats = true;
                    }
                } catch (e) { /* 统计失败时仍保留活跃记录 */ }
            }

            const params = {
                action: 'edit',
                title: title,
                summary: CONFIG.FILTER_PREFIX + ' 更新活跃等级快照',
                minor: '1',
                watchlist: 'nochange'
            };

            if (sectionIdx > 0) {
                params.section = String(sectionIdx);
                params.text = '== ' + username + ' ==\n' + serializeRecord(rec);
            } else if (text.trim() === '') {
                params.text = '== ' + username + ' ==\n' + serializeRecord(rec) + '\n';
            } else {
                params.section = 'new';
                params.sectiontitle = username;
                params.text = serializeRecord(rec);
            }

            try {
                await api.postWithToken('csrf', params);
                markRecordedToday();
                if (wroteFreshStats) markPublished();
                pageCache.delete(title);
                dropCache(statsKey(username));
                if (rec.stats) writeCache(statsKey(username), rec.stats);
                return;
            } catch (e) {
                if ((e && e.code === 'editconflict') ||
                    (e && e.code === 'pagedeleted') ||
                    e === 'nocreate-missing') {
                    if (attempt < 2) continue;
                }
                return;
            }
        }
    }

    // ------------------------------------------------------------------
    // 四个统计维度
    // ------------------------------------------------------------------

    // 单个命名空间的贡献数 + 日期集合。
    // 关键：评论、Storage 分开查，避免 Storage:Chat 的聊天记录把窗口挤满，
    // 导致评论数/编辑数根本读不到（这正是高等级用户被算成 Lv4 的主因）。
    async function fetchNamespaceContribs(user, ns) {
        const dates = new Set();
        if (typeof ns !== 'number' || ns < 0) {
            return { count: 0, dates, truncated: false };
        }

        const api = new mw.Api();
        let count = 0;
        let cont = {};

        for (let guard = 0; guard < CONFIG.MAX_REQUESTS; guard++) {
            const data = await api.get(Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs',
                ucuser: user, uclimit: 'max', ucdir: 'newer',
                ucnamespace: ns, ucprop: 'timestamp'
            }, cont));

            const list = (data.query && data.query.usercontribs) || [];
            count += list.length;
            for (const c of list) {
                if (c.timestamp) dates.add(c.timestamp.slice(0, 10));
            }

            if (data.continue) cont = data.continue;
            else return { count, dates, truncated: false };
        }
        return { count, dates, truncated: true };
    }

    // 最近一年的贡献日期（从新到旧），用于连续天数；不参与计数
    async function fetchRecentDates(user) {
        const dates = new Set();
        const api = new mw.Api();
        const now = new Date();
        const start = new Date(now.getTime() - 365 * 86400000);
        let cont = {};

        for (let guard = 0; guard < CONFIG.MAX_REQUESTS; guard++) {
            const data = await api.get(Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs',
                ucuser: user, uclimit: 'max', ucdir: 'older',
                ucstart: now.toISOString(), ucend: start.toISOString(),
                ucprop: 'timestamp'
            }, cont));

            const list = (data.query && data.query.usercontribs) || [];
            for (const c of list) {
                if (c.timestamp) dates.add(c.timestamp.slice(0, 10));
            }

            if (data.continue) cont = data.continue;
            else return { dates, truncated: false };
        }
        return { dates, truncated: true };
    }

    async function fetchTotalEditCount(user) {
        const api = new mw.Api();
        const data = await api.get({
            action: 'query', formatversion: 2, list: 'users',
            ususers: user, usprop: 'editcount'
        });
        const u = data.query && data.query.users && data.query.users[0];
        if (!u || u.missing !== undefined) return 0;
        return parseInt(u.editcount, 10) || 0;
    }

    /**
     * 拉取用户贡献：
     *  - commentCount：评论命名空间，单独分页，不受 Storage 记录影响
     *  - editCount：总编辑数 - 评论数 - Storage 数
     *  - dates：最近一年的活跃日期（从新到旧）
     */
    async function fetchContribStats(user) {
        const storageNs = storageNamespaceId();
        const commentNs = commentNamespaceId();

        const results = await Promise.all([
            fetchNamespaceContribs(user, commentNs),
            fetchNamespaceContribs(user, storageNs),
            fetchRecentDates(user),
            fetchTotalEditCount(user)
        ]);

        const comments = results[0];
        const storage = results[1];
        const recent = results[2];
        const total = results[3];

        const dates = new Set();
        comments.dates.forEach(d => dates.add(d));
        storage.dates.forEach(d => dates.add(d));
        recent.dates.forEach(d => dates.add(d));

        return {
            dates: dates,
            editCount: Math.max(0, total - comments.count - storage.count),
            commentCount: comments.count,
            truncated: !!(comments.truncated || storage.truncated || recent.truncated)
        };
    }

    /**
     * 主命名空间创建页面数：读创建日志（页面被删除后日志仍保留）。
     * 按标题去重，避免“删除后重建”被重复计算。
     */
    async function fetchCreatedPages(user) {
        const api = new mw.Api();
        const titles = new Set();
        let cont = {};

        for (let guard = 0; guard < CONFIG.MAX_REQUESTS; guard++) {
            const params = Object.assign({
                action: 'query', formatversion: 2, list: 'logevents',
                letype: 'create', lenamespace: 0, leuser: user,
                lelimit: 'max', leprop: 'title'
            }, cont);

            const data = await api.get(params);
            const list = (data.query && data.query.logevents) || [];
            list.forEach(le => {
                if (le && le.title) titles.add(String(le.title).replace(/_/g, ' '));
            });

            if (data.continue) cont = data.continue;
            else return { titles, truncated: false };
        }
        return { titles, truncated: true };
    }

    // metrics2：旧版把 Storage 与评论混在同一个 usercontribs 窗口里，
    // 高活跃用户的计数会严重偏低；换 key 丢弃旧缓存。
    function metricsKey(user) { return 'userlevel.v6.metrics2.' + user; }
    const metricsInflight = new Map();

    function getMetrics(user) {
        const key = metricsKey(user);
        const cached = readCache(key, CONFIG.METRICS_TTL_MS);
        if (cached) return Promise.resolve(cached);
        if (metricsInflight.has(key)) return metricsInflight.get(key);

        const p = (async () => {
            const contrib = await fetchContribStats(user);
            const created = await fetchCreatedPages(user);
            const data = {
                editCount: contrib.editCount,
                commentCount: contrib.commentCount,
                createCount: created.titles.size,
                dates: Array.from(contrib.dates).sort(),
                truncated: !!(contrib.truncated || created.truncated)
            };
            writeCache(key, data);
            return data;
        })().finally(() => metricsInflight.delete(key));

        metricsInflight.set(key, p);
        return p;
    }

    // ------------------------------------------------------------------
    // 作品评分附加分
    // ------------------------------------------------------------------

    /** 读取投票系统写出的最新一份全站排名快照 */
    async function readRankingSnapshot() {
        const entry = await readPageText(CONFIG.RANKING_SNAPSHOT_TITLE);
        if (!entry || !entry.text) return null;

        const re = new RegExp(
            '<!--\\s*' + CONFIG.RANKING_SNAPSHOT_MARKER + '_v' + CONFIG.RANKING_SNAPSHOT_VERSION +
            ':(\\d{4}-\\d{2}-\\d{2}T[^|]+)\\|([\\s\\S]+?)\\s*-->',
            'g'
        );
        let last = null, m;
        while ((m = re.exec(entry.text)) !== null) {
            try {
                const obj = JSON.parse(m[2]);
                if (obj && Array.isArray(obj.rows)) {
                    last = {
                        ts: Math.floor(new Date(m[1]).getTime() / 1000),
                        rows: obj.rows
                    };
                }
            } catch (e) {}
        }
        return last;
    }

    const CREATOR_CACHE_KEY = 'userlevel.v5.creators';

    /** 批量取每个页面“最初一版”的编辑者 */
    async function fetchFirstRevisionUsers(pageIds) {
        const api = new mw.Api();
        const out = {};

        for (let i = 0; i < pageIds.length; i += 50) {
            const batch = pageIds.slice(i, i + 50);
            try {
                const data = await api.get({
                    action: 'query', formatversion: 2,
                    pageids: batch.join('|'),
                    prop: 'revisions',
                    rvprop: 'user|timestamp',
                    rvslots: 'main',
                    rvlimit: 1,
                    rvdir: 'newer'
                });
                const pages = (data.query && data.query.pages) || [];
                pages.forEach(p => {
                    if (!p || p.missing !== undefined) return;
                    const rev = p.revisions && p.revisions[0];
                    if (rev && rev.user) out[p.pageid] = rev.user;
                });
            } catch (e) {}
        }
        return out;
    }

    /** 页面 ID → 最初创建者 的映射，按页缓存（创建者不会变化） */
    async function getCreatorMap(pageIds) {
        const cached = readCache(CREATOR_CACHE_KEY, CONFIG.CREATOR_TTL_MS) || {};
        const wanted = new Set(pageIds);
        const missing = [];
        wanted.forEach(id => { if (cached[id] === undefined) missing.push(id); });

        if (missing.length) {
            const fetched = await fetchFirstRevisionUsers(missing);
            // 查不到的页面记为 ''，避免每次计算都重复请求（24 小时后重试）
            missing.forEach(id => {
                if (fetched[id] === undefined) fetched[id] = '';
            });
            Object.assign(cached, fetched);
            writeCache(CREATOR_CACHE_KEY, cached);
        }

        const out = {};
        wanted.forEach(id => {
            if (cached[id] !== undefined) out[id] = cached[id];
        });
        return out;
    }

    /**
     * 作品加分规则：
     *  1. 取全场快照中“至少有 AVG_MIN_COUNT 票”的文章，算平均分；
     *  2. 用页面最初一版编辑者对应文章的作者；
     *  3. 作者是当前用户、且文章得分 > 平均分 → 加分；
     *     低于或等于平均分 → 不加不减。
     *  加分幅度按“高出均分的程度”折算，单篇上限 BONUS_PER_PAGE，总分上限 BONUS_MAX。
     */
    async function getWorkBonus(user) {
        const snapshot = await readRankingSnapshot();
        if (!snapshot || !snapshot.rows.length) return { bonus: 0, pages: 0, avg: null };

        const voted = snapshot.rows.filter(r =>
            r && typeof r.pageId === 'number' && typeof r.score === 'number' &&
            isFinite(r.score) && (r.count || 0) >= CONFIG.AVG_MIN_COUNT
        );
        if (!voted.length) return { bonus: 0, pages: 0, avg: null };

        let sum = 0, maxScore = -Infinity;
        for (const r of voted) {
            sum += r.score;
            if (r.score > maxScore) maxScore = r.score;
        }
        const avg = sum / voted.length;

        const creators = await getCreatorMap(voted.map(r => r.pageId));

        let bonus = 0, pages = 0;
        for (const r of voted) {
            if (creators[r.pageId] !== user) continue;
            if (!(r.score > avg + 1e-9)) continue;
            // 累加制评分没有理论上限：把“均分 → 当前最高分”的距离当作满分参考
            const room = Math.max(0.5, maxScore - avg);
            const ratio = Math.min(1, (r.score - avg) / room);
            bonus += CONFIG.BONUS_PER_PAGE * ratio;
            pages++;
        }

        bonus = Math.min(CONFIG.BONUS_MAX, Math.round(bonus));
        return { bonus, pages, avg: Math.round(avg * 100) / 100 };
    }

    // ------------------------------------------------------------------
    // 积分与等级
    // ------------------------------------------------------------------

    /** 单维度达成度：实际值 / 参考值。达到参考值为 1，超过后继续按比例增长，无上限 */
    function dimensionRatio(value, ref) {
        if (!(value > 0) || !(ref > 0)) return 0;
        return value / ref;
    }

    function computeScoreBreakdown(counts) {
        const ratios = {
            comment: dimensionRatio(counts.commentCount, CONFIG.REF.comment),
            login:   dimensionRatio(counts.totalDays,   CONFIG.REF.login),
            create:  dimensionRatio(counts.createCount, CONFIG.REF.create),
            edit:    dimensionRatio(counts.editCount,   CONFIG.REF.edit)
        };

        let weighted = 0;
        for (const k in CONFIG.WEIGHTS) {
            weighted += CONFIG.WEIGHTS[k] * (ratios[k] || 0);
        }

        // 每个维度的实际得分，便于在提示里展示构成
        const detail = {};
        for (const k in CONFIG.WEIGHTS) {
            detail[k] = Math.round(CONFIG.BASE_SCORE_MAX * CONFIG.WEIGHTS[k] * (ratios[k] || 0));
        }

        return { base: Math.round(weighted * CONFIG.BASE_SCORE_MAX), ratios, detail };
    }

    function levelFromScore(score) {
        if (!(score > 0)) return 0;
        return Math.floor(Math.pow(score / CONFIG.LEVEL_THRESHOLD, 1 / CONFIG.LEVEL_EXP));
    }

    function statsKey(user) { return 'userlevel.v6.stats2.' + user; }
    const statsInflight = new Map();

    async function buildStats(user, recOverride, metricsOverride) {
        const today = todayUTC();

        let rec;
        if (recOverride !== undefined) {
            rec = recOverride;
        } else {
            const snapshot = await readPageText(levelSnapshotTitle(user))
                .catch(() => ({ text: '', revid: null, ts: Date.now() }));
            rec = parseUserSection(snapshot.text, user);
        }

        let metrics;
        if (metricsOverride) {
            metrics = metricsOverride;
        } else {
            try { metrics = await getMetrics(user); }
            catch (e) {
                metrics = { editCount: 0, commentCount: 0, createCount: 0, dates: [], truncated: true };
            }
        }

        const dates = new Set(metrics.dates);
        if (rec) {
            bitmapToDates(rec.bitmap, today).forEach(d => dates.add(d));
        }
        dates.add(today);

        const totalDays = Math.max(dates.size, rec ? rec.totalDays : 0);
        const streak = Math.max(computeStreak(dates), rec ? rec.streak : 0);

        let bonusInfo;
        try { bonusInfo = await getWorkBonus(user); }
        catch (e) { bonusInfo = { bonus: 0, pages: 0, avg: null }; }

        const counts = {
            commentCount: metrics.commentCount || 0,
            totalDays,
            createCount: metrics.createCount || 0,
            editCount: metrics.editCount || 0
        };

        const breakdown = computeScoreBreakdown(counts);
        const score = breakdown.base + (bonusInfo.bonus || 0);
        const level = levelFromScore(score);

        return {
            level,
            score,
            baseScore: breakdown.base,
            bonus: bonusInfo.bonus || 0,
            workPages: bonusInfo.pages || 0,
            workAvg: bonusInfo.avg,
            streak,
            totalDays,
            commentCount: counts.commentCount,
            createCount: counts.createCount,
            editCount: counts.editCount,
            partial: !!metrics.truncated
        };
    }

    function getStatsFor(user) {
        if (!user || mw.util.isIPAddress(user)) return Promise.resolve(null);

        const key = statsKey(user);
        const cached = readCache(key, CONFIG.STATS_TTL_MS);
        if (cached) return Promise.resolve(cached);
        if (statsInflight.has(key)) return statsInflight.get(key);

        const p = buildStats(user)
            .then(stats => { writeCache(key, stats); return stats; })
            .finally(() => statsInflight.delete(key));

        statsInflight.set(key, p);
        return p;
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------

    function levelToTier(level) {
        if (level >= 30) return 5;
        if (level >= 20) return 4;
        if (level >= 10) return 3;
        if (level >= 5)  return 2;
        if (level >= 2)  return 1;
        return 0;
    }

    function statsTitle(stats, withStreak) {
        const bits = [
            '积分 ' + stats.score + '（基础 ' + stats.baseScore + ' + 作品 ' + stats.bonus + '）',
            '评论 ' + stats.commentCount,
            '登录 ' + stats.totalDays + ' 天',
            '创建 ' + stats.createCount + ' 页',
            '编辑 ' + stats.editCount + (stats.partial ? '+' : '')
        ];
        if (stats.workPages > 0) {
            bits.push('高于均分作品 ' + stats.workPages + ' 篇（均分 ' + stats.workAvg + '）');
        }
        if (withStreak) bits.push('连续 ' + stats.streak + ' 天');
        return '活跃等级 Lv' + stats.level + '｜' + bits.join('｜');
    }

    function buildMastheadLi(stats) {
        const li = document.createElement('li');
        li.className = 'userlevel-stat ul-tier-' + levelToTier(stats.level);

        const label = document.createElement('span');
        label.className = 'ul-label';
        label.textContent = 'Lv';
        li.appendChild(label);

        const badge = document.createElement('span');
        badge.className = 'ul-badge';
        badge.textContent = String(stats.level);
        li.appendChild(badge);

        if (stats.streak >= 3) {
            const s = document.createElement('span');
            s.className = 'ul-streak';
            s.textContent = ' · 连续 ' + stats.streak + ' 天';
            li.appendChild(s);
        }

        li.title = statsTitle(stats, true);
        return li;
    }

    function buildUserMenuLi(stats) {
        const li = document.createElement('li');
        li.className = 'citizen-userInfo-usergroup userlevel-usergroup ul-tier-' + levelToTier(stats.level);

        const label = document.createElement('span');
        label.className = 'ul-label';
        label.textContent = 'Lv';
        li.appendChild(label);

        const badge = document.createElement('span');
        badge.className = 'ul-badge';
        badge.textContent = String(stats.level);
        li.appendChild(badge);

        li.title = statsTitle(stats, false);
        return li;
    }

    // 没有用户组的普通用户：用户名下方用的徽章（<div>，不能复用 <li>）
    function buildFallbackBadge(stats) {
        const box = document.createElement('div');
        box.className = 'userlevel-fallback userlevel-usergroup ul-tier-' + levelToTier(stats.level);

        const label = document.createElement('span');
        label.className = 'ul-label';
        label.textContent = 'Lv';
        box.appendChild(label);

        const badge = document.createElement('span');
        badge.className = 'ul-badge';
        badge.textContent = String(stats.level);
        box.appendChild(badge);

        box.title = statsTitle(stats, false);
        return box;
    }

    function injectUserMenu(stats) {
        if (!stats) return;

        // 优先沿用用户组区域的注入点
        let injected = false;
        document.querySelectorAll('.citizen-userInfo-usergroups').forEach(ul => {
            injected = true;
            if (ul.querySelector('.userlevel-usergroup, .userlevel-fallback')) return;
            ul.prepend(buildUserMenuLi(stats));
        });
        if (injected) return;

        // 普通用户没有用户组容器：插到用户名标题下方
        document.querySelectorAll('.citizen-userInfo').forEach(box => {
            if (box.querySelector('.userlevel-usergroup, .userlevel-fallback')) return;
            const title = box.querySelector('.citizen-userInfo-title');
            const el = buildFallbackBadge(stats);
            if (title) {
                if (title.nextSibling) title.parentNode.insertBefore(el, title.nextSibling);
                else title.parentNode.appendChild(el);
            } else {
                box.prepend(el);
            }
        });
    }

    function injectMasthead(stats) {
        if (!stats) return;
        document.querySelectorAll('.profile-header-statistics').forEach(ul => {
            if (ul.querySelector('.userlevel-stat')) return;
            ul.prepend(buildMastheadLi(stats));
        });
    }

    function waitFor(sel, timeout) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            (function tick() {
                if (document.querySelector(sel)) return resolve();
                if (Date.now() - t0 > timeout) return reject(new Error('timeout ' + sel));
                setTimeout(tick, 200);
            })();
        });
    }

    function getPageOwner() {
        if (mw.config.get('wgNamespaceNumber') !== 2) return null;
        const title = mw.config.get('wgTitle') || '';
        const owner = title.split('/')[0];
        return owner || null;
    }

    async function main() {
        mw.util.addCSS(CSS);

        const tasks = [];

        if (!mw.user.isAnon()) {
            const me = mw.user.getName();
            recordVisit(me).catch(() => {});
            // 等用户信息卡出现即可：有用户组的用户和普通用户都有 .citizen-userInfo
            tasks.push(
                waitFor('.citizen-userInfo', CONFIG.WAIT_TIMEOUT)
                    .then(() => getStatsFor(me))
                    .then(injectUserMenu)
                    .catch(() => {})
            );
        }

        const owner = getPageOwner();
        if (owner && !mw.util.isIPAddress(owner)) {
            tasks.push(
                waitFor('.profile-header-statistics', CONFIG.WAIT_TIMEOUT)
                    .then(() => getStatsFor(owner))
                    .then(injectMasthead)
                    .catch(() => {})
            );
        }

        await Promise.allSettled(tasks);
    }

    $(() => main().catch(() => {}));
})();

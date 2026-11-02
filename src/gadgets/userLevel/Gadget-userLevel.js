(function () {
    'use strict';

    const CONFIG = {
        LOOKBACK_DAYS: 180,
        BASE_SCORE: 10,
        LEVEL_THRESHOLD: 80,
        LEVEL_EXP: 1.5,
        STREAK_TIERS: [
            { min: 60, mult: 2.0 },
            { min: 30, mult: 1.5 },
            { min: 7,  mult: 1.0 },
            { min: 0,  mult: 0.5 }
        ],
        COMMENT_NS: 844,
        COMMENT_WEIGHT: 2,

        CACHE_TTL_MS: 10 * 60 * 1000,
        EDIT_CACHE_MS: 60 * 60 * 1000,
        COMMENT_CACHE_MS: 60 * 60 * 1000,
        PAGE_CACHE_MS: 30 * 1000,

        MAX_REQUESTS: 15,
        WAIT_TIMEOUT: 8000,

        SNAPSHOT_TITLE: 'Storage:Userlevel',
        SNAPSHOT_BUCKETS: 256,
        FILTER_PREFIX: 'mwlfg:'
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

    const pad = n => n < 10 ? '0' + n : '' + n;
    const fmtDate = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    const todayUTC = () => fmtDate(new Date());
    function daysBetween(a, b) {
        const [ay, am, ad] = a.split('-').map(Number);
        const [by, bm, bd] = b.split('-').map(Number);
        return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
    }
    const MASK30 = (1 << 30) - 1;

    function readCache(key) {
        try {
            const raw = mw.storage.get(key); if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.ts || Date.now() - o.ts > CONFIG.CACHE_TTL_MS) return null;
            return o.data;
        } catch (e) { return null; }
    }
    function writeCache(key, data) {
        try { mw.storage.set(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
    }
    function statsKey(user) { return 'userlevel.lv.v4.' + user; }

    function editCacheKey(user) { return 'userlevel.edits.v4.' + user; }
    function readEditCache(user) {
        try {
            const raw = mw.storage.get(editCacheKey(user)); if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || Date.now() - o.ts > CONFIG.EDIT_CACHE_MS) return null;
            return new Set(o.days);
        } catch (e) { return null; }
    }
    function writeEditCache(user, set) {
        try {
            mw.storage.set(editCacheKey(user), JSON.stringify({ ts: Date.now(), days: Array.from(set) }));
        } catch (e) {}
    }

    function commentCacheKey(user) { return 'userlevel.comments.v4.' + user; }
    function readCommentCache(user) {
        try {
            const raw = mw.storage.get(commentCacheKey(user)); if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || Date.now() - o.ts > CONFIG.COMMENT_CACHE_MS) return null;
            return o.count;
        } catch (e) { return null; }
    }
    function writeCommentCache(user, count) {
        try {
            mw.storage.set(commentCacheKey(user), JSON.stringify({ ts: Date.now(), count }));
        } catch (e) {}
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
    function snapshotTitle(name) {
        return CONFIG.SNAPSHOT_TITLE + '/' + bucketOf(name);
    }

    const pageCache = new Map();

    async function readSnapshotPage(title, force) {
        const cached = pageCache.get(title);
        if (!force && cached && Date.now() - cached.ts < CONFIG.PAGE_CACHE_MS) {
            return cached;
        }
        const api = new mw.Api();
        let entry;
        try {
            const data = await api.get({
                action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
                titles: title, formatversion: 2
            });
            const page = data.query && data.query.pages && data.query.pages[0];
            if (!page || page.missing) {
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
                return {
                    lastActive: p[0],
                    streak: parseInt(p[1], 10) || 0,
                    totalDays: parseInt(p[2], 10) || 0,
                    bitmap: parseInt(p[3], 16) || 0
                };
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
        return [
            rec.lastActive,
            rec.streak,
            rec.totalDays,
            (rec.bitmap >>> 0).toString(16).padStart(8, '0')
        ].join('\t');
    }

    async function fetchActiveDates(user) {
        const api = new mw.Api();
        const end = new Date();
        const start = new Date(end.getTime() - CONFIG.LOOKBACK_DAYS * 86400000);
        const dates = new Set();
        let cont = {}, guard = 0;
        while (guard++ < CONFIG.MAX_REQUESTS) {
            const params = Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs', ucuser: user,
                ucstart: start.toISOString(), ucend: end.toISOString(),
                uclimit: 'max', ucprop: 'timestamp'
            }, cont);
            const data = await api.get(params);
            (data.query && data.query.usercontribs || []).forEach(c => {
                if (c && c.timestamp) dates.add(c.timestamp.slice(0, 10));
            });
            if (data.continue) cont = data.continue; else break;
        }
        return dates;
    }

    async function fetchActiveDatesCached(user) {
        const c = readEditCache(user);
        if (c) return c;
        const dates = await fetchActiveDates(user);
        writeEditCache(user, dates);
        return dates;
    }

    async function fetchCommentCount(user) {
        const cached = readCommentCache(user);
        if (cached !== null) return cached;

        const api = new mw.Api();
        let count = 0;
        let cont = {}, guard = 0;
        while (guard++ < CONFIG.MAX_REQUESTS) {
            const params = Object.assign({
                action: 'query', formatversion: 2, list: 'usercontribs', ucuser: user,
                uclimit: 'max', ucdir: 'newer',
                ucnamespace: CONFIG.COMMENT_NS, ucprop: 'timestamp'
            }, cont);
            const data = await api.get(params);
            count += (data.query && data.query.usercontribs || []).length;
            if (data.continue) cont = data.continue; else break;
        }
        writeCommentCache(user, count);
        return count;
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
        return { lastActive: today, streak, totalDays: rec.totalDays + 1, bitmap };
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

    function statsFromActiveDates(dates, floorTotalDays, floorStreak, commentCount) {
        const computedStreak = computeStreak(dates);
        const streak = Math.max(computedStreak, floorStreak || 0);
        const totalDays = Math.max(dates.size, floorTotalDays || 0);

        let mult = 0.5;
        for (const t of CONFIG.STREAK_TIERS) {
            if (streak >= t.min) { mult = t.mult; break; }
        }

        const score = totalDays * CONFIG.BASE_SCORE
                    + Math.floor(streak * CONFIG.BASE_SCORE * mult)
                    + (commentCount || 0) * CONFIG.COMMENT_WEIGHT;

        const level = Math.floor(Math.pow(score / CONFIG.LEVEL_THRESHOLD, 1 / CONFIG.LEVEL_EXP));
        return { level, score, streak, totalDays, commentCount: commentCount || 0 };
    }

    const REC_TODAY_KEY = 'userlevel.rec.today';
    function hasRecordedToday() {
        try { return mw.storage.get(REC_TODAY_KEY) === todayUTC(); } catch (e) { return false; }
    }
    function markRecordedToday() {
        try { mw.storage.set(REC_TODAY_KEY, todayUTC()); } catch (e) {}
    }

    async function recordVisit(username) {
        if (mw.user.isAnon() || mw.util.isIPAddress(username)) return;
        if (hasRecordedToday()) return;

        const today = todayUTC();
        const title = snapshotTitle(username);
        const api = new mw.Api();

        for (let attempt = 0; attempt < 3; attempt++) {
            const { text } = await readSnapshotPage(title, true);

            let rec = parseUserSection(text, username);
            const sectionIdx = findSectionIndex(text, username);

            if (!rec) {
                let editDates;
                try { editDates = await fetchActiveDatesCached(username); }
                catch (e) { editDates = new Set(); }
                rec = initRecord(today, editDates);
            } else {
                if (rec.lastActive === today) { markRecordedToday(); return; }
                rec = settleRecord(rec, today);
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
                pageCache.delete(title);
                try {
                    mw.storage.remove(statsKey(username));
                    mw.storage.remove(commentCacheKey(username));
                } catch (e) {}
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

    const inflight = new Map();

    function getStatsFor(user) {
        if (!user || mw.util.isIPAddress(user)) return Promise.resolve(null);
        const key = statsKey(user);
        const c = readCache(key);
        if (c) return Promise.resolve(c);
        if (inflight.has(key)) return inflight.get(key);

        const p = (async () => {
            const title = snapshotTitle(user);

            const snapshot = await readSnapshotPage(title).catch(() => ({
                text: '', revid: null, ts: Date.now()
            }));
            const commentCount = await fetchCommentCount(user).catch(() => 0);

            const rec = parseUserSection(snapshot.text, user);

            if (!rec) {
                let editDates;
                try { editDates = await fetchActiveDatesCached(user); }
                catch (e) { editDates = new Set(); }
                editDates.add(todayUTC());
                const stats = statsFromActiveDates(editDates, 0, 0, commentCount);
                writeCache(key, stats);
                return stats;
            }

            const merged = new Set();
            const todayTs = Date.parse(todayUTC() + 'T00:00:00Z');
            for (let i = 0; i < 30; i++) {
                if (rec.bitmap & (1 << i)) {
                    merged.add(fmtDate(new Date(todayTs - i * 86400000)));
                }
            }
            merged.add(todayUTC());

            const stats = statsFromActiveDates(merged, rec.totalDays, rec.streak, commentCount);
            writeCache(key, stats);
            return stats;
        })().finally(() => inflight.delete(key));

        inflight.set(key, p);
        return p;
    }

    function levelToTier(level) {
        if (level >= 30) return 5;
        if (level >= 20) return 4;
        if (level >= 10) return 3;
        if (level >= 5)  return 2;
        if (level >= 2)  return 1;
        return 0;
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

        li.title = '活跃等级 Lv' + stats.level +
            '｜积分 ' + stats.score +
            '｜累计活跃 ' + stats.totalDays + ' 天' +
            '｜连续 ' + stats.streak + ' 天' +
            '｜评论 ' + (stats.commentCount || 0) + ' 条';
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

        li.title = '活跃等级 Lv' + stats.level +
            '｜积分 ' + stats.score +
            '｜连续 ' + stats.streak + ' 天' +
            '｜评论 ' + (stats.commentCount || 0) + ' 条';
        return li;
    }

    function injectUserMenu(stats) {
        if (!stats) return;
        document.querySelectorAll('.citizen-userInfo-usergroups').forEach(ul => {
            if (ul.querySelector('.userlevel-usergroup')) return;
            ul.prepend(buildUserMenuLi(stats));
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
            tasks.push(
                waitFor('.citizen-userInfo-usergroups', CONFIG.WAIT_TIMEOUT)
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
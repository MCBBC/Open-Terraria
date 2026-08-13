/* SandboxWorld 资产持久缓存 Service Worker(2026-08-13)。
 * 职责:①拦截 /sprites|fonts|l10n|sounds|audios 的 GET 走 Cache API 磁盘缓存
 * (cache-first,未命中网络回填)——对 new Image()/fetch/@font-face 全透明;
 * ②接收页面 AssetCache 驱动器的 {init/warm/warm-cancel} 消息做优先级后台下载:
 *   warm 前 cache.keys() 建已缓存集,只 fetch 缺失(不重复下载+被系统清理后
 *   只补缺=自愈);并发 6,逐文件失败跳过,进度 postMessage 回页面。
 * 版本:缓存名 sw-assets-v{version},version 由页面运行时计算(vanilla.json+
 * vanilla-ui.json 内容 hash + 手填 CACHE_BUSTER)——activate 清除非当前版本。
 * 不缓存:HTML/JS/API(vite hash 自足;碰它会有更新卡壳风险)。 */
'use strict';

const ASSET_RE = /\/(sprites|fonts|l10n|sounds|audios)\//;
const CACHE_PREFIX = 'sw-assets-v';
let currentVersion = '';
let cacheReady = null;
let warmAbort = false;

const cacheName = () => CACHE_PREFIX + currentVersion;
function getCache() {
  if (!cacheReady) cacheReady = caches.open(cacheName());
  return cacheReady;
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    await self.clients.claim();
    const keep = cacheName();
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== keep) await caches.delete(name);
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !currentVersion) return;
  const path = new URL(req.url).pathname;
  // ② 应用壳(vite 内容寻址 JS/CSS + 文档):网络优先+离线回退——真断网也能进游戏
  //    (JS 带 hash,旧缓存仅在离线时兜底,在线永远走网络=更新不卡壳)
  const isShellJs = /^\/assets\/.+\.(js|css|woff2?)$/.test(path);
  const isDoc = req.destination === 'document' || path === '/' || path.endsWith('.html');
  if (isShellJs || isDoc) {
    e.respondWith((async () => {
      const cache = await getCache();
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
  // ① 资产前缀:cache-first,未命中网络回填
  if (!ASSET_RE.test(path)) return;
  e.respondWith((async () => {
    const cache = await getCache();
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});

async function warm(tag, urls, base) {
  if (lastWarm.running) return;  // 重入守卫:看门狗补发时旧 warm 未死不叠跑
  warmAbort = false;
  const done0 = base || 0;
  lastWarm = { done: done0, total: done0 + urls.length, failed: 0, running: true };
  const cache = await getCache();
  // pathname 归一(去前导 /):cache 条目是绝对 URL 的 pathname,清单是相对路径
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, '')));
  const missing = urls.filter((u) => !have.has(u.replace(/^\//, '')));
  const total = done0 + urls.length;
  let done = total - missing.length;
  let failed = 0;
  // 背压:降并发 + 每 400 文件 250ms 喘息(Cache API 磁盘落盘缓冲排空窗口)
  const CONC = 3;
  const BREATH_EVERY = 400;
  const BREATH_MS = 250;
  let cursor = 0;
  let sinceBreath = 0;
  const breath = () => new Promise((r) => setTimeout(r, BREATH_MS));
  const workers = Array.from({ length: Math.min(CONC, missing.length) }, async () => {
    for (;;) {
      if (warmAbort) return;
      if (sinceBreath >= BREATH_EVERY) { sinceBreath = 0; await breath(); }
      const i = cursor++;
      if (i >= missing.length) return;
      const u = missing[i];
      try {
        const res = await fetch(u);
        if (res && res.ok) await cache.put(u, res);
        else failed++;
      } catch (err) {
        failed++;
      }
      done++;
      sinceBreath++;
      lastWarm.done = done; lastWarm.failed = failed;
      if ((done & 7) === 0 || done === total) postProgress(tag, done, total, failed);
    }
  });
  await Promise.all(workers);
  lastWarm = { done, total, failed, running: false };
  postProgress(tag, done, total, failed);
  postMessageToPages({ type: 'warm-done', tag, done, total, failed, aborted: warmAbort });
}

/** 缓存现状查询(页面初始完成判定/清理检测;附最近一轮 warm 统计) */
let lastWarm = { done: 0, total: 0, failed: 0, running: false };
async function reportStatus() {
  const cache = await getCache();
  const cached = (await cache.keys()).length;
  postMessageToPages({ type: 'status', version: currentVersion, cached, warm: lastWarm });
}

function postProgress(tag, done, total, failed) {
  postMessageToPages({ type: 'warm-progress', tag, done, total, failed });
}
function postMessageToPages(msg) {
  self.clients.matchAll({ includeUncontrolled: true }).then((cs) => {
    for (const c of cs) c.postMessage(msg);
  }).catch(() => {});
}

self.addEventListener('message', (e) => {
  const d = e.data || {};
  // ★version 无状态化(2026-08-13 实测):SW 会被浏览器在 ~3min 处击杀,重启后
  // 内存里的 currentVersion 丢失——warm/status 消息必须自带 version 才能选对缓存
  const msgVersion = typeof d.version === 'string' && d.version ? d.version : null;
  if (msgVersion && msgVersion !== currentVersion) {
    currentVersion = msgVersion;
    cacheReady = null;
  }
  if (d.type === 'init') {
    getCache();
  } else if (d.type === 'warm') {
    if (!currentVersion) return; // 无版本(未 init 且消息未带)拒绝,防写错缓存
    // ★必须 waitUntil:否则 message 事件结束后 Chrome 随时终止 SW
    e.waitUntil(warm(d.tag || '', d.urls || [], d.base || 0).catch(() => {}));
  } else if (d.type === 'warm-cancel') {
    warmAbort = true;
  } else if (d.type === 'ping') {
    postMessageToPages({ type: 'pong', version: currentVersion });
  } else if (d.type === 'status') {
    if (!currentVersion) return;
    reportStatus();
  }
});

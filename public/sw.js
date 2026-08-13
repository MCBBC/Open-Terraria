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
  if (req.method !== 'GET' || !currentVersion || !ASSET_RE.test(new URL(req.url).pathname)) return;
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

async function warm(tag, urls) {
  warmAbort = false;
  const cache = await getCache();
  // pathname 归一(去前导 /):cache 条目是绝对 URL 的 pathname,清单是相对路径
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, '')));
  const missing = urls.filter((u) => !have.has(u.replace(/^\//, '')));
  const total = urls.length;
  let done = total - missing.length;
  let failed = 0;
  const CONC = 6;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONC, missing.length) }, async () => {
    for (;;) {
      if (warmAbort) return;
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
      if ((done & 7) === 0 || done === total) postProgress(tag, done, total, failed);
    }
  });
  await Promise.all(workers);
  postProgress(tag, done, total, failed);
  postMessageToPages({ type: 'warm-done', tag, done, total, failed, aborted: warmAbort });
}

/** 缓存现状查询(页面初始完成判定/清理检测) */
async function reportStatus() {
  const cache = await getCache();
  const cached = (await cache.keys()).length;
  postMessageToPages({ type: 'status', version: currentVersion, cached });
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
  if (d.type === 'init') {
    currentVersion = String(d.version || '0');
    cacheReady = null; // 版本切换后重开
    getCache();
  } else if (d.type === 'warm') {
    warm(d.tag || '', d.urls || []).catch(() => {});
  } else if (d.type === 'warm-cancel') {
    warmAbort = true;
  } else if (d.type === 'ping') {
    postMessageToPages({ type: 'pong', version: currentVersion });
  } else if (d.type === 'status') {
    reportStatus();
  }
});

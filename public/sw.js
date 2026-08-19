/* SandboxWorld 资产持久缓存 Service Worker(2026-08-13;2026-08-19 zip 快路径)。
 * 职责:①拦截 /sprites|fonts|l10n|sounds|audios 的 GET 走 Cache API 磁盘缓存
 * (cache-first,未命中网络回填;l10n 例外=网络优先+离线回退,见 fetch 段注)——
 * 对 new Image()/fetch/@font-face 全透明;
 * ②接收页面 AssetCache 驱动器的 {init/warm/warm-zip/warm-cancel} 消息做后台下载:
 *   warm = 逐文件(legacy 回退);warm-zip = 分片 zip 下载+SW 内解压直写缓存
 *   (12003 请求 → ~10 请求;fflate unzipSync 单文件 filter——★异步 API 内部
 *   new Worker,ServiceWorkerGlobalScope 无 Worker 构造器只能 Sync 族);
 *   两者片前/块前 cache.keys() 建已缓存集只补缺失(断点续传+被系统清理后自愈)。
 * 版本:缓存名 sw-assets-v{version},version 由页面运行时计算(vanilla.json+
 * vanilla-ui.json 内容 hash [+ zip manifest contentHash] + CACHE_BUSTER)——
 * activate/init 清除非当前版本。
 * 不缓存:HTML/JS/API(vite hash 自足;碰它会有更新卡壳风险)。 */
'use strict';

/* fflate UMD(pack-assets.mjs 拷自 node_modules/fflate/umd)——★try/catch 必备:
 * importScripts 抛错会炸整个 SW 安装(旧部署无 vendor 文件时靠这层兜底,
 * 页面收 warm-zip-unavailable 后整会话回退逐文件 warm) */
let HAS_FFLATE = false;
try { importScripts('vendor/fflate.js'); HAS_FFLATE = typeof self.fflate === 'object'; } catch (err) { /* zip 模式不可用 */ }

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
  // ★scheme 门(2026-08-13 用户实报):浏览器扩展注入的 chrome-extension:// 等
  // 请求也会进页面 SW——Cache API 只收 http(s),put 即抛
  // "Request scheme 'chrome-extension' is unsupported"。非 http(s) 一律放行。
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.method !== 'GET' || !currentVersion) return;
  const path = url.pathname;
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
  // ① 资产前缀:cache-first,未命中网络回填。
  //    ★例外:l10n 语言包是可变配置(build-l10n 会再生成)——网络优先+离线回退。
  //    cache-first 曾把 2026-08-14 多语言批的新键卡死在旧包(缓存版本号只由
  //    vanilla.json/ui 哈希决定,l10n 重建不换版本 → SW 永远命中旧包,页面显示裸键)
  if (path.startsWith('/l10n/')) {
    e.respondWith((async () => {
      const cache = await getCache();
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
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
  // ---- 自适应并发(2026-08-18 用户"按下载/处理速度自适应并行";曾固定 3 路) ----
  // AIMD:按实测单文件完成延迟 EMA 在 [MIN_CONC, MAX_CONC] 间调节——
  //   快(本地/内网,ema<30ms)每 32 文件 +1 路;慢(弱网/磁盘拥塞,ema>150ms)
  //   路数减半。MAX=8:HTTP/1.1 浏览器同源也就 6 连接,更高无意义(HTTP/2 部署
  //   下 8 路流也够吃带宽)。重试等待不计入延迟(那是网络瞬态,不是容量信号)。
  const MIN_CONC = 2, MAX_CONC = 8, START_CONC = 3;
  const BREATH_EVERY = 400;
  const BREATH_MS = 250;         // 喘息保持:Cache API 磁盘落盘缓冲排空窗口
  let conc = START_CONC;
  let ema = 60;                  // 单文件毫秒 EMA(初值中性)
  let sinceTune = 0;
  let cursor = 0;
  let sinceBreath = 0;
  let active = 0;
  const breath = () => new Promise((r) => setTimeout(r, BREATH_MS));
  // 固定开 MAX 路 worker,用动态 conc 信号量闸住——升/降路不重建 worker 池
  const workers = Array.from({ length: Math.min(MAX_CONC, missing.length) }, async () => {
    for (;;) {
      if (warmAbort) return;
      // 信号量:活跃数超过当前 conc 档 → 让出(微任务轮询,无计时器开销)
      while (active >= conc) {
        if (warmAbort) return;
        await new Promise((r) => setTimeout(r, 15));
      }
      active++;
      try {
        if (sinceBreath >= BREATH_EVERY) { sinceBreath = 0; await breath(); }
        const i = cursor++;
        if (i >= missing.length) return;
        const u = missing[i];
        const t0 = Date.now();
        // 单文件即时重试 ×3(间隔 300/600ms):弱网瞬断就地恢复,不必等全量
        // 跑完后的整轮补拉(2026-08-13 可靠性 review)
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          if (warmAbort) return;
          try {
            const res = await fetch(u);
            if (res && res.ok) { await cache.put(u, res); ok = true; }
            else if (attempt === 2) failed++;
          } catch (err) {
            if (attempt === 2) failed++;
          }
          if (!ok && attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
        // 延迟采样与调参(仅成功文件计入;失败重试的等待会污染信号)
        if (ok) {
          ema = ema * 0.9 + (Date.now() - t0) * 0.1;
          if (++sinceTune >= 32) {
            sinceTune = 0;
            if (ema < 30 && conc < MAX_CONC) conc++;
            else if (ema > 150 && conc > MIN_CONC) conc = Math.max(MIN_CONC, Math.floor(conc / 2));
          }
        }
        done++;
        sinceBreath++;
        lastWarm.done = done; lastWarm.failed = failed;
        if ((done & 7) === 0 || done === total) postProgress(tag, done, total, failed);
      } finally {
        active--;
      }
    }
  });
  await Promise.all(workers);
  lastWarm = { done, total, failed, running: false };
  postProgress(tag, done, total, failed);
  postMessageToPages({ type: 'warm-done', tag, done, total, failed, aborted: warmAbort, conc, emaMs: Math.round(ema) });
}

/** 分片 zip warm(2026-08-19):片下载(重试×3 同 legacy 参) → have-set 过滤 →
 * 逐文件 unzipSync(filter 单文件)+cache.put。★同步计算切成"单文件解压+单次
 * put"粒度(每步 <100ms),事件循环每文件回泵——watchdog/cancel/进度不饿死,
 * 无整片解压内存尖刺;每 200 文件 60ms 喘息(Cache API 落盘排空)。
 * 中途被杀:watchdog 重发本片,have-set 跳过已落条目=片内断点续传。 */
const ZIP_MIME = { png: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg', woff2: 'font/woff2', json: 'application/json' };
const zipMimeOf = (n) => ZIP_MIME[n.slice(n.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

async function warmZip(part, base, totalAll) {
  if (lastWarm.running) return;   // 与 legacy warm 共用重入守卫(看门狗补发不叠跑)
  warmAbort = false;
  const done0 = base + 0;
  lastWarm = { done: done0, total: totalAll, failed: 0, running: true };
  const cache = await getCache();
  // ① 片下载:单文件语义重试 ×3(300/600ms 退避)
  let buf = null;
  for (let a = 0; a < 3 && !buf && !warmAbort; a++) {
    try {
      const res = await fetch('assets-zip/' + part.file);   // 名带内容 hash → HTTP 缓存安全
      if (res && res.ok) buf = await res.arrayBuffer();
    } catch (err) { /* 重试 */ }
    if (!buf && a < 2) await new Promise((r) => setTimeout(r, 300 * (a + 1)));
  }
  if (!buf) {
    lastWarm = { done: done0, total: totalAll, failed: part.files, running: false };
    postMessageToPages({ type: 'warm-done', tag: 'zip', done: done0, total: totalAll, failed: part.files, aborted: warmAbort, conc: 1, emaMs: 0 });
    return;
  }
  // ② 片内断点续传:have-set 归一化与 legacy warm 逐字同构(三方 key 同构根基)
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, '')));
  const todo = part.entries.filter((n) => !have.has(n));
  let done = done0 + (part.entries.length - todo.length);
  let failed = 0;
  lastWarm.done = done;
  // ③ 逐文件解压落缓存(合成 Response 必带 Content-Type——<img>/decode 依赖)
  let putCount = 0;
  for (const name of todo) {
    if (warmAbort) break;
    let data = null;
    try { data = self.fflate.unzipSync(buf, { filter: (f) => f.name === name })[name]; } catch (err) { /* 单文件坏不炸片 */ }
    if (data) {
      try { await cache.put(name, new Response(data, { headers: { 'Content-Type': zipMimeOf(name) } })); done++; }
      catch (err) { failed++; }
    } else failed++;
    lastWarm.done = done; lastWarm.failed = failed;
    if ((done & 63) === 0) postProgress('zip', done, totalAll, failed);
    if (++putCount % 200 === 0) await new Promise((r) => setTimeout(r, 60));   // 落盘喘息
  }
  lastWarm = { done, total: totalAll, failed, running: false };
  postProgress('zip', done, totalAll, failed);
  postMessageToPages({ type: 'warm-done', tag: 'zip', done, total: totalAll, failed, aborted: warmAbort, conc: 1, emaMs: 0 });
}

/** 旧版本缓存 GC(2026-08-19):版本随消息变但 sw.js 字节没变时 activate 不触发,
 * 旧缓存成孤儿——init 时顺带清(legacy 模式同款问题一并修) */
function gcOldCaches() {
  return (async () => {
    const keep = cacheName();
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== keep) await caches.delete(name);
    }
  })().catch(() => {});
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
    e.waitUntil(gcOldCaches());
  } else if (d.type === 'warm') {
    if (!currentVersion) return; // 无版本(未 init 且消息未带)拒绝,防写错缓存
    // ★必须 waitUntil:否则 message 事件结束后 Chrome 随时终止 SW
    e.waitUntil(warm(d.tag || '', d.urls || [], d.base || 0).catch(() => {}));
  } else if (d.type === 'warm-zip') {
    if (!currentVersion) return;
    if (!HAS_FFLATE) {   // 旧部署无 vendor/fflate → 页面整会话回退逐文件
      postMessageToPages({ type: 'warm-zip-unavailable' });
      return;
    }
    e.waitUntil(warmZip(d.part, d.base || 0, d.total || 0).catch(() => {}));
  } else if (d.type === 'warm-cancel') {
    warmAbort = true;
  } else if (d.type === 'ping') {
    postMessageToPages({ type: 'pong', version: currentVersion });
  } else if (d.type === 'status') {
    if (!currentVersion) return;
    reportStatus();
  }
});

/* SandboxWorld 资产持久缓存 Service Worker(2026-08-13;2026-08-19 zip 快路径)。
 * 职责:①拦截 /sprites|fonts|l10n|sounds|audios 的 GET 走 Cache API 磁盘缓存
 * (cache-first,未命中网络回填;l10n 例外=网络优先+离线回退,见 fetch 段注)——
 * 对 new Image()/fetch/@font-face 全透明;
 * ②接收页面 AssetCache 驱动器的 {init/warm/warm-cancel} 消息做后台下载
 *   (warm=逐文件,legacy 回退)。2026-08-19 起 zip 快路径改【页面直给】:
 *   AssetCache 在页面侧 fetch 分片 zip → fflate 解压 → 直接 cache.put(页面
 *   与 SW 共用同一 CacheStorage,key 同构)——SW 零参与,无消息协议/看门狗。
 * 版本:缓存名 sw-assets-v{version},version 由页面运行时计算(vanilla.json+
 * vanilla-ui.json 内容 hash [+ zip manifest contentHash] + CACHE_BUSTER)——
 * activate/init 清除非当前版本。
 * 不缓存:HTML/JS/API(vite hash 自足;碰它会有更新卡壳风险)。 */
'use strict';

const ASSET_RE = /\/(sprites|fonts|l10n|sounds|audios)\//;

// ★MIME 门(2026-08-26):CF Pages 对不存在文件按 SPA 规则回 **200+text/html**
// （线上 HAR 实证:sprites/vanilla/*.png 全部收到 index.html 兜底 ~1.6KB）。
// 只判 res.ok 会把兜底 HTML 当资产正文塞进 Cache API ——永久坏图毒丸。故所有
// 资产类回填必须按扩展名校验 content-type 族;不符一律视作 miss、拒入缓存。
const MIME_BY_EXT = [
  [/\.opus$/, /^audio\/ogg/],
  [/\.png$|\.jpe?g$|\.webp$|\.gif$/, /^image\//],
  [/\.woff2?$|\.ttf$/, /^font\//],
  [/\.json$/, /^(application\/json|text\/json)\b/],
  [/\.wav$|\.mp3$|\.ogg$/, /^audio\//],
  [/\.m?js$/, /^(application|text)\/(javascript|ecmascript)\b/],
  [/\.css$/, /^text\/css\b/],
];
/** 扩展名→规则直查（scrub 全缓存扫描×数千条,warm 首轮数千次 fetch——线性 6 正则
 *  在 CPU profile 里成 SW 线程头号热点,2026-08-28 trace 实证）。未登记=null 不拦 */
const MIME_BY_EXT_MAP = new Map();
for (const [re, want] of MIME_BY_EXT) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'opus', 'ogg', 'woff2', 'woff', 'ttf', 'json',
    'wav', 'mp3', 'js', 'mjs', 'css']) {
    if (re.test('.' + ext)) MIME_BY_EXT_MAP.set(ext, want);
  }
}
function mimeOk(path, res) {
  // 与原线性正则严格同义：小写敏感、路径终点锚定（fetch/warm 传的都是无 query 路径）
  const m = /\.([a-z0-9]+)$/.exec(path);
  const want = m ? MIME_BY_EXT_MAP.get(m[1]) : undefined;
  if (!want) return true;   // 未登记扩展名不拦（维持旧行为）
  const ct = res.headers.get('content-type') || '';
  return want.test(ct);
}
// ★warm 窗口 404 静默(2026-09-04):冷启动分片 warm 进行中,懒加载 miss 会穿透
// 到网络的真 404(prune 形态散件不存在,HAR 实报 Sun/Moon 5 连红)。功能上无碍
// (204 与 404 同样触发消费方 onerror/退避重试链,自愈语义零变化),但 DevTools
// Network/Console 满屏红、HAR 审计噪音大。改:页面 AssetCache 经 {type:'zip-warm'}
// 消息同步 warming 旗(SW 被杀重启后从 __sw_meta__ 恢复),窗口内对【图片类 GET
// miss 的 404】应答 204 No Content(无体→任何浏览器都必然 onerror)。边界:
//  · 仅 GET——HEAD 存在性探测(ui 失败负缓存长 TTL 分档)直通不受扰
//  · warm 终态后 miss 仍真 404 直通=诊断面保留;真首访(无版本缓存)无从判定,不拦
const IMG_MISS_RE = /\.png$|\.jpe?g$|\.webp$|\.gif$/;
let zipWarmActive = null;   // null=未知(SW 重启后),true/false=消息/缓存恢复
async function isZipWarmActive() {
  if (zipWarmActive !== null) return zipWarmActive;
  try {
    const cache = await getCache();
    const m = await cache.match('__sw_meta__');
    const j = m ? await m.json().catch(() => null) : null;
    zipWarmActive = !!(j && j.zipWarm);
  } catch { zipWarmActive = false; }
  return zipWarmActive;
}
function setZipWarmFlag(on) {
  zipWarmActive = !!on;
  return (async () => {
    try {
      const cache = await getCache();
      const m = await cache.match('__sw_meta__');
      const j = (m ? await m.json().catch(() => null) : null) || {};
      j.zipWarm = !!on;
      await cache.put('__sw_meta__', new Response(JSON.stringify(j)));
    } catch { /* 持久失败仅影响 SW 重启后的窗口判定,本轮内存旗已生效 */ }
  })();
}
/** warm 窗口图片 miss 静默应答(命中返回 204,否则 null=走原路径) */
async function silentWarmMiss(req, path) {
  if (req.method !== 'GET' || !IMG_MISS_RE.test(path)) return null;
  if (!(await isZipWarmActive())) return null;
  // x-sw-warm-miss 头:HAR 审计可直接识别"这是 warm 窗口静默,非真缺"
  return new Response(null, { status: 204, headers: { 'x-sw-warm-miss': '1' } });
}

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
    // ★版本未知(currentVersion='')时禁止 GC(2026-08-25 OSS 首访 404 风暴根因):
    //   首访 claim 落地可能晚于页面建缓存/开暖——此处按 keep='' 清扫会把暖缓存的
    //   sw-assets-v* 当孤儿整仓删掉(put 全部写进被删句柄=静默假完成)。GC 移交
    //   init 消息处的 gcOldCaches()(那时 version 已由消息带入)
    if (!currentVersion) return;
    const keep = cacheName();
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== keep) await caches.delete(name);
    }
  })());
});

const SHELL_RE = /^\/assets\/.+\.(js|css|woff2?)$/;
const isDocPath = (req, path) => req.destination === 'document' || path === '/' || path.endsWith('.html');

/** ★版本恢复(2026-09-04 线上实锤"进世界后天空/雷管族逐会话 404"):SW 进程被
 *  浏览器 ~3min 击杀重启后,内存 currentVersion 丢失('')——fetch handler 的
 *  `!currentVersion → return 放行` 让所有资产请求裸奔网络(prune 散件 404),
 *  且 zip 模式页面无周期 version 消息 ⇒ 永不恢复。兜底:caches.keys() 的唯一
 *  sw-assets-v* 名即当前版本(单版本不变式);推导一次,此后走同步快路径。 */
async function recoverVersion() {
  if (currentVersion) return currentVersion;
  try {
    const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
    if (names.length === 1) {
      currentVersion = names[0].slice(CACHE_PREFIX.length);
      cacheReady = null;
    }
  } catch { /* */ }
  return currentVersion;
}

/** 资产服务主逻辑(fetch handler 主体;返回 null = 放行网络) */
async function serveAsset(req, path) {
  const cache = await getCache();
  const hit = await cache.match(req, { ignoreVary: true }).catch(() => null);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // SPA 兜底(200+text/html)或异常:拒入缓存,并以真 404 应答——上层
    // onerror 立即稳定,不再因 HTML 解码失败进入帧循环重试(HAR:单图 5 连击)
    if (!res || !res.ok || res.type !== 'basic' || !mimeOk(path, res)) {
      if (res && !res.ok) {
        return (await silentWarmMiss(req, path)) || res;   // warm 窗口图片 miss → 204 静默
      }
      return (await silentWarmMiss(req, path)) || new Response('', { status: 404 });
    }
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    // ★fetch 瞬态失败(离线/闪断):二次 match 回退——期间可能有并发 put 落地
    const hit2 = await cache.match(req, { ignoreVary: true }).catch(() => null);
    return hit2 || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // ★scheme 门(2026-08-13 用户实报):浏览器扩展注入的 chrome-extension:// 等
  // 请求也会进页面 SW——Cache API 只收 http(s),put 即抛
  // "Request scheme 'chrome-extension' is unsupported"。非 http(s) 一律放行。
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.method !== 'GET') return;
  const path = url.pathname;
  const assetish = ASSET_RE.test(path) || SHELL_RE.test(path) || path.startsWith('/l10n/') ||
    isDocPath(req, path);
  // ★SW 重启后 currentVersion=''——此窗口的资产请求放行=裸奔 404(prune)。
  //  兜底:caches.keys() 的唯一 sw-assets-v* 名 = 当前版本(单版本不变式),
  //  async 恢复一次后所有请求走 serveAsset 快路径。
  if (assetish && !currentVersion) {
    e.respondWith((async () => {
      const ver = await recoverVersion();
      if (!ver) return fetch(req);            // 无任何版本缓存(真首访)→ 网络
      const res = await serveAsset(req, path);
      return res ?? fetch(req);
    })());
    return;
  }

  // ② 应用壳(拆双策略,2026-08-25):
  //    a) 内容寻址资产(/assets/ 下 js/css/woff2 均为 vite 哈希名,不可变):
  //       cache-first——老用户重复访问零重下(实测省主 chunk 2.2MB gz/次)。
  //       新版本经 index.html(文档仍网络优先)引用新哈希名自然更新,不存在
  //       "更新卡壳":2026-08-13 的顾虑基于当时未依赖纯哈希寻址,现 /assets/
  //       下全部为内容寻址名,旧条目随版本换代(gcOldCaches)自然清理。
  //    b) 文档(index.html 等):网络优先+离线回退——版本发现入口,语义不变。
  const isShellJs = /^\/assets\/.+\.(js|css|woff2?)$/.test(path);
  const isDoc = req.destination === 'document' || path === '/' || path.endsWith('.html');
  if (isDoc) {
    e.respondWith((async () => {
      const cache = await getCache();
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreVary: true }).catch(() => null);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
  if (isShellJs) {
    e.respondWith((async () => {
      const cache = await getCache();
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok && mimeOk(path, res)) { await cache.put(req, res.clone()); return res; }
        if (res) return res;   // 非 ok(404 等)直通不缓存
      } catch (err) { /* 离线且无缓存 → 504 */ }
      return new Response('', { status: 504, statusText: 'offline' });
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
        if (res && res.ok && res.type === 'basic' && mimeOk(path, res)) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreVary: true }).catch(() => null);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }
  if (!ASSET_RE.test(path)) return;
  e.respondWith((async () => {
    const cache = await getCache();
    const hit = await cache.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      // SPA 兜底(200+text/html)或异常:拒入缓存,并以真 404 应答——上层
      // onerror 立即稳定,不再因 HTML 解码失败进入帧循环重试(HAR:单图 5 连击)
      if (!res || !res.ok || res.type !== 'basic' || !mimeOk(path, res)) {
        if (res && !res.ok) {
          return (await silentWarmMiss(req, path)) || res;   // warm 窗口图片 miss → 204 静默
        }
        return (await silentWarmMiss(req, path)) || new Response('', { status: 404 });
      }
      cache.put(req, res.clone());
      return res;
    } catch (err) {
      // ★fetch 瞬态失败(离线/闪断):二次 match 回退——期间可能有并发 put 落地
      const hit2 = await cache.match(req, { ignoreVary: true }).catch(() => null);
      return hit2 || Response.error();
    }
  })());
});

async function warm(tag, urls, base) {
  if (lastWarm.running) return;  // 重入守卫:看门狗补发时旧 warm 未死不叠跑
  warmAbort = false;
  const done0 = base || 0;
  lastWarm = { done: done0, total: done0 + urls.length, failed: 0, running: true };
  const cache = await getCache();
  // pathname 归一(去前导 /+★decode):cache 条目 URL 保留编码(空格=%20),
  // 清单是原始空格名——曾致带空格条目每轮恒判缺失、每次启动重下 58MB
  // (2026-08-27;与 src/net/AssetCache.ts normCacheKey 双侧同步)
  const have = new Set((await cache.keys()).map((r) => {
    const p = new URL(r.url).pathname.replace(/^\//, '');
    try { return decodeURIComponent(p); } catch { return p; }
  }));
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
            if (res && res.ok && mimeOk(u, res)) { await cache.put(u, res); ok = true; }
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
/** 旧版本缓存 GC(2026-08-19):版本随消息变但 sw.js 字节没变时 activate 不触发,
 * 旧缓存成孤儿——init 时顺带清(legacy 模式同款问题一并修) */
function gcOldCaches() {
  return (async () => {
    const keep = cacheName();
    // ★无版本会话(keep=CACHE_PREFIX 裸名)禁止清缓存——version 缺失意味着
    //   本会话没拿到清单,删"非当前"=删掉成功会话的全部暖存(2026-08-27)
    if (keep === CACHE_PREFIX) return;
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== keep) await caches.delete(name);
    }
  })().catch(() => {});
}

/** 毒丸卫生清扫(2026-08-26):旧版无 MIME 门时期,Pages SPA 兜底的
 * "200+text/html 伪图"曾被照常 cache.put;缓存名由页面内容 hash 推导、内容
 * 不变则同名——毒条目会跨 SW 换代存活并被 cache-first 直接命中(连 fetch 都
 * 不发,MIME 门无从拦截)。init 时逐条目核对已登记扩展名的 content-type,
 * 不符即删:删后下次请求走 miss→fetch→MIME 门拒置真 404,零好数据重下。 */
let scrubRunning = null;
async function scrubPoisonedEntries() {
  if (scrubRunning) return scrubRunning;
  scrubRunning = _scrubInner().finally(() => { scrubRunning = null; });
  return scrubRunning;
}
async function _scrubInner(force = false) {
  try {
    const cache = await getCache();
    // ★每版本一次(2026-08-28 trace 实证):全缓存逐条 match+MIME 是 SW 线程
    // 头号 CPU 热点(数千条×IO),而毒条目只能来自"坏部署写同名缓存"——同版本
    // 二次 init 纯重复扫。标记条目存版本内,跨 SW 重启仍跳过;换版本自然重扫。
    // force(gc 显式清理)无视标记强制重扫=同版本毒条目再现的逃生门。
    if (!force) try {
      const marker = await cache.match('__sw_meta__');
      if (marker) {
        const j = await marker.json().catch(() => null);
        if (j && j.scrubbedVersion === currentVersion) return;
      }
    } catch { /* 标记读失败按未清扫处理 */ }
    const bad = [];
    for (const req of await cache.keys()) {
      const p = new URL(req.url).pathname;
      if (!MIME_BY_EXT.some(([re]) => re.test(p))) continue;
      const res = await cache.match(req, { ignoreVary: true });
      if (!res) continue;
      if (!mimeOk(p, res)) bad.push(req);
    }
    for (const r of bad) await cache.delete(r);
    if (bad.length) console.log(`[sw] 清除 SPA 兜底伪图 ${bad.length} 条`);
    // ★合并写入(2026-09-04):__sw_meta__ 还存 zipWarm 旗(warm 窗口静默),
    //  整对象覆盖会把它抹掉——SW 重启后窗口判定失真
    const prevMeta = await cache.match('__sw_meta__').catch(() => null);
    const prevJ = (prevMeta ? await prevMeta.json().catch(() => null) : null) || {};
    await cache.put('__sw_meta__', new Response(JSON.stringify({ ...prevJ, scrubbedVersion: currentVersion })));
  } catch { /* 清扫失败不阻断 init */ }
}

/** 缓存现状查询(页面初始完成判定/清理检测;附最近一轮 warm 统计) */
let lastWarm = { done: 0, total: 0, failed: 0, running: false };
async function reportStatus() {
  const cache = await getCache();
  // 排除 __sw_meta__ 标记——legacy 逐文件模式用全缓存条目数校准进度
  // (AssetCache state.done=min(cached,total)),计数语义必须与标记引入前逐位一致
  const cached = (await cache.keys()).filter((r) => !r.url.endsWith('/__sw_meta__')).length;
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
    // ★gc 权限模型(2026-08-27):init 不再顺带 gcOldCaches——manifest 失败的
    // 会话(版本回退 base 形态)一度借 init 把成功会话的暖存整批误清。现仅
    // 页面在【清单到手】后显式发 {type:'gc'} 才允许清理(见 AssetCache)。
    // scrub 卫生清扫同理收编到 gc 通道(它只该跑在可信版本确立后)。
    e.waitUntil(scrubPoisonedEntries());
  } else if (d.type === 'gc') {
    if (typeof d.version === 'string' && d.version) {
      if (d.version !== currentVersion) { currentVersion = d.version; cacheReady = null; }
      // gc = 页面显式清理(清理按钮/检测)——顺带强制重扫本版本毒条目
      // (scrub 每版本一次的逃生门:同版本若再现毒条目,这里兜底)
      e.waitUntil((async () => {
        try { await gcOldCaches(); await _scrubInner(true); }
        catch (err) { self.__swLastGcErr = String(err && err.message || err); }
      })());
    }
  } else if (d.type === 'warm') {
    if (!currentVersion) return; // 无版本(未 init 且消息未带)拒绝,防写错缓存
    // ★必须 waitUntil:否则 message 事件结束后 Chrome 随时终止 SW
    e.waitUntil(warm(d.tag || '', d.urls || [], d.base || 0).catch(() => {}));
  } else if (d.type === 'warm-cancel') {
    warmAbort = true;
  } else if (d.type === 'zip-warm') {
    // warm 窗口旗同步(页面 AssetCache emit 翻转检测;持久进 __sw_meta__,
    // SW 被杀重启后 isZipWarmActive 首调从缓存恢复)
    e.waitUntil(setZipWarmFlag(!!d.on));
  } else if (d.type === 'ping') {
    postMessageToPages({ type: 'pong', version: currentVersion, lastGcErr: self.__swLastGcErr ?? null });
  } else if (d.type === 'status') {
    if (!currentVersion) return;
    reportStatus();
  }
});

#!/usr/bin/env node
/**
 * 生成 TWA 专用 Service Worker:dist/sw-twa.js(由 public/sw.js 打补丁产出)。
 *
 * 背景(2026-08-30 TWA 转正):Android TWA 由 Chrome 本体渲染,但断网时壳页
 * (index.html 文档)拿不到——桌面 sw.js 的文档策略是"网络优先+离线回退",
 * 离线时只要缓存里有就能兜,可冷启动(装完首次不联网/清缓存)根本没有那份缓存。
 * TWA 版差异:
 *   ① install 期把文档/清单/图标 precache 进独立 'sw-twa-boot' 缓存
 *      (命名避开 sw-assets-v 前缀 → 页面 gcOldCaches 不误删;版本缓存建立后
 *       文档由 SWR 正常回填,boot 缓存只兜"version 未确立"的冷启动);
 *   ② 文档请求改 stale-while-revalidate:立即回缓存保离线可开,同时后台拉新
 *      (拉到即写版本缓存,下次启动生效——TWA 更新节奏从"即时"放宽为"次启");
 *   ③ 资产层(/assets/*.js cache-first 等)与 sw.js 完全同构,不再改。
 *
 * 实现:对 public/sw.js 做 marker 精确替换。sw.js 若重写导致 marker 失配,
 * 本脚本 fail-loud 中断构建(禁止静默产出失真的 TWA worker)。
 *
 * 用法:node scripts/gen-sw-twa.mjs [outDir=dist]  (build/build:release 链尾自动调用)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const gameRoot = resolve(new URL('..', import.meta.url).pathname);
const src = readFileSync(join(gameRoot, 'public/sw.js'), 'utf8');

// ---------- 补丁① install 期 boot precache ----------
const INSTALL_SRC = "self.addEventListener('install', () => self.skipWaiting());";
const INSTALL_TWA = `// TWA boot precache(2026-08-30):文档/清单/图标首装即落'独立 boot 缓存'
// (命名避开 sw-assets-v 前缀 → 页面 gcOldCaches 永不误删;版本缓存确立后文档
//  由 SWR 正常回填,boot 只兜 version 未确立的冷启动)。资产仍由 AssetCache
//  驱动的版本缓存负责,这里不抢。
const BOOT_CACHE = 'sw-twa-boot';
const BOOT_PRECACHE = [
  './', './index.html', './manifest.json',
  './favicon.png',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const boot = await caches.open(BOOT_CACHE);
    await Promise.all(BOOT_PRECACHE.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'no-cache' }));
        if (res && (res.ok || res.type === 'opaque')) await boot.put(u, res);
      } catch { /* 首装离线/部分失败不阻断 install——SWR 会补 */ }
    }));
  })());
});`;

// ---------- 补丁② 文档 stale-while-revalidate ----------
const DOC_SRC = `  if (isDoc) {
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
  }`;
const DOC_TWA = `  if (isDoc) {
    // TWA stale-while-revalidate(2026-08-30):回缓存保离线冷启动,后台拉新版本
    // 写版本缓存,下次启动生效(TWA 更新节奏=次启;在线时每次启动都追平)。
    e.respondWith((async () => {
      const cache = await getCache();
      const boot = await caches.open(BOOT_CACHE);
      const cached = (await cache.match(req)) || (await boot.match(req));
      const net = fetch(req).then(async (res) => {
        if (res && res.ok) { try { await cache.put(req, res.clone()); } catch { /* 版本缓存名未定等瞬态 */ } }
        return res;
      }).catch(() => null);
      if (cached) {
        e.waitUntil(net.catch(() => {}));
        return cached;
      }
      const res = await net;   // 无缓存(首次)必须等网络结果
      if (res) return res;
      return new Response('', { status: 504, statusText: 'offline' });
    })());
    return;
  }`;

let out = src;
const PATCHES = [
  ['install-precache', INSTALL_SRC, INSTALL_TWA],
  ['doc-swr', DOC_SRC, DOC_TWA],
];
for (const [name, find, repl] of PATCHES) {
  if (!src.includes(find)) {
    console.error(`[gen-sw-twa] marker "${name}" 在 public/sw.js 中未找到——sw.js 近期被改动,请同步更新本生成器`);
    process.exit(1);
  }
  out = out.replace(find, repl);
}

// ---------- 断言:文档引用的主 chunk 真实存在(vite hash 形态守门) ----------
const outDir = process.argv[2] ? resolve(gameRoot, process.argv[2]) : join(gameRoot, 'dist');
const indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
const jsRefs = [...indexHtml.matchAll(/src="(\/assets\/index-[^"]+\.js)"/g)].map((m) => m[1]);
if (!jsRefs.length) {
  console.error('[gen-sw-twa] index.html 无 /assets/index-*.js 引用——产物形态异常,拒绝生成');
  process.exit(1);
}
for (const rel of jsRefs) {
  if (!existsSync(join(outDir, rel))) {
    console.error(`[gen-sw-twa] 引用缺失: ${rel}`);
    process.exit(1);
  }
}

writeFileSync(join(outDir, 'sw-twa.js'), out);

// ---------- build-id.txt(2026-09-07 运行时更新检查探针) ----------
// 内容=首屏主 chunk 文件名(index-*.js,vite 内容哈希=部署版本指纹)。页面侧
// UpdateCheck 定期 no-store fetch 比对,发现新版本提示一键更新(自动存档+reload)。
// 缓存头由 _headers 精确 no-cache(可变文件,绝不落入 immutable 通配)。
const buildId = jsRefs[0].replace(/^\/assets\//, '');
// 数字版本号与 bundle 指纹同行(bump-version.mjs 同步 package.json/version.ts——以 package 为准)
const appVersion = JSON.parse(readFileSync(join(gameRoot, 'package.json'), 'utf8')).version ?? '';
const idPath = join(outDir, 'build-id.txt');
writeFileSync(idPath, `${appVersion} ${buildId}\n`);
if (readFileSync(idPath, 'utf8').trim() !== `${appVersion} ${buildId}`) {
  console.error('[gen-sw-twa] build-id.txt 写入校验失败');
  process.exit(1);
}
console.log(`[gen-sw-twa] ${outDir}/sw-twa.js 生成完毕(boot precache + 文档 SWR;主 chunk ${jsRefs.length} 个校验通过;build-id=${buildId})`);

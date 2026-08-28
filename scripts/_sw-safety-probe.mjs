// SW 安全矩阵验证（sw.js scrub 每版本一次 + mimeOk Map 化改动回归）：
//   ①首载:init 跑 scrub → __sw_meta__ 标记写入;揭幕门不受扰(进到主菜单)
//   ②注入毒条目(200+text/html 伪 png)→ reload → **标记跳过:毒条目仍在**(语义正确)
//   ③页面发 gc → 强制重扫 → 毒条目被清(逃生门)
//   ④status.cached 计数排除标记条目(legacy 校准口径逐位不变)
// 用法:先起 python http.server 于 dist,PROBE_GAME_URL 指向之
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const PORT = 8123;
const GAME = process.env.PROBE_GAME_URL || `http://localhost:${PORT}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 静态服务器(python3 -m http.server 于 dist;SW 需独立端口=独立 scope)
const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('../dist', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const mk = async () => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 160)));
  await page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page;
};
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const swRef = async (page) => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const sw = reg?.active || reg?.installing || reg?.waiting;
  return sw ? { version: (window.__swAssetCache?.state?.()?.version) ?? null } : null;
});
// 从页面侧拿版本化缓存句柄
const getCache = (page) => page.evaluate(async () => {
  const v = window.__swAssetCache?.state?.()?.version;
  if (!v) return null;
  return v;   // 返回版本串,后续 open(sw-assets-v+v)
});
const cacheEval = (page, fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const v = window.__swAssetCache?.state?.()?.version;
  const c = await caches.open('sw-assets-v' + v);
  return await fn(c, arg);
}, { fn: fn.toString(), arg });

try {
  // ---------- 会话1:首载 ----------
  const p1 = await mk();
  const okMenu = await page_waitMenu(p1, 45000);
  if (!okMenu) {
    console.log('  [debug] title-html=', await p1.evaluate(() => document.title + ' | ' + (document.body.innerText || '').slice(0, 120)).catch(() => 'eval-fail'));
  }
  check('① 首载进到主菜单(揭幕门不受扰)', okMenu);
  const v = await getCache(p1);
  check('① 版本锚定到手', !!v, v ?? '');
  const marker = await p1.evaluate(async (ver) => {
    const c = await caches.open('sw-assets-v' + ver);
    const m = await c.match('__sw_meta__');
    return m ? await m.json() : null;
  }, v);
  check('① __sw_meta__ 标记已写(scrub 本版本已跑)', !!marker && marker.scrubbedVersion === v, JSON.stringify(marker));

  // ---------- 注入毒条目 ----------
  const poisonUrl = new URL('/sprites/vanilla/p0.png', GAME).href;
  await p1.evaluate(async (u) => {
    const ver = window.__swAssetCache.state().version;
    const c = await caches.open('sw-assets-v' + ver);
    await c.put(u, new Response('<html>FAKE-POISON</html>', { headers: { 'content-type': 'text/html' } }));
  }, poisonUrl);
  const poisonIn = await p1.evaluate(async (u) => {
    const ver = window.__swAssetCache.state().version;
    const c = await caches.open('sw-assets-v' + ver);
    const r = await c.match(u);
    return r ? r.headers.get('content-type') : null;
  }, poisonUrl);
  check('② 毒条目已注入(200+text/html 伪 png)', poisonIn === 'text/html', poisonIn);

  // ---------- 会话2:reload → 标记跳过 → 毒仍在 ----------
  await p1.reload({ waitUntil: 'domcontentloaded' });
  await page_waitMenu(p1, 45000);
  await p1.waitForFunction(() => !!window.__swAssetCache?.state?.()?.version, { timeout: 30000 }).catch(() => {});
  const poisonAfter = await p1.evaluate(async (u) => {
    const ver = window.__swAssetCache.state().version;
    const c = await caches.open('sw-assets-v' + ver);
    const r = await c.match(u);
    return r ? r.headers.get('content-type') : null;
  }, poisonUrl);
  check('③ 同版本二次 init:标记跳过,毒条目仍在(不再全量重扫)', poisonAfter === 'text/html', poisonAfter);

  // ---------- gc 逃生门 ----------
  // ★必须先让更新后的 SW 接管:reload 触发 update-check,新字节→install→skipWaiting
  const pong = await p1.evaluate(async () => {
    const reg0 = await navigator.serviceWorker.getRegistration();
    const old = reg0?.active || reg0?.waiting || reg0?.installing;
    if (!old) return { err: 'no-sw' };
    const pingOnce = async (sw) => new Promise((res) => {
      const onMsg = (e) => { if (e.data?.type === 'pong') { navigator.serviceWorker.removeEventListener('message', onMsg); res(e.data); } };
      navigator.serviceWorker.addEventListener('message', onMsg);
      try { sw.postMessage({ type: 'ping' }); } catch (e) { res({ err: String(e) }); }
      setTimeout(() => { navigator.serviceWorker.removeEventListener('message', onMsg); res({ err: 'ping-timeout' }); }, 700);
    });
    // 能力探测:当前 active 已具备 lastGcErr 字段=最新版,无需等更新
    const first = await pingOnce(reg0.active);
    if (typeof first.lastGcErr !== 'undefined') return { fresh: true, lastGcErr: first.lastGcErr };
    try { await reg0.update(); } catch {}
    // 轮询等新字节 SW 接管(skipWaiting+claim)——引用必须每次重读
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active;
      if (sw && sw !== old) {
        const r = await pingOnce(sw);
        if (typeof r.lastGcErr !== 'undefined') return { fresh: true, lastGcErr: r.lastGcErr };
      }
    }
    return { err: 'sw-never-updated' };
  });
  console.log('  [sw rev]', JSON.stringify(pong));
  await p1.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage({ type: 'gc', version: window.__swAssetCache.state().version });
  });
  await new Promise((r) => setTimeout(r, 2000));
  const poisonGc = await p1.evaluate(async (u) => {
    const ver = window.__swAssetCache.state().version;
    const c = await caches.open('sw-assets-v' + ver);
    const r = await c.match(u);
    return r ? r.headers.get('content-type') : null;
  }, poisonUrl);
  check('④ gc 逃生门:强制重扫后毒条目被清', poisonGc === null, String(poisonGc) + ' swErr=' + JSON.stringify(pong));

  // ---------- 计数口径 ----------
  const counts = await p1.evaluate(async () => {
    const ver = window.__swAssetCache.state().version;
    const c = await caches.open('sw-assets-v' + ver);
    const all = await c.keys();
    const meta = all.filter((r) => r.url.endsWith('/__sw_meta__')).length;
    // 页面侧 status 口径
    const sw = window.__swAssetCache;
    const st = sw?.state?.();
    return { total: all.length, meta, stCached: st?.done ?? null, stTotal: st?.total ?? null };
  });
  check('⑤ status.cached 排除标记条目(legacy 口径不变)', counts.meta === 1, JSON.stringify(counts));

  async function page_waitMenu(page, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const ok = await page.evaluate(() => {
        const el = document.querySelector('.sw-title, [class*="title-menu"], [class*="mainmenu"]');
        return !!el || !!document.querySelector('canvas') && !!window.__swFlow;
      }).catch(() => false);
      if (ok) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
} catch (e) {
  console.log('PROBE ERR:', String(e).slice(0, 300)); fail++;
}
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
srv.kill();
process.exit(fail ? 1 : 0);

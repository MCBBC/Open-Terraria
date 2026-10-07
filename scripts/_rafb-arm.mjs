// ★RAF-BIMODAL 对照探针(2026-10-08):rAF 回调流「超速双峰形态」归因实验——页面侧 vs Chrome 机器层。
// 本刀只采样定谳,不修任何东西。
//
// 用法(一律经 tools/run-diag.mjs,headful 真 Chrome,禁 --disable-gpu-vsync 等 flag):
//   SW_ORIGIN=https://sandbox.vinlic.com RAFB_ARMS=idle,heavy \
//     node tools/run-diag.mjs --timeout=900000 scripts/_rafb-arm.mjs
//
// 环境:
//   SW_ORIGIN          游戏页 origin(线上/4173 preview/5208 dev)
//   RAFB_ARMS          逗号分隔:idle | heavy | idle-c10e0 | busy(idle+5.5ms 忙等第二 rAF 链)
//   RAFB_MODE          game(缺省) | bare(裸页,配 RAFB_BARE_URL)
//   RAFB_BARE_URL      裸页 URL(缺省 http://localhost:5209/)
//   RAFB_DURATION_MS   每臂采样时长(缺省 70000,≥60s)
//   RAFB_TAG           结果文件 tag(缺省 origin host)
//   RAFB_OUT_DIR       结果目录(缺省 /tmp/rafb-results)
//
// 判定量:间隔序列(performance.now 差)+ rAF timestamp 差双口径;p5/25/50/75/95、
// <6.5ms 短间隔占比(超速峰带)、每秒回调数、1ms 直方 top 峰。raw 存 /tmp/rafb-results。
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXEC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';
const MODE = process.env.RAFB_MODE ?? 'game';
const ARMS = (process.env.RAFB_ARMS ?? 'idle,heavy').split(',').map((s) => s.trim()).filter(Boolean);
const DUR = Number(process.env.RAFB_DURATION_MS ?? 70_000);
const IDLE_PLAY = process.env.RAFB_IDLE_PLAY ?? 'small';
const HEAVY_PLAY = process.env.RAFB_HEAVY_PLAY ?? 'large';
const BARE_URL = process.env.RAFB_BARE_URL ?? 'http://localhost:5209/';
const TAG = process.env.RAFB_TAG ?? new URL(ORIGIN).host.replace(/[^a-z0-9.-]/gi, '_') + '-' + MODE;
const OUT_DIR = process.env.RAFB_OUT_DIR ?? '/tmp/rafb-results';
mkdirSync(OUT_DIR, { recursive: true });

// rAF 记录器:evaluateOnNewDocument 注入,先于页面任何脚本;performance.now 差与 rAF ts 差双口径。
const RECORDER = `(() => {
  const rec = { t: [], ts: [], n: 0, hidden: [], t0: 0, t1: 0, vis: '', focus: false };
  window.__rafRec = rec;
  let last = null, lastTs = null;
  const tick = (t) => {
    const now = performance.now();
    if (last !== null) { rec.t.push(now - last); rec.ts.push(t - lastTs); }
    rec.n++;
    last = now; lastTs = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', () => {
    rec.hidden.push([Math.round(performance.now()), document.visibilityState === 'hidden' ? 1 : 0]);
  });
})();`;

function statsFrom(arr) {
  if (!arr.length) return { n: 0 };
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => +a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))].toFixed(2);
  let short = 0;
  const bins = {};
  for (const v of arr) {
    if (v < 6.5) short++;
    const b = Math.min(26, Math.floor(v));
    bins[b] = (bins[b] ?? 0) + 1;
  }
  const total = a.reduce((s, v) => s + v, 0);
  const top = Object.entries(bins).map(([b, c]) => [+b, c]).sort((x, y) => y[1] - x[1]).slice(0, 6);
  return {
    n: arr.length,
    spanS: +(total / 1000).toFixed(1),
    ratePerSec: +(arr.length / (total / 1000)).toFixed(1),
    p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95),
    fracShortLt6_5: +(short / arr.length).toFixed(4),
    topBins: top,
  };
}
// 带分形态量化:超速峰带(<6.5)/主 vsync 带(8-10)/慢带(10-17)/卡顿(≥17)
function statsFrom2(arr) {
  const s = statsFrom(arr);
  if (!arr.length) return s;
  const band = (lo, hi) => arr.filter((v) => v >= lo && v < hi).length;
  s.frac4_7 = +(band(4, 7) / arr.length).toFixed(4);
  s.frac8_10 = +(band(8, 10) / arr.length).toFixed(4);
  s.frac10_17 = +(band(10, 17) / arr.length).toFixed(4);
  s.fracGt17 = +(arr.filter((v) => v >= 17).length / arr.length).toFixed(4);
  return s;
}

async function pageMeta(page) {
  return await page.evaluate(async () => {
    const fam = [...document.querySelectorAll('canvas')].map((c) => {
      let kind = '?';
      try { kind = (c.getContext('webgl2') || c.getContext('webgl')) ? 'gl' : '2d'; } catch { kind = 'err'; }
      return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, kind, cls: String(c.className || '') };
    });
    let ver = null, verSrc = 'none';
    try {
      const m = await import('/src/version.ts');
      ver = 'v' + (m.default ?? m.APP_VERSION) + ' ' + m.BUILD_STAMP;
      verSrc = 'module';
    } catch {
      try {
        const s = document.querySelector('script[type=module]');
        const src = s ? new URL(s.getAttribute('src'), location.href).href : null;
        if (src) {
          const txt = await (await fetch(src)).text();
          const m = txt.match(/SandboxWorld v(\d+\.\d+\.\d+[^\s"'`){]{0,16})/);
          if (m) { ver = 'v' + m[1]; verSrc = 'bundle'; }
        }
      } catch { /* keep none */ }
    }
    return {
      url: location.href,
      ua: navigator.userAgent,
      dpr: devicePixelRatio,
      screen: screen.width + 'x' + screen.height,
      canvases: fam,
      ver, verSrc,
      vis: document.visibilityState,
      focus: document.hasFocus(),
      gameHook: !!window.__swGame,
      hwConcurrency: navigator.hardwareConcurrency ?? null,
    };
  });
}

async function gotoWorld(page, url, label, { heavy = false } = {}) {
  const uiEntry = process.env.RAFB_ENTRY !== 'play';
  const g0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log(`[${label}] goto done in ${((Date.now() - g0) / 1000).toFixed(1)}s`);
  const t0 = Date.now();
  if (uiEntry) {
    // 真实入口:无参首页走完整 boot(非旁路路径 await 全量资源就绪+标题菜单揭示),
    // 再页内 Game.newWorld(name,w,h)——等价用户点「新建世界」,杜绝旁路抢跑资源回退。
    try {
      await page.waitForFunction(() => !!document.querySelector('.sw-title-version'), { timeout: 300_000, polling: 500 });
    } catch {
      console.log(`ARM_FAIL ${label} title-menu timeout url=${url}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 2000));
    const [w, h] = heavy ? [8400, 2400] : [4200, 1200];
    const entry = await page.evaluate(([ww, hh]) => {
      // 候选链:__swFlow.newWorld(mainFlow 门面=play 旁路同款,资源已就绪)→ __swGame.newWorld → 真实按钮兜底
      if (window.__swFlow && typeof window.__swFlow.newWorld === 'function') { void window.__swFlow.newWorld('', ww, hh); return 'flow'; }
      if (window.__swGame && typeof window.__swGame.newWorld === 'function') { void window.__swGame.newWorld('', ww, hh); return 'game'; }
      const btn = [...document.querySelectorAll('button,[role=button]')].find((b) => /创建新世界|新建世界/.test(b.textContent ?? ''));
      if (btn) { btn.click(); return 'button'; }
      return null;
    }, [w, h]);
    if (!entry) {
      const diag = await page.evaluate(() => ({
        swGame: typeof window.__swGame,
        keys: Object.keys(window).filter((k) => k.startsWith('__sw')),
        buttons: [...document.querySelectorAll('button,[role=button]')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 20),
      }));
      console.log(`ARM_FAIL ${label} no entry candidate at title; diag=${JSON.stringify(diag)}`);
      return false;
    }
    console.log(`[${label}] title ready, world entry via ${entry} (newWorld('',${w},${h}))...`);
  }
  try {
    await page.waitForFunction(() => !!(window.__swGame?.player && window.__swGame?.world), { timeout: 300_000, polling: 500 });
  } catch (e) {
    console.log(`ARM_FAIL ${label} world-entry timeout after ${((Date.now() - t0) / 1000).toFixed(0)}s url=${url}`);
    return false;
  }
  console.log(`[${label}] world entered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await new Promise((r) => setTimeout(r, 2500)); // 出生点烘焙风暴沉淀
  return true;
}

// 重载驱动:每 600ms 把玩家传送到世界宽度另一比例的地面(块流+重烘+跨群系=大负载),回血防死。
const TELEPORT = async (page, i) => {
  await page.evaluate((i) => {
    const g = window.__swGame; if (!g) return;
    const st = g.world.store;
    const W = st.w, H = st.h;
    const fracs = [0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.94];
    const fx = fracs[i % fracs.length];
    const tx = Math.max(10, Math.min(W - 10, Math.floor(W * fx)));
    let sy = 8;
    while (sy < H - 2 && !st.isSolid(tx, sy)) sy++;
    const ty = Math.max(2, Math.min(H - 3, sy - 4));
    g.player.x = tx * 16 + 8 - g.player.w / 2;
    g.player.y = ty * 16;
    g.player.vx = 0; g.player.vy = 0;
    if (typeof g.player.maxHp === 'number') g.player.hp = g.player.maxHp;
  }, i);
};

async function installBusy(page) {
  await page.evaluate(() => {
    if (window.__busyOn) return;
    const t0 = performance.now(); let x = 0, i = 0;
    while (performance.now() - t0 < 20) { x += i++; }
    const perMs = i / 20;
    window.__busyIter = Math.floor(perMs * 5.5); // 每帧忙等 ~5.5ms
    const spin = () => {
      const it = window.__busyIter; let s = 0;
      for (let k = 0; k < it; k++) s += k * 7;
      window.__busySink = s;
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
    window.__busyOn = true;
    window.__busyPerMs = +perMs.toFixed(1);
  });
}

async function sample(page, ms, { heavy = false, busy = false } = {}) {
  if (busy) await installBusy(page);
  await page.evaluate(() => {
    const r = window.__rafRec;
    r.t.length = 0; r.ts.length = 0; r.hidden.length = 0; r.n = 0;
    r.t0 = performance.now();
  });
  const deadline = Date.now() + ms;
  let i = 0, tpErr = 0;
  while (Date.now() < deadline) {
    if (heavy) { try { await TELEPORT(page, i++); } catch { tpErr++; } }
    await new Promise((r) => setTimeout(r, heavy ? 600 : 500));
  }
  return await page.evaluate(() => {
    const r = window.__rafRec;
    r.t1 = performance.now();
    return { t: r.t.map((v) => +v.toFixed(3)), ts: r.ts.map((v) => +v.toFixed(3)), n: r.n, t0: r.t0, t1: r.t1, hidden: r.hidden, vis: document.visibilityState, focus: document.hasFocus(), busyIter: window.__busyIter ?? null };
  }).then((rec) => (rec.tpErr = tpErr, rec));
}

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: false,
  defaultViewport: null,
  protocolTimeout: 600_000,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,900', '--window-position=60,60'],
});
console.log('CHROME_UA:', await browser.userAgent());

let exitCode = 0;
try {
  if (MODE === 'bare') {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(RECORDER);
    await page.goto(BARE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.bringToFront();
    await new Promise((r) => setTimeout(r, 2000));
    const meta = await pageMeta(page);
    console.log('ARM bare META:', JSON.stringify(meta));
    const rec = await sample(page, DUR);
    const st = statsFrom2(rec.t);
    const stTs = statsFrom2(rec.ts);
    console.log('ARM_RESULT bare:', JSON.stringify({ meta: { ua: meta.ua, ver: meta.ver }, stats: st, statsTs: stTs, hiddenEvents: rec.hidden.length, visEnd: rec.vis, focusEnd: rec.focus }));
    writeFileSync(join(OUT_DIR, `${TAG}-bare.json`), JSON.stringify({ arm: 'bare', meta, rec }, null, 1));
    await page.close();
  } else {
    // 两段式入口:先开无参首页把 SW/资源链预热到标题菜单(旧部署 ?play 旁路会抢跑资源
    // 初始化→世界进回退拓扑,2026-10-08 用户实报),再带参进世界。
    if (process.env.RAFB_WARMUP !== '0') {
      const wp = await browser.newPage();
      try {
        await wp.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        await wp.waitForFunction(() => !!document.querySelector('.sw-title-version'), { timeout: 300_000, polling: 500 });
        await new Promise((r) => setTimeout(r, 6000));
        console.log(`WARMUP ${ORIGIN} done (title menu reached)`);
      } catch (e) {
        console.log(`WARMUP ${ORIGIN} FAILED:`, String(e).slice(0, 200));
      }
      await wp.close();
    }
    for (const arm of ARMS) {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument(RECORDER);
        page.on('pageerror', (e) => console.log(`[${arm}] PAGEERR:`, String(e).slice(0, 160)));
        const heavy = arm === 'heavy';
        const busy = arm === 'busy';
        // ui 入口(缺省):无参首页→资源全量就绪→标题菜单→页内 newWorld;play 入口为旁路对照
        const url = process.env.RAFB_ENTRY === 'play'
          ? `${ORIGIN}/?play=${heavy ? HEAVY_PLAY : IDLE_PLAY}${arm === 'idle-c10e0' ? '&c10e=0' : ''}`
          : `${ORIGIN}/${arm === 'idle-c10e0' ? '?c10e=0' : ''}`;
        const ok = await gotoWorld(page, url, arm, { heavy });
        if (!ok) { exitCode = 1; await page.close(); continue; }
        await page.bringToFront();
        const meta = await pageMeta(page);
        console.log(`ARM ${arm} META:`, JSON.stringify({ ver: meta.ver, verSrc: meta.verSrc, canvases: meta.canvases, dpr: meta.dpr, screen: meta.screen, vis: meta.vis, focus: meta.focus, gameHook: meta.gameHook }));
        const rec = await sample(page, DUR, { heavy, busy });
        const st = statsFrom2(rec.t);
        const stTs = statsFrom2(rec.ts);
        const verdict = st.n > 1000 && st.ratePerSec > 130 && st.fracShortLt6_5 > 0.12
          ? 'OVERSPEED-BIMODAL'
          : st.ratePerSec > 130 ? 'OVERSPEED-OTHER' : 'NARROW-VSYNC';
        console.log(`ARM_RESULT ${arm}:`, JSON.stringify({ url, stats: st, statsTs: stTs, verdict, hiddenEvents: rec.hidden.length, visEnd: rec.vis, focusEnd: rec.focus, busyIter: rec.busyIter, tpErr: rec.tpErr }));
        writeFileSync(join(OUT_DIR, `${TAG}-${arm}.json`), JSON.stringify({ arm, meta, stats: st, rec: { t: rec.t, ts: rec.ts, hidden: rec.hidden } }, null, 1));
      } catch (e) {
        console.log(`ARM_FAIL ${arm}:`, String(e).slice(0, 240));
        exitCode = 1;
      }
      await page.close();
    }
  }
} catch (e) {
  console.log('FATAL:', e?.stack ?? String(e));
  exitCode = 2;
} finally {
  await browser.close();
}
process.exit(exitCode);

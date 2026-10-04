#!/usr/bin/env node
// ★minimap 双面节流活机探针（2026-10-04）：mmHudBlit 签名缓存 + drawHead 静态头照缓存。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs --timeout=280000 scripts/_mm-throttle-probe.mjs
//
// 验证面:
//  A. 静止窗(3s): hudHits≈帧数 / hudRuns≈0(地图层缓存生效);逐帧截图对拍
//     (NPC 头游走 → minimap 区像素帧间变 = 头像层未被节流,移动每帧反映);
//  B. 位级等价: HUD 画布现内容 vs 强制重铺(sig 清零后重调 mmHudBlit)逐字节相等;
//  C. 门控击穿: 改 zoom(viewTiles 变)/传送玩家(sx/sy+迷雾序号变) → hudRuns 立升;
//  D. 恒定成本: 命中路均值 vs 强制重铺均值(=修前每帧恒定成本)。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport, godMode } from '../tools/probe/lib/game.mjs';

const OUT = '/tmp/mm-throttle-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5211';
const log = (...a) => console.log('[mm-throttle]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  const R = { checks: {} };
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await page.evaluate(() => { window.__swGame.renderer.mapStyle = 1; });
    await sleep(2500);   // 进世界首屏/迷雾首建/液体沉降收敛

    // ---- 仪器:包裹 mmHudBlit(计数+耗时+末参) ----
    const wrap = await page.evaluate(() => {
      const g = window.__swGame;
      const r = g.renderer;
      if (!r.__mmWrap) {
        const proto = Object.getPrototypeOf(r);
        const orig = proto.mmHudBlit;
        r.__mmWrap = { calls: 0, ms: 0, lastArgs: null };
        proto.mmHudBlit = function (...a) {
          const t0 = performance.now();
          const out = orig.apply(this, a);
          if (this === r) {
            r.__mmWrap.calls++;
            r.__mmWrap.ms += performance.now() - t0;
            r.__mmWrap.lastArgs = a;
          }
          return out;
        };
      }
      const snap = () => ({
        ...JSON.parse(JSON.stringify(r.mmThrottle)),
        wrapCalls: r.__mmWrap.calls, wrapMs: +r.__mmWrap.ms.toFixed(1),
      });
      return snap();
    });
    log('instrumented');

    // ---- A. 静止窗(3s,玩家不动/不改 zoom) ----
    const still0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    const rect = await page.evaluate(() => {
      const r = window.__swGame.renderer;
      const cvs = r.canvas ?? [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0];
      const scale = cvs.clientWidth > 0 ? cvs.clientWidth / cvs.width : 1;
      const m = r.minimapRect;
      const c = { cw: cvs.width, ccw: cvs.clientWidth };
      return (m && m.w > 0 && Number.isFinite(scale) && scale > 0)
        ? { x: m.x * scale, y: m.y * scale, w: m.w * scale, h: m.h * scale, c } : { c, m: { ...m } };
    });
    log('RECT', JSON.stringify(rect));
    R.minimapRect = rect;
    const clip = (rect && rect.w > 0) ? { x: rect.x, y: rect.y, width: rect.w, height: rect.h } : null;
    const shotA = clip ? await page.screenshot({ clip }) : null;
    // 头像层活性:主动平移一个城镇 NPC 3 tile(不依赖 AI 恰好在走)→ 头像必须逐帧跟随
    const npcMoved = await page.evaluate(() => {
      const g = window.__swGame;
      const n = g.entities.npcs.find((x) => !x.dead && !x.bound);
      if (!n) return false;
      n.x += 48;
      return true;
    });
    await sleep(400);
    const shotB = clip ? await page.screenshot({ clip }) : null;
    await sleep(1500);
    const still1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    const dStill = {
      hudRuns: still1.hudRuns - still0.hudRuns,
      hudHits: still1.hudHits - still0.hudHits,
      silBakes: still1.silBakes - still0.silBakes,
      silHits: still1.silHits - still0.silHits,
      stripBakes: still1.stripBakes - still0.stripBakes,
      stripHits: still1.stripHits - still0.stripHits,
    };
    R.stillDelta = dStill;
    if (shotA && shotB) {
      writeFileSync(join(OUT, 'still-A.png'), shotA);
      writeFileSync(join(OUT, 'still-B.png'), shotB);
      // NPC 被平移后头像必须动(每帧反映);未动=头像层被错误冻结
      R.checks.headLayerLive = npcMoved ? !shotA.equals(shotB) : true;
      R.npcMoved = npcMoved;
      R.shotBytes = [shotA.length, shotB.length];
    }
    R.checks.stillHudCached = dStill.hudHits > 60 && dStill.hudRuns <= 3;   // ~180 帧 3s
    R.checks.stillSilCached = dStill.silHits > 60 && dStill.silBakes <= 4;  // 玩家头 2 剪影/帧

    // ---- B. 位级等价:现内容 vs 强制重铺 ----
    R.checks.bitExact = await page.evaluate(() => {
      const r = window.__swGame.renderer;
      const hud = r._mmHudCanvas;
      if (!hud || !r.__mmWrap.lastArgs) return { ok: false, why: 'no-canvas-or-args' };
      const c = hud.getContext('2d');
      const before = c.getImageData(0, 0, hud.width, hud.height).data.slice();
      r._mmHudSig = '';                                   // 击穿签名 → 强制重铺
      const a = r.__mmWrap.lastArgs;
      r.mmHudBlit(a[0], a[1], a[2], a[3]);
      const after = c.getImageData(0, 0, hud.width, hud.height).data;
      let diff = 0;
      for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
      return { ok: diff === 0, diff, size: hud.width + 'x' + hud.height };
    });

    // ---- D. 恒定成本:命中路 vs 强制重铺(=修前每帧成本) ----
    R.cost = await page.evaluate(() => {
      const r = window.__swGame.renderer;
      const a = r.__mmWrap.lastArgs;
      // 命中路均值(修后稳态每帧成本)
      r.mmHudBlit(a[0], a[1], a[2], a[3]);
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) r.mmHudBlit(a[0], a[1], a[2], a[3]);
      const hitMs = (performance.now() - t0) / 100;
      // 强制重铺均值(=修前每帧恒定成本;含 52k 像素循环+putImageData)
      let missMs = 0;
      const N = 10;
      for (let i = 0; i < N; i++) {
        r._mmHudSig = '';
        const t1 = performance.now();
        r.mmHudBlit(a[0], a[1], a[2], a[3]);
        missMs += performance.now() - t1;
      }
      // 剪影烘焙均值(=修前每帧 2 次成本)/命中均值
      r._mmHudSig = String(Math.random());   // 恢复无效签名,下帧自然重铺
      const doll = document.createElement('canvas'); doll.width = 40; doll.height = 32;
      r.mapHeadSilCache = new WeakMap();     // 清缓存 → 下次必 bake
      const tb0 = performance.now();
      r.mapHeadSilhouette(doll, 40, 32, '#000000');
      const bakeMs = performance.now() - tb0;
      const th0 = performance.now();
      for (let i = 0; i < 100; i++) r.mapHeadSilhouette(doll, 40, 32, '#000000');
      const silHitMs = (performance.now() - th0) / 100;
      return {
        hudHitMsPerCall: +hitMs.toFixed(4),
        hudMissMsPerCall: +(missMs / N).toFixed(3),
        silBakeMs: +bakeMs.toFixed(3),
        silHitMsPerCall: +silHitMs.toFixed(4),
      };
    });

    // ---- C1. zoom 门(viewTiles/sizeI 变 → 击穿) ----
    const z0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    await page.evaluate(() => { window.__swGame.renderer.minimapZoom = 2.0; });
    await sleep(700);
    const z1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    R.checks.zoomGateBreaks = (z1.hudRuns - z0.hudRuns) > 0;
    await page.evaluate(() => { window.__swGame.renderer.minimapZoom = 1.05; });
    await sleep(500);

    // ---- C2. 玩家传送门(sx/sy 变+迷雾序号变 → 击穿)+移动对拍截图 ----
    const pos = await page.evaluate(() => {
      const g = window.__swGame;
      return { x: g.player.x, y: g.player.y, npcs: g.entities.npcs.filter((n) => !n.dead).length };
    });
    R.npcCount = pos.npcs;
    const m0 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    await teleport(page, pos.x + 90 * 16, pos.y, { snapCamera: true });
    await sleep(1200);   // 移窗+新探索开雾
    const m1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    R.moveDelta = { hudRuns: m1.hudRuns - m0.hudRuns, hudHits: m1.hudHits - m0.hudHits, silBakes: m1.silBakes - m0.silBakes };
    R.checks.moveGateBreaks = R.moveDelta.hudRuns > 0;
    if (clip) {
      const shotC = await page.screenshot({ clip });
      writeFileSync(join(OUT, 'moved-C.png'), shotC);
      R.checks.movedVisualDiffers = !shotB.equals(shotC);
    }

    // ---- 计数终值 ----
    R.mmThrottleFinal = await page.evaluate(() => JSON.parse(JSON.stringify(window.__swGame.renderer.mmThrottle)));
    R.fps = await page.evaluate(() => window.__swGame?._paintedFrames ?? 0);
    log('RESULT', JSON.stringify(R, null, 1));
    writeFileSync(join(OUT, 'result.json'), JSON.stringify(R, null, 1));
  } finally {
    await closeAllBrowsers();
  }
  const fail = Object.entries(R.checks).filter(([, v]) => v === false);
  if (fail.length) { console.error('[mm-throttle] FAIL:', fail.map(([k]) => k).join(',')); process.exit(1); }
  log('ALL CHECKS PASS');
}

await main().catch((e) => { console.error('[mm-throttle] fatal:', e); process.exit(1); });

#!/usr/bin/env node
// IIII248 等价性对拍仪(改前/改后同 seed 同点位确定性截图哈希对拍)。
//
// 原理(确定性配方):
//   - pinRandom(页级 PRNG 钉死) + freezeClock(世界钟钉死) + paused(实时 tick 冻结)
//   - 清实体桶(enemies/drops/projectiles/critters/npcs/props)→ 渲染输入=纯 tile 面
//   - 泵定数 tick(pumpInline)收敛光照 → 再钉相位(flicker 六字段/tileAnim.tick/
//     windSpeed/waterWaves.quality=0)→ 相机 snap → 恰 2 个 rAF 渲染帧 →
//     主画布 toDataURL → sha256。
//   - 同构建跑两遍(pass1/pass2):哈希全等 = 仪器自洽(确定性成立)——此后
//     before/after 跨构建哈希差 = 渲染输出变更(红线信号),哈希全等 = 逐位等价。
//
// 用法(game/ 下):
//   SW_ORIGIN=http://localhost:5298 node tools/run-diag.mjs --timeout=420000 \
//     scripts/_iii248-equiv.mjs --tag=before --out=/tmp/iii248-out
// 产物: <out>/equiv-<tag>.json + <out>/shots/<tag>-*.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { pumpInline } from '../tools/probe/lib/pump.mjs';
import { camSnapTo } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { discoverBiomeStops } from '../tools/probe/lib/perf-scenarios.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? argvJ(process.argv, j, name) : dflt;
}
function argvJ(argv, j, name) { return argv[j].slice(name.length + 1); }

const TAG = argVal('--tag', 'run');
const OUT = argVal('--out', '/tmp/iii248-out');
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5298';
const SEED = '05162020';
const SHOT_DIR = join(OUT, 'shots');
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 站位键(disc:discoverBiomeStops 解析;band 由表定)
const STATION_KEYS = ['forest', 'underground', 'desert', 'ocean', 'hell', 'dungeon'];

/** 单 pass:全流程一遍,返回 { station: sha256 }。 */
async function onePass(browser, log, passIdx = 1) {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);

    // 站位锚定(只读扫描)
    const scan = await discoverBiomeStops(page, { stride: 4, minCount: 12 });
    if (scan.why) throw new Error('scan: ' + scan.why);
    const stops = {};
    for (const k of STATION_KEYS) {
      const s = scan.stops.find((x) => x.key === k && x.found);
      if (s) stops[k] = { tx: s.tx, ty: s.ty };
    }
    log(`stations: ${JSON.stringify(stops)}`);

    // ---- 冻结配方(一次装定,逐站复用) ----
    // ① 世界钟钉死(白天 9:00) + 游戏暂停(实时 tick 冻结)
    await freezeClock(page, { tod: 0.375 });
    await page.evaluate(() => { const g = window.__swGame; g.paused = true; });
    // ② 波场/风场/天气钉死 + 相位时钟归零(flicker 六字段 + tileAnim.tick)
    await page.evaluate(async () => {
      const g = window.__swGame;
      const { tileAnim } = await import('/src/render/TileAnim.ts');
      const { waterWaves } = await import('/src/render/WaterWaves.ts');
      window.__swEquivPin = { tileAnim, waterWaves };
      waterWaves.quality = 0;
      const we = g.world.weather;
      we.raining = false; we.rainTime = 0; we.maxRaining = 0; we.cloudAlpha = 0;
      if (we.sandstorm) { we.sandstorm.happening = false; we.sandstorm.severity = 0; }
      we.windSpeedCurrent = 0; we.windSpeedTarget = 0;
      const clk = g.lighting?.clock;
      if (clk) {
        clk.mouseTextColor = 190; clk.cursorAlpha = 1; clk.demonTorch = 0;
        clk.discoR = 255; clk.discoG = 0; clk.discoB = 0; clk.essScale = 1;
        clk.timeForVisualEffects = 0;
      }
    });
    // ③ 光照收敛泵(定数 tick;波场已零,实体/玩家位随泵确定性演化)
    const CONV = 256;

    const hashes = {};
    for (const k of STATION_KEYS) {
      const st = stops[k];
      if (!st) { hashes[k] = 'missing'; continue; }
      // 传送(世界数据零写)
      await page.evaluate(({ tx, ty }) => {
        const g = window.__swGame;
        const p = g.player;
        p.x = tx * 16; p.y = ty * 16; p.vx = 0; p.vy = 0;
        p.xOld = p.x; p.yOld = p.y;
        if (p.spX) { p.spX[0] = p.x; p.spY[0] = p.y; }
      }, { tx: st.tx, ty: st.ty });
      await camSnapTo(page, st.tx * 16, st.ty * 16);
      // ③ 光照收敛泵(定数 tick,逐 tick 后清实体桶——实体不进光照扫描面,
      //    免去 spawn 随机史差传入光照数组)
      await page.evaluate((k2) => {
        const g = window.__swGame;
        const E = g.entities;
        for (let i = 0; i < k2; i++) {
          g.fixedUpdate(1 / 60);
          E.enemies.length = 0; E.drops.length = 0; E.projectiles.length = 0;
          E.critters.length = 0; E.npcs.length = 0; E.props.length = 0;
          g.particles.length = 0;
        }
      }, CONV);
      // ④ 泵后终清 + PRNG 重钉(渲染期随机消费面从已知状态出发) + 相位归零
      await page.evaluate(() => {
        const g = window.__swGame;
        const E = g.entities;
        E.enemies.length = 0; E.drops.length = 0; E.projectiles.length = 0;
        E.critters.length = 0; E.npcs.length = 0; E.props.length = 0;
        g.particles.length = 0;
        const P = window.__swEquivPin;
        P.tileAnim.tick = 0;
        let a = 913 >>> 0;   // 与 installPinnedRandom 同构 mulberry32
        globalThis.Math.random = () => {
          a |= 0; a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        // 云场归零重播种(云位/云量随随机史漂——清空后由重钉 PRNG 确定性重生)
        const sky = g.renderer?.sky;
        if (sky && sky.vclouds) { sky.vclouds.length = 0; }
        const we2 = g.world.weather;
        if (we2) { we2.numClouds = 200; we2.numCloudsTemp = 200; we2.cloudBGActive = 0; }
      });
      // ⑤ 恰 2 个渲染帧(暂停态每 rAF 必渲染;skip 仅 !paused)→ toDataURL
      const dataUrl = await page.evaluate(() => new Promise((res) => {
        const g = window.__swGame;
        const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
        let n = 0;
        function tick2() {
          if (++n < 3) { requestAnimationFrame(tick2); return; }
          // 双帧后:重置渲染相位再一次渲染窗内取帧(tileAnim 已冻结,暂停不推进)
          res(cv.toDataURL('image/png'));
        }
        requestAnimationFrame(tick2);
      }));
      const sha = createHash('sha256').update(dataUrl).digest('hex');
      hashes[k] = sha;
      // 世界域哈希:剔除右上 HUD 角(minimap/星/心 HUD 呼吸相位随机史遗留,与
      // 世界渲染无关——等价断言走 worldSha)
      const worldSha = await page.evaluate(() => {
        const g = window.__swGame;
        const cv = g?.renderer?.canvas;
        if (!cv) return null;
        const c2 = document.createElement('canvas');
        const W = cv.width, H = cv.height;
        // 世界域 = 全幅去右上 320x140(minimap+资源条 HUD 角)
        c2.width = W; c2.height = H;
        const cx2 = c2.getContext('2d');
        cx2.drawImage(cv, 0, 0);
        cx2.clearRect(W - 320, 0, 320, 140);
        return c2.toDataURL('image/png');
      });
      hashes[k + '@world'] = worldSha ? createHash('sha256').update(worldSha).digest('hex') : 'no-canvas';
      // PNG 落盘(前 1 站留档对照;全留太重)
      try {
        const b64 = dataUrl.split(',')[1];
        const { writeFileSync: wf } = await import('node:fs');
        wf(join(SHOT_DIR, `${TAG}-p${passIdx}-${k}.png`), Buffer.from(b64, 'base64'));
      } catch { /* 留档失败不阻断 */ }
      log(`shot ${k}: ${sha.slice(0, 12)}`);
    }
    return { hashes, stops };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const log = (...a) => console.log('[equiv]', ...a);
  const browser = await launchBrowser({ headed: false, extraArgs: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
  try {
    const passes = [];
    for (let i = 1; i <= 2; i++) {
      log(`== pass ${i} ==`);
      passes.push(await onePass(browser, log, i));
    }
    const [p1, p2] = passes;
    const det = {};
    let detOk = true;
    for (const k of STATION_KEYS) {
      const eq = p1.hashes[k] === p2.hashes[k];
      det[k] = eq;
      if (!eq) detOk = false;
      log(`determinism ${k}: ${eq ? 'STABLE' : 'UNSTABLE'} (${String(p1.hashes[k]).slice(0, 10)} vs ${String(p2.hashes[k]).slice(0, 10)})`);
    }
    const out = {
      tag: TAG, seed: SEED, origin: ORIGIN, ts: new Date().toISOString(),
      determinism: det, determinismOk: detOk,
      pass1: p1.hashes, pass2: p2.hashes, stops: p1.stops,
    };
    const outPath = join(OUT, `equiv-${TAG}.json`);
    writeFileSync(outPath, JSON.stringify(out, null, 2));
    log(`written ${outPath} determinismOk=${detOk}`);
    console.log(`EQUIV_RESULT ${JSON.stringify(out)}`);
  } finally {
    await closeAllBrowsers().catch(() => {});
  }
}

try {
  await main();
} catch (e) {
  console.error('[equiv] FAIL', e?.stack ?? e);
  process.exit(1);
}

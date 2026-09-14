// IIII249 flag-off 等价性对拍仪 v2(改前/改后同 seed 同点位 shine 烘焙产物逐位对拍)。
//
// 仪器定谳史:v1 全帧 sha 对拍(_iii248-equiv 配方+合成场景)在本机今日树上
// pass1≠pass2(渲染期随机面:火把粒子/天空等)——5/6 站不稳。v2 把对拍下沉到
// 【本通道自身产物层】:shineDebugChunkDigests 逐 chunk 摘要(档位 q/完成态/层
// 有无/像素校验和 sum+sumX),对粒子/天空/HUD 噪声免疫,灵敏度=字节级。
//   · 同构建 pass1==pass2 → 仪器自洽;
//   · before(惰性取证导出+旧调度)/after(时间盒调度)flag-off 摘要全等
//     = 缺省路径烘焙产物逐位等价(红线证据)。
// 场景:合成高光密 pocket(七族乘法支 + Gemspark 262 加法支),每站 nextFrame×90
// 预热(每帧 2 chunk 计数预算烘满视界),摘要取相机 ±2 chunk 环(≥渲染界)。
//
// 用法(game/ 下):
//   SW_ORIGIN=http://localhost:5299 node tools/run-diag.mjs --timeout=560000 \
//     scripts/_iii249-equiv.mjs --tag=before --out=/tmp/iii249-out
// 产物: <out>/equiv-<tag>.json + <out>/shots/<tag>-*.png
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { nextFrame } from '../tools/probe/lib/pump.mjs';
import { camSnapTo } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}

const TAG = argVal('--tag', 'run');
const OUT = argVal('--out', '/tmp/iii249-out');
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5299';
const SEED = '05162020';
const SHOT_DIR = join(OUT, 'shots');
mkdirSync(SHOT_DIR, { recursive: true });

// 站位 = pocket 内相机锚(世界格):跨 chunk 边界对齐面
const CAM_OFFS = [
  { key: 'wall-c', dx: 0, dy: 0 },
  { key: 'wall-e', dx: 11, dy: 3 },
  { key: 'room-w', dx: -9, dy: 1 },
];

async function onePass(browser, log, passIdx) {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 600 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    // ---- 合成高光密 pocket(tile 面同配方重建;torch 仅入照面供截图判读) ----
    const spot = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const T = (k) => window.__swTiles[k];
      const stone = T('stone'), ore = T('ore_iron'), oreS = T('ore_silver'),
        ebon = T('v_25_ebonstone_block'), pearl = T('v_117_pearlstone_block'),
        snow = T('snow'), ice = T('ice'), goldB = T('v_45_gold_brick'),
        gem = T('v_262_amethystgemspark'), torch = T('torch');
      const gy = Math.floor(g.world.groundLevel) + 120;
      let cx = -1, cy = -1;
      outer: for (let x = 200; x < st.w - 220; x += 3) {
        for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
          if (st.inBounds(x + 26, y + 14) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
        }
      }
      if (cx < 0) return { err: 'no pocket' };
      for (let y = cy - 10; y <= cy + 3; y++) for (let x = cx - 13; x <= cx + 12; x++) st.setTileSilent(x, y, 0, 0, 0);
      for (let x = cx - 13; x <= cx + 12; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); st.setTileSilent(x, cy - 11, stone, 0, 0); }
      const rows = [
        { t: ore, k: 'ore' }, { t: ebon, k: 'ebon' }, { t: oreS, k: 'oreS' },
        { t: pearl, k: 'pearl' }, { t: snow, k: 'snow' }, { t: ice, k: 'ice' },
        { t: goldB, k: 'goldB' }, { t: gem, k: 'gem' }, { t: ore, k: 'ore2' },
      ];
      const placed = [];
      for (let r = 0; r < rows.length; r++) {
        const { t, k } = rows[r];
        if (t === undefined) continue;
        placed.push(k);
        for (let x = cx - 12; x <= cx + 11; x++) st.setTileSilent(x, cy - 9 + r, t, 0, 0);
      }
      if (torch !== undefined) { st.setTileSilent(cx - 11, cy + 3, torch, 0, 0); st.setTileSilent(cx + 10, cy + 3, torch, 0, 0); }
      return { cx, cy, placed: placed.join(','), missing: rows.filter((r) => r.t === undefined).map((r) => r.k).join(',') };
    });
    if (spot.err) { console.error(spot.err); await page.close(); process.exit(1); }
    log('pocket: ' + JSON.stringify(spot));

    await freezeClock(page, { tod: 0.375 });
    await page.evaluate(() => { window.__swGame.paused = true; });

    const hashes = {};
    for (const off of CAM_OFFS) {
      const tx = spot.cx + off.dx, ty = spot.cy + off.dy;
      await page.evaluate(({ tx, ty }) => {
        const g = window.__swGame;
        const p = g.player;
        p.x = tx * 16; p.y = ty * 16; p.vx = 0; p.vy = 0;
        p.xOld = p.x; p.yOld = p.y;
        if (p.spX) { p.spX[0] = p.x; p.spY[0] = p.y; }
      }, { tx, ty });
      await camSnapTo(page, tx * 16, ty * 16);
      // 光照收敛(定数 tick;实体桶清)
      await page.evaluate((k2) => {
        const g = window.__swGame;
        const E = g.entities;
        for (let i = 0; i < k2; i++) {
          g.fixedUpdate(1 / 60);
          E.enemies.length = 0; E.drops.length = 0; E.projectiles.length = 0;
          E.critters.length = 0; E.npcs.length = 0; E.props.length = 0;
          g.particles.length = 0;
        }
      }, 192);
      // shine 预热:90 rAF ×(2 chunk/帧)≥ 视界 chunk 全暖
      for (let i = 0; i < 90; i++) await nextFrame(page);
      // 摘要:相机 chunk ±2 环(≥渲染界 ±1);node 侧 sha256
      const digests = await page.evaluate(() => {
        const g = window.__swGame;
        return (async () => {
          const TS = await import('/src/render/TileShine.ts');
          const cam = g.camera, z = cam.zoom ?? 1;
          const bx = Math.floor(cam.x / 256), by = Math.floor(cam.y / 256);
          return TS.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
        })();
      });
      hashes[off.key] = createHash('sha256').update(JSON.stringify(digests)).digest('hex');
      hashes[off.key + '@n'] = digests.length;
      hashes[off.key + '@mul'] = digests.filter((d) => d.hasMul).length;
      hashes[off.key + '@done'] = digests.filter((d) => d.done).length;
      // 截图留档(判读用;不进等价断言——全帧面含随机噪声)
      try {
        const shot = await page.evaluate(() => new Promise((res) => {
          const g = window.__swGame;
          const cv = g?.renderer?.canvas;
          let n = 0;
          function tick2() { if (++n < 3) { requestAnimationFrame(tick2); return; } res(cv.toDataURL('image/png')); }
          requestAnimationFrame(tick2);
        }));
        const { writeFileSync: wf } = await import('node:fs');
        wf(join(SHOT_DIR, `${TAG}-p${passIdx}-${off.key}.png`), Buffer.from(shot.split(',')[1], 'base64'));
      } catch { /* 留档失败不阻断 */ }
      // 站 A:shine 敏感度自检(ON vs __SW_SHINE_OFF 全帧,软信号)
      if (off.key === 'wall-c') {
        const grab = () => page.evaluate(() => new Promise((res) => {
          const g = window.__swGame;
          const cv = g?.renderer?.canvas;
          let n = 0;
          function tick2() { if (++n < 3) { requestAnimationFrame(tick2); return; } res(cv.toDataURL('image/png')); }
          requestAnimationFrame(tick2);
        }));
        const onUrl = await grab();
        await page.evaluate(() => { globalThis.__SW_SHINE_OFF = true; });
        const offUrl = await grab();
        await page.evaluate(() => { globalThis.__SW_SHINE_OFF = false; });
        hashes['shineSensitive'] = onUrl !== offUrl;
      }
      log(`shot ${off.key}: ${hashes[off.key].slice(0, 12)} n=${hashes[off.key + '@n']} mul=${hashes[off.key + '@mul']}`);
    }
    return { hashes, spot };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const log = (...a) => console.log('[equiv249]', ...a);
  const browser = await launchBrowser({ headed: false, extraArgs: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [] });
  try {
    const passes = [];
    for (let i = 1; i <= 2; i++) {
      log(`== pass ${i} ==`);
      passes.push(await onePass(browser, log, i));
    }
    const [p1, p2] = passes;
    const keys = Object.keys(p1.hashes).filter((k) => !k.startsWith('shine') || k === 'shineSensitive');
    const det = {};
    let detOk = true;
    for (const k of keys) {
      if (k === 'shineSensitive' || k.endsWith('@n') || k.endsWith('@mul') || k.endsWith('@done')) continue;
      const eq = p1.hashes[k] === p2.hashes[k];
      det[k] = eq;
      if (!eq) detOk = false;
    }
    const result = {
      tag: TAG, seed: SEED, origin: ORIGIN, ts: new Date().toISOString(),
      determinism: det, determinismOk: detOk,
      shineSensitive: p1.hashes.shineSensitive,
      shinePlaced: p1.spot.placed, shineMissing: p1.spot.missing,
      counts: { wallC: p1.hashes['wall-c@n'], wallCmul: p1.hashes['wall-c@mul'], wallCdone: p1.hashes['wall-c@done'] },
      pass1: p1.hashes, pass2: p2.hashes,
      pocket: p1.spot,
    };
    writeFileSync(join(OUT, `equiv-${TAG}.json`), JSON.stringify(result, null, 1));
    log(`determinism ${detOk ? 'OK' : 'UNSTABLE'} shineSensitive=${p1.hashes.shineSensitive}`);
    log(`written ${join(OUT, `equiv-${TAG}.json`)}`);
    console.log('EQUIV_RESULT ' + JSON.stringify(result));
    if (!detOk) process.exitCode = 3;
  } finally {
    await browser.close().catch(() => {});
  }
}
await main();

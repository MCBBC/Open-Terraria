// ★BJ579 2026-10-09「狱火药水喝了后没有火圈」实机探针（私有端口,SW_ORIGIN 注入）。
// 场景：
//   S0 基线：无 buff,玩家地表静置,环带橙色像素计数 B0
//   S1 喝药（buff 116 Inferno 直挂 240s）:环带橙色像素计数 B1（呼吸相位多帧取 max）
//      + flameRingRot 连续推进断言（fixedUpdate 每 tick +0.05）
//   S2 移除 buff:回落 B2≈B0（非该 buff 不回归,原位差分归零）
// 火圈像素判别 = 玩家中心环带（世界半径 ≤220px×z）内橙红火焰色
// （R>150 ∧ G∈[50,200] ∧ B<95 ∧ R>G>B;FlameRing 主色 (239,127,2) 实测）;
// 差分面（B1−B0/B2−B0）抵消静态背景（沙/土/火把色）。
// 用法(game/): SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj579-hellfire-ring.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';

const OUT = 'docs/evidence/bj579';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj579]', ...a);
const A = [];
const ok = (n, pass, x) => { A.push({ name: n, pass: !!pass, ...(x ?? {}) }); log(pass ? 'PASS' : 'FAIL', n, x ? JSON.stringify(x) : ''); };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);

    // 玩家送空旷地表静置（出生点上方清除落速）
    await page.evaluate(() => {
      const g = window.__swGame;
      g.player.vx = 0; g.player.vy = 0;
      g.paused = false;
    });
    await wait(1200);

    // ---- 采样器：环带橙色像素计数（★采样器纪律：#game-root 下多块画布同尺寸,
    //      尺寸 sort 取最大会 tie 抖到 worldLayer——遍历全部画布取橙计数最大者,
    //      主呈现面=最终画面;记录 png 物证）----
    const sample = (tag) => page.evaluate((tag) => {
      const g = window.__swGame;
      const r = g.renderer;
      const z = r.glZoom ?? 1;
      let best = { ring: 0, bright: 0, med: -1, cv: null };
      for (const cv of document.querySelectorAll('#game-root canvas')) {
        const sc = document.createElement('canvas');
        sc.width = cv.width; sc.height = cv.height;
        const c2 = sc.getContext('2d', { willReadFrequently: true });
        c2.drawImage(cv, 0, 0);
        const W = cv.width, H = cv.height;
        const px = (g.player.cx - r.glCamX) * z + W / 2;
        const py = (g.player.cy - r.glCamY) * z + H / 2;
        const RMAX = 230 * z;
        const x0 = Math.max(0, Math.floor(px - RMAX)), y0 = Math.max(0, Math.floor(py - RMAX));
        const x1 = Math.min(W, Math.ceil(px + RMAX)), y1 = Math.min(H, Math.ceil(py + RMAX));
        if (x1 <= x0 || y1 <= y0) continue;
        const img = c2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let ring = 0, bright = 0;   // ring=环带火焰色像素;bright=其中高亮(num5 峰值档)
        const dists = [];
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
            const R = img[i], G = img[i + 1], B = img[i + 2];
            if (!(R > 150 && G > 50 && G < 200 && B < 95 && R > G && G > B)) continue;
            const d = Math.hypot(x - px, y - py);
            if (d > 12 * z && d <= RMAX) { ring++; dists.push(d); if (R > 200) bright++; }
          }
        }
        if (ring > best.ring) {
          const med = dists.length ? dists.sort((a, b) => a - b)[Math.floor(dists.length / 2)] : -1;
          best = { ring, bright, med: Math.round(med), cv };
        }
      }
      return { tag, ring: best.ring, bright: best.bright, med: best.med,
        rot: g.player.flameRingRot, scale: g.player.flameRingScale,
        has: g.player.buffs.has(50) };
    }, tag);
    const shot = (tag) => page.evaluate((tag) => {
      const g = window.__swGame;
      const r = g.renderer;
      const z = r.glZoom ?? 1;
      // 取环带橙计数最大的画布截屏（同采样器纪律）
      let best = { ring: -1, url: '' };
      for (const cv of document.querySelectorAll('#game-root canvas')) {
        const sc = document.createElement('canvas');
        sc.width = cv.width; sc.height = cv.height;
        const c2 = sc.getContext('2d', { willReadFrequently: true });
        c2.drawImage(cv, 0, 0);
        const W = cv.width, H = cv.height;
        const px = (g.player.cx - r.glCamX) * z + W / 2;
        const py = (g.player.cy - r.glCamY) * z + H / 2;
        const RMAX = 230 * z;
        let ring = 0;
        try {
          const img = c2.getImageData(Math.max(0, px - RMAX), Math.max(0, py - RMAX),
            Math.min(2 * RMAX, W), Math.min(2 * RMAX, H)).data;
          for (let i = 0; i < img.length; i += 4) {
            const R = img[i], G = img[i + 1], B = img[i + 2];
            if (R > 150 && G > 50 && G < 200 && B < 95 && R > G && G > B) ring++;
          }
        } catch { /* 跨域等异常跳过 */ }
        if (ring > best.ring) best = { ring, url: sc.toDataURL('image/png') };
      }
      void tag;
      return best.url;
    }, tag);

    // ---- S0 基线（多帧取 max,抗呼吸相位偶然;此时无 buff=flameRing 态闲置）----
    let B0 = 0;
    for (let i = 0; i < 6; i++) {
      const s = await sample('S0');
      B0 = Math.max(B0, s.ring);
      if (i === 5) writeFileSync(`${OUT}/s0-baseline.png`, Buffer.from((await shot('S0')).split(',')[1], 'base64'));
      await wait(220);
    }
    // S0=本底记录（出生点沙/土/屋面静态橙像素本底可到数千,判别面在差分——
    // S1 用 B1>B0×3+300、S2 用 |B2−B0| 回落,绝对值不设阈）
    ok('S0 基线采样器工作（B0 有限）', Number.isFinite(B0) && B0 >= 0, { B0 });

    // ---- S1 喝药（buff 116 直挂;原版喝药链=itemUse→buffs.add,视觉推进=fixedUpdate）----
    const addBuff = await page.evaluate(() => {
      const g = window.__swGame;
      g.player.buffs.apply(50, 240);   // BuffType.Inferno=50 ↔ vanillaBuff 116
      return {
        has: g.player.buffs.has(50),
        light: (() => { void 0; return null; })(),
        scale0: g.player.flameRingScale, rot0: g.player.flameRingRot,
      };
    });
    ok('S1 buff 116 挂上', addBuff.has, addBuff);
    await wait(700);   // 推进+呼吸相位进可见带

    let B1 = 0, s1max = null;
    for (let i = 0; i < 10; i++) {
      const s = await sample('S1');
      if (s.ring > B1) { B1 = s.ring; s1max = s; }
      if (i === 5) writeFileSync(`${OUT}/s1-ring.png`, Buffer.from((await shot('S1')).split(',')[1], 'base64'));
      await wait(180);
    }
    ok('S1 火圈出现（环带橙色像素 B1≫B0）', B1 > B0 * 3 + 300, { B1, B0, med: s1max?.med, bright: s1max?.bright });
    ok('S1 环带几何（中位半径 ∈ [30,230]×z 屏 px）', (s1max?.med ?? -1) > 30 && (s1max?.med ?? -1) <= 240, { med: s1max?.med });

    // ---- 推进断言：flameRingRot 随时间线性 +0.05/tick（fixedUpdate 60Hz→每秒 +3）----
    const r1 = await page.evaluate(() => window.__swGame.player.flameRingRot);
    await wait(1000);
    const r2 = await page.evaluate(() => window.__swGame.player.flameRingRot);
    const dRot = r2 - r1;
    ok('S1 相位推进 ≈+3 rad/s（0.05×60t;fixedUpdate 单源）', dRot > 2.4 && dRot < 3.6, { dRot: +dRot.toFixed(3) });

    // ---- S2 移除 buff:回归基线 ----
    await page.evaluate(() => { window.__swGame.player.buffs.remove(50); });
    await wait(400);
    let B2 = 0;
    for (let i = 0; i < 6; i++) {
      const s = await sample('S2');
      B2 = Math.max(B2, s.ring);
      if (i === 5) writeFileSync(`${OUT}/s2-removed.png`, Buffer.from((await shot('S2')).split(',')[1], 'base64'));
      await wait(220);
    }
    ok('S2 移除后回落 B2≈B0（非该 buff 不回归）', B2 < B0 + 250, { B2, B0 });

    log('SUMMARY', JSON.stringify({ B0, B1, B2, medRing: s1max?.med }));
  } catch (err) {
    log('ERROR', String(err));
    A.push({ name: 'probe-error', pass: false, err: String(err) });
  } finally {
    await closeAllBrowsers();
  }
  const fails = A.filter((a) => !a.pass);
  console.log(JSON.stringify({ total: A.length, fails: fails.length, results: A }, null, 1));
  process.exit(fails.length ? 1 : 0);
}
main();

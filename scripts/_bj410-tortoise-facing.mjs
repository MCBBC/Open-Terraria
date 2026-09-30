// BJ410 冰雪陆龟 154 朝向定谳探针(2026-09-30,活玩家对峙双向 + 渲染极性隔离)。
// 原版链(NPC.cs:29335 aiStyle 39 态 0 `spriteDirection = direction`(:29421)、direction=velocity.X
//   符号(:29413-29419);Main.cs:23356-23360 `spriteDirection==1 → FlipHorizontally`;NPC_154.png 原生
//   头朝左——眼(255,239,163)在帧 x≈8-9/72 即左半):合成=头朝玩家。
// 本仓:facing ≡ spriteDirection(Renderer.ts 通用镜像门 `facing>0 → ctx.scale(-1,1)`;
//   aiStyle 39 走 rotate(visAngle) 且 39 不在 rotationDriven)。tortoiseAI 态 0
//   `facing = dx>0?1:-1`(Enemy.ts:7106,朝玩家)。
// 判据:眼象限——玩家在右 ⟺ 眼在龟盒中心右半(头朝玩家);玩家在左 ⟺ 眼在左半。
//   反号 = 用户实报"屁股朝玩家"复现。渲染极性隔离:钉 AI 后手设 facing=±1 各截一帧,
//   眼象限随 facing 翻转 ⟹ 渲染门随 facing 真翻转(极性正常);不随 ⟹ 渲染极性反。
// 数判眼签名:帧内眼像素 (255,239,163)@x≈8-9(原生左半),阈 r≥245,g≥220,130≤b≤205。
// 场景:正午 freezeClock + godMode(活玩家对峙判例——死玩家尘假象,玩家死→AI 窗冻结)。
// 运行:SW_ORIGIN=http://localhost:5390 node tools/run-diag.mjs --timeout=300000 scripts/_bj410-tortoise-facing.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'bj410-tortoise-facing');
mkdirSync(OUT, { recursive: true });
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });   // 正午
await godMode(page, true);               // 活玩家对峙:防龟撞死玩家→AI 窗冻结假象
await pump(page, 30);

// 页内眼象限扫描:龟盒(世界)→屏幕投影→getImageData→眼像素均值 x 对盒中心
await page.evaluate(() => {
  window.__eyeScan = (ent) => {
    const g = window.__swGame;
    const cam = g.camera, c = g.renderer.canvas;
    const kx = c.width / cam.viewW, ky = c.height / cam.viewH;
    const sx = (wx) => (wx - cam.x) * cam.zoom * kx + c.width / 2;
    const sy = (wy) => (wy - cam.y) * cam.zoom * ky + c.height / 2;
    const pad = 8;
    let x0 = Math.max(0, Math.floor(sx(ent.x) - pad));
    let y0 = Math.max(0, Math.floor(sy(ent.y) - pad));
    let x1 = Math.min(c.width, Math.ceil(sx(ent.x + ent.w) + pad));
    let y1 = Math.min(c.height, Math.ceil(sy(ent.y + ent.h) + pad));
    if (x1 <= x0 || y1 <= y0) return { ok: false, why: 'empty-box' };
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const d = img.data;
    let sum = 0, n = 0;
    const cxScreen = (sx(ent.x + ent.w / 2));
    for (let py = 0; py < y1 - y0; py++) {
      for (let px = 0; px < x1 - x0; px++) {
        const i = (py * (x1 - x0) + px) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a > 200 && r >= 245 && gg >= 220 && b >= 130 && b <= 205) { sum += px; n++; }
      }
    }
    if (n === 0) return { ok: false, why: 'no-eye-px', box: [x0, y0, x1, y1] };
    const eyeX = x0 + sum / n;
    return { ok: true, n, eyeX, cxScreen, side: eyeX > cxScreen ? 'R' : 'L', dx: +(eyeX - cxScreen).toFixed(1) };
  };
  // 龟状态快照
  window.__tortSnap = () => {
    const g = window.__swGame;
    const t = (g.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead);
    if (!t) return { ok: false, why: 'no-tortoise' };
    const p = g.player;
    return {
      ok: true, id: t.id, facing: t.facing, ai0: t.ai0, ai1: +t.ai1?.toFixed?.(1),
      vx: +t.vx.toFixed(2), dx: p.cx - t.cx, onGround: !!t.onGround,
      visAngle: +(t.visAngle ?? 0).toFixed(3), x: t.x, y: t.y, w: t.w, h: t.h,
    };
  };
});

const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });

// ---- 生成 154:玩家原地,龟在右侧 300px(同地面高度) ----
const sp = await spawnEnemy(page, 154, ppos.x + 300, ppos.y);
L.chk('spawn 154', sp.ok, JSON.stringify(sp));
await pump(page, 12);   // 落地稳定

// ---- A 态:玩家在龟右侧 300(自然 AI,活玩家;逐 tick facing-away 采样) ----
let snap = await page.evaluate(() => window.__tortSnap());
if (!snap.ok) { console.error('[bj410] FATAL', snap); process.exit(1); }
await teleport(page, snap.x + snap.w / 2 + 300, snap.y + snap.h / 2 - 4, { snapCamera: true, zeroVel: true });
await page.evaluate(() => {
  window.__faceHist = [];
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead);
  if (t && !t.__bj410Hooked) {
    t.__bj410Hooked = true;
    const of = t.fixedUpdate.bind(t);
    t.fixedUpdate = (dt, hooks) => {
      of(dt, hooks);
      const p = g.player;
      window.__faceHist.push({
        ai0: t.ai0, facing: t.facing, onG: !!t.onGround,
        away: p.cx > t.cx && t.facing === -1, dx: +(p.cx - t.cx).toFixed(1),
      });
    };
  }
});
await pump(page, 30);
const A = await page.evaluate(() => {
  const h = window.__faceHist ?? [];
  return {
    snap: window.__tortSnap(),
    eye: window.__eyeScan((window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead)),
    awayTicks: h.filter((r) => r.away).length,
    total: h.length,
    hist: h,
  };
});
await saveCanvasShot(page, join(OUT, 'bj410-A-player-right.png'));
// A 连拍:走行循环全 8 帧(154 无 FindFrame case=原版默认全帧循环,6/7 团缩帧)
// ——取头外帧存档,免单帧恰逢团缩的目验歧义
for (let i = 0; i < 8; i++) {
  await pump(page, 5);
  await saveCanvasShot(page, join(OUT, `bj410-A-burst-${i}.png`));
}

// ---- B 态:玩家在龟左侧 300 ----
const snapB = await page.evaluate(() => window.__tortSnap());
await teleport(page, snapB.x + snapB.w / 2 - 300, snapB.y + snapB.h / 2 - 4, { snapCamera: true, zeroVel: true });
await pump(page, 30);
const B = await page.evaluate(() => ({ snap: window.__tortSnap(), eye: window.__eyeScan((window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead)) }));
await saveCanvasShot(page, join(OUT, 'bj410-B-player-left.png'));

// ---- C 态:渲染极性隔离(钉 AI,手设 facing=1 / facing=-1) ----
const C = await page.evaluate(async () => {
  const g = window.__swGame;
  const t = (g.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead);
  if (!t) return { ok: false, why: 'no-tortoise' };
  t.fixedUpdate = () => {};          // 钉 AI/物理
  t.vx = 0; t.vy = 0; t.visAngle = 0;
  t.facing = 1;
  return { ok: true };
});
await pump(page, 4);
const C1 = await page.evaluate(() => ({ eye: window.__eyeScan((window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead)) }));
await saveCanvasShot(page, join(OUT, 'bj410-C-facing1.png'));
await page.evaluate(() => {
  const t = (window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead);
  t.facing = -1;
});
await pump(page, 4);
const C2 = await page.evaluate(() => ({ eye: window.__eyeScan((window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 154 && !e.dead)) }));
await saveCanvasShot(page, join(OUT, 'bj410-C-facing-1.png'));

console.log(JSON.stringify({ A, B, C, C1, C2, OUT }, null, 1));
browser.close();

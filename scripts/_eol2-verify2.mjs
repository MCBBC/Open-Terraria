// ★EoL2 验收探针 v2（暗腔搜索+固壳封光+相机 settle;只读）
//   修前基线=live0 arm1（boss 71.3@light201 ratio0.355=纯乘签名;p932 max6）
//   运行:SW_ORIGIN=http://localhost:5218 ARM=1 node tools/run-diag.mjs --timeout=280000 scripts/_eol2-verify2.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const ARM = process.env.ARM || '1';
const SHOT_DIR = '/tmp/eol2-verify';
const TAG = 'v2arm' + ARM;

let page;
if (ARM === '2') {
  page = await openPage(await launchBrowser({ headless: true }), {});
  await page.goto(ORIGIN + '/?play=small&c10e=0', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  let inGame = false;
  for (let i = 0; i < 200 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!inGame) { console.error('arm2 未进游戏'); process.exit(1); }
  for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); return true; }
      }
      return false;
    });
    if (clicked) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  await new Promise((r) => setTimeout(r, 900));
} else {
  page = await openPage(await launchBrowser({ headless: true }), {});
  const boot = await bootstrap(page, ORIGIN, { log: () => {} });
  if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
  const made = await createGame(page, { mode: 'direct', seed: 'eolbright', size: 'small', pinRandom: 20261005, log: () => {} });
  if (!made?.ok) { console.error('createGame fail', made?.why); process.exit(1); }
}
console.log('in-game ok, ARM=' + ARM);

await page.evaluate(() => {
  globalThis.__statRects = (dataUrl, rects) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const out = [];
      for (const r of rects) {
        const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
        const w = Math.max(1, Math.min(Math.round(r.w), img.width - x)), h = Math.max(1, Math.min(Math.round(r.h), img.height - y));
        if (w < 2 || h < 2) { out.push({ tag: r.tag, empty: true }); continue; }
        const d = cx.getImageData(x, y, w, h).data;
        let rs = 0, gs = 0, bs = 0, n = 0; const lums = [];
        for (let i = 0; i < d.length; i += 4) {
          rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; n++;
          lums.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        }
        lums.sort((a, b) => a - b);
        out.push({
          tag: r.tag, x, y, w, h, n,
          mean: [+(rs / n).toFixed(1), +(gs / n).toFixed(1), +(bs / n).toFixed(1)],
          lum: +(lums.reduce((a, b) => a + b, 0) / n).toFixed(1),
          p90: +lums[Math.floor(n * 0.9)].toFixed(1), max: +lums[n - 1].toFixed(1),
        });
      }
      res(out);
    };
    img.src = dataUrl;
  });
});

const shotStat = async (tag, rects) => {
  const buf = await page.screenshot({ type: 'png' });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(`${SHOT_DIR}/${TAG}-${tag}.png`, buf);
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  return { tag, stats: await page.evaluate((du, rs) => globalThis.__statRects(du, rs), dataUrl, rects), file: `${SHOT_DIR}/${TAG}-${tag}.png` };
};
const lightAtW = (wx, wy) => page.evaluate(([x, y]) => {
  const g = window.__swGame;
  return g.lighting ? g.lighting.lightAt(Math.floor(x / 16), Math.floor(y / 16)) : null;
}, [wx, wy]);

// —— 相机 settle 等待：boss 屏坐标连续 3 帧不动才收 ——
const waitCamSettle = () => page.evaluate(async () => {
  const g = window.__swGame;
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return false;
  let last = null, stable = 0;
  for (let i = 0; i < 90 && stable < 3; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
    const key = `${Math.round(sx)},${Math.round(sy)}`;
    stable = key === last ? stable + 1 : 0;
    last = key;
  }
  return true;
});

// —— 场景1: 暗腔搜索（光值<20 才收）+ 固壳封光 + 召 636 ——
console.log('==== 暗腔搜索 ====');
const s2 = await page.evaluate(async () => {
  const g = window.__swGame; const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gl = Math.floor(g.world.groundLevel);
  let picked = null;
  for (let depth = 300; depth <= st.h - 120 && !picked; depth += 60) {
    const py0 = gl + depth;
    if (py0 > st.h - 90) break;
    // 挖腔（内净空 39×13）+ 固壳（外圈 2 层实心地,封岩浆/天光）
    for (let dy = -8; dy <= 4; dy++) for (let dx = -19; dx <= 19; dx++) {
      st.setTile(px0 + dx, py0 + dy, 0);
      st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
    }
    for (let dy = -11; dy <= 7; dy++) for (let dx = -23; dx <= 23; dx++) {
      const edge = Math.abs(dx) >= 20 || dy <= -10 || dy >= 5;
      if (edge) { st.setTile(px0 + dx, py0 + dy, 1); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0; }
    }
    // 预亮窗：走 60 拍让光照重算
    g.paused = false;
    for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
    g.paused = true;
    const cxT = px0, cyT = py0 - 2;
    const light = g.lighting ? g.lighting.lightAt(cxT, cyT) : [0, 0, 0];
    if (Math.max(light[0], light[1], light[2]) < 20) { picked = { px0, py0, light }; break; }
  }
  if (!picked) return { fail: 'no-dark-spot' };
  const { px0: X, py0: Y } = picked;
  // 玩家置腔左端（腔内,远离 boss 位）
  g.player.x = (X - 14) * 16; g.player.y = (Y - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(636, (X + 10) * 16, (Y - 4) * 16);
  g.paused = false;
  for (let i = 0; i < 150; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return { fail: 'no-636-dark' };
  e.spawnAlpha = 0;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { bossId: e.id, px: e.cx, py: e.cy, alive: !e.dead };
});
console.log('scene-dark:', JSON.stringify(s2));
if (s2.fail) process.exit(1);
await waitCamSettle();
// boss 现况复查（截图瞬间仍活?）+ 光值
const bossNow = await page.evaluate(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return { gone: true };
  const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
  return { gone: false, sx, sy, w: e.w * g.camera.zoom, h: e.h * g.camera.zoom, px: e.cx, py: e.cy, ai0: e.ai0, spawnAlpha: e.spawnAlpha };
});
console.log('bossNow:', JSON.stringify(bossNow));
const l2 = await lightAtW(bossNow.px, bossNow.py);
console.log('dark light@boss:', JSON.stringify(l2));
// 光梯度（穿 boss 横线 9 点）
const grad = [];
for (let dxx = -8; dxx <= 8; dxx += 2) grad.push(await lightAtW(bossNow.px + dxx * 16, bossNow.py));
console.log('light grad(dx-8..8):', JSON.stringify(grad));
const r3 = await shotStat('dark', [
  { tag: 'bossDark', x: bossNow.sx, y: bossNow.sy, w: bossNow.w, h: bossNow.h },
  { tag: 'bg', x: bossNow.sx - bossNow.w - 30, y: bossNow.sy, w: bossNow.w, h: bossNow.h },
]);
console.log('dark:', JSON.stringify(r3.stats));

// —— 场景2: 暗腔弹幕 ——
console.log('==== 暗腔弹幕 ====');
const projs = await page.evaluate(async (bossId) => {
  const g = window.__swGame;
  const ids = [871, 872, 873, 874, 931, 932];
  let k = 0;
  const bx = g.player.cx + 8 * 16, by = g.player.cy;
  for (const id of ids) {
    try { await window.__swFlow.spawnHostileProj(bx + 30 + (k % 3) * 80, by - 130 + Math.floor(k / 3) * 70, 0.15, 0.05, 40, id, 0); } catch {}
    k++;
  }
  try {
    const m = await import('/src/entities/bossAI_lategame.ts');
    const a919 = new m.FairyQueenLance(bx + 270, by - 50, Math.PI / 7, 0.25, 50, false);
    g.entities.add(a919, 'projectiles');
    for (let i = 0; i < 25; i++) g.fixedUpdate(1 / 60);
    const b923 = new m.SunDanceBeam(bx + 360, by - 30, Math.PI / 7, bossId, 50, false);
    g.entities.add(b923, 'projectiles');
    for (let i = 0; i < 35; i++) g.fixedUpdate(1 / 60);
  } catch (e) { console.error('919/923 import fail', e); }
  g.paused = false;
  for (let i = 0; i < 40; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  g.paused = true;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  const list = [];
  for (const p of (g.entities.projectiles || [])) {
    const pid = p.projId ?? p.vanillaId ?? p.type;
    if (![871, 872, 873, 874, 919, 923, 931, 932].includes(pid) || p.dead) continue;
    const tagBase = 'p' + pid;
    const dup = list.filter((q) => q.tag.startsWith(tagBase)).length;
    const [sx, sy] = g.camera.worldToScreen(p.x - 30, p.y - 30);
    list.push({ tag: tagBase + (dup ? 'b' : ''), x: sx, y: sy, w: 60 * g.camera.zoom, h: 60 * g.camera.zoom, wpos: [p.x + p.w / 2, p.y + p.h / 2] });
  }
  return list;
}, s2.bossId ?? -1);
console.log('projs onScreen:', projs.length, JSON.stringify(projs.map((p) => p.tag)));
const lights = [];
for (const p of projs) lights.push(await lightAtW(p.wpos[0], p.wpos[1]));
console.log('proj lights:', JSON.stringify(lights));
const r4 = await shotStat('projs', projs);
console.log('projs:', JSON.stringify(r4.stats));

const flag = await page.evaluate(() => ({ search: location.search }));
console.log('flag:', JSON.stringify(flag));
fs.writeFileSync(`${SHOT_DIR}/${TAG}-verify.json`, JSON.stringify({ s2, bossNow, l2, grad, r3, projs, lights, r4, flag }, null, 1));
console.log('done → ' + SHOT_DIR + '/' + TAG + '-*');
await page.browser().close();

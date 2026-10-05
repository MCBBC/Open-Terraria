// ★EoL2 验收探针 v3（同帧 A/B:运行时 monkey-patch raiseSelfLuminousProjLight 开/关,
//   同一冻结场景像素对拍——patch off = 修前纯乘状态,patch on = 修后 lerp/地板状态。
//   探针侧补丁,零代码改动。修1/修2/修5 的 raise 面全在此函数内。）
// 运行:SW_ORIGIN=http://localhost:5218 ARM=1 node tools/run-diag.mjs --timeout=280000 scripts/_eol2-verify3.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const ARM = process.env.ARM || '1';
const SHOT_DIR = '/tmp/eol2-verify';
const TAG = 'v3arm' + ARM;

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

// 截图+统计（tag 前缀=before/after）
const shotStat = async (prefix, tag, rects) => {
  const buf = await page.screenshot({ type: 'png' });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(`${SHOT_DIR}/${TAG}-${prefix}-${tag}.png`, buf);
  const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
  return { tag, stats: await page.evaluate((du, rs) => globalThis.__statRects(du, rs), dataUrl, rects) };
};

const waitFrames = (n) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r));
}, n);

// raise 开关（探针侧补丁;restore 归位原函数）
const setRaise = (on) => page.evaluate((on) => {
  const r = window.__swGame.renderer;
  if (!r.__origRaise) r.__origRaise = r.raiseSelfLuminousProjLight.bind(r);
  r.raiseSelfLuminousProjLight = on ? r.__origRaise : function () { this._lumFloorTouched.length = 0; this._lumFloorSeen.clear(); };
  return typeof r.raiseSelfLuminousProjLight;
}, on);

// —— 场景：暗腔（光值<20 收口）+ boss + 弹幕,一次冻结全测 ——
const scene = await page.evaluate(async () => {
  const g = window.__swGame; const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gl = Math.floor(g.world.groundLevel);
  let picked = null;
  for (let depth = 300; depth <= st.h - 120 && !picked; depth += 60) {
    const py0 = gl + depth;
    if (py0 > st.h - 90) break;
    for (let dy = -8; dy <= 4; dy++) for (let dx = -19; dx <= 19; dx++) {
      st.setTile(px0 + dx, py0 + dy, 0); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
    }
    for (let dy = -11; dy <= 7; dy++) for (let dx = -23; dx <= 23; dx++) {
      if (Math.abs(dx) >= 20 || dy <= -10 || dy >= 5) { st.setTile(px0 + dx, py0 + dy, 1); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0; }
    }
    g.paused = false;
    for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
    g.paused = true;
    const light = g.lighting ? g.lighting.lightAt(px0 + 4, py0 - 6) : [0, 0, 0];
    if (Math.max(light[0], light[1], light[2]) < 20) { picked = { px0, py0, light }; break; }
  }
  if (!picked) return { fail: 'no-dark-spot' };
  const X = picked.px0, Y = picked.py0;
  g.player.maxHp = 200000; g.player.hp = 200000;   // 防女皇 9999 级一击杀穿污染场景
  g.player.x = (X - 14) * 16; g.player.y = (Y - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(636, (X + 10) * 16, (Y - 4) * 16);
  g.paused = false;
  for (let i = 0; i < 150; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return { fail: 'no-636-dark' };
  e.spawnAlpha = 0;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  // 弹幕（暗腔内,远离 boss 自光核）
  const ids = [871, 872, 873, 874, 931, 932];
  const bx = g.player.cx + 8 * 16, by = g.player.cy;
  let k = 0;
  for (const id of ids) {
    try { await window.__swFlow.spawnHostileProj(bx + 30 + (k % 3) * 80, by - 130 + Math.floor(k / 3) * 70, 0.15, 0.05, 40, id, 0); } catch {}
    k++;
  }
  try {
    const m = await import('/src/entities/bossAI_lategame.ts');
    const a919 = new m.FairyQueenLance(bx + 270, by - 50, Math.PI / 7, 0.25, 50, false);
    g.entities.add(a919, 'projectiles');
    for (let i = 0; i < 25; i++) g.fixedUpdate(1 / 60);
    const b923 = new m.SunDanceBeam(bx + 360, by - 30, Math.PI / 7, e.id, 50, false);
    g.entities.add(b923, 'projectiles');
    for (let i = 0; i < 35; i++) g.fixedUpdate(1 / 60);
  } catch (err) { /* 919/923 import 失败不阻塞 */ }
  for (let i = 0; i < 40; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; g.player.dead = false; }
  g.paused = true;
  // 相机 settle
  let last = null, stable = 0;
  const e2 = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  for (let i = 0; i < 90 && stable < 3; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const [sx, sy] = g.camera.worldToScreen(e2.x, e2.y);
    const key = Math.round(sx) + ',' + Math.round(sy);
    stable = key === last ? stable + 1 : 0; last = key;
  }
  // 收集 rects（boss + 各弹）
  const rects = [];
  {
    const [sx, sy] = g.camera.worldToScreen(e2.x, e2.y);
    rects.push({ tag: 'boss', x: sx, y: sy, w: e2.w * g.camera.zoom, h: e2.h * g.camera.zoom, wpos: [e2.cx, e2.cy] });
    rects.push({ tag: 'bossEdge', x: sx - e2.w * g.camera.zoom * 0.75, y: sy - e2.h * g.camera.zoom * 0.75, w: e2.w * 0.5 * g.camera.zoom, h: e2.h * 0.5 * g.camera.zoom, wpos: [e2.cx, e2.cy] });
  }
  for (const p of (g.entities.projectiles || [])) {
    const pid = p.projId ?? p.vanillaId ?? p.type;
    if (![871, 872, 873, 874, 919, 923, 931, 932].includes(pid) || p.dead) continue;
    const base = 'p' + pid;
    const dup = rects.filter((q) => q.tag.startsWith(base)).length;
    const [sx, sy] = g.camera.worldToScreen(p.x - 30, p.y - 30);
    rects.push({ tag: base + (dup ? 'b' : ''), x: sx, y: sy, w: 60 * g.camera.zoom, h: 60 * g.camera.zoom, wpos: [p.x + p.w / 2, p.y + p.h / 2] });
  }
  window.__eol2rects = rects;
  return { ok: true, bossId: e.id, lightBossTile: g.lighting.lightAt(Math.floor(e.cx / 16), Math.floor(e.cy / 16)) };
});
console.log('scene:', JSON.stringify(scene));
if (!scene.ok) process.exit(1);

const rects = await page.evaluate(() => window.__eol2rects);
const lights = await page.evaluate((rs) => rs.map((r) => window.__swGame.lighting.lightAt(Math.floor(r.wpos[0] / 16), Math.floor(r.wpos[1] / 16))), rects);
console.log('tile lights:', JSON.stringify(rects.map((r, i) => r.tag + ':' + JSON.stringify(lights[i]))));

// —— 同帧 A/B:raise off（修前）→ on（修后）→ off sanity ——
await setRaise(false);
await waitFrames(6);
const before = await shotStat('before', 'all', rects);
await setRaise(true);
await waitFrames(6);
const after = await shotStat('after', 'all', rects);
await setRaise(false);
await waitFrames(6);
const sanity = await shotStat('sanity', 'all', rects);
await setRaise(true);

const zip = (a, b, c) => rects.map((r, i) => ({
  tag: r.tag,
  light: lights[i],
  before: a.stats[i] ? a.stats[i].lum : null, beforeP90: a.stats[i] ? a.stats[i].p90 : null, beforeMax: a.stats[i] ? a.stats[i].max : null,
  after: b.stats[i] ? b.stats[i].lum : null, afterP90: b.stats[i] ? b.stats[i].p90 : null, afterMax: b.stats[i] ? b.stats[i].max : null,
  sanity: c.stats[i] ? c.stats[i].lum : null,
}));
console.log('==== A/B（raise off=修前 / on=修后 / sanity=复关） ====');
for (const row of zip(before, after, sanity)) console.log(JSON.stringify(row));
fs.writeFileSync(`${SHOT_DIR}/${TAG}-ab.json`, JSON.stringify({ rects, lights, before: before.stats, after: after.stats, sanity: sanity.stats }, null, 1));
console.log('done → ' + SHOT_DIR + '/' + TAG + '-*');
await page.browser().close();

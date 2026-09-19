// 一次性探针:永夜刃(273)挥弧剑影渲染——修前(白弧直出) vs 修后(紫染色渐隐)像素对拍
// 运行:SW_ORIGIN=http://localhost:5241 node tools/run-diag.mjs --timeout=500000 scripts/_nesword-trail.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tag = process.env.NE_TAG ?? 'probe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }

// 关欢迎弹窗(真实鼠标点击) + 拨到正午(昼光照,弧带染色才按全亮链采样)
for (let i = 0; i < 10; i++) {
  const box = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find((b) => (b.textContent ?? '').includes('我已知晓'));
    if (!ok) return null;
    const r = ok.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) break;
  await page.mouse.click(box.x, box.y);
  await new Promise((r) => setTimeout(r, 500));
}
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.5;   // 正午 → dayFactor 1
});
await new Promise((r) => setTimeout(r, 1500));

const armed = await page.evaluate(async () => {
  const g = window.__swGame;
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const internalOf = (vid) => window.__swItems[VANILLA_ITEM_KEY_BY_ID[vid]];
  const w = g.world;
  const st = w.store;
  // 玩家放地表(600 列)白天露天
  const col = 600;
  let sy = 40;
  while (sy < st.h - 60 && !(st.flags[st.idx(col, sy)] && st.isSolid(col, sy))) sy++;
  g.player.x = col * 16 + 8 - g.player.w / 2;
  g.player.y = (sy - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  // 永夜刃 273 上 0 号快捷栏
  const iid = internalOf(273);
  g.player.inv.add(iid, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === iid);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  g.input.mouseX = cv.width / 2 + 220;   // 指向右方
  g.input.mouseY = cv.height / 2;
  return { held: g.player.inv.slots[0] ? 'ok' : 'none', surfaceY: sy, time: g.clock ? g.clock.dayFactor : -1 };
});
console.log(tag, 'armed:', JSON.stringify(armed));

// 挥一刀:mouseDown 一拍 → 轮询等弧进入可见窗(t 6-16、op≥0.4)再采样
// 先绕玩家插一圈火把（夜场也保证弧心光照 ≈ 全亮——原版 fromValue 语义）
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const torch = window.__swTiles?.['torch'] ?? 8;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  for (const [dx, dy] of [[-5, -3], [5, -3], [-5, 2], [5, 2], [0, -4], [0, 3]]) {
    const tx = px + dx, ty = py + dy;
    if (st.inBounds(tx, ty) && !st.flags[st.idx(tx, ty)]) st.setTileSilent(tx, ty, torch, 0, 0);
  }
});
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = true; });
await new Promise((r) => setTimeout(r, 60));
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });

let arcState = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 50));
  arcState = await page.evaluate(() => {
    const arcs = (window.__swGame.entities.projectiles ?? []).filter((e) => e && e.projId === 972);
    const a0 = arcs[0];
    if (!a0) return null;
    // SwingArc 有 t/op(等可见窗);旧态 Arrow(972) 无 t —— 首见即返回
    if (typeof a0.t !== 'number') return { n: arcs.length, t: 'arrow-shape', op: -1 };
    return { n: arcs.length, t: a0.t, op: typeof a0.op === 'number' ? a0.op : -1 };
  }).catch(() => null);
  if (arcState && (arcState.t === 'arrow-shape' || (arcState.t >= 6 && arcState.t <= 16 && arcState.op >= 0.4))) break;
}
await new Promise((r) => setTimeout(r, arcState && arcState.t === 'arrow-shape' ? 250 : 0));
console.log(tag, 'arcState:', JSON.stringify(arcState));

// ②刃运动逐帧录制：第二刀挂 rAF 快照钩,弧 t≈4/8/12/16/20 各截画布帧+运动倾印
await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  window.__neFrames = [];
  const targets = [4, 8, 12, 16, 20];
  const loop = () => {
    const a0 = (g.entities.projectiles ?? []).find((e) => e && e.projId === 972 && typeof e.t === 'number');
    if (a0 && targets.length && a0.t >= targets[0]) {
      const tWanted = targets.shift();
      const off = document.createElement('canvas');
      off.width = cv.width; off.height = cv.height;
      off.getContext('2d').drawImage(cv, 0, 0);
      window.__neFrames.push({ want: tWanted, t: a0.t, rot: +a0.rot.toFixed(4), num: +a0.num.toFixed(4),
        scale: +a0.scaleCur.toFixed(4), dx: +(a0.cx - g.player.cx).toFixed(1), dy: +(a0.cy - g.player.cy).toFixed(1),
        op: +a0.op.toFixed(3), url: off.toDataURL('image/png') });
    }
    if (targets.length) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = true; });
await new Promise((r) => setTimeout(r, 60));
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const n = await page.evaluate(() => window.__neFrames.length).catch(() => 0);
  if (n >= 5) break;
}
const frames = await page.evaluate(() => window.__neFrames.map((f) => ({
  want: f.want, t: f.t, rot: f.rot, num: f.num, scale: f.scale, dx: f.dx, dy: f.dy, op: f.op })));
for (const f of frames) {
  const b64 = await page.evaluate((t) => window.__neFrames.find((x) => x.want === t).url, f.want);
  fs.writeFileSync(`/tmp/ne-frame-${tag}-t${String(f.want).padStart(2, '0')}.png`,
    Buffer.from(b64.split(',')[1], 'base64'));
}
console.log(tag, 'frames:', JSON.stringify(frames));
console.log(tag, 'rot-expected(t):', JSON.stringify(frames.map((f) => ({ t: f.t, expect: +(Math.PI * (1 + f.num)).toFixed(4) }))));

const sample = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const pcx = (g.player.cx - (cam.x - cv.width / 2 / z)) * z;
  const pcy = (g.player.cy - (cam.y - cv.height / 2 / z)) * z;
  const img = ctx2.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  let white = 0, purple = 0, total = 0;
  const rMin = 55 * z, rMax = 110 * z;   // 弧带环(玩家中心 55-110px 世界半径)
  for (let y = Math.max(0, pcy - rMax) | 0; y < Math.min(cv.height, pcy + rMax); y++) {
    for (let x = Math.max(0, pcx - rMax) | 0; x < Math.min(cv.width, pcx + rMax); x++) {
      const dx = x - pcx, dy = y - pcy;
      const rr = Math.hypot(dx, dy);
      if (rr < rMin || rr > rMax) continue;
      const i = (y * cv.width + x) * 4;
      const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
      if (A < 40) continue;
      total++;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (mx - mn < 22 && mx > 175) white++;                       // 白弧/白芯
      if (B > R && R > G && B > 55 && (B - G) > 22) purple++;      // 紫弧(b>r>g)
    }
  }
  // 弧实体状态（防御式采样）
  const arcs = (g.entities.projectiles ?? []).filter((e) => e && e.projId === 972);
  const a0 = arcs[0];
  return { white, purple, total, whiteRatio: +(white / Math.max(1, total)).toFixed(4), purpleRatio: +(purple / Math.max(1, total)).toFixed(4),
    arcs: arcs.length,
    arcOp: a0 && typeof a0.op === 'number' ? +a0.op.toFixed(3) : String(a0 ? typeof a0.op : 'no-arc'),
    arcT: a0 ? (typeof a0.t === 'number' ? a0.t : 'no-t') : null };
});
console.log(tag, 'sample:', JSON.stringify(sample));
await page.screenshot({ path: `/tmp/nesword-trail-${tag}.png` });
console.log(tag, 'screenshot: /tmp/nesword-trail-' + tag + '.png');
if (errors.length) console.log(tag, 'pageerrors:', errors.slice(0, 3));
await browser.close();

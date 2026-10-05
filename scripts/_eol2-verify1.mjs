// ★EoL2 修1/2/4/5 活机验收探针（只读;基于 _eol2-live0 双臂骨架,2026-10-05）
//   产出:①地表 boss bbox 亮度/光值比（lerp 语义应升） ②真暗穴 boss+弹幕
//   871/872/873/874/931/932（spawnHostileProj）+919/923（真载体 FairyQueenLance/
//   SunDanceBeam 直 import）逐弹 p90/max——彩虹尾迹暗处全亮、932 白核可见
//   ③每测量框伴读 lightAt 真值
// 运行:SW_ORIGIN=http://localhost:5218 ARM=1 node tools/run-diag.mjs --timeout=280000 scripts/_eol2-verify1.mjs
//   （ARM=2 → ?c10e=0 重导航对照臂）
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const ARM = process.env.ARM || '1';
const SHOT_DIR = '/tmp/eol2-verify';
const TAG = 'arm' + ARM;

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

const lightAtWorld = (wx, wy) => page.evaluate(([x, y]) => {
  const g = window.__swGame;
  return g.lighting ? g.lighting.lightAt(Math.floor(x / 16), Math.floor(y / 16)) : null;
}, [wx, wy]);

// —— 场景1: 地表日光台 + 召 636 ——
console.log('==== 场景1: 地表 ====');
const s1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 8;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -48; dx <= 48; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -48; dx <= 48; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  g.player.x = (px0 + 8) * 16; g.player.y = (py0 - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(636, (px0 + 18) * 16, (py0 - 9) * 16);
  g.paused = false;
  for (let i = 0; i < 90; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const e = (g.entities.enemies || []).find((x) => x.vanillaId === 636 && !x.dead);
  if (!e) return { fail: 'no-636' };
  e.spawnAlpha = 0;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
  return { bbox: { x: sx, y: sy, w: e.w * g.camera.zoom, h: e.h * g.camera.zoom }, px: e.cx, py: e.cy };
});
console.log('scene1:', JSON.stringify(s1));
if (s1.fail) process.exit(1);
const l1 = await lightAtWorld(s1.px, s1.py);
const r1 = await shotStat('surface', [
  { tag: 'boss', ...s1.bbox },
  { tag: 'bg', x: s1.bbox.x - s1.bbox.w - 20, y: s1.bbox.y, w: s1.bbox.w, h: s1.bbox.h },
]);
console.log('surface light@boss:', JSON.stringify(l1));
console.log('surface:', JSON.stringify(r1.stats));

// —— 场景2: 深层暗穴（groundLevel+400）+ 重召 636 ——
console.log('==== 场景2: 深层暗穴 ====');
const s2 = await page.evaluate(async () => {
  const g = window.__swGame; const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py0 = Math.min(st.h - 60, Math.floor(g.world.groundLevel) + 400);
  for (let dy = -10; dy <= 6; dy++) for (let dx = -22; dx <= 22; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dy = 6; dy <= 8; dy++) for (let dx = -22; dx <= 22; dx++) st.setTile(px0 + dx, py0 + dy, 1);
  g.player.x = (px0 - 14) * 16; g.player.y = (py0 - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(636, (px0 + 6) * 16, (py0 - 4) * 16);
  g.paused = false;
  for (let i = 0; i < 150; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return { fail: 'no-636-dark' };
  e.spawnAlpha = 0;
  e.ai0 = 99; e.ai1 = 200;                                   // 冻攻击态外（防冲刺位移）——只静置
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
  return { bbox: { x: sx, y: sy, w: e.w * g.camera.zoom, h: e.h * g.camera.zoom }, px: e.cx, py: e.cy, bossId: e.id };
});
console.log('scene2:', JSON.stringify(s2));
if (!s2.fail) {
  const l2 = await lightAtWorld(s2.px, s2.py);
  const r3 = await shotStat('dark', [
    { tag: 'bossDark', ...s2.bbox },
    { tag: 'bg', x: s2.bbox.x - s2.bbox.w - 20, y: s2.bbox.y, w: s2.bbox.w, h: s2.bbox.h },
  ]);
  console.log('dark light@boss:', JSON.stringify(l2));
  console.log('dark:', JSON.stringify(r3.stats));
}

// —— 场景3: 暗穴内弹幕布点（871/872/873/874/931/932 经 spawnHostileProj;
//      919/923 真载体直 import——spawnHostileProj 只产 Arrow 载体,读不到 la0）——
console.log('==== 场景3: 暗穴弹幕 ====');
if (!s2.fail) {
  const projs = await page.evaluate(async (bossId) => {
    const g = window.__swGame;
    const ids = [871, 872, 873, 874, 931, 932];
    let k = 0;
    const bx = g.player.cx + 14 * 16, by = g.player.cy;
    for (const id of ids) {
      try { await window.__swFlow.spawnHostileProj(bx + 40 + (k % 3) * 90, by - 160 + Math.floor(k / 3) * 80, 0.2, 0.05, 40, id, 0); } catch {}
      k++;
    }
    // 919/923 真载体（bossAI_lategame 模块类）
    try {
      const m = await import('/src/entities/bossAI_lategame.ts');
      const l919 = new m.FairyQueenLance(bx + 260, by - 60, Math.PI / 7, 0.25, 50, false);
      g.entities.add(l919, 'projectiles');
      for (let i = 0; i < 25; i++) g.fixedUpdate(1 / 60);     // 推过出场窗 la0≥20
      const l919b = new m.FairyQueenLance(bx + 260, by + 40, Math.PI / 7, 0.75, 50, false);
      g.entities.add(l919b, 'projectiles');
      const s923 = new m.SunDanceBeam(bx + 360, by - 40, Math.PI / 7, bossId, 50, false);
      g.entities.add(s923, 'projectiles');
      for (let i = 0; i < 35; i++) g.fixedUpdate(1 / 60);     // 923 la0≈35 num25=1
    } catch (e) { console.error('919/923 import fail', e); }
    g.paused = false;
    for (let i = 0; i < 40; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
    g.paused = true;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const list = [];
    for (const p of (g.entities.projectiles || [])) {
      const pid = p.projId ?? p.vanillaId ?? p.type;
      if (![871, 872, 873, 874, 919, 923, 931, 932].includes(pid) || p.dead) continue;
      const [sx, sy] = g.camera.worldToScreen(p.x - 30, p.y - 30);
      const [lx, ly] = [p.x + p.w / 2, p.y + p.h / 2];
      list.push({
        tag: 'p' + pid + (list.filter((q) => q.tag.startsWith('p' + pid)).length ? 'b' : ''),
        x: sx, y: sy, w: 60 * g.camera.zoom, h: 60 * g.camera.zoom, wpos: [lx, ly],
      });
    }
    return list;
  }, s2.bossId ?? -1);
  console.log('projs onScreen:', projs.length, JSON.stringify(projs.map((p) => p.tag)));
  const lights = [];
  for (const p of projs) lights.push(await lightAtWorld(p.wpos[0], p.wpos[1]));
  console.log('proj lights:', JSON.stringify(lights));
  const r4 = await shotStat('projs', projs);
  console.log('projs:', JSON.stringify(r4.stats));
}

const flag = await page.evaluate(() => {
  const r = window.__swGame?.renderer;
  const keys = r ? Object.keys(r).filter((k) => /c10e/i.test(k)) : [];
  const vals = {};
  for (const k of keys) { try { vals[k] = typeof r[k] === 'function' ? 'fn' : r[k]; } catch {} }
  return { search: location.search, vals };
});
console.log('c10e flag:', JSON.stringify(flag).slice(0, 400));
fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.writeFileSync(`${SHOT_DIR}/${TAG}-verify.json`, JSON.stringify({ s1, r1, s2, flag }, null, 1));
console.log('done → ' + SHOT_DIR + '/' + TAG + '-*');
await page.browser().close();

// ★EoL2 亮度定谳活机探针 v2(只读,单世界单臂,ARM=1|2 两次跑)
//   ARM=1 → 缺省(c10e on);ARM=2 → ?c10e=0(重启导航,carryQuery 带参)
//   产出:本体 bbox 统计(地表日光/地下暗穴) + 弹幕 872/873/931/932 逐弹 p90/max 统计
// 运行:SW_ORIGIN=http://localhost:5218 ARM=1 node tools/run-diag.mjs --timeout=280000 scripts/_eol2-live0.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const ARM = process.env.ARM || '1';
const SHOT_DIR = '/tmp/eol2-live';
const TAG = 'arm' + ARM;

const page = await openPage(await launchBrowser({ headless: true }), {});
let made = null;
if (ARM === '2') {
  // ★BJ95 教训:旗面走 ?play URL 正道(bootstrap carryQuery 不可靠,本次 bridge-timeout 实证)
  await page.goto(ORIGIN + '/?play=small&c10e=0', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  let inGame = false;
  for (let i = 0; i < 200 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!inGame) { console.error('arm2 未进游戏'); process.exit(1); }
  // ★弹窗在 onWorldReady 后挂出(mainFlow.ts:391)——须 poll 等按钮出现再点,
  //   固定时序单击会抢跑(2026-10-05 臂2 实证:截图仍被弹窗覆盖)
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
  made = { ok: true };
} else {
  const boot = await bootstrap(page, ORIGIN, { log: () => {} });
  if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
  made = await createGame(page, { mode: 'direct', seed: 'eolbright', size: 'small', pinRandom: 20261005, log: () => {} });
}
console.log('createGame:', made?.ok, made?.why || '');
if (!made?.ok) process.exit(1);

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

// —— 场景:整平地表台 + god + 召 636 + 冻结;返回实体 bbox/light ——
const stageAndSpawn = () => page.evaluate(async () => {
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
  const li = st.idx(Math.floor(e.cx / 16), Math.floor(e.cy / 16));
  const light = g.lighting ? g.lighting.lightAt(Math.floor(e.cx / 16), Math.floor(e.cy / 16)) : null;
  return { bbox: { x: sx, y: sy, w: e.w * g.camera.zoom, h: e.h * g.camera.zoom }, tile: [Math.floor(e.cx / 16), Math.floor(e.cy / 16)], light, px: e.cx, py: e.cy };
});

// —— 弹幕布点 + 冻结后按实体现位测量 ——
const spawnProjs = () => page.evaluate(async () => {
  const g = window.__swGame;
  const ids = [872, 873, 931, 932];
  let k = 0;
  for (const id of ids) for (let j = 0; j < 2; j++) {
    try { await window.__swFlow.spawnHostileProj(g.player.cx + 100 + (k % 2) * 110, g.player.cy - 170 + Math.floor(k / 2) * 95, j % 2 ? 1.2 : -1.2, 0.4, 40, id, 0); } catch {}
    k++;
  }
  g.paused = false;
  for (let i = 0; i < 70; i++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const list = [];
  for (const p of (g.entities.projectiles || [])) {
    const pid = p.projId ?? p.vanillaId ?? p.type;
    if (![872, 873, 931, 932].includes(pid) || p.dead) continue;
    const [sx, sy] = g.camera.worldToScreen(p.x - 24, p.y - 24);
    list.push({ tag: 'p' + pid, x: sx, y: sy, w: 48 * g.camera.zoom, h: 48 * g.camera.zoom });
  }
  return list;
});

console.log('==== 场景1: 地表日光 ====');
const s1 = await stageAndSpawn();
console.log('scene:', JSON.stringify(s1));
if (s1.fail) process.exit(1);
const r1 = await shotStat('surface', [ { tag: 'boss', ...s1.bbox }, { tag: 'bg', x: s1.bbox.x - s1.bbox.w - 20, y: s1.bbox.y, w: s1.bbox.w, h: s1.bbox.h } ]);
console.log('surface:', JSON.stringify(r1.stats));
await page.evaluate(() => { window.__swGame.paused = false; });
const projs = await spawnProjs();
console.log('projs onScreen:', projs.length);
const r2 = await shotStat('projs', projs);
console.log('projs:', JSON.stringify(r2.stats));

console.log('==== 场景2: 地下暗穴(新召 636) ====');
const s2 = await page.evaluate(async () => {
  const g = window.__swGame; const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py0 = Math.min(st.h - 60, Math.floor(g.world.groundLevel) + 160);
  for (let dy = -8; dy <= 4; dy++) for (let dx = -10; dx <= 10; dx++) { st.setTile(px0 + dx, py0 + dy, 0); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0; }
  g.player.x = (px0 - 4) * 16; g.player.y = (py0 - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(636, (px0 + 4) * 16, (py0 - 4) * 16);
  g.paused = false;
  for (let i = 0; i < 120; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const e = (g.entities.enemies || []).filter((x) => x.vanillaId === 636 && !x.dead).at(-1);
  if (!e) return { fail: 'no-636-dark' };
  e.spawnAlpha = 0;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
  const light = g.lighting ? g.lighting.lightAt(Math.floor(e.cx / 16), Math.floor(e.cy / 16)) : null;
  return { bbox: { x: sx, y: sy, w: e.w * g.camera.zoom, h: e.h * g.camera.zoom }, light, px: e.cx, py: e.cy };
});
console.log('scene:', JSON.stringify(s2));
if (!s2.fail) {
  const r3 = await shotStat('dark', [ { tag: 'bossDark', ...s2.bbox }, { tag: 'bg', x: s2.bbox.x - s2.bbox.w - 20, y: s2.bbox.y, w: s2.bbox.w, h: s2.bbox.h } ]);
  console.log('dark:', JSON.stringify(r3.stats));
}
const flag = await page.evaluate(() => {
  const r = window.__swGame?.renderer;
  const keys = r ? Object.keys(r).filter((k) => /c10e/i.test(k)) : [];
  const vals = {};
  for (const k of keys) { try { vals[k] = typeof r[k] === 'function' ? 'fn' : r[k]; } catch {} }
  return { search: location.search, keys, vals };
});
console.log('c10e flag:', JSON.stringify(flag));
fs.writeFileSync(`${SHOT_DIR}/${TAG}-summary.json`, JSON.stringify({ s1, r1, projs, r2, s2, flag }, null, 1));
console.log('done → ' + SHOT_DIR + '/' + TAG + '-*');
await page.browser().close();

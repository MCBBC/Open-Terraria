// IIII188 渲染探针 v2:净化改判刀渲染中性验证 + 139 折页孤例语义验证。
// 方法=【同格先后两态】像素全等(光照/背景恒定):
//   ①地下石室 rig:继承帧(t53 f(36,1296)/t75 f(36,1062)/t192 f(2700,0)) → 同格置零(旧净化态)
//     → 像素全等 ⇒ 保留 vs 清零渲染不可分(视觉零回归);
//   ②真实继承帧格(全域扫 t192/t53/t75 越表帧)置零前后全等;
//   ③t139 音乐盒折页:f(36,3132)=页1折叠 ≡ f(108,1116)=页0在表 像素全等(TileDrawing
//     cs:5093-5099 语义在 VanillaTiler 不破);同帧两次拍=稳定性对照。
// 产物 /tmp/iii188-out/render-probe.json + render-surface.png + render-hell.png。
// 用法:cd game && SW_ORIGIN=http://localhost:5247 node tools/run-diag.mjs scripts/_iii188-render-probe.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errs.push('console: ' + m.text().slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid && window.__swGame.renderer?.minimap, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const ids = {};
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if ((s === 192 || s === 53 || s === 75 || s === 139) && ids[s] === undefined) ids[s] = i;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── 地下石室 rig(y=400 岩层带,净空 52×9,石底;blob 底行贴地防沙落/家具无托)──
  const PY = 400;
  const p0 = Math.max(80, Math.min(st.w - 200, Math.floor(g.player.x / 16)));
  for (let x = p0; x < p0 + 52; x++) for (let y = PY - 8; y <= PY; y++) st.setTile(x, y, 0);
  for (let x = p0 - 1; x <= p0 + 52; x++) for (let y = PY + 1; y <= PY + 2; y++) st.setTile(x, y, 2);   // 石底/托
  const slots = { t53s: 0, t53z: 7, t75s: 14, t75z: 21, t192s: 28, t192z: 35, t139: 42 };
  const px0 = p0 + 4, TOP = PY - 2;                       // blob 顶行 TOP,底行 PY(贴石底)
  const blob3 = (bx, id, fx, fy) => {
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
      st.setTile(bx + dx, TOP + dy, id, fx ? fx + dx * 18 : 0, fy ? fy + dy * 18 : 0);
  };
  const blob2 = (bx, id, fx, fy) => {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      st.setTile(bx + dx, TOP + 1 + dy, id, fx + dx * 18, fy + dy * 18);
  };
  const clearSlot = (bx) => { for (let dy = -1; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) st.setTile(bx + dx, TOP + dy, 0); };

  g.player.x = (px0 - 8) * 16; g.player.y = (PY - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  await sleep(600);

  const cam = g.camera, cv = g.renderer.canvas;
  const px = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const hashRect = (bx, by, wT, hT) => {
    const [scx, scy] = px(bx * 16, by * 16);
    const w = Math.max(4, Math.round(wT * 16 * cam.zoom)), h = Math.max(4, Math.round(hT * 16 * cam.zoom));
    const x0 = Math.max(0, scx), y0 = Math.max(0, scy);
    const d = g.renderer.ctx.getImageData(x0, y0, Math.min(w, cv.width - x0), Math.min(h, cv.height - y0)).data;
    let hsh = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) { hsh = (hsh * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0; sum += d[i] + d[i + 1] + d[i + 2]; }
    return { h: hsh, sum, n: d.length >> 2 };
  };

  const res = { ids, pairs: {}, real: {}, realPairs: {} };
  // ①rig 同格先后两态(继承帧 → 置零=旧净化态)
  const spec = { t53: [53, 36, 1296], t75: [75, 36, 1062], t192: [192, 2700, 0] };
  for (const [k, [sh, fx, fy]] of Object.entries(spec)) {
    const id = ids[sh]; if (id === undefined) { res.pairs[k] = 'no-id'; continue; }
    const bx = px0 + slots['t' + k.slice(1) + 's'];
    blob3(bx, id, fx, fy);
    await sleep(300);
    const hStale = hashRect(bx, TOP, 3, 3);
    blob3(bx, id, 0, 0);
    await sleep(300);
    const hZero = hashRect(bx, TOP, 3, 3);
    clearSlot(bx);
    res.pairs[k] = { stale: hStale, zero: hZero, equal: hStale.h === hZero.h };
  }
  // ③t139 折页:同格先后 (36,3132)页1 / (108,1116)页0 / (36,3132) 复拍(稳定性对照)
  {
    const id = ids[139];
    if (id === undefined) res.pairs.t139 = 'no-id';
    else {
      const bx = px0 + slots.t139;
      blob2(bx, id, 36, 3132); await sleep(300);
      const hA = hashRect(bx, TOP + 1, 2, 2);
      blob2(bx, id, 108, 1116); await sleep(300);
      const hB = hashRect(bx, TOP + 1, 2, 2);
      blob2(bx, id, 36, 3132); await sleep(300);
      const hA2 = hashRect(bx, TOP + 1, 2, 2);
      clearSlot(bx);
      res.pairs.t139 = { fold: hA, inSheet: hB, foldRe: hA2, foldEq: hA.h === hB.h, stable: hA.h === hA2.h };
    }
  }
  // ②真实继承帧格全域扫+置零前后
  const want = { 192: (fx, fy) => fx >= 234, 53: (fx, fy) => fy >= 270, 75: (fx, fy) => fy >= 270 };
  for (const sh of [192, 53, 75]) {
    const id = ids[sh]; if (id === undefined) continue;
    let hit = null;
    for (let i = 0; i < st.type.length && !hit; i++) {
      if (st.flags[i] && st.type[i] === id) {
        const fx = st.frameX[i], fy = st.frameY[i];
        if (fx < 32768 && fy < 32768 && want[sh](fx, fy)) hit = { x: i % st.w, y: (i / st.w) | 0, fx, fy };
      }
    }
    res.real['sheet' + sh] = hit;
    if (hit) {
      g.player.x = (hit.x + 1) * 16; g.player.y = (hit.y - 2) * 16; g.player.vx = 0; g.player.vy = 0;
      await sleep(600);
      const before = hashRect(hit.x, hit.y, 1, 1);
      const before2 = (await sleep(250), hashRect(hit.x, hit.y, 1, 1));   // 稳定性对照(未改态双拍)
      st.setTile(hit.x, hit.y, st.type[st.idx(hit.x, hit.y)], 0, 0);   // 旧净化态
      await sleep(350);
      const after = hashRect(hit.x, hit.y, 1, 1);
      const after2 = (await sleep(250), hashRect(hit.x, hit.y, 1, 1));    // 同态双拍
      st.setTile(hit.x, hit.y, st.type[st.idx(hit.x, hit.y)], hit.fx, hit.fy);  // 新刀保留态还原
      res.realPairs['sheet' + sh] = { before, before2, after, after2,
        stable: before.h === before2.h && after.h === after2.h,
        equal: before.h === after.h };
    }
  }
  // ④地表/地狱带截图
  g.player.x = (p0 + 26) * 16; g.player.y = (PY - 200) * 16;
  let sy = 40;
  for (let y = 40; y < st.h - 300; y++) { if (st.flags[st.idx(p0 + 26, y)]) { sy = y; break; } }
  g.player.y = (sy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  await sleep(700);
  res.surfacePng = (() => { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0); return c2.toDataURL('image/png'); })();
  g.player.y = (st.h - 160) * 16; g.player.vx = 0; g.player.vy = 0;
  await sleep(700);
  res.hellPng = (() => { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0); return c2.toDataURL('image/png'); })();
  return res;
});

writeFileSync('/tmp/iii188-out/render-probe.json', JSON.stringify({ ...out, surfacePng: undefined, hellPng: undefined }, null, 1));
if (out.surfacePng) writeFileSync('/tmp/iii188-out/render-surface.png', Buffer.from(out.surfacePng.split(',')[1], 'base64'));
if (out.hellPng) writeFileSync('/tmp/iii188-out/render-hell.png', Buffer.from(out.hellPng.split(',')[1], 'base64'));
const verdict = {};
for (const [k, v] of Object.entries(out.pairs ?? {})) {
  if (k === 't139') verdict[k] = { foldEq: v.foldEq, stable: v.stable };
  else verdict[k] = v.equal === true ? 'EQ' : v;
}
for (const [k, v] of Object.entries(out.realPairs ?? {})) verdict['real:' + k] = v.equal === true ? 'EQ' : v;
console.log(JSON.stringify({ verdict, errors: errs }, null, 1));
await browser.close();

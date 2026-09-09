// 用户场景闭环:生命水晶(tile 12)暗室可读性 + Gemspark +0.39 加法支
//  方法:地下暗室放水晶(2×2)/萤光块(262)/石块对照,远处一支火把;A/B(__SW_SHINE_OFF)
//  各 7 采样取中位;判据 = (目标 ON/OFF)÷(对照 ON/OFF)——对照吸收光场漂移:
//  水晶期望 ≈1.6(乘法支);萤光块期望 (L+0.39)/L(加法支,与光无关,L=对照处光)。
//  另输出水晶区 ASCII 亮度图(ON vs OFF)。运行:
//  SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=500000 scripts/_tileshine-scene.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
console.log('world ready');

const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = (k) => window.__swTiles[k];
  const heart = T('crystal_heart'), stone = T('stone'), torch = T('torch'), gem = T('v_262_amethystgemspark');
  const gy = Math.floor(g.world.groundLevel) + 120;
  let cx = -1, cy = -1;
  outer: for (let x = 200; x < st.w - 220; x += 3) {
    for (let y = gy; y < Math.min(gy + 220, st.h - 20); y += 3) {
      if (st.inBounds(x + 24, y + 12) && st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === stone) { cx = x; cy = y; break outer; }
    }
  }
  if (cx < 0) return { err: 'no spot' };
  // 大暗室:20×12
  for (let y = cy - 8; y <= cy + 3; y++) for (let x = cx - 10; x <= cx + 10; x++) st.setTileSilent(x, y, 0, 0, 0);
  for (let x = cx - 10; x <= cx + 10; x++) { st.setTileSilent(x, cy + 4, stone, 0, 0); st.setTileSilent(x, cy + 5, stone, 0, 0); }
  // 生命水晶 2×2 站地板(左)
  for (const [dx, dy, fx, fy] of [[0, 0, 0, 0], [1, 0, 18, 0], [0, 1, 0, 18], [1, 1, 18, 18]]) {
    st.setTileSilent(cx - 6 + dx, cy + 2 + dy, heart, fx, fy);
  }
  // 萤光块 2×2(右)(tileShine2 262 加法支)
  if (gem !== undefined) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) st.setTileSilent(cx + 5 + dx, cy + 2 + dy, gem, 0, 0);
  // 对照石块嵌入地板(心旁,无 shine)——采样取其顶面格
  st.setTileSilent(cx - 1, cy + 4, stone, 0, 0);
  // 火把:房间右端远处(晶 ~11 格 / 萤 ~6 格)——微光
  st.setTileSilent(cx + 9, cy + 3, torch, 0, 0);
  globalThis.__grabs = { off: [], on: [], off2: [], fb_on: [], fb_off: [] };
  return { cx, cy, gem: gem !== undefined };
});
if (spot.err) { console.error(spot.err); await browser.close(); process.exit(1); }
console.log('spot:', JSON.stringify(spot));

await page.evaluate(([cx, cy]) => {
  const g = window.__swGame;
  g.player.x = (cx + 1) * 16; g.player.y = (cy + 4) * 16 - 22;
  g.player.vy = 0; g.player.vx = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [spot.cx, spot.cy]);
await new Promise((r) => setTimeout(r, 7000));

// 采样:目标区域 mean + ASCII(ON 时)
const REGIONS = {
  heart: { x0: spot.cx - 6, y0: spot.cy + 2, x1: spot.cx - 4, y1: spot.cy + 4 },
  gem: { x0: spot.cx + 5, y0: spot.cy + 2, x1: spot.cx + 7, y1: spot.cy + 4 },
  ctrl: { x0: spot.cx - 1, y0: spot.cy + 4, x1: spot.cx, y1: spot.cy + 5 },
};
const sample = async (tag, rw, wantAscii) => {
  const out = await page.evaluate(([t, r, wa]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const cam = g.camera; const z = cam.zoom ?? 1;
    const sx = Math.round((r.x0 * 16 - (cam.x - cv.width / 2 / z)) * z);
    const sy = Math.round((r.y0 * 16 - (cam.y - cv.height / 2 / z)) * z);
    const w = Math.round((r.x1 - r.x0) * 16 * z), h = Math.round((r.y1 - r.y0) * 16 * z);
    const d = c2.getImageData(sx, sy, w, h).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    const ascii = [];
    for (let y = 0; y < h; y += 2) {
      let line = '';
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
        if (wa) {
          const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
          line += l > 140 ? '#' : l > 90 ? '+' : l > 55 ? '*' : l > 30 ? ':' : l > 12 ? '.' : ' ';
        }
      }
      if (wa) ascii.push(line);
    }
    const li = g.renderer.lighting ? g.renderer.lighting.lightAt(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.y0 + r.y1) / 2)) : null;
    globalThis.__grabs[t].push({ mean: [rr / n, gg / n, bb / n], light: li, ascii });
    return { mean: [+(rr / n).toFixed(2), +(gg / n).toFixed(2), +(bb / n).toFixed(2)], light: li,
      fb: g.renderer.fullbright, cam: [Math.round(cam.x), Math.round(cam.y)], z, lowK: g.renderer._worldLowK };
  }, [tag, rw, wantAscii]).catch((e) => { console.log(tag, 'FAIL:', e.message); return null; });
  return out;
};
const setState = async (v) => {
  await page.evaluate((vv) => { globalThis.__SW_SHINE_OFF = vv; }, v);
  await new Promise((r) => setTimeout(r, 850));
};
const med = (arrs) => [0, 1, 2].map((c) => {
  const v = arrs.map((a) => a.mean[c]).sort((x, y) => x - y);
  return v[v.length >> 1];
});
// Phase A 逐采样绝对值打印(诊断全局漂移)
const printAll = async (tag, key) => {
  for (const [name, rw] of Object.entries(REGIONS)) {
    const o = await sample(tag, rw, false);
    if (o) console.log(`  [${key}:${name}] mean=`, JSON.stringify(o.mean), 'light=', JSON.stringify(o.light), 'fb=', o.fb, 'cam=', JSON.stringify(o.cam), 'lowK=', o.lowK);
  }
};
const div = (a, b) => a.map((v, i) => v / Math.max(1e-6, b[i]));

const on = { heart: [], gem: [], ctrl: [] }, off = { heart: [], gem: [], ctrl: [] };
// ★setState(v)=__SW_SHINE_OFF=v:v=true → shine OFF。tag 按真实语义。
// Phase A:fullbright 幅值(零光照噪声)——heart 动态支 1.6 / gem 加法支 1.39 / ctrl 1.0
await page.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise((r) => setTimeout(r, 900));
for (let k = 0; k < 3; k++) { await setState(false); await printAll('fb_on', 'ON' + k); }
for (let k = 0; k < 3; k++) { await setState(true); await printAll('fb_off', 'OFF' + k); }
await page.evaluate(() => { window.__swGame.renderer.fullbright = false; });
await new Promise((r) => setTimeout(r, 900));
// Phase B:实光场景(用户场景)——ON 先采
for (let k = 0; k < 7; k++) {
  await setState(false);
  await sample('on', REGIONS.heart, k === 0); await sample('on', REGIONS.gem, false); await sample('on', REGIONS.ctrl, false);
}
await setState(false);
await sample('on', REGIONS.heart, true);
for (let k = 0; k < 7; k++) {
  await setState(true);
  await sample('off', REGIONS.heart, true); await sample('off', REGIONS.gem, false); await sample('off', REGIONS.ctrl, false);
}
const res = await page.evaluate(() => {
  const G = globalThis.__grabs;
  const med = (arr) => [0, 1, 2].map((c) => {
    const v = arr.map((a) => a.mean[c]).sort((x, y) => x - y);
    return v[v.length >> 1];
  });
  const fb = {};
  for (const k of ['heart', 'gem', 'ctrl']) {
    fb[k] = { on: med(G.fb_on.filter((a) => a.mean)), off: med(G.fb_off.filter((a) => a.mean)) };
  }
  const medAscii = (arr) => {
    // 取整体亮度居中的一份 ascii
    const withA = arr.filter((a) => a.ascii && a.ascii.length);
    if (!withA.length) return null;
    const keys = withA.map((a) => a.ascii.flat().filter((ch) => ch !== ' ').length);
    const mid = [...keys].sort((x, y) => x - y)[keys.length >> 1];
    return withA[keys.indexOf(mid)].ascii;
  };
  const out = {};
  for (const k of ['heart', 'gem', 'ctrl']) {
    out[k] = { on: med(G.on.filter((a) => a.mean)), off: med(G.off.filter((a) => a.mean)),
      asciiOn: k === 'heart' ? medAscii(G.on) : null, asciiOff: k === 'heart' ? medAscii(G.off) : null };
  }
  out.fb = fb;
  return out;
});
const ratio = (k) => div(res[k].on, res[k].off).map((v) => +v.toFixed(3));
const fbRatio = (k) => div(res.fb[k].on, res.fb[k].off).map((v) => +v.toFixed(3));
const heartR = ratio('heart'), gemR = ratio('gem'), ctrlR = ratio('ctrl');
const adj = heartR.map((v, i) => +(v / Math.max(1e-6, ctrlR[i])).toFixed(3));
const gemAdj = gemR.map((v, i) => +(v / Math.max(1e-6, ctrlR[i])).toFixed(3));
console.log('=== Phase A fullbright 幅值(期望 heart=1.6 / gem=1.39 / ctrl=1.0) ===');
console.log('HEART fb ON/OFF =', JSON.stringify(fbRatio('heart')));
console.log('GEM   fb ON/OFF =', JSON.stringify(fbRatio('gem')));
console.log('CTRL  fb ON/OFF =', JSON.stringify(fbRatio('ctrl')));
console.log('=== Phase B 实光场景 ===');
console.log('heart ON/OFF =', JSON.stringify(heartR), ' ctrl ON/OFF =', JSON.stringify(ctrlR));
console.log('HEART 对照校正增益(期望≈1.6) =', JSON.stringify(adj));
console.log('GEM   对照校正增益(期望 (L+0.39)/L, L≈ctrl light/255) =', JSON.stringify(gemAdj));
console.log('heart light:', JSON.stringify(res.heart.on), JSON.stringify(res.heart.off));
console.log('--- 水晶区 ASCII · SHINE ON ---');
for (const l of res.heart.asciiOn || []) console.log(l);
console.log('--- 水晶区 ASCII · SHINE OFF ---');
for (const l of res.heart.asciiOff || []) console.log(l);
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();

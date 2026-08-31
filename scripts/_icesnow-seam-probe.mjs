// 冰(161)×雪(147)跨界漏缝取证探针：装载用户导出的 Starter_World 存档，
// 传送到 marks 标注簇 (1905..1920 × 356..380)，输出格面帧表 + 接缝区截图。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (20).json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
if (process.env.SW_STRICT === '1') {
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('sw_vanilla_framing_strict', '1'); } catch {} });
}
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const text = fs.readFileSync(MAP, 'utf8');
const okLoad = await p.evaluate(async (t) => { try { window.__swFlow.loadJson(t); return true; } catch (e) { return 'ERR:' + e; } }, text);
console.log('loadJson ->', okLoad);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await sleep(3000);
// 强制撤除启动幕/过渡页(探针直载路径 splash 交接逻辑可能悬空)
await p.evaluate(() => {
  document.getElementById('sw-boot-prime')?.remove();
  document.getElementById('sw-splash')?.remove();
});
// 关掉欢迎公告(遮挡全屏)
for (let i = 0; i < 10; i++) {
  const closed = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent || '').includes('我已知晓'));
    if (b) { b.click(); return true; }
    return false;
  });
  if (closed) break;
  await sleep(500);
}
for (let i = 0; i < 40; i++) {
  const ready = await p.evaluate(() => !!window.__swGame?.chunks);
  if (ready) break;
  await sleep(1000);
}
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  // 静置相机对准标注簇中心
  g.player.x = 1913 * 16 + 8; g.player.y = 360 * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  g.renderer.fullbright = true;   // 地下取证:免光照黑幕
  return { w: g.world.w, h: g.world.h, name: g.world.name, seed: String(g.world.seed), spawnX: g.world.spawnX, spawnY: g.world.spawnY };
});
console.log('world:', JSON.stringify(out));
await sleep(2500);

// 格面取证：类型/帧/坡度/半砖 + 原版 id
const table = await p.evaluate(async () => {
  const m1 = await import('/src/render/TileMergeFamily.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rows = [];
  for (let y = 354; y <= 382; y++) {
    for (let x = 1903; x <= 1922; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t === 0 || !st.flags[i]) continue;
      rows.push({ x, y, t, vid: m1.vanillaIdOf(t), k: (m1.vanillaIdOf(t) === 147 ? 'SNOW' : m1.vanillaIdOf(t) === 161 ? 'ICE' : ''), fx: st.frameX[i], fy: st.frameY[i], sl: st.slope[i], hf: st.half[i] ? 1 : 0 });
    }
  }
  return rows;
});
// 仅打印 snow/ice 及其直接边界邻居
const focus = table.filter((r) => r.k !== '' );
console.log('== ICE/SNOW cells (fx,fy,sl,hf) ==');
let line = '';
for (const r of focus) {
  const tag = `${r.x},${r.y}:${r.k[0]}(${r.fx},${r.fy}${r.sl ? ',s' + r.sl : ''}${r.hf ? ',h' : ''})`;
  line += tag + ' ';
  if (line.length > 150) { console.log(line); line = ''; }
}
if (line) console.log(line);

// 帧值分布统计（检测同型异帧/异常零帧）
const dist = {};
for (const r of focus) {
  const key = `${r.k}(${Math.floor(r.fx / 18)},${Math.floor(r.fy / 18)})`;
  dist[key] = (dist[key] ?? 0) + 1;
}
console.log('frame-grid distribution:', JSON.stringify(dist));

// 截图接缝核心区（屏幕坐标）
const shot = await p.evaluate(() => {
  const g = window.__swGame;
  const cam = g.renderer?.camera ?? g.camera;
  const sx = Math.round(1913 * 16 - (cam?.x ?? 0) + innerWidth / 2);
  const sy = Math.round(360 * 16 - (cam?.y ?? 0) + innerHeight / 2);
  window.__seamXY = [sx, sy];
  return { sx, sy };
});
await sleep(800);
await p.screenshot({ path: '/tmp/seam-starter-world.png' });
console.log('screenshot center px:', JSON.stringify(shot));
await b.close();
console.log('done');

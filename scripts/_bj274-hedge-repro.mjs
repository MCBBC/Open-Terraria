// BJ274 实报场景复现：loadJson 载入用户 kv 存档(map-有害的动物尸体树篱.json)，
// 传送至实报条带(world 1867-1884 @295)，等待液体模拟跑数秒，
// 同拍采样：store 数据(type/flags/liquid) + 主画布像素 + 52 帧动画态。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const SAVE = '/tmp/bj274-map.json';
const saveText = readFileSync(SAVE, 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bj274-chrome-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });

const loadRes = await page.evaluate((text) => {
  return window.__swFlow.loadJson(text);
}, saveText);
console.log('loadJson:', JSON.stringify(loadRes)?.slice(0, 300));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));

// 传送玩家到实报条带上方（原报告玩家世界像素 30043,4678 = tile 1877.7,292.4）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 30043; g.player.y = 4678; g.player.vx = 0; g.player.vy = 0;
  if (g.camera) { /* 相机自然跟随 */ }
});
// 等液体模拟推进（报告时点会话 60s；这里等 12s 观察带形态演化）
await new Promise((r) => setTimeout(r, 12000));

const data = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const out = { player: { x: p.x, y: p.y, tx: Math.floor(p.x / 16), ty: Math.floor(p.y / 16), inWater: !!p.inWater } };
  // 行 292-298, x 1840-1920: type(sheet域)/flags/liquid/liquidType
  const SHEET = (t) => { try { return window.__swSheetOf ? window.__swSheetOf(t) : t; } catch { return t; } };
  const rows = [];
  for (let y = 292; y <= 298; y++) {
    const r = [];
    for (let x = 1840; x <= 1920; x++) {
      const i = st.idx(x, y);
      r.push(`${st.type[i]}|${st.flags[i]}|${st.liquid[i]}|${st.liquidType[i]}`);
    }
    rows.push({ y, cells: r });
  }
  out.rows = rows;
  out.groundLevel = g.world.groundLevel;
  return out;
});
console.log('player:', JSON.stringify(data.player));
// 压缩打印:每行分 81 列, 只打印非平凡格
for (const row of data.rows) {
  const interesting = [];
  row.cells.forEach((c, k) => {
    const [t, f, l, lt] = c.split('|').map(Number);
    if (t !== 0 || f !== 0 || l !== 0) interesting.push(`${1840 + k}:${c}`);
  });
  console.log(`row ${row.y}:`, interesting.slice(0, 60).join(' '));
}
await page.screenshot({ path: '/tmp/bj274-repro-1.png' });

// 再等 8s 看演化 + 第二张
await new Promise((r) => setTimeout(r, 8000));
await page.screenshot({ path: '/tmp/bj274-repro-2.png' });
const data2 = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const out = [];
  for (let y = 293; y <= 296; y++) {
    const r = [];
    for (let x = 1840; x <= 1920; x++) {
      const i = st.idx(x, y);
      r.push(`${st.type[i]}|${st.flags[i]}|${st.liquid[i]}`);
    }
    out.push({ y, cells: r });
  }
  return out;
});
for (const row of data2) {
  const interesting = [];
  row.cells.forEach((c, k) => {
    const [t, f, l] = c.split('|').map(Number);
    if (t !== 0 || f !== 0 || l !== 0) interesting.push(`${1840 + k}:${c}`);
  });
  console.log(`t2 row ${row.y}:`, interesting.slice(0, 60).join(' '));
}
await browser.close();
console.log('done');

// 一次性:冰川之牙使用链诊断——轮询 swing/orb 何时出现,定位使用门
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60;
  g.input.mouseY = sy - 60;
  // 轮询记录 swing/orb 出现时刻
  g.__trace = [];
  g.__traceTimer = setInterval(() => {
    const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115).length;
    g.__trace.push({ t: Date.now() % 100000, md: g.input.mouseDown, mh: g.input.mouseHeld, sw: g.swing ? g.swing.t : 0, ut: g.player.useTime, orbs });
    if (g.__trace.length > 40) g.__trace.shift();
  }, 100);
});
// 边沿触发:置 true 300ms 后清,再置(模拟点击节奏)
for (let i = 0; i < 4; i++) {
  await p.evaluate(() => { const g = window.__swGame; g.input.mouseDown = true; g.input.mouseHeld = true; });
  await sleep(300);
  await p.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; });
  await sleep(200);
}
const trace = await p.evaluate(() => {
  const g = window.__swGame;
  const t = g.__trace ?? [];
  clearInterval(g.__traceTimer);
  // 压缩:只报变化点
  const out = [];
  let prev = '';
  for (const r of t) {
    const k = `md=${r.md ? 1 : 0} sw=${r.sw} ut=${r.ut} orbs=${r.orbs}`;
    if (k !== prev) { out.push(`${r.t}: ${k}`); prev = k; }
  }
  return out;
});
console.log('TRACE:');
for (const l of trace.slice(0, 20)) console.log(' ', l);
await b.close();

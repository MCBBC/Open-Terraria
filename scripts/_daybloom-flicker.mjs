// 一次性:6152 太阳花法杖连发瞬态量化——按住 2.5s,逐帧采样 swing 状态,
// 统计 null 帧(法杖放下帧)次数与分布
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6152_DaybloomStaff'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 80; g.input.mouseY = sy - 20;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.__nullFrames = 0; g.__samples = 0; g.__nullRuns = 0; g.__prevNull = false;
  g.__poll = setInterval(() => {
    const nul = !g.swing;
    g.__samples++;
    if (nul) { g.__nullFrames++; if (!g.__prevNull) g.__nullRuns++; }
    g.__prevNull = nul;
  }, 8);
});
await sleep(2500);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  clearInterval(g.__poll);
  return { samples: g.__samples, nullFrames: g.__nullFrames, nullRuns: g.__nullRuns, mana: Math.round(g.player.mana) };
});
console.log('6152 连发 2.5s:', JSON.stringify(st));
console.log(st.nullRuns === 0 ? '✓ 零放下帧（瞬态已消除）' : '✗ 仍有 ' + st.nullRuns + ' 段放下帧');
await b.close();

// canvas 出生栈普查(2026-08-18):_chunkatlas-probe 发现移动期 ~450 张/秒的
// 隐藏 canvas 工厂(与 chunk 无关)——本探针按创建点聚栈,定位真凶。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_canvasborn-probe.mjs
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = join(HOME, '.claude/jobs/8405c930/tmp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/canvasborn-profile`,
  args: ['--no-first-run', ...(process.env.CB_ARGS ?? '').split(/\s+/).filter(Boolean)],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
let sentinelWarned = 0;
page.on('console', (m) => { const t = m.text(); if (t.includes('[canvas哨兵]')) { sentinelWarned++; console.log('[哨兵警告原文]', t.slice(0, 260)); } });
await page.evaluateOnNewDocument(() => {
  // 聚栈:按第 2-4 帧(跳过 patch 自身)聚合;只记 window 开始计数之后的
  window.__bornStacks = new Map();
  window.__bornOn = false;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) {
      const st = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at\s+/, '')).join(' | ');
      window.__bornStacks.set(st, (window.__bornStacks.get(st) || 0) + 1);
    }
    return orig(tag, ...rest);
  };
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
// 强制黄昏:昼夜色调 tint≠(1,1,1) 才走 BiomeBackground 烘焙路径(2026-08-18
// 用户真机 61/s churn 的触发条件——晨昏色调连续漂移)
if (process.env.CB_DUSK === '1') {
  await page.evaluate(() => {
    const c = window.__swGame?.world?.clock;
    if (c && 'timeOfDay' in c) c.timeOfDay = 0.78;
  }).catch(() => {});
  console.log('已强制黄昏(timeOfDay=0.78)');
}
console.log('世界就绪,渲染 5s…');
await sleep(5000);
await page.evaluate(() => { window.__bornOn = true; });
console.log('开始移动采样 12s…');
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => { window.__swGame.player.x += 600; });
  await sleep(1500);
}
const stacks = await page.evaluate(() => [...window.__bornStacks.entries()]
  .sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log(`== canvas 出生栈 TOP12(12s 移动期) ==`);
for (const [st, n] of stacks) console.log(`${String(n).padStart(6)}  ${st.slice(0, 220)}`);
// 哨兵侧验证:已装 + 静默(正常游玩不误报)+ 速率读数就绪
const cw = await page.evaluate(() => window.__swCanvasWatch?.() ?? null);
console.log(`[canvas哨兵] ${JSON.stringify(cw)} 误报=${sentinelWarned}(应 0)`);
await browser.close();

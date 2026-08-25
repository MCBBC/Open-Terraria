// 用户存档僵尸凹龛卡死复现:__swLoadJson 载入真实存档 → 标记点(2069,240)生成僵尸群 → 600t 追踪
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const SAVE = readFileSync('/Users/vinlic/Downloads/map-氙奇葩 (6).json', 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
// 直接读档(跳过创建流程)
await page.evaluate((txt) => window.__swLoadJson?.(txt), SAVE);
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const pl = g.player;
  // 玩家挪到标记点旁高处旁观
  pl.x = 2076 * 16; pl.y = 231 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.world.clock.timeOfDay = 0;   // 夜(僵尸活跃)
  // 凹龛:顶(2069,239)锡矿 地板(2069,242)草 右墙(2070,237-240)锡矿
  // 僵尸 18×42 站地板 242 顶=239.4 与锡矿重叠=天然楔住态
  const spawn = [];
  for (let i = 0; i < 3; i++) {
    const e = g.spawnNpcByVanilla(3, 2069 * 16 + 8 - i * 6, 241 * 16 - 42);
    if (e) spawn.push(e.id);
  }
  const snap = () => [...g.entities.enemies, ...g.entities.critters]
    .filter((e) => e.vanillaId === 3)
    .map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), vx: Math.round(e.vx * 100) / 100, vy: Math.round(e.vy * 100) / 100, f: e.facing, ai3: Math.round(e.ai3 ?? 0), hp: e.hp, emb: e.embedTicks ?? -1, onG: !!e.onGround, st: e.state ?? '', ai2: Math.round(e.ai2 ?? 0), hitW: !!e.hitWall }));
  const t0 = snap();
  // 跑 12 秒(720t),每 2s 采样轨迹
  const trace = [t0];
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    trace.push(snap());
  }
  // 尾段 10s 低频观察(转向后是否走出凹龛区)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    trace.push(snap());
  }
  const t1 = snap();
  void trace;
  // 位移判据:每只 |Δx|+|Δy| > 24px(1.5 格)=有活动
  const moved = t1.map((a, i) => {
    const b = t0[i] ?? { x: a.x, y: a.y };
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  });
  return { trace, t1, moved, alive: t1.length };
});
console.log('RESULT', JSON.stringify(out));
await page.evaluate(() => {
  const g = window.__swGame;
  const pl = g.player;
  pl.x = 2076 * 16; pl.y = 231 * 16 - pl.h;
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/zombie-nook.png' });
await browser.close();

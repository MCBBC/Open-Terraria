// FX24e 一次性探针：紫色重影来源定罪——全帧 drawImage 间谍：
//  ① 识别 NPC_668 原图与 tintAtlas 页 canvas（对 668 帧格采样含非透明像素的页）
//  ② 每个命中调用地记录 new Error().stack 顶层帧 → 找出第二绘制函数名
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24e=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const summon668 = () => page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div').click();
  g.summonPanel?.close();
});
const healPlayer = () => page.evaluate(() => {
  const p = window.__swGame.player;
  p.dead = false; p.hp = p.maxHp ?? 500; p.iframes = 120;
  if ('statLife' in p) p.statLife = p.statLifeMax ?? 500;
});

const R = {};
await summon668();
await healPlayer();
await wait(600);
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  const p = g.player;
  p.x = e.x + e.w / 2 - p.w / 2 + 60;
  p.y = e.y + e.h - p.h - 2; p.vx = 0; p.vy = 0;
  e.ai0 = 1; e.ai1 = 10; e.vx = 0; e.lai3 = 0;
  if (g.scene) g.scene.zoneSnow = true;
  window.__spy = { on: true, hits: [] };
});
for (let i = 0; i < 5; i++) { await healPlayer(); await wait(120); }

// 安装全帧 drawImage 间谍（在 rAF 之后的一帧内收集,按源 canvas 聚合 + 抓栈）
const spySetup = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  // NPC_668 原图
  const img668 = r.atlas.ensureVImage('vanilla/NPC_668.png');
  const w = window.__spy = { on: true, hits: [], img668, frames: 0, done: false };
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  proto.drawImage = function (src, ...rest) {
    if (w.on && src === w.img668) {
      const stack = (new Error().stack || '').split('\n').slice(2, 8).map((s0) => s0.trim().replace(/^at /, '').replace(/\/src\//, '')).join(' <- ');
      w.hits.push({ sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3], dx: Math.round(rest[5] ?? rest[1]), stack });
      if (w.hits.length > 200) w.on = false;
    }
    return origDraw.call(this, src, ...rest);
  };
  return { ok: true, hasImg: !!img668 };
});
await wait(700);
R.spy = await page.evaluate(() => {
  const w = window.__spy;
  const proto = CanvasRenderingContext2D.prototype;
  // 恢复：通过重装原始方法不可行(未存引用)——直接摘 spy 旗标即可,包一层 no-op 开销可接受
  w.on = false;
  return { n: w.hits.length, hits: w.hits.slice(0, 40), hasImg: !!w.img668 };
});
console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();

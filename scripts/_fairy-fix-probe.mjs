// 仙灵 583-585 修复实机验证（2026-09-02）：帧速 4t/倾斜 vx×0.1/反翻镜像/
// 呼吸尘 278/GetAlpha 半白/引导态 ai2=2 存活。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});

// ① 引导态存活:直生 583 预置 ai2=2 → 跑 AI 若干 tick,ai2 不得被 aiInit 清回 0
const guide = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  g.entities.enemies.length = 0;
  const f = Enemy.fromVanilla(583, g.player.cx + 120, g.player.cy - 60);
  f.ai2 = 2;                                    // VanillaSpawner.ts:2448 野生预置
  f.id = g.entities.nextId++;
  g.entities.enemies.push(f);
  const before = f.ai2;
  await new Promise((r) => setTimeout(r, 800)); // ~48 tick
  return { before, after: f.ai2, noTileCollide: f.noTileCollide };
});
console.log('引导态:', JSON.stringify(guide));

// ② 镜像/倾斜/呼吸尘:清场放一只,先右飞后左飞各采样
const mirror = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  g.entities.enemies.length = 0;
  const f = Enemy.fromVanilla(584, g.player.cx, g.player.cy - 80);
  f.id = g.entities.nextId++;
  g.entities.enemies.push(f);
  const dustCount = () => (g.vanillaDust ? g.vanillaDust.pool.filter((d) => d.active && d.type === 278).length : -1);
  const sample = () => ({ vx: +f.vx.toFixed(2), facing: f.facing, visAngle: +((f.visAngle ?? 0) * 180 / Math.PI).toFixed(2), dust: dustCount() });
  f.vx = 3; f.vy = 0;
  await new Promise((r) => setTimeout(r, 700));
  const right = sample();
  f.vx = -3; f.vy = 0;
  await new Promise((r) => setTimeout(r, 700));
  const left = sample();
  // 帧速:观察 animT 与渲染帧号(经 Renderer.vanillaFrameIdx 复算)
  const { vanillaFrameIdx } = await import('/src/render/Renderer.ts');
  const f1 = vanillaFrameIdx(f, 4);
  await new Promise((r) => setTimeout(r, 250));  // ~15t
  const f2 = vanillaFrameIdx(f, 4);
  return { right, left, frameAdvance15t: (f2 - f1 + 4) % 4 };
});
console.log('镜像/倾斜/尘:', JSON.stringify(mirror));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/4a66e745/tmp/fairy-after.png' });
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();

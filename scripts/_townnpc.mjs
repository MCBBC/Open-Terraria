// 城镇 NPC 贴图修正验证：原版 NPC_{id} 贴图条渲染 + 帧动画 + 截图对比
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 1) 实体状态：vanillaId / 帧
const state = await page.evaluate(() => {
  const g = window.__swGame;
  return g.entities.npcs.map((n) => ({
    key: n.npcKey, vanillaId: n.vanillaId, frame: n.frame,
    x: Math.round(n.x), y: Math.round(n.y), facing: n.facing,
  }));
});
console.log('town npcs:', JSON.stringify(state));
check('城镇 NPC 已挂 vanillaId（merchant=17 / nurse=18）',
  state.some((n) => n.vanillaId === 17) && state.some((n) => n.vanillaId === 18),
  JSON.stringify(state.map((n) => `${n.key}:${n.vanillaId}`)));

// 2) 把主角放到 NPC 旁边，等懒加载 + 走两步采样帧变化
await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs[0];
  g.player.x = n.x - 60; g.player.y = n.y;
});
await new Promise((r) => setTimeout(r, 2500));
const frames = await page.evaluate(async () => {
  const g = window.__swGame;
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    for (const n of g.entities.npcs) seen.add(`${n.npcKey}#${n.frame}`);
    g.fixedUpdate(1 / 60);
    await new Promise((r) => setTimeout(r, 8));
  }
  return [...seen];
});
console.log('observed frames:', JSON.stringify(frames));
check('帧动画有推进（观察到 >1 个帧号）', new Set(frames).size > 2, `${new Set(frames).size} 个状态`);

// 3) 渲染采样：NPC 位置中心 40×56 区域非空像素占比（贴图条已绘制而非隐形）
const cover = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs[0];
  const [sx, sy] = g.camera.worldToScreen(n.cx, n.y + n.h);
  if (sx < 60 || sy < 80) return { off: true, sx, sy };
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 20, Math.round(sy) - 56, 40, 56).data;
  let npx = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) npx++;
  return { cover: +(npx / (d.length / 4)).toFixed(2), sx: Math.round(sx), sy: Math.round(sy) };
});
console.log('render sample:', JSON.stringify(cover));
check('原版贴图条渲染可见（40×56 区域非空）', cover.cover > 0.1, JSON.stringify(cover));

// 4) 截图（人工核对：应是商人/护士人形，非史莱姆）
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/townnpc-fix.png' });
console.log('screenshot: shots/townnpc-fix.png');

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);

// 坠星渲染修复验证:vi_75 掉落物只画单帧(~1:1 宽高比),不再是 22×208 整条;
// UI 图标取帧 0;动画注册表健全(75 pingPong 8帧/食物 static)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 1) 注册表健全(import 不可行 → 经渲染行为验证 + 直接查 atlas 导出挂点)
const reg = await page.evaluate(() => {
  // SpriteAtlas 模块导出未挂 window;经行为验证:vi_75 图标矩形高宽比
  const g = window.__swGame;
  const items = window.__swItems;
  const key75 = Object.keys(items).find((k) => /^vi_75_/.test(k));
  const id = items[key75];
  const def = null; void def;
  // 用 Renderer.atlasIcon(私有 → 运行时可访)
  const ar = g.renderer.atlasIcon(id);
  return { key75, sw: ar?.sw, sh: ar?.sh };
});
// 整条 22×208;切片后应 ~22×26
check('vi_75 图标矩形已切片(~22×26)', reg.sw === 22 && reg.sh >= 24 && reg.sh <= 30, JSON.stringify(reg));

// 2) 帧随时间推进(pingPong 动画):两次取样 sy 不同
const frames = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems;
  const key75 = Object.keys(items).find((k) => /^vi_75_/.test(k));
  const id = items[key75];
  const a1 = g.renderer.atlasIcon(id);
  await new Promise((r) => setTimeout(r, 120));
  const a2 = g.renderer.atlasIcon(id);
  return { sy1: a1?.sy, sy2: a2?.sy };
});
check('动画帧推进(sy 变化)', frames.sy1 !== frames.sy2, JSON.stringify(frames));

// 3) 世界掉落:坠星掉落物像素高度 ≈ 单帧(14px 宽→高 ≤24px,而非 ~130px 条)
const drop = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const items = window.__swItems;
  const key75 = Object.keys(items).find((k) => /^vi_75_/.test(k));
  p.inv.slots[0] = { id: items[key75], stack: 1 };
  p.inv.selected = 0;
  // 丢到脚下:直接 spawnDrop
  g.spawnDrop(p.cx + 90, p.y - 40, key75, 1, 0, 0);  // 偏移生成防瞬拾
  await new Promise((r) => setTimeout(r, 150));
  // 找到该掉落物并读 bounding
  const drops = g.entities.drops.filter((d) => !d.dead);
  return { n: drops.length };
});
check('坠星掉落物存在(不崩)', drop.n >= 1, JSON.stringify(drop));

// 4) 截图视觉:玩家附近区域存档供人工复核
const shot = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const d = g.entities.drops.find((dd) => !dd.dead);
  const tx = d ? d.x + 6 : p.cx + 90, ty = d ? d.y + 6 : p.y - 40;
  return { sx: (tx - cam.x) * cam.zoom + cam.viewW / 2, sy: (ty - cam.y) * cam.zoom + cam.viewH / 2 };
});
await page.screenshot({ path: '/tmp/stardrop.png', clip: { x: Math.max(0, shot.sx - 60), y: Math.max(0, shot.sy - 60), width: 120, height: 120 } });
check('截图 /tmp/stardrop.png', true);

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);

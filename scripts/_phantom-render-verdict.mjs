// 幻影弓渲染定谳:直构载体(速度已证正确)置天空,瞄准纯左平射,截图看箭 sprite 朝向
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
// 关欢迎弹窗(真鼠标点击按钮)
await page.mouse.click(680, 694);
await new Promise(r => setTimeout(r, 600));
await page.mouse.click(680, 694);
await new Promise(r => setTimeout(r, 600));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const p = g.player;
  // 玩家放天空开阔处(找地表上方)
  const st = g.world.store;
  let skyX = Math.floor(p.cx / 16), surfY = 0;
  for (let y = 5; y < st.h; y++) { if (st.isSolid(skyX, y)) { surfY = y; break; } }
  p.x = skyX * 16; p.y = (surfY - 12) * 16; p.vx = 0; p.vy = 0;
  for (const e of g.entities.projectiles) e.dead = true;
  const carrier = new Arrow(p.cx, p.cy, 0, 0, 50, 2, 630, null, { grav: 0 });
  carrier.ph630Ctl = {
    channel: () => true,
    aim: () => ({ x: p.cx - 300, y: p.cy }),        // 纯左水平
    volley: () => ({ pid: 1, dmg: 10, kb: 0, speed: 14 }),
  };
  g.entities.add(carrier, 'projectiles');
  // 相机跟玩家
  for (let t = 0; t < 4; t++) g.fixedUpdate(1 / 60);
  const shots = [];
  // 首轮齐射箭飞到 40-120px 左侧时截图
  for (let t = 0; t < 10; t++) {
    g.fixedUpdate(1 / 60);
    const arrs = [];
    for (const e of g.entities.projectiles) {
      if (!e.dead && e.projId === 1) arrs.push({ x: Math.round(e.cx - carrier.cx), y: Math.round(e.cy - carrier.cy), vx: +e.vx.toFixed(1), age: e.age });
    }
    if (arrs.length && arrs.some(a => a.x < -30 && a.x > -140)) {
      // 动态取第一支箭屏幕坐标供特写
      const first = g.entities.projectiles.find(e => !e.dead && e.projId === 1);
      const [asx, asy] = g.camera.worldToScreen ? g.camera.worldToScreen(first.cx, first.cy) : [680, 400];
      g._arrowScreen = { sx: Math.round(asx), sy: Math.round(asy) };
      shots.push({ t, arrs, carrierVx: +carrier.vx.toFixed(1), screen: g._arrowScreen });
      break;
    }
  }
  g.render?.(1 / 60);
  const img = document.querySelector('canvas').toDataURL('image/png');
  return { shots, img };
});
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/phantom-frozen.png', Buffer.from(out.img.split(',')[1], 'base64'));
console.log('RENDER=' + JSON.stringify(out.shots));
await page.screenshot({ path: '/tmp/phantom-render.png' });
const zc = out[0]?.screen ?? { sx: 680, sy: 400 };
await page.screenshot({ path: '/tmp/phantom-zoom.png', clip: { x: Math.max(0, zc.sx - 160), y: Math.max(0, zc.sy - 90), width: 320, height: 180 } });
await browser.close();

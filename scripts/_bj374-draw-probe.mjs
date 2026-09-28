// BJ374 视觉探针:712 出膛弹实际绘制尺寸+canvas 截图(私有实例 5201)
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ374V');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { slices: [], shots: [], storm: null };
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_3852_`];
  g.player.inv.slots[2] = { id, stack: 1 };
  g.player.inv.selected = 2;
  const p = g.player;
  const sy = g.world.groundLevel;
  const px = Math.floor(p.x / TILE);
  const SKY = sy - 120;                        // 天空场地(避开浮岛层)
  const pinP = () => { p.x = px * TILE; p.y = SKY * TILE - p.h; p.vx = 0; p.vy = 0; };
  pinP();
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  for (let i = 0; i < 8; i++) { pinP(); g.fixedUpdate(1 / 60); }
  p.useTime = 0; p.itemTime = 0;

  // 1) projFrameImg 切片实测（等贴图异步加载:数个 rAF 轮询）
  const { projFrameImg, projSprite, projFrameCount } = await import('/src/entities/Arrow.ts');
  let img = projSprite(712);
  for (let i = 0; i < 40 && !img; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    img = projSprite(712);
  }
  R.sheetSize = img ? [img.width, img.height] : null;
  R.frames = projFrameCount(712);
  for (const k of [0, 3, 7]) {
    const c = projFrameImg(712, k);
    R.slices.push({ k, w: c?.width, h: c?.height });
  }

  // 2) 实射一窗 → 弹幕盒尺寸+截图
  const aim = (wx, wy) => {
    const [sx, syp] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = syp / (g.renderer.dpr || 1);
  };
  pinP();
  aim(p.cx + 120, p.cy - 300);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 3; i++) { pinP(); g.fixedUpdate(1 / 60); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (const q of g.entities.projectiles) {
    if (q.projId === 712) R.shots.push({ x: Math.round(q.x), y: Math.round(q.y), w: q.w, h: q.h, a: q.alpha, frame: q.f712Frame });
  }
  // 3) 右键风暴一发 → 等贴图 → 2 拍后截图(程序化叠层螺旋视觉复验)
  let img704 = null;
  for (let i = 0; i < 40 && !img704; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    img704 = (await import('/src/entities/Arrow.ts')).projSprite(704);
  }
  R.storm = img704 ? { sheet: [img704.width, img704.height] } : null;
  p.useTime = 0; p.itemTime = 0; p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;
  g.input.rightDown = true;
  for (let i = 0; i < 3; i++) { pinP(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
  g.input.rightDown = false;
  const st = g.entities.projectiles.find((q) => q.projId === 704);
  R.stormSpawn = st ? { x: Math.round(st.x), y: Math.round(st.y), t: st.t } : null;
  // 等 rAF 让渲染循环把风暴画上屏(风暴寿命 300t=5s,数帧内可见)
  for (let i = 0; i < 18; i++) await new Promise((r) => requestAnimationFrame(r));
  R.stormLive = st ? { x: Math.round(st.cx), y: Math.round(st.cy), t: st.t, dead: st.dead } : null;
  R.playerScreen = g.camera.worldToScreen(p.cx, p.cy).map(Math.round);

  // 4) 截图:画布中弹幕区域(toDataURL 裁剪不便,直接整帧)
  const cv = g.renderer.canvas;
  R.shot = cv.toDataURL('image/png');
  return R;
});
const fs = await import('node:fs');
fs.writeFileSync('/tmp/bj374-frame.png', Buffer.from(out.shot.split(',')[1], 'base64'));
delete out.shot;
console.log(JSON.stringify(out, null, 1));
await browser.close();

// 蚁狮渲染复现：刷 69 于沙面 → 截图 + dump 位置/帧/渲染矩形
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 140)));
const clickRetry = async (sel, tries = 10) => {
  for (let i = 0; i < tries; i++) {
    try {
      await page.waitForSelector(sel, { timeout: 8000, visible: true });
      await page.click(sel);
      return;
    } catch (e) { await new Promise(r => setTimeout(r, 900)); }
  }
  throw new Error('click failed: ' + sel);
};
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await clickRetry('[data-act=sp]');
for (let i = 0; i < 10 && !(await page.$('.sw-vsel')); i++) {
  await new Promise(r => setTimeout(r, 900));
  try { await page.click('[data-act=sp]'); } catch {}
}
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await clickRetry('.sw-char-row input[type=text]');
  await page.keyboard.type('蚁狮');
  await new Promise(r => setTimeout(r, 200));
  await clickRetry('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await clickRetry('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await clickRetry('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  // drawImage 挂钩：抓 NPC_69 源矩形的实际绘制参数（sx/sy/sw/sh/dst）
  if (!window.__swImgHook) {
    window.__swImgHook = [];
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    window.__swImgHookSrcs = [];
    proto.drawImage = function (img, ...rest) {
      try {
        // 9 参源切片绘制：小尺寸源帧（NPC 族），记录源图尺寸+切片
        if (rest.length === 9 && rest[2] <= 60 && rest[3] <= 90) {
          window.__swImgHook.push({
            iw: img.width, ih: img.height,
            sx: rest[0], sy: rest[1], sw: rest[2], sh: rest[3],
            dx: Math.round(rest[4]), dy: Math.round(rest[5]), dw: rest[6], dh: rest[7],
          });
          if (window.__swImgHook.length > 60) window.__swImgHook.shift();
        }
      } catch {}
      return orig.apply(this, [img, ...rest]);
    };
  }
  const p = g.player;
  // ① 先把玩家挪到屏幕左下对齐的位置（相机跟随），欢迎弹窗只盖中上部
  const px0 = Math.floor(p.cx / 16), py0 = Math.floor(p.cy / 16);
  g.player.x = (px0 - 8) * 16; g.player.y = (py0 - 1) * 16;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  // ② 空中生成：玩家旁上空 8 格，无地板（掉落全程观察）
  const cam = g.camera, z = cam.zoom || 1;
  const dpr = g.renderer.dpr || 1;
  const wx = cam.x + (250 - 494) / z;
  const wy = cam.y + (300 - 431) / z;
  const gx = Math.floor(wx / 16), gy = Math.floor(wy / 16);
  for (let x = gx - 2; x < gx + 3; x++) for (let y = gy - 1; y < gy + 4; y++) g.world.store.setTile(x, y, 0);
  const e = g.spawnNpcByVanilla(69, wx, wy);
  if (!e) return { fail: 'spawn failed' };
  // 贴图懒载预热（1200ms）
  await new Promise(r => setTimeout(r, 1200));
  const fr0 = g.renderer.atlas.vnpc(69, 0);
  const fr4 = g.renderer.atlas.vnpc(69, 4);
  // 掉落 90 tick
  for (let i = 0; i < 90; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  const meta = g.renderer.atlas.vnpc(69, e.frame ?? 0);
  const bm = g.renderer.atlas.vimages ? g.renderer.atlas.vimages.get('vanilla/NPC_69.png') : null;
  return {
    cx: Math.round(e.cx), cy: Math.round(e.cy), y: Math.round(e.y), w: e.w, h: e.h,
    frame: e.frame, visAngle: Math.round((e.visAngle ?? 0) * 100) / 100,
    fr0: fr0 ? [fr0.sw, fr0.sh] : null,
    fr4: fr4 ? [fr4.sw, fr4.sh, fr4.sx, fr4.sy] : null,
    metaFrame: meta ? [meta.sw, meta.sh, meta.sx, meta.sy] : null,
    bmSize: bm ? [bm.width, bm.height] : null,
    screen: { sx: Math.round((e.cx - cam.x) * z + 494), sy: Math.round((e.cy - cam.y) * z + 431) },
    hook: (window.__swImgHook || []).slice(-8),
  };
});
console.log(JSON.stringify(res));
// 关欢迎弹窗（挡住蚁狮）+ 等"资源加载中"徽标消失（世界渲染就绪）
await page.evaluate(() => {
  const all = [...document.querySelectorAll('button')];
  const ok = all.find((b) => /我知道了/.test(b.textContent || ''));
  if (ok) ok.click();
  const heads = [...document.querySelectorAll('div')].filter((d) => /欢迎来到 SandboxWorld/.test(d.textContent || '') && d.children.length > 0);
  for (const h of heads) {
    let el = h;
    while (el.parentElement && el.parentElement !== document.body) el = el.parentElement;
    el.remove();
  }
});
for (let i = 0; i < 60; i++) {
  const loading = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div, span')];
    return els.some((d) => /资源加载中/.test(d.textContent || '') && d.children.length <= 4);
  });
  if (!loading) break;
  await new Promise(r => setTimeout(r, 1000));
}
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/antlion-render.png' });
await browser.close();

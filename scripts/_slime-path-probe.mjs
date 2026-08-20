// 绿史莱姆渲染路径诊断:vnpc 是否命中/atlas 状态/采样基准修正
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 280000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ren = g.renderer;
  const r0 = ren.atlas ? ren.atlas.vnpc(1, 0) : 'NO_ATLAS';
  const r1 = ren.atlas ? ren.atlas.vnpc(1, 1) : null;
  const meta = ren.atlas ? ren.atlas.vnpcMeta(1) : null;
  // 画布与相机基准
  const cv = ren.canvas;
  const cam = g.camera;
  const [cx0, cy0] = cam.worldToScreen(g.player.cx, g.player.cy);
  const ctx = cv.getContext('2d');
  const center = ctx.getImageData(cv.width >> 1, cv.height >> 1, 3, 3).data;
  const atPlayer = ctx.getImageData(Math.round(cx0) - 1, Math.round(cy0) - 1, 3, 3).data;
  // enemySprites(程序化兜底素材)
  const spr = ren.assets?.enemySprites?.get('slime') ?? null;
  const sprInfo = spr ? { fw: spr.fw, fh: spr.fh, w: spr.canvas?.width, h: spr.canvas?.height } : null;
  const slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead) ?? null;
  return {
    canvasSize: [cv.width, cv.height],
    dpr: window.devicePixelRatio,
    zoom: cam.zoom,
    camPos: [Math.round(cam.x), Math.round(cam.y)],
    playerScreen: [Math.round(cx0), Math.round(cy0)],
    centerPx: Array.from(center.slice(0, 12)),
    atPlayerPx: Array.from(atPlayer.slice(0, 12)),
    atlasNull: !ren.atlas,
    vnpc0: r0 && r0 !== 'NO_ATLAS' ? { sx: r0.sx, sy: r0.sy, sw: r0.sw, sh: r0.sh, imgW: r0.img?.width, imgH: r0.img?.height } : String(r0),
    vnpc1: r1 ? { sy: r1.sy, sh: r1.sh } : null,
    vnpcMeta: meta,
    slimeKey: slime?.key ?? null,
    slimeFrames: slime?.vanilla?.frames ?? null,
    slimeAnimT: slime ? Math.round(slime.animT) : null,
    sprInfo,
    tintSize: ren.tintAtlas?.size ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);

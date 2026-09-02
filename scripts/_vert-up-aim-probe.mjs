// 垂直向上持枪不对称取证（蓝队 2026-09-02）：
//   A) 隔离台：真实 renderer + 真实 atlas，直调 drawUseItem(facing/aim 四向)，
//      仪器 ctx 记录 translate/rotate/drawImage + 像素读回武器包围盒
//   B) 实机：真实输入链（mouseDown + 鼠标钉在玩家头顶正上）开火，
//      截屏差分（挥击帧 vs 静息帧）隔离枪像素，量头顶区枪体左右缘 vs 玩家中线
//      + 首枚火箭出生点 x（resolveShotAnchor 同源）
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { PNG } from '/Users/vinlic/Project/GLM/SandboxWorld/game/node_modules/pngjs/lib/png.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
// 音频门吃首击（menu-boot 惯例）：先预点一次再正式进
await page.click('[data-act=sp]').catch(() => {});
await new Promise(r => setTimeout(r, 600));
await page.click('[data-act=sp]');
try {
  await page.waitForSelector('.sw-list-panel', { timeout: 12000 });
} catch {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-list-panel', { timeout: 12000 });
}
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('vertup');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2000));

// ---------- A) 隔离台 ----------
const partA = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const id759 = ITEM_BY_KEY['vi_759_火箭发射器'];
  const out = { id759 };
  const mk = () => {
    const log = { translate: [], rotate: [], scale: [], drawImage: [] };
    const ctx = {
      save: () => {}, restore: () => {},
      translate: (a, b) => log.translate.push([a, b]),
      scale: (a, b) => log.scale.push([a, b]),
      rotate: (a) => log.rotate.push(a),
      drawImage: (...args) => log.drawImage.push(args.slice(4, 8)),
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    };
    return { ctx, log };
  };
  // 画布读回（真实 atlas 路径 → 真实贴图像素包围盒）
  const measure = (ctx, W, H) => {
    const d = ctx.getImageData(0, 0, W, H).data;
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    return maxx < 0 ? null : { minx, maxx, miny, maxy, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx + 1, h: maxy - miny + 1 };
  };
  const W = 400, H = 400;
  const PCX = 200, PCY = 200;
  const dirs = [
    ['right', 1, 0], ['up', 1, -Math.PI / 2], ['down', 1, Math.PI / 2], ['left', -1, Math.PI],
  ];
  out.cases = {};
  for (const [name, facing, aim] of dirs) {
    const { ctx, log } = mk();
    const cvs = ctx.canvas = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const c2 = cvs.getContext('2d', { willReadFrequently: true });
    // 重新挂仪器（getContext 返回的才是真 ctx）
    const log2 = { translate: [], rotate: [], scale: [], drawImage: [] };
    const t = c2.translate.bind(c2), ro = c2.rotate.bind(c2), sc = c2.scale.bind(c2), di = c2.drawImage.bind(c2);
    c2.translate = (a, b) => { log2.translate.push([a, b]); t(a, b); };
    c2.rotate = (a) => { log2.rotate.push(a); ro(a); };
    c2.scale = (a, b) => { log2.scale.push([a, b]); sc(a, b); };
    c2.drawImage = (...args) => { log2.drawImage.push(args.slice(4, 8).map(Math.round)); di(...args); };
    const p = { cx: PCX, cy: PCY, x: PCX - 8, y: PCY - 21, w: 16, h: 42, facing, gravDir: 1,
      equipStats: {}, ridingMount: false, mount: { type: -1 }, sleeping: false, miscCounter: 0 };
    const swing = { t: 20, dur: 30, item: id759, useStyle: 5, aim };
    g.renderer.drawUseItem(c2, p, swing, null);
    const bb = measure(c2, W, H);
    out.cases[name] = {
      facing, aimDeg: Math.round(aim * 180 / Math.PI),
      pivot: log2.translate[0], rot: log2.rotate.map(v => +v.toFixed(4)), mirror: log2.scale,
      drawDest: log2.drawImage[0],
      bbox: bb && { minx: bb.minx, maxx: bb.maxx, miny: bb.miny, maxy: bb.maxy, cx: +bb.cx.toFixed(1), cy: +bb.cy.toFixed(1), w: bb.w, h: bb.h },
      centerOffsetFromPivot: bb ? +(bb.cx - log2.translate[0][0]).toFixed(1) : null,
    };
  }
  // 出膛锚（弹侧权威）四向
  const R = await import('/src/render/Renderer.ts');
  out.tips = {};
  for (const [name, , aim] of dirs) {
    out.tips[name] = R.heldItemTipWorld(200, 200, name === 'left' ? -1 : 1, aim, 759, 52, 22);
  }
  return out;
});
console.log('PART-A:', JSON.stringify(partA, null, 1));

// ---------- B) 实机 ----------
const partB = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const id759 = ITEM_BY_KEY['vi_759_火箭发射器'];
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id: id759, stack: 99 };
  p.inv.selected = 0;
  p.vx = 0; p.vy = 0; p.useTime = 0;
  // 岩浆台面防摔（就地站立即可）
  const frozen = g.world.clock; void frozen;
  const res = { shots: [] };
  // 关掉 HUD 干扰读数（保留世界渲染）
  const cvs = g.renderer.canvas;
  const shot = async () => cvs.toDataURL('image/png');
  // 静息基线
  g.input.mouseDown = false;
  await new Promise(r => setTimeout(r, 700));
  const base = await shot();
  for (const dir of ['up', 'down', 'right']) {
    // 鼠标钉在玩家中心正上/下/右 300px（世界系）
    const [sx, sy] = g.camera.worldToScreen(p.cx, p.cy);
    const off = dir === 'up' ? [sx, sy - 400] : dir === 'down' ? [sx, sy + 400] : [sx + 400, sy];
    g.input.mouseX = off[0]; g.input.mouseY = off[1];
    p.useTime = 0;
    if (g.swing) g.swing.t = 0;
    g.input.mouseDown = true;
    await new Promise(r => setTimeout(r, 120));
    const aimSeen = g.swing ? g.swing.aim : null;
    const projs = g.entities.projectiles.filter(e => !e.dead);
    const first = projs[projs.length - 1];
    res.shots.push({
      dir, facing: p.facing,
      aimDeg: aimSeen == null ? null : Math.round(aimSeen * 180 / Math.PI),
      pivotSeen: null,
      playerCx: +p.cx.toFixed(1), playerCy: +p.cy.toFixed(1),
      mouse: [g.input.mouseX, g.input.mouseY],
      proj: first ? { x: +first.x.toFixed(1), y: +first.y.toFixed(1), vx: +first.vx.toFixed(2), vy: +first.vy.toFixed(2) } : null,
      png: await shot(),
    });
    g.input.mouseDown = false;
    if (g.swing) g.swing.t = 0;
    p.useTime = 0;
    await new Promise(r => setTimeout(r, 400));
    // 清场弹
    for (const e of g.entities.projectiles) e.dead = true;
  }
  res.basePng = base;
  res.screenCenter = g.camera.worldToScreen(p.cx, p.cy);
  return { ...res, basePng: undefined, base: undefined };
});
// 截屏数据量太大，只打印元信息 + 落盘
const shotDir = '/tmp/vertup-probe';
writeFileSync(shotDir + '-meta.json', JSON.stringify({ ...partB, shots: partB.shots.map(s => ({ ...s, png: undefined })) }, null, 1));
let i = 0;
for (const s of partB.shots) writeFileSync(`${shotDir}-shot${i++}-${s.dir}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
console.log('PART-B meta:', JSON.stringify({ ...partB, shots: partB.shots.map(s => ({ ...s, png: undefined })) }, null, 1));
console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
await browser.close();

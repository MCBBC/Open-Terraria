// ★BJ647-B v15：旗帜黑底名条「字灭」复现——夜晚/清晨 vs 白天，鼠标悬旗布矩形。
// 假说：名条画在世界层内（Renderer.ts:6585），后续 compositeLight 光照乘盖全屏——
// 暗环境白字被乘暗=「文字消失只剩黑框」；原版 DrawInterface_7=UI 层无光直绘。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/十周年纪念种子(2).wld';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  defaultViewport: { width: 1512, height: 862, deviceScaleFactor: 1 },
  args: ['--window-size=1530,960', '--window-position=30,30'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  const ready = await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子'
      && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.options?.data && 'gameZoom' in g.options.data) g.options.data.gameZoom = 1.24;
  g.camera.zoom = 1.24; g.camera.zoomTarget = 1.24;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  window.__bjAnchor = { x: n.cx, y: n.cy };
  g.player.x = n.cx - 50; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 150);
  // hook：抓 UI_House_Banner 贴图 drawImage 落点（旗布中心）
  if (!window.__hooked) {
    window.__hooked = true;
    const DI = CanvasRenderingContext2D.prototype.drawImage;
    void DI;
    window.__bannerPos = [];
    const FR = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      const f = String(this.fillStyle);
      if (f.includes('20, 16, 28') || f.includes('20,16,28')) {
        if (window.__bannerPos.length < 8) window.__bannerPos.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), kind: 'label-bg' });
      }
      return FR.call(this, x, y, w, h);
    };
    CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
      if (rest.length >= 8 && Math.round(rest[2]) === 34 && Math.round(rest[3]) === 42) {
        if (window.__bannerPos.length < 8) window.__bannerPos.push({ x: Math.round(rest[4]), y: Math.round(rest[5]), w: Math.round(rest[6]), h: Math.round(rest[7]), kind: 'cloth' });
      }
      return DI.call(this, img, ...rest);
    };
    window.__bannerPos = [];
  }
});
await new Promise((r) => setTimeout(r, 1200));
const probe = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
  const bp = window.__bannerPos[0];
  const wx = bp ? bp.x + bp.w / 2 : null, wy = bp ? bp.y + bp.h / 2 : null;
  return {
    bannerWorld: bp ? { cx: wx, cy: wy } : null,
    bannerScreen: bp ? { sx: Math.round((wx - cam.x) * z + cw / 2), sy: Math.round((wy - cam.y) * z + ch / 2) } : null,
    camY: cam.y,
  };
});
console.log('banner hook pos:', JSON.stringify(probe));
// 网格扫描：NPC 头顶 ±3 格逐点 hover，hook 抓黑框 fillRect 锁旗布矩形
const scan = await page.evaluate(async () => {
  const g = window.__swGame;
  const cam = g.camera, z = cam.zoom ?? 1;
  const cw = g.renderer.canvas.clientWidth ?? 1512, ch = g.renderer.canvas.clientHeight ?? 862;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const hits = [];
  for (let dy = -6; dy <= -1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const wx = window.__bjAnchor.x + dx * 16 + 8, wy = window.__bjAnchor.y + dy * 16 + 8;
      const sx = Math.round((wx - cam.x) * z + cw / 2), sy = Math.round((wy - cam.y) * z + ch / 2);
      window.__bannerPos.length = 0;
      // 鼠标经 CDP 移由外层做——这里只记录候选格
      hits.push({ sx, sy, dx, dy });
    }
  }
  return hits;
});
console.log('scan candidates:', scan.length);
let locked = null;
for (const c of scan) {
  await page.mouse.move(c.sx, c.sy);
  await new Promise((r) => setTimeout(r, 90));
  const got = await page.evaluate(() => window.__bannerPos[0] ?? null);
  if (got) { locked = { ...c, box: got }; break; }
}
console.log('locked banner box:', JSON.stringify(locked));
if (!locked) { console.log('no banner hover found — skip'); await browser.close(); process.exit(0); }
const bannerTarget = { bannerScreen: { sx: locked.sx, sy: locked.sy } };
const fs = await import('node:fs');
// 两态对比
for (const [tag, tod] of [['night', 0.02], ['dawn', 0.005], ['day', 0.5]]) {
  void bannerTarget;
  await page.evaluate((tod) => { window.__swGame.world.clock.timeOfDay = tod; }, tod);
  await new Promise((r) => setTimeout(r, 700));
  await page.mouse.move(bannerTarget.bannerScreen.sx, bannerTarget.bannerScreen.sy);
  await new Promise((r) => setTimeout(r, 500));
  const shot = await page.screenshot({ clip: { x: Math.max(0, bannerTarget.bannerScreen.sx - 110), y: Math.max(0, bannerTarget.bannerScreen.sy - 60), width: 240, height: 110 } });
  fs.writeFileSync(`/tmp/bj647-v15-banner-${tag}.png`, shot);
  // 字区像素统计（名条文字带=旗上方 20px 带）
  const stat = await page.evaluate(({ sx, sy }) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas ?? document.querySelector('canvas');
    const o = document.createElement('canvas');
    o.width = 160; o.height = 24;
    const c = o.getContext('2d', { willReadFrequently: true });
    c.drawImage(cv, sx - 80, sy - 52, 160, 24, 0, 0, 160, 24);
    const d = c.getImageData(0, 0, 160, 24).data;
    let bright = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v > 190) bright++;
      if (v < 50) dark++;
    }
    return { bright, dark };
  }, bannerTarget.bannerScreen);
  console.log(tag, 'textband bright/dark px:', JSON.stringify(stat));
}
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();

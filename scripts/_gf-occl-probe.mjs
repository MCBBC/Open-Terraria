// 一次性:蓄力冰矛遮挡像素测试——冰矛精灵轴穿过躯干,逐点采样判定在上/在下
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60; g.input.mouseY = sy - 60;   // 鼠标右上:冰矛轴穿过躯干
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await sleep(900);   // charge≈30+,冰矛已生长
const res = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const cv = r.canvas;
  const ctx = cv.getContext('2d');
  const orb = (g.entities?.all?.() ?? []).find((e) => e && e.projId === 1115);
  if (!orb) return { err: 'no orb' };
  const [psx, psy] = g.camera.worldToScreen(orb.cx, orb.cy);
  // 冰矛精灵 = 40 宽 × (img.height/3) 高,绕中心转 velocity+π/2;沿其长轴采样 9 点
  const ang = Math.atan2(orb.vy, orb.vx) + Math.PI / 2;
  const half = 20;   // 轴向半长(≈帧高一半)
  const samples = [];
  for (let d = -half; d <= half; d += 5) {
    const x = Math.round(psx + Math.cos(ang) * d);
    const y = Math.round(psy + Math.sin(ang) * d);
    const px = ctx.getImageData(x, y, 1, 1).data;
    // 冰矛贴图色:浅蓝/白(蓝通道显著高、亮度高);躯干=皮肤/衣色
    const isIcy = px[2] > 120 && px[2] >= px[0] + 20 && px[1] > 60;
    samples.push({ d, x, y, rgb: [px[0], px[1], px[2]], icy: isIcy });
  }
  // 躯干中心点(冰矛轴必经):玩家盒中心屏幕位
  const [pcx, pcy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  const cpx = ctx.getImageData(Math.round(pcx), Math.round(pcy), 1, 1).data;
  return {
    orbScreen: { x: Math.round(psx), y: Math.round(psy) },
    playerScreen: { x: Math.round(pcx), y: Math.round(pcy) },
    torsoPx: [cpx[0], cpx[1], cpx[2]],
    samples
  };
});
console.log('OCCLUSION:', JSON.stringify(res, null, 1));
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-occl.png', clip: (() => {
  const s = res; return { x: Math.max(0, s.playerScreen.x - 70), y: Math.max(0, s.playerScreen.y - 100), width: 140, height: 160 };
})() });
await b.close();
console.log('DONE');

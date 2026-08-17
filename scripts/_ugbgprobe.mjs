// 地下背景平铺几何探针（蘑菇 style 2 复现 debug-report 场景）:
// 把 drawUnderground 单独画到离屏 canvas(无世界方块/墙干扰),断言:
//  A. 水平 128px 周期:相隔 128px 的两个 64px 列窗逐字节一致(旧 160 整宽平铺必挂)
//  B. 采样窗:绘制内容 == 贴图列 [16+diff, 16+diff+128) 行 [0,96) 逐字节一致
//     (同时证明水平采样偏移与垂直行相位锁定的正确性)
//  C. 深层行相位:bgStartY ≡ rockTP-screenY (mod 96) 且为世界锁定
// 并导出离屏渲染 PNG 供肉眼核对。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout-wait-game' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  const world = g.world;
  const h = world.store.h, w = world.store.w;
  // 深层蘑菇场景:rockLevel+250 处(深层 → slot3 独占屏幕,与报告现场同构)
  const camX = Math.floor(w / 2) * 16;
  const camY = (world.rockLevel + 250) * 16;
  const viewW = 1280, viewH = 800;
  const cam = { x: camX, y: camY };
  // 场景桩:克隆真实 scene,翻 zoneGlowshroom(style 选择只读这些字段)
  const scene = Object.assign({}, g.renderer.scene, {
    zoneGlowshroom: true, tileX: Math.floor(camX / 16), tileY: Math.floor(camY / 16),
  });
  const bg = g.renderer.biomeBg;
  // 预热贴图(懒加载):反复 draw 直到 62-65 全就位
  const cv = document.createElement('canvas');
  cv.width = viewW; cv.height = viewH;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < 200; i++) {
    bg.draw(ctx, world, scene, cam, viewW, viewH, [1, 1, 1], 16.7);
    if ([62, 63, 64, 65].every((n) => (bg.imgs.get(n) ?? null))) break;
    await new Promise((res) => setTimeout(res, 60));
  }
  // 稳态:大 dtMs 一次推满 ugAlpha
  bg.draw(ctx, world, scene, cam, viewW, viewH, [1, 1, 1], 167);
  bg.draw(ctx, world, scene, cam, viewW, viewH, [1, 1, 1], 167);

  // ---- 复刻 scroll() 公式(与实现同式) ----
  const ieeeRem = (a, b) => {
    const r = a / b, f = Math.floor(r), d = r - f;
    const n = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
    return a - b * n;
  };
  const screenX = camX - viewW / 2, screenY = camY - viewH / 2;
  const P = 128, CP = 0.88;
  const startX = Math.trunc(-ieeeRem(P + screenX * CP, P) - P / 2);
  let diff = Math.round(-ieeeRem(startX + screenX, 16));
  if (diff === -8) diff = 8;
  // ---- 复刻 rockTP / bgStartY ----
  const rockSpan = ((world.rockLevel | 0) - (world.groundLevel | 0)) * 16;
  let steps = Math.trunc(rockSpan / 96);
  if (rockSpan % 96 !== 0) steps++;
  const rockTP = (world.groundLevel | 0) * 16 + steps * 96 + 32;
  const bgTopY = rockTP - screenY;
  const startY = Math.trunc(ieeeRem(bgTopY, 96) - 96);   // 深层档
  // 找一整行 slot3:行界 [rowY, rowY+96) 全在屏内
  let rowY = null;
  for (let j = 0; j < 20; j++) {
    const y = startY + 96 * j;
    if (y >= 16 && y + 96 <= viewH - 16) { rowY = y; break; }
  }
  const out = {
    ugStyle: bg.ugStyle, ugAlpha: bg.ugAlpha,
    groundLevel: world.groundLevel, rockLevel: world.rockLevel,
    rockTP, bgTopY, startY, startX, diff, rowY,
    texLoaded: [62, 63, 64, 65].map((n) => bg.imgs.get(n) ? 1 : 0).join(''),
  };
  if (rowY === null) return { ...out, fatal: 'no-full-row' };
  // ---- A:128 周期一致性 ----
  const X0 = Math.max(8, Math.min(startX + P * 3 + diff, viewW - P - 8));
  const win = (x) => ctx.getImageData(x, rowY, 64, 96).data;
  const a1 = win(X0), a2 = win(X0 + 128);
  let aDiff = 0;
  for (let i = 0; i < a1.length; i++) if (a1[i] !== a2[i]) aDiff++;
  out.assertA_128period_identical = aDiff === 0;
  out.assertA_mismatchBytes = aDiff;
  // ---- B:与贴图采样窗逐字节一致 ----
  const im = bg.imgs.get(65);
  const sc = document.createElement('canvas');
  sc.width = 160; sc.height = 96;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(im, 0, 0);
  const texWin = sctx.getImageData(16 + diff, 0, 64, 96).data;
  // 屏上 X0 对应贴图内偏移:X0 - (startX + P*i + diff) ∈ [0,128) → 贴图列 16+diff+off
  const i0 = Math.floor((X0 - diff - startX) / P);
  const off = X0 - (startX + P * i0 + diff);
  const texWin2 = sctx.getImageData(16 + diff + off, 0, 64, 96).data;
  let bDiff = 0;
  for (let i = 0; i < texWin2.length; i++) if (a1[i] !== texWin2[i]) bDiff++;
  out.assertB_texture_window = bDiff === 0;
  out.assertB_mismatchBytes = bDiff;
  out.texOffset = off;
  // ---- C:行相位世界锁定:startY + 96j ≡ rockTP - screenY (mod 96) ----
  out.assertC_phase_locked = (((rowY + screenY - rockTP) % 96) + 96) % 96 === 0;
  // PNG 导出
  out.png = cv.toDataURL('image/png');
  return out;
}, { timeout: 180000 });

if (errors.length) console.log('PAGEERRORS:', errors.slice(0, 5));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};
if (r.fatal) {
  check('探针执行', false, r.fatal);
} else {
  check('ugStyle=2(蘑菇)', r.ugStyle === 2, `got ${r.ugStyle}`);
  check('贴图 62-65 就位', r.texLoaded === '1111', r.texLoaded);
  check('A 水平 128px 周期逐字节一致', r.assertA_128period_identical, `mismatch=${r.assertA_mismatchBytes}`);
  check('B 采样窗==贴图[16+diff..]列', r.assertB_texture_window, `mismatch=${r.assertB_mismatchBytes} off=${r.texOffset}`);
  check('C 垂直行相位世界锁定', r.assertC_phase_locked, `rowY=${r.rowY}`);
  console.log(`INFO: rockTP=${r.rockTP} bgTopY=${r.bgTopY} startY=${r.startY} startX=${r.startX} diff=${r.diff} gl=${r.groundLevel} rl=${r.rockLevel}`);
  if (r.png) {
    const b64 = r.png.split(',')[1];
    writeFileSync('/tmp/ugbg-mushroom.png', Buffer.from(b64, 'base64'));
    console.log('PNG: /tmp/ugbg-mushroom.png');
  }
}
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);

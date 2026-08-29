// EoS(6) 精灵-物理盒锚点定量探针 v2（冻结位差分 + 红眼行锚）：
// 地下密闭房间 → fromVanilla(6) 落稳 30t → 冻结速度 → 差分抓精灵包围盒与红眼行 →
// 与「帧中心锚」预测行（cy - frameH/2 + 帧行）对比 → 锚点偏差量。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'eos-box');
  // 天区：不放地块（EoS 高空满亮度,红眼在蓝天上可红滤检出）
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  document.getElementById('sw-boot-prime')?.remove();
  const g = window.__swGame;
  g.paused = true;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.x = 47 * 16; g.player.y = 93 * 16;
  for (let a = 0; a < g.player.inv.armor.length; a++) g.player.inv.armor[a] = null;
  for (let a = 0; a < g.player.inv.miscEquips.length; a++) g.player.inv.miscEquips[a] = null;
  for (let a = 0; a < g.player.inv.miscDyes.length; a++) g.player.inv.miscDyes[a] = null;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const eos = Enemy.fromVanilla(6, 56 * 16, 95 * 16);
  g.entities.add(eos, 'enemies');
  for (let i = 0; i < 30; i++) {
    eos.visAngle = 0; g.fixedUpdate(1 / 60); eos.visAngle = 0;
  }
  // 冻结（AI 随机游走从此不再位移）
  eos.vx = 0; eos.vy = 0;
  const cv = g.renderer.canvas;
  const z = g.camera.zoom;
  // 窗口钉在冻结位（盒中心 ±64px）
  const [bcx, bcy] = g.camera.worldToScreen(eos.cx, eos.cy);
  const x0 = Math.max(0, Math.floor(bcx - 64)), y0 = Math.max(0, Math.floor(bcy - 64));
  const x1 = Math.min(cv.width - 1, Math.ceil(bcx + 64)), y1 = Math.min(cv.height - 1, Math.ceil(bcy + 64));
  const grab = () => {
    const img = cv.getContext('2d').getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    return new Uint8Array(img.data);
  };
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const withEnt = grab();
  // 诊断：窗口中心像素（with）——确认 EoS 已渲染
  const cxPixWith = Array.from(withEnt.slice(((Math.floor(H / 2) * W + Math.floor(W / 2)) << 2), (Math.floor(H / 2) * W + Math.floor(W / 2)) << 2 + 4));
  // 预测：帧中心锚 → 帧顶屏幕行 = bcy - (frameH/2)*z；红眼帧内行 42 →
  // 预测红眼画布行 = bcy - 40*z + 42*z = bcy + 2*z（frameH/2=40,盒心=帧心）
  const predictedRedRow = bcy - (80 / 2) * z + 42 * z;
  // 传送隔离（+360px x 移出窗口）
  eos.x += 360;
  for (let i = 0; i < 2; i++) { eos.visAngle = 0; g.fixedUpdate(1 / 60); eos.visAngle = 0; }
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
  const withoutEnt = grab();
  const cxPixWithout = Array.from(withoutEnt.slice(((Math.floor(H / 2) * W + Math.floor(W / 2)) << 2), (Math.floor(H / 2) * W + Math.floor(W / 2)) << 2 + 4));
  // 差分 bbox + 红眼行
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  let redMin = 1e9, redMax = -1;
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) << 2;
      const d = Math.abs(withEnt[i] - withoutEnt[i]) + Math.abs(withEnt[i + 1] - withoutEnt[i + 1]) + Math.abs(withEnt[i + 2] - withoutEnt[i + 2]);
      if (d > 90) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
        if (withEnt[i] > 90 && withEnt[i + 1] < 110 && withEnt[i + 2] < 110) {
          if (yy < redMin) redMin = yy;
          if (yy > redMax) redMax = yy;
        }
      }
    }
  }
  const boxTop = bcy - 15 * z, boxBottom = bcy + 15 * z;
  return {
    frozen: { cx: eos.cx, cy: eos.cy },
    cxPixWith, cxPixWithout,
    window: { x0, y0, W, H },
    box: { top: boxTop, bottom: boxBottom, left: bcx - 15 * z, right: bcx + 15 * z },
    predictedRedRow, redRows: redMax >= 0 ? [redMin, redMax] : null,
    sprite: { left: minX, top: minY, right: maxX, bottom: maxY },
    spriteW: maxX - minX, spriteH: maxY - minY,
  };
});
console.log(JSON.stringify(out, null, 1));
if (out.redRows) {
  const [r0, r1] = out.redRows;
  const center = (r0 + r1) / 2;
  const anchorDelta = center - out.predictedRedRow;
  console.log(`红眼行中心 ${center} vs 预测 ${out.predictedRedRow} → 锚点偏差 ${Math.round(anchorDelta * 10) / 10}px (正=精灵下移/沉降)`);
  console.log(`精灵盒: ${out.sprite.left},${out.sprite.top} → ${out.sprite.right},${out.sprite.bottom} (${out.spriteW}x${out.spriteH})`);
  console.log(`物理盒: 左${Math.round(out.box.left)} 右${Math.round(out.box.right)} → 精灵左越界 ${out.sprite.left - out.box.left}px, 右越界 ${out.sprite.right - out.box.right}px`);
} else {
  console.log('红眼未检出（太暗）— 提高环境光或改测轮廓');
}
await browser.close();

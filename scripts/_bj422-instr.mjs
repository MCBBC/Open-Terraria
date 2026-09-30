// ★BJ422 判别仪表：dark 场景下 hook renderer.drawBuilderRulers——
//  ① 调用计数 ② 调用期 drawImage 计数增量（绘制体是否真实发笔）
//  ③ orig 调用后在主画布中央盖 40×40 红标（若红标可见=post-light 绘制确实落屏,
//     网格不可见=网格自身条件问题;若红标不可见=post-light 内容被后续全屏 op 覆盖）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5610';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', String(e).slice(0, 160)));

await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}

// 仪表注入：drawImage 全局计数 + drawBuilderRulers 包装 + 红标
await page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype;
  if (!P.__swPatched) {
    const d = P.drawImage;
    P.drawImage = function (...a) { this.__swDraws = (this.__swDraws ?? 0) + 1; return d.apply(this, a); };
    P.__swPatched = true;
  }
  const r = window.__swGame.renderer;
  const orig = r.drawBuilderRulers.bind(r);
  window.__bj422 = { calls: 0, draws: 0, brSnapshot: [] };
  r.drawBuilderRulers = function (ctx, world, cam, viewW, viewH, z) {
    window.__bj422.calls++;
    const b0 = ctx.__swDraws ?? 0;
    const br = this.builderRulers;
    if (br && window.__bj422.brSnapshot.length < 3) window.__bj422.brSnapshot.push({ gridOn: br.gridOn, gridDist: Math.round(br.gridDist * 100) / 100 });
    const out = orig(ctx, world, cam, viewW, viewH, z);
    window.__bj422.draws += (ctx.__swDraws ?? 0) - b0;
    // 红标（post-light 落屏判别面）
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,0,0,0.9)';
    ctx.fillRect(viewW * 0.4, viewH * 0.45, 40, 40);
    ctx.restore();
    return out;
  };
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[1] = 0;
  g.player.builderAccStatus[0] = 1;
  return true;
});

// 深层暗位（同主探针找位逻辑）
const spot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const yStart = Math.max(20, Math.round(g.world.rockLevel) + 100);
  for (let y = yStart; y < st.h - 30; y += 2) {
    for (let x = 30; x < st.w - 40; x += 2) {
      let air = true;
      for (let j = 0; j < 7 && air; j++) for (let i = 0; i < 7; i++) {
        const li = st.idx(x + i, y + j);
        if (st.type[li] !== 0 || st.liquid[li] !== 0) { air = false; break; }
      }
      if (air) return { x: x + 3, y: y + 3 };
    }
  }
  return null;
});
const land = await page.evaluate(({ x, y }) => {
  const st = window.__swGame.world.store;
  for (let ty = y + 4; ty < Math.min(st.h - 4, y + 60); ty++) {
    let solid = true;
    for (let i = -2; i <= 2; i++) if (st.type[st.idx(x + i, ty)] === 0) { solid = false; break; }
    if (solid) return { x, y: ty };
  }
  return null;
}, spot);
await page.evaluate(({ x, y }) => {
  const p = window.__swGame.player;
  p.x = x * 16; p.y = y * 16 - p.h - 2; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.fallStartY = null;
}, land);
// 等落稳+残影归位
for (let k = 0; k < 30; k++) {
  const y = await page.evaluate(() => { const p = window.__swGame.player; p.hp = p.maxHp; p.vx = 0; p.vy = 0; return p.y; });
  await new Promise((r) => setTimeout(r, 60));
  if (k > 8) break;
}
await new Promise((r) => setTimeout(r, 900));

const base = await page.evaluate(() => { const b = window.__bj422; b.calls0 = b.calls; b.draws0 = b.draws; return { calls0: b.calls, draws0: b.draws }; });
await new Promise((r) => setTimeout(r, 1000));
const st = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const b = window.__bj422;
    // 采样红标区域 + 盒内青色
    let best = null, area = 0;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width * c.height > area) { area = c.width * c.height; best = c; } });
    const c2 = best.getContext('2d');
    const rb = c2.getImageData(Math.round(best.width * 0.4) + 10, Math.round(best.height * 0.45) + 10, 8, 8).data;
    let red = 0;
    for (let i = 0; i < rb.length; i += 4) if (rb[i] > 120 && rb[i + 1] < 90) red++;
    const bx = Math.round(best.width * 0.25), by = Math.round(best.height * 0.30);
    const bd = c2.getImageData(bx, by, Math.round(best.width * 0.5), Math.round(best.height * 0.4)).data;
    let cyan = 0;
    for (let i = 0; i < bd.length; i += 4) { const r0 = bd[i], g0 = bd[i + 1], b0 = bd[i + 2]; if (b0 > g0 && g0 > r0 && b0 - r0 > 18) cyan++; }
    res({ callsDelta: b.calls - b.calls0, drawsDelta: b.draws - b.draws0, brSnapshot: b.brSnapshot, redPx: red, cyanPx: cyan, avgB: (bd.reduce((s, v, i) => s + (i % 4 === 2 ? v : 0), 0) / (bd.length / 4)).toFixed(1) });
  }));
}));
console.log('DARK-INSTR:', JSON.stringify({ spot, land, ...st }));
await browser.close();

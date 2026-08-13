// 渲染六小项探针（2026-08-13 收尾批）：①327 披风/328 双臂可视性 + ⑤259 茎蔓
// 强制亮彩（光照合成后绘制，黑暗洞穴内仍保底可见）。像素采样断言。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('渲染探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const out = { errs: [] };
  try {
    const W = st.w, H = st.h;
    const cx = Math.floor(W / 2), cy = Math.floor(H * 0.75);
    // 挖 31×15 空腔（黑暗——无光源 tile），清液体
    for (let dy = -7; dy <= 7; dy++) for (let dx = -15; dx <= 15; dx++) {
      st.setTile(cx + dx, cy + dy, 0);
      st.liquid[st.idx(cx + dx, cy + dy)] = 0;
    }
    const px = cx * 16, py = cy * 16;
    g.player.x = px; g.player.y = py - 60;
    // ⑤ 259 茎蔓：锚点格 (cx+3, cy-6)（头顶斜上），本体放锚点下方
    const man = Enemy.fromVanilla(259, (cx + 3) * 16, (cy + 2) * 16);
    out.manSpawned = !!man;
    if (man) {
      man.ai0 = cx + 3; man.ai1 = cy - 6;
      man.vx = 0; man.vy = 0;
      g.entities.add(man, 'enemies');
    }
    // ① 327：放在腔左端（也在黑暗腔内——披风/臂在无光环境应同样可见，
    //   与 259 同理但它们无强制亮彩，光照后应仍近黑——只断言绘制不炸+结构存在）
    const pk = Enemy.fromVanilla(327, (cx - 8) * 16, (cy - 2) * 16);
    out.pkSpawned = !!pk;
    if (pk) g.entities.add(pk, 'enemies');
    for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);   // pumpkingAI 首帧生 328×2
    out.bladeCount = g.entities.enemies.filter((n) => n.vanillaId === 328 && !n.dead).length;

    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const z = g.camera.zoom;
    // ⑤ 走廊：x∈[cx+1,cx+5]、y∈[cy-6,cy+3]（藤蔓本体+茎）
    const [sx0, sy0] = g.camera.worldToScreen((cx + 1) * 16, (cy - 6) * 16);
    const img = ctx.getImageData(Math.round(sx0), Math.round(sy0), Math.max(8, Math.round(4 * 16 * z)), Math.max(8, Math.round(9 * 16 * z))).data;
    let lit = 0, total = 0, rSum = 0, gSum = 0, bSum = 0;
    for (let j = 0; j < img.length; j += 4) {
      total++;
      const lum = img[j] + img[j + 1] + img[j + 2];
      if (lum > 60) { lit++; rSum += img[j]; gSum += img[j + 1]; bSum += img[j + 2]; }
    }
    out.vineCorridor = { litRatio: +(lit / total).toFixed(3), avgRGB: lit ? [Math.round(rSum / lit), Math.round(gSum / lit), Math.round(bSum / lit)] : null };
    // ⑤ 黑暗对照：腔右下空白区
    const [bx0, by0] = g.camera.worldToScreen((cx - 14) * 16, (cy - 6) * 16);
    const bimg = ctx.getImageData(Math.round(bx0), Math.round(by0), Math.max(8, Math.round(4 * 16 * z)), Math.max(8, Math.round(9 * 16 * z))).data;
    let blit = 0, btotal = 0;
    for (let j = 0; j < bimg.length; j += 4) { btotal++; if (bimg[j] + bimg[j + 1] + bimg[j + 2] > 60) blit++; }
    out.darkControl = +(blit / btotal).toFixed(3);
    // ① 披风像素（327 本体中心+80Y 锚，166×126 帧）——黑暗腔内仍应有少量像素
    //   （PumpkingCloak 走主 pass 会被压黑，此处仅断言画布采样不炸并记录）
    if (pk) {
      const [kx, ky] = g.camera.worldToScreen(pk.cx, pk.cy + 80);
      const cimg = ctx.getImageData(Math.max(0, Math.round(kx) - 40), Math.max(0, Math.round(ky) - 20), 80, 40).data;
      let kop = 0, ktot = 0;
      for (let j = 0; j < cimg.length; j += 4) { ktot++; if (cimg[j + 3] > 200) kop++; }
      out.cloakOpaqueRatio = +(kop / ktot).toFixed(4);
    }
    out.screenshotTaken = true;
  } catch (err) { out.errs.push(String(err && err.stack || err)); }
  return out;
});

check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
check('259/327 均生成', res.manSpawned && res.pkSpawned);
check('① pumpkingAI 首帧生 328×2', res.bladeCount === 2, 'blades=' + res.bladeCount);
check('⑤ 黑暗腔对照区全黑（<2%）', res.darkControl != null && res.darkControl < 0.02, 'darkControl=' + res.darkControl);
check('⑤ 藤蔓走廊显著非黑（>5%）', res.vineCorridor && res.vineCorridor.litRatio > 0.05, JSON.stringify(res.vineCorridor));
check('⑤ 走廊绿通道>红通道（下限色特征）',
  res.vineCorridor && res.vineCorridor.avgRGB && res.vineCorridor.avgRGB[1] > res.vineCorridor.avgRGB[0],
  JSON.stringify(res.vineCorridor?.avgRGB));
console.log('INFO cloakOpaqueRatio(黑暗腔内，主 pass 被压黑属预期)=' + res.cloakOpaqueRatio);
if (res.errs.length) { console.log('EVAL ERRORS:', res.errs.join('\n')); check('evaluate 无异常', false); }
await page.screenshot({ path: '/tmp/sw-vinebright.png' });
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

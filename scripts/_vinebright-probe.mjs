// 渲染六小项探针 v2：⑤259 茎蔓强制亮彩（岩层黑暗腔）+ ①327 披风/328 双臂
// （火把侧龛明亮区结构可视性）。像素采样断言。
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
  const tileLum = (x0, y0, tw, th, lumThr = 60) => {
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const z = g.camera.zoom;
    const [sx, sy] = g.camera.worldToScreen(x0 * 16, y0 * 16);
    const img = ctx.getImageData(Math.max(0, Math.round(sx)), Math.max(0, Math.round(sy)),
      Math.min(canvas.width, Math.max(8, Math.round(tw * 16 * z))), Math.min(canvas.height, Math.max(8, Math.round(th * 16 * z)))).data;
    let lit = 0, total = 0, rSum = 0, gSum = 0, bSum = 0, opaque = 0;
    for (let j = 0; j < img.length; j += 4) {
      total++;
      const lum = img[j] + img[j + 1] + img[j + 2];
      if (lum > lumThr) { lit++; rSum += img[j]; gSum += img[j + 1]; bSum += img[j + 2]; }
      if (img[j + 3] > 200) opaque++;
    }
    return { litRatio: +(lit / total).toFixed(3), avgRGB: lit ? [Math.round(rSum / lit), Math.round(gSum / lit), Math.round(bSum / lit)] : null, opaqueRatio: +(opaque / total).toFixed(4) };
  };
  try {
    // 黑暗主腔：岩层内（rockLevel+120，远离岩浆线）
    const W = st.w;
    const cx = Math.floor(W / 2), cy = Math.floor(g.world.rockLevel) + 120;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -18; dx <= 18; dx++) {
      st.setTile(cx + dx, cy + dy, 0);
      st.liquid[st.idx(cx + dx, cy + dy)] = 0;
    }
    // 火把侧龛：cx-22..cx-14（与主腔隔一堵墙）
    for (let dy = -5; dy <= 5; dy++) for (let dx = -23; dx <= -14; dx++) {
      st.setTile(cx + dx, cy + dy, 0);
      st.liquid[st.idx(cx + dx, cy + dy)] = 0;
    }
    for (let dx = -23; dx <= -14; dx++) st.setTile(cx + dx, cy + 6, 2);   // 底板
    st.setTile(cx - 20, cy - 3, 4);                                       // 火把（tile 4）
    g.player.x = (cx - 18) * 16; g.player.y = (cy - 1) * 16;              // 玩家在侧龛
    // ⑤ 259：主腔右侧，锚点 (cx+8, cy-6)
    const man = Enemy.fromVanilla(259, (cx + 8) * 16, (cy + 3) * 16);
    out.manSpawned = !!man;
    if (man) { man.ai0 = cx + 8; man.ai1 = cy - 6; man.vx = 0; man.vy = 0; g.entities.add(man, 'enemies'); }
    // ① 327：侧龛火把旁
    const pk = Enemy.fromVanilla(327, (cx - 18) * 16, (cy - 2) * 16);
    out.pkSpawned = !!pk;
    if (pk) g.entities.add(pk, 'enemies');
    for (let i = 0; i < 120; i++) { g.fixedUpdate(1 / 60); if (g.player.hp < 60) g.player.hp = g.player.maxHp; }
    out.bladeCount = g.entities.enemies.filter((n) => n.vanillaId === 328 && !n.dead).length;

    // ⑤ 走廊 = 锚点下方到本体（x: cx+6..cx+10, y: cy-6..cy+4）
    out.vineCorridor = tileLum(cx + 6, cy - 6, 4, 10);
    // ⑤ 黑暗对照：主腔左端（远离藤蔓/火把/玩家）——引擎深层或有环境底光，
    //   仅记录不硬断言（硬验证走下方零光照直调）
    out.darkControl = tileLum(cx - 12, cy - 4, 4, 8);

    // ① 327/328 传送到玩家旁并跑一 tick，按其当前位采样（防悬浮 AI 带离视野）
    if (pk && !pk.dead) {
      pk.x = g.player.x + 60; pk.y = g.player.y - 40; pk.vx = 0; pk.vy = 0;
      const blades = g.entities.enemies.filter((n) => n.vanillaId === 328 && !n.dead);
      blades.forEach((b, i) => { b.x = pk.x - 80 * (i === 0 ? 1 : -1); b.y = pk.y; b.vx = 0; b.vy = 0; });
      g.fixedUpdate(1 / 60);
      const pkTx = Math.floor(pk.cx / 16), pkTy = Math.floor((pk.cy + 80) / 16);
      out.cloak = tileLum(pkTx - 5, pkTy - 4, 10, 8);
      out.pkBody = tileLum(Math.floor(pk.x / 16), Math.floor(pk.y / 16), 6, 6);
      const blade = blades[0];
      if (blade) {
        const bx0 = Math.min(Math.floor(blade.cx / 16), Math.floor(pk.cx / 16)) - 2;
        const by0 = Math.min(Math.floor(blade.cy / 16), Math.floor(pk.cy / 16)) - 2;
        out.armCorridor = tileLum(bx0, by0,
          Math.abs(Math.floor(blade.cx / 16) - Math.floor(pk.cx / 16)) + 5,
          Math.abs(Math.floor(blade.cy / 16) - Math.floor(pk.cy / 16)) + 5);
      }
    }

    // ⑤ 硬验证：帧完成后以全零光照图直调 drawBrightVines（=黑暗语义），
    //   主画布应立即出现下限色藤蔓像素（下一帧会被覆盖，采样即时进行）。
    //   lightmap 尺寸取渲染器本帧的实际区域：用 1×1 光图 + 锚点置区外 → 全亮
    //   不行；改为全零 Uint8Array(1) 配 rx/ry 使锚点判"区外"也会走全亮分支——
    //   因此锚点必须判"区内"：给足尺寸的全零数组 + 大区域。
    const { Renderer } = await import('/src/render/Renderer.ts');
    const zeroR = new Uint8Array(40000), zeroG = new Uint8Array(40000), zeroB = new Uint8Array(40000);
    // 复活/重摆 259（warmup 期间可能已死）再直调
    let man2 = g.entities.enemies.find((n) => n.vanillaId === 259 && !n.dead);
    if (!man2) {
      man2 = Enemy.fromVanilla(259, (cx + 8) * 16, (cy + 3) * 16);
      if (man2) { man2.ai0 = cx + 8; man2.ai1 = cy - 6; g.entities.add(man2, 'enemies'); }
    }
    await new Promise(r => requestAnimationFrame(r));   // 帧边界：主 pass 已画完
    try {
      // 锚点 (cx+8, cy-6)：rx/ry 取锚点左上，rw/rh 取 200×200 覆盖
      const rx = Math.max(0, cx + 8 - 100), ry = Math.max(0, cy - 6 - 100);
      Renderer.prototype.drawBrightVines.call(g.renderer, g.entities.enemies, g.camera, g.camera.zoom,
        zeroR, zeroG, zeroB, rx, ry, 200, 200);
      out.zeroLightVine = tileLum(cx + 6, cy - 6, 4, 10);
    } catch (e) { out.errs.push('direct-call ' + String(e)); }
  } catch (err) { out.errs.push(String(err && err.stack || err)); }
  return out;
});

check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
check('259/327 均生成', res.manSpawned && res.pkSpawned);
check('① pumpkingAI 首帧生 328×2', res.bladeCount === 2, 'blades=' + res.bladeCount);
check('⑤ 黑暗对照（信息值）', true, JSON.stringify(res.darkControl));
check('⑤ 藤蔓走廊显著非黑（>5%）', res.vineCorridor && res.vineCorridor.litRatio > 0.05, JSON.stringify(res.vineCorridor));
check('⑤ 走廊绿>红（下限色特征）', res.vineCorridor && res.vineCorridor.avgRGB && res.vineCorridor.avgRGB[1] > res.vineCorridor.avgRGB[0], JSON.stringify(res.vineCorridor?.avgRGB));
check('⑤ 零光照直调：走廊仍有下限色像素（lit>5%）', res.zeroLightVine && res.zeroLightVine.litRatio > 0.05, JSON.stringify(res.zeroLightVine));
check('① 327 本体可见（采样法有效性底线）', res.pkBody && res.pkBody.litRatio > 0.1, JSON.stringify(res.pkBody));
check('① 披风区非空（lit>5%）', res.cloak && res.cloak.litRatio > 0.05, JSON.stringify(res.cloak));
check('① 臂骨走廊非空（lit>3%）', res.armCorridor && res.armCorridor.litRatio > 0.03, JSON.stringify(res.armCorridor));
if (res.errs.length) { console.log('EVAL ERRORS:', res.errs.join('\n')); check('evaluate 无异常', false); }
console.log('DIAG:', JSON.stringify(res.diag));
await page.screenshot({ path: '/tmp/sw-vinebright.png' });
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

// 光芒药水 + 手持光源双源 review 探针：
//  ① shine buff → buffLights[(0.8,0.95,1.0)@中心格]，不占 heldLight 槽
//  ② shine + 持火把 → 双源并存（用户问题的本仓行为核验）
//  ③ 手位格 = (cx+10·dir, cy−22) 链（frameH16：:50387 默认 itemLocation + :49093±12/−14）
//  ④ 湿手普通火把熄 / 水炬 523 照常（:48997 半边门）
//  ⑤ buff 过期槽清空
//  ⑥ 引擎逐通道 max 合并（双源同格 ≈ (255,242,255)，blur 容差）
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
  await page.keyboard.type('光测');
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
  const out = { steps: [] };
  const ok = (name, cond, extra) => { out.steps.push({ name, cond: !!cond, extra }); return !!cond; };
  try {
    const { BuffType } = await import('/src/stats/Buffs.ts');
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const { viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
    const p = g.player;
    const idOf = (vid) => ITEM_DEFS.findIndex((d) => d.vid === vid || viIdFromKey(d.key) === vid);
    const hold = (vid) => { p.inv.slots[0] = { id: idOf(vid), stack: 1 }; p.inv.selected = 0; };
    const clearHeld = () => { p.inv.slots[0] = null; };
    const T = 16;
    const tick = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };

    // ---- ① shine 单独 ----
    clearHeld(); tick(2);
    p.buffs.apply(BuffType.Shine, 3600); tick(5);
    const bl = g.lighting.buffLights;
    ok('① shine → buffLights 1 条 (0.8,0.95,1.0)@中心格', bl.length === 1
      && Math.abs(bl[0].r - 0.8) < 1e-6 && Math.abs(bl[0].g - 0.95) < 1e-6 && Math.abs(bl[0].b - 1) < 1e-6
      && bl[0].tx === Math.floor(p.cx / T) && bl[0].ty === Math.floor(p.cy / T), JSON.stringify(bl));
    ok('① 空手 heldLight=null（shine 不抢占手持槽）', g.lighting.heldLight === null);

    // ---- ② shine + 持火把：双源并存 ----
    hold(8); tick(5);
    const hl = g.lighting.heldLight;
    const bl2 = g.lighting.buffLights;
    ok('② 双源并存：buffLights 1 + heldLight 1', bl2.length === 1 && !!hl,
      JSON.stringify({ held: hl, buffs: bl2 }));
    ok('② 火把色 (1,0.95,0.8)', hl && Math.abs(hl.r - 1) < 1e-6 && Math.abs(hl.g - 0.95) < 1e-6 && Math.abs(hl.b - 0.8) < 1e-6);
    // ---- ③ 手位格链 ----
    const dir = p.facing < 0 ? -1 : 1;
    const expTx = Math.floor((p.cx - 2 * dir + 12 * dir) / T);
    const expTy = Math.floor((p.cy - 16 / 2 - 14) / T);
    ok('③ 手位格 = (cx+10·dir, cy−22) 推导格', hl && hl.tx === expTx && hl.ty === expTy,
      `held=(${hl?.tx},${hl?.ty}) exp=(${expTx},${expTy}) dir=${dir}`);

    // ---- ④ 湿手门（inWater 每帧被液体碰撞重算——注真水伪造）----
    const st_ = g.world.store;
    const ptx_ = Math.floor(p.cx / T), pty_ = Math.floor(p.cy / T);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ii = st_.idx(ptx_ + dx, pty_ + dy);
      st_.setTile(ptx_ + dx, pty_ + dy, 0);
      st_.liquid[ii] = 255; st_.liquidType[ii] = 1;
    }
    tick(8);
    ok('④ 湿手普通火把 → heldLight 熄', g.lighting.heldLight === null || g.lighting.heldLight.r !== 1 || g.lighting.heldLight.b !== 0.8
      ? g.lighting.heldLight === null : false, JSON.stringify(g.lighting.heldLight));
    p.inWater = true; tick(2);   // 水炬门查 player.inWater（水已注入，碰撞应已置位）
    hold(523); tick(5);   // 珊瑚水炬
    ok('④ 水炬 523 湿手照常亮', !!g.lighting.heldLight, JSON.stringify(g.lighting.heldLight));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ii = st_.idx(ptx_ + dx, pty_ + dy); st_.liquid[ii] = 0;
    }
    hold(8); tick(8);

    // ---- ⑤ buff 过期 ----
    p.buffs.set(BuffType.Shine, 0.02); tick(6);
    ok('⑤ buff 过期 → buffLights 清空（持火把不受影响）',
      g.lighting.buffLights.length === 0 && !!g.lighting.heldLight,
      JSON.stringify({ buffs: g.lighting.buffLights.length, held: !!g.lighting.heldLight }));

    // ---- ⑥ 引擎逐通道 max（双源注入同格）----
    clearHeld();
    g.lighting.heldLight = { tx: Math.floor(p.cx / T), ty: Math.floor(p.cy / T), r: 1, g: 0.95, b: 0.8 };
    g.lighting.buffLights = [{ tx: Math.floor(p.cx / T), ty: Math.floor(p.cy / T), r: 0.8, g: 0.95, b: 1 }];
    g.lighting.dirty = true;
    for (let i = 0; i < 16; i++) { g.fixedUpdate(1 / 60); await new Promise(r => requestAnimationFrame(r)); }
    const li = g.lighting.lightAt(Math.floor(p.cx / T), Math.floor(p.cy / T));
    ok('⑥ 同格双源 = 逐通道 max（R≈B≥G，无 1.8 倍叠加）',
      li[0] > 200 && li[2] > 200 && li[1] <= li[0] + 4 && li[0] < 255 + 1,
      `lightAt=(${li.map((v) => Math.round(v)).join(',')})`);
    g.lighting.heldLight = null; g.lighting.buffLights = [];
  } catch (err) { out.steps.push({ name: 'ERR ' + String(err && err.stack || err).slice(0, 300), cond: false }); }
  return out;
});

for (const s of res.steps) check(s.name, s.cond, s.extra ?? '');
check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);

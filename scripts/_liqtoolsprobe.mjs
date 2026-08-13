// 液体工具族六件端到端（docs/implementation-gap-list-2026-08-13.md §1）：
// 4820/5302/5364 无底桶恒量倾倒不消耗；4872/5303/5304 海绵吸液不消耗。
// 行为基准 Player.ItemCheck_UseBuckets Player.cs:45704-45890
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 通用：手持 itemKey 指向 (dx,dy) 偏移格使用 220ms；setup 先把目标格(±3×3)清成给定液体
// mode='pour' → 目标格清空空气;mode='soak' → 目标格 255 type 液体且 3×3 邻居干
const runUse = (itemRe, mode, liquidType, dtx = 2, dty = -3) => page.evaluate(async (itemReSrc, modeSrc, lt, dtx, dty) => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => new RegExp(itemReSrc).test(k));
  if (!key) return { key: null };
  const tx = Math.floor(p.cx / 16) + dtx, ty = Math.floor((p.y + p.h) / 16) + dty;
  g.world.store.setTile(tx, ty, 0);
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    g.world.store.setLiquid(tx + ox, ty + oy, 0, 0);
  }
  if (modeSrc === 'soak') g.world.store.setLiquid(tx, ty, 255, lt);
  if (modeSrc === 'alien') g.world.store.setLiquid(tx, ty, 120, lt);
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const st = g.world.store, i = st.idx(tx, ty);
  return {
    key, liquid: st.liquid[i], type: st.liquidType[i],
    stack: p.inv.slots[0]?.stack ?? 0,
    heldKey: p.inv.slots[0] ? Object.keys(window.__swItems).find((k) => window.__swItems[k] === p.inv.slots[0].id) ?? null : null,
  };
}, itemRe, mode, liquidType, dtx, dty);

// ---- 倾倒三件：空格 → 255 对应液体,不消耗 ----
const lavaB = await runUse('^vi_4820_', 'pour');
check('4820 无底岩浆桶:倾岩浆255且不消耗', lavaB.liquid === 255 && lavaB.type === 2 && lavaB.stack === 1 && /vi_4820_/.test(lavaB.heldKey ?? ''), JSON.stringify(lavaB));
const honeyB = await runUse('^vi_5302_', 'pour');
check('5302 无底蜂蜜桶:倾蜂蜜255且不消耗', honeyB.liquid === 255 && honeyB.type === 3 && honeyB.stack === 1 && /vi_5302_/.test(honeyB.heldKey ?? ''), JSON.stringify(honeyB));
const shimB = await runUse('^vi_5364_', 'pour');
check('5364 无底微光桶:倾微光255且不消耗', shimB.liquid === 255 && shimB.type === 4 && shimB.stack === 1 && /vi_5364_/.test(shimB.heldKey ?? ''), JSON.stringify(shimB));

// 异类门（:45819/:45839/:45859/:45877 须 liquid==0 || 同类）
const shimOnWater = await runUse('^vi_5364_', 'alien', 1, 3);
check('5364 异类门:半格水上不倒微光(仍水)', shimOnWater.type === 1 && shimOnWater.liquid <= 200, JSON.stringify(shimOnWater));

// ---- 海绵三件：吸干对应液体,不消耗 ----
const lavaS = await runUse('^vi_4872_', 'soak', 2);
check('4872 岩浆海绵:吸干岩浆且不消耗', lavaS.liquid === 0 && lavaS.stack === 1 && /vi_4872_/.test(lavaS.heldKey ?? ''), JSON.stringify(lavaS));
const honeyS = await runUse('^vi_5303_', 'soak', 3);
check('5303 蜂蜜海绵:吸干蜂蜜且不消耗', honeyS.liquid === 0 && honeyS.stack === 1 && /vi_5303_/.test(honeyS.heldKey ?? ''), JSON.stringify(honeyS));
const ultraW = await runUse('^vi_5304_', 'soak', 1);
check('5304 终极海绵:吸干水(任意液体)且不消耗', ultraW.liquid === 0 && ultraW.stack === 1 && /vi_5304_/.test(ultraW.heldKey ?? ''), JSON.stringify(ultraW));

// 类型门（:45719）：岩浆海绵对水无效;终极海绵不进倾倒支
const lavaOnWater = await runUse('^vi_4872_', 'soak', 1, 3);
check('4872 类型门:水上无效(仍水)', lavaOnWater.type === 1 && lavaOnWater.liquid >= 250, JSON.stringify(lavaOnWater));
const ultraOnAir = await runUse('^vi_5304_', 'pour', 0, 4);
check('5304 不进倾倒支:空格不倒液体', ultraOnAir.liquid === 0, JSON.stringify(ultraOnAir));

// ---- 空桶换桶链（:45738-45759）与微光拒绝（:45719）----
const scoopLava = await runUse('^vi_205_', 'soak', 2, 2);
check('205 空桶舀岩浆→岩浆桶207且目标吸干', scoopLava.liquid === 0 && /vi_207_/.test(scoopLava.heldKey ?? ''), JSON.stringify(scoopLava));
const scoopShim = await runUse('^vi_205_', 'soak', 4, 3);
check('205 空桶:微光不可舀(:45719 !shimmer)', scoopShim.liquid === 255 && scoopShim.type === 4 && /vi_205_/.test(scoopShim.heldKey ?? ''), JSON.stringify(scoopShim));

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('page errors:', JSON.stringify(errors));
await browser.close();
process.exit(fail ? 1 : 0);

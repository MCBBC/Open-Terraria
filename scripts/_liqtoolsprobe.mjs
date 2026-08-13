// 液体工具族六件端到端（docs/implementation-gap-list-2026-08-13.md §1）：
// 4820/5302/5364 无底桶恒量倾倒不消耗；4872/5303/5304 海绵吸液不消耗。
// 行为基准 Player.ItemCheck_UseBuckets Player.cs:45704-45890
// 探针防自伤:倾倒/异类门测试把目标格砌成"石底+四壁"封闭腔(液体不流走不蒸发);
// 异类液体用蜂蜜/岩浆(不蒸发)。205 射程 tb=0,目标取脚上 2 格(±3 盒边缘勿用)。
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
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// mode: pour=封闭腔空气 / soak=封闭腔内 255 指定液体(3×3 邻先干) / alien=封闭腔内指定液体
const runUse = (itemRe, mode, liquidType, dtx = 2, dty = -2, alienAmt = 150) => page.evaluate(async (itemReSrc, modeSrc, lt, dtx, dty, alienAmt) => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => new RegExp(itemReSrc).test(k));
  if (!key) return { key: null };
  const tx = Math.floor(p.cx / 16) + dtx, ty = Math.floor((p.y + p.h) / 16) + dty;
  const st = g.world.store;
  const stone = Object.keys(window.__swTiles ?? {}).length ? null : null; // tiles 表不经 window 暴露,用 store 现取
  const dirtLike = st.type[st.idx(tx, ty + 1)] || 0;
  // 封闭腔:目标格空气,下方+四壁砌实心(复用任意现存实心 id,失败则跳过砌墙仅清液)
  st.setLiquid(tx, ty, 0, 0);
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    if (ox === 0 && oy === 0) continue;
    st.setLiquid(tx + ox, ty + oy, 0, 0);
  }
  if (modeSrc === 'soak' || modeSrc === 'alien') st.setLiquid(tx, ty, modeSrc === 'soak' ? 255 : alienAmt, lt);
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const i = st.idx(tx, ty);
  return {
    key, liquid: st.liquid[i], type: st.liquidType[i],
    stack: p.inv.slots[0]?.stack ?? 0,
    heldKey: p.inv.slots[0] ? Object.keys(window.__swItems).find((k) => window.__swItems[k] === p.inv.slots[0].id) ?? null : null,
  };
}, itemRe, mode, liquidType, dtx, dty, alienAmt);

// ---- 倾倒三件：空格 → 255 对应液体,不消耗（岩浆/蜂蜜/微光流动慢,读数稳） ----
const lavaB = await runUse('^vi_4820_', 'pour');
check('4820 无底岩浆桶:倾岩浆255且不消耗', lavaB.liquid === 255 && lavaB.type === 2 && lavaB.stack === 1 && /vi_4820_/.test(lavaB.heldKey ?? ''), JSON.stringify(lavaB));
const honeyB = await runUse('^vi_5302_', 'pour');
check('5302 无底蜂蜜桶:倾蜂蜜255且不消耗', honeyB.liquid === 255 && honeyB.type === 3 && honeyB.stack === 1 && /vi_5302_/.test(honeyB.heldKey ?? ''), JSON.stringify(honeyB));
const shimB = await runUse('^vi_5364_', 'pour');
check('5364 无底微光桶:倾微光255且不消耗', shimB.liquid >= 250 && shimB.type === 4 && shimB.stack === 1 && /vi_5364_/.test(shimB.heldKey ?? ''), JSON.stringify(shimB));

// 异类门（:45819/:45839/:45859/:45877 须 liquid==0 || 同类）：蜂蜜上不倒岩浆
const lavaOnHoney = await runUse('^vi_4820_', 'alien', 3, 3);
check('4820 异类门:蜂蜜格上不倒岩浆(仍蜜)', lavaOnHoney.type === 3 && lavaOnHoney.liquid < 255, JSON.stringify(lavaOnHoney));

// ---- 海绵三件：吸干对应液体,不消耗 ----
const lavaS = await runUse('^vi_4872_', 'soak', 2);
check('4872 岩浆海绵:吸干岩浆且不消耗', lavaS.liquid === 0 && lavaS.stack === 1 && /vi_4872_/.test(lavaS.heldKey ?? ''), JSON.stringify(lavaS));
const honeyS = await runUse('^vi_5303_', 'soak', 3);
check('5303 蜂蜜海绵:吸干蜂蜜且不消耗', honeyS.liquid === 0 && honeyS.stack === 1 && /vi_5303_/.test(honeyS.heldKey ?? ''), JSON.stringify(honeyS));
const ultraW = await runUse('^vi_5304_', 'soak', 1);
check('5304 终极海绵:吸干水(任意液体)且不消耗', ultraW.liquid === 0 && ultraW.stack === 1 && /vi_5304_/.test(ultraW.heldKey ?? ''), JSON.stringify(ultraW));

// 类型门（:45719）：岩浆海绵对蜂蜜无效;终极海绵不进倾倒支
const lavaOnHoneyS = await runUse('^vi_4872_', 'soak', 3, 3);
check('4872 类型门:蜂蜜上无效(仍蜜)', lavaOnHoneyS.type === 3 && lavaOnHoneyS.liquid >= 250, JSON.stringify(lavaOnHoneyS));
const ultraOnAir = await runUse('^vi_5304_', 'pour', 0, 4);
check('5304 不进倾倒支:空格不倒液体', ultraOnAir.liquid === 0, JSON.stringify(ultraOnAir));

// ---- 空桶换桶链（:45738-45759）与微光拒绝（:45719）----
const scoopLava = await runUse('^vi_205_', 'soak', 2, 2, -2);
check('205 空桶舀岩浆→岩浆桶207且目标吸干', scoopLava.liquid === 0 && /vi_207_/.test(scoopLava.heldKey ?? ''), JSON.stringify(scoopLava));
const scoopShim = await runUse('^vi_205_', 'soak', 4, 3, -2);
check('205 空桶:微光不可舀(:45719 !shimmer)', scoopShim.type === 4 && scoopShim.liquid >= 250 && /vi_205_/.test(scoopShim.heldKey ?? ''), JSON.stringify(scoopShim));

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('page errors:', JSON.stringify(errors));
await browser.close();
process.exit(fail ? 1 : 0);

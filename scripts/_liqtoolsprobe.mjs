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

// 目标格 = 玩家右侧 2 格、脚上 3 格（射程盒内）;先清成空气
const aim = (tx, ty) => {
  const g = window.__swGame, cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
};
const cell = (tx, ty) => {
  const st = window.__swGame.world.store, i = st.idx(tx, ty);
  return { liquid: st.liquid[i], type: st.liquidType[i] };
};

// ---- 倾倒三件：空格 → 255 对应液体,不消耗 ----
const pourOne = async (re, wantType) => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => re.test(k));
  if (!key) return { key: null };
  const tx = Math.floor(p.cx / 16) + 2, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  g.world.store.setLiquid(tx, ty, 0, 0);
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  aim(tx, ty);
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const c = cell(tx, ty);
  return { key, liquid: c.liquid, type: c.type, stack: p.inv.slots[0]?.stack ?? 0, key2: p.inv.slots[0] ? Object.keys(window.__swItems).find(k => window.__swItems[k] === p.inv.slots[0].id) : null };
};
const lavaB = await pourOne(/^vi_4820_/, 2);
check('4820 无底岩浆桶:倾岩浆255且不消耗', lavaB.liquid === 255 && lavaB.type === 2 && lavaB.stack === 1 && /vi_4820_/.test(lavaB.key2 ?? ''), JSON.stringify(lavaB));
const honeyB = await pourOne(/^vi_5302_/, 3);
check('5302 无底蜂蜜桶:倾蜂蜜255且不消耗', honeyB.liquid === 255 && honeyB.type === 3 && honeyB.stack === 1 && /vi_5302_/.test(honeyB.key2 ?? ''), JSON.stringify(honeyB));
const shimB = await pourOne(/^vi_5364_/, 4);
check('5364 无底微光桶:倾微光255且不消耗', shimB.liquid === 255 && shimB.type === 4 && shimB.stack === 1 && /vi_5364_/.test(shimB.key2 ?? ''), JSON.stringify(shimB));

// ---- 微光桶异类门（:45877 须 liquid==0 || 同类）：水格上不倒 ----
const shimOnWater = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_5364_/.test(k));
  const tx = Math.floor(p.cx / 16) + 3, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  g.world.store.setLiquid(tx, ty, 120, 1);   // 半格水
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const st = g.world.store, i = st.idx(tx, ty);
  return { liquid: st.liquid[i], type: st.liquidType[i] };
});
check('5364 异类门:半格水上不倒微光(仍水)', shimOnWater.type === 1 && shimOnWater.liquid <= 200, JSON.stringify(shimOnWater));

// ---- 海绵三件：吸干对应液体,不消耗 ----
const soakOne = async (re, liquidType) => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => re.test(k));
  const tx = Math.floor(p.cx / 16) + 2, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  // 3×3 干净(防邻居回吸扰动读数)——目标格外的 8 邻清零
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    if (ox === 0 && oy === 0) continue;
    g.world.store.setLiquid(tx + ox, ty + oy, 0, 0);
  }
  g.world.store.setLiquid(tx, ty, 255, liquidType);
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  aim(tx, ty);
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  return { liquid: cell(tx, ty).liquid, stack: p.inv.slots[0]?.stack ?? 0, heldKey: Object.keys(window.__swItems).find(k => window.__swItems[k] === p.inv.slots[0].id) };
};
const lavaS = await soakOne(/^vi_4872_/, 2);
check('4872 岩浆海绵:吸干岩浆且不消耗', lavaS.liquid === 0 && lavaS.stack === 1 && /vi_4872_/.test(lavaS.heldKey ?? ''), JSON.stringify(lavaS));
const honeyS = await soakOne(/^vi_5303_/, 3);
check('5303 蜂蜜海绵:吸干蜂蜜且不消耗', honeyS.liquid === 0 && honeyS.stack === 1 && /vi_5303_/.test(honeyS.heldKey ?? ''), JSON.stringify(honeyS));
const ultraW = await soakOne(/^vi_5304_/, 1);
check('5304 终极海绵:吸干水(任意液体)且不消耗', ultraW.liquid === 0 && ultraW.stack === 1 && /vi_5304_/.test(ultraW.heldKey ?? ''), JSON.stringify(ultraW));

// ---- 海绵类型门（:45719）：岩浆海绵对水无效 ----
const lavaOnWater = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_4872_/.test(k));
  const tx = Math.floor(p.cx / 16) + 3, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  g.world.store.setLiquid(tx, ty, 255, 1);   // 水
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const st = g.world.store, i = st.idx(tx, ty);
  return { liquid: st.liquid[i], type: st.liquidType[i] };
});
check('4872 类型门:水上无效(仍水255)', lavaOnWater.type === 1 && lavaOnWater.liquid >= 250, JSON.stringify(lavaOnWater));

// ---- 空桶舀微光拒绝（:45719 !shimmer）+ 舀岩浆换岩浆桶（:45745）----
const scoopLava = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_205_/.test(k));
  const tx = Math.floor(p.cx / 16) + 2, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  g.world.store.setLiquid(tx, ty, 255, 2);   // 岩浆
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  return { liquid: cell2(tx, ty), heldKey: Object.keys(window.__swItems).find(k => window.__swItems[k] === p.inv.slots[0].id) };
  function cell2(x, y) { const st = g.world.store, i = st.idx(x, y); return { l: st.liquid[i], t: st.liquidType[i] }; }
});
check('205 空桶舀岩浆→岩浆桶207', scoopLava.liquid.l === 0 && /vi_207_/.test(scoopLava.heldKey ?? ''), JSON.stringify(scoopLava));

const scoopShim = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_205_/.test(k));
  const tx = Math.floor(p.cx / 16) + 3, ty = Math.floor((p.y + p.h) / 16) - 3;
  g.world.store.setTile(tx, ty, 0);
  g.world.store.setLiquid(tx, ty, 255, 4);   // 微光
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  const st = g.world.store, i = st.idx(tx, ty);
  return { liquid: st.liquid[i], type: st.liquidType[i], heldKey: Object.keys(window.__swItems).find(k => window.__swItems[k] === p.inv.slots[0].id) };
});
check('205 空桶:微光不可舀(:45719,!shimmer)', scoopShim.liquid === 255 && scoopShim.type === 4 && /vi_205_/.test(scoopShim.heldKey ?? ''), JSON.stringify(scoopShim));

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('page errors:', JSON.stringify(errors));
await browser.close();
process.exit(fail ? 1 : 0);

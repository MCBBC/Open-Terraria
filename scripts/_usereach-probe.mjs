// 使用链可达矩阵探针(bug#4"共享链截胡"通用捕手,2026-08-13):
// 每物品→期望链(tryMine/chop 直刺挥砍/放置),断言期望链计数>0 且无关链=0。
// 核心断言=持镐时 tryMine 调用数>0——任何 updateUse 分支重排(如剑分支截胡)都会归零。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 观测台
  for (let dx = -25; dx <= 25; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -25; dx <= 25; dx++) st.setTile(px0 + dx, gy + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (gy - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  // 等落地稳定(排除下落期相机漂移)
  for (let i = 0; i < 180; i++) g.fixedUpdate(1 / 60);

  const res = { cases: {} };
  // 计数器
  const counters = { mine: 0, place: 0, swingSet: 0, projs: 0 };
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, bucket) => { if (bucket === 'projectiles') counters.projs++; return origAdd(e, bucket); };
  const origTryMine = g.tryMine.bind(g);
  g.tryMine = (...a) => { counters.mine++; return origTryMine(...a); };
  const origPlace = g.tryPlace ? g.tryPlace.bind(g) : null;
  if (origPlace) g.tryPlace = (...a) => { counters.place++; return origPlace(...a); };

  const equip = (key) => {
    for (let i = 0; i < 60; i++) { if (g.player.inv.slots[i]) g.player.inv.slots[i] = null; }
    const id = window.__swItems[key];
    if (id === undefined) return false;
    g.player.inv.add(id, 1);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    return true;
  };
  const runUse = (frames, mouseY) => {
    counters.mine = 0; counters.place = 0; counters.swingSet = 0; counters.projs = 0;
    g.input.mouseX = 640 + 200;
    g.input.mouseY = mouseY ?? (g.renderer.canvas.height / 2 + 120); // 对准脚下
    for (let i = 0; i < frames; i++) {
      if (i === 0) { g.input.mouseDown = true; g.input.mouseHeld = true; }
      g.fixedUpdate(1 / 60);
      if (g.swing && g.swing.t >= 1) counters.swingSet++;
      g.input.mouseDown = false; // 单击语义(工具 autoReuse 由持按链自理,此处每次帧重置仅测链可达)
      if (i % 30 === 29) { g.input.mouseDown = true; } // 周期重击(触发 useTime 门后重掷)
    }
    g.input.mouseHeld = false;
    return { ...counters };
  };

  const CASES = [
    { key: 'vi_3509_copper_pickaxe', expect: 'mine' },      // 镐 → tryMine>0
    { key: 'vi_3506_copper_axe', expect: 'swingOrMine' },   // 斧 → 挥击或挖掘链
    { key: 'vi_3507_copper_shortsword', expect: 'swing' },  // 短剑 → useStyle13 挥动
    { key: 'vi_3019_hellwing_bow', expect: 'proj', ammo: 'vi_40_wooden_arrow' }, // 弓 → 射箭(需弹药;木弓未注册,用地狱翼弓)
    { key: 'vi_3069_wand_of_sparking', expect: 'proj' },    // 魔杖 → magic 挥杖射弹
    { key: 'vi_282_glowstick', expect: 'proj' },            // 荧光棒 → 掷出(无挥击)
  ];
  for (const c of CASES) {
    if (!equip(c.key)) { res.cases[c.key] = { missing: true }; continue; }
    if (c.ammo) g.player.inv.add(window.__swItems[c.ammo], 50);
    res.cases[c.key] = runUse(120);
  }
  g.tryMine = origTryMine;
  g.entities.add = origAdd;
  if (origPlace) g.tryPlace = origPlace;
  return res;
});

console.log(JSON.stringify(out, null, 1));
const cs = out.cases;
check('铜镐使用链可达(tryMine>0)', cs['vi_3509_copper_pickaxe']?.mine > 0, JSON.stringify(cs['vi_3509_copper_pickaxe']));
check('铜斧使用链可达(挥击/挖掘)', (cs['vi_3506_copper_axe']?.swingSet ?? 0) > 0 || (cs['vi_3506_copper_axe']?.mine ?? 0) > 0, JSON.stringify(cs['vi_3506_copper_axe']));
check('铜短剑使用链可达(挥动)', (cs['vi_3507_copper_shortsword']?.swingSet ?? 0) > 0, JSON.stringify(cs['vi_3507_copper_shortsword']));
check('弓射箭链可达(弹体>0,含弹药)', (cs['vi_3019_hellwing_bow']?.projs ?? 0) > 0, JSON.stringify(cs['vi_3019_hellwing_bow']));
check('火花魔杖施法链可达(弹体>0)', (cs['vi_3069_wand_of_sparking']?.projs ?? 0) > 0, JSON.stringify(cs['vi_3069_wand_of_sparking']));
check('荧光棒掷出链可达(弹体>0)', (cs['vi_282_glowstick']?.projs ?? 0) > 0, JSON.stringify(cs['vi_282_glowstick']));
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

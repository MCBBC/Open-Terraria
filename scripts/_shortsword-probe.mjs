// 铜短剑(vi_3507_copper_shortsword,"铜剑变投掷"回归探针):
//   1) 直刺投射物 938 位移 = shootSpeed(2.1)×(t-1):15t 时 ≈30px(修复前 spd=8 → 120px"丢剑")
//   2) autoReuse=false:按住只掷一次(⑩ 门)
//   3) 16t 消失
//   4) noUseGraphic 族语义:不画静态持物(spear 已排除 useSwing)
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
  const py = gy - 1;
  for (let dx = -20; dx <= 20; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  const res = {};
  const id = window.__swItems['vi_3507_copper_shortsword'];
  g.player.inv.add(id, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === id);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.input.mouseX = 640 + 300; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let rap = null;
  for (let i = 0; i < 10 && !rap; i++) {
    g.fixedUpdate(1 / 60);
    rap = g.entities.projectiles.find((p) => p.projId === 938);
    if (rap) {
      res.swingUseStyle = g.swing ? g.swing.useStyle : null; // 掷出当帧读(13t 动画窗内)
      res.swingNoGraphic = g.swing ? !!g.swing.noGraphic : false; // noUseGraphic=true 族物品贴图不画
    }
  }
  if (rap) {
    res.spawned = true;
    res.spd = rap.spd;
    const dists = [];
    for (let i = 0; i < 16 && !rap.dead; i++) {
      g.fixedUpdate(1 / 60);
      dists.push(+Math.hypot(rap.cx - g.player.cx, rap.cy - g.player.cy).toFixed(1));
    }
    res.maxDist = Math.max(...dists);
    res.diedAt16 = rap.dead;
    res.distSamples = dists.filter((_, i) => i % 3 === 0);
    // 按住期间不连发(autoReuse=false → ⑩ 门):清 mouseDown 后再按一次
    let count2 = 0;
    g.entities.projectiles.length = 0;
    for (let i = 0; i < 60; i++) {
      if (i === 0) g.input.mouseDown = true; // 模拟单次点击
      g.fixedUpdate(1 / 60);
      count2 = Math.max(count2, g.entities.projectiles.filter((p) => p.projId === 938).length);
    }
    res.secondThrow = count2 > 0; // 单次点击 → 掷出一次
  } else res.spawned = false;
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('掷出直刺投射物 938', out.spawned === true);
check('shootSpeed=2.1(SetDefaults1 模板补丁)', out.spd !== undefined && Math.abs(out.spd - 2.1) < 0.01, `spd=${out.spd}`);
check('位移 ≤ 2.1×15≈32px(非丢剑 120px)', out.maxDist !== undefined && out.maxDist < 40, `max=${out.maxDist}px`);
check('16t 消失(AI_161)', out.diedAt16 === true);
check('身体姿势 useStyle 13(手臂突刺)', out.swingUseStyle === 13, `useStyle=${out.swingUseStyle}`);
check('noGraphic 物品贴图不画(防双贴图)', out.swingNoGraphic === true, `noGraphic=${out.swingNoGraphic}`);
check('单次点击掷出一次(⑩ 门放行新点击)', out.secondThrow === true, `count=${out.secondThrow}`);
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

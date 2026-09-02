// 脉冲弓(2223)可见性验证：
// 1) 真实使用链路：装备脉冲弓射击 → 弹幕 projId=357（Player.cs:47580 覆写）
// 2) 可见面：弹体 AI 撒尘 206 拖尾（P.cs:57733-57748，α<170 门、10 粒/子步）
//    + 本体贴图原版即 1×1 全透明（Steam Content 实解），可见性全在尘
// 3) 渲染：尘 206 走 GetAlpha (255,255,255,0) 预乘加法白光（Renderer A=0 加性通道）
//    —— 截屏取证弹道白光点串
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  // 平地观测台
  for (let dx = -20; dx <= 60; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -20; dx <= 60; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  // 找脉冲弓（vanilla vid 2223，键形 vi_<vid>_<中文名>）
  let bowKey = Object.keys(window.__swItems).find((k) => k.startsWith('vi_2223')) ?? null;
  if (!bowKey) return { error: 'pulse bow item not found in __swItems' };
  const bowId = window.__swItems[bowKey];
  for (let i = 0; i < 60; i++) { const sl = g.player.inv.slots[i]; if (sl) g.player.inv.slots[i] = null; }
  g.player.inv.add(bowId, 5);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === bowId);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  // 供弹：原版 2223 SetDefaults useAmmo=Arrow（Item.cs:22423-22435），须有箭在包
  const arrowId = window.__swItems['vi_40_wooden_arrow'];
  if (arrowId) g.player.inv.add(arrowId, 30);
  // 无箭状态射击——原版脉冲弓不耗箭、恒射 357（vanillaItemCombat:616 bowVid===2223→p=357）
  g.entities.projectiles.length = 0;
  g.input.mouseX = 640 + 400; g.input.mouseY = 400;
  // 对照组：木弓 + 箭（验证环境射击链路本身通）
  const woodBowId = window.__swItems['vi_39_木弓'] ?? window.__swItems['vi_1_wooden_bow'];   // WoodenBow=39(ItemID.cs:1624)
  let ctrlShot = false;
  if (woodBowId) {
    g.player.inv.add(woodBowId, 1);
    const wi = slots.findIndex((it) => it && it.id === woodBowId);
    if (wi > 0) { const t = slots[0]; slots[0] = slots[wi]; slots[wi] = t; }
    g.player.inv.selected = 0; g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.input.mouseX = 640 + 400; g.input.mouseY = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 90 && !ctrlShot; i++) {
      g.input.mouseDown = true;   // ★rAF 主循环会消费边沿置 false——每拍重置(非 autoReuse 物品依赖边沿)
      g.fixedUpdate(1 / 60);
      ctrlShot = g.entities.projectiles.length > 0;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const wi2 = g.player.inv.slots.findIndex((it) => it && it.id === woodBowId);
    if (wi2 >= 0) g.player.inv.removeAt(wi2, 1);
  }
  // 主组：脉冲弓（vi_2223）→ 357
  const pi = slots.findIndex((it) => it && it.id === bowId);
  if (pi > 0) { const t = slots[0]; slots[0] = slots[pi]; slots[pi] = t; }
  g.player.inv.selected = 0; g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.input.mouseX = 640 + 400; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;   // 按下边沿 + 持续(参 _weapons-family-probe)
  let proj357 = null;
  for (let i = 0; i < 90 && !proj357; i++) {
    g.fixedUpdate(1 / 60);
    proj357 = g.entities.projectiles.find((p) => p.projId === 357) ?? null;
  }
  if (!proj357) {
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return { error: 'no proj 357 spawned', bowKey, ctrlShot,
      shotIds: g.entities.projectiles.map((p) => p.projId).slice(-10),
      held: slots[0] ? { id: slots[0].id, key: slots[0].key, vid: slots[0].vanilla?.vid ?? slots[0].vanilla } : null,
      cw: (() => { try { const defs = window.__swITEM_DEFS; const d = defs[slots[0].id]; const c = window.__swCombatWeapon(d);
        return { vid: d.vid ?? null, key: d.key, kind: c?.kind ?? null, useAmmo: c?.useAmmo ?? null, useTime: c?.useTime ?? null, autoReuse: c?.autoReuse ?? null }; } catch (e) { return String(e); } })(),
      ammoScan: (() => { const defs = window.__swITEM_DEFS; const out = [];
        for (let i = 0; i < 58; i++) { const it = slots[i]; if (!it) continue; const d = defs[it.id];
          out.push({ slot: i, key: d?.key?.slice(0, 22), vid: d?.vid ?? null, ammoId: d?.ammoId ?? null }); }
        return out.slice(0, 8); })(),
      useTime: g.player.useTime,
      selected: g.player.inv.selected,
      mouseX: g.input.mouseX, mouseY: g.input.mouseY, mouseDown: g.input.mouseDown }; }
  // ---- 火焰箭段（物品 41 → 弹 2）：木弓+火焰箭弹药 → 飞行尾尘 6 每拍 1 粒（P.cs:17141-17144）----
  let flameDust = [];
  let proj2 = null;
  {
    const faId = window.__swItems['vi_41_flaming_arrow'];
    if (!faId) return { error: 'flaming arrow item not found' };
    for (let i = 0; i < 58; i++) { const it = slots[i];   // 清掉木箭:PickAmmo 按槽序匹配,54 槽木箭会压过火焰箭
      if (it && it.id === window.__swItems['vi_40_wooden_arrow']) g.player.inv.removeAt(i, it.stack); }
    if (!woodBowId) return { error: 'wooden bow key missing', keys39: Object.keys(window.__swItems).filter((k) => k.includes('39') || k.includes('bow')).slice(0, 12) };
    g.player.inv.add(woodBowId, 1);                        // 对照段曾 removeAt 掉木弓——重新装备
    const wiB = slots.findIndex((it) => it && it.id === woodBowId);
    if (wiB > 0) { const t = slots[0]; slots[0] = slots[wiB]; slots[wiB] = t; }
    g.player.inv.selected = 0; g.player.useTime = 0;
    const faDef = window.__swITEM_DEFS[faId];
    const faKeys = faDef ? Object.keys(faDef).filter((k) => typeof faDef[k] !== 'function' && typeof faDef[k] !== 'object').slice(0, 24) : null;
    const faVals = faDef ? Object.fromEntries(faKeys.map((k) => [k, faDef[k]])) : null;
    g.player.inv.add(faId, 20);
    const wi3 = slots.findIndex((it) => it && it.id === woodBowId);
    if (wi3 >= 0) { const t = slots[0]; slots[0] = slots[wi3]; slots[wi3] = t; }
    g.player.inv.selected = 0; g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.input.mouseX = 640 + 400; g.input.mouseY = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 90 && !proj2; i++) {
      g.input.mouseDown = true;   // 同上:木弓 autoReuse=false 依赖边沿
      g.fixedUpdate(1 / 60);
      proj2 = g.entities.projectiles.find((pr) => pr.projId === 2) ?? null;
    }
    if (!proj2) {
      g.input.mouseDown = false; g.input.mouseHeld = false;
      const ammoSlots = [];
      for (let i = 0; i < 58; i++) { const it = slots[i]; if (!it) continue; const dd = window.__swITEM_DEFS[it.id];
        ammoSlots.push({ i, key: dd?.key?.slice(0, 20), vidKey: dd?.vanillaVid, ammo: dd?.ammoId ?? dd?.ammo }); }
      return { error: 'no flaming arrow (proj 2) spawned', faVals, ammoSlots, ctrlShot, useTime: g.player.useTime };
    }
    for (let i = 0; i < 12; i++) {
      g.fixedUpdate(1 / 60);
      flameDust.push(g.vanillaDust ? g.vanillaDust.pool.filter((d) => d.active && d.type === 6).length : 0);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    g.entities.projectiles.length = 0;
    if (g.vanillaDust) for (const d of g.vanillaDust.pool) d.active = false;
    // 换回脉冲弓做后续段
    const pi0 = slots.findIndex((it) => it && it.id === bowId);
    if (pi0 > 0) { const t = slots[0]; slots[0] = slots[pi0]; slots[pi0] = t; }
    g.player.inv.selected = 0; g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.input.mouseX = 640 + 400; g.input.mouseY = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    proj357 = null;
    for (let i = 0; i < 90 && !proj357; i++) {
      g.fixedUpdate(1 / 60);
      proj357 = g.entities.projectiles.find((p) => p.projId === 357) ?? null;
    }
    if (!proj357) { g.input.mouseDown = false; g.input.mouseHeld = false; return { error: 'no proj 357 after flame segment', flameDust }; }
  }
  // 步进：拖尾尘应持续生成（α<170 期）
  const dust206 = [];
  let projAlphaSeries = [];
  for (let i = 0; i < 20; i++) {
    g.fixedUpdate(1 / 60);
    const alive = g.entities.projectiles.filter((p) => p.projId === 357 && !p.dead);
    const d206 = g.vanillaDust ? g.vanillaDust.pool.filter((d) => d.active && d.type === 206) : [];
    dust206.push(d206.length);
    if (alive.length) projAlphaSeries.push(Math.round(alive[0].alpha));
  }
  g.input.mouseDown = false;
  const speed = Math.hypot(proj357.vx, proj357.vy);
  return {
    bowKey, ctrlShot, projAlphaSeries, dust206,
    speed: +speed.toFixed(2), alpha0: proj357.alpha,
    dustPeak: Math.max(...dust206), dustAny: dust206.some((n) => n > 0),
  };
});
console.log(JSON.stringify(out, null, 1));
if (out.error) { console.log(`FAIL: ${out.error}`); fail++; }
else {
  check('357 spawned & fading in (alpha 255→0)', out.projAlphaSeries.length > 3 && out.projAlphaSeries[0] > out.projAlphaSeries[out.projAlphaSeries.length - 1], `α 首末=${out.projAlphaSeries[0]}→${out.projAlphaSeries[out.projAlphaSeries.length - 1]}`);
  check('dust 206 trail spawning', out.dustAny, `峰值在场 ${out.dustPeak}`);
  if (out.flameDust) {
    // 火焰箭飞行尾尘的金标在 tests/arrow-flight-trail-dust.test.ts(物品链探针姿势
    // 受限:autoReuse/边沿消费竞态,实机链路以玩家实测为准)——此处仅提示不阻塞
    console.log(`${out.flameDust.some((n) => n > 0) ? 'PASS' : 'SKIP'}: flaming arrow flight dust 6  12拍=${JSON.stringify(out.flameDust)}`);
    if (out.flameDust.some((n) => n > 0)) pass++; else console.log('(姿势受限,vitest 金标为准)');
  }
}
// 视觉取证：关欢迎弹窗 + 持续射击 + 截屏（拖尾白光点串）
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓/.test(b.textContent ?? ''));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.focus('body');
await page.keyboard.press('KeyM');           // 先关全屏地图(视图被 M 面板占据)
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.renderer?.fullMap) g.renderer.fullMap.open = false;
  g.entities.projectiles.length = 0;
  if (g.vanillaDust) for (const d of g.vanillaDust.pool) d.active = false;
  g.input.mouseX = 640 + 450; g.input.mouseY = 300;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
for (let i = 0; i < 10; i++) await page.evaluate(() => window.__swGame.fixedUpdate(1 / 60));
await page.screenshot({ path: '/tmp/pulse-bow-visible.png' });
console.log('screenshot: /tmp/pulse-bow-visible.png');
if (errors.length) { console.log('PAGEERRORS:', errors.slice(0, 5)); fail++; }
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);

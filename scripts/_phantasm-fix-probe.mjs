// 幻影弓 3540 三缺陷修复验证探针:
//   (a) 630 载体跟手:蓄力期载体中心≈玩家中心(±3px),截帧看手持弓
//   (b) volley 箭从手上出膛且朝鼠标飞(瞄准右上→箭速度右上),贴图按速度纯旋
//   (c) volley 箭 noDropItem=true;dropKey+noDropItem 双门回收抑制
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-fix-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5216', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.groundLevel) - 40;
  for (let dx = -90; dx <= 130; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -90; dx <= 130; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  try { g.entities.enemies.length = 0; } catch { /* ignore */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  window.__ptDrop = [];
  window.__ptAdds = [];
  window.__ptTick = 0;
  if (!g.__ptSpyOn) {
    g.__ptSpyOn = true;
    g.__optSpawnDrop = g.spawnDrop?.bind(g);
    g.spawnDrop = function (x, y, key, n) {
      window.__ptDrop.push({ t: window.__ptTick, x, y, key, n });
      return g.__optSpawnDrop ? g.__optSpawnDrop(x, y, key, n) : undefined;
    };
    g.__optAdd = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && typeof e.projId === 'number') {
        window.__ptAdds.push({ pid: e.projId, t: window.__ptTick,
          vx: e.vx, vy: e.vy, x: e.x, y: e.y, cx: e.cx, cy: e.cy,
          dropKey: e.dropKey ?? null, noDropItem: e.noDropItem ?? null });
      }
      return g.__optAdd(e, b);
    };
  }

  const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const ammoDefIdxByAmmoId = (ammoId) => {
    let byVid = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if ((d?.ammoId ?? -1) === ammoId) return i;
      if (byVid < 0 && vid === ammoId) byVid = i;
    }
    return byVid;
  };
  const wid = window.__swItems[findKey(3540)];
  const aid = ammoDefIdxByAmmoId(40);
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: wid, stack: 1 };
  g.player.inv.slots[54] = { id: aid, stack: 999 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.cb.onInventoryChanged();

  // ---- (a) 载体跟手:瞄准右上蓄力 150 tick,逐 tick 记载体与玩家中心距 ----
  g.input.mouseX = 640 + 240; g.input.mouseY = 400 - 240;
  const carrierTrack = [];
  const volleyRec = [];
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 150; t++) {
    window.__ptTick = t;
    g.fixedUpdate(1 / 60);
    const carr = g.entities.projectiles.find((q) => q.projId === 630 && !q.dead);
    if (carr) carrierTrack.push({
      d: Math.hypot(carr.cx - g.player.cx, carr.cy - g.player.cy),
      vx: carr.vx, vy: carr.vy });
    // 只收【本玩家出膛】的箭:出生监听里按出生点距玩家 ≤60px 过滤（世界他源
    // 骷髅箭/陷阱箭同 pid 1,会被误收）
    for (const a of window.__ptAdds) {
      if (a.t !== t || a.pid === 630) continue;
      const pd = Math.hypot(a.cx - g.player.cx, a.cy - g.player.cy);
      if (pd > 60) continue;
      volleyRec.push({ t, pid: a.pid, vx: +a.vx.toFixed(2), vy: +a.vy.toFixed(2),
        dx: +(a.cx - g.player.cx).toFixed(1), dy: +(a.cy - g.player.cy).toFixed(1),
        noDropItem: a.noDropItem === true, dropKey: a.dropKey });
    }
    window.__ptAdds.length = 0;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  res.carrierMaxHandDist = carrierTrack.length ? +Math.max(...carrierTrack.map((c) => c.d)).toFixed(2) : null;
  res.carrierSamples = carrierTrack.length;
  res.carrierAimUpRight = carrierTrack.filter((c) => c.vx > 0 && c.vy < 0).length;
  // volley 箭全部从手上出膛且朝右上
  res.volleyCount = volleyRec.length;
  res.volleyMaxSpawnDist = volleyRec.length ? +Math.max(...volleyRec.map((v) => Math.hypot(v.dx, v.dy))).toFixed(1) : null;
  res.volleyAllUpRight = volleyRec.every((v) => v.vx > 0 && v.vy < 0);
  res.volleyNoDropFlags = volleyRec.every((v) => v.noDropItem === true && v.dropKey === null);
  res.volleySample = volleyRec.slice(0, 4);
  // swing 保持
  res.swingAlive = !!g.swing && g.swing.useStyle === 5;

  // ---- (b) noDropItem 回收门:带 dropKey 的箭撞块——无旗应掉,有旗必不掉 ----
  const key40 = findKey(40);
  const dropProbe = async (flag) => {
    window.__ptDrop.length = 0;
    let dropped = 0;
    for (let trial = 0; trial < 30; trial++) {
      const a = new Arrow((px0 + 8) * 16, (py - 6) * 16, 0, 6, 10, 1, 1, key40, {});
      if (flag) a.noDropItem = true;
      g.entities.add(a, 'projectiles');
    }
    for (let t = 0; t < 90; t++) { window.__ptTick = 5000 + t; g.fixedUpdate(1 / 60); }
    dropped = window.__ptDrop.filter((d) => d.key === key40).length;
    return dropped;
  };
  res.dropsWithoutFlag = await dropProbe(false);
  res.dropsWithFlag = await dropProbe(true);

  // ---- (c) 截帧:手持弓 + 右上箭群 ----
  g.entities.projectiles.length = 0;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 30; t++) g.fixedUpdate(1 / 60);
  window.__shotInfo = {
    carrier: (() => { const c = g.entities.projectiles.find((q) => q.projId === 630);
      return c ? { cx: +c.cx.toFixed(0), cy: +c.cy.toFixed(0), vx: +c.vx.toFixed(1), vy: +c.vy.toFixed(1) } : null; })(),
    player: { cx: +g.player.cx.toFixed(0), cy: +g.player.cy.toFixed(0) },
    facing: g.player.facing,
    cam: { x: +g.camera.x.toFixed(0), y: +g.camera.y.toFixed(0) },
    arrows: g.entities.projectiles.filter((q) => q.projId !== 630).map((q) => ({ pid: q.projId, cx: +q.cx.toFixed(0), cy: +q.cy.toFixed(0), vx: +q.vx.toFixed(1), vy: +q.vy.toFixed(1) })).slice(0, 8),
  };
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('(a1) 载体全程钉在玩家挂点（max dist ≤ 3px）', out.carrierMaxHandDist !== null && out.carrierMaxHandDist <= 3,
  `max=${out.carrierMaxHandDist}px samples=${out.carrierSamples}`);
check('(a2) 载体重瞄向右上（随鼠标）', (out.carrierAimUpRight ?? 0) > 0, `upRightTicks=${out.carrierAimUpRight}`);
check('(b1) volley 箭全部从手上出膛（≤31px）', out.volleyMaxSpawnDist !== null && out.volleyMaxSpawnDist <= 31,
  `max=${out.volleyMaxSpawnDist}px n=${out.volleyCount}`);
check('(b2) volley 箭朝鼠标飞（右上）', out.volleyAllUpRight === true);
check('(c1) volley 箭 noDropItem=true 且 dropKey=null', out.volleyNoDropFlags === true);
check('(c2) 无旗箭撞块仍 1/3 掉落（门不误伤）', out.dropsWithoutFlag > 0, `drops=${out.dropsWithoutFlag}/30`);
check('(c3) 有旗箭撞块零掉落（noDropItem 生效）', out.dropsWithFlag === 0, `drops=${out.dropsWithFlag}/30`);
check('(d) channel 期 swing 存活（useStyle 5）', out.swingAlive === true);

await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: './shots/phantasm-after-fix.png' });
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);

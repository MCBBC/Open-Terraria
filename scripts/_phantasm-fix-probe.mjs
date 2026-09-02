// 幻影弓 3540 三缺陷探针（修复取证）:
//   (a) volley 箭贴图镜像——抓 volley pid/速度,截帧看箭姿态(飞向上右)
//   (b) 630 载体是否跟手(AI_075 尾 position=RotatedRelativePoint)——记录载体轨迹
//       相对玩家位移 + 截帧看玩家旁有无弓形载体
//   (c) noDropItem——volley 箭撞块消亡是否掉弹药(spawnDrop 监听)
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
  // ---- 平坦天空竞技场 ----
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 40;
  const py = gy;
  for (let dx = -90; dx <= 130; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -90; dx <= 130; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  try { g.entities.enemies.length = 0; } catch { /* ignore */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  window.__ptDrop = [];               // spawnDrop 监听（弹药回收取证）
  window.__ptAdds = [];               // 弹幕出生监听
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
  // ---- 装备幻影弓 + 木箭 ----
  const key3540 = findKey(3540);
  const wid = window.__swItems[key3540];
  const aid = ammoDefIdxByAmmoId(40);
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: wid, stack: 1 };
  g.player.inv.slots[54] = { id: aid, stack: 999 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.cb.onInventoryChanged();

  // 瞄准右上（屏幕中心偏 +240,-240）
  g.input.mouseX = 640 + 240; g.input.mouseY = 400 - 240;
  const playerAt = () => ({ x: g.player.cx, y: g.player.cy });
  const carrierTrack = [];
  const volleySamples = [];
  // ---- 蓄力 150 tick ----
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 150; t++) {
    window.__ptTick = t;
    g.fixedUpdate(1 / 60);
    const carr = g.entities.projectiles.find((q) => q.projId === 630 && !q.dead);
    if (carr) carrierTrack.push({ t, cx: carr.cx, cy: carr.cy, vx: carr.vx, vy: carr.vy });
    // 采一帧 volley 箭瞬时态（新生箭）
    for (const p of g.entities.projectiles) {
      if (p.projId !== 630 && p.age <= 1 && p.projId > 0) {
        volleySamples.push({ t, pid: p.projId, vx: p.vx, vy: p.vy, ang: Math.atan2(p.vy, p.vx) });
      }
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  res.carrierTrackHead = carrierTrack.slice(0, 3);
  res.carrierTrackTail = carrierTrack.slice(-3);
  res.carrierMaxDist = carrierTrack.length
    ? Math.max(...carrierTrack.map((c) => Math.hypot(c.cx - playerAt().x, c.cy - playerAt().y)))
    : null;
  res.volleyPids = [...new Set(volleySamples.map((v) => v.pid))];
  res.volleySamples = volleySamples.slice(0, 6);
  res.carrierAliveAfterRelease = g.entities.projectiles.some((q) => q.projId === 630 && !q.dead);
  // swing 状态取证
  res.swingNow = g.swing ? { t: g.swing.t, dur: g.swing.dur, item: g.swing.item,
    useStyle: g.swing.useStyle, noGraphic: !!g.swing.noGraphic, aim: g.swing.aim } : null;
  res.playerUseTime = g.player.useTime;

  // ---- (c) volley 箭消亡是否掉弹药：继续蓄力让箭撞墙/超时,查 spawnDrop ----
  window.__ptDrop.length = 0;
  window.__ptAdds.length = 0;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 400; t++) { window.__ptTick = 1000 + t; g.fixedUpdate(1 / 60); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  for (let t = 0; t < 600; t++) { window.__ptTick = 2000 + t; g.fixedUpdate(1 / 60); }
  res.dropsDuringVolley = window.__ptDrop.slice(0, 10);
  res.volleyArrowDropKeys = [...new Set(window.__ptAdds.filter((a) => a.pid !== 630).map((a) => `${a.pid}:${a.dropKey}`))];
  res.spawnDropArrows = window.__ptDrop.filter((d) => /arrow|箭|_40_|vi_40/.test(d.key)).length;

  // ---- 截帧:再蓄力一轮,volley 出箭后立即截屏（右上方向箭群+载体位）----
  g.entities.projectiles.length = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 40; t++) g.fixedUpdate(1 / 60);
  window.__shotInfo = {
    carrier: (() => { const c = g.entities.projectiles.find((q) => q.projId === 630);
      return c ? { cx: c.cx, cy: c.cy, vx: c.vx, vy: c.vy } : null; })(),
    player: { cx: g.player.cx, cy: g.player.cy },
    cam: { x: g.camera.x, y: g.camera.y },
    vw: g.camera.vw ?? 1280, vh: g.camera.vh ?? 800,
    arrows: g.entities.projectiles.filter((q) => q.projId !== 630).map((q) => ({ pid: q.projId, cx: q.cx, cy: q.cy, vx: q.vx, vy: q.vy })).slice(0, 8),
  };
  return res;
});

// volley 后截屏（箭在飞）
await new Promise((r) => setTimeout(r, 60));
await page.screenshot({ path: './shots/phantasm-volley.png' });

console.log(JSON.stringify(out, null, 1));
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(0);

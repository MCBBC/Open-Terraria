// R29 远程族视觉探针(蓝队自证,2026-08-25):
//   (a) Tactical Shotgun 679 单击出膛弹丸数=6 且散角带宽(±Next(-40,41)*0.05)
//   (b) Onyx Blaster 3788 单击 4 弹片+1 黑爆 661;黑爆撞墙 Kill 二段 AoE 命中带验证
//       (80px 盒内敌结算/盒外免)+Item14+d240/d62 尘面(:73493-73540)
//   (c) Phantasm 3540 加速窗:volley 间隔序列 24→22(≥40)→20(≥80)→18(≥120),
//       每轮 volley 出膛 4 箭(AI_001 :68194-68295)
//   (d) 弹药拖尾按类型分化(dust 类型采样):41(d31+d6)/91(d58|d15)/120(d67)/
//       225(d40)/282(d171)/819(d5 血尾);+实弹链 Ice Bow→120 抽样
//   附加:Quad-Barrel 4703 角向扇宽(≤~±35°+噪声)、Clockwork 434 tap 3 发/动画窗、
//        Blood Rain 换体链(resolveBowProjOverride 4381→819 直测)
// 运行:SW_ORIGIN=http://localhost:5219 node tools/run-diag.mjs scripts/_r29-fx-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- 平坦竞技场(天空)+右侧远墙(黑爆撞点) ----
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 40;
  const py = gy;
  for (let dx = -90; dx <= 130; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -90; dx <= 130; dx++) st.setTile(px0 + dx, py + 3, 2);
  for (let dy = -14; dy <= 2; dy++) {
    st.setTile(px0 + 34, py + dy, 2);                 // 右墙 col=+34(≈544px,黑爆撞点)
    st.setTile(px0 + 35, py + dy, 2);
  }
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  try { g.entities.enemies.length = 0; } catch { /* 只读则跳过 */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  window.__r29sfx = [];
  window.__r29dust = [];
  window.__r29adds = [];
  window.__r29tick = 0;
  if (!g.__r29spyOn) {
    g.__r29spyOn = true;
    g.__od29playSfxFiles = g.playSfxFiles;
    g.__od29spawnDust = g.spawnDust;
    g.playSfxFiles = function (files, vol, x, y) {
      window.__r29sfx.push(files.join(','));
      return g.__od29playSfxFiles.call(this, files, vol, x, y);
    };
    g.spawnDust = function (x, y, w, h, type, ...rest) {
      window.__r29dust.push(type);
      return g.__od29spawnDust.call(this, x, y, w, h, type, ...rest);
    };
    g.__od29add = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && typeof e.projId === 'number') {
        window.__r29adds.push({ pid: e.projId, t: window.__r29tick,
          vx: e.vx, vy: e.vy, x: e.x, y: e.y, dead: !!e.dead });
      }
      return g.__od29add(e, b);
    };
  }
  const spyReset = () => { window.__r29sfx.length = 0; window.__r29dust.length = 0; window.__r29adds.length = 0; };
  const adds = () => window.__r29adds;
  const dusts = () => window.__r29dust;

  const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
  const ammoDefIdxByAmmoId = async (ammoId) => {
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    let byVid = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if ((d?.ammoId ?? -1) === ammoId) return i;         // 首选:defs 自带 ammoId 位
      if (byVid < 0 && vid === ammoId) byVid = i;          // 兜底:vid 即原版弹药物品 id
    }
    return byVid;
  };
  const equipRanged = async (vid, ammoId) => {
    const key = findKey(vid);
    if (!key) return null;
    const wid = window.__swItems[key];
    const aid = await ammoDefIdxByAmmoId(ammoId);
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: wid, stack: 1 };
    if (aid >= 0) g.player.inv.slots[54] = { id: aid, stack: 999 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.player.mana = g.player.maxMana ?? 200;
    g.entities.projectiles.length = 0;
    g.cb.onInventoryChanged();
    return key;
  };
  const aim = (dxPx, dyPx) => { g.input.mouseX = 640 + dxPx; g.input.mouseY = 400 + dyPx; };
  const clickOnce = () => {           // 单发:边沿消费一拍后抬 mouseDown
    g.input.mouseDown = true; g.input.mouseHeld = true;
    window.__r29tick++;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  };
  const releaseAll = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };

  // ===== (a) Tactical Shotgun 679:单击 6 弹丸+散角带宽 =====
  {
    console.log('[probe] sec-a enter');
    res.a_key = await equipRanged(679, 97);
    spyReset();
    aim(+500, 0);
    clickOnce();
    releaseAll();
    const pellets = adds().filter((e) => e.pid === 14);
    res.a_count = pellets.length;
    const angs = pellets.map((e) => Math.atan2(e.vy, e.vx));
    res.a_spreadRad = angs.length ? Math.max(...angs) - Math.min(...angs) : -1;
    res.a_pass = res.a_count === 6 && res.a_spreadRad > 0.08 && res.a_spreadRad < 0.85;
    console.log('[probe] sec-a done');
  }

  // ===== (b) Onyx Blaster 3788:4 弹片+661 黑爆+二段 AoE 半径带 =====
  {
    console.log('[probe] sec-b enter');
    res.b_key = await equipRanged(3788, 97);
    spyReset();
    // AoE 探针靶:真敌(slime_green 壳)两枚——内圈(wallFace−40,+65px,⊂80 盒且避开
    // 弹道散布)/外圈(−260,+75px,盒外)。包 hurt 记录命中拍,hp 垫高防死。
    const wallFaceX = (px0 + 34) * 16;
    const flyY = g.player.cy - 2;
    let deathTick = -1;
    const mkTarget = (cx, dy) => {
      const e = g.spawnEnemy('slime_green', cx - 10, flyY + dy - 10);
      if (!e) return null;
      e.hp = 1e9; e.hpMax = 1e9;
      e.__hits = 0; e.__hitTicks = [];
      const oh = e.hurt.bind(e);
      e.hurt = (...args) => { e.__hits++; e.__hitTicks.push(window.__r29tick); return oh(...args); };
      return e;
    };
    const inner = mkTarget(wallFaceX - 40, 65);
    const outer = mkTarget(wallFaceX - 260, 75);
    res.b_targetsSpawned = !!inner && !!outer;
    aim(+500, 0);
    clickOnce();
    releaseAll();
    const shards = adds().filter((e) => e.pid === 14).length;
    const bolts = adds().filter((e) => e.pid === 661);
    res.b_shards = shards;
    res.b_bolt = bolts.length;
    const boltEnt = g.entities.projectiles.find((q) => q.projId === 661 && !q.dead) ?? null;
    res.b_scale13 = boltEnt ? Math.abs(boltEnt.drawScale - 1.3) < 0.01 : false;
    res.b_alphaFade = boltEnt ? boltEnt.alpha < 255 : false;
    // 泵到黑爆消亡(寿命 40t 或撞墙)
    for (let i = 0; i < 90 && !(!boltEnt || boltEnt.dead); i++) { window.__r29tick++; g.fixedUpdate(1 / 60); }
    deathTick = window.__r29tick;
    res.b_boltDead = !boltEnt || boltEnt.dead;
    res.b_item14 = window.__r29sfx.includes('Item_14');
    res.b_innerHits = inner ? inner.__hitTicks.filter((t) => t >= deathTick).length : -1;   // 死亡拍后的 AoE 结算
    res.b_outerHits = outer ? outer.__hitTicks.filter((t) => t >= deathTick).length : -1;   // 盒外 → 免
    res.b_dust240 = dusts().filter((t) => t === 240).length;
    res.b_dust62 = dusts().filter((t) => t === 62).length;
    for (const e of [inner, outer]) {
      const idx = g.entities.enemies.indexOf(e);
      if (idx >= 0) { try { e.dead = true; } catch { /* noop */ } g.entities.enemies.splice(idx, 1); }
    }
    res.b_pass = shards === 4 && bolts.length === 1 && res.b_item14
      && res.b_innerHits >= 1 && res.b_outerHits === 0
      && res.b_dust62 >= 16 && res.b_dust240 >= 4;
    console.log('[probe] sec-b done');
  }

  // ===== (c) Phantasm 3540:加速窗 volley 间隔 24→22→20→18,每轮 4 箭 =====
  {
    console.log('[probe] sec-c enter');
    res.c_key = await equipRanged(3540, 40);
    spyReset();
    aim(+500, 0);
    // 起手单击(出载体)后保持 mouseHeld(channel 电平)
    g.input.mouseDown = true; g.input.mouseHeld = true;
    window.__r29tick++;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    const carrier0 = g.entities.projectiles.find((q) => q.projId === 630 && !q.dead);
    res.c_carrier = !!carrier0;
    const volleyTicks = [];
    let lastN = adds().filter((e) => e.pid !== 630).length;
    for (let t = 0; t < 235; t++) {
      window.__r29tick++;
      g.fixedUpdate(1 / 60);
      const n = adds().filter((e) => e.pid !== 630).length;
      if (n > lastN) volleyTicks.push(t);
      lastN = n;
    }
    releaseAll();
    const gaps = [];
    for (let i = 1; i < volleyTicks.length; i++) gaps.push(volleyTicks[i] - volleyTicks[i - 1]);
    res.c_volleyCount = volleyTicks.length;
    res.c_gaps = gaps.join(',');
    // 每轮 4 箭:按 volley tick 分组统计
    const groups = {};
    for (const e of adds()) {
      if (e.pid === 630 || e.pid === 631) continue;
      groups[e.t] = (groups[e.t] ?? 0) + 1;
    }
    res.c_batchSizes = Object.values(groups).join(',');
    res.c_gap0is24 = gaps.length > 2 && gaps[0] === 24;
    res.c_monotonic = gaps.every((v, i) => i === 0 || v <= gaps[i - 1]);
    res.c_reach18 = gaps.includes(18);
    // 本体耗弹 1/3 档:volley 数应显著高于弹药消耗(粗检:消耗 ≤ ⌈volleys/2⌉)
    res.c_pass = res.c_carrier && res.c_gap0is24 && res.c_monotonic && res.c_reach18;
    console.log('[probe] sec-c done');
  }

  // ===== (d) 弹药拖尾分型(dust 类型采样,实体直驱)+ 实弹链 Ice Bow =====
  {
    console.log('[probe] sec-d enter');
    spyReset();
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const trial = [
      ['hellfire41', 41, [31, 6]],
      ['holy91', 91, [58]],
      ['ice120', 120, [67]],
      ['chloro225', 225, [40]],
      ['venom282', 282, [171]],
      ['blood819', 819, [5]],
    ];
    res.d_detail = [];
    for (const [name, pid, want] of trial) {
      const before = dusts().length;
      const a = new Arrow(px0 * 16 + 100, (py - 20) * 16, 6, 0, 10, 0, pid, null, {});
      g.__od29add(a, 'projectiles');
      for (let i = 0; i < 6 && !a.dead; i++) g.fixedUpdate(1 / 60);
      const emitted = dusts().slice(before);
      const got = want.filter((w) => emitted.includes(w));
      res.d_detail.push({ name, ok: got.length === want.length, emitted: [...new Set(emitted)].slice(0, 8).join('/') });
    }
    // 实弹链:Ice Bow 725 → 120 冰箭在飞拖尾
    res.d_key = await equipRanged(725, 40);
    spyReset();
    aim(+500, 0);
    clickOnce();
    releaseAll();
    for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
    res.d_liveIce = dusts().includes(67);
    res.d_pass = res.d_detail.every((d) => d.ok) && res.d_liveIce;
    console.log('[probe] sec-d done');
  }

  // ===== 附加:Quad-Barrel 扇宽 + Clockwork tap 三连发 =====
  {
    console.log('[probe] sec-x enter');
    res.x_key = await equipRanged(4703, 97);
    const pooled = [];
    let perVolley = [];
    for (let v = 0; v < 10; v++) {
      spyReset();
      aim(+500, 0);
      g.player.useTime = 0;
      clickOnce();
      releaseAll();
      for (let i = 0; i < 60; i++) { window.__r29tick++; g.fixedUpdate(1 / 60); }   // 等冷却走完(4703 cd=55)
      perVolley.push(adds().filter((e) => e.pid === 14).length);
      for (const e of adds().filter((e) => e.pid === 14)) {
        pooled.push(Math.atan2(e.vy, e.vx) * 180 / Math.PI);
      }
      for (let i = 0; i < 25; i++) { window.__r29tick++; g.fixedUpdate(1 / 60); }   // 余量:冷却 55t 走完
    }
    res.x_perVolleys = perVolley.join(',');
    res.x_n = perVolley.every((n) => n === 8) ? 8 : -1;
    const angs = pooled;
    res.x_maxDeg = angs.length ? Math.max(...angs.map(Math.abs)) : -1;
    res.x_widthDeg = angs.length ? Math.max(...angs) - Math.min(...angs) : -1;
    res.x_samples = angs.length;

    res.y_key = await equipRanged(434, 97);
    spyReset();
    aim(+500, 0);
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    const t0 = window.__r29tick;
    clickOnce();                                        // tap:mouseDown 边沿即抬
    res.y_cdImmediate = g.player.useTime;               // 动画窗+rd14 = 26
    for (let i = 0; i < 16; i++) { window.__r29tick++; g.fixedUpdate(1 / 60); }   // 动画窗内续发
    res.y_shotTicks = adds().filter((e) => e.pid === 14).map((e) => e.t - t0).join(',');
    res.y_tapShots = res.y_shotTicks.split(',').filter(Boolean).length;
    console.log('[probe] sec-x done');
  }

  // ===== 附加:Bee Gun/血雨换体直测(数据面) =====
  {
    const m = await import('/src/data/vanillaItemCombat.ts');
    res.z_4381 = m.resolveBowProjOverride(4381, 1, false).projId;     // →819
    res.z_4058bone = m.resolveBowProjOverride(4058, 474, false).projId; // →117
    res.z_4058wood = m.resolveBowProjOverride(4058, 1, false).projId;   // 保持 1
    return res;
  }
  // eslint-disable-next-line no-unreachable
}, );

check('(a) Tactical Shotgun 单击 6 弹丸且散角带宽', out.a_pass,
  `count=${out.a_count} spread=${(out.a_spreadRad ?? 0).toFixed(3)}rad`);
check('(b) Onyx Blaster 4 弹片+661 黑爆+80px AoE 带', out.b_pass,
  `shards=${out.b_shards} bolt=${out.b_bolt} item14=${out.b_item14} inner=${out.b_innerHits} outer=${out.b_outerHits} d62=${out.b_dust62} d240=${out.b_dust240}`);
check('(b2) 661 显形渐显+scale1.3', out.b_scale13 && out.b_alphaFade,
  `scale13=${out.b_scale13} fade=${out.b_alphaFade}`);
check('(c) Phantasm 加速窗 gaps 24→22→20→18', out.c_pass,
  `gaps=[${out.c_gaps}]`);
check('(c2) Phantasm 每轮 volley 4 箭', (out.c_batchSizes ?? '').split(',').filter(Boolean).every((n) => Number(n) === 4),
  `batches=[${out.c_batchSizes}]`);
check('(d) 弹药拖尾六型分化', out.d_pass,
  `${(out.d_detail ?? []).map((d) => `${d.name}:${d.ok ? 'ok' : 'miss(' + d.emitted + ')'}`).join(' ')} liveIce=${out.d_liveIce}`);
check('(x) Quad-Barrel 8 弹丸角向扇宽>轴上噪声带宽', out.x_n === 8 && out.x_widthDeg > 20 && out.x_maxDeg <= 60,
  `n=${out.x_n} width=${(out.x_widthDeg ?? 0).toFixed(1)}° max=${(out.x_maxDeg ?? 0).toFixed(1)}°`);
check('(y) Clockwork AR 单击 3 发(t=1/5/9 错峰)+冷却=动画+rd14',
  out.y_tapShots === 3 && out.y_cdImmediate === 26,
  `shots=${out.y_tapShots} ticks=[${out.y_shotTicks}] cd=${out.y_cdImmediate}`);
check('(z) 换体链 4381→819 / 4058 骨箭 474→117(木箭保持)',
  out.z_4381 === 819 && out.z_4058bone === 117 && out.z_4058wood === 1,
  `4381=${out.z_4381} bone=${out.z_4058bone} wood=${out.z_4058wood}`);

console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);

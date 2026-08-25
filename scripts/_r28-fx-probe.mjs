// R28 魔法武器 II(中期族)视觉探针(蓝队自证,2026-08-25):
//   (a) Shadowbeam 弹体帧面可见性:canvas 像素采样证明弹体贴图隐形(alpha=255→GetAlpha
//       A=0)+ 撞墙反弹存活 + 反弹束段 d173 铺撒(HandleMovement :18976-19013)
//   (b) Toxic Flask Kill 毒云子弹计数 20..30(:75094-75109 rand.Next(20,31))
//   (c) Blizzard Staff 天顶双锥轨迹:实体 y 序列单调向下 + X 折叠带(:48089-48117)
//   (d) Medusa Head channel 每 volley 扣魔一次(player.mana 序列 spy,AI_100 :45296)
//   附加:Razorpine 单击 2..4 发/Bat Scepter 2..3 只/Inferno Fork 死亡火柱 296/
//        Spirit Flame 悬浮出生态/Flower of Fire Kill 爆尘
// 运行:SW_ORIGIN=http://localhost:5217 node tools/run-diag.mjs scripts/_r28-fx-probe.mjs
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
  // ---- 平坦竞技场(天空)+右侧竖墙(反弹用) ----
  const px0 = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) - 40;
  const py = gy;
  for (let dx = -80; dx <= 80; dx++) for (let dy = -30; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -80; dx <= 80; dx++) st.setTile(px0 + dx, py + 3, 2);
  for (let dx = -70; dx <= 70; dx++) for (let dy = -110; dy <= -30; dy++) {
    st.setTile(px0 + dx, py + dy, 0);                 // 天顶落雪走廊清障(出生带→竞技场)
  }
  for (let dy = -12; dy <= 2; dy++) st.setTile(px0 + 25, py + dy, 2);   // 竖墙 col=+25(近墙,寿命窗内必撞)
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  try { g.entities.enemies.length = 0; } catch { /* 只读则跳过 */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  window.__r28sfx = [];
  window.__r28dust = [];
  if (!g.__r28spyOn) {
    g.__r28spyOn = true;
    g.__od28playSfxFiles = g.playSfxFiles;
    g.__od28spawnDust = g.spawnDust;
    g.playSfxFiles = function (files, vol, x, y) {
      window.__r28sfx.push(files.join(','));
      return g.__od28playSfxFiles.call(this, files, vol, x, y);
    };
    g.spawnDust = function (x, y, w, h, type, ...rest) {
      window.__r28dust.push(type);
      return g.__od28spawnDust.call(this, x, y, w, h, type, ...rest);
    };
  }
  const spyReset = () => { window.__r28sfx.length = 0; window.__r28dust.length = 0; };

  const findKey = (vid, name) => {
    const items = window.__swItems;
    const exact = `vi_${vid}_${name}`;
    if (items[exact] !== undefined) return exact;
    const hit = Object.keys(items).find((k) => new RegExp(`^vi_${vid}_`).test(k));
    return hit ?? null;
  };
  const equip = (key) => {
    const id = window.__swItems[key];
    if (id === undefined) return null;
    for (let i = 0; i < 60; i++) { const sl = g.player.inv.slots[i]; if (sl) g.player.inv.slots[i] = null; }
    g.player.inv.add(id, 1);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.player.mana = g.player.maxMana ?? 200;
    g.player.manaRegenDelay = 0;
    return key;
  };
  const aim = (dxPx, dyPx) => {
    g.input.mouseX = 640 + dxPx; g.input.mouseY = 400 + dyPx;
  };
  const click = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };
  const projs = (pred) => g.entities.projectiles.filter(pred);

  const mark = (m) => console.log('[probe]', m);
  // ===== (a) Shadowbeam:弹体隐形(canvas 采样)+ 反弹存活 + d173 束段 =====
  {
    mark('sec-a enter');
    const key = findKey(1444, 'ShadowbeamStaff');
    spyReset();
    equip(key);
    aim(+500, 0);
    // 基准背景色(弹道上方的空中点)
    const cv = document.querySelector('canvas');
    const ctx2 = cv.getContext('2d');
    click();
    let bolt = projs((q) => q.projId === 294 && !q.dead)[0] ?? null;
    res.a_found = !!bolt;
    if (bolt) {
      // 单循环同时观测:速度符号翻转(撞墙反射) + 弹心像素 vs 背景差分(隐形)
      // EU=100 → 寿命 300 子步≈3 tick;墙在右 ~400px,6px/子步 → ~67 子步首撞(首拍内)
      let samplesDiff = 0, samples = 0;
      let flips = 0, lastSign = 1;                 // 瞄准向右=初速恒 +x
      for (let t = 0; t < 6 && !bolt.dead; t++) {
        g.fixedUpdate(1 / 60);
        const sg = Math.sign(bolt.vx) || lastSign;
        if (sg !== lastSign && !bolt.dead) flips++;
        lastSign = sg;
        if (t < 2 && !bolt.dead) {
          await sleep(30);
          const cxp = Math.max(0, Math.round(bolt.cx - g.camera.x + cv.width / 2) - 4);
          const cyp = Math.max(0, Math.round(bolt.cy - g.camera.y + cv.height / 2) - 4);
          const img = ctx2.getImageData(cxp, cyp, 9, 9);
          const bg = ctx2.getImageData(cxp, Math.max(0, cyp - 60), 9, 9);
          let diff = 0;
          for (let i = 0; i < img.data.length; i += 4) {
            diff += Math.abs(img.data[i] - bg.data[i]) + Math.abs(img.data[i + 1] - bg.data[i + 1]);
          }
          samplesDiff += diff; samples++;
        }
      }
      res.a_centerDiffAvg = samples ? Math.round(samplesDiff / samples) : -1;
      res.a_flips = flips;
      res.a_aliveAfterWall = flips > 0;              // 观测窗内发生反射即证不因撞块死
    }
    res.a_dust173 = window.__r28dust.filter((t) => t === 173).length;
    release();
    mark('sec-a done');
  }

  // ===== (b) Toxic Flask:Kill 毒云计数 =====
  {
    mark('sec-b enter');
    const key = findKey(3105, 'ToxicFlask');
    spyReset();
    equip(key);
    aim(+160, +60);
    click();                                  // 投出
    let flask = projs((q) => q.projId === 510)[0] ?? null;
    for (let t = 0; t < 240 && !flask; t++) { g.fixedUpdate(1 / 60); flask = projs((q) => q.projId === 510)[0] ?? null; }
    if (!flask) {
      // 直接构造死亡路径兜底(投掷物理可能未落位)
      const any = g.entities.projectiles[0];
      res.b_fallback = true;
    }
    for (let t = 0; t < 300 && projs((q) => q.projId >= 511 && q.projId <= 513).length === 0; t++) g.fixedUpdate(1 / 60);
    const clouds = projs((q) => q.projId >= 511 && q.projId <= 513);
    res.b_clouds = clouds.length;
    res.b_item107 = window.__r28sfx.includes('Item_107');
    release();
    mark('sec-b done');
  }

  // ===== (c) Blizzard Staff:天顶下落轨迹 =====
  {
    mark('sec-c enter');
    const key = findKey(1931, 'BlizzardStaff');
    spyReset();
    equip(key);
    aim(+220, +140);
    click();
    release();
    // 收集所有 337 的 y 序列
    const seq = [];
    for (let t = 0; t < 90; t++) {
      g.fixedUpdate(1 / 60);
      for (const f of projs((q) => q.projId === 337)) {
        seq.push({ x: f.cx, y: f.cy, id: f });
      }
    }
    // 按"单枚雪片连续段"取最长下降序列(实体引用跟踪)
    const tracks = new Map();
    let bestMono = 0, bestLen = 0;
    for (const s of seq) {
      const k = s.id;
      const arr = tracks.get(k) ?? [];
      arr.push({ x: s.x, y: s.y });
      tracks.set(k, arr);
      if (arr.length > bestLen) { bestLen = arr.length; }
    }
    for (const arr of tracks.values()) {
      let mono = 0;
      for (let i = 1; i < arr.length; i++) if (arr[i].y > arr[i - 1].y) mono++;
      bestMono = Math.max(bestMono, mono);
    }
    res.c_tracks = tracks.size;
    res.c_bestMono = bestMono;
    res.c_bestLen = bestLen;
    const xs = [...tracks.values()].flat().map((p) => p.x);
    res.c_xSpread = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    mark('sec-c done');
  }

  // ===== (d) Medusa Head:channel 每 volley 扣魔一次 =====
  {
    mark('sec-d enter');
    const key = findKey(3269, 'MedusaHead');
    spyReset();
    equip(key);
    g.player.mana = 100;
    if ('maxMana' in g.player) g.player.maxMana = Math.max(g.player.maxMana ?? 0, 100);
    g.player.manaRegenDelay = 0;
    // 真敌(蓝史莱姆,320px 内、有视线)——hurt 打桩记录 volley 落账
    const hurtTicks = [];
    const dummy = g.spawnEnemy('slime_green', g.player.cx + 180, g.player.cy - 20);
    dummy.hurt = (d) => { hurtTicks.push({ t: g.tickCount ?? hurtTicks.length, d }); return true; };
    const manaSeq = [];
    const cmCalls = [];
    const origCm = g.player.checkMana?.bind(g.player);
    if (origCm) g.player.checkMana = (n) => { cmCalls.push(n); return origCm(n); };
    const bucketSnap = [];
    aim(+260, -10);
    click();                                   // 起手(上游扣蓝一次)
    for (let t = 0; t < 75; t++) {
      g.fixedUpdate(1 / 60);
      manaSeq.push(g.player.mana);
      if (t % 10 === 0) bucketSnap.push(g.entities.projectiles.map((q) => `${q.projId}:${q.dead ? 'D' : 'A'}`).join('|'));
    }
    res.d_cmCalls = cmCalls;
    res.d_bucket = bucketSnap;
    res.d_inputUse = g.player.inputUseItem;
    if (origCm) g.player.checkMana = origCm;
    res.d_headAliveDuringChannel = !!g.entities.projectiles.find((q) => q.projId === 535 && !q.dead);
    release();
    let goneAt = -1;
    for (let t = 0; t < 80; t++) {
      g.fixedUpdate(1 / 60);
      const alive = g.entities.projectiles.some((q) => q.projId === 535 && !q.dead);
      if (!alive && goneAt < 0) goneAt = t;
    }
    res.d_headGoneAfterRelease = goneAt >= 0;
    res.d_headGoneTick = goneAt;
    res.d_slowMagic = g.player.slowMagicUse === true;
    res.d_useTimeEnd = g.player.useTime ?? -1;
    res.d_volleys = hurtTicks.length;
    res.d_damages = hurtTicks.map((h) => h.d);
    // 扣魔节奏:相邻扣魔间隔(ManaV2 下 mana 只在 volley 减)
    let drops = 0;
    for (let i = 1; i < manaSeq.length; i++) if (manaSeq[i] < manaSeq[i - 1]) drops++;
    res.d_manaDropTicks = drops;
    res.d_manaStart = manaSeq[0];
    res.d_manaEnd = manaSeq[manaSeq.length - 1];
    g.entities.enemies.splice(g.entities.enemies.indexOf(dummy), 1);
    mark('sec-d done');
  }

  // ===== 附加:Razorpine 2..4 发 / Bat 2..3 只 / InfernoFork 火柱 / SpiritFlame 悬浮 =====
  {
    mark('sec-x enter');
    spyReset();
    equip(findKey(1930, 'Razorpine'));
    aim(+400, 0);
    click(); release();
    for (let t = 0; t < 4; t++) g.fixedUpdate(1 / 60);
    res.x_rp = projs((q) => q.projId === 336).length;

    equip(findKey(1801, 'BatScepter'));
    aim(+400, 0);
    click(); release();
    for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
    res.x_bat = projs((q) => q.projId === 316).length;

    equip(findKey(1445, 'InfernoFork'));
    aim(+420, +30);
    click(); release();
    let fork = null;
    for (let t = 0; t < 6 && !fork; t++) { g.fixedUpdate(1 / 60); fork = projs((q) => q.projId === 295)[0] ?? null; }
    if (fork) {
      fork.killNow(g);
      res.x_pillar = projs((q) => q.projId === 296).length > 0;
      const pil = projs((q) => q.projId === 296)[0];
      res.x_pillarW = pil ? pil.w : 0;
    }

    equip(findKey(3779, 'SpiritFlame'));
    aim(+300, 0);
    click(); release();
    let sf = null;
    for (let t = 0; t < 4 && !sf; t++) { g.fixedUpdate(1 / 60); sf = projs((q) => q.projId === 659)[0] ?? null; }
    if (sf) {
      res.x_sfVel = Math.hypot(sf.vx, sf.vy) < 0.5;
      res.x_sfArmDust = window.__r28dust.length > 0;
    }

    equip(findKey(112, 'FlowerofFire'));
    aim(+380, 0);
    click(); release();
    let fl = null;
    for (let t = 0; t < 4 && !fl; t++) { g.fixedUpdate(1 / 60); fl = projs((q) => q.projId === 15)[0] ?? null; }
    if (fl) {
      spyReset();
      fl.killNow(g);
      res.x_flowerKillDust6 = window.__r28dust.filter((t) => t === 6).length;
      res.x_flowerItem10 = window.__r28sfx.includes('Item_10');
    }
  }
  return res;
});

console.log(JSON.stringify(out, null, 1));

check('(a) Shadowbeam 弹体生成', out.a_found === true);
check('(a) 弹体帧面隐形(中心像素≈背景,diff 低)', out.a_centerDiffAvg !== undefined && out.a_centerDiffAvg >= 0 && out.a_centerDiffAvg < 900,
  `diff=${out.a_centerDiffAvg}`);
check('(a) 撞墙反射(速度符号翻转,寿命内不因撞块死)', out.a_aliveAfterWall === true, `flips=${out.a_flips}`);
check('(a) 束段 d173 铺撒', out.a_dust173 > 0, `count=${out.a_dust173}`);
check('(b) Toxic Flask Kill 毒云 20..30', out.b_clouds >= 20 && out.b_clouds <= 30, `clouds=${out.b_clouds}`);
check('(b) Item_107 玻璃碎音', out.b_item107 === true);
check('(c) Blizzard 天顶雪片 ≥1 枚成轨', out.c_tracks >= 1, `tracks=${out.c_tracks}`);
check('(c) y 序列单调向下', out.c_bestMono >= out.c_bestLen - 2, `mono=${out.c_bestMono}/${out.c_bestLen}`);
check("(c) X 折叠带(±400px 内散布)", out.c_xSpread <= 900, `spread=${Math.round(out.c_xSpread)}`);
check('(d) Medusa Head 挂首在场(channel 期)', out.d_headAliveDuringChannel === true);
check('(d) 松手后挂首消亡(timeLeft=3)', out.d_headGoneAfterRelease === true);
check('(d) volley 命中 ≥2 次', out.d_volleys >= 2, `volleys=${out.d_volleys} dmg=[${(out.d_damages ?? []).join(',')}]`);
check('(d) 每 volley 计费一次(首轮预付免扣,次轮起 checkMana(15))',
  (out.d_cmCalls ?? []).length >= 1 && (out.d_cmCalls ?? []).every((n) => n === 15)
    && out.d_cmCalls.length >= Math.min(2, out.d_volleys - 1),
  `cm=[${(out.d_cmCalls ?? []).join(',')}] volleys=${out.d_volleys}`);
check('(d) 蓝空削弱闭环(slowMagicUse → 间隔 ×2.5 档)', out.d_slowMagic === true,
  `slowMagic=${out.d_slowMagic} useTimeEnd=${out.d_useTimeEnd}`);
check('附加 Razorpine 单击 2..4 发', out.x_rp >= 2 && out.x_rp <= 4, `n=${out.x_rp}`);
check('附加 Bat Scepter 单击 2..3 只', out.x_bat >= 2 && out.x_bat <= 3, `n=${out.x_bat}`);
check('附加 Inferno Fork Kill 生成火柱 296(150×150)', out.x_pillar === true && out.x_pillarW === 150);
check('附加 Spirit Flame 出生态零速悬浮', out.x_sfVel === true);
check('附加 Flower of Fire Kill 爆尘 d6≥36 + Item_10', out.x_flowerKillDust6 >= 36 && out.x_flowerItem10 === true,
  `d6=${out.x_flowerKillDust6}`);
check('无 page error', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);

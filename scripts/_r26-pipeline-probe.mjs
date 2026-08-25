// R26 通用武器使用管线探针(蓝队自证,2026-08-25):
//   (a) spray 型武器一个攻击周期 mana 扣减次数=1(GAP-R26-03:Golden Shower 6/18
//       一窗三发只扣一次魔;旧模型每 useTime 一 dispatch 整额扣=3×)
//   (b) 连发时同 track 不叠响(GAP-R26-05:default 组 Stop-then-play——spy Sfx
//       startBuffer/stopSingleSlot;例外组 Item_9 叠响=原版真态,对照组)
//   (b2) Item_1 三变体轮换:近战挥 24 次 ≥2 种变体(GAP-R26-06,随机非顺序)
//   (c) reuseDelay 武器两次发射间隔拍数(GAP-R26-07:Hornet Staff 2364 U=A=22+rd2
//       → 冷却 24/swing.dur 24;对照 Water Bolt 无 rd)
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_r26-pipeline-probe.mjs
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- 平坦竞技场(天空,无敌怪干扰) ----
  const px0 = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.groundLevel) - 40;
  for (let dx = -60; dx <= 60; dx++) for (let dy = -30; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  try { g.entities.enemies.length = 0; } catch { /* 只读则跳过 */ }
  try { window.__swSetPool?.([]); } catch { /* 缺省忽略 */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  // ---- spy:Sfx 播放漏斗(startBuffer 起振 / stopSingleSlot 先停) ----
  const sfx = g.sfx;
  if (!sfx.__od26startBuffer) {
    sfx.__od26startBuffer = sfx.startBuffer.bind(sfx);
    sfx.__od26stopSingleSlot = sfx.stopSingleSlot.bind(sfx);
    window.__r26starts = [];
    window.__r26stops = [];
    sfx.startBuffer = (file, buf, vol, pitch, pan) => {
      window.__r26starts.push(file);
      return sfx.__od26startBuffer(file, buf, vol, pitch, pan);
    };
    sfx.stopSingleSlot = (file) => {
      window.__r26stops.push(file);
      return sfx.__od26stopSingleSlot(file);
    };
  }
  window.__r26wav = [];
  if (!g.__od26playSfxFile) {
    g.__od26playSfxFile = g.playSfxFile;
    g.playSfxFile = function (file, vol, x, y) {
      window.__r26wav.push(file);
      return g.__od26playSfxFile.call(this, file, vol, x, y);
    };
  }
  const resetSpies = () => { window.__r26starts.length = 0; window.__r26stops.length = 0; window.__r26wav.length = 0; };

  const equip = (key) => {
    const id = window.__swItems[key];
    if (!id) throw new Error(`物品键不存在: ${key}`);
    for (let i = 0; i < 60; i++) { const sl = g.player.inv.slots[i]; if (sl) g.player.inv.slots[i] = null; }
    g.player.inv.add(id, 1);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.player.mana = g.player.maxMana;
    g.player.manaRegenDelay = 0;
    return id;
  };
  const fireClick = () => {
    g.input.mouseX = 1040; g.input.mouseY = 400;   // 水平向右
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };

  // ===== (a) Golden Shower 1336(U=6/A=18,style5+autoReuse → +1 补间帧=19 窗):
  //          单击一周期 → mana 扣 1、弹 280×4(0/6/12/18t;原版 anim=1 时 flag4 仍放行,
  //          红队 ⌈A/U⌉=3 未计补间帧——spawnTicks 应为 [0,4,10,16] 探针相对系) =====
  {
    equip('vi_1336_GoldenShower');
    g.player.slowMagicUse = false;
    const manaSeq = [g.player.mana];
    fireClick();                                   // 首发 tick(周期首拍扣魔在此发生)
    release();                                     // ★立即松手——只测单周期(hold 会开新窗)
    for (let t = 1; t <= 20; t++) { g.fixedUpdate(1 / 60); manaSeq.push(g.player.mana); }
    res.goldenShower = {
      manaMax: g.player.maxMana,
      manaDrops: manaSeq.filter((m, i) => i > 0 && m < manaSeq[i - 1]).length,
      minMana: Math.min(...manaSeq),
    };
    // 弹计数重跑:累计本周期生成的 280 弹【去重总数】(存活峰值受寿命干扰)
    equip('vi_1336_GoldenShower');
    const ids280 = new Set();
    const spawnTicks = [];
    const trace = [];
    const seen = new Set(g.entities.projectiles.map((q) => q.id));
    fireClick();
    release();
    for (let t = 0; t <= 20; t++) {
      g.fixedUpdate(1 / 60);
      let spawned = false;
      for (const q of g.entities.projectiles) {
        if (q.projId === 280 && !seen.has(q.id)) { seen.add(q.id); ids280.add(q.id); spawnTicks.push(t); spawned = true; }
      }
      trace.push({ t, sT: g.swing ? g.swing.t : null, sD: g.swing ? g.swing.dur : null,
        ut: g.player.useTime, fired: g.swing?.multishot ? g.swing.multishot.fired : null, sp: spawned });
    }
    res.goldenShower.totalShots = ids280.size;
    res.goldenShower.spawnTicks = spawnTicks;
    res.goldenShower.trace = trace;
  }

  // ===== (a2) Aqua Scepter 157(8/16):持按两周期 → 扣魔拍恰 2 次(t=0 与 t=16) =====
  {
    equip('vi_157_AquaScepter');
    g.player.slowMagicUse = false;
    const payTicks = [];
    let lastMana = g.player.mana;
    fireClick();
    for (let t = 0; t <= 31; t++) {                // 第三窗在 t=32 起,不纳入
      g.fixedUpdate(1 / 60);
      if (g.player.mana < lastMana) { payTicks.push(t); lastMana = g.player.mana; }
      g.input.mouseHeld = true;                    // autoReuse 电平保持按住
    }
    release();
    res.aqua = { payTicks, manaSpent: g.player.maxMana - g.player.mana };
  }

  // ===== (b) 同 track 不叠响:default 组 Item_13 ×5(5 起 4 停)/例外组 Item_9 ×5(5 起 0 停) =====
  {
    sfx.preloadFiles(['Item_13', 'Item_9']);       // 预热缓存(deferPlay 异步面排除在外)
    await sleep(700);
    sfx.stopSingleSlot('Item_13');                 // 清残留槽((a)/(a2) 的 UseSound 已占)
    sfx.stopSingleSlot('Item_9');
    resetSpies();
    const slotDbg = { pre: !!sfx.singlePlaying?.get?.('Item_13'), marks: [] };
    for (let i = 0; i < 5; i++) {
      const hadBefore = !!(sfx.singlePlaying && sfx.singlePlaying.get && sfx.singlePlaying.get('Item_13'));
      sfx.playWavFile('Item_13');
      const src = sfx.singlePlaying ? sfx.singlePlaying.get('Item_13') : null;
      slotDbg.marks.push({ i, hadBefore, nowHas: !!src });
    }
    res.slotDebug = slotDbg;
    for (let i = 0; i < 5; i++) sfx.playWavFile('Item_9');
    await sleep(50);
    res.slotSemantics = {
      starts13: window.__r26starts.filter((f) => f === 'Item_13').length,
      stops13: window.__r26stops.filter((f) => f === 'Item_13').length,
      starts9: window.__r26starts.filter((f) => f === 'Item_9').length,
      stops9: window.__r26stops.filter((f) => f === 'Item_9').length,
      seq: { s: [...window.__r26starts], x: [...window.__r26stops] },
    };
  }

  // ===== (b2) Item_1 三变体轮换:铁阔剑连续挥 24 周期 → Item_1/18/19 ≥2 种出现 =====
  //  采集点=Sfx.startBuffer(轮换后文件名;playSfxFile 层看到的是轮换前的 Item_1)
  {
    equip('vi_4_IronBroadsword');                  // UseSound=Item_1(近战挥砍嘶声)
    resetSpies();
    const variants = new Set();
    const collect = () => {
      for (const f of window.__r26starts) if (/^Item_(1|18|19)$/.test(f)) variants.add(f);
      window.__r26starts.length = 0;
    };
    g.input.mouseX = 1040; g.input.mouseY = 400;
    g.prevSwingMouse = false;
    for (let i = 0; i < 24; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;   // 点击沿
      g.fixedUpdate(1 / 60);
      collect();
      g.input.mouseDown = false;
      for (let t = 0; t < 34; t++) {               // 挥完动画(useAnimation≈25)再下一击
        g.fixedUpdate(1 / 60);
        collect();
      }
    }
    await sleep(300);                              // deferPlay 补播面排空
    collect();
    release();
    res.item1Rotation = { variants: [...variants].sort() };
  }

  // ===== (c) reuseDelay:Hornet Staff 2364(rd=2,U=A=22)冷却/swing 窗=24;对照 Water Bolt =====
  {
    const probeCd = (key) => {
      equip(key);
      g.entities.projectiles.length = 0;
      g.player.useTime = 0;
      fireClick();
      const cd = g.player.useTime;
      const dur = g.swing ? g.swing.dur : 0;
      release();
      for (let t = 0; t < 60; t++) g.fixedUpdate(1 / 60);
      return { cooldown: cd, swingDur: dur };
    };
    res.cooldownCompare = {
      hornet2364: probeCd('vi_2364_HornetStaff'),   // rd2 → 24/24
      waterbolt165: probeCd('vi_165_WaterBolt'),    // rd0 对照 → U 原值(21)
    };
  }

  return res;
});

// =========================== 判定 ===========================
{
  const gs = out.goldenShower ?? {};
  check('(a) Golden Shower 单击一周期 mana 扣减恰 1 次',
    gs.manaDrops === 1, `manaDrops=${gs.manaDrops} min=${gs.minMana}/${gs.manaMax}`);
  check('(a) Golden Shower 单击一周期四连发(280 弹=4:窗 19 含 +1 补间帧,节拍 0/6/12/18)',
    gs.totalShots === 4, `totalShots=${gs.totalShots} spawnTicks=${JSON.stringify(gs.spawnTicks)}`);

  const aq = out.aqua ?? {};
  check('(a2) Aqua Scepter 持按两周期扣魔拍恰 2 次(间隔≈16t)',
    aq.payTicks?.length === 2, `payTicks=${JSON.stringify(aq.payTicks)} spent=${aq.manaSpent}/14`);

  const ss = out.slotSemantics ?? {};
  const sdbg = out.slotDebug ?? {};
  // 语义判定钉在槽占用序列上:首播时槽空(pre-clear 后)、其后每播必见上一实例仍在槽
  // (=被 Stop-then-play 管理),例外组全程零停。stops13 计数含前段残留 deferPlay 的
  // 迟到回调,不作精确断言(≥4 即证)
  check('(b) default 组 Stop-then-play:首播槽空→后续每播先停上一实例',
    ss.starts13 === 5 && ss.stops13 >= 4
    && sdbg.marks?.length === 5 && !sdbg.marks[0].hadBefore
    && sdbg.marks.slice(1).every((m) => m.hadBefore) && sdbg.marks.every((m) => m.nowHas),
    `starts=${ss.starts13} stops=${ss.stops13} marks=${JSON.stringify(sdbg.marks)}`);
  check('(b) 例外组不停播:Item_9×5 → 5 起 0 停(自由叠响=原版 :604-615 白名单)',
    ss.starts9 === 5 && ss.stops9 === 0, `starts=${ss.starts9} stops=${ss.stops9}`);

  const rot = out.item1Rotation ?? {};
  check('(b2) Item_1 三变体轮换:24 次挥击出现 ≥2 种变体(Item_1/18/19 随机场)',
    (rot.variants ?? []).length >= 2, `variants=${JSON.stringify(rot.variants)}`);

  const rc = out.cooldownCompare ?? {};
  check('(c) reuseDelay 收招节奏:Hornet Staff rd2 → 冷却=swing 窗=24(22+2)',
    rc.hornet2364?.cooldown === 24 && rc.hornet2364?.swingDur === 24,
    JSON.stringify(rc.hornet2364));
  check('(c2) 无 rd 对照:Water Bolt 冷却不膨胀(=useTime)',
    !!rc.waterbolt165 && rc.waterbolt165.cooldown === rc.waterbolt165.swingDur,
    JSON.stringify(rc.waterbolt165));
}

console.log(`\npage errors: ${errors.length}${errors.length ? '\n' + errors.join('\n') : ''}`);
console.log(`\n=== R26 探针 ${pass} pass / ${fail} fail ===`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);

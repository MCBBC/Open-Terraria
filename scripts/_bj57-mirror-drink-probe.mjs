// SW-BJ57 实机探针：魔镜家族引导期演出 + 药水饮用演出取证（修复前基线）。
//   断言面：
//   ① 魔镜 50 引导期（itemAnimation 90t）逐拍光尘（原版 Player.cs:43309-43312
//      Next(2)==0 → 尘 15 α150 scale1.1，全窗 ~45 粒）——仓内现状应为 0（用户实报缺）
//   ② 触发拍（useTime==45）尘载体：原版 = 尘 15 ×70(带速)×70(零速) scale1.5 α150；
//      仓内现状 = spawnParticles 通用粒子（非原版尘池）
//   ③ 音效：起手 Item_6（真 wav）；触发拍魔镜族无专属音
//   ④ 药水 292 饮用：起手 Item_3 wav + useStyle 9 姿势 + itemAnimTicks 17 +
//      每 tick 尘 284（FoodPiece）于嘴区 + buff/消耗
//   ⑤ 回归药水 4870：原版 = 引导 20t 后传送（:43472-43502 itemTime==20）+
//      起手 Item3+10 青尘 + 触发拍 UseSound(Item6)+70×2；仓内现状 = 点击即传
// 运行:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj57-mirror-drink-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
  const slotOfVid = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);

  const out = { mirror: null, potion: null, potionReturn: null, errors: [] };

  // ---- 插桩：尘池 spawn / 音效 / 通用粒子 ----
  const install = (log) => {
    if (log.installed) return;
    log.installed = true;
    const vd = g.vanillaDust;
    const origSpawn = vd.spawn.bind(vd);
    vd.spawn = (...args) => {
      const d = origSpawn(...args);
      if (d) log.dust.push({ t: log.tick, type: d.type, alpha: d.alpha, scale: +d.scale.toFixed(3), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2), x: +d.x.toFixed(1), y: +d.y.toFixed(1) });
      return d;
    };
    g.spawnParticles = (...args) => { log.particles.push({ t: log.tick, color: args[2], n: args[3] }); };
    const sfx = g.sfx;
    const origWav = sfx.playWavFile.bind(sfx);
    sfx.playWavFile = (name, ...rest) => { log.sounds.push({ t: log.tick, wav: name }); return origWav(name, ...rest); };
    const origPlay = sfx.play.bind(sfx);
    sfx.play = (kind, ...rest) => { log.sounds.push({ t: log.tick, kind }); return origPlay(kind, ...rest); };
  };
  const uninstall = (log) => {
    const vd = g.vanillaDust;
    vd.spawn = vd.spawn; // 保闭包原 bind 版不再还原（每用例重装新 log,链式会串——改为单例 log 常驻）
  };
  const log = { tick: 0, dust: [], sounds: [], particles: [], installed: false };
  install(log);

  const resetSlots = () => {
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.cb.onInventoryChanged?.();
  };
  const give = (vid, stack = 9) => {
    const slot = slotOfVid(vid);
    if (slot < 0) { out.errors.push(`vid ${vid} 无 def`); return false; }
    resetSlots();
    g.player.inv.slots[0] = { id: slot, stack };
    g.player.inv.selected = 0;
    g.player.useTime = 0; g.player.itemAnimTicks = 0;
    return true;
  };

  // ---- ① 魔镜 50：90t 引导全程逐拍取证 ----
  if (give(50)) {
    log.tick = 0; log.dust.length = 0; log.sounds.length = 0; log.particles.length = 0;
    const p0 = { x: g.player.x, y: g.player.y };
    g.input.mouseDown = true;
    const perTickDust15 = [];
    let triggerTick = -1, tpTick = -1;
    for (let t = 0; t < 120; t++) {
      log.tick = t;
      const before = { x: g.player.x, y: g.player.y, ut: g.player.useTime };
      const dn = log.dust.length;
      g.fixedUpdate(1 / 60);
      const d15 = log.dust.slice(dn).filter((d) => d.type === 15).length;
      const dOther = log.dust.slice(dn).filter((d) => d.type !== 15).length;
      perTickDust15.push(d15 + (dOther ? `x${dOther}?` : ''));
      if (before.ut === 45 && g.player.useTime === 44) triggerTick = t;
      if ((g.player.x !== before.x || g.player.y !== before.y) && tpTick < 0) tpTick = t;
    }
    g.input.mouseDown = false;
    const d15scales = [...new Set(log.dust.filter((d) => d.type === 15).map((d) => d.scale))];
    out.mirror = {
      dust15Total: log.dust.filter((d) => d.type === 15).length,
      dustOtherTypes: [...new Set(log.dust.filter((d) => d.type !== 15).map((d) => d.type))],
      dust15Scales: d15scales,
      dust15Alphas: [...new Set(log.dust.filter((d) => d.type === 15).map((d) => d.alpha))],
      first20Dust15: perTickDust15.slice(0, 20),
      triggerTick, tpTick,
      moved: g.player.x !== p0.x || g.player.y !== p0.y,
      sounds: log.sounds,
      particlesCarrier: log.particles.length,
      stackNow: g.player.inv.slots[0]?.stack ?? 0,
      channel: !!g.recallChannel,
    };
  }

  // ---- ④ 药水 292（铁皮）饮用演出 ----
  if (give(292)) {
    log.tick = 0; log.dust.length = 0; log.sounds.length = 0; log.particles.length = 0;
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    const sw0 = g.swing ? { useStyle: g.swing.useStyle, dur: g.swing.dur, noGraphic: g.swing.noGraphic } : null;
    const dustPerTick = [];
    for (let t = 1; t < 30; t++) {
      log.tick = t;
      const dn = log.dust.length;
      g.fixedUpdate(1 / 60);
      dustPerTick.push(log.dust.slice(dn).map((d) => d.type).join(','));
    }
    out.potion = {
      swingStart: sw0,
      useTime0: g.player.useTime,
      itemAnimTicks: g.player.itemAnimTicks,
      dust284Count: log.dust.filter((d) => d.type === 284).length,
      dustOther: [...new Set(log.dust.filter((d) => d.type !== 284).map((d) => d.type))],
      dustPerTick: dustPerTick.slice(0, 12),
      sounds: log.sounds,
      stackNow: g.player.inv.slots[0]?.stack ?? 0,
      buff: g.player.buffs.has ? 'has()' : 'n/a',
    };
  }

  // ---- ⑤ 回归药水 4870 ----
  if (give(4870)) {
    log.tick = 0; log.dust.length = 0; log.sounds.length = 0; log.particles.length = 0;
    const p0 = { x: g.player.x, y: g.player.y };
    g.input.mouseDown = true;
    let tpTick = -1;
    const useTimeTrace = [];
    for (let t = 0; t < 60; t++) {
      log.tick = t;
      const ut = g.player.useTime;
      const bx = g.player.x, by = g.player.y;
      g.fixedUpdate(1 / 60);
      useTimeTrace.push(`${ut}->${g.player.useTime}`);
      if ((g.player.x !== bx || g.player.y !== by) && tpTick < 0) tpTick = t;
    }
    g.input.mouseDown = false;
    out.potionReturn = {
      tpTick,
      moved: g.player.x !== p0.x || g.player.y !== p0.y,
      useTimeTrace: useTimeTrace.slice(0, 8),
      sounds: log.sounds,
      dustTypes: [...new Set(log.dust.map((d) => d.type))],
      dust15: log.dust.filter((d) => d.type === 15).length,
      particlesCarrier: log.particles.length,
      stackNow: g.player.inv.slots[0]?.stack ?? 0,
    };
  }

  return out;
});

console.log('[probe] RESULT ' + JSON.stringify(result, null, 1));
if (errors.length) console.log('[probe] PAGE ERRORS ' + JSON.stringify(errors));
await browser.close();

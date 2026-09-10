// SW-BJ57 修复后实机复核：①魔镜 90t 引导期逐拍光尘（≈45 粒尘15 α150 s1.1）
//   ②触发拍 70×2 白尘 s1.5 ③4870 引导 20t 触发（起手 Item3+10 青 → 触发拍 mirror+140 青+消耗一次）
//   ④药水 292 饮用演出回归（Item_3 + 每拍 284 ×17）
// 运行:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj57-verify.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[probe] PAGEERROR ' + e.message));
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
  const out = {};

  const log = { tick: 0, dust: [], sounds: [] };
  const vd = g.vanillaDust;
  const origSpawn = vd.spawn.bind(vd);
  vd.spawn = (...a) => { const d = origSpawn(...a); if (d) log.dust.push({ t: log.tick, type: d.type, alpha: d.alpha, scale: +d.scale.toFixed(3), vx: +d.vx.toFixed(2) }); return d; };
  const sfx = g.sfx;
  const origWav = sfx.playWavFile.bind(sfx);
  sfx.playWavFile = (n, ...r) => { log.sounds.push({ t: log.tick, wav: n }); return origWav(n, ...r); };
  const origPlay = sfx.play.bind(sfx);
  sfx.play = (k, ...r) => { log.sounds.push({ t: log.tick, kind: k }); return origPlay(k, ...r); };

  const give = (vid, stack = 9) => {
    const slot = slotOfVid(vid);
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: slot, stack };
    g.player.inv.selected = 0;
    g.player.useTime = 0; g.player.itemAnimTicks = 0;
    g.swing = null;
    g.cb.onInventoryChanged?.();
  };

  // ---- ① 魔镜 50：90t 引导全程 ----
  give(50);
  log.tick = 0; log.dust.length = 0; log.sounds.length = 0;
  const perTick = [];
  g.input.mouseDown = true;
  for (let t = 0; t < 120; t++) {
    log.tick = t;
    const dn = log.dust.length;
    const ut = g.player.useTime;
    g.fixedUpdate(1 / 60);
    perTick.push(log.dust.slice(dn).filter((d) => d.type === 15).length);
    if (ut === 46 && g.player.useTime === 45) out.triggerAt = t;
  }
  g.input.mouseDown = false;
  const m15 = log.dust.filter((d) => d.type === 15);
  out.mirror = {
    dust15DuringChannel: m15.length,
    d15Alphas: [...new Set(m15.map((d) => d.alpha))],
    d15ScaleRange: [Math.min(...m15.map((d) => d.scale)), Math.max(...m15.map((d) => d.scale))],
    postTriggerTicks: perTick.slice(46).reduce((a, b) => a + b, 0),
    triggerAt: out.triggerAt,
    sounds: log.sounds.slice(),
    otherTypes: [...new Set(log.dust.filter((d) => d.type !== 15).map((d) => d.type))],
  };

  // ---- ③ 4870：引导 20t ----
  give(4870);
  log.tick = 0; log.dust.length = 0; log.sounds.length = 0;
  g.input.mouseDown = true;
  const trace = [];
  for (let t = 0; t < 60; t++) {
    log.tick = t;
    const ut = g.player.useTime;
    const bx = g.player.x, by = g.player.y;
    g.fixedUpdate(1 / 60);
    trace.push(`${ut}->${g.player.useTime}${(g.player.x !== bx || g.player.y !== by) ? ' TP' : ''}`);
  }
  g.input.mouseDown = false;
  const c15 = log.dust.filter((d) => d.type === 15);
  out.potionReturn = {
    trace: trace.slice(0, 14),
    startDust15: log.dust.filter((d) => d.type === 15 && d.t === 0).length,
    totalDust15: c15.length,
    cyan: c15[0] ? [c15[0].alpha, c15[0].scale] : null,
    sounds: log.sounds.slice(),
    stackNow: g.player.inv.slots[0]?.stack ?? 0,
  };

  // ---- ④ 药水 292 回归 ----
  give(292);
  log.tick = 0; log.dust.length = 0; log.sounds.length = 0;
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const sw0 = g.swing ? { useStyle: g.swing.useStyle, dur: g.swing.dur } : null;
  let d284 = 0;
  for (let t = 1; t < 25; t++) {
    log.tick = t;
    const dn = log.dust.length;
    g.fixedUpdate(1 / 60);
    d284 += log.dust.slice(dn).filter((d) => d.type === 284).length;
  }
  out.potion = {
    swingStart: sw0,
    dust284: d284 + log.dust.filter((d) => d.type === 284 && d.t === 0).length,
    sounds: log.sounds.slice(0, 2),
    stackNow: g.player.inv.slots[0]?.stack ?? 0,
  };
  return out;
});
console.log('[probe] RESULT ' + JSON.stringify(result, null, 1));
await browser.close();

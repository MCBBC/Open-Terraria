// SW-BJ57 聚焦探针②：drink 音来源调用栈取证（sfx.play/playWavFile stack 捕获）
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
  const out = { traces: [], errors: [] };

  const log = { tick: 0, events: [] };
  const vd = g.vanillaDust;
  const origSpawn = vd.spawn.bind(vd);
  vd.spawn = (...a) => { const d = origSpawn(...a); if (d) log.events.push({ t: log.tick, ev: 'dust', type: d.type }); return d; };
  const sfx = g.sfx;
  const origWav = sfx.playWavFile.bind(sfx);
  sfx.playWavFile = (name, ...r) => {
    log.events.push({ t: log.tick, ev: 'wav', name, stack: new Error().stack?.split('\n').slice(1, 4).map((s) => s.trim().replace(/^at /, '')).join(' <- ') });
    return origWav(name, ...r);
  };
  const origPlay = sfx.play.bind(sfx);
  sfx.play = (kind, ...r) => {
    log.events.push({ t: log.tick, ev: 'kind', kind, stack: new Error().stack?.split('\n').slice(1, 4).map((s) => s.trim().replace(/^at /, '')).join(' <- ') });
    return origPlay(kind, ...r);
  };

  const give = (vid, stack = 9) => {
    const slot = slotOfVid(vid);
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: slot, stack };
    g.player.inv.selected = 0;
    g.player.useTime = 0; g.player.itemAnimTicks = 0;
    g.swing = null;   // 清残留挥击窗（隔离用例）
    g.cb.onInventoryChanged?.();
  };

  // ---- vid 50 魔镜：单击 + 3 tick 观察 + 栈 ----
  give(50);
  g.input.mouseDown = true;
  for (let t = 0; t < 4; t++) { log.tick = t; g.fixedUpdate(1 / 60); }
  g.input.mouseDown = false;
  out.mirrorAfterClick = {
    useTime: g.player.useTime, itemAnimTicks: g.player.itemAnimTicks,
    swing: g.swing ? { useStyle: g.swing.useStyle, dur: g.swing.dur, item: g.swing.item } : null,
    recallChannel: g.recallChannel,
    heldKey: ITEM_DEFS[g.player.inv.heldItem()?.id ?? -1]?.key,
  };
  out.mirrorEvents = log.events.slice(0, 24);
  log.events.length = 0;

  // 等 120 tick 让通道走完
  for (let t = 0; t < 120; t++) { log.tick = t; g.fixedUpdate(1 / 60); }
  out.mirrorPost = { x: g.player.x, y: g.player.y, recallChannel: g.recallChannel, events: log.events.slice(0, 12) };
  log.events.length = 0;

  // ---- vid 292 铁皮药水：单击 + 25 tick ----
  give(292);
  g.input.mouseDown = true;
  log.tick = 0; g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  out.potionAfterClick = {
    useTime: g.player.useTime, itemAnimTicks: g.player.itemAnimTicks,
    swing: g.swing ? { useStyle: g.swing.useStyle, dur: g.swing.dur } : null,
    stack: g.player.inv.slots[0]?.stack ?? 0,
  };
  out.potionEvents = log.events.slice(0, 20);
  return out;
});
console.log('[probe] RESULT ' + JSON.stringify(result, null, 1));
await browser.close();

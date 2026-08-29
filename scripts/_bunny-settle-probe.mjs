// 兔(critter)物理冻结根因探针：全字段追踪 + 深挖 def 解析与重力执行路径
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'bunny-settle2');
  for (let x = 0; x < 200; x++) {
    for (let y = 71; y < 120; y++) world.store.setTile(x, y, 1);
    world.store.setTile(x, 70, 3);
  }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  document.getElementById('sw-boot-prime')?.remove();
  const g = window.__swGame;
  g.paused = true;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const SURF = 70 * 16;
  const bunny = Enemy.fromVanilla(46, 64 * 16, 68 * 16);
  if (!bunny) throw new Error('vanilla 46 missing');
  g.entities.add(bunny, 'critters');
  const meta = {
    defW: bunny.def?.width, defH: bunny.def?.height,
    w: bunny.w, h: bunny.h, vid: bunny.vanillaId,
    aiStyle: bunny.vanilla?.aiStyle, key: bunny.key,
    spawnY: 68 * 16,
  };
  const rows = [];
  let lastVy = -99;
  const samples = [];
  for (let t = 0; t <= 300; t++) {
    // 重力是否到达：抓 vy 变化沿
    if (Math.round(bunny.vy * 1000) !== Math.round(lastVy * 1000)) {
      samples.push({ t, vyChgTo: Math.round(bunny.vy * 100) / 100, y: bunny.y, bottom: bunny.y + bunny.h, onGround: !!bunny.onGround });
      lastVy = bunny.vy;
    }
    g.fixedUpdate(1 / 60);
    if (t % 30 === 0) {
      rows.push({ t, y: Math.round(bunny.y), bottom: Math.round(bunny.y + bunny.h), vy: Math.round(bunny.vy * 100) / 100, og: !!bunny.onGround, hw: bunny.hitWall, x: Math.round(bunny.x) });
    }
    void lastVy;
  }
  return { meta, rows: rows.slice(0, 11), edgeSamples: samples.slice(0, 12), finalAi0: bunny.ai0, finalAi1: bunny.ai1 };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

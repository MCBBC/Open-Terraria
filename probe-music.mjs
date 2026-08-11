// BGM 切换诊断：地表→地下→地表，看 scene 与选曲是否随之变化
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { scanScene } = await import('/src/world/SceneMetrics.ts');
  const { pickMusic } = await import('/src/data/Music.ts');
  const w = g.world;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = {};
  const moveTo = async (tx, ty) => {
    g.player.x = tx * 16; g.player.y = ty * 16;
    g.player.vx = 0; g.player.vy = 0;
    // fixedUpdate 由 rAF 驱动；等 500ms ≈ 30 tick，足够过 15 tick 选曲刷新
    await sleep(600);
  };
  res.layers = { groundLevel: w.groundLevel, rockLevel: w.rockLevel, h: w.h };
  // ① 地表白天
  await moveTo(Math.floor(w.w / 2), Math.floor(w.groundLevel * 0.5));
  w.clock.timeOfDay = 0.5; // 正午
  await sleep(600);
  res.surface = { scene: { ...g.scene }, lastMusic: g.lastMusic };
  // ② 地下（rockLevel 之下）
  await moveTo(Math.floor(w.w / 2), w.rockLevel + 40);
  await sleep(600);
  res.underground = { scene: { ...g.scene }, lastMusic: g.lastMusic };
  // ③ 回地表
  await moveTo(Math.floor(w.w / 2), Math.floor(w.groundLevel * 0.5));
  await sleep(600);
  res.surface2 = { scene: { ...g.scene }, lastMusic: g.lastMusic };
  // 直调核对：同样的输入 pickMusic 是否输出不同曲（排除 state 卡死）
  res.pickDirect = [
    pickMusic({ scene: { townNPCCount: 0, zoneDungeon: false, zoneGraveyard: false }, isDay: true, bossMusic: 0, worldSurface: 200, rockLevel: 400, lavaLine: 900, maxTilesX: 4200, centerX: 500, centerY: 3200, state: { ugMusic: 0, dayMusic: 0 } }),
    pickMusic({ scene: { townNPCCount: 0, zoneDungeon: false, zoneGraveyard: false }, isDay: true, bossMusic: 0, worldSurface: 200, rockLevel: 400, lavaLine: 900, maxTilesX: 4200, centerX: 500, centerY: 500, state: { ugMusic: 0, dayMusic: 0 } }),
  ];
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();

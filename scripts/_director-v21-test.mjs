import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';

const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null; const rx = [];
wss.on('connection', ws => {
  ws.on('message', d => { try { const m = JSON.parse(d); if (m.op === 'hello' && (m.v ?? 0) >= 2) mod = ws; } catch {} });
  if (!mod) mod = ws;  // 首个兜底 ws.on('message', d => { try { rx.push(JSON.parse(d)); } catch {} }); });

let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} }); ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  await gotoApp(page, ORIGIN, { tries: 40 });
  await page.evaluate(async () => {
    const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { ModStore } = await import('/src/mods/store.ts');
    const { readModPack } = await import('/src/mods/pack.ts');
    const { loadModsPhase1 } = await import('/src/mods/loader.ts');
    const storage = { reg: JSON.stringify([]), zips: new Map(),
      async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
      async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
      async deleteZip(id) { this.zips.delete(id); } };
    const store = new ModStore(storage);
    const pack = readModPack(bytes);
    await store.install(pack.manifest, bytes, null);
    await loadModsPhase1(storage);
  });
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2000 });
  L.chk('世界', gen.ok);
  await new Promise(r => setTimeout(r, 1200));

  const cmd = c => { rx.length = 0; mod.send(JSON.stringify({ op: 'cmd', c })); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const wState = () => page.evaluate(() => {
    const g = window.__swGame, w = g.world;
    return {
      raining: w.weather.raining, maxRaining: +w.weather.maxRaining.toFixed(2),
      clouds: w.weather.numClouds, wind: +w.weather.windSpeedTarget.toFixed(2),
      storming: w.weather.storming,
      tod: +w.clock.timeOfDay.toFixed(3), frozen: !!w.clock.__dirFrozen,
      dayRate: w.dayRate, moonPhase: w.clock.moonPhase, bloodMoon: w.clock.bloodMoon,
    };
  });
  const shot = async n => { await front(page); await wait(400); await page.screenshot({ path: `/tmp/probe-out/_director-v2/${n}.png` }); };

  // ① 天气：暴雨+暴风
  cmd({ cmd: 'weather', raining: true, intensity: 1, storm: true, wind: -0.8, clouds: 300 });
  await wait(800);
  const w1 = await wState();
  L.chk('暴雨', w1.raining && w1.maxRaining >= 0.8, JSON.stringify(w1));
  L.chk('暴风', w1.storming, `storming=${w1.storming}`);
  L.chk('风力', Math.abs(w1.wind) > 0.5, `wind=${w1.wind}`);
  await shot('weather-storm');
  cmd({ cmd: 'weather', raining: false, storm: false });
  await wait(500);

  // ② 时间：流速控制
  cmd({ cmd: 'time', hour: 12 }); // 正午
  await wait(200);
  const t1 = await wState();
  L.chk('hour=12 正午', Math.abs(t1.tod - 0.5) < 0.02, `tod=${t1.tod}`);
  cmd({ cmd: 'time', rate: 60 }); // 快进 60×
  await wait(1500);
  const t2 = await wState();
  L.chk('rate=60 时间在走', t2.tod !== t1.tod, `${t1.tod} → ${t2.tod}`);
  cmd({ cmd: 'time', rate: 0 }); // 冻结
  await wait(500);
  const t3 = await wState();
  await wait(800);
  const t4 = await wState();
  L.chk('rate=0 时间冻结', t3.tod === t4.tod, `${t3.tod} == ${t4.tod}`);
  cmd({ cmd: 'time', rate: 1 }); // 恢复正常

  // ③ 月相/血月
  cmd({ cmd: 'time', moonPhase: 0, bloodMoon: true });
  await wait(300);
  const t5 = await wState();
  L.chk('血月+满月', t5.bloodMoon && t5.moonPhase === 0, `bm=${t5.bloodMoon} mp=${t5.moonPhase}`);
  await shot('blood-moon');
  cmd({ cmd: 'time', bloodMoon: false });

  // ④ 生成怪物（蓝史莱姆 vid=1，僵尸 vid=50）
  const p = await page.evaluate(() => ({ x: Math.round(window.__swGame.player.cx / 16), y: Math.round(window.__swGame.player.cy / 16) }));
  cmd({ cmd: 'spawnMob', vid: 1, x: p.x + 5, y: p.y - 2 });
  await wait(500);
  cmd({ cmd: 'spawnMob', vid: 50, x: p.x - 5, y: p.y - 2 });
  await wait(800);
  const enemies = await page.evaluate(() => window.__swGame.entities.enemies.filter(e => !e.dead).length);
  L.chk('spawnMob ×2', enemies >= 2, `enemies=${enemies}`);
  await shot('spawned-mobs');

  // ⑤ 生成 Boss（克眼 vid=4）
  cmd({ cmd: 'spawnEnemy', vid: 4, x: p.x + 10, y: p.y - 8 });
  await wait(1500);
  await shot('spawned-boss');
  L.chk('spawnEnemy Boss', true);

  // ⑥ 清场
  cmd({ cmd: 'killNpc', vid: 1 });
  cmd({ cmd: 'killNpc', vid: 50 });
  await wait(300);
  const enemies2 = await page.evaluate(() => window.__swGame.entities.enemies.filter(e => !e.dead).length);
  L.chk('killNpc 清怪', enemies2 < enemies, `${enemies} → ${enemies2}`);

} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300)); await wss.close();
  try { vite && vite.stop(); } catch {}
}
process.exit(L.exitCode());

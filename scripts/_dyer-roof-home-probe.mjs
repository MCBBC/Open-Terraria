// 染料商屋顶回家 A/B 取证探针(2026-09-01 用户实报)：
// 行为日志显示染料商夜间在自家屋顶(600..613,324..332)永远打转。
// 场景重建 = 载入用户存档,把染料商放回屋顶,夜幕+玩家近/远两态:
//   A(玩家在看) → 原版语义:不传送,继续打转(视野双矩形门 :53831-53846)
//   B(玩家远离) → 原版 TeleportToHome 兜底:静默传送回家落地(:56063-56090)
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (20).json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const text = fs.readFileSync(MAP, 'utf8');
await p.evaluate((t) => window.__swFlow.loadJson(t), text);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await sleep(2000);
await p.evaluate(() => {
  document.getElementById('sw-boot-prime')?.remove();
  document.getElementById('sw-splash')?.remove();
  for (let i = 0; i < 10; i++) {
    const btn = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('我已知晓'));
    if (btn) { btn.click(); break; }
  }
});

const out = await p.evaluate(() => {
  const g = window.__swGame;
  const dyer = g.entities.npcs.find((n) => n.npcKey === 'dyer' && !n.dead);
  if (!dyer) return { err: 'dyer not found', keys: g.entities.npcs.map((n) => n.npcKey) };
  const T = 16;
  const place = () => {   // 屋顶右侧 3/4 处(行为日志典型位形)
    dyer.x = 611 * T; dyer.y = 331 * T - dyer.h - 0.1;
    dyer.vx = 0; dyer.vy = 0; dyer.walkMode = 1; dyer.walkT = 400; dyer.facing = 1;
  };
  const snap = (tag) => ({
    tag,
    x: +(dyer.x / T).toFixed(2), feet: +((dyer.y + dyer.h) / T).toFixed(2),
    vx: +dyer.vx.toFixed(2), mode: dyer.walkMode,
    tp: dyer.teleportedHome ?? false,
    home: dyer.home ? `${dyer.home.x},${dyer.home.y}` : 'null',
  });
  const ticks = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
  const night = () => { g.world.clock.timeOfDay = 0.95; };
  const res = { steps: [], a: [], b: [] };
  const ok = (n, c, e = '') => res.steps.push(`${c ? 'PASS' : 'FAIL'} ${n}${e ? ' | ' + e : ''}`);

  // ---- 场景 A:夜 + 玩家贴脸 → 视野门拦截,不得传送(原版语义) ----
  night(); place();
  g.player.x = 611 * T; g.player.y = 342 * T; g.player.vx = 0; g.player.vy = 0;
  g.player.dead = false; g.player.hp = g.player.maxHp;
  for (let i = 0; i < 20; i++) { ticks(60); res.a.push(snap('A' + i)); }
  {
    const feet = (dyer.y + dyer.h) / T;
    ok('A1 玩家在场不传送(原版视野门)', !dyer.teleportedHome && feet < 334,
      `feet=${feet.toFixed(1)} tp=${dyer.teleportedHome}`);
  }

  // ---- 场景 B:夜 + 玩家远离(>2044×1278 双矩形) → 兜底传送回家 ----
  night(); place(); dyer.teleportedHome = false;
  g.player.x = 900 * T; g.player.y = 300 * T;   // >100 格外
  for (let i = 0; i < 20; i++) { ticks(60); res.b.push(snap('B' + i)); }
  {
    const tx = dyer.x / T, feet = (dyer.y + dyer.h) / T;
    const landed = Math.abs(tx - 608) <= 2.5 && Math.abs(feet - 337) <= 1.5;
    ok('B1 玩家远离 → 静默传回家落位(608±2,337)', landed,
      `x=${tx.toFixed(1)} feet=${feet.toFixed(1)} tp=${dyer.teleportedHome}`);
  }

  // ---- 场景 C:白天雨(玩家远) → sitFlag 白天雨也兜底 ----
  g.world.clock.timeOfDay = 0.5;               // 正午
  g.world.weather.raining = true; g.world.weather.rainTime = 99999;
  place(); dyer.teleportedHome = false;
  ticks(1200);
  {
    const tx = dyer.x / T, feet = (dyer.y + dyer.h) / T;
    ok('C1 白天雨 → 传送回家(同兜底)', dyer.teleportedHome && Math.abs(tx - 608) <= 1.5,
      `x=${tx.toFixed(1)} feet=${feet.toFixed(1)} tp=${dyer.teleportedHome}`);
    g.world.weather.raining = false; g.world.weather.rainTime = 0;
  }
  return res;
});
for (const s of out.steps ?? []) console.log(s);
for (const s of [...(out.a ?? []), ...(out.b ?? [])]) console.log(JSON.stringify(s));
if (out.err) console.log('ERR', JSON.stringify(out));
await b.close();
console.log('done');

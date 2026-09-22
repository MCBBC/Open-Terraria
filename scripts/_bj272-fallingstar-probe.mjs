// ★BJ272 实机探针 v2（绕开 worldgen：__swLoadJson 载现成地图档,_bj223 同款）：
// 断言：①warmup=0 自然星下落穿过僵尸 → 掉血/击杀 + 落地 spawnDrop('vi_75_fallen_star')
//      ②全链 warmup=180 Spawner 转正星后同样伤敌（AI_148 :54059 damage=1000）
// 运行：SW_ORIGIN=http://localhost:5246 node tools/run-diag.mjs --timeout=300000 scripts/_bj272-fallingstar-probe.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1024, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  let rej = null;
  const loadP = window.__swLoadJson(t).catch((e) => { rej = String(e && e.stack || e).slice(0, 300); });
  for (let i = 0; i < 150 && !window.__swGame?.world; i++) {
    await wait(200);
    if (rej) return { fail: 'loadP-rejected', err: rej };
  }
  if (rej) return { fail: 'loadP-rejected', err: rej };
  if (!window.__swGame?.world) return { fail: 'world-timeout-30s' };
  try { await Promise.race([loadP, wait(5000)]); } catch { return { ok: true, note: 'loadP reject after world ready' }; }
  return { ok: true };
}, mapText);
console.log('[probe] boot', JSON.stringify(boot));
if (!boot.ok) { console.error('boot fail'); await browser.close(); process.exit(1); }

const drops = [];
await page.exposeFunction('__swBj272Drop', (k) => { drops.push(k); });

const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0;   // 夜（午夜）——白天清除门不触发
  await new Promise((r) => setTimeout(r, 200));
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { FallingStar } = await import('/src/entities/FallingStar.ts');
  const p = g.player;
  const st = g.world.store;
  const TILE = 16;
  const gx = p.x + 3 * TILE;
  let gy = -1;
  for (let j = 0; j < st.h; j++) { if (st.isSolid(Math.floor(gx / TILE), j)) { gy = j * TILE; break; } }
  if (gy < 0) return { fail: 'no-ground' };
  const origDrop = g.spawnDrop.bind(g);
  g.spawnDrop = (...a) => { try { window.__swBj272Drop(String(a[2])); } catch { /* ignore */ } return origDrop(...a); };
  window.__swBj272 = { gx, gy, zombieId: 0, starId: 0, pinIv: null, Enemy, FallingStar };
  return { ok: true, gx, gy, isDay: g.world.clock.isDay };
});
if (!setup.ok) { console.error('setup fail', JSON.stringify(setup)); await browser.close(); process.exit(1); }
console.log('[probe] setup', JSON.stringify(setup), 'isDay=', setup.isDay);

async function runOne(warmup) {
  const phase = await page.evaluate(async (warmup) => {
    const B = window.__swBj272;
    const g = window.__swGame;
    const e = B.Enemy.fromVanilla(3, B.gx, B.gy - 44);
    if (!e) return { fail: 'fromVanilla(3)' };
    g.entities.add(e, 'enemies');
    B.zombieId = e.id;
    const hp0 = e.hp;
    const s = new B.FallingStar(B.gx, B.gy - 44 - (warmup > 0 ? 400 : 200), 0, 12, warmup, false, true);
    g.entities.add(s, 'projectiles');
    B.starId = s.id;
    if (B.pinIv) clearInterval(B.pinIv);
    B.pinIv = setInterval(() => {
      const zz = g.entities.enemies.find((x) => x.id === B.zombieId);
      const ss = g.entities.projectiles.find((x) => x.id === B.starId);
      if (!zz || zz.dead || !ss || ss.dead) { clearInterval(B.pinIv); return; }
      zz.x = B.gx - zz.w / 2; zz.y = B.gy - zz.h; zz.vx = 0;
    }, 50);
    return { ok: true, hp0, starId: s.id };
  }, warmup);
  if (!phase.ok) return { fail: phase.fail };
  let res = null;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 500));
    res = await page.evaluate((starId) => {
      const B = window.__swBj272;
      const g = window.__swGame;
      const s = g.entities.projectiles.find((x) => x.id === starId);
      const e = g.entities.enemies.find((x) => x.id === B.zombieId);
      return { starDead: !s || s.dead, zombieDead: !e || e.dead, hp: e ? e.hp : 0, starY: s ? Math.round(s.y) : -1, warmupLeft: s ? s.warmup : -1 };
    }, phase.starId);
    if (res.starDead) break;
  }
  await page.evaluate((starId) => {
    const B = window.__swBj272;
    if (B.pinIv) clearInterval(B.pinIv);
    const g = window.__swGame;
    const e = g.entities.enemies.find((x) => x.id === B.zombieId);
    if (e && !e.dead) e.dead = true;
  }, phase.starId);
  return { ...phase, ...res };
}

const A = await runOne(0);
const B = await runOne(180);
console.log('BJ272 A=' + JSON.stringify(A));
console.log('BJ272 B=' + JSON.stringify(B));
console.log('BJ272 drops=' + JSON.stringify(drops));
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
const okA = A.hp0 !== undefined && (A.hp0 - A.hp) > 0;
const okB = B.hp0 !== undefined && (B.hp0 - B.hp) > 0;
console.log(okA && okB ? 'PROBE=PASS' : 'PROBE=CHECK');
await browser.close().catch(() => {});
process.exit(okA && okB && errors.length === 0 ? 0 : 2);

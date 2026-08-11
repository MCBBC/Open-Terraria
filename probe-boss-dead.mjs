// 全 Boss 玩家死亡处置验证（一次性生成+死亡+采样，避免 HMR 重载打断）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
const run = async () => {
  await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
  await new Promise(r => setTimeout(r, 1500));
  return p.evaluate(async () => {
    const g = window.__swGame;
    g.enemySpawnEnabled = false;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const ids = [4, 50, 13, 266, 125, 127, 134, 262, 370, 439, 636, 657];
    const spawned = [];
    ids.forEach((id, k) => {
      const e = Enemy.fromVanilla(id, g.player.cx + 120 + k * 10, g.player.cy - 80);
      if (!e) return;
      e.id = g.entities.nextId++;
      g.entities.add(e, 'enemies');
      spawned.push({ id, e, y0: e.y, x0: e.x });
    });
    g.player.hp = 0; g.player.dead = true;
    await sleep(1600); // ~96 tick（BoC 计数/缩身/渐隐需 >60t；<180t 重生线）
    const out = {};
    for (const s of spawned) {
      const e = s.e;
      out[s.id] = {
        vy: +e.vy.toFixed(2), gone: e.dead,
        dy: Math.round(e.y - s.y0), dx: Math.round(e.x - s.x0),
        ai0: e.ai0, ai1: e.ai1, ai3: e.ai3,
        desp: e.despawnEncouraged, despT: e.despawnTimer,
      };
    }
    return out;
  });
};
let out = null;
for (let i = 0; i < 4 && !out; i++) {
  try { out = await run(); } catch (e) { await new Promise(r => setTimeout(r, 2000)); }
}
if (!out) { console.log('PROBE FAIL (page reloads)'); process.exit(1); }
// 断言（按原版语义）
const A = (id, f) => out[id] && f(out[id]);
const checks = {
  '4_EoC_上飞+despawn': A(4, r => r.vy < 0 && r.desp),
  '50_KS_离场传送/消散': A(50, r => r.gone || Math.abs(r.dx) > 500),
  '13_EoW_缓消300不瞬消': A(13, r => r.desp && r.despT <= 300),
  '266_BoC_钻地下坠': A(266, r => r.vy > 0 || r.dy > 0),
  '125_双子_上飞+despawn': A(125, r => r.vy < 0 && r.desp),
  '127_Prime_下落离场': A(127, r => r.ai1 === 3 || r.vy > 0),
  '134_毁灭者_下钻': A(134, r => r.vy > 0 || r.dy > 0),
  '262_世花_反向逃跑存活': A(262, r => !r.gone),
  '370_猪鲨_急升+despawn': A(370, r => r.vy < 0 && r.desp),
  '439_邪教徒_瞬消': A(439, r => r.gone),
  '636_光皇_渐隐/瞬消': A(636, r => r.ai0 === 13 || r.gone),
  '657_皇后_despawn+背对': A(657, r => r.desp),
};
console.log(JSON.stringify(out, null, 1));
let ok = true;
for (const [k, v] of Object.entries(checks)) { console.log(v ? '✓' : '✗', k); ok = ok && !!v; }
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);

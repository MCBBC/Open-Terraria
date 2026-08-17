// 兔子 AI 端到端探针（2026-08-17）——手动 fixedUpdate 步进（不依赖页面时钟）:
//   1. critters 桶全 Enemy 化（零遗留 Critter 类实例）
//   2. spawner 友好链在工作（观测窗:尝试数/友好轮数——概率链只作通畅性下限）
//   3. ★确定性核心断言:spawnNpcByVanilla(46) 出生兔 → 240 帧平地行走采样
//      无自发跳脉冲 + 巡航速度 ≥0.5px/t（旧 Critter hop 是 vy≈-3.2~-4 周期跳、
//      摩擦压制的 0.4px/t 蠕行——两种旧病都会在此翻红）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });

// ---- 观测窗:6000t 自然刷怪（尝试/友好通畅性）----
const obs = await page.evaluate(() => {
  const g = window.__swGame;
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  const sp = g.vanillaSpawner;
  const s = { attempts: 0, friendly: 0 };
  const orig = sp.spawn.bind(sp);
  sp.spawn = (...a) => {
    s.attempts++;
    if (sp.spawnFriendlyCycle) s.friendly++;
    return orig(...a);
  };
  for (let i = 0; i < 6000; i++) g.fixedUpdate(1 / 60);
  sp.spawn = orig;
  s.legacy = g.entities.critters.some((c) => 'hopCd' in c);
  return s;
});
console.log(JSON.stringify(obs));

// ---- 确定性断言:出生兔 46 行走采样 ----
const walk = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 玩家右侧 30 格列找地表（离屏放置,出生即玩家同生态）
  const px = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.player.cy / 16);
  let placed = null;
  for (const dx of [30, 35, 40, 25, 45]) {
    const tx = px + dx;
    if (tx < 4 || tx >= st.w - 4) continue;
    for (let y = Math.max(4, py - 30); y < Math.min(st.h - 4, py + 40); y++) {
      if (st.isSolid(tx, y)) {
        // 脚底 y*16；Enemy 构造器 (x,y)=中心
        const e = g.spawnNpcByVanilla(46, tx * 16 + 8, y * 16 - 10);
        if (e) { placed = e; break; }
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) return { noSpawn: true };
  const s = { minVy: 0, maxVx: 0, standTicks: 0, moved: false, x0: placed.x };
  for (let f = 0; f < 240; f++) {
    g.fixedUpdate(1 / 60);
    if (placed.dead) return { died: true };
    if (placed.vy < s.minVy) s.minVy = placed.vy;
    if (Math.abs(placed.vx) > s.maxVx) s.maxVx = Math.abs(placed.vx);
    if (Math.abs(placed.vx) < 0.05) s.standTicks++;
    if (Math.abs(placed.x - s.x0) > 40) s.moved = true;
  }
  s.isEnemy = placed.vanillaId === 46;
  s.legacy = 'hopCd' in placed;
  return s;
});
console.log(JSON.stringify(walk, null, 1));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('critters 桶全 Enemy 化（零遗留 Critter 实例）', !obs.legacy);
check('spawner 尝试 ≥2（roll 门通畅）', obs.attempts >= 2, `attempts=${obs.attempts} friendly=${obs.friendly}`);
if (walk.noSpawn) { console.log('FAIL: 出生兔放置失败'); fail++; }
else if (walk.died) { console.log('FAIL: 出生兔 240 帧内死亡'); fail++; }
else {
  check('出生兔是 Enemy（vanillaId=46,非遗留类）', walk.isEnemy && !walk.legacy);
  check('兔 240 帧无自发跳脉冲（minVy ≥ -2.5）', walk.minVy >= -2.5, `minVy=${walk.minVy.toFixed(2)}`);
  check('兔巡航速度 ≥0.5px/t（无摩擦压制）', walk.maxVx >= 0.5, `maxVx=${walk.maxVx.toFixed(2)}`);
  check('兔真实位移 >40px（在走动）', walk.moved);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

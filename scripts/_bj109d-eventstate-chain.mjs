// BJ109-D 一次性探针：四柱事件态+生命线全链实跑（触发→四塔在场→杀塔→计数→月主召）。
// 经 tools/run-diag.mjs 运行；SW_ORIGIN 指向私有 vite 实例。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const towers = () => (g.entities.enemies || []).filter((e) => !e.dead && [517, 422, 507, 493].includes(e.vanillaId));
  const snap = () => ({
    active: w.lunarEvent.active,
    towerActive: { ...w.lunarEvent.towerActive },
    shield: { ...w.lunarEvent.shield },
    countdown: w.lunarEvent.moonLordCountdown,
    crystal: w.lunarEvent.crystalDeath ? { t: w.lunarEvent.crystalDeath.t } : null,
    towers: towers().map((e) => ({ id: e.vanillaId, cx: Math.round(e.cx), bottom: Math.round(e.y + e.h), ai2: e.ai2, ai1: Math.round(e.ai1 ?? 0) })),
    flags: {
      lunarApocalypseUp: !!w.flags.lunarApocalypseUp,
      downedTowerSolar: !!w.flags.downedTowerSolar,
      downedTowerVortex: !!w.flags.downedTowerVortex,
      downedTowerNebula: !!w.flags.downedTowerNebula,
      downedTowerStardust: !!w.flags.downedTowerStardust,
    },
    boss: g.boss ? g.boss.vanillaId : null,
  });
  const R = {};
  R.before = snap();

  // ---- ① 触发（Game.triggerLunarApocalypse = 教徒 439 死消费面）----
  g.triggerLunarApocalypse();
  await sleep(400);
  R.afterTrigger = snap();
  R.afterTrigger.broadcastTail = (g.recentTexts || []).slice(-3);
  R.colAnchors = R.afterTrigger.towers.map((t) => ({
    id: t.id, col: Math.round(((t.cx - t.cx % 1) - (t.cx - Math.round(t.cx))) * 0) || null, cxTile: Math.round(t.cx / 16),
  }));

  // ---- ② 日常维持：玩家传送远离 + 等待，塔不消散（DoesntDespawnToInactivity 面）----
  const keepX = g.player.x, keepY = g.player.y;
  g.player.x = 100; g.player.y = (w.groundLevel - 30) * 16;
  await sleep(1500);
  R.afterTeleportAway = { towerCount: towers().length, playerTeleported: true };
  g.player.x = keepX; g.player.y = keepY;

  // ---- ③ 杀日耀塔：盾清 0 →（等一帧让 towerAI 重算 dontTakeDamage）→ 真伤 →
  //         ai2 死亡演出（180t）→ 塔死链。杀前把玩家传到塔边（真实交战路径，
  //         且保证 towerAI 每 tick 跑）----
  const killTower = async (id, key, waitMs = 3600) => {
    const t = towers().find((e) => e.vanillaId === id);
    if (!t) return null;
    g.player.x = t.cx; g.player.y = t.y - 240; g.player.vx = 0; g.player.vy = 0;
    w.lunarEvent.shield[key] = 0;
    await sleep(150);                       // 等 towerAI 翻 dontTakeDamage
    const ddFlag = t.dontTakeDamage;
    const hpBefore = t.hp;
    t.hurt(1e9, 0, 0, g);
    await sleep(waitMs);
    return { ddFlag, hpBefore, id };
  };
  const solar = towers().find((e) => e.vanillaId === 517);
  w.lunarEvent.shield.solar = 0;
  await sleep(150);
  R.solarHpBefore = solar.hp;
  R.solarDontTakeDamageAfterShieldZero = solar.dontTakeDamage;
  solar.hurt(1e9, 0, 0, g);          // 触发 hurt → ai2=1 死亡演出
  await sleep(700);
  R.duringDeathAnim = snap();        // ai2=1 / ai1 增长 / 渐隐中 / 仍在场（TowerActive 未清）
  await sleep(2800);                 // 180t ≈ 3s 演出毕 → hurt(1e9) 真死管线
  await sleep(400);
  R.afterSolarDeath = snap();
  R.afterSolarDeath.broadcastTail = (g.recentTexts || []).slice(-2);

  // ---- ④ 其余三塔同法杀 → 四旗全倒 → ImpendingDoom(3600) ----
  for (const id of [422, 507, 493]) {
    await killTower(id, { 422: 'vortex', 507: 'nebula', 493: 'stardust' }[id]);
  }
  R.afterAllTowers = snap();
  R.afterAllTowers.broadcastTail = (g.recentTexts || []).slice(-2);

  // ---- ⑤ 倒计时提速 → 归零召月主（Main.cs:65963-65969 消费面）----
  w.lunarEvent.moonLordCountdown = Math.min(w.lunarEvent.moonLordCountdown, 30);
  await sleep(1200);
  R.afterCountdown = snap();
  R.moonLord = towers && (g.entities.enemies || []).filter((e) => !e.dead && e.vanillaId === 398)
    .map((e) => ({ cx: Math.round(e.cx), cy: Math.round(e.cy) }));

  // ---- ⑥ 存读档回填验证：杀塔旗保留 + 活塔旗重置盾满（走 applyLunarSave 面）----
  const mod = await import('/src/world/LunarEvent.ts');
  mod.applyLunarSave(w);
  R.afterApplyLunarSave = { towerActive: { ...w.lunarEvent.towerActive }, shield: { ...w.lunarEvent.shield }, active: w.lunarEvent.active };
  return R;
});

console.log(JSON.stringify(out, null, 1));
await browser.close();

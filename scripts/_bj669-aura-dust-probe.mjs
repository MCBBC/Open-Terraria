// ★BJ669d 闪电光环 688 电弧尘探针：召唤 688+僵尸靶 → 60 拍统计尘 226 生成
//  （j 循环=场缘定点尘 velocity 朝 anchor / l 循环=塔柱向上尘）——定位 j 循环零产出。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj669-aura-dust-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669a', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});
// 拦截 spawnDust 计数尘 226（先包装再召唤）
await page.evaluate(() => {
  const g = window.__swGame;
  const orig = g.spawnDust?.bind(g);
  window.__dustLog = [];
  if (orig) {
    g.spawnDust = (...a) => {
      const d = orig(...a);
      if (d && a[4] === 226) {
        window.__dustLog.push({ x: +d.x.toFixed(0), y: +d.y.toFixed(0), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2), scale: d.scale });
      }
      return d;
    };
  }
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const p = g.player;
  // 688 哨兵：放在玩家前方平地（净空场）
  const sentry = new MinionProj(p.cx + 40, p.cy + 20, 688, 10, 0, true, 0, false, () => g.player);
  g.entities.add(sentry, 'projectiles');
  // 敌靶（僵尸）入场域
  const e = await window.__swFlow.spawnVanillaEnemy(3, p.cx + 60, p.cy + 10);
  window.__enemy = e;
});
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sentry = g.entities.projectiles.find((p) => p.projId === 688 && !p.dead);
  const log = window.__dustLog || [];
  // 分布统计：dx = 尘 x − 塔心 x（|dx|>10=外围 / else 中轴）
  let outer = 0, mid = 0;
  const samples = [];
  for (const d of log) {
    const dx = d.x - (sentry ? sentry.cx : 0);
    if (Math.abs(dx) > 10) outer++; else mid++;
    if (samples.length < 10) samples.push({ dx: +dx.toFixed(0), dy: +d.y.toFixed(0), vx: d.vx, vy: d.vy });
  }
  return {
    total: log.length, outer, mid,
    sentry: sentry ? { cx: sentry.cx, cy: sentry.cy, side: sentry.auraSide, w: sentry.w } : null,
    enemyAlive: g.entities.enemies.some ? true : true,
    samples,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

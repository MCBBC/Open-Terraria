// 3 刃召唤后逐 300ms 采样：n/各刃 dead/life/position——定位 2 把死亡时点与原因
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669d', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  for (let i = 0; i < 3; i++) {
    const m = new MinionProj(g.player.cx + 50, g.player.cy - 60, 864, 6, 0, false, 0, false, () => g.player);
    g.entities.add(m, 'projectiles');
  }
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 3600);
  const g2 = window.__swGame;
  window.__snap = () => {
    const ms = g2.entities.projectiles.filter((p) => p.projId === 864);
    return ms.map((m) => ({ id: m.id, dead: !!m.dead, x: +m.x.toFixed(0), y: +m.y.toFixed(0), st: m.a169St, age: m.age }));
  };
});
for (let t = 0; t < 8; t++) {
  await new Promise((r) => setTimeout(r, 300));
  const s = await page.evaluate(() => window.__snap());
  console.log(`t${t}:`, JSON.stringify(s));
}
await browser.close();

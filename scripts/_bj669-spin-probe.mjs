// ★BJ669c 多刃轮转快照探针：3 刃同场→间隔 500ms×6 次快照（各刃 x/y + gtw）——
//  轮转在跑=各刃 x 随时间摆动（±12px 椭圆）；轮转没跑=恒死位（叠栈实心根因）。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj669-spin-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669s', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});
const snaps = [];
for (let round = 0; round < 6; round++) {
  if (round === 0) {
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
    });
    await new Promise((r) => setTimeout(r, 1500));
  } else {
    await new Promise((r) => setTimeout(r, 500));
  }
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    const ms = g.entities.projectiles.filter((p) => p.projId === 864 && !p.dead);
    return {
      n: ms.length,
      blades: ms.map((m) => [+m.x.toFixed(1), +m.y.toFixed(1)]),
      gtw: (async () => {
        const { globalTimeWrappedHourly } = await import('/src/core/GameTime.ts');
        return +globalTimeWrappedHourly().toFixed(3);
      })(),
    };
  });
  snaps.push(s);
  console.log(`t${round}: n=${s.n} gtw=${await s.gtw} blades=${JSON.stringify(s.blades)}`);
}
const live = snaps.filter((s) => s.n >= 3);
if (live.length >= 2) {
  const xRanges = [0, 1, 2].map((i) => {
    const xs = live.map((s) => s.blades[i]?.[0] ?? 0);
    return +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
  });
  console.log('各刃 x 摆幅(px):', JSON.stringify(xRanges), '→', xRanges.every((r) => r > 4) ? '轮转在跑' : '轮转没跑（恒死位）');
}
await browser.close();

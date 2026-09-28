// 491 渲染缺失取证第 2 刀:drawDutchman 是否被调/atlas 懒加载是否落表/失败负缓存。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'dutchman-frames');
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
const sp = await spawnEnemy(page, 491, ppos.x - 430, ppos.y + 20);
await pump(page, 8);

const dbg = await page.evaluate(async () => {
  const g = window.__swGame;
  const R = Object.getPrototypeOf(g.renderer);
  // 1) 挂计数器
  if (!window.__ddOrig) {
    window.__ddCalls = 0;
    window.__ddOrig = R.drawDutchman;
    R.drawDutchman = function (...a) { window.__ddCalls++; return window.__ddOrig.apply(this, a); };
    // 492 独立绘制跳过分支计数
    window.__ddSkip492 = 0;
  }
  // 2) ensureVImage 两连击(第一次发起懒加载,第二次应落表)
  const atlas = g.renderer.atlas;
  const first = atlas.ensureVImage('vanilla/NPC_491.png');
  const first40 = atlas.ensureVImage('vanilla/Extra_40.png');
  return { first491: first ? { w: first.width, h: first.height } : null, first40: first40 ? { w: first40.width, h: first40.height } : null };
});
await pump(page, 12);
const dbg2 = await page.evaluate(() => {
  const atlas = window.__swGame.renderer.atlas;
  const second = atlas.ensureVImage('vanilla/NPC_491.png');
  const second40 = atlas.ensureVImage('vanilla/Extra_40.png');
  return {
    calls: window.__ddCalls,
    second491: second ? { w: second.width, h: second.height } : null,
    second40: second40 ? { w: second40.width, h: second40.height } : null,
    failed: atlas.failedVImages().filter((f) => /NPC_49|Extra_4[0-5]/.test(f)),
    failedAll: atlas.failedVImages().length,
    shipAlive: !!(window.__swGame.entities.enemies ?? []).find((e) => e.vanillaId === 491 && !e.dead),
  };
});
console.log(JSON.stringify({ ...dbg, ...dbg2 }, null, 1));
await browser.close();
process.exit(0);

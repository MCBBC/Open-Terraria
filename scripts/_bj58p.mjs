/**
 * SW-BJ58 探针 P：渲染子系统扫除(differential disable)。
 * 全部 2D 通道 hook 均未见精灵绘制调用 → 反向定位:逐个 no-op renderer 的
 * 绘制/步进方法,看哪个被停掉后 row 盒橙斑消失 → 元凶子系统。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const ROWHIT = `(() => {
  const g = window.__swGame;
  const c2 = document.createElement('canvas');
  c2.width = 340; c2.height = 70;
  const cx = c2.getContext('2d', { willReadFrequently: true });
  cx.drawImage(g.renderer.canvas, 660, 370, 340, 70, 0, 0, 340, 70);
  const d = cx.getImageData(0, 0, 340, 70).data;
  let hit = 0;
  for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
  return hit;
})()`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);
  const base = await page.evaluate(ROWHIT);
  L.say(`基线 rowBox=${base}`);

  const sweep = await page.evaluate(async (ROWHITSrc) => {
    const g = window.__swGame;
    const proto = Object.getPrototypeOf(g.renderer);
    const names = Object.getOwnPropertyNames(proto).filter((n) => /^draw|^step|^render|^stamp|^flush/.test(n) && typeof g.renderer[n] === 'function');
    const measure = () => {
      const c2 = document.createElement('canvas');
      c2.width = 340; c2.height = 70;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      cx.drawImage(g.renderer.canvas, 660, 370, 340, 70, 0, 0, 340, 70);
      const d = cx.getImageData(0, 0, 340, 70).data;
      let hit = 0;
      for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
      return hit;
    };
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const out = [];
    for (const n of names) {
      const orig = g.renderer[n].bind(g.renderer);
      g.renderer[n] = function () { return undefined; };
      try { g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60); } catch (e) { /* pump */ }
      await frame(); await frame(); await frame();
      let hit = -1, err = '';
      try { hit = measure(); } catch (e) { err = String(e).slice(0, 40); }
      g.renderer[n] = orig;
      out.push({ n, hit, err });
      await frame();
    }
    return { names: names.length, out };
  }, ROWHIT);
  writeFileSync(`${OUT}/sweep.json`, JSON.stringify(sweep, null, 1));
  L.say(`sweep methods=${sweep.names}`);
  for (const r of sweep.out) {
    if (r.hit < base * 0.55 || r.err) L.say(`  ${r.n}: ${r.hit}${r.err ? ' ERR:' + r.err : ''} ${r.hit < base * 0.55 ? ' ← 元凶候选' : ''}`);
  }
  const kept = sweep.out.filter((r) => r.hit >= base * 0.55 && !r.err).map((r) => `${r.n}:${r.hit}`);
  L.say('无影响: ' + kept.join(' '));
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

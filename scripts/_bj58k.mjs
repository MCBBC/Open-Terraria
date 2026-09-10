/**
 * SW-BJ58 探针 K：粒子身份定谳。
 * 判据链:精灵=fillRect 色块粒子(探针 J 证每帧重画+随玩家;drawImage/putImageData
 * 全记录无它)。本轮直读 g.particles 池,比对装备/摘除两态在 row 盒内的粒子
 * (x,y,color,size,life) → 定位生成源。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const SNAP = `(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const arr = g.particles ?? [];
  const inBox = [];
  for (const p of arr) {
    const sx = p.x - cam.x + cam.viewW / 2 / (cam.zoom || 1) * 0 + 640; // zoom=1 屏=世界-cam+640
    const sxx = p.x - cam.x + 640, syy = p.y - cam.y + 400;
    if (sxx > 660 && sxx < 980 && syy > 360 && syy < 430) {
      inBox.push({ x: +sxx.toFixed(1), y: +syy.toFixed(1), wx: +p.x.toFixed(1), wy: +p.y.toFixed(1), c: p.color, s: p.size, life: +p.life.toFixed(2), max: p.maxLife, vx: +p.vx?.toFixed(2), vy: +p.vy?.toFixed(2), grav: p.gravity });
    }
  }
  return { total: arr.length, box: inBox, player: { cx: g.player.cx, cy: g.player.cy, facing: g.player.facing } };
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

  const snapNone = await page.evaluate(SNAP);
  L.say(`[无配件] 粒子总数=${snapNone.total} rowBox内=${snapNone.box.length}`);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);
  const snapHoc = await page.evaluate(SNAP);
  L.say(`[创造之手] 粒子总数=${snapHoc.total} rowBox内=${snapHoc.box.length}`);
  writeFileSync(`${OUT}/particles-hoc.json`, JSON.stringify(snapHoc, null, 1));
  const byColor = {};
  for (const p of snapHoc.box) byColor[p.c] = (byColor[p.c] ?? 0) + 1;
  L.say('rowBox 粒子颜色分布: ' + JSON.stringify(byColor));
  for (const p of snapHoc.box.slice(0, 30)) L.say(`  (${p.x},${p.y}) wx=(${p.wx},${p.wy}) c=${p.c} s=${p.s} life=${p.life}/${p.max} v=(${p.vx},${p.vy})`);
  // 多帧采样看粒子寿命/再生(帧间 id 稳定性)
  const frames = [];
  for (let i = 0; i < 5; i++) {
    await nextFrame(page);
    const s = await page.evaluate(SNAP);
    frames.push(s.box.length);
  }
  L.say(`5帧 rowBox 粒子数序列: ${frames.join(',')}`);
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

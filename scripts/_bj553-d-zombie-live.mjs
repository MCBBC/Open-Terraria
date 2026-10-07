/**
 * BJ553-d:鞭标记活体复验 v3(可追敌靶)。
 *  v2 伪影定谳:TownNPC 靶被 updateMinionAttackTarget 的 canBeChasedBy 门 2 帧清槽
 *  → tid=-1 → recs=0 系探针伪影。真链=鞭打真敌怪(可追)→ 槽活。
 *  面:tid 稳定性(僵尸,30 拍)→ ON/OFF 差分+drawImage 记账(帧序 sy=frameY×18 活体核对)
 *  → dest 对位 → 摘鞭对照。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, teleport,
  saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553d';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553Recs = [];
window.__bj553On = false;
window.__bj553Install = () => {
  let n = 0;
  for (const proto of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
    if (proto.__bj553p) continue;
    proto.__bj553p = true;
    const oi = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        if (window.__bj553On && a.length === 9) {
          const src = a[0];
          const w = src && (src.width ?? 0), h = src && (src.height ?? 0);
          if (w === 16 && h === 72 && a[3] === 16 && a[4] === 16
              && window.__bj553Recs.length < 200) {
            window.__bj553Recs.push({
              srcKind: src?.constructor?.name ?? '?',
              alpha: +this.globalAlpha.toFixed(4),
              comp: this.globalCompositeOperation,
              sx: a[1], sy: a[2],
              dx: Math.round(a[5] * 10) / 10, dy: Math.round(a[6] * 10) / 10,
              caller: (new Error().stack.split('\\n')[2] || '').trim().slice(0, 130),
            });
          }
        }
      } catch (e) {}
      return oi.apply(this, a);
    };
    n++;
  }
  return 'installed x' + n;
};
'ok';
`;

const SETTID = `(() => {
  const g = window.__swGame;
  const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
  if (z) g.player.minionTargetId = z.id;
  return z ? z.id : -1;
})()`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie', tid: g.player.minionTargetId };
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const [px, py] = cam.worldToScreen(e.cx, e.cy);
  const z = cam.zoom ?? 1;
  const R = Math.ceil(24 * z);
  const sx = Math.round(px) - R, sy = Math.round(py) - R, W = R * 2, H = R * 2;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  return { why: null, data: Array.from(g2.getImageData(0, 0, W, H).data),
    px: Math.round(px), py: Math.round(py), z, ex: Math.round(e.cx), ey: Math.round(e.cy),
    eid: e.id, tid: g.player.minionTargetId };
})()`;

function diffCount(a, b) {
  if (!a || !b || a.why || b.why || a.data.length !== b.data.length) return { ok: false };
  let n = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  const R = Math.sqrt(a.data.length / 4) | 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) {
      n++;
      const px = (i >> 2) % R, py = (i >> 2) / R | 0;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
  }
  return { ok: true, n, bbox: [minx, miny, maxx, maxy], R };
}

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
  await pump(page, 30);

  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 100));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, JSON.stringify(sp).slice(0, 100));
  await pump(page, 3);

  // tid 稳定性:可追敌写槽 30 拍不应被清
  const tidSet = await page.evaluate(SETTID);
  await pump(page, 30);
  const tidStable = await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
    return { tid: g.player.minionTargetId, zombieAlive: !!z && !z.dead,
      zPos: z ? [Math.round(z.cx), Math.round(z.cy)] : null };
  });
  L.say(`tid: set=${tidSet} after30=${tidStable.tid} alive=${tidStable.zombieAlive} pos=${JSON.stringify(tidStable.zPos)}`);
  L.chk('tid-stable-chaseable', tidStable.tid === tidSet && tidSet > 0, `set=${tidSet} after=${tidStable.tid}`);

  const inst = await page.evaluate(INSTALL);
  L.say(`hook: ${inst}`);
  await page.evaluate(() => { window.__bj553Recs.length = 0; window.__bj553On = true; });

  const on1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const on2 = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  const off1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const off2 = await page.evaluate(SAMPLE);
  await page.evaluate(SETTID);
  const on3 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const on4 = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__bj553On = false; });

  const dOnOn = diffCount(on2, on1);
  const dOffOff = diffCount(off1, off2);
  const dOnOff = diffCount(on1, off1);
  const dReOn = diffCount(on3, off2);
  const dReOn2 = diffCount(on4, off2);
  L.say(`tid at samples: on1=${on1.tid} off1=${off1.tid} on3=${on3.tid}`);
  L.say(`diff ON/ON=${dOnOn.ok ? dOnOn.n : 'x'} OFF/OFF=${dOffOff.ok ? dOffOff.n : 'x'}`);
  L.say(`diff ON/OFF=${JSON.stringify(dOnOff.ok ? { n: dOnOff.n, bbox: dOnOff.bbox, R: dOnOff.R } : dOnOff)}`);
  L.say(`diff reON/OFF=${dReOn.ok ? dReOn.n : 'x'} reON2=${dReOn2.ok ? dReOn2.n : 'x'}`);

  const recs = await page.evaluate(() => window.__bj553Recs);
  L.say(`drawImage recs(16x72): ${recs.length}`);
  for (const r of recs.slice(0, 4)) L.say(`  rec: ${JSON.stringify(r)}`);
  const sys = [...new Set(recs.map((r) => r.sy))].sort((a, b) => a - b);
  L.say(`frame sy set: ${JSON.stringify(sys)}（期望 ⊆ {0,18,36,54} 活体帧序）`);
  if (on1 && !on1.why && recs.length) {
    L.say(`zombie screen=(${on1.px},${on1.py}) draw dx=${Math.round((recs[0].dx - on1.px) * 10) / 10} dy=${Math.round((recs[0].dy - on1.py) * 10) / 10}`);
  }
  await saveCanvasShot(page, `${OUT}/bj553d-marker.png`).catch(() => {});

  // 摘鞭对照:手持铜阔剑 → 槽仍在但标记消隐(原版 HeldItem.summon 门)
  await giveItems(page, [{ vid: 3507, slot: 1 }], { select: 1 });
  await pump(page, 2);
  await page.evaluate(() => { window.__bj553Recs.length = 0; window.__bj553On = true; });
  const offSword = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__bj553On = false; });
  const recsSword = await page.evaluate(() => window.__bj553Recs.length);
  const dSword = diffCount(offSword, off2);
  L.say(`sword-held: recs=${recsSword} diff vs OFF=${dSword.ok ? dSword.n : 'x'}`);
  L.chk('sword-hides-marker', recsSword === 0, `recs=${recsSword}`);

  L.chk('draw-call-observed', recs.length > 0, `recs=${recs.length}`);
  L.chk('marker-pixels-appear', dOnOff.ok && dOnOff.n > 200 && dOffOff.ok && dOffOff.n < dOnOff.n / 2,
    `ON/OFF=${dOnOff.ok ? dOnOff.n : 'x'} OFF/OFF=${dOffOff.ok ? dOffOff.n : 'x'}`);
  L.chk('reappears-reon', dReOn2.ok && dReOn2.n > 200, `reON2=${dReOn2.ok ? dReOn2.n : 'x'}`);

  writeFileSync(`${OUT}/bj553d-result.json`, JSON.stringify({ tidSet, tidStable, recs: recs.slice(0, 8), sys, dOnOn, dOnOff, dOffOff, dReOn, dReOn2 }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

/**
 * BJ553-c:鞭标记活体复验 v2。
 *  v1 教训:①假人 488 六拍内消散 → 换 TownNPC guide(近静态)②sheet:false 系首拍懒取
 *  非死证 → 先预热钉落表帧数 ③drawImage recs 窗口要在贴图落表后开。
 *  面:网络可达(HEAD)→ 落表帧数 → 门快照 → ON/OFF 差分像素 + drawImage 记账 →
 *  摘鞭对照(手持非召唤武器=门假支,标记消隐=原版相)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, spawnEnemy, giveItems, spawnTownNPC, teleport,
  saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553c';
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

const NETCHECK = `(async () => {
  const r = await fetch('sprites/vanilla/Extra_199.png', { method: 'GET' });
  const b = await r.arrayBuffer();
  return { status: r.status, bytes: b.byteLength,
    ihdrW: new DataView(b).getUint32(16), ihdrH: new DataView(b).getUint32(20) };
})()`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.npcs ?? []).find((en) => en.vanillaId === 22)
    ?? (g.entities.enemies ?? [])[0];
  if (!e) return { why: 'no-target' };
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
    eid: e.id, vid: e.vanillaId };
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

  // 网络可达性
  const net = await page.evaluate(NETCHECK);
  L.say(`net(Extra_199): ${JSON.stringify(net)}`);
  L.chk('net-200-16x72', net.status === 200 && net.ihdrW === 16 && net.ihdrH === 72,
    `status=${net.status} ${net.ihdrW}x${net.ihdrH} ${net.bytes}B`);

  // 贴图预热:首调(懒发)→ 逐帧盯落表
  const warm = await page.evaluate(`(async () => {
    const a = window.__swGame.renderer.atlas;
    const first = a.ensureVImage('vanilla/Extra_199.png');
    let frames = 0;
    while (frames < 120) {
      const s = a.ensureVImage('vanilla/Extra_199.png');
      if (s) return { landed: true, frames, w: s.width, h: s.height, kind: s.constructor?.name };
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
    }
    return { landed: false, frames };
  })()`);
  L.say(`warm(Extra_199): ${JSON.stringify(warm)}`);
  L.chk('sheet-lands', warm.landed === true && warm.w === 16 && warm.h === 72,
    `landed=${warm.landed} frames=${warm.frames}`);

  // 鞭上手 + 向导(近静态)贴身
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 100));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const tn = await spawnTownNPC(page, 'guide', { x: spot.x + 72, yFoot: spot.y + 24 });
  L.chk('spawn-guide', tn.ok, JSON.stringify(tn).slice(0, 120));
  await pump(page, 6);

  const inst = await page.evaluate(INSTALL);
  L.say(`hook: ${inst}`);

  // 写槽(鞭命中等价态;写链单测已钉)+ 门快照(此时贴图已落表,sheet 应 true)
  const gate = await page.evaluate(`(() => import('/src/data/vanillaItemCombat.ts').then(async (cwMod) => {
    const { ITEM_DEFS } = await import('/src/data/items.ts?t=' + Date.now());
    const g = window.__swGame;
    const p = g.player;
    const held = p.inv.heldItem ? p.inv.heldItem() : p.inv.slots[p.inv.selected];
    const def = held ? ITEM_DEFS[held.id] : undefined;
    const cw = def ? cwMod.combatWeapon(def) : null;
    const t = (g.entities.npcs ?? [])[0];
    if (t) p.minionTargetId = t.id;
    const s = g.renderer.atlas?.ensureVImage('vanilla/Extra_199.png');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      dead: !!p.dead, tid: p.minionTargetId, kind: cw?.kind ?? null,
      tgtVid: t?.vanillaId ?? null, tgtInNpcs: !!t,
      sheet: !!s, sheetW: s?.width ?? null, sheetH: s?.height ?? null,
      renderEntitiesHasNpc: t ? true : false,
    };
  }))()`);
  L.say(`gate: ${JSON.stringify(gate)}`);
  L.chk('gate-all-true', gate.dead === false && gate.tid >= 0
    && (gate.kind === 'summon' || gate.kind === 'whip') && gate.tgtInNpcs
    && gate.sheet === true, JSON.stringify(gate).slice(0, 160));

  // ON/OFF 差分(drawImage 窗口全程开)
  await page.evaluate(() => { window.__bj553Recs.length = 0; window.__bj553On = true; });
  const on1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const on2 = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  const off1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const off2 = await page.evaluate(SAMPLE);
  await page.evaluate(() => {
    const g = window.__swGame;
    const t = (g.entities.npcs ?? [])[0];
    g.player.minionTargetId = t ? t.id : -1;
  });
  const on3 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  await page.evaluate(() => { window.__bj553On = false; });

  const dOnOn = diffCount(on2, on1);
  const dOffOff = diffCount(off1, off2);
  const dOnOff = diffCount(on1, off1);
  const dReOn = diffCount(on3, off2);
  L.say(`diff ON/ON=${JSON.stringify(dOnOn.ok ? dOnOn.n : dOnOn)} OFF/OFF=${JSON.stringify(dOffOff.ok ? dOffOff.n : dOffOff)}`);
  L.say(`diff ON/OFF=${JSON.stringify(dOnOff.ok ? { n: dOnOff.n, bbox: dOnOff.bbox, R: dOnOff.R } : dOnOff)}`);
  L.say(`diff reON/OFF=${JSON.stringify(dReOn.ok ? { n: dReOn.n, bbox: dReOn.bbox } : dReOn)}`);

  const recs = await page.evaluate(() => window.__bj553Recs);
  L.say(`drawImage recs(16x72): ${recs.length}`);
  for (const r of recs.slice(0, 3)) L.say(`  rec: ${JSON.stringify(r)}`);
  if (on1 && !on1.why && recs.length) {
    L.say(`npc screen=(${on1.px},${on1.py}) draw dx=${Math.round((recs[0].dx - on1.px) * 10) / 10} dy=${Math.round((recs[0].dy - on1.py) * 10) / 10}`);
  }
  await saveCanvasShot(page, `${OUT}/bj553c-marker.png`).catch(() => {});

  L.chk('draw-call-observed', recs.length > 0, `recs=${recs.length}`);
  L.chk('marker-pixels-appear', dOnOff.ok && dOnOff.n > 0 && (!dOffOff.ok || dOffOff.n < 40),
    `ON/OFF=${dOnOff.ok ? dOnOff.n : 'n/a'}px OFF/OFF噪=${dOffOff.ok ? dOffOff.n : 'n/a'}px`);

  // ---- 摘鞭对照:手持铜阔剑(3507) → 标记消隐(原版相:HeldItem.summon 门) ----
  await giveItems(page, [{ vid: 3507, slot: 1 }], { select: 1 });
  await pump(page, 2);
  const offSword = await page.evaluate(SAMPLE);
  const dSword = diffCount(offSword, off2);
  L.say(`sword-held diff vs OFF: ${JSON.stringify(dSword.ok ? dSword.n : dSword)}`);
  L.chk('sword-hides-marker', dSword.ok && dSword.n < 40, `n=${dSword.ok ? dSword.n : 'n/a'}`);

  writeFileSync(`${OUT}/bj553c-result.json`, JSON.stringify({ net, warm, gate, recs, dOnOn, dOnOff, dOffOff, dReOn }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

/**
 * SW-BJ553 探针：鞭标记不显示复验（BJ512 后用户复报:tagDamage/集火生效但视觉标记不显示）。
 * BJ512 测试 13/13 绿 → 断点必在运行时链。取证面：
 *  ① 门条件逐支快照（Renderer.ts:6418-6425 五支）：
 *     player.dead / minionTargetId / heldItem+combatWeapon kind / entities.find 命中 /
 *     atlas.ensureVImage('vanilla/Extra_199.png') 命中。
 *  ② drawImage 仪表化：源=16×72 tinted 表（_whipMarkerTinted 唯一签名）9 参绘制记账
 *     （dest 坐标 vs 敌心 worldToScreen 对拍=变换域核对）。
 *  ③ 静态假人 488 ON/OFF 差分像素采样（相邻帧读回差分=标记像素簇;假人不移动=唯一变量）。
 *  ④ 逐层剥离：摘 whipMarker 块不可行（render 内联）→ 用 targetId=-1/≥0 开关替代。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, spawnEnemy, teleport, saveCanvasShot, giveItems, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553';
mkdirSync(OUT, { recursive: true });

// drawImage 仪表:9 参且源画布 16×72（tinted 表唯一物;ImageBitmap 宽高同签名）
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

// 门条件逐支快照（combatWeapon/ITEM_DEFS 动态 import;纯数据表 ?t= 合法）
const GATE = `(() => import('/src/data/vanillaItemCombat.ts').then(async (cwMod) => {
  const { ITEM_DEFS } = await import('/src/data/items.ts?t=' + Date.now());
  const g = window.__swGame;
  const p = g.player;
  const held = p.inv.heldItem ? p.inv.heldItem() : p.inv.slots[p.inv.selected];
  const def = held ? ITEM_DEFS[held.id] : undefined;
  const cw = def ? cwMod.combatWeapon(def) : null;
  const tid = p.minionTargetId;
  const inEnemies = tid >= 0
    ? (g.entities.enemies ?? []).some((e) => e.id === tid && !e.dead)
    : false;
  let sheet = null, sheetW = null, sheetH = null;
  try {
    const s = g.renderer.atlas?.ensureVImage('vanilla/Extra_199.png');
    sheet = !!s; sheetW = s ? s.width : null; sheetH = s ? s.height : null;
  } catch (e) { sheet = 'throw:' + e.message; }
  return {
    dead: !!p.dead, tid,
    held: held ? { iid: held.id, stack: held.stack } : null,
    defFound: !!def, defVid: def?.vid ?? null, kind: cw?.kind ?? null,
    inEnemies, sheet, sheetW, sheetH,
    enemyCount: (g.entities.enemies ?? []).length,
    renderHasMethod: typeof g.renderer.render === 'function',
  };
}))()`;

// 假人中心 48×48 屏域像素读回（worldToScreen 中心锚）
const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 488);
  if (!e) return { why: 'no-dummy' };
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
    px: Math.round(px), py: Math.round(py), z, ex: e.cx, ey: e.cy, eid: e.id };
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
  await pump(page, 30, { clearEnemies: true });

  // 鞭上手（皮革鞭 4672 选 0 号位）+ 移到空旷出生点
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 140));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  await teleport(page, spot.x, spot.y);
  await pump(page, 10, { clearEnemies: true });

  // 静态假人 488 出生点右近距（标记门无 CanBeChasedBy 排除——鞭命中写槽只门 active）
  const sp = await spawnEnemy(page, 488, spot.x + 80, spot.y);
  L.chk('spawn-dummy', sp.ok, JSON.stringify(sp).slice(0, 140));
  await pump(page, 6);

  const inst = await page.evaluate(INSTALL);
  L.say(`hook: ${inst}`);

  // ---- ① 门条件快照（直接写槽=等价鞭命中后状态;写链单测已钉） ----
  await page.evaluate(`(() => {
    const g = window.__swGame;
    const d = (g.entities.enemies ?? []).find((en) => en.vanillaId === 488);
    g.player.minionTargetId = d ? d.id : -1;
  })()`);
  await pump(page, 2);
  for (let i = 0; i < 2; i++) await nextFrame(page);
  const gate = await page.evaluate(GATE);
  L.say(`gate: ${JSON.stringify(gate)}`);
  L.chk('gate-all-true', gate.dead === false && gate.tid >= 0 && gate.kind !== null
    && (gate.kind === 'summon' || gate.kind === 'whip') && gate.inEnemies
    && gate.sheet === true && gate.sheetW === 16 && gate.sheetH === 72,
    `dead=${gate.dead} tid=${gate.tid} kind=${gate.kind} inEnemies=${gate.inEnemies} sheet=${gate.sheet} ${gate.sheetW}x${gate.sheetH}`);

  // ---- ② drawImage 记账 + ③ ON/OFF 差分 ----
  await page.evaluate(() => { window.__bj553Recs.length = 0; window.__bj553On = true; });
  const on1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const on2 = await page.evaluate(SAMPLE);          // ON 第二拍（帧动画在动=ON 相内自差分基线）
  // OFF 相：槽清 → 相邻帧采样
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  await pump(page, 1);
  const off1 = await page.evaluate(SAMPLE);
  await pump(page, 1);
  const off2 = await page.evaluate(SAMPLE);
  // 复 ON：差分应复现
  await page.evaluate(() => {
    const g = window.__swGame;
    const d = (g.entities.enemies ?? []).find((en) => en.vanillaId === 488);
    g.player.minionTargetId = d ? d.id : -1;
  });
  await pump(page, 1);
  const on3 = await page.evaluate(SAMPLE);
  await page.evaluate(() => { window.__bj553On = false; });

  const dOnOn = diffCount(on2, on1);     // ON vs ON:仅帧动画相位差（1-2 帧内常同帧=0）
  const dOnOff = diffCount(on1, off1);   // ON vs OFF:标记全量
  const dOffOff = diffCount(off1, off2); // OFF vs OFF:0=读回底噪
  const dOn3Off = diffCount(on3, off2);  // 复 ON vs OFF:复现性
  L.say(`diff ON/ON=${JSON.stringify(dOnOn)} OFF/OFF=${JSON.stringify(dOffOff)}`);
  L.say(`diff ON/OFF=${JSON.stringify(dOnOff && dOnOff.ok ? { n: dOnOff.n, bbox: dOnOff.bbox, R: dOnOff.R } : dOnOff)}`);
  L.say(`diff reON/OFF=${JSON.stringify(dOn3Off && dOn3Off.ok ? { n: dOn3Off.n, bbox: dOn3Off.bbox } : dOn3Off)}`);

  const recs = await page.evaluate(() => window.__bj553Recs);
  L.say(`drawImage recs(16x72): ${recs.length} ${recs.length ? JSON.stringify(recs.slice(0, 4)) : ''}`);
  if (on1 && !on1.why) {
    L.say(`dummy center screen=(${on1.px},${on1.py}) zoom=${on1.z} world=(${on1.ex},${on1.ey})`);
    const dx = recs.length ? recs[0].dx - on1.px : null;
    const dy = recs.length ? recs[0].dy - on1.py : null;
    L.say(`draw dest - enemy screen center: dx=${dx} dy=${dy}（0 附近=世界变换对位正确;大偏=变换域错位）`);
  }
  await saveCanvasShot(page, `${OUT}/bj553-marker-on.png`).catch(() => {});

  // ---- 判读 ----
  L.chk('draw-call-observed', recs.length > 0, `16×72 源 drawImage 记录=${recs.length}`);
  L.chk('marker-pixels-appear', dOnOff.ok && dOnOff.n > 0 && (!dOffOff.ok || dOffOff.n === 0),
    `ON/OFF 差分=${dOnOff.ok ? dOnOff.n : 'n/a'}px（OFF/OFF 底噪=${dOffOff.ok ? dOffOff.n : 'n/a'}）`);

  writeFileSync(`${OUT}/bj553-result.json`, JSON.stringify({ gate, recs, dOnOn, dOnOff, dOffOff, dOn3Off, on1: { px: on1.px, py: on1.py, z: on1.z, ex: on1.ex, ey: on1.ey } }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

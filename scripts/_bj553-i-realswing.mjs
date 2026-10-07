/**
 * BJ553-i:真实挥鞭全链终局探针(origin 参数化:dev/发布站对拍)。
 *  v4-h 定谳:直写槽+渲染面在 dev 全通(96px@zoom1);唯一未验环=真实挥鞭写链
 *  (用户「集火生效」可能是近敌索敌错觉,不能证 tid 写)。本探针:
 *  鼠标瞄准→mouseDown 真挥→9 拍起手+命中→tid 写核→等真渲染帧→像素差分。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553i';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553i = { renderCalls: 0 };
window.__bj553iInstall = async () => {
  const mod = await import('/src/render/Renderer.ts');
  const proto = mod.Renderer.prototype;
  if (!proto.__bj553ip) {
    proto.__bj553ip = true;
    const or_ = proto.render;
    proto.render = function (...a) { window.__bj553i.renderCalls++; return or_.apply(this, a); };
  }
  return 'ok';
};
window.__awaitRenders = async (n, timeoutMs = 15000) => {
  const start = window.__bj553i.renderCalls;
  const t0 = performance.now();
  while (window.__bj553i.renderCalls < start + n) {
    await new Promise((r) => requestAnimationFrame(r));
    if (performance.now() - t0 > timeoutMs) return { ok: false };
  }
  return { ok: true };
};
'ok';
`;

const SWING = `(() => {
  const g = window.__swGame;
  const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
  if (!z) return { ok: false, why: 'no-zombie' };
  // 瞄准僵尸(屏坐标:zoom1 下 world 偏移=screen 偏移)
  const [sx, sy] = g.camera.worldToScreen(z.cx, z.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.player.minionTargetId = -1;                       // 清槽=纯真实写链
  g.input.mouseDown = true;
  return { ok: true, mx: g.input.mouseX, my: g.input.mouseY, zid: z.id };
})()`;

const CHECK = `(() => {
  const g = window.__swGame;
  const z = (g.entities.enemies ?? []).find((e) => e.vanillaId === 3);
  return { tid: g.player.minionTargetId, zid: z ? z.id : null, zAlive: z ? !z.dead : false,
    zHp: z ? z.hp : null, projCount: (g.entities.projectiles ?? []).length,
    tagged: (() => { try { return g.player.tagEffectStack.isNPCTagged(4672, z?.id ?? -1); } catch (e) { return 'err'; } })() };
})()`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie' };
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
    px: Math.round(px), py: Math.round(py), z, tid: g.player.minionTargetId };
})()`;

function diffCount(a, b) {
  if (!a || !b || a.why || b.why || a.data?.length !== b.data?.length) return { ok: false };
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
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 90));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, JSON.stringify(sp).slice(0, 90));
  await pump(page, 12);
  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj553iInstall(); });
  await page.evaluate(() => window.__awaitRenders(2));

  // ---- 真实挥鞭 ----
  const sw = await page.evaluate(SWING);
  L.say(`swing-aim: ${JSON.stringify(sw)}`);
  await pump(page, 12);                                 // 9 拍起手+命中拍
  const ck = await page.evaluate(CHECK);
  L.say(`after-hit: ${JSON.stringify(ck)}`);
  L.chk('real-write-chain', ck.tid === ck.zid && ck.zid != null,
    `tid=${ck.tid} zid=${ck.zid} tagged=${ck.tagged}`);
  await page.evaluate(() => { window.__swGame.input.mouseDown = false; });

  // ---- 标记像素(等真渲染帧) ----
  await page.evaluate(() => window.__awaitRenders(3));
  const A = await page.evaluate(SAMPLE);                // ON(真写槽)
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  await page.evaluate(() => window.__awaitRenders(3));
  const B = await page.evaluate(SAMPLE);                // OFF
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
  });
  await page.evaluate(() => window.__awaitRenders(3));
  const C = await page.evaluate(SAMPLE);                // 复 ON
  const dOnOff = diffCount(A, B);
  const dReOn = diffCount(C, B);
  L.say(`marker ON/OFF=${JSON.stringify(dOnOff)} reON=${dReOn.ok ? dReOn.n : 'x'}`);
  L.say(`zombie screen=(${A.px ?? '?'},${A.py ?? '?'}) zoom=${A.z ?? '?'}`);
  await saveCanvasShot(page, `${OUT}/bj553i-on.png`).catch(() => {});
  L.chk('marker-visible-real-chain', dOnOff.ok && dOnOff.n > 40,
    `ON/OFF=${dOnOff.ok ? dOnOff.n : 'x'}px（真挥写链+渲染全链）`);

  writeFileSync(`${OUT}/bj553i-result.json`, JSON.stringify({ sw, ck, dOnOff, dReOn }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

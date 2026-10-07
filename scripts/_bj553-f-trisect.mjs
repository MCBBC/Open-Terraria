/**
 * BJ553-f:块内执行进度三段仪。
 *  v4 定谳:冻结域 ON/OFF=0 像素=用户复报复现;五支门外验全真。
 *  本版三段: A=ensureVImage('vanilla/Extra_199.png') 调用记账(SpriteAtlas 原型 patch,
 *  裸 import 同实例;render 内每帧一调=块进度心跳) B=16×72 tinted 画布创建
 *  (document.createElement 钩) C=9 参 16×72 源 drawImage(本环境 ctx=raw 2D)。
 *  A 增长=块到达;A 增而 B/C 零=6425 后断;A 零=6418-6425 门内短路。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, teleport,
  saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553f';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553f = { evCalls: 0, evCallsOn: 0, canvasCreates: 0, diCalls: 0, diArgs: [], evFile: '' };
window.__bj553fInstall = async () => {
  // A: SpriteAtlas.ensureVImage 原型记账（裸 import=与引擎同模块实例）
  const { SpriteAtlas } = await import('/src/assets/SpriteAtlas.ts');
  if (!SpriteAtlas.prototype.__bj553fp) {
    SpriteAtlas.prototype.__bj553fp = true;
    const oe = SpriteAtlas.prototype.ensureVImage;
    SpriteAtlas.prototype.ensureVImage = function (file, ...rest) {
      try {
        if (file === 'vanilla/Extra_199.png') {
          window.__bj553f.evCalls++;
          window.__bj553f.evFile = file;
        }
      } catch (e) {}
      return oe.apply(this, [file, ...rest]);
    };
  }
  // B: 16×72 画布创建钩（tinted 表）
  if (!document.__bj553fp) {
    document.__bj553fp = true;
    const oc = document.createElement.bind(document);
    document.createElement = function (tag, ...rest) {
      const el = oc(tag, ...rest);
      try {
        if (String(tag).toLowerCase() === 'canvas' && el.width === 16 && el.height === 72) {
          window.__bj553f.canvasCreates++;
        }
      } catch (e) {}
      return el;
    };
  }
  // C: 9 参 16×72 源 drawImage（raw 2D 域）
  for (const proto of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
    if (proto.__bj553fp) continue;
    proto.__bj553fp = true;
    const oi = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        if (a.length === 9) {
          const src = a[0];
          if (src && src.width === 16 && src.height === 72 && a[3] === 16 && a[4] === 16
              && window.__bj553f.diArgs.length < 20) {
            window.__bj553f.diCalls++;
            window.__bj553f.diArgs.push({
              dx: Math.round(a[5]), dy: Math.round(a[6]),
              ctm: (() => { try { const t = this.getTransform(); return [t.a, t.b, t.c, t.d, Math.round(t.e), Math.round(t.f)]; } catch (e) { return null; } })(),
              alpha: +this.globalAlpha.toFixed(3),
            });
          }
        }
      } catch (e) {}
      return oi.apply(this, a);
    };
  }
  return 'installed';
};
'ok';
`;

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
  L.chk('give-whip', gi.ok, JSON.stringify(gi).slice(0, 80));
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, JSON.stringify(sp).slice(0, 80));
  await pump(page, 20);

  const inst = await page.evaluate(INSTALL);
  L.say(`install: ${inst}`);
  await page.evaluate(async () => { await window.__bj553fInstall(); });

  // 基线拍:tid=-1 下 60 拍(块应短路于 tid 门 → A 每帧仍应 0?不——6425 行在 tid 门内,
  //   tid=-1 → ensureVImage 不调 → A 零增长=门短路相)
  await page.evaluate(() => { window.__bj553f.evCalls = 0; });
  await pump(page, 60);
  const base = await page.evaluate(() => ({ evCalls: window.__bj553f.evCalls,
    tid: window.__swGame.player.minionTargetId }));
  L.say(`baseline(tid=-1): evCalls=${base.evCalls} tid=${base.tid}`);

  // ON 拍:tid=8 → 块应全程执行 → A 每帧+1
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
    window.__bj553f.evCalls = 0;
    window.__bj553f.canvasCreates = 0;
    window.__bj553f.diCalls = 0;
    window.__bj553f.diArgs.length = 0;
  });
  await pump(page, 60);
  const on = await page.evaluate(() => ({
    evCalls: window.__bj553f.evCalls, canvasCreates: window.__bj553f.canvasCreates,
    diCalls: window.__bj553f.diCalls, diArgs: window.__bj553f.diArgs.slice(0, 4),
    tid: window.__swGame.player.minionTargetId,
    dead: window.__swGame.player.dead,
    held: (() => { const g = window.__swGame; const h = g.player.inv.heldItem();
      return h ? { id: h.id, stack: h.stack } : null; })(),
    sheetHit: !!window.__swGame.renderer.atlas.ensureVImage('vanilla/Extra_199.png'),
    zoom: window.__swGame.camera.zoom,
  }));
  L.say(`ON: ${JSON.stringify(on)}`);
  L.chk('block-reached(evCalls)', on.evCalls >= 55, `evCalls=${on.evCalls}/60 帧(块内每帧一调)`);
  L.chk('tinted-created', on.canvasCreates >= 1, `canvasCreates=${on.canvasCreates}`);
  L.chk('draw-issued', on.diCalls >= 55, `diCalls=${on.diCalls}/60`);

  await saveCanvasShot(page, `${OUT}/bj553f-on.png`).catch(() => {});
  writeFileSync(`${OUT}/bj553f-result.json`, JSON.stringify({ base, on }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

/**
 * _bj60c.mjs — SW-BJ60 火焰花掉落实体世界渲染像素取证（POST 相）。
 * 掉落物置于玩家身侧 2.5 格（图集已热），2 tick 内即采样（磁吸拾取窗前），
 * worldToScreen 定位画布盒直读——断言橙色火苗簇在场（187,68,22 族,图集原样）。
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const T = Date.now();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 30, { clearEnemies: true });

  // 先把手持栏清空（wipe 给一格星怒,防 UI 无物态干扰）——掉落磁吸前 2 tick 采样
  const ev = await page.evaluate(async (t) => {
    const g = window.__swGame;
    const st = g.world.store;
    const m = await import(`/src/entities/ItemDrop.ts?t=${t}`);
    const iid = window.__swFlow.itemByVid(318);
    // 落点=玩家右侧 2.5 格地表上方（出生区平地,图集已热）
    const px = Math.floor((g.player.x + 40) / 16);
    let py = Math.floor(g.player.y / 16) - 2;
    const d0 = g.spawnDrop(px * 16 + 8, py * 16 + 8, 'vi_318_Fireblossom', 1, 0, 0);
    const d = d0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // 双 rAF=完整一帧
    const [sx, sy] = g.camera.worldToScreen(d.x + d.w / 2, d.y + d.h / 2);
    const cv = g.renderer.canvas;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const R = 18;
    const x0 = Math.max(0, Math.min(cv.width - R * 2, Math.round(sx) - R));
    const y0 = Math.max(0, Math.min(cv.height - R * 2, Math.round(sy) - R));
    const im = cx.getImageData(x0, y0, R * 2, R * 2).data;
    let orange = 0, top = null;
    for (let i = 0; i < im.length; i += 4) {
      const r = im[i], gg = im[i + 1], b = im[i + 2];
      if (r > 110 && gg >= 20 && gg < 130 && b < 80 && r > gg + 50 && gg > b + 5) { orange++; top ??= [r, gg, b]; }
    }
    void st;
    return {
      orange, top, sx: Math.round(sx), sy: Math.round(sy), spawned: !!d,
      wx: d?.x, wy: d?.y, dead: d?.dead, dropColor: d?.color ?? null,
      atlasReady: !!g.renderer.atlas?.vicon(318),
    };
  }, T);
  L.say(`掉落盒橙簇px=${ev.orange} 首/样=${JSON.stringify(ev.top)} 屏(${ev.sx},${ev.sy}) 世界(${Math.round(ev.wx)},${Math.round(ev.wy)}) atlasReady=${ev.atlasReady}`);
  {
    const { saveCanvasShot, resolveShotPath } = await import('../tools/probe/lib/index.mjs');
    await saveCanvasShot(page, resolveShotPath('bj60c-drop-moment.png'));
  }
  L.chk('POST:掉落盒内有橙色火苗簇(≥6px,图集 187,68,22 族)', ev.orange >= 6, JSON.stringify(ev));
  L.chk('POST:掉落实体无 color(草本无 item.color)', ev.dropColor === null, JSON.stringify(ev.dropColor));
  L.chk('POST:掉落实体未死(拾取前)', !ev.dead, String(ev.dead));

  L.print();
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

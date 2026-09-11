/**
 * _bj60b.mjs — SW-BJ60 掉落路 itemColorSprite 烘焙实机验证（凝胶 23 染蓝）。
 * 直接驱动 renderer.itemColorSprite（新烘焙路）+ 实体注入,双证据:
 *   ① 烘焙产物像素=蓝系非空（画到临时 canvas 采样）
 *   ② 真实掉落实体渲染存活（世界画布截图）
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger, saveCanvasShot, resolveShotPath,
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

  const r = await page.evaluate(async (t) => {
    const g = window.__swGame;
    const m = await import(`/src/entities/ItemDrop.ts?t=${t}`);
    const iid = window.__swFlow.itemByVid(23);   // 凝胶（真 color A=100）
    const d = new m.ItemDrop(g.player.x + 40, g.player.y, iid, 1);
    g.entities.drops.push(d);
    // ① 新烘焙路直驱（TS private 仅编译期,运行时可调）
    const rd = g.renderer;
    const ar = rd.atlasIcon(d.itemId);
    const tr = rd.itemColorSprite(`probe${t}`, ar, d.color);
    let px = null;
    if (tr) {
      const c = document.createElement('canvas');
      c.width = ar.sw; c.height = ar.sh;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(tr.c, tr.x, tr.y, tr.w, tr.h, 0, 0, ar.sw, ar.sh);
      const data = cx.getImageData(0, 0, ar.sw, ar.sh).data;
      let n = 0, rr = 0, gg = 0, bb = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        n++; rr += data[i]; gg += data[i + 1]; bb += data[i + 2];
      }
      n = n || 1;
      px = { opaque: n, avg: [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)] };
    }
    return { color: d.color ?? null, baked: !!tr, px };
  }, T);
  L.chk('凝胶掉落带 color 数据源', r.color !== null, JSON.stringify(r.color));
  L.chk('itemColorSprite 烘焙产出非空', r.baked && r.px && r.px.opaque > 0, JSON.stringify(r.px));
  L.chk('烘焙像素蓝系(B>R,乘法+底图残量)', r.px && r.px.avg[2] > r.px.avg[0], JSON.stringify(r.px?.avg));
  L.say(`凝胶烘焙 avg=${JSON.stringify(r.px?.avg)}（旧路实测基线 avg≈(55,84,146) 域,乘色+残量语义）`);

  await pump(page, 20, { clearEnemies: false });
  const shotPath = resolveShotPath('bj60b-drop-gel-post.png');
  await saveCanvasShot(page, shotPath);
  L.say(`世界画布截图=${shotPath}`);
  const alive = await page.evaluate(() => {
    const g = window.__swGame;
    return g.entities.drops.some((x) => !x.dead);
  });
  L.chk('凝胶掉落实体存活渲染中', alive, JSON.stringify({ alive }));

  L.print();
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

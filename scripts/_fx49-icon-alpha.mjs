// SW-FX49 探针:Item.alpha 染色维度——UI 图标烘焙实机验证(icons 路consumes
// VANILLA_ITEM_ALPHA)。验证式(BJ60 缺口对拍):
//   凝胶 23  旧(64,98,174)@α255 → 新两遍 (≈35,92,221)@α149(半档透明度)
//   星怒 65  α×(255−100)/255=155,RGB 不动(纯 pass1)
//   幽灵翼 823 α=255→f=0 全透明(隐形本相)
//   铁锭 22  对照组:α 仍 255(仅 color 染,无 alpha 维)
// 掉落路(DrawItem pass1)同一 blendItemColorTint 单源,单测面已闭环(tests/sw-fx49*)。
import { launchBrowser, openPage, bootstrap, createGame, ledger } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
const L = ledger();
L.chk('世界已建', gen.ok);

const res = await page.evaluate(async () => {
  const t = Date.now();
  const ui = await import(`/src/ui/UI.ts?t=${t}`);
  const shim = await import(`/src/stats/Shimmer.ts?t=${t}`);
  const game = window.__swGame;
  if (!game) return { err: 'no game' };
  // 等图集就绪(iconUrl 懒载未就绪会回兜底路径)
  const t0 = Date.now();
  while (!game.atlas && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 300));
  if (!game.atlas) return { err: 'no atlas' };

  const bake = async (vid) => {
    const iid = shim.internalIdOfVanilla(vid);
    const url = ui.iconUrl(game, iid);
    if (!url) return { err: `no icon vid${vid}` };
    const img = new Image();
    await new Promise((res2, rej) => { img.onload = res2; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let maxA = 0, vis = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > maxA) maxA = d[i + 3];
      if (d[i + 3] > 8) {
        vis++; r += d[i]; g += d[i + 1]; b += d[i + 2];
      }
    }
    return { maxA, vis, avg: vis ? [r / vis, g / vis, b / vis].map((v) => Math.round(v)) : null };
  };
  return {
    gel: await bake(23), starfury: await bake(65), ghostwings: await bake(823),
    ironbar: await bake(22), pinkgel: await bake(3111),
  };
});

L.chk('探针数据齐', !!res && !res.err, JSON.stringify(res)?.slice(0, 200));
// 凝胶:两遍合成 α 峰=149(=0.583×255)±3;可见;蓝主导
L.chk('凝胶 α 峰≈149(旧 255=半档缺口)', res?.gel?.maxA >= 146 && res?.gel?.maxA <= 153, `maxA=${res?.gel?.maxA}`);
L.chk('凝胶可见 texel>0', (res?.gel?.vis ?? 0) > 0);
L.chk('凝胶蓝主导(B>R,色图 0,80,255+pass1)', res?.gel?.avg ? res.gel.avg[2] > res.gel.avg[0] : false, JSON.stringify(res?.gel?.avg));
// 星怒:α 峰=155±3
L.chk('星怒 α 峰≈155', res?.starfury?.maxA >= 152 && res?.starfury?.maxA <= 158, `maxA=${res?.starfury?.maxA}`);
// 幽灵翼:全透明(0 可见 texel)
L.chk('幽灵翼全透明(α=255→f=0)', (res?.ghostwings?.vis ?? -1) === 0, `vis=${res?.ghostwings?.vis} maxA=${res?.ghostwings?.maxA}`);
// 铁锭对照:α 峰仍 255(无 alpha 维,仅 color 染)
L.chk('铁锭 α 峰=255(对照组不回退)', res?.ironbar?.maxA === 255, `maxA=${res?.ironbar?.maxA}`);
// 粉凝胶:α×(255−100)/255≈155(仅 pass1,无 color)
L.chk('粉凝胶 α 峰≈155', res?.pinkgel?.maxA >= 152 && res?.pinkgel?.maxA <= 158, `maxA=${res?.pinkgel?.maxA}`);

await browser.close();
process.exit(L.exitCode());

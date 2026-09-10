/**
 * SW-BJ58 探针 R：修复后验证。
 * ① 装备创造之手,静止朝右 → row 盒橙斑应回落到无配件基线(横排消失);
 * ② drawImage 记录:Acc_HandsOn/HandsOff(360×224 源)的源矩形宽须=40(单格),
 *    sw=360 整幅横排 = 0 次;
 * ③ 视觉截图人眼复核(手部单工具精灵)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const oi = proto.drawImage;
  proto.drawImage = function (...a) {
    try {
      if (a[0] && a[0].width === 360 && a[0].height === 224 && recs.length < 5000) {
        const n = a.length;
        const st = new Error().stack.split('\\n');
        recs.push({ sw: n === 9 ? a[3] : -1, sh: n === 9 ? a[4] : -1, caller: (st[2] || '').trim().slice(0, 90) });
      }
    } catch (e) {}
    return oi.apply(this, a);
  };
  return 'installed';
};
'ok';
`;

const ROWHIT = `(() => {
  const g = window.__swGame;
  const c2 = document.createElement('canvas');
  c2.width = 400; c2.height = 80;
  const cx = c2.getContext('2d', { willReadFrequently: true });
  cx.drawImage(g.renderer.canvas, 620, 360, 400, 80, 0, 0, 400, 80);
  const d = cx.getImageData(0, 0, 400, 80).data;
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

  // 臂1:无配件基线
  await page.evaluate(() => { const g = window.__swGame; g.player.inv.armor[3] = null; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; });
  await pump(page, 45, { clearEnemies: true });
  for (let i = 0; i < 3; i++) await nextFrame(page);
  const base = await page.evaluate(ROWHIT);
  L.say(`[无配件] rowBox=${base}`);

  // 臂2:装备(修复后)
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 45, { clearEnemies: true });
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install(); window.__bj58Recs.length = 0');
  for (let i = 0; i < 3; i++) await nextFrame(page);
  const recs = await page.evaluate('(() => { const r = window.__bj58Recs; window.__bj58Recs = []; return r; })()');
  const after = await page.evaluate(ROWHIT);
  await saveCanvasShot(page, `${OUT}/r-fixed.png`);
  const wide = recs.filter((r) => r.sw > 40);
  const single = recs.filter((r) => r.sw === 40);
  L.say(`[装备·修复后] rowBox=${after} (基线 ${base};差 ${after - base})`);
  L.say(`360×224 源绘制: 单格(sw=40)=${single.length}, 整幅(sw>40)=${wide.length}`);
  const callers = {};
  for (const r of single) callers[r.caller.slice(0, 60)] = (callers[r.caller.slice(0, 60)] ?? 0) + 1;
  L.say('单格绘制 caller: ' + JSON.stringify(callers));
  writeFileSync(`${OUT}/r-recs.json`, JSON.stringify(recs, null, 1));
  L.chk('修复判定:rowBox 回落基线 ±14', Math.abs(after - base) <= 14, `base=${base} after=${after}`);
  L.chk('修复判定:无整幅横排(sw>40)=0', wide.length === 0, `wide=${wide.length}`);
  L.chk('修复判定:单格绘制在发生', single.length > 0, `n=${single.length}`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}

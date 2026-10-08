// ★BJ572 面①像素物证探针 v2（BJ275 物证判据同族）：网格绘制刀（逐格 drawImage →
//  条带批 drawImage）前后逐字节等价对拍。
//  · 确定性套件 = _a2/_bj77 同源：createGame(seed 固定+pinRandom)+freezeClock 正午
//    +sky dt=0+天气钉死+持物清空;鼠标 CDP 钉屏上定点（十字格固定）。
//  · 漂移面（_bj572-drift-locate 定谳：玩家出生动画区 col720/row400 + col1200 杂项）
//    裁剪避开;双窗 = 十字+网格窗 / 纯网格窗,各自 md5。
//  · 用法：TAG=before|after SW_ORIGIN=http://localhost:5201 \
//      node tools/run-diag.mjs scripts/_bj572-pixel-evidence.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const TAG = process.env.TAG || 'run';
const L = ledger();
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
L.chk('createGame', gen.ok, gen.why ?? '');

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky; const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    const fx = g.renderer.weatherFx;
    if (fx) {
      fx.update = () => {};
      (fx.pool || []).forEach((d) => { d.active = false; });
      (fx.snow || []).forEach((d) => { d.active = false; });
      (fx.sand || []).forEach((d) => { d.active = false; });
    }
  } catch (e) { console.warn('[probe] 天气钉死失败', e); }
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  if (!key) throw new Error('2799 未注册');
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1;   // 标尺线关
  g.player.builderAccStatus[1] = 0;   // 网格开
  // 双窗裁剪 md5（避开漂移带:_bj572-drift-locate bbox）
  const lc = document.createElement('canvas'); const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__cropMd5 = (x, y, w, h) => {
    const c = g.renderer.canvas;
    lctx.clearRect(0, 0, w, h);
    lctx.drawImage(c, x, y, w, h, 0, 0, w, h);
    const d = lctx.getImageData(0, 0, w, h).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return md5str(btoa(bin));
  };
  function md5str(s) { /* 占位,页内不 hash,返回 b64 由 node 侧 hash */ return s; }
  window.__cropB64 = (x, y, w, h) => {
    const c = g.renderer.canvas;
    lctx.clearRect(0, 0, w, h);
    lctx.drawImage(c, x, y, w, h, 0, 0, w, h);
    const d = lctx.getImageData(0, 0, w, h).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
  window.__gridInfo = () => {
    const r = g.renderer, br = r.builderRulers;
    return br ? { gridOn: br.gridOn, dist: br.gridDist, mt: br.mouseTx, mty: br.mouseTy } : null;
  };
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 90);                    // 残影滞后收敛窗（gridDist→0）
// ★整帧钉死：暂停世界（rAF 渲染继续,tick 全停=实体/玩家动画/水波冻结;
//   applyAutoPauseUI 无 inventoryOpen 门不会回拨 _uiPausedByAutoPause=false）
await page.evaluate(() => { const g = window.__swGame; g.paused = true; g._uiPausedByAutoPause = false; });
await pump(page, 4);
console.log('GRIDINFO:', JSON.stringify(await page.evaluate(() => window.__gridInfo())));

async function snap(tag) {
  const crossB64 = await page.evaluate(() => window.__cropB64(880, 560, 310, 200));
  const uniformB64 = await page.evaluate(() => window.__cropB64(80, 560, 480, 200));
  return { cross: md5(crossB64), uniform: md5(uniformB64) };
}
await pump(page, 6);
const s1 = await snap('a');
await pump(page, 1);
const s2 = await snap('b');
L.chk('连续帧确定性（双窗）', s1.cross === s2.cross && s1.uniform === s2.uniform, '随机面在场');
console.log(`MD5[${TAG}] cross=${s1.cross} uniform=${s1.uniform}`);
writeFileSync(`/tmp/bj572-grid-${TAG}.json`, JSON.stringify(s1) + '\n');
{ const b64a = await page.evaluate(() => window.__cropB64(880, 560, 310, 200));
  const b64b = await page.evaluate(() => window.__cropB64(80, 560, 480, 200));
  writeFileSync(`/tmp/bj572-crop-cross-${TAG}.bin`, Buffer.from(b64a, 'base64'));
  writeFileSync(`/tmp/bj572-crop-uniform-${TAG}.bin`, Buffer.from(b64b, 'base64')); }
L.chk(`[${TAG}] 落盘`, true, `${s1.cross.slice(0, 8)}/${s1.uniform.slice(0, 8)}`);
await browser.close();

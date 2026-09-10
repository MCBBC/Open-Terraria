/**
 * IIII236 统一探针框架 —— 截图与"非零像素哨兵"。
 *
 * 坑史锚:
 *  - memory: lavaslope 五坑#1 —— 截图前 canvas 活像素门(后台节流→黑屏假象);
 *    本模块 litStats 默认跑哨兵,全黑=没画而不是"功能缺失"。
 *  - _iii227-livecanvas —— 传送相机 → 等数帧 → 读主画布对应屏幕区非背景像素率。
 *  - _iii232-credits-roll —— overlay 非空像素:离屏 canvas drawImage+getImageData
 *    数 alpha>0。
 *  - memory: desert-style4 —— "纯背景模拟 vs 含世界格实机帧"对比=苹果比橘子,
 *    暗像素追源必须先做"全关帧对照";模板匹配阈值必须够高(ncc=0.01 假峰)。
 *  - willReadFrequently:本框架读回画布一律是"创建→draw→read→丢弃"的一次性
 *    离屏 scratch(canvas-readback-flag-policy 判据),不碰生产热路径画布。
 *
 * IIII240 收编批(截图三坑:昼夜可见性/对框/欢迎弹窗):
 *  - `screenshot(name,{time})` = 钉钟(freezeClock)+光照收敛泵+非零像素哨兵+
 *    夜间自动补光(IIII220 照明花园火把注入;onDark:'day' 才换昼拍)+拍完钟面回滚;
 *  - `ensureContent(哨兵窗)` = 截图前内容断言(非零像素+内容指纹),不过自动
 *    pump/snapcam/torch/relight 换策略重试;
 *  - litStats 增 `fp`(内容指纹:量化色种数+FNV-1a)——"内容变了没有"的廉价判据
 *    (昼/夜两拍必须不同指纹;火把注入前后必须不同)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { front } from './browser.mjs';
import { pumpInline } from './pump.mjs';
import { camSnapTo } from './camera.mjs';
import { freezeClock, unfreezeClock, clockSet, clockInfo } from './clock.mjs';
import { resolveTod, TOD, injectTorch, relight } from './staging.mjs';

/**
 * 内容指纹(纯函数,Node 可测;litStats 页内经 toString 注入=单一真值源):
 * 量化色(各通道 >>5=8 档/通道)种数 distinct + 像素序 FNV-1a。
 * distinct=1 ≈ 纯色窗(相机对着平背景/全黑);两帧指纹不同 ≈ 内容确实变了。
 */
export function fingerprintOf(data) {
  let fnv = 0x811c9dc5;
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) {
    const q = ((data[i] >> 5) << 10) | ((data[i + 1] >> 5) << 5) | (data[i + 2] >> 5);
    seen.add(q);
    fnv ^= q; fnv = Math.imul(fnv, 0x01000193) >>> 0;
  }
  return { distinct: seen.size, fnv: fnv >>> 0 };
}

/**
 * 屏幕区域取证。以世界像素(或 DOM overlay 选择器)定位,读回:
 *   { total, nonZero(alpha>0), nonBlack(rgb 和>30), ratio, fp:{distinct,fnv} }
 * sentinel 非 0 = 活像素哨兵通过;fp=内容指纹(IIII240,"内容变了没有"判据)。
 * overlay 优先(selector 传了就用 DOM 元素)。
 */
export async function litStats(page, { selector = null, wx = null, wy = null, w = 96, h = 96, zoom = null } = {}) {
  await front(page);
  return page.evaluate(({ fpSrc, selector, wx, wy, w, h, zoom }) => {
    const fingerprintOf = eval('(' + fpSrc + ')');   // 单一真值源注入(与 Node 测试同源)
    const g = window.__swGame;
    let cv, sx = 0, sy = 0, sw = 0, sh = 0;
    if (selector) {
      const el = document.querySelector(selector);
      if (!el) return { why: 'no-overlay', total: 0, nonZero: 0, nonBlack: 0, ratio: 0, fp: { distinct: 0, fnv: 0 } };
      cv = el;
      sx = 0; sy = 0; sw = el.width; sh = el.height;
    } else {
      cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
      if (!cv) return { why: 'no-canvas', total: 0, nonZero: 0, nonBlack: 0, ratio: 0, fp: { distinct: 0, fnv: 0 } };
      const cam = g.camera;
      const [px, py] = cam.worldToScreen(wx, wy);
      const z = zoom ?? cam.zoom;
      sx = Math.max(0, Math.round(px - w * z / 2)); sy = Math.max(0, Math.round(py - h * z / 2));
      sw = Math.min(cv.width - sx, Math.round(w * z)); sh = Math.min(cv.height - sy, Math.round(h * z));
      if (sw <= 0 || sh <= 0) return { why: 'offscreen', total: 0, nonZero: 0, nonBlack: 0, ratio: 0, fp: { distinct: 0, fnv: 0 } };
    }
    const c2 = document.createElement('canvas');   // 一次性读回 scratch(带 flag 合规)
    c2.width = sw; c2.height = sh;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    let nonZero = 0, nonBlack = 0;
    const total = sw * sh;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) nonZero++;
      if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++;
    }
    const fp = fingerprintOf(d);
    return { total, nonZero, nonBlack, ratio: +(nonBlack / Math.max(1, total)).toFixed(4), fp };
  }, { fpSrc: fingerprintOf.toString(), selector, wx, wy, w, h, zoom });
}

/** 整页截图(人工复核用;自动先 bringToFront)。 */
export async function savePageShot(page, path) {
  await front(page);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path }).catch((e) => { throw new Error(`[probe] page.screenshot 失败: ${e.message}`); });
  return path;
}

/** 游戏画布整帧落盘 PNG(dataURL 通道,不经 page.screenshot 的合成层)。 */
export async function saveCanvasShot(page, path) {
  await front(page);
  const data = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
    return cv ? cv.toDataURL('image/png') : null;
  });
  if (!data) throw new Error('[probe] 无游戏画布可截');
  mkdirSync(dirname(path), { recursive: true });
  await import('node:fs/promises').then((fs) => fs.writeFile(path, Buffer.from(data.split(',')[1], 'base64')));
  return path;
}

/** 任意 JSON 产物落盘(out 目录约定 /tmp/probe-out/<场景>/)。 */
export function saveJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
  return path;
}

/**
 * 截图路径解析(IIII240):裸名 → `<SW_PROBE_OUT|/tmp/probe-out>/shots/<名>.png`;
 * 带 `/` 的按原样;缺 `.png` 自动补。探针只起名,不再手拼 out 目录。
 */
export function resolveShotPath(name, out = null) {
  const base = out ?? process.env.SW_PROBE_OUT ?? '/tmp/probe-out';
  let p = String(name);
  if (!p.includes('/')) p = `${base}/shots/${p}`;
  if (!/\.png$/i.test(p)) p += '.png';
  return p;
}

/** 相机中心世界像素(哨兵窗缺省锚点)。 */
export async function camCenter(page) {
  return page.evaluate(() => {
    const c = window.__swGame?.camera;
    return c ? { x: c.x, y: c.y } : { x: 0, y: 0 };
  });
}

/**
 * 截图前内容哨兵(IIII240 坑②/E3 收口):非零像素+nonBlack 比例+内容指纹
 * 三重断言,不过则按策略链换招重试(每招一验):
 *   'pump'     再泵 convergeTicks(光照 4 态周期收敛/布景应用);
 *   'snapcam'  相机直写到哨兵窗中心(lavaslope 五坑#2:0.15 缓动没跟上来);
 *   'torch'    哨兵点就近注入持久火把(IIII220 照明花园;返回值记 mutated 落点);
 *   'relight'  引擎动态点光阵(瞬态——只保同周期,截图须紧跟);
 *   'day'      钉昼钟(换昼拍;时段保真探针勿入链)。
 * 返回 { ok, stats, applied:[{strategy,result}], mutated:[[tx,ty]], wx, wy, why? }。
 */
export async function ensureContent(page, {
  wx = null, wy = null, w = 96, h = 96, selector = null,
  minNonBlack = 0.02, minNonZero = 1, minDistinct = 2,
  strategies = ['pump', 'snapcam', 'torch'], convergeTicks = 8,
} = {}) {
  await front(page);
  if (wx == null && !selector) {
    const c = await camCenter(page);
    wx = c.x; wy = c.y;
  }
  const measure = () => litStats(page, { selector, wx, wy, w, h });
  const pass = (s) => (selector
    ? (s.nonZero ?? 0) >= minNonZero
    : (s.ratio ?? 0) >= minNonBlack && (s.nonZero ?? 0) >= minNonZero)
    && (s.fp?.distinct ?? 0) >= minDistinct;
  let stats = await measure();
  const applied = [];
  for (const st of strategies) {
    if (pass(stats)) break;
    let r = null;
    if (st === 'pump') r = await pumpInline(page, convergeTicks);
    else if (st === 'snapcam') {
      // ★玩家+相机一起对到哨兵点(camSnapTo 缺省 player:true):只拽相机时 follow
      // 0.15/帧仍朝玩家缓动,泵/真实帧会把相机拖回去(跑 3 实测翻案);把 follow
      // 目标(玩家)对到哨兵点=对框稳态。
      await camSnapTo(page, wx, wy);
      r = await pumpInline(page, Math.min(convergeTicks, 4));
    }
    else if (st === 'torch') { r = await injectTorch(page, { wx, wy }); await pumpInline(page, 4); }
    else if (st === 'relight') { r = await relight(page, { wx, wy, grid: 2 }); await pumpInline(page, 1); }
    else if (st === 'day') { await clockSet(page, TOD.day); r = await pumpInline(page, convergeTicks); }
    else return { ok: false, why: `unknown-strategy:${st}`, stats, applied, wx, wy };
    applied.push({ strategy: st, result: r });
    stats = await measure();
  }
  const mutated = applied.filter((a) => a.strategy === 'torch' && a.result?.ok).map((a) => a.result.at);
  return { ok: pass(stats), stats, applied, mutated, wx, wy, why: pass(stats) ? undefined : 'content-dark' };
}

/**
 * 昼夜受控截图(IIII240 坑①收口;`shot.screenshot(名, {time})`):
 *   ① time='day'|'night'|'dusk'|'dawn'|0..1 → freezeClock 钉钟+冻结(已冻结则只改钉,
 *      unfreeze 仍归原冻结者;freeze:false 时退为 clockSet 不冻结);
 *   ② 泵 convergeTicks(缺省 8)等光照收敛(4 态光照周期+余量;冻结下钟面不动);
 *   ③ ensureContent 哨兵(缺省=相机中心 96×96)不过按 onDark 换策略:
 *      'torch'(缺省)=夜间注入持久火把——时段保真;'day'/'auto' 允许换昼拍
 *      (换拍在返回值 strategy/finalTod 如实标注,内容断言先核对再采信);
 *   ④ 落盘(layer 'canvas'=游戏画布帧|'page'=整页含 DOM|'both');
 *   ⑤ restore(缺省 true)= unfreeze 回滚到拍摄前钟面——截图夹具"像没发生过"。
 * 返回 { ok, path, paths, tod(请求), shotTod/shotIsDay(拍摄时), frozen, lit,
 *        applied, mutated, dark, restored, afterTod }。
 */
export async function screenshot(page, name, {
  time = null, freeze = true, restore = true, convergeTicks = 8,
  wx = null, wy = null, w = 96, h = 96, selector = null,
  minLit = 0.01, onDark = 'torch', layer = 'canvas', out = null, log = () => {},
} = {}) {
  const tr = resolveTod(time);
  if (!tr.ok) return { ok: false, why: tr.why };
  const path = resolveShotPath(name, out);
  await front(page);
  const info0 = await clockInfo(page);
  let frozenByUs = false;
  if (tr.tod != null) {
    if (freeze) {
      const f = await freezeClock(page, { tod: tr.tod });
      frozenByUs = !!(f.ok && !info0.frozen);
    } else {
      await clockSet(page, tr.tod);
    }
  }
  if (convergeTicks > 0) await pumpInline(page, convergeTicks);
  const chain = onDark === 'off' ? []
    : onDark === 'day' ? ['day']
    : onDark === 'auto' ? ['torch', 'day']
    : ['torch'];
  const ec = await ensureContent(page, { wx, wy, w, h, selector, minNonBlack: minLit, strategies: chain, convergeTicks });
  const saved = {};
  if (layer === 'canvas' || layer === 'both') saved.canvas = await saveCanvasShot(page, path);
  if (layer === 'page' || layer === 'both') saved.page = await savePageShot(page, path.replace(/\.png$/i, '') + '-dom.png');
  const infoShot = await clockInfo(page);          // 拍摄时钟面(restore 前)
  let restored = null;
  if (frozenByUs && restore) restored = await unfreezeClock(page);
  log(`shot ${name} tod=${infoShot.tod?.toFixed?.(4)} isDay=${infoShot.isDay} lit=${JSON.stringify(ec.stats)} applied=${JSON.stringify(ec.applied)}`);
  return {
    ok: ec.ok, path: saved.canvas ?? saved.page ?? null, paths: saved,
    tod: tr.tod, shotTod: infoShot.tod, shotIsDay: infoShot.isDay, frozen: infoShot.frozen,
    lit: ec.stats, applied: ec.applied, mutated: ec.mutated, dark: !ec.ok,
    restored: restored ? restored.ok : null, afterTod: restored ? (await clockInfo(page)).tod : infoShot.tod,
  };
}

export { join };

// ★BJ77 零语义优化层总闸(2026-09-14 性能专项;★同日用户实机确认【转正缺省开】)。
//
// 语义契约(转正后):缺省 true = 零语义优化层(L1/C1/W1-W4)生效——落闸的每一项
// 都经「输出逐位不变」实证(逐像素 md5 对拍+变异证红,见 tests/bj77/bj78 守卫与
// scripts/_bj77-*/_bj78-* 仪具);`?swperf=0` = 【准出豁免口】回退旧行为(调试
// 逃生,逐位=转正前现行行为);`?swperf=1` 合法(从缺省即开,无操作)。
// 纪律不变:任何有取舍的项(降频/降精度/合批改序/降档)禁止接本闸,须独立定谳。
// 读取面:`?swperf` 查询参数 + `window.__swPerfFlags.get()`(探针/F5 断言面)。
//
// let 而非 const:实机 A/B 对拍(_bj77-pixel-ab.mjs/_bj78-pixel-ab.mjs 运行时
// 翻面)与守卫测试需同会话翻面(lightFast/opaqueMain「静态字段 JS 可写」同惯例)。
export let swPerf = (() => {
  try {
    if (typeof location === 'undefined') return true;   // node/测试环境:缺省开
    // 豁免口仅认显式 '0';其余(缺省/'1'/他值)=开
    return new URLSearchParams(location.search).get('swperf') !== '0';
  } catch { return true; }
})();

/** 测试/对拍翻面(生产代码禁调——生产只读 URLSearchParams 一次) */
export function swPerfSetForTest(v: boolean): void { swPerf = v; }

/** 探针断言面(只读读取+受控翻面;不在 swPerf 关闭态写入任何行为面) */
if (typeof window !== 'undefined') {
  (window as unknown as { __swPerfFlags?: { get(): boolean; set(v: boolean): void } }).__swPerfFlags = {
    get: () => swPerf,
    set: (v: boolean) => { swPerf = v; },
  };
}

// ---------------------------------------------------------------------------
// ★BJ78 W1/W2:?wamp 波形偏差增益的缓存读取面(2026-09-14 WaterWaves 区补刀)。
//
// 现场定谳:WaterWaves.sampleDisplace【每次采样】(每帧×表层水格数百次)与
// GLWaterDistortion.uploadWave【每帧】各执行
// `new URLSearchParams(location.search).get('wamp')`——解析的是整条 location.search
// 查询串里的 ?wamp 参数(波形偏差增益;★默认 1=原版原样,2026-09-08 水面直线缝案)。
// location.search 每页加载恒定(全工程无 pushState/replaceState),故值可缓存;
// 缓存按 search 串键控(若发生历史态替换自动失效,防御性)。值语义与逐调用解析
// 【逐位同值】——同一表达式,含 wamp 缺失/非数/0 → Number()=NaN|0 → ||1 fallback。
// 仅 swPerf 快路径消费;flag 关 = 调用点保留原地逐调用解析(现行行为逐位不变)。
let _wampSearchKey: string | null = null;
let _wampVal = 1;
export function waveAmpParam(): number {
  let q: string;
  try { q = location.search; } catch { return 1; }
  if (q !== _wampSearchKey) {
    _wampSearchKey = q;
    try { _wampVal = Number(new URLSearchParams(q).get('wamp')) || 1; } catch { _wampVal = 1; }
  }
  return _wampVal;
}

/** 缓存重置(仅测试/对拍仪具;生产禁调) */
export function waveAmpResetForTest(): void { _wampSearchKey = null; _wampVal = 1; }

// ---------------------------------------------------------------------------
// ★BJ94 D1:渲染循环 URLSearchParams 构造点缓存读取面(2026-09-16 渲染性能域补刀)。
//
// 现场定谳(scripts/_bj94-set-census.mjs 构造器计数子类法,land/water 双场景实测
//   4.00 次/帧):Renderer.drawChunkGrid【每帧×2 调用,'wall'/'tile' 各 1 次】
//   (?gutterdbg)+ Renderer.drawAnimatedTileLayer【每帧×1】+ Renderer.drawDummyTileAnim
//   【每帧×1】(均 ?dynsnap0)——每帧 4 次 new URLSearchParams(location.search)
//   (BJ78 W1/W2 消除后的渲染循环域外残账,即 _bj78-wave-census.mjs 注记的
//   「两臂对称抵消」背景项)。
// location.search 每页加载恒定(全工程无 pushState/replaceState)→ has 值可缓存;
// 缓存按 search 串键控(若发生历史态替换自动失效,防御性同 W1/W2);槽按参数名惰性
// 填充(首个查询参数冷启动构造 1 次,此后零构造)。值语义与逐调用解析【逐位同值】
// ——同一表达式 new URLSearchParams(q).has(name)(含缺失名=false)。
// 仅 swPerf 快路径消费;flag 关 = 调用点保留原地逐调用解析(现行行为逐位不变)。
let _spHasSearchKey: string | null = null;
const _spHasCache = new Map<string, boolean>();
export function searchHasParam(name: string): boolean {
  let q: string;
  try { q = location.search; } catch { return false; }
  if (q !== _spHasSearchKey) {
    _spHasSearchKey = q;
    _spHasCache.clear();
  }
  const hit = _spHasCache.get(name);
  if (hit !== undefined) return hit;
  let v: boolean;
  try { v = new URLSearchParams(q).has(name); } catch { v = false; }
  _spHasCache.set(name, v);
  return v;
}

/** 缓存重置(仅测试/对拍仪具;生产禁调) */
export function searchHasResetForTest(): void { _spHasSearchKey = null; _spHasCache.clear(); }

// ---------------------------------------------------------------------------
// ★liqpolish（2026-09-29 微光环境微抛光刀）——四压力点构造路径刀总闸（灰度缺省关）。
//
// trace 定谳（/tmp/txr-shimmer3.digest.json,实机 20260929T112019,fps 108.1）残余四点:
//   ①drawVanillaLiquids self 5.17%(725.6ms) ②drawLiquidBehindTilesOnly 1.51%(212.4ms)
//   ③drawShimmerStars 1.24%(174.8ms) ④texAlive 1.26%(176.9ms)。
// 落刀面（全部零语义目标——顶点/像素逐位或 GL±1LSB 登记）:
//   A. 微光 tile 场求值单源+跨 pass 波值缓存（12 sin/tile→bg 8/fg 0,分配归零）;
//   B. sparkle/glint ADD 批化（per-tile shim rec+save/restore 退役→每 pass ≤2 段;
//      色相进顶点色=单白纹理段,像素式逐项对拍 _liqpolish-ab）;
//   C. 星 cs/sn 更新侧缓存（draw 侧 trig 外提,值逐位同）;
//   D. texAlive 按 flush 代际批检（GLSpriteLayer.texCheck/texGen;LRU 逐出窗语义
//      保持——逐出点必 bump 代际,判别器=逐出注入下守卫仍拦得住,见
//      tests/liqpolish-guard.test.ts）。
// ★转正（2026-09-29 用户拍板）缺省开:?liqpolish=0=逃生门（回逐列构造旧链,现行
//  行为逐位）。node/测试环境恒关（构造期判死——perfFlags 族惯例）。
export let liqpolish = (() => {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('liqpolish') !== '0';
  } catch { return false; }
})();

/** 测试/对拍翻面(生产代码禁调——生产只读 URLSearchParams 一次) */
export function liqpolishSetForTest(v: boolean): void { liqpolish = v; }

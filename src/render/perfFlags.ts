// ★BJ77 零语义优化层总闸(2026-09-14 性能专项)。
//
// 语义契约:缺省 false = 现行行为【逐位不变】(每处消费点都是
// `if (swPerf) 快路径 else 原路径` 双支结构,原路径逐字保留);
// `?swperf=1` 启用后只允许「输出逐位不变的零语义优化」落在此闸之后
// ——任何有取舍的项(降频/降精度/合批改序/降档)禁止接本闸,须独立定谳。
// 读取面:`?swperf` 查询参数(对齐 Renderer.lightFast/dryWarpSkip 等
// URLSearchParams 惯例)+ `window.__swPerfFlags.get()`(探针/F5 断言面)。
//
// let 而非 const:实机 A/B 对拍(_bj77-pixel-ab.mjs)与守卫测试需同会话
// 翻面(lightFast/opaqueMain「静态字段 JS 可写」同惯例)。
export let swPerf = (() => {
  try {
    return typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('swperf') === '1';
  } catch { return false; }
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

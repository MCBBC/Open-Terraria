// 读档链错误分类（★BJ318 2026-09-23）：worker 侧内存分配失败上抛为
// `[worldGen worker] Array buffer allocation failed` 等技术性文案，用户无法据以
// 自救。本模块把 OOM 族错误从普通读档失败里判别出来，供 mainFlow 换用可操作
// 文案（关闭多余标签页/刷新后重试）。纯谓词，无依赖，单测直驱。
//
// V8 分配失败消息族（实测/文档）：
//   - "Array buffer allocation failed"        —— TypedArray/ArrayBuffer 堆外分配
//   - "Invalid array buffer length"           —— 长度溢出（同属 buffer 分配面）
//   - "RangeError: WebAssembly.Memory..."     —— 不涉及，留 OOM 口径外
//   - "out of memory" / "OOM" / "JavaScript heap out of memory" —— 堆分配
//   - "allocation failed"（V8 "Fatal JavaScript invalid size" / 分配器通用尾串）
// 判据按子串小写匹配，宁宽不漏（误报代价=多提示一句自救文案，无害）。

const OOM_PATTERNS = [
  'array buffer allocation failed',
  'invalid array buffer length',
  'allocation failed',
  'out of memory',
] as const;

/** 是否内存分配类错误（OOM 族——读档/生成的 worker 或主线程分配失败） */
export function isOomLoadError(msg: string): boolean {
  const s = (msg ?? '').toLowerCase();
  if (!s) return false;
  return OOM_PATTERNS.some((p) => s.includes(p));
}

// ---- ★BJ605（2026-10-10 线上事故）「存档数据缺失」族判别与文案映射 ----
// 背景：worker saveParse 四源皆空/IDB 读空时抛「存档数据缺失」，但 mainFlow
// loadFromKey 的 worker catch 只放行 WorldGenUnavailable——数据缺失类错误被
// re-throw 拦死，主线程 kvGet（localStorage 副本）fallback 永不可达；且文案
// 对「浏览器存储不可用」与「数据真缺失」两种可操作面完全不同的态无区分。
// 机制级主因（同日定谳）：KvStore openDb 把 rejected promise 永久缓存（毒化）
// ——瞬时 open 失败后本会话 IDB 读恒 null。修复见 KvStore.ts（毒化清除+退避+
// blocked 超时）；本模块承担 worker→主线程的错误分类契约与用户文案映射。
//
// worker message 形状（worldGen.worker.ts saveParse 分支锁）：
//   `存档数据缺失 (${reason}, src=${src}, key=${key})` + 可选 `, detail=${...}`
// WorldGenClient 包装后带 `[worldGen worker] ` 前缀 ⇒ 判别**非锚定**（子串）。

export type SaveMissingReason =
  | 'idbUnavailable'   // IDB 打不开/读写失败（kvGetIdbEx cause openFailed|txFailed）——可自救
  | 'keyMissing'       // IDB 健康但键不存在（未保存成功/被驱逐）——多不可恢复
  | 'typeMismatch'     // IDB 健康但值非 string（异常写入面）
  | 'jsonParseFailed'  // 值存在但非合法 JSON（档体损坏）
  | 'noSource';        // 协议面：key/json/save 三源皆空（调用方 bug/守卫面）

const SAVE_MISSING_RE = /存档数据缺失 \((idbUnavailable|keyMissing|typeMismatch|jsonParseFailed|noSource)[,)]/;

/** 从错误 message（可带 `[worldGen worker] ` 前缀）解析缺失分类；非缺失族返 null */
export function parseSaveMissingReason(msg: string | null | undefined): SaveMissingReason | null {
  const m = SAVE_MISSING_RE.exec(msg ?? '');
  return m ? (m[1] as SaveMissingReason) : null;
}

/** 是否「存档数据缺失」族（fallback 可尝试救援的数据面缺口；
 *  loadSaveData 内部解析崩等非数据类错误不命中——保持 re-throw 原语义） */
export function isSaveDataMissingError(msg: string | null | undefined): boolean {
  return parseSaveMissingReason(msg) !== null;
}

/** 缺失分类 → toast 文案键（l10n-custom 两语言已注册，audit 字面串锚）。
 *  null（WorldGenUnavailable 来路，worker 全不可用）→ 原语义 SaveLoadFailed。
 *  noSource（协议面异常）→ 同原语义（技术细节走 {0} 插值面由调用方决定）。 */
export function saveMissingToastKey(reason: SaveMissingReason | null): string {
  switch (reason) {
    case 'idbUnavailable': return 'Mods.SandboxWorld.Toast.SaveMissingIdbUnavailable';
    case 'keyMissing': return 'Mods.SandboxWorld.Toast.SaveMissingKeyMissing';
    case 'typeMismatch':
    case 'jsonParseFailed': return 'Mods.SandboxWorld.Toast.SaveMissingCorrupt';
    default: return 'Mods.SandboxWorld.Toast.SaveLoadFailed';
  }
}

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

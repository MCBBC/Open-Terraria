// 资产落库规范 Content-Type 单一真源(2026-09-16)。
// ★根修定谳(863 条 opus 每会话整批消失+40MB 重下循环):
//   asset-warm.worker 旧 MIME 表漏 opus → 863 条音效以 application/octet-stream
//   落 CacheStorage;页面每会话 init 发 {type:'gc'} → sw.js 曾 _scrubInner(true)
//   无视每版本标记强扫全缓存,按扩展名白名单核 CT(^audio/ogg 不认 octet-stream)
//   → 863 条整批 delete → 次会话 have-set 对账判缺 → 重拉 p4+p5(恰 40MB,
//   HAR 实证三连会话各拉一次)→ put 后 CT 依旧错 → 无限循环。同片 png/mp3 幸存
//   (CT 恰在白名单内)与"只有音效丢"的线上指纹完全吻合。
// 本表必须覆盖 zip manifest 出现的全部扩展名(有测试钉死:
//   tests/asset-mime-scrub.test.ts);新增资产扩展名先补这里,否则 warm 落库 CT
//   会被 sw.js MIME 门/清扫判为异类。sw.js 侧白名单(MIME_BY_EXT)与本表同族
//   双侧手工同步(与 normCacheKey 同款约定)。
export const WARM_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf',
  json: 'application/json', txt: 'text/plain',
};

/** 文件名(可含路径)→ 规范 CT;未登记扩展名回落 octet-stream(sw.js 清扫按
 *  扩展名登记表过滤,未登记族不参与 CT 审查,回落值安全) */
export function mimeOf(name: string): string {
  return WARM_MIME[name.slice(name.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

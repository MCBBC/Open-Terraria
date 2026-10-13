// 分片下载多源回退(2026-10-13,资产 CDN 化:npmmirror(国内)/jsDelivr(全球)→同源兜底)。
// 从 asset-warm.worker 的 downloadPart 抽出成纯模块(fetch 注入可单测,先例 AssetCache
// 纯函数导出风格):候选序 = cdn.json 已验证 URLs → 末位恒同源 '/assets-zip/<file>'。
// ★失败语义与旧版 downloadPart 完全一致:流式字节账回卷/zipBytes 长度校验/轮间退避;
//   候选内失败即换下一候选(候选本身已由 publish-assets-cdn.mjs 验活,此处只兜网络抖动)。
// ★candidates 由页面 AssetCache.buildPartCandidates 构造(末位同源),worker 传入即用;
//   空/缺失时回退纯同源(=cdn.json 不存在的生产行为,零改动)。

/** 单候选失败后轮间退避(与旧版 sleep(300*(a+1)) 同节奏) */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface PartFetchDeps {
  fetchImpl?: typeof fetch;
  onBytes?: (totalGot: number) => void;   // 全局字节直通(页侧进度;含失败回卷后的净值)
}

export interface PartFetchResult {
  buf: ArrayBuffer;
  /** 命中源(候选下标;页面按 cdn.json 顺序解释:0=首选 CDN,末位=同源) */
  via: number;
  attempts: number;
}

/** 轮数:多候选(有 CDN)时 2 轮 × 候选数上限已足;纯同源维持旧版 3 次 */
function roundsFor(candidates: string[]): number {
  return candidates.length > 1 ? 2 : 3;
}

/**
 * 按候选序下载一个分片 zip → { buf, via } | null(全败)。
 * 字节账规则(与旧版逐位一致):成功读入的每块计入 totalGot;长度不符/请求失败
 * 把本候选已计字节回卷再换下一候选——totalGot 恒反映"已确认有效"的字节。
 */
export async function fetchPartBuffer(
  candidates: string[],
  zipBytes: number,
  totalGot: { v: number },
  deps: PartFetchDeps = {},
): Promise<PartFetchResult | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const list = candidates.length ? candidates : ['/assets-zip/unknown.zip'];
  const rounds = roundsFor(list);
  let attempts = 0;
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < list.length; i++) {
      attempts++;
      let pieceGot = 0;
      try {
        const res = await doFetch(list[i]!, { cache: 'reload' });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            totalGot.v += value.length;
            pieceGot = got;
            deps.onBytes?.(totalGot.v);
          }
          if (got === zipBytes) {
            const out = new Uint8Array(got);
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            return { buf: out.buffer, via: i, attempts };
          }
          // 长度不符:回卷重试(下一候选)
          totalGot.v -= got;
          pieceGot = 0;
        }
      } catch { /* 网络异常:换下一候选 */ }
      if (pieceGot) { totalGot.v -= pieceGot; pieceGot = 0; }
    }
    if (round < rounds - 1) await sleep(300 * (round + 1));
  }
  return null;
}

// 分片下载多源回退(2026-10-13,资产 CDN 化:npmmirror(国内 tgz)/jsDelivr(全球 zip)→同源兜底)。
// 从 asset-warm.worker 的 downloadPart 抽出成纯模块(fetch 注入可单测,先例 AssetCache
// 纯函数导出风格)。
// ★候选语义(2026-10-13 二代):npmmirror 的 unpkg files API 有白名单(新 scope 拒绝,
//   cnpm/unpkg-white-list),故国内源走 **tarball 下载**(registry 核心功能,无白名单)
//   ——tgz(gzip+tar 包着 zip)→ gunzipSync → tar 单文件提取 → zip,再走既有 unzipSync。
// ★失败语义与旧版 downloadPart 完全一致:流式字节账回卷/长度校验/轮间退避;
//   候选内失败即换下一候选(候选已由 publish-assets-cdn.mjs 验活,此处只兜网络抖动)。
// ★黑洞防护(2026-10-13 三代,生产切源前加固):国内"源不可用"常表现为挂起不响应
//   (GFW 式黑洞)而非快速拒连——裸 fetch 会被 45s 页面看门狗反复 force 重启形成
//   活锁(恒卡在首选候选,永远走不到回退)。两层超时堵死:
//     · TTFB 超时 TTFB_TIMEOUT_MS:连接/响应头 20s 不到 → abort 本候选换下一候选
//     · 空闲超时 IDLE_TIMEOUT_MS:body 中途 30s 无新 chunk → abort 换下一候选
//   ★onCandidateFail 逐候选失败上报(worker→页面记账降级,见 worker/AssetCache)。
import { gunzipSync } from 'fflate';

/** 单候选失败后轮间退避(与旧版 sleep(300*(a+1)) 同节奏) */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type PartCandidateKind = 'zip' | 'tgz';
export interface PartCandidate {
  url: string;
  /** 期望传输字节数:zip=分片 zipBytes;tgz=npm tarball 字节数(验活时实测回填) */
  bytes: number;
  kind: PartCandidateKind;
}

export interface PartFetchDeps {
  fetchImpl?: typeof fetch;
  onBytes?: (totalGot: number) => void;   // 全局字节直通(页侧进度;含失败回卷后的净值)
  /** 逐候选失败上报(含超时/长度不符/解包炸;页面据此跨重启降级候选序) */
  onCandidateFail?: (index: number) => void;
  /** 超时可注入(单测用;缺省 TTFB 20s / 空闲 30s) */
  ttfbTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface PartFetchResult {
  buf: ArrayBuffer;
  /** 命中源(候选下标;页面按候选序解释:0=首选(npmmirror tgz),末位=同源) */
  via: number;
  attempts: number;
}

/** 轮数:多候选(有 CDN)时 2 轮 × 候选数上限已足;纯同源维持旧版 3 次 */
function roundsFor(cands: PartCandidate[]): number {
  return cands.length > 1 ? 2 : 3;
}

/** TTFB(连接+响应头)超时;移动弱网正常 TTFB <5s,20s 已是宽容界 */
const TTFB_TIMEOUT_MS = 20_000;
/** body 空闲超时(相邻 chunk 间隔);正常下载 chunk 间隔 <1s,30s 无字节=通道僵死 */
const IDLE_TIMEOUT_MS = 30_000;

/** 候选排序(纯函数;页面/worker 共用):无嫌疑在前,嫌疑分高者靠后;
 *  末位(origin 兜底)恒保持末位——它是不依赖任何 CDN 的保命通道 */
export function demoteSuspicious(cands: PartCandidate[], suspect: Map<string, number>): PartCandidate[] {
  if (cands.length < 2) return cands;
  const origin = cands[cands.length - 1]!;
  const rest = cands.slice(0, -1);
  rest.sort((a, b) => (suspect.get(a.url) ?? 0) - (suspect.get(b.url) ?? 0));
  return [...rest, origin];
}

/** tgz(gzip(tar))→ 提取首个 .zip 条目字节。tar 头 512B:name[100]…size[12 八进制@124],
 *  数据区 512 对齐;包内恒为 package/package.json + package/<zip>(单 zip 条目,扫描取之) */
export function extractZipFromTgz(tgz: Uint8Array): Uint8Array {
  const tar = gunzipSync(tgz);
  const dec = new TextDecoder();
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = dec.decode(tar.subarray(off, off + 100)).replace(/\0.*$/, '');
    if (!name) break;   // 结束块
    const size = parseInt(dec.decode(tar.subarray(off + 124, off + 136)).replace(/\0.*$/, '').trim() || '0', 8);
    const dataStart = off + 512;
    if (name.endsWith('.zip')) return tar.subarray(dataStart, dataStart + size);
    off = dataStart + Math.ceil(size / 512) * 512;   // 跳过非 zip 条目(512 对齐)
  }
  throw new Error('tar 中未找到 zip 条目');
}

/**
 * 按候选序下载一个分片 → { buf(恒为 zip 原始字节), via } | null(全败)。
 * 字节账规则(与旧版逐位一致):成功读入的每块计入 totalGot;长度不符/请求失败
 * 把本候选已计字节回卷再换下一候选——totalGot 恒反映"已确认有效"的传输字节。
 * ★tgz 候选的 bytes=传输字节(tarball 尺寸,非 zipBytes);下载后本地解包得 zip,
 *   解包失败(gzip/tar 损坏)等同候选失败回卷换下一候选。
 * ★每个候选两层超时(TTFB 20s / 空闲 30s):黑洞挂起不再能拖死回退链。
 */
export async function fetchPartBuffer(
  candidates: PartCandidate[],
  totalGot: { v: number },
  deps: PartFetchDeps = {},
): Promise<PartFetchResult | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const list = candidates.length ? candidates : [{ url: '/assets-zip/unknown.zip', bytes: 0, kind: 'zip' as const }];
  const rounds = roundsFor(list);
  let attempts = 0;
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < list.length; i++) {
      const cand = list[i]!;
      attempts++;
      let pieceGot = 0;
      // 两层超时共用一个 AbortController:TTFB 定时器在首 chunk 到达时撤;
      // 之后每 chunk 重设空闲定时器——任一触发即 abort(连接级)按候选失败处理
      const ac = new AbortController();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = (ms: number) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => ac.abort(), ms);
      };
      try {
        arm(deps.ttfbTimeoutMs ?? TTFB_TIMEOUT_MS);
        const res = await doFetch(cand.url, { cache: 'reload', signal: ac.signal });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            arm(deps.idleTimeoutMs ?? IDLE_TIMEOUT_MS);   // 首块已到=TTFB 过关,此后按空闲口径
            chunks.push(value);
            got += value.length;
            totalGot.v += value.length;
            pieceGot = got;
            deps.onBytes?.(totalGot.v);
          }
          if (timer) clearTimeout(timer);
          if (got === cand.bytes) {
            const out = new Uint8Array(got);
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            const buf = cand.kind === 'tgz' ? extractZipFromTgz(out).slice().buffer : out.buffer;
            return { buf: buf as ArrayBuffer, via: i, attempts };
          }
          // 长度不符:回卷重试(下一候选)
          totalGot.v -= got;
          pieceGot = 0;
        }
      } catch { /* 网络异常/超时 abort/解包失败:换下一候选 */ }
      finally {
        if (timer) clearTimeout(timer);
      }
      if (pieceGot) { totalGot.v -= pieceGot; pieceGot = 0; }
      deps.onCandidateFail?.(i);   // ★逐候选失败记账(worker→页面降级,堵黑洞活锁)
    }
    if (round < rounds - 1) await sleep(300 * (round + 1));
  }
  return null;
}

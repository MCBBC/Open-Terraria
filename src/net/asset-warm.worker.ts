// zip 资源解压 Worker(2026-08-19;2026-09-04 并发化)。
// 重活(fetch+unzipSync)全在本线程,页面只做 cache.put(★Cache API 仅 Window/SW
// 可用,worker 无 caches——put 必须回页面)。
// ★2 路滑动窗口并发(2026-09-04 用户"串行吃不满带宽"):下载跨片流水线——
//   路 A 解压时路 B 下载;2 路为手机内存峰值(≈2×片 zip+解压输出 ~130MB)与
//   带宽利用的平衡点。高带宽场景全量时长约 ÷2。
// 协议(直给,无状态机):
//   入: {type:'run', jobs:[{file,zipBytes,missing:[名字]}]}
//   出: {type:'dl', got}                     全局字节直通(并发片统一累计;
//                                            片重试由 worker 内部回卷,页面直用)
//       {type:'files', names, bufs, mime}    分批(≤128 文件/条,ArrayBuffer 转移)
//       {type:'partDone', file, failed}      per 片终态(失败=片内 missing 全计)
//       {type:'done', failed}                全部跑完
import '../workers/procShim';   // ★process 兜底首导入(见 workers/procShim.ts;2026-09-02 扩面)
import { unzipSync } from 'fflate';

const MIME: Record<string, string> = {
  png: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg',
  woff2: 'font/woff2', json: 'application/json',
};
const mimeOf = (n: string) => MIME[n.slice(n.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 单片:流式下载(全局字节计数,重试回卷)+长度校验 → ArrayBuffer|null(3 重试) */
async function downloadPart(
  job: { file: string; zipBytes: number },
  totalGot: { v: number },
): Promise<ArrayBuffer | null> {
  let pieceGot = 0;
  let buf: ArrayBuffer | null = null;
  for (let a = 0; a < 3 && !buf; a++) {
    try {
      // ★根相对:worker 自身 URL 在 /assets/ 下,裸相对会解析成 /assets/assets-zip/
      const res = await fetch('/assets-zip/' + job.file, { cache: 'reload' });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let got = 0, lastPost = 0, lastPostAt = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          totalGot.v += value.length; pieceGot = got;
          const now = Date.now();
          if (totalGot.v - lastPost >= 512 * 1024 || now - lastPostAt >= 200) {
            lastPost = totalGot.v; lastPostAt = now;
            self.postMessage({ type: 'dl', got: totalGot.v });   // 全局字节直通
          }
        }
        if (got === job.zipBytes) {
          const out = new Uint8Array(got);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          buf = out.buffer;
        } else {
          totalGot.v -= got; pieceGot = 0;   // 长度不符回卷重试
        }
      }
    } catch { /* 重试 */ }
    if (!buf) { totalGot.v -= pieceGot; pieceGot = 0; }
    if (!buf && a < 2) await sleep(300 * (a + 1));
  }
  return buf;
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as {
    type: string;
    jobs: Array<{ file: string; zipBytes: number; missing: string[] }>;
  };
  if (d.type !== 'run') return;
  let failed = 0;
  let idx = 0;
  const totalGot = { v: 0 };   // 对象盒:并发 lane 闭包共享累加

  const runLane = async () => {
    while (idx < d.jobs.length) {
      const job = d.jobs[idx++]!;
      if (!job.missing.length) continue;
      const buf = await downloadPart(job, totalGot);
      if (!buf) {
        failed += job.missing.length;   // 下载失败=整片计失败,继续下一片(健康片不受累)
        self.postMessage({ type: 'partDone', file: job.file, failed: job.missing.length });
        continue;
      }
      // 整片一次解压(worker 线程,CPU 不碰页面) → 分批转移给页面
      try {
        const files = unzipSync(new Uint8Array(buf));
        let names: string[] = [];
        let bufs: ArrayBuffer[] = [];
        let partFailed = 0;
        const flush = () => {
          if (!names.length) return;
          self.postMessage({ type: 'files', names, bufs, mime: names.map(mimeOf) }, bufs as unknown as Transferable[]);
          names = []; bufs = [];
        };
        for (const name of job.missing) {
          const data = files[name];
          if (!data) { partFailed++; continue; }   // 清单与包体不符(不应发生)
          names.push(name);
          // fflate 返回独立 Uint8Array(底层 buffer 独占)→ 可安全转移
          bufs.push(data.buffer as ArrayBuffer);
          if (names.length >= 128) flush();
        }
        flush();
        failed += partFailed;
        self.postMessage({ type: 'partDone', file: job.file, failed: partFailed });
      } catch {
        // 解压异常(CRC/损坏):片计失败,继续健康片
        failed += job.missing.length;
        self.postMessage({ type: 'partDone', file: job.file, failed: job.missing.length });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, d.jobs.length) }, runLane));
  self.postMessage({ type: 'done', failed });
};

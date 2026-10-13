// zip 资源解压 Worker(2026-08-19;2026-09-04 并发化)。
// 重活(fetch+unzipSync)全在本线程,页面只做 cache.put(★Cache API 仅 Window/SW
// 可用,worker 无 caches——put 必须回页面)。
// ★2 路滑动窗口并发(2026-09-04 用户"串行吃不满带宽"):下载跨片流水线——
//   路 A 解压时路 B 下载;2 路为手机内存峰值(≈2×片 zip+解压输出 ~130MB)与
//   带宽利用的平衡点。高带宽场景全量时长约 ÷2。
// 协议(直给,无状态机):
//   入: {type:'run', jobs:[{file,zipBytes,missing:[名字],urls?:[候选下载地址,末位恒同源]}]}
//   出: {type:'dl', got}                     全局字节直通(并发片统一累计;
//                                            片重试由 worker 内部回卷,页面直用)
//       {type:'files', names, bufs, mime}    分批(≤128 文件/条,ArrayBuffer 转移)
//       {type:'partDone', file, failed,via}  per 片终态(失败=片内 missing 全计;
//                                            via=命中候选下标,-1=全败,页面按候选序
//                                            映射源标签做 trace)
//       {type:'done', failed}                全部跑完
import { assertWorkerBootGate } from '../workers/workerBootGate';   // ★boot 闸首导入（x-ray 定谳防线;先于 procShim,见该文件头注）
import '../workers/procShim';   // ★process 兜底首导入(见 workers/procShim.ts;2026-09-02 扩面)
import { unzipSync } from 'fflate';
// ★CT 表单源化(2026-09-16 根修):旧本地表漏 opus → 863 条音效以
//   application/octet-stream 落缓存,被 sw.js 会话清扫按 ^audio/ogg 判异整批删除
//   → 每会话重拉 p4/p5(40MB)循环。表迁 assetMime.ts(与页面 put 侧同源)。
import { mimeOf } from './assetMime';
// ★CDN 化(2026-10-13):下载多源回退抽至 partFetcher(纯模块可单测)——候选序
//   = cdn.json 已验活 URLs → 末位同源;cdn.json 缺失(生产未切)=纯同源,行为同旧版。
import { fetchPartBuffer } from './partFetcher';

assertWorkerBootGate('asset-warm.worker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

/** 单片:流式下载(全局字节计数,候选回退+重试回卷)+长度校验 → {buf,via}|null */
async function downloadPart(
  candidates: string[],
  job: { file: string; zipBytes: number },
  totalGot: { v: number },
): Promise<{ buf: ArrayBuffer; via: number } | null> {
  let lastPost = 0, lastPostAt = 0;
  const res = await fetchPartBuffer(candidates, job.zipBytes, totalGot, {
    // 'dl' 节流直通(与旧版同节奏:512KB/200ms),候选切换的回卷已在 partFetcher 内结算
    onBytes: (got) => {
      const now = Date.now();
      if (got - lastPost >= 512 * 1024 || now - lastPostAt >= 200) {
        lastPost = got; lastPostAt = now;
        self.postMessage({ type: 'dl', got });   // 全局字节直通
      }
    },
  });
  return res;
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as {
    type: string;
    jobs: Array<{ file: string; zipBytes: number; missing: string[]; urls?: string[] }>;
  };
  if (d.type !== 'run') return;
  let failed = 0;
  let idx = 0;
  const totalGot = { v: 0 };   // 对象盒:并发 lane 闭包共享累加

  const runLane = async () => {
    while (idx < d.jobs.length) {
      const job = d.jobs[idx++]!;
      if (!job.missing.length) continue;
      // 候选序:页面给的 cdn URLs(末位同源);缺失/为空 = 纯同源(生产未切源行为)
      // ★根相对:worker 自身 URL 在 /assets/ 下,裸相对会解析成 /assets/assets-zip/
      const candidates = job.urls?.length ? job.urls : ['/assets-zip/' + job.file];
      const part = await downloadPart(candidates, job, totalGot);
      if (!part) {
        failed += job.missing.length;   // 下载失败=整片计失败,继续下一片(健康片不受累)
        self.postMessage({ type: 'partDone', file: job.file, failed: job.missing.length, via: -1 });
        continue;
      }
      const buf = part.buf;
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
        self.postMessage({ type: 'partDone', file: job.file, failed: partFailed, via: part.via });
      } catch {
        // 解压异常(CRC/损坏):片计失败,继续健康片
        failed += job.missing.length;
        self.postMessage({ type: 'partDone', file: job.file, failed: job.missing.length, via: part.via });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, d.jobs.length) }, runLane));
  self.postMessage({ type: 'done', failed });
};

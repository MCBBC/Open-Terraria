// zip 资源解压 Worker(2026-08-19;2026-09-04 并发化)。
// 重活(fetch+unzipSync)全在本线程,页面只做 cache.put(★Cache API 仅 Window/SW
// 可用,worker 无 caches——put 必须回页面)。
// ★2 路滑动窗口并发(2026-09-04 用户"串行吃不满带宽"):下载跨片流水线——
//   路 A 解压时路 B 下载;2 路为手机内存峰值(≈2×片 zip+解压输出 ~130MB)与
//   带宽利用的平衡点。高带宽场景全量时长约 ÷2。
// 协议(直给,无状态机):
//   入: {type:'run', jobs:[{file,zipBytes,missing:[名字],cands?:[候选{url,bytes,kind},末位恒同源]}]}
//   出: {type:'dl', got}                     全局字节直通(并发片统一累计;
//                                            片重试由 worker 内部回卷,页面直用)
//       {type:'files', names, bufs, mime}    分批(≤128 文件/条,ArrayBuffer 转移)
//       {type:'partDone', file, failed,via}  per 片终态(失败=片内 missing 全计;
//                                            via=命中候选下标,-1=全败,页面按候选序
//                                            映射源标签做 trace)
//       {type:'candFail', file, via}         逐候选失败上报(页面跨重启降级记账;
//                                            ★黑洞挂起场景 partDone 永不到达,
//                                            靠本消息+页面嫌疑账才能把坏源踢到队尾)
//       {type:'done', failed}                全部跑完
import { assertWorkerBootGate } from '../workers/workerBootGate';   // ★boot 闸首导入（x-ray 定谳防线;先于 procShim,见该文件头注）
import '../workers/procShim';   // ★process 兜底首导入(见 workers/procShim.ts;2026-09-02 扩面)
import { unzipSync } from 'fflate';
// ★CT 表单源化(2026-09-16 根修):旧本地表漏 opus → 863 条音效以
//   application/octet-stream 落缓存,被 sw.js 会话清扫按 ^audio/ogg 判异整批删除
//   → 每会话重拉 p4/p5(40MB)循环。表迁 assetMime.ts(与页面 put 侧同源)。
import { mimeOf } from './assetMime';
// ★CDN 化(2026-10-13):下载多源回退抽至 partFetcher(纯模块可单测)——候选序
//   = npmmirror tgz(国内)→ jsDelivr zip(全球)→ 末位同源;cdn.json 缺失(生产未切)
//   =纯同源,行为同旧版。tgz 候选由 partFetcher 内解包(gzip+tar→zip)。
// ★三代加固(2026-10-13 生产切源前):黑洞超时(TTFB 20s/空闲 30s,partFetcher 内)+
//   嫌疑降级(suspect 账同 run 生效 + candFail 上报页面跨重启生效)——堵「首选源挂起
//   被 45s 看门狗反复重启」的活锁,保证双 CDN 皆不可用时必然落到同源。
import { fetchPartBuffer, demoteSuspicious, type PartCandidate } from './partFetcher';

assertWorkerBootGate('asset-warm.worker');   // 图求值后一拍扫 boot 残留（能力账见 workerBootGate 头注）

/** 单片:流式下载(全局字节计数,候选回退+重试回卷)+长度校验 → {buf,via}|null */
async function downloadPart(
  file: string,
  candidates: PartCandidate[],
  totalGot: { v: number },
  suspect: Map<string, number>,
): Promise<{ buf: ArrayBuffer; via: number } | null> {
  let lastPost = 0, lastPostAt = 0;
  const res = await fetchPartBuffer(candidates, totalGot, {
    // 'dl' 节流直通(与旧版同节奏:512KB/200ms),候选切换的回卷已在 partFetcher 内结算
    onBytes: (got) => {
      const now = Date.now();
      if (got - lastPost >= 512 * 1024 || now - lastPostAt >= 200) {
        lastPost = got; lastPostAt = now;
        self.postMessage({ type: 'dl', got });   // 全局字节直通
      }
    },
    // ★逐候选失败:同 run 内立即降级(suspect 分数高者排到队尾)+ 上报页面跨重启记账
    onCandidateFail: (index) => {
      const url = candidates[index]?.url;
      if (!url) return;
      suspect.set(url, (suspect.get(url) ?? 0) + 1);
      self.postMessage({ type: 'candFail', file, via: index });
    },
  });
  return res;
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as {
    type: string;
    jobs: Array<{ file: string; zipBytes: number; missing: string[]; cands?: PartCandidate[] }>;
  };
  if (d.type !== 'run') return;
  let failed = 0;
  let idx = 0;
  const totalGot = { v: 0 };   // 对象盒:并发 lane 闭包共享累加
  const suspect = new Map<string, number>();   // 同 run 候选嫌疑账(失败即降级,堵黑洞串行拖死)

  const runLane = async () => {
    while (idx < d.jobs.length) {
      const job = d.jobs[idx++]!;
      if (!job.missing.length) continue;
      // 候选序:页面构造(tgz→zip→同源)后按嫌疑重排;缺失/为空 = 纯同源(生产未切源行为)
      // ★根相对:worker 自身 URL 在 /assets/ 下,裸相对会解析成 /assets/assets-zip/
      const base = job.cands?.length ? job.cands : [{ url: '/assets-zip/' + job.file, bytes: job.zipBytes, kind: 'zip' as const }];
      const candidates = demoteSuspicious(base, suspect);
      const part = await downloadPart(job.file, candidates, totalGot, suspect);
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

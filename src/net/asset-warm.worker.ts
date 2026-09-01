// zip 资源解压 Worker(2026-08-19):重活(fetch+unzipSync)全在本线程,页面只做
// cache.put(★Cache API 仅 Window/SW 可用,worker 无 caches——put 必须回页面)。
// 协议(直给,无状态机):
//   入: {type:'run', jobs:[{file,zipBytes,missing:[名字]}], total}
//   出: {type:'files', names:[...], bufs:[ArrayBuffer 转移]}  分批(≤128 文件/条)
//       {type:'progress', done} / {type:'partDone', file, failed}
//       {type:'done', failed}   全部跑完(failed=条目级失败总数;片下载 3 重试失败=片内 missing 全计)
import '../workers/procShim';   // ★process 兜底首导入(见 workers/procShim.ts;2026-09-02 扩面)
import { unzipSync } from 'fflate';

const MIME: Record<string, string> = {
  png: 'image/png', wav: 'audio/wav', mp3: 'audio/mpeg',
  woff2: 'font/woff2', json: 'application/json',
};
const mimeOf = (n: string) => MIME[n.slice(n.lastIndexOf('.') + 1)] ?? 'application/octet-stream';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as {
    type: string;
    jobs: Array<{ file: string; zipBytes: number; missing: string[] }>;
  };
  if (d.type !== 'run') return;
  let failed = 0;
  for (const job of d.jobs) {
    if (!job.missing.length) continue;
    // 片下载:重试 ×3;cache:'reload' 绕截断体被 ETag 钉死;zipBytes 长度校验。
    // ★流式读 res.body:下载中即向页面上报字节增量(≥512KB 或 200ms 一报,
    //   页面拼 "已下载 X MB / 目标 Y MB" 实时进度)
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
            const now = Date.now();
            if (got - lastPost >= 512 * 1024 || now - lastPostAt >= 200) {
              lastPost = got; lastPostAt = now;
              self.postMessage({ type: 'dl', got });   // 片内累计,页面按片清算
            }
          }
          if (got === job.zipBytes) {
            const out = new Uint8Array(got);
            let off = 0;
            for (const c of chunks) { out.set(c, off); off += c.length; }
            buf = out.buffer;
            if (lastPost !== got) self.postMessage({ type: 'dl', got });
          }
        }
      } catch { /* 重试 */ }
      if (!buf && a < 2) await sleep(300 * (a + 1));
    }
    if (!buf) {
      failed += job.missing.length;   // 下载失败=整片计失败,继续下一片(健康片不受累)
      self.postMessage({ type: 'partDone', file: job.file, failed: job.missing.length });
      continue;
    }
    // 整片一次解压(worker 线程,CPU 不碰页面) → 分批转移给页面
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
      // copyInto? fflate 返回独立 Uint8Array(底层 buffer 独占)→ 可安全转移
      bufs.push(data.buffer as ArrayBuffer);
      if (names.length >= 128) flush();
    }
    flush();
    failed += partFailed;
    self.postMessage({ type: 'partDone', file: job.file, failed: partFailed });
  }
  self.postMessage({ type: 'done', failed });
};

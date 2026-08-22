// 世界生成/存档解析 worker：generate（生成+沉降一条链）与 saveParse（读档解析+沉降）。
// 全程纯计算（generateWorld/settleWorldLiquids/loadSaveData 均无 DOM 依赖），
// 结果 packWorld 转移所有权回传。错误按请求 id 回传，绝不静默 pending。
/// <reference lib="webworker" />
import { generateWorld } from '../world/gen/WorldGen';
import { settleWorldLiquids } from '../world/liquid/settle';
import { packWorld } from './worldPacket';
import { renderPreviewBitmap } from './previewBitmap';
import { loadSaveData } from '../save/SaveFile';
import { kvGetIdb } from '../save/KvStore';
import type { WorldWorkerRequest, WorldWorkerEvent } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: WorldWorkerEvent, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorldWorkerRequest>) => void) | null;
};

// 兜底回传：unhandled rejection / 运行时错误（栈溢出等 catch 块自身可能再溢出，
// 2026-08-18 排查实践：onerror 在主线程侧拿不到 worker 栈，必须在 worker 内自报）
self.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  const r = ev.reason as Error | undefined;
  ctx.postMessage({ id: -1, type: 'error', message: 'unhandled: ' + (r?.message ?? String(ev.reason)),
    stack: r?.stack });
});
self.addEventListener('error', (ev: ErrorEvent) => {
  ctx.postMessage({ id: -1, type: 'error', message: 'runtime: ' + ev.message,
    stack: (ev.error as Error | undefined)?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}` });
});

ctx.onmessage = async (e) => {
  const req = e.data;
  try {
    if (req.type === 'ping') {
      ctx.postMessage({ id: req.id, type: 'ready' });
      return;
    }
    if (req.type === 'generate') {
      const world = await generateWorld(
        {
          width: req.cfg.width, height: req.cfg.height, size: req.cfg.size, seedText: req.cfg.seedText,
          name: req.cfg.name, evil: req.cfg.evil, seedFlags: req.cfg.seedFlags,
          // 生成期实时预览：worker 侧降采样 RGBA → transfer（替代旧 onWorldPartial 整 world 回调）
          onWorldPartial: req.cfg.preview
            ? (w, passIndex, passName) => {
              const f = renderPreviewBitmap(w.store);
              ctx.postMessage(
                { id: req.id, type: 'preview', passIndex, passName, width: f.width, height: f.height, rgba: f.rgba.buffer as ArrayBuffer },
                [f.rgba.buffer],
              );
            }
            : undefined,
        },
        (label, p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'generate', label, p }),
      );
      // 二次沉降(cs:21051)自 2026-08-17 起归位 generateWorld 管线内（蜂巢幼虫之后、
      // 仙人掌珊瑚之前）——此处不再生成后补跑（曾晚 8 个 pass：#98 液体门读到未沉水体）
      const { packet, transfer } = packWorld(world); // 转移所有权（本分支最后一步）
      ctx.postMessage({ id: req.id, type: 'result', world: packet }, transfer);
      return;
    }
    if (req.type === 'saveParse') {
      // 三源：key=worker 内直读 IDB（主路径，免大字符串 clone）；json=小档/调试；save=.wld 导入
      const data = req.save
        ? req.save
        : JSON.parse(req.json ?? (await kvGetIdb(req.key ?? '')) ?? 'null') as import('../save/SaveFile').SaveData | null;
      if (!data) throw new Error('存档数据缺失');
      ctx.postMessage({ id: req.id, type: 'progress', phase: 'parse', p: 0.3 });
      // 原版 loadWorld 进度序列(WorldFile.cs):LoadWorldTiles gen[51] 按列(:2514)→
      // 沉降 gen[27] 收敛比例 50-100%(:762)。p 现为收敛比例 0..1(settle.ts),
      // 百分比区间在 mainFlow 端拼(:762 同款 50+p*50)
      const { world, player } = loadSaveData(data,
        (p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'tiles', p }));
      await settleWorldLiquids(world, 'load',
        (p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'settle', label: '水体沉降', p }));
      const { packet, transfer } = packWorld(world);
      // ★收窄:主线程只消费 difficulty/events(mainFlow.ts:275/278),整档 SaveData
      // 回传=4.7MB 结构化克隆白费(2026-08-13 读档优化)
      ctx.postMessage({
        id: req.id, type: 'result', world: packet, player,
        save: { header: { difficulty: data.header?.difficulty }, events: data.events } as typeof data,
      }, transfer);
      return;
    }
  } catch (err) {
    ctx.postMessage({
      id: req.id, type: 'error',
      message: err instanceof Error ? `${err.message}` : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
};

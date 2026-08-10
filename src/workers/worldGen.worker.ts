// 世界生成/存档解析 worker：generate（生成+沉降一条链）与 saveParse（读档解析+沉降）。
// 全程纯计算（generateWorld/settleWorldLiquids/loadSaveData 均无 DOM 依赖），
// 结果 packWorld 转移所有权回传。错误按请求 id 回传，绝不静默 pending。
/// <reference lib="webworker" />
import { generateWorld } from '../world/gen/WorldGen';
import { settleWorldLiquids } from '../world/liquid/settle';
import { packWorld } from './worldPacket';
import { renderPreviewBitmap } from './previewBitmap';
import type { WorldWorkerRequest, WorldWorkerEvent } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: WorldWorkerEvent, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorldWorkerRequest>) => void) | null;
};

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
          width: req.cfg.width, height: req.cfg.height, seedText: req.cfg.seedText,
          name: req.cfg.name, structures: req.cfg.structures, evil: req.cfg.evil,
          ...(req.cfg.lgcTerrain !== undefined ? { lgcTerrain: req.cfg.lgcTerrain } : {}),
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
      await settleWorldLiquids(world, 'gen',
        (p) => ctx.postMessage({ id: req.id, type: 'progress', phase: 'settle', label: '水体沉降', p }));
      const { packet, transfer } = packWorld(world); // 转移所有权（本分支最后一步）
      ctx.postMessage({ id: req.id, type: 'result', world: packet }, transfer);
      return;
    }
    if (req.type === 'saveParse') {
      ctx.postMessage({ id: req.id, type: 'error', message: 'saveParse: 阶段 2 实现' });
    }
  } catch (err) {
    ctx.postMessage({
      id: req.id, type: 'error',
      message: err instanceof Error ? `${err.message}` : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
};

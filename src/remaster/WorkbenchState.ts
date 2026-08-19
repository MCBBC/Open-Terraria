// 工作台按帧验收状态机(dev-only,工作台层):
//   untouched →(重制)→ pending →(验收✓)→ accepted /(改 prompt 重试)→ pending
//                                        /(跳过)→ skipped
//   全帧 ∈{accepted,skipped} ⇒ 条目 complete(列表打勾)
// 进度(状态+prompt+重试历史)防抖持久化 kv 字符串;验收帧像素存 PackStore blob。
import type { AssetEntry, EntryProgress, FrameRecord, FrameStatus } from './types';
import { loadProgress, saveProgress, putFramePixels, deleteFramePixels } from './PackStore';

const MAX_ATTEMPTS = 8;

export class WorkbenchState {
  progress: Record<string, EntryProgress> = {};
  private saveTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** 进度/条目完成度变化通知(左栏徽标刷新) */
  onChange: (() => void) | null = null;

  async load(): Promise<void> {
    this.progress = await loadProgress();
  }

  private ensure(entry: AssetEntry): EntryProgress {
    let p = this.progress[entry.key];
    if (!p) {
      p = { key: entry.key, complete: false, frames: {} };
      this.progress[entry.key] = p;
    }
    return p;
  }

  frame(entry: AssetEntry, frameIdx: number): FrameRecord {
    const p = this.ensure(entry);
    return p.frames[frameIdx] ?? { status: 'untouched', attempts: [] };
  }

  /** 状态转移(纯状态面;像素持久化走 accept/skip/retry 显式方法)。 */
  private setStatus(entry: AssetEntry, frameIdx: number, status: FrameStatus, extra?: Partial<FrameRecord>): FrameRecord {
    const p = this.ensure(entry);
    const cur = p.frames[frameIdx] ?? { status: 'untouched', attempts: [] } as FrameRecord;
    const next: FrameRecord = { ...cur, ...extra, status };
    p.frames[frameIdx] = next;
    p.complete = entry.frames.every((f) => {
      const st = p.frames[f.frameIdx]?.status;
      return st === 'accepted' || st === 'skipped';
    });
    this.scheduleSave();
    this.onChange?.();
    return next;
  }

  /** 重制完成(pending:等待人工验收;附 prompt/生成参数入历史)。 */
  async remastered(entry: AssetEntry, frameIdx: number, prompt: string, quality: string, gen: FrameRecord['gen'], pixels: Uint8ClampedArray): Promise<void> {
    const p = this.ensure(entry);
    const cur = p.frames[frameIdx] ?? { status: 'untouched', attempts: [] } as FrameRecord;
    const attempts = [...cur.attempts, { prompt, ts: Date.now(), quality }];
    if (attempts.length > MAX_ATTEMPTS) attempts.splice(0, attempts.length - MAX_ATTEMPTS);
    this.setStatus(entry, frameIdx, 'pending', { prompt, gen, attempts });
    // pending 帧像素也存(刷新页面不丢待验收结果)
    await putFramePixels(entry.key, frameIdx, pixels);
  }

  /** 验收通过:accepted(推进单位=帧)。 */
  async accept(entry: AssetEntry, frameIdx: number): Promise<void> {
    this.setStatus(entry, frameIdx, 'accepted');
  }

  /** 跳过:保留原版像素,合法终态。 */
  async skip(entry: AssetEntry, frameIdx: number): Promise<void> {
    this.setStatus(entry, frameIdx, 'skipped');
    await deleteFramePixels(entry.key, frameIdx);
  }

  /** 拒绝回到 untouched(丢像素)或仅重试(pending 覆盖由 remastered 做)。 */
  async reject(entry: AssetEntry, frameIdx: number): Promise<void> {
    this.setStatus(entry, frameIdx, 'untouched');
    await deleteFramePixels(entry.key, frameIdx);
  }

  /** 下一个非终态帧(-1=全部终态)。 */
  nextPendingFrame(entry: AssetEntry, from: number): number {
    for (let i = from; i < entry.frames.length; i++) {
      const st = this.frame(entry, i).status;
      if (st !== 'accepted' && st !== 'skipped') return i;
    }
    return -1;
  }

  /** 条目进度文本 `12/240`。 */
  progressText(entry: AssetEntry): string {
    const p = this.progress[entry.key];
    if (!p) return `0/${entry.frames.length}`;
    let done = 0;
    for (const f of entry.frames) {
      const st = p.frames[f.frameIdx]?.status;
      if (st === 'accepted' || st === 'skipped') done++;
    }
    return `${done}/${entry.frames.length}`;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = 0;
      void saveProgress(this.progress);
    }, 500) as unknown as ReturnType<typeof setTimeout>;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = 0; }
    await saveProgress(this.progress);
  }
}

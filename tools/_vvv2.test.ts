// VVV 批探针：二次沉降（pass 98 Settle_Liquids_Again）全程样本流标定点（JS 侧）。
// 与 /tmp/vvv-out/rig-src JJHook.OnRoll 的 SW_TAGLOG 同格式：窗口开启期间每个
// internalSample 记一行 "ln|value|api|chain..."，对拍首分歧标签即真凶消费类。
// 用法：SW_VVV=1 SW_MB_1457=1 npx vitest run tools/_vvv2.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_VVV === '1';
const TAG = '/tmp/vvv-out/j-tag.txt';
const KLOG = '/tmp/vvv-out/j-klog.txt';
const SEED = process.env.SW_M8_SEED ?? '9293480';
const EVIL = Number(process.env.SW_M8_EVIL ?? 0);

let kwin: { on: boolean; buf: string[]; n: number } | null = null;
(globalThis as Record<string, unknown>).__swLqKill = (
  x: number, y: number, sheet: number, fx: number, fy: number,
) => {
  if (!kwin?.on) return;
  kwin.buf.push(`K ${++kwin.n} ${x} ${y} ${sheet} ${fx} ${fy}`);
};

it('vvv tagged sample stream', async () => {
  if (!RUN) return;
  let win = false;
  let ln = 0;
  const buf: string[] = [];
  const oIS = UnifiedRandom.prototype.internalSample;
  (UnifiedRandom.prototype as unknown as Record<string, unknown>).internalSample =
    function (this: UnifiedRandom): number {
      const v = oIS.call(this);
      if (!win) return v;
      ln++;
      const st = new Error().stack ?? '';
      const frames = st.split('\n').slice(2)
        .map((l) => l.trim())
        .filter((l) => !l.includes('core/rng') && !l.includes('_vvv2'))
        .map((l) => {
          const m = l.match(/^at\s+(\S+?)\s+\(/);
          if (m) return m[1];
          const f = l.match(/^at\s+(\S+:\d+:\d+)/);
          return f ? `@${f[1]}` : '';
        })
        .filter((n) => n && n !== 'Array.forEach' && n !== 'Array.map' && n !== 'Object.<anonymous>')
        .slice(0, 6);
      buf.push(`${ln}|${v}|UnifiedRandom.internalSample|${frames.join('|')}|`);
      return v;
    };
  try {
    await generateWorld({
      width: 4200,
      height: 1200,
      seedText: SEED,
      evil: EVIL as -1 | 0 | 1,
    }, (label) => {
      // 槽名驱动开窗（UUU 教训：不假设执行序）；同 label 重复的子进度不动窗
      if (label === '二次沉降') {
        win = true;
        ln = 0;
        kwin = { on: true, buf: [], n: 0 };
        return;
      }
      if (win) {
        win = false;
        if (kwin) kwin.on = false;
      }
    });
  } finally {
    win = false;
    if (kwin) kwin.on = false;
    (UnifiedRandom.prototype as unknown as Record<string, unknown>).internalSample = oIS;
  }
  writeFileSync(TAG, buf.join('\n') + '\n');
  if (kwin) writeFileSync(KLOG, kwin.buf.join('\n') + '\n');
}, 600000);

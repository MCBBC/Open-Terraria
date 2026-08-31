// IIII106：秘种子「接线证据仪」——同底种 flagged vs unflagged 双跑，逐槽位 8 通道
// diff 普查（ Engagement 证据：旗标闭=零扰动、开=在预期 pass 窗产生内容差）。
// 非认证仪（认证=tools/_iii81m8 对 x86 G2）；本仪仅判「旗是否真的驱动了生成面」。
// 用法：SW_MB_1457=1 SW_I106_ENG=<旗标文本如 purifythis> npx vitest run tools/_i106engage.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const TEXT = process.env.SW_I106_ENG ?? '';
const RUN = !!TEXT;
const SEED = process.env.SW_I106_SEED ?? '106105';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// 抽样槽位（0..58 JS 槽号 → 名）：早段/树/岛/终段
const SLOTS: Record<number, string> = {
  0: '原版地形', 3: '生物群系', 13: '半砖平滑', 22: '快清理', 24: '浮空岛屋',
  41: '地表植物', 53: '瓦片清理', 58: '终清理',
};

(RUN ? it : it.skip)('IIIII106 engagement diff', async () => {
  const base = 'x'; // 占位
  void base;
  const cap: Record<string, Record<number, unknown>> = { plain: {}, flag: {} };
  for (const mode of ['plain', 'flag'] as const) {
    const snap: Record<number, unknown> = {};
    await generateWorld({
      width: 4200, height: 1200,
      // ★控制臂必须同 seed 文本（世界种子=CRC32(整串)）——旗关位走 seedFlags={} 直注
      seedText: `${TEXT}|${SEED}`,
      evil: 0,
      ...(mode === 'flag' ? {} : { seedFlags: {} }),
      onWorldPartial: (w, i) => {
        if (SLOTS[i] !== undefined && snap[i] === undefined) {
          snap[i] = (w.store as unknown as Record<string, Uint8Array | Uint16Array>);
        }
      },
    });
    cap[mode] = snap;
  }
  const CH = ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;
  console.log(`\n── IIII106 engagement ${TEXT} (seed=${SEED}) ──`);
  for (const [slotStr, nm] of Object.entries(SLOTS)) {
    const k = Number(slotStr);
    const a = cap.plain[k] as Record<string, Uint8Array | Uint16Array> | undefined;
    const b = cap.flag[k] as Record<string, Uint8Array | Uint16Array> | undefined;
    if (!a || !b) { console.log(`slot#${k} ${nm}: (missing snapshot)`); continue; }
    const parts: string[] = [];
    let total = 0;
    for (const c of CH) {
      const va = a[c] as Uint8Array, vb = b[c] as Uint8Array;
      let d = 0;
      for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) d++;
      if (c === 'type') {
        // type 需按 flags 位展开对比太重，此处按内部值直比（同一路径下活性一致时有效）
      }
      total += d;
      if (d) parts.push(`${c}:${d}`);
    }
    console.log(`slot#${String(k).padStart(2)} ${nm}: ${total === 0 ? 'SAME' : parts.join(' ')}`);
  }
}, 900_000);

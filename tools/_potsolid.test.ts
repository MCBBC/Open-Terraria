// pots 时点 GenSolid 全类型对账：dump070 活性 type × vanGenSolidType（rig 态）
// vs 原版 pots 时点 tileSolid 推导表（false={659,484,190,162,225,232,192,481,482,483}∪数据预翻,
// 其余=TILE_DEFS.solid≈Main.cs 默认——GenSolid 时间线注释在案）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { resetGenSolid, flipGenSolid, vanGenSolidType } from '../src/world/gen/vanilla/GenSolid';
const RUN = process.env.SW_PARITY === '1';
(RUN ? it : it.skip)('pots-time solid table vs dump070 active types', () => {
  const t70 = new Uint16Array(readFileSync('/tmp/sw-num4/van_x86_g/070_Quick_Cleanup.typ').buffer.slice(0));
  const a70 = readFileSync('/tmp/sw-num4/van_x86_g/070_Quick_Cleanup.act');
  const counts = new Map<number, number>();
  for (let i = 0; i < a70.length; i++) if (a70[i]) counts.set(t70[i], (counts.get(t70[i]) ?? 0) + 1);
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') REV.set(s, i);
  }
  resetGenSolid();
  flipGenSolid([659, 484, 190, 162, 225, 232], false);
  // 原版 pots 时点推导：Main.cs 默认(TILE_DEFS.solid) 经世界生成期翻转到 cs:18108
  const VAN_FALSE = new Set([659, 484, 190, 162, 225, 232, 192, 481, 482, 483]);
  let bad = 0;
  const rows: string[] = [];
  for (const [sheet, cnt] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const internal = REV.get(sheet);
    if (internal === undefined) { rows.push(`sheet ${sheet}×${cnt} NO-INTERNAL`); bad++; continue; }
    const js = vanGenSolidType(internal);
    const van = VAN_FALSE.has(sheet) ? false : !!TILE_DEFS[internal].solid;
    if (js !== van) { rows.push(`sheet ${sheet}×${cnt}: js=${js} van=${van} <<<`); bad++; }
  }
  console.log(`活性 type 共 ${counts.size} 种，solid 表失配 ${bad}：`);
  console.log(rows.slice(0, 20).join('\n') || '（全一致）');
});

// SW-FX3 一次性：从 /tmp/swfx3-mismatch.json 生成 items.ts PLACE_STYLE_BACKFILL_1458 扩表块
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const j = require('/tmp/swfx3-mismatch.json');

const FAM_META = {
  candle: { tk: 'candle', name: '蜡烛 33' },
  bed: { tk: 'bed', name: '床 79' },
  bench: { tk: 'bench', name: '长凳沙发 89' },
  bookcase: { tk: 'bookcase', name: '书架 101' },
  candelabra: { tk: 'candelabra', name: '烛台 100' },
  chair: { tk: 'chair', name: '椅 15' },
  chandelier: { tk: 'chandelier', name: '吊灯 34' },
  chest: { tk: 'chest', name: '宝箱 21' },
  door_closed: { tk: 'door_closed', name: '门 10' },
  dresser: { tk: 'dresser', name: '梳妆台 88' },
  grandfather_clock: { tk: 'grandfather_clock', name: '座钟 104' },
  lantern: { tk: 'lantern', name: '灯笼 42' },
  piano: { tk: 'piano', name: '钢琴 87' },
  table: { tk: 'table', name: '桌 14' },
  tombstone_v: { tk: 'tombstone_v', name: '墓碑 85' },
  workbench: { tk: 'workbench', name: '工作台 18' },
  bathtub: { tk: 'bathtub', name: '浴缸 90' },
  v_93_lamps: { tk: 'v_93_lamps', name: '灯 93' },
  v_103_bowls: { tk: 'v_103_bowls', name: '碗 103' },
  v_105_statue: { tk: 'v_105_statue', name: '雕像 105' },
  v_13_placed_bottles: { tk: 'v_13_placed_bottles', name: '瓶 13' },
  v_144_timers: { tk: 'v_144_timers', name: '计时器 144' },
  v_172_sinks: { tk: 'v_172_sinks', name: '水槽 172' },
  v_240_wall_hangings_3x3: { tk: 'v_240_wall_hangings_3x3', name: '墙饰 3×3 240' },
  v_242_paintings_6x4: { tk: 'v_242_paintings_6x4', name: '画 6×4 242' },
  v_245_paintings_2x3: { tk: 'v_245_paintings_2x3', name: '画 2×3 245' },
  v_246_paintings_3x2: { tk: 'v_246_paintings_3x2', name: '画 3×2 246' },
  v_337_text_statue: { tk: 'v_337_text_statue', name: '字雕 337' },
  v_376_fishing_crates: { tk: 'v_376_fishing_crates', name: '板条箱 376' },
  v_440_gemlocks: { tk: 'v_440_gemlocks', name: '宝石锁 440' },
  v_441_fakecontainers: { tk: 'v_441_fakecontainers', name: '假容器 441' },
  v_572_souls_in_a_bottle: { tk: 'v_572_souls_in_a_bottle', name: '瓶装魂 572' },
};
const fam = {};
for (const m of j.mismatches) {
  if (m.kind !== 'MISSING') continue;
  if (m.tile === 'v_420_logicgate') continue;   // IIIII234 批已修（并行会话在案）
  (fam[m.tile] ??= []).push({ vid: m.vid, ps: m.goldPs, line: m.goldLine });
}
const out = [];
let total = 0;
for (const tile of Object.keys(fam).sort()) {
  const meta = FAM_META[tile];
  const arr = fam[tile].sort((a, b) => a.vid - b.vid);
  total += arr.length;
  const lines = [...new Set(arr.map((e) => e.line))].sort((a, b) => a - b).map((l) => ':' + l);
  out.push('  // ' + meta.name + '（' + arr.length + ' 件 ' + lines.join('/') + '）');
  const rows = arr.map((e) => '[%V, %T, %P]'.replace('%V', e.vid).replace('%T', "'" + meta.tk + "'").replace('%P', e.ps));
  for (let i = 0; i < rows.length; i += 5) out.push('  ' + rows.slice(i, i + 5).join(', ') + ',');
}
console.log('total entries:', total);
writeFileSync('/tmp/swfx3-block.txt', out.join('\n') + '\n');

// 一次性诊断（nba2 2026-09-02）：crimson 自然邪恶面 L0 分歧的 pass 级二分仪。
// 背景：hm-probe gnat 对（seed 9293480 自然掷→猩红）L0 pre 全通道爆差
//（act=90900 typ=101454…），而强制邪恶面（g 链 EVIL=0 / 12345EVIL1）七链全绿。
// 本仪 = 同 seed 双 flavor（evil=0 强制腐 vs evil=-1 自然掷→猩红）各跑一遍 JS
// generateWorld，在每个 GenProgress.beginVan(pass) 处记：槽名 / 本槽掷数
// （__swOnRoll 计数，观测不消费）。JS 每 pass 头 reseed(gs.seed) ⇒ 两 flavor 的
// 同槽流窗同源 ⇒ 掷数差 = 该槽存在 flavor 分支（首发散点候选）。
// 用法：cd game && npx vitest run tools/_hmbisect.test.ts
process.env.SW_MB_1457 = '1';
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { GenProgress } from '../src/world/gen/GenProgress';
import type { World } from '../src/world/World';

const SEED = '9293480';
const W = 4200, H = 1200;

interface Row { pass: string; rolls: number }

function RUN_FLAG(): boolean { return process.env.SW_HM !== '0'; }

async function runFlavor(evil: -1 | 0): Promise<{ world: World; rows: Row[] }> {
  const rows: Row[] = [];
  let curPass = '(pre-Reset)';
  let rollCount = 0;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prevHook = g.__swOnRoll;
  g.__swOnRoll = () => { rollCount++; };
  const bp = GenProgress.prototype as unknown as { beginVan: (name: string) => void };
  const origBegin = bp.beginVan;
  try {
    bp.beginVan = function (_name: string) {
      rows.push({ pass: curPass, rolls: rollCount });
      curPass = _name;
      rollCount = 0;
    };
    const world = await generateWorld({ width: W, height: H, seedText: SEED, evil });
    rows.push({ pass: curPass, rolls: rollCount });
    return { world, rows };
  } finally {
    bp.beginVan = origBegin;
    g.__swOnRoll = prevHook;
  }
}

(RUN_FLAG() ? it : it.skip)('hmbisect: per-pass roll counts two flavors', async () => {
  const r0 = await runFlavor(0);
  const r1 = await runFlavor(-1);
  const n = Math.max(r0.rows.length, r1.rows.length);
  const lines: string[] = [];
  let firstBad = -1;
  let badCount = 0;
  for (let i = 0; i < n; i++) {
    const a = r0.rows[i], b = r1.rows[i];
    if (!a || !b) { lines.push(`#${String(i).padStart(3, '0')} ? ${a?.pass ?? b?.pass} (单侧缺失)`); continue; }
    const diff = a.rolls !== b.rolls || a.pass !== b.pass;
    if (diff && firstBad < 0) firstBad = i;
    if (diff) badCount++;
    lines.push(
      `#${String(i).padStart(3, '0')} ${diff ? 'X' : ' '} ${a.pass.padEnd(30)} ` +
        `rolls e0=${String(a.rolls).padStart(7)} e-1=${String(b.rolls).padStart(7)}` +
        (diff ? `  Δ=${b.rolls - a.rolls}` : ''),
    );
  }
  lines.push(`\n[rows] e0=${r0.rows.length} e-1=${r1.rows.length}  [first divergent] #${firstBad} ` +
    `${firstBad >= 0 ? r0.rows[firstBad]?.pass : '-'}  [bad slots] ${badCount}`);
  writeFileSync('/tmp/nba2/bisect-passes.txt', lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}, 600000);

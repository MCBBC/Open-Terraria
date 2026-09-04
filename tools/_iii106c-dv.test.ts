// IIII106c：JS 管线 Dunes 段逐掷值流捕获（对拍 rig x86-dunes-values.txt）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';

it('capture JS dunes roll values', async () => {
  const vals: number[] = [];
  let idx = 0;
  let cap = false;
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const o = g.__swOnRoll;
  g.__swOnRoll = (v: number) => { idx++; if (cap) vals.push(v); };
  const marks: Array<[string, number]> = [];
  await generateWorld({
    width: 4200, height: 1200, seedText: '771004', evil: 0 as -1 | 0 | 1,
    seedFlags: { hallowOnTheSurface: true },
    onWorldPartial: (_w, _i, pn) => {
      marks.push([pn, idx]);
      if (pn === '原版地形') { cap = true; idx = 0; vals.length = 0; }
      else if (pn === '沙丘' && cap) { cap = false; }
    },
  });
  g.__swOnRoll = o;
  console.log(`marks: ${marks.slice(0, 4).map((m) => `${m[0]}@${m[1]}`).join(', ')}`);
  console.log(`dunes window values: n=${vals.length}`);
  writeFileSync('/tmp/iii106c-out/js-dunes-values.txt', vals.map((v, i) => `${i + 1} ${v}`).join('\n') + '\n');
}, 900_000);

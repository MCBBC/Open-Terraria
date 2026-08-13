// 一次性诊断：6 种子分布对拍——vanilla 服务器头部 vs oracle terrain 尾值 vs Reset 产物
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

const SEEDS = ['111', '2222', '33333', '444444', '5555555', '777', '9293480'];

it('distribution compare', () => {
  // oracle 结果（/tmp/oracle_batch.txt + 9293480 已知值）
  const oracle: Record<string, string> = {
    '111': 'ws=337 rl=445 id=1750784113 moon=3',
    '2222': 'ws=287 rl=419 id=1361186366 moon=6',
    '33333': 'ws=337 rl=535 id=929679559 moon=2',
    '444444': 'ws=337 rl=493 id=2096503199 moon=6',
    '5555555': 'ws=337 rl=511 id=766136133 moon=3',
    '777': 'ws=337 rl=499 id=1578022958 moon=5',
    '9293480': 'ws=337 rl=475 id=733020316 moon=5',
  };
  for (const s of SEEDS) {
    const path = `/tmp/vserver/s${s}.wld`;
    const w = parseWld(new Uint8Array(readFileSync(path)));
    const o = oracle[s];
    const [ows, orl] = o.match(/ws=(\d+) rl=(\d+)/)!.slice(1, 3).map(Number);
    const oid = Number(o.match(/id=(\d+)/)![1]);
    const omoon = Number(o.match(/moon=(\d+)/)![1]);
    const idOk = w.worldId === oid, moonOk = w.moonType === omoon;
    console.log(
      `seed=${s}: vanilla(ws=${w.groundLevel} rl=${w.rockLevel} id=${w.worldId} moon=${w.moonType}) ` +
      `oracle(ws=${ows} rl=${orl} id=${oid} moon=${omoon}) | idOk=${idOk} moonOk=${moonOk} ` +
      `Δws=${w.groundLevel - ows} Δrl=${w.rockLevel - orl}`,
    );
  }
});

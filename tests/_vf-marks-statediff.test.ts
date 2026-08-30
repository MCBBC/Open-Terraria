// 刮擦诊断(非金标):标注格三方状态差——rig 输入 wld 原始解析 vs 用户现场(store)倾倒。
// 回答:69/69 差是世界状态被编辑过,还是导入/换算域系统性分歧。
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

describe('marks 状态差刮擦', () => {
  it('dump', () => {
    const marks = JSON.parse(readFileSync('/Users/vinlic/Downloads/marks-FTW_V2 (6).json', 'utf8')).marks;
    const key2int: Record<string, number> = {};
    for (const m of marks) {
      key2int[m.typeKey] = m.typeId;
      for (const nb of Object.values(m.neighbors ?? {})) {
        if (nb && (nb as { key?: string }).key) key2int[(nb as { key: string }).key] = -1;
      }
    }
    // 邻居键的内部 id 从用户倾倒反推不了,单独从 map json defs 拿——改用 marks 相邻格自证:
    // 直接解析 wld,与倾倒文件逐格比类型
    const lines = readFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/marks-chain-dump.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
    const mine = new Map<number[], string>();
    for (const line of lines) {
      const p = line.split(',');
      mine.set([+p[0], +p[1]], p[9]);
    }
    // rig wld(in-ftw 与 Downloads 双份都验)
    const wlds: Array<[string, ReturnType<typeof parseWld>]> = [];
    try { wlds.push(['in-ftw', parseWld(new Uint8Array(Buffer.from(readFileSync('/tmp/frame-oracle/in-ftw.wld').toString('base64'), 'base64')))]); } catch { /* 缺文件 */ }
    try { wlds.push(['dl-ftw', parseWld(new Uint8Array(Buffer.from(readFileSync('/Users/vinlic/Downloads/FTW V2.wld').toString('base64'), 'base64')))]); } catch { /* 缺文件 */ }
    for (const [tag, wld] of wlds) {
      let sameType = 0, diffType = 0;
      const samples: string[] = [];
      for (const m of marks) {
        const { x, y } = m;
        const idx = y * wld.tilesWide + x;
        const vt = wld.tiles.active[idx] ? wld.tiles.type[idx] : -1;
        const myRow = [...mine.entries()].find(([k]) => k[0] === x && k[1] === y);
        void myRow;
        // 用户域类型:内部→vanilla 对照表(sand22→53 clay54→40 dirt1→0 stone2→1 cu7→7)
        const vOfInt: Record<number, number> = { 22: 53, 54: 40, 1: 0, 2: 1, 7: 7 };
        const intV = vOfInt[vt];
        // 从我的倾倒拿中心内部类型
        const mineLine = lines.find((l) => l.startsWith(`${x},${y},`))!;
        const mt = +mineLine.split(',')[2];
        if ((mt === 22 ? 53 : mt === 54 ? 40 : mt === 1 ? 0 : mt === 2 ? 1 : mt === 7 ? 7 : -9) === intV) sameType++;
        else { diffType++; if (samples.length < 8) samples.push(`(${x},${y}) mine_t=${mt} wld_t=${intV}(raw ${vt})`); }
      }
      console.log(`[${tag}] centerType same=${sameType} diff=${diffType}`);
      for (const s of samples) console.log('   ', s);
    }
    // 八邻逐格差异(rig 行自带全类型,直接比)
    const rig = new Map<string, number[]>();
    for (const line of readFileSync('tests/golden/rig-ftw-frames.txt', 'utf8').split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const p = line.trim().split(',').map(Number);
      rig.set(`${p[0]},${p[1]}`, [p[3], p[8]]); // type,fn
    }
    const v2iInv: Record<number, number> = { 53: 22, 40: 54, 0: 1, 1: 2, 7: 7 };
    let nbSame = 0, nbDiff = 0;
    const nbSamples: string[] = [];
    for (const m of marks) {
      const rl = lines.find((l) => l.startsWith(`${m.x},${m.y},`));
      if (!rl) continue;
      const nbMine = rl.split(',')[9].split('|').map(Number);
      const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      const wantInt = nbMine.map((t) => (t <= 0 ? t : v2iInv[t] ?? -9));   // vanilla→internal 反查
      let ok = true;
      DIRS.forEach(([dx, dy], di) => {
        const x = m.x + dx, y = m.y + dy;
        const r = rig.get(`${x},${y}`);
        if (!r) return; // 超出 rig 区域的格子不判
        const rigVanilla = r[0];
        if ((rigVanilla === 0 ? 0 : v2iInv[rigVanilla] ?? -9) !== wantInt[di]) ok = false;
      });
      if (ok) nbSame++; else { nbDiff++; if (nbSamples.length < 12) nbSamples.push(`#${m.no} (${m.x},${m.y}) mine=[${nbMine}]`); }
    }
    console.log(`[nb] eightNeighborType same=${nbSame} diff=${nbDiff}`);
    for (const s of nbSamples) console.log('   ', s);
  });
});

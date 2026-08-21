// EEEEEE 诊断（用毕即删）：干净单进程 _oraclesync 同口径对拍（避开同文件导入链测试的
// 中途抛错状态污染——caves-checkpoint 测试在 underworld 断言抛出后 GenSolid 模块态
// 不复位，同进程后续链跑会带上半程翻转态）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chainCheckpoints } from './caves-checkpoint.test';

const cases = [
  { file: '/tmp/caves-sync-9293480.json', seedText: '9293480', evil: 0 as const },
  { file: '/tmp/caves-sync-1511931452.json', seedText: '1511931452', evil: 1 as const },
];
for (const c of cases) {
  it(`clean ${c.seedText}`, () => {
    const golden = JSON.parse(readFileSync(c.file, 'utf8')) as { checkpoints: string[] };
    const gold = new Map<string, string>();
    const goldWall = new Map<string, string>();
    for (const line of golden.checkpoints) {
      const [name, typ, act, wal, liq] = line.split(/[| ]+/);
      gold.set(name, `${typ} ${act} ${liq}`);
      goldWall.set(name, wal);
    }
    const res = chainCheckpoints(c.seedText, c.evil);
    if (c.seedText === '9293480') console.log(`P3HASH corruption ${res.grids.get('corruption')} underworld ${res.grids.get('underworld')}`);
    let green = 0, red = 0, firstBad = '';
    for (const n of gold.keys()) {
      const ok = res.grids.get(n) === gold.get(n);
      if (ok) green++; else { red++; if (!firstBad) firstBad = n; console.log(`BAD ${c.seedText} ${n} ${res.grids.get(n)} vs ${gold.get(n)}`); }
    }
    for (const n of ['desertentrance', 'deserthive', 'desertdone']) {
      const ok = res.walls.get(n) === goldWall.get(n);
      if (ok) green++; else { red++; if (!firstBad) firstBad = `${n}:wall`; }
    }
    console.log(`CLEAN seed ${c.seedText}: green=${green} red=${red} firstBad=${firstBad || '(none)'}`);
  }, 600000);
}

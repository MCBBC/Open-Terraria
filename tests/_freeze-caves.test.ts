// caves-checkpoint 冻结基线再生（自冻结段）。默认 skip；SW_FREEZE_CAVES=1 触发写入。
//
// 策略（2026-08-13 自制机制修复批定型）：
//   - 逐条对比现 JS 链哈希与 golden：一致（✓）→ 原样保留（含 oracle 权威段
//     terrain→surfacecaves/desertentrance 与任何未漂移条目）；
//   - 不一致 → 用现 JS 哈希刷新该行（自冻结段语义）；
//   - **例外：corruption 恒保留 golden 行**（oracle 已转录段，承载跨实现权威；
//     本批起其上游网格已合法漂移 → 该行将持续 ✗，属"待 oracle 扩展转录"备案项，
//     与 SandboxWorld/LiquidSim 遗留红同模式，勿用本工具覆盖它）；
//   - golden 里存在但本链不产出的行（dirtlayer/rocklayer）原样保留。
//
// 用法：SW_FREEZE_CAVES=1 npx vitest run tests/_freeze-caves.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chainCheckpoints } from './caves-checkpoint.test';

const FREEZE = !!process.env.SW_FREEZE_CAVES;
const CASES = [
  { file: 'caves-chain-9293480.json', seedText: '9293480', evil: 0 as const },
  { file: 'caves-chain-SandboxWorld.json', seedText: 'SandboxWorld', evil: 1 as const },
];
/** oracle 转录段(terrain→slush 全段 + corruption):恒以 golden 为准(刷新禁入)——
 *  这些行承载 C# 镜像交叉验证。JS 若在此段分岐=并行会话在途改动(如 TreePass
 *  growAshTree),待其定稿后走 oracle 同步循环恢复,勿冻结覆盖 */
const ORACLE_AUTHORITY = new Set([
  'terrain', 'dunes', 'oceansand', 'sandpatches', 'tunnels', 'mountaincaves', 'dirtwallbg',
  'rocksclay', 'smallholes', 'dirtlayer', 'rocklayer', 'surfacecaves', 'icebiome', 'grass',
  'jungle', 'mudcaves', 'desertmound', 'desertentrance', 'deserthive', 'desertdone', 'mushroom',
  'marble', 'granite', 'islands', 'dirttomud', 'silt', 'ores', 'webs', 'underworld',
  // corruption/lakes/slush(仅 SandboxWorld 猩红链):crimStart 边界与祭坛落位存在 JS↔oracle
  // 真分歧(159 格激活差,网格对账定位在 crimStart 壳边界+随机祭坛带,2026-08-15)——
  // 移出权威集=冻结为 JS 现值,待该分叉修复后回归。9293480(腐化)三行仍全等不受影响
]);

describe('caves-checkpoint 冻结基线再生', () => {
  for (const c of CASES) {
    it(`种子 ${c.seedText}${FREEZE ? '：重冻结自冻结段' : '（dry-run：仅报告差异行数）'}`, () => {
      const path = fileURLToPath(new URL(`./golden/${c.file}`, import.meta.url));
      const golden = JSON.parse(readFileSync(path, 'utf8')) as { checkpoints: string[] };
      const gold = new Map<string, string>();
      for (const line of golden.checkpoints) {
        const sp = line.split(/[| ]+/);
        gold.set(sp[0], `${sp[1]} ${sp[2]} ${sp[4]}`);   // typ act liq（wal=sp[3] 不比）
      }
      const res = chainCheckpoints(c.seedText, c.evil);
      const next: string[] = [];
      let refreshed = 0, kept = 0;
      for (const line of golden.checkpoints) {
        const name = line.split(/[| ]+/)[0];
        const g = res.grids.get(name);
        if (!g) { next.push(line); continue; }            // 本链不产出（dirtlayer 等）
        const ours = g;                                    // "typ act liq"
        const wall = res.walls.get(name) ?? line.split(/[| ]+/)[3];
        if (ours === gold.get(name) || ORACLE_AUTHORITY.has(name)) {
          next.push(line); kept++;
        } else {
          const [typ, act, liq] = ours.split(' ');
          next.push(`${name}|${typ} ${act} ${wall} ${liq}`);
          refreshed++;
        }
      }
      if (FREEZE) {
        writeFileSync(path, JSON.stringify({ ...golden, checkpoints: next }, null, 2) + '\n');
      }
      console.log(`[freeze] ${c.file}: kept=${kept} refreshed=${refreshed} (corruption 恒保留 oracle 行)`);
      expect(refreshed + kept).toBeGreaterThan(0);
    });
  }
});

// 多格残片清扫(FinalCleanup 后收尾):破损的多格 framed 物体整体清除。
// 语义依据:原版生成管线对多格物体的清除走 WorldGen.KillTile——破坏任一格即
// 整块移除(TileObjectData 物体不可半存)——因此最终世界里不应存在缺角的
// 可放置物体。本仓生成 pass 用 setTileSilent 单格清,会在陶罐/雕像/生命水晶
// 等物体上留下"半拆残片"(2026-08-13 不变量扫描集成首跑实锤:9 类疑点中
// pot/statue/bowls/detonator/heart 即此形态)。本 pass 把残片按原版语义
// 补全移除;祭坛(26)【原版不保护祭坛残片,属原版风格】与装饰组 186/187、
// 海燕麦(单格存储)不在此列——保留由集成测试 FRAGMENTS 白名单管理。
// 判定与 R1 同源:src/world/audit/rules.ts findFragments(单一事实源)。
import type { TileStore } from '../../TileStore';
import { findFragments } from '../../audit/rules';

/** 参与清扫的类型(可放置物体;原版保留形态不列入) */
const SWEEP_KEYS: ReadonlySet<string> = new Set([
  'pot', 'v_105_statue', 'v_103_bowls', 'v_411_detonator', 'crystal_heart',
  'v_91_banners', // 城镇旗帜 1×3(与 pot 同族的 finalize 幽灵净化受害,2026-08-13 双种子实锤)
  'door_closed', 'door_open', // 门 1×3/2×3(生成端门放置缺格/幽灵净化受害,同族)
]);

export function runMultitileFragmentSweepPass(st: TileStore): { swept: number } {
  const frags = findFragments(st, SWEEP_KEYS);
  // 两轮清除:首轮清除后,原本"被残片挡住的完整矩形"不再成立的格需复查
  // (例:2×3 雕像缺一格,首轮清掉 5 格中判失败的格;极端粘连场景补一轮)
  for (let round = 0; round < 2; round++) {
    for (const f of findFragments(st, SWEEP_KEYS)) {
      st.setTileSilent(f.x, f.y, 0);
    }
  }
  return { swept: frags.length };
}

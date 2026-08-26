// 多格残片清扫(FinalCleanup 后收尾,含 finalize 后的终扫兜底):破损的多格
// framed 物体整体清除。语义依据:原版生成管线对多格物体的清除走 WorldGen.KillTile
// ——破坏任一格即整块移除(TileObjectData 物体不可半存)——最终世界里不应存在
// 缺角的可放置物体。本仓生成 pass 用 setTileSilent 单格清,会在陶罐/雕像/门/
// 旗帜/熔炉/铁砧等物体上留下"半拆残片"(2026-08-13 不变量扫描集成首跑实锤)。
//
// ★通用式(2026-08-13 收口):清扫【全部】多格 framed 残片,仅豁免下列"原版
//   保留形态"——枚举式白名单在并行会话持续新增家具时追不上(曾逐个补
//   pot/statue/banner/door/anvil/furnace/bewitching_table/wall_hangings…)。
//   豁免表与集成测试 FRAGMENTS 白名单同源;新类型出现残片=自动清扫,
//   若属合法半存形态,集成 unknown 断言会拦下人工裁决。
//   ★TTTTTTT（2026-08-26）新豁免支「他物覆写孤儿」：缺角被【其他活性物】覆写
//   的组不算残片——vanilla 对多格物的清除只走 KillTile 级联（TileFrame 重访），
//   FinalCleanup 落体柱生长经 tileCut 门【直写】覆写陶罐列后，邻列残罐永无
//   重访即存活（const/s22222 链 #105 (1800,343)/(1800,344) 半罐 x86 实证存活,
//   本仓曾扫杀=2 格假债）。空格/非活性缺格仍是真残片（本仓单格清写遗留）。
// 判定与 R1 同源:src/world/audit/rules.ts findFragments(单一事实源)。
import type { TileStore } from '../../TileStore';
import { findFragments } from '../../audit/rules';

/** 原版保留形态(不参与清扫;与集成测试 FRAGMENTS 白名单同源) */
const KEEP_KEYS: ReadonlySet<string> = new Set([
  'v_26_altars',             // 原版不保护祭坛残片(altar-fragment-fix,属原版风格)
  'v_529_sea_oats',          // 原版单格写入(cs:58333)
  // ★186/187 曾以"多带表帧语义"豁免——那是 R2 帧重复检测的理由(贴图带宽),
  //   不是 R1 几何缺角的理由;放置恒 3×2,缺角=真残片。2026-08-14 用户
  //   debug-report 实锤:17 格中 11 格残片(两组仅顶行/一组底行缺 1 格)
]);

export function runMultitileFragmentSweepPass(st: TileStore): { swept: number } {
  const frags = findFragments(st);
  let swept = 0;
  for (const f of frags) {
    if (KEEP_KEYS.has(f.key)) continue;
    st.setTileSilent(f.x, f.y, 0);
    swept++;
  }
  return { swept };
}

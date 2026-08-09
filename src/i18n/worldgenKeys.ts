// 世界生成 pass 名（world/gen/vanilla/* 的 pass key）→ LegacyWorldGen 条目 id。
// 对齐依据：Terarria1405/WorldGen.cs 各 pass 内 progress.Message = Lang.gen[N] 的设置点，
// 与本仓库 105 pass 移植清单（docs/vanilla-worldgen-passes）逐条人工核对。
// 未知 pass 回退使用 pass 中文名，后续补表。
export const worldgenProgressKey: Record<string, number> = {
  // 地形
  terrain: 0,                 // "Generating world"（总标题，pass 级无直接对应，占位）
  contourTerrain: 1,          // 沙滩沙地
  // 洞穴与通道
  carveCaves: 5,              // 挖掘洞穴（对齐原版 Caves pass 附近文案，后续细调）
  carveTunnels: 5,
  // 水体沉降（本仓库自有）
  settleLiquids: -1,
};

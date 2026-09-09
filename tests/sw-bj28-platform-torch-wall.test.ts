import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { TileStore } from '../src/world/TileStore';
import {
  torchAnchorFrame, torchStillAnchored, torchReanchorFrame, platformProperTopFrame, topEdgeCanBeAttachedTo,
  NO_ATTACH_SHEETS, IS_BEAM_SHEETS, IS_A_TREE_TRUNK_SHEETS, NOT_REALLY_SOLID_SHEETS,
  PLATFORM_SHEETS,
} from '../src/world/Torch';
import { TILE_NO_ATTACH_SHEETS } from '../src/player/SmartCursor';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

// SW-BJ28 2026-09-08（用户实报×2）回归面：
// 症状一「平台放不了火把」——火把放置/重锚定按原版 legacy 路重写（TileObject.CanPlace 误建模
// 退役）：原版火把不走 TileObject.CanPlace（Player.cs:40084 显式排除 tile 4），走
// AssortedThings Torches 支（:41435-41485）+ PlaceTile case 4（WorldGen.cs:60289-60345）
// + TileFrame 重锚定（:87413-87461）。平台底锚 = (Platforms∧TopEdgeCanBeAttachedTo)。
// 症状二「单向墙」——采纳解读 (b)/(d)：平台单向通行语义（上穿/顶站/下穿/横穿），
// 真机探针 scripts/_bj28-platform-torch-probe.mjs 全绿（feet=126 站顶/dropped/横穿 passed）；
// 本文件锁 TileStore.isPlatform 单向可站面 + 致动位语义（候选 (c) 的仓库面）。
const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
const PLAT = T.PLATFORM;
const STONE = T.STONE;
const TORCH = T.TORCH;
const DOOR = T.DOOR_CLOSED;                       // sheet 10 = NotReallySolid ∧ noAttach
const PLANTER = TILE_BY_KEY['v_380_planter_boxes']; // sheet 380（tileSolid+solidTop,底锚 carve）
const OREBARS = TILE_BY_KEY['v_239_ore_bars'];     // sheet 239（tileSolid+solidTop,非 Platforms）
const TEPLAT = TILE_BY_KEY['v_427_red_team_platform']; // sheet 427（Platforms 全集）

function mkStore(w = 12, h = 12): TileStore {
  return new TileStore(w, h);
}

describe('SW-BJ28 症状一：火把×平台放置（torchAnchorFrame = PlaceTile case 4 1:1）', () => {
  it('平台上放置：下方平台（ProperTopFrame 档）→ frameX 0（用户实报主症状,原版 :60326 平台臂）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);            // frameX 0 → n=0 ∈ {0-7} 可附着
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
  });

  it('团队平台 427 同臂（Platforms 全集 {19,427,435-439}）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, TEPLAT, 0, 0);
    expect(sheetOf(TEPLAT)).toBe(427);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
  });

  it('TopEdge 的 PlatformProperTopFrame 门只束 topSloped 平台（:70918 `!topSlope()∨(Platforms∧ProperTopFrame)` 短路）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 180, 0);          // 平坡（slope=0）：frameX 不检查 → 可附着
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
    st.setTileSilent(5, 6, PLAT, 180, 0);
    st.setSlope(5, 6, 1);                          // topSlope 平台 + 斜坡连接档（n=10）→ 拒
    expect(platformProperTopFrame(180)).toBe(false);
    expect(torchAnchorFrame(st, 5, 5)).toBe(-1);
    st.setTileSilent(5, 6, PLAT, 234, 0);          // topSlope 平台 + n=13 ∈ 12-16 → 可
    st.setSlope(5, 6, 1);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
    st.setTileSilent(5, 6, PLAT, 450, 0);          // n=25 ∈ 25-26 → 可
    st.setSlope(5, 6, 1);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
  });

  it('已致动平台不可作底锚（TopEdge !inActive）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.wire[st.idx(5, 6)] |= TileStore.WIRE_ACTUATED;
    expect(torchAnchorFrame(st, 5, 5)).toBe(-1);
  });

  it('半砖平台不可作底锚（TopEdge !halfBrick）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.half[st.idx(5, 6)] = 1;
    expect(torchAnchorFrame(st, 5, 5)).toBe(-1);
  });

  it('贴平台侧（左/右邻）→ 拒（平台 tileSolidTop+noAttach,原版无侧锚,两种几何之一）', () => {
    const st = mkStore();
    st.setTileSilent(5, 5, PLAT, 0, 0);
    expect(torchAnchorFrame(st, 6, 5)).toBe(-1);   // 左邻平台
    expect(torchAnchorFrame(st, 4, 5)).toBe(-1);   // 右邻平台
  });

  it('普通实心底/左/右锚保持原语义（对照不变面）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, STONE, 0, 0);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
    const st2 = mkStore();
    st2.setTileSilent(4, 5, STONE, 0, 0);
    expect(torchAnchorFrame(st2, 5, 5)).toBe(22);
    const st3 = mkStore();
    st3.setTileSilent(6, 5, STONE, 0, 0);
    expect(torchAnchorFrame(st3, 5, 5)).toBe(44);
  });

  it('坡块/半砖下方 → 拒（PlaceTile normalArm slope==0/!halfBrick;拍平前置在 Game.tryPlace 火把支）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, STONE, 0, 0);
    st.setSlope(5, 6, 1);
    expect(torchAnchorFrame(st, 5, 5)).toBe(-1);
    const st2 = mkStore();
    st2.setTileSilent(5, 6, STONE, 0, 0);
    st2.half[st2.idx(5, 6)] = 1;
    expect(torchAnchorFrame(st2, 5, 5)).toBe(-1);
  });

  it('门（NotReallySolid 10）下方 → 拒（:60326 !NotReallySolid 排除）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, DOOR, 0, 0);
    expect(sheetOf(DOOR)).toBe(10);
    expect(torchAnchorFrame(st, 5, 5)).toBe(-1);
  });

  it('种植箱 380 下方 → 可（:60326 `(380∧slope==0)` carve）；矿锭 239 → 拐（非 Platforms 无 carve）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLANTER, 0, 0);
    expect(sheetOf(PLANTER)).toBe(380);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
    const st2 = mkStore();
    st2.setTileSilent(5, 6, OREBARS, 0, 0);
    expect(sheetOf(OREBARS)).toBe(239);
    expect(torchAnchorFrame(st2, 5, 5)).toBe(-1);
  });

  it('墙锚兜底仍在（wall>0 → 0,优先级底>左>右>墙）', () => {
    const st = mkStore();
    st.setWallSilent(5, 5, 1);
    expect(torchAnchorFrame(st, 5, 5)).toBe(0);
    st.setTileSilent(4, 5, STONE, 0, 0);           // 左锚优先于墙（TileFrame 帧序）
    expect(torchAnchorFrame(st, 5, 5)).toBe(22);
  });

  it('梁木（IsBeam）侧锚单格可依；孤树干不可（需三格连续）,三连树干可', () => {
    const st = mkStore();
    const beam = TILE_BY_KEY['v_124_wooden_beam']; // IsBeam sheet 124
    st.setTileSilent(4, 5, beam, 0, 0);
    expect(torchAnchorFrame(st, 5, 5)).toBe(22);
    const st2 = mkStore();
    const tree = TILE_BY_KEY['tree'];              // sheet 5 IsATreeTrunk
    st2.setTileSilent(4, 5, tree, 0, 0);
    expect(torchAnchorFrame(st2, 5, 5)).toBe(-1);  // 上/下无树干=三连断
    st2.setTileSilent(4, 4, tree, 0, 0);
    st2.setTileSilent(4, 6, tree, 0, 0);
    expect(torchAnchorFrame(st2, 5, 5)).toBe(22);
  });
});

describe('SW-BJ28 症状一：平台上火把失撑判定（torchStillAnchored = TileFrame 火把支）', () => {
  it('直立火把底锚=平台 → 成立（平台臂,与放置同源）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.setTileSilent(5, 5, TORCH, 0, 0);
    expect(torchStillAnchored(st, 5, 5, 0)).toBe(true);
    st.setTileSilent(5, 6, 0, 0, 0);               // 平台挖除 → 失撑
    expect(torchStillAnchored(st, 5, 5, 0)).toBe(false);
  });

  it('直立火把底锚=平台但已致动 → 仍成立（★SW-RB8a 翻案:num2 门 :87413 是并集——第二支 !halfBrick∧!topSlope 不查 inActive,致动平台照样托炬;旧单支 TopEdge 判=误杀）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.setTileSilent(5, 5, TORCH, 0, 0);
    st.wire[st.idx(5, 6)] |= TileStore.WIRE_ACTUATED;
    expect(torchStillAnchored(st, 5, 5, 0)).toBe(true);
  });

  it('未点燃变体（+66）剥偏移后同判（66/88/110 三档）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.setTileSilent(5, 5, TORCH, 0, 0);
    expect(torchStillAnchored(st, 5, 5, 66)).toBe(true);   // 0+66 底锚
    const st2 = mkStore();
    st2.setTileSilent(4, 5, PLAT, 0, 0);
    expect(torchStillAnchored(st2, 5, 5, 88)).toBe(false); // 22+66 侧锚对平台=失撑
  });

  it('底锚坡块（非平台 slope 3/4=bottomSlope 容忍,slope 1/2=topSlope 拒）——TileFrame :87413 字面', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, STONE, 0, 0);
    st.setTileSilent(5, 5, TORCH, 0, 0);
    st.setSlope(5, 6, 3);                          // bottomSlope → num2 定义仍成立
    expect(torchStillAnchored(st, 5, 5, 0)).toBe(true);
    st.setSlope(5, 6, 1);                          // topSlope → num2 定义失败
    expect(torchStillAnchored(st, 5, 5, 0)).toBe(false);
  });
});

describe('SW-BJ28 症状二：平台单向通行面（isPlatform=可站/致动不可站）', () => {
  it('平台可站（单向面）,横穿/上穿/下穿真机探针全绿（scripts/_bj28-platform-torch-probe.mjs）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    expect(st.isPlatform(5, 6)).toBe(true);
    expect(st.isSolid(5, 6)).toBe(false);          // 平台≠实心（单向语义数据面）
  });

  it('致动平台不可站但保留 tile（原版 nactive/inActive 语义,候选 (c) 仓库面）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, PLAT, 0, 0);
    st.wire[st.idx(5, 6)] |= TileStore.WIRE_ACTUATED;
    expect(st.isPlatform(5, 6)).toBe(false);
    expect(st.hasTile(5, 6)).toBe(true);
    expect(st.isActive(5, 6)).toBe(false);
  });

  it('团队平台 427 可站（平台行为族,frameY 无关档）', () => {
    const st = mkStore();
    st.setTileSilent(5, 6, TEPLAT, 0, 0);
    expect(st.isPlatform(5, 6)).toBe(true);
  });
});

describe('SW-BJ28 结构锁：火把域旗表与 SmartCursor 单源副本恒等（漂移即爆红）', () => {
  it('NO_ATTACH_SHEETS ≡ SmartCursor.TILE_NO_ATTACH_SHEETS', () => {
    expect(NO_ATTACH_SHEETS).toEqual(TILE_NO_ATTACH_SHEETS);
  });

  it('表值与 1457 反编译行号锚一致（TileID.cs:161/:239/:359/:243）', () => {
    expect([...IS_A_TREE_TRUNK_SHEETS].sort((a, b) => a - b))
      .toEqual([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
    expect([...IS_BEAM_SHEETS].sort((a, b) => a - b)).toEqual([124, 561, 574, 575, 576, 577, 578]);
    expect([...NOT_REALLY_SOLID_SHEETS].sort((a, b) => a - b)).toEqual([10, 387, 388]);
    expect([...PLATFORM_SHEETS].sort((a, b) => a - b)).toEqual([19, 427, 435, 436, 437, 438, 439]);
  });
});

describe('SW-BJ28 topEdgeCanBeAttachedTo（TopEdge 1:1 行为面）', () => {
  it('域外=false（GetTileSafely 空砖）；空格=false；实心=true（tileSolid∨solidTop）', () => {
    const st = mkStore();
    expect(topEdgeCanBeAttachedTo(st, -1, -1)).toBe(false);
    expect(topEdgeCanBeAttachedTo(st, 5, 6)).toBe(false);
    st.setTileSilent(5, 6, STONE, 0, 0);
    expect(topEdgeCanBeAttachedTo(st, 5, 6)).toBe(true);
  });
});

// ═══════════ SW-RB8a 2026-09-08 红蓝对抗审计补面（TileFrame 存活/重锚 1:1） ═══════════
describe('SW-RB8a 存活判定翻案：TileFrame 四臂全空才杀（:87441-87459),档位不影响存活', () => {
  it('左锚火把左边被挖、底锚仍在 → 活（原版 TileFrame 重选底臂）；旧档位单臂判=误掉', () => {
    const st = mkStore();
    st.setTileSilent(4, 5, STONE, 0, 0);   // 左锚
    st.setTileSilent(5, 6, STONE, 0, 0);   // 底锚
    st.setTileSilent(5, 5, TORCH, 22, 0);
    expect(torchStillAnchored(st, 5, 5, 22)).toBe(true);
    st.setTileSilent(4, 5, 0, 0, 0);       // 左边被挖
    expect(torchStillAnchored(st, 5, 5, 22)).toBe(true);   // ★旧码 false=火烧已放火把
  });

  it('重锚帧序（torchReanchorFrame = :87440-87459 优先序）：底>左>右>墙;未点燃偏移由调用域加回', () => {
    const st = mkStore();
    st.setTileSilent(4, 5, STONE, 0, 0);
    st.setTileSilent(6, 5, STONE, 0, 0);
    st.setTileSilent(5, 6, STONE, 0, 0);
    st.setWallSilent(5, 5, 1);
    expect(torchReanchorFrame(st, 5, 5)).toBe(0);          // 底锚最优先
    st.setTileSilent(5, 6, 0, 0, 0);
    expect(torchReanchorFrame(st, 5, 5)).toBe(22);         // 左
    st.setTileSilent(4, 5, 0, 0, 0);
    expect(torchReanchorFrame(st, 5, 5)).toBe(44);         // 右
    st.setTileSilent(6, 5, 0, 0, 0);
    expect(torchReanchorFrame(st, 5, 5)).toBe(0);          // 墙（帧值同为 0）
    st.setWallSilent(5, 5, 0);
    expect(torchReanchorFrame(st, 5, 5)).toBe(-1);         // 全空 → KillTile 面
  });

  it('侧锚树干对角 active 门（:87425-87440 tree 族 active() 才赋值）：上邻幽灵残型不算三连', () => {
    const st = mkStore();
    const tree = TILE_BY_KEY['tree'];
    st.setTileSilent(4, 5, tree, 0, 0);    // 左邻干
    st.setTileSilent(4, 4, tree, 0, 0);    // 左上干
    st.setTileSilent(4, 6, tree, 0, 0);    // 左下干
    st.setTileSilent(5, 5, TORCH, 22, 0);
    expect(torchStillAnchored(st, 5, 5, 22)).toBe(true);
    st.flags[st.idx(4, 4)] = 0;            // 左上成幽灵残型（type 留位 flags=0,原版 active(false) 残型面）
    expect(st.type[st.idx(4, 4)]).not.toBe(0);
    expect(torchStillAnchored(st, 5, 5, 22)).toBe(false);  // ★旧裸 type 读=该掉不掉
  });
});

describe('SW-RB8a checkTorchDetach（Game 消费域）：重锚写帧+未点燃偏移保持+3×3 触发面', () => {
  function gameShell(st: TileStore): Record<string, any> {
    const g = Object.create(Game.prototype) as unknown as Record<string, any>;
    g.world = { store: st };
    g.chunks = { markDirtyArea: () => {} };
    g.spawnDrop = () => {};
    g.sfx = { play: () => {} };
    return g;
  }

  it('左锚失撑但底锚在 → 重锚直立（frameX 22→0,原版 TileFrame 重写帧面）', () => {
    const st = mkStore();
    st.setTileSilent(4, 5, STONE, 0, 0);
    st.setTileSilent(5, 6, STONE, 0, 0);
    st.setTileSilent(5, 5, TORCH, 22, 0);
    const g = gameShell(st);
    (g as unknown as { checkTorchDetach: (x: number, y: number) => void }).checkTorchDetach(4, 5);
    expect(st.type[st.idx(5, 5)]).toBe(TORCH);
    expect(st.frameX[st.idx(5, 5)]).toBe(0);
  });

  it('未点燃火把（+66）重锚后偏移保持（TileFrame :87397-87401 num 剥离/回填）', () => {
    const st = mkStore();
    st.setTileSilent(6, 6, STONE, 0, 0);   // 底锚
    st.setTileSilent(7, 5, STONE, 0, 0);   // 右锚
    st.setTileSilent(6, 5, TORCH, 88, 0);  // 44+66 未点燃右锚
    const g = gameShell(st);
    (g as unknown as { checkTorchDetach: (x: number, y: number) => void }).checkTorchDetach(7, 5);
    expect(st.type[st.idx(6, 5)]).toBe(TORCH);
    expect(st.frameX[st.idx(6, 5)]).toBe(66);   // 重锚到底(0)+未点燃 66
  });

  it('对角触发面（SquareTileFrame :81462-81473 3×3）：挖左上树干 → 左锚三连断 → 火把掉', () => {
    const st = mkStore();
    const tree = TILE_BY_KEY['tree'];
    st.setTileSilent(4, 4, tree, 0, 0);
    st.setTileSilent(4, 5, tree, 0, 0);
    st.setTileSilent(4, 6, tree, 0, 0);
    st.setTileSilent(5, 5, TORCH, 22, 0);
    const g = gameShell(st);
    st.setTileSilent(4, 4, 0, 0, 0);       // 挖左上干（对角格,旧十字触发面够不到）
    (g as unknown as { checkTorchDetach: (x: number, y: number) => void }).checkTorchDetach(4, 4);
    expect(st.type[st.idx(5, 5)]).toBe(0); // 三连断且无他臂 → 掉
  });
});

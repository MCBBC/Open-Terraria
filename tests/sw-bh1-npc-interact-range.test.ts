// SW-BH1 2026-09-06 NPC 交互范围比原版短（用户实报：玩家站楼下、NPC 在楼上，右键无反应）
//
// 原版全链（1457 反编译，1458 增量同值——Main.cs HoverOverNPCs 43721 / Player.cs 27696）：
//   ①距离门 = TileReachCheckSettings.Simple.GetWorldRegion(player)（TileReachCheckSettings.cs:70-85）
//     ∩ NPC 命中盒（Main.cs:43718 worldRegion + :43778 worldRegion.Intersects(value2)）
//     ——玩家命中盒 tile 外扩 tileRangeX=5（Player.cs:2475）/ tileRangeY=3（:2477）的
//     【矩形】×16（HX/HY 尾格 +15），非圆形距离；
//   ②悬停门 = 鼠标 1×1 世界矩形（Main.cs:43597-43599 MouseScreen+screenPosition）
//     ∩ NPC 绘制帧盒（Main.cs:43729 (Bottom.X−frame.W/2, Bottom.Y−frame.H, frame.W, frame.H)）；
//   ③对话保持 = 同一 worldRegion ∩ 命中盒出界/chest!=-1/!active/tileEntityAnchor.InUse
//     → SetTalkNPC(-1)（Player.cs:27698-27709）。
//
// 仓库偏差（修复前）：①=3.5 格半径圆（56px）②=命中盒 ±8px+tile 中心量化 ③=6 格圆（96px）。
// 5/3 矩形半宽 ~90px/半高 ~84px、对角 ~123px——楼下够不着楼上 NPC 即 ①之根。
//
// 参照几何（本测试玩家桩 x=160,y=160,w=20,h=42，tileReach 默认 5/3）：
//   tile 区 LX=5, HX=16, LY=7, HY=15 → 世界盒 x∈[80,271] y∈[112,255]（XNA 严格相交）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';

type AnyGame = Record<string, any>;

/** Game 原型桩（无构造器副作用；字段按测试面注入——achievements-trigger-surface 同法） */
function stubGame(playerBox = { x: 160, y: 160, w: 20, h: 42 }): AnyGame {
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    ...playerBox,
    cx: playerBox.x + playerBox.w / 2,
    cy: playerBox.y + playerBox.h / 2,
    equipStats: { tileRange: false, toolboxRange: 0 },
  };
  g.world = { isJourney: false };
  g.entities = { enemies: [], npcs: [] };
  g.renderer = { atlas: null };
  g.openChestRef = () => null;
  return g;
}

/** 射程盒参考值（tileReach 5/3 的像素化结果） */
const REGION = { lx: 80, ly: 112, rx: 271, by: 255 };

describe('SW-BH1 ① 交谈距离门 = worldRegion ∩ NPC 命中盒（TileReachCheckSettings.cs:70-85）', () => {
  it('同格重叠在射程内', () => {
    const g = stubGame();
    expect((g as any).worldRegionIntersects(160, 160, 20, 42)).toBe(true);
  });

  it('水平边界：右缘像素 270 收 / 271 拒，左缘 80 收 / 79 拒（XNA 严格相交，右尾 −1px 原版同款）', () => {
    const g = stubGame();
    expect((g as any).worldRegionIntersects(REGION.rx - 1, 160, 1, 1)).toBe(true);   // x=270
    expect((g as any).worldRegionIntersects(REGION.rx, 160, 1, 1)).toBe(false);      // x=271
    expect((g as any).worldRegionIntersects(REGION.lx, 160, 1, 1)).toBe(true);       // x=80
    expect((g as any).worldRegionIntersects(REGION.lx - 1, 160, 1, 1)).toBe(false);  // x=79
  });

  it('垂直边界：下缘同款（Region.by=255 严格）', () => {
    const g = stubGame();
    expect((g as any).worldRegionIntersects(160, REGION.by - 1, 1, 1)).toBe(true);   // y=254
    expect((g as any).worldRegionIntersects(160, REGION.by, 1, 1)).toBe(false);      // y=255
  });

  it('★穿楼层（用户实报场景）：玩家楼下、NPC 踩头顶贴邻楼板上，旧 3.5 格圆拒、原版矩形收', () => {
    const g = stubGame();
    // 玩家头 tile 行 10（y=160），NPC 踩行 9 板顶（feet y=144，盒 102..144）：
    // 中心距 |123−181|=58px > 56px（旧门拒——差 2px 就够不着）
    const npc = { x: 160, y: 144 - 42, w: 20, h: 42 };
    const oldCircle = Math.hypot(
      (npc.x + npc.w / 2) - (160 + 10), (npc.y + npc.h / 2) - (160 + 21),
    ) > TILE * 3.5;
    expect(oldCircle).toBe(true);                                                    // 复现旧病
    expect((g as any).worldRegionIntersects(npc.x, npc.y, npc.w, npc.h)).toBe(true); // 原版收
    // 板再抬 1 行（feet y=128，行 8）：原版仍收（区域顶 112 < 128）
    expect((g as any).worldRegionIntersects(160, 128 - 42, 20, 42)).toBe(true);
  });

  it('垂直上界：NPC 脚 y=112 出射程 / y=113 收（区域顶=头 tile 顶上方 3 格）——原版同样够不着', () => {
    const g = stubGame();
    expect((g as any).worldRegionIntersects(160, 112 - 42, 20, 42)).toBe(false);
    expect((g as any).worldRegionIntersects(160, 113 - 42, 20, 42)).toBe(true);      // 脚再落 1px 即收
  });

  it('对角远点：圆外矩形内（old 123.8px > 56px）', () => {
    const g = stubGame();
    const oldCircle = Math.hypot(270.5 - 170, 254.5 - 181) > TILE * 3.5;
    expect(oldCircle).toBe(true);
    expect((g as any).worldRegionIntersects(270, 254, 1, 1)).toBe(true);
    expect((g as any).worldRegionIntersects(400, 400, 1, 1)).toBe(false);
  });

  it('tileReach 侧接入是活的：射程配饰（tileRange）+3/+2 → 上探多 2 格（Main.cs:43718 同源）', () => {
    const g = stubGame();
    const npc = { x: 160, y: 81 - 42, w: 20, h: 42 };   // 默认射程外（脚 y=81 ≤ 区域顶 112）
    expect((g as any).worldRegionIntersects(npc.x, npc.y, npc.w, npc.h)).toBe(false);
    g.player.equipStats.tileRange = true;               // → x=8/y=5：rly=80
    expect((g as any).worldRegionIntersects(npc.x, npc.y, npc.w, npc.h)).toBe(true);
  });
});

describe('SW-BH1 ② 悬停盒 = 绘制帧盒（Main.cs:43729）+ 精确光标（:43597-43599）', () => {
  it('atlas 未就绪 → 回退旧 ±8px 盒（逐字旧语义 x−8..x+w+8 / y−8..y+h+8）', () => {
    const g = stubGame();
    // 盒 [92,128)×[92,150)
    expect((g as any).npcHoverHit(22, 92, 92, 100, 100, 20, 42)).toBe(true);
    expect((g as any).npcHoverHit(22, 127, 149, 100, 100, 20, 42)).toBe(true);
    expect((g as any).npcHoverHit(22, 91, 92, 100, 100, 20, 42)).toBe(false);
    expect((g as any).npcHoverHit(22, 128, 149, 100, 100, 20, 42)).toBe(false);
    expect((g as any).npcHoverHit(22, 127, 150, 100, 100, 20, 42)).toBe(false);
  });

  it('atlas 实载帧盒 40×56（Guide 条带）：头/两侧超出命中盒、止于脚下', () => {
    const g = stubGame();
    g.renderer = { atlas: { vnpc: () => ({ sw: 40, sh: 56 }) } };
    // 帧盒 [90,130)×[86,142)：脚下 = 命中盒底（142），头超命中盒顶 14px
    expect((g as any).npcHoverHit(22, 90, 86, 100, 100, 20, 42)).toBe(true);
    expect((g as any).npcHoverHit(22, 129, 141, 100, 100, 20, 42)).toBe(true);
    expect((g as any).npcHoverHit(22, 89, 141, 100, 100, 20, 42)).toBe(false);   // 左出 1px
    expect((g as any).npcHoverHit(22, 129, 142, 100, 100, 20, 42)).toBe(false);  // 脚下 1px（旧 ±8 盒此处会收）
    expect((g as any).npcHoverHit(22, 129, 85, 100, 100, 20, 42)).toBe(false);   // 头顶出 1px
  });
});

describe('SW-BH1 ③ talkToNearbyNpc 端到端（距离门 ∧ 悬停门）', () => {
  it('射程内+光标在帧盒上 → 开对话；光标离体 → 不开', () => {
    const g = stubGame();
    const npc = { vanillaId: 22, x: 160, y: 160, w: 20, h: 42, bound: false };
    g.entities.npcs = [npc];
    const opened: unknown[] = [];
    g.openNpcDialog = (n: unknown) => { opened.push(n); };
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(true);
    expect(opened).toEqual([npc]);
    expect((g as any).talkToNearbyNpc(170, 300)).toBe(false);
    expect(opened).toHaveLength(1);
  });

  it('精确像素边角命中（旧 tile 中心量化 ±8px 粒度）', () => {
    const g = stubGame();
    const npc = { vanillaId: 22, x: 160, y: 160, w: 20, h: 42, bound: false };
    g.entities.npcs = [npc];
    g.openNpcDialog = () => {};
    // 帧盒回退档 [152,188)×[152,210)——精确像素点击直读,不再有 tile 中心 ±8px 粒度:
    expect((g as any).talkToNearbyNpc(152, 152)).toBe(true);
    expect((g as any).talkToNearbyNpc(187, 209)).toBe(true);
    expect((g as any).talkToNearbyNpc(188, 209)).toBe(false);
  });

  it('★射程外不响应：楼上再高 1 格（脚 y=112 压区域顶），光标正钉 NPC 中心也拒（与原版一致）', () => {
    const g = stubGame();
    const npc = { vanillaId: 22, x: 160, y: 112 - 42, w: 20, h: 42, bound: false };
    g.entities.npcs = [npc];
    g.openNpcDialog = () => {};
    expect((g as any).talkToNearbyNpc(npc.x + 10, npc.y + 21)).toBe(false);
  });

  it('bound 待救援 NPC：同门内右键走解救支（Main.cs:43775 族 105/106/123/354/589）', () => {
    const g = stubGame();
    const npc = { vanillaId: 105, x: 160, y: 160, w: 20, h: 42, bound: true };
    g.entities.npcs = [npc];
    let freed = 0;
    g.freeBoundNpc = () => { freed++; };
    g.openNpcDialog = () => {};
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(true);
    expect(freed).toBe(1);
  });

  it('敌怪桶 bound 形态（376 睡渔夫）同门（Main.cs:43775 族 376/579）', () => {
    const g = stubGame();
    const e = Object.create(Enemy.prototype) as AnyGame;
    e.vanillaId = 376; e.dead = false;
    e.x = 160; e.y = 144 - 42; e.w = 20; e.h = 42;         // 穿楼层位（踩行 9 板顶）
    g.entities.enemies = [e];
    const woken: Array<[unknown, string]> = [];
    g.wakeBoundEnemyNpc = (en: unknown, key: string) => { woken.push([en, key]); };
    expect((g as any).talkToNearbyNpc(170, 120)).toBe(true);
    expect(woken).toEqual([[e, 'angler']]);
  });

  it('非桶敌怪/死亡桶/射程外桶不触发', () => {
    const g = stubGame();
    const mk = (vanillaId: number) => {
      const e = Object.create(Enemy.prototype) as AnyGame;
      e.vanillaId = vanillaId; e.dead = false;
      e.x = 160; e.y = 160; e.w = 20; e.h = 42;
      return e;
    };
    const plain = mk(1);
    const dead = mk(376); dead.dead = true;
    const far = mk(376); far.x = 400; far.y = 400;
    g.entities.enemies = [plain, dead, far];
    g.wakeBoundEnemyNpc = () => {};
    expect((g as any).talkToNearbyNpc(170, 180)).toBe(false);
  });
});

describe('SW-BH1 ④ 对话保持距离（Player.cs:27698-27709 1:1）', () => {
  it('射程内保持；出射程（正下 1px）关闭', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    g.dialogNpc = { dead: false, x: 160, y: 160, w: 20, h: 42 };
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(0);
    g.dialogNpc = { dead: false, x: 160, y: 256, w: 20, h: 42 };
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(1);
  });

  it('★旧 6 格圆晚关方向：正上方出矩形界（脚 y=111）——旧圆 Δcy=91<96 会保持，原版关', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    // NPC 盒 y∈[69,111]：rly=112 严格相交失败 → 关；旧圆 |90−181|=91px < 96px 保持
    g.dialogNpc = { dead: false, x: 160, y: 69, w: 20, h: 42 };
    const oldCircleKept = Math.hypot(170 - 170, 90 - 181) <= TILE * 6;
    expect(oldCircleKept).toBe(true);
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(1);
  });

  it('★旧 6 格圆早关方向：对角 (dx=88,dy=48) 矩形内——旧圆 100.2>96 会误关，原版保持', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    // 玩家中心 (170,181)；NPC 盒 x∈[248,268] y∈[112,154]（中心距 hypot(88,48)=100.2px）
    g.dialogNpc = { dead: false, x: 248, y: 112, w: 20, h: 42 };
    const oldCircleClosed = Math.hypot(258 - 170, 133 - 181) > TILE * 6;
    expect(oldCircleClosed).toBe(true);
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(0);
  });

  it('开箱面板置位即关（chest != -1 支，Player.cs:27702）', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    g.dialogNpc = { dead: false, x: 160, y: 160, w: 20, h: 42 };
    g.openChestRef = () => ({ x: 120, y: 10, items: [] });
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(1);
  });

  it('dn.dead 关闭；无对话面板零副作用', () => {
    const g = stubGame();
    let closes = 0;
    g.closeNpcDialog = () => { closes++; };
    g.dialogNpc = { dead: true, x: 160, y: 160, w: 20, h: 42 };
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(1);
    g.dialogNpc = null;
    (g as any).tickNpcDialogKeepAlive();
    expect(closes).toBe(1);
  });
});

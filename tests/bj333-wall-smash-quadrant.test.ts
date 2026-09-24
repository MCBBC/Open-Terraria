// BJ333 2026-09-24：TryFindingWallToHammer 亚格象限方向 1:1 锁（用户实报「天然墙敲完残留」定谳批）
// 原版语义（Terarria1457）：
//   Player.cs:46221-46296 TryFindingWallToHammer——准星格「净」（无墙 或 非房墙且 3×3 同墙
//   一致）且空格时,按鼠标亚格象限扫 2×2 邻域找代理墙格:
//     :46251-46262 `if ((double)(v) < Math.Round(v)) num = 0;`（v=世界px/16）
//     ⟺ frac>0.5 → num=0（扫描 2×2 伸向鼠标【所压半格】方向）;
//       frac==0.5 时 C# Math.Round 银行家舍入 .5→偶数 → 偶行(10.5→10)假、奇行(11.5→12)真;
//       frac<0.5 → num=-1（向左/上对）。
//   Player.cs:46297-46305 TryHittingWall + :46307-46329 CanPlayerSmashWall——自然墙需
//   3×3 邻域有开口（wall==0 或房墙）才可锤:大片天然墙内部=原版刻意不可锤（防拆穿
//   地牢/丛林结构墙）,啃边（edge nibble）是唯一清除通道。
// 旧实现缺陷（本批修复）:象限判 `< 0.5 → 0` 反向（SW-BO1 审计误读 v<Round(v)）,
//   穿角锤墙 QoL 与内部格 2×2 代理目标全部选错方向 → 朝开口侧倚的瞄准全死。
// 消费面:Game.tryMine 锤支 TryFindingWallToHammer 段（camera.screenToWorld 亚格读）。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { HitTile } from '../src/core/HitTile';
import { World } from '../src/world/World';

type Drop = { x: number; y: number; key: string; n: number };
interface HG {
  netCanEditTile: () => boolean;
  world: World;
  hitTiles: HitTile;
  tickCount: number;
  lastMineHitTick: number;
  lastMineItemTime: number;
  mining: unknown;
  hardnessCache: number;
  hammerPoundRelease: boolean;
  player: Record<string, unknown>;
  smartCursor: Record<string, unknown>;
  camera: { screenToWorld: (x: number, y: number) => [number, number] };
  input: { mouseX: number; mouseY: number };
  inTileRange: (...a: unknown[]) => boolean;
  spawnParticles: (...a: unknown[]) => void;
  sfx: { play: (...a: unknown[]) => void };
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => null;
  drops: Drop[];
  pruneHitTiles: () => void;
  tryMine: (x: number, y: number, p: number, t: 'hammer', s: number, u?: number) => void;
}

const PWN = 67;  // floor(67×1.5)=100 一击拆（与 sw-bf1 同口径）

function mkGame(): { g: HG; st: World['store'] } {
  const w = new World(48, 64, 20, 'open');
  const drops: Drop[] = [];
  const g = Object.create(Game.prototype) as unknown as HG;
  g.netCanEditTile = () => true;
  g.world = w;
  g.hitTiles = new HitTile();
  g.tickCount = 0;
  g.lastMineHitTick = -999;
  g.lastMineItemTime = 0;
  g.mining = null;
  g.hardnessCache = 0;
  g.hammerPoundRelease = false;
  g.player = { buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, usedAmbrosia: false, equipStats: {}, inv: { removeHeld: () => true } };
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  // 亚格象限读数 stub:screenToWorld 恒等（mouseX/Y 直接给世界像素）——与原版
  // Main.mouseX + screenPosition 同一世界像素语义（/16 浮点除 2 的幂=精确）
  g.camera = { screenToWorld: (x: number, y: number) => [x, y] };
  g.input = { mouseX: 0, mouseY: 0 };
  g.inTileRange = () => true;
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x, y, key, n) => { drops.push({ x, y, key, n }); return null; };
  g.drops = drops;
  g.pruneHitTiles = () => {};
  return { g, st: w.store };
}

/** 在 (ax,ay) 格亚格偏移 (ox,oy) 处挥一锤（ox/oy∈[0,16) 决定象限） */
function swingAt(g: HG, ax: number, ay: number, ox = 8, oy = 8) {
  g.input.mouseX = ax * 16 + ox;
  g.input.mouseY = ay * 16 + oy;
  g.tryMine(ax, ay, PWN, 'hammer', 20);
}

describe('BJ333 TryFindingWallToHammer 亚格象限方向（Player.cs:46251-46262 verbatim）', () => {
  it('T1. frac>0.5（鼠标压右下半）→ 扫描伸向右下:右邻墙格被代理命中', () => {
    const { g, st } = mkGame();
    st.setWall(25, 40, 200);                       // 瞄准格 (24,40) 空,墙在右邻
    swingAt(g, 24, 40, 13, 13);                    // frac 0.8125 > 0.5 → num/num2=0
    expect(st.wall[st.idx(25, 40)]).toBe(0);       // 右邻墙被啃掉（原版）
    expect(st.wall[st.idx(24, 40)]).toBe(0);
  });

  it('T2. frac<0.5（鼠标压左上半）→ 扫描伸向左上:右邻墙格够不着（原版同相）', () => {
    const { g, st } = mkGame();
    st.setWall(25, 40, 200);
    swingAt(g, 24, 40, 3, 3);                      // frac 0.1875 → num/num2=-1
    expect(st.wall[st.idx(25, 40)]).toBe(200);     // 墙未被代理（不误扩）
    expect(g.hitTiles.getDamage(25, 40, 2)).toBe(0);
  });

  it('T3. 镜像:墙在左上,frac<0.5 → 左上墙格被代理命中（旧反向实现此处死）', () => {
    const { g, st } = mkGame();
    st.setWall(23, 39, 200);                       // 瞄准格 (24,40) 空,墙在左上对角
    swingAt(g, 24, 40, 3, 3);
    expect(st.wall[st.idx(23, 39)]).toBe(0);
  });

  it('T4. 银行家 .5 边缘:偶行 40.5 → Round=floor → 上对;奇行 41.5 → Round=ceil → 下对', () => {
    // 奇行 41:gy=41.5 → num2=0 → 扫描行 {41,42};ox=13 → 列 {24,25} → (25,42) 在块内被代理
    {
      const { g, st } = mkGame();
      st.setWall(25, 42, 200);
      swingAt(g, 24, 41, 13, 8);
      expect(st.wall[st.idx(25, 42)]).toBe(0);
    }
    // 偶行 40:gy=40.5 → num2=-1 → 扫描行 {39,40} → 够不着 (25,42)
    {
      const { g, st } = mkGame();
      st.setWall(25, 42, 200);
      swingAt(g, 24, 40, 13, 8);
      expect(st.wall[st.idx(25, 42)]).toBe(200);
      expect(g.hitTiles.getDamage(25, 42, 2)).toBe(0);
    }
    // 偶行 40 向上对:列块 {23,24},墙在 (24,39) 被代理
    {
      const { g, st } = mkGame();
      st.setWall(24, 39, 200);
      swingAt(g, 24, 40, 8, 8);
      expect(st.wall[st.idx(24, 39)]).toBe(0);
    }
  });

  it('T5. 内部格瞄准=啃扫描块首个 3×3 不一致格（原版 nibble 通道）', () => {
    const { g, st } = mkGame();
    // 3×3 全 200 块 @ (24,40)-(26,42),孤立（块外全空）
    for (let y = 40; y <= 42; y++) for (let x = 24; x <= 26; x++) st.setWall(x, y, 200);
    swingAt(g, 25, 41, 13, 13);                    // 中心格 3×3 一致=净 → 扫描右下对 {25,26}×{41,42}
    // 行主序:(25,41)→(25,42) 处 3×3 触块外行 43 → 首个不一致格=(25,42) → 代理命中
    expect(st.wall[st.idx(25, 42)]).toBe(0);
    expect(st.wall[st.idx(25, 41)]).toBe(200);     // 中心本体不动
    expect(st.wall[st.idx(26, 42)]).toBe(200);     // 扫描在 (25,42) break,远角未达
  });

  it('T6. 5×5 深内部 3×3 无开口 → 恒拒（原版 CanPlayerSmashWall :46307 刻意语义）', () => {
    const { g, st } = mkGame();
    for (let y = 38; y <= 42; y++) for (let x = 23; y <= 42 && x <= 27; x++) st.setWall(x, y, 200);
    swingAt(g, 25, 40, 13, 13);                    // 瞄 (25,40) 深内部,frac 右下
    // 扫描 2×2（(25..26,40..41)）全在深内部,3×3 无开口 → 代理格也拒 → 零伤害
    for (let y = 38; y <= 42; y++) for (let x = 23; x <= 27; x++) {
      expect(st.wall[st.idx(x, y)]).toBe(200);
      expect(g.hitTiles.getDamage(x, y, 2)).toBe(0);
    }
  });

  it('T7. 350 不可拆墙恒拒（CanPlayerSmashWall :46305）', () => {
    const { g, st } = mkGame();
    st.setWall(25, 40, 350);
    swingAt(g, 25, 40, 8, 8);                      // 直瞄（非净→直拆路径）
    expect(st.wall[st.idx(25, 40)]).toBe(350);
    expect(g.hitTiles.getDamage(25, 40, 2)).toBe(0);
  });

  it('T8. 边缘啃食通道:孤立天然墙格直瞄一击拆（用户「敲墙」主通道回归）', () => {
    const { g, st } = mkGame();
    st.setWall(25, 40, 200);                       // 孤立=3×3 全开口
    swingAt(g, 25, 40, 8, 8);
    expect(st.wall[st.idx(25, 40)]).toBe(0);
  });
});

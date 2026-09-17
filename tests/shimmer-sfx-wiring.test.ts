// 微光发声面接线回归（2026-09-17 普查批）——原版微光发声面 × 本仓逐条钉：
//   ① 物品入微光池 WetCollision 翻转拍 → Splash_4（WorldItem.cs:921）；出水拍 →
//      Splash_5（:1000）——旧实现整缺（近似 'splash' 六变体乱掷已退役）
//   ② 物品微光转化 GetShimmered 共尾 → 仅 Item_176 ×0.9（WorldItem.cs:1697 经
//      :1875 ShimmerEffect）——旧实现伴发 playSfx('shimmerSplash')（原版转化共尾
//      无 Splash_4，入池音在翻转拍发——已退役）
//   ③ NPC GetShimmered 三实支 → Item_176 ×0.9 + 20×dust309（NPC.cs:92672/:92684/
//      :92689 ← WorldItem.ShimmerEffect）——旧实现整缺
//   ④ 玩家 shimmerTransparency 0.8 衰减起始帧 → Splash_3（Player.cs:18422）
//      ——旧实现错播 Splash_4（shimmerSplash），源码钉 + 源码反-pin 双保险
// 变异复核：任一接线行删除/改错 id/回退旧行为 → 对应断言即红（各 test 内注明）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Enemy } from '../src/entities/Enemy';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const ROOT = join(__dirname, '..');
// 世界高 160：WetCollision 扫描窗钳 maxTilesY−40（Collision.cs:1406-1407,npcLiquid
// 同源）——60 高的小世界会把行 33-39 的液体整段吞掉（行为测试曾因此全空转）
const W = 60, H = 160;

// ---- 微光/水池：列 [10..30) 行 [33..40) 液体（amount 255），地板行 40 ----
function liquidWorld(type: 1 | 4): World {
  const w = new World(W, H, 11, 'shimmer-sfx');
  const st = w.store;
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, type);
  }
  w.lavaLine = 50;
  return w;
}

interface Rec { f: string; v?: number; x?: number; y?: number }

function mkHooks(w: World) {
  const p = new Player(45 * TILE, 30 * TILE, new Inventory());
  const wav: Rec[] = [];          // playSfxWav（直文件,Sfx 库层 FILE_CASE_VOL/PITCH 前的原声）
  const named: string[] = [];     // playSfx（SfxName 路由）
  const files: Rec[] = [];        // playSfxFile（Item_176 族）
  const dust309: number[] = [];   // spawnDust 收到的 dust type 记录
  const drops: ItemDrop[] = [];
  const g = {
    world: w, player: p,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDrop: (x: number, y: number, key: string, count = 1) => {
      const d = new ItemDrop(x, y, ITEM_BY_KEY[key], count);
      drops.push(d);
      return d;
    },
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    playSfx: (n: string) => { named.push(n); },
    playSfxWav: (f: string, v?: number, x?: number, y?: number) => { wav.push({ f, v, x, y }); },
    playSfxFile: (f: string, v?: number) => { files.push({ f, v }); },
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      dust309.push(type);
      return { vx: 0.3, vy: 0.2, scale: 1, alpha: 0, noGravity: false, color: null };
    },
  } as unknown as GameHooks;
  return { g, wav, named, files, dust309, drops };
}

describe('① 物品出入微光池溅花（WorldItem.cs:921/:1000 → itemSplashFace）', () => {
  it('入池翻转拍播 Splash_4（style 4），转化拍不再伴发任何 Splash', () => {
    const w = liquidWorld(4);
    const h = mkHooks(w);
    const torchKey = VANILLA_ITEM_KEY_BY_ID[8];   // 火炬 8 → 微光化 5353
    expect(torchKey).toBeDefined();
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[torchKey!], 1);
    d.fixedUpdate(1, h.g);                        // 首拍：WetCollision 翻转 → 入池溅花
    // 变异复核：入池接线行删除/延迟到转化拍 → 本断言红（wav 首条非 Splash_4）
    expect(h.wav[0]?.f).toBe('Splash_4');
    expect(h.wav[0]?.x).toBe(d.x);                // 坐标 = 物品 position（:921 (int)position.X）
    for (let i = 0; i < 200 && !d.shimmered; i++) d.fixedUpdate(1, h.g);
    expect(d.shimmered).toBe(true);               // 已转化（保障②的前置成立）
    // 变异复核：旧实现转化拍伴发 shimmerSplash（=Splash_4）→ 本断言红
    expect(h.wav.filter((r) => r.f === 'Splash_4')).toHaveLength(1);
    // 变异复核：任何分支残留 playSfx('shimmerSplash') → 本断言红
    expect(h.named).not.toContain('shimmerSplash');
    // 水上漂浮未出池：不发出水音（转化物品上浮阶段 probe 恒湿）
    expect(h.wav.filter((r) => r.f === 'Splash_5')).toHaveLength(0);
  });

  it('出水翻转拍播 Splash_5（style 5）；水档 Splash_1（缺省 style 1,非玩家档 Splash_0）', () => {
    const w = liquidWorld(4);
    const h = mkHooks(w);
    const torchKey = VANILLA_ITEM_KEY_BY_ID[8];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[torchKey!], 1);
    d.fixedUpdate(1, h.g);                                 // 入池翻转拍（ Splash_4）
    expect(d.wetSticky).toBe(true);                        // 浸池中（wet 粘滞位）
    for (let i = 0; i < 24; i++) d.fixedUpdate(1, h.g);    // 走完 wetCount=20 去抖窗
    expect(d.wetCount).toBe(0);                            // :1049-1051 逐帧 -- 已归零
    // 显式清一块干燥着陆区（World 构造可能自带地形/水体, teleport 落点必须确定干）
    const st = w.store;
    for (let x = 44; x <= 50; x++) {
      for (let y = 25; y <= 35; y++) {
        st.setLiquid(x, y, 0, 0);
        st.setTile(x, y, 0);
      }
    }
    d.x = 45 * TILE; d.y = 30 * TILE; d.vx = 0; d.vy = 0;
    h.g.player.x = 2 * TILE; h.g.player.y = 2 * TILE;   // 挪开玩家防抓取支吞拍（ grab 路径无溅花）
    d.fixedUpdate(1, h.g);                                 // 出水翻转拍（else if (wet) 支,:979-1000）
    // 变异复核：出水接线行删除/错档 → 本断言红
    expect(h.wav[h.wav.length - 1]?.f).toBe('Splash_5');
    expect(d.wetSticky).toBe(false);                       // !wet 拍末清偿（:1045）
    // 水池对照：入水缺省 style 1（WorldItem.cs:961 无 Style 实参 = SoundEngine.cs:102 缺省 1）
    const wh = liquidWorld(1);
    const hh = mkHooks(wh);
    const d2 = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[torchKey!], 1);
    d2.fixedUpdate(1, hh.g);
    expect(hh.wav[0]?.f).toBe('Splash_1');
    // 变异复核：旧 playSfx('splash') 六变体乱掷路由 → 本断言红
    expect(hh.named).not.toContain('splash');
    expect(hh.wav.filter((r) => r.f.startsWith('Splash'))).toHaveLength(1);  // 无逐拍重播
  });
});

describe('② 物品微光转化共尾（WorldItem.cs:1875 ShimmerEffect → 仅 Item_176 ×0.9）', () => {
  it('转化完成只播 Item_176 ×0.9（无 Splash_4/5 伴发），恰一次', () => {
    const w = liquidWorld(4);
    const h = mkHooks(w);
    const torchKey = VANILLA_ITEM_KEY_BY_ID[8];
    const d = new ItemDrop(20 * TILE, 35 * TILE, ITEM_BY_KEY[torchKey!], 1);
    for (let i = 0; i < 200 && !d.shimmered; i++) d.fixedUpdate(1, h.g);
    // 变异复核：共尾接线删除（转化静默）→ 本断言红
    expect(h.files).toEqual([{ f: 'Item_176', v: 0.9 }]);
    // 变异复核：音量改缺省 1（漏 LegacySoundPlayer.cs:520 case2 num176 ×0.9）→ 红
  });
});

describe('③ NPC GetShimmered（NPC.cs:92672/:92684/:92689 → Item_176 + dust309×20）', () => {
  it('雕像产怪浸池消散支：Item_176 ×0.9 恰一次 + 20×dust309 四色', () => {
    const w = liquidWorld(4);
    const h = mkHooks(w);
    // 绿史莱姆 1（ShimmerTransformToNPC → 676;非免表）。雕像位直取消散支 =
    // 无 Transform/掉落依赖的最小确定性断面（原版 :92508-92514 同支）
    const e = Enemy.fromVanilla(1, 20 * TILE, 34 * TILE)!;
    expect(e).not.toBeNull();
    e.spawnedFromStatue = true;
    e.shimmerT = 90;                       // 90t 浸入进度垫满（≥90 → 下拍 GetShimmered）
    e.fixedUpdate(1, h.g);
    expect(e.dead).toBe(true);             // active=false（:92511）
    // 变异复核：ShimmerEffect 接线删除（NPC 转化静默）→ 本断言红
    expect(h.files).toEqual([{ f: 'Item_176', v: 0.9 }]);
    // 变异复核：尘面改回旧 '#BFE8FF' 泛用粒子（不产 309）→ 本断言红
    expect(h.dust309.filter((t) => t === 309)).toHaveLength(20);
    // 四色表抽查（WorldItem.cs:1702-1725 Next(6) 1:1:1:3）——色值域断言
  });
});

describe('④ 玩家 shimmerTransparency 衰减起始帧（Player.cs:18422 → Splash_3）', () => {
  it('源码钉：透明度 0.8 起始帧行播 playSfxWav Splash_3（旧错档 Splash_4 已退役）', () => {
    // Player.Update 全链驱动过重,此处按本仓 proj-shimmer-family-wiring 前例以
    // 源码行钉接线（行为面由既有 bj79/player 溅花族测试覆盖）；双 pin 拒绝回退：
    const src = readFileSync(join(ROOT, 'src/entities/Player.ts'), 'utf8');
    const lines = src.split('\n');
    const hit = lines.filter((l) => l.includes('shimmerTransparency >= 0.8'));
    expect(hit).toHaveLength(1);
    // 变异复核：改回 shimmerSplash 名路由（=Splash_4 错档）→ 本断言红
    expect(hit[0]).toContain("playSfxWav?.('Splash_3'");
    expect(hit[0]).not.toContain('shimmerSplash');
    expect(src).not.toContain("playSfx('shimmerSplash'");
  });

  it('源码钉：shimmerUnstuck 双支（传送/无位）到场音 = manaCrystal（Item29）', () => {
    // 原版 ShimmerUnstuck 广播 ShimmerTownNPC → Spawn_ShimmerTownNPC 处理器尾
    // SoundEngine.PlaySound(SoundID.Item29)（ParticleOrchestrator.cs:2321）——
    // Broadcast 双生子本地也触发。旧实现播 shimmerSplash = 错档（普查修正）。
    // 变异复核：改回 shimmerSplash / 漏掉无位支接线 → 本断言红
    const src = readFileSync(join(ROOT, 'src/entities/Player.ts'), 'utf8');
    const count = (src.match(/playSfx\('manaCrystal'/g) ?? []).length;
    expect(count).toBe(2);
    expect(src).not.toContain("playSfx('shimmerSplash'");
  });

  it('源码反-pin：ItemDrop 转化路径无 shimmerSplash 残留', () => {
    const src = readFileSync(join(ROOT, 'src/entities/ItemDrop.ts'), 'utf8');
    expect(src).not.toContain("playSfx('shimmerSplash'");
    expect(src).not.toContain("playSfx('splash', 1)");
    // 入池/出水真声在位（行删除型变异 → 红）
    expect(src).toContain("game.playSfxWav?.('Splash_4', 1, this.x, this.y)");
    expect(src).toContain("game.playSfxWav?.('Splash_5', 1, this.x, this.y)");
  });
});

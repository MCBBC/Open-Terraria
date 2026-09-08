// TrapShot 1049 霰石 AI_5 尘链 !wet 门读相=上子步段值快照（wetSub0）回归
// （2026-09-08 定谳批,Dart.ts 字段块注+fixedUpdate 湿段块注）。
//  vanilla（Terarria1457/Terraria/Projectile.cs）: 子步环(:16781 while(numUpdates>=0))
//  内序 = AI(:16880) → 湿段(:16903) → 位移 → 子步 k 的 AI 读子步 k-1 段值。
//  本仓链每拍 2 轮连排（extraUpdates=1 :9949;AI 逐子步拆分=尘点位次域,既有登记）→
//  轮 1 读上拍子步 2 段值（wetSub0）、轮 2 读当拍拍头段值——与原版子步 1/子步 2 AI
//  读值逐位同源;首拍读出生预置值（NewProjectile :10886-10893 时点先于首拍 AI）。
//  判别力：!wet 完美支（:24359）尘粒 = spawnDust 盒参 (0,0)（NewDustPerfect 位）,
//  常驻旋转支 = (24,24)——出液边界拍原版读相喷 1 粒,旧当拍读相喷 2 粒。
import { describe, it, expect } from 'vitest';
import { TrapShot } from '../src/entities/Dart';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

const LIQ = 255;
/** 水带列 [22..32] 行 [33..43]（px [352,528]×[528,704]）;干区取 (700,200) */
function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  setWater(w, true);
  return w;
}
function setWater(w: World, on: boolean): void {
  for (let x = 22; x <= 32; x++) {
    for (let y = 33; y <= 43; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = on ? LIQ : 0;
      w.store.liquidType[i] = 0;
    }
  }
}

interface DustCall { bw: number; bh: number; type: number }

function mkGame(w: World): { g: GameHooks; dusts: DustCall[]; sfx: string[] } {
  const dusts: DustCall[] = [];
  const sfx: string[] = [];
  const g = {
    world: w,
    player: { x: 10 * 16, y: 10 * 16, w: 20, h: 42, cx: 170, cy: 181, dead: true },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      void x; void y;
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, fadeIn: 0, noGravity: false, color: null as unknown };
      dusts.push({ bw, bh, type });
      return d;
    },
    playSfxWav: (name: string) => { sfx.push(String(name)); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  (g as unknown as { entities: { projectiles: unknown[]; add: () => void; critters: unknown[]; npcs: unknown[] } }).entities =
    { projectiles: [], add: () => {}, critters: [], npcs: [] };
  return { g, dusts, sfx };
}

/** !wet 完美支尘粒（NewDustPerfect 盒参 0,0——:24359 支专属形状） */
const perfectPuffs = (dusts: DustCall[]): number =>
  dusts.filter((d) => d.bw === 0 && d.bh === 0).length;

describe('1049 霰石 AI_5 尘链 !wet 门读相（wetSub0 上子步段值快照）', () => {
  it('出生干区:首拍两子步 AI 读值均干 → !wet 支 2 粒（预置值=干,原版同相）', () => {
    const w = mkWorld();
    setWater(w, false);
    const { g, dusts } = mkGame(w);
    const s = new TrapShot(700, 200, 0, 0, 60, 'hail');
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);
    expect(perfectPuffs(dusts)).toBe(2);
  });

  it('出生水中:首子步 AI 读预置值（wet）→ !wet 支 0 粒（NewProjectile 预置先于首拍 AI）', () => {
    const w = mkWorld();
    const { g, dusts } = mkGame(w);
    const s = new TrapShot(400, 580, 0, 0, 60, 'hail');   // 24×24 盒全入水带
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);
    expect(perfectPuffs(dusts)).toBe(0);
  });

  it('出液边界拍:轮1 读上拍子步2段值（湿）不喷、轮2 读当拍段值（干）喷 1 粒（旧当拍读相=2）', () => {
    const w = mkWorld();
    const { g, dusts } = mkGame(w);
    const s = new TrapShot(400, 580, 0, 0, 60, 'hail');
    s.fixedUpdate(1 / 60, g);                              // 拍 1:全湿,轮1/轮2 读值均湿
    expect(perfectPuffs(dusts)).toBe(0);
    dusts.length = 0;
    s.x = 700; s.y = 200;                                  // 拍间挪干区 → 拍 2 当拍段值=干
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(false);                             // 当拍湿段已翻转（分叉在 AI 读相）
    expect(perfectPuffs(dusts)).toBe(1);                   // 轮1（上拍=湿）0 粒 + 轮2（当拍=干）1 粒
  });

  it('出液后稳态拍:两轮读值均干 → !wet 支 2 粒（原版子步1/子步2 AI 同相）', () => {
    const w = mkWorld();
    const { g, dusts } = mkGame(w);
    const s = new TrapShot(400, 580, 0, 0, 60, 'hail');
    s.fixedUpdate(1 / 60, g);                              // 拍 1:水中
    s.x = 700; s.y = 200;                                  // 拍 2:出液边界
    s.fixedUpdate(1 / 60, g);
    dusts.length = 0;
    s.fixedUpdate(1 / 60, g);                              // 拍 3:全干稳态
    expect(s.wet).toBe(false);
    expect(perfectPuffs(dusts)).toBe(2);
  });
});

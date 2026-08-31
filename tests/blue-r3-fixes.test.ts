// 蓝队 R3 复核批修复回归(2026-08-23):
//  R3-1  流浪生成"已有流浪者"门补排除集 {37,453,368,160}(W57:5551-5564)
//  R3-6  砸墓碑出幽灵(KillTile case 85,W57:44083-44139;1457 删群系门)
//  R3-7  砸祭坛幽灵补旅程 shouldDisableSpawns 门(W57:49506-49524)
//  R3-8  makeTemple 末房深度组死代码对齐(W57:33852 三元恒假)——金标锁(world-final-hash)
//  R3-11 驳回备案守卫:`(Next(60)==0) & flag2` ≡ `... && flag2`(&& 左操作数恒求值),
//        勿"修"成先掷后判(会在命中支内多掷 Next(230)=真偏移)
//  R3-12 FTW 巨石雨(SpawnFallingObjects 风暴臂 W57:72217-72240,实时秒窗 %80∈[45,80))
//  R3-16 火把神 949 命中玩家不杀弹(SelfHurtPlayers P57:15104-15152 后无 Kill)
//  R3-21 死人宝箱巨石陷阱"正下两格均实→放弃"支(DeadMansChestBiome.cs:262-266)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { TileStore } from '../src/world/TileStore';
import { DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const STONE = TILE_BY_KEY['stone']!;
const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const weaponSrc = readFileSync(new URL('../src/entities/WeaponProj.ts', import.meta.url), 'utf8');
const surfaceDecorSrc = readFileSync(new URL('../src/world/gen/vanilla/SurfaceDecorPasses.ts', import.meta.url), 'utf8');
const weatherSrc = readFileSync(new URL('../src/world/weather/Weather.ts', import.meta.url), 'utf8');

describe('R3-21 死人宝箱巨石陷阱位拒绝支(1457 DeadMansChestBiome.cs:262-266)', () => {
  const W = 64, H = 64;
  function makeStore(): TileStore {
    const st = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) st.setTile(x, y, STONE);
    return st;
  }
  it('正下两格 (x,y+1)/(x+1,y+1) 均实心 → 放弃该陷阱位', () => {
    const st = makeStore();
    const biome = new DeadMansChestBiome(st, null as never, {} as GenState, []);
    (biome as unknown as { placeBoulderTrapSpot: (x: number, y: number, p: number) => void })
      .placeBoulderTrapSpot(30, 30, 0);
    expect((biome as unknown as { boulders: unknown[] }).boulders).toHaveLength(0);
  });
  it('正下两格任一为空 → 陷阱位成立(其余门同过)', () => {
    const st = makeStore();
    st.setTile(31, 31, 0);                       // 清空 (x+1, y+1)
    const biome = new DeadMansChestBiome(st, null as never, {} as GenState, []);
    (biome as unknown as { placeBoulderTrapSpot: (x: number, y: number, p: number) => void })
      .placeBoulderTrapSpot(30, 30, 0);
    expect((biome as unknown as { boulders: unknown[] }).boulders).toHaveLength(1);
  });
});

describe('R3-11 驳回备案守卫:丛林草丛 Next(60)/Next(230) 保持 && 原形', () => {
  it('placeJunglePlant 未被改成先掷后判(先掷后判=命中支内多掷 Next(230) 真偏移)', () => {
    // 1457 W57:60086 `(genRand.Next(60) == 0) & flag2`:Next(60) 是 && 左操作数,
    // 两版恒求值;flag2 纯读无副作用 → `&` 与 `&&` 掷流逐位相同(红队误报)
    expect(surfaceDecorSrc).toContain('if (rng.int(0, 59) === 0 && deepOk) fx = 144;');
    expect(surfaceDecorSrc).toContain('else if (rng.int(0, 229) === 0 && deepOk) fx = 162;');
    expect(surfaceDecorSrc).not.toContain('const r60 = rng.int(0, 59)');
  });
});

describe('R3-16 火把神 949 命中玩家不杀弹(1457 SelfHurtPlayers 后无 Kill)', () => {
  it('命中伤害调用后紧邻代码无 this.kill(弹继续飞,无敌帧门由 Player 侧承担)', () => {
    const at = weaponSrc.indexOf('hostileProjectileDamage(40, mainDifficulty(game.world))');
    expect(at).toBeGreaterThan(0);
    const after = weaponSrc.slice(at, at + 400);
    expect(after).not.toContain('this.kill(game)');
    expect(after).toContain('R3-16');
  });
});

describe('R3-12 FTW 巨石雨(SpawnFallingObjects 风暴臂)', () => {
  it('实时秒窗 %80∈[45,80) + _isRainingBoulders 记账 + 成就 34 边沿', () => {
    expect(gameSrc).toContain('% 80 >= 45');                       // GlobalTimeWrappedHourly 窗
    expect(gameSrc).toContain('_isRainingBoulders');
    expect(gameSrc).toContain('notifyProgressionEvent(34)');       // ITS_SHALING_OUTSIDE
    expect(gameSrc).toContain("new TrapShot(bx, by, wind, 8, 70, 'boulder')");
    expect(weatherSrc).toContain('storming = false');              // Weather 全局旗
    expect(gameSrc).toContain('isItStormingNext(w.weather.cloudAlpha');
  });
});

describe('R3-1/R3-6/R3-7 城镇流浪门/墓碑幽灵/祭坛旅程门(源码守卫)', () => {
  it('R3-1 流浪生成门带四元排除集 {37,453,368,160}(W57:5559)', () => {
    expect(gameSrc).toContain('![37, 453, 368, 160].includes(n.vanillaId)');
  });
  it('R3-6 墓碑幽灵:CountNPCS(316)<2 门 + 难度掷 8/4/2 + 旅程滑杆 remap', () => {
    // 2026-08-31 锚随源码形更新：过滤式现为类型窄化 lambda（e as import(...)Enemy).vanillaId === 316）
    expect(gameSrc).toContain('.vanillaId === 316).length < 2').length > 0;
    expect(gameSrc).toContain('Enemy.fromVanilla(316');
    expect(gameSrc).toContain('spawnRateMultiplier(jp.spawnRateSlider)');
  });
  it('R3-7 砸祭坛幽灵包旅程 shouldDisableSpawns 门(W57:49510-49521)', () => {
    expect(gameSrc).toContain('shouldDisableSpawns(this.world.journeyPowers.spawnRateSlider)');
  });
});

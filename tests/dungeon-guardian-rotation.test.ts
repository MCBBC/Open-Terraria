// RB16（2026-09-13）地牢守卫(68)旋转链结构锁：
// 本体旋转 = AI 写 spin（dungeonGuardianAI mode-2f，NPC.cs:22359）→ 渲染 ROTATION_NPC
// 分派链 rotId 支消费 ctx.rotate(e.spin)（Renderer.ts）。地图头（小地图/全屏
// drawMapHeads → bossHeadRotation）与本体同字段（原版 GetBossHeadRotation
// case 68/262 → npc.rotation, NPC.cs:7636-7650；小地图路径 mapStyle==1 →
// DrawNPCMapIcons2 Main.cs:56536-56537/:57028）——曾各自断裂：
//   ①本体写 visAngle（rotId 分派链不消费）=用户实报"守卫骷髅头不旋转"；
//   ②改写 spin 后地图头仍读 visAngle=地图头停转回归（RB16 定谳修复）。
// 本锁钉死：③渲染分派链 68 必达 rotId 支（之前无 aiStyle11 截胡分支）；
//   ④地图头旋转源=spin；⑤bossHeadRotation 68 透传/35 ai 门恒 0。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bossHeadRotation } from '../src/data/vanillaNpcs';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');

describe('地牢守卫(68)旋转链结构锁（RB16）', () => {
  it('①ROTATION_NPC 含 68（本体旋转分派白名单）', () => {
    expect(rendererSrc).toMatch(/const ROTATION_NPC = new Set\(\[35, 68,/);
  });

  it('②rotId 分派链兜底支消费 e.spin（本体出图位）', () => {
    // 分派链最后一支=rotId 白名单兜底；68 aiStyle 11 无更早分支截胡
    expect(rendererSrc).toMatch(/else if \(rotId\) ctx\.rotate\(e\.spin\)/);
    expect(rendererSrc).not.toMatch(/stR === 11\)\s*ctx\.rotate/); // aiStyle11 不得另开支路
  });

  it('③dungeonGuardianAI mode-2f 写 spin（NPC.cs:22359 锚）', () => {
    expect(enemySrc).toMatch(/this\.spin \+= this\.facing \* 0\.3/);
  });

  it('④地图头旋转源 = e.spin（GetBossHeadRotation 同字段,勿回退 visAngle）', () => {
    // BJ68 2026-09-14：调用点接 ai 门（35/127 ai1∈{1,2}/345 ai0==2）——68/262 支
    // 仍以 ex.spin 为旋转源（本锁原意不变），调用点文本随接门更新
    expect(rendererSrc).toMatch(
      /bossHeadRotation\(vid, ex\.spin \?\? 0, ex\.ai1 \?\? 0, ex\.ai0 \?\? 0\)/,
    );
  });

  it('⑤bossHeadRotation：68/262 透传 rotation，35 缺省参（无态）恒 0', () => {
    expect(bossHeadRotation(68, 1.234)).toBeCloseTo(1.234, 9);
    expect(bossHeadRotation(262, -0.5)).toBeCloseTo(-0.5, 9);
    expect(bossHeadRotation(35, 1.234)).toBe(0);
    expect(bossHeadRotation(4, 1.234)).toBe(0);
  });

  it('⑥行为面：68 首拍即累计 spin（fresh 实例 spin=0,模式 2f 恒态）', () => {
    const w = new World(120, 120, 7, 'rb16');
    const st = w.store;
    for (let x = 0; x < 120; x++) { st.setTile(x, 100, 1); st.setTile(x, 101, 1); st.setTile(x, 102, 1); }
    const e = Enemy.fromVanilla(68, 20 * TILE, 60 * TILE)!;
    const game = {
      world: w,
      player: { cx: 80 * TILE, cy: 60 * TILE, x: 80 * TILE, y: 60 * TILE, w: 16, h: 28, hp: 100, maxHp: 100, dead: false, aabbOverlaps: () => false },
      playSfx: () => {},
      damagePlayer: (): number => 0,
      spawnParticles: () => {},
    } as never;
    e.fixedUpdate(1 / 60, game);
    expect(e.spin).toBeCloseTo(0.3, 9);   // facing=+1（玩家在右）→ 1 拍 +0.3
    e.fixedUpdate(1 / 60, game);
    expect(e.spin).toBeCloseTo(0.6, 9);
  });
});

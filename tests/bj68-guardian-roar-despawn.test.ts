// BJ68（2026-09-14）地牢守卫(68)两债清偿守卫：
// ②生成拍双咆哮（NPC.cs:22039-22042 localAI[0]==0 门 + :22054-22058
//   (type==68||IsItDay)&&ai[1]∉{3,2} → ai[1]=2 强制块内第二声 PlaySound(15)——
//   1458 同域 :22039/:22057 行号内对齐）。守卫生成拍 ai[1]=0 必中②支 → 同拍两声；
//   曾只接①一声=漏读。③mode-3 EncourageDespawn(50)（:22372-22380,ai[1]==3f 支尾）——
//   timeLeft 封顶 min(·,50)+despawnEncouraged,离屏后 ~50t 消散;此前缺失=玩家死后
//   ai[1]=3 下坠永不消散偏离。音效面断言=播放调用计数;EncourageDespawn 断言=计时
//   （despawnTimer 封顶位+dead 到位拍数）。变异证红：删第二声/删 EncourageDespawn
//   任一 → 对应断言红。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';

/** 守卫 mock（RB16 test⑥ 同款骨架 + playSfx 计数口） */
function guardianGame(sfxLog: string[], pxTile: number, pyTile: number, playerDead = false) {
  const w = new World(160, 160, 7, 'bj68');
  const st = w.store;
  for (let x = 0; x < 160; x++) {
    st.setTile(x, 100, 1); st.setTile(x, 101, 1); st.setTile(x, 102, 1);
  }
  return {
    game: {
      world: w,
      player: {
        cx: pxTile * TILE, cy: pyTile * TILE, x: pxTile * TILE, y: pyTile * TILE,
        w: 16, h: 28, hp: 100, maxHp: 100, dead: playerDead, aabbOverlaps: () => false,
      },
      playSfx: (name: string) => { sfxLog.push(name); },
      damagePlayer: (): number => 0,
      spawnParticles: () => {},
    } as never,
    world: w,
  };
}

describe('BJ68 地牢守卫生成双咆哮（NPC.cs:22039-22058）', () => {
  it('①生成拍 roar 计数=2（①localAI 门 + ②0→2 强制块同拍；NPC.cs:22042+:22057）', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 80, 60);            // 玩家在 2000px 内 → ②支命中
    const e = Enemy.fromVanilla(68, 70 * TILE, 60 * TILE)!;
    e.fixedUpdate(1 / 60, game);                            // 生成拍
    e.fixedUpdate(1 / 60, game);                            // 次拍
    e.fixedUpdate(1 / 60, game);                            // 第三拍
    expect(log.filter((n) => n === 'roar').length).toBe(2); // 双声=生成拍一次到位
    expect(e.ai1).toBe(2);                                  // 恒 ai[1]=2（:22054 强制）
  });

  it('②变异证红面:生成拍后不再续吼（②支 !==2 门——原恒真重写若接了吼会连响）', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 80, 60);
    const e = Enemy.fromVanilla(68, 70 * TILE, 60 * TILE)!;
    for (let i = 0; i < 30; i++) e.fixedUpdate(1 / 60, game);
    expect(log.filter((n) => n === 'roar').length).toBe(2);
  });

  it('③无目标拍只一声（玩家超 2000px → ai[1]=3,②支 ∉{3,2} 门不中——:22050-22053 先置 3）', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 10, 60);             // 玩家在左远端:70*16=1120px? → 放更远
    const e = Enemy.fromVanilla(68, 150 * TILE, 60 * TILE)!; // 距 140*16=2240px > 2000 → ai[1]=3
    e.fixedUpdate(1 / 60, game);
    expect(log.filter((n) => n === 'roar').length).toBe(1); // 仅①localAI 门声
    expect(e.ai1).toBe(3);
  });
});

describe('BJ68 守卫 mode-3 EncourageDespawn(50)（NPC.cs:22378-22380）', () => {
  it('①离屏下坠态 despawnTimer 封顶 ≤50 + despawnEncouraged 置位', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 10, 60);
    const e = Enemy.fromVanilla(68, 150 * TILE, 60 * TILE)!; // 2240px > 2000 → mode 3
    e.fixedUpdate(1 / 60, game);
    expect(e.ai1).toBe(3);
    expect(e.despawnEncouraged).toBe(true);                 // :22382 despawnEncouraged=true
    expect(e.despawnTimer).toBeLessThanOrEqual(50);         // timeLeft 封顶 min(·,50)（:7278-7281）
    expect(e.despawnTimer).toBeGreaterThan(0);
  });

  it('②计时面:离屏 ~50t 消散（encourageDespawn 缺失变异下 55t 仍活=红）', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 10, 60);
    const e = Enemy.fromVanilla(68, 150 * TILE, 60 * TILE)!;
    for (let i = 0; i < 55; i++) e.fixedUpdate(1 / 60, game);
    expect(e.dead).toBe(true);                              // timeLeft 归零 → :78795 消散
  });

  it('③屏内保命不误消散（③支 timeLeft=750 抵挡——EncourageDespawn 钉低值唯一抵消点）', () => {
    const log: string[] = [];
    const { game } = guardianGame(log, 80, 60);
    const e = Enemy.fromVanilla(68, 70 * TILE, 60 * TILE)!; // 屏内 → mode 2 追击
    for (let i = 0; i < 60; i++) e.fixedUpdate(1 / 60, game);
    expect(e.dead).toBe(false);                             // 屏内 ③ 每 tick 重置 750
  });
});

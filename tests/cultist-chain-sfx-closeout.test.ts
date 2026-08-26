// 月总/邪教徒链音频收口四工单回归(2026-08-26 工单⑦⑧⑨):
//   ⑦ 弹 462 PhantasmalBolt 首拍二选一音(Projectile.cs:56236-56257 ai[1]==0 分支):
//      四处发射点(月总核心折叠弹幕/手 397 AI_078/头 396 AI_079/游离眼 400 AI_081)
//      每颗出膛恰播 1 声,Item_124/125 二值随机可达(Math.random 注入法 + 统计法),
//      附带首拍尘 229×Next(5,10)(velocity.Y--/+=弹向×2/position-=One×4/noGravity);
//   ⑧ 火球 467/468:出膛首拍 Item_34(:55133-55139 / :55280-55287)一拍一声
//      (真身 467 + 克隆体补射 468 各逐弹);消亡爆(Kill :74390-74441/:74442-74505)
//      Resize(176×176) 判定盒 Damage() 对玩家一次(hitPlayer=Damage_EVP 同式)+
//      Item_14 音——盒外/iframes 内/非 hostile 不结算;
//   ⑨ 弹 593 齐射首拍 Item_11(:56226-56230):远古末日 523 蓄满四向齐射 N 弹 N 声。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Game } from '../src/core/Game';
import { shootBolt462 } from '../src/entities/bossAI';
import {
  moonLordHandAI, moonLordHeadAI, moonLordCoreAI,
} from '../src/entities/bossAI_duke_moonlord';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;
const BOLT_SFX = new Set(['Item_124', 'Item_125']);

let nid = 9000;

function makeWorld(): World {
  const w = new World(W, H, 7, 'cultist-sfx-test');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

/** 带音效录音的 hooks(playSfxWav/playSfxFiles 记 [file,x,y]) */
function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: Array<{ projId: number; damage: number }> = [];
  const wavs: Array<{ file: string; x: number; y: number }> = [];
  const files: Array<{ files: string[]; x: number; y: number }> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as { projId: number; damage: number });
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    aabbOverlaps: () => false,
  };
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files2: string[], _v?: number, x?: number, y?: number) => {
      files.push({ files: files2, x: x ?? 0, y: y ?? 0 });
    },
    showPickupLabel: () => {},
    entities: em,
    spawnDust: () => null,
    playSfxWav: (file: string, _v?: number, x?: number, y?: number) => {
      wavs.push({ file, x: x ?? 0, y: y ?? 0 });
    },
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, wavs, files, player };
}

function putEnemy(h: ReturnType<typeof makeHooks>, vanillaId: number, xPx: number, yPx: number): Enemy {
  const e = Enemy.fromVanilla(vanillaId, xPx, yPx)!;
  e.id = nid++;
  e.bInit = true;
  h.enemies.push(e);
  return e;
}

function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

const boltSounds = (h: ReturnType<typeof makeHooks>) => h.wavs.filter((w) => BOLT_SFX.has(w.file));
const fireSounds = (h: ReturnType<typeof makeHooks>) => h.wavs.filter((w) => w.file === 'Item_34');
const bolts462 = (h: ReturnType<typeof makeHooks>, dmg?: number) =>
  h.projectiles.filter((p) => p.projId === 462 && (dmg === undefined || p.damage === dmg));

// ===========================================================================
// ⑦ shootBolt462 出膛口本体：恰一声 + 二值随机可达 + 首拍尘 229 字段
// ===========================================================================
describe('⑦ shootBolt462(Projectile.cs:56236-56257 首拍二选一)', () => {
  function mkUnitHooks() {
    const wavs: string[] = [];
    const dusts: Array<{ x: number; y: number; vx: number; vy: number; noGravity: boolean }> = [];
    const added: Array<{ projId: number }> = [];
    const hooks = {
      entities: { add: (e: unknown) => added.push(e as { projId: number }) },
      playSfxWav: (f: string) => wavs.push(f),
      spawnDust: (_x: number, _y: number, _w: number, _h2: number) => {
        const d = { x: _x, y: _y, vx: 1.5, vy: 0, noGravity: false };
        dusts.push(d);
        return d;
      },
    } as unknown as GameHooks;
    return { hooks, wavs, dusts, added };
  }

  it('注入 rand 二值可达:rand<0.5 → Item_124,rand>=0.5 → Item_125(每调用恰一声)', () => {
    for (const [r, want] of [[0.49, 'Item_124'], [0.51, 'Item_125']] as const) {
      const u = mkUnitHooks();
      const spy = vi.spyOn(Math, 'random').mockReturnValue(r);
      try {
        shootBolt462(u.hooks, 100, 200, 8, 0, 30);
        expect(u.wavs.length).toBe(1);          // 恰一声
        expect(u.wavs[0]).toBe(want);           // Main.rand.Next(2)==0 → Item124(:56239-56244)
        expect(u.added.length).toBe(1);
        expect(u.added[0].projId).toBe(462);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it('首拍尘 229 ×Next(5,10):vy-=1 后 += 弹向×2、position-=One×4、noGravity(:56245-56251)', () => {
    const u = mkUnitHooks();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999);   // Next(5,10)=5..9:floor(.999×5)=4 → 9 枚
    try {
      shootBolt462(u.hooks, 100, 200, 6, 8, 35);   // 弹向单位向 (0.6,0.8)
      expect(u.dusts.length).toBe(9);              // 5 + floor(0.999×5)
      for (const d of u.dusts) {
        expect(d.vy).toBeCloseTo(-1 + 0.8 * 2, 9); // velocity.Y-- 再 += vector20.Y×2
        expect(d.vx).toBeCloseTo(1.5 + 0.6 * 2, 9);// += vector20.X×2
        expect(d.x).toBeCloseTo(96, 9);            // position -= One×4
        expect(d.y).toBeCloseTo(196, 9);
        expect(d.noGravity).toBe(true);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('统计法:300 连掷两音色都出现(单边缺失概率 2⁻³⁰⁰)', () => {
    const u = mkUnitHooks();
    for (let i = 0; i < 300; i++) shootBolt462(u.hooks, 0, 0, 8, 0, 30);
    expect(u.wavs.length).toBe(300);
    expect(new Set(u.wavs)).toEqual(BOLT_SFX);
  });
});

// ===========================================================================
// ⑦ 四处发射点各弹各一声(e2e:手 397 / 头 396 / 核心折叠 / 游离眼 400)
// ===========================================================================
describe('⑦ 462 发射点逐点回归(每发恰播一声)', () => {
  it('手 397 AI_078 三连矢槽(ai1=585→586=inSlot dur-14)当拍一发一声', () => {
    const h = makeHooks(makeWorld(), { x: 90, y: 90 });
    const core = putEnemy(h, 398, 100 * TILE, 60 * TILE);
    const hand = putEnemy(h, 397, 94 * TILE, 62 * TILE);
    hand.ai3 = core.id; hand.ai2 = 0;               // 左手表 ML_HAND_ATTACKS[0]
    hand.ai1 = 585;                                 // AI 内 +1 → 586 = 矢槽 inSlot76=dur-14
    moonLordHandAI(hand, h.hooks, h.hooks.player as never);
    const fired = h.projectiles.length;
    expect(fired).toBe(1);
    expect(bolts462(h).length).toBe(1);
    expect(boltSounds(h).length).toBe(fired);       // ★每发出膛恰一声
    expect(bolts462(h)[0].damage).toBe(30);         // 手档 30 伤(:37466-37471)
  });

  it('头 396 AI_079 三连矢槽(ai1=165→166=inSlot dur-14,dur=180)当拍一发一声', () => {
    const h = makeHooks(makeWorld(), { x: 105, y: 60 });
    const core = putEnemy(h, 398, 100 * TILE, 60 * TILE);
    const head = putEnemy(h, 396, 100 * TILE, 55 * TILE);
    head.ai3 = core.id;                             // 头锚定核心(:37714-37719 缺锚自灭)
    head.ai0 = 3; head.ai1 = 165;                   // AI 内 +1 → inSlot166=dur-14
    moonLordHeadAI(head, h.hooks, h.hooks.player as never);
    expect(h.projectiles.length).toBe(1);
    expect(bolts462(h).length).toBe(1);
    expect(boltSounds(h).length).toBe(1);
  });

  it('核心 398 二阶段折叠弹幕攻击 1(ai1=128→129=inSlot76)真眼缺席时兜底一发一声', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: 70 });
    const core = putEnemy(h, 398, 100 * TILE, 55 * TILE);
    core.ai0 = 1;                                   // phase1 且无 400 真眼在场 → 折叠链
    core.ai1 = 128;                                 // ML_CORE_P2 [0,53][1,90]:53+76=129
    moonLordCoreAI(core, h.hooks, h.hooks.player as never);
    expect(h.projectiles.length).toBe(1);
    expect(bolts462(h, 35).length).toBe(1);         // 折叠链 35 伤档(:38378-38382)
    expect(boltSounds(h).length).toBe(1);
  });

  it('游离眼 400 AI_081 矢槽(t=76/83 两连)两发两声', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const core = putEnemy(h, 398, 80 * TILE, 90 * TILE);
    const eye = putEnemy(h, 400, 40 * TILE, 88 * TILE);
    eye.ai3 = core.id; eye.ai0 = 0; eye.ai1 = 0;
    tick(h, 136, [eye]);                            // 矢槽 53..142,两发在 t=76/83
    expect(bolts462(h, 35).length).toBe(2);
    expect(boltSounds(h).length).toBe(2);           // ★逐弹各掷一次
  });
});

// ===========================================================================
// ⑧ 火球 467/468 出膛首拍 Item_34(一拍一声)
// ===========================================================================
describe('⑧ 火球 467/468 出膛首拍 Item_34', () => {
  it('真身 467:ai0==3 拍内一发恰一声(:65505-65517 + :55136-55139)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 92 });
    const cult = putEnemy(h, 439, 80 * TILE, 80 * TILE);
    cult.ai0 = 3; cult.ai1 = 4;                     // (ai1-4)%18==0 当拍即发
    tick(h, 1, [cult]);
    expect(h.projectiles.filter((p) => p.projId === 467).length).toBe(1);
    expect(fireSounds(h).length).toBe(1);           // ★一拍一声
  });

  it('第三拍克隆体补射:2 克隆体各补 1 发 468 + 真身 1 发 467 = 3 弹 3 声(:65448-65499)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 96 });
    const cult = putEnemy(h, 439, 80 * TILE, 80 * TILE);
    cult.ai0 = 5; cult.ai1 = 0; cult.ai2 = 0; cult.ai3 = 0;
    tick(h, 31, [cult]);                            // 仪式 ai1==30 生成节拍 → 2 克隆体
    const clones = h.enemies.filter((n) => n.vanillaId === 440 && !n.dead);
    expect(clones.length).toBe(2);
    cult.ai0 = 3; cult.ai1 = 40;                    // beat=(40-4)/18=2 → 补射拍
    const before = h.projectiles.length;
    const sfxBefore = fireSounds(h).length;
    tick(h, 1, [cult]);
    const fired = h.projectiles.slice(before);
    expect(fired.filter((p) => p.projId === 468).length).toBe(2);
    expect(fired.filter((p) => p.projId === 467).length).toBe(1);
    expect(fireSounds(h).length - sfxBefore).toBe(3);   // ★N 弹 N 声(克隆体+真身)
  });
});

// ===========================================================================
// ⑧ 火球消亡爆(Game.onProjectileDeath 467/468 分支,Kill :74390-74505)
// ===========================================================================
describe('⑧ onProjectileDeath 467/468:Resize(176)+Damage()+Item_14', () => {
  /** onProjectileDeath 零场桩(Object.create(Game.prototype) 先例:weapon-killfx) */
  function mkDeathGame(playerAt: { x: number; y: number }, iframes = 0) {
    const damaged: number[] = [];
    const sfx: string[][] = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      onProjectileDeath: (...a: unknown[]) => void;
    };
    g.playSfxFiles = (fs: string[]) => { sfx.push(fs); };
    g.spawnDust = () => null;
    g.spawnParticles = () => {};
    g.entities = { add: () => {}, enemies: [], critters: [] };
    g.world = { difficulty: 0 };                    // 经典档(mainDifficulty 兼容裸对象)
    g.player = {
      dead: false, iframes, luck: 0,
      x: playerAt.x, y: playerAt.y, w: 20, h: 42,
      cx: playerAt.x + 10, cy: playerAt.y + 21,
    };
    g.damagePlayer = (n: number) => { damaged.push(n); };
    return { g, damaged, sfx };
  }

  it('盒内玩家:Item_14 一声 + Damage() 恰一次(经典敌弹 ×2 缩放域)', () => {
    // 爆心 (110,221),判定盒 176×176 → 玩家矩形在盒内
    const { g, damaged, sfx } = mkDeathGame({ x: 100, y: 200 });
    g.onProjectileDeath(467, 102, 213, 16, 16, 5, -2, 30, { hostile: true });
    expect(sfx).toEqual([['Item_14']]);             // SoundID.Item14（:74394）
    expect(damaged.length).toBe(1);                 // ★Damage() 一次
    expect(damaged[0]).toBeGreaterThan(0);
  });

  it('盒外玩家不结算;iframes 内不结算(Damage_EVP :13732 immune 门)', () => {
    const far = mkDeathGame({ x: 500, y: 500 });
    far.g.onProjectileDeath(467, 100, 200, 16, 16, 5, -2, 30, { hostile: true });
    expect(far.damaged.length).toBe(0);

    const imm = mkDeathGame({ x: 100, y: 200 }, 30);
    imm.g.onProjectileDeath(467, 100, 200, 16, 16, 5, -2, 30, { hostile: true });
    expect(imm.damaged.length).toBe(0);

    const friendly = mkDeathGame({ x: 100, y: 200 });
    friendly.g.onProjectileDeath(468, 100, 200, 16, 16, 5, -2, 18, { hostile: false });
    expect(friendly.damaged.length).toBe(0);        // 非 hostile 门(敌弹爆不回打)
  });

  it('468 同构结算(尘型 27 差异不影响伤害/音面);dmg 缺省回落 30', () => {
    const { g, damaged, sfx } = mkDeathGame({ x: 100, y: 200 });
    g.onProjectileDeath(468, 102, 213, 16, 16, 5, -2, 0, { hostile: true });
    expect(sfx).toEqual([['Item_14']]);
    expect(damaged.length).toBe(1);
    expect(damaged[0]).toBeGreaterThan(0);
  });
});

// ===========================================================================
// ⑨ 远古末日 523 蓄满齐射 593:N 弹 N 声(Projectile.cs:56226-56230)
// ===========================================================================
describe('⑨ 弹 593 齐射首拍 Item_11', () => {
  it('蓄满四向齐射 4 弹恰 4 声(:42206-42216 + :56226-56230)', () => {
    const h = makeHooks(makeWorld(), { x: 80, y: 92 });
    const boss = putEnemy(h, 439, 80 * TILE, 80 * TILE);
    const doom = putEnemy(h, 523, 82 * TILE, 82 * TILE);
    doom.ai0 = boss.id;                             // 锚定邪教徒
    doom.ai1 = 419;                                 // rate=1(boss 满血)→ 本拍满 420
    tick(h, 1, [doom]);
    const volley = h.projectiles.filter((p) => p.projId === 593);
    expect(volley.length).toBe(4);                  // 四向 (-π/2 + k·π/2)
    const item11 = h.wavs.filter((w) => w.file === 'Item_11');
    expect(item11.length).toBe(4);                  // ★逐弹首拍各播一次
    expect(doom.dead).toBe(true);                   // 齐射同拍自灭(:42208)
  });
});

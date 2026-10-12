// ★MV2（2026-10-06）mv1 收官四条登记债清偿守卫。
//
// 债① buff 98（Webbed,原版 149）「~1t 即摘」——定谳=探针伪影,无摘除者：
//   _mv-runaway-census.mjs 的 __drive 用 `p.fixedUpdate(1, g)`（dt=1 秒/tick=60×
//   时间膨胀）,50/60s 的 buff 首拍即尽=「约 1 tick 被摘」。真机 dt（1/60）下
//   buff 逐拍正常倒计时（Buffs.tick 递减;免疫表/护士/死亡清档均不涉 98）。
//   原版 webbed 语义亦无「蛛网内每 tick 续期」：蛛网 tile 物理=StickyMovement
//   （Player.cs:23110-23250,全函数零 AddBuff——只做速度钳制/阻尼/挣扎撕网）;
//   buff 149 授予面仅吐网弹 472 命中（Projectile.cs:12175 Next(30,150)）与
//   StatusFromNPC ai[1]==150 接触（Player.cs:22598 Next(30,60)）,到期自然坠落。
//   本组测试锁：真机 dt 生命周期 1:1 + 伪影机制复现 + 授予面数据锚 + 蛛网不上 buff。
//
// 债② webbed 宽面封输入（原版 CCed :25432-25446：controlJump/Down/Left/Right/Up/
//   UseItem/UseTile/Throw 全清 + gravDir=1f）——仓内清输入块（:5261）原只含
//   Frozen∪shimmering∪Stoned,webbed 拍 jump/移动键全残留;updateUse 门
//   （Game.ts,:42924 ItemCheck CCed 早退仓内等价位）原缺 webbed 腿。本组锁全腿。
//
// 债③ 滑行出口 vx==0 双键同按择向（原版 :21570-21575 `vx==0 && controlLeft →
//   -num15` 先于 `vx==0 && controlRight → +num15`——controlLeft 优先）——mv1 以
//   ix（inputX 合值）承载,双键同按 inputX=0 两臂皆不落=1 拍 ±num15 级边缘。
//   修=出口臂直读 CCed 后的 inputLeft/inputRight（原版读 controlLeft/Right 同位）。
//
// 债④ prevInputX 早退态冻结——原版双击沿真值=releaseLeft/Right 逐拍无条件刷新
//   （Update :27827-27855;死相 UpdateDead :17192 同刷）,坐骑矿车/坐睡/死亡态照走;
//   仓内 prevInputX 尾拍更新（:7804）被 sitting/sleeping/ridingCart/dead 早退跳过
//   =矿车中按压→下车后幽灵沿（原版沿已在车拍被 :21579 早退消费+dashTime 清零）。
//   湿/绳/微光/结网/星旋态本就更新（无早退）=mv1 登记的「湿/绳冻结」面销案。
//
// 变异证红：摘 webbed 清输入腿 → ②红;摘出口 controlLeft 直读 → ③红;摘矿车/死亡/
//   坐睡 prevInputX 补刷 → ④红;①组为销案判据守卫（现行为即绿,防回归）。
import { describe, it, expect } from 'vitest';
import { newWiresRadialState } from '../src/stats/wiresRadial';   // ★BJ662 桩族补齐（BJ626 newWiresRadialState 先例）
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { BuffType } from '../src/stats/Buffs';
import { Game } from '../src/core/Game';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

const W = 80, H = 80;
const GROUND_ROW = 30;

function fakeHooks(w: World, p: Player): GameHooks {
  return {
    world: w, player: p, enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, recLog: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
  } as unknown as GameHooks;
}

function mkPlayer(w: World, tx = 20): Player {
  const p = new Player(tx * TILE, GROUND_ROW * TILE - 48, new Inventory());
  p.hp = 500;
  return p;
}

const tick = (p: Player, w: World): void => { p.fixedUpdate(1 / 60, fakeHooks(w, p) as never); };

function plainWorld(): World {
  const w = new World(W, H, 11, 'mv2-plain');
  for (let x = 4; x < 78; x++) w.store.setTile(x, GROUND_ROW, 1);
  return w;
}

/** 双击右发起冲刺（mv1 同式） */
function dashRight(p: Player, w: World): void {
  p.facing = 1;
  p.inputX = 1; p.inputLeft = false; p.inputRight = true;
  tick(p, w);
  p.inputX = 0; p.inputLeft = false; p.inputRight = false;
  for (let i = 0; i < 4; i++) tick(p, w);
  p.inputX = 1; p.inputLeft = false; p.inputRight = true;
  tick(p, w);
  p.inputX = 0; p.inputLeft = false; p.inputRight = false;
  expect(p.dashDelay).toBe(-1);           // 发起自证
}

// ---------------------------------------------------------------------------
describe('MV2① 债①销案守卫：webbed buff 生命周期=原版逐拍倒计时（无摘除者）', () => {
  it('真机 dt（1/60）：apply 60t 生命周期逐拍存活至期满（修「~1t 即摘」不存在）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.buffs.apply(BuffType.Webbed, 1);      // 60t（原版 Next(30,150) 量级的中位拍）
    tick(p, w);                             // 首拍入结网支（预拍重力残速不作准）
    let aliveTicks = 1;
    for (let i = 0; i < 120; i++) {
      if (!p.buffs.has(BuffType.Webbed)) break;
      aliveTicks++;
      expect(p.vx).toBe(0);                 // buff 生效拍 velocity 清零（:11955-11969）
      tick(p, w);
    }
    // 浮点倒计时容差带：60t±2 内到期即 1:1（1t 即摘/永不摘皆红）
    expect(aliveTicks).toBeGreaterThanOrEqual(58);
    expect(aliveTicks).toBeLessThanOrEqual(62);
    expect(p.buffs.has(BuffType.Webbed)).toBe(false);
  });

  it('探针伪影机制复现：dt=1（census __drive 同款）→ 0.83s buff 首拍即尽', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.buffs.apply(BuffType.Webbed, 50 / 60);   // census R6 同款 0.83s
    p.fixedUpdate(1, fakeHooks(w, p) as never);   // ★伪影核心：dt=1 秒/tick
    expect(p.buffs.has(BuffType.Webbed)).toBe(false);   // 「约 1 tick 即被摘」全解
  });

  it('蛛网 tile 物理不上/不摘 buff（原版 StickyMovement :23110-23250 零 AddBuff）', () => {
    const w = plainWorld();
    const st = w.store;
    const cob = TILE_BY_KEY['v_51_cobweb'];
    expect(cob, '蛛网内部 id 自证').toBeGreaterThan(0);
    for (let x = 18; x <= 22; x++) for (let y = GROUND_ROW - 4; y <= GROUND_ROW - 1; y++) st.setTile(x, y, cob);
    const p = mkPlayer(w, 20);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.inputX = 1; p.inputRight = true;      // 挣扎滑行穿过网体
    let sawCobweb = false;
    for (let i = 0; i < 40; i++) {
      tick(p, w);
      const tx = Math.floor((p.x + p.w / 2) / TILE);
      const ty = Math.floor((p.y + p.h / 2) / TILE);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 0; dy++) {
        if (st.inBounds(tx + dx, ty + dy) && st.type[st.idx(tx + dx, ty + dy)] === cob) sawCobweb = true;
      }
      expect(p.buffs.has(BuffType.Webbed), '蛛网内不得出现 buff 98（无续期/无授予链）').toBe(false);
    }
    expect(sawCobweb, '前置自证：身体须真实泡进蛛网格').toBe(true);
  });

  it('授予面数据锚：吐网 472 → Webbed(149) Next(30,150)（Projectile.cs:12175）', async () => {
    const sp = (await import('../src/data/vanilla-statusplayer.json')).default as unknown as Record<string, { b: number; d: number | { n: [number, number] } }>;
    const e = sp['472'];
    expect(e, '472 必须在 StatusPlayer 表').toBeTruthy();
    expect(e.b).toBe(149);
    expect(e.d).toEqual({ n: [30, 150] });   // Main.rand.Next(30,150)=30-149t
  });
});

// ---------------------------------------------------------------------------
describe('MV2② 债②：webbed 宽面封输入（CCed :25432-25446 全控制清零+gravDir=1）', () => {
  it('webbed 拍六控制面全清零（jump/up/down/left/right/inputX）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.buffs.apply(BuffType.Webbed, 2);
    p.inputX = 1; p.inputLeft = true; p.inputRight = false;
    p.inputJump = true; p.inputUp = true; p.inputDown = true;
    tick(p, w);
    expect(p.inputX).toBe(0);
    expect(p.inputLeft).toBe(false);
    expect(p.inputRight).toBe(false);
    expect(p.inputJump).toBe(false);
    expect(p.inputUp).toBe(false);
    expect(p.inputDown).toBe(false);
    expect(p.vx).toBe(0);                   // buff 本帧清速度（:11955-11969）不变
  });

  it('webbed 压制重力倒挂：gravitation 在场 gravDir 强制回 1（:25445 gravDir=1f）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.buffs.apply(BuffType.Gravitation, 60);   // 重力药水（:26892 gravControl 位）
    p.gravDir = -1;                             // 倒挂中遭结网
    p.buffs.apply(BuffType.Webbed, 2);
    tick(p, w);
    expect(p.gravDir, 'CCed 拍 gravDir 强制 1（:25445;重药无沿不翻转）').toBe(1);
    tick(p, w);
    expect(p.gravDir).toBe(1);
  });

  it('webbed 禁用物品（ItemCheck CCed 早退 :42924 仓内 updateUse 等价位）', () => {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    // ★BJ662（2026-10-12）updateUse 头 tickWiresRadial（BJ572）读 this.wiresRadial——Object.create 壳无构造器字段 → flowerUpdate(st=undefined) TypeError（存量桩族缺件,持物非 wire 工具走早退支,桩仅为通路）
    (g as unknown as { wiresRadial: unknown }).wiresRadial = newWiresRadialState();
    const player = new Player(50 * TILE, 90 * TILE, new Inventory());
    player.hp = 500;
    player.inv.add(iid(112), 1);            // 花火（非宝石魔法弹 → Arrow 15）
    player.inv.selected = player.inv.slots.findIndex((s) => s && s.id === iid(112));
    const added: unknown[] = [];
    g.player = player;
    g.world = new World(120, 120, 30, 'mv2-use');
    g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: (e: unknown) => added.push(e) };
    g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
    g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0] };
    g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
    g.smartCursor = { showing: false };
    g.annotateMode = false;
    g.prevSwingMouse = false;
    g.mining = null;
    g.swingHitSet = new Set<number>();
    g.swingTileCutSet = new Set<number>();
    g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
    g.playSfxFile = () => {};
    player.buffs.apply(BuffType.Webbed, 2);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(added, '结网拍物品使用必须整链禁用（对照 Frozen 同门）').toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('MV2③ 债③：滑行出口 vx==0 双键同按择向（:21570 controlLeft 优先臂）', () => {
  it('双键同按 + 外力清零：出口踢 -num15=-3（controlLeft 先于 controlRight）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };   // 克盾 dash2
    for (let i = 0; i < 10; i++) tick(p, w);
    dashRight(p, w);
    p.vx = 0;                                // 外力清零（贴墙/矿车拍等价注入）
    p.inputX = 0; p.inputLeft = true; p.inputRight = true;   // 双键同按
    tick(p, w);
    expect(p.dashDelay).toBeGreaterThan(0);  // 落冷却档
    expect(p.vx, '原版 :21570 `vx==0 && controlLeft` 先落 → -num15').toBe(-3);
  });

  it('单键右同场景 → +num15=+3（现有择向回归守卫）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };
    for (let i = 0; i < 10; i++) tick(p, w);
    dashRight(p, w);
    p.vx = 0;
    p.inputX = 1; p.inputLeft = false; p.inputRight = true;   // inputX 合值与键面一致（Game 注入同式）
    tick(p, w);
    expect(p.vx).toBe(3);
  });

  it('结网拍双键同按：输入已清 → 出口恒保持 0（②③联防;原版控制已清同相）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: iid(3097), stack: 1 };
    for (let i = 0; i < 10; i++) tick(p, w);
    dashRight(p, w);
    p.buffs.apply(BuffType.Webbed, 2);
    p.inputX = 0; p.inputLeft = true; p.inputRight = true;
    tick(p, w);
    expect(p.vx).toBe(0);
    // ★C5-B3 翻正（2026-10-06，原版 :11965-11966 dash=0 → :21221 dashDelay/dashTime
    //  即时清零）：结网拍滑行即止、无 20/30t 虚假冷却——旧期望 >0 系 C5-B3 落盘前
    //  的「滑行收敛落冷却」旧语义（mv1:215 同款翻正已先行）。
    expect(p.dashDelay).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('MV2④ 债④：prevInputX 早退态补刷（原版 :27827 无条件 + 死相 :17192）', () => {
  it('骑乘矿车拍 prevInputX 照走（修前冻结→下车后幽灵双击沿）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.ridingCart = true;                     // 矿车态早退面
    p.inputX = 1; p.inputRight = true;
    for (let i = 0; i < 5; i++) tick(p, w);
    expect(p.prevInputX, '矿车拍双击沿真值源必须照走（:27827 原版无条件）').toBe(1);
  });

  it('死亡拍 prevInputX 照走（UpdateDead :17192 releaseRight=!controlRight 同相）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.hp = 0; p.dead = true; p.respawnTimer = 100;
    p.inputX = 1; p.inputRight = true;
    for (let i = 0; i < 3; i++) tick(p, w);
    expect(p.prevInputX, '死亡相沿刷新（原版 UpdateDead :17192）').toBe(1);
  });

  it('坐姿拍 prevInputX 照走（原版坐睡不早退 Update,:27827 照刷）', () => {
    const w = plainWorld();
    const p = mkPlayer(w);
    for (let i = 0; i < 10; i++) tick(p, w);
    p.sitting = true;
    p.inputX = 1; p.inputRight = true;
    for (let i = 0; i < 3; i++) tick(p, w);
    expect(p.prevInputX).toBe(1);
  });
});

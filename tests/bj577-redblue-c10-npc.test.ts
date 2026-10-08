// ★BJ-C10（红蓝 R10 NPC 公告批 findings 清偿）判别面——F1/F2/F3 三刀。
//  定谳锚（Terarria1457 亲读,先定谳再动刀）：
//  F1 公告单口收敛（中,仅联机可见）：原版公告面全走 ChatHelper.BroadcastChatMessage
//   （本地消息列 + 联机中继,server slot=255 系统行形态）,本仓曾散走 newText/cb.onChat
//   =联机访客收不到。收敛 game.chatBroadcast 单口（=newText+net.sendCommandLine
//   channel2 中继,ClientNet.ts:1568;单机 net=null no-op=单人行为零变化）。原版锚：
//   · Boss 苏醒 HasAwoken：NPC.cs:81213/81292/81352/81372/81383/81527 + 双子 misc[48]
//     :81524 + 机械女皇 misc[107] :81518（ChatColors.BossOrEvent 175,75,255）
//   · 击败 HasBeenDefeated：NPC.cs:79840-79848；世花尖啸 misc[33] :80252；丛林焦躁
//     misc[32] :79687/:80304；困难模式 misc[15] WorldGen.cs:32000（ChatColors.World
//     50,255,130）
//   · 骷髅王嘲讽：死亡调侃 Taunt1 NPC.cs:78858 + 红帽旋冲 Taunt2-5 :22137（红 255,0,0）
//   · 到达/离开：WorldGen.cs:4949（旅行商离开 LegacyMisc.35）/:5124（HomelessArrived_N）
//     /:5165（homeless 消散 LegacyMisc.35）/:5327/:5497（HasArrived）（ChatColors.
//     NPCTravel 50,125,255）
//  F2（低,BJ542 残债）：卡位传送 tick 原版 AI_107 :64689 return——AI 余段（相位飞行
//   伺服/α 爬升/wet 清位 :65053）整段跳过,仅公共步以 noTileCollide 穿墙位移;本仓
//   fade 型曾传送 tick 即跑伺服+spawnAlpha+=20=相位早启动一拍。
//  F3（低,BJ542 残债）：相位支清湿 wet=false（原版 :65053,门 :65049-65052 之后）——
//   AI 先于液体碰撞步,浸水相位时同 tick WetCollision 重置湿位=出入水去抖周期重溅花。
//  判别力（旧码必红）：§1/§2 行为面（Game.prototype 窄视图+net.sendCommandLine spy,
//   bj569/bj467 fakeThis 同款）;§3 源锚（sw-fx42-mp-faces 先例）;§4 传送 tick Δα=0;
//   §5 相位 AI 单拍清湿（ai107ImprovedWalkers 直驱,隔离 fixedUpdate 尾液体步）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { ai107ImprovedWalkers } from '../src/entities/bossAI_dd2';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

// ============================================================================
// F1 §1 行为面：announceBossSummon / announce 走 chatBroadcast 单口（联机中继 spy）
// ============================================================================

type Line = { text: string; r: number; g: number; b: number };

/** Game.prototype 窄视图（全仓 0 处 new Game()）：cb/net/recLog 桩面 + 原型方法挂载。
 *  withChat=false 模拟 cb.onChat 缺席环境（onToast fallback 面零变化判别）。 */
function makeAnnounceFake(withChat = true) {
  const displayed: Line[] = [];
  const relayed: Line[] = [];
  const toasts: string[] = [];
  const proto = Game.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const fake: Record<string, unknown> = {
    cb: {
      onChat: withChat
        ? (text: string, r: number, g: number, b: number) => { displayed.push({ text, r, g, b }); }
        : undefined,
      onToast: (t: string) => { toasts.push(t); },
    },
    net: {
      sendCommandLine: (text: string, r: number, g: number, b: number) => { relayed.push({ text, r, g, b }); },
    },
    recLog: () => {},
    sfx: { playWav: () => {} },
    chatBroadcast: proto.chatBroadcast,
    newText: proto.newText,
  };
  return { fake, displayed, relayed, toasts, proto };
}

describe('BJ-C10 F1 §1：announceBossSummon 收敛 chatBroadcast（SpawnBoss BroadcastChatMessage）', () => {
  it('EoC(4) 苏醒公告=本地消息列 + 联机 channel2 中继（175,75,255 BossOrEvent）', () => {
    const { fake, displayed, relayed, proto } = makeAnnounceFake();
    const name = Lang.npcName(4) ?? vanillaNpc(4)?.name ?? '???';
    const expected = Lang.text('Announcement.HasAwoken', name);
    proto.announceBossSummon.call(fake, 4);
    expect(relayed).toEqual([{ text: expected, r: 175, g: 75, b: 255 }]);   // 旧码空=红
    expect(displayed).toEqual([{ text: expected, r: 175, g: 75, b: 255 }]);
  });

  it('双子(125)=misc[48]（:81524）/ 月总(398)=HasAwoken+Enemies.MoonLord（:81383）同口中继', () => {
    const a = makeAnnounceFake();
    a.proto.announceBossSummon.call(a.fake, 125);
    expect(a.relayed).toEqual([{ text: Lang.misc(48), r: 175, g: 75, b: 255 }]);
    const b = makeAnnounceFake();
    b.proto.announceBossSummon.call(b.fake, 398);
    expect(b.relayed).toEqual([{
      text: Lang.text('Announcement.HasAwoken', Lang.text('Enemies.MoonLord')),
      r: 175, g: 75, b: 255,
    }]);
  });

  it('静默集(126)零公告（SpawnBoss case-break 口径;★50 已移出=史王恒播,2026-08-19 终审）;onChat 缺席环境 onToast fallback 保持且不中继', () => {
    const silent = makeAnnounceFake();
    silent.proto.announceBossSummon.call(silent.fake, 126);
    expect(silent.relayed).toEqual([]);
    expect(silent.displayed).toEqual([]);
    const toast = makeAnnounceFake(false);
    toast.proto.announceBossSummon.call(toast.fake, 4);
    expect(toast.toasts).toEqual([Lang.text('Announcement.HasAwoken', Lang.npcName(4) ?? vanillaNpc(4)?.name ?? '???')]);
    expect(toast.relayed).toEqual([]);      // fallback 面=单机 onToast 形态,零变化
  });

  it('announce() 体走 chatBroadcast（Taunt2-5/肉山召唤/骷髅王召唤三消费面同口,bossAI.ts:163 等）', () => {
    const { fake, displayed, relayed, proto } = makeAnnounceFake();
    proto.announce.call(fake, 'SkeletronText.Taunt3', '', 255, 0, 0);
    expect(relayed).toEqual([{ text: Lang.text('SkeletronText.Taunt3', ''), r: 255, g: 0, b: 0 }]);
    expect(displayed).toEqual([{ text: Lang.text('SkeletronText.Taunt3', ''), r: 255, g: 0, b: 0 }]);
  });
});

// ============================================================================
// F1 §3 源锚（sw-fx42-mp-faces 先例：Game 体量大,公告面以源锚+§1 行为面合围）
// ============================================================================

describe('BJ-C10 F1 §3：Game.ts 各公告面单口源锚', () => {
  const src = readFileSync('src/core/Game.ts', 'utf8');
  const srcBoss = readFileSync('src/entities/bossAI.ts', 'utf8');

  it('HasBeenDefeated 三分支走 chatBroadcast（NPC.cs:79840-79848）,旧 newText 面退役', () => {
    const i = src.indexOf('const defeatVid = this.boss.vanillaId ?? 0;');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('const twinsPart', i));
    expect(body).toContain("this.chatBroadcast(Lang.text('Announcement.HasBeenDefeated_Plural'");
    expect(body).toContain("this.chatBroadcast(Lang.text('Announcement.HasBeenDefeated_Single'");
    expect(body).not.toContain('this.newText(');
  });

  it('事件世界消息 misc[33]/[32]×2/[15] 走 chatBroadcast（:80252/:80304/:79687/WorldGen.cs:32000）', () => {
    expect(src).toContain('this.chatBroadcast(Lang.misc(33), 50, 255, 130)');
    expect(src).not.toContain('this.newText(Lang.misc(33)');
    expect(src.match(/this\.chatBroadcast\(Lang\.misc\(32\), 50, 255, 130\)/g)?.length).toBe(2);
    expect(src).not.toContain('this.newText(Lang.misc(32)');
    expect(src).toContain('this.chatBroadcast(Lang.misc(15), 50, 255, 130)');
    expect(src).not.toContain('this.newText(Lang.misc(15)');
  });

  it('骷髅王 Taunt1 走 chatBroadcast（:78858）+红帽旋冲经 announce 单口（bossAI.ts:163,:22137）', () => {
    expect(src).toContain("this.chatBroadcast(Lang.text('SkeletronText.Taunt1'), 255, 0, 0)");
    expect(src).not.toContain("this.newText(Lang.text('SkeletronText.Taunt1')");
    expect(srcBoss).toContain('.announce?.(`SkeletronText.Taunt${num182}`');   // 路由面在 Game.announce
  });

  it('到达/离开八面走 chatBroadcast（WorldGen.cs:4949/:5124/:5165/:5327/:5497）', () => {
    expect(src).toContain("this.chatBroadcast(Lang.text('LegacyMisc.35', Lang.npcName(npc.vanillaId) ?? npc.npcKey)");
    expect(src.match(/this\.chatBroadcast\(Lang\.text\('Announcement\.HasArrived', name\)/g)?.length).toBe(3);
    expect(src).toContain('this.chatBroadcast(Lang.text(`Announcement.HomelessArrived_${Math.floor(Math.random() * 6)}`, name)');
    expect(src).toContain("this.chatBroadcast(Lang.text('Announcement.HasArrived', Lang.npcName(npc.vanillaId) ?? npcKey)");
    expect(src).toContain("this.chatBroadcast(Lang.text('LegacyMisc.35', Lang.npcName(368) ?? '')");
    expect(src).toContain("this.chatBroadcast(Lang.text('Announcement.HasArrived', Lang.npcName(368) ?? '')");
    expect(src).not.toContain("this.newText(Lang.text('Announcement.HasArrived'");
    expect(src).not.toContain("this.newText(Lang.text('LegacyMisc.35'");
    expect(src).not.toContain('this.newText(Lang.text(`Announcement.HomelessArrived_');
  });

  it('Boss 苏醒直发两面（史王史莱姆雨/机械女皇 misc[107]）+announceBossSummon 闭包走单口', () => {
    expect(src.match(/if \(this\.cb\.onChat\) this\.chatBroadcast\(text, 175, 75, 255\)/g)?.length).toBe(2);
    expect(src).toContain('if (this.cb.onChat) this.chatBroadcast(Lang.misc(107), 175, 75, 255)');
    expect(src).not.toContain('this.cb.onChat(text, 175, 75, 255)');
    expect(src).not.toContain('this.cb.onChat(Lang.misc(');
    const i = src.indexOf('private announceBossSummon(');
    const body = src.slice(i, src.indexOf('const kind =', i));
    expect(body).toContain('this.chatBroadcast(text, 175, 75, 255)');
    expect(body).not.toContain('this.cb.onChat(text');
  });

  it('announce() 体=chatBroadcast（doc 注 BroadcastChatMessage 语义归一,注释与实现一致）', () => {
    const i = src.indexOf('  announce(key: string, who: string, r: number, g: number, b: number): void {');
    expect(i).toBeGreaterThan(0);
    const body = src.slice(i, src.indexOf('\n  }', i));
    expect(body).toContain('this.chatBroadcast(Lang.text(key, who), r, g, b)');
    expect(body).not.toContain('this.newText(');
  });
});

// ============================================================================
// F2/F3 §4/§5：BJ542 残债（bossAI_dd2.ts ai107ImprovedWalkers）行为面
// ============================================================================

const W = 220, H = 120, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj577-c10');
  const st = w.store;
  w.groundLevel = 24;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(w: World) {
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const hooks = {
    world: w, player: null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxWav: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    breakTile: () => {},
    scene: { zoneGraveyard: false, zoneCorrupt: false, zoneCrimson: false, zoneSandstorm: false, zoneUndergroundDesert: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, em };
}

function spawnAt(h: ReturnType<typeof makeHooks>, id: number, tx: number, feetRow = FLOOR): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, 0)!;
  e.y = feetRow * TILE - e.h;   // 底边贴指定行顶
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

describe('BJ-C10 F2 §4：传送 tick 跳过相位启动（AI_107 :64689 return,BJ542 残债）', () => {
  it('卡位传送 tick ΔspawnAlpha=0（旧码 +20=相位早一拍）,下一拍相位 +20 起臂', () => {
    const w = makeWorld();
    const h = makeHooks(w);
    // 几何：LOS 畅通但走不过去——水晶高塔（col 40,塔顶 FLOOR-18）+ 8 高墙（col 48-50）
    //  → 相位门（noLos）不成立 → 走行卡墙 → ai3==30 传送（fade 型下一拍才进相位）
    for (let wy = FLOOR - 18; wy <= FLOOR - 1; wy++) w.store.setTile(40, wy, 1);
    for (let wx = 48; wx <= 50; wx++) {
      for (let wy = FLOOR - 8; wy <= FLOOR - 1; wy++) w.store.setTile(wx, wy, 1);
    }
    const crystal = spawnAt(h, 548, 40, FLOOR - 18);
    void crystal;
    const gob = spawnAt(h, 552, 60);
    let prevX = gob.x, prevA = gob.spawnAlpha;
    let teleports = 0;
    let alphaOnTeleport: number | null = null;
    let alphaAfterTeleport: number | null = null;
    for (let i = 0; i < 700 && alphaAfterTeleport === null; i++) {
      gob.fixedUpdate(1 / 60, h.hooks);
      const jumped = Math.abs(gob.x - prevX) >= 2 * gob.w - 0.5;   // 瞬移签名（x+=facing*2w）
      if (jumped && teleports === 0) {
        teleports++;
        alphaOnTeleport = gob.spawnAlpha - prevA;    // ★F2 判别位：传送 tick 零 α 爬升
      } else if (teleports > 0 && alphaOnTeleport !== null) {
        alphaAfterTeleport = gob.spawnAlpha;         // 相位首拍起臂值
      }
      prevX = gob.x; prevA = gob.spawnAlpha;
    }
    expect(teleports).toBe(1);
    expect(alphaOnTeleport).toBe(0);                 // 旧码 +20 → 红
    expect(alphaAfterTeleport).toBe(20);             // 相位晚一拍起臂（:65054-65059）
  });
});

describe('BJ-C10 F3 §5：相位支清湿（AI_107 :65053 wet=false,BJ542 残债）', () => {
  it('相位活跃拍 AI 直驱一拍后 wet=false（旧码湿位钉死 → 红）', () => {
    const w = makeWorld();
    const h = makeHooks(w);
    // Face A 同几何：冰墙挡视线 → grounded latch 过门 → 相位直穿（无需传送链）
    for (let wx = 44; wx <= 46; wx++) {
      for (let wy = FLOOR - 20; wy <= FLOOR - 1; wy++) w.store.setTile(wx, wy, 1);
    }
    spawnAt(h, 548, 30);
    const gob = spawnAt(h, 552, 60);
    for (let i = 0; i < 90; i++) gob.fixedUpdate(1 / 60, h.hooks);   // 出生渐显毕+相位活跃
    expect(gob.spawnAlpha).toBeGreaterThan(0);      // 相位幽灵态在=相位活跃前提
    // 隔离观察：直驱 AI 单拍（不经 fixedUpdate 尾部 updateNpcLiquid——AI 先于液体步,
    // 原版序 :65053 写位在 AI 内,液体步同 tick 重置湿面不在本判别域）
    gob.wet = true;
    ai107ImprovedWalkers(gob, h.hooks, null);
    expect(gob.wet).toBe(false);                    // ★F3 判别位（旧码恒 true → 红）
  });
});

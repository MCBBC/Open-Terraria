/**
 * BJ523：火绒狐 W0 调用面 + 攻击叫声归真（BJ522 登记债①立案 → 前提再证伪,高优）。
 *
 * 【定谳主交付：BJ522 前提翻案（「原版岩浆中断后持住不复燃、须重按」）再证伪】
 *  BJ522 的推理链=「:43064 门 requires releaseUseItem;:43160 逐拍置 !controlUseItem
 *  ⇒ 按住恒假 ⇒ TryUsingFoxsparksAbility 按下沿触发 ⇒ 岩浆中断后持住不复燃」。
 *  漏读一环：**狐杖 5664/6149 是 autoReuse 武器**（Item.cs:44503/:47377
 *  `autoReuse = true; reuseDelay = 2; useStyle = 5`）,而 ItemCheck 头部
 *  ItemCheck_AutoReuseLogic（Player.cs:42980 调用 → :53514 本体）对 autoReuse 件：
 *    :53519  `if (sItem.autoReuse && !noItems) { releaseUseItem = true; ... }`
 *    :53524  fast-path `if (itemAnimation == 1 && stack > 0) itemAnimation = 0;`
 *  ⇒ releaseUseItem 在每次 :43064 门评估前被【逐拍强制 true】——「按住恒假」不成立。
 *  完整原版时序（持住,ItemCheck 先于 Projectile AI 同 tick）：
 *   · 稳态喷火：AI 能力块每拍续期 SetDummyItemTime(2)（Projectile.cs:60067-60069）
 *     ⇒ itemAnimation 恒 2 → fast-path 不触（需 ==1）→ :43064 门闭 → 不重调
 *     ⇒ ai[0] 走 1000→1004 自循环 = 4t 出弹拍（BJ521/522 建模维持）。
 *   · 岩浆拍 L：AI 顶 flag10 门 :59170-59174 杀 ai[0]=1/ai[1]=0 → 能力块跳过 =
 *     续期停 → itemAnimation 停在 1。
 *   · L+1：IC entry 1 → fast-path 归零 → :42994 ApplyReuseDelay（reuseDelay=2 兜底
 *     回填 2,一次性）→ 门闭;L+2 起：entry 1 → fast-path 归零 → reuseDelay 已耗 →
 *     :43064 门开 → **每拍重调 TryUsingFoxsparksAbility**（重写 ai[0]=1000 循环相位
 *     +ai[1]/L0/L1 清 + channel + SetDummyItemTime(2) + 叫声门查）→ AI 同拍再杀
 *     （ai[0]=1,落归位态）=「岩浆持住重臂环」。
 *   · 出岩浆首拍 E（AI 读相 !lavaWet）：ai[0]==1000（重臂环当拍已写）→ 能力块入 →
 *     **当拍 fire** ⇒ 原版 = 持住自动复燃,零重按（bj521③ t3 钉值面 = 原版语义,维持;
 *     BJ522 债① 拟议的「中断闩（出岩浆持住不复燃）」= 自造相,不落刀）。
 *   · 「须重按」的真子面：松手（controlUseItem 假 → 门必闭）后 ai[0] 经 W2 flag13 假
 *     归 0,复燃需重按沿——④ t2 钉该面。
 *  伴生（BJ522 低优观察）定谳：攻击叫声播点在 TryUsingFoxsparksAbility 体内
 *  （Player.cs:43691-43694 soundDelay<=-320 → 置 -21 + PalFoxparksAttack,声源
 *  base.Center=玩家中心）⇒ 播放面=【调用集】=按下沿 ∪ 岩浆持住重臂环;
 *  稳态喷火期 :43064 门闭 = 不调用 = **静默**。旧仓 AI 首段 foxChannel 电平挂门 =
 *  稳态期每 ~300t 重触发（-21→-320 回卷）= 自造相 → 本刀退役迁 Game 调用沿。
 *  W0 相位面（新钉）：TryUsingFoxsparksAbility 重写 ai[0]=1000 = 循环相位归位 ⇒
 *  重按/重臂后首拍即出弹（:60045 ai[0]==1000f fire）;旧仓 foxT 不归位 = 重按首拍
 *  0-3t 延迟 = 偏差 → foxAbilityPress 增 foxT=0。
 *
 * 【落刀】①foxAbilityPress += foxT=0（W0 ai[0]=1000f 相位面）②叫声消费位 AI→Game
 *  调用沿（foxAttackSoundGate 门+重置同源,once-per-tick=首狐 return 形,声源=玩家
 *  中心）③bj521③/palworld⑧ 面按本定谳重锚（钉值=原版,机制注勘误）。
 *  【登记债（新发现,未落）】a) 多狐同型：原版 TryUsingFoxsparksAbility 首狐 return
 *  （:43697）=每次调用只武装最低位一只,余狐永不出弹;本仓 foxChannel 电平驱动全部
 *  同型狐（BJ521/522 既有形）——可闻/可观偏差,另行立案。b) reuseDelay=2 一次性
 *  回填使重臂环首拍晚 1t（L+1 门闭）——角点 1t 相差,不建模。c) 1113 fourthShot
 *  （MinionProj foxT%4===0 in %4===1 块）恒假死支——R4 F3 域旧账,另行立案。
 *
 *  夹具注：世界高 160（BJ521/522 同注）;岩浆盆 col 67-68 × row 90-91（type 2）;
 *  干台 row 92（x 70-90）;岩浆读相=上拍湿段尾值 → 入岩浆次拍才触发（BJ520 t1 同相）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src', 'entities', 'MinionProj.ts'), 'utf8');
const GAME_TS = readFileSync(join(ROOT, 'src', 'core', 'Game.ts'), 'utf8');
// 反编译标杆（定谳锚,防「按感觉改回」）
const PLAYER_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Player.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const ITEM_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const PROJ_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

function makeHooks(enemies: unknown[] = []) {
  const w = new World(200, 160, 7, 'bj523');
  for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
  // 干台：row 92（x 70-90）——出岩浆复燃舞台（BJ521/522 同式）
  for (let x = 70; x <= 90; x++) w.store.setTile(x, 92, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
    player: player as never,
    enemies: () => enemies as never,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    spawnDust: () => null,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown, b: string) => void } }).entities =
    { projectiles: [], add: (e: unknown, b: string) => { added.push(e); void b; } };
  return { hooks, store: w.store, player, world: w, added };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

/** 岩浆盆（col 67-68 × row 90-91,满量 type 2——BJ521 LAVA_BASIN 同式） */
const LAVA_BASIN = (h: ReturnType<typeof makeHooks>): void => {
  for (let x = 67; x <= 68; x++) {
    for (let y = 90; y <= 91; y++) {
      const i = h.store.idx(x, y);
      h.store.liquid[i] = 255;
      h.store.liquidType[i] = 2;
    }
  }
};

// ================================================================
// ① 定谳源锚：原版反证链（autoReuse 强制 releaseUseItem）+ 仓内落点
// ================================================================
describe.skipIf(EXT_MISSING)('① 定谳源锚（原版 autoReuse 重臂链 + 仓内落刀位）', () => {
  it('原版：狐杖 5664/6149 autoReuse=true + reuseDelay=2（Item.cs case 体）', () => {
    for (const vid of [5664, 6149]) {
      const at = ITEM_CS.indexOf(`case ${vid}:`);
      expect(at, `case ${vid} 在 SetDefaults`).toBeGreaterThan(0);
      const body = ITEM_CS.slice(at, at + 1200);
      expect(body, `${vid} autoReuse`).toContain('autoReuse = true;');
      expect(body, `${vid} reuseDelay = 2`).toContain('reuseDelay = 2;');
      expect(body, `${vid} useStyle = 5`).toContain('useStyle = 5;');
    }
  });

  it('原版：ItemCheck_AutoReuseLogic 逐拍强制 releaseUseItem=true + fast-path 归零', () => {
    const at = PLAYER_CS.indexOf('private void ItemCheck_AutoReuseLogic');
    expect(at).toBeGreaterThan(0);
    const body = PLAYER_CS.slice(at, at + 900);
    expect(body, ':53519 强制 releaseUseItem=true（「按住恒假」证伪锚）').toContain('releaseUseItem = true;');
    expect(body, ':53524 fast-path itemAnimation==1→0').toContain('itemAnimation = 0;');
    // 调用位先于 :43064 起手门（ItemCheck :42980）
    const call = PLAYER_CS.indexOf('ItemCheck_AutoReuseLogic(item);');
    const gate = PLAYER_CS.indexOf('if (controlUseItem && releaseUseItem && itemAnimation == 0');
    expect(call).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(call);
  });

  it('原版：AI 续期 SetDummyItemTime(2)（能力块内）+ 岩浆杀门 ai[0]=1（续期源断）', () => {
    expect(PROJ_CS, ':60068 能力块内续期（稳态期门闭真因）').toContain('player2.SetDummyItemTime(2);');
    const at = PROJ_CS.indexOf('bool flag10 = flag6 | flag8;');   // AI_026 flag10 唯一声明（:59169）
    expect(at).toBeGreaterThan(0);
    const gate = PROJ_CS.indexOf('if (flag10)', at);              // 声明后的第一处 if(flag10)=逃逸门
    const body = PROJ_CS.slice(gate, gate + 200);
    expect(body, ':59170-59175 岩浆逃逸门').toContain('if (lavaWet)');
    expect(body).toContain('ai[0] = 1f;');
    expect(body).toContain('ai[1] = 0f;');
  });

  it('仓内落点：W0 调用面扩形 + 叫声门 + 旧电平形退役', () => {
    // Game 调用面（按下沿 ∪ 岩浆持住重臂环）
    expect(GAME_TS).toContain('const foxW0 = (inp.mouseDown && !this._prevMouseDown) || m.foxLavaHold;');
    expect(GAME_TS).toContain('if (foxW0) m.foxAbilityPress();');
    expect(GAME_TS).toContain('if (foxW0 && !foxAttackSfxDone && m.foxAttackSoundGate()) {');
    expect(GAME_TS, '声源=玩家中心（base.Center :43694）')
      .toContain("this.playSfxWav('pal_foxparks_attack', 0.18, this.player.cx, this.player.cy);");
    // MinionProj：相位归位 + 叫声门本体 + 旧 AI 电平触发退役
    expect(MINION_TS).toContain('foxAbilityPress(): void { this.shootCd = 0; this.a026L0 = 0; this.foxT = 0; }');
    expect(MINION_TS).toContain('foxAttackSoundGate(): boolean {');
    expect(MINION_TS).toContain('if (this.foxSoundCd > -320) return false;');
    expect(MINION_TS, '旧 AI 电平叫声触发退役（稳态静默面）')
      .not.toContain('if (this.foxChannel && this.foxSoundCd <= -320)');
  });
});

// ================================================================
// ② W0 相位面：foxT 归位 ⇒ 重按/重臂后首拍即出弹（ai[0]=1000f :60045 同相）
// ================================================================
describe.skipIf(EXT_MISSING)('② W0 循环相位面（foxT 归位）', () => {
  it('重按 immediacy：残留 foxT=2 下 W0 → 首个喷火拍即出弹', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    priv(m).foxT = 2;                                 // 上一次循环残留（BJ523 判别注入）
    m.foxAbilityPress();                              // W0（Game 按下沿/重臂环同款）
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.fixedUpdate(1, h.hooks);
    expect(priv(m).foxT, '喷火拍 foxT 0→1').toBe(1);
    expect(h.added.length, '首拍出弹（旧形 ++foxT=3≠1 延迟 0-3t → 红）').toBe(1);
    expect(h.added[0]).toBeInstanceOf(Arrow);
    expect((h.added[0] as Arrow).projId).toBe(1106);
  });

  it('稳态期不归位：持住 8t foxT 自由推进至 8（W0 只在调用沿,门闭期不重写）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    for (let t = 0; t < 8; t++) m.fixedUpdate(1, h.hooks);
    expect(priv(m).foxT, '稳态 foxT=8（ai[0] 自循环 1000→1004→1000 同相）').toBe(8);
    expect(h.added.length, '8t 两发（foxT 1/5）').toBe(2);
  });

  it('岩浆持住重臂环：持住期每拍重调（foxT 归位）⇒ 出岩浆首拍即出弹（原版同相）', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);   // 盒心浸岩浆
    m.fixedUpdate(1, h.hooks);                                  // 湿段置 lavaWet（读相次拍生效）
    expect(priv(m).lavaWet).toBe(true);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    priv(m).foxT = 2;                                           // 入岩浆前循环残留
    // 持住重臂环（Game foxW0 第二析取折算,内联复刻=bj522 释放臂先例）：无按下沿,
    // 纯 foxLavaHold 驱动 → foxAbilityPress 每拍重调（foxT 归位+清两槽）
    for (let t = 0; t < 3; t++) {
      m.x = 1076; m.y = 90 * 16;                                // 逐拍钉回岩浆位（归位飞行会移位）
      if (m.foxLavaHold) m.foxAbilityPress();                   // ★BJ523 重臂环（无沿）
      m.fixedUpdate(1, h.hooks);
      expect(h.added.length, `岩浆拍 ${t + 1} 零出弹（喷火支被 lavaWetAi 门跳过）`).toBe(0);
    }
    expect(priv(m).foxT, '重臂环归位').toBe(0);
    expect(priv(m).a026A0, '岩浆拍 ai[0]=1 归位态（:59174）').toBe(1);
    // 出岩浆：钉干台;首拍读相仍真（上拍岩浆值）→ 中断;湿段 !wet 三清
    m.x = 76 * 16; m.y = 90 * 16;
    m.fixedUpdate(1, h.hooks);
    // 次拍读相假 → 喷火支入 → ++foxT=1 → 首拍即出弹（原版 ai[0]==1000 当拍 fire）
    m.fixedUpdate(1, h.hooks);
    expect(h.added.length, '出岩浆首拍即出弹（零延迟=原版重臂环相位面;旧形残留 foxT 延迟 0-3t → 红）').toBe(1);
  });
});

// ================================================================
// ③ 攻击叫声调用面（Game foxW0 沿查门;once-per-tick;岩浆环节拍）
// ================================================================
describe.skipIf(EXT_MISSING)('③ 攻击叫声调用面（foxAttackSoundGate × foxW0）', () => {
  it('按下沿调用：门开即一响+重置 -21;持住期（无沿、非岩浆）不再查门', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    const wav: string[] = [];
    const sfx = (f: string) => { wav.push(f); };
    priv(m).foxSoundCd = -400;                        // 出场 320t+ 已过回卷窗
    // Game 内联复刻：按下沿拍
    let foxAttackSfxDone = false;
    const edge = true;
    const foxW0 = edge || m.foxLavaHold;
    if (foxW0) m.foxAbilityPress();
    if (foxW0 && !foxAttackSfxDone && m.foxAttackSoundGate()) {
      foxAttackSfxDone = true;
      sfx('pal_foxparks_attack');
    }
    expect(wav, '按下沿一响').toEqual(['pal_foxparks_attack']);
    expect(priv(m).foxSoundCd, '重置 -21').toBe(-21);
    // 持住期（edge=false、foxLavaHold=false）→ foxW0 假 → 不查门（稳态静默）
    const w1 = (false || m.foxLavaHold);
    if (w1 && !foxAttackSfxDone && m.foxAttackSoundGate()) sfx('pal_foxparks_attack');
    expect(wav.length, '稳态持住不重触发（旧形每 ~300t 重响=自造相）').toBe(1);
  });

  it('岩浆持住重臂环：首拍查门即响,回卷窗内（-21 起 298 拍）不重响', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);
    m.fixedUpdate(1, h.hooks);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    const wav: string[] = [];
    let foxAttackSfxDone = false;
    for (let t = 0; t < 40; t++) {
      m.x = 1076; m.y = 90 * 16;
      // Game foxW0 折算（持住无沿 → 纯 foxLavaHold 环）
      if (m.foxLavaHold && !foxAttackSfxDone && m.foxAttackSoundGate()) {
        foxAttackSfxDone = true;
        wav.push('pal_foxparks_attack');
      }
      m.fixedUpdate(1, h.hooks);
    }
    expect(wav, '新召狐（soundDelay 自 0 起算未达 -320）→ 重臂环查门但门闭=静默（原版 :43691 同相）').toEqual([]);
    // 预置已过回卷窗的狐 → 环首拍即响
    const m2 = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);
    m2.fixedUpdate(1, h.hooks);
    priv(m2).foxSoundCd = -400;
    const wav2: string[] = [];
    let done2 = false;
    for (let t = 0; t < 5; t++) {
      m2.x = 1076; m2.y = 90 * 16;
      if (m2.foxLavaHold && !done2 && m2.foxAttackSoundGate()) { done2 = true; wav2.push('pal_foxparks_attack'); }
      m2.fixedUpdate(1, h.hooks);
    }
    expect(wav2, '回卷窗已开 → 重臂环首拍一响').toEqual(['pal_foxparks_attack']);
    expect(done2, 'once-per-tick+once-per-episode（重置 -21 后 298 拍内不再响）').toBe(true);
  });

  it('多狐同型：每调用拍至多一声（原版首狐 return 形 :43697——foxAttackSfxDone 门）', () => {
    const h = makeHooks();
    const a = minion(h.player, 1094, h.player.cx + 100, h.player.cy);
    const b = minion(h.player, 1094, h.player.cx + 200, h.player.cy);
    priv(a).foxSoundCd = -400; priv(b).foxSoundCd = -400;
    const wav: string[] = [];
    let foxAttackSfxDone = false;
    for (const m of [a, b]) {                          // Game 迭代序=首狐先
      if (!foxAttackSfxDone && m.foxAttackSoundGate()) {
        foxAttackSfxDone = true;
        wav.push('pal_foxparks_attack');
      }
    }
    expect(wav, '每调用拍一声（多狐全spray偏差=登记债,声响面归真）').toHaveLength(1);
    expect(priv(b).foxSoundCd, '次狐门未被消费（首狐 return 形）').toBe(-400);
  });
});

// ================================================================
// ④ 复燃守恒（BJ521③ t3 面 + 「须重按」真子面=松手后）
// ================================================================
describe.skipIf(EXT_MISSING)('④ 复燃守恒（自动复燃=原版;松手后须重按）', () => {
  it('持住穿越岩浆：出岩浆首拍自动复燃（含重臂环全链,BJ521③ t3 守恒面）', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);
    m.fixedUpdate(1, h.hooks);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.x = 1076; m.y = 90 * 16;
    if (m.foxLavaHold) m.foxAbilityPress();           // 重臂环（持住,无沿）
    m.fixedUpdate(1, h.hooks);
    expect(h.added.length, '岩浆拍零出弹').toBe(0);
    m.x = 76 * 16; m.y = 90 * 16;                      // 出岩浆
    m.fixedUpdate(1, h.hooks);                         // 读相仍真 → 中断拍
    m.fixedUpdate(1, h.hooks);                         // 读相假 → 复燃
    expect(h.added.length, '持住自动复燃（BJ522 债①「须重按」证伪守恒锚）').toBe(1);
  });

  it('松手后须重按：岩浆中松手 → 出岩浆不復燃;重按沿即复燃（「须重按」真子面）', () => {
    const h = makeHooks();
    LAVA_BASIN(h);
    const m = minion(h.player, 1094, 1076 + 9, 90 * 16 + 9);
    m.fixedUpdate(1, h.hooks);
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.x = 1076; m.y = 90 * 16;
    if (m.foxLavaHold) m.foxAbilityPress();
    m.fixedUpdate(1, h.hooks);
    m.foxChannel = false;                              // 松手（controlUseItem 假 → 门必闭）
    m.x = 76 * 16; m.y = 90 * 16;                      // 出岩浆
    for (let t = 0; t < 3; t++) m.fixedUpdate(1, h.hooks);
    expect(h.added.length, '松手出岩浆不復燃（ai[0]=1 归位/idle）').toBe(0);
    m.foxAbilityPress();                               // 重按沿（W0）
    m.foxChannel = true; m.foxAimX = 1; m.foxAimY = 0;
    m.fixedUpdate(1, h.hooks);
    expect(h.added.length, '重按首拍复燃（W0 ai[0]=1000f 当拍 fire）').toBe(1);
  });
});

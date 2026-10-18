/**
 * BJ525：多狐同型武装面（BJ523 登记债 a/b/c 三件清偿/销案）。
 *
 * 【a（主面,清偿）】多狐同型武装面归真——原版 TryUsingFoxsparksAbility
 *  （Player.cs:43679-43697）for i 0..999 扫 Main.projectile 槽位序,首个
 *  active+owner+同型（1094/1113 按 normalFoxparks 配对）狐中：
 *  ai[0]=1000f + ai[1]=0f + localAI[0]/[1]=0f + netUpdate + channel=true +
 *  SetDummyItemTime(2) + 叫声门查（soundDelay<=-320 → -21 + PalFoxparksAttack）
 *  →【return true】(:43697)=【一次调用至多武装一只】;余狐 ai[0] 不触=永不入
 *  喷火环（弹侧 ai[0]>=1000 门 Projectile.cs:60014 只认武装写入;环出口 flag13
 *  :60135 只自持【已入环】者——武装调用集=按下沿∪岩浆持住重臂环∪autoReuse 门
 *  重开拍）。落刀：Game.ts 狐扫描加 foxArmed 承载位,武装面只落扫描序第一狐
 *  （entities.projectiles 插入序≈槽位序）;余狐=释放面（ai[0]=0 idle,照走
 *  ai026TailGround 地面态 1097 普通弹=原版余狐行为面）。
 *  连带（flag13 跨型熄火面）：被切离型狐（持 6149→切 5664 等）原版环出口读
 *  HeldItem 配对不符 → ai[0]=0 ≤4t 熄火;旧形 type-filter 直 continue=level 永
 *  真=永续喷火（自造相）→ 非本型狐并入释放面。
 *  【登记边界（不建模,锚此）】①本仓无 Main.projectile 槽位表——原版低槽复用
 *  （NewProjectile 取最低空槽）可在「A 死后新召 C」时改写「第一」归属（原版=C,
 *  本仓=B=召序次位）;②原版持狐死亡后 itemAnimation 排空 ≤2t 才重武装（autoReuse
 *  门重开）,本仓 level 点火同拍提前 ≤2t;③中持晋升狐的武装调用沿（叫声门查/
 *  相位清）本仓无 itemAnimation 模型不落——首召点火面（BJ521/522 level 既有形）
 *  已吞并该角点。
 * 【b（销案写锚）】reuseDelay=2 一次性回填（Player.cs:42994 → ApplyReuseDelay
 *  :53474-53476 itemAnimation=itemTime=reuseDelay; reuseDelay=0）——BJ523 判
 *  「重臂环首拍晚 1t（L+1 门闭）」。定谳=【前提不成立,销案】：
 *  · reuseDelay 全仓唯一生产者=ApplyItemAnimation 尾 `reuseDelay = sItem.reuseDelay`
 *    （:4482）,即 ItemCheck_StartActualUse 路径=召唤拍（无狐）专属;武装拍 flag4=
 *    true 跳过 StartActualUse（:43129 `if (!flag4 & flag2)`）→ 通道会话期永不续值。
 *  · 同拍序：ItemCheck_AutoReuseLogic（:42980 调用,:53524 fast-path
 *    itemAnimation==1→0）→ :42994 回填 → :43064 武装门（itemAnimation==0）。
 *    召唤动画首个 itemAnimation==0 拍（fast-path 归零拍）当拍即回填消费
 *    （reuseDelay 2→0,itemAnimation 回填 2→门闭）→ 武装门最早于【次拍】开——
 *    即武装门开拍时 reuseDelay 【恒已耗】。回填对「召唤会话首次武装」有 1t 推迟
 *    （反事实无 reuseDelay 时 fast-path 拍当拍即武装）,但该面被本仓 level 点火
 *    形（召唤拍弹尚不存在→次拍弹在即点火,远早于动画尾）整面吞并=不可观测。
 *  · 岩浆重臂环（L+1 起）：reuseDelay 已耗=0 → :42994 不回填 → 门 L+1 即开 →
 *    每拍重调——BJ523 已落的 foxLavaHold 持住拍重调形【正是原版形,零 1t 差】。
 *    「重臂环首拍晚 1t」无承载面 → 销案;本测试 §2 以源锚钉死生产者唯一性/同拍序,
 *    防未来凭感觉补 1t 压制（补=自造相）。
 * 【c（清偿）】1113 ai[1] 第 N 发循环归真——旧 fourthShot 注入挂通道 1106 支
 *  （foxT%4===0 位于 ++foxT%4===1 块内=恒假死支,R4 F3 域错置）摘除;真面=
 *  idle 态 1097 支：flag8 每发 localAI[2]--（:62742,1094/1113 双达,寄存器=
 *  本仓 palJoyCd 同窗判例）;1113 恒 num159=3,L2<=-3 → 归 0+num159=1
 *  （:62743-62751）→ NewProjectile Ai1（:62753）。消费链（Arrow.ts 既有备而未发）：
 *  foxAi1===1 && age>=30 → Kill 自爆（:5853,原版 :58265-58268）→ Kill 消亡面
 *  拆 8 枚 ai[1]=2 同型弹（:4131-4157,原版 :75779-75791）。周期=自 0 起
 *  -1/-2/-3 回卷 → 【每 3 发第 3 发】为拆弹弹（旧注「每 4 连发第 4 发」系 R4 F3
 *  误计——代码字面 -3 回卷即 3 周期,本测试按实现码钉值）。1094 无 1113 支：
 *  num159 恒 0,L2 负漂不止（joy 门 :59107 ==0 随之闭锁=原版怪癖 1:1）。
 *  通道 1106 原版无 ai[1] 机制（:60097 NewProjectile 不传 Ai1=恒 0）。
 *
 * 真值锚：Player.cs:43679-43697/:42994/:43129/:4482/:53474-53476/:53519/:53524;
 *         Projectile.cs:60014-60135/:62742-62753/:58265-58268/:75779-75791;
 *         Item.cs:44485-44505（5664）/47365-47385（6149）autoReuse+reuseDelay=2。
 * 落刀：src/core/Game.ts（狐扫描 foxArmed 位+跨型释放面）+
 *       src/entities/MinionProj.ts（fourthShot 死支摘除+ai026TailGround L2 循环
 *       +shootMinionShot Ai1 形参）。
 * 夹具注：世界高 160（BJ520/521/522/523 同注）;干台 row 92（x 50-80）;
 *         敌靶同台 +200px（曼哈顿 200<1160/800,|Δx|<630/450 开火阈内）。
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
const ARROW_TS = readFileSync(join(ROOT, 'src', 'entities', 'Arrow.ts'), 'utf8');
// 反编译标杆（定谳锚,防「按感觉改回」）
const PLAYER_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Player.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const PROJ_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Projectile.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const ITEM_CS = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(ROOT, '..', 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const w = 16, h = 24;
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hp: 100000,
    hurt: () => true,
  };
  return e;
};

function makeHooks(enemies: MockEnemy[] = []) {
  const w = new World(200, 160, 7, 'bj525');
  for (let x = 0; x < 200; x++) for (let y = 140; y < 160; y++) w.store.setTile(x, y, 1);
  // 干台：row 92（x 50-80）——ai026 尾族地面态舞台（BJ520 同式）
  for (let x = 50; x <= 80; x++) w.store.setTile(x, 92, 1);
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
  return { hooks, store: w.store, player, world: w, added, enemyList: enemies };
}

const minion = (player: Player, projId: number, cx: number, cy: number): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, false, 0, false, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

const PLAT_Y = 92 * 16;            // 1472 台面
const MX = 66 * 16;                // 1056 台上站位

/** 1097 出弹收集（按产生序） */
const shotsOf = (added: unknown[]): Arrow[] =>
  added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 1097) as Arrow[];

// ================================================================
// ① (a) 定谳源锚 + Game 武装面结构锚
// ================================================================
describe.skipIf(EXT_MISSING)('① (a) 首狐 return 定谳锚 + Game foxArmed 承载位', () => {
  it('原版：TryUsingFoxsparksAbility 首狐即 return（:43697）——一次调用至多武装一只', () => {
    const at = PLAYER_CS.indexOf('private bool TryUsingFoxsparksAbility');
    expect(at).toBeGreaterThan(0);
    const body = PLAYER_CS.slice(at, at + 760);
    expect(body, '武装写面 ai[0]=1000f').toContain('projectile.ai[0] = 1000f;');
    expect(body, 'ai[1]/localAI 双槽清').toContain('projectile.ai[1] = 0f;');
    expect(body, 'channel 置位').toContain('channel = true;');
    expect(body, 'SetDummyItemTime(2)').toContain('SetDummyItemTime(2);');
    expect(body, '叫声门 soundDelay<=-320').toContain('projectile.soundDelay <= -320');
    expect(body, '叫声 PalFoxparksAttack').toContain('SoundID.PalFoxparksAttack');
    const iT = body.indexOf('return true;');
    const iF = body.indexOf('return false;');
    expect(iT, 'return true 在循环体内（首狐即返）').toBeGreaterThan(0);
    expect(iF, 'return false 在循环后（无狐兜底）').toBeGreaterThan(iT);
  });

  it('原版：弹侧环门只认武装写入（ai[0]>=1000 :60014）+ flag13 自持只读 HeldItem/channel', () => {
    const at = PROJ_CS.indexOf('if (ai[0] >= 1000f)', PROJ_CS.indexOf('bool flag8 = type == 1094 || type == 1113;'));
    expect(at, '喷火块门 ai[0]>=1000f').toBeGreaterThan(0);
    const iFlag = PROJ_CS.indexOf('bool flag13 = (((player2.HeldItem.type == 5664 && type == 1094)');
    expect(iFlag, '环出口 flag13 读 HeldItem 配对+channel（不读「第一」归属）').toBeGreaterThan(0);
    const flagBody = PROJ_CS.slice(iFlag, iFlag + 300);
    expect(flagBody).toContain('ai[0] = (flag13 ? 1000 : 0);');
  });

  it('原版：狐杖 5664/6149 autoReuse=true + reuseDelay=2（武装拍 flag4 跳过 StartActualUse 的前提面）', () => {
    for (const vid of [5664, 6149]) {
      const at = ITEM_CS.indexOf(`case ${vid}:`);
      const body = ITEM_CS.slice(at, at + 1200);
      expect(body, `${vid} autoReuse`).toContain('autoReuse = true;');
      expect(body, `${vid} reuseDelay = 2`).toContain('reuseDelay = 2;');
    }
    const skip = PLAYER_CS.indexOf('if (!flag4 & flag2)');
    expect(skip, ':43129 武装拍跳过 StartActualUse（reuseDelay 无通道期生产者）').toBeGreaterThan(0);
    const after = PLAYER_CS.slice(skip, skip + 80);
    expect(after).toContain('ItemCheck_StartActualUse(item);');
  });

  it('仓内：Game 狐扫描 foxArmed 位——武装面只落第一狐,余狐走释放面', () => {
    expect(GAME_TS).toContain('let foxArmed = false;');
    expect(GAME_TS).toContain('const foxIsFirst = !foxArmed;');
    expect(GAME_TS).toContain('foxArmed = true;');
    expect(GAME_TS, '武装面门=channeling ∧ 首狐（余狐不触 level/W0）')
      .toContain('if (channeling && foxIsFirst) {');
    expect(GAME_TS, '非本型狐并入释放面（flag13 跨型熄火面）')
      .toContain('if (!((fVid === 5664 && m.projId === 1094) || (fVid === 6149 && m.projId === 1113))) {');
    const iGate = GAME_TS.indexOf('if (channeling && foxIsFirst) {');
    const iRel = GAME_TS.indexOf('} else if (m.foxChannel) {', iGate);
    expect(iRel, '释放面随行（余狐/停持共用）').toBeGreaterThan(iGate);
  });

  it('仓内：BJ523 已落面字节不动（W0 表达式/foxAbilityPress/叫声门/声源）', () => {
    expect(GAME_TS).toContain('const foxW0 = (inp.mouseDown && !this._prevMouseDown) || m.foxLavaHold;');
    expect(GAME_TS).toContain('if (foxW0) m.foxAbilityPress();');
    expect(GAME_TS).toContain('if (foxW0 && !foxAttackSfxDone && m.foxAttackSoundGate()) {');
    expect(GAME_TS).toContain("this.playSfxWav('pal_foxparks_attack', 0.18, this.player.cx, this.player.cy);");
    expect(MINION_TS).toContain('foxAbilityPress(): void { this.shootCd = 0; this.a026L0 = 0; this.foxT = 0; }');
    expect(MINION_TS).toContain('if (this.foxSoundCd > -320) return false;');
    expect(MINION_TS, '旧 AI 电平叫声触发保持退役').not.toContain('if (this.foxChannel && this.foxSoundCd <= -320)');
  });

  it('仓内行为面：余狐（foxChannel 假）不喷 1106;首狐电平照喷（BJ521/522 守恒）', () => {
    // 余狐面：foxChannel=false → 喷火块门不入 → 零出弹（Game 武装面归真后的余狐态）
    const h1 = makeHooks();
    const m1 = minion(h1.player, 1094, h1.player.cx + 100, h1.player.cy);
    m1.foxAimX = 1; m1.foxAimY = 0;
    for (let t = 0; t < 8; t++) m1.fixedUpdate(1, h1.hooks);
    expect(h1.added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 1106).length,
      'foxChannel 假=永不出 1106（余狐 idle 形）').toBe(0);
    // 首狐面：foxChannel=true → 4t 环出弹守恒（bj523 ② 同款轻钉）
    const h2 = makeHooks();
    const m2 = minion(h2.player, 1094, h2.player.cx + 100, h2.player.cy);
    m2.foxChannel = true; m2.foxAimX = 1; m2.foxAimY = 0;
    for (let t = 0; t < 8; t++) m2.fixedUpdate(1, h2.hooks);
    expect(h2.added.filter((e) => e instanceof Arrow && (e as Arrow).projId === 1106).length,
      'foxChannel 真=8t 两发（4t 环）').toBe(2);
  });
});

// ================================================================
// ② (b) 销案锚：reuseDelay 回填对重臂环零推迟（生产者唯一性+同拍序）
// ================================================================
describe.skipIf(EXT_MISSING)('② (b) reuseDelay 销案锚：生产者唯一 + 同拍序 + 环零 1t', () => {
  it('原版：reuseDelay 唯一生产者=ApplyItemAnimation（:4482）——召唤拍专属,武装拍不产', () => {
    const n = PLAYER_CS.split('reuseDelay = sItem.reuseDelay;').length - 1;
    expect(n, '全函数唯一赋值站（StartActualUse→ApplyItemAnimation 路径）').toBe(1);
    const backfill = PLAYER_CS.indexOf('private void ApplyReuseDelay()');
    expect(backfill).toBeGreaterThan(0);
    const bf = PLAYER_CS.slice(backfill, backfill + 200);
    expect(bf, ':53474-53476 一次性回填三连').toContain('itemAnimation = reuseDelay;');
    expect(bf).toContain('itemTime = reuseDelay;');
    expect(bf).toContain('reuseDelay = 0;');
  });

  it('原版：同拍序 AutoReuseLogic(:42980) → 回填(:42994) → 武装门(:43064)——门开拍 reuseDelay 恒已耗', () => {
    const iCall = PLAYER_CS.indexOf('ItemCheck_AutoReuseLogic(item);');
    const iBf = PLAYER_CS.indexOf('if (itemAnimation == 0 && reuseDelay > 0)');
    const iGate = PLAYER_CS.indexOf('if (controlUseItem && releaseUseItem && itemAnimation == 0');
    expect(iCall).toBeGreaterThan(0);
    expect(iBf).toBeGreaterThan(iCall);
    expect(iGate).toBeGreaterThan(iBf);
    // fast-path 归零拍（itemAnimation==1→0）当拍即回填 → 次拍门开时 reuseDelay=0
    const arl = PLAYER_CS.indexOf('private void ItemCheck_AutoReuseLogic');
    const arlBody = PLAYER_CS.slice(arl, arl + 700);
    expect(arlBody, ':53519 autoReuse 逐拍强制 releaseUseItem=true').toContain('releaseUseItem = true;');
    expect(arlBody, ':53524 fast-path itemAnimation==1→0').toContain('itemAnimation = 0;');
  });

  it('仓内：岩浆重臂环=foxLavaHold 每拍重调（无首拍压制——补 1t 压制=自造相,销案锚）', () => {
    // 原版 L+1 拍 reuseDelay 已耗 → :42994 不回填 → :43064 门开 → 每拍重调
    // TryUsingFoxsparksAbility——本仓 foxLavaHold 直入 foxW0 即同相;任何
    // 「首拍跳过」latch 都是无承载面的自造相（判别：W0 表达式逐字钉）。
    expect(GAME_TS).toContain('const foxW0 = (inp.mouseDown && !this._prevMouseDown) || m.foxLavaHold;');
    expect(GAME_TS).not.toMatch(/foxLavaHold && ![^&|]*重臂|lavaRearmed|foxReuseLatch/);
    expect(GAME_TS).toContain('if (foxW0) m.foxAbilityPress();');
  });
});

// ================================================================
// ③ (c) 定谳源锚 + 死支摘除
// ================================================================
describe.skipIf(EXT_MISSING)('③ (c) 1113 ai[1] 循环定谳锚 + 死支摘除', () => {
  it('原版：idle 态 1097 支 L2 循环（:62742-62753）——flag8 双达 dec,1113 恒 3/-3 回卷 1', () => {
    const at = PROJ_CS.indexOf('num161 = 1097;');
    expect(at).toBeGreaterThan(0);
    const body = PROJ_CS.slice(at, at + 620);
    expect(body, ':62742 localAI[2]--（1094/1113 双达）').toContain('localAI[2]--;');
    expect(body, ':62745 num159 = 3（1113 常规发）').toContain('num159 = 3;');
    expect(body, ':62746 回卷门 <= -3f').toContain('localAI[2] <= -3f');
    expect(body, ':62748 归 0').toContain('localAI[2] = 0f;');
    expect(body, ':62749 num159 = 1（拆弹发）').toContain('num159 = 1;');
    expect(body, ':62753 NewProjectile Ai1=num159').toContain('0f, num159);');
  });

  it('原版：通道 1106 支无 ai[1]（:60085 NewProjectile 无 Ai1 实参）', () => {
    const at = PROJ_CS.indexOf('int num15 = 1106;');
    expect(at).toBeGreaterThan(0);
    const body = PROJ_CS.slice(at, at + 900);
    expect(body).toContain('NewProjectile(GetProjectileSource_FromThis(), center.X, center.Y, vector3.X, vector3.Y, num15, num16, knockBack, owner);');
    expect(body, '通道支无 num159/localAI[2] 消费').not.toContain('localAI[2]');
  });

  it('仓内：通道 1106 支死支已摘;真注入面落于 shootMinionShot（Ai1 形参直传）', () => {
    expect(MINION_TS, '恒假死支表达式摘除').not.toContain('const fourthShot');
    expect(MINION_TS, '死支写位摘除').not.toContain('if (fourthShot) flame.foxAi1 = 1;');
    expect(MINION_TS, 'shootMinionShot Ai1 形参').toContain('aimX0: number, aimY0: number, foxAi1?: number');
    expect(MINION_TS, 'Ai1 直传注入位').toContain('if (foxAi1 !== undefined) shot.foxAi1 = foxAi1;');
    expect(MINION_TS, ':62742 双达 dec').toContain('this.palJoyCd--;');
    expect(MINION_TS, ':62745 常规发 3').toContain('foxAi1Val = 3;');
    expect(MINION_TS, ':62746-62750 回卷门').toContain('if (this.palJoyCd <= -3) { this.palJoyCd = 0; foxAi1Val = 1; }');
  });

  it('仓内：Arrow 消费链备而待发（自爆门 :58265 + 拆 8 弹 :75779）', () => {
    expect(ARROW_TS).toContain('if (this.foxAi1 === 1 && this.age >= 30) { this.killNow(game); return; }');
    expect(ARROW_TS).toContain('if (this.foxAi1 === 1 && !this.hostile) {');
    expect(ARROW_TS, '拆弹子弹 ai[1]=2').toContain('sub.foxAi1 = 2;');
  });
});

// ================================================================
// ④ (c) 行为面：1113 idle 三发循环（3/3/1）+ 1094 恒 0 负漂 + 拆弹链端到端
//  （首拍相位=索敌入域+flag22 对齐 ≈25t（探针实测）,断言全走节拍/循环值面）
// ================================================================
/** 驱动至收集 n 发（相位无关;上限 240t 兜底）,返回 [发序, 发拍窗相对位] */
const driveShots = (m: MinionProj, h: ReturnType<typeof makeHooks>, n: number): Arrow[] => {
  let marks: Arrow[] = [];
  for (let t = 0; t < 240 && marks.length < n; t++) {
    m.fixedUpdate(1, h.hooks);
    marks = shotsOf(h.added);
  }
  return marks;
};

describe.skipIf(EXT_MISSING)('④ (c) 行为面：idle 1097 发射循环 + 拆弹自爆端到端', () => {
  it('1113：五发循环 foxAi1=3/3/1/3/3（L2 -1/-2/回卷 0/-1/-2）,节拍恒 cd=30', () => {
    const h = makeHooks();
    const m = minion(h.player, 1113, MX, PLAT_Y - 8);
    for (let t = 0; t < 20; t++) m.fixedUpdate(1, h.hooks);     // settle：alphaFade 255→0（17t）
    h.enemyList.push(mkEnemy(1, MX + 200, PLAT_Y - 8));          // 同台 +200px（<1160 ∧ <630 阈）
    const shots = driveShots(m, h, 5);
    expect(shots.length, '240t 内收满 5 发').toBe(5);
    expect(shots.map((s) => s.foxAi1), 'ai[1] 循环 3/3/1/3/3（每 3 发第 3 发拆弹弹;旧「第 4 发」注=误计）')
      .toEqual([3, 3, 1, 3, 3]);
    expect(priv(m).palJoyCd, 'L2 寄存器终值 -2（回卷后第 2 拍）').toBe(-2);
  });

  it('1094：恒 foxAi1=0（无 1113 支）,L2 负漂不止（joy 门闭锁=原版怪癖 1:1）', () => {
    const h = makeHooks();
    const m = minion(h.player, 1094, MX, PLAT_Y - 8);
    for (let t = 0; t < 20; t++) m.fixedUpdate(1, h.hooks);
    h.enemyList.push(mkEnemy(1, MX + 200, PLAT_Y - 8));
    const shots = driveShots(m, h, 5);
    expect(shots.length, '240t 内收满 5 发（cd 42）').toBe(5);
    expect(shots.map((s) => s.foxAi1), 'num159 恒 0（缺省不写）').toEqual([0, 0, 0, 0, 0]);
    expect(priv(m).palJoyCd, 'L2 负漂 -5（无回卷;joy ==0 门随之闭锁）').toBe(-5);
  });

  it('拆弹链端到端：foxAi1=1 弹 age>=30 自爆（原版 :58265-58268）→ 拆 8 枚 ai[1]=2 同型弹', () => {
    const h = makeHooks();
    const m = minion(h.player, 1113, MX, PLAT_Y - 8);
    for (let t = 0; t < 20; t++) m.fixedUpdate(1, h.hooks);
    h.enemyList.push(mkEnemy(1, MX + 200, PLAT_Y - 8));
    const shots = driveShots(m, h, 3);
    const bomb = shots[2];                                        // 第 3 发=拆弹弹（foxAi1=1）
    expect(bomb.foxAi1).toBe(1);
    // 钉空中静态（vy=0 → noTileCollide;1097 EU=1 → age 每拍 +2,15 拍达 30）
    bomb.vx = 0; bomb.vy = 0; bomb.x = 60 * 16; bomb.y = 60 * 16;
    const before = h.added.length;
    for (let t = 0; t < 16 && !bomb.dead; t++) {
      bomb.x = 60 * 16; bomb.y = 60 * 16;                         // 逐拍钉空位
      bomb.fixedUpdate(1, h.hooks);
    }
    expect(bomb.dead, 'age>=30 自爆（30 前 alive 面）').toBe(true);
    const subs = h.added.slice(before).filter((e) => e instanceof Arrow) as Arrow[];
    expect(subs.length, 'Kill 消亡面拆 8 枚同型弹（:75779-75791）').toBe(8);
    expect(subs.every((s) => s.projId === 1097 && s.foxAi1 === 2), '子弹 1097 ∧ ai[1]=2').toBe(true);
    expect(subs.every((s) => s.damage === Math.trunc(bomb.damage / 2)), '伤/2（int 除）').toBe(true);

    // 对照：常规发（foxAi1=3）同龄不自爆不拆弹
    const h2 = makeHooks();
    const m2 = minion(h2.player, 1113, MX, PLAT_Y - 8);
    for (let t = 0; t < 20; t++) m2.fixedUpdate(1, h2.hooks);
    h2.enemyList.push(mkEnemy(1, MX + 200, PLAT_Y - 8));
    const normal = driveShots(m2, h2, 1)[0];
    expect(normal.foxAi1).toBe(3);
    normal.vx = 0; normal.vy = 0; normal.x = 60 * 16; normal.y = 60 * 16;
    const before2 = h2.added.length;
    for (let t = 0; t < 16; t++) {
      normal.x = 60 * 16; normal.y = 60 * 16;
      normal.fixedUpdate(1, h2.hooks);
    }
    expect(normal.dead, '常规发同龄存活（自爆门只认 ai[1]==1）').toBe(false);
    expect(h2.added.length).toBe(before2);
  });
});

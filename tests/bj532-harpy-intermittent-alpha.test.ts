/**
 * BJ532 鸟妖（Harpy 48）间歇性透明——定谳锁
 *
 * 用户实报：「鸟妖不是一直透明,一会正常一会透明;当时有部分怪会部分怪不会;
 * 常态难复现,当时在使用荆鞭攻击。」（线上版本,不含本周 BJ504/509/510/512/529）
 *
 * 定谳链：
 *  1. 原版恒不透明相（1457 反编译亲读锚）：
 *     - SetDefaults（NPC.cs:9388-9400）type 48：aiStyle=14、无 alpha 写 ⇒ alpha≡0；
 *     - AI 面（aiStyle 14 块 :22954-23543）鸟妖支零 alpha 写位（湿地浮升 :23439-23450、
 *       羽毛弹幕 ai[0] 30/60/90 :23523-23543）；
 *     - FindFrame case 48 组（:75620 + 组尾 :75663-75681）：num296=5（48 号每 5t 推进）、
 *       num297=npcFrameCount[48]=6（Main.cs:67493 数组第 49 元素亲读）⇒ 6 帧循环；
 *     - GetAlpha（NPC.cs:94549+）无 48 特支 ⇒ 缺省 (255−alpha)/255 因子恒 1。
 *     ⇒ 原版鸟妖恒不透明——「原版同相」销案路径不成立,间歇性=本仓面。
 *  2. 本仓鸟妖域逐环审计（HEAD 探针 scripts/_bj532-harpy-alpha.mjs 实测）：
 *     - spawnAlpha 数据面：NPC_STATIC_ALPHA 无 48 → 出生 0;Enemy.ts 全部写点
 *       id 门控（619/621-623/13-15/169/330/172/661/四柱死亡族…）零 48 可达面;
 *       探针 420t 六体采样 spawnAlpha 取值集=[0] ⇒ 恒不透明;
 *     - 帧面：vanilla-npcs.json 48.frames=6 ≡ npcFrameCount[48];NPC_48.png
 *       100×516=6×86 整除（帧高零截断损）;六帧行全有内容（资产面清白）;
 *       vnpc 越界帧钳位（SpriteAtlas.vnpc min(count-1)）⇒ 无坏帧隐形;
 *     - 受击面：原版 atlas 主路径不消费 iframes 闪白（仅兜底路径 brightness）,
 *       探针 flash 拍与普通拍可见度无差 ⇒ 受击不产生透明;
 *     - 静态锚定场景 420t 恒可见 ⇒ HEAD 无鸟妖间歇透明复现。
 *  3. 根因定谳=accFail 弃队窗（GLShimExecutor.ts:400 「★债A 定谳仪(accFail 弃队窗,
 *     鸟妖定谳刀登记)」）：鞭攻击的 SM2 拖尾/加色批抬升 accFail 触发概率;FBO 未开窗
 *     （每帧首 flush 预解析门 'tex'/'begin' 失败窗）旧门 (hadFbo||why==='nogl')
 *     直接 popAll=队列内实体 quad 整批【静默弃】⇒ 队列成员=部分个体、降级窗节拍=
 *     间歇不可见（「一会正常一会透明」）。清偿=门撤除+无条件 degradeAcc+replay2D
 *     （宁回退不丢精灵）。弃队窗行为语义由 tests/b2-shim-executor.test.ts 债A 组
 *     （4 发）钉死——本文件只做鸟妖域相锁+弃队窗联动锚（双域绑定,防单域漂移）。
 *
 *  登记债（本刀不落,外观漂移零实害）：本仓 aiStyle 14 帧节奏恒 6t;原版 case 48 组
 *  num296=5（仅 48 号 5t,49/51/60/634 6t,BAT_SKIP_LAST 已对拍后者）——鸟妖拍翅
 *  节奏慢 20%,不涉透明;后续帧域刀顺带对拍。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VANILLA_NPCS, NPC_STATIC_ALPHA } from '../src/data/vanillaNpcs';
import { Enemy } from '../src/entities/Enemy';

const GAME_ROOT = join(__dirname, '..');

/** PNG IHDR 尺寸解析（零依赖）：签名 8B + 长度 4B + 'IHDR' 4B + width 4B + height 4B */
function pngSize(p: string): { w: number; h: number } {
  const b = readFileSync(p);
  if (b.readUInt32BE(0) !== 0x89504e47 >>> 0) throw new Error('not png');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('BJ532 鸟妖间歇性透明定谳锁', () => {
  it('原版恒不透明相:48 无静态 alpha、无出生渐显,帧数据=6（≡npcFrameCount[48],Main.cs:67493）', () => {
    expect(NPC_STATIC_ALPHA[48]).toBeUndefined();       // 原版 SetDefaults 无 alpha 写（NPC.cs:9388）
    const v = VANILLA_NPCS['48'];
    expect(v).toBeTruthy();
    expect(v.alpha).toBeUndefined();                    // 数据面无 alpha 键
    expect(v.aiStyle).toBe(14);
    expect(v.frames).toBe(6);                           // ≡ npcFrameCount[48]（FindFrame case 48 组 num297）
    // aiStyle 14 邻域对照（同 FindFrame 组,num297-- 档=frames-1,BAT_SKIP_LAST 同源）:
    for (const id of ['49', '51', '60', '634']) {
      expect(NPC_STATIC_ALPHA[Number(id)]).toBeUndefined();
    }
  });

  it('出生实体相:fromVanilla(48) spawnAlpha=0 且不进渐显链（渲染 globalAlpha≡1）', () => {
    const e = Enemy.fromVanilla(48, 40 * 16, 50 * 16)!;
    expect(e).toBeTruthy();
    expect(e.spawnAlpha).toBe(0);
    expect(e.alphaFade).toBe(false);
  });

  it('写位审计:Enemy.ts 零「48 门控」spawnAlpha 写面（部分个体的 per-NPC alpha 差源排除）', async () => {
    const src = readFileSync(join(GAME_ROOT, 'src/entities/Enemy.ts'), 'utf8');
    const lines = src.split('\n');
    // ①任何触及 spawnAlpha 的行不得以 48 为门（写/读一律——48 域 alpha 恒 0 相）
    const gated48 = lines.filter((l) => l.includes('spawnAlpha') && /===\s*48\b/.test(l));
    expect(gated48).toEqual([]);
    // ②写点总量下界冻结（当前 26 处,全部 id 门控;静默删除=回归,新增=须重审本谳）
    const writes = lines.filter((l) => /[\w\]]\.spawnAlpha\s*(?:=[^=]|\+=|-=)/.test(l));
    expect(writes.length).toBeGreaterThanOrEqual(26);
    // ③行为锁（替换脆弱的行窗启发式）:真实鸟妖实体跑 AI 全分支（常态/受击/湿态/
    //   长时巡飞）——spawnAlpha 恒 0=「写点无 48 可达面」的强判别（未来任何人给
    //   48 域加 alpha 写点,此处必红）
    const w = new (await import('../src/world/World')).World(80, 80, 42, 'bj532-harpy-alpha');
    w.groundLevel = 42;
    const hooks = {
      world: w, player: null,
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      addDamageNumber: () => {}, spawnParticles: () => {},
      spawnDrop: () => null, damagePlayer: (): number => 0,
      entities: { add: () => {} }, enemies: () => [] as unknown[],
    } as never;
    const e = Enemy.fromVanilla(48, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 240; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (t === 30) e.hurt(10, 0, 0, hooks, 0, false, 0, true);   // 鞭击模拟:iframes/flash 相
      if (t === 60) e.wet = true;                                  // 湿地浮升支（cs:23439）
      if (t === 90) e.wet = false;
      expect(e.spawnAlpha).toBe(0);                                // 恒不透明（原版相）
      expect(e.alphaFade).toBe(false);
    }
  });

  it('帧面三方对拍:PNG 100×516=6×86 整除 + vanillaFrameIdx(48) 全 6 帧循环不越界', async () => {
    const { w, h } = pngSize(join(GAME_ROOT, 'public/sprites/vanilla/NPC_48.png'));
    expect(w).toBe(100);
    expect(h).toBe(516);
    const frames = VANILLA_NPCS['48'].frames;
    expect(h % frames).toBe(0);                         // 帧高 86 零截断损（516/6）
    expect(h / frames).toBe(86);
    // 渲染端帧机（aiStyle 14 非 BAT 族）:全帧循环、恒在 [0,frames-1]
    const { vanillaFrameIdx } = await import('../src/render/Renderer');
    const e = Enemy.fromVanilla(48, 40 * 16, 50 * 16)!;
    const seen = new Set<number>();
    for (let t = 0; t < 60; t++) {
      e.animT = t;
      const f = vanillaFrameIdx(e, frames);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(frames - 1);        // 越界=vnpc 钳位掩盖的坏帧源
      seen.add(f);
    }
    expect(seen.size).toBe(frames);                     // 0..5 全帧可达（无不可达死帧）
  });

  it('债A 联动锚:accFail 弃队窗收口=degrade+replay 在位（鸟妖间歇性根因面不回潮）', () => {
    // 行为级锁在 tests/b2-shim-executor.test.ts 债A 组（'tex'/'begin'/tex2/结构锁 4 发）;
    // 此处只钉「鸟妖定谳刀登记」的清偿态不回退:
    const EXEC = readFileSync(join(GAME_ROOT, 'src/render/glshim/GLShimExecutor.ts'), 'utf8');
    expect(EXEC).not.toContain("(hadFbo || why === 'nogl')");                       // 旧静默弃队门已撤
    expect(EXEC).toContain("GLShimExecutor.accFailPreopen++");                      // 定谳仪在位
    expect(EXEC).toContain('鸟妖定谳刀登记');                                        // 登记锚不被抹
  });
});

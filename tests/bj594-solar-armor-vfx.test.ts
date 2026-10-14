// BJ594 日耀套（Solar Flare armor）视觉两面（用户实报「本体有特效还有盾牌效果也不对，
// 像是半透的比较暗」）：
// ★定谳（原版 1457 亲读）——
//   面2 盾牌（DrawPlayer_26_SolarShield,PlayerDrawLayers.cs:3128-3146）：
//     DrawData 色 = Color(255,255,255,127)【恒量支免光照】（:3135 直赋常色,不取
//     Lighting.GetColor——R1-F1 判例域）= 自发光盾,暗处恒亮。贴图 Extra[61+shields−1]
//     （:3134,1/2/3 层各一张整簇 14×30/18×36/22×42）;旋转 = (pos×(1,0.5)).ToRotation()
//     + 左朝向 π（:3137-3139）+ π/50·direction（:3140）;锚 = Position+(w/2,h/2)
//     +solarShieldPos[0]（:3141）;origin=贴图中心;shader=cBody（:3144）;门 = shields>0
//     ∧ shadow==0 ∧ !dead（:3132）。本仓旧实现画在实体窗内（compositeLight 全屏乘光
//     前）→ 暗处被乘黑 =「半透的比较暗」实reported 病灶 → 落刀 = 合成后逃逸队列
//     （solarShieldQueue,7e 域 flushSolarShieldQueue 直绘主画布）。
//   面1 本体特效（Player.cs:37371-37375 SetArmorEffectVisuals：full set head171+
//     body177+legs112 → armorEffectDrawShadow+armorEffectDrawOutlines 双旗常开）：
//     ① armorEffectDrawOutlines = 四向脉冲描边（LegacyPlayerRenderer.cs:343-372）：
//       本体位 ±(ghostFade·5,0)/(0,±ghostFade·5) 四张全玩家复制,α=×(1−ghostFade)
//       （DrawPlayer shadow=ghostFade → GetImmuneAlphaPure Color.Multiply 全通道乘,
//       Player.cs:54834-54846）;ghostFade 振荡 0.1↔0.9 步 ±0.075（:346-360,
//       Main.gamePaused 冻结;Player.ghostFade/ghostDir :1487-1489 初值 0/1）。
//     ② armorEffectDrawShadow = 三张社交残影（LegacyPlayerRenderer.cs:415-421,
//       shadow=0.5+0.2i → k=0.5/0.3/0.1;ring=UpdateSocialShadow 3 拍轮转
//       Player.cs:16699-16726）——BJ550 同机制,门扩日耀套全身。
//     原版层序 outline(:343)→残影(:415)→本体(:493)。
//   销案面（已同构,本套件钉锚防回归）：
//     · 盾球轨道 = ApplySetBonus_Solar :16258-16283（X 钉朝向 20/坐骑 52→50/54→54/
//       56,61→40;Y=半径 6 圆×相位 miscCounter/100·2π+l·2π/shields;vel=(target−pos)×0.2
//       弹簧）——本仓 Player.ts 已 1:1。
//     · 回充尘爆 = :16240-16250 16×尘6（noGravity/scale1.7/fadeIn0.5/v×5/套染料）。
//     · 贴图簇选择已同构（Extra_61/62/62 簇内盾数 1/2/3 递增,像素图证实）。
//   登记债（定谳不落刀,见 Renderer.ts BJ594 注）：日耀甲件恒色 (250,250,250)
//     （PlayerDrawSet.cs SetPassColors num4=3 钉值 → head171 :592-595/body177
//     :729-732/legs112 :790-795 colorArmor*=GetImmuneAlphaPure(250³)——自发光甲,
//     四月套全家同域）——本仓全局光照合成架构（ent 窗 lit 批）无法逐件表达,
//     精确修复需逐层采光/免光实体窗;本套件以源文锁登记。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isSolarFlareFullSet, SOLAR_FLARE_SET,
  solarOutlineStamps, advanceSolarGhostFade,
  solarShieldRotation, solarShieldTextureId, SOLAR_SHIELD_ALPHA,
  emitDashSlideDust, emitDashLaunchBurst, type BJ595DustPool,
} from '../src/entities/Player';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { statOfInternal } from '../src/data/vanillaItemStats';

const PLY = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
const RDR = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ============ 面1：本体特效（armorEffectDrawShadow + armorEffectDrawOutlines） ============

describe('BJ594 面1：日耀套全身判定（Player.cs:37371-37375）', () => {
  it('SOLAR_FLARE_SET = head 171 / body 177 / legs 112（Item.cs 2763/2764/2765 → hs/bs/ls）', () => {
    expect(SOLAR_FLARE_SET).toEqual({ head: 171, body: 177, legs: 112 });
    // 数据面对账：仓库物品表三件甲的绘制槽 = 判定集（渲染端 dollEquip 同源）
    const helm = statOfInternal(_iid(2763));
    const body = statOfInternal(_iid(2764));
    const legs = statOfInternal(_iid(2765));
    expect(helm?.hs).toBe(171);
    expect(body?.bs).toBe(177);
    expect(legs?.ls).toBe(112);
  });

  it('isSolarFlareFullSet：全身真/缺件假/邻位假（判别力）', () => {
    expect(isSolarFlareFullSet(171, 177, 112)).toBe(true);
    expect(isSolarFlareFullSet(0, 177, 112)).toBe(false);      // 缺头盔
    expect(isSolarFlareFullSet(171, 0, 112)).toBe(false);      // 缺胸甲
    expect(isSolarFlareFullSet(171, 177, 0)).toBe(false);      // 缺腿甲
    expect(isSolarFlareFullSet(170, 176, 111)).toBe(false);    // 星云套邻位（num3 族）
    expect(isSolarFlareFullSet(172, 178, 113)).toBe(false);    // +1 邻位
  });
});

describe('BJ594 面1：armorEffectDrawOutlines 四向脉冲描边（LegacyPlayerRenderer.cs:343-372）', () => {
  it('stamps = 4 向 ±(ghostFade·5),α=×(1−ghostFade)（:361 num2 / :372 shadow=ghostFade）', () => {
    const s = solarOutlineStamps(0.5);
    expect(s).toHaveLength(4);
    expect(s[0]).toEqual({ ox: 2.5, oy: 0, k: 0.5 });    // default: (num2,0)
    expect(s[1]).toEqual({ ox: -2.5, oy: 0, k: 0.5 });   // case 1
    expect(s[2]).toEqual({ ox: 0, oy: 2.5, k: 0.5 });    // case 2
    expect(s[3]).toEqual({ ox: 0, oy: -2.5, k: 0.5 });   // case 3
    // 端点：fade=0.1（亮相,紧贴）vs 0.9（弱相,散开）
    const near = solarOutlineStamps(0.1);
    expect(near[0].ox).toBeCloseTo(0.5);
    expect(near[0].k).toBeCloseTo(0.9);
    const far = solarOutlineStamps(0.9);
    expect(far[0].ox).toBeCloseTo(4.5);
    expect(far[0].k).toBeCloseTo(0.1);
  });

  it('ghostFade 振荡步进 0.075/钳 0.1..0.9/回弹换向（:346-360）；paused 冻结', () => {
    // 初值 0（Player.cs:1487）首帧 0.075<0.1 钳入 0.1
    expect(advanceSolarGhostFade(0, 1, false)).toEqual({ fade: 0.1, dir: 1 });
    // 常规推进
    expect(advanceSolarGhostFade(0.1, 1, false)).toEqual({ fade: 0.175, dir: 1 });
    // 上沿回弹：>0.9 → dir=−1/fade=0.9
    expect(advanceSolarGhostFade(0.9, 1, false)).toEqual({ fade: 0.9, dir: -1 });
    // 下沿回弹：<0.1 → dir=1/fade=0.1
    expect(advanceSolarGhostFade(0.1, -1, false)).toEqual({ fade: 0.1, dir: 1 });
    // paused 原样（Main.gamePaused 门 :347）
    expect(advanceSolarGhostFade(0.33, -1, true)).toEqual({ fade: 0.33, dir: -1 });
  });

  it('渲染端接线：outline 块先于 BJ550 残影块（原版 :343<:415 层序）、门/暂停镜像/字段', () => {
    const atOutline = RDR.indexOf('solarOutlineStamps(p.ghostFade)');
    const atGhost = RDR.indexOf('downDashGhostStamps(p, p.shadowRing())');
    expect(atOutline).toBeGreaterThan(-1);
    expect(atGhost).toBeGreaterThan(-1);
    expect(atOutline).toBeLessThan(atGhost);                       // 层序
    // outline 块 gate = isSolarFlareFullSet(dollEquip 三位)
    expect(RDR).toContain('const solarSetFull = isSolarFlareFullSet(');
    // 残影门扩日耀套（armorEffectDrawShadow 第二置位支 :37371-37375）
    expect(RDR).toContain('if (p.isDownDashing || solarSetFull) {');
    // ghostFade 渲染端步进带暂停镜像（Main.gamePaused=本仓 _worldPaused）
    expect(RDR).toContain('advanceSolarGhostFade(p.ghostFade, p.ghostDir, this._worldPaused)');
    // Player 持久字段（Player.cs:1487-1489 初值 0/1）
    expect(PLY).toMatch(/ghostFade = 0;/);
    expect(PLY).toMatch(/ghostDir = 1;/);
    // canvas 等价习语：brightness(k)+globalAlpha(k)（GetImmuneAlphaPure Color.Multiply 全通道乘）
    // ★2026-10-12 结构刀后：四印同 k 亮度栈一次烘进 solarStampScratch（scx.filter
    //   brightness 单次,drawImage 12→7）——逐印=globalAlpha×s.k 平绘。锁新式。
    expect(RDR).toMatch(/scx\.filter = `brightness\(\$\{s0\.k\}\)`/);
    expect(RDR).toMatch(/ctx\.globalAlpha \*= s\.k;/);
  });
});

// ============ 面2：盾牌（DrawPlayer_26_SolarShield 恒量支免光照） ============

describe('BJ594 面2：盾牌贴图/旋转/α 语义锁（PlayerDrawLayers.cs:3128-3146）', () => {
  it('贴图 = Extra[61 + shields − 1]（:3134 整簇 1/2/3 层）', () => {
    expect(solarShieldTextureId(1)).toBe(61);
    expect(solarShieldTextureId(2)).toBe(62);
    expect(solarShieldTextureId(3)).toBe(63);
  });

  it('旋转 = atan2(y·0.5, x) + 左朝向 π + π/50·dir（:3136-3140）', () => {
    // 右向静止相位：pos=(20,0) → atan2(0,20)=0；+π/50·1
    expect(solarShieldRotation({ x: 20, y: 0 }, 1)).toBeCloseTo(Math.PI / 50);
    // 左向：+π 后再 +π/50·(−1)
    const left = solarShieldRotation({ x: 20, y: 0 }, -1);
    expect(left).toBeCloseTo(Math.PI - Math.PI / 50);
    // Y 摆动 ×0.5 压扁（pos.y=6 → atan2(3,20)）
    const bob = solarShieldRotation({ x: 20, y: 6 }, 1);
    expect(bob).toBeCloseTo(Math.atan2(3, 20) + Math.PI / 50);
    // 坐标系负域（弹簧未收敛 transient,x<0）
    const neg = solarShieldRotation({ x: -20, y: 0 }, 1);
    expect(neg).toBeCloseTo(Math.PI + Math.PI / 50);
  });

  it('α 恒量支 = Color(255,255,255,127) → 127/255（:3135,免光照自发光）', () => {
    expect(SOLAR_SHIELD_ALPHA).toBeCloseTo(127 / 255);
  });

  it('落刀：盾球收集→合成后逃逸队列冲刷（实体窗内不再直绘）', () => {
    // 收集位 = drawPlayer 内（mntHidden/dead 门保留 :3132 同构）
    expect(RDR).toMatch(/if \(p\.solarShields > 0 && !p\.dead && !mntHidden\) \{[\s\S]{0,800}?solarShieldQueue\.push\(/);
    // 冲刷位 = 7e 域（flushWingGlow 之后消费=合成后直绘主画布）
    const atFlushCall = RDR.indexOf('this.flushSolarShieldQueue(cam, z);');
    const atWingCall = RDR.indexOf('this.flushWingGlow(cam, z);');
    expect(atFlushCall).toBeGreaterThan(atWingCall);
    expect(atFlushCall).toBeGreaterThan(RDR.indexOf('this.compositeLight('));
    // 冲刷实现 = worldToScreen 直绘 + SOLAR_SHIELD_ALPHA
    expect(RDR).toMatch(/private flushSolarShieldQueue\(cam: Camera, z: number\): void \{[\s\S]{0,900}?ctx\.globalAlpha = SOLAR_SHIELD_ALPHA;/);
    // 逐帧队列重建（wingGlow/eyebrella 同族）
    expect(RDR).toContain('this.solarShieldQueue.length = 0;   // ★BJ594 日曜盾球队列逐帧重建');
    // 翻转语义保留：facing=−1 → scale(−1,1)（playerEffect 水平翻转,旋转后纹理空间）
    expect(RDR).toMatch(/ctx\.rotate\(e\.rot\);[\s\S]{0,80}if \(e\.facing === -1\) ctx\.scale\(-1, 1\);/);
  });
});

// ============ 销案锚：已同构面（防回归） ============

describe('BJ594 销案锚：盾球轨道/回充尘爆已同构（Player.ts 既有移植）', () => {
  it('轨道弹簧 = vel=(target−pos)×0.2,X 钉朝向 20（坐骑 52/54/56,61 推远）', () => {
    // ApplySetBonus_Solar :16258-16283 1:1 移植锚（本仓 Player.ts updateArmorSets 段）
    expect(PLY).toContain('vel.x = (tx - pos.x) * 0.2;');
    expect(PLY).toContain('vel.y = (ty0 - pos.y) * 0.2;');
    expect(PLY).toContain('let tx = this.facing * 20;');
    expect(PLY).toContain("else if (mntType === 56 || mntType === 61) tx = this.facing * 40;");
  });

  it('回充尘爆 = 16×尘6 noGravity/scale1.7/fadeIn0.5/v×5（:16240-16250）', () => {
    expect(PLY).toMatch(/for \(let j = 0; j < 16; j\+\+\) \{[\s\S]{0,300}?vanillaDust[\s\S]{0,300}?1\.7\)/);
    expect(PLY).toMatch(/d\.noGravity = true; d\.fadeIn = 0\.5;/);
    expect(PLY).toContain('d.vx *= 5; d.vy *= 5;');
  });
});

// ============ 面1 补：dash3 日曜冲撞尘（BJ595 台账 S3 移交） ============

interface RecDust {
  x: number; y: number; vx: number; vy: number; scale: number;
  fadeIn: number; noGravity: boolean; dyeVid: number;
  box: { x: number; y: number; w: number; h: number }; type: number; alpha: number;
}
function stubPool(): BJ595DustPool & { spawns: RecDust[] } {
  const spawns: RecDust[] = [];
  return {
    spawns,
    spawn(x: number, y: number, w: number, h: number, type: number,
      speedX = 0, speedY = 0, alpha = 0,
      _color: { r: number; g: number; b: number; a: number } | null = null, scale = 1) {
      const d: RecDust = {
        x, y, vx: speedX, vy: speedY, scale, fadeIn: 0, noGravity: false, dyeVid: -1,
        box: { x, y, w, h }, type, alpha,
      };
      spawns.push(d);
      return d as unknown as import('../src/fx/VanillaDust').VDust;
    },
  };
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DP = { x: 10, y: 20, w: 20, h: 42, cx: 20, cy: 41, vx: 0, vy: 0 };

describe('BJ594 面1 补：dash3 日曜冲撞尘（Player.cs:21461-21478 滑行 / :21641-21652 起爆）', () => {
  it('滑行：4×尘6/拍,盒=(x, y+4·num18)×(w, h−trunc(8·num18)),vel×0.1,s1.7×(1+Next20·.01),noGravity+染料,50% fadeIn', () => {
    const pool = stubPool();
    const n = emitDashSlideDust(pool, DP, 3, 77, seeded(11));
    expect(n).toBe(4);
    const num18 = DP.h / 42;                 // =1
    for (const d of pool.spawns) {
      expect(d.type).toBe(6);
      expect(d.alpha).toBe(100);
      expect(d.scale).toBeGreaterThanOrEqual(1.7);        // 1.7×(1+Next(20)×.01)
      expect(d.scale).toBeLessThan(1.7 * 1.2);
      expect(d.box.y).toBeCloseTo(DP.y + 4 * num18);      // position.Y + num25
      expect(d.box.h).toBe(DP.h - Math.trunc(8 * num18)); // height − num26
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(0.22);   // NewDust ±2 ×0.1
      expect(d.noGravity).toBe(true);
      expect(d.dyeVid).toBe(77);
    }
    // 50% fadeIn 掷：seeded 流上两态都出现（判别力）
    const withFade = pool.spawns.filter((d) => d.fadeIn === 0.5).length;
    const pool2 = stubPool();
    emitDashSlideDust(pool2, DP, 3, -1, seeded(12));
    const withFade2 = pool2.spawns.filter((d) => d.fadeIn === 0.5).length;
    expect(withFade + withFade2).toBeGreaterThan(0);
    expect(withFade).toBeLessThan(4);   // 非全有（50% 掷生效）
  });

  it('起爆：20×尘6,s2×(1+Next20·.01),位抖 ±5,vel×0.2,noGravity+染料+fadeIn=.5 无条件,无 gore', () => {
    const pool = stubPool();
    let goreCalls = 0;
    const n = emitDashLaunchBurst(pool, () => { goreCalls++; return null; }, DP, 3, 88, seeded(13));
    expect(n).toBe(20);
    expect(goreCalls).toBe(0);              // dash3 无 gore 支
    for (const d of pool.spawns) {
      expect(d.type).toBe(6);
      expect(d.scale).toBeGreaterThanOrEqual(2);          // 2×(1+Next(20)×.01)
      expect(d.scale).toBeLessThan(2.4);
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(2.2);    // NewDust ±2 ×0.2
      expect(d.noGravity).toBe(true);
      expect(d.dyeVid).toBe(88);
      expect(d.fadeIn).toBe(0.5);           // 无条件（dash5 带掷,此档不带=判别面）
      expect(d.x).toBeGreaterThanOrEqual(DP.x - 5);
      expect(d.x).toBeLessThanOrEqual(DP.x + DP.w + 5);   // 位抖 ±5
    }
  });
});

// ============ 登记债锁：日耀甲件恒色 (250,250,250)（定谳不落刀） ============

describe('BJ594 登记债：自发光甲面（PlayerDrawSet SetPassColors）源文锁', () => {
  it('渲染端 BJ594 注铭记账：恒色 250 面定谳+架构边界（防无声漂移）', () => {
    // 注记锚：num4=3 钉值/三位锚行号/全局光照合成边界
    expect(RDR).toMatch(/BJ594[\s\S]{0,200}?登记债[\s\S]{0,600}?250/);
  });
});

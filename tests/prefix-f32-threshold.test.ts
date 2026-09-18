// ★红蓝-E 债（2026-09-18）prefixValueMul f32/f64 阈值翻档修复——判别力测试。
// 定谳锚（1457 反编译亲读;1458 同构,Item.cs 数值面 :1041→:1047 偏移 6 行）：
//   · Item.Prefix(:505-631) 的 num2 是 C# float（:540 `float num2 = 0f`）←
//     TryGetPrefixStatMultipliersForItem 的 out value（:710;:1041 尾公式全 float
//     运算链 + :1043-1059 配饰档位各自 value *= 1.05f/1.1f/1.15f/1.2f——逐 op 舍入）；
//     阈值把 float num2 升 double 与【double 字面量】比较（:588-604）：
//     ≥1.2 → rare+2 / ≥1.05 → +1 / ≤0.8 → −2 / ≤0.95 → −1;num2 存 float 字段
//     → 阈值读 float ⇒「乘完即 fround,每步落 float」。
//   · 本仓曾 f64 直算——1.05/0.8 踩线件翻错档（红蓝-E 全 97 件 fround 对拍实证）：
//     45 Nimble/62 Hard/69 Jagged/73 Brisk/77 Wild（配饰 1.05 档）：原版 num2 =
//     1.0499999523162842（1.05f 的 f32 舍入）< 1.05 → rare 0 位移;f64 1.05 ≥ 1.05
//     → 错 +1（白→蓝名色）。56 Weak：原版 num2 = 0.800000011920929（0.8f 的 f32
//     舍入）> 0.8 → 落 0.95 档 rare −1;f64 0.8 ≤ 0.8 → 错 −2（灰→白名色）。
//   · 修 = vanillaPrefixes.prefixValueMul 全链 Math.fround：JSON 十进制字面量先
//     fround 成原版 f32 操作数（0.95f=0.949999988079071…）,再逐 op fround（f64
//     中转对 f32 操作数精确,fround=IEEE 最近舍入）。
// 变异判别（≥2 发,全部有专属红面）：
//   M1 摘 fround（回 f64 直算）→ ① 位值红 + ② 位移对拍红（六件翻回错档）;
//   M2 末位单次 fround（错序）→ ② 位等红（23 件值漂）+ ③ 48 Large 位移红（−2→−1）;
//   M3 摘操作数 fround → ② 位等红（15 件值漂:3/11/13/19/22/23/28/30/31/34/35/48/49/55/94）
//      + ③ 48 位移红。
// 回归面：p5/sw-qd4/sw-fx60/blue-deltab 词缀族 + BJ116 重铸 tooltip 档位 + SellChain
//   卖价（itemValueWithPrefix 自带 f32 平方链,prefixValueMul 变 f32 后自动精确）。
// 运行：cd game && npx vitest run tests/prefix-f32-threshold.test.ts
import { describe, it, expect } from 'vitest';
import { prefixValueMul } from '../src/data/vanillaPrefixes';
import prefixJson from '../src/data/vanilla-prefix.json';

const f32 = Math.fround;

interface PfxStat {
  dmg: number; kb: number; spd: number; size: number; shtspd: number;
  mcst: number; crt: number; tagdmg: number; arpen: number; tier: number;
}
const S = (id: number): PfxStat => {
  const raw = (prefixJson.stats as Record<string, Partial<PfxStat>>)[String(id)] ?? {};
  return { dmg: 1, kb: 1, spd: 1, size: 1, shtspd: 1, mcst: 1, crt: 0, tagdmg: 0, arpen: 0, tier: 1, ...raw };
};

/** 修复前 f64 直算（旧实现,原样保留作对拍 oracle） */
const f64mul = (s: PfxStat): number =>
  s.dmg * (2 - s.spd) * (2 - s.mcst) * s.size * s.kb * s.shtspd
    * (1 + s.crt * 0.02) * (1 + s.arpen * 0.015) * (1 + s.tagdmg * 0.03) * s.tier;

/** 逐 op f32 oracle（Item.cs:1041 左结合乘链 + :1043-1059 档位 *=;操作数先 fround
 *  = 原版 f32 字段值;每步乘/减/加后 fround = C# float 逐 op 舍入） */
const f32mul = (s: PfxStat): number => {
  let v = f32(s.dmg);                                            // 1f * dmg
  v = f32(v * f32(2 - f32(s.spd)));                              // (2f - spd)
  v = f32(v * f32(2 - f32(s.mcst)));                             // (2f - mcst)
  v = f32(v * f32(s.size));
  v = f32(v * f32(s.kb));
  v = f32(v * f32(s.shtspd));
  v = f32(v * f32(1 + f32(f32(s.crt) * f32(0.02))));             // (1f + crt*0.02f)
  v = f32(v * f32(1 + f32(f32(s.arpen) * f32(0.015))));          // (1f + arpen*0.015f)
  v = f32(v * f32(1 + f32(f32(s.tagdmg) * f32(0.03))));          // (1f + tagdmg*0.03f)
  return f32(v * f32(s.tier));                                   // :1043-1059 档位
};

/** Item.cs:588-604 rare 位移阶梯（阈值=double 字面量,num2=float 升 double 比较） */
const rareShift = (num2: number): number =>
  num2 >= 1.2 ? 2 : num2 >= 1.05 ? 1 : num2 <= 0.8 ? -2 : num2 <= 0.95 ? -1 : 0;

// ============================================================
// ① 六件踩线翻档（阈值读 float num2——原版行为面）
// ============================================================
describe('① 六件踩线翻档（Item.cs:588-604：(double)num2 对 1.05/0.8）', () => {
  it('45/62/69/73/77 配饰 1.05 档：num2=1.0499999523…< 1.05 → rare 0 位移（f64 曾错 +1）', () => {
    for (const id of [45, 62, 69, 73, 77]) {
      const m = prefixValueMul(id);
      expect(m, `${id} num2 位值=1.05f 的 f32 舍入`).toBe(f32(1.05));   // 1.0499999523162842
      expect(rareShift(m), `${id} rare 位移 0`).toBe(0);
      expect(m < 1.05, `${id} 不踩 ≥1.05 档`).toBe(true);
    }
  });

  it('56 Weak：num2=0.8000000119…> 0.8 → 落 0.95 档 rare −1（f64 曾错 −2）', () => {
    const m = prefixValueMul(56);
    expect(m).toBe(f32(0.8));                                          // 0.800000011920929
    expect(rareShift(m)).toBe(-1);
    expect(m > 0.8, '不踩 ≤0.8 档（0.8f 升 double > 0.8 字面量）').toBe(true);
    expect(m <= 0.95).toBe(true);
  });

  it('≥1.2 档不回退：68 num2=1.2000000477 ≥ 1.2 → 仍 +2（f32 阈值向上兼容档）', () => {
    const m = prefixValueMul(68);
    expect(m).toBe(f32(1.2));                                          // 1.2000000476837158
    expect(rareShift(m)).toBe(2);
  });

  it('48 Large：2f−1.2f=0.7999999523… ≤ 0.8 → rare −2（f64 直算 0.7999999999… 同 −2;'
    + '但末位单次 fround=0.8000000119 会错 −1=错序变异红面）', () => {
    const m = prefixValueMul(48);
    expect(m).toBe(f32(2 - f32(1.2)));                                 // 0.7999999523162842
    expect(rareShift(m)).toBe(-2);
  });
});

// ============================================================
// ② 全 97 件对拍守卫（实现 vs 独立 oracle / vs 修复前 f64 直算）
// ============================================================
describe('② 全 97 件对拍（Item.cs:1041 公式 oracle + 位移翻转面恰为六件）', () => {
  it('97 件值与逐 op f32 oracle 位等（fround 摘除/错序/摘操作数任一变异即红）', () => {
    for (let id = 1; id <= 97; id++) {
      expect(prefixValueMul(id), `prefix ${id} 位等 f32 oracle`).toBe(f32mul(S(id)));
    }
  });

  it('rare 位移与 f64 直算的差集恰为六件（45/56/62/69/73/77）,其余 91 件零变化', () => {
    const expectFlip = new Map<number, number>([[45, 0], [56, -1], [62, 0], [69, 0], [73, 0], [77, 0]]);
    const flips: number[] = [];
    for (let id = 1; id <= 97; id++) {
      const a = rareShift(f64mul(S(id)));   // 修复前直算
      const b = rareShift(prefixValueMul(id));
      if (a !== b) { flips.push(id); expect(b, `prefix ${id} 翻后位移`).toBe(expectFlip.get(id)!); }
      else expect(b, `prefix ${id} 位移不变`).toBe(a);
    }
    expect(flips.slice().sort((x, y) => x - y)).toEqual([45, 56, 62, 69, 73, 77]);
  });

  it('f32 修复值贴近 f64 直算（相对误差 ≤ 2⁻²²,数据面异常哨）', () => {
    for (let id = 1; id <= 97; id++) {
      const a = f64mul(S(id));
      const b = prefixValueMul(id);
      expect(Math.abs(b - a), `prefix ${id} 值域贴近`).toBeLessThanOrEqual(Math.abs(a) * 2 ** -22 + 1e-12);
    }
  });
});

// ============================================================
// ③ 消费面回归（rare 名色 / 重铸 tooltip / topTier 同源）
// ============================================================
describe('③ 消费面锚（tooltipRareOf/showReforgeTooltip/doReforge/SellChain 同读 prefixValueMul）', () => {
  it('配饰 1.05 档件（45 Nimble）不再抬 rare 档：f32 值不过 ≥1.05 门', () => {
    // tooltipRareOf（UI.ts）阶梯与 rareShift 同构——45 落 0 位移=白名,非蓝名
    expect(prefixValueMul(45) >= 1.05).toBe(false);
  });

  it('武器档面不回退：81 Legendary mul=1.7602474689…（f32）仍过 ≥1.2 门 +2 档', () => {
    // doReforge topTier（num2==num）/BJ116 showReforgeTooltip 档位测试同读此值——
    // f32 后与 f64 直算差 ~3e-8,既有 toBeCloseTo(…,5) 面零影响
    const m81 = prefixValueMul(81);
    expect(m81).toBe(f32mul(S(81)));
    expect(m81 >= 1.2).toBe(true);
  });

  it('SellChain.itemValueWithPrefix 的 f32 平方链入参未变语义：m 为 f32 值（f32(m)=m）', () => {
    // itemValueWithPrefix 内部 f32(f32(m)*f32(m)) 假定 m 已是原版 out value（float）——
    // 修复后该前提成立;此锁防实现回漂成 f64 值再喂入平方链
    for (const id of [45, 56, 62, 68, 81]) {
      const m = prefixValueMul(id);
      expect(Math.fround(m), `prefix ${id} 已是 f32 值`).toBe(m);
    }
  });
});

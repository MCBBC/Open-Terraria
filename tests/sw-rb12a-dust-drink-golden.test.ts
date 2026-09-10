// SW-RB12a（2026-09-10 红队批）饮用/食物尘色表金标——直读反编译权威重提对拍。
//
// 背景（F3 定谳）：仓库 DRINK_PARTICLE_COLORS 曾把 4018 CreamSoda 的两色
// （(214,170,105)×0.5f / (180,132,73)×0.5f）误并在 2266 Sake 键名下（原版 2266 =
// 单色 (233,233,218)×0.3f）——Sake 尘色池 1/3 概率错色、4018 整键缺失（饮之无尘）；
// 5211 BiomeSightPotion（drink 末键）与 5645 RockCandy（food 末键）整缺。
// 金标 = Terarria1457/Terraria.ID/ItemID.cs 双表（:266 FoodParticleColors /
// :586 DrinkParticleColors,1458 同段无变更面——Sets 表非本域数值面）现场重提：
//   · 表内字面含 `new Color(r,g,b) * Nf` 折算写法（0.5/0.3）——折算值按仓库既定
//     round-half-up 惯例入表（353: 102.5→103 等已全表核对）;对拍容差 = 折算项
//     ±1/通道（截断 vs 四舍五入差）,非折算项须逐位相等;
//   · 成员表须双向全等（缺失/多余/并串三类回归全锁死——F3 即「并串」型）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOOD_PARTICLE_COLORS, DRINK_PARTICLE_COLORS } from '../src/data/vanillaFoodColors';

const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const CS = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8');

interface Entry { colors: Array<[number, number, number]>; folded: boolean[] }

function extractVanillaTable(name: string): Map<number, Entry> {
  const start = CS.indexOf(`public static Color[][] ${name}`);
  if (start === -1) throw new Error(`table ${name} not found`);
  const rest = CS.slice(start);
  const nextField = rest.slice(10).search(/\n\t\tpublic static /);
  const seg = nextField === -1 ? rest : rest.slice(0, nextField + 10);
  const out = new Map<number, Entry>();
  const re = /\(short\)(\d+), new Color\[(\d+)\]\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg))) {
    const colors: Array<[number, number, number]> = [];
    const folded: boolean[] = [];
    const cre = /new Color\((\d+),\s*(\d+),\s*(\d+)\)(?:\s*\*\s*([\d.]+)f)?/g;
    let c: RegExpExecArray | null;
    while ((c = cre.exec(m[3]))) {
      const mul = c[4] !== undefined ? parseFloat(c[4]) : 1;
      colors.push([
        Math.round(parseInt(c[1]) * mul),
        Math.round(parseInt(c[2]) * mul),
        Math.round(parseInt(c[3]) * mul),
      ]);
      folded.push(mul !== 1);
    }
    if (colors.length === Number(m[2])) out.set(Number(m[1]), { colors, folded });
  }
  return out;
}

function diffTables(name: string, vanilla: Map<number, Entry>, repo: Record<number, ReadonlyArray<readonly [number, number, number]>>): string[] {
  const bad: string[] = [];
  for (const [vid, entry] of vanilla) {
    const got = repo[vid];
    if (!got) { bad.push(`${name} ${vid}: 仓库缺键（原版 ${entry.colors.length} 色）`); continue; }
    if (got.length !== entry.colors.length) {
      bad.push(`${name} ${vid}: 色数 ${got.length} ≠ 原版 ${entry.colors.length}（并串/拆裂）`);
      continue;
    }
    for (let i = 0; i < entry.colors.length; i++) {
      const v = entry.colors[i];
      const g = got[i];
      const tol = entry.folded[i] ? 1 : 0;   // 折算项允许截断/四舍五入差 1
      if (Math.abs(v[0] - g[0]) > tol || Math.abs(v[1] - g[1]) > tol || Math.abs(v[2] - g[2]) > tol) {
        bad.push(`${name} ${vid}[${i}]: 仓库 [${g}] ≠ 原版折算 [${v}]`);
      }
    }
  }
  for (const vid of Object.keys(repo).map(Number)) {
    if (!vanilla.has(vid)) bad.push(`${name} ${vid}: 仓库多余键（原版无）`);
  }
  return bad;
}

describe('SW-RB12a 饮用/食物尘色表金标（Terarria1457 ItemID.cs 现场重提对拍）', () => {
  const vDrink = extractVanillaTable('DrinkParticleColors');
  const vFood = extractVanillaTable('FoodParticleColors');

  it('提取器自证：双表键数 = 100/63（权威段全量,无跨表渗漏）', () => {
    expect(vDrink.size, 'DrinkParticleColors 键数').toBe(100);
    expect(vFood.size, 'FoodParticleColors 键数').toBe(63);
  });

  it('仓库表 ↔ 原版双表双向全等（F3 并串/整缺三类回归锁）', () => {
    const bad = [...diffTables('drink', vDrink, DRINK_PARTICLE_COLORS),
                 ...diffTables('food', vFood, FOOD_PARTICLE_COLORS)];
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('F3 逐键定谳：2266 Sake 单色 / 4018 CreamSoda 两色(×0.5) / 5211 三色 / 5645 六色', () => {
    expect(DRINK_PARTICLE_COLORS[2266]).toEqual([[70, 70, 65]]);
    expect(DRINK_PARTICLE_COLORS[4018]).toEqual([[107, 85, 53], [90, 66, 37]]);
    expect(DRINK_PARTICLE_COLORS[5211]).toEqual([[255, 206, 237], [253, 160, 197], [251, 126, 73]]);
    expect(FOOD_PARTICLE_COLORS[5645]).toEqual([
      [255, 255, 255], [120, 207, 238], [33, 184, 115], [238, 200, 75], [233, 115, 255], [245, 46, 48],
    ]);
  });
});

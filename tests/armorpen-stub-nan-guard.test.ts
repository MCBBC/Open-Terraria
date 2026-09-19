// ★BJ184 登记债①：armorPen equipStats 消费面 ?? 0 扫平判别网（BJ175 家族续刀）。
// 背景：BJ175 已把 Player stat getter + manaCost/pickSpeed 等 26 站防御化并声明
// 「Game.ts 武器管线深处的站点由同类站点代表」。armorPen 是 equipStats 数值面
// 最大单面——消费面普查（2026-09-19 复核）：97 站 = Game.ts 92（算术直读 90 +
// 已护 2）+ WhipProj 1（三元臂）+ MountCombat 1 + MinionProj 3。测试壳
// `equipStats:{}` 桩致动 = undefined 入算术 ⇒ NaN 注入弹幕 armorPen，经弹间
// 拷贝（spore/cloud/slam/blade 系）/`+=`（Arrow:2212）/settlePen 链式放大。
// 本刀（BJ184）把算术直读 90 站（全在 Game.ts）+ WhipProj 三元臂 1 站扫
// `(x ?? 0)`（缺省 0 = 加算池语义）。★BJ171/184 括号习语：`a - x ?? 0` 解析为
// `(a - x) ?? 0`——NaN 非 nullish 防御失效，故 ?? 表达式全程加括号。
// 判别网三层：
//   ①静态站闸：5 消费文件剥注释后，每处 eq/equipStats 源 armorPen 读必须紧跟
//     `??`；Game.ts 另加括号习语闸（逐行钉 `(eq.armorPen ?? 0)` /
//     `(this.player.equipStats.armorPen ?? 0)` 两形）+ 站数钉死（新增站不防御
//     即红、防御了不改钉数也红=强制过闸复核）。
//   ②行为面：仓内唯一桶 playerArmorPenOf（MountCombat:644，本批 export 供测）
//     桩 {} → 0；汇单点 npcCheckArmorPenetration 的 |0 截断契约
//     （undefined/NaN ≡ 0——WhipProj 三元/裸 undefined 传参安全的根）；
//     真 Player computeEquipStats 缺省 armorPen=0（90 站读的真值源，桩面同值
//     =BJ175「防御不歪真档」同款）。
//   ③变异证红：M1（:13687 天顶剑 zPayload）/M2（:17861 黄蜂枪 wasp）摘 ??0 →
//     ①闸红（两发已跑全红，档案登记）。
// 不覆盖（登记）：Game.ts 90 站埋在武器使用管线深处（全仓 0 处 new Game()，
// BJ175 同款边界）——逐站判别力由①静态闸承担，行为面由②同类站点代表。
// 已护免刀站（闸内以 ?? 形在册）：Game.ts :27935/:39233（原 ?? 0，本批统一
// 加括号）；MinionProj :2826/:2958/:4330（BJ 前批已护）；MountCombat :646。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { playerArmorPenOf } from '../src/entities/MountCombat';
import { npcCheckArmorPenetration } from '../src/entities/projStatus';

/** 消费面 5 文件（equipStats 源 armorPen 读的全集——普查 2026-09-19，
 *  data/vanilla* 为生产面、其余实体文件为弹幕自身字段面（类缺省 0+汇截断），不在闸内） */
const FILES: Array<[string, number]> = [
  ['src/core/Game.ts', 92],      // 82 eq 形 + 10 this.player.equipStats 直读形
  ['src/entities/WhipProj.ts', 1],   // :626 三元臂（本批归一 ?? 0）
  ['src/entities/MountCombat.ts', 1], // :646 playerArmorPenOf 唯一桶
  ['src/entities/MinionProj.ts', 3],  // :2826/:2958/:4330
  ['src/entities/Arrow.ts', 0],       // 仅注释提及；读面=弹幕自身字段（缺省 0）
];

/** eq/equipStats 源 armorPen 读（:5138/:13536/:42003 的 miscEquips 形 eq 无
 *  armorPen 读——tsc 形状即证，不入 READ） */
const READ = /\b(?:eq|equipStats\??)\.armorPen\b/g;

/** 剥块注释+行注释（// 后全弃——URL 形 '://x' 全仓 5 文件 0 处，已核） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, '');
}

interface ScanResult {
  unguarded: string[];   // 读后非 ??（防御缺失）
  unparened: string[];   // Game.ts 括号习语缺失（?: 前无 (…?? 0) 全形）
  counts: Map<string, number>;
}

function scan(): ScanResult {
  const res: ScanResult = { unguarded: [], unparened: [], counts: new Map() };
  for (const [file] of FILES) {
    const src = stripComments(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    let n = 0;
    for (const m of src.matchAll(READ)) {
      n++;
      const rest = src.slice((m.index ?? 0) + m[0].length);
      if (!/^\s*\?\?/.test(rest)) {
        res.unguarded.push(`${file}#${n}: …${src.slice(Math.max(0, (m.index ?? 0) - 24), (m.index ?? 0) + 40)}…`);
        continue;
      }
      if (file === 'src/core/Game.ts') {
        // 括号习语：该读所在行必须含 (eq.armorPen ?? 0) 或 (this.player.equipStats.armorPen ?? 0)
        const lineStart = src.lastIndexOf('\n', m.index ?? 0) + 1;
        const lineEnd = src.indexOf('\n', m.index ?? 0);
        const line = src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        if (!/\((?:eq|this\.player\.equipStats)\.armorPen\s*\?\?\s*0\)/.test(line)) {
          res.unparened.push(`${file}#${n}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    res.counts.set(file, n);
  }
  return res;
}

describe('BJ184 armorPen 桩面 NaN 防御判别网', () => {
  it('①静态站闸：97 站全防御（?? 紧随）、Game.ts 90 刀站全括号习语、站数钉死', () => {
    const res = scan();
    expect(res.unguarded).toEqual([]);
    expect(res.unparened).toEqual([]);
    for (const [file, pin] of FILES) {
      expect(res.counts.get(file), file).toBe(pin);
    }
  });

  it('②仓内唯一桶 playerArmorPenOf：equipStats:{} 桩 → 0（非 NaN/undefined）', () => {
    const stub = { player: { equipStats: {} } } as never;
    expect(playerArmorPenOf(stub)).toBe(0);
    expect(Number.isNaN(playerArmorPenOf(stub))).toBe(false);
  });

  it('②汇单点截断契约：undefined/NaN armorPen ≡ 0（Enemy/TownNPC hurt 安全根）', () => {
    expect(npcCheckArmorPenetration(30, undefined as never)).toBe(0);
    expect(npcCheckArmorPenetration(30, Number.NaN)).toBe(0);
    expect(npcCheckArmorPenetration(30, 15)).toBe(7);   // 真值面不歪（15<30 → 15/2 截 7）
  });

  it('②真 computeEquipStats 缺省面：armorPen=0（90 站读的真值源；桩 {} 同值不歪真档）', () => {
    const p = new Player(40 * 16, 54 * 16, new Inventory());
    expect(p.equipStats.armorPen).toBe(0);
    expect(Number.isNaN(p.equipStats.armorPen)).toBe(false);
  });
});

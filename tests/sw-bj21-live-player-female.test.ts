// SW-BJ21 2026-09-07 实时链女体胸口镂空 收口回归锚。
// 定谳(scripts/_swbj21-truth-diff.mjs 烘焙域真值对拍 + PlayerDataInitializer.cs 逐值):
//  根因【变体回退链缺 CopyVariant 中段】:原版 PlayerDataInitializer.Load 把女性子
//  变体的设计缺省身体通道 CopyVariant 自【变体 4 女表】(5←4、6←4、7←4、9←4),
//  仅变体 4 也没有的通道(0 头/1 眼白/2 瞳/15 眼睑)才落到变体 0。本仓 sheetRect/
//  就绪门/Game.ts 预载全为 `v ?? 0` 直落男表——男表 (0,2) 复合格无女躯干
//  (Player_0_3.png 逐像素实测 row2 全空;女躯干/女底衫仅 4_3/4_4 有 (0,2)/(1,2) 格)
//  ⇒ 女性子变体(5/6/7/9,含用户实报 v6 紫发角色,无名角色(4).plr 实测 skinVariant=6)
//  胸口/衣摆中缝镂空透背景,站/坐/走三态同现(复合躯干格不随帧行/坐姿切片变化)。
//  修复=variantSheetName 链解析(own→4/10→0)单点供给 取表/就绪门/预载/捏人预抢。
//  探针实证(修复前):v6 全 20 帧 hole=388/diff=1836;v5 diff=1372;v7 hole=76;
//  v9 hole=304;v4(对照,BJ11 门已修)=0。实时链经 Renderer.drawPlayer :12752 消费
//  同一个 compositePaperDoll——烘焙域差即实机差(单 drawImage 直绘,无二次合成)。
// 本文件=数据锁(反编译 CopyVariant 表全网格认证)+结构锁+行为面单测。纯 node,无 DOM。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { variantSheetName, VARIANT_SHEET_SOURCE } from '../src/player/PaperDoll';

const src = readFileSync(new URL('../src/player/PaperDoll.ts', import.meta.url), 'utf8');
const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const ccSrc = readFileSync(new URL('../src/ui/CharCreation.ts', import.meta.url), 'utf8');
const rendererSrc = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');
const csSrc = readFileSync(
  new URL('../../Terarria1457/Terraria.Initializers/PlayerDataInitializer.cs', import.meta.url), 'utf8');
const manifest: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../public/sprites/vanilla-ui.json', import.meta.url), 'utf8')).files as Record<string, unknown>;
const inManifest = (n: string) => n in manifest;

// ===================== ① 数据锁:反编译 CopyVariant 链全网格认证 =====================
describe('SW-BJ21 ① CopyVariant 链 vs PlayerDataInitializer.cs 全网格(变体0-11×通道0-15)', () => {
  // 从反编译源解 LoadVariant/CopyVariant 调用 → 逐 (变体,通道) 独立推导原版取表文件
  const ownOf = new Map<number, number[]>();
  const copyOf = new Map<number, number>();
  for (const m of csSrc.matchAll(/LoadVariant\((\d+), new int\[\d*\]\s*\{([^}]*)\}/g)) {
    ownOf.set(+m[1], m[2].split(',').map((x) => +x.trim()));
  }
  for (const m of csSrc.matchAll(/CopyVariant\((\d+), (\d+)\)/g)) copyOf.set(+m[1], +m[2]);
  // ★SW-RB6c 2026-09-07：LoadDisplayDollMale/Female 尾段重排块解析——
  //  `val = TextureAssets.Players[10,2]` 后 `TextureAssets.Players[v,i] = val`
  //  （v10 含自赋 [10,2],v11 整块）。别名面在 CopyVariant 之后=最终表值。
  const aliasOf = new Map<number, Set<number>>();
  for (const m of csSrc.matchAll(/TextureAssets\.Players\[(\d+), (\d+)\] = val;/g)) {
    if (!aliasOf.has(+m[1])) aliasOf.set(+m[1], new Set());
    aliasOf.get(+m[1])!.add(+m[2]);
  }
  // res(v,s): 原版资产表解析(own → DisplayDoll 别名面 val=10_2 → CopyVariant 链;
  //  14 号变体 0 为 Empty=不画)。链递归取【重排后】的源表（CopyVariant(11,10)
  //  在 10 的别名块之后执行）
  const ownFile = (v: number, s: number): string | null =>
    (ownOf.get(v) ?? []).includes(s) ? `Player_${v}_${s}.png` : null;
  const res = (v: number, s: number): string | null => {
    const own = ownFile(v, s);
    if (own) return own;
    if (aliasOf.get(v)?.has(s)) return 'Player_10_2.png';
    const from = copyOf.get(v);
    if (from !== undefined && from !== v) return res(from, s);
    return s === 14 ? null : `Player_0_${s}.png`;   // 变体 0:14=Empty(不画),其余男表
  };

  it('反编译源可解析(自己加载变体表;表值抽检防解析器失真)', () => {
    expect(ownOf.get(0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15]);
    expect(ownOf.get(4)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(ownOf.get(6)).toEqual([4, 6, 8, 11, 12, 13]);
    expect(copyOf.get(5)).toBe(4); expect(copyOf.get(6)).toBe(4);
    expect(copyOf.get(7)).toBe(4); expect(copyOf.get(9)).toBe(4);
    // DisplayDoll 重排块（val = Players[10,2]）
    expect(aliasOf.get(10)).toEqual(new Set([2, 1, 4, 6, 11, 12, 13, 8, 15]));
    expect(aliasOf.get(11)).toEqual(new Set([2, 1, 4, 6, 11, 12, 13, 8, 15]));
    expect(aliasOf.get(5)).toBeUndefined();   // 0-9 无别名面
  });

  it('variantSheetName 与反编译解析逐格一致(192 态全网格)', () => {
    for (let v = 0; v <= 11; v++) {
      for (let s = 0; s <= 15; s++) {
        const want = res(v, s);
        const got = variantSheetName(v, s, inManifest);
        if (want === null) {
          // 原版 Empty 面(变体0 的 14 号;10/14 链传):清单无文件 → 取表返回清单外名=同「不画」语义
          expect(got, `v${v}s${s} Empty face`).toBe(`Player_0_${s}.png`);
          expect(inManifest(got), `v${v}s${s} Empty face 清单外`).toBe(false);
        } else {
          expect(got, `v${v}s${s}`).toBe(want);
          expect(inManifest(got), `v${v}s${s} 必须清单内`).toBe(true);
        }
      }
    }
  });

  it('女性子变体身体通道确取变体 4 女表(镂空根因直接锚)', () => {
    for (const v of [5, 6, 7, 9]) {
      for (const s of [3, 5, 7, 9, 10]) {   // TorsoSkin/Hands/ArmSkin/ArmHand/LegSkin
        expect(variantSheetName(v, s, inManifest), `v${v}s${s}`).toBe(`Player_4_${s}.png`);
      }
      for (const s of [0, 1, 2, 15]) {      // 头/眼白/瞳/眼睑:4 亦无 → 落变体 0
        expect(variantSheetName(v, s, inManifest), `v${v}s${s}`).toBe(`Player_0_${s}.png`);
      }
    }
  });

  it('VARIANT_SHEET_SOURCE 表值=反编译 CopyVariant 边(数据锁)', () => {
    expect(VARIANT_SHEET_SOURCE).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 4, 6: 4, 7: 4, 8: 0, 9: 4, 10: 0, 11: 10 });
  });
});

// ===================== ② 行为面单测(合成谓词,不依赖清单) =====================
describe('SW-BJ21 ② variantSheetName 链解析行为面', () => {
  const no = () => false;
  const only = (...names: string[]) => (n: string) => names.includes(n);

  it('own 命中优先;链中段次之;0 兜底;未知变体直落 0', () => {
    expect(variantSheetName(4, 3, only('Player_4_3.png'))).toBe('Player_4_3.png');
    expect(variantSheetName(6, 3, only('Player_4_3.png'))).toBe('Player_4_3.png');       // 6←4
    expect(variantSheetName(5, 0, only('Player_0_0.png'))).toBe('Player_0_0.png');       // 5←4←0
    expect(variantSheetName(11, 0, only('Player_10_0.png'))).toBe('Player_10_0.png');    // 11←10
    expect(variantSheetName(11, 3, only('Player_11_3.png'))).toBe('Player_11_3.png');
    expect(variantSheetName(2, 3, only('Player_0_3.png'))).toBe('Player_0_3.png');       // 2←0 无中段
    expect(variantSheetName(99, 3, no)).toBe('Player_0_3.png');
    expect(variantSheetName(6, 3, no)).toBe('Player_0_3.png');   // 全缺:仍回 0(门侧再拦 texReady)
  });
});

// ===================== ③ 结构锁:四个消费面共用同一解析(防再分叉) =====================
describe('SW-BJ21 ③ 结构锁(取表/就绪门/预载/捏人预抢 同源)', () => {
  it('sheetRect 取表走 variantSheetName(直落 0 的 ?? 链必须消失)', () => {
    expect(src).toContain('UITextures.get(variantSheetName(variant, sheet, (n) => UITextures.has(n)))');
    expect(src).not.toContain("UITextures.get(`Player_${variant}_${sheet}.png`) ?? UITextures.get(`Player_0_${sheet}.png`)");
  });
  it('Game.ts 进图预载两处(ensureAppearanceFiles/preloadSceneAssets)同链', () => {
    const uses = gameSrc.split('variantSheetName(variant, s, (n) => a.uiFileExists(n))').length - 1;
    expect(uses).toBe(2);
    expect(gameSrc).not.toContain("else if (a.uiFileExists(`Player_0_${s}.png`)) files.add(`vanilla-ui/Player_0_${s}.png`)");
  });
  it('CharCreation 烘焙前置/变体预抢两处同链', () => {
    const uses = ccSrc.split('variantSheetName(v, s, (n) => UITextures.has(n))').length - 1;
    expect(uses).toBe(2);
  });
  it('眼睑帧表同链(★SW-RB6c:硬编码 Player_0_15 对 10/11 = 多画男眼睑)', () => {
    expect(src).toContain("UITextures.get(variantSheetName(a.skinVariant, 15, (n) => UITextures.has(n)))");
    expect(src).not.toContain("UITextures.get('Player_0_15.png')");
  });
  it('实时链消费同一 compositePaperDoll(Renderer.drawPlayer 主烘焙入口)', () => {
    // ★Maples 退役刀0(2026-10-17):p.appearance → app(渲染层缺省=默认纸娃娃,锚随迁)
    expect(rendererSrc).toContain('const doll = compositePaperDoll(app, dollEquip, dollOpts);');
  });
});

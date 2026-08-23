// 配饰系统性批"登记未建模"细项（docs/audit/item-audit-2026-08-22.md 配饰系统性三项
// 回报段登记清单,2026-08-23 批）：
//   ① per-slot 隐藏开关 hideVisibleAccessory（Player.cs:1590 字段 + Main.cs:40846-40896
//     眼睛图标 + UpdateVisibleAccessories :36361 !hide 门 + UpdateEquips :12580 翼特例）
//   ② back 子层拆分（DrawPlayer_08_Backpacks :479 / 08_1_Tails :568 / 10_BackAcc :590,
//     ArmorIDs.cs:1695-1699 三路由）
//   ③ 举盾光环/格挡视觉（DrawPlayer_25_Shield :3073-3125）
//   ④ 脸饰头盔条件偏移/隐没（GetFaceDrawOffset :4352-4432 + FaceAcc :2801-2852 门）
//   ⑤ 3015/3016 expertOnly 门定谳（1456/1457 两版全库均无 expertOnly=true 赋值=死字段）
//   ⑥ 小项定谳：威尔逊胡须发色（UseHairColor={2,3,4}→colorHair,本仓无发色系统登记）/
//     坐姿鞋切片（DrawSittingLegs :1585-1676）/ front 前后半拆层（:3891-3977）
// 数值基准 1457（Terarria1457/;本文件所涉配饰数值/集合两版同值,ArmorIDs 差异见
// src/data/vanillaAccDrawslots.ts 头注——expertOnly 探针直读 1457 树）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import {
  accDrawSlotsOf, BACK_DRAW_IN_BACKPACK, BACK_DRAW_IN_TAIL, BACK_IS_ACAPE,
  MOUNT_BACKPACK_OK, NECK_IS_SCARF, FRONT_SCARF_CAPE_HIDE, FRONT_NECK_LAYER_ALWAYS,
  SITTING_LEG_SLICES, SITTING_LEG_SLICES_SPECIAL, SITTING_LEG_SPECIAL_LEGS, FACE_HELMET_OFFSET, HELMET_DRAW_OFFSET,
  FACE_MASK_HELMET_HIDE, FACE_FLOWER_HELMET_HIDE, HEAD_HIDES_HEAD,
  PREVENT_BEARD_DRAW, BEARD_USE_HAIR_COLOR, shieldHaloFactor, shieldParryTransform,
} from '../src/data/vanillaAccDrawslots';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { Renderer } from '../src/render/Renderer';
import { World } from '../src/world/World';
import { saveGame, loadSave } from '../src/save/SaveFile';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ================= ① per-slot 隐藏开关 =================

describe('配饰未建模①：hideVisibleAccessory 字段与聚合门（Player.cs:1590/:36361）', () => {
  it('字段缺省 = 10 格全 false（原版 new bool[10];下标 3-9 有效,0-2/13-19 无宿主）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.hideVisibleAccessory).toHaveLength(10);
    expect(p.hideVisibleAccessory.every((v) => v === false)).toBe(true);
  });

  it('功能槽隐藏只藏贴图不失效（:36361 !hide 门只包 UpdateVisibleAccessory）：'
    + 'slot3=3016 隐藏后 aggroAcc 仍 +400、slot4=532 隐藏后 accDraw.back=0', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(3016), stack: 1 };   // 血肉指虎 aggro +400（:14107-14109）
    p.inv.armor[4] = { id: _iid(532), stack: 1 };    // 星星斗篷 back=2
    expect(p.equipStats.aggroAcc).toBe(400);
    expect(p.equipStats.accDraw.back).toBe(2);
    p.hideVisibleAccessory[3] = true;
    p.hideVisibleAccessory[4] = true;
    expect(p.equipStats.aggroAcc).toBe(400);   // ApplyEquipFunctional :13962 无 hide 门
    expect(p.equipStats.accDraw.back).toBe(0); // 贴图聚合被 :36361 门挡
    expect(p.equipStats.accDraw.dyeBack).toBe(-1);   // 染料随隐（UpdateItemDye flag :9320-9322）
  });

  it('社交槽 13-19 无 hide 门（:36368-36375 第二轮无条件）：hide[3] 不影响 armor[13] 披风', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(532), stack: 1 };
    p.inv.armor[13] = { id: _iid(4769), stack: 1 };   // 狗尾巴 back=25（尾族,纯社交 acc=0）
    p.hideVisibleAccessory[3] = true;
    expect(p.equipStats.accDraw.tail).toBe(25);   // 社交槽照常聚合
    expect(p.equipStats.accDraw.back).toBe(0);    // 功能槽被门挡
    // 眼睛图标只挂功能配饰段（Main.cs:40855 num40>2）→ 数组无 13-19 下标
    expect(p.hideVisibleAccessory[13]).toBeUndefined();
  });

  it('隐藏翼聚合旗（UpdateEquips :12577-12586）：隐藏翼 hidden=true 且不覆盖前槽可见翼', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(492), stack: 1 };   // 恶魔之翼 wing=1
    expect(p.equipStats.wing).toMatchObject({ logic: 1, hidden: false });
    p.inv.armor[3] = { id: _iid(821), stack: 1 };   // 烈焰之翼 wing=9
    p.hideVisibleAccessory[3] = true;
    expect(p.equipStats.wing).toMatchObject({ logic: 9, hidden: true });   // wingsLogic 恒写（:12585）
    // 前槽可见翼 + 后槽隐藏翼 → 保持前槽（gate 败=不覆盖,:12581）
    const q = new Player(0, 0, new Inventory());
    q.inv.armor[3] = { id: _iid(492), stack: 1 };
    q.inv.armor[4] = { id: _iid(821), stack: 1 };
    q.hideVisibleAccessory[4] = true;
    expect(q.equipStats.wing).toMatchObject({ logic: 1, hidden: false });
  });

  it('equipStats 记忆化键含隐藏段：翻转即失效重算（accDraw 聚合输入）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(532), stack: 1 };
    const k1 = p['equipStatsKey']();
    p.hideVisibleAccessory[3] = true;
    const k2 = p['equipStatsKey']();
    expect(k1).not.toBe(k2);
    expect(p.equipStats.accDraw.back).toBe(0);
  });

  it('存档往返：hideVisibleAccessory 位态保持（PL:53813-53819 位打包→布尔数组直存）;全 false 省略', () => {
    const world = new World(64, 32, 42, '测试');
    const p = new Player(100, 100, new Inventory());
    p.hideVisibleAccessory[3] = true;
    p.hideVisibleAccessory[7] = true;
    const back = loadSave(saveGame(world, p, 0));
    expect(back.player.hideVisibleAccessory).toEqual([
      false, false, false, true, false, false, false, true, false, false,
    ]);
    const q = new Player(100, 100, new Inventory());
    expect(loadSave(saveGame(world, q, 0)).player.hideVisibleAccessory).toBeUndefined();
  });
});

// ================= ② back 子层三路由 =================

describe('配饰未建模②：back 子层背包/尾巴族（ArmorIDs.cs:1695-1697 + PlayerDrawLayers :479/:568）', () => {
  it('字面集合对拍（1456/1457 同值,ArmorIDs.cs 1457 :1695-1697）：DrawInBackpackLayer={7,8,9,10,15,16,32,33} / DrawInTailLayer={18,19,21,25,26,27,28}', () => {
    expect([...BACK_DRAW_IN_BACKPACK].sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 15, 16, 32, 33]);
    expect([...BACK_DRAW_IN_TAIL].sort((a, b) => a - b)).toEqual([18, 19, 21, 25, 26, 27, 28]);
    // 审计登记文案勘误：15/16 在背包集非尾巴集（1695 vs 1697）
    expect(BACK_DRAW_IN_BACKPACK.has(15)).toBe(true);
    expect(BACK_DRAW_IN_TAIL.has(15)).toBe(false);
  });

  it('三路由聚合（UpdateVisibleAccessory :36455-36466）：1321→backpack / 4769→tail / 532→back+清front', () => {
    const bp = new Player(0, 0, new Inventory());
    bp.inv.armor[3] = { id: _iid(1321), stack: 1 };   // 魔法箭袋 back=7（背包族）
    expect(bp.equipStats.accDraw).toMatchObject({ backpack: 7, back: 0, tail: 0, front: 0, dyeBackpack: -1 });
    const tl = new Player(0, 0, new Inventory());
    tl.inv.armor[3] = { id: _iid(4769), stack: 1 };   // 狗尾巴 back=25（尾族）
    expect(tl.equipStats.accDraw).toMatchObject({ tail: 25, back: 0, backpack: 0 });
    const cp = new Player(0, 0, new Inventory());
    cp.inv.armor[3] = { id: _iid(2284), stack: 1 };   // 猩红披风 back=3+front=1（披风族）
    expect(cp.equipStats.accDraw).toMatchObject({ back: 3, front: 1, backpack: 0, tail: 0 });
    // 披风清 front 只在披风支（:36468-36471）;背包/尾族不清
    const mix = new Player(0, 0, new Inventory());
    mix.inv.armor[3] = { id: _iid(2284), stack: 1 };
    mix.inv.armor[4] = { id: _iid(1321), stack: 1 };
    expect(mix.equipStats.accDraw).toMatchObject({ backpack: 7, front: 1 });   // 背包族不清 front
  });

  it('渲染拆层：背包/尾巴画在翼前独立方法;尾巴坐姿 (0,-2)（:575-577）;披风坐姿仍隐（:36473）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1321), stack: 1 };   // backpack=7
    p.inv.armor[4] = { id: _iid(4769), stack: 1 };   // tail=25
    const rec = drawAccWithFake('drawAccBackpackTailLayers', p);
    expect(rec.files).toEqual(['vanilla/Acc_Back_7.png', 'vanilla/Acc_Back_25.png']);   // 背包先于尾巴
    expect(rec.draws.every((d) => d.dy === -52)).toBe(true);
    p.sitting = true;
    const sit = drawAccWithFake('drawAccBackpackTailLayers', p, true);
    expect(sit.files).toEqual(['vanilla/Acc_Back_7.png', 'vanilla/Acc_Back_25.png']);   // 坐姿不隐（仅披风隐 :36473）
    expect(sit.draws[1].dy).toBe(-54);   // 尾巴 (0,-2)
    expect(sit.draws[0].dy).toBe(-52);   // 背包无坐姿偏移
    // 披风族仍在身后族方法且坐姿隐藏
    const cape = new Player(0, 0, new Inventory());
    cape.inv.armor[3] = { id: _iid(532), stack: 1 };
    cape.sitting = true;
    expect(drawAccWithFake('drawAccBehindLayers', cape, true).files).toEqual([]);
  });

  it('坐骑门（:479/:570）：背包豁免集 {57,58,59,60} 骑乘仍画、其余坐骑隐;尾巴任何坐骑隐', () => {
    expect([...MOUNT_BACKPACK_OK].sort((a, b) => a - b)).toEqual([57, 58, 59, 60]);
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(1321), stack: 1 };
    p.inv.armor[4] = { id: _iid(4769), stack: 1 };
    const mnt = (type: number) => ({ type }) as unknown as import('../src/entities/Mounts').MountInstance;
    expect(drawAccWithFake('drawAccBackpackTailLayers', p, false, mnt(57)).files)
      .toEqual(['vanilla/Acc_Back_7.png']);   // 豁免集：背包画、尾巴隐
    expect(drawAccWithFake('drawAccBackpackTailLayers', p, false, mnt(1)).files)
      .toEqual([]);   // 常规坐骑：两层全隐
  });

  it('Back.Sets.IsACape 字面集（★1457 :1721 = 1456 :1699 +41 DruidicSerpentCloak）'
    + '——front 13 围巾/披风互斥门右支', () => {
    expect([...BACK_IS_ACAPE].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 14, 24, 34, 36, 39, 41]);
    expect([...NECK_IS_SCARF].sort((a, b) => a - b)).toEqual([8, 9]);
    expect([...FRONT_SCARF_CAPE_HIDE]).toEqual([13]);
    expect([...FRONT_NECK_LAYER_ALWAYS]).toEqual([13]);
  });
});

// ================= ③ 举盾光环/格挡视觉 =================

describe('配饰未建模③：举盾光环/格挡弹开视觉（DrawPlayer_25_Shield :3073-3125）', () => {
  it('光环档纯函数：x=2.5+1.5·sin(2πt)、a=0.45-0.15·sin(2πt)（:3074-3078）', () => {
    expect(shieldHaloFactor(0).x).toBeCloseTo(2.5, 10);
    expect(shieldHaloFactor(0).a).toBeCloseTo(0.45, 10);
    expect(shieldHaloFactor(0.25).x).toBeCloseTo(4, 10);          // sin(π/2)=1
    expect(shieldHaloFactor(0.25).a).toBeCloseTo(0.3, 10);
    expect(shieldHaloFactor(0.75).x).toBeCloseTo(1, 10);          // sin(3π/2)=-1
  });

  it('格挡弹开档纯函数：t=parry/20、scale=1+1.5t、alpha=1-t、外推 (0,(-24+h/2))·1.5t（:3109-3120）', () => {
    const end = shieldParryTransform(20, 42);
    expect(end.t).toBeCloseTo(1, 10);
    expect(end.scale).toBeCloseTo(2.5, 10);
    expect(end.alpha).toBeCloseTo(0, 10);
    expect(end.dy).toBeCloseTo(-4.5, 10);   // (-24+21)·1.5（局部 -y = 向上外推）
    const mid = shieldParryTransform(10, 42);
    expect(mid.scale).toBeCloseTo(1.75, 10);
    expect(mid.alpha).toBeCloseTo(0.5, 10);
    expect(mid.dy).toBeCloseTo(-2.25, 10);
  });

  it('渲染：举盾 = 4 份加算光环（lighter）+ 本体;格挡窗口另有外扩副本', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(156), stack: 1 };   // Cobalt Shield shield=1
    const base = drawAccWithFake('drawAccFrontLayers', p, false, null, 0);
    expect(base.draws.length).toBe(1);   // 常态只画本体
    p.shieldRaised = true;
    const raised = drawAccWithFake('drawAccFrontLayers', p, false, null, 0);
    expect(raised.draws.length).toBe(5);   // 4 光环 + 1 本体（:3080-3090 四份 + :3092 本体）
    expect(raised.compositeOps.filter((c) => c === 'lighter')).toHaveLength(1);   // 光环段整体切加算
    expect(raised.draws[4].dy).toBe(-56);   // 本体带 -4 举盾抬升（:3061-3063）
    p.shieldParryTimeLeft = 10;
    const parry = drawAccWithFake('drawAccFrontLayers', p, false, null, 0);
    expect(parry.draws.length).toBe(6);   // +格挡外扩副本（:3122 入缓存）
    expect(parry.draws[5].dw).toBeCloseTo(70, 6);   // scale=1.75 → 40×1.75
  });
});

// ================= ④ 脸饰头盔条件偏移/隐没 =================

describe('配饰未建模④：脸饰头盔门与偏移表（GetFaceDrawOffset :4352-4432 + FaceAcc :2801-2852）', () => {
  it('偏移表抽查：face22 head269→(0,-6)/283→(2,0)/275→(0,2);花族 head270→(8,0)（×Directions 表值）', () => {
    expect(FACE_HELMET_OFFSET[22][269]).toEqual([0, -6]);
    expect(FACE_HELMET_OFFSET[22][283]).toEqual([2, 0]);
    expect(FACE_HELMET_OFFSET[22][275]).toEqual([0, 2]);
    expect(FACE_HELMET_OFFSET[22][119]).toEqual([2, -2]);
    expect(FACE_HELMET_OFFSET[1][270]).toEqual([8, 0]);
    expect(FACE_HELMET_OFFSET[9][268]).toEqual([0, 6]);
  });

  it('隐没门集合：PreventFaceMaskDraw∪DrawFaceMaskUnderHeadLayer（:24/:20）/ PreventFaceFlowerDraw={92,275} / HidesHead（:18）', () => {
    expect(FACE_FLOWER_HELMET_HIDE).toEqual(new Set([92, 275]));
    expect(HEAD_HIDES_HEAD).toEqual(new Set([38, 135, 269, 282, 288]));
    for (const h of [268, 270, 26, 51, 92, 196]) expect(FACE_MASK_HELMET_HIDE.has(h)).toBe(true);
    expect(FACE_MASK_HELMET_HIDE.size).toBe(70);   // 49+21 无交集（:24+:20）
  });

  it('渲染门：面罩 5596+头盔 268 隐没;+头盔 3 画且带 (0,-2) 长盔偏移;无头盔直画', () => {
    const mk = (head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(5596), stack: 1 };   // face=22 焊工面罩
      return drawAccWithFake('drawAccFrontLayers', p, false, null, head);
    };
    expect(mk(268).files).toEqual([]);                       // PreventFaceMaskDraw[268] → 隐没（:2819-2821）
    const withHelmet = mk(3);
    expect(withHelmet.files).toEqual(['vanilla/Acc_Face_22.png']);
    expect(withHelmet.draws[0].dy).toBe(-54);                // (0,-2) 长盔表（:4403-4432）+ 锚 -52
    expect(mk(0).draws[0].dy).toBe(-52);                     // 无头盔无偏移
  });

  it('胡须头盔门（PreventBeardDraw :2429-2433）：head 118 隐没/head 0 直画;UseHairColor={2,3,4} 登记定谳', () => {
    expect([...BEARD_USE_HAIR_COLOR].sort((a, b) => a - b)).toEqual([2, 3, 4]);
    expect(PREVENT_BEARD_DRAW.has(118)).toBe(true);
    expect(PREVENT_BEARD_DRAW.has(269)).toBe(true);
    expect(PREVENT_BEARD_DRAW.size).toBe(47);   // ArmorIDs.cs:26 字面 47 头
    const mk = (head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(5104), stack: 1 };   // 威尔逊短胡 beard=2
      return drawAccWithFake('drawAccFrontLayers', p, false, null, head);
    };
    expect(mk(118).files).toEqual([]);
    expect(mk(0).files).toEqual(['vanilla/Acc_Beard_2.png']);
  });

  it('花族门：face=1（223）+头盔 92/275 隐没（PreventFaceFlowerDraw）;骷髅族/眼罩门 = HidesHead', () => {
    const mk = (vid: number, head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      return drawAccWithFake('drawAccFrontLayers', p, false, null, head);
    };
    expect(mk(223, 92).files).toEqual([]);
    expect(mk(223, 275).files).toEqual([]);
    expect(mk(223, 3).files).toEqual(['vanilla/Acc_Face_1.png']);
    // face 19 骨盔（5100）无条件画（GetFaceDrawOffset :4370-4372 非 head 门）;head 族
    // 10-13 与 underHair 5 走 HidesHead 门（:2590/:2596,本仓单层合并同门）
    expect(mk(5100, 38).files).toEqual(['vanilla/Acc_Face_19.png']);
  });
});

// ================= ⑥ 小项：坐姿鞋切片 / front 前后半拆层 =================

describe('配饰未建模⑥：坐姿鞋切片（DrawSittingLegs :1585-1676）与 front 前后半拆层（:3891-3977）', () => {
  it('切片表 = 默认支三片 [46,10]+[44,2]+[42,2]（num3=2/num2=42 :1594-1596/:1719-1732;★V2b 复核勘误:旧表 [[2,54],[0,2]] 是 217 族特例支非默认支）', () => {
    expect(SITTING_LEG_SLICES).toEqual([[46, 10], [44, 2], [42, 2]]);
    expect(SITTING_LEG_SLICES_SPECIAL).toEqual([[2, 54], [0, 2]]);   // legs 169/177/178/181/182/206/217 特例支
    expect(SITTING_LEG_SPECIAL_LEGS.has(217) && SITTING_LEG_SPECIAL_LEGS.has(169)).toBe(true);
  });

  it('渲染：站姿整幅单画;坐姿默认支三片同锚（身段 [46,10] 先画、两条 2px 顶带后叠）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(54), stack: 1 };   // 鞋 shoe=6
    const stand = drawAccWithFake('drawAccFrontLayers', p);
    expect(stand.draws.length).toBe(1);
    p.sitting = true;
    const sit = drawAccWithFake('drawAccFrontLayers', p, true);
    expect(sit.draws.length).toBe(3);
    expect([sit.draws[0].sy, sit.draws[0].sh]).toEqual([46, 10]);   // 身段（先画）
    expect([sit.draws[1].sy, sit.draws[1].sh]).toEqual([44, 2]);    // 顶带 1
    expect([sit.draws[2].sy, sit.draws[2].sh]).toEqual([42, 2]);    // 顶带 2
    expect(sit.draws[0].dy).toBe(-52);
  });

  it('front 前后半拆层：右半（BackPart sx=20）先于盾、左半（FrontPart sx=0）后于手（:3891-3977 + LPR:229/:242-244）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(2284), stack: 1 };   // back=3+front=1
    p.inv.armor[4] = { id: _iid(156), stack: 1 };    // shield=1
    const rec = drawAccWithFake('drawAccFrontLayers', p);
    // 贴图只取一次（frontTex 单次 fetch）;三笔 = BackPart(半幅) → Shield(整幅) → FrontPart(半幅)
    expect(rec.files).toEqual(['vanilla/Acc_Front_1.png', 'vanilla/Acc_Shield_1.png']);
    expect(rec.draws.length).toBe(3);
    expect([rec.draws[0].sx, rec.draws[0].sw]).toEqual([20, 20]);   // BackPart 源右半（:3940-3943）
    expect([rec.draws[1].sx, rec.draws[1].sw]).toEqual([0, 40]);    // Shield 整幅
    expect([rec.draws[2].sx, rec.draws[2].sw]).toEqual([0, 20]);    // FrontPart 源左半（:3896-3899）
    expect(rec.draws[0].dx).toBe(-20);   // 同锚同位（拆的是顺序不是位置）
    expect(rec.draws[2].dx).toBe(-20);
  });

  it('front 13 围巾/披风互斥门（:3893/:3936）：门只挂 FRONT_SCARF_CAPE_HIDE={13}'
    + '（提取表无 front=13 物件,门为表级）;front 1 披风在身不受门', () => {
    // 提取表内 front 族全为"披风+前半"双槽件（2284-2287/4001/4744/5080/5355/5627/6141）,
    // 无 front=13 物件 → 互斥门只能表级验证;此处验证 front 1 与披风共存仍画
    // （2284 后写 → back=3+front=1,披风互斥清写只发生在披风支）
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(532), stack: 1 };    // back=2（IsACape）
    p.inv.armor[4] = { id: _iid(2284), stack: 1 };   // back=3+front=1（后写胜出）
    expect(p.equipStats.accDraw).toMatchObject({ back: 3, front: 1 });
    const rec = drawAccWithFake('drawAccFrontLayers', p);
    expect(rec.files.some((f) => f.includes('Acc_Front_'))).toBe(true);   // front 1 不受门
    expect(FRONT_SCARF_CAPE_HIDE.has(1)).toBe(false);
    expect(FRONT_SCARF_CAPE_HIDE.has(13)).toBe(true);
    expect(NECK_IS_SCARF).toEqual(new Set([8, 9]));   // 围巾 3224/3809
  });
});

// ================= ⑤ 3015/3016 expertOnly 定谳（回写备案不改码） =================

describe('配饰未建模⑤：3015/3016 expertOnly 门定谳（1456/1457 两版死字段,登记不接）', () => {
  const itemCs = resolve(process.cwd(), '../Terarria1457/Terraria/Item.cs');
  it('1457 全库无 expertOnly = true 赋值（Item.cs 仅 :129 声明/:48960 复位;1456 :110/:48555 同构）→ 门对 3015/3016 恒不生效', () => {
    if (!existsSync(itemCs)) throw new Error(`标杆缺失: ${itemCs}`);
    const src = readFileSync(itemCs, 'utf8');
    expect(src.includes('expertOnly = true')).toBe(false);
    expect((src.match(/expertOnly/g) ?? []).length).toBe(2);   // 声明 + SetDefaults 复位
  });

  it('本仓按原版语义无专家门：3016 aggro +400 / 3015 aggro -400 恒生效（Player.cs :14107/:14096）', () => {
    const knuckles = new Player(0, 0, new Inventory());
    knuckles.inv.armor[3] = { id: _iid(3016), stack: 1 };
    expect(knuckles.equipStats.aggroAcc).toBe(400);
    const scent = new Player(0, 0, new Inventory());
    scent.inv.armor[3] = { id: _iid(3015), stack: 1 };
    expect(scent.equipStats.aggroAcc).toBe(-400);
    expect(accDrawSlotsOf(3015)).toBeNull();   // 两件均无身上贴图槽（纯功能件）
    expect(accDrawSlotsOf(3016)).toBeNull();
  });
});

// ================= 记录型 ctx 假体（accessory-systematic 同款 + 源矩形/合成态记录） =================

function drawAccWithFake(method: 'drawAccBehindLayers' | 'drawAccFrontLayers' | 'drawAccBackpackTailLayers',
  p: Player, sitting = false, mnt: import('../src/entities/Mounts').MountInstance | null = null,
  head = 0): {
  files: string[]; draws: Array<{ img: unknown; dx: number; dy: number; sx: number; sy: number; sw: number; sh: number; dw: number }>;
  compositeOps: string[];
} {
  const files: string[] = [];
  const draws: Array<{ img: unknown; dx: number; dy: number; sx: number; sy: number; sw: number; sh: number; dw: number }> = [];
  const compositeOps: string[] = [];
  const texStub = { width: 40, height: 1120 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === 'canvas') return undefined;
      return (...a: unknown[]) => {
        if (String(k) === 'drawImage') {
          draws.push(a.length <= 3
            ? { img: a[0], dx: a[1] as number, dy: a[2] as number, sx: -1, sy: -1, sw: -1, sh: -1, dw: -1 }
            : { img: a[0], dx: a[5] as number, dy: a[6] as number, sx: a[1] as number, sy: a[2] as number, sw: a[3] as number, sh: a[4] as number, dw: a[7] as number });
        }
        return undefined;
      };
    },
    set: (_t, k, v) => {
      if (k === 'globalCompositeOperation') compositeOps.push(String(v));
      return true;
    },
  });
  const proto = Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const fake = {
    ctx,
    atlas: { ensureVImage: (f: string) => { files.push(f); return texStub; } },
    wingTexSource: () => null,
    drawAccBodyFrame: (proto.drawAccBodyFrame as (...a: unknown[]) => void),
  };
  p.sitting = sitting;
  proto[method].call(fake, ctx, p, { body: 0, legs: 0 }, 1, mnt, head);
  return { files, draws, compositeOps };
}

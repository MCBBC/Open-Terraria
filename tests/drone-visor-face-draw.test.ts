// ★X4 清偿刀N（2026-09-29）：配饰 5452 FPV 飞行眼镜（JimsDroneVisor）面部穿戴视觉判别测试。
// ★判谳：刀 I 台账「面部穿戴视觉未入 accDrawslots（戴上眼镜脸上无绘制）」= 判伪（陈旧债）
//   ——本仓 face 槽绘制链 2026-09-03 四层路由批已整链落地（tests/face-layer-routing.test.ts），
//   5452→face:21 在提取器数据原生在位，链路逐站实测全通（vid→accDraw.face=21→Renderer
//   base 支出 Acc_Face_21.png，裸锚零偏移）。本测试=定谳钉值锁面（指纹全等=零修刀判据）。
// 定谳锚（Terarria1457 直读）：
//   Item.cs:42982-42988 case 5452（accessory/rare 3/faceSlot 21/hasVanityEffects true）；
//   AssetInitializer.cs:526-528 TextureAssets.AccFace[n] = "Images/Acc_Face_"+n（贴图名族）；
//   UpdateVisibleAccessories 功能环 :36324-36368（!hide 门 :36361=眼睛图标只藏贴图）+
//   社交环 :36353-36375（无条件，无 hide 门）；UpdateVisibleAccessory face 分流 :37216-37230
//   （base∪underHair 同 face 字段——21 不在 mask/flower/head 集 → face）；
//   PlayerFrame 头盔互斥门 :36253-36262（head>0 ∧ face>0 ∧ ¬(287/23) → 非 underHair face=-1）；
//   ArmorIDs.cs:2184 DrawInFaceUnderHairLayer={5}（21 ∉ → base 前层支）；
//   PlayerDrawLayers.cs:2807-2827 DrawPlayer_22_FaceAcc base 支（GetFaceDrawOffset(face)
//   ——Player.cs:4549-4637 全 switch 无 case 21 → Vector2.Zero 零偏移；sourceRect=bodyFrame、
//   color=colorArmorHead、shader=cFace、origin=headVect）；PlayerDrawHeadLayers.cs:397-446
//   DrawPlayer_08_FaceAcc 头像路径同门同锚；
//   hasVanityEffects 消费点唯一=Main.cs:20854（社交栏"有实效"角标，非绘制门——虚荣环
//   13-19 同画 base face）。
// 本仓落点：src/data/vanilla-acc-drawslots.json "5452":{"face":21}（提取器直出）；
//   src/entities/Player.ts accDrawApply :2038-2079（face 路由 :2067-2074 else 支）+
//   功能环 :2100（!hideVisibleAccessory 门）+ 社交环 :2408-2425（无条件）；
//   src/render/Renderer.ts drawAccFrontLayers base 支 :14919-14923（FACE_UNDER_HAIR 豁免外
//   直画，偏移表缺项=[0,0]）；贴图 public/sprites/vanilla/Acc_Face_21.png（40×1120=40×56×20
//   身架行，与 terraria-assets/Images/Acc_Face_21.png 字节全等，sha256 见 ⑤）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { accDrawSlotsOf, resolveFaceLayers } from '../src/data/vanillaAccDrawslots';
import { Renderer } from '../src/render/Renderer';
import { hasRemoteVisionForDrone } from '../src/render/DroneCameraTracker';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** vid → 内部 id 权威反查口（同 drone-camera-tracker.test.ts 刀 I 口径） */
const vidIdx = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** 记录型 ctx + 假 atlas 直调（face-layer-routing.test.ts 同款假体，禁双抄改采同构） */
function drawFront(p: Player, head = 0, headFaceHandled = false): {
  files: string[]; draws: Array<{ img: unknown; dx: number; dy: number }>;
} {
  const files: string[] = [];
  const draws: Array<{ img: unknown; dx: number; dy: number }> = [];
  const texStub = { width: 40, height: 1120 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => {
      if (String(k) === 'drawImage') {
        draws.push(a.length <= 3
          ? { img: a[0], dx: a[1] as number, dy: a[2] as number }
          : { img: a[0], dx: a[5] as number, dy: a[6] as number });
      }
      return undefined;
    }),
    set: () => true,
  });
  const proto = Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  const fake = {
    ctx,
    atlas: { ensureVImage: (f: string) => { files.push(f); return texStub; } },
    wingTexSource: () => null,
    drawAccBodyFrame: (proto.drawAccBodyFrame as (...a: unknown[]) => void),
  };
  proto.drawAccFrontLayers.call(fake, ctx, p, { body: 0, legs: 0 }, 1, null, head, 0, headFaceHandled);
  return { files, draws };
}

// ============================================================
// ① 提取器数据锚（vanilla-acc-drawslots.json 直出，faceSlot=21 路由在位）
// ============================================================
describe('① 数据锚：5452→face 21 路由（Item.cs:42987 faceSlot=21 → UpdateVisibleAccessory :37216-37230 else 支）', () => {
  it('accDrawSlotsOf(5452) = {face:21}（提取器面唯一槽，非 mask 22/flower {1,6,8,9}/head {12,10,13,11}）', () => {
    expect(accDrawSlotsOf(5452)).toEqual({ face: 21 });
  });

  it('21 ∈ base∪underHair 同字段域（∉ DrawInFaceUnderHairLayer={5} → base 前层支,ArmorIDs.cs:2184）', () => {
    expect(resolveFaceLayers({ face: 21, faceMask: 0, faceFlower: 0, faceHead: 0 }, 0).face).toBe(21);
  });
});

// ============================================================
// ② 聚合面：功能环 !hide 门 + 虚荣环无条件（UpdateVisibleAccessories 两轮）
// ============================================================
describe('② 聚合面：accDraw.face 装备态（Player.ts accDrawApply,UpdateVisibleAccessories :36324-36375）', () => {
  it('功能环佩戴 → face=21（后写覆盖语义域）——槽 9 大师格受 accSlotMax 门（≙ :37041 IsItemSlotUnlockedAndUsable）', () => {
    for (const slot of [3, 6]) {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[slot] = { id: vidIdx(5452), stack: 1 };
      expect(p.equipStats.accDraw.face, `slot ${slot}`).toBe(21);
    }
    const locked = new Player(0, 0, new Inventory());
    locked.inv.armor[9] = { id: vidIdx(5452), stack: 1 };
    expect(locked.equipStats.accDraw.face).toBe(0);      // 经典世界大师格锁定不显（cs:IsItemSlotUnlockedAndUsable(9)）
    const master = new Player(0, 0, new Inventory());
    // ★清偿刀 P 逐槽化（2026-09-29）：9 号槽=大师世界原生解锁（:12669-12690 case 9
    // 无心愿门）——N 刀登记的「连续界 8/9 开合反相」偏差已清偿,不再需 extraAccessory 垫界
    master.inv.gateMaster = true;
    master.inv.armor[9] = { id: vidIdx(5452), stack: 1 };
    expect(master.equipStats.accDraw.face).toBe(21);     // 大师世界解锁 → 显
  });

  it('虚荣环 13-19 佩戴 → face=21（社交轮无 hide 门,:36369-36375——原版 hasVanityEffects 件同画）', () => {
    for (const slot of [13, 16]) {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[slot] = { id: vidIdx(5452), stack: 1 };
      expect(p.equipStats.accDraw.face, `slot ${slot}`).toBe(21);
    }
  });

  it('功能槽 hideVisibleAccessory 置位 → face=0（眼睛图标只藏贴图 :36361 门；虚荣槽无此门=原版差异面）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    p.hideVisibleAccessory[3] = true;
    expect(p.equipStats.accDraw.face).toBe(0);
    const v = new Player(0, 0, new Inventory());
    v.inv.armor[13] = { id: vidIdx(5452), stack: 1 };
    v.hideVisibleAccessory[13] = true;   // 社交槽旗不影响（原版第二轮不读它）
    expect(v.equipStats.accDraw.face).toBe(21);
  });

  it('空槽收藏共享件 → face=21（GetEffectiveArmor :5678-5692,与相机装备门同取数口）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.loadouts[0].armor[4] = { id: vidIdx(5452), stack: 1, favorited: true };
    expect(p.equipStats.accDraw.face).toBe(21);
    expect(hasRemoteVisionForDrone(p.inv)).toBe(true);   // 视觉与相机授权同装备面
  });

  it('染料随路由：dyeFace 独立字段（UpdateItemDye cFace 族）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    expect(p.equipStats.accDraw.dyeFace).toBe(-1);   // 无染料=-1 哨兵
  });
});

// ============================================================
// ③ 绘制面：22_FaceAcc base 支（DrawPlayer_22_FaceAcc :2807-2827）
// ============================================================
describe('③ 绘制面：drawAccFrontLayers base 支出 Acc_Face_21（裸锚零偏移+层序+头盔门）', () => {
  it('裸脸（head=0）：Acc_Face_21.png 单发,bodyFrame 头锚 (−20,−52)+零偏移（GetFaceDrawOffset 无 case 21→Zero）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    const r = drawFront(p, 0);
    expect(r.files).toEqual(['vanilla/Acc_Face_21.png']);
    expect(r.draws).toHaveLength(1);
    expect(r.draws[0].dx).toBe(-20);   // drawAccBodyFrame 身架行头锚 dx
    expect(r.draws[0].dy).toBe(-52);   // 身架行头锚 dy（Position.Y+height−frameH+4 域）
  });

  it('层序：base face(21) 先于 flower(1)/mask(22)（:2809→:2819→:2836 支序）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(223), stack: 1 };    // flower 1
    p.inv.armor[4] = { id: vidIdx(5452), stack: 1 };   // face 21
    p.inv.armor[5] = { id: vidIdx(5596), stack: 1 };   // mask 22
    const files = drawFront(p, 0).files;
    const iVisor = files.indexOf('vanilla/Acc_Face_21.png');
    const iMask = files.indexOf('vanilla/Acc_Face_22.png');
    const iFlower = files.indexOf('vanilla/Acc_Face_1.png');
    expect(iVisor).toBe(0);
    expect(iMask).toBeGreaterThan(iVisor);
    expect(iFlower).toBeGreaterThan(iMask);
  });

  it('戴盔（head>0）：face 清 = 不画（PlayerFrame :36253-36262 head>0∧face>0→face=-1）——但相机授权仍真', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    expect(drawFront(p, 3).files).toEqual([]);          // 视觉隐（原版同相:戴盔藏眼镜）
    expect(hasRemoteVisionForDrone(p.inv)).toBe(true);  // 功能门独立于视觉门(remoteVisionForDrone 两环 case :15574/:14314)
  });

  it('狼人/人鱼强改（transformed）：四字段清空（PlayerFrame :36245-36251 flag3）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    const r = resolveFaceLayers(p.equipStats.accDraw, 0, true);
    expect([r.face, r.faceMask, r.faceFlower, r.faceHead]).toEqual([0, 0, 0, 0]);
  });

  it('兜底精灵路径（headFaceHandled=false）照画（层尾兜底支同锚同门,headFaceHandled 只抑头层族重画）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: vidIdx(5452), stack: 1 };
    expect(drawFront(p, 0, false).files).toEqual(['vanilla/Acc_Face_21.png']);
    expect(drawFront(p, 0, true).files).toEqual(['vanilla/Acc_Face_21.png']);   // base 支不受抑重位影响
  });
});

// ============================================================
// ④ 贴图面：Acc_Face_21 在库性（AssetInitializer.cs:526-528 "Images/Acc_Face_"+21）
// ============================================================
describe('④ 贴图面：Acc_Face_21.png 40×1120 身架行族,与 terraria-assets 原件字节全等', () => {
  const SHA = 'd1315743256da6783e4f0d78873c63180693e1de9410c3c655f35e42104f65d0';

  it('sha256 钉值（防贴图静默替换/重排——asset-surface-census 同族守卫）', () => {
    const buf = readFileSync(join(ROOT, 'public/sprites/vanilla/Acc_Face_21.png'));
    expect(createHash('sha256').update(buf).digest('hex')).toBe(SHA);
  });
});

// face 四层路由建模（2026-09-03,登记销核）：
//   原版链路 = UpdateVisibleAccessory（★1457 Player.cs:37216-37230;1456 :36852-36866）
//   faceSlot 按 ArmorIDs.Face.Sets（★1457 ArmorIDs.cs:2176-2192）分流 faceHead/faceMask/
//   faceFlower/face(base∪underHair) 四字段 → PlayerFrame 头盔互斥/换档门
//   （★1457 :36252-36271;1456 :34252-34271）→ 绘制序 DrawPlayer_21_Head_TheFace
//   （PlayerDrawLayers.cs:2574-2650,头层=发/头甲之下：faceHead 替代皮肤脸+underHair）
//   → DrawPlayer_21_Head 面罩头层支（:2124-2137）→ 22_FaceAcc 前层三支
//   （:2801-2852 base→mask→flower）。染料随路由 UpdateItemDye（:9774-9788）。
// 实现落点：src/entities/Player.ts（聚合四字段）、src/data/vanillaAccDrawslots.ts
//   （分集表+resolveFaceLayers/faceLayerSplitPlan）、src/render/Renderer.ts
//   （前层三支重排+头层拆画）、src/player/PaperDoll.ts（skipFace）。
import { describe, it, expect } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import {
  resolveFaceLayers, faceLayerSplitPlan,
  FACE_OVERRIDE_HELMET, FACE_MASK_UNDER_HEAD_LAYER, PREVENT_FACE_MASK_DRAW,
  FACE_MASK_HELMET_HIDE, ALT_FACE_HEAD, USE_ALT_FACE_HEAD_DRAW,
} from '../src/data/vanillaAccDrawslots';
import { Renderer } from '../src/render/Renderer';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// 测试样本（vanilla-acc-drawslots.json face 槽实测）：
//   223=大自然恩赐(face1 flower) / 5596=焊工面罩(face22 mask) / 193=黑曜石头颅
//   (face12 head) / 3999=熔岩头颅(face10 head) / 888=眼罩(face5 underHair) /
//   5100=骨盔(face19 base+OverrideHelmet) / 394=潜水装置(face4 base+OverrideHelmet)

// ================= ① 聚合：四路由分字段 =================

describe('face 四层路由①：UpdateVisibleAccessory 分字段聚合（:37216-37230）', () => {
  it('逐路由分流：flower→faceFlower / mask→faceMask / head→faceHead / base∪underHair→face', () => {
    const mk = (vid: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      return p.equipStats.accDraw;
    };
    expect(mk(223).faceFlower).toBe(1);   // flower 集 {1,6,8,9}
    expect(mk(223).face).toBe(0);
    expect(mk(5596).faceMask).toBe(22);   // mask 集 {22}
    expect(mk(193).faceHead).toBe(12);    // head 集 {12,10,13,11}
    expect(mk(3999).faceHead).toBe(10);
    expect(mk(888).face).toBe(5);         // underHair 5 与 base 同 face 字段（:37229 else）
    expect(mk(5100).face).toBe(19);       // 骨盔=base 路由（非 head 集）
  });

  it('四件并存（同帧至多四件,各字段独立后写）：flower+mask+head+underHair 同戴全出', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(223), stack: 1 };   // flower
    p.inv.armor[4] = { id: _iid(5596), stack: 1 };  // mask
    p.inv.armor[5] = { id: _iid(193), stack: 1 };   // head
    p.inv.armor[6] = { id: _iid(888), stack: 1 };   // underHair→face
    const ad = p.equipStats.accDraw;
    expect(ad.faceFlower).toBe(1);
    expect(ad.faceMask).toBe(22);
    expect(ad.faceHead).toBe(12);
    expect(ad.face).toBe(5);
  });

  it('同路由后写覆盖前写（槽序）：双 head 件后槽胜出;染料随路由（UpdateItemDye :9774-9788）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(193), stack: 1 };   // faceHead=12
    p.inv.armor[4] = { id: _iid(3999), stack: 1 };  // faceHead=10（后写覆盖）
    expect(p.equipStats.accDraw.faceHead).toBe(10);
    // 染料路由：dyeFaceHead 独立于 dyeFace/dyeFaceMask
    const q = new Player(0, 0, new Inventory());
    q.inv.armor[3] = { id: _iid(193), stack: 1 };
    expect(q.equipStats.accDraw.dyeFaceHead).toBe(-1);
    expect(q.equipStats.accDraw.dyeFace).toBe(-1);
  });
});

// ================= ② PlayerFrame 门：resolveFaceLayers / faceLayerSplitPlan =================

describe('face 四层路由②：PlayerFrame 头盔互斥/换档门（:36252-36271）', () => {
  it('戴盔清 face（非 underHair）;underHair 豁免;287+23 组合豁免（:36256-36263）', () => {
    expect(resolveFaceLayers({ face: 1, faceMask: 0, faceFlower: 0, faceHead: 0 }, 3).face).toBe(0);
    expect(resolveFaceLayers({ face: 5, faceMask: 0, faceFlower: 0, faceHead: 0 }, 3).face).toBe(5);
    expect(resolveFaceLayers({ face: 23, faceMask: 0, faceFlower: 0, faceHead: 0 }, 287).face).toBe(23);
    expect(resolveFaceLayers({ face: 23, faceMask: 0, faceFlower: 0, faceHead: 0 }, 3).face).toBe(0);
    // 无头盔不清
    expect(resolveFaceLayers({ face: 1, faceMask: 0, faceFlower: 0, faceHead: 0 }, 0).face).toBe(1);
  });

  it('OverrideHelmet={2,3,4,19}（:36256-36259）：head 隐+faceHead 清,face 保留', () => {
    const r = resolveFaceLayers({ face: 19, faceMask: 0, faceFlower: 0, faceHead: 12 }, 38);
    expect(r.head).toBe(0);      // head=-1 ≙ 0（头盔整件不画）
    expect(r.faceHead).toBe(0);  // faceHead=-1
    expect(r.face).toBe(19);     // face 保留画
    expect(FACE_OVERRIDE_HELMET).toEqual(new Set([2, 3, 4, 19]));
  });

  it('AltFaceHead 换档（:36266-36271）：UseAltFaceHeadDraw 头盔下 12→17/10→15/13→18/11→16', () => {
    expect(ALT_FACE_HEAD).toEqual({ 12: 17, 10: 15, 13: 18, 11: 16 });
    expect(USE_ALT_FACE_HEAD_DRAW.has(3)).toBe(true);    // 铜盔在集
    expect(USE_ALT_FACE_HEAD_DRAW.has(1)).toBe(false);   // ——— 1 不在（1457 字面）
    expect(resolveFaceLayers({ face: 0, faceMask: 0, faceFlower: 0, faceHead: 12 }, 3).faceHead).toBe(17);
    expect(resolveFaceLayers({ face: 0, faceMask: 0, faceFlower: 0, faceHead: 10 }, 3).faceHead).toBe(15);
    expect(resolveFaceLayers({ face: 0, faceMask: 0, faceFlower: 0, faceHead: 12 }, 1).faceHead).toBe(12);   // head1 不在集
  });

  it('狼人/人鱼强改（:36252 flag3）清空四字段', () => {
    const r = resolveFaceLayers({ face: 5, faceMask: 22, faceFlower: 1, faceHead: 12 }, 38, true);
    expect([r.face, r.faceMask, r.faceFlower, r.faceHead]).toEqual([0, 0, 0, 0]);
  });

  it('mask 分集：PreventFaceMaskDraw 全隐 / DrawFaceMaskUnderHeadLayer 归头层（并集=旧 70 元门）', () => {
    expect(PREVENT_FACE_MASK_DRAW.size).toBe(48);
    expect(FACE_MASK_UNDER_HEAD_LAYER.size).toBe(22);
    expect(FACE_MASK_HELMET_HIDE.size).toBe(70);   // 并集无交集
    const plan = faceLayerSplitPlan({ face: 0, faceMask: 22, faceFlower: 0, faceHead: 0 }, 26);
    expect(plan.split).toBe(true);           // 头 26 ∈ under-head-layer → 头层拆画
    expect(plan.maskUnderHead).toBe(true);
    const hidden = faceLayerSplitPlan({ face: 0, faceMask: 22, faceFlower: 0, faceHead: 0 }, 268);
    expect(hidden.split).toBe(false);        // 头 268 ∈ PreventFaceMaskDraw → 全隐
  });

  it('拆画计划：faceHead→split+skipFace;underHair→split;HidesHead 头盔→不拆;OverrideHelmet→hairHidden', () => {
    const skull = faceLayerSplitPlan({ face: 0, faceMask: 0, faceFlower: 0, faceHead: 12 }, 3);
    expect(skull.split).toBe(true);
    expect(skull.skipFace).toBe(true);       // TheFace 分支二替代皮肤脸（:2592）
    const blind = faceLayerSplitPlan({ face: 5, faceMask: 0, faceFlower: 0, faceHead: 0 }, 0);
    expect(blind.split).toBe(true);
    expect(blind.skipFace).toBe(false);
    const hides = faceLayerSplitPlan({ face: 5, faceMask: 0, faceFlower: 0, faceHead: 12 }, 38);   // 狼人头 38 ∈ HidesHead
    expect(hides.split).toBe(false);         // :2577 flag 门——头层路径整支不画
    const oh = faceLayerSplitPlan({ face: 19, faceMask: 0, faceFlower: 0, faceHead: 0 }, 38);
    expect(oh.hairHidden).toBe(true);        // PreventHairDraw 同集 → 发整隐
    expect(oh.head).toBe(0);
  });
});

// ================= ③ 前层三支绘制序与门（22_FaceAcc :2801-2852） =================

/** 记录型 ctx + 假 atlas 直调（accessory-unmodeled 同款假体） */
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

describe('face 四层路由③：前层三支序 base→mask→flower + 头层兜底/抑重', () => {
  it('三件并存：前层序 face(base) → faceMask → faceFlower（:2809/:2819/:2836 支序）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(888), stack: 1 };   // underHair 5 → face 字段
    p.inv.armor[4] = { id: _iid(5596), stack: 1 };  // mask 22
    p.inv.armor[5] = { id: _iid(223), stack: 1 };   // flower 1
    const r = drawFront(p, 0);
    const faceIdx = r.files.indexOf('vanilla/Acc_Face_5.png');
    const maskIdx = r.files.indexOf('vanilla/Acc_Face_22.png');
    const flowerIdx = r.files.indexOf('vanilla/Acc_Face_1.png');
    expect(faceIdx).toBeGreaterThanOrEqual(0);
    expect(maskIdx).toBeGreaterThan(faceIdx);
    expect(flowerIdx).toBeGreaterThan(maskIdx);
  });

  it('mask 门（:2819-2821）：head 268 全隐 / head 3 画且 (0,-2) 长盔偏移+helmetOffset / 无盔直画', () => {
    const mk = (vid: number, head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      return drawFront(p, head);
    };
    expect(mk(5596, 268).files).toEqual([]);                 // PreventFaceMaskDraw
    const withHelmet = mk(5596, 3);
    expect(withHelmet.files).toEqual(['vanilla/Acc_Face_22.png']);
    expect(withHelmet.draws[0].dy).toBe(-54);                // FACE_HELMET_OFFSET[22][3]=(0,-2)
    expect(mk(5596, 0).draws[0].dy).toBe(-52);
  });

  it('head 层拆画帧（headFaceHandled）：underHair/faceHead 前层兜底不画;兜底帧照画+门', () => {
    const mk = (vid: number, head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(vid), stack: 1 };
      return p;
    };
    // 眼罩 888：拆画帧不重画
    expect(drawFront(mk(888, 0), 0, true).files).toEqual([]);
    // 兜底帧（fallback 精灵路径）：underHair 裸锚;骷髅族 faceHead 走 HidesHead 门
    expect(drawFront(mk(888, 0), 0, false).files).toEqual(['vanilla/Acc_Face_5.png']);
    expect(drawFront(mk(888, 38), 38, false).files).toEqual([]);       // HidesHead[38] 门
    expect(drawFront(mk(193, 0), 0, false).files).toEqual(['vanilla/Acc_Face_12.png']);
    expect(drawFront(mk(193, 3), 3, false).files).toEqual(['vanilla/Acc_Face_17.png']);   // AltFaceHead 换档
    expect(drawFront(mk(193, 38), 38, false).files).toEqual([]);       // HidesHead 门
    // 骷髅族+眼罩双戴兜底：盲眼罩 +2·dir 偏移（:2603-2609）
    const both = new Player(0, 0, new Inventory());
    both.inv.armor[3] = { id: _iid(193), stack: 1 };
    both.inv.armor[4] = { id: _iid(888), stack: 1 };
    const rb = drawFront(both, 0, false);
    const blindIdx = rb.files.indexOf('vanilla/Acc_Face_5.png');
    expect(blindIdx).toBeGreaterThan(rb.files.indexOf('vanilla/Acc_Face_12.png'));   // underHair 在 faceHead 上
    expect(rb.draws[blindIdx].dx).toBe(-18);   // drawAccBodyFrame 锚 -20 + (+2) 偏移
  });

  it('OverrideHelmet 露脸装备（5100 骨盔+头盔 38）：face 19 保留画 (0,-6)、head 归 0（:36256-36259）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[3] = { id: _iid(5100), stack: 1 };
    const r = drawFront(p, 38);
    expect(r.files).toEqual(['vanilla/Acc_Face_19.png']);
    expect(r.draws[0].dy).toBe(-58);   // -52 + FACE_DRAW_OFFSET[19]=(0,-6)
  });

  it('flower 门（:2836-2838）：head 92/275 隐没,head 3 照画', () => {
    const mk = (head: number) => {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[3] = { id: _iid(223), stack: 1 };
      return drawFront(p, head);
    };
    expect(mk(92).files).toEqual([]);
    expect(mk(275).files).toEqual([]);
    expect(mk(3).files).toEqual(['vanilla/Acc_Face_1.png']);
  });
});

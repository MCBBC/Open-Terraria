// BJ401 妖精坐骑（mount 61 Form of the Fae）装备渲染整隐刀：
//  用户实报"变身后妖精形态身上还带着装备（盾牌/翅膀/盔甲可见）"。
//  原版语义（反编译锚，全部 1457）：
//   - MountID.Sets.PlayerIsHidden = {52,54,55,56,61}（MountID.cs:25）
//   - PlayerDrawSet.BoringSetup → AdjustmentsForPixieMount（PlayerDrawSet.cs:1910-1914）
//     hideEntirePlayer=true + weaponDrawOrder=BehindBackArm
//   - hideEntirePlayer 消费（PlayerDrawSet.cs:1694-1697）：colorArmorBody/Legs/Head/
//     colorShirt/Pants/Shoes/UnderShirt/BodySkin/Head/Hair/Eyes/EyeWhites/DisplayDollSkin
//     + 三 glow 全 Color.Transparent → 各配饰身架族（25_Shield :3055-3127、
//     10_BackAcc :632、11_Balloons :1160/:1168、14/18/19/20/22/29/32 各层）染色即隐
//   - 54 迅猛龙走 hideEntirePlayerExceptHelmetsAndFaceAccessories（:1689-1693）：
//     colorArmorHead 保留 → 脸饰照画（CanDrawOnVelociraptorMount 门）
//   - DontHoldItems={55,56,61}（MountID.cs:29）→ Mount.UpdateEffects case 55/56/61
//     IsAllowedToHoldItems=false + noItems=true（Mount.cs:5195-5200）→
//     DrawPlayer_27_HeldItem 头门整层跳过（PlayerDrawLayers.cs:3149-3152）= 手持物不画
//   - 翅膀：DrawPlayer_09_Wings 头门 hideEntirePlayer 早退（:657-659）+ 骑乘清翼
//     （Player.cs:26316-26322 CanUseWings 族）——BJ358 既有门，本套件锁存防回退
// 本刀三面：
//   ① drawAccBehindLayers（披风/气球）挂 PlayerIsHidden 门（原无门=泄漏源一）
//   ② drawAccFrontLayers（盾/鞋/手/腰/颈/脸/前饰/气球前族）挂门
//      （★X4-债6 清偿 2026-09-29：54 迅猛龙旧豁免支拆除,全族同门——原版
//      ExceptHelmets 支把身前非脸族染色全 Transparent,照画=登记偏差已修）
//   ③ 静持手持物挂 DontHoldItems 门（61 不再画火把等静持物；52/54 照画）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { World } from '../src/world/World';
import { MOUNT_SETS, MOUNT_DATA } from '../src/entities/Mounts';
import { MOUNT_BACKPACK_OK } from '../src/data/vanillaAccDrawslots';
import { Renderer } from '../src/render/Renderer';
import type { GameHooks } from '../src/entities/types';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const RDR_PATH = join(__dirname, '../src/render/Renderer.ts');

// ================= ① 数据面锚（vanilla-mounts.json ↔ MountID.cs:25/:29） =================

describe('BJ401 数据面：变身坐骑隐藏族集合', () => {
  it('PlayerIsHidden = {52,54,55,56,61}（MountID.cs:25），61 妖精在内', () => {
    for (const t of [52, 54, 55, 56, 61]) expect(MOUNT_SETS.PlayerIsHidden?.[t]).toBe(true);
    for (const t of [12, 40, 57, 58, 59, 60]) expect(MOUNT_SETS.PlayerIsHidden?.[t] ?? false).toBe(false);
  });
  it('DontHoldItems = {55,56,61}（MountID.cs:29）——61 禁持,52/54 照持', () => {
    for (const t of [55, 56, 61]) expect(MOUNT_SETS.DontHoldItems?.[t]).toBe(true);
    for (const t of [52, 54, 12]) expect(MOUNT_SETS.DontHoldItems?.[t] ?? false).toBe(false);
  });
  it('61 妖精 mount 贴图在库（Extra_290 front/frontExtra 291）——骑乘期唯一视觉主体', () => {
    const d = MOUNT_DATA['61'];
    expect(d).toBeTruthy();
    expect(d?.frontTexture).toBe('Extra_290.png');
    expect(d?.frontTextureExtra).toBe('Extra_291.png');
  });
  it('61 不在 MOUNT_BACKPACK_OK（背包/尾巴既有门对 61 已隐,本刀不波及）', () => {
    expect(MOUNT_BACKPACK_OK.has(61)).toBe(false);
    expect(MOUNT_BACKPACK_OK.has(57)).toBe(true);
  });
});

// ================= ② 渲染层门（记录型 ctx 直调,accessory-systematic 同款假体） =================

/** 记录型 ctx + 假 atlas 直调（accessory-systematic.test.ts 同款） */
function drawAccWithFake(method: 'drawAccBehindLayers' | 'drawAccFrontLayers', p: Player,
  mnt: { type: number } | null): { files: string[] } {
  const files: string[] = [];
  const texStub = { width: 40, height: 1120 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'canvas' ? undefined : () => undefined),
    set: () => true,
  });
  const proto = Renderer.prototype as unknown as Record<string, (...a: unknown[]) => void>;
  proto[method].call({
    ctx,
    atlas: { ensureVImage: (f: string) => { files.push(f); return texStub; } },
    wingTexSource: () => null,
    drawAccBodyFrame: proto.drawAccBodyFrame,
  }, ctx, p, { body: 0, legs: 0 }, 1, mnt as never,
  ...(method === 'drawAccFrontLayers' ? [0, 0, false] : []));
  return { files };
}

function equipFullKit(p: Player): void {
  // 盾 156（shield 槽）/ 披风 532（back）/ 鞋 54（shoe）/ 腰 53（waist）/ 颈 554（neck）
  p.inv.armor[3] = { id: _iid(156), stack: 1 };
  p.inv.armor[4] = { id: _iid(532), stack: 1 };
  p.inv.armor[5] = { id: _iid(54), stack: 1 };
  p.inv.armor[6] = { id: _iid(53), stack: 1 };
  p.inv.armor[7] = { id: _iid(554), stack: 1 };
}

function equipFullKitWithBalloon(p: Player): void {
  equipFullKit(p);
  // 气球 3250（balloon 槽）——配件槽 3..7 内（第 6 槽 armor[8] 需专家门,不加门省槽）
  p.inv.armor[7] = { id: _iid(3250), stack: 1 };
}

describe('BJ401 渲染层：变身坐骑（61）配饰身架族整隐', () => {
  it('drawAccBehindLayers：骑 61 → 披风/气球零绘制；mnt=null 与普通骑（12 兔）照画', () => {
    const w = new World(80, 120, 72, 'bj401');
    const mk = () => {
      const p = new Player(30 * 16, 77 * 16, new Inventory());
      equipFullKitWithBalloon(p);
      return p;
    };
    const p61 = mk();
    expect(drawAccWithFake('drawAccBehindLayers', p61, { type: 61 }).files).toEqual([]);
    const pFree = mk();
    expect(drawAccWithFake('drawAccBehindLayers', pFree, null).files)
      .toEqual(['vanilla/Acc_Back_2.png', 'vanilla/Acc_Balloon_13.png']);
    const pBunny = mk();
    expect(drawAccWithFake('drawAccBehindLayers', pBunny, { type: 12 }).files)
      .toEqual(['vanilla/Acc_Back_2.png', 'vanilla/Acc_Balloon_13.png']);
  });

  it('drawAccFrontLayers：骑 61 → 盾/鞋/腰/颈全族零绘制（用户实报面）；普通骑照画', () => {
    const mk = () => {
      const p = new Player(30 * 16, 77 * 16, new Inventory());
      equipFullKit(p);
      return p;
    };
    const p61 = mk();
    expect(drawAccWithFake('drawAccFrontLayers', p61, { type: 61 }).files).toEqual([]);
    const pBunny = mk();
    const bunnyFiles = drawAccWithFake('drawAccFrontLayers', pBunny, { type: 12 }).files;
    expect(bunnyFiles).toContain('vanilla/Acc_Shield_1.png');
    expect(bunnyFiles).toContain('vanilla/Acc_Shoes_6.png');
    expect(bunnyFiles).toContain('vanilla/Acc_Waist_1.png');
    expect(bunnyFiles).toContain('vanilla/Acc_Neck_2.png');
  });

  it('54 迅猛龙身前非脸族整隐（★X4-债6 清偿 2026-09-29：旧豁免支拆除——ExceptHelmets 染色面亲读 PlayerDrawSet.cs:1886+:1689-1693,身前各族 colorArmorBody/Legs/Shoes 全 Transparent,唯脸饰原版照画而本仓无该槽=零损失）', () => {
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    equipFullKit(p);
    const files = drawAccWithFake('drawAccFrontLayers', p, { type: 54 }).files;
    expect(files).toEqual([]);   // 与 52/55/56/61 同相（原版同相：盾/鞋/腰/颈全隐）
  });

  it('52/55/56 同族同门（hideEntirePlayer 全族,与 61 同相）', () => {
    const mk = () => {
      const p = new Player(30 * 16, 77 * 16, new Inventory());
      equipFullKit(p);
      return p;
    };
    for (const t of [52, 55, 56]) {
      expect(drawAccWithFake('drawAccFrontLayers', mk(), { type: t }).files).toEqual([]);
      expect(drawAccWithFake('drawAccBehindLayers', mk(), { type: t }).files).toEqual([]);
    }
  });
});

// ================= ③ 源码锚锁（era-guard 家族：BJ401 三门 + BJ358 既有门防回退） =================

describe('BJ401 源码锚锁：三门落位 + BJ358 锚不回退', () => {
  const src = readFileSync(RDR_PATH, 'utf8');

  it('drawAccBehindLayers 头部挂 PlayerIsHidden 门', () => {
    const i = src.indexOf('private drawAccBehindLayers');
    const seg = src.slice(i, i + 900);
    expect(seg).toContain('MOUNT_SETS.PlayerIsHidden?.[mnt.type]) return;');
  });
  it('drawAccFrontLayers 头部挂 PlayerIsHidden 门（★X4-债6 清偿：54 豁免支已拆,全族同门）', () => {
    const i = src.indexOf('private drawAccFrontLayers');
    const seg = src.slice(i, i + 2400);
    expect(seg).toContain('MOUNT_SETS.PlayerIsHidden?.[mnt.type]) return;');
    expect(seg).not.toContain('mnt.type !== 54');   // 旧豁免支防复活
  });
  it('静持手持物挂 DontHoldItems 门（61 禁持,PlayerDrawLayers.cs:3149 同相）', () => {
    const i = src.indexOf('if (staticHoldStyle\n');
    expect(i).toBeGreaterThan(0);
    const seg = src.slice(i, i + 300);
    expect(seg).toContain('MOUNT_SETS.DontHoldItems?.[p.mount.type]');
  });
  it('BJ358 锚防回退：翅膀/纸娃娃/legacy 三面 mntHidden 门原样', () => {
    // 翅膀 wingSlot 门（DrawPlayer_09_Wings :657 同相）
    expect(src).toContain('!merfolkClearWings && !mntHidden ? wingAgg.logic : 0');
    // 纸娃娃门（AdjustmentsForPixieMount hideEntirePlayer 消费）
    // ★Maples 退役刀0(2026-10-17)：外观缺省化(app=p.appearance??defaultAppearance)后
    //  门=纯 mntHidden;legacy Maples 精灵路径门已随域退役删除(其 !drawn 链只剩程序化兜底)
    expect(src).toContain('if (!mntHidden)');
    expect(src).toContain('const app = p.appearance ?? defaultAppearance();');
    // 程序化兜底路径门(最后保险,原 legacy 门位)
    expect(src).toContain('if (!drawn && !mntHidden)');
    // 日曜盾球门（DrawPlayer_26_SolarShield）
    expect(src).toContain('p.solarShields > 0 && !p.dead && !mntHidden');
  });
  it('drawMountLayer 无 PlayerIsHidden 早退（mount 贴图骑乘期照画=61 唯一视觉主体）', () => {
    const i = src.indexOf('private drawMountLayer');
    const seg = src.slice(i, i + 700);
    expect(seg).not.toContain('PlayerIsHidden');
    expect(seg).toContain('IsRollerSkates');   // 既有唯一早退门（57-60 零机身）
  });
});

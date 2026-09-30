// 弹幕染料尾批三件判别闸（清偿刀 Q3 2026-09-30）——N 刀登记三件的落刀面。
// 原版锚（Terarria1457 唯一标杆）：
//   · 4762 CritterShampoo：Item.cs:39177-39185（accessory+vanity+rare1+hasVanityEffects）；
//     注册面先定谳=vanilla.json 精灵/自动注册循环/l10n 官方键全在（BJ413 判例:在则零动作）。
//   · MP miscDyes 段：ItemContainer.MiscDyes=3——inv.miscDyes[0]/[1]/[4] = cPet/cLight/
//     cGrapple 源槽（Player.UpdateDyes Player.cs:9667-9692）；段形态与既有三段同构
//     （定长 8 字节/条）;降级矩阵=旧端 container>2 门整条丢弃（帧级前向兼容）。
//   · PetFollower 三专绘支（1090 滚动专绘/764 陨星覆绘/legacyDraw 兜底）：vanilla 全部
//     EntitySpriteDraw 过 GetProjectileDesiredShader（Main.cs:33355/33380/33406/38333;
//     1090/764∈projPet,dmg0 → cPet）——整弹批同染语义。
// 判别域=纯逻辑（表/协议/通道）+ 接线源锚（R17 先例:readFileSync 源锚锁接线面）;
// canvas 烘焙面由浏览器探针覆盖（docs/evidence/proj-dye-q3/）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROJ_PET, PROJ_LIGHT_PET, dyeChannelsOf, getProjDesiredDyeVid,
  CRITTER_SHAMPOO, type DyeInvSource } from '../src/data/projDye';
import { ITEM_DEFS } from '../src/data/items';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import { writePlayerItems, readPlayerItems, ItemContainer, INV_SYNC_SIZES, NetReader }
  from '../src/net/protocol';

/** 内部 id → vid 反查（proj-dye-channels 同款本地实现） */
function iidOfVid(vid: number): number {
  for (let i = 1; i < ITEM_DEFS.length; i++) {
    if (ITEM_DEFS[i]?.vid === vid) return i;
  }
  return -1;
}

const readJson = (u: URL): Record<string, unknown> => JSON.parse(readFileSync(u, 'utf8')) as Record<string, unknown>;

// ===================== 件① 4762 CritterShampoo 注册面 =====================
describe('件① 4762 CritterShampoo 注册面（先定谳:全在=零动作,BJ413 判例）', () => {
  it('ITEM_DEFS 自动注册循环覆盖 4762（vid 回填=方案A ⑥;projPet cMinion 唯一源配饰）', () => {
    const iid = iidOfVid(CRITTER_SHAMPOO);
    expect(iid, 'ITEM_DEFS vid 4762 缺库').toBeGreaterThan(0);
    expect(ITEM_DEFS[iid].vid).toBe(4762);
    expect(ITEM_DEFS[iid].key).toMatch(/^vi_4762_CritterShampoo$/);
  });
  it('vanilla.json 精灵条目在（Item_Atlas_0 页矩形——vicon 兜底链,无需独立 Item_4762.png）', () => {
    const meta = readJson(new URL('../public/sprites/vanilla.json', import.meta.url)) as {
      items: Record<string, { name: string; key: string; icon: string; ix: number; iy: number; iw: number; ih: number }>;
    };
    const m = meta.items['4762'];
    expect(m, 'vanilla.json items[4762] 缺').toBeTruthy();
    expect(m.key).toBe('CritterShampoo');
    expect(m.icon).toBe('vanilla/Item_Atlas_0.png');
    // 矩形在界（2048² 页内;像素实测 504/576 不透明=贴图在位）
    expect(m.iw).toBe(18); expect(m.ih).toBe(32);
    expect(m.ix + m.iw).toBeLessThanOrEqual(2048);
    expect(m.iy + m.ih).toBeLessThanOrEqual(2048);
  });
  it('l10n 官方名字键在（ItemName.CritterShampoo——en/zh 产品文件抽检）', () => {
    const en = readJson(new URL('../public/l10n/en-US.json', import.meta.url)) as { ItemName: Record<string, string> };
    const zh = readJson(new URL('../public/l10n/zh-Hans.json', import.meta.url)) as { ItemName: Record<string, string> };
    expect(en.ItemName.CritterShampoo).toBe('Critter Shampoo');
    expect(zh.ItemName.CritterShampoo).toBe('小动物香波');
  });
  it('stats 面=社交配饰（Item.cs:39177-39185 accessory+vanity+hasVanityEffects——时装段 13-19 可装）', () => {
    const st = vanillaStatOfVid(CRITTER_SHAMPOO);
    expect(st).not.toBeNull();
    expect(st!.van).toBe(1);
    expect(st!.acc).toBe(0);
  });
  it('cMinion 链端到端（真 ITEM_DEFS id）:armor[13]=4762 + dye[3] → cMinion（Player.cs:9832-9834,i%10）', () => {
    const shampoo = iidOfVid(CRITTER_SHAMPOO);
    const redDye = iidOfVid(1007);
    expect(shampoo).toBeGreaterThan(0);
    expect(redDye).toBeGreaterThan(0);
    const inv = {
      miscDyes: Array(5).fill(null),
      armor: Array(20).fill(null),
      isItemSlotUnlockedAndUsable: () => true,
      getEffectiveDye: (slot: number) => (slot === 3 ? { id: redDye } : null),
    } as unknown as DyeInvSource;
    (inv.armor as Array<{ id: number } | null>)[13] = { id: shampoo };
    const ch = dyeChannelsOf(inv);
    expect(ch.cMinion).toBe(1007);
    // 通道隔离：miscDyes 空槽不串道（cPet/cLight/cGrapple 恒 0）
    expect(ch.cPet).toBe(0); expect(ch.cLight).toBe(0); expect(ch.cGrapple).toBe(0);
    // minion 弹（266 宝宝史莱姆）吃 cMinion
    expect(getProjDesiredDyeVid({ vid: 266, minion: true, damage: 0 }, ch)).toBe(1007);
  });
});

// ===================== 件② MP miscDyes 段（协议容器扩展） =====================
describe('件② MP miscDyes 段（ItemContainer.MiscDyes=3）', () => {
  it('容器表/容量表（Q3 扩展面）', () => {
    expect(ItemContainer.MiscDyes).toBe(3);
    expect(INV_SYNC_SIZES).toEqual([58, 20, 10, 5]);
    expect(ItemContainer.Slots).toBe(0);
    expect(ItemContainer.Armor).toBe(1);
    expect(ItemContainer.Dye).toBe(2);
  });
  it('round-trip：writePlayerItems→readPlayerItems 四容器同形（含 prefix,定长条目）', () => {
    const entries = [
      { playerSlot: 1, container: ItemContainer.MiscDyes, itemSlot: 0, itemId: 3211, stack: 1, prefix: 0 },
      { playerSlot: 1, container: ItemContainer.MiscDyes, itemSlot: 1, itemId: 3554, stack: 1, prefix: 0 },
      { playerSlot: 1, container: ItemContainer.MiscDyes, itemSlot: 4, itemId: 0, stack: 0, prefix: 0 },
      { playerSlot: 1, container: ItemContainer.Slots, itemSlot: 0, itemId: 5451, stack: 1, prefix: 66 },
    ];
    const frame = writePlayerItems(entries);
    const back = readPlayerItems(new NetReader(frame.subarray(3)));   // 剥 [u16 len][u8 id] 头
    expect(back.length).toBe(4);
    expect(back[0]).toMatchObject({ playerSlot: 1, container: 3, itemSlot: 0, itemId: 3211, stack: 1 });
    expect(back[1]).toMatchObject({ container: 3, itemSlot: 1, itemId: 3554 });
    expect(back[2]).toMatchObject({ container: 3, itemSlot: 4, itemId: 0, stack: 0 });
    expect(back[3]).toMatchObject({ container: 0, itemId: 5451, prefix: 66 });
  });
  it('旧端降级矩阵：旧读端 container>2 门整条丢弃=帧不错位、fail-open（cPet/cLight/cGrapple=0）', () => {
    const frame = writePlayerItems([
      { playerSlot: 1, container: ItemContainer.Armor, itemSlot: 3, itemId: 6185, stack: 1, prefix: 66 },
      { playerSlot: 1, container: ItemContainer.MiscDyes, itemSlot: 0, itemId: 3211, stack: 1, prefix: 0 },
    ]);
    const back = readPlayerItems(new NetReader(frame.subarray(3)));
    // 旧端 applyRemoteItems 旧门（`e.container > 2 → continue`）等价过滤
    const oldEnd = back.filter((e) => (e.container as number) <= 2);
    expect(oldEnd.length).toBe(1);
    expect(oldEnd[0]).toMatchObject({ container: ItemContainer.Armor, itemId: 6185 });
    // 定长条目：帧长=n×8+5 头（[u16 len][u8 id]+u16 计数）——旧端定长循环读满 n 条不错位
    expect(frame.length).toBe(5 + back.length * 8);
  });
  it('接线源锚：ClientNet 四容器循环/袋 miscDyes[5]/container>3 门（R17 源锚先例）', () => {
    const src = readFileSync(new URL('../src/net/ClientNet.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/miscDyes: Array\(5\)\.fill\(null\)/);                      // bag init
    expect(src).toMatch(/e\.container > 3 \|\| e\.itemSlot >= INV_SYNC_SIZES\[e\.container\]/); // 消费门
    expect(src).toMatch(/c === 2 \? p\.inv\.dye : p\.inv\.miscDyes/);               // 全量 dump arr 解析
    expect(src).toMatch(/p\.inv\.slots, p\.inv\.armor, p\.inv\.dye, p\.inv\.miscDyes/); // 差分 cur 四表
    expect(src).toMatch(/e\.container === 2 \? bag\.dye : bag\.miscDyes/);          // 落袋 arr 解析
  });
  it('接线源锚：server room.ts 透传（快照四表/进房全量下发/值域门 >3）', () => {
    const src = readFileSync(new URL('../../server/src/room.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/miscDyes: Array\(INV_SYNC_SIZES\[3\]\)\.fill\(null\)/);    // 客户端快照 init
    expect(src).toMatch(/other\.items\.inv, other\.items\.armor, other\.items\.dye, other\.items\.miscDyes/); // 进房全量
    expect(src).toMatch(/if \(e\.container > 3\) return false;/);                   // 值域门
  });
  it('接线源锚：Game 代理拷入 miscDyes + 无人机傀儡 dyeInvProbe（弹染料 MP 消费面）', () => {
    const game = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(game).toMatch(/if \(bag\.miscDyes\) proxy\.inv\.miscDyes = bag\.miscDyes;/);
    expect(game).toMatch(/d\.dyeInvProbe = \(slot\) => this\.remotePlayerProxies\.find\(/);
    const drone = readFileSync(new URL('../src/entities/DroneProjs.ts', import.meta.url), 'utf8');
    expect(drone).toMatch(/dyeInvProbe\?: \(slot: number\) => unknown/);
    expect(drone).toMatch(/d\.dyeInvProbe && d\.netOwnerSlot !== undefined/);       // 傀儡支读口
  });
});

// ===================== 件③ PetFollower 三专绘支接染 =====================
describe('件③ PetFollower 三专绘支接染（1090/764/legacyDraw）', () => {
  const src = readFileSync(new URL('../src/entities/PetFollower.ts', import.meta.url), 'utf8');
  it('通道判定：1090/764 ∈ projPet ∧ dmg0 ∧ 非光宠 → cPet（GetProjectileDesiredShader 次序③）', () => {
    expect(PROJ_PET.has(1090)).toBe(true);
    expect(PROJ_PET.has(764)).toBe(true);
    expect(PROJ_LIGHT_PET.has(1090)).toBe(false);
    expect(PROJ_LIGHT_PET.has(764)).toBe(false);
    const CH = { cPet: 1007, cLight: 0, cGrapple: 0, cMinion: 0 };
    expect(getProjDesiredDyeVid({ vid: 1090, minion: false, damage: 0 }, CH)).toBe(1007);
    expect(getProjDesiredDyeVid({ vid: 764, minion: false, damage: 0 }, CH)).toBe(1007);
    // damage>0 出 projPet 支 = 无染（原版同相）
    expect(getProjDesiredDyeVid({ vid: 1090, minion: false, damage: 5 }, CH)).toBe(0);
  });
  it('1090 滚动专绘支：虹晕/拖尾/星芒/壳格/本体五绘位均接 dyedProjCanvas', () => {
    const m = src.match(/private rainbowBoulderPetDraw\([\s\S]*?\n  \/\/ ===============/);
    expect(m, 'rainbowBoulderPetDraw 方法体').toBeTruthy();
    const body = m![0];
    // 五个绘制位（Extra_283 虹晕/Projectile_250 拖尾/Extra_55 星芒/1047 壳格/1090 本体）
    expect(body.match(/dyedProjCanvas/g)?.length).toBeGreaterThanOrEqual(5);
    expect(body).toMatch(/Extra_283/);           // 虹晕绘位仍在（染包外层）
    expect(body).toMatch(/Projectile_250/);      // 拖尾绘位
    expect(body).toMatch(/Extra_55/);            // 星芒绘位
    expect(body).toMatch(/Projectile_1047/);     // 滚动壳表绘位
    // 通道解出（petDyeVid 一次/帧）
    expect(body).toMatch(/const dyeVid = this\.petDyeVid\(\)/);
  });
  it('764 陨星覆绘支：Item_75 覆绘过 dyedProjCanvas（vanilla EntitySpriteDraw Main.cs:38333）', () => {
    const m = src.match(/if \(this\.projId === 764\) \{[\s\S]*?\n    \}\n    \/\/ ★终清波批/);
    expect(m, '764 覆绘块').toBeTruthy();
    expect(m![0]).toMatch(/dyedProjCanvas\(itemImg, 0, 0, itemImg\.width, ifh, dv764/);
    expect(m![0]).toMatch(/vanilla\/Item_75\.png/);
  });
  it('legacyDraw 兜底支：表外 id 命中 projPet 时同走染（projPet 表驱动,不依赖 params 表）', () => {
    const m = src.match(/private legacyDraw\([\s\S]*?\n  \}\n\}/);
    expect(m, 'legacyDraw 方法体').toBeTruthy();
    expect(m![0]).toMatch(/const dyeVid = this\.petDyeVid\(\)/);
    expect(m![0]).toMatch(/dyedProjCanvas\(img, fi \* fw, 0, fw, fw, dyeVid/);
    // 无染回退原图直绘（零改动面）
    expect(m![0]).toMatch(/const tex = dyed \?\? img;/);
  });
});

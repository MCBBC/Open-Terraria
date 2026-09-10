// SW-BJ52 2026-09-10 宝箱右键命中域收原版精确域（用户实报：并排多箱点 B 正中
// 开左邻箱 A，右移一点才开 B——"触发范围是不是有点问题"）
//
// 金标（1457 反编译；1458 增量面未触交互链——SetDefaults 零变更）：
//   ①门 = Player.cs:33314 分支入口 Main.tile[myX,myY] 本体
//      TileID.Sets.BasicChest[21,467] ∪ 29 ∪ 97 ∪ 463 ∪ 491——光标 tile 必须
//      本身是容器 tile，无任何邻域/外扩面。
//   ②回溯 = :33317-33319 `num75 = frameX/18; while(num75>1) num75-=2;
//      num75 = myX-num75` + :33320 `num76 = myY - frameY/18`——点箱任一本体格
//      都回溯到同一 top-left 原点。
//   ③解析 = :33497 Chest.FindChest(num75,num76)（Chest.cs:507 _chestsByCoords
//      原点精确查，cs:109 注册 new Point(chest.x,chest.y)）——相邻箱共享零
//      tile，解析唯一无歧义。
//   ④hover 同源 = TileInteractionsMouseOver（Player.cs:33951/:33955 调
//      TileInteractionsMouseOver_Containers :35028）同样按光标 tile 本体
//      type 21/467 才进容器悬停——无邻域面。
//   ⑤金锁同域 = PlaceThing_LockChest（Player.cs:41923-41931）光标 tile 本体
//      IsAContainer∪!88 门 + :41962-41967 同款帧回溯 → :41968 Chest.Lock(原点)。
//   ⑥换算锚 = tileTargetX/Y = (int)((mouseX+screenPosition.X)/16f)
//      （Player.cs:5126-5127）= floor 语义；本仓 Camera.tileUnder
//      （render/Camera.ts:67-70 Math.floor(wx/TILE)）1:1——换算面无罪。
//
// 仓库偏差（根因面 a+d 混合：自创命中外扩 + 左上偏平局裁决）：
//   Game.ts rightClickTileNpcDispatch 箱臂曾用 findChestNear 3×3 邻域容差
//   （dy=-1 行先行、dx=-1 列先行 = 左上偏平局裁决）且先于 tile 类型门执行——
//   ①并排箱点 B 左列 tile (12,y)：探针序 (11,y-1),(12,y-1),(13,y-1),(11,y)
//   先命中 A ⇒ 开 A（实报主诉：点 B"正中"=左列 → 开 A，右移过列界才开 B）；
//   ②上叠箱点 B 顶行 (x,12)：探针 (x-1..x+1,11) 先命中 A；
//   ③箱旁非箱格（蜥蜴祭坛/告示牌/地面）被箱截胡（祭坛守卫 cursorIsAltar 即
//   为此打的补丁——治标不治本）；④interactAt 箱臂 `findChest ?? findChestNear`
//   与金锁 findChestNear 同族偏差。
// 本批全撤邻域容差：命中解析 = findChest（2×2 本体含格回查）= ①+②+③ 等价
// （ChestData.x,y = 原点；21/467 均 2 宽×2 高全覆盖）。
//
// 变异判别力（红蓝自审）：用例 ①②③⑤ 在旧 findChestNear 代码下逐条爆红
// （预修运行已录红；修复后转绿 = 判别力自证）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game';
import { T, TILE_BY_KEY } from '../src/data/tiles';

type AnyGame = Record<string, any>;

const SRC = readFileSync(join(__dirname, '..', 'src', 'core', 'Game.ts'), 'utf8');
const CHEST = T.CHEST;
const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar'] ?? -1;

/** 假 store（sw-bj25 同式）：tileAt[(x,y)]→type */
function makeStore(tileAt: Record<string, number>) {
  const W = 400;
  const fx: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, number>)[k] : 0),
  });
  const fy: Record<number, number> = new Proxy({} as Record<number, number>, {
    get: (t, k) => (k in t ? (t as Record<PropertyKey, number>)[k] : 0),
  });
  return {
    w: W, h: 400,
    get: (x: number, y: number) => tileAt[`${x},${y}`] ?? 0,
    hasTile: (x: number, y: number) => (tileAt[`${x},${y}`] ?? 0) !== 0,
    idx: (x: number, y: number) => y * W + x,
    frameX: fx, frameY: fy,
  };
}

/** Game 原型桩（sw-bj25 同式；右键分派/格交互直驱）。
 *  玩家 (160,160,20,42) → tile 区 x∈[5,16] y∈[7,15]（tileReach 5/3） */
function makeRig(opts: { tileAt?: Record<string, number>; chests?: Array<{ x: number; y: number }> } = {}) {
  const tryOpenCalls: unknown[] = [];
  const g = Object.create(Game.prototype) as unknown as AnyGame;
  g.player = {
    x: 160, y: 160, w: 20, h: 42, cx: 170, cy: 181,
    useTime: 0, vx: 0, facing: 1, ridingMount: false, mount: { type: 0 },
    buffs: { has: () => false },
    inv: { heldItem: () => null, removeHeld: () => {} },
    equipStats: { tileRange: false, toolboxRange: 0 },
    banks: [[], [], [], []],
  };
  g.world = { store: makeStore(opts.tileAt ?? {}), flags: {}, clock: { isDay: true }, isJourney: false, chests: opts.chests ?? [] };
  g.camera = {
    tileUnder: (mx: number, my: number): [number, number] => [Math.floor(mx / 16), Math.floor(my / 16)],
    screenToWorld: (mx: number, my: number): [number, number] => [mx, my],
  };
  g.entities = { enemies: [], npcs: [], projectiles: [] };
  g.input = { rightDown: true, mouseX: 0, mouseY: 0, mouseHeld: false };
  g._prevRightDown = false;
  g.smartInteractNpcId = -1;
  g.dialogNpc = null;
  g.petFollower = null;
  g.lightPetFollower = null;
  g.wiring = null;
  g.net = undefined;
  g.openChestRef = () => null;
  g.openChest = () => {};
  g.closeChestPanel = () => {};
  // closeNpcDialog → npcShopClose 面（Object.create 桩无构造器,须预置实例态）
  g.npcShopOpen = false;
  g.shopSellbackMemo = new Map();
  g.shopBuybackStock = [];
  g.tryOpenChest = (c: unknown) => { tryOpenCalls.push(c); g.input.rightDown = false; };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {}, onClothesWindow: () => {}, onReadSign: () => {} };
  return { g, tryOpenCalls };
}

/** 箱族 tile 铺设：原点 (cx,cy) 的 2×2 本体全铺 CHEST */
function paintChest(tileAt: Record<string, number>, cx: number, cy: number) {
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) tileAt[`${cx + dx},${cy + dy}`] = CHEST;
}

// ---------------------------------------------------------------------------
// ① 并排三箱无缝（A=10-11 / B=12-13 / C=14-15 列）逐列命中图：
//    每箱任一本体格都开【本箱】——旧 3×3 容差下 B 左列开 A（实报主诉）
// ---------------------------------------------------------------------------
describe('SW-BJ52 ① 并排三箱：本体格逐格命中=本箱（原版 :33314 门+:33317 回溯）', () => {
  const tileAt: Record<string, number> = {};
  const chests = [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 14, y: 10 }];
  for (const c of chests) paintChest(tileAt, c.x, c.y);

  for (const [ci, chest] of chests.entries()) {
    const tag = ['A', 'B', 'C'][ci];
    for (const dx of [0, 1]) {
      for (const dy of [0, 1]) {
        const tx = chest.x + dx, ty = chest.y + dy;
        it(`${tag} 箱本体格 (${tx},${ty}) → 开 ${tag}（非邻箱）`, () => {
          const rig = makeRig({ tileAt, chests });
          (rig.g as AnyGame).rightClickTileNpcDispatch(tx, ty, null);
          expect(rig.tryOpenCalls).toEqual([chest]);
          expect(rig.g.input.rightDown).toBe(false);   // 箱臂自消（BJ25 旗代理面保持）
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// ② 邻域泄漏清零：箱体外一格（左/右/上/下/斜）永不因"附近有箱"开箱
//    ——旧 3×3 容差下 (9,10)/(10,12) 等格全数误开邻箱
// ---------------------------------------------------------------------------
describe('SW-BJ52 ② 箱外格零命中（撤 3×3 容差；原版无邻域回退面）', () => {
  const tileAt: Record<string, number> = {};
  const chests = [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 14, y: 10 }];
  for (const c of chests) paintChest(tileAt, c.x, c.y);
  // 箱带四缘 + 斜角（全在射程内 x∈[5,16] y∈[7,15]）
  const outside: Array<[number, number]> = [
    [9, 10], [9, 11], [9, 9],            // A 左缘/斜上
    [16, 10], [16, 11], [16, 12],        // C 右缘
    [10, 9], [11, 9], [12, 9], [13, 9], [14, 9],   // 顶缘
    [10, 12], [11, 12], [12, 12], [13, 12], [14, 12], // 底缘
  ];
  for (const [tx, ty] of outside) {
    it(`箱外格 (${tx},${ty}) 右键 → 零开箱（rightDown 不被箱臂消费）`, () => {
      const rig = makeRig({ tileAt, chests });
      (rig.g as AnyGame).rightClickTileNpcDispatch(tx, ty, null);
      expect(rig.tryOpenCalls).toEqual([]);
      expect(rig.g.input.rightDown).toBe(true);    // 原版无交互态：无消费者
    });
  }
});

// ---------------------------------------------------------------------------
// ③ 上叠双箱（A 行 10-11 / B 行 12-13 同列）：顶行点 B 开 B——
//    旧容差 dy=-1 先行探针 (x,11) 命中 A
// ---------------------------------------------------------------------------
describe('SW-BJ52 ③ 上下叠箱：行界分明，各开本箱', () => {
  const tileAt: Record<string, number> = {};
  const chests = [{ x: 10, y: 10 }, { x: 10, y: 12 }];
  for (const c of chests) paintChest(tileAt, c.x, c.y);

  it('B 顶行 (10,12)/(11,12) → 开 B（旧行为误开 A）', () => {
    for (const tx of [10, 11]) {
      const rig = makeRig({ tileAt, chests });
      (rig.g as AnyGame).rightClickTileNpcDispatch(tx, 12, null);
      expect(rig.tryOpenCalls).toEqual([chests[1]]);
    }
  });
  it('A 底行 (10,11)/(11,11) → 开 A（旧行为亦开 A，此处锁不回归）', () => {
    for (const tx of [10, 11]) {
      const rig = makeRig({ tileAt, chests });
      (rig.g as AnyGame).rightClickTileNpcDispatch(tx, 11, null);
      expect(rig.tryOpenCalls).toEqual([chests[0]]);
    }
  });
  it('B 底行 (10,13)/(11,13) → 开 B', () => {
    for (const tx of [10, 11]) {
      const rig = makeRig({ tileAt, chests });
      (rig.g as AnyGame).rightClickTileNpcDispatch(tx, 13, null);
      expect(rig.tryOpenCalls).toEqual([chests[1]]);
    }
  });
});

// ---------------------------------------------------------------------------
// ④ 留缝双箱（A=10-11 / 缝=12 / B=13-14 列）：缝格零开箱——
//    旧容差下缝格 (12,y) 探针 (11,y) 先命中 A
// ---------------------------------------------------------------------------
describe('SW-BJ52 ④ 箱间缝格零命中', () => {
  const tileAt: Record<string, number> = {};
  const chests = [{ x: 10, y: 10 }, { x: 13, y: 10 }];
  for (const c of chests) paintChest(tileAt, c.x, c.y);

  it('缝格 (12,10)/(12,11) → 零开箱', () => {
    for (const ty of [10, 11]) {
      const rig = makeRig({ tileAt, chests });
      (rig.g as AnyGame).rightClickTileNpcDispatch(12, ty, null);
      expect(rig.tryOpenCalls).toEqual([]);
      expect(rig.g.input.rightDown).toBe(true);
    }
  });
  it('两箱本体格各开本箱（缝不改变本体域）', () => {
    const rig = makeRig({ tileAt, chests });
    (rig.g as AnyGame).rightClickTileNpcDispatch(13, 10, null);
    expect(rig.tryOpenCalls).toEqual([chests[1]]);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 祭坛贴箱：光标在祭坛格（箱在其右邻）→ 永不开箱——
//    旧代码靠 cursorIsAltar 特判防此症，精确域后结构性排除（守卫撤除的回归锁）
// ---------------------------------------------------------------------------
describe('SW-BJ52 ⑤ 祭坛格贴箱：不开箱（cursorIsAltar 特判撤除后的结构保证）', () => {
  it('祭坛 (9,10) 右邻箱 A(10,10) → 右键祭坛零开箱', () => {
    const tileAt: Record<string, number> = { '9,10': ALTAR };
    const chests = [{ x: 10, y: 10 }];
    paintChest(tileAt, 10, 10);
    const rig = makeRig({ tileAt, chests });
    (rig.g as AnyGame).rightClickTileNpcDispatch(9, 10, null);
    expect(rig.tryOpenCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 未登记箱 tile（注册表落空）：不开箱不崩溃（原版 :33497 num77=-1 → 无操作）
// ---------------------------------------------------------------------------
describe('SW-BJ52 ⑥ 箱 tile 而注册表落空 → 零开箱', () => {
  it('chest tile (10,10)、world.chests 空 → 零开箱', () => {
    const tileAt: Record<string, number> = {};
    paintChest(tileAt, 10, 10);
    const rig = makeRig({ tileAt, chests: [] });
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 10, null);
    expect(rig.tryOpenCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑦ interactAt 直驱：箱臂本体域同样精确（防 dispatch 臂撤容差后 fallback 回潮）
// ---------------------------------------------------------------------------
describe('SW-BJ52 ⑦ interactAt 容器臂：精确域', () => {
  it('箱本体格 (11,11) → 开本箱', () => {
    const tileAt: Record<string, number> = {};
    const chest = { x: 10, y: 10 };
    paintChest(tileAt, 10, 10);
    const rig = makeRig({ tileAt, chests: [chest] });
    (rig.g as AnyGame).wiring = { sheetOf: () => 21 };
    (rig.g as AnyGame).interactAt(11, 11);
    expect(rig.tryOpenCalls).toEqual([chest]);
  });
  it('箱外格 (9,10)（tile 空）→ 零开箱', () => {
    const tileAt: Record<string, number> = {};
    const chest = { x: 10, y: 10 };
    paintChest(tileAt, 10, 10);
    const rig = makeRig({ tileAt, chests: [chest] });
    (rig.g as AnyGame).wiring = { sheetOf: () => 21 };
    (rig.g as AnyGame).interactAt(9, 10);
    expect(rig.tryOpenCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ⑨ SW-RB10d：箱分支入口序 = CloseSign()+SetTalkNPC(-1)（Player.cs:33344-33345）——
//    交谈中右键箱/储物族 → 对话面板关闭（原版互斥;旧缺序=同开）
// ---------------------------------------------------------------------------
describe('SW-RB10d ⑨ 箱/储物臂入口 SetTalkNPC(-1)（Player.cs:33344-33345）', () => {
  const tileAt: Record<string, number> = {};
  const chest = { x: 10, y: 10 };
  paintChest(tileAt, 10, 10);
  const chests = [chest];

  it('交谈中右键宝箱本体格 → 对话关闭 + 开箱照常', () => {
    const rig = makeRig({ tileAt, chests });
    (rig.g as AnyGame).dialogNpc = { talking: true };
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 10, null);
    expect(rig.g.dialogNpc).toBeNull();
    expect(rig.tryOpenCalls).toEqual([chest]);
  });

  it('交谈中右键储物族（存钱罐 tile 29）→ 对话关闭（interactAt BANK 臂同序）', () => {
    const piggy = TILE_BY_KEY['v_29_piggy_bank'];
    expect(piggy).toBeTruthy();
    const tileAt2: Record<string, number> = { '12,10': piggy };
    const rig = makeRig({ tileAt: tileAt2, chests });
    (rig.g as AnyGame).dialogNpc = { talking: true };
    (rig.g as AnyGame).interactAt(12, 10);
    expect(rig.g.dialogNpc).toBeNull();
    expect(rig.g.input.rightDown).toBe(false);
  });

  it('无异话时右键箱 → 零副作用（closeNpcDialog 守卫 this.dialogNpc）', () => {
    const rig = makeRig({ tileAt, chests });
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 10, null);
    expect(rig.g.dialogNpc).toBeNull();
    expect(rig.tryOpenCalls).toEqual([chest]);
  });
});

// ---------------------------------------------------------------------------
// ⑩ SW-RB10d：箱 tile 本体命中但注册表落空 → 点击被消费（原版 flag2=true +
//    Main.mouseRightRelease=false,num77=-1 无操作 :33316/:33497）——
//    旧 fall-through=未登记箱 tile 被当空格（持物 alt 臂/交谈臂泄流）
// ---------------------------------------------------------------------------
describe('SW-RB10d ⑩ 未登记箱 tile：点击消费不泄流（flag2 等价）', () => {
  it('单人：箱 tile + world.chests 空 → 零开箱且 rightDown=false', () => {
    const tileAt: Record<string, number> = {};
    paintChest(tileAt, 10, 10);
    const rig = makeRig({ tileAt, chests: [] });
    (rig.g as AnyGame).rightClickTileNpcDispatch(10, 10, null);
    expect(rig.tryOpenCalls).toEqual([]);
    expect(rig.g.input.rightDown).toBe(false);   // 旧=true（fall-through 泄流）
  });
});

// ---------------------------------------------------------------------------
// ⑧ 结构锁：3×3 容差全仓根除 + 箱臂精确解析 + BJ25 分派序不回退
// ---------------------------------------------------------------------------
describe('SW-BJ52 ⑧ 结构锁（源文本锚）', () => {
  it('findChestNear 已从 Game.ts 全仓根除（邻域容差禁再回潮）', () => {
    expect(SRC.includes('findChestNear')).toBe(false);
  });
  it('dispatch 箱臂用精确解析 findChest(tx, ty)（原版回溯+FindChest 等价）', () => {
    const mStart = SRC.indexOf('private rightClickTileNpcDispatch');
    const mEnd = SRC.indexOf('private interactAt(', mStart);
    const body = SRC.slice(mStart, mEnd);
    expect(body.includes('this.findChest(tx, ty)')).toBe(true);
    // BJ25 ⑥ 分派序锚保持：tryOpenChest(nearChest) 先于 interactAt 先于交谈
    const iChest = body.indexOf('this.tryOpenChest(nearChest)');
    const iInteract = body.indexOf('this.interactAt(tx, ty)');
    const iTalk = body.indexOf('this.talkToNearbyNpc(');
    expect(iChest).toBeGreaterThan(-1);
    expect(iInteract).toBeGreaterThan(iChest);
    expect(iTalk).toBeGreaterThan(iInteract);
  });
  it('interactAt 容器臂不再回落邻域容差', () => {
    expect(SRC.includes('this.findChest(tx, ty) ?? this.findChestNear')).toBe(false);
  });
  it('金锁定位走精确域（PlaceThing_LockChest :41923 光标 tile 本体门等价）', () => {
    expect(SRC.includes('this.findChest(ltx, lty)')).toBe(true);
  });
});

// SW-BD1 2026-09-06 晶塔无法传送（用户实报重大问题）回归。
// 反编译标杆：Terarria1457/Terraria.GameContent/TeleportPylonsSystem.cs（1458 同域零变更——
// TeleportPylonsSystem/TeleportPylonInfo/TeleportPylonsMapLayer/TileReachCheckSettings 四文件
// diff=same，TETeleportationPylon/NetTeleportPylonModule 不在 1458 增量面）。
//
// 断点定谳（两处，均在 Game.ts 全屏地图点击链）：
//  断点一：晶塔图标点击分支被嵌进 `mapClickTeleportEnabled`（2026-08-27 起默认 false 的
//          自造两次点击传送调试旗）——旗关闭时点图标整类被吞。原版 TeleportPylonsMapLayer
//          .cs:84-101 图标点击是常驻机制（IsMouseOver+左键释放 → RequestTeleportation），
//          不随任何调试旗禁用。
//  断点二：图标命中用 tile 域 ±2 格（图标中心 ±2 格 = zoom 2 时 ~8×8px），与渲染层
//          drawPylonMapLayer 的 30×38×scale 屏幕盒不一致 → 图标外圈整片死区。
// 附带 1:1 清偿：门禁 step5 currents 全循环（:149-177）/点击恒关图+SoundID 11（:96-100）/
// 落位 = 塔锚精确落位（:194-196，HeightOffsetBoost=0 Player.cs:3265-3277）/
// TeleportEffect case 9 尘 43×100×Entry/Exit + SoundID.Item6（Main.cs:13544-13554）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { EMPTY_SCENE, type SceneFlags } from '../src/world/SceneMetrics';
import {
  checkPylonTeleport, pylonIconHit, pylonDustHex, positionHasEnoughNpcs,
  PYLON,
  type TeleportPylonInfo, type NpcHomeLike, type PylonGateInput,
} from '../src/world/TeleportPylons';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeWorld(w = 1200, h = 400): World {
  return new World(w, h, 7, 'sw-bd1');
}

function gate(world: World, over: Partial<PylonGateInput> = {}): PylonGateInput {
  return {
    playerTileX: 100, playerTileY: 41,
    target: { x: 100, y: 40, type: PYLON.Victory },
    currents: [{ x: 100, y: 40, type: PYLON.Victory }],
    npcs: [] as NpcHomeLike[],
    downedPlantBoss: true,
    scanAt: (): SceneFlags => ({ ...EMPTY_SCENE }),
    ...over,
  };
}

describe('SW-BD1 门禁条件表（HandleTeleportRequest TeleportPylonsSystem.cs:100-205）', () => {
  it('原版五门即全部输入：敌人邻近/墓碑/事件不在门禁（输入面结构锁）', () => {
    // 原版 HandleTeleportRequest 门禁链 :105-188 只查：玩家在塔旁 / 目标塔 NPC 数 /
    // 蜥蜴神庙早入 / 目标塔群系 / 玩家侧 currents 循环——敌人在旁、墓碑、入侵事件
    // 均无门（可战斗中传走）。输入接口键集锁死：扩门必须先改本表
    const keys = Object.keys(gate(makeWorld())).sort();
    expect(keys).toEqual([
      'currents', 'downedPlantBoss', 'npcs', 'playerTileX', 'playerTileY',
      'scanAt', 'target',
    ]);
  });

  it('单塔：目标=当前塔可传（原版无"必须不同塔"规则）；缺 NPC 拒', () => {
    const w = makeWorld();
    // Victory 免 NPC 门 → 全过（HowManyNPCsDoesPylonNeed :314-323）
    expect(checkPylonTeleport(w, gate(w)).ok).toBe(true);
    // 非 Victory 塔 0 NPC → 第 2 门 NotEnoughNPCs（:113-121）
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 100, y: 40, type: PYLON.Jungle },
      currents: [{ x: 100, y: 40, type: PYLON.Jungle }],
    })).fail).toBe('Net.CannotTeleportToPylonBecauseNotEnoughNPCs');
  });

  it('双塔 currents 逐座尝试（:149-177）：首座 NPC 门败、次座过 → 放行', () => {
    const w = makeWorld();
    // 首座丛林塔无 NPC、次座 Victory 免检——★SW-BD1 前只取首座 find → 误拒
    // AtCurrentPylon；本判定在旧实现下 fail（判别力）
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 300, y: 40, type: PYLON.Victory },
      currents: [
        { x: 100, y: 40, type: PYLON.Jungle },
        { x: 300, y: 40, type: PYLON.Victory },
      ],
    })).ok).toBe(true);
  });

  it('双塔全败档位（:180-187 num 分档）：NPC 全败=AtCurrentPylon / 群系全败=BiomeRequirements', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    // num=1：范围内塔 NPC 门全败（目标 Victory 免检排除第 2 门干扰）
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 300, y: 40, type: PYLON.Victory },
      currents: [
        { x: 100, y: 40, type: PYLON.Jungle },
        { x: 300, y: 40, type: PYLON.Jungle },
      ],
    })).fail).toBe('Net.CannotTeleportToPylonBecauseNotEnoughNPCsAtCurrentPylon');
    // num=2：NPC 门过（每塔 2 入住 NPC）而群系门全败（地下纯净塔 y>worldSurface）
    const housed = (x: number): NpcHomeLike[] => [
      { homeX: x, homeY: 139, x, y: 140 }, { homeX: x + 1, homeY: 139, x: x + 1, y: 140 },
    ];
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 300, y: 40, type: PYLON.Victory },
      currents: [
        { x: 600, y: 100, type: PYLON.SurfacePurity },
        { x: 700, y: 110, type: PYLON.SurfacePurity },
      ],
      npcs: [...housed(600), ...housed(700)],
    })).fail).toBe('Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements');
  });

  it('玩家不在任何塔旁（currents 空）→ NotNearAPylon（:105-112），目标再完美也不传', () => {
    const w = makeWorld();
    expect(checkPylonTeleport(w, gate(w, { currents: [] })).fail)
      .toBe('Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon');
  });

  it('NPC 邻近边界（DoesPositionHaveEnoughNPCs :224-247）：距家 <100 严格 / 窗 84×62 含边', () => {
    // 恰 100 格 = 不计（Vector2.Distance < 100f 严格）
    const edge: NpcHomeLike = { homeX: 100, homeY: 100, x: 200, y: 100 };
    expect(positionHasEnoughNpcs(2, 100, 100, [
      { homeX: 100, homeY: 100, x: 100, y: 101 }, edge,
    ])).toBe(false);
    expect(positionHasEnoughNpcs(2, 100, 100, [
      { homeX: 100, homeY: 100, x: 100, y: 101 }, { homeX: 100, homeY: 100, x: 199.5, y: 100 },
    ])).toBe(true);
    // 169×124 窗（ZoneScanSize）：|dx|≤84 / |dy|≤62 计入，越界排除
    expect(positionHasEnoughNpcs(1, 100, 100, [{ homeX: 184, homeY: 100, x: 184, y: 101 }])).toBe(true);
    expect(positionHasEnoughNpcs(1, 100, 100, [{ homeX: 185, homeY: 100, x: 185, y: 101 }])).toBe(false);
    expect(positionHasEnoughNpcs(1, 100, 100, [{ homeX: 100, homeY: 162, x: 100, y: 163 }])).toBe(true);
    expect(positionHasEnoughNpcs(1, 100, 100, [{ homeX: 100, homeY: 163, x: 100, y: 164 }])).toBe(false);
  });

  it('环境排斥（DoesPylonAcceptTeleportation :254-312）：主要群系 tile 达标即拒纯净塔', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    const target: TeleportPylonInfo = { x: 600, y: 40, type: PYLON.SurfacePurity };
    for (const zone of ['zoneCorrupt', 'zoneCrimson', 'zoneHallow', 'zoneJungle',
      'zoneSnow', 'zoneDesert', 'zoneGlowshroom'] as const) {
      expect(checkPylonTeleport(w, gate(w, {
        target,
        npcs: [{ homeX: 600, homeY: 39, x: 600, y: 40 }, { homeX: 601, homeY: 39, x: 601, y: 40 }],
        scanAt: () => ({ ...EMPTY_SCENE, [zone]: true }),
      })).fail).toBe('Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements');
    }
    // 同型塔群系匹配 → 过（:276-278 case Jungle）
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 600, y: 40, type: PYLON.Jungle },
      currents: [{ x: 600, y: 40, type: PYLON.Jungle }],
      npcs: [{ homeX: 600, homeY: 39, x: 600, y: 40 }, { homeX: 601, homeY: 39, x: 601, y: 40 }],
      scanAt: () => ({ ...EMPTY_SCENE, zoneJungle: true }),
    })).ok).toBe(true);
  });

  it('墓地不排斥晶塔（:270 只查 7 群系阈值，graveyard 不在列——排他性负锁）', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    expect(checkPylonTeleport(w, gate(w, {
      target: { x: 600, y: 40, type: PYLON.SurfacePurity },
      npcs: [{ homeX: 600, homeY: 39, x: 600, y: 40 }, { homeX: 601, homeY: 39, x: 601, y: 40 }],
      scanAt: () => ({
        ...EMPTY_SCENE, zoneGraveyard: true, graveyardTileCount: 200,
      }),
    })).ok).toBe(true);
  });

  it('蜥蜴神庙早入门（:122-131）：未败世花+墙 87+地下 → 拒；墙非 87 不触发', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    for (let dx = 0; dx < 3; dx++) w.store.setWall(200 + dx, 100, 87);
    const t: TeleportPylonInfo = { x: 200, y: 100, type: PYLON.Victory };
    expect(checkPylonTeleport(w, gate(w, {
      target: t, currents: [t], downedPlantBoss: false,
    })).fail).toBe('Net.CannotTeleportToPylonBecauseAccessingLihzahrdTempleEarly');
    // 已败世花 → 门开
    expect(checkPylonTeleport(w, gate(w, {
      target: t, currents: [t], downedPlantBoss: true,
    })).ok).toBe(true);
    // 无墙 87（默认 0）→ 未败世花也不触发
    const w2 = makeWorld();
    w2.groundLevel = 50;
    expect(checkPylonTeleport(w2, gate(w2, {
      target: t, currents: [t], downedPlantBoss: false,
    })).ok).toBe(true);
  });

  it('正常传送合流（双塔各 2 入住 NPC + 群系匹配 + 未败世花无墙）→ 全门通过', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    const housed = (x: number): NpcHomeLike[] => [
      { homeX: x, homeY: 39, x, y: 40 }, { homeX: x + 1, homeY: 39, x: x + 1, y: 40 },
    ];
    expect(checkPylonTeleport(w, gate(w, {
      playerTileX: 600, playerTileY: 41,
      target: { x: 900, y: 40, type: PYLON.Jungle },
      currents: [{ x: 600, y: 40, type: PYLON.Jungle }],
      npcs: [...housed(600), ...housed(900)],
      downedPlantBoss: false,
      scanAt: () => ({ ...EMPTY_SCENE, zoneJungle: true }),
    })).ok).toBe(true);
  });
});

describe('SW-BD1 地图图标命中（TeleportPylonsMapLayer.cs:77-89 IsMouseOver = 绘制精灵屏幕包围盒）', () => {
  const pylons: TeleportPylonInfo[] = [{ x: 100, y: 60, type: PYLON.SurfacePurity }];
  const view = { worldW: 1200, worldH: 800, viewW: 1920, viewH: 1080, zoom: 2, panX: 0, panY: 0 };
  const cx0 = view.viewW / 2 - (view.worldW * view.zoom) / 2;
  const cy0 = view.viewH / 2 - (view.worldH * view.zoom) / 2;
  const mx = cx0 + (pylons[0].x + 1.5) * view.zoom;   // 图标中心（:56 PositionInTiles+(1.5,2)）
  const my = cy0 + (pylons[0].y + 2) * view.zoom;

  it('zoom 2：图标盒 30×38×2（scale=max(1,min(2,zoom))）——中心命中、外圈 20px 处命中', () => {
    expect(pylonIconHit(pylons, mx, my, view)).toEqual(pylons[0]);
    // ★判别力：旧实现 tile 域 ±2 格 = ±4px → (20,0) 处 miss；原版 IsMouseOver 命中
    expect(pylonIconHit(pylons, mx + 20, my, view)).toEqual(pylons[0]);
    expect(pylonIconHit(pylons, mx, my + 30, view)).toEqual(pylons[0]);
    // 盒外（半宽 30/半高 38 的下一像素）
    expect(pylonIconHit(pylons, mx + 31, my, view)).toBeNull();
    expect(pylonIconHit(pylons, mx, my + 39, view)).toBeNull();
  });

  it('zoom 0.5：scale 钳 1 → 盒 30×38 屏幕像素（屏幕尺寸不随地图 zoom 缩放）', () => {
    const v = { ...view, zoom: 0.5 };
    const x0 = view.viewW / 2 - (view.worldW * 0.5) / 2;
    const y0 = view.viewH / 2 - (view.worldH * 0.5) / 2;
    const ix = x0 + (pylons[0].x + 1.5) * 0.5, iy = y0 + (pylons[0].y + 2) * 0.5;
    expect(pylonIconHit(pylons, ix + 10, iy, v)).toEqual(pylons[0]);   // 旧 ±2 tile = ±1px → miss
    expect(pylonIconHit(pylons, ix + 16, iy, v)).toBeNull();
  });

  it('多图标重叠 → 列表后者覆盖（:87 num2=j 逐座覆写）；空表 null', () => {
    const two: TeleportPylonInfo[] = [
      { x: 100, y: 60, type: PYLON.SurfacePurity },
      { x: 101, y: 60, type: PYLON.Snow },
    ];
    expect(pylonIconHit(two, mx, my, view)).toEqual(two[1]);
    expect(pylonIconHit([], mx, my, view)).toBeNull();
  });
});

describe('SW-BD1 结构锁（点击路由 / 点击即消费 / 落位 / 特效 / 命中-绘制同源）', () => {
  const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

  it('晶塔图标分支独立于 mapClickTeleportEnabled（断点一修复锁）', () => {
    const at = gameSrc.indexOf('this.tryPylonMapTeleport(inp.mouseX, inp.mouseY)');
    expect(at).toBeGreaterThan(0);
    // 所在分支头 = 向上最近一处 `} else if (`：不得含调试旗
    const branchHead = gameSrc.lastIndexOf('} else if (', at);
    expect(branchHead).toBeGreaterThan(0);
    const headLine = gameSrc.slice(branchHead, gameSrc.indexOf('\n', branchHead));
    expect(headLine).not.toContain('mapClickTeleportEnabled');
    // 调试旗分支仍存在且在晶塔分支之后（虫洞 → 晶塔 → 调试旗选点，分支序不变）
    const flagBranch = gameSrc.indexOf('} else if (this.mapClickTeleportEnabled &&');
    expect(flagBranch).toBeGreaterThan(at);
    // 调试旗默认关 = 2026-08-27 用户决议保持（本旗只管自造两次点击传送）
    expect(gameSrc).toContain('mapClickTeleportEnabled = false;');
  });

  it('点击即消费：关全屏地图 + SoundID 11（menuClose）在门禁判定前（:96-100）', () => {
    const body = gameSrc.slice(
      gameSrc.indexOf('private tryPylonMapTeleport'),
      gameSrc.indexOf('private pylonGateCheck'),
    );
    expect(body).toContain("playWav('menuClose')");
    expect(body).toContain('fullMap.open = false;');
    expect(body.indexOf("playWav('menuClose')")).toBeLessThan(body.indexOf('pylonGateCheck('));
  });

  it('访客回执双响守卫：TeleportResult ok 支只补特效+落位，不再播 menuClose', () => {
    const at = gameSrc.indexOf('PylonSub.TeleportResult) {');
    const okBranch = gameSrc.slice(at, at + 800);
    // ★FX38b：访客双半都在回执帧——Entry@此刻旧位 + Exit 挂落位帧 .then(ok)
    expect(okBranch).toContain('pylonTeleportFxOrigin(');
    expect(okBranch).toContain('pylonTeleportFxArrival(');
    expect(okBranch).not.toContain("playWav('menuClose')");
  });

  it('落位 = 塔锚精确落位（:194-196）：晶塔快路径在通用螺旋找位之前', () => {
    const fn = gameSrc.slice(
      gameSrc.indexOf('private teleportNear'),
      gameSrc.indexOf('Main.NewText(Main.cs:64095)'),
    );
    const fast = fn.indexOf('SW-BD1 2026-09-06：晶塔目标先走原版精确落位');
    const place = fn.indexOf('p.y = ty * TILE;');
    const spiral = fn.indexOf('if (fitsFloor(tx, ty + 1))');
    expect(fast).toBeGreaterThan(0);
    expect(place).toBeGreaterThan(fast);
    expect(place).toBeLessThan(spiral);
  });

  it('命中几何与渲染层同源：双方都用 Extra_182 帧 30×38 × max(1,min(2,zoom))', () => {
    const renderer = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
    expect(renderer).toContain('const FW = 30, FH = 38;');
    expect(renderer).toContain('Math.max(1, Math.min(2, fm.zoom))');
    const mod = readFileSync(join(ROOT, 'src/world/TeleportPylons.ts'), 'utf8');
    expect(mod).toContain('Math.max(1, Math.min(2, view.zoom))');
    expect(mod).toContain('15 * scale, hh = 19 * scale');
  });

  it('特效（TeleportEffect case 9 Main.cs:13544-13557）：Entry/Exit 双份拆时序 + Item6 + 塔型配色', () => {
    const fx = gameSrc.slice(
      gameSrc.indexOf('★FX38b 时序重构'),
      gameSrc.indexOf('★FX38b 时序重构') + 3600,
    );
    // ★FX38（2026-09-15 用户实报"传送缺光效与音效"）：尘走原版尘池（spawnDust
    //   尘 43 全参 1:1）替代旧 spawnParticles 简化方块;配色直取 PYLON_DUST_RGB
    //   字节化（SpawnInWorldDust :343-399 的 Color(r,g,b,1) 塔型表）
    expect(fx).toContain('pylonTeleportDust(');
    expect(fx).toContain('spawnDust(');
    expect(fx).toContain('PYLON_DUST_RGB[style]');
    expect(fx).toContain('i < 100');
    expect(fx).toContain('p.x + p.w / 2, p.y + p.h / 2');
    // ★FX38b（用户复测"特效只有第一次有"）时序拆半：Origin@click 帧（Entry@旧位
    //   :37740）/Arrival@落位帧（Exit@新位 :37758,相机已到=尘在光照窗内存活）；
    //   Exit 声 replace=true（R26 槽语义 stop-then-play 在远位 'att' 早退前会把
    //   Entry 实例 Stop 掉=首传后整声吞的根因,槽豁免后恒双声）
    expect(fx).toContain('pylonTeleportFxOrigin(style: number)');
    expect(fx).toContain('pylonTeleportFxArrival(style: number)');
    expect(fx).toContain("undefined, true)");
    // 落位帧链路：tryPylonMapTeleport 与访客 netApplyPylon 均挂 .then(ok)
    expect(gameSrc).toContain(".then((ok) => {");
    expect(gameSrc.match(/pylonTeleportFxArrival\(target\.type\)|pylonTeleportFxArrival\(style\)/g)?.length).toBe(2);
  });
});

describe('SW-BD1 传送执行面（尘 43 配色表 SpawnInWorldDust :338-404）', () => {
  it('塔型 → 尘颜色（XNA 分量 >1 按渲染钳位 1）', () => {
    expect(pylonDustHex(PYLON.SurfacePurity)).toBe('#0dcc4d');
    expect(pylonDustHex(PYLON.Jungle)).toBe('#b3cc0d');
    expect(pylonDustHex(PYLON.Hallow)).toBe('#804db3');
    expect(pylonDustHex(PYLON.Underground)).toBe('#666699');
    expect(pylonDustHex(PYLON.Beach)).toBe('#3333f2');
    expect(pylonDustHex(PYLON.Desert)).toBe('#d9731a');
    expect(pylonDustHex(PYLON.Snow)).toBe('#ffffff');        // b=1.2 → 钳 1
    expect(pylonDustHex(PYLON.GlowingMushroom)).toBe('#66b3ff');
    expect(pylonDustHex(PYLON.Victory)).toBe('#b3b3b3');
    expect(pylonDustHex(PYLON.Underworld)).toBe('#0dcc4d');   // :390-394 与纯净同色
    expect(pylonDustHex(PYLON.Shimmer)).toBe('#0dcc4d');      // :395-399 同色
  });

  it('原版落位几何：塔锚格左上角世界像素（HeightOffsetBoost=0 未骑乘 Player.cs:3265-3277）', () => {
    // newPos = (x*16, y*16)（HandleTeleportRequest :191-195）；玩家 20×42 盒底在
    // 锚行 +42px，塔底行下方实心地板顶 = +64px → 落位后自然下沉 22px 站入 footprint
    expect(TILE).toBe(16);
    expect((4 * TILE) - 42).toBe(22);
    expect(TILE_BY_KEY['v_597_pylons']).toBeTruthy();
  });
});

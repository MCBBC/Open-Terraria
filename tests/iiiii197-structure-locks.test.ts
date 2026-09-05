// IIIII197 终局回归资产固化审计·结构锁（收官波 12 刀中闭包内/表驱动、无法单元驱动
// 的语义面）。锁法=worldgen-1457-rewire.test.ts 同款源文本锚：断言【判据表达式本体】
// 在盘且位序正确——回漂（表达式被改写/删除/位序颠倒）即爆红。行为面配套守卫见
// tests/iiiii197-closing-guards.test.ts。
// 逐锁对应批章：①=CLXIII/IIII185 ④=CLXXI/IIII194 ⑥=CLX/IIII184 ⑦=CLVI/CL 章
// ⑧=CLXVI/IIII187 ⑩=CXLV/IIII169+CXLVII/IIII190+CLXIV/IIII188 ⑪=CLXVIII/IIII191+
//   CLXV/IIII189 ⑫=CLXIX/IIII193。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const VAN = join(__dirname, '..', 'src', 'world', 'gen', 'vanilla');
const GEN = join(__dirname, '..', 'src', 'world', 'gen');
const read = (p: string): string => readFileSync(join(VAN, p), 'utf8');
const readGen = (p: string): string => readFileSync(join(GEN, p), 'utf8');
const countOf = (s: string, needle: string): number => s.split(needle).length - 1;

// =====================================================================
// ① 柱冠 crownStops（DungeonPass.dgPillar,DungeonPillar.cs:43/:54-64——
//    CrowningStopsAtPillar=true ⇒ 冠带高固定 num+1=4;false ⇒ 0=自动扫描）
// =====================================================================
describe('① dgPillar crownStops（IIIII185 定罪刀）', () => {
  const s = read('DungeonPass.ts');
  it('冠带高三元式在盘（旧 JS 恒 0=全室扫描的回归脸被锁死）', () => {
    expect(s).toContain('const crownH = crownStops ? num + 1 : 0;');
  });
  it('BiomeStructured 房柱面三连调用传 crownStops=true（第 13 位参）', () => {
    expect(s).toContain(
      'dgPillar(x + 1, bottom + num3, 10, true, false, bottom - y + 5, false, true, er.brick, sp, true, false, true);',
    );
    expect(s).toContain('CrowningStopsAtPillar');
  });
});

// =====================================================================
// ④ lihzahrd 画额闸（DungeonPass.dgPaintings,DungeonGlobalPaintings.cs:14-15/:49-52/
//    :150-163——墙 87 计数+style10 达额 i-- 重掷;JS 整缺曾致 Pa 段 −1401 骰）
// =====================================================================
describe('④ lihzahrd 画额闸（IIII194）', () => {
  const s = read('DungeonPass.ts');
  it('静态账+额档公式在盘（size0→1/size1→2/size2→2+Next(2);Paintings() 头清零）', () => {
    expect(s).toContain('const lihzMax = worldSizeIdx() === 1 ? 2 : worldSizeIdx() === 2 ? 2 + rn(2) : 1;');
    expect(s).toContain('dgLihzPlaced = 0;');
    expect(s).toContain('if (wallAt(x, y) === 87) dgLihzPlaced++;');
  });
  it('达额重掷闸在盘（styCap===10 && 已达额 ⇒ i-- continue,掷照耗）', () => {
    const gate = s.indexOf('if (styCap === 10 && dgLihzPlaced >= lihzMax) {');
    expect(gate).toBeGreaterThan(-1);
    const tail = s.slice(gate, gate + 220);
    expect(tail).toContain('i--;');
    expect(tail).toContain('continue;');
  });
});

// =====================================================================
// ⑥① errorWorld 种子小屋 IF 支（CaveHousePass PotentiallyConvertToSeedHouse,
//    HouseBuilder.cs:127-223——C# if/else 互斥:errorWorld 走【样式骰 8 连+
//    Next(20) 转换表】,NextFloat 早退门不执行）
// =====================================================================
describe('⑥① PotentiallyConvertToSeedHouse errorWorld IF 支（IIIII184）', () => {
  const s = read('CaveHousePass.ts');
  it('八连样式骰+switch Next(20) 在盘', () => {
    expect(s).toContain('if (gs.seedFlags?.errorWorld) {');
    expect(s).toContain('def.platformStyle = rng.nextInt(49);');
    expect(s).toContain('def.door = rng.nextInt(49);');
    expect(s).toContain('def.table = rng.nextInt(35);');
    expect(s).toContain('def.workbench = rng.nextInt(44);');
    expect(s).toContain('def.piano = rng.nextInt(39);');
    expect(s).toContain('def.bookcase = rng.nextInt(40);');
    expect(s).toContain('const seedCase = rng.nextInt(20);');
  });
  it('20 出路转换表逐行在盘（default=159/43 恰 case0;case3=541/318+平台 48）', () => {
    expect(s).toContain('[[159, 43], [422, 225], [194, 75], [541, 318], [137, 147],');
    expect(s).toContain('[507, 242], [546, 167],');
    expect(s).toContain('[272, 225], [421, 225]][seedCase]!');
    expect(s).toContain('if (seedCase === 3) def.platformStyle = 48;');
  });
  it('位序:errorWorld IF 支在 NextFloat else 支【之前】（C# if/else 互斥）', () => {
    const ew = s.indexOf('if (gs.seedFlags?.errorWorld) {');
    const nextFloat = s.indexOf("} else if (!(Math.fround(rng.next()) > Math.fround(0.4))) {");
    expect(ew).toBeGreaterThan(-1);
    expect(nextFloat).toBeGreaterThan(ew);
  });
});

// =====================================================================
// ⑥② PC_NO_ATTACH 误收 507 勘误（BuriedChestsPass——vanilla tileNoAttach 全量
//    静态+运行时赋值均无 507;误收曾致 errorWorld 种子屋(507/242)宝箱全 cascade 落空）
// =====================================================================
describe('⑥② PC_NO_ATTACH 507 勘误（IIIII184）', () => {
  const s = read('BuriedChestsPass.ts');
  const m = s.match(/const PC_NO_ATTACH = new Set\(\[([^\]]*)\]\)/);
  it('表可解析且不含 507（含 507=errorWorld house19 箱腿误拒回归脸）', () => {
    expect(m).not.toBeNull();
    const ids = new Set((m![1]!.match(/\d+/g) ?? []).map(Number));
    expect(ids.has(507)).toBe(false);
    expect(ids.has(441)).toBe(true);      // 解析正确性哨兵（Fake chest 在表）
    expect(ids.has(19)).toBe(true);       // 平台在表
  });
});

// =====================================================================
// ⑥④ errorWorld 沙漠屋提炼机换 642 + PlaceTile 派发 case 642（CaveHousePass,
//    HouseBuilder.cs:873-876 + WG.cs Place3x3 族——缺 case 曾致十掷全败零写）
// =====================================================================
describe('⑥④ 提炼机 642 双锚（IIIII184）', () => {
  const s = read('CaveHousePass.ts');
  it('errorWorld 沙漠屋选 642(叶绿素提炼机),非 errorWorld 选 219(提炼机)', () => {
    expect(s).toContain(
      "gs.seedFlags?.errorWorld ? 'v_642_chlorophyte_extractinator' : 'v_219_extractinator'",
    );
  });
  it('PlaceTile 派发 case 642 与 219 同组 Place3x3:(x-1,y-2) 3×3', () => {
    expect(/case 219:.*\n(?:(?!case \d+).*\n)*\s*case 642:\n\s*return placeFloorObject\(st, x - 1, y - 2, 3, 3, t,/.test(s)).toBe(true);
  });
});

// =====================================================================
// ⑦ 预清臂 placeTilePrologueClear 五组插入点接线锁（CL/CLVI 章方案书落刀——
//    各 placeTile 等价函数「共享拒门之后、case 分派之前」序言位）
// =====================================================================
describe('⑦ placeTilePrologueClear 五组插入点接线（IIIII179）', () => {
  const minSites: Array<[string, string, number]> = [
    ['TemplePass.ts', '组① Temple(祭坛 CXLVII 补丁升级替换+神庙门臂)', 2],
    ['DesertPass.ts', '组② Desert(place2x2/place3x2/place485+165 挂沙漠调用位)', 4],
    ['HellFortPass.ts', '组③ HellFort(家具族 15 helper+火把液门先行)', 16],
    [join('rollback1457', 'HellFort.1457.ts'), '组③ HellFort.1457 复线(placeTileDoorHF)', 1],
    ['LivingTreePass.ts', '组④ LivingTree(placePlatform/place3x3/place1x2/placeDoorTile+pile)', 5],
    ['CaveHousePass.ts', '组⑤ 扫尾 CaveHouse(placeFurniture 派发入口+placeDoors)', 2],
    ['IslandHousePass.ts', '组⑤ 扫尾 IslandHouse(门+placeChairD)', 2],
    ['StatuesPass.ts', '组⑤ 扫尾 Statues(placeStatueTrap case135)', 1],
    ['BeachPass.ts', '组⑤ 扫尾 Beach(statueMarble)', 1],
  ];
  for (const [file, label, min] of minSites) {
    it(`${label} ≥${min} 处`, () => {
      const s = read(file);
      expect(countOf(s, 'placeTilePrologueClear(')).toBeGreaterThanOrEqual(min);
    });
  }
});

// =====================================================================
// ⑧① wooden 旗洗牌后重算（BuriedChestsPass.placeBuriedChest,IIIII187 #60:
//    vanilla flag 块 cs:36408 位序在 errorWorld 洗牌臂 cs:36375 之后,读洗牌后 num9）
// =====================================================================
describe('⑧① wooden 旗洗牌后重算位序（IIIII187 #60）', () => {
  const s = read('BuriedChestsPass.ts');
  it('洗牌臂在前、wooden 判据行在后,判据读 style(=洗牌后 num9)非洗牌前值', () => {
    const shuffle = s.indexOf('if (gs.seedFlags.errorWorld && tile === CHEST) {');
    const wooden = s.indexOf('if (tile === CHEST && (argStyle === 0 || (argStyle === undefined && style === 0))) flags.wooden = true;');
    expect(shuffle).toBeGreaterThan(-1);
    expect(wooden).toBeGreaterThan(shuffle);
  });
  it('洗牌臂本体在盘（Next(2)==0→{1,11,12,13,15}→6/0→5;Next(3)==0→Next(52) 18..27 重掷）', () => {
    expect(s).toContain('if (rng.int(0, 1) === 0) {');
    expect(s).toContain('if (style === 1 || style === 11 || style === 12 || style === 13 || style === 15) num11 = 6;');
    expect(s).toContain('num11 = rng.int(0, 51);');
    expect(s).toContain('while (num11 >= 18 && num11 <= 27) num11 = rng.int(0, 51);');
  });
});

// =====================================================================
// ⑧② 深岛楼层支（IslandHousePass,IIIII187 #69:cs:79853-79856 `j>worldSurface →
//    val.Y=j-5` 免扫描直取——errorWorld 深岛重掷臂沉岛域恒真;漏支=找错楼层全屋位移）
// =====================================================================
describe('⑧② IslandHouse 深岛楼层支（IIIII187 #69）', () => {
  const s = read('IslandHousePass.ts');
  it('j>worldSurface 直取 j-5 的 if 支在盘,else 才走探测扫描', () => {
    const gate = s.indexOf('if (j > gs.worldSurface) {');
    expect(gate).toBeGreaterThan(-1);
    const tail = s.slice(gate, gate + 300);
    expect(tail).toContain('floorY = j - 5;');
    expect(tail).toContain('} else {');
    expect(tail).toContain('for (let y = j - 15; y < j + 30; y++)');
  });
});

// =====================================================================
// ⑩ 帧域六根+净化改判+写面保帧+N5 音乐盒折页+RAW_SHEET_DIM 退役
// =====================================================================
describe('⑩-A 帧域六根（CXLV/IIII169·B1/C1/C2/C3/C4a/C4b）', () => {
  it('B1:MarbleGranite marblePlace/granitePlace ResetToType 支帧清零×2', () => {
    const s = read('MarbleGranitePass.ts');
    expect(countOf(s, '★IIIII169·B1')).toBe(2);
    expect(countOf(s, 'st.frameX[ti] = 0; st.frameY[ti] = 0;')).toBe(2);
  });
  it('C1:TrapsPass placeSandTrap 三处裸写保帧（397/396 底行+396 侧列+53 内部）', () => {
    const s = read('TrapsPass.ts');
    expect(countOf(s, '★IIIII169·C1')).toBe(3);
  });
  it('C2:FinalCleanup 悬空落体柱 柱生长+封底两处裸写保帧', () => {
    const s = read('FinalCleanupPass.ts');
    expect(countOf(s, '★IIIII169·C2')).toBe(2);
  });
  it('C4a:DesertPass check3x2Kill187 杀位 65535×2（cs:64400-64401 u16 环回）', () => {
    const s = read('DesertPass.ts');
    expect(s).toContain('st.frameX[ki] = 65535; st.frameY[ki] = 65535;');
  });
  it('C4b:HellFort.1457 hfCheckDoorClosed 破门清算 65535×2', () => {
    const s = read(join('rollback1457', 'HellFort.1457.ts'));
    expect(s).toContain('st.frameX[t] = 65535;');
    expect(s).toContain('st.frameY[t] = 65535;');
  });
});

describe('⑩-B finalize 净化改判+N5 音乐盒折页+RAW_SHEET_DIM 退役（CLXIV/IIII188）', () => {
  const s = readGen('WorldGen.ts');
  it('越真表底帧一律保留:仅剩 非法 tile/139 超页折页/负帧 三判据', () => {
    expect(s).toContain('if (sh === 139) {');
    expect(s).toContain('const page = Math.floor(fyv / 2016);');
    expect(s).toContain('const wx = fxv + 72 * page, wy = fyv - 2016 * page;');
    expect(s).toContain('if (fxv >= 32768 || fyv >= 32768) continue;');
  });
  it('RAW_SHEET_DIM/VERTICAL_STYLE_SHEETS 分带豁免支已整体删除', () => {
    expect(s).not.toMatch(/RAW_SHEET_DIM/);
    expect(s).not.toMatch(/VERTICAL_STYLE_SHEETS/);
  });
});

describe('⑩-C 写面保帧三刀（CLXVII/IIII190:裸 type 写/失帧覆写保帧 vs setTile 清帧）', () => {
  it('OceanCaves 裸写保帧位≥4（cs:77386/77424/77428/77431 族）', () => {
    const s = read('OceanCavesPass.ts');
    expect(countOf(s, '★IIIII190')).toBeGreaterThanOrEqual(4);
  });
  it('HellFort.1457 hfTileFrameProj 平台连接码补支经 FinalCleanupPass 导出消费', () => {
    const s = read('FinalCleanupPass.ts');
    expect(s).toContain('★IIIII190 导出：HellFort.1457 hfTileFrameProj 投影补平台支消费');
    const hf = read(join('rollback1457', 'HellFort.1457.ts'));
    expect(hf).toContain('function hfTileFrameProj(st: TileStore, i: number, j: number): void {');
  });
  it('SurfaceDecor Mushrooms remix 支整缺补齐（×9 盒+地下盒心）', () => {
    const s = read('SurfaceDecorPasses.ts');
    expect(s).toContain('const spots = Math.floor(w * 0.002) * (gs.seedFlags.remix ? 9 : 1);');
    expect(s).toContain('★IIIII190：remixWorldGen 支整缺');
  });
});

// =====================================================================
// ⑪ DG_PRE_CLASS 4055/4056 前缀池 + num9→chestStyle 参数四位判据
//    （CLXVIII/IIII191+CLXV/IIII189——flag3/flag2/flag4/flag8 四支 C# 判【不可变
//    chestStyle 参数】,JS 曾读可变局部 num9 ⇒ 沙漠臂改写后 flag2/4/8 支域失活）
// =====================================================================
describe('⑪ DG_PRE_CLASS 4055/4056+style 参数四支（IIIII191/IIII189）', () => {
  it('DungeonPass 两表（前缀池+乘子占位）补 4055/4056', () => {
    const s = read('DungeonPass.ts');
    expect(s).toContain("4055: 'acc', 4056: 'acc',");
    expect(s).toContain('4055: [0, 0, 0, 0], 4056: [0, 0, 0, 0],');
  });
  it('BuriedChestsPass PRE_CLASS 同源认证 4055/4056', () => {
    const s = read('BuriedChestsPass.ts');
    expect(s).toContain("4055: 'acc', 4056: 'acc',");
  });
  it('flag3/flag2/flag4/flag8 四支判据读 chestStyle 参数(style)非 num9', () => {
    const s = read('DungeonPass.ts');
    // flag3 沙漠支（WG.cs:36409）
    expect(s).toContain('(chestTileType === IS_467 && style === 10)');
    // flag2 冰支（WG.cs:36452）——(21,11)∨(467,24)
    expect(s).toContain('(chestTileType === IS_21 && style === 11) || (chestTileType === IS_467 && style === 24)');
    // flag4 丛林支（WG.cs:36470）——(21,10∨8∨29&dual)
    expect(s).toContain('(chestTileType === IS_21 && (style === 10 || ((style === 8 || style === 29) && dualDungeonState.enabled)))');
    // flag8 地狱支（WG.cs:36497）——(21,4∨深)
    expect(s).toContain('chestTileType === IS_21 && (style === 4 || (num7 > h - 205 && num10 === 0))');
  });
});

// =====================================================================
// ⑫ MB 轨段 tileSolid 时线补播接线（MicroBiomesPass,CLXIX/IIII193——
//    save/set/restore 严格限定轨段读写域:flip 在 TrackGenerator 构造前、
//    restore 在长/标准轨两段循环后;生产域逐位 no-op）
// =====================================================================
describe('⑫ MicroBiomes 轨段时线补播接线（IIII193）', () => {
  const s = read('MicroBiomesPass.ts');
  it('snapshot→flip([229,232,162])→TrackGenerator→restore 四点共线且位序正确', () => {
    const snap = s.indexOf('const __i193Snap = snapshotGenSolid();');
    const flip = s.indexOf('flipGenSolid([229, 232, 162], true);');
    const track = s.indexOf('new TrackGenerator(');
    const restore = s.indexOf('restoreGenSolid(__i193Snap);');
    expect(snap).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(snap);
    expect(track).toBeGreaterThan(flip);
    expect(restore).toBeGreaterThan(track);
    // restore 必须在长轨与标准轨两段循环之后（trackCount 第二次掷之后）
    expect(restore).toBeGreaterThan(s.indexOf('stdTrackCount'));
  });
  it('机制源注释在盘（BeeLarva 头/尾还原 229/232/162 与缩水链 stale 债）', () => {
    expect(s).toContain('★IIIII193：轨段域 tileSolid 时线补播');
    expect(s).toContain('BeeLarva');
  });
});

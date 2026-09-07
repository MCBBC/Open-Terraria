// 方块环境粒子规则表 —— 原版 TileDrawing.DrawTiles_EmitParticles（1.4.5.6）Tier 1/2 移植。
// 每个可见 tile 按概率出 Dust；我们用通用 Particle（色点）近似，按 sheet 查表发射。
// 帧门（点燃帧/样式行）、概率、出生偏移、上浮/横漂均取自反编译行号标注处。
// Tier 3（风场树叶/萤火虫/恶搞 tile 等）不做，见 docs 备忘。
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';

export interface TileParticleRule {
  /** 原版 Tiles_N sheet id（规则键） */
  sheet: number;
  color: string;
  /** 每 tick 发射概率（原版每帧概率 ×3：我们每 3 tick 扫一次） */
  prob: number;
  /** 简单帧门：fx/fy 必须等于此值（缺省不限制） */
  fx0?: number;
  fy0?: number;
  /** 复杂帧门（吊灯中列/样式行等），与 fx0/fy0 与关系 */
  pred?: (fx: number, fy: number) => boolean;
  /** 出生偏移（tile 左上原点，px） */
  dx?: number;
  dy?: number;
  /** 出生 X 盒 [min,max)（tile 左上原点，px）——1:1 复刻 Dust.NewDust(position,w,h)
   *  的矩形盒采样；给了 dxBox/dyBox 时忽略 dx/dy 与发射器的 ±2 抖动 */
  dxBox?: readonly [number, number];
  /** 出生 Y 盒 [min,max)（同上；缺省用 dy±2） */
  dyBox?: readonly [number, number];
  /** 上浮速度（正数，内部转 vy=-rise）；负数=下沉 */
  rise?: number;
  /** 横漂速度（暗影球横向飘） */
  sideways?: number;
  /** 尺寸区间 [min,max]，缺省 [1.5,3] */
  size?: [number, number];
  life?: number;
  grav?: number;
  damp?: number;
  /** 需要光照（矿物闪光族）：lightAt max(R,G,B) > lightGate（TileDrawing.cs:7539-7543
   *  三通道全 ≤20 不闪;2026-09-07 改三通道 max——曾只查 R 漏纯蓝/绿源） */
  lightGate?: number;
  /** ★原版尘渲染(2026-09-07 闪光可见度批):矿物闪光族 Spawn=Dust.NewDust(...,43,
   *  0,0,254,newColor,0.5f)+velocity×0(TileDrawing.cs:7652-7653)——设此字段时
   *  发射器走 spawnDust 原版尘渲染(替代 1-2px 色方块近似,用户实报闪光不可见) */
  dust?: number;
  dustAlpha?: number;
  dustScale?: number;
}

// ---- Dust 色表（dust id → 近似 hex；TileDrawing 各分支引用的 dust 编号）----
export const DUST_COLOR: Record<number, string> = {
  5: '#4A4A6E',    // 阴影（恶魔祭坛/暗影球暗态）
  6: '#FF9A3C',    // ember/火焰
  14: '#8C4FD8',   // 腐化紫尘
  16: '#9AD0F0',   // 叶绿小水珠
  19: '#FFE9A0',   // 昼耀花粉
  27: '#6E5A9E',   // 死亡草暗尘
  31: '#9A9A9A',   // 烟雾
  41: '#7CB8FF',   // 蘑菇蓝光尘
  43: '#FFFFFF',   // 矿物闪光
  44: '#8CE05A',   // 丛林孢子
  57: '#8CD8F0',   // 冰灯
  58: '#FFF2C8',   // 火白
  59: '#E86A6A',   // 恶魔灯
  153: '#5A9AE8',  // 水滴
  168: '#FF8AD0',  // 世纪之花粉
  172: '#DCE8FF',  // 水蜡烛白
  242: '#F0A8E0',  // 和平蜡烛粉
  274: '#C8C8D8',  // 守护者熔炉浮尘
  825: '#C8C8C8',  // 烟囱蒸汽（gore 近似）
  1202: '#D0D0D8', // 雾团（gore 近似）
};

// 灯族样式行 → 色（吊灯 34 L7376-7426：行=fy/54；dust 6/59/57/242 按样式行取）
const CHANDELIER_ROW_COLOR = [6, 59, 6, 57, 6, 6, 6, 242, 6, 6, 6, 6];
// 路灯 93 L7243-7285：行%3==0 亮；行组 0/6/7/8/10/14/15/16→6、20→59、44→57、45→242
const LAMP_ROW_DUST: Record<number, number> = { 0: 6, 6: 6, 7: 6, 8: 6, 10: 6, 14: 6, 15: 6, 16: 6, 20: 59, 44: 57, 45: 242 };
// 烛台 100 L7286-7331：行%2==0 亮；行组同吊灯近似
const CANDELABRA_ROW_COLOR = CHANDELIER_ROW_COLOR;
// 灯笼 42 L7161-7219：样式（fy/18 的行）7→58、29→59、50→57、51→242
const LANTERN_STYLE_DUST: Record<number, number> = { 7: 58, 29: 59, 50: 57, 51: 242 };

const dust = (id: number) => DUST_COLOR[id] ?? '#FFFFFF';

/** 成熟药草（tile 83）style → 粒子参数（EmitAlchemyHerbParticles L9780-9830） */
const HERB_RULES: Record<number, { color: string; prob: number; rise?: number; size?: [number, number] }> = {
  0: { color: dust(19), prob: 1 / 100 * 3 },      // 昼耀
  1: { color: dust(41), prob: 1 / 100 * 3 },      // 月华
  3: { color: dust(27), prob: 1 / 75 * 3, size: [1, 2] },  // 死亡草（主 27，近似合并 14）
  4: { color: dust(16), prob: 1 / 150 * 3, rise: 0.7, size: [0.8, 1.4] }, // 叶绿
  5: { color: dust(6), prob: 1 / 40 * 3, rise: 2.0, size: [1.5, 2.5] },   // 火焰花
  6: { color: '#32FFFF', prob: 1 / 30 * 3, size: [1, 1.8] },              // 颤骨（43 青）
  // 2 Blinkroot：原版无粒子
};

/** 矿物闪光表（tileShine 全量 1:1，共 55 型；赋值锚 Main.cs:7273-7327/7645-7688/
 *  9791-9796/10140-10431；触发分支 TileDrawing.cs:7537-7654）。
 *  sheet（=tile id）→ shine 值 + 闪光色（TileDrawing.cs:7557-7651 的 newColor 表，
 *  未列型=缺省 Color.White）。
 *  概率折算：原版每帧 p = num43/shine（num43 = max(R,G,B)/30，TileDrawing.cs:7543-7552；
 *  掷 :7553 rand.Next(shine) >= num43 不闪；门 :7539-7543 三通道全 ≤20 不闪，发射器以
 *  max(R,G,B) ≤ lightGate 判，2026-09-07 逐字修正曾只查 R 漏纯蓝/绿源）。
 *  本发射器每 3 tick 扫一次 → prob = 24/shine（≡满光 num43=8 档折算）。
 *  登记债（发射器在 src/core，本文件侧不可达，逐字原文见 tests tileShine 段）：
 *  ①光照比例项未建模——折到满光档：微光（max<240）至多 8× 超发；max∈[21,29] 原版
 *    num43=0 不闪而仓内照发；
 *  ②dust 43 TintableDustLighted 的 AddLight 闪光体发光与"环境光过低自灭"未建模
 *    （Dust.cs:1472-1521）——尘通道已走 spawnDust 原版渲染,唯发光/自灭缺;
 *    ★发射器 spawnDust 未传 noGravity → 落 VanillaDust 通用重力 +0.1/tick 下沉,
 *    原文 43 号无重力/速度支应静止（Game.ts 侧一字修:noGravity=true）,登记;
 *  ③tile 22 恶魔矿：原版 1/400 腐化尘支与闪光支同 else-if 链互斥（每帧至多一发），
 *    仓内两规则独立掷可同帧双发。
 *  ★tileShine2（Main.cs 同区 bool 表，52 型 + TileDrawing.cs:5226-5246 动态 185/186）
 *  是另一套系统：GetFinalLight→ShouldTileShine→Main.shine 渲染期光色 ×1.6（暗处黑
 *  不变，纯渲染提亮），非粒子，本表不含（未移植，登记）。 */
export const SHINE_TABLE: Array<{ sheet: number; shine: number; color?: string }> = [
  // 基础矿（Main.cs:7645-7653；TileID 6=Iron 7=Copper 8=Gold 9=Silver）
  { sheet: 22, shine: 1150 },  // 恶魔矿 Demonite
  { sheet: 6, shine: 1150 },   // 铁矿 Iron
  { sheet: 7, shine: 1100 },   // 铜矿 Copper
  { sheet: 8, shine: 1000 },   // 金矿 Gold
  { sheet: 9, shine: 1050 },   // 银矿 Silver
  { sheet: 166, shine: 1125 }, // 锡 Tin
  { sheet: 167, shine: 1075 }, // 铅 Lead
  { sheet: 168, shine: 1025 }, // 钨 Tungsten
  { sheet: 169, shine: 975 },  // 铂 Platinum
  // 宝石族（Main.cs:7662-7667 + 色 TileDrawing.cs:7608-7631）
  { sheet: 63, shine: 900, color: '#0000FF' },    // 蓝宝石 Sapphire
  { sheet: 64, shine: 900, color: '#FF0000' },    // 红宝石 Ruby
  { sheet: 65, shine: 900, color: '#00FF00' },    // 绿宝石 Emerald
  { sheet: 66, shine: 900, color: '#FFFF00' },    // 黄玉 Topaz
  { sheet: 67, shine: 900, color: '#FF00FF' },    // 紫晶 Amethyst
  { sheet: 68, shine: 900, color: '#FFFFFF' },    // 钻石 Diamond
  // 特殊色族（色 TileDrawing.cs:7632-7651）
  { sheet: 12, shine: 300, color: '#FF0000' },    // 生命水晶 Heart（色支 :7636 同 665 生命水晶巨石；665 无 tileShine 赋值→该半支死码，巨石不闪）
  // 178 露头宝石不在此列——色随 fx/18 列交替，下方按列拆七条规则
  { sheet: 211, shine: 500, color: '#32FF64' },   // 叶绿矿 Chlorophyte（:7648 (50,255,100)）
  { sheet: 204, shine: 1150, color: '#FF0000' },  // 猩红矿 Crimtane（Main.cs:10430/色 :7644）
  { sheet: 639, shine: 300, color: '#0000FF' },   // 魔力水晶 ManaCrystal（Main.cs:9791/色 :7640）
  { sheet: 239, shine: 1100 },                    // 金属锭 MetalBars（Main.cs:9796）
  { sheet: 566, shine: 900, color: '#FFFF00' },   // 琥珀石 AmberStoneBlock（色 :7632）
  // 箱族（Main.cs:7658-7661）——帧门限箱体段（TileDrawing.cs:7553）
  { sheet: 21, shine: 1200 }, { sheet: 467, shine: 1200 },   // 箱子 Containers / 金箱变体 Containers2
  { sheet: 441, shine: 1200 }, { sheet: 468, shine: 1200 },  // 伪装箱 FakeContainers / 伪装箱2 FakeContainers2
  // 金属砖/远古砖（Main.cs:7669-7678）
  { sheet: 45, shine: 1900 }, { sheet: 680, shine: 1900 },   // 金砖 GoldBrick / 远古金砖 AncientGoldBrick
  { sheet: 46, shine: 2000 }, { sheet: 681, shine: 2000 },   // 银砖 SilverBrick / 远古银砖 AncientSilverBrick
  { sheet: 47, shine: 2100 }, { sheet: 682, shine: 2100 },   // 铜砖 CopperBrick / 远古铜砖 AncientCopperBrick
  { sheet: 122, shine: 1800 }, { sheet: 686, shine: 1800 },  // 秘银砖 MythrilBrick / 远古秘银砖 AncientMythrilBrick
  { sheet: 121, shine: 1850 }, { sheet: 685, shine: 1850 },  // 钴砖 CobaltBrick / 远古钴砖 AncientCobaltBrick
  { sheet: 125, shine: 600 },                      // 水晶球 CrystalBall（Main.cs:7679）
  // 圣地/珍珠族（Main.cs:7680-7684，超低频 8000-9000）
  { sheet: 109, shine: 9000 }, { sheet: 110, shine: 9000 },  // 圣地草 HallowedGrass / 圣地植物 HallowedPlants
  { sheet: 116, shine: 9000 }, { sheet: 117, shine: 9000 },  // 珍珠沙 Pearlsand / 珍珠石 Pearlstone
  { sheet: 118, shine: 8000 },                               // 珍珠石砖 PearlstoneBrick
  // 硬模式矿（Main.cs:7685-7687）
  { sheet: 107, shine: 950 },  // 钴 Cobalt
  { sheet: 108, shine: 900 },  // 秘银 Mythril
  { sheet: 111, shine: 850 },  // 精金 Adamantite
  // 其余（Main.cs:7273-7327/10140-10211/10316/10430）
  { sheet: 221, shine: 925 }, { sheet: 222, shine: 875 }, { sheet: 223, shine: 825 },  // 钯/山铜/钛
  { sheet: 129, shine: 300 },                    // 水晶碎晶 Crystals（Main.cs:7327）
  { sheet: 346, shine: 2000 }, { sheet: 347, shine: 1900 }, { sheet: 348, shine: 1800 }, // 叶绿砖/猩红砖/蘑菇镀层
  { sheet: 370, shine: 1900 },                   // 陨石砖 MeteoriteBrick（Main.cs:10211）
  { sheet: 407, shine: 1000 },                   // 化石矿 FossilOre（Main.cs:10316）
  // 617 大师奖杯底座（MasterTrophyBase）走独占分支（TileDrawing.cs:7560-7577 子格判定）——以整格近似
  { sheet: 617, shine: 400 },
];

function buildRules(): TileParticleRule[] {
  const r: TileParticleRule[] = [];
  const add = (x: TileParticleRule) => r.push(x);

  // ---- 火焰/光源族 ----
  // 熔炉族 L7482-7492：点燃帧 fx==18&&fy==18，dust 6，1/40
  for (const sheet of [17, 77]) {
    add({ sheet, color: dust(6), prob: 1 / 40 * 3, fx0: 18, fy0: 18, dx: 8, dy: -6, rise: 1.2, life: 34 });
  }
  // 吊灯 34 L7376-7426：fx%108<54 且非中列（fx%108 在 18..35 段为中间亮片）；
  // 简化：fx%54<36（左亮列组）与 fx%108>=54（右半）各取样。样式行色 fy/54。
  for (let row = 0; row < CHANDELIER_ROW_COLOR.length; row++) {
    const di = CHANDELIER_ROW_COLOR[row];
    add({
      sheet: 34, color: dust(di), prob: 1 / 40 * 3,
      pred: (fx, fy) => Math.floor(fy / 54) === row && fx % 54 < 36,
      dx: 14, dy: -4, rise: 1.4, life: 32,
    });
  }
  // 吊挂灯笼 42 L7161-7219：fx==0；样式行色
  for (const [styleStr, di] of Object.entries(LANTERN_STYLE_DUST)) {
    const style = Number(styleStr);
    add({
      sheet: 42, color: dust(di),
      prob: (di === 57 ? 1 / 10 : di === 58 ? 1 / 50 : 1 / 40) * 3,
      pred: (fx, fy) => fx === 0 && Math.floor(fy / 18) === style,
      dx: 8, dy: 6, rise: 1.4, life: 32,
    });
  }
  // 路灯 93 L7243-7285：fx==0 && fy%3 行亮
  for (const [rowStr, di] of Object.entries(LAMP_ROW_DUST)) {
    const row = Number(rowStr);
    add({
      sheet: 93, color: dust(di), prob: 1 / 40 * 3,
      pred: (fx, fy) => fx === 0 && Math.floor(fy / 18) % 18 === row,
      dx: 8, dy: 8, rise: 1.4, life: 32,
    });
  }
  // 烛台 100 L7286-7331：fx<36 && fy/18%2==0
  for (let row = 0; row < CANDELABRA_ROW_COLOR.length; row++) {
    const di = CANDELABRA_ROW_COLOR[row];
    add({
      sheet: 100, color: dust(di), prob: 1 / 40 * 3,
      pred: (fx, fy) => fx < 36 && Math.floor(fy / 18) % 2 === 0 && Math.floor(fy / 36) === row,
      dx: 10, dy: 4, rise: 1.4, life: 32,
    });
  }
  // 骷髅灯笼 98 L7332-7341
  add({ sheet: 98, color: dust(6), prob: 1 / 40 * 3, fx0: 0, fy0: 0, dx: 8, dy: 4, rise: 1.4, life: 32 });
  // 水蜡烛 49 L7342-7356（1/2！）
  add({ sheet: 49, color: dust(172), prob: 0.95, fx0: 0, dx: 8, dy: 4, rise: 1.6, life: 30, size: [1, 2] });
  // 和平蜡烛 372 L7357-7371（1/2）
  add({ sheet: 372, color: dust(242), prob: 0.95, fx0: 0, dx: 8, dy: 4, rise: 1.6, life: 30, size: [1, 2] });

  // ---- 腐化族 ----
  for (const [sheet, prob] of [[22, 400], [23, 500], [24, 500], [32, 500], [25, 700], [112, 700]] as const) {
    add({ sheet, color: dust(14), prob: 1 / prob * 3, rise: 0.4, life: 44 });
  }
  // 恶魔祭坛 26 L7464-7477：1/20；fx>=54 阴影尘（1/20）
  add({ sheet: 26, color: dust(5), prob: 1 / 20 * 3, pred: (fx) => fx >= 54, rise: 0.8, life: 50, size: [1.5, 2.5] });
  add({ sheet: 26, color: dust(14), prob: 1 / 20 * 3, pred: (fx) => fx < 54, rise: 0.4, life: 44 });
  // 暗影球 31 L7451-7463：1/20；fx>=36 阴影横向飘
  add({ sheet: 31, color: dust(5), prob: 1 / 20 * 3, pred: (fx) => fx >= 36, sideways: 0.5, rise: 0, life: 46, size: [1.5, 2.5] });
  add({ sheet: 31, color: dust(14), prob: 1 / 20 * 3, pred: (fx) => fx < 36, rise: 0.4, life: 44 });

  // ---- 环境族 ----
  for (const sheet of [37, 58, 76]) {
    add({ sheet, color: dust(6), prob: 1 / 250 * 3, rise: 0.5, life: 46 });
  }
  add({ sheet: 71, color: dust(41), prob: 1 / 500 * 3, rise: 0.4, life: 50, size: [1.5, 2.5] });
  add({ sheet: 72, color: dust(41), prob: 1 / 500 * 3, rise: 0.4, life: 50, size: [1.5, 2.5] });
  // 丛林植物成熟 61 L7521-7528：fx==144
  add({ sheet: 61, color: dust(44), prob: 1 / 60 * 3, fx0: 144, rise: 0.3, life: 50, size: [1.5, 3] });
  // 篝火 215 L6893-6908 + 悬挂火盆 592 L6909-6924（同构块）：外层 Next(4) 门 ×
  // 内层 Next(3) → 每列 1/12/帧，×3 扫描折算 prob=0.25（曾用 0.9 ≈ 密度 3.6 倍）。
  // ★dxBox =【命中格自身左上】相对值。精确语义（Dust.NewDust 实读 Dust.cs:167-170：
  // position = Position + (rand.Next(W−4)+4, rand.Next(H−4)+4)，W=4 ⇒ X 项恒 +4
  // 零散布！）：X = i*16+6，列修正 左列(fx==0)+rand(8) → [6,14)、中列恰 +6（点）、
  // 右列(fx==36)−rand(8) → [−1,7)。绝对羽流 = X0+[6,14)∪{22}∪[31,38]，三列均质
  // ≈ X0+22.5，仅比火焰中心(24)偏左 ~1.5px=原版固有。首版误按火堆左缘绝对坐标
  // （[20,24)/[26,38)）列偏移双倍计入右漂；二版 [2,13)/[2,6)/[-6,6) 按 NewDust 全盒
  // 近似又整体偏左 ~2.5px（用户两轮截图 + 5202 探针直方图逐步定谳）。
  // 横向：初速 vx=rand(−20,21)*0.02=±0.4 + dust31 每帧 ×0.98 阻尼（Dust.cs:1338-1339）
  // ⇒ 上升期 ±8~17px 涂抹——用 sideways:0.3（发射器 ±(0.2..0.4)）近似，细直柱观感
  // 会把左列读成"偏左"（用户第三轮反馈）。
  const STOVE_COL_BOX: ReadonlyArray<readonly [number, number]> = [
    [6, 14],    // 左列(fx==0)：6+rand(8)
    [6, 7],     // 中列(fx==18)：恰 +6（W−4 退化为点采样）
    [-1, 7],    // 右列(fx==36)：6−rand(8)
  ];
  for (const [fx, box] of [[0, STOVE_COL_BOX[0]], [18, STOVE_COL_BOX[1]], [36, STOVE_COL_BOX[2]]] as const) {
    add({ sheet: 215, color: dust(31), prob: 1 / 12 * 3, fx0: fx, fy0: 0, dxBox: box, dyBox: [0, 4], sideways: 0.3, rise: 0.9, life: 60, size: [1.5, 3], damp: 0.985 });
  }
  for (const [fx, box] of [[0, STOVE_COL_BOX[0]], [18, STOVE_COL_BOX[1]], [36, STOVE_COL_BOX[2]]] as const) {
    add({ sheet: 592, color: dust(31), prob: 1 / 12 * 3, fx0: fx, fy0: 18, dxBox: box, dyBox: [8, 12], sideways: 0.3, rise: 0.9, life: 60, size: [1.5, 3], damp: 0.985 });
  }
  // 壁炉 405 L7493-7503（点燃帧 1/20）
  add({ sheet: 405, color: dust(6), prob: 1 / 20 * 3, fx0: 18, fy0: 18, dx: 16, dy: -4, rise: 1.0, life: 40, size: [1.5, 2.5] });
  // 烟囱 406 L6925-6946（fy==54&&fx==0 时 1/3 蒸汽）
  add({ sheet: 406, color: dust(825), prob: 0.9, fx0: 0, fy0: 54, dx: 16, dy: -2, rise: 0.7, life: 80, size: [2, 3.5], damp: 0.99 });
  // 造雾机 565 L6883-6892（fx==0&&fy==18 时 1/3 雾团）
  add({ sheet: 565, color: dust(1202), prob: 0.9, fx0: 0, fy0: 18, dx: 16, dy: 8, rise: 0.25, life: 110, size: [3, 5], damp: 0.995 });
  // 守护者熔炉 463 L7097-7130（蒸汽近似）
  add({ sheet: 463, color: dust(825), prob: 0.9, fy0: 54, fx0: 0, dx: 16, dy: -2, rise: 0.6, life: 70, size: [2, 3.5], damp: 0.99 });
  add({ sheet: 463, color: dust(274), prob: 1 / 13 * 3, fy0: 18, pred: (fx) => fx === 0 || fx === 36, rise: 0.3, life: 60, size: [1, 2] });
  // 水滴/岩浆滴石 373/374 L693-699+7714（落滴；prob 由 num*2=120/240）
  add({ sheet: 373, color: dust(153), prob: 1 / 60 * 3, rise: -1.0, life: 50, grav: 0.12, size: [1.5, 2.5] });
  add({ sheet: 374, color: '#FF6A20', prob: 1 / 120 * 3, rise: -1.0, life: 50, grav: 0.12, size: [1.5, 2.5] });
  // 成熟药草 83（style = fx/18；成熟判定 fx%18==0——原版 IsAlchemyPlantHarvestable 近似）
  for (const [styleStr, hr] of Object.entries(HERB_RULES)) {
    const style = Number(styleStr);
    add({
      sheet: 83, color: hr.color, prob: hr.prob,
      pred: (fx) => Math.floor(fx / 18) === style && fx % 18 === 0,
      dx: 4, dy: -4, rise: hr.rise ?? 0.3, life: 50, size: hr.size ?? [1, 2],
    });
  }

  // ---- 矿物闪光（TileDrawing.cs:7537-7654：光门 :7539-7543，掷 :7553 rand.Next(shine)
  //      >= num43 不闪，num43 = max(R,G,B)/30）----
  for (const s of SHINE_TABLE) {
    add({
      sheet: s.sheet, color: s.color ?? dust(43),
      prob: 24 / s.shine,  // 原版 8/shine/帧（满光 num43=8）×3 tick 扫描节流
      lightGate: 20,
      // 原版尘通道 1:1：NewDust(...,43,0,0,254,newColor,0.5f)+velocity×0
      //（TileDrawing.cs:7652-7653，617/178 子支 :7573/:7604 同参）
      dust: 43, dustAlpha: 254, dustScale: 0.5,
      // 色点回退路出生盒 = NewDust 内盒 rand.Next(W−4)+4，W=16 → [4,16)²（Dust.cs:172-173）
      dxBox: [4, 16], dyBox: [4, 16],
      // dust 43 无重力/速度支（Dust.cs:1472-1521）+ 生成即 velocity 归零 → 静止微光
      rise: 0, grav: 0, life: 22, size: [1, 2],
      // 帧门（TileDrawing.cs:7553）：21/441 仅箱体亮格段；467/468 仅 144-180 段
      pred: s.sheet === 21 || s.sheet === 441
        ? (fx) => !((fx < 36 || fx >= 180) && (fx < 396 || fx > 409))
        : s.sheet === 467 || s.sheet === 468
          ? (fx) => fx >= 144 && fx < 180
          : undefined,
    });
  }
  // 露头宝石 178（ExposedGems）：色随 fx/18 列（TileDrawing.cs:7578-7603
  //  [品红,黄,蓝,绿,红,白,黄]；TileFrame :66010 列域恰 0..6，switch default 不可达）
  {
    const COL: Array<[number, string]> = [
      [0, '#FF00FF'], [1, '#FFFF00'], [2, '#0000FF'], [3, '#00FF00'],
      [4, '#FF0000'], [5, '#FFFFFF'], [6, '#FFFF00'],
    ];
    for (const [col, color] of COL) {
      add({
        sheet: 178, color,
        pred: (fx) => Math.floor(fx / 18) === col,
        prob: 24 / 500, dust: 43, dustAlpha: 254, dustScale: 0.5,
        lightGate: 20, dxBox: [4, 16], dyBox: [4, 16],
        rise: 0, grav: 0, life: 22, size: [1, 2],
      });
    }
  }

  // ---- Tier 2 机器族 ----
  // 泡泡机 244 L6860-6882（fx==18&&fy==18 时 1/2，五档大小近似两档）
  add({ sheet: 244, color: '#DCE8FF', prob: 0.95, fx0: 18, fy0: 18, dx: 16, dy: 8, rise: 0.6, life: 90, size: [1.5, 3.5], damp: 0.99 });
  // 音乐盒 139 L7077-7096（fx==36 && fy%36==0；timeForVisualEffects%7 由 tickCount%21 近似——由发射器传 tick）
  add({ sheet: 139, color: '#C8A8E8', prob: 1 / 3 * 3, fx0: 36, pred: (_fx, fy) => fy % 36 === 0, dx: 16, dy: 4, rise: 0.5, sideways: 0.3, life: 70, size: [1.5, 2.5] });
  // 钟乳石滴水 165 L7150-7160（fx 162-214 && fy==72）
  add({ sheet: 165, color: dust(153), prob: 1 / 60 * 3, pred: (fx, fy) => fx >= 162 && fx <= 214 && fy === 72, dx: 8, dy: 16, rise: 0, life: 50, size: [1.5, 2.5] });

  return r;
}

/** sheet → 规则表（构建一次） */
/** 闪光族 sheet 集（SHINE_TABLE 键集;发射器光照比例项 num43 只对这些 sheet 计算） */
export const TILE_SHINE_SHEETS: ReadonlySet<number> = new Set(SHINE_TABLE.map((s) => s.sheet));

export const TILE_PARTICLE_RULES: Map<number, TileParticleRule[]> = (() => {
  const m = new Map<number, TileParticleRule[]>();
  for (const rule of buildRules()) {
    const arr = m.get(rule.sheet);
    if (arr) arr.push(rule);
    else m.set(rule.sheet, [rule]);
  }
  return m;
})();

/** 该 tile 帧是否命中规则（帧门判定，供测试） */
export function ruleMatches(rule: TileParticleRule, fx: number, fy: number): boolean {
  if (rule.fx0 !== undefined && fx !== rule.fx0) return false;
  if (rule.fy0 !== undefined && fy !== rule.fy0) return false;
  if (rule.pred && !rule.pred(fx, fy)) return false;
  return true;
}

/** 健全性：规则里引用的 sheet 必须已注册 */
export function auditRules(): { missing: number[]; total: number } {
  const missing: number[] = [];
  for (const sheet of TILE_PARTICLE_RULES.keys()) {
    const def = TILE_DEFS.find((d) => d.vanilla?.sheet === sheet);
    if (!def && TILE_BY_KEY[`v_${sheet}`] === undefined && sheet !== 17 && sheet !== 12
      && sheet !== 63 && sheet !== 64 && sheet !== 65 && sheet !== 66 && sheet !== 67 && sheet !== 68
      && sheet !== 45 && sheet !== 46 && sheet !== 47 && sheet !== 6 && sheet !== 7 && sheet !== 8 && sheet !== 9) {
      missing.push(sheet);
    }
  }
  return { missing, total: TILE_PARTICLE_RULES.size };
}

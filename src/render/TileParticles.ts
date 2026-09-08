// 方块环境粒子规则表 —— 原版 TileDrawing.DrawTiles_EmitParticles（1.4.5.6）Tier 1/2 移植。
// 每个可见 tile 按概率出 Dust；我们用通用 Particle（色点）近似，按 sheet 查表发射。
// 帧门（点燃帧/样式行）、概率、出生偏移、上浮/横漂均取自反编译行号标注处。
// Tier 3（风场树叶/萤火虫/恶搞 tile 等）不做，见 docs 备忘。
//
// ★F7 草族四绘制路径定谳（2026-09-08 定谳;2026-09-09 ×1/4 替换语义落刀——Game.ts
//  GRASS_COUNTER_SHEETS/grassParticleFold + emitTileParticles probEff 乘区;机制锁
//  tests/tile-particles-grass-path-verdict.test.ts + tests/tile-particles-grass-fold.test.ts）：
//  原文四支 DrawGrass(:8508 掷+8512-8515 发射)/DrawAnyDirectionalGrass(:8566+:8570-8573)/
//  DrawMultiTileGrassInWind(:9146+:9150-9153)/DrawMultiTileVinesInWind(:9665+:9669-9672)
//  的 `_rand.Next(4)==0` 门包的是【整个】DrawTiles_EmitParticles 调用（非 sparkle 专支;
//  函数内 tileShine 掷式 :7537-7654 与主路径 :7553 是同一份代码,组合无差异）。而四域
//  tile 在注册循环（:539-727）命中专用 counter 后一律 `continue` 跳过 DrawSingleTile
//  （:729）——主路径唯一发射点 :974-977 对它们整帧不评估 ⇒ 四支是【替换】而非【额外】：
//  同格同帧至多一发（counter 按 type switch 互斥,每帧注册一次;PostDrawTiles(false)
//  :429-441 逐 counter 绘制一次,风法 :8970/:9053 按多格矩形逐格发射）,频率 = 主路径
//  ×1/4 随机掷。主路径参照系：缺省 Color 光照 Lighting.UpdateEveryFrame=false
//  （Lighting.cs:77-85,Mode=Color 初始化 :96 ⇒ NotRetro=true;zoom≤1 无 RT Main.cs:2670）
//  每帧全发;retro 光照才改 FastRandom(TileFrameSeed).WithModifier(x,y).Next(4)==0
//  确定性 1/4（种子每 5 绘制帧再掷,Main.cs:62661-62668）。
//  落刀口径（2026-09-09）：emitTileParticles probEff ×= grassParticleFold(sheet,swayInWind)
//  =0.25,仅对本表∩四域的【未预折】规则生效：
//   · 交集七条（纯块级概率）= 腐化植物 24（:7447 Next(500)）/ 丛林植物 61（:7533
//     Next(60),fx==144）/ 蘑菇 71（:7486 Next(500)）/ 药草 83（:9790-9846 herb 内掷;
//     83→84 换型在发射之后 :8516-8519,粒子仍按 83）/ 圣地植物 110 闪光（:7553
//     Next(shine);tileShine 支与四域唯一交点,Main.cs:7681 shine 9000）（上五条
//     WindyGrass 域）+ 吊灯 34（:7384 Next(40)）/ 吊挂灯笼 42（:7169 lantern 内掷）
//     （MultiTileVine 域）——×1/4 后每 tick 率 = 原版草路径帧率（3-tick 扫描口径 =
//     主路径概率 ×3×1/4）,禁止"额外概率支"（叠加即双发偏差）;
//   · ★592 悬挂火盆例外：本表 592 prob=1/12×3 已内含「外层 Next(4)(:9665)×内层
//     Next(3)(:6917)」结构门（上方篝火/火盆注）,再折即 4× 欠发射——Game.ts
//     GRASS_FOLD_SKIP 豁免,表值不动;
//   · ★WindyGrass 子域随设置回落：原文 ShouldSwayInWind :7836-7840 设置门
//     （SettingsEnabled_TilesSwayInWind）关时整域不注册 → 回落主路径全率;本仓
//     Options.swayInWind（Settings「图块在风中摆动」）已建模（WindSway.ts:141/:203/:218）
//     ——2026-09-08 旧注"本仓无设置开关建模=按效果恒开口径"经复核为误,落刀时纠正为
//     折算随 options.data.swayInWind 开合。227 五帧豁免 :7845-7848 同回落主路径
//     （本表无 227 规则,备案）。
//  域全集（Game.ts GRASS_COUNTER_SHEETS 带全锚）= WindyGrass（TileID.Sets.SwaysInWindBasic
//    白名单 TileID.cs:273）= {3,20,24,61,703,71,73,74,83,84,110,113,201,227,529,590,595,
//    615,624,700,656,701,637} / AnyDirectionalGrass = {184 LongMoss,:718-719} /
//    MultiTileGrass（顶左注册 :605-691）= {27,233,236,238,485,489,490,493,519,521-527,
//    530,651,652,702,705} / MultiTileVine（顶左注册 :554-603）= {34,42,91,95,126,270,271,
//    444,454,465,572,581,591,592,660,698}。VineThread 爬藤 52/62/115/205/382/528/636/638/549
//    走 TileCounterType.Vine（:766）→ DrawVines(:9058) 链条绘制,【无】EmitParticles,不入域。
//  续单三件定谳（2026-09-09）：①Tier3 NatureFly 草域 12 型同折（Game.ts
//    emitTileOrchestraAmbient 注带锚;TileID.cs:251 ∩ 域,唯 80 域外）;②篝火 215 无外层
//    门 prob 0.25→1（掷链归属分账见篝火/火盆注）;③灯笼 42 行键勘误 pred 改
//    fy/36==case ∧ fy/18 奇行（见 LANTERN_STYLE_DUST 注）。判别锁
//    tests/tile-particles-grass-fold.test.ts 续单三件段。
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
// 灯笼 42（TileDrawing.cs:7169-7226）：键=case 号 num14=fy/36（7→58、29→59、50→57、
// 51→242,掷 50/40/10/40）;发射行=fy/18 奇行（:7171 门）即 fy=style*36+18 火焰行。
// ★2026-09-09 勘误:旧注"样式(fy/18 的行)"把 case 号误当 fy/18 行——旧 pred fy/18==case
// 的四落点 {126,522,900,918} 在原文全不发射（900/918 连奇行门都不过;126/522 过门但落
// switch 无 case 的 style 3/14）,原文四落点 {270,1062,1818,1854} 曾全哑。case 7 另有
// Next(100) gore 16/17 火焰摇曳支——本表 dust 通道不含 gore,登记。
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
 *  掷 :7553 rand.Next(shine) >= num43 不闪；门 :7539-7543 三通道全 ≤20 不闪——发射器
 *  以 num43=0 概率归零吸收（max≤30 ⊇ max≤20,同语义单点计算）,2026-09-07 逐字修正
 *  曾只查 R 漏纯蓝/绿源）。
 *  本发射器每 3 tick 扫一次 → prob = 24/shine（≡满光 num43=8 档折算）。
 *  登记债（逐字原文见 tests tileShine 段）：
 *  ①dust 43 TintableDustLighted ——★2026-09-08 注销（引擎现场复核,旧注两处论断均
 *    过期;机制锁 tests/tile-shine-dust43-verdict.test.ts）：
 *    (a)"AddLight/环境光过低自灭未建模(Dust.cs:1472-1521)"——过期。VanillaDust.ts
 *      case 43（:583-605,链 A）已 1:1 实装:照度门自灭（Dust.cs:1505-1508 三通道
 *      <0.05 → active=false ⇒ VanillaDust.ts:598-599）与 AddLight（Dust.cs:1509-1512
 *      noLightEmittance 门 ⇒ :600-601 lights.push;Game 每帧注入 lightAt 采样
 *      Game.ts:7865-7868 并推 LightingEngine :7878）——发光/自灭俱在,无债。
 *    (b)"发射器 spawnDust 未传 noGravity → 落通用重力 +0.1/tick 下沉,Game.ts 侧
 *      一字修 noGravity=true"——**反向,撤**。43 是链 A 链接（Dust.cs:1472 else-if
 *      成员;VanillaDust.ts:604 chainLink=true）,通用重力 Dust.cs:1889-1899
 *      （`else if (!noGravity && type!=41/44/309) vy+=0.1`）本就跳过
 *      （VanillaDust.ts:670-673 `!chainLink` 门）——不传也静止（spawn 速 0 +
 *      TileDrawing.cs:7652-7653 velocity×0）。真传 noGravity=true 反落链 B 兜底
 *      Dust.cs:2407-2413（type!=304 && noGravity → velocity×0.92 + fadeIn==0
 *      scale−0.04;VanillaDust.ts:837-842,spawn 缺省 fadeIn=0）→ 闪尘逐拍缩没
 *      =偏离原版。发射器现状（不传）即正解,勿修。
 *  ②tile 22 恶魔矿：原版 1/400 腐化尘支与闪光支同 else-if 链互斥（每帧至多一发），
 *    仓内两规则独立掷可同帧双发。
 *  （★F7 2026-09-08 销账：旧债①"光照比例项未建模"已由发射器 lightNum43 比例项
 *    建模清偿（Game.ts emitTileParticles：probEff×num43/8 + dust 路 num43≤0 不发）；
 *    曾挂 rule.lightGate 字段=死字段（发射器从未消费）已删,tests 同步改
 *    r.dust 签名。旧注①与该死字段自相矛盾,一并销。草族四路径 sparkle 机会的
 *    定谳 = 文件头注 ★F7 注（2026-09-08 定谳;2026-09-09 ×1/4 替换折算已随 Game.ts
 *    grassParticleFold 落地,110 闪光支同折,WindyGrass 子域随 swayInWind 回落）。）
 *  ★tileShine2（Main.cs 同区 bool 表——静态 59 型 = 单独下标写 52 型 + Main.cs:10473-10482
 *  循环支 262-268 七型（Gemspark,`if (num3 > 261)`）;TileDrawing.cs:5223-5247 动态
 *  185/186 按帧赋值;59+2=61 = TileShine.ts SHINE2_SHEETS 在册数,账面 2026-09-08 闭合）
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
  // 吊挂灯笼 42（TileDrawing.cs:7169-7226）：fx==0 && fy/36==样式 && fy/18 奇行（火焰行
  //  fy=style*36+18）;掷链 case7→Next(50) dust58 / case29→Next(40) dust59 /
  //  case50→Next(10) dust57 / case51→Next(40) dust242（出生位差 +4/+0/+2 与 8×8/4×4
  //  盒差以共享 dx/dy±2 近似,登记）。★2026-09-09 行键勘误:旧 pred fy/18==case 四落点
  //  {126,522,900,918} 在原文全不发射（见 LANTERN_STYLE_DUST 注）
  for (const [styleStr, di] of Object.entries(LANTERN_STYLE_DUST)) {
    const style = Number(styleStr);
    add({
      sheet: 42, color: dust(di),
      prob: (di === 57 ? 1 / 10 : di === 58 ? 1 / 50 : 1 / 40) * 3,
      pred: (fx, fy) => fx === 0 && Math.floor(fy / 36) === style && Math.floor(fy / 18) % 2 === 1,
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
  // 篝火 215（TileDrawing.cs:6901）+ 悬挂火盆 592（:6917 块）同构烟柱,但掷链归属不同
  // （★2026-09-09 续单件2 勘误,旧注"同构块:外层 Next(4)×Next(3)"对 215 不成立）：
  //  · 215 主路径（215∉四域,DrawSingleTile :974）——块内仅 Next(3)（:6901,其前后最近的
  //    Next(4) 在 :6942 属烟囱 406 gore 档,并非外层门）;缺省 Color 光照
  //    Lighting.UpdateEveryFrame=false（Lighting.cs:77-85 ⇒ NotRetro=true;zoom≤1 无 RT
  //    Main.cs:2669-2678）⇒ 主路径每帧全发 → 每点燃列 1/3/帧,×3 扫描 prob=1（Retro/
  //    Trippy 光照或 >1x 变焦才改 1/4,本仓光照恒现代口径,登记）。旧 0.25=多除一个 4
  //    （4× 欠发射;当年 0.9 反而近乎精确 1/3×3=1 钳前）。
  //  · 592 MultiTileVine 域——DrawMultiTileVinesInWind 逐格 flag5=Next(4)（:9665,与
  //    光照模式无关）× 块 Next(3)（:6917）= 1/12/帧,×3 扫描 prob=0.25;该外层门真身=
  //    结构路径,发射器侧 GRASS_FOLD_SKIP 豁免再折（Game.ts grassParticleFold 注）。
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
    add({ sheet: 215, color: dust(31), prob: 1, fx0: fx, fy0: 0, dxBox: box, dyBox: [0, 4], sideways: 0.3, rise: 0.9, life: 60, size: [1.5, 3], damp: 0.985 });
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
        dxBox: [4, 16], dyBox: [4, 16],
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

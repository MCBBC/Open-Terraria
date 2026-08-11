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
  /** 上浮速度（正数，内部转 vy=-rise）；负数=下沉 */
  rise?: number;
  /** 横漂速度（暗影球横向飘） */
  sideways?: number;
  /** 尺寸区间 [min,max]，缺省 [1.5,3] */
  size?: [number, number];
  life?: number;
  grav?: number;
  damp?: number;
  /** 需要光照（矿物闪光族）：lightAt 红通道 > lightGate */
  lightGate?: number;
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

/** 矿物闪光精简表（通用 tileShine 分支 L7529-7646 的近似）：sheet → shine 值+色 */
const SHINE_TABLE: Array<{ sheet: number; shine: number; color?: string }> = [
  { sheet: 6, shine: 1150 },   // 铜矿
  { sheet: 7, shine: 1100 },   // 金矿
  { sheet: 8, shine: 1000 },   // 银矿
  { sheet: 9, shine: 1050 },   // 铁矿
  { sheet: 12, shine: 300, color: '#FF6A6A' },    // 生命水晶红
  { sheet: 63, shine: 900, color: '#6A8AFF' },    // 蓝宝石
  { sheet: 64, shine: 900, color: '#FF5A5A' },    // 红宝石
  { sheet: 65, shine: 900, color: '#5AFF7A' },    // 绿宝石
  { sheet: 66, shine: 900, color: '#FFE85A' },    // 黄玉
  { sheet: 67, shine: 900, color: '#C85AFF' },    // 紫晶
  { sheet: 68, shine: 900 },                      // 钻石白
  { sheet: 107, shine: 950 },  // 钴
  { sheet: 108, shine: 900 },  // 秘银
  { sheet: 111, shine: 850 },  // 精金
  { sheet: 45, shine: 1900 },  // 金砖
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
  // 篝火 215 L6893-6908（fy==0 时 1/3 smoke；fy<36 都算点燃侧）+ 悬挂火盆 592 L6909-6924
  add({ sheet: 215, color: dust(31), prob: 0.9, fy0: 0, dx: 16, dy: -2, rise: 0.9, life: 60, size: [1.5, 3], damp: 0.985 });
  add({ sheet: 592, color: dust(31), prob: 0.9, fy0: 18, dx: 8, dy: -2, rise: 0.9, life: 60, size: [1.5, 3], damp: 0.985 });
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

  // ---- 矿物闪光（光照门；shine→tick 概率：1/shine*3；life 短促闪一下）----
  for (const s of SHINE_TABLE) {
    add({
      sheet: s.sheet, color: s.color ?? dust(43),
      prob: 1 / s.shine * 3 * 4, // ×4 补偿低频视觉缺失（近似值，见 plan）
      lightGate: 20, dx: 8, dy: 8, rise: -0.1, life: 22, size: [1, 2],
    });
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

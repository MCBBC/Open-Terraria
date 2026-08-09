// 播种扫描器(Terrarria1456 Terraria.Graphics.Light/TileLightScanner.cs 一比一主干)。
// GetTileMask(:68-87):遮挡分类;GetTileLight(:89-108):逐格 max-raise 播种
// (天空 ApplySurfaceLight:3152 → 地狱 ApplyHellLight:3261 → 墙 :167 → tile :344 → 液体 :110)。
// 洞穴(worldSurface..UnderworldLayer)零环境光。
import { TILE_DEFS } from '../data/tiles';
import { lightIsOn } from '../world/wiring/devices';
import { TileStore } from '../world/TileStore';
import { FastRandom } from './FastRandom';
import { CRACKED_SHEETS, FLICKER_SHEETS, TORCH_COLORS, WALL_EMISSIVE, WALL_LIGHT } from './lightTables';
import { FlickerClock, skySeed } from './SkyColor';
import { LightMap, Mask } from './LightMap';

/** 扫描器依赖的最小世界结构(引擎注入;World 满足该接口) */
export interface ScannerWorld {
  store: TileStore;
  groundLevel: number;  // 原版 worldSurface
  lavaLine: number;     // 原版 UnderworldLayer
  clock: { timeOfDay: number; dayCount: number };
}

/** 动态点光(原版 Lighting.AddLight;0-1 RGB) */
export interface PerFrameLight { x: number; y: number; r: number; g: number; b: number }

export class TileLightScanner {
  private blocksLight: Uint8Array;
  private random = new FastRandom(0x9e3779b9);
  /** 每格局部随机(WithModifier(x,y);蜡烛闪烁) */
  private localRandom(x: number, y: number): FastRandom {
    return this.random.withModifier((y * 2654435761 + x) | 0);
  }

  constructor(private flicker: FlickerClock) {
    // 从 TILE_DEFS 派生 tileBlockLight 近似(原版 Main.tileBlockLight[]):
    // 实心且近乎不透明才挡光——门(0.05)/平台(0.15)/树(0.1)/装饰(0.05)均不挡
    this.blocksLight = new Uint8Array(TILE_DEFS.length);
    TILE_DEFS.forEach((d, i) => {
      if (d && d.solid && !d.platform && d.opacity >= 0.9) this.blocksLight[i] = 1;
    });
  }

  /** GetTileMask(:68-87) */
  getMask(st: TileStore, i: number): Mask {
    const type = st.type[i];
    const actuated = (st.wire[i] & TileStore.WIRE_ACTUATED) !== 0;
    if (type !== 0 && !actuated && this.blocksLight[type] && st.slope[i] === 0) {
      // 注意 actuated 已在上条件排除(原版 !tile.inActive())
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      return CRACKED_SHEETS.has(sheet) ? Mask.CrackedBricks : Mask.Solid;
    }
    if (st.liquidType[i] !== 2 && st.liquid[i] > 128) { // 岩浆 mask=None 只发光
      return st.liquidType[i] === 3 ? Mask.Honey : Mask.Water;
    }
    return Mask.None;
  }

  /** 该格是否暴露于"天空/地狱光"(ApplySurfaceLight 的可见性判定:不挡太阳 + 墙透光) */
  private exposed(st: TileStore, i: number): boolean {
    const type = st.type[i];
    if (type !== 0) {
      const actuated = (st.wire[i] & TileStore.WIRE_ACTUATED) !== 0;
      // 挡太阳条件 = 会挡光的实心格 + 非坡面 + 非半砖 + 未致动 + 液体 < 200
      // (原版 sloped/halfBrick/inActive 例外 + liquid<200 规则,:3161-3189)
      if (!actuated && this.blocksLight[type] && st.slope[i] === 0 && st.half[i] === 0
        && st.liquid[i] >= 200) return false;
    }
    const wall = st.wall[i];
    return wall === 0 || WALL_LIGHT.has(wall);
  }

  /** ExportTo(:17-43)+ GetTileLight(:89-108):向工作图播种 mask 与颜色 */
  exportTo(w: ScannerWorld, map: LightMap, rx: number, ry: number, perFrame: PerFrameLight[]): void {
    const st = w.store;
    map.clear();
    const [skyR, skyG, skyB] = skySeed(w.clock.timeOfDay, w.clock.dayCount);
    // 地狱脉动(ApplyHellLight:3266-3271)
    const hellV = 0.55 + Math.sin(performance.now() * 0.002) * 0.08; // GlobalTimeWrappedHourly 近似
    const hellR = hellV, hellG = hellV * 0.6, hellB = hellV * 0.2;
    // 岩浆闪烁基础(ApplyLiquidLight:118-131)
    const lavaV = 0.55 + (270 - this.flicker.mouseTextColor) / 900;
    const osc = this.flicker.mouseTextColor;

    for (let ly = 0; ly < map.h; ly++) {
      const ty = ry + ly;
      for (let lx = 0; lx < map.w; lx++) {
        const tx = rx + lx;
        if (tx < 1 || ty < 1 || tx >= st.w - 1 || ty >= st.h - 1) continue; // InWorld(x,y,1)
        const i = st.idx(tx, ty);
        const li = ly * map.w + lx;
        map.mask[li] = this.getMask(st, i);

        let lr = 0, lg = 0, lb = 0;
        // ① 天空 / 地狱(:94-101)
        if (ty <= w.groundLevel) {
          if (this.exposed(st, i)) { lr = skyR; lg = skyG; lb = skyB; }
        } else if (ty > w.lavaLine) {
          if (this.exposed(st, i)) { lr = Math.max(lr, hellR); lg = Math.max(lg, hellG); lb = Math.max(lb, hellB); }
        }
        // ② 发光墙(:102;大多要求 !LightIsBlocked——此处墙在实心块后不可见,实心格直接跳过)
        const wall = st.wall[i];
        if (wall !== 0 && st.type[i] === 0) {
          const we = WALL_EMISSIVE[wall];
          if (we) { lr = Math.max(lr, we[0]); lg = Math.max(lg, we[1]); lb = Math.max(lb, we[2]); }
        }
        // ③ 发光 tile(:103-106)
        const type = st.type[i];
        if (type !== 0 && (st.wire[i] & TileStore.WIRE_ACTUATED) === 0) {
          const d = TILE_DEFS[type];
          if (d && d.light) {
            const sheet = d.vanilla?.sheet ?? -1;
            // 接线灯门控:关帧不发光(LIGHT_TOGGLE)
            const on = sheet < 0 || lightIsOn(sheet, st.frameX[i], st.frameY[i]);
            if (on) {
              let er: number, eg: number, eb: number;
              if (sheet === 4) {
                // 火把:24 色动态(TorchID;frameY/22 = style)
                const style = Math.floor(st.frameY[i] / 22) % 24;
                if (style === 7) [er, eg, eb] = this.flicker.demonTorchColor();
                else if (style === 14) [er, eg, eb] = this.flicker.discoColor();
                else if (style === 23) [er, eg, eb] = this.flicker.shimmerTorchColor();
                else {
                  const c = TORCH_COLORS[style] ?? TORCH_COLORS[0];
                  [er, eg, eb] = c;
                }
                // 蜡烛/篝火族闪烁(:1034-1036:localRand.Next(28,42)*0.005+(270-mouseTextColor)/700)
                const f = this.localRandom(tx, ty).next(28, 42) * 0.005 + (270 - osc) / 700;
                er += f; eg += f; eb += f;
              } else {
                er = d.light[0] / 255; eg = d.light[1] / 255; eb = d.light[2] / 255;
                if (FLICKER_SHEETS.has(sheet)) {
                  const f = this.localRandom(tx, ty).next(28, 42) * 0.005 + (270 - osc) / 700;
                  er += f; eg += f; eb += f;
                }
              }
              lr = Math.max(lr, er); lg = Math.max(lg, eg); lb = Math.max(lb, eb);
            }
          }
        }
        // ④ 液体光(:107;岩浆发光,水/蜂蜜不发光)
        if (st.liquid[i] > 0 && st.liquidType[i] === 2) {
          lr = Math.max(lr, lavaV); lg = Math.max(lg, lavaV * 0.6); lb = Math.max(lb, lavaV * 0.2);
        }
        map.r[li] = lr; map.g[li] = lg; map.b[li] = lb;
      }
    }
    // ⑤ 动态点光(ApplyPerFrameLights:204-227;区域内 max 合并)
    for (const l of perFrame) {
      const lx = l.x - rx, ly = l.y - ry;
      if (lx < 0 || ly < 0 || lx >= map.w || ly >= map.h) continue;
      const li = ly * map.w + lx;
      if (l.r > map.r[li]) map.r[li] = l.r;
      if (l.g > map.g[li]) map.g[li] = l.g;
      if (l.b > map.b[li]) map.b[li] = l.b;
    }
  }
}

// 原版 "Hellforges" pass 1:1(cs:18298-18347)。
// 数量 = w/200;落点墙须地狱自然墙(13/14),向下扫到实心后上一格 PlaceTile 77;
// 预算只计"有效墙位上放置失败"的尝试(上限 10000 次)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';
import type { GenState } from './GenState';

const HELLFORGE = TILE_BY_KEY['v_77_hellforge']!;

/** ★NNN 批（2026-08-25）勘误：Hellforge 底锚谓词=**SolidTile2**（cs:71024）而非
 *  AnchorValid 三连并集——1457 PlaceTile case 17/77/133 → Place3x2（cs:52526）default
 *  支逐列 `SolidTile2(i, y+1)`。cs:8049-8050 `tileSolid[19]=true`（1.4.5 平台转实心）
 *  ⇒ SolidTile2=active && tileSolid && ((plat&&(half‖topSlope)) ‖ slope==0) && !half
 *  && !inActive——平台**无帧检查**（PlatformProperTopFrame 不参与！）、239/380 等
 *  tileSolid 族全过。
 *  曾用 cs:51851 AnchorValid 三连并集（含平台帧门）→ 平台桥中段帧（frameX 档外）
 *  被误拒：ntb #72 首差链实证——(2035,1109) 锚行 {19,76,76} vanilla 收 JS 拒 →
 *  该座成功后掷流错位 → JS 多出一座 (2090,1092) T0>77×6。 */
const HF_PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]); // TileID.Sets.Platforms
function anchorValid(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || ((st.wire[i] >>> 5) & 1) === 1) return false;   // active && !inActive
  const t = st.type[i];
  const d = TILE_DEFS[t];
  if (!d) return false;
  const sheet = d.vanilla?.sheet ?? -1;
  const plat = HF_PLATFORM_SHEETS.has(sheet);
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  return !!vanGenSolidType(t) && ((plat && topSlope) || st.slope[i] === 0) && st.half[i] === 0;
}
export function runHellforgesPass(st: TileStore, rng: RNG, gs?: GenState): void {
  // ★IIIII44（cs:18318）：Hellforges 整门 `if (!Skyblock.denyAllGeneration)`——
  //   天空盒世界零进（x86 实证 slot72 零掷）。
  if (gs?.seedFlags.skyblock) return;
  const { w, h } = st;
  const count = Math.floor(w / 200);
  for (let n = 0; n < count; n++) {
    let done = false;
    let fail = 0;
    while (!done) {
      // cs:18314-18315：Next(1, maxTilesX) / Next(h-250, h-30) = [1,w-1] / [h-250,h-31]
      //   （rng.int 闭区间；x 上界旧代码 w-2 少一列，2026-08-13 校源修正）
      const x = rng.int(1, w - 1);
      let y = rng.int(h - 250, h - 31);
      // F1(cs:18312-18319)：墙非 13/14 时整个 if 块跳过——num3 不增，仅重掷 x/y 继续。
      //   旧代码此处 fail++ 烧预算，墙覆盖率低时地狱熔炉数量被预算虚吃提前见底。
      if (st.inBounds(x, y) && (st.wall[st.idx(x, y)] === 13 || st.wall[st.idx(x, y)] === 14)) {
        while (y < h - 20 && !st.flags[st.idx(x, y)]) y++;
        y--;
        // ★PlaceTile(77)（cs:18324）几何 = Style3x2 **中心底锚**：物体占 (x-1..x+1,
        //   j-1..j)（golden 实证：drawn x=1982 → 77 落 1981-1983 两行）。曾按
        //   左对齐 x..x+2 放置 → 全部熔炉右移一列（#72 干净基座 86+86 格自因，
        //   WWW 批 2026-08-18 修）。净空门 + 3 列底锚 AnchorValid（半砖/坡面地板
        //   会被原版拒收——SmoothWorld 后地狱满坡面，曾漏检 8 座熔炉错位）。
        // ★R11-H1（2026-08-24）：Place3x2 头边距门（cs:52528-52530）`x < 5 ||
        //   x > maxTilesX - 5 || y < 5 || y > maxTilesY - 5 → return`（不放置→
        //   num3++ 重掷,烧 2 掷）——合法域 x∈[5,w-5]。曾缺 → 我方接受 x∈[1,w-2],
        //   宽出 7 列;命中宽出带时我方放置成功（少烧 2 掷）原版重掷 → ~13%/世界
        //   掷流分歧。（y 域 [h-252,h-33] 实际不可达,门照补全形。）
        if (x < 5 || x > w - 5 || y < 5 || y > h - 5) { fail++; }
        else if (y < 2 || !st.inBounds(x + 1, y - 1) || !st.inBounds(x - 1, y)) { fail++; }
        else {
          let ok = true;
          for (let dx = -1; dx <= 1 && ok; dx++) {
            for (let dy = -1; dy <= 0 && ok; dy++) {
              if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
            }
            if (ok && !anchorValid(st, x + dx, y + 1)) ok = false;
          }
          if (ok) {
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = 0; dy < 2; dy++) {
                st.setTileSilent(x + dx, y - 1 + dy, HELLFORGE, (dx + 1) * 18, dy * 18);
              }
            }
          }
          // ★NNN：成功判据=PlaceTile 后头格 type==77（cs:18326-18327）——**含重叠幂等**：
          //   落点恰为本 pass 早前熔炉格时，Place3x2 净空门拒写但头格已是 77 → vanilla
          //   仍算成功（ntb 实证：#20 座 (2090,1092) 前的 (2035,1109) 重叠重放置，
          //   JS 曾要求全新净空 → 多滚出一座多余熔炉 T0>77×6）。失败才 num3++。
          done = st.type[st.idx(x, y)] === HELLFORGE;
          if (!done) fail++;
        }
        if (fail >= 10000) done = true;
      }
    }
  }
}

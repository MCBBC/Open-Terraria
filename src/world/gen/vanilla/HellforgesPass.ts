// 原版 "Hellforges" pass 1:1(cs:18298-18347)。
// 数量 = w/200;落点墙须地狱自然墙(13/14),向下扫到实心后上一格 PlaceTile 77;
// 预算只计"有效墙位上放置失败"的尝试(上限 10000 次)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const HELLFORGE = TILE_BY_KEY['v_77_hellforge']!;

/** AnchorValid（WorldGen.cs:51851+）Hellforge 锚类型 = SolidTile|SolidWithTop|SolidSide
 *  （TileObjectData.Style3x2 基类 AnchorBottom，cs:3165——3 列底锚全列须过）。
 *  blockType: 0 整砖 / 1 半砖 / 2-5 坡面（half?1:slope，slope 通道即原版 slope()）。
 *  tileNoAttach 生成态恒 false（该集=藤蔓/蛛网类装饰，地狱地板不涉及）。 */
function anchorValid(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || ((st.wire[i] >>> 5) & 1) === 1) return false;   // nactive()
  const t = st.type[i];
  const d = TILE_DEFS[t];
  if (!d) return false;
  const sheet = d.vanilla?.sheet ?? -1;
  const PLATFORMS = sheet === 19 || sheet === 427 || (sheet >= 435 && sheet <= 439); // TileID.Sets.Platforms（TileID.cs:243）
  const solid = !!d.solid;
  const solidTop = PLATFORMS || sheet === 239 || sheet === 380;   // tileSolidTop 家族
  const bt = st.half[i] ? 1 : st.slope[i];
  // SolidTile（cs:51857）：tileSolid && !solidTop && blockType==0
  if (solid && !solidTop && bt === 0) return true;
  // SolidWithTop（cs:51870）：平台帧合法 或 tileSolid&&tileSolidTop
  if (PLATFORMS) {
    // ★R11-H2（2026-08-24）：平台帧除数 36→18——PlatformFrameWidth()=
    //   TileObjectData._data[19].CoordinateFullWidth=**18**（TileObjectData.cs:5122-25;
    //   FinalCleanupPass.ts:375 同表 /18 并注释钉死）。/36 为仓内自不一致
    //   （frameX∈{144,180,288,432} 四档判定两版相反）。地狱域无平台,零现症,口径债。
    const num = Math.trunc(st.frameX[i] / 18);
    if ((!st.half[i] && num >= 0 && num <= 7) || (num >= 12 && num <= 16) || (num >= 25 && num <= 26)) return true;
  } else if (solid && solidTop) return true;
  // SolidSide（cs:51889）：tileSolid && !solidTop && blockType∈{4,5}
  if (solid && !solidTop && (bt === 4 || bt === 5)) return true;
  return false;
}

export function runHellforgesPass(st: TileStore, rng: RNG): void {
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
            done = true;
          } else fail++;
        }
        if (fail >= 10000) done = true;
      }
    }
  }
}

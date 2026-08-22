// 原版 pass "WavyCaves"（WorldGen.cs:12301-12340，PPPPP CONST 批 2026-08-22 新增）：
// 饥荒世界（dontStarveWorldGen）专属洞穴雕刻——35×(w/4200)² 条水平正弦波隧道，
// 自左向右/右向左（按 startX 是否过半图）推进，Y = startY + sin 波 + 纵向漂移。
// 普通世界门内零掷骰跳过（原版同构：整段包在 if 内）。注册序
// SurfaceCaves(12240) < 本 pass(12301) < IceBiome(12343)；remix 组合 num2/=3
// （cs:12311，纯 Constant 不触发，照抄防组合债）。
// WavyCaverer 定义 cs:76992-77060：雕刻支 = KillTile（type=-1 → 全击杀模型，
// 复用 HalfBrickPass.killTile——尘掷流位 + 尾 SquareTileFrame 级联与原版一致）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { killTile } from './HalfBrickPass';

/** WavyCaverer（cs:76992）1:1。type<0 = 雕刻（KillTile）；type>=0 = PlaceTile
 *  （本 pass 恒 -1，参数保留全签名防未来组合支误用）。 */
export function wavyCaverer(
  st: TileStore, rng: RNG,
  startX: number, startY: number,
  waveStrengthScalar: number, wavePercentScalar: number,
  steps: number, type: number,
): void {
  const w = st.w, h = st.h;
  let vx = startX, vy = startY;            // val（X 恒整数步进；Y 每步重算）
  const right = startX > w / 2;            // flag：右半场 → 向左推进（cs:77000）
  const minWidth = 2 + rng.nextInt(2);     // num（cs:77001）
  const maxWidth = 15 + rng.nextInt(11);   // num2（cs:77002）
  const ramp = 1 + rng.nextInt(2);         // num3（cs:77003）
  const rampLen = Math.ceil(maxWidth / ramp); // num4（cs:77004）
  let amp = 1.0;                           // num5（cs:77005）
  let freq = 1.0;                          // num6（cs:77006）
  const drift = Math.trunc(-1 + rng.next() * 3); // num7（cs:77008，(int) 截断）
  let width = minWidth;                    // num8（cs:77009）
  let phase = 0;                           // num9（cs:77010）
  for (let i = 0; i < steps; i++) {
    const inRampHead = i < rampLen;        // flag2（cs:77013）
    const inRampTail = i >= steps - rampLen; // flag3（cs:77014）
    vx += right ? -1 : 1;                  // val.X += ±1（cs:77015）
    if (!inRampHead && !inRampTail) {
      phase++;
      amp = Math.min(2.0, Math.max(0.5, amp + (-0.5 + rng.next()) * 0.25));   // cs:77018
      freq = Math.min(1.1, Math.max(0.9, freq + (-0.5 + rng.next()) * 0.02)); // cs:77019
    }
    const wave = Math.sin(phase * 0.1 * freq * wavePercentScalar) * amp * waveStrengthScalar; // num10
    vy = startY + wave + phase * drift;    // val.Y（cs:77021）
    const prevWidth = width;               // num11（cs:77023）
    if (inRampHead) width = Math.min(maxWidth, width + ramp);
    else if (inRampTail) width = Math.max(minWidth, width - ramp);
    vy -= Math.trunc((prevWidth + width) / 4); // C# int 除法（cs:77028）
    for (let j = 0; j < width; j++) {
      const tx = Math.trunc(vx);           // (int)val.X（cs:77031）
      const ty = Math.trunc(vy) + j;       // (int)val.Y + j（cs:77032）
      // InWorld(x,y,20)（cs:9635）：fluff 四边内缩
      if (tx >= 20 && tx < w - 20 && ty >= 20 && ty < h - 20) {
        if (type >= 0) {
          // PlaceTile(mute,forced)——本 pass 无调用方（恒 -1），占位备案
          st.setTileSilent(tx, ty, type, 0, 0);
        } else if (st.flags[st.idx(tx, ty)]) {
          // ★KillTile 非活性格零消耗（cs:63568 !active 早退）——调用点带 active 门
          //  （HalfBrickPass.killTile 无自守,其既有调用点同款约定）
          killTile(st, rng, tx, ty);
        }
      }
    }
  }
}

/** WavyCaves pass（cs:12301-12340）主体。普通世界（非 Constant）零掷骰跳过。 */
export function runWavyCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const sf = gs.seedFlags;
  // cs:12303：!Skyblock.denyAllGeneration && dontStarveWorldGen（skyblock 本仓无生成路径）
  if (!sf?.theConstant) return;
  const w = st.w, h = st.h;
  const underworld = h - 200;              // Main.UnderworldLayer
  let count = Math.trunc(35.0 * (w / 4200.0) * (w / 4200.0)); // num2（cs:12308）
  if (sf.remix) count = Math.trunc(count / 3);                // cs:12311（remix 组合）
  let prevY = 0;                           // num3（cs:12312）
  const minSep = 80;                       // num4（cs:12313）
  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);          // num5（cs:12316）
    // num6 = Next(worldSurface+100, UnderworldLayer-100)——与上一条间隔 <80 则重掷
    //（上限 100 次,cs:12318-12326）
    let y = rng.int(Math.trunc(gs.worldSurface) + 100, underworld - 100 - 1);
    let guard = 0;
    while (Math.abs(y - prevY) < minSep) {
      guard++;
      if (guard > 100) break;
      y = rng.int(Math.trunc(gs.worldSurface) + 100, underworld - 100 - 1);
    }
    prevY = y;
    const startX = 80 + Math.trunc((w - 80 * 2) * frac);        // cs:12329-12330
    // cs:12333-12335：强度 12+Next(3,6)、频率 0.25+NextDouble、步数 Next(300,500)
    wavyCaverer(st, rng, startX, y, 12 + rng.int(3, 5), 0.25 + rng.next(), rng.int(300, 499), -1);
  }
}

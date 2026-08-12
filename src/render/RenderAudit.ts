// 世界渲染自动审计（离线校对存档/生成世界的全部方块与物件贴图渲染正确性）。
// 纯函数模块（无 DOM 依赖）：输入 TileStore 快照视图，输出分级问题清单。
// 由 scripts/render-audit.mjs CLI 驱动（--map 存档 / --seed 生成）；也可在测试中直调。
//
// 检查项（每项对照"曾真实发生过"的事故类型）：
//  ① 帧越表    frameX/frameY 超出贴图表像素范围——雕像 55 列换行 / 火把 style 轴向
//              反 / 187 wrap 缺失等事故的直接信号（error）
//  ② 帧步长    非表内步长对齐（error；非均匀行高表白名单豁免）
//  ③ 幽灵 tile flags=0 但 type≠0——存档脏数据/渲染不可见残留（warn）
//  ④ 墙 id 越界 wall ≥ WALL_DEFS.length（error）
//  ⑤ 多格物件帧连续性 w×h>1 物件各格帧相位差≠18 = 物件残缺断裂（warn）
//  ⑥ 火把锚定 用 torchStillAnchored——浮空火把（error）
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
// 火把锚定判定内联（torchStillAnchored 依赖 TileStore 方法，审计视图是纯数组）

/** 审计所需的最小存储视图（TileStore 本体满足） */
export interface AuditStoreView {
  w: number; h: number;
  type: Uint16Array;
  flags: Uint8Array;
  frameX: Uint16Array;
  frameY: Uint16Array;
  wall: Uint16Array;
}

export interface AuditIssue {
  sev: 'error' | 'warn';
  x: number; y: number;
  sheet: number;
  msg: string;
}

export interface AuditReport {
  issues: AuditIssue[];
  /** sheet → 问题数（按严重级合并汇报） */
  bySheet: Record<string, number>;
  errors: number;
  warns: number;
  scanned: number;
}

// ---- 贴图表尺寸（public/sprites/vanilla.json；grid+2px 间隙推算表宽高） ----
import vanillaJson from '../../public/sprites/vanilla.json';
const VMETA = (vanillaJson as unknown as {
  tiles: Record<string, { grid: [number, number]; stride: [number, number]; cols: number; rows: number }>;
}).tiles;

/** 非 18 步长/非均匀行高表（步长检查豁免；尺寸检查仍生效） */
const STRIDE_WHITELIST = new Set([
  187,            // Decos3x2 行高 16/18
  79, 90, 15,     // 床/浴缸/椅子：Y 步 38/40 等非 18
  93,             // 路灯柱 1×6（帧列 0..2 行 0..5）
  50, 135,        // meta 缺陷表（cols/rows=0）——尺寸检查跳过、步长跳过
  5, 72, 323, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634,  // 树干 22 步长
]);
/** 火把：X 步长 22（锚 0/22/44 + 未点燃 66 档） */
const SHEET_TORCH = 4;

/** 视图内的实心判定（TileStore.isSolid 语义：active+solid） */
function solidAt(st: AuditStoreView, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const j = y * st.w + x;
  if (!st.flags[j]) return false;
  return !!TILE_DEFS[st.type[j]]?.solid;
}

/** 全量审计。maxReport 每类问题上限（防刷屏；bySheet 计数不受限） */
export function auditWorldRender(st: AuditStoreView, maxReport = 200): AuditReport {
  const issues: AuditIssue[] = [];
  const bySheet: Record<string, number> = {};
  let errors = 0, warns = 0, scanned = 0;
  const push = (sev: 'error' | 'warn', x: number, y: number, sheet: number, msg: string) => {
    if (sev === 'error') errors++; else warns++;
    bySheet[sheet] = (bySheet[sheet] ?? 0) + 1;
    if (issues.length < maxReport) issues.push({ sev, x, y, sheet, msg });
  };

  // 多格物件（w/h>1）登记：type → {w,h}
  const multi = new Map<number, { w: number; h: number }>();
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (!d) continue;
    const w = d.w ?? 1, h = d.h ?? 1;
    if ((w > 1 || h > 1) && d.vanilla?.sheet != null) multi.set(id, { w, h });
  }
  let multiReported = 0;
  let torchReported = 0;

  const { w: W, h: H } = st;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const type = st.type[i];
      const def = TILE_DEFS[type];
      // ③ 幽灵 tile / ④ 墙越界（不依赖 flags）
      if (type !== 0 && !st.flags[i]) {
        push('warn', x, y, def?.vanilla?.sheet ?? -1, `幽灵 tile: type=${type}(${def?.key ?? '?'}) flags=0`);
        continue;
      }
      const wall = st.wall[i];
      if (wall >= WALL_DEFS.length) {
        push('error', x, y, -1, `墙 id 越界: wall=${wall}（WALL_DEFS.length=${WALL_DEFS.length}）`);
      }
      if (type === 0) continue;
      scanned++;
      const sheet = def?.vanilla?.sheet;
      if (sheet == null) continue;
      const fx = st.frameX[i], fy = st.frameY[i];
      const meta = VMETA[String(sheet)];

      // ① 帧越表（像素级粗判；meta 缺陷表跳过）
      if (meta && meta.cols > 0 && meta.rows > 0) {
        const texW = meta.cols * meta.grid[0] + (meta.cols - 1) * 2;
        const texH = meta.rows * meta.grid[1] + (meta.rows - 1) * 2;
        if (fx >= texW || fy >= texH || fx < 0 || fy < 0) {
          push('error', x, y, sheet, `帧越表: fx=${fx},fy=${fy} 超 ${texW}×${texH}`);
          continue;
        }
      }
      // ② 帧步长（表内但不对齐格位）
      if (meta && !STRIDE_WHITELIST.has(sheet) && sheet !== SHEET_TORCH) {
        if (fx % meta.stride[0] !== 0 || fy % meta.stride[1] !== 0) {
          push('error', x, y, sheet, `帧未对齐步长: fx=${fx},fy=${fy} stride=${meta.stride}`);
        }
      }
      // ⑥ 火把锚定（Torch.ts torchStillAnchored 语义内联；树干侧锚近似省略）
      if (sheet === SHEET_TORCH && torchReported < 50) {
        if (fx % 22 !== 0) { push('error', x, y, sheet, `火把帧非法: fx=${fx} 非 22 步长`); torchReported++; }
        else {
          const lit = fx % 66 < 22 ? fx % 22 : fx % 66;   // 剥未点燃 66 档取锚位
          const anchor = lit === 0
            ? (solidAt(st, x, y + 1) || st.wall[i] !== 0)
            : lit === 22 ? solidAt(st, x - 1, y) : solidAt(st, x + 1, y);
          if (!anchor) {
            push('error', x, y, sheet, `浮空火把: fx=${fx} 无底锚/侧锚/墙锚`);
            torchReported++;
          }
        }
      }
      // ⑤ 多格物件帧连续性（只查锚格：相位 (0,0)）
      const m = multi.get(type);
      if (m && multiReported < 100) {
        const ow = m.w, oh = m.h;
        const isAnchor = fx % (ow * 18) === 0 && fy % (oh * 18) === 0;
        if (isAnchor) {
          let broken = false;
          for (let dx = 0; dx < ow && !broken; dx++) {
            for (let dy = 0; dy < oh && !broken; dy++) {
              if (dx === 0 && dy === 0) continue;
              const j = (y + dy) * W + (x + dx);
              if (x + dx >= W || y + dy >= H || st.type[j] !== type
                || st.frameX[j] !== fx + dx * 18 || st.frameY[j] !== fy + dy * 18) broken = true;
            }
          }
          if (broken) {
            push('warn', x, y, sheet, `多格物件 ${def?.key}(${ow}×${oh}) 帧断裂/残缺 @(${x},${y})`);
            multiReported++;
          }
        }
      }
    }
  }
  return { issues, bySheet, errors, warns, scanned };
}

/** 汇报文本（CLI/测试共用） */
export function formatAuditReport(r: AuditReport, worldLabel: string): string {
  const L: string[] = [];
  L.push(`== 渲染审计: ${worldLabel} ==`);
  L.push(`扫描活性 tile ${r.scanned.toLocaleString()} 格 | error ${r.errors} | warn ${r.warns}`);
  const sheets = Object.entries(r.bySheet).sort((a, b) => b[1] - a[1]);
  if (sheets.length) {
    L.push('按 sheet 分布: ' + sheets.slice(0, 10).map(([s, n]) => `${s}×${n}`).join('  '));
    for (const it of r.issues.slice(0, 40)) {
      L.push(`  [${it.sev === 'error' ? 'E' : 'W'}] (${it.x},${it.y}) sheet=${it.sheet} ${it.msg}`);
    }
    if (r.issues.length >= 40) L.push(`  … 仅列前 40/${r.issues.length} 条`);
  } else {
    L.push('全部通过 ✓ 无渲染异常');
  }
  return L.join('\n');
}

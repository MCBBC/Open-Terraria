// DrawInfoAccs 渲染层(Main.cs:46142-46665 的绘制半段;数据/门禁在 stats/InfoAccs.ts)。
// 几何(GetInfoAccIconPosition :46668-46710):屏幕右上一列 X=screenWidth-280,
// Y=-32(+261 大地图开时);图标 (X, Y+74+22*row+52)、文本 (X+20, Y+74+22*row+48)
// → 图标左、文本右 20px;行距 22(矮屏 20,:46534)。
// 背包开(:46555-46593):只画图标横排(X=W-280+20*k-10, Y=94(+261)),文本不画。
// 交互:悬停 tooltip=行标签;点击切 hideInfo(:46547-46573);隐藏态图标
// rgba(80,80,80,70);悬停叠 InfoIcon_13 高亮框。
// 字体偏差登记:原版 FontAssets.MouseText;本仓 canvas 常规字体+strokeText 四向描边。
import { UITextures } from '../vui/assets/UITextures';
import { buildInfoAccRows, type InfoAccCtx, type InfoAccRow } from '../stats/InfoAccs';

export interface InfoAccDrawState {
  /** 本帧行(渲染层填;供交互层查 rect) */
  rows: InfoAccRow[];
  /** 图标绘制矩形(屏幕 px;背包横排/竖排两种布局共用) */
  iconRects: Array<{ x: number; y: number; w: number; h: number; row: InfoAccRow }>;
  inventoryOpen: boolean;
}

export class InfoAccsLayer {
  state: InfoAccDrawState = { rows: [], iconRects: [], inventoryOpen: false };

  /** CanShowInfoAccs(Main.cs:3060-3070):NPC 对话/箱子/告示牌开时不画 */
  canShow(talking: boolean, chestOpen: boolean, signOpen: boolean): boolean {
    return !talking && !chestOpen && !signOpen;
  }

  /** 本帧推进:节流计数器(雷达/稀有生物 15 帧一扫)+ speedSlice 秒表窗口 */
  tick(player: {
    accThirdEyeCounter: number; accThirdEyeNumber: number;
    accCritterGuideCounter: number; accCritterGuideNumber: number;
    accThirdEyeCount: number; accCritterGuideText: string | null;
    speedSlice: Float32Array; vx: number; vy: number;
  }, enemies: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vanillaId: number | null }>,
    critters: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean }>,
    pcx: number, pcy: number,
    countEnemy: (e: { vanillaId: number | null; cx: number; cy: number }) => boolean,
    rarityOf: (vanillaId: number | null) => number,
    nameOf: (vanillaId: number | null) => string | null,
    speedOf: (vx: number, vy: number) => number,
  ): void {
    // 雷达(Main.cs:46389-46414):2000px 半径,15 帧节流
    if (++player.accThirdEyeCounter >= 15) {
      player.accThirdEyeCounter = 0;
      let n = 0;
      for (const e of enemies) {
        if (e.dead || !countEnemy(e)) continue;
        if (Math.hypot(e.cx - pcx, e.cy - pcy) < 2000) n++;
      }
      player.accThirdEyeNumber = 15;
      player.accThirdEyeCount = n;
    }
    // 稀有生物(Main.cs:46352-46382):1300px,15 帧节流,取 rarity 最大者
    if (++player.accCritterGuideCounter >= 15) {
      player.accCritterGuideCounter = 0;
      player.accCritterGuideNumber = 15;
      let best: { name: string; d: number; rarity: number } | null = null;
      const pool: Array<{ dead: boolean; cx: number; cy: number; vanillaId: number | null }> = [
        ...enemies.map((e) => ({ dead: e.dead, cx: e.cx, cy: e.cy, vanillaId: e.vanillaId })),
        ...critters.map((c) => ({ dead: c.dead, cx: c.cx, cy: c.cy, vanillaId: null })),
      ];
      for (const c of pool) {
        if (c.dead) continue;
        const r = rarityOf(c.vanillaId);
        if (r <= 0) continue;
        const d = Math.hypot(c.cx - pcx, c.cy - pcy);
        if (d >= 1300) continue;
        const nm = nameOf(c.vanillaId);
        if (!nm) continue;
        if (!best || r > best.rarity || (r === best.rarity && d < best.d)) best = { name: nm, d, rarity: r };
      }
      player.accCritterGuideText = best ? best.name : null;
    }
    // 秒表 speedSlice(Main.cs:46414-46440):窗口长 = 1+|v|*6,右移回填均值
    const v = speedOf(player.vx, player.vy);
    const n = Math.min(60, Math.floor(1 + Math.abs(v) * 6));
    const sl = player.speedSlice;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sl[i];
    const avg = n > 0 ? sum / n : 0;
    sl.copyWithin(1, 0, 59);
    sl[0] = v;
    for (let i = n; i < 60; i++) sl[i] = avg; // 尾部均值回填(:46436-46440)
    this._speedAvg = avg;
  }
  private _speedAvg = 0;
  get speedAvg(): number { return this._speedAvg; }

  /**
   * 绘制。返回行数(0=无饰品/全隐藏)。UI 层文本/图标;
   * 图标纹理 InfoIcon_N(vanilla-ui 清单,UITextures.get('UI_InfoIcon_N'))。
   */
  draw(
    ctx: CanvasRenderingContext2D,
    canvasW: number, canvasH: number,
    infoCtx: InfoAccCtx,
    hidden: boolean[],
    inventoryOpen: boolean,
    bigMapOpen: boolean,
    hoveredRow: number,
    mouseX: number, mouseY: number,
    onRowLabel?: (label: string) => void,
  ): number {
    const rows = buildInfoAccRows(infoCtx, hidden, inventoryOpen);
    this.state = { rows, iconRects: [], inventoryOpen };
    if (!rows.length) return 0;
    // 几何(:46668-46710 两分支;矮屏行距 20)
    const pitch = canvasH < 650 ? 20 : 22;
    const iconTex = (n: number) => UITextures.get(`UI_InfoIcon_${n}`);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = 'middle';
    if (inventoryOpen) {
      // 背包横排(:46681):X = W-280+20*k-10, Y = 94(+261 大地图)
      const y = 94 + (bigMapOpen ? 261 : 0);
      let k = 0;
      for (const r of rows) {
        const x = canvasW - 280 + 20 * k - 10;
        this.drawIcon(ctx, iconTex(r.icon), x, y, hidden[r.hideIndex], r.row === hoveredRow, iconTex(13));
        this.state.iconRects.push({ x, y, w: 20, h: 20, row: r });
        k++;
      }
    } else {
      const X = canvasW - 280;
      const Y = -32 + (bigMapOpen ? 261 : 0);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const iy = Y + 74 + pitch * i + 52;
        const ty = Y + 74 + pitch * i + 48;
        this.drawIcon(ctx, iconTex(r.icon), X, iy, false, r.row === hoveredRow, iconTex(13));
        this.state.iconRects.push({ x: X, y: iy, w: 20, h: 20, row: r });
        if (!inventoryOpen) {
          // 文本(:46594-46639):宽 >215 缩 X;scaleX<0.58 缩 Y;4 遍黑描边+正文;
          // 悬停行与下一行文本压暗 1/3(:46629-46632)
          const dim = (i >= hoveredRow && i < hoveredRow + 2) ? 0.34 : 1;
          const fontPx = 14;
          ctx.font = `${fontPx}px monospace`;
          const w = ctx.measureText(r.text).width;
          let scaleX = 1;
          if (w > 215) scaleX = 215 / w;
          let scaleY = 1;
          if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
          ctx.save();
          ctx.translate(X + 20, ty);
          ctx.scale(scaleX, scaleY);
          ctx.globalAlpha = dim;
          for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
            ctx.fillStyle = '#000';
            ctx.fillText(r.text, ox, oy);
          }
          ctx.fillStyle = '#e8e4f0';
          ctx.fillText(r.text, 0, 0);
          ctx.restore();
        }
        // 悬停 tooltip 上报(渲染层只报,DOM tooltip 由 UI 消费)
        if (r.row === hoveredRow && onRowLabel) onRowLabel(r.label);
      }
    }
    ctx.restore();
    return rows.length;
  }

  /** 单图标(20×20;隐藏态 rgba(80,80,80,70);悬停叠 InfoIcon_13) */
  private drawIcon(
    ctx: CanvasRenderingContext2D,
    tex: ReturnType<typeof UITextures.get>,
    x: number, y: number, hidden: boolean, hovered: boolean,
    hlTex: ReturnType<typeof UITextures.get>,
  ): void {
    if (!tex) return;
    ctx.save();
    if (hidden) ctx.globalAlpha = 0.27;
    ctx.drawImage(tex.img, tex.sx, tex.sy, tex.sw, tex.sh, x, y, 20, 20);
    ctx.restore();
    if (hovered && hlTex) {
      ctx.drawImage(hlTex.img, hlTex.sx, hlTex.sy, hlTex.sw, hlTex.sh, x - 2, y - 2, 24, 24);
    }
  }

  /** 悬停行探测(屏幕坐标 → 行;无命中 -1) */
  hitTest(mx: number, my: number): number {
    for (const r of this.state.iconRects) {
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) return r.row.row;
    }
    return -1;
  }
}

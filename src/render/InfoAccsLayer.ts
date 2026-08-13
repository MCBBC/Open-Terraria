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

  /** 本帧推进:节流计数器(雷达/稀有生物 16 帧一扫)+ speedSlice 秒表窗口 */
  tick(player: {
    accThirdEyeCounter: number;
    accCritterGuideCounter: number;
    accThirdEyeNumber: number; accCritterGuideText: string | null; accCritterGuideVid: number | null;
    speedSlice: Float32Array; vx: number; vy: number;
  }, enemies: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vanillaId: number | null }>,
    critters: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; def?: { npc?: number } }>,
    pcx: number, pcy: number,
    countEnemy: (e: { vanillaId: number | null; cx: number; cy: number }) => boolean,
    rarityOf: (vanillaId: number | null) => number,
    nameOf: (vanillaId: number | null) => string | null,
    speedOf: (vx: number, vy: number) => number,
    gates: { accThirdEye: boolean; accCritterGuide: boolean; accStopwatch: boolean },
  ): void {
    // 雷达(Main.cs:46389-46414):2000px 半径;counter==0 扫一轮并置 15,否则递减
    // (周期 16 帧;计数只在配饰装备时推进——原版在行分支内)
    if (gates.accThirdEye) {
      if (player.accThirdEyeCounter <= 0) {
        player.accThirdEyeCounter = 15;
        player.accThirdEyeNumber = 0;
        for (const e of enemies) {
          if (e.dead || !countEnemy(e)) continue;
          if (Math.hypot(e.cx - pcx, e.cy - pcy) < 2000) player.accThirdEyeNumber++;
        }
      } else {
        player.accThirdEyeCounter--;
      }
    }
    // 稀有生物(Main.cs:46352-46382):1300px;counter<=0 扫一轮并置 15,否则递减;
    // 取 rarity 最大者(严格 >,平局先扫到者胜——原版无距离平局解析)
    if (gates.accCritterGuide) {
      if (player.accCritterGuideCounter <= 0) {
        player.accCritterGuideCounter = 15;
        let best: { name: string; rarity: number; vid: number } | null = null;
        const pool: Array<{ dead: boolean; cx: number; cy: number; vanillaId: number | null }> = [
          ...enemies.map((e) => ({ dead: e.dead, cx: e.cx, cy: e.cy, vanillaId: e.vanillaId })),
          ...critters.map((c) => ({ dead: c.dead, cx: c.cx, cy: c.cy, vanillaId: c.def?.npc ?? null })),
        ];
        for (const c of pool) {
          if (c.dead) continue;
          const r = rarityOf(c.vanillaId);
          if (r <= 0) continue;
          if (Math.hypot(c.cx - pcx, c.cy - pcy) >= 1300) continue;
          const nm = nameOf(c.vanillaId);
          if (!nm) continue;
          if (!best || r > best.rarity) best = { name: nm, rarity: r, vid: c.vanillaId ?? -1 };
        }
        player.accCritterGuideText = best ? best.name : null;
        player.accCritterGuideVid = best ? best.vid : null;
      } else {
        player.accCritterGuideCounter--;
      }
    }
    // 秒表 speedSlice(Main.cs:46466-46491):窗口长 = min(60, 1+|v|*6);窗口内右移
    // → 本帧速度入 [0] → 再对窗口求和(含本帧)→ 尾部 [n,60) 回填均值
    if (gates.accStopwatch) {
      const v = speedOf(player.vx, player.vy);
      const n = Math.min(60, Math.floor(1 + Math.abs(v) * 6));
      const sl = player.speedSlice;
      for (let i = n - 1; i > 0; i--) sl[i] = sl[i - 1];
      sl[0] = v;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += sl[i];
      const avg = sum / n;
      for (let i = n; i < 60; i++) sl[i] = avg;
      this._speedAvg = avg;
    }
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
          // "附近无 X"行文字降灰(:46328/:46388/:46414 等 infoTextColor=Color(100,100,100));
          // 悬停行的**下一行**压暗 1/3(:46629-46632:i>num2 && i<num2+2,无悬停恒不暗)
          const dim = hoveredRow >= 0 && i === hoveredRow + 1 ? 0.34 : 1;
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
          ctx.fillStyle = r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0';
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

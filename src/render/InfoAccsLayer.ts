// DrawInfoAccs 渲染层(Main.cs:46142-46665 的绘制半段;数据/门禁在 stats/InfoAccs.ts)。
// 几何(GetInfoAccIconPosition :46668-46710):屏幕右上一列 X=screenWidth-280,
// Y=-32(+261 小地图开时 mapStyle==1);文本锚 (X+20, Y+74+22*row+48);图标原生
// 14×14(贴图实测,原版不缩放),纵向 = 字形盒实测居中+2px 低偏(原版图标顶=
// 文本顶+4 的观感等效);行距 22(矮屏 20,:46534)。
// 背包开(:46555-46593):只画图标横排(X=W-280+20*k-10, Y=94(+261)),文本不画
// (备案:原版矮屏走装备页耦合纵排 :48120,本仓背包自研布局不映射)。
// 交互:悬停 tooltip=行标签(Game 侧接 cursorItemIconText);点击切 hideInfo
// (:46547-46573);隐藏态图标 = Color(80,80,80,70) 乘色;悬停叠 InfoIcon_13。
// 字体偏差登记:原版 FontAssets.MouseText(scale 1,CJK 墨高 17-19/推进 18.5);
// 本仓 canvas+四向 ±2 描边,字体串 = CANVAS_MOUSETEXT_FONT(14px 用户拍板终值
// 2026-09-16 两轮拍板;墨高等值档 19px/折中 16px 链见 PixelText.ts 注保留——
// ★FX35 2026-09-15:原「14px monospace
// 替身」在 Windows DirectWrite 下四向偏移露出偏移拷贝=「叠了几层文字」观感
// (用户实报,Mac 同症不显),像素字体后描边被实心字形吃净)。
// ★FX57 2026-09-16 字形改「离屏烘焙+主画布放大」(用户 Windows 实报:灰字
//  在背景越亮处越模糊,Mac 较轻——像素字体非整数倍字号 fillText 必然抗锯齿,
//  imageSmoothingEnabled 管不了 fillText,见 MouseTextBake.ts 头注根因/修法)。
//  ★FX58 2026-09-18 档位化:pixel 档(dpr<1.5)=12px 二值烘焙+最近邻(FX57 原样);
//  hidpi 档(dpr≥1.5,Mac Retina 实报「过于锐化」)=2× 超采样灰度烘焙+线性采样
//  ÷2(原版 LinearClamp 采样语义),机制/探针证据见 MouseTextBake.ts FX58 头注。
//  本层只换字形出处:测宽/墨盒仍目标字号 measureText(215 钳制/图标 iy/行距
//  22/锚点/claim 序零漂移),grayed(100,100,100)行/悬停次行 α0.34 压暗行同
//  管线(色=运行时染色,α=主画布 globalAlpha);bake 不可用回退下方旧直绘。
//  ★BJ276 2026-09-22 方案 B(用户拍板)退役本层烘焙:信息行=动态读数键(秒表
//  mph/罗盘/深度计逐帧变→烘焙逐帧 miss+canvas 出生 ~88/s,perf 账见
//  MouseTextBake.ts 头注 BJ276 段)→ drawDirectMouseText 直绘(fillText+四向
//  ±2 描边,原版逐帧直绘 glyph 同思路;观感=平滑 AA,拍板接受)。FX57/58 的
//  烘焙管线对【静态键面】(悬停标签等)继续现役,见 MouseTextBake.ts。
import { CANVAS_MOUSETEXT_FONT } from '../vui/draw/PixelText';
import { drawDirectMouseText } from '../vui/draw/MouseTextBake';
import { UITextures } from '../vui/assets/UITextures';
import { buildInfoAccRows, type InfoAccCtx, type InfoAccRow } from '../stats/InfoAccs';
import type { InfoAccsDOM } from './InfoAccsDOM';

export interface InfoAccDrawState {
  /** 本帧行(渲染层填;供交互层查 rect) */
  rows: InfoAccRow[];
  /** 图标绘制矩形(屏幕 px;背包横排/竖排两种布局共用) */
  iconRects: Array<{ x: number; y: number; w: number; h: number; row: InfoAccRow }>;
  inventoryOpen: boolean;
}

export class InfoAccsLayer {
  state: InfoAccDrawState = { rows: [], iconRects: [], inventoryOpen: false };
  /** DOM 渲染层(★信息栏 DOM 化 2026-09-19;?infodom=1 灰度旗,Renderer 分派)。
   *  仅挂载+旗开时 hitTest 委托其 DOM 悬停(命中域=图标盒同域);canvas 旧路径
   *  (draw/hitTest 本体)零改动保留。type-only 导入,无运行时环 */
  dom: InfoAccsDOM | null = null;

  /** CanShowInfoAccs(Main.cs:3099-3110):`!(npcChat 非空 && chest==-1) && sign<0`
   *  ——只压「对话中且未开箱」;开箱本身不隐藏(此时 playerInventory=true 走
   *  图标横排),告示牌编辑压制。曾误写三者任一即隐藏 */
  canShow(talking: boolean, chestOpen: boolean, signOpen: boolean): boolean {
    return (!talking || chestOpen) && !signOpen;
  }

  /** 本帧推进:节流计数器(雷达/稀有生物 16 帧一扫)+ speedSlice 秒表窗口 */
  tick(player: {
    accThirdEyeCounter: number;
    accCritterGuideCounter: number;
    accThirdEyeNumber: number; accCritterGuideText: string | null; accCritterGuideVid: number | null;
    speedSlice: Float32Array; vx: number; vy: number;
    /** ★BJ550：isPerformingJump_DownDash（Player.cs:2643）——秒表下坠速双计消费位
     *  （可选:测试桩缺省 = undefined 恒假 ≙ 原版旗关档） */
    isDownDashing?: boolean;
  }, enemies: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vanillaId: number | null }>,
    critters: Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vanillaId: number | null }>,
    npcs: Array<{ cx: number; cy: number; dead: boolean; vanillaId: number | null; givenName?: string }>,
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
        const pool: Array<{ dead: boolean; cx: number; cy: number; vanillaId: number | null; given?: string }> = [
          ...enemies.map((e) => ({ dead: e.dead, cx: e.cx, cy: e.cy, vanillaId: e.vanillaId })),
          // ★BJ332 2026-09-24：载体勘误——旧 `c.def?.npc` 引用 2026-08-17 已退役的
          //  CritterDef 形状（critters.ts 头注：Critter 类终删），现役 critters 桶成员
          //  是 Enemy，身份域 = vanillaId（Enemy.ts:491）；EnemyDef（enemies.ts:5-37）
          //  无 npc 字段 → 旧映射恒 undefined → vanillaId=null → rarityOf=0 →
          //  critters 桶 99 型小动物对分析仪全盲（661 七彩草蛉 rarity=4，NPC.cs:17383-17397
          //  实报即此族）。原版无 critter 分桶——Main.npc 全表一扫（:47776），
          //  CountsAsCritter（NPCID.cs:4829，99 型）仅是计数/捕获旗，不参与稀有判定。
          //  受影响稀有族 20 型：374 松露虫/442-448/539 金系/583-585 仙女/592/593 金金鱼/
          //  601 金蜻蜓/605 金瓢虫/613 金水黾/627 金海马/661 七彩草蛉/687 神秘青蛙。
          ...critters.map((c) => ({ dead: c.dead, cx: c.cx, cy: c.cy, vanillaId: c.vanillaId ?? null })),
          // ★BJ122 2026-09-18：npcs 桶入池——原版扫 Main.npc 全表（:47776 活跃+
          //  rarity 择优,无 townNPC/bound 排除门）;被缚族 105/106/123/354/376/579/589
          //  rarity=1（:10283/:10297/:10534/:13543/:13837/:16595/:16692）、
          //  534 痛苦亡魂/685/686/687 rarity=2（:15855/:17653/:17667/:17680）
          //  → 原版分析仪可见（找被缚者本就靠它）,此前漏检=用户观测 3。
          //  ★红蓝-H② 行号勘误（13544→13543/16694→16692）+域修正：被缚型 rarity
          //  与名号都钉在【绑缚本体 id】,而本仓 bound TownNPC 实体携城镇 id——
          //  Game.tickInfoAccs 已按 Game.boundAnalyzerVid 投影回本体 id 并压制
          //  givenName（被缚者原版无名）;城镇型 rarity=0=原版同相不显。
          //  显示名 GivenOrTypeName（:47796）→ givenName 优先
          ...npcs.map((n) => ({ dead: n.dead, cx: n.cx, cy: n.cy, vanillaId: n.vanillaId, given: n.givenName })),
        ];
        for (const c of pool) {
          if (c.dead) continue;
          const r = rarityOf(c.vanillaId);
          if (r <= 0) continue;
          if (Math.hypot(c.cx - pcx, c.cy - pcy) >= 1300) continue;
          const nm = ('given' in c && c.given) || nameOf(c.vanillaId);
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
      // ★BJ550 下砸双计（Main.cs:47882-47884）：isPerformingJump_DownDash →
      // vector.Y += velocity.Y——秒表 mph 读数把下坠速计两次（快坠仪表反馈面;
      // 本仓 instantMovementAccumulatedThisFrame≈0 既有近似不变）。
      const v = speedOf(player.vx, player.vy + (player.isDownDashing ? player.vy : 0));
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
    // ★文本态自钉(textAlign/baseline)——canvas 状态跨帧持久,帧内更早的 HUD
    //  (死亡画面/Boss 条等)裸设 textAlign='center' 不还原时,本层文本会以
    //  (X+20) 为中心左移半宽、图标相对"扎进"文本(2026-08-25 用户实报二度错位)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (inventoryOpen) {
      // 背包横排(:46681):X = W-280+20*k-10, Y = 94(+261 大地图);图标原生 14×14。
      // 2026-09-02 用户要求：折叠横排整体上移一点（94→82,心行 y≤80 之下）
      const y = 82 + (bigMapOpen ? 261 : 0);
      let k = 0;
      for (const r of rows) {
        const x = canvasW - 280 + 20 * k - 10;
        const t = iconTex(r.icon);
        this.drawIcon(ctx, t, x, y, hidden[r.hideIndex], r.row === hoveredRow, iconTex(13));
        this.state.iconRects.push({ x, y, w: t ? t.sw : 14, h: t ? t.sh : 14, row: r });
        k++;
      }
    } else {
      const X = canvasW - 280;
      const Y = -32 + (bigMapOpen ? 261 : 0);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // 文本锚 ty = 行基(中线上)。图标原生 14×14(InfoIcon_N 实测),高亮框 18×18
        const ty = Y + 74 + pitch * i + 48;
        // 文本(:46594-46639):宽 >215 缩 X;scaleX<0.58 缩 Y;4 遍黑描边+正文;
        // "附近无 X"行文字降灰(:46328/:46388/:46414 等 infoTextColor=Color(100,100,100));
        // 悬停行的**下一行**压暗 1/3(:46629-46632:i>num2 && i<num2+2,无悬停恒不暗)
        // ★FX35 2026-09-15 字体见头注(14px 用户拍板终值 2026-09-16;墨高等值档
        //  19px/折中 16px 链见 PixelText.ts)——19px 档 CJK 墨高 17.4 →
        //  行距 22 与原版同相(墨高 17-19/距 22)的等值断言挂 19px 档;14px 终值后
        //  行距 22 钉值未随调(下述 +2 低偏的「图标顶=文本顶+4」等值同挂 19px 档)
        const dim = hoveredRow >= 0 && i === hoveredRow + 1 ? 0.34 : 1;
        ctx.font = CANVAS_MOUSETEXT_FONT;
        const m = ctx.measureText(r.text);
        const w = m.width;
        let scaleX = 1;
        if (w > 215) scaleX = 215 / w;
        let scaleY = 1;
        if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
        // 图标纵向对齐 = 实测字形盒垂直居中 + 2px 低偏(原版图标顶=文本顶+4,
        // MouseText 字形在行盒内偏上 → 原版观感即图标中心略低于字形中心);
        // 字形盒量测不可用(旧浏览器)回退 锚-3
        const t = iconTex(r.icon);
        const ih = t ? t.sh : 14;
        const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
        const iy = Number.isFinite(asc) && asc > 0
          ? ty - (asc - desc) / 2 - ih / 2 + 2
          : ty - 3;
        this.drawIcon(ctx, t, X, iy, false, r.row === hoveredRow, iconTex(13));
        this.state.iconRects.push({ x: X, y: iy, w: t ? t.sw : 14, h: ih, row: r });
        // ★BJ276 2026-09-22 方案 B(用户拍板):本层行文本=动态读数(mph/罗盘/
        //  深度/雷达计数等逐帧变键),退役 FX57/58 烘焙缓存(逐帧 miss→逐帧烘焙
        //  +canvas 出生 ~88/s,LRU/willReadFrequently 只能摊销;机制账见
        //  MouseTextBake.ts 头注 BJ276 段),改 drawDirectMouseText 直绘——
        //  与缓存零交互(零 canvas 出生),观感=14px fillText 灰度 AA(平滑,
        //  用户已拍板接受)。op 序=FX57 前旧直绘回退支逐字节同形(translate
        //  (X+20,ty)+scale+'middle'+四向 ±2 黑描边+本体;压暗 dim 走 globalAlpha)。
        drawDirectMouseText(ctx, r.text, X + 20, ty, {
          anchor: 'middle',
          color: r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0',
          alpha: dim, scaleX, scaleY,
        });
        // 悬停 tooltip 上报(渲染层只报,DOM tooltip 由 UI 消费)
        if (r.row === hoveredRow && onRowLabel) onRowLabel(r.label);
      }
    }
    ctx.restore();
    return rows.length;
  }

  /** 单图标(原生 14×14 直出——InfoIcon_N 贴图实测 14×14,原版 spriteBatch.Draw
   *  不缩放,曾拉到 20×20 致图标臃肿+相对文本下坠一行);悬停叠 InfoIcon_13 18×18
   *  @pos-(2,2) 原生外扩 2px。
   *  隐藏态 = 原版 Color(80,80,80,70) 乘色(RGB×0.31 **且** A×0.27)——曾只乘 α
   *  (半透明亮图),原版是暗灰实感;烘焙乘色副本缓存(主画布禁 source-atop,
   *  会把图标下方世界像素一起染暗) */
  private drawIcon(
    ctx: CanvasRenderingContext2D,
    tex: ReturnType<typeof UITextures.get>,
    x: number, y: number, hidden: boolean, hovered: boolean,
    hlTex: ReturnType<typeof UITextures.get>,
  ): void {
    if (!tex) return;
    if (hidden) {
      ctx.drawImage(this.hiddenIcon(tex), x, y);
    } else {
      ctx.drawImage(tex.img, tex.sx, tex.sy, tex.sw, tex.sh, x, y, tex.sw, tex.sh);
    }
    if (hovered && hlTex) {
      ctx.drawImage(hlTex.img, hlTex.sx, hlTex.sy, hlTex.sw, hlTex.sh, x - 2, y - 2, hlTex.sw, hlTex.sh);
    }
  }

  /** 隐藏态图标烘焙缓存:tex × rgba(80,80,80,70) 乘色(XNA Color*Color 同乘 RGBA)
   *  ★2026-09-19 烘焙体抽为模块级 bakeHiddenIconCopy 单源(DOM 层同用),此处仅缓存 */
  private _hiddenIconCache = new Map<unknown, HTMLCanvasElement>();
  private hiddenIcon(tex: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }): HTMLCanvasElement {
    let cv = this._hiddenIconCache.get(tex.img);
    if (!cv) {
      cv = bakeHiddenIconCopy(tex);
      this._hiddenIconCache.set(tex.img, cv);
    }
    return cv;
  }

  /** 悬停行探测(屏幕坐标 → 行;无命中 -1)。
   *  ★信息栏 DOM 化(2026-09-19):DOM 层 active(?infodom=1 帧内)时委托其
   *  mouseenter/leave 悬停(命中域=图标 14×14 盒,与 iconRects 命中同域)——
   *  Game.tickInfoAccsHover 调用点零改动;旗关/未挂载走 iconRects 原路径
   *  (DOM active 层 iconRects 恒空表,两支互斥不回读陈旧面) */
  hitTest(mx: number, my: number): number {
    if (this.dom?.active) return this.dom.hoverRow();
    for (const r of this.state.iconRects) {
      if (mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h) return r.row.row;
    }
    return -1;
  }
}

/** 隐藏态图标烘焙(纯函数,单源):tex × rgba(80,80,80,70) 乘色(XNA Color*Color
 *  同乘 RGBA)。★信息栏 DOM 化 2026-09-19 自 InfoAccsLayer.hiddenIcon 私有体
 *  原样抽出(canvas 路径逻辑逐字节不变);DOM 层(InfoAccsDOM)烤 dataURL 复用 */
export function bakeHiddenIconCopy(tex: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = tex.sw;
  cv.height = tex.sh;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  c.drawImage(tex.img, tex.sx, tex.sy, tex.sw, tex.sh, 0, 0, tex.sw, tex.sh);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgb(80,80,80)';
  c.fillRect(0, 0, tex.sw, tex.sh);
  c.globalCompositeOperation = 'destination-in';
  c.globalAlpha = 70 / 255;
  c.drawImage(tex.img, tex.sx, tex.sy, tex.sw, tex.sh, 0, 0, tex.sw, tex.sh);
  return cv;
}

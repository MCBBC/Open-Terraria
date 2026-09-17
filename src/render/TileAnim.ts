// 原版 Main.AnimateTiles（Main.cs:18366-19155）竖直帧动画表：sheet → 每 N tick 推进一帧。
//
// ★★★ 防炸契约（2026-08-30 起）★★★
// 本文件三张表受 recon-tileanim 闸门 + 运行时金标双重锁定：
//   node tools/recon-tileanim.mjs            # 对账（DRIFT 必须 =0）
//   npx vitest run tests/tile-anim-authority.test.ts
// 改值流程：先读 Terarria1457 反编译源逐 case 确证 → --fix 再生金标 → diff 人工过目 →
// 跑双测。禁止凭截图/感觉手改数值——曾因此炸出全物平铺第一格（病根=风格带总数被当帧数）。
import { tileFrameCapture } from '../debug/TileFrameCapture';
import { cageFamilyOf } from './CritterCage';
// 绘制语义 = TileDrawing.GetTileDrawData addFrY：frameY += frameIdx * pitch。
// ★ pitch 有多组（TileDrawing.cs:4568+ 实证）：
//   默认 38px（2 格高物体的帧带 2px 额外间距——熔炉 17(456/38=12帧)/磨刀站 377 走默认；
//   篝火 215 走专属 36（TileDrawing.cs:6124 Campfires 覆盖，帧块 36px 无缝——勿并入默认 38！
//   曾致胶片滚动）；54 组（3 格高 3×18）：锯木机 106、固化机 220、自动锻造机 247、
//   300-308 制作台组、巫惑/炼金台 354/355、腐变室 499、水晶球 219、灌注台 243、吊火盆 592；
//   36 组（TileDrawing.cs:5524-5624 `frame*36`）：生命水晶 12/魔金球 31/魔力水晶 639、
//   混合机 217/绞肉机 218/染料缸 244；90 组（:4590-4594 `frame*90`）：水母砖 739/水砖 748；
//   72（:6002-6022 喷泉 207）。
// 帧数：默认 floor(素材像素高/pitch)（17→12、215→8、306→12、300→7、247→8 全吻合）；
//   个别素材高/pitch ≠ 原版回卷上限（12/639 表 396/36=11 但原版回卷 10）→
//   TILE_ANIM_FRAMES 显式指定。
// 304 Living Loom 原版无动画（AnimateTiles 无 304 条目，素材 54×54 单帧）。
// rate 归一化：原版 counter>N → 每 N+1 tick；counter>=N → 每 N tick。
export const TILE_ANIM_RATE: Record<number, number> = {
  // ★2026-08-30 全表按反编译权威重生成（Terarria1457/Terraria/Main.cs AnimateTiles
  //   :18699-19155 逐 case；period=counter 阈值语义'>N'→N+1/'≥N'→N），与素材
  //   PNG 容量逐项互证（tests/tile-anim.test.ts 金标）。
  //   移除项及其原版依据：
  //   · 171 圣诞树（体为静态帧，灯串由 drawXmasTreeCell 自算 17t/4f 环，纹理 64×128
  //     装不下 4×38 带——曾致全树周期重烘+错带采样）；
  //   · 314 矿车轨道（加速轨动画走 boosterAnimFrame 横向驱动，纵向 Y 偏移错误族）；
  //   · 485/491/564/597（原版 AnimateTiles 不推进对应 tileFrame——564 只有辉光层
  //     动画且 GetTileDrawData 内 addFrY=0 强清零；491 纯静态+addFrX 常量；
  //     597 风向统计计数器从不写 tileFrame）；
  //   · 614 是 addFrX（横向步距 54）族（TileDrawing.cs:5360-5363 实文），纵偏表会采样越界。
  12 : 6,   // counter>5 / f>=10        Main.cs 生命水晶组头
  17 : 6,   // >5       / >=12          （png 456=12×38 ✓）
  31 : 8,   // >=8      / >=4
  77 : 6,   // >5       / >=12
  106: 5,   // >4       / >=2   ★锯木机 2 帧（此前审计误 5 → ≥2 帧越界回退(0,0)=整物平铺第一格病根）
  129: 8,   // >=8      / >=6           ★水晶碎块：唯一动画=大簇 addFrX 横向步进（TileDrawing.cs:4682-4690
            //             case 129 addFrY=0 强清零 verbatim）→ 横向钟由 crystalShardAddFrX 消费；
            //             Y 向 pitch=0（TILE_ANIM_PITCH）——此前 Y 带独立=默认 38 造成源矩形逐相位
            //             纵向下移 2/4/6 带（侧向簇/辉光带/越界回退(0,0)），用户实报「原版一长串、
            //             本仓发散两个方块」根因（2026-09-18 定谳）
  133: 4,   // >=4      / >=6
  207: 5,   // >4       / >=6           喷泉 helper 专用（全局钟）
  215: 4,   // >=4      / >=8           篝火 helper 专用
  217: 5,   // >4       / >=5           混合机（p36）
  218: 5,   // >4       / >=2   ★绞肉机 2 帧（此前误 9）
  219: 5,   // >4       / >=10          水晶球（p54 png540 ✓）
  220: 5,   // >4       / >=4   ★固化机 4 帧（此前误 9 → 56% 绘制回退平铺）
  228: 5,   // >=5      / >=3           排列钟
  231: 17,  // >16      / >=7
  235: 21,  // >20      / >=4           ★速率勘正（此前误 4）；pitch 18（Drawing *18 实文）
  238: 21,  // >20      / >=4           ★同上；pitch 36
  243: 5,   // >4       / >=6
  244: 5,   // >4       / >=6           染料缸 p36
  247: 5,   // >4       / >7 → 8
  272: 10,  // >=10     / >1 → 2
  300: 5,   // >=5      / >6 → 7  ★此前 8
  301: 5,   // >=5      / >7 → 8
  302: 5,   // >=5      / >3 → 4
  303: 5,   // >=5      / >4 → 5
  305: 5,   // >=5      / >11 → 12
  306: 5,   // >=5      / >11 → 12 制冰机 ✓金标
  307: 5,   // >=5      / >1 → 2  ★此前 8
  308: 5,   // >=5      / >7 → 8  ★此前 12
  326: 5,   // >=5      / >7 → 8    瀑布入地族 p90
  327: 10,  // >=10     / >7 → 8
  328: 5,   // >=5      / >7 → 8
  329: 5,   // >=5      / >7 → 8
  336: 5,   // >=5      / >3 → 4    p90
  // ★BJ118②：340-344 活火族（诅咒/恶魔/霜火/灵液/超亮）与 336 同带同钟（case
  //   336/340-344 共链 :6114-6120 *90;原版 AnimateTiles for-loop 钟 Main.cs:19173-
  //   19184 counter>=5/4 帧回卷——提取器逐 id 字面盲区→亲读入表+recon PIN 锁）。
  //   此前缺键=不进动态层、drawAdjust 相位在 chunk 烘焙时定格（活火不跳动）。
  340: 5,   // for-loop 钟（19173）
  341: 5, 342: 5, 343: 5, 344: 5,
  345: 10,  // >=10     / >7 → 8
  351: 5,   // >=5      / >2 → 3  ★此前 7；p90
  354: 5,   // >=5      / >=8     巫惑台（金标回链）
  355: 5,   // 镜像 354（tileFrame[355]=tileFrame[354]）
  377: 5,   // >=5      / >=4   磨刀站 ✓
  379: 10,  // >=10     / >=4   p90 ★此前 rate4
  390: 8,   // >=8      / >=7   p36 ★此前 rate7
  405: 5,   // >=5      / >=8   壁炉 helper/drawAdjust 双通道一致
  406: 8,   // >=8      / >=6   烟囱 helper（chimneyAddFrY 步距56）
  410: 8,   // >=8      / >=8
  421: 4,   // >=4      / >=4
  422: 4,   // >=4      / --frame<0→3（逆向循环，索引域同 0..3）
  452: 5,   // >=5      / >=15  ★此前 15 当成速率；p54（png810 ✓）
  453: 60,  // 计数器+=rand.Next(3) 偏随机走针，退化为均值近似（备案偏离）
  455: 5,   // >=5      / >=6   ★此前 rate6；p54
  456: 80,  // 同 453 随机走针（>=80 回卷）；frame 数 6 由 Drawing 组接续确认
  458: 10,  // 瀑布底座族（同 327 形制）p90
  459: 10,  // >=10     / >7 → 8
  463: 10,  // >=10     / >=6   p72（png432 ✓）★此前 6/6 双误
  464: 5,   // >=5      / >=23  p72（png1656 ✓）
  480: 8,   // >=8      / >=8
  499: 5,   // >=5      / >=8
  509: 8,   // >=8      / >=8
  565: 4,   // >=4      / >=5   p36
  572: 6,   // >=6      / >=4   旋转旗组（drawAdjust 专支用 animRot 排相，本值供 chunk 重烘钟）
  592: 5,   // >=5      / >=8
  593: 5,   // >=5      / frame>=9→5（中段回跳特型）p18
  594: 5,   // 同 593 变体                p36
  639: 6,   // >5       / >=10  p36（png396 ✓）
  642: 5,   // >4       / >=6   ★双勘：rate 6→5、p38→54（Drawing case 219/220/642 组实文）
  657: 8,   // >=8      / >=8
  658: 4,   // >=4      / >=10  ★rate 勘正（此前 10）
  708: 10,  // >=10     / >7 → 8  ★frames 19→8；p90（png720=8×90 ✓，旧 19 会越两带）
  720: 8,   // >=8      / >=16  ★rate 16→8（'?<' 三元门槛实读）
  721: 8,   // >=8      / >=32  ★同上
  725: 8,   // >=8      / >=4   ★rate 4→8
  739: 11,  // >10      / >=4   p90 ✓
  748: 8,   // >7       / >=8   p90 ✓
  // ---- 程序化族重烘钟（drawAdjust 专支消费相位，本值供 chunk 重烘节律；权威提取）----
  96 : 5,   // >4       / >3 → 4（圣诞星，与 31 别名钟同域）
  270: 9,   // >8       / >5 → 6（萤火瓶横移族，drawAdjust :5632 消费——271/581 经
            //   Main.cs:18962-18964 tileFrame[271/581]=tileFrame[270] 别名同钟）
  660: 9,   // >8       / >4 → 5（精灵瓶横移族，drawAdjust :5661 消费）
  665: 6,   // 别名 12（tileFrame[665]=tileFrame[12]）
  696: 8,   // 别名 31 组钟（精灵之星变体）
};

/** pitch 特例表（其余走默认 38，TileDrawing GetTileDrawData switch 实证）。
 *  ★2026-08-30 权威化：逐 case 复核补齐——235=18（竖幡）、328/329/336/351/708 瀑布-
 *  幽灵墙族 90、379 吊灯 90、390 水晶碎块 36、452 喷泉雕塑 54、455 派对旗 54、
 *  463/464 弹簧棒/大炮轮组 72、565 星屑 36、593 回跳幡 18、642 附魔桌 54；
 *  移除 564（addFrY 在 glow 分支被强清零，本体无纵动画）。 */
/** 捕获系统读表用（生效 pitch 对照） */
export const TILE_ANIM_PITCH: Record<number, number> = {
  106: 54, 219: 54, 220: 54, 228: 54, 231: 54, 243: 54, 247: 54,
  300: 54, 301: 54, 302: 54, 303: 54, 305: 54, 306: 54, 307: 54, 308: 54,
  354: 54, 355: 54, 499: 54, 592: 54,
  12: 36, 31: 36, 217: 36, 218: 36, 244: 36, 639: 36,
  207: 72, 739: 90, 748: 90,
  326: 90, 327: 90, 345: 90, 458: 90, 459: 90,   // 瀑布族（TileDrawing.cs:6085-6094）
  // ---- 2026-08-30 批注勘正 ----
  235: 18,          // case 235 addFrY = frame*18（竖排幡带，png 高 70 仅容 4×18）
  238: 36,          // 同组 *36
  328: 90, 329: 90, // 雪尘族与 326/327 同带距（png720=8×90 ✓）
  336: 90, 351: 90,
  379: 90,          // case 379 addFrY*90（吊灯吊臂，png360 ✓）
  390: 36,
  452: 54, 455: 54,
  463: 72, 464: 72,
  565: 36, 593: 18, 594: 36,
  642: 54,          // case 219/220/642 三联组实文同 54
  17: 38,   77: 38,   96: 36,   129: 0,    133: 38,   215: 36,   270: 0,    340: 90,  341: 90,  342: 90,  343: 90,  344: 90,
  377: 38,   405: 38,   406: 56,   410: 56,   421: 90,   456: 54,   480: 54,   509: 54,   572: 0,    657: 54,   658: 54,   660: 0,    665: 36,   696: 36,   708: 90,   720: 54,   721: 54,   725: 54,
  // ★129=0（2026-09-18 定谳）：TileDrawing.cs:4687 case 129 `addFrY = 0` verbatim——
  //   纵向无动画带，动画只在横向 addFrX（crystalShardAddFrX）。旧默认 38 使源 sy 逐相位
  //   +38 走进侧向簇带(38)/辉光带(76/114)/越界回退(0,0)。
  // ★BJ118② 全表普查（2026-09-18，逐 case 亲读 GetTileDrawData + PNG 容量互证）：
  //   · 270/572/660=0——case 270/271/581(:5654)/660(:5681)/572(:5695) 全部 `addFrY = 0`
  //     verbatim（横移族：萤火瓶/魂瓶旋转=addFrX n×18）。旧默认 38 对 270/660 被 PNG
  //     36px 高的越界钳制掩蔽（每帧 clampMask=1 白算）；572 素材 216 高不被钳——源 sy
  //     +38/76/114 走进其它样式带=可见乱带（129 同族病第二例）。
  //   · 480/509/657/720/721/725=54——碑族（血月/虚空/回响/CRT/复古/放映机）case
  //     :6044-6059 `tileFrameY>=54 → addFrY=tileFrame×54,否则 0`：band0=静止档,
  //     1+ 号带动画（486=1静+8动×54/918=1+16×54/1782=1+32×54/270=1+4×54 容量互证）。
  //     门（fy<54 静止）由 VanillaTiler drawAdjust case 承担（表值只记步距）。
  //   · 658=54——微光碑 :6061-6079 `tileFrame×54 + 486×(fy/54==1) + 972×(fy/54==2)`
  //     （三变体子表基 0/486/972,1620=30×54 容量互证）；门=drawAdjust。
  //   · 410=56——月主碑 :6029-6042 `tileFrameY>=56 → tileFrame×56,否则 0`
  //     （504=1静带(0..55)+8动×56 容量互证）；门=drawAdjust。
  //   · 456=54——气球束 :5503-5511 `addFrY=num41×54`（num41=counter/20 坐标相位,
  //     216=4带×54 恰满——旧 38 系 PIN 锁缺证值;相位由 drawAdjust case 456 消费并
  //     整替 sy,通用 animYOffset 计算后被覆写不生效（备案）。

  // ★272 齿轮块（2026-08-31 权威化，TileDrawing.cs:1137-1147 verbatim）：步距 90
  // （素材 234×180=两带各90 实证）——此前 PIN 锁的 38 为本波补键时序错值，
  // 表现为用户报「海盗船齿轮块动态漂移」；相位因子见 cogAddFrY。
  272: 90,
};

/** 捕获系统读表用（生效帧数对照，回卷上限=AnimateTiles reset 值） */
export const TILE_ANIM_FRAMES: Record<number, number> = {
  // ★2026-08-30 与 AnimateTiles 同批权威化（reset 阈值逐 case；'>N'→N+1 帧）。
  //   病根注记：上一轮审计把「素材风格带总数」当帧数写入（106:5/218:9/220:9/
  //   300:8/301/305/308/660…），帧号滚出纵向带宽后 vframeAt 落空 → 整物回退
  //   (0,0) 平铺第一格（用户实测回退率与错帧行号比精确吻合）。现全部改回
  //   Main.AnimateTiles 权威值，且与本地 PNG 高度逐项互证（needs ≤ height+pitch/2）。
  12  : 10,   // >=10
  17  : 12,
  106 : 2,    // >=2  ★锯木机（素证 png108=2×54；旧 5 → 60% 回退平铺）
  129 : 6,
  133 : 6,
  340 : 4, 341: 4, 342: 4, 343: 4, 344: 4,   // ★BJ118② 活火族 for-loop 钟（Main.cs:19173）
  207 : 6,
  215 : 8,
  217 : 5,
  218 : 2,    // >=2  ★绞肉机
  219 : 10,
  220 : 4,    // >=4  ★固化机（56% 回退平铺根因）
  228 : 3,
  231 : 7,
  235 : 4,
  238 : 4,
  243 : 6,
  244 : 6,
  247 : 8,
  272 : 2,
  300 : 7,    // >6   ★（12.4% 回退根因）
  301 : 8,
  302 : 4,
  303 : 5,
  305 : 12,
  306 : 12,   // >11（金标）
  307 : 2,
  308 : 8,
  326 : 8,
  327 : 8,
  328 : 8,
  329 : 8,
  336 : 4,
  345 : 8,
  351 : 3,
  354 : 8,
  355 : 8,    // = tileFrame[354]
  377 : 4,
  379 : 4,
  390 : 7,
  405 : 8,
  406 : 6,
  410 : 8,
  421 : 4,
  422 : 4,    // --frame<0→3（域 0..3）
  452 : 15,
  453 : 6,
  455 : 6,
  456 : 4,    // ★BJ118②：绘制域 %4×54（:5503-5511;216=4×54 恰满）——旧 6 系 tileFrame
              //   0..239 域的稳态近似,与 %4 消费面不符
  458 : 8,
  459 : 8,
  463 : 6,
  464 : 23,
  480 : 8,
  499 : 8,
  509 : 8,
  565 : 5,
  572 : 4,
  592 : 8,
  593 : 9,    // frame>=9→5 中段回跳特型（索引域含基带偏移）
  594 : 9,
  639 : 10,
  642 : 6,
  657 : 8,
  658 : 10,
  708 : 8,    // >7 ★此前 19 越两带
  720 : 16,
  721 : 32,
  725 : 4,
  739 : 4,
  748 : 8,
  31: 4,   77: 12,   96: 4,   270: 6,   660: 5,   665: 10,   696: 4, };

/** 篝火族（TileDrawing.cs:6124-6133 Campfires 覆盖）：pitch=36（非默认 38！素材帧块
 *  36px 无缝排布——曾按默认 38 导致每帧 +2px 漂移，火焰像胶片滚动）；
 *  frameY≥36 的行（熄灭/灰烬变体）恒取静止帧 252 */
export function campfireYOffset(frameY: number): number {
  // ★原版语义（TileDrawing.cs:6132-6140）:frameY 本身即状态位——
  //   点燃 = 0/18（<36）:addFrY = tileFrame×36（4 帧火动画,y 0-143 带循环）
  //   熄灭 = 36/54（≥36）:addFrY = 252 固定（绘制 y=288/306 熄灭带,静止）
  //   线控 ToggleCampFire = frameY ±36 翻转（Wiring.cs:1003-1020）;
  //   SceneMetrics :380 frameY<36=点燃（篝火增益计数）。
  // 曾 <288 门:熄灭件（36/54）被误判点燃去动画+扫过点燃带=双态动画同放/
  // 上下行错缝（2026-08-25 用户报,存档帧恰为 36/54 熄灭态）。曾 <36 光照门
  // 反而是对的（熄灭本就无光）。
  if (frameY < 36) { const off = frameY + animFrameIdx(215, 144) * 36; tileFrameCapture.yoff('c215', String(frameY), off); return off; }
  tileFrameCapture.yoff('c215', String(frameY), frameY + 252);
  return frameY + 252;
}

/** 喷泉族（TileDrawing.cs:6007-6028 case 207 1:1）：sheet 7 带 = 第 0 带关态整图 +
 *  6 帧开态水流动画带（SwitchFountain WorldGen.cs:51624-51631 frameY±72 切换）。
 *  关态（frameY<72，放置默认）addFrY=0 静止；开态（frameY≥72）
 *  addFrY = ((全局帧 + 左列世界x%6) % 6) × 72 —— 逐喷泉按 x 错相（:6012-6022），
 *  右列归左列判据 frameX%36!==0。由 ChunkCache 预加（相位需世界 x，与 215 同款），
 *  drawVanillaCell 通用 animYOffset 叠加须排除 207 防双加。 */
export function fountainYOffset(frameY: number, x: number, frameX: number): number {
  if (frameY < 72) { tileFrameCapture.yoff('f207', `${frameY}|off`, 0); return frameY; }
  const leftX = frameX % 36 !== 0 ? x - 1 : x;
  const idx = (animFrameIdx(207, 504) + (leftX % 6)) % 6;
  tileFrameCapture.yoff('f207', `fy${frameY}x${x}`, frameY + idx * 72);
  return frameY + idx * 72;
}

/** 烟囱族（TileDrawing.cs:5448-5462 case 406 verbatim）：
 *  num55 = tileFrame[406](6 帧循环)；按存储带折算：
 *    fy≥108 → 6-floor(fy/54)(高样式静态带)、54≤fy<108 → idx-1、fy<54 → idx；
 *  addFrY = num55×56 + floor(fy/54)×2（pitch 56，Tiles_406.png 54×392=7×56 实测）。
 *  露天默认档（fy=18/36，本案）即循环 6 帧烟雾明暗 */
export function chimneyAddFrY(frameY: number): number {
  const idx = animFrameIdx(406, 392);
  let n = idx;
  if (frameY >= 108) n = 6 - Math.floor(frameY / 54);
  else if (frameY >= 54) n = idx - 1;
  const off = n * 56 + Math.floor(frameY / 54) * 2;
  tileFrameCapture.yoff('ch406', String(frameY), off);
  if (off < 0 || off > 392 - 54 + 18) tileFrameCapture.anom('yoff-dup', 406, -1, -1, 0, frameY, `off=${off}`);
  return off;
}

/** 壁炉族（TileDrawing.cs:5514-5529 case 405 verbatim）：addFrY = tileFrame[405]×38
 *  （pitch 38 与篝火/家具火焰族同款——Tiles_405.png 108×306 实测 8×38−2 带）；
 *  ★例外：frameX≥54 的列静止（num37=0，cs:5524-5526 烟囱列门）。返回 addFrY 增量 */
export function fireplaceAddFrY(frameX: number): number {
  if (frameX >= 54) { tileFrameCapture.yoff('fp405', `x${frameX}:s`, 0); return 0; }
  const off = animFrameIdx(405, 306) * 38;
  tileFrameCapture.yoff('fp405', String(frameX), off);
  return off;
}

/** ★根治标记（2026-08-31）：凡此谓词为真的 sheet 一律【不进 chunk 烘焙】，
 *  由 Renderer.drawAnimatedTileLayer 逐帧动态补画。机制=含动画格的 chunk 在
 *  rate 节拍下整块失效重烘（256 格×完整管线），密度放大后即"重烘风暴"（齿轮
 *  272 判例：船区 329 块 ⇒ 20% CPU）。动态层画在整屏世界坐标系，无 chunk 边界
 *  裁剪，顺带消灭动画家具跨 chunk 的陈旧溢出行隐患。范围=TILE_ANIM_RATE 全表
 *  ∪ 笼族 ∪ 矿车轨道 314。 */
export function isDynamicAnimSheet(sheet: number): boolean {
  return TILE_ANIM_RATE[sheet] !== undefined || sheet === 314 || !!cageFamilyOf(sheet);
}

/** 齿轮块 272（TileDrawing.cs:1137-1147 case 272 verbatim）：addFrY =
 *  ((tileFrame[272] + x%2 + y%2 + x%3 + y%3) % 2) × 90 —— 每格按坐标哈希取相位，
 *  相邻格交错选带（素材 234×180=两带各90）。★必须经 cogAddFrY 路由，不能走
 *  通用 animYOffset（会丢坐标相位 ⇒ 全场齿轮同步翻转=用户报"动态漂移"根因）。 */
export function cogAddFrY(x: number, y: number): number {
  const idx = (animFrameIdx(272, 180) + (x % 2) + (y % 2) + (x % 3) + (y % 3)) % 2;
  const off = idx * 90;
  tileFrameCapture.yoff('cog272', `${x},${y}`, off);
  return off;
}

/** ★水晶碎块 129 卧轴位（TileDrawing.cs:4682-4690 case 129 verbatim）：仅大簇
 *  （frameX>=324）有动画——addFrX = ((n + tileFrame[129]) % 6 − n) × 18（n=(fx−324)/18），
 *  源矩形在 324..414 六格横带内轮转；小簇 addFrX=0 静止。纵向 addFrY=0 强清零
 *  （:4687）→ 表 pitch=0 同源，禁走 animYOffset。相位钟 = tileFrame[129]（每 8tick
 *  推进、>=6 回卷，Main.cs:19287-19290）= animFrameIdx(129) 同拍——此前 drawAdjust
 *  用共享 animRot()（tick/6）相位率偏差 33%，本刀一并归正。 */
export function crystalShardAddFrX(fx: number): number {
  if (fx < 324) return 0;
  const n = Math.floor((fx - 324) / 18);
  return (((n + animFrameIdx(129, 144)) % 6) - n) * 18;
}

/** ★BJ118② 火山 593/594 相位钟（Main.cs:19426-19438 verbatim）：counter 每 5tick
 *  推进（counter>=5 → frame++），frame>=9 → 重置 5——即预热期走过 1..8 后恒在
 *  5..8 四相循环（addFrY = 18×v / 36×v，v∈{5,6,7,8}）。k=floor((tick+1)/5) 为
 *  原版计数节奏的精确离散步（第 k 次推进发生在 tick=5k−1）；预热 k≤8 取 k，
 *  之后 5+((k−9) mod 4)。drawAdjust case 593/594 消费（此前 animRot()%8 走
 *  0..7 带=踏进 0..4 样式带=乱帧，且 fx≥18/36 静止支漏接通用纵偏）。 */
export function volcanoFrame59x(tick: number): number {
  const k = Math.floor((tick + 1) / 5);
  return k <= 8 ? k : 5 + ((((k - 9) % 4) + 4) % 4);
}

/** 全局动画时钟（Game 主循环每帧 +1；暂停时冻结） */
export const tileAnim = { tick: 0 };

/** animFrameIdx/animYOffset 共用的 pitch 取值（无动画表项返回 0 表示不适用） */
export function tileAnimPitch(sheet: number): number {
  return TILE_ANIM_PITCH[sheet] ?? 38;
}

/** 该 sheet 当前动画帧索引（无动画表项/单帧返回 0）。
 *  sheetHeightPx = 素材总像素高（rows×18）；帧数 = TILE_ANIM_FRAMES 覆盖
 *  或 floor(sheetHeightPx / pitch) */
export function animFrameIdx(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  const frames = TILE_ANIM_FRAMES[sheet] ?? Math.floor(sheetHeightPx / tileAnimPitch(sheet));
  if (frames <= 1) return 0;
  return Math.floor(tileAnim.tick / rate) % frames;
}

/** 绘制时的 frameY 偏移（= 帧索引 × pitch） */
export function animYOffset(sheet: number, sheetHeightPx: number): number {
  const rate = TILE_ANIM_RATE[sheet];
  if (!rate) return 0;
  return animFrameIdx(sheet, sheetHeightPx) * tileAnimPitch(sheet);
}

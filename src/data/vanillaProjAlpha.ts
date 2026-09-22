/** 原版 Projectile.GetAlpha（Terarria1457/Terraria/Projectile.cs:80595-81522;★S5 基准注
 *  勘误 BJ263 2026-09-22——旧注 1456 :75940-76850 系退役基准,1457 段移后行号漂移;
 *  表数据面已由 BJ228/BJ236 注记覆盖）全量 id 调制表。
 *
 *  语义基准：GetAlpha 返回色 = 绘制乘色（pixel = tex × color/255），A 通道 = 贴图 α 系数。
 *  本仓弹幕无逐格光色（projectileColor 恒白）且无弹幕 glowmask 层（Renderer.ts:5410），
 *  故消费约定：
 *   · RGB 乘子统一折进 globalAlpha（代码库既有约定：缺省路径 RGB×(1−α/255) → ga=(1−α/255)）；
 *   · Lerp(newColor,White,k) 白化用 ctx.filter brightness/saturate 近似（复用 drawXenoFilter 模式；
 *     亮处略过亮/暗处对齐——原版亮处 newColor=White 时 Lerp 恒等，暗处才提亮）；
 *   · 固定色 rgb 为灰阶 → brightness(r/255)；彩色固定色只做亮度近似（色相偏移未建模，见 note）；
 *   · kind=afade 的 inv 旗 = rgb 与 A 双重 (1−α/255) 衰减折算。
 *
 *  kind 消费语义（Arrow.drawTableAlpha）：
 *   invisible     ga=0（Color.Transparent=(0,0,0,0) 真零档——现全部 off 登记；A=0 加算白族
 *                 勿按本 kind 语义读,见下注与 5/92/91/83 族接线定谳）
 *   fade          ga=(1−α/255)×(mul??1)；bright → 另加 brightness 滤镜
 *   fade2         ga=(1−α/255)²×(mul??1)（White×Opacity 后落缺省的双重衰减）
 *   fixed         ga=rgba.a/255×(mul??1)
 *   fixedfade     ga=rgba.a/255×(1−α/255)×(mul??1)
 *   afade         ga=max(0,(rgba.a−α×(slope??1)))/255×(mul??1)×(inv? (1−α/255):1)；tail=寿命尾门
 *   lerp          ga=(1−α/255)×(mul??1) + lerpWhite(k) 滤镜
 *   lerpkeep      ga=(mul??1) + lerpWhite(k) 滤镜（A 保留）
 *   lerpblack     ga=1 + brightness(1−k)（压暗）
 *   lerpcolor     ga=(1−α/255) + 固定色亮度近似滤镜
 *   lerpalphain   ga=(α/255)×(mul??1) + lerpWhite(k) 滤镜
 *   alpha0        ga=α===0? rgba.a/255 : 0
 *   alpha0additive ga=α===0? 1 : 0（A=0 满强加算白,:81286 265/355 族——须配
 *                 Arrow ADDITIVE_GLOW_PROJS 'lighter' 合成;α>0 期=Color.Transparent 全隐,
 *                 可见面=AI 毒尘,「渐显 ramp」是错译）
 *   alphaLt       ga=α<lt? rgba.a/255 : 0
 *   alpha255hide  ga=α>=255? 0 : 1
 *   random        ga=α>0? 0 : 200/255（随机 rgb 近似白）
 *   disco         ga=70/255（Disco 色相循环=载体类直读 FlickerClock 同源钟,1089 已 1:1
 *                 接线 GlowstickProj——★BJ236 2026-09-21;Arrow 侧档=dormant 防御）
 *   pulse40       ga=((life%40)+40)%40/40（白脉冲）
 *   life          ga=min(1,life/255)
 *   life2         ga=(100/255)×min(1,3·life/255)
 *
 *  off=1 = skip（登记不消费）：现有 drawGlobalAlpha/drawXenoFilter/专属旗优先（id 集不相交原则）、
 *  专属实体类（MinionProj/WeaponProj/Dart/MissileProj/WhipProj/LunarNebula/Celeb2/GolfBall/
 *  PortalGunBolt/SkyDragonFury/XenoBubbleProj/SquidCloud…）消费、门控字段未跟踪（localAI/mouseTextColor/
 *  frame/portal color）。
 *  ★T5 勘误（2026-09-02,全表 SKIP 注批改）：旧注"A=0 隐形档（视觉载体=AI 尘/粒,防整弹消失,
 *  同 5 小丑箭 PROJ_ALPHA0 登记先例）"系错案——5 已反转（R1/M-4 定谳:A=0 且 rgb>0 = XNA 预乘
 *  纯加算白,GA 值+'lighter' 承接,非隐形;92/91/83 族/131/631 同式已接线实证）。本表 A=0 档两类：
 *  ①rgb>0 加算白/灰/彩色（未接线 off 项=登记残留,承接式见各条注）;②Color.Transparent=(0,0,0,0)
 *  真零（隐形结论本就成立,但不得再引 5 作先例）。数据面零改动,本批只勘误注释。
 *
 *  生成：解析 :75940 方法体全部分支（源码条件提及 307 个 id，首中即返序；default 7 id/死支 16 id 不进表），表 300 项。
 *
 *  ★登记债（BJ236,2026-09-21,只登记不落）：aiStyle==1 凤凰/炽天使 charm 分流全表普查
 *  ——:80605-80615 `if (aiStyle==1 && (PhoenixQuivered||SeraphNecklaced)) return
 *  White*Opacity` 先于绝大多数 id 专属支截走 = 该 gate 下全部 aiStyle1 弹的有效
 *  GetAlpha 均为 White×Opacity（ga=(255−α)/255 常规合成）。已按弹分流的先例：
 *  5/91/265/355（drawGlobalAlpha/drawTableAlpha charm 分流 + ADDITIVE_GLOW 消费侧
 *  出组）。余下 aiStyle1 弹（箭族 1/2/3/4/41/82/…、charm 可达性=harpyCharm 消费域）
 *  是否逐 id 补 charm 分流未普查——命中 charm 态直接走 5/91 式分流即原版,登记低优先。 */
export interface ProjAlphaMod {
  kind: 'invisible' | 'fade' | 'fade2' | 'fixed' | 'fixedfade' | 'afade' | 'lerp' | 'lerpkeep'
    | 'lerpblack' | 'lerpcolor' | 'lerpalphain' | 'alpha0' | 'alpha0additive' | 'alphaLt'
    | 'alpha255hide' | 'random' | 'disco' | 'pulse40' | 'life' | 'life2';
  /** lerp 族白化系数 / alphaLt 阈值复用 */
  k?: number;
  /** 固定色 [r,g,b,a]（afade 的 a=a0 基值） */
  rgba?: readonly [number, number, number, number];
  /** 额外乘子（Opacity/A 通道比例） */
  mul?: number;
  /** afade：A = a0 − α×slope（slope=−1 → A=α） */
  slope?: number;
  /** afade：rgb 侧另有 (1−α/255) 衰减（白剪影族），折进 ga */
  inv?: 1;
  /** afade：寿命尾门（life<tail → α=255−255·life/tail） */
  tail?: number;
  /** fade：rgb×bright 后落缺省（650 ×1.5） */
  bright?: number;
  /** alphaLt：α 阈值 */
  lt?: number;
  /** skip 旗：登记不消费（原因见 by/note） */
  off?: 1;
  /** 语义/登记注（off 时含 SKIP 原因） */
  note?: string;
}

export const PROJ_ALPHA_MOD: Record<number, ProjAlphaMod> = {
  5: { kind: 'invisible', off: 1 },    // :76569 | 恒 (255,255,255,0) 纯加算白（XNA 预乘；1457 锚 :81240-81242），GA case 5 return 1+lighter 承接；charm 态走 :80609 White×Opacity 分支（★M-4 勘误 2026-09-02）
  9: { kind: 'invisible', off: 1 },    // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  12: { kind: 'fade' },   // :76823 | (255,255,255,newColor.A−α) 白色 A=255−α
  15: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },   // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  16: { kind: 'invisible', off: 1 },   // :76535 | (255,255,255,0) A=0 隐形；SKIP: MissileProj 专属类消费
  18: { kind: 'fixed', rgba: [255,255,255,130] },   // :76813 | (255,255,255,130) 恒
  20: { kind: 'invisible', off: 1 },   // α≤150→(255,255,255,0) A=0 加算白 / α>150→(0,0,0,0) 真零——前支非隐形;★BJ228 已接线（2026-09-21）:GA case 20 return 1+'lighter'（SetDefaults α≡0 恒走前支=恒满强）,本 off 档转存档;勿再按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）
  34: { kind: 'fixedfade', rgba: [255,255,255,255], off: 1 },   // :76082 | White*Opacity；SKIP: MissileProj 专属类消费
  47: { kind: 'fade', off: 1 },   // :75950 | gate Main.player[owner].wet→Color.White 未建模（湿身白化登记忽略）；非湿落缺省 fade；SKIP: 门控条件未建模（登记忽略）。★白光约定零观感差钉死（BJ236 复核 2026-09-21）：SetDefaults（:1305-1310）无 alpha 行 α≡0 → 湿支 White ≡ 缺省路径 (255−0)/255×白（本仓光色恒白）=两支逐像素等值,勿"补齐"湿门——补了也是同值死码
  50: { kind: 'invisible', off: 1 },   // :76312 | (255,255,255,0) A=0 隐形；SKIP: WeaponProj 专属类消费
  53: { kind: 'invisible', off: 1 },   // :76312 | (255,255,255,0) A=0 隐形；SKIP: WeaponProj 专属类消费
  72: { kind: 'fade' },   // :76823 | (255,255,255,newColor.A−α) 白色 A=255−α
  75: { kind: 'lerp', k: 0.66 },   // :76017 | Lerp(White,0.66)*Opacity
  76: { kind: 'invisible', off: 1 },   // (255,255,255,0) A=0 纯加算白（XNA 预乘 dst+=tex.rgb 满强）;SKIP→正确承接=GA 恒 1+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;★BJ228 已接线（2026-09-21）:GA case 76/77/78 return 1+'lighter'（常量支不读 α,SetDefaults α=100 死值）,本 off 档转存档
  77: { kind: 'invisible', off: 1 },   // (255,255,255,0) A=0 纯加算白（XNA 预乘 dst+=tex.rgb 满强）;SKIP→正确承接=GA 恒 1+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;★BJ228 已接线（2026-09-21）:GA case 76/77/78 return 1+'lighter'（常量支不读 α,SetDefaults α=100 死值）,本 off 档转存档
  78: { kind: 'invisible', off: 1 },   // (255,255,255,0) A=0 纯加算白（XNA 预乘 dst+=tex.rgb 满强）;SKIP→正确承接=GA 恒 1+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;★BJ228 已接线（2026-09-21）:GA case 76/77/78 return 1+'lighter'（常量支不读 α,SetDefaults α=100 死值）,本 off 档转存档
  79: { kind: 'invisible', off: 1 },   // :76798 | r/g/b=Disco 后 return default(Color)=(0,0,0,0) 隐形；SKIP: MissileProj 专属类消费
  83: { kind: 'invisible', off: 1 },   // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  86: { kind: 'fade' },   // :76823 | (255,255,255,newColor.A−α) 白色 A=255−α
  87: { kind: 'fade' },   // :76823 | (255,255,255,newColor.A−α) 白色 A=255−α
  88: { kind: 'invisible', off: 1 },   // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  89: { kind: 'invisible', off: 1 },   // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  90: { kind: 'invisible', off: 1 },   // :76786 | α<200→(255−α,…,0) / α≥200→Transparent——两支皆隐形；SKIP: SquidCloud 专属类消费
  91: { kind: 'invisible', off: 1 },   // (200,200,200,0) A=0 加算灰（tex×200/255）;已接线（★T1 2026-09-02）:GA case 91 200/255 + ADDITIVE_GLOW_PROJS 'lighter'（出生面=圣箭 516）;'5 小丑箭'隐形先例已反转,勿按隐形登记
  92: { kind: 'fade', off: 1 },   // :76328 | 恒 (255,255,255,0) 纯加算白星体（1457 锚 :80999-81001），GA return 1+lighter+gore 面已接（★R1 反转批；★M-4 勘误 2026-09-02）
  93: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },   // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  94: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },   // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha (200,200,200,25)→200/255 近加算档
  95: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },   // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 同 94
  96: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },   // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  100: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  102: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },  // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  104: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  114: { kind: 'fade', off: 1 },  // :76773 | gate localAI[1] ramp（同 116 族）——★BJ228 已接线（2026-09-21）:GA case 114 重写为 :81445 专属支模型（localAI[1] 梯×α/255,翻案 R7-6 反向曲线）,本 off 档转存档（★BJ228 事故补回：截断恢复快照缺本项,按会话首读快照重放）
  115: { kind: 'fade', off: 1 },  // :76773 | gate localAI[1] ramp（同 116 族）——115 登记忽略；SKIP: 门控条件未建模（登记忽略）
  116: { kind: 'fade', off: 1 },  // :76593 | gate localAI[1]：<5→Transparent /5..15 线性 ramp /≥15→(255,255,255,α)——★BJ236 已接线（2026-09-21）:GA case 116/132/156/157/173 重写为 :81264 专属支模型（gem114Ramp 族梯×脉动 α,剑气 114 同配方;绘制段无 ×(1−Opacity) 乘区→≥15 段 ga=α/255 脉动直通）,AI 侧 subStepAI 剑气支建梯,本 off 档转存档
  130: { kind: 'fixed', rgba: [255,255,255,175] },  // :76714 | (255,255,255,175) 恒
  131: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;已接线（★2026-09-01 审计批）:GA case 131 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter'（真值起步 α≡0=恒满强）;'5 小丑箭'先例已反转,勿按隐形登记
  132: { kind: 'fade', off: 1 },  // :76593 | gate localAI[1]：<5→Transparent /5..15 线性 ramp /≥15→(255,255,255,α)——★BJ236 已接线（2026-09-21）:同 116（剑气族 GA case+AI 梯）,本 off 档转存档
  150: { kind: 'fade' },  // :76639 | r=g=b=255−α a=255−α
  151: { kind: 'fade' },  // :76639 | r=g=b=255−α a=255−α
  152: { kind: 'fade' },  // :76639 | r=g=b=255−α a=255−α
  156: { kind: 'fade', off: 1 },  // :76593 | gate localAI[1]：<5→Transparent /5..15 线性 ramp /≥15→(255,255,255,α)——★BJ236 已接线（2026-09-21）:同 116（剑气族 GA case+AI 梯）,本 off 档转存档
  157: { kind: 'fade', off: 1 },  // :76593 | gate localAI[1]：<5→Transparent /5..15 线性 ramp /≥15→(255,255,255,α)——★BJ236 已接线（2026-09-21）:同 116;157 无发射面（1.4.5 已无武器射出）=防御档+普查承载面
  173: { kind: 'fade', off: 1 },  // :76593 | gate localAI[1]：<5→Transparent /5..15 线性 ramp /≥15→(255,255,255,α)——★BJ236 已接线（2026-09-21）:同 116（剑气族 GA case+AI 梯;出生面=附魔剑 989）,本 off 档转存档
  180: { kind: 'lerp', k: 0.75 },  // :76063 | Lerp(White,0.75)
  182: { kind: 'fixed', rgba: [255,255,255,200], off: 1 },  // :76718 | (255,255,255,200) 恒；SKIP: WeaponProj 专属类消费
  207: { kind: 'fade', off: 1 },  // :76682 | r=g=b=255−α 后落缺省（双重衰减）——现有缺省路径档保留；SKIP: drawGlobalAlpha 缺省路径档
  209: { kind: 'fade', off: 1 },  // :76706 | r=R−α/g=G−α/b=B−α/2 后落缺省——Dart 消费 skip；SKIP: Dart 专属类消费
  211: { kind: 'invisible', off: 1 },  // (255,255,255,0) A=0 纯加算白（XNA 预乘 dst+=tex.rgb 满强）;SKIP→正确承接=GA 恒 1+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;★BJ236 已接线（2026-09-21）:载体=PetFollower（Wisp 瓶 1183 光宠,projPet 型非 Arrow 域）draw 本体支 'lighter'+ga=1（GetAlpha :81329-81332 恒值不读 α,SetDefaults α≡0）,本 off 档转存档
  221: { kind: 'fixed', rgba: [255,255,255,200] },  // :76666 | (255,255,255,200) 恒
  226: { kind: 'fixed', rgba: [255,255,255,200], off: 1 },  // :76722 | gate Main.mouseTextColor 脉冲亮度（r=g=b=255·num9+50）本仓未建模登记忽略；SKIP: 门控条件未建模（登记忽略）
  227: { kind: 'fade', off: 1 },  // :76748 | gate Main.mouseTextColor（a=100·num10 脉冲）本仓未建模登记忽略；SKIP: 门控条件未建模（登记忽略）
  229: { kind: 'fixed', rgba: [255,255,255,50], off: 1 },  // :81333 | (255,255,255,50) 恒；SKIP: Main.cs:28340-28343 DrawProjDirect `type==229 return` 整弹不画=GetAlpha 死值——弹面归零走 Arrow drawGlobalAlpha case 229 return 0（★R2 2026-09-02；旧锚 :76662 系 Kill 段错行；本仓无 229 出生面=dormant 台账）
  242: { kind: 'alphaLt', rgba: [255,255,255,100], lt: 140 },  // :76690 | α<140→(255,255,255,100) else Transparent
  250: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  251: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  253: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },  // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  254: { kind: 'invisible', off: 1 },  // timeLeft<30 门后 (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+寿命门+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;★BJ236 已接线（2026-09-21）:GA case 254 min(1,life/30)（强度代数化简=(255−α)/255,α 写面仅在 GetAlpha 门内 ≡0）+ ADDITIVE_GLOW_PROJS 入组,出生面=磁球 1266 magic 通用 Arrow,本 off 档转存档
  257: { kind: 'invisible', off: 1 },  // α>200→Transparent 真零 / else (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  258: { kind: 'fixed', rgba: [200,200,200,25], off: 1 },  // :76336 | (200,200,200,25) 恒（102 另 gate α<255，α=255 落缺省≈0 未建模）；SKIP: drawGlobalAlpha 94/95 同族 (200,200,200,25)→200/255 近加算先例（缺光晕/尘载体，25/255 直译近隐形）
  259: { kind: 'invisible', off: 1 },  // α>200→Transparent 真零 / else (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  263: { kind: 'life' },  // :76551 | timeLeft<255→(255,255,255,timeLeft) else 全白（life 淡入）
  265: { kind: 'alpha0additive' },  // :81286-81293（1457）| α>0→Transparent 全隐（fade 期可见面=AI d163 毒泡）/ α==0→(255,255,255,0) A=0 满强加算白——已接线（★2026-09-02 遗留批）:GA alpha0additive 档 + ADDITIVE_GLOW_PROJS 'lighter';旧 off 残留解除（M-4 反转先例=5 小丑箭）
  270: { kind: 'pulse40' },  // :76051 | White A=WrappedLerp(0,255,(timeLeft%40)/40) 40t 锯齿脉冲
  274: { kind: 'life2' },  // :76559 | timeLeft<85→(tL·3 灰, 100·tL·3/255) else (255,255,255,100)
  279: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  283: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  284: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  285: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  286: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  287: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  300: { kind: 'fixed', rgba: [250,250,250,50] },  // :76573 | (250,250,250,50) 恒
  301: { kind: 'fixed', rgba: [250,250,250,50], off: 1 },  // :76577 | gate ai[0]==1→newColor 直通（WeaponProj 消费 skip）；SKIP: WeaponProj 专属类消费
  304: { kind: 'afade', rgba: [255,255,255,85], slope: 0.3333, inv: 1 },  // :76589 | (255−α,255−α,255−α,(255−α)/3)
  308: { kind: 'fixed', rgba: [200,200,255,125] },  // :76547 | (200,200,255,125) 恒
  321: { kind: 'invisible', off: 1 },  // (200,200,200,0) A=0 加算灰（tex×200/255,同 91）;SKIP→正确承接=GA 200/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  324: { kind: 'fade', off: 1 },  // :76531 | gate frame∈[6,9]→White（帧门登记忽略）；else 落缺省 fade；SKIP: 门控条件未建模（登记忽略）
  325: { kind: 'lerp', k: 0.75 },  // :76119 | Lerp(White,0.75)
  326: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  327: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  328: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  329: { kind: 'fixed', rgba: [200,200,200,50] },  // :76519 | (200,200,200,50) 恒
  332: { kind: 'fixed', rgba: [255,255,255,255] },  // :76515 | (255,255,255,255) 恒
  337: { kind: 'fixed', rgba: [250,250,250,150] },  // :76485 | (250,250,250,150) 恒
  342: { kind: 'lerp', k: 0.75 },  // :76151 | Lerp(White,0.75)*Opacity
  343: { kind: 'fixedfade', rgba: [250,250,250,100] },  // :76510 | (250·num6,…,100·num6) num6=1−α/255
  344: { kind: 'fixedfade', rgba: [250,250,250,100] },  // :76510 | (250·num6,…,100·num6) num6=1−α/255
  345: { kind: 'lerp', k: 0.75 },  // :76063 | Lerp(White,0.75)
  346: { kind: 'lerp', k: 0.75 },  // :76119 | Lerp(White,0.75)
  347: { kind: 'lerp', k: 0.75 },  // :76119 | Lerp(White,0.75)
  348: { kind: 'afade', rgba: [200,200,200,0], slope: -1 },  // :76481 | (200,200,200,α) A=α（α 越大越显）
  349: { kind: 'afade', rgba: [200,200,200,0], slope: -1 },  // :76481 | (200,200,200,α) A=α（α 越大越显）
  350: { kind: 'lerp', k: 0.15, off: 1 },  // :76110 | gate WorldGen.SolidTile：实心→Lerp(0.05)/悬空→0.15（按悬空档，实心门登记忽略）；SKIP: 门控条件未建模（登记忽略）
  351: { kind: 'lerp', k: 0.15, off: 1 },  // :76110 | gate WorldGen.SolidTile：实心→Lerp(0.05)/悬空→0.15（按悬空档，实心门登记忽略）；SKIP: present 专属档（礼盒淡入覆盖 globalAlpha）
  352: { kind: 'lerpalphain', k: 0.5 },  // :76456 | Lerp(White,0.5) A×(α/255)（α 越大越显）
  355: { kind: 'alpha0additive' },  // :81286-81293（1457）| α>0→Transparent 全隐（fade 期可见面=AI d205 毒泡）/ α==0→(255,255,255,0) A=0 满强加算白——已接线（★2026-09-02 遗留批）:GA alpha0additive 档 + ADDITIVE_GLOW_PROJS 'lighter';旧 off 残留解除（M-4 反转先例=5 小丑箭）
  400: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  401: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  402: { kind: 'invisible', off: 1 },  // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  409: { kind: 'fixed', rgba: [250,250,250,200] },  // :76477 | (250,250,250,200) 恒
  431: { kind: 'afade', rgba: [250,250,250,250], slope: 1 },  // :76506 | (250,250,250,255−α)
  432: { kind: 'afade', rgba: [250,250,250,250], slope: 1 },  // :76506 | (250,250,250,255−α)
  435: { kind: 'lerp', k: 0.8, mul: 0.098, off: 1 },  // :76462 | Lerp(White,0.8) 后 (r,g,b,25)；SKIP: XenoBubbleProj 专属类消费
  436: { kind: 'lerp', k: 0.8, mul: 0.098, off: 1 },  // :76472 | Lerp(White,0.8) 后 (r,g,b,25)——XenoBubbleProj 消费 skip；SKIP: XenoBubbleProj 专属类消费
  437: { kind: 'invisible', off: 1 },  // :76444 | (255,255,255,0)×(1−α/255) A=0 隐形；SKIP: XenoBubbleProj 专属类消费
  438: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76436 | (255,255,255,128)×(1−α/255)
  440: { kind: 'fade', off: 1 },  // :76416 | r=g=b=255−α 后落缺省（双重衰减）——现有档保留；SKIP: drawGlobalAlpha Xeno 族 r=g=b=255−α
  443: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76428 | (255,255,255,128)×(1−α/255)
  444: { kind: 'fade' },  // :76424 | newColor×(1−α/255)（保色淡入）
  445: { kind: 'fixedfade', rgba: [255,255,255,128], off: 1 },  // :76412 | (255,255,255,128)×(1−α/255)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 (255,255,255,128)×fade
  446: { kind: 'lerp', k: 0.8, off: 1 },  // :76400 | Lerp(White,0.8)×(1−α/255)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 Lerp(白,0.8)×fade
  447: { kind: 'fixed', rgba: [255,255,255,200], off: 1 },  // :76396 | (255,255,255,200) 恒——现有档保留；SKIP: drawGlobalAlpha Xeno 族 (255,255,255,200)
  449: { kind: 'fade', off: 1 },  // :76416 | r=g=b=255−α 后落缺省（双重衰减）——现有档保留；SKIP: drawGlobalAlpha Xeno 族 同 440
  450: { kind: 'fixed', rgba: [200,200,200,255], off: 1 },  // :76388 | (200,200,200,255−α)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 (200,200,200,255−α)
  451: { kind: 'fixedfade', rgba: [255,255,255,200], off: 1 },  // :76372 | (255,255,255,200)×((255−α)/255)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 白×((255−α)/255)
  452: { kind: 'fade', off: 1 },  // :76380 | (255,255,255,255)×(1−α/255)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 白×(1−α/255)
  454: { kind: 'fade', off: 1 },  // :76380 | (255,255,255,255)×(1−α/255)——现有档保留；SKIP: drawGlobalAlpha Xeno 族 同 452
  459: { kind: 'fixed', rgba: [255,255,255,200] },  // :76392 | (255,255,255,200) 恒
  462: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76452 | (255,255,255,128)×(1−α/255)
  464: { kind: 'fade' },  // :76384 | (255,255,255,255)×((255−α)/255)
  465: { kind: 'invisible', off: 1 },  // (255,255,255,0)×(1−α/255) A=0 加算白×(1−α/255)——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  467: { kind: 'fade' },  // :76351 | (255,255,255,255)×(1−α/255)
  473: { kind: 'fixed', rgba: [255,255,255,255], off: 1 },  // :76308 | (255,255,255,255) 恒；SKIP: WeaponProj 专属类消费
  477: { kind: 'alpha0', rgba: [255,255,255,200], off: 1 },  // :76300 | α==0→(255,255,255,200) else (0,0,0,0)；SKIP: drawGlobalAlpha alpha==0 档
  478: { kind: 'alpha0', rgba: [255,255,255,200], off: 1 },  // :76300 | α==0→(255,255,255,200) else (0,0,0,0)；SKIP: drawGlobalAlpha alpha==0 档
  479: { kind: 'alpha0', rgba: [255,255,255,200] },  // :76300 | α==0→(255,255,255,200) else (0,0,0,0)
  485: { kind: 'fixed', rgba: [255,255,255,200] },  // :76292 | (255,255,255,200) 恒
  488: { kind: 'fixed', rgba: [255,255,255,255] },  // :76296 | (255,255,255,255) 恒
  490: { kind: 'fixed', rgba: [255,255,255,255] },  // :76228 | Color.White
  491: { kind: 'fixed', rgba: [255,255,255,255] },  // :76288 | (255,255,255,255) 恒
  492: { kind: 'fixed', rgba: [255,255,255,255] },  // :76284 | (255,255,255,255) 恒
  493: { kind: 'fade' },  // :76280 | r=g=b=255−α a=255−α
  494: { kind: 'fade', off: 1 },  // :76280 | r=g=b=255−α a=255−α；SKIP: GolfBall 专属类消费
  498: { kind: 'fixed', rgba: [255,100,20,200] },  // :76253 | (255,100,20,200) 恒（彩色 tint 近似=亮度）
  502: { kind: 'fixed', rgba: [255,255,255,200] },  // :76292 | (255,255,255,200) 恒
  503: { kind: 'lerp', k: 0.5, off: 1 },  // :76344 | Lerp(White,0.5)×fade + 紫 cos(localAI[0]) 调制——starY 专属档 skip；SKIP: starY 专属档（星怒剑自绘 alpha，早退于消费点）
  515: { kind: 'invisible', off: 1 },  // (255,255,255,0) A=0 纯加算白（XNA 预乘 dst+=tex.rgb 满强）;SKIP→正确承接=GA 恒 1+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  518: { kind: 'fixedfade', rgba: [200,200,200,100] },  // :76261 | (200,200,200,100)×(1−α/255)
  536: { kind: 'afade', rgba: [255,255,255,63], slope: 0.25, inv: 1 },  // :76272 | (255−α,255−α,255−α,63−α/4)
  538: { kind: 'fade' },  // :76257 | r=g=b=255−α a=255−α
  540: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  546: { kind: 'fixed', rgba: [255,200,255,200], off: 1 },  // :76241 | (255,200,255,200) 恒（彩色 tint 近似=亮度）；SKIP: WeaponProj 专属类消费
  553: { kind: 'fixed', rgba: [255,255,200,200] },  // :76245 | (255,255,200,200) 恒
  554: { kind: 'fixed', rgba: [200,200,200,200], off: 1 },  // :76195 | (200,200,200,200) 恒；SKIP: WeaponProj 专属类消费
  567: { kind: 'fade' },  // :76191 | r=g=b=255−α a=255−α
  568: { kind: 'fade' },  // :76191 | r=g=b=255−α a=255−α
  573: { kind: 'fade', off: 1 },  // :76224 | r=g=b=255−α a=255−α；SKIP: Dart 专属类消费
  575: { kind: 'afade', rgba: [255,255,255,128], slope: 0.5, inv: 1, tail: 30 },  // :76232 | timeLeft<30 门：α=255−255·tL/30 后 (255−α,…,128−α/2)（本仓 life 可消费）
  578: { kind: 'fade' },  // :76224 | r=g=b=255−α a=255−α
  579: { kind: 'fade' },  // :76224 | r=g=b=255−α a=255−α
  585: { kind: 'lerpkeep', k: 0.5 },  // :76209 | Lerp(White,0.5) A 保留（不随 α 衰减）
  586: { kind: 'lerp', k: 0.75 },  // :76067 | ai[2]==1 另有 sin 变色档（:76069-76077）未建模，按 else 档 Lerp(0.75)
  591: { kind: 'afade', rgba: [255,255,255,63], slope: 0.25, inv: 1 },  // :76276 | (255−α,255−α,255−α,63−α/4)
  592: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76440 | (255,255,255,128)×(1−α/255)
  595: { kind: 'lerp', k: 0.85, mul: 0.502 },  // :76266 | Lerp(White,0.85) A=128 ×(1−α/255)
  596: { kind: 'afade', rgba: [255,255,255,128], slope: 0.5, inv: 1, tail: 30 },  // :76232 | timeLeft<30 门：α=255−255·tL/30 后 (255−α,…,128−α/2)（本仓 life 可消费）
  601: { kind: 'fade', off: 1 },  // :76199 | PortalHelper.GetPortalColor(owner,ai[0])——PortalGunBolt 消费 skip；SKIP: PortalGunBolt 专属类消费
  602: { kind: 'fade', off: 1 },  // :76203 | GetPortalColor(ai[1]) A=227——本仓无 602 消费方（传送门放置弹未实装）登记忽略；SKIP: 门控条件未建模（登记忽略）
  603: { kind: 'fixed', rgba: [255,255,255,200], off: 1 },  // :76163 | (255,255,255,200) 恒；SKIP: WeaponProj 专属类消费
  604: { kind: 'invisible', off: 1 },  // :76147 | (255−α,255−α,255−α,0) A=0 隐形（604 现有 fade 档保留）；SKIP: drawGlobalAlpha aiStyle115 淡出档
  606: { kind: 'fade', off: 1 },  // :76416 | r=g=b=255−α 后落缺省（双重衰减）——现有档保留；SKIP: drawGlobalAlpha Xeno 族 同 440
  607: { kind: 'afade', rgba: [255,255,255,63], slope: 0.25, inv: 1 },  // :76272 | (255−α,255−α,255−α,63−α/4)
  611: { kind: 'fixed', rgba: [255,255,255,200] },  // :76175 | (255,255,255,200) 恒
  612: { kind: 'fixed', rgba: [255,255,255,127] },  // :76183 | (255,255,255,127) 恒
  617: { kind: 'fade' },  // :76224 | r=g=b=255−α a=255−α
  623: { kind: 'fade', off: 1 },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）；SKIP: MinionProj 专属类消费
  625: { kind: 'fade', off: 1 },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）；SKIP: MinionProj 专属类消费
  626: { kind: 'fade', off: 1 },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）；SKIP: MinionProj 专属类消费
  627: { kind: 'fade', off: 1 },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）；SKIP: MinionProj 专属类消费
  628: { kind: 'fade', off: 1 },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）；SKIP: MinionProj 专属类消费
  631: { kind: 'invisible', off: 1 },  // :76147 | 恒 (255−a,…,A=0) 加算白箭体渐显（1457 锚 :80818-80821），AI −15/子步（同 LASER_FADE15 式,subStepAI 631 支承接），ADDITIVE_GLOW lighter（★F5 定罪；★M-4 勘误 2026-09-02）
  633: { kind: 'fixed', rgba: [255,255,255,200] },  // :76163 | (255,255,255,200) 恒
  634: { kind: 'fixedfade', rgba: [255,255,255,127], off: 1 },  // :76359 | (255,255,255,127)*Opacity——LunarNebula 消费 skip；SKIP: LunarNebula 专属类消费
  635: { kind: 'fixedfade', rgba: [255,255,255,127], off: 1 },  // :76359 | (255,255,255,127)*Opacity——LunarNebula 消费 skip；SKIP: LunarNebula 专属类消费
  636: { kind: 'afade', rgba: [255,255,255,64], slope: 0.25, inv: 1 },  // :76155 | (255−α,255−α,255−α,64−α/4)
  638: { kind: 'fixedfade', rgba: [255,255,255,100] },  // :76698 | (255,255,255,100)*Opacity
  640: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  641: { kind: 'fade' },  // :76224 | r=g=b=255−α a=255−α
  643: { kind: 'afade', rgba: [255,255,255,127], slope: 0.5, inv: 1 },  // :76171 | (255−α,255−α,255−α,127−α/2)
  644: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  645: { kind: 'afade', rgba: [255,255,255,127], slope: 0.5, inv: 1 },  // :76171 | (255−α,255−α,255−α,127−α/2)
  646: { kind: 'lerp', k: 0.8 },  // :76408 | Lerp(White,0.8)×(1−α/255)
  647: { kind: 'lerp', k: 0.8 },  // :76408 | Lerp(White,0.8)×(1−α/255)
  648: { kind: 'lerp', k: 0.8 },  // :76408 | Lerp(White,0.8)×(1−α/255)
  649: { kind: 'lerp', k: 0.8 },  // :76408 | Lerp(White,0.8)×(1−α/255)
  650: { kind: 'fade', bright: 1.5 },  // :76123 | rgb×1.5 钳 255 后落缺省 fade
  658: { kind: 'invisible', off: 1 },  // (255−α,255−α,255−α,0) A=0 加算白渐显——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  659: { kind: 'afade', rgba: [255,255,255,128], slope: 0.5, inv: 1, tail: 30 },  // :76232 | timeLeft<30 门：α=255−255·tL/30 后 (255−α,…,128−α/2)（本仓 life 可消费）
  660: { kind: 'alpha0additive' },  // :81373 | (150,255,255,0)*Opacity（Opacity=1−α/255 :542-552）A=0 彩色加算青白——SetDefaults α=255 出生首拍 Opacity=0 全隐,AI 首子步白闪门 α→0（:56653）后恒满强 → alpha0additive（GA α==0?1:0）+ ADDITIVE_GLOW_PROJS 'lighter' 承接（2026-09-17 接线,off 登记残留清偿）;彩色色相未建模=亮度近似债（表头注约定）;charm 态 :80605 White*Opacity 截走=drawTableAlpha case 内建分流
  664: { kind: 'lerp', k: 0.5, mul: 0.7843 },  // :76367 | Lerp(White,0.5) 后 (r,g,b,200)*Opacity
  666: { kind: 'lerp', k: 0.5, mul: 0.7843 },  // :76367 | Lerp(White,0.5) 后 (r,g,b,200)*Opacity
  668: { kind: 'lerp', k: 0.5, mul: 0.7843 },  // :76367 | Lerp(White,0.5) 后 (r,g,b,200)*Opacity
  671: { kind: 'fade' },  // :76363 | (255,255,255,255)*Opacity
  673: { kind: 'afade', rgba: [255,255,255,180], slope: 0.75, inv: 1 },  // :76159 | (255−α,255−α,255−α,180−α/2−α/4)
  675: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76428 | (255,255,255,128)×(1−α/255)
  676: { kind: 'fade' },  // :76432 | newColor*Opacity（保色淡入）
  682: { kind: 'lerp', k: 0.8, mul: 0.498 },  // :76467 | Lerp(White,0.8) 后 (r,g,b,127)
  684: { kind: 'fixedfade', rgba: [255,255,255,200], off: 1 },  // :76376 | 同 451——现有档保留；SKIP: drawGlobalAlpha Xeno 族 同 451
  686: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76428 | (255,255,255,128)×(1−α/255)
  691: { kind: 'lerp', k: 0.4 },  // :76404 | Lerp(White,0.4)×(1−α/255)
  692: { kind: 'lerp', k: 0.4 },  // :76404 | Lerp(White,0.4)×(1−α/255)
  693: { kind: 'lerp', k: 0.4 },  // :76404 | Lerp(White,0.4)×(1−α/255)
  694: { kind: 'fixedfade', rgba: [255,255,255,127] },  // :76355 | (255,255,255,127)×(1−α/255)
  695: { kind: 'fixedfade', rgba: [255,255,255,127] },  // :76355 | (255,255,255,127)×(1−α/255)
  696: { kind: 'fixedfade', rgba: [255,255,255,127] },  // :76355 | (255,255,255,127)×(1−α/255)
  700: { kind: 'invisible', off: 1 },  // (255,255,255,0)×(1−α/255) A=0 加算白×(1−α/255)——非隐形;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  706: { kind: 'afade', rgba: [255,255,255,180], slope: 0.75, inv: 1 },  // :76159 | (255−α,255−α,255−α,180−α/2−α/4)
  707: { kind: 'fade', off: 1 },  // :76224 | r=g=b=255−α a=255−α；SKIP: SkyDragonFury 专属类消费
  709: { kind: 'fixed', rgba: [255,255,255,200], off: 1 },  // :76392 | (255,255,255,200) 恒；SKIP: SkyDragonFury 专属类消费
  710: { kind: 'fade' },  // :76167 | r=g=b=255−α a=255−α（rgb 衰减折进 ga）
  711: { kind: 'fixedfade', rgba: [255,255,255,128] },  // :76428 | (255,255,255,128)×(1−α/255)
  712: { kind: 'lerp', k: 0.4 },  // :76585 | Lerp(White,0.4)*Opacity
  714: { kind: 'lerpkeep', k: 0.8, off: 1 },  // :76216 | Lerp(White,0.8) A 保留再 ×A/255——Celeb2 消费 skip；SKIP: Celeb2 专属类消费
  723: { kind: 'invisible', off: 1 },  // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  724: { kind: 'invisible', off: 1 },  // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  725: { kind: 'invisible', off: 1 },  // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  726: { kind: 'invisible', off: 1 },  // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  728: { kind: 'invisible', off: 1 },  // (255,255,255,0)*Opacity A=0 纯加算白×Opacity（A 仍 0,乘子只降 rgb 强度=E2 Opacity 债）;SKIP→正确承接=GA (255−α)/255+'lighter',勿按隐形登记（'5 小丑箭 PROJ_ALPHA0 先例'已 R1/M-4 反转定谳:5=A=0 纯加算白非隐形）;本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）;★另注:Arrow 侧 GA case 728=0 案位待核（:80995 支成员核实挂账,本注只定性=A=0 加算白×系数）
  729: { kind: 'fixed', rgba: [255,255,255,200] },  // :76666 | (255,255,255,200) 恒
  731: { kind: 'lerp', k: 0.8, mul: 0.098 },  // :76462 | Lerp(White,0.8) 后 (r,g,b,25)
  732: { kind: 'lerp', k: 0.8, mul: 0.098 },  // :76462 | Lerp(White,0.8) 后 (r,g,b,25)
  735: { kind: 'lerp', k: 0.85, mul: 0.502 },  // :76266 | Lerp(White,0.85) A=128 ×(1−α/255)
  755: { kind: 'lerp', k: 0.75, off: 1 },  // :76119 | Lerp(White,0.75)；SKIP: MinionProj 专属类消费
  756: { kind: 'lerpblack', k: 0.25 },  // :76086 | Lerp(newColor,Black,0.25) 压暗
  764: { kind: 'fixed', rgba: [255,255,255,255] },  // :76078 | Color.White
  813: { kind: 'fade' },  // :76224 | r=g=b=255−α a=255−α
  833: { kind: 'lerp', k: 0.25 },  // :76106 | Lerp(White,0.25)
  834: { kind: 'lerp', k: 0.25, off: 1 },  // :76106 | Lerp(White,0.25)；SKIP: MinionProj 专属类消费
  835: { kind: 'lerp', k: 0.25, off: 1 },  // :76106 | Lerp(White,0.25)；SKIP: MinionProj 专属类消费
  837: { kind: 'fade', off: 1 },  // :76055 | 1456: α>0→Transparent / α=0→(255,255,255,200)——现有 drawGlobalAlpha (255−α)/255 档保留；SKIP: drawGlobalAlpha 缺省路径档
  855: { kind: 'lerpcolor', k: 0.5, rgba: [255,200,60,255] },  // :76043 | Lerp(newColor,(255,200,60),0.5) 后落缺省（橙化滤镜近似）
  856: { kind: 'fixed', rgba: [255,255,255,255] },  // :76078 | Color.White
  857: { kind: 'fixed', rgba: [255,255,255,255] },  // :76078 | Color.White
  864: { kind: 'fixed', rgba: [255,255,255,255] },  // :76078 | Color.White
  870: { kind: 'invisible', off: 1 },  // :76312 | (255,255,255,0) A=0 隐形；SKIP: WeaponProj 专属类消费
  872: { kind: 'fixedfade', rgba: [255,255,255,255] },  // :76082 | White*Opacity
  873: { kind: 'fixedfade', rgba: [255,255,255,255] },  // :76082 | White*Opacity
  876: { kind: 'invisible', off: 1 },  // α<200→(255−α,…,0) A=0 加算白渐显 / α≥200→Transparent 真零——非隐形;已接线（★2026-09-01 激光批）:GA case <200 门 (255−α)/255 + ADDITIVE_GLOW_PROJS 'lighter';off=本表不消费维持
  880: { kind: 'afade', rgba: [255,255,255,128], slope: 1 },  // :75990 | A/2 后落缺省（A=127.5−α）
  893: { kind: 'fixed', rgba: [255,255,255,150] },  // :76102 | (255,255,255,150) 恒
  895: { kind: 'fixedfade', rgba: [255,255,255,255] },  // :76098 | White*Opacity
  907: { kind: 'fixed', rgba: [255,255,255,150] },  // :76102 | (255,255,255,150) 恒
  912: { kind: 'lerp', k: 0.25, off: 1 },  // :76106 | Lerp(White,0.25)；SKIP: WhipProj 专属类消费
  913: { kind: 'fixedfade', rgba: [255,255,255,255], off: 1 },  // :76082 | White*Opacity；SKIP: WhipProj 专属类消费
  920: { kind: 'lerp', k: 0.4 },  // :75946 | Lerp(newColor,White,0.4)*Opacity
  921: { kind: 'lerp', k: 0.4 },  // :75946 | Lerp(newColor,White,0.4)*Opacity
  926: { kind: 'lerp', k: 0.4 },  // :75946 | Lerp(newColor,White,0.4)*Opacity
  929: { kind: 'afade', rgba: [255,255,255,128], slope: 1 },  // :75990 | A/2 后落缺省（A=127.5−α）
  931: { kind: 'fixedfade', rgba: [255,255,255,255] },  // :76082 | White*Opacity
  933: { kind: 'fade2' },  // :76047 | White*Opacity 后落缺省（(1−α/255)² 双重衰减）
  937: { kind: 'afade', rgba: [255,255,255,191], slope: 1 },  // :75986 | A×0.75 后落缺省（A=255×0.75−α）
  948: { kind: 'fixed', rgba: [255,255,255,255], off: 1 },  // :76143 | Color.White；SKIP: WeaponProj 专属类消费
  953: { kind: 'fixed', rgba: [255,255,255,127] },  // :76183 | (255,255,255,127) 恒
  955: { kind: 'fade' },  // :76823 | (255,255,255,newColor.A−α) 白色 A=255−α
  961: { kind: 'lerpblack', k: 0.25 },  // :76086 | Lerp(newColor,Black,0.25) 压暗
  963: { kind: 'fade', off: 1 },  // :75994 | ×0.85 后落缺省（ai[0]≥2 另 G/B×0.7）——MinionProj 消费 skip；SKIP: MinionProj 专属类消费
  964: { kind: 'fade' },  // :76448 | (255,255,255,255)*Opacity
  965: { kind: 'fade' },  // :76448 | (255,255,255,255)*Opacity
  967: { kind: 'fixedfade', rgba: [255,255,255,255] },  // :76039 | White*Opacity
  969: { kind: 'fixedfade', rgba: [210,210,210,185] },  // :76021 | 逐通道 min(newColor,210) a=185×Opacity（本仓光色恒白=常量）
  977: { kind: 'fixed', rgba: [255,255,255,200] },  // :76666 | (255,255,255,200) 恒
  978: { kind: 'fixedfade', rgba: [255,255,255,127] },  // :76187 | (255,255,255,127)*Opacity
  981: { kind: 'fixed', rgba: [255,255,255,255] },  // :76013 | Color.White
  1001: { kind: 'fade2' }, // :76047 | White*Opacity 后落缺省（(1−α/255)² 双重衰减）
  1006: { kind: 'fixed', rgba: [255,255,255,255] }, // :76009 | Color.White
  1021: { kind: 'fixed', rgba: [255,255,255,255] }, // :76005 | Color.White
  1024: { kind: 'fixedfade', rgba: [255,255,255,255] }, // :76320 | (255,255,255)*Opacity
  1039: { kind: 'fixedfade', rgba: [255,255,255,255] }, // :76082 | White*Opacity
  1041: { kind: 'alpha255hide' }, // :76090 | α==255→Transparent else White
  1045: { kind: 'fixedfade', rgba: [255,255,255,200] }, // :76670 | (255,255,255,200)*Opacity
  1047: { kind: 'fixed', rgba: [255,255,255,255] }, // :76296 | (255,255,255,255) 恒
  1055: { kind: 'fade', off: 1 }, // :75968 | gate localAI[0]（A=255−localAI[0]）本仓未跟踪→登记忽略；SKIP: 门控条件未建模（登记忽略）
  1059: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1060: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1061: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1062: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1063: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1064: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1065: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1066: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1067: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1068: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1069: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1070: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1071: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1072: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1074: { kind: 'fixed', rgba: [255,255,255,255], off: 1 }, // :75942 | IsAPhaseblade 族 Color.White；SKIP: WeaponProj 专属类消费
  1075: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1076: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1089: { kind: 'disco' }, // :76316 | (DiscoR,DiscoG,DiscoB,70) 彩虹闪烁 a=70/255——★BJ236 已 1:1 化（2026-09-21）:载体=GlowstickProj 专属类（本表 Arrow 侧档=防御 dormant）,基色=FlickerClock.discoColor() 同源钟直读+离屏乘色缓存+source-over×70/255（GetAlpha :80987-80989/AlphaBlend 直译;旧 hue-rotate 周期近似=灰阶贴图恒等零观感,已退役）
  1090: { kind: 'lerp', k: 0, off: 1 }, // :75972 | gate localAI[2]：0→直通/1→White/else Lerp(k) 本仓未跟踪→登记忽略；SKIP: 门控条件未建模（登记忽略）
  1097: { kind: 'fixedfade', rgba: [255,255,255,128] }, // :76428 | (255,255,255,128)×(1−α/255)
  1099: { kind: 'random' }, // :75957 | α>0→(0,0,0,0)；α=0→随机 rgb a=200（星尘珠闪烁近似 ga=200/255）
  1100: { kind: 'fade2' }, // :76047 | White*Opacity 后落缺省（(1−α/255)² 双重衰减）
  1101: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1102: { kind: 'fixed', rgba: [255,255,255,255] }, // :75942 | IsAPhaseblade 族 Color.White
  1107: { kind: 'invisible', off: 1 }, // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  1108: { kind: 'invisible', off: 1 }, // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  1109: { kind: 'invisible', off: 1 }, // Color.Transparent=(0,0,0,0) XNA 预乘真零（rgb=0 无加算贡献,与'A=0 加算白'两类,隐形结论本就成立）;SKIP 维持（视觉载体=AI 尘/粒）——但引证勘误:'同 5 小丑箭 PROJ_ALPHA0 先例'已废（5 实为加算白,R1/M-4 反转）,本 id 尚未接线,off=登记残留（若接线须 GA+'lighter' 承接）
  1110: { kind: 'fixedfade', rgba: [255,255,255,128], off: 1 }, // :76428 | (255,255,255,128)×(1−α/255)；SKIP: SkyDragonFury 专属类消费
};

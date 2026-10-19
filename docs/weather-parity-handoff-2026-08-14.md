# 天气系统全量 review 处置单（2026-08-14，会话 1fc2b821）

用户令"禁止近似，一律原版 1:1"。已修 13 项，**遗留 2 项已于同日全部落地清零**。

## 遗留清零（2026-08-14 第二批）

1. **沙尘暴 dust 268 渲染池**（WeatherRenderer.sand）：EmitDust 全链含
   num9 预算（num7×1.1−活尘）、簇生链（j-- 重掷 1/maxValue2、pos += rand±10+v×−1.1、
   链上生尘不做墙门）、fadeIn += num13×0.2；更新 = Dust.cs:1854-1875（v×1.0050251、
   scale+0.01、!sandstormVisuals −0.05、玩家下落跟随、落地 scale×0.9/v×0.25）+默认重力
   vy+=0.05 +通用死亡（scale>10 / 屏底外 / scale<0.1）；绘制 = DrawDust:38403-38429
   **双画**（环境光底 + GetColor（dust.color×light）叠画），帧 = Dust.png (680,20,10,10)、
   origin(4,4)。tint 缓存 4 色×8 光档。
2. **云三段深度通道**：distant(scale<1) 画在群系背景【后】（sky 层内,cY = y+num3×750+830）、
   closer([1,1.15))/closest(≥1.15) 画在背景【前】（Renderer.biomeBg.draw 后挂
   sky.drawCloudsNear；cY = y×(H/600)+bgTopY+150 / y×(H/600)−100+bgTopY×1.01−150）；
   bgTopY = num3×1200+1190、num3=(300−camTop)/(worldSurface×16)（:58743-58744）；
   地表上门 camTop < worldSurface×16+16。
   探针 _cloud-sand-parity-probe.mjs 8 断言全过（云量 200→池 147 视口饱和/收敛 30 精确/
   三通道 62-45-37/视差 drift−6.1/沙尘 733 活粒+2770 沙色像素）。

## 本轮已修（全部原版行号背书）

| # | 偏差 | 原版权威 | 修复 |
|---|---|---|---|
| 1 | splash 概率 0.5 | gfxQuality 默认 **1**（Main.cs:1012）→ Rain.cs:124 恒溅 | WeatherRenderer 恒溅 |
| 2 | 雪密度门 0.6× | snowing :12997 ×(gfxQuality/2+0.5)+0.1 = **1.1×** | 1.1×target |
| 3 | 雨条中心锚+1px | DrawRain :38246-38256 position 左上/origin(0,0) 绕顶点 | 顶锚 1:1 |
| 4 | 风场增量分布 1/4,1/2,1/4 | :58278-58290 else-if **再掷** Next(2) → 1/4,3/8,3/8 | 两掷链 |
| 5 | 史莱姆雨阈值恒 150 | NPC.cs:79880-79897 杀过王 ÷2=75；置 -num/2 | advanceSlimeRainKill(+downed) |
| 6 | 金币雨无玩家锚定 | WorldGen.cs:71825-71832 FindClosest 活&未死&1/2 → ±2400 钳[800,(w-50)16] | ctx.playerForCoinRain |
| 7 | 沙色按区旗 | EmitDust :171-178 GetTileCount【格数】四色(53系/112系/234系/116系) | SceneMetrics.sandColorWeights |
| 8 | EmitDust 速度/密度 | :141-248 速度主项 dir×lerp(.5,.7,α)×20+基速5、vy×0.35、密度门 Next(num5/4)、屏上-50 带、边缘 1/3 | 1:1 重写 |
| 9 | 云量 8-21 朵公式 | Cloud.cs UpdateClouds :230-296 目标=**numClouds 直连(0-200)**、每帧±1 | 直连+resetClouds 铺满 |
| 10 | 云无相机视差 | Cloud.cs :313-330 UpdateCloudParallax x−=Δcam×GetParallax | 已接 |
| 11 | 云色=白+夜0.25+雨灰硬编码 | NextHorizonRenderer :246-268 **ColorOfTheSkies×(scale×α)**+pass1 压暗+×atmo²+globalCloudAlpha(:58752=max(cloudAlpha,墓园×.92)×atmo) | 天空色链 1:1 |

另:沙暴 UI 闪句 500ms→**5s 制**(:46252 GlobalTimeWrappedHourly%10≥5);雪原下雨无雨滴(=缺 snowing 雪粒系统,前一轮已修)+涟漪双画退役(前一轮)。

## 遗留（后续会话接手，全套引用在此）

1. **沙尘暴粒子渲染**:发射数学已 1:1,但渲染走 Game.particles 色方块。原版=dust 268:
   - 更新 Dust.cs:1854-1875(SandStormCount++ 计数、velocity×1.0050251/t、scale+0.01/t、
     非 flag 档 scale−0.05、玩家下落 vy lerp0.04+Y×0.2、落地 scale×0.9/v×0.25)
   - 绘制=普通 Dust.png 帧(268 源矩形 **(680,20,10,10)**,origin(4,4))+**画色 +0.39 提亮**
     (Main.cs:21462/:21559 dust 268 档)+dust.color=四色加权(alpha 180)
   - EmitDust 尚有内联簇生链(:187-207 j-- 重掷 1/maxValue2、pos+=rand±10+v×−1.1)与
     num9 预算(num7×1.1−SandStormCount,num7=1000×屏比)未接
   - 建议:WeatherRenderer 自持 sand 池(同 snow 模式)+tint 缓存(4 色×8 光档)
2. **云三段深度通道**:原版按 scale 分三 pass 绘制,各带 Y 变换与 bgTopY 偏移——
   DrawClouds_Closest(:59073,scale≥1.15,y×(H/600)×1.01−150+bgTopY×1.01)、
   _Closer(:59093,[1,1.15),y×(H/600)+bgTopY−50+200)、_Distant(:59115?,scale<1,pass1 压暗档);
   bgTopY=表面背景顶锚(Main.cs DrawSurfaceBG 链)。当前全部画在 c.y 原位。

## 环境
vitest 42/42 绿；tsc 我的文件 0 错;探测探针 scripts/_snow-ripple-probe.mjs(8 断言)。

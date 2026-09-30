/**
 * ★确定性节拍对齐引擎(2026-09-28 调度面修复刃;同日热修刃:废除 60Hz 网格地板,
 * 目标周期=用户 frameCap——subtle 只对齐不钳速)——帧模式 subtle 档的渲染调度。
 *
 * vanilla 锚(1457 亲读,勿凭记忆改):
 *  - FrameSkipMode 三态:Main.cs:17129-17137——Off/Subtle=可变步+垂直同步;On=IsFixedTimeStep(60Hz)+垂直同步。
 *  - 累计器门+SuppressDraw:Main.cs:17182-17197——【仅】Off 或 Subtle&&!improvedSubtleFrameSkip
 *    (旧路径)走"累计器未满 1/60 → SuppressDraw+return";其后"落后跳帧"分支 num3=0 恒死代码。
 *  - improvedSubtleFrameSkip(1457 默认 true,Main.cs:67615-67616):EndDraw 忙等钳 60Hz present
 *    网格(Main.cs:62624-62644)——Update 每循环照跑、【无绘制抑制】,整个 Update+Draw+Present
 *    周期被钉在 60Hz 网格上(火焰时钟案已实证"原版绘制周期≡60Hz tick")。
 *  ★网格地板否决注(2026-09-28 热修刃,防未来"忠实原版"改回去):原版把 present 钉
 *    60Hz 网格的理由是其【逻辑与呈现同帧】——Update 就跑在同一循环里,不钳 60 游戏
 *    速度直接随刷新率漂移,钳 60 是保游戏速度的手段,非节拍美学。本仓逻辑 fixedUpdate
 *    恒 60Hz 与渲染帧率解耦,60 网格地板在本架构下没有任何速度语义,只剩两条实害:
 *    ①静默覆盖用户 frameCap(cap=120/不设限被压回 60=用户实报"设 120 依然 60");
 *    ②60 拍跳整拍放大(自由 120 下轻微迟到的帧,在 60 拍下变 33ms 整拍空档=掉帧
 *    更显眼)。故 TARGET【不取】max(1000/60,·):subtle 的价值=确定性对齐(帧序计数
 *    落拍,帧距恒定消摆动),不改变用户选择的速率——只对齐,不钳速。
 *
 * 本引擎 = improvedSubtle 语义的 rAF 移植:**帧序计数落拍,非忙等**。rAF 时代 present
 * 由浏览器合成器掌控,只能选 vsync 的整数倍——"每 k 个 vsync 渲一次"(k=拍)且 k 恒定
 * ⇒ 渲染帧距恒定 = 确定性节拍。取代旧被动门(`now-_lastCapTs<1000/cap-1 即跳`:
 * 阈值落在 vsync 整数倍 ±抖动带内 ⇒ 跳 1/2 个 vsync 随机翻转)与旧 SuppressDraw
 * (0 步进帧跳绘:累计器相位随 rAF 抖动随机游走 ⇒ 渲染落点不规律)——两者即用户实报
 * "高于 60fps 仍有卡一下感"的节拍摆动源。
 *
 * 拍选择(状态机全输入显式,内部不读墙钟——事件序列决定论,可单测):
 *  - 目标周期 TARGET = frameCap>0 ? 1000/frameCap : 1×vsync 间隔(热修刃语义):
 *    cap=120@120Hz 与 cap=0 均拍=1 vsync(全速确定拍);cap=60@120Hz 拍 2(60fps 拍);
 *    cap<60 由 cap 压拍。60Hz 网格地板已废(否决注见上)。
 *  - minK = ceil(TARGET/vsync):拍=vsync 整数倍(cap=0/cap≥屏率 1;cap60@120Hz 2;
 *    cap30@120Hz 4;cap30@60Hz 2)。
 *  - 容量预算 budget(k)=k×vsync(渲染帧成本落在预算内,滑一个 vsync 也保持均匀相位的
 *    一致性;成本贴/超预算=相位随机翻转=摆动)。降拍【v6 帧率优先制】:成本
 *    p50>budget(k+1)×1.1(中位超过【下一更低档】预算×1.1 才降)→ 逐级扫到首个能
 *    容纳的 k;政策/边界语义见头注 v6。★v4 的"单帧超预算立即降"已废除(见下 v4
 *    失效形态——单帧超支在 beat 对齐下=顺延一个 vsync=无感,不构成降档理由)。
 *  - 滞回升拍:k>minK 且 p50<budget(k−1)×0.9【升拍余量 10%】连续 2 半窗=60 渲染帧
 *    → k−1(一步);条件破即弃——降快升慢防档位震荡。
 *  ★升拍 p50 制(v3 语义注,2026-09-28 热修刃;三级演化最终形态=①进场简化 v4
 *    afterWorldLoad resetSampling ②出场看门狗=降拍三路立即(单帧超预算/p95 超预算/
 *    连续失拍)③升拍 p50 制本刀):判据史=「p95<0.8×budget(k−1) 持续 2s」(设计二,错——
 *    本仓稳态帧耗 8-12ms,顶格要求 p95<6.7ms 永不可达=降拍后钉 60,用户实报
 *    cap120+subtle 进世界回不到 120)→「p50<budget(k−1) 连续 2 半窗」(本刀)。理论根基:
 *    beat 对齐下超预算帧只是【顺延到下一 vsync】(present 恒落 vsync 网格=对齐 60Hz
 *    节拍)不是失稳——节拍摆动只来自未对齐自由漂移,已被帧序对齐机制消灭;故中位数
 *    帧耗装得下即升,偶发超预算帧=k=1 下跳一拍=对齐 60 无感;p95 超标【仅】驱动降拍
 *    (持续过载保护)。防抖:升拍需判据连续 2 半窗满足(轻于旧 2s 墙钟)+降拍立即,
 *    组合=准稳态——预算边缘震荡会话(边界①形态 p50 8.2/p95 12)在 k=1/2 间有界摆动,
 *    观感与 k=2 同但保留升回 120 的通路;匀称恒超载(render-bound,p50>budget)恒不升
 *    =正确(render-bound 本就该降拍,见上一刀备注)。
 *  - 失拍吸附:渲染帧距>(k+0.7)×vsync=失拍(渲染节拍滑了 ≥1 个 vsync)。序数计数天然
 *    【不追赶中途】——失拍后下一渲染仍落在下一拍(不插补.render,防连锁迟到);单次失拍
 *    只作余量警示(弃升拍保持),连续 2 次=容量不足 → 降拍。
 *
 * ★v5 判据自洽迭代(2026-09-29,"最后一次判据结构迭代"——此后判据只许参数调优,结构
 *   变更须新证据)。判据演化史+每版失效形态:
 *  - v1 网格地板(2026-09-28):TARGET=max(1000/60,·) 钳 60Hz 网格——失效=静默覆盖用户
 *    frameCap(cap120/0 被压回 60);已废(否决注见上)。
 *  - v2 p95 升拍制(2026-09-28):升拍判据 p95<0.8×budget(k−1) 持续 2s——失效=本仓稳态
 *    帧耗 p95 8-12ms,阈值 6.7ms 永不可达 → 降拍后单向钉死 k=2,回不到 120(用户实报)。
 *  - v3 升拍 p50 制(2026-09-28 热修):p50<budget(k−1) 连续 2 半窗即升,p95 只管降拍——
 *    修复了钉死,但【升/降判据未做联合自洽】(v4 遗留,见下)。
 *  - v4(=v3 代码原样,判据缺陷在此定谳):升拍判据 p50<budget(k−1)【无余量】+ 降拍①
 *    【单帧 cost>budget 立即 k+1】+ 降拍② p95>budget 扫拍。失效形态=边界震荡会话
 *    (帧耗 p50 贴预算,p95 超预算):升拍判据成立的同时降拍①/② 也成立 → k 1↔2 flap,
 *    帧距 8.3/16.7 混样=FPS 读数 80-90 反复。★wild 定谳(2026-09-29 trace
 *    Trace-20260929T164816/112019,x-ray+原始 rAF 序列回放):两份 trace 均【零 k 跳变】
 *    ——digest 的 render/skip 1:1 是第二條同名 'loop' 小 rAF 链的 FunctionCall 名碰撞
 *    伪影(工具债,见 trace-x-ray);会话实况=frameSkipMode 'off'+frameCap 0
 *    (localStorage 实证,localhost:4173)→ 节拍引擎根本不在渲染路径,自由渲染,帧距=
 *    主线程工作周期(rAF 迟交:delta≈前帧 cost+1.9ms,corr=0.952)→ 80-90=工作抖动
 *    本相;canvas 落 SHM 软栅路径(lpr 239/帧,健康 GPU 路径 ≈1.0)是帧耗 10ms 的真身。
 *    同流回放现行 v4 判据:846/1808 渲染+21 次 k 迁移(9-12ms 升→降 flap 循环)=上述
 *    失效形态实锤,只是被 off 档遮住未爆发。
 *  - v5(本刀)自洽三刀:①降拍 p50 制——废除单帧立即降(v4 降拍①),降拍唯一判据=
 *    costP50>budget 持续(60 样本窗)→ 逐级扫拍;单帧超支由 beat 对齐顺延吸收( doctrine:
 *    丢一拍对齐下一 vsync=无感,振荡才是病)。②升拍余量——p50<budget(k−1)×0.9,
 *    中位数贴预算(如 p50 8.2 vs 预算 8.33)不再触发升拍=消除"升拍资格成立同时降拍
 *    触发"的打架面。③驻留=既有确定性窗机制(升 2×30 连续帧+降 60 样本窗),无墙钟。
 *    边界震荡画像(p50 8.2/p95 12)在 v5 下=稳定驻留 k=2(恒 60,升拍余量拦住,失拍
 *    看门狗压住);render-bound(p50>预算)恒驻低档不顶格抖动;轻载(p50 6)稳定升 k=1
 *    恒 120。★新登记债(非本刀范围,须新证据再动):vsync 估计在饱和态被回声污染
 *    (估计读到的≈工作周期而非真实网格,corr=0.952 铁证)——修它=估计器结构变更,
 *    且牵"稳定 60 vs 顶格抖动 87"的产品取舍,单独立案。
 * ★v6 降档边界=帧率优先(2026-09-29 热修刃,判据【参数级】调整——v5 结构冻结令仍有效:
 *   扫拍/滞回升拍/余量/失拍看门狗结构原样,只动降档线一处参数)。用户实报:隐蔽档在
 *   帧耗 9-15ms 的场景锁 60/40,而用户偏好这些场景跑出不齐但更高的帧率(此前 free-run
 *   体验满意)。政策语义(用户明令):beat 的价值=对齐消抖动;帧耗落在两档预算之间时,
 *   【帧率优先】(不齐但高)>对齐但低。边界=帧耗在两档预算之间时两条路的 realized
 *   rate 几乎同值,选高的纯为读数/输入采样收益。落实:降档线从 costP50>budget(k)
 *   (v5:中位刚超当前拍预算即降)改为 costP50>budget(k+1)×DOWNGRADE_MARGIN(1.1)
 *   ——中位超过【下一更低档预算】×1.1 才降:k=1@120Hz 的线=budget(2)×1.1≈18.3ms,
 *   帧耗 p50 9-15 的会话留在 k=1 跑 ~90-110 的不齐帧率(仍高于 60 档对齐帧率),只有
 *   中位 18ms+(k=1 realized 跌到 ~55、逼近 60 档对齐)时对齐 60 才真的更快,才降。
 *   升拍判据(p50<budget(k−1)×0.9)不变——新参数下 k 档滞回带
 *   [budget(k−1)×0.9, budget(k+1)×1.1] 依旧无交叠,v5 的升降自洽性保持。
 * ★v7 判别器补丁双刀(2026-09-29,案①案②实测定谳后;v5 结构冻结令仍有效——本刀=判别器
 *   级两点+零结构变更,红/绿判别器与逐案证据见 tests/frame-beat.test.ts 案①案②块):
 *  - 案①失拍对齐豁免(isCapacityMiss 钩):帧距虽超 (k+MISS_SLACK)×vsync,但恰为
 *    (k+1)×vsync(±max(0.2×vsync,2ms))=单拍对齐顺延(present 恒落网格=零抖动),
 *    不计失拍。实测(ProMotion 有头,探针 _framebeat-entry-cascade2)锁相 regime 下
 *    帧距 100% 落网格(meanDev 0.18ms)——k=1+帧耗 9-15 的物理 2-vsync 节奏被旧判据
 *    判 miss-streak 降拍,而 k=1/k=2 realized 同为 60=纯噪声降档;豁免后 miss-streak
 *    只剩"离网格漂移/深滑"真失稳(30ms stall 帧距 46.7=n=k+2 仍判失拍;更深的持续
 *    滑移照旧降拍——全倍点豁免会让看门狗在网格量化 stall 下失明,故只豁 n=k+1)。
 *  - 案②入场结算护栏(settleGuard):capacityBreach 需 costWin 全窗(60 渲染帧)证据
 *    ——构造/resetSampling 各挂满一次。实测入世界首簇帧 ~150ms(块同步烘焙+首帧编译)
 *    在旧码下以 2-6 样本薄窗一拍扫到 k=6,滞回梯 60 渲染帧/级在突发 fps 下 ≈11s 才回
 *    k=1(用户可见=入场后 10s+ 的 16-60fps;resetSampling 挡生成期污染但挡不住入场簇
 *    ——簇在 reset 之后)。护栏=判据证据门槛,非新判据;floor/miss-streak 不受护栏
 *    (cap 强制与合成器 stall 各司其职)。★登记案②原文的"resetSampling 估计噪声→
 *    minK=2 起步"子机制经实测否定(两探针 reset 时估计=未喂默认 16.67 或生成期大空洞
 *    v≈100,minK(cap120) 恒 1;minK=2 需估计落 [4,8) 未复现),升拍余量豁免与 minK
 *    改档均不立项。
 *  - 案③交付 regime 运行时检测:归档(证据不足,不动)。两流统计:锁相流 meanDev
 *    0.18ms/100% 落网格 vs 饱和自由流 1.47ms/79.4%(8× 分离,可检测性初步实证),
 *    但检测器依赖诚实 vsync 估计,而饱和 regime 下估计器恰被回声污染(圆圈依赖);
 *    且 regime 自适应政策=结构级新增。两流样本不足以标定阈值(证据:探针
 *    _framebeat-entry-cascade2 + trace Trace-20260929T164816),另立新证据再动。
 *  - 回声债(估计器饱和读工作周期):归档(处方被金标流反证)。"gaps 恒 ≥vsync→
 *    vsync=gap 下确界"前提不实:金标流 5.2% 帧距 <8.33(min 7.2,迟帧解堵余数)→
 *    p10/min 统计使 minK 地板在 59/100 每 600 窗抬到 ≥2(案②族地板翻动),截尾均值
 *    0/600;交换代价=降拍线/失拍阈/minK 全面积移位+多个 v6 绿测试依赖回声豁免。
 *    估计器去回声须先有锁相+饱和双 regime 真流金标,另立新证据再动(案①豁免已是
 *    其前置安全网)。
 * ★v7.1 瞬态簇豁免(2026-09-29 用户实报"开背包/开地图必大降帧"定谳后;判别器级,
 *   零结构变更):失拍降档改【双门】(连续性×持续量)——missStreak≥4(原 2)且簇内
 *   滞时累计≥200ms 才降。机理:开图/开包=1-5 帧瞬态大帧簇(布局/烘焙/上传),
 *   120Hz 下每帧超阈 ~10-40ms、簇总滞时 ~50-150ms=【有界】瞬态,不构成容量失稳,
 *   不该触发需 60 渲染帧才能爬回的降档(旧码连续 2 失拍即降=用户实报的"联锁下降");
 *   真容量失稳的滞时【无界】,~0.2-0.4s 内必触双门——检测延迟代价可忽略;单帧大
 *   hitch(GC/IO ~200ms)滞时 ~186ms 仍不降=同语义(单 hitch 不定容量)。红判别器
 *   OldAlignedMissBeat 同步复刻旧降档门(missDowngradeDue 覆写),案①红→绿对照面
 *   保持完整。
 */

/** 原版 present 网格常数(60Hz;improvedSubtle EndDraw 钳值 TARGET_FRAME_TIME×599/600)。
 *  ★热修刃(2026-09-28)起【不再作拍地板】(否决注见头注):仅作 vsync 估计先验初值
 *  与测试对照常数 */
export const GRID_MS = 1000 / 60;
/** 拍上限(vsync 整数倍的最深降级;60Hz 屏即 10fps——成本 p95>100ms 时渲染已死,兜底不再降) */
export const BEAT_K_MAX = 6;
/** 升拍判据窗粒度(成本样本数;半窗=30 渲染帧——判据连续满足以半窗为拍记程,
 *  轻于旧 p95 制的 2s 墙钟:k=2@120Hz 下 2 半窗=60 渲染帧≈1s) */
export const UPGRADE_WIN_SAMPLES = 30;
/** 升拍需【连续】满足判据的窗数(任务处方 N=2~3 取 2;判据破即清零重计——与降拍
 *  立即组合=准稳态,防升拍后立即降拍的震荡面失稳) */
export const UPGRADE_HOLD_WINDOWS = 2;
/** 升拍余量(v5 自洽刀):p50 < budget(k−1)×此系数 才有升拍资格——中位数贴预算的
 *  边界会话(如 p50 8.2 vs 预算 8.33)不升,消除"升拍资格成立同时降拍触发"的打架面。
 *  beat 对齐下偶发超预算帧=顺延下一 vsync 无感,但【中位数】贴预算意味着接近半数
 *  帧在顺延=节拍混样,不如驻留低档(恒 60)——余量把这类会话稳定在低档 */
export const UPGRADE_HEADROOM = 0.9;
/** 降档余量(v6 帧率优先刀):p50 > budget(k+1)×此系数 才降档——降档线从"中位刚超
 *  当前拍预算"(v5)上移到"中位超过【下一更低档】预算×1.1"。政策(用户明令,见头注
 *  v6):帧耗落在两档预算之间时帧率优先(不齐但高)>对齐但低——k 档实际能跑出高于
 *  (k+1) 档对齐帧率的 realized rate 时留在高档,realized 跌破下一档对齐帧率 ~91%
 *  (÷1.1)才降。k=1@120Hz 线=18.3ms:p50 9-15 的会话留 k=1 跑 ~90-110,18ms+ 才降
 *  60 档(那时 k=1 只剩 ~55 不齐,对齐 60 确实更快) */
export const DOWNGRADE_MARGIN = 1.1;
/** 失拍判定:帧距 >(k+MISS_SLACK)×vsync(0.7=滑过 1 拍尚容 ±0.3 拍 rAF 抖动) */
export const MISS_SLACK = 0.7;
/** 失拍对齐豁免带(v7 案①,相对):帧距与 (k+1)×vsync 偏差 ≤max(此系数×vsync,2ms)
 *  =单拍对齐顺延(present 恒落网格),不计失拍。0.2 实测定线:锁相真流对齐 gap 偏差
 *  ≤1.5ms,而 stall 帧距(46.7)距 (k+1) 倍点 ≥3.3ms——两态分离清晰 */
export const MISS_GRID_TOL_REL = 0.2;
/** 失拍对齐豁免带(绝对下限 ms;vsync 估计偏小时保持豁免带不塌缩) */
export const MISS_GRID_TOL_MS = 2;
/** 失拍降档连续门(v7.1 瞬态簇豁免):连续失拍达此次数才有降档资格——原 2 在
 *  120Hz 下只等于 ~17ms 的持续失稳,开图/开包瞬态大帧簇(1-5 帧)即误触;4 仍只
 *  是 ~33ms@120Hz 的检测延迟,真容量失稳(无界滞时)照样覆盖 */
export const MISS_STREAK_DOWNGRADE = 4;
/** 失拍降档持续门(v7.1):簇内滞时累计(Σ(gap−失拍阈),逐失拍帧累加、断拍即清)
 *  达此毫秒才降——有界瞬态簇(开图/开包 ~50-150ms 总滞时)被此门吸收;标定:
 *  120Hz 开包最坏簇 5×(38−14.2)≈119ms<200 不降;30fps 持续负载 excess ~19ms/拍
 *  → ~11 拍(~0.37s)触门,检测代价可忽略 */
export const MISS_STALL_BUDGET_MS = 200;
/** vsync 周期样本窗(截尾均值估计;rAF 回调间隔) */
const VSYNC_WIN = 31;
/** 渲染帧成本样本窗(p95) */
const COST_WIN = 60;
/** vsync 周期钳(防未锁 vsync 的无头/离屏 rAF 与暂停恢复大空洞) */
const VSYNC_MIN_MS = 2;
const VSYNC_MAX_MS = 100;
/** >此间隔的 vsync 样本视为断流(tab 隐藏/调试暂停),清窗不采样 */
const VSYNC_GAP_RESET_MS = 250;
/** shouldRender 的时间护栏余量(vsync 估计失真时的兜底,吸收 rAF 时间戳抖动) */
const TARGET_GUARD_MS = 2;
/** 拍地板容差(相对):minK 折算容许 vsync 估计低于目标 15%——★v8 放宽(2026-09-30
 *  "升 120 被拉回 60"定谳:拍迁移记录仪实锤 floor=2 反复触发,用户的 rAF 间隔估计
 *  =7.93-8.00ms(比理论 8.33 系统性低 ~4.2%,Chrome/Metal 时间戳语义)——旧 0.04
 *  容差(阈值=目标×0.96=8.0ms)被 0.25% 的越界反复击穿=120↔60 打摆 79 翻转/43s。
 *  0.15 下 7.98 ≥ 8.33×0.85=7.08 → floor=1 ✓;真 60Hz 屏判别(估计 16.7≫目标)
 *  与 cap30/cap60 折算不受影响。容差须【相对】于目标周期:绝对 ε 会被估计噪声
 *  击穿(60Hz 拍 ratio 1.02 处地板 1↔2 翻转=恒久 30fps,首版实测炸点) */
const FLOOR_TOL = 0.15;

/** 拍变更原因(诊断/探针)。★v5:'overbudget'(v4 单帧立即降)已退役——成本驱动
 *  降拍统一 'capacity';类型保留该字面量仅为旧探针快照兼容,引擎不再发出 */
export type BeatReason = 'init' | 'capacity' | 'overbudget' | 'miss-streak' | 'upgrade' | 'floor';

export class FrameBeat {
  /** 当前拍:每 k 个 vsync 渲染一次(k=1 即每帧) */
  k = 1;
  /** 自上次渲染起累计的 vsync 回调数(帧序计数;渲染后归零) */
  ordinal = 0;
  /** 用户帧率上限(0=不设限;仅作天花板,经 observeVsync 注入——引擎不读 options) */
  private cap = 0;
  /** vsync 周期估计(ms;rAF 回调间隔中位数) */
  vsyncPeriod = GRID_MS;
  /** 最近一次拍变更原因(诊断/探针) */
  lastReason: BeatReason = 'init';

  private vsyncDeltas: number[] = [];
  private lastVsyncTs = -1;
  private costWin: number[] = [];
  private lastRenderAt = -1;
  /** 上次渲染帧距(beginRender 时记;endRender 作失拍判定) */
  private lastGap = 0;
  /** 升拍判据连续满足计数(渲染帧数;达 UPGRADE_WIN_SAMPLES×UPGRADE_HOLD_WINDOWS 即升一级;
   *  判据破/失拍/任何拍变更即清零——v3 p50 制的防抖面,替代旧 holdSince 墙钟) */
  private upHoldN = 0;
  private missStreak = 0;
  /** 簇内滞时累计(v7.1 持续门):Σ(gap−失拍阈) 逐失拍帧累加,断拍/拍变更/降档即清
   *  ——与 missStreak 同生命周期(有界瞬态簇吸收面,见 MISS_STALL_BUDGET_MS 注) */
  private missStallMs = 0;
  /** 入场结算护栏(v7 案②):>0 期间 capacityBreach 恒 false——降拍判据须 costWin
   *  全窗(60 渲染帧)证据才允许动作。构造/resetSampling 各挂满一次(入世界首簇重帧
   *  是 reset 之后的过期证据,不得以薄窗驱动扫拍;floor/miss-streak 不受此护栏) */
  private settleGuard = COST_WIN;

  /** 目标周期:用户 frameCap 天花板;cap=0(不设限)=1×vsync(拍=每 vsync 渲一次)。
   *  ★热修刃(2026-09-28):废除首版 60Hz 网格地板 max(GRID_MS,·)——原版网格地板是
   *  "逻辑=呈现同帧"架构下的速度保全手段,本仓逻辑 60Hz 解耦后只剩"静默覆盖用户
   *  设置"一条实害(cap=120/0 被压回 60=用户实报);subtle 只对齐不钳速(否决注见头注) */
  targetMs(cap = this.cap): number {
    return cap > 0 ? 1000 / cap : this.vsyncPeriod;
  }

  /** 拍地板:最小 k 使 k×vsync ≥ (1−容差)×目标周期(整数倍折算+估计噪声容差;
   *  cap=0/cap≥屏率 → 拍 1(全速);cap60@120Hz 拍 2;cap30@120Hz 拍 4;cap30@60Hz 拍 2) */
  minK(vsyncPeriod = this.vsyncPeriod, cap = this.cap): number {
    return Math.max(1, Math.ceil((this.targetMs(cap) * (1 - FLOOR_TOL)) / vsyncPeriod));
  }

  /** 拍容量预算(渲染帧成本预算=拍周期本身) */
  budget(k = this.k, vsyncPeriod = this.vsyncPeriod): number {
    return k * vsyncPeriod;
  }

  /** 渲染帧成本滚动 p50(中位数,空窗=0)——【升/降拍判据基】(v5 自洽:升降共用中位数,
   *  余量分隔——p50<budget(k−1)×0.9 升,p50>budget(k+1)×1.1 降(v6 帧率优先线,见头注
   *  v6);单帧尖峰只进 p95 诊断面,不驱动任何档位迁移,见头注 v5) */
  costP50(): number {
    if (this.costWin.length === 0) return 0;
    const s = [...this.costWin].sort((a, b) => a - b);
    return s[Math.floor(0.5 * (s.length - 1))];
  }

  /** 渲染帧成本滚动 p95(空窗=0)——【诊断面】(v5 起不驱动档位迁移:v4 失效形态=
   *  p95 降拍与 p50 升拍在边界会话同时成立 → flap;尖峰超支由失拍看门狗兜底) */
  costP95(): number {
    if (this.costWin.length === 0) return 0;
    const s = [...this.costWin].sort((a, b) => a - b);
    return s[Math.floor(0.95 * (s.length - 1))];
  }

  /**
   * 每个 rAF 回调必经(先于任何跳帧判定)——喂 vsync 序列估计周期。
   * cap:当前用户帧率上限(0=不设限),变更即时生效。
   */
  observeVsync(now: number, cap: number): void {
    this.cap = cap;
    let d: number | undefined;
    if (this.lastVsyncTs >= 0) {
      d = now - this.lastVsyncTs;
      if (d > VSYNC_GAP_RESET_MS) {
        this.vsyncDeltas.length = 0;            // 断流(tab 隐藏恢复):清窗防大空洞污染估计
      } else {
        this.vsyncDeltas.push(d);
        if (this.vsyncDeltas.length > VSYNC_WIN) this.vsyncDeltas.shift();
        // ★截尾均值(非中位数):渲染超支时回调流呈【双峰】(超支时长/剩余节拍交替——
        //  真实 Chrome 形态,busy 解堵即跑 rAF),中位数按窗奇偶在双峰间翻转=估计跳变
        //  (首版实测 60Hz 假失拍级联/地板翻转);截尾均值对双峰恢复真值、对单峰抖动
        //  ≈中位数、对罕见迟回调稳健
        const s = [...this.vsyncDeltas].sort((a, b) => a - b);
        // 截尾数须留 ≥1 样本(小窗 n=1/2 时 ceil(n×0.1) 会吃光窗口→除零/负分母)
        const trim = Math.min(Math.ceil(s.length * 0.1), (s.length - 1) >> 1);
        let sum = 0;
        for (let i = trim; i < s.length - trim; i++) sum += s[i];
        const mean = sum / (s.length - 2 * trim);
        this.vsyncPeriod = Math.min(VSYNC_MAX_MS, Math.max(VSYNC_MIN_MS, mean));
      }
    }
    this.lastVsyncTs = now;
    // 帧序计数=【估计 vsync 数】而非回调数:Chrome 忙合成器会合并回调(一次回调跨
    // 多个网格点),裸回调计数会欠数 → 拍滑一个 vsync(实机 120Hz cap30 实测 13 跳);
    // 按本回调间隔折算 vsync 数对合并鲁棒,对正常流(间隔≈估计值)恒 +1 同构
    if (d === undefined) this.ordinal++;
    else this.ordinal += Math.min(8, Math.max(1, Math.round(d / this.vsyncPeriod)));
  }

  /** 本回调是否落拍(渲染)。序数计满即拍;时间护栏仅在拍周期本身够不到目标时兜底
   *  (vsync 估计失真/未锁 vsync 的退化 rAF)——拍周期已达目标时纯序数落拍,护栏
   *  不参与(否则 rAF 抖动会让护栏自造跳帧=引回摆动) */
  shouldRender(now: number): boolean {
    if (this.ordinal < this.k) return false;
    if (this.k * this.vsyncPeriod >= this.targetMs() - TARGET_GUARD_MS) return true;
    return now - this.lastRenderAt >= this.targetMs() - TARGET_GUARD_MS;
  }

  /** 降拍判据(v6 帧率优先制+ v7 案②结算护栏;protected hook=红判别器旧侧复刻点):
   *  持续中位超支超过【下一更低档】预算×DOWNGRADE_MARGIN,且 costWin 全窗成熟
   *  (settleGuard=0——入世界首簇重帧不得以薄窗驱动扫拍,见头注 v7)。v5 旧线=
   *  costP50>budget(k)(中位刚超当前拍预算即降)已废——用户实报帧耗 9-15ms 场景被锁
   *  60/40,而该区间 k=1 realized(~90-110 不齐)仍高于 60 档对齐帧率,帧率优先留高档
   *  (政策/边界语义见头注 v6)。单帧尖峰【不】在此——beat 对齐下顺延一个 vsync 无感,
   *  持续中位超支才是真降档理由 */
  protected capacityBreach(): boolean {
    if (this.settleGuard > 0) return false;
    return this.costP50() > this.budget(this.k + 1) * DOWNGRADE_MARGIN;
  }

  /** 失拍判据(v7 案①对齐豁免;protected hook=红判别器旧侧复刻点):帧距超
   *  (k+MISS_SLACK)×vsync 且【不】恰为 (k+1)×vsync(±豁免带)=真失稳(离网格漂移);
   *  恰滑一拍落回网格(n=k+1)=对齐顺延(present 恒落网格=零抖动;k=1+帧耗 9-15 的
   *  物理 2-vsync 锁相节奏属此)——不是容量失稳,不计失拍。★只豁免单拍顺延:更深
   *  滑移(n≥k+2)照旧计失拍——持续深滑=真容量不足,且网格走查驱动器下持续 stall 的
   *  帧距恰量化到网格倍点上,全倍点豁免会失明(连续失拍看门狗测试即此形态)。实测锚
   *  见头注 v7 */
  protected isCapacityMiss(gap: number, vsync: number): boolean {
    if (gap <= (this.k + MISS_SLACK) * vsync) return false;
    const n = Math.round(gap / vsync);
    if (n === this.k + 1 && Math.abs(gap - n * vsync) <= Math.max(MISS_GRID_TOL_REL * vsync, MISS_GRID_TOL_MS)) return false;
    return true;
  }

  /** 升拍判据(v5 余量制;protected hook=红判别器旧侧复刻点):中位数装进上一级
   *  预算且留 UPGRADE_HEADROOM 余量 */
  protected upgradeCleared(): boolean {
    return this.costP50() < this.budget(this.k - 1) * UPGRADE_HEADROOM;
  }

  /** 渲染开始(shouldRender 为真后调用):重置序数、记帧距锚 */
  beginRender(now: number): void {
    this.lastGap = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.lastRenderAt = now;
    this.ordinal = 0;
  }

  /** 失拍降档双门(v7.1 瞬态簇豁免;protected hook=红判别器旧侧复刻点):连续性
   *  (missStreak≥MISS_STREAK_DOWNGRADE)×持续量(滞时累计≥MISS_STALL_BUDGET_MS)
   *  同时成立才降。旧语义(连续 2 即降)由 OldAlignedMissBeat 覆写复刻=案①红面。 */
  protected missDowngradeDue(): boolean {
    return this.missStreak >= MISS_STREAK_DOWNGRADE && this.missStallMs >= MISS_STALL_BUDGET_MS;
  }

  /** 渲染结束:now=渲染帧完成时刻(performance.now,与 rAF 时间戳同源)。跑拍状态机 */
  endRender(now: number): void {
    const cost = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.costWin.push(cost);
    if (this.costWin.length > COST_WIN) this.costWin.shift();
    if (this.settleGuard > 0) this.settleGuard--;   // v7 案②:全窗证据计数(costWin 满=护栏释放)
    const vsync = this.vsyncPeriod;
    const floor = this.minK();
    const prevK = this.k;
    const prevReason = this.lastReason;
    const preState = { cost, gap: this.lastGap, vsync, p50: this.costP50(), p95: this.costP95(),
      breach: this.capacityBreach(), miss: this.missStreak, stallMs: this.missStallMs,
      floor, settle: this.settleGuard };

    // 失拍记账(帧距在 beginRender 记)——序数计数天然吸附下一拍,这里只做容量诊断。
    // 对齐顺延豁免见 isCapacityMiss(v7 案①:落 n×vsync 网格的长帧距=锁相节奏非失稳);
    // 滞时累计=双门之持续量(v7.1,见 missDowngradeDue/MISS_STALL_BUDGET_MS 注)
    if (this.isCapacityMiss(this.lastGap, vsync)) {
      this.missStreak++;
      this.missStallMs += Math.max(0, this.lastGap - (this.k + MISS_SLACK) * vsync);
    } else {
      this.missStreak = 0;
      this.missStallMs = 0;
    }

    // 降拍(v6 帧率优先制,唯一成本判据):持续中位超支超过【下一更低档】预算×1.1 →
    // 逐级扫到首个能容纳的拍。帧率优先政策(用户明令,见头注 v6):v5 旧线"中位刚超
    // 当前拍预算即降"把帧耗 9-15ms 会话锁 60/40,已废——两档预算之间的不齐高帧率
    // 优于对齐低帧率。★v4 的"单帧超预算立即降"仍废除——beat 对齐下单帧超支=顺延
    // 一个 vsync(对齐节拍,无感),不是降档理由;尖峰超支由下方失拍看门狗兜底
    while (this.k < BEAT_K_MAX && this.capacityBreach()) {
      this.k++;
      this.lastReason = 'capacity';
    }
    // 拍地板(vsync 重估/cap 收紧可抬高 minK——即时跟上)
    if (this.k < floor) {
      this.k = floor;
      this.lastReason = 'floor';
    }

    if (this.k !== prevK) {
      // 任何拍变更:相位重锚+记账复位(旧拍成本样本对新拍预算失义;不追赶中途)
      this.ordinal = 0;
      this.missStreak = 0;
      this.missStallMs = 0;
      this.upHoldN = 0;
    } else {
      // 单次失拍=余量警示:升拍保持即弃(拍可信度存疑,重计连续窗)
      if (this.missStreak > 0) this.upHoldN = 0;
      // 滞回升拍(一步):k>地板 且 p50<budget(k−1)×0.9(余量) 连续 2 半窗(60 渲染帧);
      // 条件破即弃(v5 余量制见头注:中位数贴预算的边界会话驻留低档,消除升/降打架面;
      // 防抖=连续窗计数,轻于旧 2s)
      if (this.k > floor && this.upgradeCleared()) {
        if (++this.upHoldN >= UPGRADE_WIN_SAMPLES * UPGRADE_HOLD_WINDOWS) {
          this.k--;
          this.lastReason = 'upgrade';
          this.ordinal = 0;          // 相位重锚:升拍后不追赶中途
          this.upHoldN = 0;          // 下一级重新计窗
          this.missStreak = 0;
        }
      } else {
        this.upHoldN = 0;
      }
      // 连续失拍+滞时双门=容量不足 → 降拍(单次失拍只弃升拍保持,不降档;v7.1
      // 瞬态簇豁免——有界大帧簇不降,真持续失稳 ~0.2-0.4s 内必触,见头注)
      if (this.missDowngradeDue() && this.k < BEAT_K_MAX) {
        this.k++;
        this.lastReason = 'miss-streak';
        this.ordinal = 0;
        this.missStreak = 0;
        this.missStallMs = 0;
        this.upHoldN = 0;
      }
    }
    // ★拍迁移记录仪（2026-09-30 "升 120 被拉回 60"定谳仪）:任何拍变更即打印
    //  完整降/升拍瞬间状态（work=帧 span/vsync 估计/p50/ breach 判定/失拍账/
    //  地板/护栏）——三降档臂与观测数据对不上账的 Blackbox 一发定谳。
    if (this.k !== prevK || this.lastReason !== prevReason) {
      console.warn(`[beat] k:${prevK}→${this.k} reason=${this.lastReason} ` +
        `work=${preState.cost.toFixed(1)} gap=${preState.gap.toFixed(1)} vsync=${preState.vsync.toFixed(2)} ` +
        `p50=${preState.p50.toFixed(1)} p95=${preState.p95.toFixed(1)} breach=${preState.breach} ` +
        `miss=${preState.miss} stall=${preState.stallMs.toFixed(0)} floor=${preState.floor} guard=${preState.settle}`);
    }
  }

  /**
   * 采样面复位(拍 k 归地板,清成本/失拍/升拍保持/相位记账;vsync 估计保留——
   * 它由 observeVsync 连续维护,与负载无关)。
   * 调用点=进世界(afterWorldLoad)——世界生成/读档期的重载帧成本与随之的降拍
   * 均为过期证据,不得带进图后(实测污染面:生成页把 k 压到 5-6,进图后逐级爬回
   * 耗时数十秒=整段 30-100ms 节拍;模式切换经同一路径受益)
   */
  resetSampling(): void {
    this.costWin.length = 0;
    this.missStreak = 0;
    this.missStallMs = 0;
    this.upHoldN = 0;
    this.lastGap = 0;
    this.lastRenderAt = -1;
    this.ordinal = 0;
    this.settleGuard = COST_WIN;   // v7 案②:进世界首簇重帧是 reset 之后的证据,重挂全窗门槛
    this.k = Math.max(1, this.minK());
    this.lastReason = 'init';
  }

  /** 诊断快照(探针/调试面板) */
  snapshot(): { k: number; vsync: number; p50: number; p95: number; target: number; reason: BeatReason; miss: number } {
    return {
      k: this.k,
      vsync: Math.round(this.vsyncPeriod * 100) / 100,
      p50: Math.round(this.costP50() * 100) / 100,
      p95: Math.round(this.costP95() * 100) / 100,
      target: Math.round(this.targetMs() * 100) / 100,
      reason: this.lastReason,
      miss: this.missStreak,
    };
  }
}

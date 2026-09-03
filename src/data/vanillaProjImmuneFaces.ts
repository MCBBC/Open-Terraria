// 弹幕 SetDefaults 免疫三旗【纯代码补表】（★GC1 清零批二波蓝队裁决件 F5，2026-08-31）。
//
// 背景：vanilla-projectiles.json 只有 localNPCHitCooldown / idStaticNPCHitCooldown
// 两个数值列，缺 usesLocalNPCImmunity / usesIDStaticNPCImmunity /
// appliesImmunityTimeOnSingleHits 三个布尔列 → 命中尾免疫梯的 face 判定只能靠
// 调用点硬编码（F1 案发根因：WeaponProj YoyoShotProj 空参调用致四型全走末档）。
// 提取器重生成数据列涉 recon 工具链整面（不采）；本表为忠实最小版——全部值由
// Terarria1457/Terraria/Projectile.cs SetDefaults(int Type)（:699-10676）逐型亲读
// 抓取，布尔位锚点行号随键注明。
//
// 提取口径：
//   · 遍历 type==/type>=..<= 分派块，收集 usesLocalNPCImmunity / usesIDStaticNPCImmunity /
//     appliesImmunityTimeOnSingleHits 布尔赋值 + 局部冷却数值写点；
//   · 帮助函数展开：UseGroupStaticImmunity(N)（:10678，= idStatic+cd10）、
//     ApplyGemStaffStats()（:10685，= usesLocal+cd60）按调用所在分派块归型；
//   · 77 号特殊处理：SetDefaults 内 `switch(2)` 常量折叠，case1(UseGroupStaticImmunity)
//     是死代码、活跃 case2 = usesLocal+cd30（:1587-1592）——非双旗型；
//   · 无显式 cd 的 idStatic 型保留默认 -1（字段缺省 :468，如 644 = -1 属原文本相）。
// 消费：projTargets.noteVanillaProjImmune 桥层（调用点未显式传 face 参时优先读本表，
//   显参 true 恒覆盖）。梯子本身在 data/vanillaProjImmuneTiers.ts（1457 :14031-14183）。

/** 三旗面：语义对应 Projectile.SetDefaults 同名布尔字段 */
export interface ProjImmuneFace {
  /** usesLocalNPCImmunity（局部逐弹表;命中尾 immune[owner]=0 清全局窗,cd!=-2 门） */
  usesLocal?: boolean;
  /** usesIDStaticNPCImmunity（全场同型共享表;同上清全局窗,pen!=1||applies 门） */
  idStatic?: boolean;
  /** appliesImmunityTimeOnSingleHits（单发弹也回写窗口——idStatic 支与末档共用谓词） */
  applies?: boolean;
}

export const PROJ_IMMUNE_FACES: Readonly<Record<number, ProjImmuneFace>> = {
     // 22 水花权杖【本表不登记】（R2-F3 勘误 2026-09-03）：usesLocalNPCImmunity=true
     // + localNPCHitCooldown=12 整段包在 `if (Main.remixWorld)` 支内
     // （Projectile.cs:1052-1057,branch :1042;writes :1055-1056）——条件档非静态面,
     //  曾按无条件抓取=非 remix 世界也走局部档（命中尾写 0 清全局窗）,原版非 remix
     //  缺省面 = 末档写 10t 全局窗（penetrate=5）。运行时 remix 臂在 Arrow.ts
     //  fixedUpdate 头补 localImmune=12（world.seedFlags.remix 载体）,命中环由此
     //  显参 localFace=true（桥层显参恒权威）⇒ remix 档不缺、非 remix 档归位
     23: { usesLocal: true },  // branch :1059; writes :1068; cd=12
     34: { usesLocal: true },  // branch :1164; writes :1173; cd=12
     36: { usesLocal: true },  // branch :1184; writes :1197; cd=7
     77: { usesLocal: true },  // branch :1565; writes :1591; cd=30(const-folded switch(2) case2,死支 case1 已剔)
     79: { usesLocal: true },  // branch :1596; writes :1605; cd=12
     85: { usesLocal: true },  // branch :1662; writes :1672; cd=-1
     93: { usesLocal: true },  // branch :1767; writes :1776; cd=20
    119: { idStatic: true },  // branch :2082; writes :2092; idStaticCd=10
    121: { usesLocal: true },  // branch :2107; writes :2114; cd=60
    122: { usesLocal: true },  // branch :2116; writes :2123; cd=60
    123: { usesLocal: true },  // branch :2125; writes :2132; cd=60
    124: { usesLocal: true },  // branch :2134; writes :2141; cd=60
    125: { usesLocal: true },  // branch :2143; writes :2150; cd=60
    126: { usesLocal: true },  // branch :2152; writes :2159; cd=60
    132: { usesLocal: true },  // branch :2211; writes :2221; cd=10
    133: { usesLocal: true },  // branch :2224; writes :2232; cd=-1
    136: { usesLocal: true },  // branch :2253; writes :2261; cd=-1
    139: { usesLocal: true },  // branch :2282; writes :2290; cd=-1
    142: { usesLocal: true },  // branch :2311; writes :2319; cd=-1
    156: { usesLocal: true },  // branch :2436; writes :2446; cd=10
    167: { idStatic: true, applies: true },  // branch :2560; writes :2568,2570; idStaticCd=1
    168: { idStatic: true, applies: true },  // branch :2560; writes :2568,2570; idStaticCd=1
    169: { idStatic: true, applies: true },  // branch :2560; writes :2568,2570; idStaticCd=1
    170: { idStatic: true, applies: true },  // branch :2560; writes :2568,2570; idStaticCd=1
    181: { idStatic: true },  // branch :2675; writes :2686; idStaticCd=10
    189: { idStatic: true },  // branch :2766; writes :2777; idStaticCd=10
    190: { usesLocal: true },  // branch :2781; writes :2790; cd=14
    228: { idStatic: true },  // branch :3139; writes :3150; idStaticCd=10
    229: { idStatic: true },  // branch :3153; writes :3163; idStaticCd=10
    239: { idStatic: true },  // branch :3206; writes :3218; idStaticCd=10
    242: { usesLocal: true },  // branch :3240; writes :3254; cd=-1
    245: { idStatic: true },  // branch :3276; writes :3288; idStaticCd=10
    250: { idStatic: true },  // branch :3324; writes :3334; idStaticCd=10
    251: { idStatic: true },  // branch :3337; writes :3350; idStaticCd=10
    263: { idStatic: true },  // branch :3476; writes :3490; idStaticCd=8
    265: { usesLocal: true },  // branch :3505; writes :3514; cd=10
    266: { idStatic: true },  // branch :3518; writes :3528; idStaticCd=12
    274: { idStatic: true },  // branch :3600; writes :3613; idStaticCd=10
    281: { idStatic: true },  // branch :3678; writes :3687; idStaticCd=10
    286: { idStatic: true, applies: true },  // branch :3743; writes :3755,3756; idStaticCd=60
    297: { idStatic: true },  // branch :3872; writes :3882; idStaticCd=10
    301: { usesLocal: true },  // branch :3918; writes :3927; cd=10
    309: { usesLocal: true },  // branch :4011; writes :4021; cd=10
    311: { usesLocal: true },  // branch :4035; writes :4045; cd=10
    317: { usesLocal: true },  // branch :4101; writes :4111; cd=10
    355: { usesLocal: true },  // branch :4453; writes :4462; cd=10
    376: { idStatic: true },  // branch :4602; writes :4614; idStaticCd=6
    387: { idStatic: true },  // branch :4700; writes :4713; idStaticCd=16
    388: { idStatic: true },  // branch :4716; writes :4729; idStaticCd=12
    390: { idStatic: true },  // branch :4744; writes :4754; idStaticCd=15
    391: { idStatic: true },  // branch :4744; writes :4754; idStaticCd=15
    392: { idStatic: true },  // branch :4744; writes :4754; idStaticCd=15
    393: { usesLocal: true },  // branch :4757; writes :4767; cd=18
    394: { usesLocal: true },  // branch :4757; writes :4767; cd=18
    395: { usesLocal: true },  // branch :4757; writes :4767; cd=18
    407: { idStatic: true },  // branch :4880; writes :4893; idStaticCd=10
    419: { idStatic: true },  // branch :4953; writes :4959; idStaticCd=3
    420: { idStatic: true },  // branch :4953; writes :4959; idStaticCd=3
    421: { idStatic: true },  // branch :4953; writes :4959; idStaticCd=3
    422: { idStatic: true },  // branch :4953; writes :4959; idStaticCd=3
    482: { idStatic: true },  // branch :5574; writes :5586; idStaticCd=10
    496: { usesLocal: true },  // branch :5694; writes :5704; cd=-1
    502: { usesLocal: true },  // branch :5734; writes :5742; cd=10
    503: { usesLocal: true },  // branch :5745; writes :5756; cd=15
    504: { idStatic: true },  // branch :5759; writes :5769; idStaticCd=10
    509: { idStatic: true },  // branch :5789; writes :5795; idStaticCd=10
    511: { idStatic: true },  // branch :5807; writes :5816; idStaticCd=10
    512: { idStatic: true },  // branch :5819; writes :5828; idStaticCd=10
    513: { idStatic: true },  // branch :5831; writes :5840; idStaticCd=10
    524: { idStatic: true },  // branch :5941; writes :5952; idStaticCd=10
    532: { usesLocal: true },  // branch :5986; writes :5995; cd=5
    533: { usesLocal: true },  // branch :5999; writes :6012; cd=12
    566: { idStatic: true },  // branch :6174; writes :6185; idStaticCd=10
    567: { idStatic: true },  // branch :6189; writes :6206; idStaticCd=10
    569: { idStatic: true },  // branch :6208; writes :6206; idStaticCd=10
    570: { idStatic: true },  // branch :6208; writes :6206; idStaticCd=10
    571: { idStatic: true },  // branch :6208; writes :6206; idStaticCd=10
    597: { usesLocal: true },  // branch :6463; writes :6470; cd=60
    603: { idStatic: true },  // branch :6063; writes :6070; idStaticCd=10
    604: { idStatic: true },  // branch :6073; writes :6083; idStaticCd=10
    611: { usesLocal: true },  // branch :6569; writes :6582; cd=6
    612: { usesLocal: true },  // branch :6586; writes :6597; cd=6
    617: { usesLocal: true },  // branch :6646; writes :6657; cd=8
    618: { usesLocal: true },  // branch :6660; writes :6670; cd=20
    623: { usesLocal: true },  // branch :6701; writes :6716; cd=5
    626: { usesLocal: true },  // branch :6737; writes :6753; cd=7
    627: { usesLocal: true },  // branch :6737; writes :6753; cd=7
    629: { usesLocal: true },  // branch :6756; writes :6753; cd=7
    638: { usesLocal: true },  // branch :6860; writes :6871; cd=-1
    639: { usesLocal: true },  // branch :6875; writes :6886; cd=-1
    640: { usesLocal: true },  // branch :6891; writes :6901; cd=-1
    642: { usesLocal: true },  // branch :6906; writes :6915; cd=10
    644: { idStatic: true },  // branch :6943; writes :6953
    645: { usesLocal: true },  // branch :6955; writes :6965; cd=-1
    656: { usesLocal: true },  // branch :7050; writes :7059; cd=8
    661: { usesLocal: true },  // branch :7110; writes :7121; cd=-1
    664: { usesLocal: true },  // branch :7155; writes :7162; cd=-1
    666: { usesLocal: true },  // branch :7155; writes :7162; cd=-1
    668: { usesLocal: true },  // branch :7155; writes :7162; cd=-1
    680: { usesLocal: true },  // branch :7255; writes :7262; cd=-1
    688: { usesLocal: true },  // branch :7327; writes :7334; cd=3
    689: { usesLocal: true },  // branch :7327; writes :7334; cd=3
    690: { usesLocal: true },  // branch :7327; writes :7334; cd=3
    694: { usesLocal: true },  // branch :7356; writes :7362; cd=30
    695: { usesLocal: true },  // branch :7356; writes :7362; cd=30
    696: { usesLocal: true },  // branch :7356; writes :7362; cd=30
    697: { usesLocal: true },  // branch :7368; writes :7382; cd=12
    698: { usesLocal: true },  // branch :7387; writes :7398; cd=-1
    699: { idStatic: true },  // branch :7404; writes :7417; idStaticCd=10
    700: { usesLocal: true },  // branch :7421; writes :7430; cd=-1
    704: { usesLocal: true },  // branch :7449; writes :7458; cd=-1
    706: { usesLocal: true },  // branch :7463; writes :7472; cd=10
    707: { usesLocal: true },  // branch :7476; writes :7489; cd=6
    708: { usesLocal: true },  // branch :7493; writes :7506; cd=6
    710: { usesLocal: true },  // branch :7523; writes :7534; cd=-1
    711: { usesLocal: true },  // branch :7538; writes :7548; cd=-1
    723: { usesLocal: true },  // branch :7648; writes :7657; cd=10
    724: { usesLocal: true },  // branch :7648; writes :7657; cd=10
    725: { usesLocal: true },  // branch :7648; writes :7657; cd=10
    726: { usesLocal: true },  // branch :7648; writes :7657; cd=10
    728: { usesLocal: true },  // branch :7661; writes :7671; cd=-1
    729: { idStatic: true },  // branch :7674; writes :7687; idStaticCd=10
    755: { usesLocal: true },  // branch :7779; writes :7791; cd=-1
    756: { usesLocal: true },  // branch :7795; writes :7806; cd=25
    758: { idStatic: true },  // branch :7816; writes :7828; idStaticCd=10
    759: { usesLocal: true },  // branch :7831; writes :7843; cd=15
    777: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    781: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    785: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    788: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    794: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    797: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    800: { usesLocal: true },  // branch :7949; writes :7951; cd=-1
    812: { usesLocal: true },  // branch :7955; writes :7951; cd=-1
    818: { usesLocal: true },  // branch :8007; writes :8018; cd=-1
    833: { usesLocal: true },  // branch :8084; writes :8095; cd=10
    834: { usesLocal: true },  // branch :8098; writes :8109; cd=10
    835: { usesLocal: true },  // branch :8112; writes :8123; cd=10
    856: { usesLocal: true },  // branch :8208; writes :8219; cd=-1
    857: { usesLocal: true },  // branch :8222; writes :8233; cd=10
    864: { usesLocal: true },  // branch :8286; writes :8292; cd=10
    866: { usesLocal: true },  // branch :8314; writes :8324; cd=-1
    916: { usesLocal: true },  // branch :8678; writes :8686; cd=-1
    917: { usesLocal: true },  // branch :8703; writes :8711; cd=20
    918: { usesLocal: true },  // branch :8691; writes :8697; cd=-1
    931: { usesLocal: true },  // branch :8828; writes :8841; cd=30
    932: { usesLocal: true },  // branch :8844; writes :8856; cd=60
    933: { usesLocal: true },  // branch :8859; writes :8870; cd=15 / MaxUpdates
    937: { idStatic: true },  // branch :8907; writes :8916; idStaticCd=10
    946: { usesLocal: true },  // branch :8924; writes :8936; cd=-1
    951: { idStatic: true },  // branch :8971; writes :8983; idStaticCd=10
    953: { usesLocal: true },  // branch :8990; writes :9001; cd=80
    963: { usesLocal: true },  // branch :9102; writes :9115; cd=20
    964: { usesLocal: true },  // branch :9129; writes :9137; cd=-1
    969: { idStatic: true },  // branch :9171; writes :9180; idStaticCd=25
    972: { usesLocal: true },  // branch :9300; writes :9308; cd=-1
    973: { usesLocal: true },  // branch :9317; writes :9325; cd=10
    974: { usesLocal: true },  // branch :9239; writes :9249; cd=-1
    976: { usesLocal: true },  // branch :9272; writes :9282; cd=-1
    977: { usesLocal: true },  // branch :9210; writes :9220; cd=-1
    978: { usesLocal: true },  // branch :9255; writes :9267; cd=-1
    982: { usesLocal: true },  // branch :9356; writes :9364; cd=-1
    983: { usesLocal: true },  // branch :9373; writes :9381; cd=-1
    984: { usesLocal: true },  // branch :9390; writes :9398; cd=-1
    985: { usesLocal: true },  // branch :9407; writes :9415; cd=-1
    997: { usesLocal: true },  // branch :9468; writes :9476; cd=-1
   1002: { idStatic: true },  // branch :9525; writes :9537; idStaticCd=15
   1022: { usesLocal: true },  // branch :9669; writes :9679; cd=18
   1023: { usesLocal: true },  // branch :9683; writes :9692; cd=-1
   1024: { usesLocal: true },  // branch :9695; writes :9705; cd=-1
   1036: { usesLocal: true },  // branch :9769; writes :9777; cd=20
   1037: { usesLocal: true },  // branch :9782; writes :9788; cd=-1
   1038: { usesLocal: true },  // branch :9795; writes :9803; cd=-1
   1039: { usesLocal: true },  // branch :9809; writes :9820; cd=-1
   1041: { usesLocal: true },  // branch :9836; writes :9847; cd=25
   1043: { usesLocal: true },  // branch :9860; writes :9868; cd=-1
   1044: { usesLocal: true },  // branch :9877; writes :9889; cd=-1
   1045: { usesLocal: true },  // branch :9892; writes :9902; cd=-1
   1059: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1060: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1061: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1062: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1063: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1064: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1065: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1066: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1067: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1068: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1069: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1070: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1071: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1072: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1074: { usesLocal: true },  // branch :10049; writes :10058; cd=10
   1075: { usesLocal: true },  // branch :10008; writes :10017; cd=10
   1076: { usesLocal: true },  // branch :10024; writes :10033; cd=10
   1093: { usesLocal: true },  // branch :10197; writes :10207; cd=9
   1100: { usesLocal: true },  // branch :10267; writes :10278; cd=15 / MaxUpdates
   1101: { usesLocal: true },  // branch :10019; writes :10017; cd=10
   1102: { usesLocal: true },  // branch :10035; writes :10033; cd=10
   1106: { idStatic: true },  // branch :10305; writes :10314; idStaticCd=15
   1112: { usesLocal: true },  // branch :10364; writes :10374; cd=9
   1115: { usesLocal: true },  // branch :10403; writes :10412; cd=-1
   1116: { usesLocal: true },  // branch :10415; writes :10423; cd=-1
   1118: { usesLocal: true },  // branch :10452; writes :10462; cd=30
   1119: { usesLocal: true },  // branch :10466; writes :10476; cd=30
   1120: { usesLocal: true },  // branch :10481; writes :10488; cd=60
   1121: { usesLocal: true },  // branch :10493; writes :10499; cd=60
   1122: { idStatic: true },  // branch :10439; writes :10449; idStaticCd=10
   1125: { usesLocal: true },  // branch :10530; writes :10541; cd=-1
   1126: { usesLocal: true },  // branch :10545; writes :10553; cd=-1
   1127: { usesLocal: true },  // branch :10561; writes :10564; cd=-1
   1128: { idStatic: true },  // branch :10567; writes :10578; idStaticCd=30
   1129: { usesLocal: true },  // branch :10582; writes :10593; cd=-1
   1130: { usesLocal: true },  // branch :10599; writes :10610; cd=-1
   1131: { usesLocal: true },  // branch :10613; writes :10619; cd=60
   1132: { usesLocal: true },  // branch :10626; writes :10632; cd=60
   1133: { usesLocal: true },  // branch :7648; writes :7657; cd=10
   1134: { idStatic: true, applies: true },  // branch :10638; writes :10652,10645; idStaticCd=20
   1135: { idStatic: true },  // branch :10655; writes :10666; idStaticCd=10
};

/** 查面（无登记返回 null——调用方回落数据面 penetrate ?? 1 的末档判定） */
export function projImmuneFaceOf(type: number): ProjImmuneFace | null {
  return PROJ_IMMUNE_FACES[type] ?? null;
}

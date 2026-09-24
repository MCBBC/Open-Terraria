// 从 Item.cs SetDefaults1..5 + SetFoodDefaults 提取 Item.width/height 逐 vid 终值
// → src/data/vanilla-itemdims.json（{ "vid": [w, h] }）。
//
// ★BJ326 件 2（2026-09-24）：掉落物盒 12×12 统一简化 → 原版按 vid 尺寸（Item.width/
//   height,Item.cs 字段缺省 0,case 体逐项赋值）。消费面 = ItemDrop 命中盒（物理/
//   拾取/岩浆烧毁/微光探针全吃 this.w/h;渲染中心锚定不变）。此前仓内无该数据面
//   （items.ts:2230 明记"width/height 仓内非放置物品无消费面不建字段"——任务书
//   "vanilla-itemstats 已有"系误记,实测 1024 条全为盔甲/配饰档,零 width 键）。
//
// 解析纪律 = extract-itemrare.mjs 同款（2026-08-13 五类盲区修复口径）：
//   ① 仅扫 SetDefaults1..5 + SetFoodDefaults（SetDefaults :48666 按 IsFood 分派,
//      食物只走 SetFoodDefaults :48041;ResetStats 不重置 width/height）;
//   ② case 标签列合并 / 体终止 = 同深度 case|default|break|return|goto;
//   ③ 只认 case 体顶层（组深+1）无条件赋值——嵌套 if/switch 内赋值（变体分支）
//      忽略,建模基础变体;
//   ④ 顶层赋值序列【最后一个】生效（工厂调用与显式赋值按源序覆盖）;
//   ⑤ 跨 switch 组【先写为准】（反编译 SetDefaults 为顺序独立 switch 链,后置重叠
//      标签死代码——itemrare case 2291 判例同源）;
//   ⑥ 工厂方法尺寸静态不可见（方法体内赋值）→ 工厂映射表：
//      - 定值工厂 = 方法体内 `width = N; height = M;` 直录（本文件头部逐方法
//        awk 实测,见 FACTORY_DIMS 注）;
//      - 参化工厂（DefaultToFood/HealingPotion/Headgear/Body/Legs/GolfClub/
//        LawnMower）= 方法体 `width = newwidth;` → 调用点前两整型实参;
//   ⑦ 反编译无 `width = height = N` 联合赋值（实测 0 处）,无需处理;
//   ⑧ SetDefaults 尾段（:48760-48947 的 if(type==2015) 族）无 width/height 赋值
//      （实测 0 行）,不扫。
//
// 覆盖口径：case 体未赋 width/height 的 vid = 原版实例字段保留前值（C# 对象复用
//   泄漏）/0——本仓不可复现,运行时回落 12×12（ItemDrop 旧统一盒）。提取器输出
//   缺口计数供复核；★era guard（追加时代判例）：重产 vs 现库动态 diff,现库有而
//   重产盖不住的 vid 非空即拒 exit 1（防 1457 重放 1456 把新物品洗成 12×12 兜底）。
//   --dump 对账通道不写盘不受守卫限制。
import { readFileSync, writeFileSync, writeSync, existsSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
export const SRC_VER = process.env.SW_ITEM_VER ?? '1457';

export function extractItemDims(src) {
  const LINES = src.split('\n');

  /** 方法体切片（从签名行到配平闭括号,含尾行）——itemrare methodRange 同款 */
  function methodRange(name) {
    const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
    if (sig < 0) throw new Error(`method ${name} not found`);
    let depth = 0;
    for (let i = sig; i < LINES.length; i++) {
      depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
      if (depth === 0 && i > sig) return [sig, i];
    }
    throw new Error(`method ${name} unbalanced`);
  }

  const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
    .map((n) => methodRange(n));

  // ---- 定值工厂映射（方法体内 width/height 直录值；行号锚 1457）----
  // DefaultToTorch :48471(10×12) / PlaceableTile :48489(14×14) / PlaceableWall
  // :48405(12×12) / Bomb :47771(8×28) / Solution :47800(10×12) / Whip :47811
  // (18×18) / Bow :48425(14×30) / Minecart :48398(36×26) / Banner :47754(10×24) /
  // Monolith :47762(22×32) / Kite :47829(20×28) / Staff :48016(40×40) / Spear
  // :48025(32×32) / GolfBall :35445(18×20) / QuestFish :27652(26×26) /
  // CapturedCritter :48001(12×12) / Vanitypet :47937(16×30) / SeaShell :47967(22×22) /
  // VoiceOverrideAccessory :47786(24×24) / MusicBox :48638(24×24)
  // ——DefaultToThrownWeapon/RangedWeapon/MagicWeapon 方法体无 width 赋值
  //   （实测 NONE）,不入表。
  const FACTORY_DIMS = {
    DefaultToTorch: [10, 12],
    DefaultToPlaceableTile: [14, 14],
    DefaultToPlaceableWall: [12, 12],
    DefaultToBomb: [8, 28],
    DefaultToSolution: [10, 12],
    DefaultToWhip: [18, 18],
    DefaultToBow: [14, 30],
    DefaultToMinecart: [36, 26],
    DefaultToBanner: [10, 24],
    DefaultToMonolith: [22, 32],
    DefaultToKite: [20, 28],
    DefaultToStaff: [40, 40],
    DefaultToSpear: [32, 32],
    DefaultToGolfBall: [18, 20],
    DefaultToQuestFish: [26, 26],
    DefaultToCapturedCritter: [12, 12],
    DefaultToVanitypet: [16, 30],
    DefaultToSeaShell: [22, 22],
    DefaultToVoiceOverrideAccessory: [24, 24],
    DefaultToMusicBox: [24, 24],
  };
  // 参化工厂（width = newwidth; height = newheight;）→ 调用点前两整型实参。
  // 缺省参（形参带缺省值,调用点可省）——★FX34b 判例：形参缺省读签名行勿信注释。
  //   Accessory/Guitar/InfoAccessory 签名 = (newwidth = 24, newheight = 24),
  //   InfoAccessory 委托 DefaultToAccessory(newwidth, newheight)（:47786 域）。
  const PARAM_FACTORIES = {
    DefaultToFood: [undefined, undefined],
    DefaultToHealingPotion: [undefined, undefined],
    DefaultToHeadgear: [undefined, undefined],
    DefaultToBody: [undefined, undefined],
    DefaultToLegs: [undefined, undefined],
    DefaultToGolfClub: [undefined, undefined],
    DefaultToLawnMower: [undefined, undefined],
    DefaultToAccessory: [24, 24],
    DefaultToGuitar: [24, 24],
    DefaultToInfoAccessory: [24, 24],
  };
  // 工厂调用两段式匹配：`Name(args)` 全名查表（勿用前缀交替——m[1] 已含 DefaultTo,
  // 曾拼出 DefaultToDefaultToInfoAccessory 双前缀伪名全表漏配）；零参/非整参经
  // 形参缺省值兜底（Accessory 族 (newwidth=24, newheight=24) 签名缺省）。
  const FACTORY_CALL = /^(DefaultTo[A-Za-z]+)\(([^;]*)\);?$/;

  const DIMS = {};
  const RETRY = [];   // 委托未就绪的组（SetDefaultsN(M) 目标尚无 dims → 后置重试）

  for (const [from, to] of REGIONS) {
    const groups = []; // { ids, depth, w, h }
    const groupAt = (d) => {
      for (let i = groups.length - 1; i >= 0; i--) if (groups[i].depth === d) return groups[i];
      return null;
    };
    const flush = (g) => {
      if (!g) return;
      // 委托入口（`SetDefaults1(4);` 族）：目标 id dims 就绪 → 按源序作基底,
      // 后续显式赋值覆盖（case 3351 委托 SetDefaults1(4) 后 width=(height=28)）;
      // 未就绪 → 整组入重试队列（先写为准语义不变）
      if (g.delegate !== undefined && g.w === undefined && g.h === undefined) {
        const base = DIMS[g.delegate];
        if (base !== undefined) { g.w = base[0]; g.h = base[1]; }
        else { RETRY.push(g); groups.splice(groups.indexOf(g), 1); return; }
      }
      for (const id of g.ids) {
        // 先写为准（跨 switch 组）：首个拿到完整 [w,h] 的组生效
        if (DIMS[id] === undefined) {
          if (g.w !== undefined && g.h !== undefined) DIMS[id] = [g.w, g.h];
        }
      }
      groups.splice(groups.indexOf(g), 1);
    };
    for (let i = from; i <= to; i++) {
      const line = LINES[i];
      const depth = (line.match(/^\t*/) ?? [''])[0].length;
      // 区间 if 块（`if (type >= A && type <= B) { … }`,体含 return 终止）——
      // 案例 1479-1494 旗幡族 :18300 等 35 块（case 标签外的第三种分发形态,
      // 块内顶层 width/height/工厂按位赋 A..B 全体;单型/OR 型 if 块实测零 width）。
      // 单型 `if (type == N)` 块含 width：实测 0 处,不建模。
      const ri = line.match(/^\t\tif \(type >= (\d+) && type <= (\d+)\)\s*$/);
      if (ri) {
        const [, a, b] = ri;
        let d2 = 0;
        for (let j = i; j <= to; j++) {
          d2 += (LINES[j].match(/{/g) ?? []).length - (LINES[j].match(/}/g) ?? []).length;
          if (d2 === 0 && j > i) {
            // 块体 (i+1..j-1)：顶层(depth 3) width/height/工厂
            const wq = { w: undefined, h: undefined };
            for (let k = i + 1; k < j; k++) {
              const t = LINES[k].trim();
              const td = (LINES[k].match(/^\t*/) ?? [''])[0].length;
              if (td !== 3) continue;
              let mm;
              if ((mm = t.match(/^width = (\d+);$/))) wq.w = +mm[1];
              else if ((mm = t.match(/^height = (\d+);$/))) wq.h = +mm[1];
              else if ((mm = t.match(FACTORY_CALL))) {
                if (FACTORY_DIMS[mm[1]]) { wq.w = FACTORY_DIMS[mm[1]][0]; wq.h = FACTORY_DIMS[mm[1]][1]; }
                else if (PARAM_FACTORIES[mm[1]]) {
                  const args = mm[2].split(',').map((x) => x.trim()).filter((x) => /^-?\d+$/.test(x));
                  const [dw, dh] = PARAM_FACTORIES[mm[1]];
                  wq.w = args[0] !== undefined ? +args[0] : dw;
                  wq.h = args[1] !== undefined ? +args[1] : dh;
                }
              }
            }
            if (wq.w !== undefined && wq.h !== undefined) {
              for (let id = +a; id <= +b; id++) if (DIMS[id] === undefined) DIMS[id] = [wq.w, wq.h];
            }
            i = j;
            break;
          }
        }
        continue;
      }
      const cm = line.match(/^\t*case (\d+):\s*$/);
      if (cm) {
        const id = parseInt(cm[1], 10);
        const top = groups[groups.length - 1];
        if (top && top.depth === depth) top.ids.push(id);
        else groups.push({ ids: [id], depth, w: undefined, h: undefined });
        continue;
      }
      const s = line.trim();
      if (/^(break;|return\b|goto )/.test(s)) { flush(groupAt(depth - 1)); continue; }
      if (/^default:/.test(s)) { flush(groupAt(depth)); continue; }
      const g = groupAt(depth - 1);
      if (!g || depth !== g.depth + 1) continue;   // 只认 case 体顶层无条件语句
      let m;
      if ((m = s.match(/^width = (\d+);$/))) { g.w = +m[1]; continue; }
      if ((m = s.match(/^height = (\d+);$/))) { g.h = +m[1]; continue; }
      // 反编译联合赋值形态（case 3351 `width = (height = 28);`——C# 赋值表达式值）
      if ((m = s.match(/^width = \(height = (\d+)\);$/))) { g.w = +m[1]; g.h = +m[1]; continue; }
      if ((m = s.match(/^height = \(width = (\d+)\);$/))) { g.w = +m[1]; g.h = +m[1]; continue; }
      // 跨 SetDefaults 委托（case 2777 `SetDefaults3(2772);` 族——dims 继承目标 id）
      if ((m = s.match(/^SetDefaults[1-5]\((\d+)\);$/))) { g.delegate = +m[1]; continue; }
      if ((m = s.match(FACTORY_CALL))) {
        const name = m[1];
        if (FACTORY_DIMS[name]) { g.w = FACTORY_DIMS[name][0]; g.h = FACTORY_DIMS[name][1]; }
        else if (PARAM_FACTORIES[name]) {
          // 纯整型实参按位取；缺位落形参缺省值（可零参/单参调用）
          const args = m[2].split(',').map((t) => t.trim()).filter((t) => /^-?\d+$/.test(t));
          const [dw, dh] = PARAM_FACTORIES[name];
          g.w = args[0] !== undefined ? +args[0] : dw;
          g.h = args[1] !== undefined ? +args[1] : dh;
        }
        // 其余（ThrownWeapon/RangedWeapon/MagicWeapon 等无 width 面）不入表
        continue;
      }
    }
    while (groups.length) flush(groups[0]);
  }

  // 后置全域区间 if 扫描（任意深度）：case 体/内层 switch 内的嵌套
  // `if (type >= A && type <= B) { … }`（2214-2217 等 239 缺口的归属形态）。
  // 仅填主扫描后的缺口（先写为准不变）；源序处理。已知局限：嵌套在变体 if
  // 分支内的区间块会被无条件采纳——width/height 面变体间无差异,良性。
  for (const [from, to] of REGIONS) {
    for (let i = from; i <= to; i++) {
      const ri = LINES[i].match(/^\t+if \(type >= (\d+) && type <= (\d+)\)\s*$/);
      if (!ri) continue;
      const [, a, b] = ri;
      let d2 = 0;
      for (let j = i; j <= to; j++) {
        d2 += (LINES[j].match(/{/g) ?? []).length - (LINES[j].match(/}/g) ?? []).length;
        if (d2 === 0 && j > i) {
          const wq = { w: undefined, h: undefined };
          for (let k = i + 1; k < j; k++) {
            const t = LINES[k].trim();
            const td = (LINES[k].match(/^\t*/) ?? [''])[0].length;
            if (td !== (LINES[i].match(/^\t*/) ?? [''])[0].length + 1) continue;
            let mm;
            if ((mm = t.match(/^width = (\d+);$/))) wq.w = +mm[1];
            else if ((mm = t.match(/^height = (\d+);$/))) wq.h = +mm[1];
            else if ((mm = t.match(FACTORY_CALL))) {
              if (FACTORY_DIMS[mm[1]]) { wq.w = FACTORY_DIMS[mm[1]][0]; wq.h = FACTORY_DIMS[mm[1]][1]; }
              else if (PARAM_FACTORIES[mm[1]]) {
                const args = mm[2].split(',').map((x) => x.trim()).filter((x) => /^-?\d+$/.test(x));
                const [dw, dh] = PARAM_FACTORIES[mm[1]];
                wq.w = args[0] !== undefined ? +args[0] : dw;
                wq.h = args[1] !== undefined ? +args[1] : dh;
              }
            }
          }
          if (wq.w !== undefined && wq.h !== undefined) {
            for (let id = +a; id <= +b; id++) if (DIMS[id] === undefined) DIMS[id] = [wq.w, wq.h];
          }
          i = j;
          break;
        }
      }
    }
  }

  // 委托重试（两轮收敛足够——委托链实测单层）
  for (let pass = 0; pass < 2 && RETRY.length; pass++) {
    const queue = RETRY.splice(0);
    for (const g of queue) {
      const base = DIMS[g.delegate];
      if (base === undefined) { RETRY.push(g); continue; }
      for (const id of g.ids) {
        if (DIMS[id] === undefined && base !== undefined) DIMS[id] = [base[0], base[1]];
      }
    }
  }

  // 尾段别名块（SetDefaults :48920-48924）：`if (type >= 1803 && type <= 1807)
  // { SetDefaults(1533 + type - 1803); }` ——dims 继承目标 vid（单例,逐字直录;
  //  若 1458+ 增量出同类块,照此扩表）
  for (const [alias, target] of [[1803, 1533]]) {
    for (let t = 0; t <= 4; t++) {
      if (DIMS[alias + t] === undefined && DIMS[target + t] !== undefined) {
        DIMS[alias + t] = DIMS[target + t];
      }
    }
  }

  // 覆盖口径：case 体未赋 width/height 的 vid = 原版对象复用泄漏,运行时 12×12 兜底
  return { DIMS };
}

const { DIMS } = extractItemDims(readFileSync(`${ROOT}/Terarria${SRC_VER}/Terraria/Item.cs`, 'utf8'));
export { DIMS };
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--dump')) {
    writeSync(1, JSON.stringify({ src: SRC_VER, DIMS }));
  } else {
    const OUT_DIR = process.env.SW_OUT ?? `${ROOT}/game/src/data`;
    const OUT = `${OUT_DIR}/vanilla-itemdims.json`;
    // ★era guard（追加时代判例）：现库有而重产盖不住的 vid 非空即拒（缺键型增量）
    if (existsSync(OUT)) {
      let prev = null;
      try { prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* 现库坏损不拦,让正常流程报错 */ }
      if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
        const missing = Object.keys(prev).filter((k) => DIMS[k] === undefined);
        if (missing.length > 0) {
          console.error(`[extract-itemdims] 拒绝全量重写：现库含重产(SW_ITEM_VER=${SRC_VER})盖不住的 vid（缺键型增量）。`);
          console.error(`  物证：缺 ${missing.length} 个 vid（${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}）。`);
          console.error('  正常更新流：node tools/extract-itemdims.mjs（缺省 1457）。错值型漂移先核源码再动工具。');
          process.exit(1);
        }
      }
    }
    writeFileSync(OUT, JSON.stringify(DIMS));
    console.error(`itemdims 条目: ${Object.keys(DIMS).length}（源 Terarria${SRC_VER}）`);
  }
}

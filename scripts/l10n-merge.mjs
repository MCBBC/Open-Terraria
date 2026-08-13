// 语言包合并纯函数(供 build-l10n.mjs 与 vitest 共用,勿引 node:fs)。
// 扁平数据形状 = { [category]: { [key]: value } }(全键 = category + '.' + key,
// 对标 LanguageManager.cs:282 LoadLanguageFromFileTextJson 的跨分片逐键合并)。

/** 尾逗号/BOM 容错 JSON 解析(原版嵌入资源带尾逗号) */
export function parseLenient(raw) {
  const text = raw.replace(/^﻿/, '');
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * 任意深度嵌套 → 扁平 { [category]: { [dottedKey]: value } }。
 * 顶层段 = category,其余路径用 '.' 连接(便于手写 Mods.SandboxWorld.* 自有文案;
 * 原版 2 层数据 value 为 string,天然不受影响)。
 */
export function flattenDeep(obj, path = []) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') {
      // 注意:逐类别 Object.assign 合并,不能整体替换 out[cat]
      // (Object.assign(out, sub) 会丢弃同类别已累计的键——曾致自定义文案只剩最后一组)
      const sub = flattenDeep(v, [...path, k]);
      for (const [cat, entries] of Object.entries(sub)) {
        out[cat] ??= {};
        Object.assign(out[cat], entries);
      }
    } else if (path.length === 0 && k.includes('.')) {
      // 顶层字面点分键(如 "Mods.SandboxWorld.Toast.X")按首段拆 = 类别 + 条目键。
      // 曾把整键当类别、rest=[] → 产物 {"整键":{"":"文本"}} → 运行时按类别查不到,
      // 页面直显裸键(NeedTempleKey Toast 根因,2026-08-14)。原版 84 分片顶层类别
      // 均不含点,首段拆分安全。
      const i = k.indexOf('.');
      (out[k.slice(0, i)] ??= {})[k.slice(i + 1)] = v;
    } else {
      const [cat, ...rest] = [...path, k];
      (out[cat] ??= {})[rest.join('.')] = v;
    }
  }
  return out;
}

/**
 * 产物形状校验(裸键类 bug 的闸门,build-l10n 与 vitest 审计共用):
 * 类别名不得含 '.';条目键非空;条目值必须是 string。返回违例清单(空=通过)。
 */
export function validateTable(table) {
  const bad = [];
  for (const [cat, entries] of Object.entries(table)) {
    if (cat.includes('.')) bad.push(`类别名含点: ${cat}`);
    if (!entries || typeof entries !== 'object') { bad.push(`类别非对象: ${cat}`); continue; }
    for (const [k, v] of Object.entries(entries)) {
      if (k === '') bad.push(`空条目键 @ ${cat}`);
      if (typeof v !== 'string') bad.push(`非字符串值 @ ${cat}.${k}: ${JSON.stringify(v).slice(0, 40)}`);
    }
  }
  return bad;
}

/**
 * 逐包按键 merge(pack 顺序 = 优先级低→高,后者覆盖前者)。
 * 返回新对象;报告 conflicts(同键不同值,信息性告警,原版跨分片本应为 0 冲突)。
 */
export function mergePacks(packs) {
  const out = {};
  const conflicts = [];
  for (const pack of packs) {
    for (const [cat, entries] of Object.entries(pack)) {
      if (!out[cat]) out[cat] = {};
      const target = out[cat];
      for (const [key, value] of Object.entries(entries)) {
        if (target[key] !== undefined && target[key] !== value) {
          conflicts.push(`${cat}.${key}: ${JSON.stringify(target[key]).slice(0, 40)} → ${JSON.stringify(value).slice(0, 40)}`);
        }
        target[key] = value;
      }
    }
  }
  return { out, conflicts };
}

/**
 * {$Category.Key} 跨键复制展开(对标 LanguageManager.cs:158 ProcessCopyCommandsInTexts:
 * 全表正则迭代 ≤100 次到不动点;引用不存在的键原样保留并计入 unresolved)。
 */
export function expandCopyCommands(table, maxIterations = 100) {
  const re = /\{\$(\w+\.\w+)\}/g;
  const unresolved = new Set();
  let changed = true;
  let iter = 0;
  while (changed && iter < maxIterations) {
    changed = false;
    iter++;
    for (const entries of Object.values(table)) {
      for (const key of Object.keys(entries)) {
        const value = entries[key];
        if (!value.includes('{$')) continue;
        const next = value.replace(re, (m, ref) => {
          const [cat, sub] = ref.split('.');
          const v = table[cat]?.[sub];
          return v !== undefined ? v : m; // 未命中保留原样(原版 L171 行为)
        });
        if (next !== value) {
          entries[key] = next;
          changed = true;
        }
      }
    }
  }
  // 收尾扫描未命中的引用
  for (const entries of Object.values(table)) {
    for (const value of Object.values(entries)) {
      if (typeof value !== 'string') continue;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(value))) unresolved.add(m[1]);
    }
  }
  return { iterations: iter, unresolved: [...unresolved] };
}

/**
 * 剥离 {?Cond}/{?!Cond} 条件标记(本仓库不支持条件模板,LanguageManager 无条件求值)。
 * 只删标记不删键:城镇 NPC chatter({?Day}/{?!BloodMoon} 前缀)的文本保留,
 * 供未来移植闲聊系统时使用;{InputTrigger_*} 等命名变量标记原样保留(仅出现在
 * 本仓库不使用的 LoadingTips_GamePad/_Keyboard 类别)。
 */
export function stripConditionMarkers(table) {
  const touched = [];
  for (const [cat, entries] of Object.entries(table)) {
    for (const key of Object.keys(entries)) {
      const value = entries[key];
      if (typeof value === 'string' && /\{[?!]+\w/.test(value)) {
        entries[key] = value.replace(/\{[?!]+\w+\}/g, '');
        touched.push(`${cat}.${key}`);
      }
    }
  }
  return touched;
}

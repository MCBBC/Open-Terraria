// 重制 prompt 模板系统:默认组装(全局前缀+类别模板+风格锚句)+ 用户微调追加。
// ★输入框语义(2026-08-19 用户反馈):textarea 只放【用户微调增量】,留空=纯默认
// 模板——完整 prompt = 默认组装 + 空格 + 微调;不再把默认组装预填进输入框
// (整段贴进去改起来麻烦)。FrameRecord.prompt 恒存完整组装(历史可复现)。
import type { RemasterCategory } from './types';

/** 全局前缀(工作台可改,存 localStorage):一切重制的公共约束。
 *  轮廓由客户端 alpha 蒙版强制(prompt 再要求一遍 = 双保险)。 */
export const DEFAULT_GLOBAL_PREFIX =
  'Pixel art remaster of a Terraria sprite. Keep the exact same silhouette, pose, ' +
  'proportions and palette mood as the input image. Crisp pixel-art style with clean ' +
  'blocky pixels, slightly higher detail clarity and better color harmony. ' +
  'Do not add text, watermark, border or background.';

/** 类别模板(逐帧模式):变量 {name}(素材名) {frameIdx}(0-based) {frameCount} */
const CATEGORY_TEMPLATES: Record<RemasterCategory, string> = {
  tile: 'This is a 16x16 tile sprite "{name}" from a tile sheet grid (frame {frameIdx} of {frameCount}). Remaster this single tile cell, keeping it a seamless tiling texture.',
  wall: 'This is a 32x32 wall sprite "{name}" from a wall sheet grid (frame {frameIdx} of {frameCount}). Remaster this single wall cell, keeping it a seamless tiling texture.',
  npc: 'This is one animation frame of the NPC "{name}" (frame {frameIdx} of {frameCount}). Remaster it, keeping the exact same pose so the animation stays coherent.',
  projectile: 'This is one animation frame of projectile "{name}" (frame {frameIdx} of {frameCount}). Remaster it, keeping the exact same pose so the animation stays coherent.',
  item: 'This is the inventory icon of item "{name}". Remaster it.',
  ui: 'This is a UI texture "{name}". Remaster it, keeping the exact same layout and proportions.',
  gore: 'This is a gore/debris sprite "{name}". Remaster it.',
  glow: 'This is a glow-mask sprite "{name}" (additive light overlay). Remaster it keeping it a soft luminous shape on transparent background.',
  buff: 'This is a 30x30 buff icon "{name}". Remaster this small icon.',
  misc: 'This is a misc sprite "{name}". Remaster it.',
};

/** 整图重制模板:整张 sheet 一个重制单元(无法按帧切分的素材)。
 *  关键约束 = 逐元素原位(布局/网格结构不许动)——整图混排表(NPC 横条/
 *  纸娃娃通道表)任何位移都会破坏下游切帧。窄长条(比例>3:1)在画布中
 *  居中两侧留白,prompt 注明主体位置防模型重构图。 */
const WHOLE_TEMPLATE =
  'This is a complete sprite sheet "{name}". Remaster the entire image while keeping ' +
  'the exact same layout and grid structure: every element must stay in its exact ' +
  'position and size — do not move, resize, crop, mirror or rearrange anything. ' +
  'If the sprite content is a narrow strip centered in the canvas with empty padding ' +
  'on the sides, keep that strip centered at the same width — do not stretch or fill the padding.';

/** 动画多帧条目的附加句(风格锚提示,配合 edits 多输入图) */
export function refFrameSentence(refFrameIdx: number): string {
  return `The second input image is an already-remastered frame (frame ${refFrameIdx}) of the same sprite — match its exact art style, palette and rendering style.`;
}

export interface ComposePromptOpts {
  category: RemasterCategory;
  name: string;
  frameIdx: number;
  frameCount: number;
  /** 用户微调【增量】(追加在默认组装之后,空格连接;空/undefined=纯默认) */
  userPrompt?: string;
  /** 全局前缀覆盖(工作台设置) */
  globalPrefix?: string;
  /** 风格锚参考帧序号(相邻已验收帧;undefined=无) */
  refFrameIdx?: number;
  /** 整图重制模式(默认 false=逐帧) */
  whole?: boolean;
}

/** 组装完整 prompt = 前缀 + (整图|逐帧)模板插值 + 风格锚句 + 用户微调追加。 */
export function composePrompt(opts: ComposePromptOpts): string {
  const prefix = (opts.globalPrefix ?? DEFAULT_GLOBAL_PREFIX).trim();
  const tmpl = (opts.whole ? WHOLE_TEMPLATE : CATEGORY_TEMPLATES[opts.category])
    .replace(/\{name\}/g, opts.name)
    .replace(/\{frameIdx\}/g, String(opts.frameIdx))
    .replace(/\{frameCount\}/g, String(opts.frameCount));
  const ref = opts.refFrameIdx !== undefined ? ` ${refFrameSentence(opts.refFrameIdx)}` : '';
  const user = opts.userPrompt?.trim();
  return `${prefix} ${tmpl}${ref}${user ? ` ${user}` : ''}`.trim();
}

/** 默认组装结果(不含用户微调;工作台预览/占位提示用)。 */
export function defaultPromptFor(opts: Omit<ComposePromptOpts, 'userPrompt'>): string {
  return composePrompt(opts);
}

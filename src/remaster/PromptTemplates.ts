// 重制 prompt 模板系统:全局前缀 + 类别模板 + 变量插值 + 用户微调覆盖。
// 工作台右栏 textarea 预填组装结果(所见即所得),人工编辑后即成完整 prompt——
// 微调控制的入口即此(改词 → 重试 → 满意再验收)。
import type { RemasterCategory } from './types';

/** 全局前缀(工作台可改,存 localStorage):一切重制的公共约束。
 *  轮廓由客户端 alpha 蒙版强制(prompt 再要求一遍 = 双保险)。 */
export const DEFAULT_GLOBAL_PREFIX =
  'Pixel art remaster of a Terraria sprite. Keep the exact same silhouette, pose, ' +
  'proportions and palette mood as the input image. Crisp pixel-art style with clean ' +
  'blocky pixels, slightly higher detail clarity and better color harmony. ' +
  'Do not add text, watermark, border or background.';

/** 类别模板:变量 {name}(素材名) {frameIdx}(0-based) {frameCount} */
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

/** 动画多帧条目的附加句(风格锚提示,配合 edits 多输入图) */
export function refFrameSentence(refFrameIdx: number): string {
  return `The second input image is an already-remastered frame (frame ${refFrameIdx}) of the same sprite — match its exact art style, palette and rendering style.`;
}

export interface ComposePromptOpts {
  category: RemasterCategory;
  name: string;
  frameIdx: number;
  frameCount: number;
  /** 用户微调(完整覆盖;undefined=用默认组装) */
  userPrompt?: string;
  /** 全局前缀覆盖(工作台设置) */
  globalPrefix?: string;
  /** 风格锚参考帧序号(相邻已验收帧;undefined=无) */
  refFrameIdx?: number;
}

/** 组装完整 prompt。userPrompt 非空时【整体覆盖】(textarea 预填默认组装结果,
 *  用户看到的即最终 prompt——微调语义直观)。 */
export function composePrompt(opts: ComposePromptOpts): string {
  if (opts.userPrompt && opts.userPrompt.trim()) return opts.userPrompt.trim();
  const prefix = (opts.globalPrefix ?? DEFAULT_GLOBAL_PREFIX).trim();
  const tmpl = CATEGORY_TEMPLATES[opts.category]
    .replace(/\{name\}/g, opts.name)
    .replace(/\{frameIdx\}/g, String(opts.frameIdx))
    .replace(/\{frameCount\}/g, String(opts.frameCount));
  const ref = opts.refFrameIdx !== undefined ? ` ${refFrameSentence(opts.refFrameIdx)}` : '';
  return `${prefix} ${tmpl}${ref}`;
}

/** 默认组装结果(工作台 textarea 预填值)。 */
export function defaultPromptFor(opts: Omit<ComposePromptOpts, 'userPrompt'>): string {
  return composePrompt(opts);
}

// gpt-image-2 重制引擎(工作台层,dev-only):单帧
//   帧 RGBA → 最近邻放大居中画布 → /v1/images/edits(可选相邻已验收帧=风格锚)
//   → 逆映射裁回 → 盒式缩回 → 原帧 alpha 蒙版 → 重制帧 RGBA。
// API 细节(2026-08 核实):edits 支持 multipart 多 image 输入;不支持透明背景
// (故必须蒙版);size 边长 16 倍数且总像素 ≥655,360(computeGenLayout 保证);
// 输出 base64 png(b64_json)。
import {
  computeGenLayout, computeWholeLayout, mapBackRect, boxDownscale, applyAlphaMask,
  buildGenCanvas, type GenLayout,
} from './FrameOps';
import { composePrompt, type ComposePromptOpts } from './PromptTemplates';

export interface RemasterRequest {
  /** 原帧 RGBA(与 w/h) */
  frame: Uint8ClampedArray;
  w: number; h: number;
  prompt: string;
  /** low|medium|high(gpt-image-2 quality) */
  quality?: 'low' | 'medium' | 'high';
  /** 风格锚参考帧(相邻已验收帧,放大后作第二输入图) */
  refFrame?: { pixels: Uint8ClampedArray; w: number; h: number; frameIdx: number };
  /** 代理地址(http://127.0.0.1:5210) */
  proxyUrl: string;
  /** Authorization Bearer key(经代理透传;空=代理 env OPENAI_API_KEY) */
  apiKey?: string;
  /** 缩回算法(默认 box) */
  algo?: 'box' | 'nearest';
  /** 整图重制模式(默认 false=逐帧;整张 sheet 一个重制单元,pad 画布策略) */
  whole?: boolean;
}

export interface RemasterResult {
  /** 重制帧 RGBA(原帧尺寸,已蒙版) */
  pixels: Uint8ClampedArray;
  /** 原始生成图(base64 png,右栏预览用) */
  genPng: string;
  layout: GenLayout;
  /** 请求耗时与用量元数据 */
  elapsedMs: number;
}

/** 解析 images API 响应:取首个 b64_json(url 形态也转 fetch 由调用方处理,
 *  这里只认 b64——gpt-image 系恒 b64)。 */
export function parseImageResponse(json: unknown): string {
  const j = json as { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  if (j?.error?.message) throw new Error(`OpenAI: ${j.error.message}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error('响应无 b64_json(gpt-image 应恒返回 b64)');
  return b64;
}

/** base64 png → ImageData(浏览器)。 */
async function decodeB64(b64: string): Promise<ImageBitmap> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
  return bmp;
}

/** 生成画布 → png blob。 */
async function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 失败'))), 'image/png');
  });
}

/** 主入口:单帧重制(whole=true 整图模式)。抛错即失败(工作台显示);无静默兜底。 */
export async function remasterFrame(req: RemasterRequest): Promise<RemasterResult> {
  const layout = req.whole ? computeWholeLayout(req.w, req.h) : computeGenLayout(req.w, req.h);
  const t0 = performance.now();
  // ① 生成画布(帧最近邻放大居中)
  const genCanvas = buildGenCanvas(req.frame, req.w, req.h, layout);
  const mainBlob = await canvasToBlob(genCanvas);
  // 参考帧(风格锚):同 layout 尺寸画布
  let refBlob: Blob | null = null;
  if (req.refFrame) {
    const refLayout = computeGenLayout(req.refFrame.w, req.refFrame.h);
    const refCanvas = buildGenCanvas(req.refFrame.pixels, req.refFrame.w, req.refFrame.h, refLayout);
    refBlob = await canvasToBlob(refCanvas);
  }
  // ② multipart edits
  const fd = new FormData();
  fd.append('model', 'gpt-image-2');
  fd.append('prompt', req.prompt);
  fd.append('n', '1');
  fd.append('size', `${layout.W}x${layout.H}`);
  fd.append('quality', req.quality ?? 'medium');
  fd.append('image', mainBlob, 'frame.png');
  if (refBlob) fd.append('image', refBlob, 'reference.png');
  const headers: Record<string, string> = {};
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;
  const resp = await fetch(`${req.proxyUrl.replace(/\/$/, '')}/v1/images/edits`, {
    method: 'POST',
    headers,
    body: fd,
    signal: AbortSignal.timeout(290_000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`代理/${resp.status}:${text.slice(0, 300)}`);
  }
  const b64 = parseImageResponse(await resp.json());
  // ③ 逆映射 + ④ 缩回 + ⑤ 蒙版
  const gen = await decodeB64(b64);
  const rect = mapBackRect(layout, gen.width, gen.height);
  const cc = document.createElement('canvas');
  cc.width = rect.sw; cc.height = rect.sh;
  const cx = cc.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(gen, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
  const genRgba = cx.getImageData(0, 0, rect.sw, rect.sh).data;
  let pixels: Uint8ClampedArray;
  if (req.algo === 'nearest') {
    // K 倍源图取块中心:等价 nearest = 取 (rect.sw/req.w) 缩放比的中心采样
    pixels = nearestCenterSample(genRgba, rect.sw, rect.sh, req.w, req.h);
  } else {
    pixels = boxDownscale(genRgba, rect.sw, rect.sh, req.w, req.h);
  }
  applyAlphaMask(pixels, req.frame);
  return { pixels, genPng: b64, layout, elapsedMs: performance.now() - t0 };
}

/** nearest 缩回:每目标像素取源块中心(源恰为整齐 K 倍像素网格时与 box 等价)。 */
export function nearestCenterSample(rgba: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      const s = (sy * sw + sx) * 4, d = (y * dw + x) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return out;
}

/** 代理健康检查(工作台启动 ping)。 */
export async function pingProxy(proxyUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${proxyUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

// 供 prompt 组装的类型再导出(工作台 UI 一站 import)
export { composePrompt };
export type { ComposePromptOpts };
export { DEFAULT_GLOBAL_PREFIX } from './PromptTemplates';

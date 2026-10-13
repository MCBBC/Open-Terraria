// mod 程序化图标(2026-10-13 用户实报"第三方移植包缺图标,面板占位字母难看"):
// 无 icon.png 的包在安装/补齐期用 mod id 确定性生成——FNV-1a 哈希→色相,
// 首字母大字 + 暗底 + 同相描边框。同 id 恒同图(刷新/重装不漂移);
// node 环境(document 缺席)返 null,调用方维持占位面。
// 有自带 icon.png 的包(glmgirl/rivals)不受影响——本文件只兜底缺失面。

/** FNV-1a 32bit(确定性;不进存档面,只做视觉种) */
function hashHue(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

/** 确定性程序化图标(80×80 dataURL)。浏览器外返 null。 */
export function proceduralModIcon(id: string, name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const hue = hashHue(id);
    const c = document.createElement('canvas');
    c.width = 80; c.height = 80;
    const g = c.getContext('2d');
    if (!g) return null;
    // 暗底纵向渐变(同相深色,面板 #1a2140 底上可辨)
    const bg = g.createLinearGradient(0, 0, 0, 80);
    bg.addColorStop(0, `hsl(${hue} 42% 22%)`);
    bg.addColorStop(1, `hsl(${hue} 55% 10%)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, 80, 80);
    // 斜向高光带(同相弱透明,打破纯色底)
    g.strokeStyle = `hsla(${hue} 80% 70% / .16)`;
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(-20, 70); g.lineTo(70, -20);
    g.stroke();
    // 边框(同相亮色 + 外圈深色勾边)
    g.strokeStyle = 'rgba(6,8,18,.9)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 76, 76);
    g.strokeStyle = `hsl(${hue} 72% 62%)`;
    g.lineWidth = 2;
    g.strokeRect(4, 4, 72, 72);
    // 首字母(name 空/非字母开头回落 id 首字符)
    const ch = (name || id).trim().charAt(0).toUpperCase() || '?';
    g.font = 'bold 44px "Fusion Pixel 12px", "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 四向黑描边(像素字钩边语义)再本色填充
    g.fillStyle = 'rgba(6,8,18,.92)';
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) g.fillText(ch, 40 + dx, 43 + dy);
    g.fillStyle = `hsl(${hue} 85% 82%)`;
    g.fillText(ch, 40, 43);
    return c.toDataURL('image/png');
  } catch {
    return null;   // 无 2d ctx/隐私模式等=占位面兜底
  }
}

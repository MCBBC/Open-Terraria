// mod 剪贴板接口(★Tier1-b,2026-10-14;sw.clipboard)。
// 写=Clipboard API(免权限,https/localhost 安全上下文;非安全上下文回退
// execCommand copy 兜底);读=Clipboard API(浏览器手势内授权;拒绝/失败=null)。
// 限额:写 256KB(防失控循环刷剪贴板);读 1MB。
export interface ModClipboardApi {
  /** 写文本(限 256KB;成功=true) */
  write(text: string): Promise<boolean>;
  /** 读文本(浏览器授权门;拒绝/空/超时=null;限 1MB) */
  read(): Promise<string | null>;
}

const WRITE_LIMIT = 256 * 1024;
const READ_LIMIT = 1024 * 1024;

export function createModClipboard(modId: string): ModClipboardApi {
  void modId;
  return {
    async write(text: string): Promise<boolean> {
      if (typeof text !== 'string' || text.length > WRITE_LIMIT) return false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch { /* 权限拒/非安全上下文 → execCommand 兜底 */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed; left:-9999px; top:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    },
    async read(): Promise<string | null> {
      try {
        if (navigator.clipboard?.readText) {
          const text = await Promise.race([
            navigator.clipboard.readText(),
            new Promise<null>((r) => setTimeout(() => r(null), 3000)),   // 授权挂起超时
          ]);
          if (typeof text !== 'string' || text.length > READ_LIMIT) return null;
          return text;
        }
      } catch { /* 拒绝 */ }
      return null;
    },
  };
}

/** 测试清账(无模块态) */
export function _resetModClipboardForTests(): void { /* 纯工厂=零模块态 */ }

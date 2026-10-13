// 声明式 mod 配置行构建(2026-10-13 单源抽取):modsPanel(标题屏)与
// modSettingsPanel(游戏内双栏)共用一套行控件——bool checkbox / number(min/max) /
// text 三型,变更即 state.set(kvSet 即发即忘)。DOM/类名与 modsPanel v2 视觉同源。
import type { ModConfigState } from './config';

/** 构建配置编辑块(.cfg:标题行+逐键行)。变更落 state.set(持久化内建);
 *  onDirty 每次变更回调(游戏内面板提示"即时保存"用,可选)。 */
export function buildModConfigRows(state: ModConfigState, opts?: { onDirty?: () => void }): HTMLElement {
  const block = document.createElement('div');
  block.className = 'cfg';
  for (const [k, e] of Object.entries(state.schema)) {
    const line = document.createElement('div');
    line.className = 'cfgrow';
    const label = document.createElement('label');
    label.textContent = e.label ?? k;
    let input: HTMLInputElement;
    if (e.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.get(k) === true;
      input.addEventListener('change', () => { state.set(k, input.checked); opts?.onDirty?.(); });
    } else if (e.type === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      input.value = String(state.get(k));
      if (e.min !== undefined) input.min = String(e.min);
      if (e.max !== undefined) input.max = String(e.max);
      input.addEventListener('change', () => { state.set(k, Number(input.value)); opts?.onDirty?.(); });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = String(state.get(k));
      input.addEventListener('change', () => { state.set(k, input.value); opts?.onDirty?.(); });
    }
    line.appendChild(label);
    line.appendChild(input);
    block.appendChild(line);
  }
  return block;
}

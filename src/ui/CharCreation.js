// 角色创建页（DOM 版，M2.5 重写）：交互全部用原生控件（input/range/按钮网格），
// 纸娃娃预览用 canvas。替代原 VUI 手绘版 UICharacterCreationState（命中/交互脆弱）。
// 布局精神对齐原版：左预览 + 右分类内容 + 底部返回/创建。
import { randomAppearance, DIFFICULTY_INFO, VALID_CLOTH_STYLES, CHAR_CREATION_HAIRS, hslToRgb, } from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame, IDLE_FRAME } from '../player/PaperDoll';
const COLOR_ROWS = [
    { key: 'hairColor', label: '发色' },
    { key: 'eyeColor', label: '瞳色' },
    { key: 'skinColor', label: '肤色' },
    { key: 'shirtColor', label: '上衣' },
    { key: 'undershirtColor', label: '底衫' },
    { key: 'pantsColor', label: '裤子' },
    { key: 'shoeColor', label: '鞋子' },
];
const CSS = `
.sw-char-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 620px; max-width: 96vw; z-index: 20; cursor: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px;
  padding: 14px 16px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-char-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-char-body { display: flex; gap: 14px; }
.sw-char-left { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sw-char-preview { background: #10142c; border: 2px solid #4a5aa0; border-radius: 4px; image-rendering: pixelated; }
.sw-char-leftbtns { display: flex; gap: 6px; }
.sw-char-leftbtns button, .sw-char-footer button, .sw-char-diffs button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-family: inherit;
}
.sw-char-leftbtns button:hover, .sw-char-footer button:hover, .sw-char-diffs button:hover { background: #4a5aa0; }
.sw-char-right { flex: 1; min-width: 0; }
.sw-char-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.sw-char-tabs button {
  background: #232c52; color: #c8c8e0; border: 1px solid #4a5aa0; border-radius: 4px;
  padding: 4px 12px; cursor: pointer; font-family: inherit;
}
.sw-char-tabs button.active { background: #5a6ac0; color: #fff; }
.sw-char-content { height: 320px; overflow-y: auto; background: #1a2140; border: 1px solid #3a4680;
  border-radius: 4px; padding: 10px; }
.sw-char-section { display: flex; flex-direction: column; gap: 8px; }
.sw-char-row { display: flex; align-items: center; gap: 10px; }
.sw-char-row span { width: 52px; }
.sw-char-row input[type=text] {
  flex: 1; background: #10142c; border: 1px solid #4a5aa0; color: #fff;
  padding: 6px 8px; border-radius: 4px; font-family: inherit;
}
.sw-char-row input[type=color] { width: 60px; height: 30px; border: none; background: none; cursor: pointer; }
.sw-char-subtitle { color: #b8c0e8; font-size: 13px; margin-top: 4px; }
.sw-char-diffs { display: flex; gap: 8px; }
.sw-char-diffs button.active { outline: 2px solid #ffd76e; }
.sw-char-styles, .sw-char-hairs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.sw-char-hairs { grid-template-columns: repeat(6, 1fr); }
.sw-char-stylebtn, .sw-char-hairbtn {
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  padding: 4px; cursor: pointer; display: flex; justify-content: center;
}
.sw-char-stylebtn.active, .sw-char-hairbtn.active { outline: 2px solid #ffd76e; }
.sw-char-stylebtn canvas, .sw-char-hairbtn canvas { image-rendering: pixelated; width: 40px; height: auto; }
.sw-char-hairbtn canvas { height: 44px; }
.sw-char-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sw-char-footer .primary { background: #5a6ac0; color: #fff; }
`;
function hex(c) {
    return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function fromHex(s) {
    const v = parseInt(s.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
export class CharCreation {
    constructor(root, cb) {
        Object.defineProperty(this, "root", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: root
        });
        Object.defineProperty(this, "cb", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: cb
        });
        Object.defineProperty(this, "panel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "appearance", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clipboard", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "previewCanvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "previewCtx", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "raf", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "time", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "content", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tab", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'info'
        });
        Object.defineProperty(this, "colorInputs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "escHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        /** 走路动画预览循环 */
        Object.defineProperty(this, "loop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                this.time += 1 / 60;
                this.drawPreview();
                this.raf = requestAnimationFrame(this.loop);
            }
        });
        this.appearance = randomAppearance();
        if (!document.getElementById('sw-char-style')) {
            const style = document.createElement('style');
            style.id = 'sw-char-style';
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        this.panel = document.createElement('div');
        this.panel.className = 'sw-char-panel';
        this.panel.innerHTML = `
      <div class="sw-char-title">创建角色</div>
      <div class="sw-char-body">
        <div class="sw-char-left">
          <canvas class="sw-char-preview" width="120" height="150"></canvas>
          <div class="sw-char-leftbtns">
            <button data-act="copy" title="复制模板">📋</button>
            <button data-act="paste" title="粘贴模板">📎</button>
            <button data-act="random" title="随机">🎲</button>
          </div>
        </div>
        <div class="sw-char-right">
          <div class="sw-char-tabs">
            <button data-tab="info">信息</button>
            <button data-tab="look">外观</button>
            <button data-tab="hair">发型</button>
            <button data-tab="color">颜色</button>
          </div>
          <div class="sw-char-content"></div>
        </div>
      </div>
      <div class="sw-char-footer">
        <button data-act="back">返回</button>
        <button data-act="create" class="primary">创建</button>
      </div>
    `;
        this.root.appendChild(this.panel);
        this.previewCanvas = this.panel.querySelector('.sw-char-preview');
        this.previewCtx = this.previewCanvas.getContext('2d');
        this.previewCtx.imageSmoothingEnabled = false;
        this.content = this.panel.querySelector('.sw-char-content');
        // 事件
        this.panel.querySelectorAll('.sw-char-tabs button').forEach((b) => {
            b.addEventListener('click', () => { this.tab = b.dataset.tab; this.buildContent(); });
        });
        this.panel.querySelector('[data-act=back]').addEventListener('click', () => this.close(this.cb.onCancel));
        this.panel.querySelector('[data-act=create]').addEventListener('click', () => {
            this.appearance.name = (this.appearance.name || '').trim() || '无名角色';
            const a = this.appearance;
            this.close(() => this.cb.onCreate(a));
        });
        this.panel.querySelector('[data-act=random]').addEventListener('click', () => {
            this.appearance = randomAppearance(this.appearance.name);
            this.buildContent();
        });
        this.panel.querySelector('[data-act=copy]').addEventListener('click', () => {
            this.clipboard = { ...this.appearance };
        });
        this.panel.querySelector('[data-act=paste]').addEventListener('click', () => {
            if (!this.clipboard)
                return;
            this.appearance = { ...this.clipboard, name: this.appearance.name };
            this.buildContent();
        });
        this.buildContent();
        this.loop();
        // Esc 返回
        this.escHandler = (e) => {
            if (e.code === 'Escape')
                this.close(this.cb.onCancel);
        };
        window.addEventListener('keydown', this.escHandler);
    }
    drawPreview() {
        const ctx = this.previewCtx;
        ctx.clearRect(0, 0, 120, 150);
        const doll = compositePaperDoll(this.appearance);
        if (!doll)
            return;
        const f = dollFrame(doll, walkFrame(this.time));
        // 2x 放大：40×56 → 80×112，底部对齐
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 20, 150 - 112, 80, 112);
    }
    close(fn) {
        cancelAnimationFrame(this.raf);
        if (this.escHandler)
            window.removeEventListener('keydown', this.escHandler);
        this.panel.remove();
        fn();
    }
    // ================= 内容区 =================
    buildContent() {
        // 页签高亮
        this.panel.querySelectorAll('.sw-char-tabs button').forEach((b) => {
            b.classList.toggle('active', b.dataset.tab === this.tab);
        });
        this.content.innerHTML = '';
        this.colorInputs.clear();
        if (this.tab === 'info')
            this.buildInfo();
        else if (this.tab === 'look')
            this.buildLook();
        else if (this.tab === 'hair')
            this.buildHair();
        else
            this.buildColor();
    }
    buildInfo() {
        const box = document.createElement('div');
        box.className = 'sw-char-section';
        // 名字
        const nameRow = document.createElement('label');
        nameRow.className = 'sw-char-row';
        nameRow.innerHTML = '<span>名字</span>';
        const name = document.createElement('input');
        name.type = 'text';
        name.maxLength = 20;
        name.value = this.appearance.name;
        name.placeholder = '输入角色名…';
        name.addEventListener('input', () => { this.appearance.name = name.value; });
        nameRow.appendChild(name);
        box.appendChild(nameRow);
        // 难度
        const diffTitle = document.createElement('div');
        diffTitle.className = 'sw-char-subtitle';
        diffTitle.textContent = '难度';
        box.appendChild(diffTitle);
        const diffRow = document.createElement('div');
        diffRow.className = 'sw-char-diffs';
        DIFFICULTY_INFO.forEach((d, i) => {
            const b = document.createElement('button');
            b.textContent = d.label;
            b.style.color = hex(d.color);
            b.classList.toggle('active', this.appearance.difficulty === i);
            b.title = ['掉落一半金币', '掉落所有金币和物品', '死亡掉落全部物品', '研究/复制/控制时间'].join('')[i] ?? '';
            b.addEventListener('click', () => { this.appearance.difficulty = i; this.buildContent(); });
            diffRow.appendChild(b);
        });
        box.appendChild(diffRow);
        // 性别（皮肤变体男/女组）
        const genderTitle = document.createElement('div');
        genderTitle.className = 'sw-char-subtitle';
        genderTitle.textContent = '性别';
        box.appendChild(genderTitle);
        const gRow = document.createElement('div');
        gRow.className = 'sw-char-diffs';
        const MALE = [0, 1, 2, 3, 8, 10];
        const FEMALE = [4, 5, 6, 7, 9, 11];
        for (const [label, pool] of [['♂ 男', MALE], ['♀ 女', FEMALE]]) {
            const b = document.createElement('button');
            b.textContent = label;
            b.classList.toggle('active', pool.includes(this.appearance.skinVariant));
            b.addEventListener('click', () => {
                // 同性别的样式索引尽量保留（0↔4, 1↔5, 2↔6, 3↔7, 8↔9, 10↔11）
                const other = pool === MALE ? FEMALE : MALE;
                const idx = Math.max(0, other.indexOf(this.appearance.skinVariant));
                this.appearance.skinVariant = pool[idx] ?? pool[0];
                this.buildContent();
            });
            gRow.appendChild(b);
        }
        box.appendChild(gRow);
        this.content.appendChild(box);
    }
    buildLook() {
        const box = document.createElement('div');
        box.className = 'sw-char-styles';
        VALID_CLOTH_STYLES.forEach((styleId) => {
            const b = document.createElement('button');
            b.className = 'sw-char-stylebtn';
            b.title = `样式 ${styleId}`;
            b.classList.toggle('active', this.appearance.skinVariant === styleId);
            const c = document.createElement('canvas');
            c.width = 40;
            c.height = 56;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const doll = compositePaperDoll({ ...this.appearance, skinVariant: styleId });
            if (doll) {
                const f = dollFrame(doll, IDLE_FRAME);
                ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 40, 56);
            }
            b.appendChild(c);
            b.addEventListener('click', () => { this.appearance.skinVariant = styleId; this.buildContent(); });
            box.appendChild(b);
        });
        this.content.appendChild(box);
    }
    buildHair() {
        const wrap = document.createElement('div');
        wrap.className = 'sw-char-hairs';
        for (const hairId of CHAR_CREATION_HAIRS) {
            const b = document.createElement('button');
            b.className = 'sw-char-hairbtn';
            b.title = `发型 ${hairId}`;
            b.classList.toggle('active', this.appearance.hair === hairId);
            const c = document.createElement('canvas');
            c.width = 40;
            c.height = 44;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            const doll = compositePaperDoll({ ...this.appearance, hair: hairId });
            if (doll) {
                // 头部区域（帧上部 44px，长发也能展示）
                ctx.drawImage(doll, 0, 0, 40, 44, 0, 0, 40, 44);
            }
            b.appendChild(c);
            b.addEventListener('click', () => { this.appearance.hair = hairId; this.buildContent(); });
            wrap.appendChild(b);
        }
        this.content.appendChild(wrap);
    }
    buildColor() {
        const box = document.createElement('div');
        box.className = 'sw-char-section';
        for (const row of COLOR_ROWS) {
            const el = document.createElement('label');
            el.className = 'sw-char-row';
            const span = document.createElement('span');
            span.textContent = row.label;
            const key = row.key;
            const input = document.createElement('input');
            input.type = 'color';
            input.value = hex(this.appearance[key]);
            input.addEventListener('input', () => {
                this.appearance[key] = fromHex(input.value);
            });
            this.colorInputs.set(key, input);
            const rand = document.createElement('button');
            rand.textContent = '🎲';
            rand.title = '随机此颜色';
            rand.addEventListener('click', () => {
                const c = { r: 0, g: 0, b: 0 };
                const [r, g, b] = hslToRgb(Math.random(), 0.35 + Math.random() * 0.45, 0.3 + Math.random() * 0.35);
                c.r = Math.round(r * 255);
                c.g = Math.round(g * 255);
                c.b = Math.round(b * 255);
                this.appearance[key] = c;
                input.value = hex(c);
            });
            el.append(span, input, rand);
            box.appendChild(el);
        }
        this.content.appendChild(box);
    }
}

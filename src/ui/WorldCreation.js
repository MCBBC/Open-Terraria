// 世界创建页（DOM 版，替代 VUI UIWorldCreationState）：
// 世界名/种子 + 大小/难度/邪恶三组选项 + 彩蛋种子图标 + 多层预览图 + 描述。
import { parseSeed, randomWorldName } from '../world/gen/SeedEasterEggs';
const SIZES = [
    { label: '小', w: 4200, h: 1200, icon: 'UI_WorldCreation_IconSizeSmall', desc: '小世界：适合快速探索，生成最快。' },
    { label: '中', w: 6400, h: 1800, icon: 'UI_WorldCreation_IconSizeMedium', desc: '中等世界：体验均衡。' },
    { label: '大', w: 8400, h: 2400, icon: 'UI_WorldCreation_IconSizeLarge', desc: '大世界：广袤辽阔，探索耗时最长。' },
];
const DIFFS = [
    { label: '经典', icon: 'UI_WorldCreation_IconDifficultyNormal', desc: '经典模式：标准体验。' },
    { label: '专家', icon: 'UI_WorldCreation_IconDifficultyExpert', desc: '专家模式：更难的敌怪，更好的战利品。' },
    { label: '大师', icon: 'UI_WorldCreation_IconDifficultyMaster', desc: '大师模式：为高玩准备的终极考验。' },
    { label: '旅程', icon: 'UI_WorldCreation_IconDifficultyCreative', desc: '旅程模式：以自己的节奏研究和游玩。' },
];
const EVILS = [
    { label: '随机', icon: 'UI_WorldCreation_IconEvilRandom', desc: '让命运决定世界的邪恶形态。', value: -1 },
    { label: '腐化', icon: 'UI_WorldCreation_IconEvilCorruption', desc: '腐化之地：噬魂怪与诅咒之地。', value: 0 },
    { label: '猩红', icon: 'UI_WorldCreation_IconEvilCrimson', desc: '猩红之地：血肉与恐怖的噩梦。', value: 1 },
];
const CSS = `
.sw-wc-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 620px; max-width: 96vw; z-index: 20; cursor: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 14px 16px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-wc-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-wc-body { display: flex; gap: 14px; }
.sw-wc-main { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.sw-wc-row { display: flex; align-items: center; gap: 8px; }
.sw-wc-row > span { width: 52px; color: #c8d0f0; flex-shrink: 0; }
.sw-wc-row input[type=text] { flex: 1; background: #10142c; border: 1px solid #4a5aa0; color: #fff;
  padding: 6px 8px; border-radius: 4px; font-family: inherit; min-width: 0; }
.sw-wc-rand { background: #232c52; border: 1px solid #3a4680; border-radius: 4px; padding: 4px 8px;
  cursor: pointer; flex-shrink: 0; }
.sw-wc-rand img { width: 28px; height: 28px; display: block; image-rendering: pixelated; }
.sw-wc-seedicon { width: 34px; height: 34px; flex-shrink: 0; image-rendering: pixelated; }
.sw-wc-group { display: flex; flex-direction: column; gap: 2px; }
.sw-wc-grouplabel { color: #b8c0e8; font-size: 13px; }
.sw-wc-opts { display: flex; gap: 8px; }
.sw-wc-opt {
  display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center;
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  padding: 6px 4px; cursor: pointer; font-family: inherit; color: #e8e8f4;
}
.sw-wc-opt img { width: 32px; height: 32px; image-rendering: pixelated; }
.sw-wc-opt.active { outline: 2px solid #ffd76e; background: #2c3768; }
.sw-wc-desc { min-height: 34px; color: #9aa2cc; font-size: 12px; }
.sw-wc-side { width: 132px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sw-wc-preview { width: 120px; height: 120px; image-rendering: pixelated;
  background: #10142c; border: 2px solid #4a5aa0; border-radius: 4px; }
.sw-wc-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sw-wc-footer button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 6px 20px; cursor: pointer; font-family: inherit;
}
.sw-wc-footer button.primary { background: #5a6ac0; color: #fff; }
`;
const SEED_ICON = {
    everything: 'Seed_Everything', drunkWorld: 'Seed_Drunk', notTheBees: 'Seed_NotTheBees',
    getGoodWorld: 'Seed_ForTheWorthy', theConstant: 'Seed_TheConstant', skyblock: 'Seed_Skyblock',
    tenthAnniversary: 'Seed_Celebration', noTraps: 'Seed_NoTraps', remix: 'Seed_Remix',
};
export class WorldCreationPanel {
    constructor(parent, flow) {
        Object.defineProperty(this, "flow", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: flow
        });
        Object.defineProperty(this, "panel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "desc", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "preview", {
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
        Object.defineProperty(this, "seedIcon", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { size: 1, diff: 0, evil: 0 }
        });
        Object.defineProperty(this, "escHandler", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        if (!document.getElementById('sw-wc-style')) {
            const style = document.createElement('style');
            style.id = 'sw-wc-style';
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        this.panel = document.createElement('div');
        this.panel.className = 'sw-wc-panel';
        this.panel.innerHTML = `
      <div class="sw-wc-title">创建世界</div>
      <div class="sw-wc-body">
        <div class="sw-wc-main">
          <div class="sw-wc-row"><span>世界名</span><input type="text" data-f="name" maxlength="27"><button class="sw-wc-rand" data-act="randname" title="随机名"><img src="sprites/vanilla-ui/UI_WorldCreation_IconRandomName.png"></button></div>
          <div class="sw-wc-row"><span>种子</span><input type="text" data-f="seed" maxlength="40" placeholder="可选…"><button class="sw-wc-rand" data-act="randseed" title="随机种子"><img src="sprites/vanilla-ui/UI_WorldCreation_IconRandomSeed.png"></button><img class="sw-wc-seedicon" src="sprites/vanilla-ui/UI_WorldCreation_Seed_Normal.png"></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">大小</div><div class="sw-wc-opts" data-g="size"></div></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">难度</div><div class="sw-wc-opts" data-g="diff"></div></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">邪恶群系</div><div class="sw-wc-opts" data-g="evil"></div></div>
          <div class="sw-wc-desc"></div>
        </div>
        <div class="sw-wc-side"><canvas class="sw-wc-preview" width="120" height="120"></canvas></div>
      </div>
      <div class="sw-wc-footer"><button data-act="back">返回</button><button data-act="create" class="primary">创建</button></div>
    `;
        this.panel.querySelector('[data-f=name]').value = randomWorldName();
        this.desc = this.panel.querySelector('.sw-wc-desc');
        this.preview = this.panel.querySelector('.sw-wc-preview');
        this.previewCtx = this.preview.getContext('2d');
        this.previewCtx.imageSmoothingEnabled = false;
        this.seedIcon = this.panel.querySelector('.sw-wc-seedicon');
        // 选项组
        this.buildGroup('size', SIZES);
        this.buildGroup('diff', DIFFS);
        this.buildGroup('evil', EVILS);
        this.refresh();
        this.panel.querySelector('[data-act=randname]').addEventListener('click', () => {
            this.panel.querySelector('[data-f=name]').value = randomWorldName();
        });
        this.panel.querySelector('[data-act=randseed]').addEventListener('click', () => {
            this.panel.querySelector('[data-f=seed]').value = String(Math.floor(Math.random() * 1e9));
            this.refreshSeedIcon();
        });
        this.panel.querySelector('[data-f=seed]').addEventListener('input', () => this.refreshSeedIcon());
        this.panel.querySelector('[data-act=back]').addEventListener('click', () => this.close(flow.onCancel));
        this.panel.querySelector('[data-act=create]').addEventListener('click', () => this.submit());
        this.escHandler = (e) => { if (e.code === 'Escape')
            this.close(flow.onCancel); };
        window.addEventListener('keydown', this.escHandler);
        parent.appendChild(this.panel);
    }
    buildGroup(g, opts) {
        const box = this.panel.querySelector(`[data-g=${g}]`);
        opts.forEach((o, i) => {
            const b = document.createElement('div');
            b.className = 'sw-wc-opt';
            b.innerHTML = `<img src="sprites/vanilla-ui/${o.icon}.png"><span>${o.label}</span>`;
            b.addEventListener('click', () => { this.sel[g] = i; this.refresh(); });
            b.addEventListener('mouseenter', () => { this.desc.textContent = o.desc; });
            box.appendChild(b);
        });
    }
    refresh() {
        // 高亮
        const mark = (g, idx) => {
            this.panel.querySelectorAll(`[data-g=${g}] .sw-wc-opt`).forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });
        };
        mark('size', this.sel.size);
        mark('diff', this.sel.diff);
        mark('evil', this.sel.evil);
        this.desc.textContent = '';
        this.drawPreview();
        this.refreshSeedIcon();
    }
    /** 多层预览图（UIWorldCreationPreview：地形剪影 + 难度/邪恶图标 + 边框） */
    drawPreview() {
        const ctx = this.previewCtx;
        ctx.clearRect(0, 0, 120, 120);
        const layers = [
            ['UI_WorldCreation_PreviewSizeSmall', 'UI_WorldCreation_PreviewSizeMedium', 'UI_WorldCreation_PreviewSizeLarge'][this.sel.size],
            ['UI_WorldCreation_PreviewDifficultyNormal2', 'UI_WorldCreation_PreviewDifficultyExpert2', 'UI_WorldCreation_PreviewDifficultyMaster2', 'UI_WorldCreation_PreviewDifficultyCreative2'][this.sel.diff],
            ['UI_WorldCreation_PreviewEvilRandom', 'UI_WorldCreation_PreviewEvilCorruption', 'UI_WorldCreation_PreviewEvilCrimson'][this.sel.evil],
            'UI_WorldCreation_PreviewBorder',
        ];
        // 同步绘制（贴图加载完毕后下一帧重画）
        let pending = layers.length;
        for (const key of layers) {
            const img = new Image();
            img.onload = () => { ctx.drawImage(img, 0, 0); };
            img.src = `sprites/vanilla-ui/${key}.png`;
            void pending--;
        }
    }
    refreshSeedIcon() {
        const seed = this.panel.querySelector('[data-f=seed]').value.trim();
        const { flags } = parseSeed(seed);
        const key = flags.everything ? 'Seed_Everything'
            : flags.drunkWorld ? 'Seed_Drunk'
                : flags.notTheBees ? 'Seed_NotTheBees'
                    : flags.getGoodWorld ? 'Seed_ForTheWorthy'
                        : flags.theConstant ? 'Seed_TheConstant'
                            : flags.skyblock ? 'Seed_Skyblock'
                                : flags.tenthAnniversary ? 'Seed_Celebration'
                                    : flags.noTraps ? 'Seed_NoTraps'
                                        : flags.remix ? 'Seed_Remix'
                                            : 'Seed_Normal';
        this.seedIcon.src = `sprites/vanilla-ui/UI_WorldCreation_${key}.png`;
    }
    submit() {
        const size = SIZES[this.sel.size];
        const seed = this.panel.querySelector('[data-f=seed]').value.trim();
        const name = this.panel.querySelector('[data-f=name]').value.trim()
            || parseSeed(seed).specialName || '新世界';
        this.close(() => this.flow.onCreate({ name, seed, w: size.w, h: size.h, difficulty: this.sel.diff, evil: EVILS[this.sel.evil].value }));
    }
    close(fn) {
        if (this.escHandler)
            window.removeEventListener('keydown', this.escHandler);
        this.panel.remove();
        fn();
    }
}

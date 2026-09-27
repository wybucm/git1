# SPEC：Hue 调色板生成器 10 秒宣传片

> 复制自 `.claude/skills/promo-video/SPEC.template.md`。分镜表是剧本（`demo-app/video/director.html`）和配乐节拍表（`demo-app/video/audio.py`）的唯一事实来源。

## 1. 规格

| 项 | 值 |
| --- | --- |
| 分辨率 / 帧率 | 1920×1080，30 fps |
| 时长 | ≤ 10 s（`DURATION = 10`） |
| 编码 | 母版 H.264 crf 15 + AAC 256k；分享版两遍编码 3.7 Mbps（10 s ≈ 5 MB，< 30 MB） |
| 输出文件名（`NAME`） | `hue-promo`（`demo-app/video/out/hue-promo.mp4`、`hue-promo-share.mp4`，不提交） |
| 字体 | Inter、Noto Sans SC、JetBrains Mono（`fetch-fonts.sh`） |
| 基调（配色、配乐 BPM / 调式） | 模板暗场 + 蓝紫辉光；深色段加暖色 glowC；120 BPM，A 小调 |

## 2. 被展示的页面与示例数据

- 页面路径（相对仓库根目录）：`demo-app/index.html`（单文件、零依赖）。导演页 `demo-app/video/director.html`，`APP = '../index.html'`；make.sh 默认 `ROOT=..` 即 `demo-app/`，同源。
- 示例数据：页面自带默认种子色 `#3fa7ff`，不需要预置。
- iframe 视口 1440×810（导演页 `#rig` 尺寸）。剧本用到的元素：
  - 种子输入框 `#seed`（左上，约 x 230–380，y 125）
  - 色块 `.sw`（5 列网格，第 3 块"互补"= `qa('.sw')[2]`）
  - 详情面板 `#sheet`（点色块后 `.open`，底部居中）
  - 深色开关 `#mode`（右上，约 x 1370，y 45）
- 注入样式：模板默认的 `--font` 注入（页面用 `var(--font)`）+ 隐藏滚动条。
- `observe()` 要观察的状态与音效：

  | DOM 状态变化 | cue | 音效 |
  | --- | --- | --- |
  | `#sheet` 加上 `.open` | `pop` | 弹出 |
  | `#sheet` 去掉 `.open` | `swish` | 收起 |
  | `#mode` 加上 `.on` | `toggleStart` | tick |
  | `body[data-settled]` 变为 `dark`（旋钮 transitionend） | `toggle` | pop/落定 |
  | 调色板第 1 块 `data-hex` 变化 | `swatch` | 和弦铃音 |

- 关键过渡的时长：开关旋钮 `transform .3s`（验证 `toggleStart → toggle` 的 `Δ × r ≈ 0.3 s`）；详情面板 `.25s`。

## 3. 分镜表

镜头 `{x,y}` 为页面坐标（1440×810）上画面中心，`z` 缩放。

| 时间码 | 镜头 | 交互动作 | 速度坡度 | 标题 / 文案 | 音乐段落 / 音效 |
| --- | --- | --- | --- | --- | --- |
| 0–1.6 | 建立镜头 `{720,405,z.72,rx40,ry12,rz−8}` → `{720,405,z1.0,rx14,ry−6,rz−2}` outExpo；地面网格淡入淡出 | 指针出现在右下 | 1× | 0.15–1.55 左侧大标题"Hue<span en>ONE SEED · FIVE COLORS</span>"（side，top 640，120px） | ambient（Am）；1.5 HIT whoosh |
| 1.6–4.2 | 推近输入框 → `{420,240,z1.9,rx10,ry−10,rz−1}`（1.6–2.2 io）；3.5–4.2 拉到 `{620,380,z1.25,rx12,ry−4}` 看整排色块 | 1.6–2.05 指针移到 `#seed`；2.1 点击；2.3 起每 0.1 s 打一个字符，把值从空打成 `#ff5f6d`（7 字，2.3–2.9） | 1× | 2.4–3.9 caption"LIVE PALETTE / 输入种子色，实时生成"（左下） | build（F）；每字 `key`；色块变化 `swatch`；`click` |
| 4.2–6.4 | 跟拍第 3 块色块 → `{760,520,z1.55,rx12,ry−8}`；4.9–5.8 缓推到 `{720,620,z1.8,rx8}` 看面板 | 4.2–4.8 指针移到 `qa('.sw')[2]` 中心；4.85 点击 → 面板弹出；6.1 按 Esc 关闭 | 4.8→4.9 降到 **0.35×**，保持到 5.6，5.8 回 1× | 4.95–6.1 **左侧**"点一下<span en>TAP FOR DETAILS</span>"（side，top 180，96px，不压面板） | 4.2 drop 段（C）；`click`、`pop`（observe）；4.8 `slowdown`、5.7 `speedup`；`swish` |
| 6.4–8.3 | 甩到右上开关 → `{1250,120,z2.3,rx10,ry−12}`（6.4–6.9 io，mblur 峰值 10）；7.9–8.3 拉远 `{720,405,z1.05,rx16}`，glowC 渐入 | 6.5–7.05 指针移到 `#mode`；7.1 点击 → 深色 | 7.0→7.1 **0.3×**，保持到 7.75，7.9 回 1× | 7.2–8.2 左侧"深色模式<span en>DARK MODE</span>"（side，top 640，96px） | `click`、`toggleStart`/`toggle`（observe）；7.0 `slowdown`、7.8 `speedup` |
| 8.3–10 | 黑底结尾卡（`END.from = 8.4`） | 指针隐藏 | 1× | `Hue · one seed, five colors`（Hue 高亮，光标闪烁） | outro；8.4 `end`（钟声），HIT boom |

`RATE` 表：

```js
[[0,1],[4.8,1],[4.9,.35],[5.6,.35],[5.8,1],[7.0,1],[7.1,.3],[7.75,.3],[7.9,1],[DURATION,1]]
```

音乐节拍表（`SECTIONS` / `HITS`）：

| 段落类型 | 时间 | 和弦 / 内容 |
| --- | --- | --- |
| ambient | 0–1.6 | Am 铺底 |
| build | 1.6–4.2 | F，渐密 |
| drop | 4.2–8.3 | C |
| outro | 8.3–10 | Am 长音 + 钟声 |

HITS：1.5 whoosh、8.4 boom。

## 4. 开场与结尾文案（逐字）

- 开场：`Hue` / `ONE SEED · FIVE COLORS`
- 各段标题：`LIVE PALETTE` / `输入种子色，实时生成`；`点一下` / `TAP FOR DETAILS`；`深色模式` / `DARK MODE`
- 结尾：`Hue · one seed, five colors`

## 5. 风险点与冒烟测试计划

| 风险 | 冒烟测试（`--scale 0.25`，2–3 s） | 通过标准 |
| --- | --- | --- |
| 页面是否接受合成事件（点击色块、开关） | `?smoke=1` 剧本：0.3 s 点第 3 块色块，1.0 s 点开关（rate 0.3），`--to 3` | cues 里出现 `pop`、`toggleStart`、`toggle` |
| 合成器动画是否跟随虚拟时间 | 同上 | `(toggle − toggleStart) × r ≈ 0.3 s`，不是 ≈ 1 帧 |
| 逐字输入能否触发 input 重新生成 | 同上，0.2–0.8 s 打 `#ff5f6d` | 出现 `swatch` cue；still 里第 1 块为 `#ff5f6d` |
| 字体未加载 / 方块字 | `--stills` 截标题帧 | 中文为 Noto Sans SC |
| 标题压住面板 / 开关 | 全片 stills 5.5、7.5 | 标题在左侧，面板、开关完整 |

## 6. 验收清单

- [ ] 时长 10.0 s / 1920×1080 / 30 fps / h264 + aac；分享版 < 30 MB
- [ ] blackdetect 只在 0–0.35 s 与结尾卡 ≥ 8.4 s 命中；freezedetect 无 > 3 s 定格
- [ ] `toggleStart → toggle` 的 `Δ × r` 在 0.25–0.35 s
- [ ] 标题不压主体；无滚动条；无方块字
- [ ] 结尾文字逐字为 `Hue · one seed, five colors`
- [ ] 渲染日志无 `[page-exc]`
- [ ] 未提交 MP4 / `demo-app/video/out/`

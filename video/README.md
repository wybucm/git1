# 看板宣传片（源码）

`trello/index.html` 的 58 秒宣传片，画面和声音全部由代码生成。

| 文件 | 作用 |
| --- | --- |
| `director.html` | 导演页。把真实的看板放进 iframe，脚本派发真实的 Pointer/Mouse/Keyboard 事件来驱动拖拽、弹窗、搜索、换背景、切主题；外层用 CSS 3D 做推拉摇移、景深（双层 backdrop 模糊）、动态模糊、遮幅、闪白、胶片颗粒和标题。画面是时间 `t` 的确定性函数。 |
| `cdp.mjs` | 极简 CDP 客户端：启动 `headless_shell`，开启 `--deterministic-mode` 和 BeginFrame 控制。 |
| `render.mjs` | 逐帧渲染。每帧先调用 `DIRECTOR.frame(t)`，再用 `HeadlessExperimental.beginFrame` 截图，然后用虚拟时间（`Emulation.setVirtualTimePolicy`）把浏览器时钟往前推进 `1/60 s × 速率`。看板自带的 CSS 过渡、FLIP 动画、定时器都跟着这个时钟走，所以慢镜头（speed ramp）是真实的慢放，不是插帧。帧通过管道交给 ffmpeg 编码成 H.264，同时导出 `out/cues.json` 音效提示点。 |
| `audio.py` | numpy/scipy 合成的预告片式配乐（120 BPM：氛围铺底、战鼓、上升音效、低频冲击、铜管“嗡”声）和 UI 音效（打字、点击、拿起、嗖声、让位、落位“咔哒”、钟声），按 `cues.json` 的时间放置，与画面逐帧同步。 |
| `fetch-fonts.sh` | 下载免费商用字体（SIL OFL）：Noto Sans SC、Inter、JetBrains Mono。 |
| `make.sh` | 一键运行：字体 → 渲染 → 音频 → 混流，输出 `out/kanban-promo.mp4`。 |

```bash
./video/make.sh
# 预览：只截几张关键帧
node video/render.mjs --no-video --to 0 --stills 3.9,11.8,14.2
```

依赖：Node 22、Playwright 自带的 `chromium_headless_shell`（可以用 `HEADLESS_SHELL` 指定路径）、Python 3 + numpy/scipy/imageio-ffmpeg。

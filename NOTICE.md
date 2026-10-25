# NOTICE / 第三方素材说明

本仓库的代码以 MIT 许可发布（见 `LICENSE`）。以下内容有额外的来源说明。

## 1. DeepSeek 鲸鱼线稿路径

开屏画面中央那条巨大的鲸鱼线稿，其 SVG 路径取自：

- **dsh-splash-launcher** — https://github.com/Isilsolme/dsh-splash-launcher
- 许可证：MIT
- 用途：在 `splash.html` 中以纯描边（`stroke-dashoffset` 自绘）方式呈现

原路径位于该仓库 `whale-anim.svg` 的 `.ink` 路径。本项目只使用了这条路径的几何数据，
未复用其动画逻辑或品牌资源。

## 2. 角色开场视频

`assets/intro.webm` 与 `assets/idle.webm` 是**用 AI 视频工具生成的原创素材**
（由本项目的作者提供角色设定图，经图生视频生成后做绿幕抠像与稳定化处理）。

> 如果你是 fork 者：这两个视频不含第三方版权内容，但如果你替换成自己的素材，
> 请自行确认你对该素材拥有发布权。

## 3. 名称与商标

"DeepSeek" 与 "DeepSeek Harness" 是其各自权利人的名称与商标。
本项目是一个**第三方插件**，与 DeepSeek 官方无隶属关系；插件内出现的
`DEEPSEEK HARNESS` 字样仅用于标识它所服务的宿主程序。

## 4. 字体

界面中的中文主标题使用系统衬线字体（按 `Source Han Serif SC` → `Songti SC` →
`STSong` → `SimSun` 顺序回退），**不打包也不分发任何字体文件**。

# blog.hhut.me（Horean's Blog）技术栈与设计风格分析

> 分析时间：2026-10-14
> 方法：抓取线上 HTML 源码 + `/_astro/*.css` / `*.js` 产物逆向，非猜测。

---

## 一、结论：最省事的路径

这个站**不是自己从零写的**，而是用了一个开源 Astro 主题：

```
主题：Firefly v6.12.1   https://github.com/CuteLeaf/Firefly
上游：Fuwari（saicaca/fuwari）的二次开发分支
许可：MIT
```

站内 footer 直接写着 `Powered by Astro & Firefly`，站点信息块写着 `Firefly v6.12.1`。
**你想要的东西（博客 + 分享 + GitHub 项目整理），直接用 Firefly 模板改配置就能得到 90% 的效果**，不需要复刻它的代码。

---

## 二、完整技术栈

| 层 | 技术 | 证据 |
|---|---|---|
| 站点框架 | **Astro v6.4.6**（SSG 静态生成） | `<meta name="generator" content="Astro v6.4.6">` |
| 语言 | TypeScript | `.astro_astro_type_script_index_0_lang.js` 产物命名 |
| 交互组件 | **Svelte**（Astro Islands 局部水合） | `renderer-url="/_astro/client.svelte.Dh6Tpeq3.js"`，`astro-island` + `svelte-zyhyi5` 作用域类 |
| CSS | **Tailwind CSS v4** | 66 个 `@property --tw-*`、`@layer properties`、`bg-(--page-bg)` 变量简写语法（v4 独有） |
| 图标 | **Iconify**，构建期内联成 SVG | `data-icon="material-symbols:home"` / `fa7-solid:paper-plane`，无运行时 API 请求 |
| 页面过渡 | **Swup** + 4 个插件 | `SwupA11yPlugin` / `SwupPreloadPlugin` / `SwupHeadPlugin` / `SwupScriptsPlugin` |
| 搜索 | **Pagefind**（纯客户端全文索引） | `import("/pagefind/pagefind.js")` |
| 代码高亮 | **Expressive Code** | `expressive-code` / `ec-line` / `data-language` |
| 数学公式 | **KaTeX** | 数学文章页命中 `katex`，主题配置 `data-theme="one-dark-pro"` 传给 Expressive Code |
| 图片灯箱 | **Fancybox** | `FancyboxManager.astro...js` + CSS 里的 `--f-button-*` 变量族 |
| 评论系统 | **Twikoo**（自建后端 `blog-twikoo.hxrch.top`） | 主题同时支持 twikoo / waline / artalk / giscus / disqus |
| 访问统计 | **Umami**（自建 `umami.hhut.me`） | `umami.hhut.me/script.js` + 出站链接自动埋点 |
| 字体 | **HarmonyOS Sans SC**（CDN `cdn.xrbk.cn`）+ **JetBrains Mono Variable** | `<link rel="stylesheet" href="https://cdn.xrbk.cn/fonts/HarmonyOS_Sans_SC/result.css">`，按 unicode-range 切片 |
| 部署 | **Vercel** | footer 站点信息 |
| 构建环境 | Node v24.19.0 / pnpm v9.14.4 / Linux x86_64 | 站点信息块自曝 |
| 图片托管 | 自建图床 `img.hhut.me`（PicGo + GitHub 方案） | 封面图全部走该域名 |

### 它经历了什么迁移（对你有参考价值）
`Hexo`（hexo-theme-redefine）→ `Astro + Firefly`；评论 `Waline` → `Twikoo`；图床 `LeanCloud` → 自建。
也就是说：**作者也是从 Hexo 起步的，最终迁到了 Astro。**

---

## 三、目录/产物结构特征

- 静态资源全部在 `/_astro/`，文件名带内容哈希：`MainGridLayout.DEE481F7.css`、`cover.LVH5wcXY_Zo70r7.webp`
- 图片统一转 **WebP** 并生成多尺寸变体（同一张 cover 有 5 个哈希版本）
- Astro 组件作用域样式用 `data-astro-cid-xxxxxxxx` 属性
- `robots.txt` 里 `Disallow: /_astro/`
- 有 `sitemap-index.xml` + `sitemap-0.xml` + RSS

### 站点页面（sitemap 实测）
```
/                     首页（分页 /2/ /3/）
/archive/             归档
/categories/          分类
/about/               关于我
/friends/             友链
/guestbook/           留言板
/gallery/*/           相册（含加密相册 encrypted-test）
/moments/             片刻 / 动态（短分享，类说说）
/posts/<中文slug>/    文章
```

---

## 四、视觉风格拆解（重点）

### 1. 主色调：oklch + 一个 `--hue` 变量驱动全站
这是它最值得抄的设计决策。全站所有颜色都不是写死的，而是：

```css
oklch(.35 .07 var(--hue))     /* 背景、卡片、边框、按钮，全是同一个 hue 不同明度/彩度 */
oklch(1 .01 var(--hue))       /* 亮色模式 */
oklch(.12 .015 var(--hue))    /* 暗色模式 */
```

- `--hue` 存在 `localStorage`，用户拖动一根滑块（0–360）就能全站换色，**不需要重新编译 CSS**。
- 默认 `--hue: 235`（偏蓝紫），页面里 `--configHue: 235` 也同步暴露出来。
- 用 **oklch** 而不是 hsl，是为了保证换 hue 时各色的感知亮度一致，不会有的色突兀。

**→ 你复刻时只要把颜色系统写成 oklch + 单个 hue 变量，就能白送一个"主题色自定义"功能。**

### 2. 语义化 CSS 变量分层
```css
--primary              /* 主色 */
--page-bg              /* 页面底色 */
--card-bg / --card-transparent-opacity
--radius-large
--btn-regular-bg / --btn-regular-bg-hover
--btn-plain-bg / --btn-plain-bg-hover / --btn-plain-bg-active
--btn-content
--banner-height-home: 65vh
--banner-height: 35vh
--page-width: 100rem
--navbar-glass-blur: 20px
--opacity-55
```
配合 Tailwind v4 的 `bg-(--primary)`、`max-w-(--page-width)` 简写直接使用。

### 3. 布局：Banner 大图 + 双栏卡片
- 首页顶部 **65vh 的 banner 大图**，文章页 35vh；导航栏叠在图上。
- 导航栏三种透明模式：`data-transparent-mode="full" | "semifull" | "semi"`，其中 semifull 会在**滚动超过 50px 后**加上毛玻璃（`backdrop-filter: blur(20px)`）——这个 `scrolled` class 切换逻辑是手写 JS，不是纯 CSS。
- 卡片圆角 `0.75rem`，桌面双栏（左正文 + 右侧栏动态区）。
- 移动端/桌面端**各渲染一套 banner 图**（`lg:hidden` / `hidden lg:block`），移动端还把非首图放进 `<template>` 避免预加载。

### 4. 四种壁纸模式（`data-wallpaper-mode`）
`banner`（顶部大图）/ `fullscreen`（全屏背景）/ 透明覆盖 / 纯色。
全屏模式下卡片半透明，透明度 `--card-transparent-opacity` 可由用户调（localStorage 持久化）。

### 5. 微交互
- **水波纹动画**（点击波纹）、**渐变过渡** —— 都在显示设置面板里可开关。
- 卡片 hover 缩放：`scale-animation` + `active:scale-95`。
- 移动端菜单用 `data-mobile-dropdown` / `data-mobile-submenu` 手写折叠，`aria-expanded` 做了无障碍。
- 亮/暗/跟随系统三态，且在 `<head>` 里**同步内联脚本**提前设置 `.dark` class，避免主题闪烁（FOUC）——这是标准且必要的做法。

### 6. 内容型组件
- 文章卡片：封面图 + 分类 + 摘要（`--descriptionClampLines: 3` 行截断）+ 标签 chips + 元信息
- 侧栏：公告、分类统计、**85 个标签的标签云**、站点统计（字数/篇数）、日历组件、文章目录（TOC，独立组件 `FloatingTOC` + `SidebarTOC`）
- Markdown 增强：4 种风格的提示框（GitHub / Obsidian / VitePress / Docusaurus）、GitHub 仓库卡片、Mermaid & PlantUML 图
- 其他：Live2D 看板娘（`PioMessageBox` 消息气泡）、音乐播放器、分享海报（`SharePoster`）、赞助页
- 中文友好：**中文 slug**（如 `/posts/平面几何-vs-其他方法谁才是王者/`）、i18n 支持简繁日中俄韩

---

## 五、给「博客 + 分享 + GitHub 项目」的落地建议

你的三个需求，Firefly 的对应现成模块：

| 需求 | 用什么 | 说明 |
|---|---|---|
| 博客文章 | `src/content/posts/*.md` | `pnpm new-post <name>` 新建；支持 KaTeX / Expressive Code / 提示框 |
| 分享 / 短动态 | `/moments/` 动态页 | 就是它的「片刻」，适合发短想法，不占文章位 |
| GitHub 开源项目 | 友链页 + **GitHub 仓库卡片** Markdown 语法 | 主题内置 repo card；也可自建 `/projects/` 页 |

### 推荐动手顺序
1. `git clone https://github.com/CuteLeaf/Firefly`，`pnpm i && pnpm dev` 先跑起来
2. 改 `src/config.ts` 系列配置文件（导航、侧栏、评论、统计、字体、banner）——**先配置，别改代码**
3. 定你的 `--hue` 主题色，把壁纸模式选成 `banner`
4. 接评论（Twikoo 需自建后端，或用 Vercel 版）和统计（Umami 自建 / Vercel Analytics）
5. 再考虑换字体、调卡片透明度这些细节

### 几个值得单独学过来的技巧
- **oklch + hue 变量**做全站换色
- **`<head>` 内联脚本预设主题**防闪烁
- **Iconify 构建期内联 SVG**，零运行时图标请求
- **Swup 做 MPA 无刷新过渡**（保留静态站的简单，拿到 SPA 的顺滑）
- **Pagefind** 做纯静态全文搜索，不需要搜索服务端
- 图片一律 WebP + 多尺寸 + LQIP 占位（`lqip-placeholder`）

---

## 附：原始证据位置

抓取的源码放在 `/tmp/hhut_analyze/src/`（临时目录，重启会清）：
- `index.html` — 首页完整源码（410 KB）
- `post2.html` — 一篇数学/迁移文章的源码
- `MainGridLayout.DEE481F7.css` — 全站样式（253 KB）
- `page.CiPokonQ.js` — Swup 初始化
- `Search.B57_iItm.js` — 搜索组件（Svelte 产物）

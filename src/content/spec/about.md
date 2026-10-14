# 关于我 / About Me

我是 **Antruly**，主要写 C++，关心网络编程、异步 IO 和系统底层那些事。

这里放三类东西：

- **文章** —— 技术笔记、踩坑复盘、读过的东西
- **分享** —— 短想法和零碎记录，不占文章位
- **项目** —— 自己写的开源项目，含进展和设计取舍

## 🛠️ 关于本站

用 [Astro](https://astro.build/) 构建，主题是 [Firefly](https://github.com/CuteLeaf/Firefly)（基于 [Fuwari](https://github.com/saicaca/fuwari) 的二次开发），部署在 Cloudflare Workers 上。

整站是**静态生成**的：文章和项目在构建期就渲染成 HTML，没有数据库、没有服务端渲染，所以打开很快，也不存在「后端挂了站就打不开」这种事。

### 站点用到的技术

| 层 | 用了什么 |
|---|---|
| 框架 | Astro（静态站点生成） |
| 样式 | Tailwind CSS v4，全站配色由单个 `--hue` 变量驱动，右下角设置面板里可以自己拖 |
| 交互 | Svelte 岛（局部水合）+ Swup 无刷新页面过渡 |
| 搜索 | Pagefind（纯客户端全文索引，不需要搜索服务端） |
| 代码高亮 | Expressive Code |
| 数学公式 | KaTeX |
| 评论 | Giscus（基于 GitHub Discussions） |
| 部署 | Cloudflare Workers 静态资源 |

### 关于后端

这个站目前没有后端——所有内容都是构建期生成的静态文件，评论走 Giscus，不需要服务器。

后续打算把一部分动态能力（比如访问统计）迁到我自己写的 C++ 网络库 [libuvcpp](https://github.com/Antruly/libuvcpp) 上，跑在自己的机器上，通过接口和这个静态站对接。所以前端调用统一走了一层 `src/lib/api.ts` 抽象，切换后端只需要改一个环境变量。

::github{repo="Antruly/libuvcpp"}

---

想看代码的话，都在 [GitHub](https://github.com/Antruly) 上。

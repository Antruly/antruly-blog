# 背景音乐：CC 曲库自托管

首页/侧栏播放器的曲子来自 Internet Archive 上**授权明确**的曲库（CC0 / 公有领域 / CC BY / CC BY-SA），
由 `scripts/fetch-cc-music.ts` 挑选、下载、生成歌单。这份文档只记「以后会忘、忘了会出事」的部分，
脚本细节看 `scripts/fetch-cc-music.ts` 的文件头注释。

## 两条硬约束

1. **不要手写歌单。** `src/constants/ccMusic.ts` 是生成文件，改 `scripts/cc-music-sources.json` 后
   跑 `pnpm music:fetch` 重新生成。手改会被下一次生成覆盖。

2. **不要删 `/music-credits/` 页面。** 当前曲目全是 CC BY 3.0，协议要求「署名 + 标明授权 + 给出
   授权原文链接」。那一页直接读 `ccMusic.ts` 自动渲染，删了就在法律上少了一环。
   每加一首新曲子，它会跟着自动更新，不需要手动维护。

## 常用命令

```bash
pnpm music:fetch                  # 按清单下载/更新，写本地自托管歌单
pnpm music:fetch --prune          # 先清空 public/assets/music/ 再写（删旧曲子用）
pnpm music:fetch --force          # 已下过的也重下
pnpm music:search "calm ambient"  # 搜有明确授权的曲子，按授权过滤后列出可用条目与曲目名
```

`pnpm music:search` 会把不能用（NC 禁商用 / ND 禁改编 / 授权未知）的条目直接标出来，
把选中的 `identifier` 和曲目名填进 `scripts/cc-music-sources.json` 即可。

## 换到 Cloudflare R2

音频现在放在 `public/assets/music/`，跟着站点一起部署（约 36 MB，已提交进仓库）。
曲子变多、仓库变大之后换成 R2：

```bash
# 1. 建桶（只做一次）
npx wrangler r2 bucket create blog-audio
# 2. 给桶绑自定义域名，例如 audio.<你的域名>
#    R2 控制台 → 桶 → Settings → Custom Domains
#    别用 r2.dev 子域，它有速率限制，不适合生产
# 3. 上传并把歌单换成绝对地址
MUSIC_BASE_URL=https://audio.<你的域名> pnpm music:fetch --target=r2
# 4. 删掉仓库里那份，省 36 MB
git rm -r --cached public/assets/music && rm -rf public/assets/music
```

之后 `git add src/constants/ccMusic.ts` 提交 —— 歌单里的 `url` 会变成 R2 绝对地址。
播放器对完整 `http(s)://` 地址是原样使用的（`MusicManager.astro` 里的 `isFullUrl` 判断），
所以不需要改任何组件。

> R2 的好处是出口流量免费、音频不占 Workers 静态资源的额度。
> 代价是多一个域名和一次上传步骤，所以曲目少的时候先本地托管更简单。

## 一个环境相关的坑

Node 的 `fetch` **不读** `http_proxy` / `https_proxy`（curl 读）。在配了代理的机器上直连
archive.org 会一路超时，而 curl 却正常 —— 脚本因此会在检测到代理环境变量时，带
`NODE_USE_ENV_PROXY=1` 把自己重启一遍（Node 24 的内置开关，只在启动时读一次）。
没配代理的机器上这段逻辑直接跳过，不会有任何影响。

同类脚本（`generate-github-card-data.ts`、`fetch-project-covers.ts`）如果哪天也拉不到东西，
大概率是同一个原因。

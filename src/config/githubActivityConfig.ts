// GitHub 活动 → 动态页同步配置。
//
// 数据由构建期的 scripts/generate-github-activity.ts 抓取，落盘到
// src/constants/github-activity.json，再由 /api/dynamic.json 预先渲染进静态 JSON。
// 运行时不会打 GitHub API，所以这里改完要重新构建才生效。
//
// 这里只用相对路径的 import：这个文件除了被 Astro 消费，还会被 tsx 脚本直接引入，
// 相对路径可以绕开各类别名解析的差异。

import type { GithubActivityConfig } from "../types/githubActivityConfig";

export const githubActivityConfig: GithubActivityConfig = {
	enable: true,

	// GitHub 用户名。仓库列表走 /users/{user}/repos，
	// 该接口只返回公开仓库——私有仓库由此被结构性排除，不依赖黑名单。
	user: "Antruly",

	// 回溯窗口。提交活动很集中，90 天通常只聚合出十几条，够看也不吵。
	days: 90,

	// 条目上限，超出时从最旧的开始丢。
	maxEntries: 200,

	// 每篇最多列几条提交标题。超出的部分合并成「等 N 次提交」，
	// 免得某天一口气提了 50 次把整页刷屏。
	maxCommitsPerEntry: 6,

	// 是否纳入 fork 仓库。项目和仓库页本来就展示 fork（HttpArena、Http11Probe），
	// 而且那边有真实提交。提交按 author 过滤，只会出现自己的提交，
	// 上游别人的活动不会被算进来；纯镜像 fork 自然产出 0 条。
	includeForks: true,
};

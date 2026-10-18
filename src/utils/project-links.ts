// 项目卡片 / 详情页的外链按钮。
//
// star 数是「会变的数据」，不该手写在 frontmatter 里——写死之后只会越来越旧
// （libuvcpp 从 13 涨到 16 就是这么发现的）。这里统一从构建期抓到的
// github-card-data.json 取数，frontmatter 只描述「有哪些链接」。
//
// 数据来自 scripts/generate-github-card-data.ts，每次构建刷新；
// 那个脚本按内容里的 ::github{repo="..."} 发现仓库，所以项目页需要保留这个指令。

import githubCardData from "@constants/github-card-data.json";

export interface ProjectLink {
	label: string;
	icon: string;
	value: string;
	/** owner/repo（小写）。只有 star 按钮带这个字段，浏览器端据此刷新数量 */
	repo?: string;
	/** 构建期抓到的星数；0 表示当前没有 */
	stars?: number;
}

interface GithubCardRecord {
	stars?: number | null;
}

/** github.com/owner/repo 形式的地址 */
const GITHUB_REPO_PATTERN =
	/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i;

/** 手写的 star 条目，形如「★ 16」 */
const STAR_LABEL_PATTERN = /^★/;

const CARD_DATA = githubCardData as Record<string, GithubCardRecord>;

/**
 * 补上 star 按钮。
 *
 * 规则：先丢掉所有手写的 ★ 条目（避免和自动生成的那条重复、也避免旧数字残留），
 * 再从卡片数据里按仓库取 stargazers 数量追加一条。
 *
 * 数量为 0 或取不到时**仍然生成**这一条（stars 记 0），由渲染层先隐藏——这样仓库
 * 从 0 涨到 1 时，浏览器端拿到新数据可以直接把它显示出来，不用等下一次构建。
 * 没有 GitHub 链接的项目不生成。
 */
export function withStarLink(links: ProjectLink[]): ProjectLink[] {
	const base = links.filter(
		(link) => !STAR_LABEL_PATTERN.test(link.label.trim()),
	);

	let repo: { key: string; url: string } | null = null;
	for (const link of base) {
		const match = link.value.match(GITHUB_REPO_PATTERN);
		if (!match) continue;
		const owner = match[1];
		const name = match[2].replace(/\.git$/i, "");
		repo = {
			key: `${owner}/${name}`.toLowerCase(),
			url: `https://github.com/${owner}/${name}`,
		};
		break;
	}
	if (!repo) return base;

	const fetched = CARD_DATA[repo.key]?.stars;
	const stars = typeof fetched === "number" ? fetched : 0;

	return [
		...base,
		{
			label: `★ ${stars}`,
			icon: "material-symbols:star",
			value: `${repo.url}/stargazers`,
			repo: repo.key,
			stars,
		},
	];
}

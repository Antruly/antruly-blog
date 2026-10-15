import type { CollectionEntry } from "astro:content";

/** 动态排序规则：置顶优先，然后按发布时间降序。 */
export const compareDynamics = (
	a: { pinned?: boolean; published: number },
	b: { pinned?: boolean; published: number },
): number => {
	if (a.pinned && !b.pinned) return -1;
	if (!a.pinned && b.pinned) return 1;
	return b.published - a.published;
};

export const sortDynamics = (
	entries: CollectionEntry<"dynamic">[],
): CollectionEntry<"dynamic">[] =>
	entries.sort((a, b) =>
		compareDynamics(
			{ pinned: a.data.pinned, published: a.data.published.getTime() },
			{ pinned: b.data.pinned, published: b.data.published.getTime() },
		),
	);

export const dynamicSlug = (id: string): string =>
	id.replace(/\.(md|mdx)$/i, "");

export const dynamicAnchor = (id: string): string =>
	`dynamic-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/**
 * 从 markdown 正文里抽出可用于检索的纯文本。
 *
 * 吃字符串而不是 entry，是因为动态有两个数据源：content collection 和构建期
 * 同步来的 GitHub 活动（见 src/constants/github-activity.json）。两者渲染路径一致，
 * 检索文本也应出自同一套规则。
 */
export const bodyPlainText = (body: string): string =>
	(body || "")
		.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/[#>*_`~[\]()\\-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

export const dynamicPlainText = (entry: CollectionEntry<"dynamic">): string =>
	bodyPlainText(entry.body || "");

export const dynamicSearchText = (entry: CollectionEntry<"dynamic">): string =>
	[dynamicPlainText(entry), entry.data.location]
		.filter(Boolean)
		.join(" ")
		.toLocaleLowerCase();

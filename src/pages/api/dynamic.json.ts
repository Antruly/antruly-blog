import { getCollection } from "astro:content";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import githubActivity from "@constants/github-activity.json";
import { githubActivityConfig } from "@/config/githubActivityConfig";
import {
	bodyPlainText,
	compareDynamics,
	dynamicSearchText,
	dynamicSlug,
	sortDynamics,
} from "@/utils/dynamic-utils";

interface DynamicImage {
	alt: string;
	src: string;
	title?: string;
}

interface DynamicPayload {
	id: string;
	published: number;
	html: string;
	images: DynamicImage[];
	searchText: string;
	pinned: boolean;
	location: string;
}

const markdownImagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

export async function GET(): Promise<Response> {
	const processor = await createMarkdownProcessor();

	// 来源一：src/content/dynamic/ 里手写的动态。
	const authored: DynamicPayload[] = await Promise.all(
		sortDynamics(await getCollection("dynamic")).map(async (entry) => {
			const images: DynamicImage[] = [];
			const markdown = (entry.body || "").replace(
				markdownImagePattern,
				(_match, alt: string, src: string, title?: string) => {
					images.push({ alt, src, ...(title ? { title } : {}) });
					return "";
				},
			);
			const rendered = await processor.render(markdown);

			return {
				id: dynamicSlug(entry.id),
				published: entry.data.published.getTime(),
				html: rendered.code,
				images,
				searchText: dynamicSearchText(entry),
				pinned: entry.data.pinned || false,
				location: entry.data.location.trim(),
			};
		}),
	);

	// 来源二：构建期从 GitHub 同步的活动摘要，由 scripts/generate-github-activity.ts
	// 按「仓库 × 自然日」聚合，markdown 已经生成好，这里走同一个处理器渲染。
	// 注意处理器不带任何自定义插件，所以那些内容只能用粗体/链接/列表。
	const synced: DynamicPayload[] = githubActivityConfig.enable
		? await Promise.all(
				githubActivity.entries.map(async (entry) => ({
					id: entry.id,
					published: entry.published,
					html: (await processor.render(entry.markdown)).code,
					images: [],
					searchText: bodyPlainText(entry.markdown).toLocaleLowerCase(),
					pinned: false,
					location: "",
				})),
			)
		: [];

	// 两个来源混排，用同一条排序规则（置顶优先，其余按时间倒序）。
	const data = [...authored, ...synced].sort(compareDynamics);

	return new Response(JSON.stringify(data), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

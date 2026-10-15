// 把 GitHub 提交活动抓下来，按「仓库 × 自然日」聚合成动态页能直接渲染的 markdown，
// 落盘到 src/constants/github-activity.json。
//
// 几点约束，改之前先看：
//
// 1. 产物要提交进仓库。抓取失败时保留上一次的结果，构建不会因此断掉。
// 2. 仓库列表走 /users/{user}/repos —— 这个接口只返回**公开仓库**，所以私有仓库
//    是结构性排除的，不需要（也不应该）为了保密维护黑名单。config 里的 excludeRepos
//    解决的是另一件事：公开、但不想让活动上首页的仓库。
// 3. 提交标题是外部文本，拼进 markdown 前必须转义，否则一个 * 或 [ 就能把整页排版搞乱。
// 4. 动态页用的是不带任何插件的裸 markdown 处理器，所以这里只能用
//    粗体 / 链接 / 列表，不能用 ::github{}、callout、mermaid 那些。

import fs from "node:fs/promises";
import path from "node:path";
import { githubActivityConfig } from "../src/config/githubActivityConfig";
import { siteConfig } from "../src/config/siteConfig";

const OUTPUT_FILE = "src/constants/github-activity.json";
const API_ROOT = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 8000;
const PER_PAGE = 100;
/** 单仓库最多翻几页。活动再密集也不至于把限额吃光，同时避免漏掉早期提交。 */
const MAX_PAGES = 2;
const REPO_CONCURRENCY = 4;
/** 单条提交标题的显示上限，超出截断。 */
const SUBJECT_MAX_LENGTH = 80;

interface GithubRepo {
	full_name: string;
	html_url: string;
	fork: boolean;
	archived: boolean;
	disabled: boolean;
	pushed_at: string | null;
}

interface GithubCommit {
	sha: string;
	commit: {
		message: string;
		author: { date?: string | null } | null;
		committer: { date?: string | null } | null;
	};
}

interface RepoCommit {
	sha: string;
	subject: string;
	date: Date;
}

interface ActivityEntry {
	id: string;
	repo: string;
	published: number;
	commitCount: number;
	markdown: string;
}

interface ActivityFile {
	generatedAt: string;
	entries: ActivityEntry[];
}

/** markdown 里有特殊含义、必须转义的字符。反斜杠本身排在最前。 */
const MARKDOWN_SPECIAL = /([\\`*_[\]<>])/g;
/** 行首的列表/引用标记，出现在提交标题开头时会造成意外的嵌套结构。 */
const LEADING_BULLET = /^([-+>])/;
/** 有序列表标记转义的是点号不是数字——CommonMark 只允许标点被转义， */
/** 「\1.」会原样显示出一个多余的反斜杠。 */
const LEADING_ORDERED = /^(\d+)\./;

const escapeMarkdown = (text: string): string =>
	text
		.replace(MARKDOWN_SPECIAL, "\\$1")
		.replace(LEADING_BULLET, "\\$1")
		.replace(LEADING_ORDERED, "$1\\.");

/** 提交标题只取第一行（正文在列表里放不下），再压掉多余空白。 */
const toSubject = (message: string): string =>
	message.split("\n")[0].replace(/\s+/g, " ").trim();

const truncate = (text: string, max: number): string =>
	text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

async function readCache(): Promise<ActivityFile | null> {
	try {
		const parsed = JSON.parse(await fs.readFile(OUTPUT_FILE, "utf-8"));
		return parsed && Array.isArray(parsed.entries) ? parsed : null;
	} catch {
		return null;
	}
}

function githubHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "antruly-site-build",
	};
	const token = process.env.GITHUB_TOKEN?.trim();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function githubJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		headers: githubHeaders(),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(
			`GitHub API returned ${response.status}${response.statusText ? ` ${response.statusText}` : ""} for ${url}`,
		);
	}
	return (await response.json()) as T;
}

/** 按 pushed_at 倒序的公开仓库；窗口内没有推送的直接跳过，省下请求。 */
async function listActiveRepos(since: Date): Promise<GithubRepo[]> {
	const { user, includeForks, excludeRepos } = githubActivityConfig;
	const repos = await githubJson<GithubRepo[]>(
		`${API_ROOT}/users/${encodeURIComponent(user)}/repos?type=owner&sort=pushed&per_page=100`,
	);
	if (!Array.isArray(repos)) throw new Error("仓库列表返回了非数组");

	const excluded = new Set(excludeRepos.map((name) => name.toLowerCase()));

	return repos.filter((repo) => {
		if (repo.archived || repo.disabled) return false;
		if (excluded.has(repo.full_name.toLowerCase())) return false;
		if (repo.fork && !includeForks) return false;
		if (!repo.pushed_at) return false;
		return new Date(repo.pushed_at).getTime() >= since.getTime();
	});
}

async function fetchRepoCommits(
	repoFullName: string,
	since: Date,
): Promise<RepoCommit[]> {
	const { user } = githubActivityConfig;
	const [owner, name] = repoFullName.split("/");
	const base = `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?author=${encodeURIComponent(user)}&since=${since.toISOString()}&per_page=${PER_PAGE}`;
	const commits: RepoCommit[] = [];

	for (let page = 1; page <= MAX_PAGES; page++) {
		const batch = await githubJson<GithubCommit[]>(`${base}&page=${page}`);
		if (!Array.isArray(batch)) throw new Error("提交列表返回了非数组");

		for (const item of batch) {
			const raw =
				item.commit?.author?.date ?? item.commit?.committer?.date ?? null;
			if (!raw) continue;
			const date = new Date(raw);
			if (Number.isNaN(date.getTime())) continue;
			commits.push({
				sha: item.sha,
				subject: toSubject(item.commit?.message ?? ""),
				date,
			});
		}

		if (batch.length < PER_PAGE) break;
	}

	return commits;
}

/** 按「仓库 × siteConfig.timezone 的自然日」聚合。 */
function groupByRepoAndDay(commits: RepoCommit[]): Map<string, RepoCommit[]> {
	const dayFormat = new Intl.DateTimeFormat("en-CA", {
		timeZone: siteConfig.timezone || "UTC",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const groups = new Map<string, RepoCommit[]>();

	for (const commit of commits) {
		const key = dayFormat.format(commit.date); // en-CA → YYYY-MM-DD
		const bucket = groups.get(key);
		if (bucket) bucket.push(commit);
		else groups.set(key, [commit]);
	}

	return groups;
}

function buildMarkdown(
	repoFullName: string,
	repoUrl: string,
	commits: RepoCommit[],
): string {
	const name = repoFullName.split("/")[1] ?? repoFullName;
	const shown = commits.slice(0, githubActivityConfig.maxCommitsPerEntry);
	const lines = shown.map(
		(commit) =>
			`- ${escapeMarkdown(truncate(commit.subject, SUBJECT_MAX_LENGTH))}`,
	);
	const rest = commits.length - shown.length;
	if (rest > 0) lines.push(`- …等 ${commits.length} 次提交`);

	return [
		`**[${name}](${repoUrl})** · ${commits.length} 次提交`,
		"",
		...lines,
		"",
		`[查看提交记录 →](${repoUrl}/commits)`,
	].join("\n");
}

/** 提交按时间升序读起来才顺，published 取当天最后一次。 */
function toEntries(repo: GithubRepo, commits: RepoCommit[]): ActivityEntry[] {
	const slug = repo.full_name.toLowerCase();
	const entries: ActivityEntry[] = [];

	for (const [day, bucket] of groupByRepoAndDay(commits)) {
		const ordered = [...bucket].sort(
			(a, b) => a.date.getTime() - b.date.getTime(),
		);
		const last = ordered[ordered.length - 1];
		entries.push({
			id: `${slug}@${day}`,
			repo: repo.full_name,
			published: last.date.getTime(),
			commitCount: ordered.length,
			markdown: buildMarkdown(repo.full_name, repo.html_url, ordered),
		});
	}

	return entries;
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;

	const worker = async (): Promise<void> => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await fn(items[index]);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker()),
	);
	return results;
}

async function writeActivityFile(entries: ActivityEntry[]): Promise<void> {
	const payload: ActivityFile = {
		generatedAt: new Date().toISOString(),
		entries,
	};
	await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
	await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, "\t")}\n`);
}

async function main(): Promise<void> {
	const since = new Date(
		Date.now() - githubActivityConfig.days * 24 * 60 * 60 * 1000,
	);

	let repos: GithubRepo[];
	try {
		repos = await listActiveRepos(since);
	} catch (error) {
		// 连仓库列表都拿不到（离线、限额、GitHub 抖动）：保留上次结果，构建继续。
		const cached = await readCache();
		if (cached) {
			console.warn(
				`[GITHUB-ACTIVITY] 仓库列表抓取失败，沿用上次的 ${cached.entries.length} 条动态。`,
				error,
			);
			return;
		}
		console.warn(
			"[GITHUB-ACTIVITY] 仓库列表抓取失败，且没有可用的缓存，动态页将只有文章内容。",
			error,
		);
		await writeActivityFile([]);
		return;
	}

	const perRepo = await mapWithConcurrency(
		repos,
		REPO_CONCURRENCY,
		async (repo) => {
			try {
				return toEntries(repo, await fetchRepoCommits(repo.full_name, since));
			} catch (error) {
				// 单个仓库失败不该拖垮整次同步。
				console.warn(
					`[GITHUB-ACTIVITY] ${repo.full_name} 的提交抓取失败，跳过。`,
					error,
				);
				return [];
			}
		},
	);

	// 按时间倒序，超出上限时丢最旧的。
	const entries = perRepo
		.flat()
		.sort((a, b) => b.published - a.published)
		.slice(0, githubActivityConfig.maxEntries);

	await writeActivityFile(entries);
	console.log(
		`[GITHUB-ACTIVITY] ${repos.length} 个活跃仓库 → ${entries.length} 条动态` +
			`（近 ${githubActivityConfig.days} 天，时区 ${siteConfig.timezone}）。`,
	);
}

main();

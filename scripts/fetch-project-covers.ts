/**
 * 抓取项目封面图。
 *
 * 做法：读 src/content/projects/*.md 的 frontmatter，从 link 里找出 GitHub 仓库地址，
 * 下载 GitHub 的 OpenGraph 社交预览图，转成 webp 存到 src/content/projects/images/。
 *
 * 为什么要在仓库里存一份，而不是直接让浏览器去请求 opengraph.githubassets.com：
 * 那张图挂在 GitHub 的域名上，国内访问经常连不上或极慢，首页项目卡片会大面积开天窗。
 * 存在自己站上就等于走自己的域名和 CDN。
 *
 * 用法：
 *   pnpm tsx scripts/fetch-project-covers.ts           # 已有的跳过
 *   pnpm tsx scripts/fetch-project-covers.ts --force   # 全部重新抓
 *
 * 这个脚本不在 build 流水线里 —— 项目变动时手动跑一次即可，避免每次构建都依赖外网。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import sharp from "sharp";

const PROJECTS_GLOB = "src/content/projects/*.md";
const OUTPUT_DIR = "src/content/projects/images";
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 600;
const COVER_QUALITY = 82;

const force = process.argv.includes("--force");

/** 从 frontmatter 的 link 里找 GitHub 仓库地址，返回 owner/repo */
function findGithubRepo(link: unknown): string | null {
	if (!Array.isArray(link)) return null;
	for (const item of link) {
		const value = (item as { value?: unknown })?.value;
		if (typeof value !== "string") continue;
		const match = value.match(
			/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i,
		);
		if (match) return `${match[1]}/${match[2]}`;
	}
	return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** opengraph.githubassets.com 对连续请求会返回 429，所以要串行 + 间隔 + 退避重试 */
async function downloadCover(repo: string, maxAttempts = 4): Promise<Buffer> {
	const url = `https://opengraph.githubassets.com/1/${repo}`;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const res = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(20000),
		});

		if (res.status === 429 || res.status >= 500) {
			if (attempt === maxAttempts) {
				throw new Error(
					`HTTP ${res.status} ${res.statusText}（重试 ${maxAttempts} 次后放弃）`,
				);
			}
			await sleep(3000 * attempt); // 3s / 6s / 9s
			continue;
		}
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} ${res.statusText}`);
		}

		const type = res.headers.get("content-type") ?? "";
		if (!type.startsWith("image/")) {
			throw new Error(`返回的不是图片（content-type: ${type || "空"}）`);
		}
		return Buffer.from(await res.arrayBuffer());
	}

	throw new Error("不可达");
}

async function main() {
	const files = (await glob(PROJECTS_GLOB)).sort();
	await fs.mkdir(OUTPUT_DIR, { recursive: true });

	let written = 0;
	let skipped = 0;
	const failures: string[] = [];

	for (const file of files) {
		const name = path.basename(file, path.extname(file));
		const outPath = path.join(OUTPUT_DIR, `${name}.webp`);

		if (!force) {
			try {
				await fs.access(outPath);
				skipped++;
				continue;
			} catch {
				// 不存在，继续抓
			}
		}

		const raw = await fs.readFile(file, "utf-8");
		const { data } = matter(raw);
		const repo = findGithubRepo(data.link);

		if (!repo) {
			failures.push(`${name}: frontmatter 的 link 里没有 GitHub 地址`);
			continue;
		}

		try {
			const png = await downloadCover(repo);
			const webp = await sharp(png)
				.resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
				.webp({ quality: COVER_QUALITY })
				.toBuffer();
			await fs.writeFile(outPath, webp);
			written++;
			console.log(
				`  ✓ ${name.padEnd(22)} ← ${repo.padEnd(28)} ${(webp.length / 1024).toFixed(0)} KB`,
			);
			await sleep(1500); // 拉慢一点，别把 OG 服务惹毛
		} catch (error) {
			failures.push(
				`${name}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	console.log(
		`\n[PROJECT-COVERS] 写入 ${written} 张，跳过 ${skipped} 张（已存在），失败 ${failures.length} 个。`,
	);
	for (const f of failures) console.warn(`  ✗ ${f}`);
	if (failures.length > 0) process.exitCode = 1;
}

main();

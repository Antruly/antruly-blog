// 浏览器端刷新项目卡片上的 star 数。
//
// 构建期的数字是兜底：没有 JS、接口挂了、或者还没请求回来，看到的都是它。拿到新
// 数据后再覆盖。
//
// 一次请求拿全表：GET /users/{user}/repos 返回该用户全部公开仓库（含
// stargazers_count），一百个仓库以内一个请求就够。不要按仓库逐个请求——首页摆着
// 八张卡片，那就是八次；匿名额度是每 IP 每小时 60 次，很容易被自己打光。
//
// 结果存 localStorage 一小时。过期后重新拉，失败就继续用旧值和构建期数字。

import { githubActivityConfig } from "@/config/githubActivityConfig";

const CACHE_KEY = "project-stars:v1";
const CACHE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;
const API_ROOT = "https://api.github.com";

interface ApiRepo {
	full_name?: unknown;
	stargazers_count?: unknown;
}

interface CacheEntry {
	fetchedAt: number;
	stars: Record<string, number>;
}

function readCache(): Record<string, number> | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const entry = JSON.parse(raw) as CacheEntry;
		if (!entry || typeof entry.fetchedAt !== "number" || !entry.stars) {
			return null;
		}
		if (Date.now() - entry.fetchedAt >= CACHE_TTL) return null;
		return entry.stars;
	} catch {
		// 隐私模式、配额满、JSON 坏了：一律当作没有缓存
		return null;
	}
}

function writeCache(stars: Record<string, number>): void {
	try {
		const entry: CacheEntry = { fetchedAt: Date.now(), stars };
		localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
	} catch {
		// 写不进去不影响本次显示
	}
}

async function fetchStars(): Promise<Record<string, number> | null> {
	const user = githubActivityConfig.user;
	const url = `${API_ROOT}/users/${encodeURIComponent(user)}/repos?type=owner&sort=updated&per_page=100`;

	try {
		const response = await fetch(url, {
			referrerPolicy: "no-referrer",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const repos = (await response.json()) as ApiRepo[];
		if (!Array.isArray(repos)) throw new Error("返回的不是数组");

		const stars: Record<string, number> = {};
		for (const repo of repos) {
			if (
				typeof repo.full_name === "string" &&
				typeof repo.stargazers_count === "number"
			) {
				stars[repo.full_name.toLowerCase()] = repo.stargazers_count;
			}
		}
		return stars;
	} catch (error) {
		// 限流、断网、被墙：保留构建期数字，不要清空已有的显示
		console.warn("[PROJECT-STARS] 刷新失败，沿用构建期数字。", error);
		return null;
	}
}

/** 把拿到的数量写到页面上；没有对应数据的卡片保持原样 */
function apply(stars: Record<string, number>): void {
	const buttons = document.querySelectorAll<HTMLElement>("[data-project-star]");
	for (const button of buttons) {
		const repo = button.dataset.repo?.toLowerCase();
		if (!repo) continue;

		const count = stars[repo];
		if (typeof count !== "number") continue;

		if (count <= 0) {
			button.style.display = "none";
			continue;
		}

		const label = button.querySelector<HTMLElement>("[data-star-count]");
		if (label) label.textContent = `★ ${count}`;
		button.style.display = "";
	}
}

let initialized = false;
let latest: Record<string, number> | null = null;
let requested = false;

/**
 * 同步一次。重复调用是安全的：同一份数据只请求一次，
 * 之后每次切页只是把缓存里的值重新写到新的 DOM 上。
 */
function sync(): void {
	if (!requested) {
		requested = true;
		const cached = readCache();
		if (cached) {
			latest = cached;
		} else {
			void fetchStars().then((stars) => {
				if (!stars) return;
				latest = stars;
				writeCache(stars);
				apply(stars);
			});
		}
	}
	if (latest) apply(latest);
}

export function initProjectStars(): void {
	if (initialized) return;
	initialized = true;

	sync();
	// Swup 切页后 DOM 是新的，重建的 star 按钮要重新写一遍（用缓存，不再请求）
	document.addEventListener("astro:page-load", sync);
}

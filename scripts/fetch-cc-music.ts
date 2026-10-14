/**
 * 从 archive.org 拉取「授权明确」的音乐，生成自托管的播放列表。
 *
 * 为什么要有这个脚本，而不是随手找几首丢进 public/：
 * 授权不明的曲子上站就是侵权，将来申请开往、或被人找上门都是麻烦。
 * 所以原则是「先卡授权，再下载」—— archive.org 每个条目都带一个 licenseurl，
 * 本脚本只认 CC0 / 公有领域 / CC BY / CC BY-SA（可商用、可改编），
 * 碰到 NC（禁商用）或 ND（禁改编）就直接报错退出，不静默跳过。
 * 宁可少几首，也不要板上钉钉的侵权。
 *
 * 产物：
 *   src/constants/ccMusic.ts          播放列表常量（提交进仓库，构建时不联网）
 *   public/assets/music/*.mp3         音频本体（--target=local）
 *   public/assets/music/cover/*.webp  封面（条目缩略图裁方）
 *
 * 增删曲目：改 scripts/cc-music-sources.json 再跑一次 pnpm music:fetch，本文件不用动。
 *
 * 用法：
 *   pnpm music:fetch                下载到 public/assets/music/，歌单写站内相对路径
 *   pnpm music:fetch --target=r2    传到 Cloudflare R2，歌单写绝对 URL
 *   pnpm music:fetch --force        已下过的也重新下
 *   pnpm music:fetch --prune        写入前先清空 public/assets/music/（删之前会列出来）
 *   pnpm music:search "calm piano"  搜 archive.org 上能用的曲子（按授权过滤）
 *
 * --target=r2 需要的环境变量：
 *   MUSIC_BASE_URL  R2 绑定的自定义域名，如 https://audio.example.com
 *                   （r2.dev 子域有速率限制，别用于生产）
 *   R2_BUCKET       桶名，默认 blog-audio
 *
 * 不在 build 流水线里：音频是低频变动的资源，构建时联网只会让 CI 变脆。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// ── 路径与常量 ────────────────────────────────────────────────

/** 手改的文件：要哪些曲子写在这里 */
const SOURCES_FILE = "scripts/cc-music-sources.json";
/** 下载缓存。r2 模式下也先落到这儿，重跑不会重复下载 */
const CACHE_DIR = ".cc-music";
/** 生成的播放列表常量 */
const OUTPUT_TS = "src/constants/ccMusic.ts";
/** --target=local 时音频的落地目录 */
const LOCAL_MUSIC_DIR = "public/assets/music";
const LOCAL_COVER_DIR = "public/assets/music/cover";

const DEFAULT_R2_BUCKET = "blog-audio";
/** 曲子内容不会变，直接长缓存 */
const R2_CACHE_CONTROL = "public, max-age=31536000, immutable";
const COVER_SIZE = 400;

/** archive.org 对没有 UA 的脚本请求偶尔会 403 */
const USER_AGENT = "antruly-blog-music-fetcher/1.0";

// ── 授权白名单 ────────────────────────────────────────────────

/**
 * 归一化后的授权地址 → 展示名。只收「可商用 + 可改编」的：
 * CC0 和公有领域标记没有限制；BY 只要署名；BY-SA 署名 + 相同方式共享。
 */
const ALLOWED_LICENSES: Record<string, string> = {
	"creativecommons.org/publicdomain/zero/1.0": "CC0 1.0",
	"creativecommons.org/publicdomain/mark/1.0": "Public Domain Mark 1.0",
	"creativecommons.org/licenses/by/1.0": "CC BY 1.0",
	"creativecommons.org/licenses/by/2.0": "CC BY 2.0",
	"creativecommons.org/licenses/by/2.5": "CC BY 2.5",
	"creativecommons.org/licenses/by/3.0": "CC BY 3.0",
	"creativecommons.org/licenses/by/4.0": "CC BY 4.0",
	"creativecommons.org/licenses/by-sa/1.0": "CC BY-SA 1.0",
	"creativecommons.org/licenses/by-sa/2.0": "CC BY-SA 2.0",
	"creativecommons.org/licenses/by-sa/2.5": "CC BY-SA 2.5",
	"creativecommons.org/licenses/by-sa/3.0": "CC BY-SA 3.0",
	"creativecommons.org/licenses/by-sa/4.0": "CC BY-SA 4.0",
};

/**
 * 明确不能用的那些。放到单独一张表只为了能给出人话解释 ——
 * 命中这些时报「禁商用」比报「不在白名单里」有用得多。
 * 顺序有讲究：BY-NC-ND 要排在 BY-NC / BY-ND 前面。
 */
const FORBIDDEN_MARKERS: ReadonlyArray<readonly [RegExp, string]> = [
	[/\/by-nc-nd\//, "CC BY-NC-ND：禁商用，且禁改编"],
	[/\/by-nc-sa\//, "CC BY-NC-SA：禁商用"],
	[/\/by-nc\//, "CC BY-NC：禁商用"],
	[/\/by-nd\//, "CC BY-ND：禁改编"],
	[/\/nc\//, "NC：禁商用"],
	[/\/nd\//, "ND：禁改编"],
	[/\/sampling/, "Sampling+：附加条件不统一，不自动放行"],
	[/\/devnations\//, "Developing Nations：仅限特定地区"],
];

// ── 类型 ──────────────────────────────────────────────────────

/** archive.org metadata 接口里 files 数组的一项 */
type IaFile = {
	name?: string;
	title?: string;
	format?: string;
	size?: string;
};

/** archive.org metadata 接口的响应（只声明用得到的字段） */
type IaItem = {
	metadata?: {
		identifier?: string;
		creator?: unknown;
		licenseurl?: unknown;
	};
	files?: IaFile[];
};

/** 手改的清单文件 */
type SourcesManifest = {
	items?: Array<{
		/** archive.org 条目标识符，就是详情页 URL 里 details/ 后面那一段 */
		id: string;
		/** 曲目名（对 title 或文件名都行），或者 "all" 表示整张都要 */
		tracks: string[] | "all";
		/** 覆盖作者名。不填就用条目的 creator */
		artist?: string;
	}>;
};

type LicenseVerdict =
	| { ok: true; label: string; url: string }
	| { ok: false; reason: string };

type Target = "local" | "r2";

/** 计划下载的一首曲子 */
type PlannedTrack = {
	name: string;
	artist: string;
	/** 来源条目标识符，取封面图还要用它 */
	identifier: string;
	/** 落地文件名，如 gymnopedie-no-1.mp3 */
	fileName: string;
	/** 封面文件名，如 cover/classical-sampler-9615.webp */
	coverFileName: string;
	downloadUrl: string;
	expectedSize: number | null;
	license: string;
	licenseUrl: string;
	sourceUrl: string;
};

/** 写进 ccMusic.ts 的一条记录 */
type RenderedTrack = {
	name: string;
	artist: string;
	url: string;
	cover: string;
	license: string;
	licenseUrl: string;
	sourceUrl: string;
};

// ── 命令行参数 ────────────────────────────────────────────────

const argv = process.argv.slice(2);

const hasFlag = (name: string): boolean =>
	argv.includes(`--${name}`) || argv.includes(`-${name[0]}`);

/** 取 `--name=value` 或 `--name value` 的值 */
function getOption(name: string): string | undefined {
	const inline = argv.find((a) => a.startsWith(`--${name}=`));
	if (inline) return inline.slice(name.length + 3);
	const at = argv.indexOf(`--${name}`);
	return at >= 0 ? argv[at + 1] : undefined;
}

const isOptionGiven = (name: string): boolean =>
	argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Node 的 fetch 默认不读 http_proxy / https_proxy（curl 读），所以在配了代理的机器上
 * 直连 archive.org 会一路超时。Node 24 有个内置开关 NODE_USE_ENV_PROXY=1 能让 fetch 认
 * 环境变量里的代理，但它只在进程启动时读一次 —— 只能带着这个变量把自己重启一遍。
 *
 * 没配代理的机器上直接返回，什么都不会发生。这么做的动机很简单：
 * 这台机器上 curl 能访问 archive.org、Node 不能，脚本不该比 curl 更难用。
 */
function reexecWithProxyEnv(): void {
	if (process.env.NODE_USE_ENV_PROXY === "1") return;
	const proxy =
		process.env.HTTPS_PROXY ??
		process.env.https_proxy ??
		process.env.HTTP_PROXY ??
		process.env.http_proxy;
	if (!proxy) return;

	console.log(
		`[PROXY] 检测到代理 ${proxy}，带 NODE_USE_ENV_PROXY=1 重新启动脚本`,
	);
	const result = spawnSync(
		process.execPath,
		// execArgv 里带着 tsx 的 loader，照搬才能以同样的方式跑起来
		[...process.execArgv, ...process.argv.slice(1)],
		{ env: { ...process.env, NODE_USE_ENV_PROXY: "1" }, stdio: "inherit" },
	);
	if (result.error) throw result.error;
	process.exit(result.status ?? 1);
}

// ── 授权判定 ──────────────────────────────────────────────────

/**
 * 把 archive.org 上的各种写法收敛成一个 key。
 * 会遇到的变体：http/https、带 www、末尾斜杠、/deed.en 后缀、/us 这类司法辖区端口。
 * 归一化只做「去装饰」，拿不准的一律落到白名单外 → 拒绝。宁可拒错，不可放错。
 */
function normalizeLicenseUrl(raw: string): string {
	return (
		raw
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			// …/by/4.0/deed.en、…/by/4.0/deed.zh
			.replace(/\/deed[^/]*$/, "")
			.replace(/\/+$/, "")
			// 司法辖区端口，如 …/by/3.0/us、…/by/2.5/de
			.replace(/\/[a-z]{2}(?:-[a-z]{2})?$/, "")
	);
}

/** 授权过关才返回 ok。不抛异常，把「为什么不行」交给调用方决定怎么呈现 */
function classifyLicense(licenseurl: unknown): LicenseVerdict {
	const raw = Array.isArray(licenseurl) ? licenseurl[0] : licenseurl;
	if (typeof raw !== "string" || raw.trim() === "") {
		return { ok: false, reason: "条目没填 licenseurl，授权状态未知" };
	}
	const normalized = normalizeLicenseUrl(raw);
	for (const [pattern, reason] of FORBIDDEN_MARKERS) {
		if (pattern.test(normalized)) return { ok: false, reason };
	}
	const label = ALLOWED_LICENSES[normalized];
	if (label === undefined) {
		return { ok: false, reason: `不认识的授权协议：${raw}` };
	}
	return { ok: true, label, url: raw };
}

// ── HTTP ──────────────────────────────────────────────────────

/**
 * 带退避的请求。只重试「可能是限流」的情况（5xx / 429 / 网络层报错）；
 * 4xx 是请求本身不对，重试没有意义，直接抛。
 */
async function fetchWithRetry(
	url: string,
	init: RequestInit = {},
	attempts = 3,
): Promise<Response> {
	let lastError: unknown = new Error("没有发起请求");

	for (let attempt = 1; attempt <= attempts; attempt++) {
		let res: Response;
		try {
			res = await fetch(url, {
				...init,
				headers: { "user-agent": USER_AGENT, ...(init.headers ?? {}) },
			});
		} catch (error) {
			lastError = error;
			if (attempt < attempts) await sleep(2000 * attempt);
			continue;
		}

		if (res.ok) return res;
		if (res.status < 500 && res.status !== 429) {
			throw new Error(`HTTP ${res.status} ${res.statusText} —— ${url}`);
		}

		lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
		if (attempt < attempts) await sleep(3000 * attempt);
	}

	throw new Error(
		`连续 ${attempts} 次失败（${lastError instanceof Error ? lastError.message : String(lastError)}）—— ${url}`,
	);
}

async function fetchItem(identifier: string): Promise<IaItem> {
	const res = await fetchWithRetry(
		`https://archive.org/metadata/${encodeURIComponent(identifier)}`,
	);
	const json = (await res.json()) as IaItem;
	// id 写错时 archive.org 返回的是空对象配 HTTP 200，不是 404，只能自己认
	if (!json || json.metadata === undefined) {
		throw new Error(
			`archive.org 上没有 ${identifier} 这个条目（id 写错了？）\n` +
				"  条目 id 就是详情页 URL 里 details/ 后面那一段。",
		);
	}
	if (!Array.isArray(json.files)) {
		throw new Error(`条目 ${identifier} 的 metadata 里没有 files 字段`);
	}
	return json;
}

// ── 曲目挑选 ──────────────────────────────────────────────────

/**
 * 从 format 字段认 MP3，并给出偏好分（越小越好）。
 *
 * archive.org 的 MP3 导数写法五花八门：VBR MP3 / 192Kbps MP3 / 128Kbps MP3 / 干脆只写 MP3。
 * 一开始只认 VBR 和 128Kbps 两种，结果把一个存了 230 首「192Kbps MP3」的条目
 * 判成了「没有 MP3 导数」——所以改成「名字里带 mp3 的都收，再按码率挑最好的那份」。
 * 返回 -1 表示这不是 MP3。
 */
function mp3Rank(format: string | undefined): number {
	if (!format || !/mp3/i.test(format)) return -1;
	// VBR 一般等价于 V0（约 245kbps），排最前
	if (/vbr/i.test(format)) return 0;
	const kbps = format.match(/(\d+)\s*kbps/i);
	// 码率越高分越小
	if (kbps) return 1000 - Number(kbps[1]);
	// 只写 "MP3" 的，排在有码率标注的后面（标注了码率的多半是重新压过的，更可控）
	return 900;
}

const normalizeKey = (raw: string): string =>
	raw
		.toLowerCase()
		.replace(/\.mp3$/, "")
		.replace(/_+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/** 一个文件可以用来匹配的几种写法：title、name、去掉目录的 name */
function matchKeys(file: IaFile): string[] {
	const keys = new Set<string>();
	for (const candidate of [
		file.title,
		file.name,
		file.name ? path.basename(file.name) : undefined,
	]) {
		if (typeof candidate !== "string") continue;
		const key = normalizeKey(candidate);
		// title 经常是字面量 "None"，当成没填
		if (key && key !== "none") keys.add(key);
	}
	return [...keys];
}

/**
 * 列出可用作音源的 MP3。
 * 同一首曲子 archive.org 常常同时给 VBR 和 128Kbps 两份、name 一样，按 name 去重留好的那份。
 */
function mp3Files(files: IaFile[]): IaFile[] {
	const byName = new Map<string, IaFile>();
	for (const file of files) {
		if (!file.name) continue;
		const rank = mp3Rank(file.format);
		if (rank < 0) continue;
		const previous = byName.get(file.name);
		if (previous === undefined || rank < mp3Rank(previous.format)) {
			byName.set(file.name, file);
		}
	}
	return [...byName.values()];
}

/** 展示用：title 没填就退回文件名 */
const displayName = (file: IaFile): string =>
	file.title && file.title !== "None" ? file.title : String(file.name ?? "?");

function findTrack(files: IaFile[], wanted: string): IaFile | null {
	const target = normalizeKey(wanted);
	return files.find((f) => matchKeys(f).includes(target)) ?? null;
}

function downloadUrlFor(identifier: string, fileName: string): string {
	const encodedName = fileName
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
}

// ── 文件名 ────────────────────────────────────────────────────

function slugify(raw: string): string {
	const slug = raw
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^\w\s-]/g, "")
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || "track";
}

/** 同名曲子（不同条目重名）加个序号，保证可重复生成同样的文件列表 */
function uniqueSlug(base: string, taken: Set<string>): string {
	if (!taken.has(base)) {
		taken.add(base);
		return base;
	}
	for (let i = 2; ; i++) {
		const candidate = `${base}-${i}`;
		if (!taken.has(candidate)) {
			taken.add(candidate);
			return candidate;
		}
	}
}

// ── 下载 ──────────────────────────────────────────────────────

type DownloadResult = "hit" | "miss";

async function downloadToCache(
	url: string,
	dest: string,
	expectedSize: number | null,
	force: boolean,
): Promise<DownloadResult> {
	if (!force) {
		try {
			const stat = await fs.stat(dest);
			// 上次下到一半断掉的话文件会偏小，比一下字节数再决定要不要重下
			if (expectedSize === null || stat.size === expectedSize) return "hit";
		} catch {
			// 文件不存在，往下走正常下载
		}
	}

	const res = await fetchWithRetry(url, {
		signal: AbortSignal.timeout(180_000),
	});
	const buffer = Buffer.from(await res.arrayBuffer());
	if (expectedSize !== null && buffer.length !== expectedSize) {
		throw new Error(
			`下载大小对不上：期望 ${expectedSize} 字节，实际 ${buffer.length} 字节`,
		);
	}

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, buffer);
	return "miss";
}

/** 条目缩略图裁成方形 webp。archive.org 只提供条目级缩略图，同条目的曲子共用一张 */
async function downloadCover(
	identifier: string,
	dest: string,
	force: boolean,
): Promise<DownloadResult> {
	if (!force) {
		try {
			await fs.access(dest);
			return "hit";
		} catch {
			// 没有封面，往下走
		}
	}

	const res = await fetchWithRetry(
		`https://archive.org/services/img/${encodeURIComponent(identifier)}`,
	);
	const webp = await sharp(Buffer.from(await res.arrayBuffer()))
		.resize(COVER_SIZE, COVER_SIZE, { fit: "cover" })
		.webp({ quality: 80 })
		.toBuffer();

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.writeFile(dest, webp);
	return "miss";
}

// ── R2 ────────────────────────────────────────────────────────

function uploadToR2(localPath: string, key: string, contentType: string): void {
	const bucket = process.env.R2_BUCKET?.trim() || DEFAULT_R2_BUCKET;
	const result = spawnSync(
		"npx",
		[
			"wrangler",
			"r2",
			"object",
			"put",
			`${bucket}/${key}`,
			"--file",
			localPath,
			"--content-type",
			contentType,
			"--cache-control",
			R2_CACHE_CONTROL,
			"--remote",
		],
		{ stdio: "inherit" },
	);

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`wrangler 上传失败（退出码 ${result.status}）：${key}\n` +
				"  先确认已经 `npx wrangler login`，且桶名正确（默认 blog-audio，可用 R2_BUCKET 覆盖）。",
		);
	}
}

// ── 生成 ccMusic.ts ───────────────────────────────────────────

function renderModule(
	tracks: RenderedTrack[],
	target: Target,
	musicBaseUrl: string | null,
): string {
	const entries = tracks
		.map((track) =>
			[
				"\t{",
				`\t\tname: ${JSON.stringify(track.name)},`,
				`\t\tartist: ${JSON.stringify(track.artist)},`,
				`\t\turl: ${JSON.stringify(track.url)},`,
				`\t\tcover: ${JSON.stringify(track.cover)},`,
				'\t\tlrc: "",',
				`\t\tlicense: ${JSON.stringify(track.license)},`,
				`\t\tlicenseUrl: ${JSON.stringify(track.licenseUrl)},`,
				`\t\tsourceUrl: ${JSON.stringify(track.sourceUrl)},`,
				"\t},",
			].join("\n"),
		)
		.join("\n");

	const targetNote =
		target === "local"
			? "音频自托管在 public/assets/music/（随站点一起部署）"
			: `音频托管在 R2：${musicBaseUrl}（r2://${process.env.R2_BUCKET?.trim() || DEFAULT_R2_BUCKET}/music/）`;

	return `// 本文件由 scripts/fetch-cc-music.ts 自动生成，不要手改。
// 增删曲目：编辑 scripts/cc-music-sources.json，然后跑 pnpm music:fetch。
//
// 当前 target：${target} —— ${targetNote}
//
// 授权：下面每首曲子都来自 archive.org，授权为 CC0 / 公有领域 / CC BY / CC BY-SA，
// 商用、再分发都没问题。CC BY 与 CC BY-SA 要求署名 —— /music-credits 页面
// 就是干这个的，它直接读这个文件，所以改了这里署名页会跟着变。
// 音频文件原样下载，没有转码或剪辑，只是重命名后自托管。

export type CcMusicTrack = {
	/** 曲名 */
	name: string;
	/** 作者 */
	artist: string;
	/** 音频地址。local 模式是站内相对路径，r2 模式是 R2 绝对地址 */
	url: string;
	/** 封面地址。同一条目下的曲子共用一张 */
	cover: string;
	/** LRC 歌词。这些是纯音乐，没有歌词 */
	lrc: string;
	/** 授权简称，如 "CC BY 3.0" */
	license: string;
	/** 授权原文地址。CC BY / BY-SA 署名时必须带上它 */
	licenseUrl: string;
	/** 曲目在 archive.org 上的出处 */
	sourceUrl: string;
};

/** 播放器要的字段。多出来的授权信息播放器不读，署名页要读 */
export type CcMusicPlaylistEntry = Pick<
	CcMusicTrack,
	"name" | "artist" | "url" | "cover" | "lrc"
>;

export const ccMusicTracks: CcMusicTrack[] = [
${entries}
];

/**
 * 交给音乐播放器的歌单。直接复用 ccMusicTracks ——
 * 结构上兼容，多出来的授权字段播放器会忽略。
 */
export const ccMusicPlaylist: CcMusicPlaylistEntry[] = ccMusicTracks;
`;
}

// ── 主流程 ────────────────────────────────────────────────────

async function planTracks(): Promise<{
	tracks: PlannedTrack[];
	items: Array<{ identifier: string; license: string; licenseUrl: string }>;
}> {
	const manifest = JSON.parse(
		await fs.readFile(SOURCES_FILE, "utf-8"),
	) as SourcesManifest;

	if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
		throw new Error(`${SOURCES_FILE} 里没有 items，不知道要下什么`);
	}

	const tracks: PlannedTrack[] = [];
	const items: Array<{
		identifier: string;
		license: string;
		licenseUrl: string;
	}> = [];
	const takenSlugs = new Set<string>();

	for (const item of manifest.items) {
		if (!item.id) throw new Error(`${SOURCES_FILE} 有一项没写 id`);

		console.log(`\n[条目] ${item.id}`);
		const data = await fetchItem(item.id);

		// 授权不过关就整条中止。用户在清单里点名要了它，得让他知道并用得明白原因，
		// 而不是悄悄少下几首、事后对不上歌单
		const verdict = classifyLicense(data.metadata?.licenseurl);
		if (!verdict.ok) {
			throw new Error(
				`条目 ${item.id} 的授权不能用：${verdict.reason}\n` +
					`  出处：https://archive.org/details/${item.id}\n` +
					`  要么先在页面上确认授权，要么把它从 ${SOURCES_FILE} 里删掉。`,
			);
		}
		console.log(`  授权 ${verdict.label}（${verdict.url}）`);
		items.push({
			identifier: item.id,
			license: verdict.label,
			licenseUrl: verdict.url,
		});

		const candidates = mp3Files(data.files ?? []);
		if (candidates.length === 0) {
			throw new Error(
				`条目 ${item.id} 没有现成的 MP3（本机没有 ffmpeg，转不了码）。` +
					"换一个有条目内 MP3 导数的条目。",
			);
		}

		let chosen: IaFile[];
		if (item.tracks === "all") {
			chosen = candidates;
		} else if (Array.isArray(item.tracks) && item.tracks.length > 0) {
			chosen = [];
			for (const wanted of item.tracks) {
				const hit = findTrack(candidates, wanted);
				if (!hit) {
					const available = candidates
						.map((f) => `      · ${displayName(f)}`)
						.join("\n");
					throw new Error(
						`条目 ${item.id} 里找不到曲目「${wanted}」。可选的曲目有：\n${available}`,
					);
				}
				chosen.push(hit);
			}
		} else {
			throw new Error(`条目 ${item.id} 的 tracks 既不是数组也不是 "all"`);
		}

		const creator = data.metadata?.creator;
		const defaultArtist = Array.isArray(creator)
			? creator.filter((c) => typeof c === "string").join(" / ")
			: typeof creator === "string"
				? creator
				: "Unknown";
		const artist = item.artist?.trim() || defaultArtist || "Unknown";

		const coverFileName = `cover/${slugify(item.id)}.webp`;
		for (const file of chosen) {
			if (!file.name) continue;
			const slug = uniqueSlug(slugify(displayName(file)), takenSlugs);
			const size = Number(file.size);
			tracks.push({
				name: displayName(file),
				artist,
				identifier: item.id,
				fileName: `${slug}.mp3`,
				coverFileName,
				downloadUrl: downloadUrlFor(item.id, file.name),
				expectedSize: Number.isFinite(size) && size > 0 ? size : null,
				license: verdict.label,
				licenseUrl: verdict.url,
				sourceUrl: `https://archive.org/details/${item.id}`,
			});
			console.log(`  ✓ ${displayName(file)}`);
		}
	}

	return { tracks, items };
}

/** 列出 public/assets/music/ 下不该再存在的文件，方便 --prune 前后对照 */
async function listLocalFiles(): Promise<string[]> {
	try {
		const entries = await fs.readdir(LOCAL_MUSIC_DIR, {
			recursive: true,
			withFileTypes: true,
		});
		return entries
			.filter((e) => e.isFile())
			.map((e) =>
				path
					.relative(LOCAL_MUSIC_DIR, path.join(e.parentPath, e.name))
					// 统一成正斜杠，好跟 track.fileName 这种手拼的路径比
					.split(path.sep)
					.join("/"),
			)
			.sort();
	} catch {
		return [];
	}
}

async function cmdFetch(): Promise<void> {
	const target = (getOption("target") ?? "local") as Target;
	if (target !== "local" && target !== "r2") {
		throw new Error(`--target 只支持 local 或 r2，收到 ${target}`);
	}
	const force = hasFlag("force");
	const prune = hasFlag("prune");

	let musicBaseUrl: string | null = null;
	if (target === "r2") {
		musicBaseUrl = process.env.MUSIC_BASE_URL?.trim() || null;
		if (!musicBaseUrl) {
			throw new Error(
				"--target=r2 需要 MUSIC_BASE_URL，例如：\n" +
					"  MUSIC_BASE_URL=https://audio.example.com pnpm music:fetch --target=r2\n" +
					"（R2 桶绑定的自定义域名，r2.dev 子域有速率限制，别用于生产）",
			);
		}
		musicBaseUrl = musicBaseUrl.replace(/\/+$/, "");
	}

	if (prune && target === "local") {
		const existing = await listLocalFiles();
		if (existing.length > 0) {
			console.log(
				`[PRUNE] 清空 ${LOCAL_MUSIC_DIR}/，将删除 ${existing.length} 个文件：`,
			);
			for (const file of existing) console.log(`  - ${file}`);
			await fs.rm(LOCAL_MUSIC_DIR, { recursive: true, force: true });
		}
	}

	const { tracks } = await planTracks();
	console.log(`\n[PLAN] 共 ${tracks.length} 首`);

	const rendered: RenderedTrack[] = [];
	/** 相对 LOCAL_MUSIC_DIR 的路径，写完用来找出该删的旧文件 */
	const writtenFiles = new Set<string>();
	let totalBytes = 0;
	let downloaded = 0;
	let cached = 0;

	for (const track of tracks) {
		process.stdout.write(`  · ${track.name} … `);

		const cachedAudio = path.join(CACHE_DIR, "music", track.fileName);
		const cachedCover = path.join(CACHE_DIR, track.coverFileName);

		const audioResult = await downloadToCache(
			track.downloadUrl,
			cachedAudio,
			track.expectedSize,
			force,
		);
		const coverResult = await downloadCover(
			track.identifier,
			cachedCover,
			force,
		);
		if (audioResult === "hit") cached++;
		else downloaded++;
		totalBytes += (await fs.stat(cachedAudio)).size;

		console.log(
			[
				audioResult === "hit" ? "缓存命中" : "已下载",
				`封面${coverResult === "hit" ? "命中" : "已生成"}`,
			].join("，"),
		);

		let url: string;
		let cover: string;
		if (target === "local") {
			const destAudio = path.join(LOCAL_MUSIC_DIR, track.fileName);
			const destCover = path.join(
				LOCAL_COVER_DIR,
				path.basename(track.coverFileName),
			);
			await fs.mkdir(path.dirname(destAudio), { recursive: true });
			await fs.mkdir(path.dirname(destCover), { recursive: true });
			await fs.copyFile(cachedAudio, destAudio);
			await fs.copyFile(cachedCover, destCover);
			writtenFiles.add(track.fileName);
			writtenFiles.add(track.coverFileName);
			url = `/assets/music/${track.fileName}`;
			cover = `/assets/music/${track.coverFileName}`;
		} else {
			const base = musicBaseUrl ?? "";
			uploadToR2(cachedAudio, `music/${track.fileName}`, "audio/mpeg");
			uploadToR2(cachedCover, track.coverFileName, "image/webp");
			url = `${base}/music/${track.fileName}`;
			cover = `${base}/${track.coverFileName}`;
		}

		rendered.push({
			name: track.name,
			artist: track.artist,
			url,
			cover,
			license: track.license,
			licenseUrl: track.licenseUrl,
			sourceUrl: track.sourceUrl,
		});
	}

	await fs.mkdir(path.dirname(OUTPUT_TS), { recursive: true });
	await fs.writeFile(
		OUTPUT_TS,
		renderModule(rendered, target, musicBaseUrl),
		"utf-8",
	);

	console.log(
		`\n[CC-MUSIC] ${rendered.length} 首（新下 ${downloaded}，缓存 ${cached}），` +
			`音频合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
	);
	console.log(
		`  歌单已写入 ${OUTPUT_TS}（记得 git add，构建时读的是这个文件）`,
	);

	if (target === "local") {
		const extras = (await listLocalFiles()).filter(
			(file) => !writtenFiles.has(file),
		);
		if (extras.length > 0) {
			console.warn(
				`\n[WARN] ${LOCAL_MUSIC_DIR}/ 里还有 ${extras.length} 个文件不在当前歌单里：`,
			);
			for (const file of extras) console.warn(`  - ${file}`);
			console.warn("  确认没用了就加 --prune 重跑一次，或手动删掉。");
		}
	}
}

// ── 搜索 ──────────────────────────────────────────────────────

type IaSearchDoc = {
	identifier?: string;
	title?: string;
	creator?: unknown;
	licenseurl?: unknown;
	downloads?: number;
};

async function cmdSearch(keyword: string): Promise<void> {
	const params = new URLSearchParams({
		// mediatype:audio 会把 LibriVox 的有声书一起捞进来（它们也是 CC 授权的音频），
		// 所以显式排掉。注意 advancedsearch 不支持带斜杠的通配（*by/4.0* 会直接报错），
		// 授权只能粗筛之后再逐条精确判定。
		q:
			`${keyword} AND mediatype:audio AND licenseurl:*creativecommons*` +
			" AND -collection:librivoxaudio",
		rows: "40",
		page: "1",
		output: "json",
	});
	for (const field of [
		"identifier",
		"title",
		"creator",
		"licenseurl",
		"downloads",
	]) {
		params.append("fl[]", field);
	}
	params.append("sort[]", "downloads desc");

	console.log(`[SEARCH] ${keyword}\n`);
	const res = await fetchWithRetry(
		`https://archive.org/advancedsearch.php?${params.toString()}`,
	);
	const json = (await res.json()) as {
		response?: { docs?: IaSearchDoc[] };
		error?: unknown;
	};
	if (json.error) {
		throw new Error(`archive.org 搜索报错：${JSON.stringify(json.error)}`);
	}

	const docs = json.response?.docs ?? [];
	if (docs.length === 0) {
		console.log("没搜到结果，换个关键词试试。");
		return;
	}

	const usable: IaSearchDoc[] = [];
	const rejected: Array<{ doc: IaSearchDoc; reason: string }> = [];
	for (const doc of docs) {
		const verdict = classifyLicense(doc.licenseurl);
		if (verdict.ok) usable.push(doc);
		else rejected.push({ doc, reason: verdict.reason });
	}

	console.log(`可用 ${usable.length} 个条目，不可用 ${rejected.length} 个。\n`);

	// 只给前几个可用的拉曲目列表 —— 每个都要一次 metadata 请求，别一次打太多
	const DETAIL_LIMIT = 6;
	for (const [index, doc] of usable.entries()) {
		const verdict = classifyLicense(doc.licenseurl);
		const creator = Array.isArray(doc.creator)
			? doc.creator.join(" / ")
			: String(doc.creator ?? "未知作者");
		console.log(
			`[${index + 1}] ${doc.identifier}  ✓ ${verdict.ok ? verdict.label : "?"}  ` +
				`${creator}  ${doc.downloads ?? 0} 次下载`,
		);
		if (index >= DETAIL_LIMIT) {
			console.log("      （曲目列表只展开前 6 个，其余的自己去详情页看）");
			continue;
		}
		try {
			const item = await fetchItem(String(doc.identifier));
			const titles = mp3Files(item.files ?? []).map(displayName);
			console.log(
				titles.length > 0
					? `      ${titles.slice(0, 8).join(" / ")}${titles.length > 8 ? ` …（共 ${titles.length} 首）` : ""}`
					: "      没有 MP3 导数，用不了",
			);
		} catch (error) {
			console.log(
				`      拉曲目失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
		await sleep(300);
	}

	console.log(
		`\n把选中的条目 id 和曲目名填进 ${SOURCES_FILE}，然后跑 pnpm music:fetch。`,
	);
	console.log(
		"注意：搜索接口的授权字段偶尔不准，脚本下载时会再核一次，不一致会直接报错。",
	);
}

// ── 帮助 ──────────────────────────────────────────────────────

function printHelp(): void {
	console.log(`从 archive.org 拉取授权明确的音乐，生成自托管播放列表。

用法：
  pnpm music:fetch                下载到 public/assets/music/，歌单写站内相对路径
  pnpm music:fetch --target=r2    传到 Cloudflare R2，歌单写绝对 URL
                                  需要 MUSIC_BASE_URL（R2 绑定的自定义域名）
                                  可选 R2_BUCKET（默认 blog-audio）
  pnpm music:fetch --force        已下过的也重新下
  pnpm music:fetch --prune        写入前先清空 public/assets/music/
  pnpm music:search "calm piano"  搜 archive.org 上能用的曲子

只放行 CC0 / 公有领域 / CC BY / CC BY-SA，遇到 NC 或 ND 会直接报错。
要哪些曲子写在 ${SOURCES_FILE}。`);
}

// ── 入口 ──────────────────────────────────────────────────────

async function main(): Promise<void> {
	if (hasFlag("help")) {
		printHelp();
		return;
	}

	reexecWithProxyEnv();

	if (isOptionGiven("search")) {
		const keyword = getOption("search");
		if (!keyword) {
			throw new Error('--search 后面要跟关键词，例如 --search "calm piano"');
		}
		await cmdSearch(keyword);
		return;
	}

	await cmdFetch();
}

main().catch((error) => {
	console.error(
		`\n[CC-MUSIC] 失败：${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
});

/**
 * 为没有封面图的文章生成统一的题图卡片。
 *
 * 做法：读 src/content/posts/*.md 的 frontmatter，按分类取一个强调色，用 SVG 画一张
 * 1200x600 的深色卡片（分类 + 标题 + 日期 / 系列），交给 sharp 渲染成 webp，
 * 落到 public/images/posts/covers/<slug>.webp，再把 image 字段写回 frontmatter。
 *
 * 为什么用生成而不是抓图：从 CSDN 同步过来的那批文章，24 篇里有 13 篇用的是同一张
 * 默认占位封面，剩下的分辨率多在 356x200，放到卡片上会糊。自己画反而更清楚、更统一。
 *
 * 用法：
 *   pnpm tsx scripts/generate-post-covers.ts              # 只补没封面的
 *   pnpm tsx scripts/generate-post-covers.ts --force      # 全部重画
 *   pnpm tsx scripts/generate-post-covers.ts --no-write   # 只出图，不动 frontmatter
 *   pnpm tsx scripts/generate-post-covers.ts --svg        # 顺带存一份 svg 便于调试
 *
 * 这个脚本不在 build 流水线里 —— 文章变动时手动跑一次即可。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const POSTS_DIR = path.join(ROOT, "src/content/posts");
const OUT_DIR = path.join(ROOT, "public/images/posts/covers");
const URL_PREFIX = "/images/posts/covers";

const W = 1200;
const H = 600;
const PAD = 84;
const CONTENT_W = W - PAD * 2;

// 排版分区：分类标签在 y=86，标题在中段，页脚在 y=538
const LABEL_BASELINE = 86;
const BAND_TOP = 168;
const BAND_H = 306;
const RULE_Y = 498;
const FOOTER_BASELINE = 538;

const FONT_SANS = "Noto Sans CJK SC";
const FONT_MONO = "Noto Sans Mono CJK SC";

const SERIF_FALLBACK = 0.55;

/** 强调色按分类走，同一分类的文章视觉上成组。 */
const CATEGORY_HUE: Record<string, { h: number; s: number; l: number }> = {
	libuvcpp: { h: 232, s: 90, l: 66 },
	VLibuv: { h: 268, s: 82, l: 70 },
	开源项目: { h: 163, s: 72, l: 55 },
	环境配置: { h: 38, s: 92, l: 62 },
	随笔: { h: 342, s: 86, l: 68 },
};

interface Hsl {
	h: number;
	s: number;
	l: number;
}

interface Options {
	force: boolean;
	write: boolean;
	emitSvg: boolean;
	debug: boolean;
}

interface Cover {
	slug: string;
	title: string;
	category: string;
	tags: string[];
	published: string;
	series: string;
	seriesOrder: number | undefined;
	hasImage: boolean;
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function hueFor(category: string): Hsl {
	const known = CATEGORY_HUE[category];
	if (known) return known;
	let hash = 0;
	for (const ch of category) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return { h: Math.abs(hash) % 360, s: 78, l: 64 };
}

function hsl({ h, s, l }: Hsl, alpha = 1): string {
	const hue = ((h % 360) + 360) % 360;
	const sat = s / 100;
	const lig = l / 100;
	const c = (1 - Math.abs(2 * lig - 1)) * sat;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = lig - c / 2;
	const seg = Math.floor(hue / 60) % 6;
	const [r, g, b] = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	][seg];
	const to = (v: number) => Math.round((v + m) * 255);
	if (alpha >= 1) {
		return `#${[to(r), to(g), to(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
	}
	return `rgba(${to(r)},${to(g)},${to(b)},${alpha})`;
}

const CJK_RANGES: [number, number][] = [
	[0x1100, 0x115f], // 韩文字母
	[0x2e80, 0x303e], // 部首、CJK 标点
	[0x3041, 0x33ff], // 假名、注音、兼容字符
	[0x3400, 0x4dbf], // 扩展 A
	[0x4e00, 0x9fff], // 基本区
	[0xa000, 0xa4cf], // 彝文
	[0xac00, 0xd7a3], // 韩文音节
	[0xf900, 0xfaff], // 兼容表意
	[0xfe30, 0xfe4f], // CJK 兼容形式
	[0xff00, 0xff60], // 全角
	[0xffe0, 0xffe6],
	[0x20000, 0x3fffd],
];

function isCjk(cp: number): boolean {
	return CJK_RANGES.some(([a, b]) => cp >= a && cp <= b);
}

/**
 * 每类字符的宽度校正系数。
 *
 * 下面那张按字符查的表只是「相对比例」，绝对值受字体实际度量影响会系统性偏窄
 * （Noto Sans CJK 的拉丁字形比常见无衬线体宽），直接拿它排版会让长行顶出画布。
 * 所以启动时先渲染三段参考串实测一次，把每类字符的系数校准回来。
 */
interface Calibration {
	latin: number;
	cjk: number;
	other: number;
}

function classify(ch: string): "latin" | "cjk" | "other" {
	if (isCjk(ch.codePointAt(0) ?? 0)) return "cjk";
	if (/[0-9A-Za-z]/.test(ch)) return "latin";
	return "other";
}

/** 未校准的字符宽度（em），只保证相对关系对。 */
function baseEm(ch: string, bold: boolean): number {
	const cp = ch.codePointAt(0) ?? 0;
	if (isCjk(cp)) return 1;
	let em: number;
	if (ch === " ") em = 0.26;
	else if ("iljI.,:;!|'`".includes(ch)) em = 0.28;
	else if ("()[]{}".includes(ch)) em = 0.34;
	else if ("-/\\ftr".includes(ch)) em = 0.36;
	else if (ch === "m" || ch === "w") em = 0.8;
	else if (ch === "W" || ch === "M") em = 0.85;
	else if (ch >= "0" && ch <= "9") em = 0.55;
	else if (ch >= "A" && ch <= "Z") em = 0.62;
	else if (ch >= "a" && ch <= "z") em = 0.52;
	else if ("+=~<>".includes(ch)) em = 0.6;
	else em = SERIF_FALLBACK;
	return bold ? em * 1.04 : em;
}

let CAL: Calibration = { latin: 1, cjk: 1, other: 1 };

function charEm(ch: string, bold: boolean): number {
	return baseEm(ch, bold) * CAL[classify(ch)];
}

function textEm(s: string, bold: boolean): number {
	let total = 0;
	for (const ch of s) total += charEm(ch, bold);
	return total;
}

const CAL_FONT_PX = 120;
const CAL_BG = "#000000";

/** 把一段文本渲染出来，量它实际占了多少像素宽。 */
async function measureInkWidth(text: string, bold: boolean): Promise<number> {
	// 画布按未校准的估算再放宽，免得量之前就把字裁掉了
	const rough = [...text].reduce((sum, ch) => sum + baseEm(ch, bold), 0);
	const width = CAL_FONT_PX * rough * 1.6 + 200;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${CAL_FONT_PX * 2}">
  <rect width="100%" height="100%" fill="${CAL_BG}"/>
  <text x="20" y="${CAL_FONT_PX * 1.4}" font-family="${FONT_SANS}" font-size="${CAL_FONT_PX}" font-weight="${bold ? 700 : 400}" fill="#ffffff">${esc(text)}</text>
</svg>`;
	const { data, info } = await sharp(Buffer.from(svg))
		.greyscale()
		.raw()
		.toBuffer({ resolveWithObject: true });

	let first = -1;
	let last = -1;
	for (let x = 0; x < info.width; x++) {
		let lit = false;
		for (let y = 0; y < info.height; y++) {
			if (data[y * info.width + x] > 40) {
				lit = true;
				break;
			}
		}
		if (lit) {
			if (first < 0) first = x;
			last = x;
		}
	}
	return first < 0 ? 0 : last - first + 1;
}

const CAL_REFS: Record<keyof Calibration, string> = {
	latin: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	cjk: "测试汉字宽度参考字符串内容长度度量",
	other: "()[]{}/-+=<>|:;,.!?'`~@#$%^&*_",
};

async function calibrate(): Promise<void> {
	const bold = true;
	const next: Calibration = { latin: 1, cjk: 1, other: 1 };
	for (const key of Object.keys(CAL_REFS) as (keyof Calibration)[]) {
		const ref = CAL_REFS[key];
		const predicted = [...ref].reduce((sum, ch) => sum + baseEm(ch, bold), 0);
		const measuredPx = await measureInkWidth(ref, bold);
		next[key] = measuredPx / CAL_FONT_PX / predicted;
	}
	CAL = next;
	console.log(
		`校准字宽: latin x${CAL.latin.toFixed(3)}  cjk x${CAL.cjk.toFixed(3)}  other x${CAL.other.toFixed(3)}`,
	);
}

/** 切成排版单元：连续的拉丁/数字串算一个 token，CJK 逐字。 */
function tokenize(s: string): string[] {
	const tokens: string[] = [];
	let buf = "";
	for (const ch of s) {
		const cp = ch.codePointAt(0) ?? 0;
		if (isCjk(cp) || ch === " ") {
			if (buf) {
				tokens.push(buf);
				buf = "";
			}
			if (ch !== " ") tokens.push(ch);
			else tokens.push(" ");
		} else {
			buf += ch;
		}
	}
	if (buf) tokens.push(buf);
	return tokens;
}

/** 行首不能出现的标点：让它们跟着上一行走。 */
const NO_LINE_START = "，。、；：？！）》」』】…·%,.;:?!)]}";

function wrap(
	text: string,
	maxW: number,
	fontPx: number,
	bold: boolean,
): string[] {
	// 字宽已按实测校准过，但逐字估算仍有误差，留一点余量防止顶出画布
	const limit = (maxW * 0.985) / fontPx;
	const tokens = tokenize(text);
	const lines: string[] = [];
	let cur = "";
	let curEm = 0;

	for (let i = 0; i < tokens.length; i++) {
		const tk = tokens[i];
		const em = textEm(tk, bold);
		if (curEm + em <= limit || curEm === 0) {
			cur += tk;
			curEm += em;
			continue;
		}
		// 标点不该顶到下一行行首，挤在上一行末尾
		if (tk.length === 1 && NO_LINE_START.includes(tk)) {
			cur += tk;
			curEm += em;
			continue;
		}
		// 单个 token 本身就超宽（超长英文单词），硬拆
		if (em > limit) {
			let piece = "";
			let pieceEm = 0;
			for (const ch of tk) {
				const ce = charEm(ch, bold);
				if (pieceEm + ce > limit - curEm && (cur + piece).length > 0) {
					lines.push(cur + piece);
					cur = "";
					curEm = 0;
					piece = "";
					pieceEm = 0;
				}
				piece += ch;
				pieceEm += ce;
			}
			cur = piece;
			curEm = pieceEm;
			continue;
		}
		lines.push(cur.replace(/\s+$/, ""));
		cur = tk === " " ? "" : tk;
		curEm = tk === " " ? 0 : em;
	}
	if (cur.trim()) lines.push(cur.replace(/\s+$/, ""));
	return lines;
}

const MAX_TITLE_SIZE = 88;
const MIN_TITLE_SIZE = 34;
const MAX_TITLE_LINES = 3;
const TITLE_LINE_RATIO = 1.3;
/** 标题段落最多占的高度，留出分类标签和页脚的空间 */
const TITLE_MAX_HEIGHT = 300;
/** 末行短于整行的这个比例就算孤字，宁可缩一号换个折法 */
const WIDOW_RATIO = 0.3;

interface TitleLayout {
	lines: string[];
	size: number;
}

/**
 * 把若干行按最终排版位置渲染出来，逐行量真实墨迹宽度。
 *
 * 字号是先靠字宽表估出来的，估多估少都会让长行顶出画布，所以最后一关用实测兜底：
 * 量出来超过内容宽度就退一档字号重排，而不是相信估算。
 */
async function measureLineWidths(
	lines: string[],
	size: number,
): Promise<number[]> {
	const rowH = Math.ceil(size * 1.5);
	const height = rowH * lines.length;
	const width = Math.ceil(CONTENT_W * 1.6);
	const body = lines
		.map(
			(line, i) =>
				`<text x="10" y="${(i * rowH + size * 1.12).toFixed(1)}" font-family="${FONT_SANS}" font-size="${size}" font-weight="700" letter-spacing="0.5" fill="#ffffff">${esc(line)}</text>`,
		)
		.join("\n");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${CAL_BG}"/>
${body}
</svg>`;
	const { data, info } = await sharp(Buffer.from(svg))
		.greyscale()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return lines.map((_, i) => {
		const y0 = i * rowH;
		const y1 = Math.min(height, y0 + rowH);
		let first = -1;
		let last = -1;
		for (let x = 0; x < info.width; x++) {
			for (let y = y0; y < y1; y++) {
				if (data[y * info.width + x] > 40) {
					if (first < 0) first = x;
					last = x;
					break;
				}
			}
		}
		return first < 0 ? 0 : last - first + 1;
	});
}

/**
 * 选一个尽量大、又能塞进版面的字号：短标题可以很大，长标题一路缩到能放下为止。
 * 先满足硬条件（不超宽、不超行数、不超高），再在同样合格的字号里挑末行不孤字的。
 */
async function fitTitle(title: string, debug: boolean): Promise<TitleLayout> {
	let fallback: TitleLayout | null = null;

	for (let size = MAX_TITLE_SIZE; size >= MIN_TITLE_SIZE; size -= 2) {
		const lines = wrap(title, CONTENT_W, size, true);
		if (lines.length > MAX_TITLE_LINES) continue;
		if (lines.length * size * TITLE_LINE_RATIO > TITLE_MAX_HEIGHT) continue;

		const widths = await measureLineWidths(lines, size);
		const widest = Math.max(...widths);
		if (widest > CONTENT_W) {
			if (debug)
				console.log(`    ${size}px  实测 ${Math.round(widest)}px 超宽，退档`);
			continue;
		}

		const layout: TitleLayout = { lines, size };
		if (!fallback) fallback = layout;

		const lastW = widths[widths.length - 1];
		if (lines.length === 1 || lastW >= CONTENT_W * WIDOW_RATIO) {
			if (debug) {
				console.log(
					`    ${size}px  ${lines.length} 行  ${widths.map((w) => Math.round(w)).join("/")}  ${JSON.stringify(lines)}`,
				);
			}
			return layout;
		}
		if (debug)
			console.log(`    ${size}px  末行只有 ${Math.round(lastW)}px，孤字，退档`);
	}

	// 所有字号都躲不开孤字或超宽：退回第一个合格的，够用就行
	if (fallback) return fallback;

	// 连最小字号都放不下：截断，保证不溢出
	console.warn(`  ! 标题过长，已截断: ${title}`);
	const size = MIN_TITLE_SIZE;
	const lines = wrap(title, CONTENT_W, size, true).slice(0, MAX_TITLE_LINES);
	const last = lines[lines.length - 1];
	let cut = last.length;
	while (
		cut > 1 &&
		textEm(`${last.slice(0, cut)}…`, true) * size > CONTENT_W * 0.985
	)
		cut--;
	lines[lines.length - 1] = `${last.slice(0, cut)}…`;
	return { lines, size };
}

function buildSvg(
	cover: Cover,
	layout: TitleLayout,
	seriesTotal: number,
): string {
	const hslTriple = hueFor(cover.category);
	const accent = hsl(hslTriple);
	const glowA = hsl({ ...hslTriple, l: hslTriple.l - 6 }, 0.32);
	const glowB = hsl({ h: hslTriple.h + 34, s: hslTriple.s, l: 52 }, 0.22);

	const { lines, size } = layout;
	const lineHeight = size * TITLE_LINE_RATIO;
	const blockH = lines.length * lineHeight;
	const firstBaseline = BAND_TOP + (BAND_H - blockH) / 2 + size * 0.82;
	const titleSpans = lines
		.map(
			(line, i) =>
				`<text x="${PAD}" y="${(firstBaseline + i * lineHeight).toFixed(1)}" font-family="${FONT_SANS}" font-size="${size}" font-weight="700" fill="#eef1f8" letter-spacing="0.5">${esc(line)}</text>`,
		)
		.join("\n  ");

	const rightLabel = cover.series
		? `${cover.series} ${cover.seriesOrder ?? ""}/${seriesTotal}`.trim()
		: cover.tags.slice(0, 3).join(" · ");

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141824"/>
      <stop offset="1" stop-color="#0a0c12"/>
    </linearGradient>
    <radialGradient id="glowA">
      <stop offset="0" stop-color="${glowA}"/>
      <stop offset="1" stop-color="${glowA}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB">
      <stop offset="0" stop-color="${glowB}"/>
      <stop offset="1" stop-color="${glowB}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fade">
      <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <mask id="dotMask">
      <rect x="540" y="-70" width="700" height="520" fill="url(#fade)"/>
    </mask>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.5" fill="#ffffff" opacity="0.5"/>
    </pattern>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="1010" cy="40" rx="480" ry="400" fill="url(#glowA)"/>
  <ellipse cx="60" cy="620" rx="440" ry="360" fill="url(#glowB)"/>
  <g mask="url(#dotMask)">
    <rect x="540" y="-70" width="700" height="520" fill="url(#dots)"/>
  </g>
  <rect x="0" y="0" width="220" height="3" fill="${accent}" opacity="0.9"/>

  <rect x="${PAD}" y="66" width="14" height="14" rx="4" fill="${accent}"/>
  <text x="${PAD + 28}" y="${LABEL_BASELINE}" font-family="${FONT_MONO}" font-size="23" font-weight="500" fill="${accent}" letter-spacing="1.6">${esc(cover.category.toUpperCase())}</text>

  ${titleSpans}

  <rect x="${PAD}" y="${RULE_Y}" width="${CONTENT_W}" height="1" fill="url(#rule)"/>
  <text x="${PAD}" y="${FOOTER_BASELINE}" font-family="${FONT_MONO}" font-size="24" fill="#8a93a8" letter-spacing="0.8">${esc(cover.published)}</text>
  <text x="${W - PAD}" y="${FOOTER_BASELINE}" text-anchor="end" font-family="${FONT_MONO}" font-size="24" fill="#7d879e" letter-spacing="0.4">${esc(rightLabel)}</text>
</svg>`;
}

async function readPosts(): Promise<Cover[]> {
	const files = await glob("*.md", { cwd: POSTS_DIR, absolute: true });
	const covers: Cover[] = [];
	for (const file of files) {
		const raw = await fs.readFile(file, "utf8");
		const { data } = matter(raw);
		if (data.draft === true) continue;
		const slug = path.basename(file).replace(/\.md$/, "");
		const published =
			data.published instanceof Date
				? data.published.toISOString().slice(0, 10)
				: String(data.published ?? "").slice(0, 10);
		covers.push({
			slug,
			title: String(data.title ?? slug),
			category: String(data.category ?? "未分类"),
			tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
			published,
			series: String(data.series ?? ""),
			seriesOrder:
				typeof data.seriesOrder === "number" ? data.seriesOrder : undefined,
			hasImage: typeof data.image === "string" && data.image.length > 0,
		});
	}
	return covers;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const opts: Options = {
		force: argv.includes("--force"),
		write: !argv.includes("--no-write"),
		emitSvg: argv.includes("--svg"),
		debug: argv.includes("--debug"),
	};

	await calibrate();

	const covers = await readPosts();
	const seriesTotals = new Map<string, number>();
	for (const c of covers) {
		if (c.series)
			seriesTotals.set(c.series, (seriesTotals.get(c.series) ?? 0) + 1);
	}

	await fs.mkdir(OUT_DIR, { recursive: true });

	let made = 0;
	let skipped = 0;
	let patched = 0;

	for (const cover of covers) {
		const target = path.join(OUT_DIR, `${cover.slug}.webp`);
		const exists = await fs
			.stat(target)
			.then(() => true)
			.catch(() => false);

		if (!exists || opts.force) {
			if (opts.debug) console.log(`  · ${cover.slug}`);
			const layout = await fitTitle(cover.title, opts.debug);
			const svg = buildSvg(cover, layout, seriesTotals.get(cover.series) ?? 0);
			const buf = await sharp(Buffer.from(svg))
				.webp({ quality: 88 })
				.toBuffer();
			await fs.writeFile(target, buf);
			if (opts.emitSvg) {
				await fs.writeFile(path.join(OUT_DIR, `${cover.slug}.svg`), svg);
			}
			made++;
			console.log(
				`  ✓ ${cover.slug.padEnd(34)} ${String(buf.length).padStart(6)} B  ${cover.category.padEnd(6)} ${cover.title.slice(0, 30)}`,
			);
		} else {
			skipped++;
		}

		if (opts.write && (!cover.hasImage || opts.force)) {
			const src = await fs.readFile(
				path.join(POSTS_DIR, `${cover.slug}.md`),
				"utf8",
			);
			if (!/^image:/m.test(src.slice(0, src.indexOf("\n---", 4)))) {
				const updated = src.replace(
					/^(published:.*)$/m,
					`$1\nimage: "${URL_PREFIX}/${cover.slug}.webp"`,
				);
				await fs.writeFile(path.join(POSTS_DIR, `${cover.slug}.md`), updated);
				patched++;
			}
		}
	}

	console.log(
		`\n生成 ${made} 张，跳过 ${skipped} 张，回写 frontmatter ${patched} 篇 -> ${path.relative(ROOT, OUT_DIR)}`,
	);
}

await main();

// 本文件由 scripts/fetch-cc-music.ts 自动生成，不要手改。
// 增删曲目：编辑 scripts/cc-music-sources.json，然后跑 pnpm music:fetch。
//
// 当前 target：local —— 音频自托管在 public/assets/music/（随站点一起部署）
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
	{
		name: "Gymnopedie No 1",
		artist: "Kevin MacLeod",
		url: "/assets/music/gymnopedie-no-1.mp3",
		cover: "/assets/music/cover/classical-sampler-9615.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Classical_Sampler-9615",
	},
	{
		name: "Prelude in C - BWV 846",
		artist: "Kevin MacLeod",
		url: "/assets/music/prelude-in-c-bwv-846.mp3",
		cover: "/assets/music/cover/classical-sampler-9615.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Classical_Sampler-9615",
	},
	{
		name: "Trio for Piano Violin and Viola",
		artist: "Kevin MacLeod",
		url: "/assets/music/trio-for-piano-violin-and-viola.mp3",
		cover: "/assets/music/cover/classical-sampler-9615.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Classical_Sampler-9615",
	},
	{
		name: "Dance of the Sugar Plum Fairy",
		artist: "Kevin MacLeod",
		url: "/assets/music/dance-of-the-sugar-plum-fairy.mp3",
		cover: "/assets/music/cover/classical-sampler-9615.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Classical_Sampler-9615",
	},
	{
		name: "Backed Vibes Clean",
		artist: "Kevin MacLeod",
		url: "/assets/music/backed-vibes-clean.mp3",
		cover: "/assets/music/cover/jazz-sampler-9619.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Jazz_Sampler-9619",
	},
	{
		name: "Night on the Docks - Sax",
		artist: "Kevin MacLeod",
		url: "/assets/music/night-on-the-docks-sax.mp3",
		cover: "/assets/music/cover/jazz-sampler-9619.webp",
		lrc: "",
		license: "CC BY 3.0",
		licenseUrl: "http://creativecommons.org/licenses/by/3.0/",
		sourceUrl: "https://archive.org/details/Jazz_Sampler-9619",
	},
];

/**
 * 交给音乐播放器的歌单。直接复用 ccMusicTracks ——
 * 结构上兼容，多出来的授权字段播放器会忽略。
 */
export const ccMusicPlaylist: CcMusicPlaylistEntry[] = ccMusicTracks;

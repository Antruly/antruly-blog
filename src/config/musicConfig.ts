import { ccMusicPlaylist } from "../constants/ccMusic";
import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		id: "10046455237",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 歌单在 src/constants/ccMusic.ts —— 那是 scripts/fetch-cc-music.ts 生成的，
	// 不要在这里手写曲目。要增删曲子：
	//   1) 编辑 scripts/cc-music-sources.json
	//   2) pnpm music:fetch        （下载到 public/assets/music/）
	//   或 pnpm music:fetch --target=r2（传到 Cloudflare R2，歌单自动换成绝对地址）
	// 曲目授权是 CC0 / 公有领域 / CC BY / CC BY-SA，署名信息在同一条目里，
	// 由 /music-credits 页面展示（CC BY 强制要求署名，别把那页删了）。
	//
	// 歌词：ccMusicPlaylist 里全是纯音乐，lrc 留空。将来要加带歌词的曲子，
	// 既可以在那边的生成结果上手写 lrc，也可以填 lrc 文件路径。
	local: {
		playlist: ccMusicPlaylist,
	},
};

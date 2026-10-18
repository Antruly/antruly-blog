import { metingPlaylist } from "../constants/metingTracks";
import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 按歌单/专辑 ID 整包拉，"local" 读下面写死的歌单
	//
	// 这里走 "local" 是绕一下，原因记一下免得以后看着别扭：
	// 歌单是一批指名的曲子（不是某个现成歌单），而 meting 模式只能整包拉一个歌单/专辑，主 API 又
	// 对 type=song 传多个 ID 会挂死（实测 45 秒超时）。所以干脆把每首歌的 Meting
	// 直链写进 local.playlist —— 播放器对 http(s):// 开头的地址是原样使用的
	// （MusicManager.astro 里的 isFullUrl 判断），效果和外链没区别，本站同样
	// 不落地任何音频文件。
	//
	// 曲子都是商业版权作品，因此没有选自托管，理由同上。
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否启用歌词。这些是有词的歌，接口会返回 lrc，所以开
	showLyrics: true,

	// 歌单在 src/constants/metingTracks.ts —— 那份清单同时也是署名页的数据源，
	// 加歌改那里就行，这行不用动。
	local: {
		playlist: metingPlaylist,
	},

	// 这段在 local 模式下不会被请求（fetchMetingData 只在 mode === "meting" 时跑），
	// 留着是因为播放器的重试逻辑要读它：曲目地址里带着 ?server=netease&id=<单曲ID>，
	// 播放器会拿这两个值套进下面的模板拼出备用地址，主实例播不动时依次换下一个
	// （见 MusicManager.astro 里 currentTrackUrls 那一段）。
	//
	// 只列不需要鉴权的实例。i-meto 那个不带 auth 会 401，套出来是废地址，列进来
	// 只会白白拖慢重试，所以不在这儿。主实例在 metingTracks.ts 的 API 常量里。
	meting: {
		fallbackApis: [
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.crowya.com/meting/?server=:server&type=:type&id=:id",
		],
	},
};

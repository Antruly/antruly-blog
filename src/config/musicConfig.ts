import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 走 Meting API 现取线上曲库，"local" 读主题自带歌单
	//
	// 用 meting 而不是 local 是有原因的：这批曲子（原神拜年纪/新春会、HOYO-MiX、
	// ChiliChill）是商业版权作品，自托管等于在自己的站上公开分发。走 meting 则
	// 音频由平台 CDN 提供，本站不落地任何音频文件。
	mode: "meting",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否启用歌词。这些是有词的歌，Meting 会连 lrc 一起返回，所以开
	showLyrics: true,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		//
		// 只能填 playlist：主 API 对「一次查多首单曲」（type=song 传逗号分隔的 ID）
		// 会挂死 —— 实测 45 秒超时（备用 API 则直接返回 unknown song / unknown type）。
		// 所以歌单必须建在网易云那边，这里只填歌单 ID。
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		//
		// ⚠️ 待填 —— 换成你自己的网易云歌单 ID。
		// 取法：网易云网页版打开歌单，地址栏 ?id= 后面那串数字就是。
		//
		// 歌单里要收的这 7 首（括号内是单曲 ID，方便照着搜）：
		//   所念皆星河                CMJ                        （1384026889）
		//   离开我的依赖              王艳薇                      （1420706073）
		//   知我                      国风堂 / 哦漏                （1394167216）
		//   回家的路 The Long Way Home HOYO-MiX                   （2750878526）
		//   未来再见                  陶典 / Hanser / 花玲 / …     （1480344409）
		//   让风告诉你                 花玲 / 喵☆酱 / 宴宁 / kinsen （1818031620）
		//   我不曾忘记                 花玲 / 张安琪 / 沐霏          （2014336709）
		//
		// 同名歌很多，认准上面这些演唱者，别点错。填好之前播放器是空的 ——
		// 那是预期行为（MusicManager 会走 fm:error），不是坏了。
		id: "",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		//
		// 这两个不是可有可无的装饰：主 API 对这 7 首里的 5 首返回 404
		// （VIP / 版权受限），而备用 API 的 type=url 端点实测 7 首全部 302 可播。
		// 播放器会从曲目 URL 里的 ?server= / ?id= 拼出备用地址重试
		// （见 MusicManager.astro 的 currentTrackUrls 那段），所以留着才播得全。
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},
};

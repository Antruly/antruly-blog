// 播放器的曲目清单，同时是署名页（/music-credits）的数据源。
//
// 这批曲子（原神拜年纪/新春会、HOYO-MiX、ChiliChill）是商业版权作品，没有 CC
// 授权，所以不自托管、本站不落地任何音频文件 —— 音频、封面、歌词全部按下面的
// 单曲 ID 从 Meting 接口现取，最终由音乐平台的 CDN 提供。
//
// 「回家的路」和「The Long Way Home」是同一首（HOYO-MiX），所以是 7 首不是 8 首。
//
// 加歌：在 metingTracks 里补一条，播放列表和署名页会一起跟着变。
//   单曲 ID —— 网易云打开那首歌，地址栏 ?id= 后面那串
//   封面 ID —— 接口返回的 pic 地址里 type=pic&id= 后面那串；找不到就留空

export type MetingTrack = {
	/** 曲名 */
	name: string;
	/** 演唱者，原样照抄网易云 */
	artist: string;
	/** 网易云单曲 ID，用来拼音频与歌词地址，也用来拼署名页的单曲链接 */
	neteaseId: string;
	/** 网易云封面 ID。留空则该曲没有封面 */
	picId: string;
};

/** 播放器要的字段，见 types/musicConfig.ts 里 local.playlist 的形状 */
export type MetingPlaylistEntry = {
	name: string;
	artist: string;
	url: string;
	cover: string;
	lrc: string;
};

/**
 * 取数据用的 Meting 实例。
 *
 * 挑 injahow 当主力的唯一原因是：它的 type=url 端点**不需要 auth 参数**，
 * 地址可以静态写死在这儿。i-meto 那个不带 auth 直接 401，所以它只能当
 * 「按歌单 ID 整包拉」的接口用，接不了这种逐首直链。
 *
 * 它挂了怎么办：播放器的重试逻辑会拿曲目地址里的 ?server= / ?id= 拼出
 * 备用实例的地址依次重试，备用在 musicConfig.ts 的 fallbackApis。
 */
const API = "https://api.injahow.cn/meting/";

/** 按类型和 ID 拼一个 Meting 端点地址 */
function endpoint(type: "url" | "pic" | "lrc", id: string): string {
	return `${API}?server=netease&type=${type}&id=${id}`;
}

export const metingTracks: MetingTrack[] = [
	{
		name: "所念皆星河",
		artist: "CMJ",
		neteaseId: "1384026889",
		picId: "109951164291347934",
	},
	{
		name: "离开我的依赖",
		artist: "王艳薇",
		neteaseId: "1420706073",
		picId: "109951171506809884",
	},
	{
		name: "知我",
		artist: "国风堂 / 哦漏",
		neteaseId: "1394167216",
		picId: "109951164415301539",
	},
	{
		name: "回家的路 The Long Way Home",
		artist: "HOYO-MiX",
		neteaseId: "2750878526",
		picId: "109951172080551184",
	},
	{
		name: "未来再见",
		artist: "陶典 / Hanser / 花玲 / 爆裂菊是也 / 林簌 / Mace",
		neteaseId: "1480344409",
		picId: "109951165144380212",
	},
	{
		name: "让风告诉你",
		artist: "花玲 / 喵☆酱 / 宴宁 / kinsen",
		neteaseId: "1818031620",
		picId: "109951165698369632",
	},
	{
		name: "我不曾忘记",
		artist: "花玲 / 张安琪 / 沐霏",
		neteaseId: "2014336709",
		picId: "109951168232666774",
	},
];

/** 交给播放器的歌单。地址是绝对 URL，MusicManager 会原样使用 */
export const metingPlaylist: MetingPlaylistEntry[] = metingTracks.map(
	(track) => ({
		name: track.name,
		artist: track.artist,
		url: endpoint("url", track.neteaseId),
		cover: track.picId ? endpoint("pic", track.picId) : "",
		lrc: endpoint("lrc", track.neteaseId),
	}),
);

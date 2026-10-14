// 当前歌单（网易云音乐外链）的曲目清单。
//
// 这份清单**只有 /music-credits 署名页读**，播放器不读它 —— 播放器是按
// src/config/musicConfig.ts 里的歌单 ID 去 Meting API 现取的。两者是分开的两处，
// 在网易云上改了歌单，记得也来改这里，否则署名页会跟实际播放的内容对不上。
//
// 为什么这些曲子走外链而不是像 CC 那批一样自托管：它们是商业版权作品
// （原神拜年纪/新春会、HOYO-MiX、ChiliChill），没有 CC 授权。自托管等于在自己的
// 站上公开分发。走 meting 的话音频始终由平台 CDN 提供，本站不落地任何音频文件。
//
// 顺带一提：「回家的路」和「The Long Way Home」是同一首（HOYO-MiX），
// 所以是 7 首不是 8 首。

export type MetingTrack = {
	/** 曲名 */
	name: string;
	/** 演唱者，原样照抄网易云 */
	artist: string;
	/** 网易云单曲 ID，用来拼 https://music.163.com/song?id=<id> */
	neteaseId: string;
};

export const metingTracks: MetingTrack[] = [
	{
		name: "所念皆星河",
		artist: "CMJ",
		neteaseId: "1384026889",
	},
	{
		name: "离开我的依赖",
		artist: "王艳薇",
		neteaseId: "1420706073",
	},
	{
		name: "知我",
		artist: "国风堂 / 哦漏",
		neteaseId: "1394167216",
	},
	{
		name: "回家的路 The Long Way Home",
		artist: "HOYO-MiX",
		neteaseId: "2750878526",
	},
	{
		name: "未来再见",
		artist: "陶典 / Hanser / 花玲 / 爆裂菊是也 / 林簌 / Mace",
		neteaseId: "1480344409",
	},
	{
		name: "让风告诉你",
		artist: "花玲 / 喵☆酱 / 宴宁 / kinsen",
		neteaseId: "1818031620",
	},
	{
		name: "我不曾忘记",
		artist: "花玲 / 张安琪 / 沐霏",
		neteaseId: "2014336709",
	},
];

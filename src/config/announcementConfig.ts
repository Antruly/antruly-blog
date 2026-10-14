import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "",

	// 公告内容
	content: "站点刚搭好，文章和项目会陆续补上。",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: "看看我的项目",
		// 链接 URL
		url: "/projects/",
		// 内部链接
		external: false,
	},
};

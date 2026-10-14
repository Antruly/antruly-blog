import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

// 可以在src/content/spec/friends.mdx中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
// 添加格式（复制一份改字段即可）：
// {
//   title: "站名",
//   imgurl: "对方头像/logo 的图片直链",
//   desc: "一句话简介",
//   siteurl: "https://对方的域名",
//   tags: ["Blog"],
//   weight: 5,        // 越大越靠前
//   enabled: true,
// },
export const friendsConfig: FriendLink[] = [
	{
		title: "开往",
		imgurl: "https://www.travellings.cn/assets/logo.gif",
		desc: " 开往-友链接力：点击一次，随机跳转到一位站长的网站。",
		siteurl: "https://www.travellings.cn/go.html",
		tags: ["友链", "项目"],
		weight: 10,
		enabled: true,
	},
	{
		title: "Firefly",
		imgurl: "https://docs-firefly.cuteleaf.cn/logo.png",
		desc: "本站使用的 Astro 博客主题与其文档。",
		siteurl: "https://docs-firefly.cuteleaf.cn",
		tags: ["Docs"],
		weight: 9,
		enabled: true,
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};

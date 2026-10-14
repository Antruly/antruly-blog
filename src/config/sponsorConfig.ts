import type { SponsorConfig } from "../types/sponsorConfig";

// 注意：打赏页当前是关闭的（siteConfig.ts 里 pages.sponsor = false）。
// 想启用：把 pages.sponsor 改成 true，并在下面 methods 里换成自己的收款码
// （收款码图片放到 public/assets/images/sponsor/ 下）。showButtonInPost 控制文章页底部是否出现打赏按钮。
export const sponsorConfig: SponsorConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 打赏用途说明
	usage: "如果这里的内容帮到了你，可以请我喝杯咖啡。",

	// 是否显示打赏者列表
	showSponsorsList: false,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: false,

	// 是否在文章详情页底部显示打赏按钮
	showButtonInPost: false,

	// 打赏方式列表
	methods: [
		{
			name: "支付宝",
			icon: "fa7-brands:alipay",
			// 收款码图片路径（需要放在 public 目录下）
			qrCode: "/assets/images/sponsor/alipay.png",
			link: "",
			description: "使用 支付宝 扫码打赏",
			enabled: true,
		},
		{
			name: "微信",
			icon: "fa7-brands:weixin",
			qrCode: "/assets/images/sponsor/wechat.png",
			link: "",
			description: "使用 微信 扫码打赏",
			enabled: true,
		},
	],

	// 打赏者列表（可选）
	sponsors: [],
};

/**
 * 首页轮播配置
 *
 * 三个轮播各自独立开关，关掉某个就把 enable 设 false —— 组件会整块不渲染，
 * 不会留一个空壳在页面上。
 */
export interface CarouselSectionConfig {
	/** 是否启用这个轮播 */
	enable: boolean;
	/** 区块标题 */
	title: string;
	/** 标题旁的图标（Iconify 名） */
	icon: string;
	/** 右上角「查看全部」的链接，留空则不显示 */
	href?: string;
	/** 最多展示几项 */
	maxItems: number;
	/** 自动播放间隔（毫秒）。设为 0 则只手动切换 */
	interval: number;
}

export interface HomeCarouselConfig {
	/** 项目轮播（数据来自 src/content/projects/） */
	projects: CarouselSectionConfig;
	/** 精选文章轮播（置顶文章优先，不足则按时间补） */
	posts: CarouselSectionConfig;
	/** 相册轮播（数据来自 galleryConfig，没相册时自动隐藏） */
	gallery: CarouselSectionConfig;

	/**
	 * 「重点精选」的门槛。
	 * 项目 frontmatter 里 order >= 这个值 的进首页轮播，其余只在 /projects/ 页展示。
	 * 数值越大越靠前，所以这是个「取前几名」的筛选线。
	 */
	featuredProjectMinOrder: number;

	/** 精选文章轮播的条数上限（在 maxItems 之外再受置顶数量限制时用） */
	featuredPostMax: number;
}

export const homeCarouselConfig: HomeCarouselConfig = {
	projects: {
		enable: true,
		title: "项目",
		icon: "material-symbols:rocket-launch",
		href: "/projects/",
		// 与 featuredProjectMinOrder 配套：order >= 50 的项目目前正好 7 个，
		// 上限设在 6 会把最后一个（新加的 uvp）挤掉，和「精选」的定义对不上。
		maxItems: 7,
		// 设为 0：项目卡片里有链接按钮，自动轮播会让人点不中
		interval: 0,
	},

	posts: {
		enable: true,
		title: "精选文章",
		icon: "material-symbols:article",
		href: "/archive/",
		maxItems: 8,
		interval: 7000,
	},

	gallery: {
		enable: true,
		title: "相册",
		icon: "material-symbols:photo-library",
		href: "/gallery/",
		maxItems: 12,
		interval: 0,
	},

	featuredProjectMinOrder: 50,
	featuredPostMax: 6,
};

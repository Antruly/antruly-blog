export type GithubActivityConfig = {
	/** 是否把 GitHub 活动并入动态页 */
	enable: boolean;
	/** GitHub 用户名 */
	user: string;
	/** 向前回溯的天数 */
	days: number;
	/** 最多保留多少条动态（超出时从最旧的开始丢） */
	maxEntries: number;
	/** 每篇动态最多列几条提交标题，其余的合并成「等 N 次提交」 */
	maxCommitsPerEntry: number;
	/** 是否纳入 fork 仓库的活动（自己的提交仍按作者过滤） */
	includeForks: boolean;
};

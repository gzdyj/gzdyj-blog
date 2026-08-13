import type { AnnouncementConfig } from "../types/announcementConfig";

// 构建语言，通过环境变量 PUBLIC_BUILD_LANG 控制
// 设置为 "en" 构建英文站，"zh" 构建中文站（默认）
const buildLang =
	(import.meta.env && import.meta.env.PUBLIC_BUILD_LANG) || "zh";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题（为空时使用 i18n 翻译）
	title: buildLang === "zh" ? "公告" : "",
	// 公告内容
	content:
		buildLang === "zh"
			? "欢迎来到我的博客！这里记录技术成长与生活思考，欢迎留言交流。"
			: "Welcome to my blog! Here I share my tech journey and life thoughts. Feel free to leave a comment.",
	// 是否允许用户关闭公告
	closable: true,
	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: buildLang === "zh" ? "了解我" : "About me",
		// 链接 URL
		url: "/about/",
		// 内部链接
		external: false,
	},
};

import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "AI Skill Tree Map",
    pageTitleSuffix: " | AIスキルツリー",
    enableSPA: true,
    enablePopovers: true,
    analytics: { provider: "google", tagId: "G-QPLX0DQG9N" },
    locale: "ja-JP",
    // 公開時に実際のGitHub PagesのURLに変更
    // 例: "goooichi51.github.io/AI_Skill_Map" または カスタムドメイン "ai-skill-map.example.com"
    baseUrl: "goooichi51.github.io/ai-skill-tree",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Noto Sans JP",
        body: "Noto Sans JP",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#ffffff",
          lightgray: "#f0f4f8",
          gray: "#9ca3af",
          darkgray: "#374151",
          dark: "#1e3a5f",
          secondary: "#1e3a5f",
          tertiary: "#3b82f6",
          highlight: "rgba(30, 58, 95, 0.08)",
          textHighlight: "#fef08a88",
        },
        darkMode: {
          light: "#0f172a",
          lightgray: "#1e293b",
          gray: "#64748b",
          darkgray: "#e2e8f0",
          dark: "#f8fafc",
          secondary: "#60a5fa",
          tertiary: "#3b82f6",
          highlight: "rgba(96, 165, 250, 0.12)",
          textHighlight: "#fef08a44",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      // Comment out CustomOgImages to speed up build time
      Plugin.CustomOgImages(),
      Plugin.SourceConfig(),
    ],
  },
}

export default config

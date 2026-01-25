import * as fs from "fs"
import * as path from "path"
import { ParsedContent, SourceConfig, categoryTagMap, defaultColors } from "../types"

// ファイル名用のslug生成
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, "") // 記号削除（日本語OK）
    .replace(/\s+/g, "-") // スペースをハイフンに
    .replace(/-+/g, "-") // 複数ハイフンを1つに
    .replace(/^-|-$/g, "") // 先頭末尾のハイフン削除
    .slice(0, 100) // 最大100文字
}

// マークダウンファイル生成
export function generateMarkdown(content: ParsedContent, category: string): string {
  const { title, source, suggestedTags } = content

  // カテゴリに基づくデフォルトタグ
  const baseTags = categoryTagMap[category] || ["skill-tree"]
  const allTags = [...new Set([...baseTags, ...suggestedTags])]

  // フロントマター構築
  const frontmatter = {
    title,
    tags: allTags,
    source,
  }

  // YAML形式でフロントマター生成
  const yaml = generateYaml(frontmatter)

  // ソースタイプのアイコンとラベル
  const sourceInfo = {
    youtube: { icon: "📺", label: "YouTube" },
    note: { icon: "📝", label: "note" },
    x: { icon: "𝕏", label: "X (Twitter)" },
    blog: { icon: "📄", label: "ブログ" },
    manual: { icon: "✏️", label: "オリジナル" },
  }[source.type] || { icon: "🔗", label: "外部リンク" }

  // サムネイル（YouTubeの場合のみ）
  const thumbnailHtml = source.thumbnail
    ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="source-thumbnail">
  <img src="${source.thumbnail}" alt="${title}" />
  <span class="play-overlay">${source.type === "youtube" ? "▶" : "→"}</span>
</a>`
    : ""

  // ソース情報
  const sourceLabel = source.channel || source.author || source.domain || ""

  // マークダウン本文（シンプル版）
  const body = `
${thumbnailHtml}

<p class="source-badge">${sourceInfo.icon} ${sourceInfo.label}${sourceLabel ? ` / ${sourceLabel}` : ""}</p>

<a href="${source.url}" target="_blank" rel="noopener noreferrer" class="source-link-btn">
  元のコンテンツを見る →
</a>
`

  return `---\n${yaml}---\n${body}`
}

// オブジェクトをYAMLに変換
function generateYaml(obj: Record<string, unknown>, indent = 0): string {
  const spaces = "  ".repeat(indent)
  let result = ""

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") {
      continue
    }

    if (Array.isArray(value)) {
      result += `${spaces}${key}:\n`
      for (const item of value) {
        if (typeof item === "object") {
          result += `${spaces}  - ${generateYamlInline(item)}\n`
        } else {
          result += `${spaces}  - ${item}\n`
        }
      }
    } else if (typeof value === "object") {
      result += `${spaces}${key}:\n`
      result += generateYaml(value as Record<string, unknown>, indent + 1)
    } else {
      // 文字列の場合、特殊文字を含むならクォート
      const stringValue = String(value)
      if (stringValue.includes(":") || stringValue.includes("#") || stringValue.includes('"')) {
        result += `${spaces}${key}: "${stringValue.replace(/"/g, '\\"')}"\n`
      } else {
        result += `${spaces}${key}: ${stringValue}\n`
      }
    }
  }

  return result
}

// インラインYAML生成
function generateYamlInline(obj: Record<string, unknown>): string {
  const pairs = Object.entries(obj)
    .filter(([_, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
  return `{ ${pairs.join(", ")} }`
}

// ファイル保存
export function saveMarkdownFile(
  content: ParsedContent,
  category: string,
  contentDir: string = "content/skill-tree"
): string {
  const slug = generateSlug(content.title)
  const categoryDir = path.join(contentDir, category)

  // ディレクトリ作成
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true })
  }

  const filePath = path.join(categoryDir, `${slug}.md`)
  const markdown = generateMarkdown(content, category)

  fs.writeFileSync(filePath, markdown, "utf-8")
  return filePath
}

// ソース設定の読み込み
export function loadSourceConfig(configPath: string = "content/_config/sources.json"): SourceConfig {
  const defaultConfig: SourceConfig = {
    youtube: { channels: {} },
    note: { authors: {} },
    x: { users: {} },
    blog: { domains: {} },
  }

  if (!fs.existsSync(configPath)) {
    return defaultConfig
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8")
    return JSON.parse(raw) as SourceConfig
  } catch {
    return defaultConfig
  }
}

// ソース設定の保存
export function saveSourceConfig(config: SourceConfig, configPath: string = "content/_config/sources.json"): void {
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
}

// 新しいチャンネル/著者を設定に追加
export function updateSourceConfig(content: ParsedContent, config: SourceConfig): SourceConfig {
  const { source } = content

  if (source.type === "youtube" && source.channelId && source.channel) {
    if (!config.youtube.channels[source.channelId]) {
      // 新しいチャンネル追加
      const usedColors = Object.values(config.youtube.channels).map((c) => c.color)
      const availableColors = defaultColors.filter((c) => !usedColors.includes(c))
      const newColor = availableColors[0] || defaultColors[usedColors.length % defaultColors.length]

      config.youtube.channels[source.channelId] = {
        name: source.channel,
        color: newColor,
        enabled: false, // デフォルトは無効
      }
    }
  }

  if (source.type === "note" && source.authorId && source.author) {
    if (!config.note.authors[source.authorId]) {
      // 新しい著者追加
      const usedColors = Object.values(config.note.authors).map((a) => a.color)
      const availableColors = defaultColors.filter((c) => !usedColors.includes(c))
      const newColor = availableColors[0] || defaultColors[usedColors.length % defaultColors.length]

      config.note.authors[source.authorId] = {
        name: source.author,
        color: newColor,
        enabled: false, // デフォルトは無効
      }
    }
  }

  if (source.type === "x" && source.authorId && source.author) {
    if (!config.x.users[source.authorId]) {
      // 新しいXユーザー追加
      const usedColors = Object.values(config.x.users).map((u) => u.color)
      const availableColors = defaultColors.filter((c) => !usedColors.includes(c))
      const newColor = availableColors[0] || defaultColors[usedColors.length % defaultColors.length]

      config.x.users[source.authorId] = {
        name: source.author,
        color: newColor,
        enabled: false, // デフォルトは無効
      }
    }
  }

  if (source.type === "blog" && source.domain) {
    if (!config.blog.domains[source.domain]) {
      // 新しいブログドメイン追加
      const usedColors = Object.values(config.blog.domains).map((d) => d.color)
      const availableColors = defaultColors.filter((c) => !usedColors.includes(c))
      const newColor = availableColors[0] || defaultColors[usedColors.length % defaultColors.length]

      config.blog.domains[source.domain] = {
        name: source.author || source.domain,
        color: newColor,
        enabled: false, // デフォルトは無効
      }
    }
  }

  return config
}

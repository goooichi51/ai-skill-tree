import * as fs from "fs"
import * as path from "path"
import matter from "gray-matter"
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

// ソース設定をコンテンツファイルと同期（使われていないソースを削除）
export function syncSourceConfig(
  contentDir: string = "content/skill-tree",
  configPath: string = "content/_config/sources.json"
): { removed: string[]; config: SourceConfig } {
  const config = loadSourceConfig(configPath)
  const removed: string[] = []

  // コンテンツファイルで使用されているソースIDを収集
  const usedYouTubeChannels = new Set<string>()
  const usedNoteAuthors = new Set<string>()
  const usedXUsers = new Set<string>()
  const usedBlogDomains = new Set<string>()

  // 再帰的にMarkdownファイルを走査
  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name))
      } else if (entry.name.endsWith(".md")) {
        try {
          const filePath = path.join(dir, entry.name)
          const content = fs.readFileSync(filePath, "utf-8")
          // フロントマターをパース（gray-matterなしで簡易パース）
          const match = content.match(/^---\n([\s\S]*?)\n---/)
          if (match) {
            const yaml = match[1]
            // source.channelId を抽出
            const channelIdMatch = yaml.match(/channelId:\s*(.+)/)
            if (channelIdMatch) {
              usedYouTubeChannels.add(channelIdMatch[1].trim())
            }
            // source.authorId を抽出（Note.com/X）
            const authorIdMatch = yaml.match(/authorId:\s*(.+)/)
            if (authorIdMatch) {
              const typeMatch = yaml.match(/type:\s*(.+)/)
              if (typeMatch) {
                const type = typeMatch[1].trim()
                if (type === "note") {
                  usedNoteAuthors.add(authorIdMatch[1].trim())
                } else if (type === "x") {
                  usedXUsers.add(authorIdMatch[1].trim())
                }
              }
            }
            // source.domain を抽出
            const domainMatch = yaml.match(/domain:\s*(.+)/)
            if (domainMatch) {
              usedBlogDomains.add(domainMatch[1].trim())
            }
          }
        } catch {
          // パースエラーは無視
        }
      }
    }
  }

  scanDir(contentDir)

  // 使われていないソースを削除
  for (const channelId of Object.keys(config.youtube.channels)) {
    if (!usedYouTubeChannels.has(channelId)) {
      removed.push(`YouTube: ${config.youtube.channels[channelId].name}`)
      delete config.youtube.channels[channelId]
    }
  }

  for (const authorId of Object.keys(config.note.authors)) {
    if (!usedNoteAuthors.has(authorId)) {
      removed.push(`Note.com: ${config.note.authors[authorId].name}`)
      delete config.note.authors[authorId]
    }
  }

  if (config.x?.users) {
    for (const userId of Object.keys(config.x.users)) {
      if (!usedXUsers.has(userId)) {
        removed.push(`X: ${config.x.users[userId].name}`)
        delete config.x.users[userId]
      }
    }
  }

  if (config.blog?.domains) {
    for (const domain of Object.keys(config.blog.domains)) {
      if (!usedBlogDomains.has(domain)) {
        removed.push(`ブログ: ${config.blog.domains[domain].name}`)
        delete config.blog.domains[domain]
      }
    }
  }

  // 変更があれば保存
  if (removed.length > 0) {
    saveSourceConfig(config, configPath)
  }

  return { removed, config }
}

// displayTitleを更新
export function updateDisplayTitle(filePath: string, displayTitle: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, "utf-8")
  const parsed = matter(content)

  // displayTitleを追加/更新
  parsed.data.displayTitle = displayTitle

  // ファイルを再構築して保存
  const newContent = matter.stringify(parsed.content, parsed.data)
  fs.writeFileSync(filePath, newContent, "utf-8")
}

// タイトルの自動短縮候補を生成
export function suggestShortTitle(title: string, maxLength: number = 40): string {
  let short = title
    // 装飾括弧を削除
    .replace(/【[^】]*】/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\[[^\]]*\]/g, "")
    // 装飾記号を削除
    .replace(/〜.*$/, "")
    .replace(/[！!？?]+/g, "")
    // 定型句を削除
    .replace(/(最新版|完全|決定版|徹底解説|入門講座|ご紹介|解説してみた|してみた)/g, "")
    // 余分なスペースを整理
    .replace(/\s+/g, " ")
    .trim()

  // 最大文字数で切り詰め
  if (short.length > maxLength) {
    short = short.slice(0, maxLength - 3) + "..."
  }

  return short
}

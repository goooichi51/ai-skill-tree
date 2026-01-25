#!/usr/bin/env npx tsx
import express from "express"
import cors from "cors"
import * as dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import matter from "gray-matter"

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")
import { isYouTubeUrl, parseYouTubeUrl } from "./parsers/youtube"
import { isNoteUrl, parseNoteUrl } from "./parsers/note"
import { isXUrl, parseXUrl } from "./parsers/x"
import { isBlogUrl, parseBlogUrl } from "./parsers/blog"
import {
  saveMarkdownFile,
  loadSourceConfig,
  saveSourceConfig,
  updateSourceConfig,
  generateMarkdown,
} from "./utils/frontmatter"
import { categoryTagMap, ParsedContent, SourceConfig } from "./types"

dotenv.config()

const app = express()
const PORT = 3456

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))

// カテゴリ一覧を取得
app.get("/api/categories", (req, res) => {
  res.json(Object.keys(categoryTagMap))
})

// ソース設定を取得
app.get("/api/sources", (req, res) => {
  try {
    const config = loadSourceConfig()
    res.json(config)
  } catch (error) {
    res.status(500).json({ error: "設定の読み込みに失敗しました" })
  }
})

// URLをプレビュー（ドライラン）
app.post("/api/preview", async (req, res) => {
  try {
    const { url }: { url: string } = req.body

    if (!url) {
      return res.status(400).json({ error: "URLが必要です" })
    }

    let content: ParsedContent
    let sourceType: string

    if (isYouTubeUrl(url)) {
      const apiKey = process.env.YOUTUBE_API_KEY
      if (!apiKey) {
        return res.status(400).json({ error: "YouTube APIキーが設定されていません（.envファイルを確認）" })
      }
      content = await parseYouTubeUrl(url, apiKey)
      sourceType = "youtube"
    } else if (isNoteUrl(url)) {
      content = await parseNoteUrl(url)
      sourceType = "note"
    } else if (isXUrl(url)) {
      content = await parseXUrl(url)
      sourceType = "x"
    } else if (isBlogUrl(url)) {
      content = await parseBlogUrl(url)
      sourceType = "blog"
    } else {
      return res.status(400).json({ error: "対応していないURL形式です（YouTube、Note.com、X、ブログに対応）" })
    }

    res.json({
      success: true,
      sourceType,
      content: {
        title: content.title,
        description: content.description,
        source: content.source,
        suggestedTags: content.suggestedTags,
      },
    })
  } catch (error) {
    console.error("Preview error:", error)
    res.status(500).json({
      error: error instanceof Error ? error.message : "URL解析中にエラーが発生しました",
    })
  }
})

// コンテンツを追加
app.post("/api/add", async (req, res) => {
  try {
    const { url, category, additionalTags }: { url: string; category: string; additionalTags?: string[] } = req.body

    if (!url) {
      return res.status(400).json({ error: "URLが必要です" })
    }

    if (!category) {
      return res.status(400).json({ error: "カテゴリが必要です" })
    }

    let content: ParsedContent

    if (isYouTubeUrl(url)) {
      const apiKey = process.env.YOUTUBE_API_KEY
      if (!apiKey) {
        return res.status(400).json({ error: "YouTube APIキーが設定されていません" })
      }
      content = await parseYouTubeUrl(url, apiKey)
    } else if (isNoteUrl(url)) {
      content = await parseNoteUrl(url)
    } else if (isXUrl(url)) {
      content = await parseXUrl(url)
    } else if (isBlogUrl(url)) {
      content = await parseBlogUrl(url)
    } else {
      return res.status(400).json({ error: "対応していないURL形式です" })
    }

    // 追加タグ
    if (additionalTags && additionalTags.length > 0) {
      content.suggestedTags.push(...additionalTags)
    }

    // ソース設定を更新
    const configPath = "content/_config/sources.json"
    let config = loadSourceConfig(configPath)
    config = updateSourceConfig(content, config)
    saveSourceConfig(config, configPath)

    // マークダウンファイル保存
    const filePath = saveMarkdownFile(content, category, "content/skill-tree")

    res.json({
      success: true,
      message: "コンテンツを追加しました",
      filePath,
      content: {
        title: content.title,
        source: content.source,
      },
    })
  } catch (error) {
    console.error("Add error:", error)
    res.status(500).json({
      error: error instanceof Error ? error.message : "コンテンツ追加中にエラーが発生しました",
    })
  }
})

// ソース設定を更新（色分け有効/無効）
app.post("/api/sources/toggle", (req, res) => {
  try {
    const { type, id, enabled }: { type: string; id: string; enabled: boolean } = req.body
    const config = loadSourceConfig()

    if (type === "youtube" && config.youtube.channels[id]) {
      config.youtube.channels[id].enabled = enabled
    } else if (type === "note" && config.note.authors[id]) {
      config.note.authors[id].enabled = enabled
    } else if (type === "x" && config.x?.users?.[id]) {
      config.x.users[id].enabled = enabled
    } else if (type === "blog" && config.blog?.domains?.[id]) {
      config.blog.domains[id].enabled = enabled
    } else {
      return res.status(404).json({ error: "指定されたソースが見つかりません" })
    }

    saveSourceConfig(config)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: "設定の更新に失敗しました" })
  }
})

// Git状態を取得
app.get("/api/git/status", async (req, res) => {
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd: projectRoot })
    const files = stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => ({
        status: line.substring(0, 2).trim(),
        file: line.substring(3),
      }))

    res.json({
      success: true,
      files,
      hasChanges: files.length > 0,
    })
  } catch (error) {
    console.error("Git status error:", error)
    res.status(500).json({ error: "Git状態の取得に失敗しました" })
  }
})

// サイトをビルドして公開
app.post("/api/git/publish", async (req, res) => {
  const { message = "コンテンツ更新" }: { message?: string } = req.body
  const steps: { step: string; success: boolean; output?: string; error?: string }[] = []

  try {
    // 1. ビルド
    try {
      const { stdout, stderr } = await execAsync("npx quartz build", {
        cwd: projectRoot,
        timeout: 120000, // 2分タイムアウト
      })
      steps.push({ step: "build", success: true, output: "ビルド完了" })
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      steps.push({ step: "build", success: false, error: err.stderr || err.message || "ビルドエラー" })
      return res.status(500).json({ success: false, steps, error: "ビルドに失敗しました" })
    }

    // 2. git add
    try {
      await execAsync("git add .", { cwd: projectRoot })
      steps.push({ step: "add", success: true, output: "ファイルをステージング" })
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      steps.push({ step: "add", success: false, error: err.stderr || err.message || "git addエラー" })
      return res.status(500).json({ success: false, steps, error: "git addに失敗しました" })
    }

    // 3. git commit
    try {
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: projectRoot })
      steps.push({ step: "commit", success: true, output: `コミット: ${message}` })
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string }
      // "nothing to commit" の場合はスキップ
      if (err.stdout?.includes("nothing to commit") || err.stderr?.includes("nothing to commit")) {
        steps.push({ step: "commit", success: true, output: "変更なし（スキップ）" })
      } else {
        steps.push({ step: "commit", success: false, error: err.stderr || err.message || "git commitエラー" })
        return res.status(500).json({ success: false, steps, error: "git commitに失敗しました" })
      }
    }

    // 4. git push
    try {
      await execAsync("git push", { cwd: projectRoot, timeout: 60000 })
      steps.push({ step: "push", success: true, output: "プッシュ完了" })
    } catch (error) {
      const err = error as { stderr?: string; message?: string }
      steps.push({ step: "push", success: false, error: err.stderr || err.message || "git pushエラー" })
      return res.status(500).json({ success: false, steps, error: "git pushに失敗しました" })
    }

    res.json({ success: true, steps, message: "公開が完了しました" })
  } catch (error) {
    console.error("Publish error:", error)
    res.status(500).json({ success: false, steps, error: "公開処理中にエラーが発生しました" })
  }
})

// カスタムリンク設定ファイルのパス
const customLinksPath = path.join(projectRoot, "content/_config/custom-links.json")

// カスタムリンク設定を読み込む
function loadCustomLinks(): { links: { source: string; target: string }[]; excludedLinks: { source: string; target: string }[] } {
  try {
    const data = fs.readFileSync(customLinksPath, "utf-8")
    return JSON.parse(data)
  } catch {
    return { links: [], excludedLinks: [] }
  }
}

// カスタムリンク設定を保存
function saveCustomLinks(config: { links: { source: string; target: string }[]; excludedLinks: { source: string; target: string }[] }) {
  fs.writeFileSync(customLinksPath, JSON.stringify(config, null, 2))
}

// ノード一覧を取得（Markdownファイルから）
app.get("/api/nodes", async (req, res) => {
  try {
    const contentDir = path.join(projectRoot, "content/skill-tree")
    const nodes: { slug: string; title: string }[] = []

    // 再帰的にMarkdownファイルを探索
    function scanDir(dir: string, basePath: string = "") {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(path.join(dir, entry.name), basePath ? `${basePath}/${entry.name}` : entry.name)
        } else if (entry.name.endsWith(".md")) {
          const filePath = path.join(dir, entry.name)
          const content = fs.readFileSync(filePath, "utf-8")
          const { data } = matter(content)
          const slug = basePath
            ? `skill-tree/${basePath}/${entry.name.replace(".md", "")}`
            : `skill-tree/${entry.name.replace(".md", "")}`
          nodes.push({
            slug: slug.replace("/index", ""),
            title: data.title || entry.name.replace(".md", ""),
          })
        }
      }
    }

    scanDir(contentDir)

    // indexページも追加
    const indexPath = path.join(projectRoot, "content/index.md")
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8")
      const { data } = matter(content)
      nodes.push({
        slug: "index",
        title: data.title || "ホーム",
      })
    }

    res.json({ success: true, nodes })
  } catch (error) {
    console.error("Nodes error:", error)
    res.status(500).json({ error: "ノード一覧の取得に失敗しました" })
  }
})

// カスタムリンク一覧を取得
app.get("/api/links", (req, res) => {
  try {
    const config = loadCustomLinks()

    // タイトルを取得する関数
    function getTitle(slug: string): string {
      try {
        const parts = slug.split("/")
        let filePath: string
        if (slug === "index") {
          filePath = path.join(projectRoot, "content/index.md")
        } else if (parts.length === 1) {
          filePath = path.join(projectRoot, `content/${slug}/index.md`)
        } else {
          filePath = path.join(projectRoot, `content/${slug}.md`)
          if (!fs.existsSync(filePath)) {
            filePath = path.join(projectRoot, `content/${slug}/index.md`)
          }
        }
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8")
          const { data } = matter(content)
          return data.title || slug
        }
      } catch {}
      return slug
    }

    // タイトル付きで返す
    const links = config.links.map((link) => ({
      ...link,
      sourceTitle: getTitle(link.source),
      targetTitle: getTitle(link.target),
    }))

    const excludedLinks = config.excludedLinks.map((link) => ({
      ...link,
      sourceTitle: getTitle(link.source),
      targetTitle: getTitle(link.target),
    }))

    res.json({ success: true, links, excludedLinks })
  } catch (error) {
    console.error("Links error:", error)
    res.status(500).json({ error: "リンク一覧の取得に失敗しました" })
  }
})

// リンクを追加
app.post("/api/links", (req, res) => {
  try {
    const { source, target }: { source: string; target: string } = req.body

    if (!source || !target) {
      return res.status(400).json({ error: "リンク元とリンク先が必要です" })
    }

    const config = loadCustomLinks()

    // 既に存在するかチェック
    const exists = config.links.some((l) => l.source === source && l.target === target)
    if (exists) {
      return res.status(400).json({ error: "このリンクは既に追加されています" })
    }

    config.links.push({ source, target })
    saveCustomLinks(config)

    res.json({ success: true, message: "リンクを追加しました" })
  } catch (error) {
    console.error("Add link error:", error)
    res.status(500).json({ error: "リンクの追加に失敗しました" })
  }
})

// リンクを削除
app.delete("/api/links", (req, res) => {
  try {
    const { source, target }: { source: string; target: string } = req.body

    if (!source || !target) {
      return res.status(400).json({ error: "リンク元とリンク先が必要です" })
    }

    const config = loadCustomLinks()
    config.links = config.links.filter((l) => !(l.source === source && l.target === target))
    saveCustomLinks(config)

    res.json({ success: true, message: "リンクを削除しました" })
  } catch (error) {
    console.error("Delete link error:", error)
    res.status(500).json({ error: "リンクの削除に失敗しました" })
  }
})

// 除外したリンクを復元
app.post("/api/links/restore", (req, res) => {
  try {
    const { source, target }: { source: string; target: string } = req.body

    if (!source || !target) {
      return res.status(400).json({ error: "リンク元とリンク先が必要です" })
    }

    const config = loadCustomLinks()
    config.excludedLinks = config.excludedLinks.filter((l) => !(l.source === source && l.target === target))
    saveCustomLinks(config)

    res.json({ success: true, message: "リンクを復元しました" })
  } catch (error) {
    console.error("Restore link error:", error)
    res.status(500).json({ error: "リンクの復元に失敗しました" })
  }
})

// リンクを除外
app.post("/api/links/exclude", (req, res) => {
  try {
    const { source, target }: { source: string; target: string } = req.body

    if (!source || !target) {
      return res.status(400).json({ error: "リンク元とリンク先が必要です" })
    }

    const config = loadCustomLinks()

    // 既に除外されているかチェック
    const exists = config.excludedLinks.some((l) => l.source === source && l.target === target)
    if (exists) {
      return res.status(400).json({ error: "このリンクは既に除外されています" })
    }

    config.excludedLinks.push({ source, target })
    saveCustomLinks(config)

    res.json({ success: true, message: "リンクを除外しました" })
  } catch (error) {
    console.error("Exclude link error:", error)
    res.status(500).json({ error: "リンクの除外に失敗しました" })
  }
})

// 管理ページを返す
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"))
})

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   AI Skill Map 管理ツール                  ║
╠════════════════════════════════════════════╣
║   http://localhost:${PORT}                   ║
╚════════════════════════════════════════════╝

URLを貼り付けてコンテンツを追加できます。
終了: Ctrl+C
`)
})

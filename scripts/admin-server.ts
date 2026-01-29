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
import { isYouTubeUrl, parseYouTubeUrl, searchYouTubeVideos } from "./parsers/youtube"
import { isNoteUrl, parseNoteUrl } from "./parsers/note"
import { isXUrl, parseXUrl } from "./parsers/x"
import { isBlogUrl, parseBlogUrl } from "./parsers/blog"
import {
  saveMarkdownFile,
  loadSourceConfig,
  saveSourceConfig,
  updateSourceConfig,
  generateMarkdown,
  syncSourceConfig,
  updateDisplayTitle,
  suggestShortTitle,
} from "./utils/frontmatter"
import {
  categoryTagMap,
  ParsedContent,
  SourceConfig,
  loadCategoryConfig,
  saveCategoryConfig,
  getCategoryTagMap,
  MainCategory,
} from "./types"

dotenv.config()

const app = express()
const PORT = 3456

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))

// カテゴリ一覧を取得
app.get("/api/categories", (req, res) => {
  const config = loadCategoryConfig()
  res.json(config.mainCategories.map((c) => c.id))
})

// 大カテゴリと中カテゴリの階層構造を取得
app.get("/api/categories/tree", (req, res) => {
  try {
    const contentDir = path.join(projectRoot, "content/skill-tree")
    const result: Record<string, { slug: string; title: string }[]> = {}

    // カテゴリ設定から大カテゴリを取得
    const config = loadCategoryConfig()
    const mainCategories = config.mainCategories.map((c) => c.id)
    for (const mainCat of mainCategories) {
      const catDir = path.join(contentDir, mainCat)
      result[mainCat] = []

      if (fs.existsSync(catDir)) {
        const files = fs.readdirSync(catDir)
        for (const file of files) {
          if (file.endsWith(".md") && file !== "index.md") {
            const filePath = path.join(catDir, file)
            const content = fs.readFileSync(filePath, "utf-8")
            const { data } = matter(content)
            const slug = file.replace(".md", "")
            result[mainCat].push({
              slug,
              title: data.title || slug,
            })
          }
        }
        // タイトルでソート
        result[mainCat].sort((a, b) => a.title.localeCompare(b.title, "ja"))
      }
    }

    res.json(result)
  } catch (error) {
    console.error("Categories tree error:", error)
    res.status(500).json({ error: "カテゴリ構造の取得に失敗しました" })
  }
})

// カテゴリ設定を取得（フル設定）
app.get("/api/categories/config", (req, res) => {
  try {
    const config = loadCategoryConfig()
    res.json({ success: true, ...config })
  } catch (error) {
    console.error("Category config error:", error)
    res.status(500).json({ error: "カテゴリ設定の取得に失敗しました" })
  }
})

// 大カテゴリを追加
app.post("/api/categories/main", (req, res) => {
  try {
    const newCategory: MainCategory = req.body

    if (!newCategory.id || !newCategory.name) {
      return res.status(400).json({ error: "IDと名前は必須です" })
    }

    // IDの形式チェック（英数字とハイフンのみ）
    if (!/^[a-z0-9-]+$/.test(newCategory.id)) {
      return res.status(400).json({ error: "IDは英小文字、数字、ハイフンのみ使用できます" })
    }

    const config = loadCategoryConfig()

    // 重複チェック
    if (config.mainCategories.some((c) => c.id === newCategory.id)) {
      return res.status(400).json({ error: `ID "${newCategory.id}" は既に使用されています` })
    }

    // デフォルト値を設定
    const category: MainCategory = {
      id: newCategory.id,
      name: newCategory.name,
      shape: newCategory.shape || "circle",
      color: newCategory.color || { h: 200, s: 60, l: 50 },
      tags: newCategory.tags || [newCategory.name, "skill-tree"],
    }

    config.mainCategories.push(category)
    saveCategoryConfig(config)

    // ディレクトリを作成
    const catDir = path.join(projectRoot, "content/skill-tree", category.id)
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true })

      // index.mdを作成
      const indexContent = `---
title: ${category.name}
tags:
  - ${category.tags[0]}
  - skill-tree
---

${category.name}に関するコンテンツです。
`
      fs.writeFileSync(path.join(catDir, "index.md"), indexContent)
    }

    // ホームページにWikilinkを追加（グラフでリンクを表示するため）
    const homeIndexPath = path.join(projectRoot, "content/index.md")
    if (fs.existsSync(homeIndexPath)) {
      let homeContent = fs.readFileSync(homeIndexPath, "utf-8")
      const wikiLink = `- [[skill-tree/${category.id}/index|${category.name}]]`

      // 既にリンクがあるかチェック
      if (!homeContent.includes(`skill-tree/${category.id}/index`)) {
        // カテゴリセクションの末尾にリンクを追加
        const categoryRegex = /(## カテゴリ\n\n)([\s\S]*?)(\n\n##|\n---|\n\n---)/
        const match = homeContent.match(categoryRegex)
        if (match) {
          const newCategorySection = match[1] + match[2].trimEnd() + "\n" + wikiLink + match[3]
          homeContent = homeContent.replace(categoryRegex, newCategorySection)
          fs.writeFileSync(homeIndexPath, homeContent)
        }
      }
    }

    res.json({ success: true, message: `大カテゴリ「${category.name}」を追加しました`, category })
  } catch (error) {
    console.error("Add main category error:", error)
    res.status(500).json({ error: "大カテゴリの追加に失敗しました" })
  }
})

// 大カテゴリを更新
app.patch("/api/categories/main/:id", (req, res) => {
  try {
    const { id } = req.params
    const updates: Partial<MainCategory> = req.body

    const config = loadCategoryConfig()
    const index = config.mainCategories.findIndex((c) => c.id === id)

    if (index === -1) {
      return res.status(404).json({ error: `カテゴリ「${id}」が見つかりません` })
    }

    // 更新（idは変更不可）
    if (updates.name) config.mainCategories[index].name = updates.name
    if (updates.shape) config.mainCategories[index].shape = updates.shape
    if (updates.color) config.mainCategories[index].color = updates.color
    if (updates.tags) config.mainCategories[index].tags = updates.tags

    saveCategoryConfig(config)

    res.json({ success: true, message: "カテゴリを更新しました", category: config.mainCategories[index] })
  } catch (error) {
    console.error("Update main category error:", error)
    res.status(500).json({ error: "カテゴリの更新に失敗しました" })
  }
})

// 大カテゴリを削除
app.delete("/api/categories/main/:id", (req, res) => {
  try {
    const { id } = req.params
    const { force } = req.query

    const config = loadCategoryConfig()
    const index = config.mainCategories.findIndex((c) => c.id === id)

    if (index === -1) {
      return res.status(404).json({ error: `カテゴリ「${id}」が見つかりません` })
    }

    // ディレクトリにコンテンツがあるかチェック
    const catDir = path.join(projectRoot, "content/skill-tree", id)
    if (fs.existsSync(catDir)) {
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md") && f !== "index.md")
      if (files.length > 0 && force !== "true") {
        return res.status(400).json({
          error: `このカテゴリには${files.length}件のコンテンツがあります`,
          hasContent: true,
          contentCount: files.length,
        })
      }
    }

    // 設定から削除
    config.mainCategories.splice(index, 1)
    saveCategoryConfig(config)

    res.json({ success: true, message: `カテゴリ「${id}」を削除しました` })
  } catch (error) {
    console.error("Delete main category error:", error)
    res.status(500).json({ error: "カテゴリの削除に失敗しました" })
  }
})

// 中カテゴリを追加
app.post("/api/categories/sub", (req, res) => {
  try {
    const { parentId, id, title }: { parentId: string; id: string; title: string } = req.body

    if (!parentId || !id || !title) {
      return res.status(400).json({ error: "親カテゴリID、ID、タイトルは必須です" })
    }

    // IDの形式チェック
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: "IDは英小文字、数字、ハイフンのみ使用できます" })
    }

    const config = loadCategoryConfig()
    const parentCategory = config.mainCategories.find((c) => c.id === parentId)

    if (!parentCategory) {
      return res.status(404).json({ error: `親カテゴリ「${parentId}」が見つかりません` })
    }

    const catDir = path.join(projectRoot, "content/skill-tree", parentId)
    const filePath = path.join(catDir, `${id}.md`)

    // 重複チェック
    if (fs.existsSync(filePath)) {
      return res.status(400).json({ error: `「${id}」は既に存在します` })
    }

    // ディレクトリを確認
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true })
    }

    // ファイルを作成
    const content = `---
title: ${title}
tags:
  - ${parentCategory.tags[0]}
  - skill-tree
---

${title}に関するコンテンツです。
`
    fs.writeFileSync(filePath, content)

    // index.mdにリンクを追加
    const indexPath = path.join(catDir, "index.md")
    if (fs.existsSync(indexPath)) {
      let indexContent = fs.readFileSync(indexPath, "utf-8")
      const wikiLink = `- [[skill-tree/${parentId}/${id}|${title}]]`

      // 既にリンクがあるかチェック
      if (!indexContent.includes(`skill-tree/${parentId}/${id}`)) {
        // コンテンツセクションの末尾にリンクを追加
        if (indexContent.includes("## コンテンツ")) {
          // コンテンツセクションがある場合、最後の - [[...]] の後に追加
          const lines = indexContent.split("\n")
          let lastLinkIndex = -1
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("- [[")) {
              lastLinkIndex = i
            }
          }
          if (lastLinkIndex >= 0) {
            lines.splice(lastLinkIndex + 1, 0, wikiLink)
            indexContent = lines.join("\n")
          } else {
            // リンクがない場合、## コンテンツの後に追加
            indexContent = indexContent.replace("## コンテンツ", `## コンテンツ\n\n${wikiLink}`)
          }
        } else {
          // コンテンツセクションがない場合、末尾に追加
          indexContent = indexContent.trimEnd() + `\n\n## コンテンツ\n\n${wikiLink}\n`
        }
        fs.writeFileSync(indexPath, indexContent)
      }
    }

    res.json({
      success: true,
      message: `中カテゴリ「${title}」を追加しました`,
      filePath: `content/skill-tree/${parentId}/${id}.md`,
    })
  } catch (error) {
    console.error("Add sub category error:", error)
    res.status(500).json({ error: "中カテゴリの追加に失敗しました" })
  }
})

// 中カテゴリを削除
app.delete("/api/categories/sub/:parentId/:id", (req, res) => {
  try {
    const { parentId, id } = req.params
    const { force } = req.query

    const filePath = path.join(projectRoot, "content/skill-tree", parentId, `${id}.md`)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `中カテゴリ「${id}」が見つかりません` })
    }

    // このカテゴリにリンクされているコンテンツがあるかチェック
    const customLinks = loadCustomLinks()
    const slug = `skill-tree/${parentId}/${id}`
    const linkedContent = customLinks.links.filter(
      (l) => l.source === slug || l.target === slug
    )

    if (linkedContent.length > 0 && force !== "true") {
      return res.status(400).json({
        error: `このカテゴリには${linkedContent.length}件のリンクがあります`,
        hasLinks: true,
        linkCount: linkedContent.length,
      })
    }

    // ファイルを削除
    fs.unlinkSync(filePath)

    // 関連するカスタムリンクも削除
    if (linkedContent.length > 0) {
      customLinks.links = customLinks.links.filter(
        (l) => l.source !== slug && l.target !== slug
      )
      saveCustomLinks(customLinks)
    }

    // index.mdからリンクを削除
    const catDir = path.join(projectRoot, "content/skill-tree", parentId)
    const indexPath = path.join(catDir, "index.md")
    if (fs.existsSync(indexPath)) {
      let indexContent = fs.readFileSync(indexPath, "utf-8")
      const lines = indexContent.split("\n")
      const filteredLines = lines.filter(
        (line) => !line.includes(`skill-tree/${parentId}/${id}|`) && !line.includes(`skill-tree/${parentId}/${id}]]`)
      )
      indexContent = filteredLines.join("\n")
      fs.writeFileSync(indexPath, indexContent)
    }

    res.json({ success: true, message: `中カテゴリ「${id}」を削除しました` })
  } catch (error) {
    console.error("Delete sub category error:", error)
    res.status(500).json({ error: "中カテゴリの削除に失敗しました" })
  }
})

// 統計情報を取得
app.get("/api/stats", (req, res) => {
  try {
    const contentDir = path.join(projectRoot, "content/skill-tree")
    const statsPath = path.join(projectRoot, "content/_config/stats.json")

    // カテゴリ別ノード数をカウント
    const categories: Record<string, { total: number; recent: number }> = {}
    const recentItems: { title: string; category: string; date: string; path: string }[] = []
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    function scanCategory(catDir: string, catName: string) {
      if (!fs.existsSync(catDir)) return

      const files = fs.readdirSync(catDir)
      let total = 0
      let recent = 0

      for (const file of files) {
        if (!file.endsWith(".md") || file === "index.md") continue

        total++
        const filePath = path.join(catDir, file)
        const stat = fs.statSync(filePath)
        const content = fs.readFileSync(filePath, "utf-8")
        const { data } = matter(content)

        // 7日以内に作成されたファイル
        if (stat.birthtime > sevenDaysAgo) {
          recent++
          recentItems.push({
            title: data.title || file.replace(".md", ""),
            category: catName,
            date: stat.birthtime.toISOString().split("T")[0],
            path: `skill-tree/${catName}/${file.replace(".md", "")}`,
          })
        }
      }

      categories[catName] = { total, recent }
    }

    // 各カテゴリをスキャン
    const catConfig = loadCategoryConfig()
    for (const cat of catConfig.mainCategories) {
      scanCategory(path.join(contentDir, cat.id), cat.id)
    }

    // 合計を計算
    const totalNodes = Object.values(categories).reduce((sum, c) => sum + c.total, 0)
    const recentNodes = Object.values(categories).reduce((sum, c) => sum + c.recent, 0)

    // 日別統計を更新・取得
    let dailyStats: Record<string, number> = {}
    if (fs.existsSync(statsPath)) {
      dailyStats = JSON.parse(fs.readFileSync(statsPath, "utf-8"))
    }

    // 今日の日付でノード数を記録
    const today = now.toISOString().split("T")[0]
    dailyStats[today] = totalNodes

    // 古いデータを削除（30日以上前）
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    for (const date of Object.keys(dailyStats)) {
      if (new Date(date) < thirtyDaysAgo) {
        delete dailyStats[date]
      }
    }

    fs.writeFileSync(statsPath, JSON.stringify(dailyStats, null, 2))

    // 最近のアイテムを日付順でソート
    recentItems.sort((a, b) => b.date.localeCompare(a.date))

    res.json({
      success: true,
      totalNodes,
      recentNodes,
      categories,
      recentItems: recentItems.slice(0, 10),
      dailyStats,
    })
  } catch (error) {
    console.error("Stats error:", error)
    res.status(500).json({ error: "統計情報の取得に失敗しました" })
  }
})

// タイトル一覧を取得
app.get("/api/titles", (req, res) => {
  try {
    const contentDir = path.join(projectRoot, "content/skill-tree")
    const nodes: {
      filePath: string
      title: string
      displayTitle: string | null
      titleLength: number
      category: string
      sourceType: string | null
    }[] = []

    // 各カテゴリをスキャン
    const titlesConfig = loadCategoryConfig()
    for (const cat of titlesConfig.mainCategories) {
      const catDir = path.join(contentDir, cat.id)
      if (!fs.existsSync(catDir)) continue

      const files = fs.readdirSync(catDir)
      for (const file of files) {
        if (!file.endsWith(".md") || file === "index.md") continue

        const filePath = path.join(catDir, file)
        const content = fs.readFileSync(filePath, "utf-8")
        const { data } = matter(content)

        nodes.push({
          filePath: `content/skill-tree/${cat.id}/${file}`,
          title: data.title || file.replace(".md", ""),
          displayTitle: data.displayTitle || null,
          titleLength: (data.title || "").length,
          category: cat.id,
          sourceType: data.source?.type || null,
        })
      }
    }

    // タイトル長でソート（長い順）
    nodes.sort((a, b) => b.titleLength - a.titleLength)

    res.json({ success: true, nodes })
  } catch (error) {
    console.error("Titles error:", error)
    res.status(500).json({ error: "タイトル一覧の取得に失敗しました" })
  }
})

// タイトルを更新
app.patch("/api/titles", (req, res) => {
  try {
    const { updates }: { updates: { filePath: string; displayTitle: string }[] } = req.body

    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: "更新データが必要です" })
    }

    let updatedCount = 0
    const errors: string[] = []

    for (const update of updates) {
      try {
        const fullPath = path.join(projectRoot, update.filePath)
        updateDisplayTitle(fullPath, update.displayTitle)
        updatedCount++
      } catch (error) {
        errors.push(`${update.filePath}: ${error instanceof Error ? error.message : "更新失敗"}`)
      }
    }

    res.json({
      success: true,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `${updatedCount}件のタイトルを更新しました`,
    })
  } catch (error) {
    console.error("Update titles error:", error)
    res.status(500).json({ error: "タイトルの更新に失敗しました" })
  }
})

// タイトル自動短縮候補を取得
app.post("/api/titles/suggest", (req, res) => {
  try {
    const { title, maxLength = 40 }: { title: string; maxLength?: number } = req.body

    if (!title) {
      return res.status(400).json({ error: "タイトルが必要です" })
    }

    const suggestion = suggestShortTitle(title, maxLength)
    res.json({ success: true, suggestion })
  } catch (error) {
    console.error("Suggest title error:", error)
    res.status(500).json({ error: "短縮候補の生成に失敗しました" })
  }
})

// YouTube検索
app.post("/api/youtube/search", async (req, res) => {
  try {
    const { query, maxResults = 10 }: { query: string; maxResults?: number } = req.body

    if (!query) {
      return res.status(400).json({ error: "検索キーワードが必要です" })
    }

    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      return res.status(400).json({ error: "YouTube APIキーが設定されていません（.envファイルを確認）" })
    }

    const results = await searchYouTubeVideos(query, apiKey, maxResults)

    res.json({
      success: true,
      query,
      results,
    })
  } catch (error) {
    console.error("YouTube search error:", error)
    res.status(500).json({
      error: error instanceof Error ? error.message : "YouTube検索中にエラーが発生しました",
    })
  }
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

    // 重複チェック（警告のみ）
    const { isDuplicate, existingFile } = checkDuplicateUrl(url)

    res.json({
      success: true,
      sourceType,
      content: {
        title: content.title,
        description: content.description,
        source: content.source,
        suggestedTags: content.suggestedTags,
      },
      isDuplicate,
      existingFile,
    })
  } catch (error) {
    console.error("Preview error:", error)
    res.status(500).json({
      error: error instanceof Error ? error.message : "URL解析中にエラーが発生しました",
    })
  }
})

// URLの重複チェック
function checkDuplicateUrl(url: string): { isDuplicate: boolean; existingFile?: string } {
  const contentDir = path.join(projectRoot, "content/skill-tree")

  function scanDir(dir: string): string | null {
    if (!fs.existsSync(dir)) return null
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const result = scanDir(path.join(dir, entry.name))
        if (result) return result
      } else if (entry.name.endsWith(".md")) {
        try {
          const filePath = path.join(dir, entry.name)
          const content = fs.readFileSync(filePath, "utf-8")
          const { data } = matter(content)
          if (data.source?.url === url) {
            return filePath.replace(projectRoot + "/", "")
          }
        } catch {
          // パースエラーは無視
        }
      }
    }
    return null
  }

  const existingFile = scanDir(contentDir)
  return { isDuplicate: !!existingFile, existingFile: existingFile || undefined }
}

// コンテンツを追加
app.post("/api/add", async (req, res) => {
  try {
    const { url, category, tags, linkTo }: { url: string; category: string; tags?: string[]; linkTo?: string | null } = req.body

    if (!url) {
      return res.status(400).json({ error: "URLが必要です" })
    }

    if (!category) {
      return res.status(400).json({ error: "カテゴリが必要です" })
    }

    // 重複チェック
    const { isDuplicate, existingFile } = checkDuplicateUrl(url)
    if (isDuplicate) {
      return res.status(400).json({
        error: `このURLは既に追加されています`,
        existingFile,
      })
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

    // 編集されたタグで置き換え（フロントエンドで編集されたタグを使用）
    if (tags && tags.length > 0) {
      content.suggestedTags = tags
    }

    // ソース設定を更新
    const configPath = "content/_config/sources.json"
    let config = loadSourceConfig(configPath)
    config = updateSourceConfig(content, config)
    saveSourceConfig(config, configPath)

    // マークダウンファイル保存
    const filePath = saveMarkdownFile(content, category, "content/skill-tree")

    // リンク先が指定されている場合、カスタムリンクを追加
    if (linkTo) {
      const customLinksPath = path.join(projectRoot, "content/_config/custom-links.json")
      const customLinks = loadCustomLinks()

      // 保存したファイルのslugを取得
      const fileName = path.basename(filePath, ".md")
      const newContentSlug = `skill-tree/${category}/${fileName}`
      const linkTargetSlug = `skill-tree/${category}/${linkTo}`

      // 既に存在しないかチェック
      const exists = customLinks.links.some(
        (l: { source: string; target: string }) => l.source === linkTargetSlug && l.target === newContentSlug
      )
      if (!exists) {
        customLinks.links.push({ source: linkTargetSlug, target: newContentSlug })
        saveCustomLinks(customLinks)
      }
    }

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

// ソース設定をコンテンツと同期
app.post("/api/sources/sync", (req, res) => {
  try {
    const contentDir = path.join(projectRoot, "content/skill-tree")
    const configPath = path.join(projectRoot, "content/_config/sources.json")
    const { removed, config } = syncSourceConfig(contentDir, configPath)

    res.json({
      success: true,
      removed,
      message: removed.length > 0
        ? `${removed.length}件のソースを削除しました`
        : "同期完了（削除対象なし）",
    })
  } catch (error) {
    console.error("Sync error:", error)
    res.status(500).json({ error: "同期に失敗しました" })
  }
})

// 管理ページを返す
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"))
})

app.listen(PORT, () => {
  // 起動時にソース設定を自動同期
  const contentDir = path.join(projectRoot, "content/skill-tree")
  const configPath = path.join(projectRoot, "content/_config/sources.json")
  const { removed } = syncSourceConfig(contentDir, configPath)

  console.log(`
╔════════════════════════════════════════════╗
║   AI Skill Map 管理ツール                  ║
╠════════════════════════════════════════════╣
║   http://localhost:${PORT}                   ║
╚════════════════════════════════════════════╝
${removed.length > 0 ? `\n🔄 ${removed.length}件の未使用ソースを削除しました:\n   ${removed.join("\n   ")}\n` : ""}
URLを貼り付けてコンテンツを追加できます。
終了: Ctrl+C
`)
})

import * as cheerio from "cheerio"
import { ParsedContent, SourceInfo } from "../types"

// Note.com URL から記事IDと著者を抽出
export function extractNoteInfo(url: string): { author: string; noteId: string } | null {
  // https://note.com/username/n/nxxxxxxxx 形式
  const match = url.match(/note\.com\/([^\/]+)\/n\/([^\/\?\#]+)/)
  if (match) {
    return {
      author: match[1],
      noteId: match[2],
    }
  }
  return null
}

// AIキーワード検出
const aiKeywords = [
  "chatgpt",
  "gpt",
  "claude",
  "gemini",
  "ai",
  "人工知能",
  "機械学習",
  "自動化",
  "プロンプト",
  "生成ai",
  "llm",
  "copilot",
  "notion ai",
  "midjourney",
  "stable diffusion",
  "dall-e",
  "n8n",
  "zapier",
  "make",
]

// カテゴリ推測
function suggestCategory(title: string, description: string): string {
  const text = (title + " " + description).toLowerCase()

  if (text.includes("chatgpt") || text.includes("claude") || text.includes("gemini")) {
    return "chat-ai"
  }
  if (
    text.includes("画像") ||
    text.includes("midjourney") ||
    text.includes("stable diffusion") ||
    text.includes("dall-e")
  ) {
    return "generative-ai"
  }
  if (text.includes("自動化") || text.includes("n8n") || text.includes("zapier") || text.includes("make")) {
    return "automation"
  }
  if (text.includes("データ") || text.includes("分析") || text.includes("excel") || text.includes("スプレッドシート")) {
    return "data-analysis"
  }
  if (text.includes("コード") || text.includes("プログラミング") || text.includes("copilot")) {
    return "coding"
  }

  return "chat-ai" // デフォルト
}

// タグ推測
function suggestTags(title: string, description: string): string[] {
  const text = (title + " " + description).toLowerCase()
  const tags: string[] = []

  // ツール特定タグ
  if (text.includes("chatgpt") || text.includes("openai")) tags.push("ChatGPT")
  if (text.includes("claude") || text.includes("anthropic")) tags.push("Claude")
  if (text.includes("gemini") || text.includes("google ai")) tags.push("Gemini")
  if (text.includes("copilot")) tags.push("GitHub-Copilot")
  if (text.includes("notion")) tags.push("Notion-AI")
  if (text.includes("n8n")) tags.push("N8N")
  if (text.includes("zapier")) tags.push("Zapier")
  if (text.includes("make") || text.includes("integromat")) tags.push("Make")
  if (text.includes("midjourney")) tags.push("Midjourney")
  if (text.includes("stable diffusion")) tags.push("Stable-Diffusion")

  // レベル推定
  if (
    text.includes("入門") ||
    text.includes("初心者") ||
    text.includes("始め方") ||
    text.includes("基本")
  ) {
    tags.push("Lv1-入門")
  } else if (text.includes("実践") || text.includes("活用")) {
    tags.push("Lv2-実践")
  } else if (text.includes("応用") || text.includes("テクニック")) {
    tags.push("Lv3-応用")
  } else if (text.includes("プロ") || text.includes("上級")) {
    tags.push("Lv4-上級")
  } else {
    tags.push("Lv1-入門") // デフォルト
  }

  // ユースケースタグ
  if (text.includes("文章") || text.includes("ライティング") || text.includes("執筆")) {
    tags.push("文章作成")
  }
  if (text.includes("コード") || text.includes("プログラミング")) {
    tags.push("コード生成")
  }
  if (text.includes("画像") || text.includes("イラスト") || text.includes("デザイン")) {
    tags.push("画像生成")
  }
  if (text.includes("データ") || text.includes("分析")) {
    tags.push("データ分析")
  }

  return tags
}

export async function parseNoteUrl(url: string): Promise<ParsedContent> {
  const noteInfo = extractNoteInfo(url)
  if (!noteInfo) {
    throw new Error(`無効なNote.com URL: ${url}`)
  }

  try {
    // Note.comページを取得
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTPエラー: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // タイトル取得（複数パターンに対応）
    let title =
      $('meta[property="og:title"]').attr("content") ||
      $("h1.o-noteContentHeader__title").text().trim() ||
      $("title").text().trim() ||
      "無題"

    // 説明取得
    let description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      ""

    // 著者名取得
    let authorName =
      $('meta[property="article:author"]').attr("content") ||
      $(".o-noteContentHeader__name").text().trim() ||
      noteInfo.author

    // 公開日取得
    let publishedAt =
      $('meta[property="article:published_time"]').attr("content") ||
      $("time").attr("datetime") ||
      ""

    // サムネイル取得
    let thumbnail = $('meta[property="og:image"]').attr("content") || ""

    // 日付をYYYY-MM-DD形式に
    if (publishedAt) {
      publishedAt = publishedAt.split("T")[0]
    }

    const source: SourceInfo = {
      type: "note",
      url: url,
      author: authorName,
      authorId: noteInfo.author,
      publishedAt: publishedAt,
      thumbnail: thumbnail,
    }

    const suggestedCategory = suggestCategory(title, description)
    const suggestedTags = suggestTags(title, description)

    return {
      title,
      description: description.slice(0, 500), // 説明は500文字まで
      source,
      suggestedCategory,
      suggestedTags,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Note.com スクレイピングエラー: ${error.message}`)
    }
    throw error
  }
}

// Note.com URLかどうか判定
export function isNoteUrl(url: string): boolean {
  return /note\.com\/[^\/]+\/n\//.test(url)
}

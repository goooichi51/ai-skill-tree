import * as cheerio from "cheerio"
import { ParsedContent, SourceInfo } from "../types"

// URLからドメインを抽出
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

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
  } else {
    tags.push("Lv1-入門") // デフォルト
  }

  return tags
}

export async function parseBlogUrl(url: string): Promise<ParsedContent> {
  const domain = extractDomain(url)
  if (!domain) {
    throw new Error(`無効なURL: ${url}`)
  }

  try {
    // ブログページを取得
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

    // タイトル取得
    let title =
      $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "無題"

    // 説明取得
    let description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      ""

    // 著者取得
    let author =
      $('meta[name="author"]').attr("content") ||
      $('meta[property="article:author"]').attr("content") ||
      $(".author").first().text().trim() ||
      domain

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
      type: "blog",
      url: url,
      author: author,
      authorId: domain, // ドメインをIDとして使用
      domain: domain,
      publishedAt: publishedAt,
      thumbnail: thumbnail,
    }

    const suggestedCategory = suggestCategory(title, description)
    const suggestedTags = suggestTags(title, description)

    return {
      title,
      description: description.slice(0, 500),
      source,
      suggestedCategory,
      suggestedTags,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`ブログ スクレイピングエラー: ${error.message}`)
    }
    throw error
  }
}

// 既知のソース以外のURLかどうか判定（フォールバック用）
export function isBlogUrl(url: string): boolean {
  // YouTube, Note.com, X/Twitter以外のHTTP URLはブログとして扱う
  if (!url.startsWith("http")) return false
  if (/(?:youtube\.com|youtu\.be)/.test(url)) return false
  if (/note\.com\/[^\/]+\/n\//.test(url)) return false
  if (/(?:x\.com|twitter\.com)\/[^\/]+\/status\/\d+/.test(url)) return false
  return true
}

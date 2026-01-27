import { google } from "googleapis"
import { ParsedContent, SourceInfo } from "../types"

const youtube = google.youtube("v3")

// YouTube URL からビデオIDを抽出
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return match[1]
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

  // レベル推定（数字なし）
  if (text.includes("入門") || text.includes("初心者") || text.includes("始め方")) {
    tags.push("入門")
  } else if (text.includes("基礎") || text.includes("基本")) {
    tags.push("基礎")
  } else if (text.includes("実践") || text.includes("活用")) {
    tags.push("実践")
  } else if (text.includes("応用") || text.includes("テクニック")) {
    tags.push("応用")
  } else if (text.includes("プロ") || text.includes("上級") || text.includes("エキスパート")) {
    tags.push("上級")
  } else {
    tags.push("入門") // デフォルト
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

export async function parseYouTubeUrl(url: string, apiKey: string): Promise<ParsedContent> {
  const videoId = extractVideoId(url)
  if (!videoId) {
    throw new Error(`無効なYouTube URL: ${url}`)
  }

  try {
    // YouTube Data API でビデオ情報取得
    const response = await youtube.videos.list({
      key: apiKey,
      part: ["snippet"],
      id: [videoId],
    })

    const video = response.data.items?.[0]
    if (!video || !video.snippet) {
      throw new Error(`ビデオが見つかりません: ${videoId}`)
    }

    const snippet = video.snippet
    const title = snippet.title || "無題"
    const description = snippet.description || ""
    const channelTitle = snippet.channelTitle || "不明"
    const channelId = snippet.channelId || ""
    const publishedAt = snippet.publishedAt || ""
    const thumbnail = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || ""

    const source: SourceInfo = {
      type: "youtube",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channel: channelTitle,
      channelId: channelId,
      publishedAt: publishedAt.split("T")[0], // 日付のみ
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
      throw new Error(`YouTube API エラー: ${error.message}`)
    }
    throw error
  }
}

// YouTube URLかどうか判定
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url)
}

// 検索結果の型
export interface YouTubeSearchResult {
  videoId: string
  title: string
  channel: string
  channelId: string
  thumbnail: string
  publishedAt: string
  url: string
}

// YouTube検索
export async function searchYouTubeVideos(
  query: string,
  apiKey: string,
  maxResults: number = 10
): Promise<YouTubeSearchResult[]> {
  try {
    const response = await youtube.search.list({
      key: apiKey,
      part: ["snippet"],
      q: query,
      type: ["video"],
      maxResults: maxResults,
      relevanceLanguage: "ja", // 日本語コンテンツ優先
    })

    const results: YouTubeSearchResult[] = []

    for (const item of response.data.items || []) {
      if (!item.id?.videoId || !item.snippet) continue

      results.push({
        videoId: item.id.videoId,
        title: item.snippet.title || "無題",
        channel: item.snippet.channelTitle || "不明",
        channelId: item.snippet.channelId || "",
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
        publishedAt: (item.snippet.publishedAt || "").split("T")[0],
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      })
    }

    return results
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`YouTube検索エラー: ${error.message}`)
    }
    throw error
  }
}

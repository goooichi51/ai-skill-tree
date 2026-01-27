import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// コンテンツソースの型定義

export type SourceType = "youtube" | "note" | "x" | "blog" | "manual"

export interface SourceInfo {
  type: SourceType
  url: string
  channel?: string
  channelId?: string
  author?: string
  authorId?: string
  domain?: string // blog用
  publishedAt?: string
  thumbnail?: string
}

export interface ParsedContent {
  title: string
  description: string
  source: SourceInfo
  suggestedTags: string[]
  suggestedCategory: string
}

export interface SourceConfig {
  youtube: {
    channels: Record<string, ChannelConfig>
  }
  note: {
    authors: Record<string, AuthorConfig>
  }
  x: {
    users: Record<string, AuthorConfig>
  }
  blog: {
    domains: Record<string, AuthorConfig>
  }
}

export interface ChannelConfig {
  name: string
  color: string
  enabled: boolean
}

export interface AuthorConfig {
  name: string
  color: string
  enabled: boolean
}

// カテゴリの型定義
export type NodeShape = "circle" | "square" | "diamond" | "hexagon" | "star"

export interface MainCategory {
  id: string
  name: string
  shape: NodeShape
  color: { h: number; s: number; l: number }
  tags: string[]
}

export interface CategoryConfig {
  mainCategories: MainCategory[]
}

// カテゴリ設定ファイルのパス
const CATEGORY_CONFIG_PATH = path.join(__dirname, "../content/_config/categories.json")

// カテゴリ設定を読み込み
export function loadCategoryConfig(): CategoryConfig {
  if (!fs.existsSync(CATEGORY_CONFIG_PATH)) {
    // デフォルト設定を返す
    return {
      mainCategories: [
        { id: "chat-ai", name: "対話型AI", shape: "circle", color: { h: 0, s: 70, l: 55 }, tags: ["対話型AI", "skill-tree"] },
        { id: "generative-ai", name: "生成AI", shape: "square", color: { h: 270, s: 60, l: 55 }, tags: ["生成AI", "skill-tree"] },
        { id: "automation", name: "自動化", shape: "diamond", color: { h: 30, s: 80, l: 55 }, tags: ["自動化", "skill-tree"] },
        { id: "development", name: "開発", shape: "hexagon", color: { h: 150, s: 60, l: 45 }, tags: ["開発", "skill-tree"] },
        { id: "frontier", name: "先端技術", shape: "star", color: { h: 210, s: 70, l: 50 }, tags: ["先端技術", "skill-tree"] },
      ],
    }
  }
  const content = fs.readFileSync(CATEGORY_CONFIG_PATH, "utf-8")
  return JSON.parse(content)
}

// カテゴリ設定を保存
export function saveCategoryConfig(config: CategoryConfig): void {
  fs.writeFileSync(CATEGORY_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
}

// categoryTagMapを動的に生成（後方互換性用）
export function getCategoryTagMap(): Record<string, string[]> {
  const config = loadCategoryConfig()
  const map: Record<string, string[]> = {}
  for (const cat of config.mainCategories) {
    map[cat.id] = cat.tags
  }
  return map
}

// レガシー用: 静的なcategoryTagMap（起動時に一度読み込み）
export const categoryTagMap: Record<string, string[]> = getCategoryTagMap()

// デフォルトの色パレット（新しいチャンネル/著者用）
export const defaultColors = [
  "#ff6b6b", // 赤
  "#45b7d1", // 青
  "#96ceb4", // 緑
  "#ffeaa7", // 黄
  "#dfe6e9", // グレー
  "#ff9ff3", // ピンク
  "#54a0ff", // 水色
  "#5f27cd", // 紫
  "#00d2d3", // シアン
  "#ff9f43", // オレンジ
]

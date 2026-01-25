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

// カテゴリとタグのマッピング
export const categoryTagMap: Record<string, string[]> = {
  "chat-ai": ["対話型AI", "skill-tree"],
  "generative-ai": ["生成AI", "skill-tree"],
  "automation": ["自動化", "skill-tree"],
  "data-analysis": ["データ分析", "skill-tree"],
  "coding": ["コーディング支援", "skill-tree"],
}

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

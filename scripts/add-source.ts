#!/usr/bin/env npx tsx
import { Command } from "commander"
import * as dotenv from "dotenv"
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
import { categoryTagMap, ParsedContent } from "./types"

// .envファイル読み込み
dotenv.config()

const program = new Command()

program
  .name("add-source")
  .description("YouTube/Note.com/X/ブログのURLからスキルツリーノードを自動生成")
  .version("1.0.0")

program
  .argument("<url>", "YouTube動画、Note.com記事、Xポスト、またはブログ記事のURL")
  .option("-c, --category <category>", "カテゴリ (chat-ai, generative-ai, automation, data-analysis, coding)", "chat-ai")
  .option("-t, --tags <tags>", "追加タグ（カンマ区切り）")
  .option("-d, --dry-run", "ファイル作成せずプレビューのみ")
  .option("-o, --output <dir>", "出力ディレクトリ", "content/skill-tree")
  .option("--api-key <key>", "YouTube APIキー（環境変数YOUTUBE_API_KEYでも可）")
  .action(async (url: string, options) => {
    try {
      console.log("\n📎 URL解析中...\n")

      let content: ParsedContent

      if (isYouTubeUrl(url)) {
        const apiKey = options.apiKey || process.env.YOUTUBE_API_KEY
        if (!apiKey) {
          console.error("❌ YouTube APIキーが必要です")
          console.error("   --api-key オプションまたは YOUTUBE_API_KEY 環境変数を設定してください")
          process.exit(1)
        }
        content = await parseYouTubeUrl(url, apiKey)
        console.log("📺 YouTube動画を検出しました")
      } else if (isNoteUrl(url)) {
        content = await parseNoteUrl(url)
        console.log("📝 Note.com記事を検出しました")
      } else if (isXUrl(url)) {
        content = await parseXUrl(url)
        console.log("🐦 Xポストを検出しました")
      } else if (isBlogUrl(url)) {
        content = await parseBlogUrl(url)
        console.log("📄 ブログ記事を検出しました")
      } else {
        console.error("❌ 対応していないURL形式です")
        console.error("   YouTube、Note.com、X、またはブログのURLを入力してください")
        process.exit(1)
      }

      // 追加タグがあれば追加
      if (options.tags) {
        const additionalTags = options.tags.split(",").map((t: string) => t.trim())
        content.suggestedTags.push(...additionalTags)
      }

      // カテゴリチェック
      const validCategories = Object.keys(categoryTagMap)
      if (!validCategories.includes(options.category)) {
        console.warn(`⚠️ 不明なカテゴリ: ${options.category}`)
        console.warn(`   有効なカテゴリ: ${validCategories.join(", ")}`)
      }

      // 結果表示
      console.log("\n───────────────────────────────────")
      console.log("📋 解析結果")
      console.log("───────────────────────────────────")
      console.log(`タイトル: ${content.title}`)
      console.log(`ソース: ${content.source.type}`)
      if (content.source.channel) console.log(`チャンネル: ${content.source.channel}`)
      if (content.source.author) console.log(`著者: ${content.source.author}`)
      if (content.source.publishedAt) console.log(`公開日: ${content.source.publishedAt}`)
      console.log(`カテゴリ: ${options.category}`)
      console.log(`タグ: ${content.suggestedTags.join(", ")}`)
      console.log("───────────────────────────────────\n")

      if (options.dryRun) {
        console.log("🔍 ドライラン - 生成されるマークダウン:\n")
        console.log(generateMarkdown(content, options.category))
        return
      }

      // ソース設定を更新
      const configPath = "content/_config/sources.json"
      let config = loadSourceConfig(configPath)
      config = updateSourceConfig(content, config)
      saveSourceConfig(config, configPath)
      console.log(`✅ ソース設定を更新: ${configPath}`)

      // マークダウンファイル保存
      const filePath = saveMarkdownFile(content, options.category, options.output)
      console.log(`✅ ファイル作成: ${filePath}`)

      // チャンネル/著者の色分け案内
      if (content.source.type === "youtube" && content.source.channelId) {
        const channelConfig = config.youtube.channels[content.source.channelId]
        if (channelConfig && !channelConfig.enabled) {
          console.log(`\n💡 ヒント: チャンネル「${channelConfig.name}」の色分けを有効にするには`)
          console.log(`   ${configPath} で enabled: true に設定してください`)
        }
      }
      if (content.source.type === "note" && content.source.authorId) {
        const authorConfig = config.note.authors[content.source.authorId]
        if (authorConfig && !authorConfig.enabled) {
          console.log(`\n💡 ヒント: 著者「${authorConfig.name}」の色分けを有効にするには`)
          console.log(`   ${configPath} で enabled: true に設定してください`)
        }
      }
      if (content.source.type === "x" && content.source.authorId) {
        const userConfig = config.x.users[content.source.authorId]
        if (userConfig && !userConfig.enabled) {
          console.log(`\n💡 ヒント: Xユーザー「${userConfig.name}」の色分けを有効にするには`)
          console.log(`   ${configPath} で enabled: true に設定してください`)
        }
      }
      if (content.source.type === "blog" && content.source.domain) {
        const domainConfig = config.blog.domains[content.source.domain]
        if (domainConfig && !domainConfig.enabled) {
          console.log(`\n💡 ヒント: ブログ「${domainConfig.name}」の色分けを有効にするには`)
          console.log(`   ${configPath} で enabled: true に設定してください`)
        }
      }

      console.log("\n🎉 完了！ ビルドして確認してください: npx quartz build --serve")
    } catch (error) {
      console.error("❌ エラーが発生しました:")
      if (error instanceof Error) {
        console.error(`   ${error.message}`)
      }
      process.exit(1)
    }
  })

// リスト表示コマンド
program
  .command("list")
  .description("登録済みのチャンネル/著者を一覧表示")
  .action(() => {
    const config = loadSourceConfig()

    console.log("\n📺 YouTubeチャンネル")
    console.log("───────────────────────────────────")
    const channels = Object.entries(config.youtube.channels)
    if (channels.length === 0) {
      console.log("(なし)")
    } else {
      for (const [id, info] of channels) {
        const status = info.enabled ? "✅" : "⬜"
        console.log(`${status} ${info.name} (${id}) - ${info.color}`)
      }
    }

    console.log("\n📝 Note.com著者")
    console.log("───────────────────────────────────")
    const authors = Object.entries(config.note.authors)
    if (authors.length === 0) {
      console.log("(なし)")
    } else {
      for (const [id, info] of authors) {
        const status = info.enabled ? "✅" : "⬜"
        console.log(`${status} ${info.name} (${id}) - ${info.color}`)
      }
    }

    console.log("\n🐦 Xユーザー")
    console.log("───────────────────────────────────")
    const xUsers = Object.entries(config.x?.users ?? {})
    if (xUsers.length === 0) {
      console.log("(なし)")
    } else {
      for (const [id, info] of xUsers) {
        const status = info.enabled ? "✅" : "⬜"
        console.log(`${status} ${info.name} (${id}) - ${info.color}`)
      }
    }

    console.log("\n📄 ブログドメイン")
    console.log("───────────────────────────────────")
    const blogDomains = Object.entries(config.blog?.domains ?? {})
    if (blogDomains.length === 0) {
      console.log("(なし)")
    } else {
      for (const [id, info] of blogDomains) {
        const status = info.enabled ? "✅" : "⬜"
        console.log(`${status} ${info.name} (${id}) - ${info.color}`)
      }
    }
    console.log()
  })

// 色分け有効化/無効化コマンド
program
  .command("enable <type> <id>")
  .description("チャンネル/著者の色分けを有効化 (type: youtube|note|x|blog)")
  .action((type: string, id: string) => {
    const config = loadSourceConfig()

    if (type === "youtube") {
      if (config.youtube.channels[id]) {
        config.youtube.channels[id].enabled = true
        saveSourceConfig(config)
        console.log(`✅ YouTubeチャンネル「${config.youtube.channels[id].name}」の色分けを有効化しました`)
      } else {
        console.error(`❌ チャンネルID「${id}」が見つかりません`)
      }
    } else if (type === "note") {
      if (config.note.authors[id]) {
        config.note.authors[id].enabled = true
        saveSourceConfig(config)
        console.log(`✅ Note著者「${config.note.authors[id].name}」の色分けを有効化しました`)
      } else {
        console.error(`❌ 著者ID「${id}」が見つかりません`)
      }
    } else if (type === "x") {
      if (config.x?.users?.[id]) {
        config.x.users[id].enabled = true
        saveSourceConfig(config)
        console.log(`✅ Xユーザー「${config.x.users[id].name}」の色分けを有効化しました`)
      } else {
        console.error(`❌ ユーザーID「${id}」が見つかりません`)
      }
    } else if (type === "blog") {
      if (config.blog?.domains?.[id]) {
        config.blog.domains[id].enabled = true
        saveSourceConfig(config)
        console.log(`✅ ブログ「${config.blog.domains[id].name}」の色分けを有効化しました`)
      } else {
        console.error(`❌ ドメイン「${id}」が見つかりません`)
      }
    } else {
      console.error(`❌ 無効なタイプです (youtube, note, x, blog を指定)`)
    }
  })

program
  .command("disable <type> <id>")
  .description("チャンネル/著者の色分けを無効化 (type: youtube|note|x|blog)")
  .action((type: string, id: string) => {
    const config = loadSourceConfig()

    if (type === "youtube") {
      if (config.youtube.channels[id]) {
        config.youtube.channels[id].enabled = false
        saveSourceConfig(config)
        console.log(`⬜ YouTubeチャンネル「${config.youtube.channels[id].name}」の色分けを無効化しました`)
      } else {
        console.error(`❌ チャンネルID「${id}」が見つかりません`)
      }
    } else if (type === "note") {
      if (config.note.authors[id]) {
        config.note.authors[id].enabled = false
        saveSourceConfig(config)
        console.log(`⬜ Note著者「${config.note.authors[id].name}」の色分けを無効化しました`)
      } else {
        console.error(`❌ 著者ID「${id}」が見つかりません`)
      }
    } else if (type === "x") {
      if (config.x?.users?.[id]) {
        config.x.users[id].enabled = false
        saveSourceConfig(config)
        console.log(`⬜ Xユーザー「${config.x.users[id].name}」の色分けを無効化しました`)
      } else {
        console.error(`❌ ユーザーID「${id}」が見つかりません`)
      }
    } else if (type === "blog") {
      if (config.blog?.domains?.[id]) {
        config.blog.domains[id].enabled = false
        saveSourceConfig(config)
        console.log(`⬜ ブログ「${config.blog.domains[id].name}」の色分けを無効化しました`)
      } else {
        console.error(`❌ ドメイン「${id}」が見つかりません`)
      }
    } else {
      console.error(`❌ 無効なタイプです (youtube, note, x, blog を指定)`)
    }
  })

program.parse()

import type { ContentDetails, SourceInfo } from "../../plugins/emitters/contentIndex"
import {
  SimulationNodeDatum,
  SimulationLinkDatum,
  Simulation,
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceLink,
  forceCollide,
  forceRadial,
  zoomIdentity,
  select,
  drag,
  zoom,
} from "d3"
import { Text, Graphics, Application, Container, Circle } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { registerEscapeHandler, removeAllChildren } from "./util"
import { FullSlug, SimpleSlug, getFullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { D3Config } from "../Graph"

type GraphicsInfo = {
  color: string
  gfx: Graphics
  alpha: number
  active: boolean
}

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]
  source?: SourceInfo
} & SimulationNodeDatum

type SimpleLinkData = {
  source: SimpleSlug
  target: SimpleSlug
}

type LinkData = {
  source: NodeData
  target: NodeData
} & SimulationLinkDatum<NodeData>

type LinkRenderData = GraphicsInfo & {
  simulationData: LinkData
}

type NodeRenderData = GraphicsInfo & {
  simulationData: NodeData
  label: Text
}

const localStorageKey = "graph-visited"
function getVisited(): Set<SimpleSlug> {
  return new Set(JSON.parse(localStorage.getItem(localStorageKey) ?? "[]"))
}

function addToVisited(slug: SimpleSlug) {
  const visited = getVisited()
  visited.add(slug)
  localStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}

// ソース設定の型定義
type ChannelConfig = {
  name: string
  color: string
  enabled: boolean
}

type AuthorConfig = {
  name: string
  color: string
  enabled: boolean
}

type SourceConfig = {
  youtube: {
    channels: Record<string, ChannelConfig>
  }
  note: {
    authors: Record<string, AuthorConfig>
  }
  x?: {
    users: Record<string, AuthorConfig>
  }
  blog?: {
    domains: Record<string, AuthorConfig>
  }
}

// カテゴリ設定の型定義
type MainCategory = {
  id: string
  name: string
  shape: "circle" | "square" | "diamond" | "hexagon" | "star"
  color: { h: number; s: number; l: number }
  tags: string[]
}

type CategoryConfig = {
  mainCategories: MainCategory[]
}

// デフォルトのカテゴリ設定
const defaultCategoryConfig: CategoryConfig = {
  mainCategories: [
    { id: "chat-ai", name: "対話型AI", shape: "circle", color: { h: 0, s: 70, l: 55 }, tags: ["対話型AI", "skill-tree"] },
    { id: "generative-ai", name: "生成AI", shape: "square", color: { h: 270, s: 60, l: 55 }, tags: ["生成AI", "skill-tree"] },
    { id: "automation", name: "自動化", shape: "diamond", color: { h: 30, s: 80, l: 55 }, tags: ["自動化", "skill-tree"] },
    { id: "development", name: "開発", shape: "hexagon", color: { h: 150, s: 60, l: 45 }, tags: ["開発", "skill-tree"] },
    { id: "frontier", name: "先端技術", shape: "star", color: { h: 210, s: 70, l: 50 }, tags: ["先端技術", "skill-tree"] },
  ],
}

// ベースパスを取得（GitHub Pagesのサブパス対応）
function getBasePath(): string {
  // pathToRoot関数と同じロジックを使用
  const pathname = window.location.pathname
  // /ai-skill-tree/skill-tree/chat-ai/ のような場合、/ai-skill-tree/ を返す
  const match = pathname.match(/^\/[^\/]+\//)
  return match ? match[0] : "/"
}

// カテゴリ設定をキャッシュ
let categoryConfigCache: CategoryConfig | null = null

// カテゴリ設定を取得
async function getCategoryConfig(): Promise<CategoryConfig> {
  if (categoryConfigCache) return categoryConfigCache

  try {
    const basePath = getBasePath()
    const response = await fetch(`${basePath}static/categories.json`)
    if (response.ok) {
      categoryConfigCache = await response.json() as CategoryConfig
      return categoryConfigCache
    }
  } catch (e) {
    console.warn("Failed to load categories.json:", e)
  }
  categoryConfigCache = defaultCategoryConfig
  return categoryConfigCache
}

// ソース設定のlocalStorageキー
const sourceSettingsKey = "source-settings"

// ソース設定を取得（ファイルとlocalStorageをマージ）
async function getSourceSettings(): Promise<SourceConfig> {
  const defaultConfig: SourceConfig = {
    youtube: { channels: {} },
    note: { authors: {} },
    x: { users: {} },
    blog: { domains: {} },
  }

  try {
    // ビルド時に生成されたソース設定を読み込む
    const basePath = getBasePath()
    const response = await fetch(`${basePath}static/_config/sources.json`)
    if (response.ok) {
      const fileConfig = await response.json() as SourceConfig

      // 初期化（古い設定ファイル対応）
      if (!fileConfig.x) fileConfig.x = { users: {} }
      if (!fileConfig.blog) fileConfig.blog = { domains: {} }

      // localStorageのユーザー設定で上書き
      const localSettingsRaw = localStorage.getItem(sourceSettingsKey)
      if (localSettingsRaw) {
        const localSettings = JSON.parse(localSettingsRaw) as Partial<SourceConfig>
        // ユーザーのenabled設定のみ上書き
        if (localSettings.youtube?.channels) {
          for (const [id, config] of Object.entries(localSettings.youtube.channels)) {
            if (fileConfig.youtube.channels[id]) {
              fileConfig.youtube.channels[id].enabled = config.enabled
            }
          }
        }
        if (localSettings.note?.authors) {
          for (const [id, config] of Object.entries(localSettings.note.authors)) {
            if (fileConfig.note.authors[id]) {
              fileConfig.note.authors[id].enabled = config.enabled
            }
          }
        }
        if (localSettings.x?.users) {
          for (const [id, config] of Object.entries(localSettings.x.users)) {
            if (fileConfig.x?.users?.[id]) {
              fileConfig.x.users[id].enabled = config.enabled
            }
          }
        }
        if (localSettings.blog?.domains) {
          for (const [id, config] of Object.entries(localSettings.blog.domains)) {
            if (fileConfig.blog?.domains?.[id]) {
              fileConfig.blog.domains[id].enabled = config.enabled
            }
          }
        }
      }
      return fileConfig
    }
  } catch {
    // 設定ファイルがない場合はデフォルトを返す
  }

  return defaultConfig
}

// ソース設定をlocalStorageに保存（enabled状態のみ）
function saveSourceSettings(config: SourceConfig): void {
  const enabledOnly: SourceConfig = {
    youtube: { channels: {} },
    note: { authors: {} },
    x: { users: {} },
    blog: { domains: {} },
  }

  for (const [id, channelConfig] of Object.entries(config.youtube.channels)) {
    enabledOnly.youtube.channels[id] = {
      name: channelConfig.name,
      color: channelConfig.color,
      enabled: channelConfig.enabled
    }
  }

  for (const [id, authorConfig] of Object.entries(config.note.authors)) {
    enabledOnly.note.authors[id] = {
      name: authorConfig.name,
      color: authorConfig.color,
      enabled: authorConfig.enabled
    }
  }

  for (const [id, userConfig] of Object.entries(config.x?.users ?? {})) {
    enabledOnly.x!.users[id] = {
      name: userConfig.name,
      color: userConfig.color,
      enabled: userConfig.enabled
    }
  }

  for (const [id, domainConfig] of Object.entries(config.blog?.domains ?? {})) {
    enabledOnly.blog!.domains[id] = {
      name: domainConfig.name,
      color: domainConfig.color,
      enabled: domainConfig.enabled
    }
  }

  localStorage.setItem(sourceSettingsKey, JSON.stringify(enabledOnly))
}

type TweenNode = {
  update: (time: number) => void
  stop: () => void
}

async function renderGraph(graph: HTMLElement, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  removeAllChildren(graph)

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
    enableRadial,
  } = JSON.parse(graph.dataset["cfg"]!) as D3Config

  const data: Map<SimpleSlug, ContentDetails> = new Map(
    Object.entries<ContentDetails>(await fetchData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )

  // カスタムリンク設定を読み込む
  type CustomLinksConfig = {
    links: { source: string; target: string }[]
    excludedLinks: { source: string; target: string }[]
  }
  let customLinksConfig: CustomLinksConfig = { links: [], excludedLinks: [] }
  try {
    const basePath = getBasePath()
    const customLinksResponse = await fetch(`${basePath}static/customLinks.json`)
    if (customLinksResponse.ok) {
      customLinksConfig = await customLinksResponse.json()
    }
  } catch (e) {
    console.warn("Failed to load custom links:", e)
  }

  // カテゴリ設定を読み込む
  const categoryConfig = await getCategoryConfig()

  const links: SimpleLinkData[] = []
  const tags: SimpleSlug[] = []
  const validLinks = new Set(data.keys())

  const tweens = new Map<string, TweenNode>()
  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }

    if (showTags) {
      const localTags = details.tags
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(("tags/" + tag) as FullSlug))

      tags.push(...localTags.filter((tag) => !tags.includes(tag)))

      for (const tag of localTags) {
        links.push({ source: source, target: tag })
      }
    }
  }

  // ====== カスタムリンクの処理 ======
  // 重複防止用Set
  const addedLinks = new Set<string>()
  // 除外リンクのSetを作成
  const excludedLinkKeys = new Set<string>()
  for (const link of customLinksConfig.excludedLinks) {
    const sourceSlug = simplifySlug(link.source as FullSlug)
    const targetSlug = simplifySlug(link.target as FullSlug)
    excludedLinkKeys.add([sourceSlug, targetSlug].sort().join(":"))
  }

  // 除外リンクを削除
  const filteredLinks = links.filter((link) => {
    const linkKey = [link.source, link.target].sort().join(":")
    return !excludedLinkKeys.has(linkKey)
  })
  links.length = 0
  links.push(...filteredLinks)

  // カスタムリンクを追加
  for (const link of customLinksConfig.links) {
    const sourceSlug = simplifySlug(link.source as FullSlug)
    const targetSlug = simplifySlug(link.target as FullSlug)

    // 両方のノードが存在する場合のみ追加
    if (validLinks.has(sourceSlug) && validLinks.has(targetSlug)) {
      const linkKey = [sourceSlug, targetSlug].sort().join(":")
      if (!addedLinks.has(linkKey)) {
        links.push({ source: sourceSlug, target: targetSlug })
        addedLinks.add(linkKey)
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        neighbourhood.add(cur)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }

  const nodes = [...neighbourhood].map((url) => {
    const nodeData = data.get(url)
    // displayTitleがあれば優先、なければtitle、どちらもなければurl
    const text = url.startsWith("tags/")
      ? "#" + url.substring(5)
      : (nodeData?.displayTitle || nodeData?.title || url)
    return {
      id: url,
      text,
      tags: nodeData?.tags ?? [],
      source: nodeData?.source,
    }
  })
  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes,
    links: links
      .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: nodes.find((n) => n.id === l.source)!,
        target: nodes.find((n) => n.id === l.target)!,
      })),
  }

  const width = graph.offsetWidth
  const height = Math.max(graph.offsetHeight, 250)

  // カテゴリに基づいてノードを分類（クラスタリング用）
  function getNodeCategory(d: NodeData): string {
    const tags = d.tags || []

    // 1. パスでマッチ（最も信頼性が高い）
    for (const cat of categoryConfig.mainCategories) {
      if (d.id.includes(`/${cat.id}/`) || d.id.includes(`/${cat.id}`)) {
        return cat.id
      }
    }

    // 2. カテゴリ固有のタグでマッチ（"skill-tree"を除外）
    for (const cat of categoryConfig.mainCategories) {
      const specificTags = cat.tags.filter(tag => tag !== "skill-tree")
      if (specificTags.some((tag) => tags.includes(tag))) {
        return cat.id
      }
    }

    return "other"
  }

  // カテゴリごとのクラスタ中心点（円形に配置）
  const categoryPositions: Record<string, { x: number; y: number }> = (() => {
    const positions: Record<string, { x: number; y: number }> = { other: { x: 0, y: 0 } }
    const count = categoryConfig.mainCategories.length
    const radius = 100
    categoryConfig.mainCategories.forEach((cat, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2 // 上から開始
      positions[cat.id] = {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      }
    })
    return positions
  })()

  // カテゴリクラスタリング力
  function forceCluster(strength: number = 0.1) {
    let nodes: NodeData[]

    function force(alpha: number) {
      for (const d of nodes) {
        const category = getNodeCategory(d)
        const target = categoryPositions[category] || categoryPositions["other"]
        d.vx = (d.vx || 0) + (target.x - (d.x || 0)) * strength * alpha
        d.vy = (d.vy || 0) + (target.y - (d.y || 0)) * strength * alpha
      }
    }

    force.initialize = function(_nodes: NodeData[]) {
      nodes = _nodes
    }

    return force
  }

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3))
    .force("cluster", forceCluster(0.15))  // カテゴリクラスタリング

  const radius = (Math.min(width, height) / 2) * 0.8
  if (enableRadial) simulation.force("radial", forceRadial(radius).strength(0.2))

  // precompute style prop strings as pixi doesn't support css variables
  const cssVars = [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
  ] as const
  const computedStyleMap = cssVars.reduce(
    (acc, key) => {
      acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
      return acc
    },
    {} as Record<(typeof cssVars)[number], string>,
  )

  // 中テーマ（ツール/技術）の色パレット
  const midThemeColors: Record<string, string> = {
    // 対話型AI
    "ChatGPT": "#10a37f",     // OpenAIグリーン
    "OpenAI": "#10a37f",
    "Claude": "#d97706",      // Anthropicオレンジ
    "Anthropic": "#d97706",
    "Gemini": "#4285f4",      // Googleブルー
    "Google": "#4285f4",
    // 生成AI
    "Midjourney": "#5865f2",  // Discordパープル
    "DALL-E": "#00a67e",      // OpenAI系グリーン
    "StableDiffusion": "#a855f7", // パープル
    // 自動化
    "N8N": "#ff6d5a",         // N8Nオレンジ
    "Zapier": "#ff4a00",      // Zapierオレンジ
    "Make": "#6366f1",        // インディゴ
    // 開発
    "Cursor": "#00d8ff",      // シアン
    "Copilot": "#238636",     // GitHubグリーン
    "GitHub": "#238636",
    "VSCode": "#007acc",      // VSCodeブルー
    // 先端技術
    "AIエージェント": "#ec4899", // ピンク
    "RAG": "#f59e0b",         // アンバー
    "LangChain": "#1c3d5a",   // ダークブルー
  }

  // 中テーマに基づいて色を決定
  function getNodeMidThemeColor(d: NodeData): string | null {
    const tags = d.tags || []
    for (const tag of tags) {
      if (midThemeColors[tag]) {
        return midThemeColors[tag]
      }
    }
    return null
  }

  // カテゴリ別の基本色（HSL形式）- 設定ファイルから動的に生成
  const categoryColors: Record<string, { h: number; s: number; l: number }> = (() => {
    const colors: Record<string, { h: number; s: number; l: number }> = {}
    for (const cat of categoryConfig.mainCategories) {
      colors[cat.id] = cat.color
    }
    return colors
  })()

  // 中カテゴリを特定（大カテゴリのindex.mdからリンクされているノード）
  const subCategories = new Set<string>()
  for (const [source, details] of data.entries()) {
    // 大カテゴリのindexページからのリンク先を中カテゴリとして登録
    if (source.match(/^skill-tree\/[^/]+$/) || source.endsWith("/index")) {
      for (const target of details.links ?? []) {
        if (!target.endsWith("/index") && !target.startsWith("tags/")) {
          subCategories.add(target)
        }
      }
    }
  }

  // コンテンツノード → 親の中カテゴリ のマップを作成
  const parentSubCategoryMap = new Map<string, string>()
  for (const link of customLinksConfig.links) {
    const sourceSlug = simplifySlug(link.source as FullSlug)
    const targetSlug = simplifySlug(link.target as FullSlug)
    // リンク元が中カテゴリの場合、リンク先の親として登録
    if (subCategories.has(sourceSlug)) {
      parentSubCategoryMap.set(targetSlug, sourceSlug)
    }
  }

  // カテゴリ内の中カテゴリの順序を取得
  function getSubCategoryIndex(nodeId: string, category: string): number {
    // 大カテゴリ（indexページ）は0
    if (nodeId.endsWith("/index") || nodeId === `skill-tree/${category}`) {
      return 0
    }

    // ノードIDからファイル名部分を取得してハッシュ化
    const parts = nodeId.split("/")
    const filename = parts[parts.length - 1]
    let hash = 0
    for (let i = 0; i < filename.length; i++) {
      hash = ((hash << 5) - hash) + filename.charCodeAt(i)
      hash = hash & hash // 32bit integer
    }
    return Math.abs(hash) % 5 + 1 // 1-5の範囲
  }

  // カテゴリに基づいて色を決定
  function getCategoryColor(d: NodeData): string | null {
    const category = getNodeCategory(d)
    if (category === "other") return null

    const baseColor = categoryColors[category]
    if (!baseColor) return null

    // 大カテゴリかどうかを判定
    const isMainCategory = d.id.endsWith("/index") ||
      d.id === `skill-tree/${category}` ||
      d.id === `skill-tree/${category}/index`

    // 明度を調整
    let adjustedL: number
    if (isMainCategory) {
      // 大カテゴリはベース色
      adjustedL = baseColor.l
    } else {
      // 親の中カテゴリがある場合は、その色を使用
      const parentSubCategory = parentSubCategoryMap.get(d.id)
      const colorSourceId = parentSubCategory || d.id

      // 中カテゴリは順番で明度を変化（±10%の範囲）
      const subIndex = getSubCategoryIndex(colorSourceId, category)
      const lightnessOffset = (subIndex % 5 - 2) * 5 // -10, -5, 0, +5, +10
      adjustedL = Math.max(35, Math.min(70, baseColor.l + lightnessOffset))
    }

    return `hsl(${baseColor.h}, ${baseColor.s}%, ${adjustedL}%)`
  }

  // ソース設定を取得
  const sourceSettings = await getSourceSettings()

  // ソースに基づいて色を決定
  function getNodeSourceColor(d: NodeData): string | null {
    const source = d.source
    if (!source) return null

    if (source.type === "youtube" && source.channelId) {
      const config = sourceSettings.youtube.channels[source.channelId]
      if (config?.enabled) {
        return config.color
      }
    }

    if (source.type === "note" && source.authorId) {
      const config = sourceSettings.note.authors[source.authorId]
      if (config?.enabled) {
        return config.color
      }
    }

    if (source.type === "x" && source.authorId) {
      const config = sourceSettings.x?.users?.[source.authorId]
      if (config?.enabled) {
        return config.color
      }
    }

    if (source.type === "blog" && source.domain) {
      const config = sourceSettings.blog?.domains?.[source.domain]
      if (config?.enabled) {
        return config.color
      }
    }

    return null // 無効の場合はnull（次の優先順位へ）
  }

  // calculate color
  // 優先順位: 1.現在のページ → 2.カテゴリ色 → 3.訪問済み → 4.デフォルト
  // ※ソース色（YouTube/Note.com）は廃止し、カテゴリ色を優先
  const color = (d: NodeData) => {
    const isCurrent = d.id === slug
    if (isCurrent) {
      return computedStyleMap["--secondary"]
    }

    // カテゴリに基づく色を使用（大カテゴリに近い色）
    const catColor = getCategoryColor(d)
    if (catColor) {
      return catColor
    }

    // タグノードや訪問済みは従来通り
    if (visited.has(d.id) || d.id.startsWith("tags/")) {
      return computedStyleMap["--tertiary"]
    } else {
      return computedStyleMap["--gray"]
    }
  }

  function nodeRadius(d: NodeData) {
    const numLinks = graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id,
    ).length
    return 2 + Math.sqrt(numLinks)
  }

  // カテゴリに基づいて形状を決定 - 設定ファイルから動的に判定
  type NodeShape = "circle" | "square" | "diamond" | "hexagon" | "star" | "home"
  function getNodeShape(d: NodeData): NodeShape {
    // ホームページは家アイコン
    if (d.id === "index") return "home"

    // getNodeCategoryと同じロジックでカテゴリを判定
    const category = getNodeCategory(d)
    if (category !== "other") {
      const cat = categoryConfig.mainCategories.find(c => c.id === category)
      if (cat) return cat.shape
    }

    return "circle" // デフォルト
  }

  // 形状を描画するヘルパー関数
  function drawNodeShape(gfx: Graphics, shape: NodeShape, radius: number, fillColor: string) {
    switch (shape) {
      case "circle":
        gfx.circle(0, 0, radius)
        break
      case "square":
        gfx.rect(-radius, -radius, radius * 2, radius * 2)
        break
      case "diamond":
        gfx.poly([0, -radius * 1.2, radius * 1.2, 0, 0, radius * 1.2, -radius * 1.2, 0])
        break
      case "hexagon":
        const hexPoints: number[] = []
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2
          hexPoints.push(Math.cos(angle) * radius * 1.1, Math.sin(angle) * radius * 1.1)
        }
        gfx.poly(hexPoints)
        break
      case "star":
        const starPoints: number[] = []
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2
          const r = i % 2 === 0 ? radius * 1.2 : radius * 0.5
          starPoints.push(Math.cos(angle) * r, Math.sin(angle) * r)
        }
        gfx.poly(starPoints)
        break
      case "home":
        // 家のアイコン（屋根 + 本体）
        const r = radius * 1.3
        // 屋根部分（三角形）
        gfx.poly([
          0, -r,           // 頂点
          -r, -r * 0.2,    // 左下
          r, -r * 0.2      // 右下
        ])
        gfx.fill({ color: fillColor })
        // 本体部分（四角形）
        gfx.rect(-r * 0.7, -r * 0.2, r * 1.4, r * 1.1)
        gfx.fill({ color: fillColor })
        return // homeケースはここでreturn
    }
    gfx.fill({ color: fillColor })
  }

  let hoveredNodeId: string | null = null
  let hoveredNeighbours: Set<string> = new Set()
  const linkRenderData: LinkRenderData[] = []
  const nodeRenderData: NodeRenderData[] = []
  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      hoveredNeighbours = new Set()
      for (const n of nodeRenderData) {
        n.active = false
      }

      for (const l of linkRenderData) {
        l.active = false
      }
    } else {
      hoveredNeighbours = new Set()
      for (const l of linkRenderData) {
        const linkData = l.simulationData
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          hoveredNeighbours.add(linkData.source.id)
          hoveredNeighbours.add(linkData.target.id)
        }

        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId
      }

      for (const n of nodeRenderData) {
        n.active = hoveredNeighbours.has(n.simulationData.id)
      }
    }
  }

  let dragStartTime = 0
  let dragging = false

  function renderLinks() {
    tweens.get("link")?.stop()
    const tweenGroup = new TweenGroup()

    for (const l of linkRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      // with full alpha and the rest with default alpha
      if (hoveredNodeId) {
        alpha = l.active ? 1 : 0.2
      }

      l.color = l.active ? computedStyleMap["--secondary"] : computedStyleMap["--gray"]
      tweenGroup.add(new Tweened<LinkRenderData>(l).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("link", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderLabels() {
    tweens.get("label")?.stop()
    const tweenGroup = new TweenGroup()

    const defaultScale = 1 / scale
    const activeScale = defaultScale * 1.1
    for (const n of nodeRenderData) {
      const nodeId = n.simulationData.id

      if (hoveredNodeId === nodeId) {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: 1,
              scale: { x: activeScale, y: activeScale },
            },
            100,
          ),
        )
      } else {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: n.label.alpha,
              scale: { x: defaultScale, y: defaultScale },
            },
            100,
          ),
        )
      }
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("label", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderNodes() {
    tweens.get("hover")?.stop()

    const tweenGroup = new TweenGroup()
    for (const n of nodeRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      if (hoveredNodeId !== null && focusOnHover) {
        alpha = n.active ? 1 : 0.2
      }

      tweenGroup.add(new Tweened<Graphics>(n.gfx, tweenGroup).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("hover", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderPixiFromD3() {
    renderNodes()
    renderLinks()
    renderLabels()
  }

  tweens.forEach((tween) => tween.stop())
  tweens.clear()

  const app = new Application()
  await app.init({
    width,
    height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgl",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  })
  graph.appendChild(app.canvas)

  // リセットボタンを追加
  const resetBtn = document.createElement("button")
  resetBtn.className = "graph-reset-btn"
  resetBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>リセット`
  graph.style.position = "relative"
  graph.appendChild(resetBtn)

  const stage = app.stage
  stage.interactive = false

  const labelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const nodesContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
  stage.addChild(nodesContainer, labelsContainer, linkContainer)

  for (const n of graphData.nodes) {
    const nodeId = n.id

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: 0,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: "#f1f5f9", // 暗い背景でも見やすい明るい色
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
    })
    label.scale.set(1 / scale)

    let oldLabelOpacity = 0
    const isTagNode = nodeId.startsWith("tags/")
    const nodeShape = getNodeShape(n)
    const radius = nodeRadius(n)
    const fillColor = isTagNode ? computedStyleMap["--light"] : color(n)

    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, radius * 1.2), // ヒットエリアは少し大きめに
      cursor: "pointer",
    })

    // カテゴリに応じた形状を描画
    drawNodeShape(gfx, isTagNode ? "circle" : nodeShape, radius, fillColor)

    gfx.on("pointerover", (e) => {
        updateHoverInfo(e.target.label)
        oldLabelOpacity = label.alpha
        if (!dragging) {
          renderPixiFromD3()
        }
      })
      .on("pointerleave", () => {
        updateHoverInfo(null)
        label.alpha = oldLabelOpacity
        if (!dragging) {
          renderPixiFromD3()
        }
      })

    if (isTagNode) {
      gfx.stroke({ width: 2, color: computedStyleMap["--tertiary"] })
    }

    nodesContainer.addChild(gfx)
    labelsContainer.addChild(label)

    const nodeRenderDatum: NodeRenderData = {
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
    }

    nodeRenderData.push(nodeRenderDatum)
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" })
    linkContainer.addChild(gfx)

    const linkRenderDatum: LinkRenderData = {
      simulationData: l,
      gfx,
      color: computedStyleMap["--gray"],
      alpha: 1,
      active: false,
    }

    linkRenderData.push(linkRenderDatum)
  }

  let currentTransform = zoomIdentity
  if (enableDrag) {
    select<HTMLCanvasElement, NodeData | undefined>(app.canvas).call(
      drag<HTMLCanvasElement, NodeData | undefined>()
        .container(() => app.canvas)
        .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
        .on("start", function dragstarted(event) {
          if (!event.active) simulation.alphaTarget(1).restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          }
          dragStartTime = Date.now()
          dragging = true
        })
        .on("drag", function dragged(event) {
          const initPos = event.subject.__initialDragPos
          event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k
          event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k
        })
        .on("end", function dragended(event) {
          if (!event.active) simulation.alphaTarget(0)
          event.subject.fx = null
          event.subject.fy = null
          dragging = false

          // if the time between mousedown and mouseup is short, we consider it a click
          if (Date.now() - dragStartTime < 500) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id) as NodeData
            const targ = resolveRelative(fullSlug, node.id)
            window.spaNavigate(new URL(targ, window.location.toString()))
          }
        }),
    )
  } else {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => {
        const targ = resolveRelative(fullSlug, node.simulationData.id)
        window.spaNavigate(new URL(targ, window.location.toString()))
      })
    }
  }

  const graphZoom = zoom<HTMLCanvasElement, NodeData>()
    .extent([
      [0, 0],
      [width, height],
    ])
    .scaleExtent([0.25, 4])
    .on("zoom", ({ transform }) => {
      currentTransform = transform
      stage.scale.set(transform.k, transform.k)
      stage.position.set(transform.x, transform.y)

      // zoom adjusts opacity of labels too
      const scale = transform.k * opacityScale
      let scaleOpacity = Math.max((scale - 1) / 3.75, 0)
      const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label)

      for (const label of labelsContainer.children) {
        if (!activeNodes.includes(label)) {
          label.alpha = scaleOpacity
        }
      }
    })

  if (enableZoom) {
    select<HTMLCanvasElement, NodeData>(app.canvas).call(graphZoom)

    // 初期ズームを適用（ラベルが見える程度に拡大）
    const initialZoom = 1.8
    const initialTransform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initialZoom)
      .translate(-width / 2, -height / 2)
    select<HTMLCanvasElement, NodeData>(app.canvas).call(graphZoom.transform, initialTransform)
  }

  // リセットボタンのクリックハンドラ
  resetBtn.addEventListener("click", () => {
    // ズームをリセット
    select<HTMLCanvasElement, NodeData>(app.canvas)
      .transition()
      .duration(500)
      .call(graphZoom.transform, zoomIdentity)

    // シミュレーションを再加熱して中央に戻す
    simulation.alpha(0.3).restart()
  })

  let stopAnimation = false
  function animate(time: number) {
    if (stopAnimation) return
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData
      if (!x || !y) continue
      n.gfx.position.set(x + width / 2, y + height / 2)
      if (n.label) {
        n.label.position.set(x + width / 2, y + height / 2)
      }
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData
      l.gfx.clear()
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2)
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: l.alpha, width: l.active ? 2 : 1.5, color: l.color })
    }

    tweens.forEach((t) => t.update(time))
    app.renderer.render(stage)
    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)
  return () => {
    stopAnimation = true
    app.destroy()
  }
}

let localGraphCleanups: (() => void)[] = []
let globalGraphCleanups: (() => void)[] = []

function cleanupLocalGraphs() {
  for (const cleanup of localGraphCleanups) {
    cleanup()
  }
  localGraphCleanups = []
}

function cleanupGlobalGraphs() {
  for (const cleanup of globalGraphCleanups) {
    cleanup()
  }
  globalGraphCleanups = []
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url
  addToVisited(simplifySlug(slug))

  async function renderLocalGraph() {
    cleanupLocalGraphs()
    const localGraphContainers = document.getElementsByClassName("graph-container")
    for (const container of localGraphContainers) {
      localGraphCleanups.push(await renderGraph(container as HTMLElement, slug))
    }
  }

  await renderLocalGraph()
  const handleThemeChange = () => {
    void renderLocalGraph()
  }

  // ソースフィルター変更時にグラフを再描画
  const handleSourceFilterChange = () => {
    void renderLocalGraph()
  }

  document.addEventListener("themechange", handleThemeChange)
  window.addEventListener("source-filter-changed", handleSourceFilterChange)
  window.addCleanup(() => {
    document.removeEventListener("themechange", handleThemeChange)
    window.removeEventListener("source-filter-changed", handleSourceFilterChange)
  })

  const containers = [...document.getElementsByClassName("global-graph-outer")] as HTMLElement[]
  async function renderGlobalGraph() {
    const slug = getFullSlug(window)
    for (const container of containers) {
      container.classList.add("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = "1"
      }

      const graphContainer = container.querySelector(".global-graph-container") as HTMLElement
      registerEscapeHandler(container, hideGlobalGraph)
      if (graphContainer) {
        globalGraphCleanups.push(await renderGraph(graphContainer, slug))
      }
    }
  }

  function hideGlobalGraph() {
    cleanupGlobalGraphs()
    for (const container of containers) {
      container.classList.remove("active")
      const sidebar = container.closest(".sidebar") as HTMLElement
      if (sidebar) {
        sidebar.style.zIndex = ""
      }
    }
  }

  async function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const anyGlobalGraphOpen = containers.some((container) =>
        container.classList.contains("active"),
      )
      anyGlobalGraphOpen ? hideGlobalGraph() : renderGlobalGraph()
    }
  }

  const containerIcons = document.getElementsByClassName("global-graph-icon")
  Array.from(containerIcons).forEach((icon) => {
    icon.addEventListener("click", renderGlobalGraph)
    window.addCleanup(() => icon.removeEventListener("click", renderGlobalGraph))
  })

  document.addEventListener("keydown", shortcutHandler)
  window.addCleanup(() => {
    document.removeEventListener("keydown", shortcutHandler)
    cleanupLocalGraphs()
    cleanupGlobalGraphs()
  })
})

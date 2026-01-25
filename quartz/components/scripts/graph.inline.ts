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
    const response = await fetch("/static/_config/sources.json")
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
    const customLinksResponse = await fetch(`${document.location.origin}/static/customLinks.json`)
    if (customLinksResponse.ok) {
      customLinksConfig = await customLinksResponse.json()
    }
  } catch (e) {
    console.warn("Failed to load custom links:", e)
  }

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

  // ====== タグベース・ソースベースの自動接続 ======
  // 各ノードからの自動接続数を最大4つに制限
  const MAX_AUTO_LINKS_PER_NODE = 4
  const autoLinkCount = new Map<SimpleSlug, number>() // ノードごとの自動接続数

  // 主要タグのみで接続（共通タグは除外）
  const connectingTags = [
    // ツール別
    "ChatGPT", "Claude", "Gemini", "Copilot", "Midjourney", "DALL-E", "Stable-Diffusion",
    // カテゴリ別
    "対話型AI", "画像生成", "動画生成", "音声生成", "自動化", "開発支援",
    // レベル別
    "Lv1-入門", "Lv2-実践", "Lv3-応用"
  ]
  const excludeTags = ["skill-tree", "use-case"]

  // タグ→ノードのマップを作成
  const tagToNodes = new Map<string, SimpleSlug[]>()
  for (const [slug, details] of data.entries()) {
    if (slug.startsWith("tags/")) continue // タグノードは除外
    for (const tag of details.tags ?? []) {
      if (excludeTags.includes(tag)) continue
      if (!connectingTags.includes(tag)) continue
      if (!tagToNodes.has(tag)) tagToNodes.set(tag, [])
      tagToNodes.get(tag)!.push(slug)
    }
  }

  // 同じタグを持つノード同士を接続（最大制限あり）
  const addedLinks = new Set<string>() // 重複防止
  for (const [, nodes] of tagToNodes.entries()) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i]
        const nodeB = nodes[j]
        const countA = autoLinkCount.get(nodeA) ?? 0
        const countB = autoLinkCount.get(nodeB) ?? 0

        // 両方のノードがまだ接続上限に達していない場合のみ接続
        if (countA >= MAX_AUTO_LINKS_PER_NODE || countB >= MAX_AUTO_LINKS_PER_NODE) continue

        const linkKey = [nodeA, nodeB].sort().join(":")
        if (!addedLinks.has(linkKey)) {
          links.push({ source: nodeA, target: nodeB })
          addedLinks.add(linkKey)
          autoLinkCount.set(nodeA, countA + 1)
          autoLinkCount.set(nodeB, countB + 1)
        }
      }
    }
  }

  // ====== ソースベースの自動接続 ======
  // 同じチャンネル/著者からのコンテンツを接続
  const sourceToNodes = new Map<string, SimpleSlug[]>()
  for (const [slug, details] of data.entries()) {
    if (slug.startsWith("tags/")) continue
    const source = details.source
    if (!source) continue

    // ソースキーを生成（type + id）
    let sourceKey = ""
    if (source.type === "youtube" && source.channelId) {
      sourceKey = `youtube:${source.channelId}`
    } else if (source.type === "note" && source.authorId) {
      sourceKey = `note:${source.authorId}`
    } else if (source.type === "x" && source.authorId) {
      sourceKey = `x:${source.authorId}`
    } else if (source.type === "blog" && source.domain) {
      sourceKey = `blog:${source.domain}`
    }

    if (sourceKey) {
      if (!sourceToNodes.has(sourceKey)) sourceToNodes.set(sourceKey, [])
      sourceToNodes.get(sourceKey)!.push(slug)
    }
  }

  // 同じソースのノード同士を接続（最大制限あり）
  for (const [, nodes] of sourceToNodes.entries()) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i]
        const nodeB = nodes[j]
        const countA = autoLinkCount.get(nodeA) ?? 0
        const countB = autoLinkCount.get(nodeB) ?? 0

        // 両方のノードがまだ接続上限に達していない場合のみ接続
        if (countA >= MAX_AUTO_LINKS_PER_NODE || countB >= MAX_AUTO_LINKS_PER_NODE) continue

        const linkKey = [nodeA, nodeB].sort().join(":")
        if (!addedLinks.has(linkKey)) {
          links.push({ source: nodeA, target: nodeB })
          addedLinks.add(linkKey)
          autoLinkCount.set(nodeA, countA + 1)
          autoLinkCount.set(nodeB, countB + 1)
        }
      }
    }
  }

  // ====== カスタムリンクの処理 ======
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
    const text = url.startsWith("tags/") ? "#" + url.substring(5) : (data.get(url)?.title ?? url)
    return {
      id: url,
      text,
      tags: data.get(url)?.tags ?? [],
      source: data.get(url)?.source,
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
    if (tags.includes("対話型AI") || d.id.includes("chat-ai")) return "chat-ai"
    if (tags.includes("生成AI") || d.id.includes("generative-ai")) return "generative-ai"
    if (tags.includes("自動化") || d.id.includes("automation")) return "automation"
    if (tags.includes("開発") || d.id.includes("development")) return "development"
    if (tags.includes("先端技術") || d.id.includes("frontier")) return "frontier"
    return "other"
  }

  // カテゴリごとのクラスタ中心点（円形に配置）
  const categoryPositions: Record<string, { x: number; y: number }> = {
    "chat-ai": { x: 0, y: -100 },           // 上
    "generative-ai": { x: 95, y: -31 },     // 右上
    "automation": { x: 59, y: 81 },         // 右下
    "development": { x: -59, y: 81 },       // 左下
    "frontier": { x: -95, y: -31 },         // 左上
    "other": { x: 0, y: 0 },                // 中心
  }

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
  // 優先順位: 1.現在のページ → 2.ソース色（enabled時）→ 3.中テーマ色 → 4.訪問済み → 5.デフォルト
  const color = (d: NodeData) => {
    const isCurrent = d.id === slug
    if (isCurrent) {
      return computedStyleMap["--secondary"]
    }

    // ソース（YouTube/Note.com）の色があればそれを使用
    const sourceColor = getNodeSourceColor(d)
    if (sourceColor) {
      return sourceColor
    }

    // 中テーマの色があればそれを使用
    const midThemeColor = getNodeMidThemeColor(d)
    if (midThemeColor) {
      return midThemeColor
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

  // カテゴリに基づいて形状を決定
  type NodeShape = "circle" | "square" | "diamond" | "hexagon" | "star" | "home"
  function getNodeShape(d: NodeData): NodeShape {
    // ホームページは家アイコン
    if (d.id === "index") return "home"
    const tags = d.tags || []
    if (tags.includes("対話型AI")) return "circle"
    if (tags.includes("生成AI")) return "square"
    if (tags.includes("自動化")) return "diamond"
    if (tags.includes("開発")) return "hexagon"
    if (tags.includes("先端技術")) return "star"
    // カテゴリindexページの判定（パスから）
    if (d.id.includes("chat-ai")) return "circle"
    if (d.id.includes("generative-ai")) return "square"
    if (d.id.includes("automation")) return "diamond"
    if (d.id.includes("development")) return "hexagon"
    if (d.id.includes("frontier")) return "star"
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

const sourceSettingsKey = "source-settings"

// ベースパスを取得（GitHub Pagesのサブパス対応）
function getBasePath(): string {
  // GitHub Pagesのサブパス対応
  // github.io でホストされている場合のみ、最初のパスセグメントをベースパスとして使用
  const hostname = window.location.hostname
  if (hostname.includes('github.io')) {
    const pathname = window.location.pathname
    // /ai-skill-tree/skill-tree/chat-ai/ のような場合、/ai-skill-tree/ を返す
    const match = pathname.match(/^\/[^\/]+\//)
    return match ? match[0] : "/"
  }
  // ローカル開発やカスタムドメインの場合は "/" を返す
  return "/"
}

interface ChannelConfig {
  name: string
  color: string
  enabled: boolean
}

interface AuthorConfig {
  name: string
  color: string
  enabled: boolean
}

interface SourceConfig {
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

// ソース設定を取得（sources.json + localStorage）
async function getSourceSettings(): Promise<SourceConfig> {
  const defaultConfig: SourceConfig = {
    youtube: { channels: {} },
    note: { authors: {} },
    x: { users: {} },
    blog: { domains: {} },
  }

  try {
    const basePath = getBasePath()
    const response = await fetch(`${basePath}static/_config/sources.json`)
    if (!response.ok) return defaultConfig
    const config = (await response.json()) as SourceConfig

    // 初期化（古い設定ファイル対応）
    if (!config.x) config.x = { users: {} }
    if (!config.blog) config.blog = { domains: {} }

    // localStorageからユーザー設定を上書き
    const localSettingsRaw = localStorage.getItem(sourceSettingsKey)
    if (localSettingsRaw) {
      const localSettings = JSON.parse(localSettingsRaw)

      // YouTube channels
      for (const [id, enabled] of Object.entries(localSettings.youtube?.channels ?? {})) {
        if (config.youtube.channels[id]) {
          config.youtube.channels[id].enabled = enabled as boolean
        }
      }

      // Note authors
      for (const [id, enabled] of Object.entries(localSettings.note?.authors ?? {})) {
        if (config.note.authors[id]) {
          config.note.authors[id].enabled = enabled as boolean
        }
      }

      // X users
      for (const [id, enabled] of Object.entries(localSettings.x?.users ?? {})) {
        if (config.x.users[id]) {
          config.x.users[id].enabled = enabled as boolean
        }
      }

      // Blog domains
      for (const [id, enabled] of Object.entries(localSettings.blog?.domains ?? {})) {
        if (config.blog.domains[id]) {
          config.blog.domains[id].enabled = enabled as boolean
        }
      }
    }

    return config
  } catch {
    return defaultConfig
  }
}

// localStorage に設定を保存
function saveSettings(config: SourceConfig): void {
  const enabledOnly = {
    youtube: {
      channels: Object.fromEntries(
        Object.entries(config.youtube.channels).map(([id, c]) => [id, c.enabled]),
      ),
    },
    note: {
      authors: Object.fromEntries(
        Object.entries(config.note.authors).map(([id, a]) => [id, a.enabled]),
      ),
    },
    x: {
      users: Object.fromEntries(
        Object.entries(config.x?.users ?? {}).map(([id, u]) => [id, u.enabled]),
      ),
    },
    blog: {
      domains: Object.fromEntries(
        Object.entries(config.blog?.domains ?? {}).map(([id, d]) => [id, d.enabled]),
      ),
    },
  }
  localStorage.setItem(sourceSettingsKey, JSON.stringify(enabledOnly))
}

// グラフを再描画
function triggerGraphRedraw(): void {
  // グラフは contentIndex を再読み込みして再描画が必要
  // カスタムイベントを発火してグラフに通知
  window.dispatchEvent(new CustomEvent("source-filter-changed"))
  // ページをリロードして反映（シンプルな方法）
  // location.reload()
}

// ソースリストを描画
function renderSourceList(config: SourceConfig): void {
  const youtubeContainer = document.querySelector(".youtube-channels")
  const noteContainer = document.querySelector(".note-authors")
  const xContainer = document.querySelector(".x-users")
  const blogContainer = document.querySelector(".blog-domains")

  // YouTube チャンネル
  if (youtubeContainer) {
    youtubeContainer.innerHTML = ""
    const youtubeChannels = Object.entries(config.youtube.channels)

    if (youtubeChannels.length === 0) {
      youtubeContainer.innerHTML = '<p class="empty-message">チャンネルがありません</p>'
    } else {
      for (const [id, channel] of youtubeChannels) {
        const item = document.createElement("label")
        item.className = "source-item"
        item.innerHTML = `
          <input type="checkbox" data-type="youtube" data-id="${id}" ${channel.enabled ? "checked" : ""}>
          <span class="color-indicator" style="background-color: ${channel.color}"></span>
          <span class="source-name">${channel.name}</span>
        `
        youtubeContainer.appendChild(item)
      }
    }
  }

  // Note.com 著者
  if (noteContainer) {
    noteContainer.innerHTML = ""
    const noteAuthors = Object.entries(config.note.authors)

    if (noteAuthors.length === 0) {
      noteContainer.innerHTML = '<p class="empty-message">著者がありません</p>'
    } else {
      for (const [id, author] of noteAuthors) {
        const item = document.createElement("label")
        item.className = "source-item"
        item.innerHTML = `
          <input type="checkbox" data-type="note" data-id="${id}" ${author.enabled ? "checked" : ""}>
          <span class="color-indicator" style="background-color: ${author.color}"></span>
          <span class="source-name">${author.name}</span>
        `
        noteContainer.appendChild(item)
      }
    }
  }

  // X ユーザー
  if (xContainer) {
    xContainer.innerHTML = ""
    const xUsers = Object.entries(config.x?.users ?? {})

    if (xUsers.length === 0) {
      xContainer.innerHTML = '<p class="empty-message">ユーザーがありません</p>'
    } else {
      for (const [id, user] of xUsers) {
        const item = document.createElement("label")
        item.className = "source-item"
        item.innerHTML = `
          <input type="checkbox" data-type="x" data-id="${id}" ${user.enabled ? "checked" : ""}>
          <span class="color-indicator" style="background-color: ${user.color}"></span>
          <span class="source-name">${user.name}</span>
        `
        xContainer.appendChild(item)
      }
    }
  }

  // ブログドメイン
  if (blogContainer) {
    blogContainer.innerHTML = ""
    const blogDomains = Object.entries(config.blog?.domains ?? {})

    if (blogDomains.length === 0) {
      blogContainer.innerHTML = '<p class="empty-message">ブログがありません</p>'
    } else {
      for (const [id, domain] of blogDomains) {
        const item = document.createElement("label")
        item.className = "source-item"
        item.innerHTML = `
          <input type="checkbox" data-type="blog" data-id="${id}" ${domain.enabled ? "checked" : ""}>
          <span class="color-indicator" style="background-color: ${domain.color}"></span>
          <span class="source-name">${domain.name}</span>
        `
        blogContainer.appendChild(item)
      }
    }
  }
}

// チェックボックスの変更を処理
async function handleCheckboxChange(e: Event): Promise<void> {
  const target = e.target as HTMLInputElement
  if (!target.matches('input[type="checkbox"]')) return

  const type = target.dataset.type
  const id = target.dataset.id
  const enabled = target.checked

  if (!type || !id) return

  // 設定を更新
  const config = await getSourceSettings()

  if (type === "youtube" && config.youtube.channels[id]) {
    config.youtube.channels[id].enabled = enabled
  } else if (type === "note" && config.note.authors[id]) {
    config.note.authors[id].enabled = enabled
  } else if (type === "x" && config.x?.users?.[id]) {
    config.x.users[id].enabled = enabled
  } else if (type === "blog" && config.blog?.domains?.[id]) {
    config.blog.domains[id].enabled = enabled
  }

  saveSettings(config)
  triggerGraphRedraw()
}

// パネルの表示/非表示を切り替え
function togglePanel(show: boolean): void {
  const panel = document.querySelector(".source-filter-panel")
  if (panel) {
    panel.setAttribute("aria-hidden", (!show).toString())
    if (show) {
      panel.classList.add("open")
    } else {
      panel.classList.remove("open")
    }
  }
}

// 初期化
document.addEventListener("nav", async () => {
  const button = document.querySelector(".source-filter-button")
  const closeButton = document.querySelector(".source-filter-close")
  const panel = document.querySelector(".source-filter-panel")

  if (!button || !panel) return

  // ソース設定を読み込んでリストを描画
  const config = await getSourceSettings()
  renderSourceList(config)

  // ボタンクリックでパネル表示
  button.addEventListener("click", (e) => {
    e.stopPropagation()
    const isOpen = panel.classList.contains("open")
    togglePanel(!isOpen)
  })

  // 閉じるボタン
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      togglePanel(false)
    })
  }

  // パネル外クリックで閉じる
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement
    if (!panel.contains(target) && !button.contains(target)) {
      togglePanel(false)
    }
  })

  // チェックボックスの変更を監視
  panel.addEventListener("change", handleCheckboxChange)
})

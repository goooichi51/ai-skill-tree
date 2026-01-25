# AI Skill Tree Map プロジェクト

## ビジョン
ビジネスパーソンがAIスキルを体系的に学べるインタラクティブなスキルマップ

---

## コンテンツ種別

### 1. スキルツリー記事 (`content/skill-tree/`)
- **対象**: 個別のAIツール・技術・概念
- **カテゴリ**:
  - `chat-ai/`: 対話型AI（ChatGPT, Claude等）
  - `generative-ai/`: 生成AI（画像、音声、動画）
  - `automation/`: 自動化ツール（n8n, Zapier等）
  - `development/`: 開発支援（Cursor, Copilot等）
  - `frontier/`: 先端技術（AIエージェント等）

### 2. 活用事例 (`content/use-cases/`)
- **対象**: 実際のビジネス課題とAI解決策
- **形式**: 課題 → 解決策 → 効果

---

## コンテンツソース

| ソース | 説明 | 追加方法 |
|--------|------|----------|
| YouTube | AIチュートリアル動画 | CLI: `--url "https://youtube.com/..."` |
| Note.com | AI解説記事 | CLI: `--url "https://note.com/..."` |
| 手動 | オリジナル解説 | 直接マークダウン作成 |

### CLI使用例
```bash
# YouTube動画を追加
npx tsx scripts/add-source.ts --url "https://www.youtube.com/watch?v=xxxxx" --category "chat-ai"

# Note.com記事を追加
npx tsx scripts/add-source.ts --url "https://note.com/user/n/xxxxx" --category "automation"
```

---

## 品質基準

- 実用的で具体的な内容
- 初心者にも分かりやすい説明
- 最新情報の維持

---

## マップ表示

### ノードの区分け
- **大項目（カテゴリ）**: 形で区別
- **中項目（ソース）**: 色で区別（YouTube/Note.comのチャンネル・著者ごと）

### スキルレベル（タグのみ）
マップ上では表示せず、タグで分類：
- `Lv1-入門`: AIを使い始める方向け
- `Lv2-実践`: AIを業務で活用したい方向け
- `Lv3-応用`: AIを自在に使いこなしたい方向け

---

## 技術スタック

- **フレームワーク**: Quartz 4（静的サイトジェネレーター）
- **グラフ可視化**: D3.js
- **デプロイ**: GitHub Pages
- **コンテンツ管理**: Markdown + フロントマター

---

## 開発コマンド

```bash
# 開発サーバー起動
npx quartz build --serve

# 本番ビルド
npx quartz build

# コンテンツ追加（YouTube/Note.com）
npx tsx scripts/add-source.ts --url "..." --category "..."
```

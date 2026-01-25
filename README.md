# AI Skill Tree Map

ビジネスパーソンのためのAIスキルツリーマップと活用事例集

## 概要

このサイトは、ビジネスシーンで活用できるAIスキルを体系的に学ぶためのインタラクティブなスキルマップです。
Quartzを使用して構築され、Obsidianで編集可能です。

## 機能

- **AIスキルツリー**: スキル同士の関連性を可視化したインタラクティブなグラフビュー
- **AI活用事例集**: 実際のビジネスシーンでの活用事例
- **双方向リンク**: Obsidianの`[[]]`記法をサポート

## ローカル開発

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npx quartz build --serve

# ビルドのみ
npx quartz build
```

## コンテンツの追加方法

### 新しいスキルノードを追加

1. `content/skill-tree/` に新しいMarkdownファイルを作成
2. フロントマターにタイトルとタグを設定
3. 関連するスキルへのリンクを `[[ファイル名]]` 形式で記述

### 新しい事例を追加

1. `content/use-cases/template-case.md` をコピー
2. テンプレートに沿って内容を記述
3. 関連スキルへのリンクを追加

## フォルダ構成

```
content/
├── index.md              # トップページ
├── skill-tree/           # AIスキルツリー
│   ├── index.md
│   ├── prompt-engineering.md
│   ├── chatgpt-basics.md
│   └── claude-basics.md
├── use-cases/            # 活用事例集
│   ├── index.md
│   ├── template-case.md
│   └── case-meeting-summary.md
└── tags/                 # タグ管理用
```

## デプロイ

mainブランチにpushすると、GitHub Actionsが自動でGitHub Pagesにデプロイします。

### 初回セットアップ

1. GitHubリポジトリの Settings > Pages を開く
2. Source を「GitHub Actions」に設定
3. `quartz.config.ts` の `baseUrl` を `your-username.github.io/AI_Skill_Map` に変更

## カスタマイズ

- **テーマカラー**: `quartz.config.ts` の `colors` セクション
- **レイアウト**: `quartz.layout.ts`
- **スタイル**: `quartz/styles/custom.scss`

## ライセンス

MIT License

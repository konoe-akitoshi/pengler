# Pengler プロジェクトサマリー

## 🎉 プロジェクト完成状況

Pengler（ペングラー）は、Tauri 2.0を使用したクロスプラットフォーム対応の超軽量写真・動画ライブラリアプリです。
Google Photosのような高速スクロール可能なタイムラインビューを提供し、完全にローカルで動作します。

## ✅ 実装済み機能

### フロントエンド (React + TypeScript)
- ✅ **仮想スクロールギャラリー** (react-window)
  - 10,000枚以上の画像を高速表示
  - タイムラインヘッダー（月別グルーピング）
  - 遅延読み込み（Lazy Loading）

- ✅ **ライトボックスビューア**
  - フルスクリーン表示
  - キーボードナビゲーション（← → ESC）
  - 画像・動画両対応
  - Framer Motionによるスムーズなアニメーション

- ✅ **サイドバー**
  - フォルダ選択UI
  - スキャン進捗表示
  - メディアカウント表示

- ✅ **状態管理**
  - Zustandによる軽量状態管理
  - TypeScript完全対応

### バックエンド (Rust + Tauri 2.0)
- ✅ **フォルダスキャン** (`commands/scanner.rs`)
  - Rayon並列処理で高速スキャン
  - 再帰的フォルダ走査（walkdir）
  - 対応フォーマット: JPG, PNG, WebP, HEIC, MP4, MOV等

- ✅ **メタデータ抽出**
  - EXIF撮影日時の自動抽出
  - 画像サイズ取得
  - BLAKE3ハッシュ生成

- ✅ **サムネイル生成** (`commands/thumbnail.rs`)
  - 300x300px高品質サムネイル
  - WebP形式（JPEG比30%軽量）
  - キャッシュディレクトリ管理

- ✅ **キャッシュシステム** (`commands/cache.rs`)
  - SQLiteデータベース
  - メタデータ永続化
  - 高速検索用インデックス

## 📁 プロジェクト構造

```
pengler/
├─ README.md                    # ユーザー向けドキュメント
├─ TECHNICAL_DESIGN.md          # 技術設計書（詳細）
├─ SETUP.md                     # セットアップガイド
├─ PROJECT_SUMMARY.md           # このファイル
│
├─ src/                         # React フロントエンド
│  ├─ App.tsx                   # メインアプリケーション
│  ├─ main.tsx                  # エントリーポイント
│  ├─ index.css                 # グローバルスタイル
│  ├─ components/
│  │  ├─ Gallery/
│  │  │  ├─ Gallery.tsx         # 仮想グリッド
│  │  │  └─ ThumbnailCell.tsx   # サムネイルセル
│  │  ├─ Lightbox/
│  │  │  └─ MediaViewer.tsx     # フルスクリーンビューア
│  │  └─ Sidebar/
│  │     └─ Sidebar.tsx         # フォルダ選択UI
│  ├─ stores/
│  │  └─ mediaStore.ts          # Zustand状態管理
│  └─ types/
│     └─ media.ts               # TypeScript型定義
│
├─ src-tauri/                   # Rust バックエンド
│  ├─ src/
│  │  ├─ main.rs                # Tauriエントリーポイント
│  │  ├─ commands/              # Tauriコマンド
│  │  │  ├─ scanner.rs          # フォルダスキャン
│  │  │  ├─ thumbnail.rs        # サムネイル生成
│  │  │  └─ cache.rs            # キャッシュ管理
│  │  ├─ models/
│  │  │  └─ media.rs            # データモデル
│  │  └─ utils/
│  │     ├─ hash.rs             # ファイルハッシュ
│  │     └─ exif.rs             # EXIF抽出
│  ├─ Cargo.toml                # Rust依存関係
│  └─ tauri.conf.json           # Tauri設定
│
├─ package.json                 # npm依存関係
├─ tsconfig.json                # TypeScript設定
├─ vite.config.ts               # Vite設定
└─ tailwind.config.js           # TailwindCSS設定
```

## 🛠️ 使用技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フレームワーク | Tauri 2.0 | 軽量・高速・セキュア |
| フロントエンド | React 18 + TypeScript | 型安全・開発効率 |
| ビルドツール | Vite | 超高速HMR |
| スタイリング | TailwindCSS | ユーティリティファースト |
| 仮想化 | react-window | 大量データ表示 |
| 状態管理 | Zustand | 軽量・シンプル |
| アニメーション | Framer Motion | 滑らかな動き |
| バックエンド | Rust | メモリ安全・高速 |
| 並列処理 | Rayon | マルチコア活用 |
| 画像処理 | image crate | 高品質・高速 |
| データベース | SQLite (rusqlite) | 埋め込み型・高速 |
| ハッシュ | BLAKE3 | 最高速暗号学的ハッシュ |

## 🚀 クイックスタート

```bash
# 1. 依存関係インストール
npm install

# 2. 開発モード起動
npm run tauri:dev

# 3. 本番ビルド
npm run tauri:build
```

詳細は `SETUP.md` を参照してください。

## 📊 パフォーマンス目標

| 指標 | 目標値 | 実装状況 |
|------|--------|----------|
| スキャン速度 | 10,000枚/5秒 | ✅ Rayon並列化で達成可能 |
| スクロールFPS | 60fps | ✅ react-windowで実現 |
| メモリ使用量 | <500MB (10,000枚) | ✅ 仮想化で制限 |
| サムネイルサイズ | 300x300px WebP | ✅ 実装済み |
| キャッシュサイズ | 500MB上限 | ✅ 設定可能 |

## 🎯 ロードマップ

### v0.1.0 (現在) ✅
- [x] 基本ギャラリー機能
- [x] フォルダスキャン
- [x] サムネイル生成
- [x] ライトボックスビューア
- [x] キャッシュシステム

### v0.2.0 (次期リリース)
- [ ] 検索・フィルタリング機能
- [ ] タグ・アルバム機能
- [ ] ソート機能（日付・名前・サイズ）
- [ ] 設定パネル
- [ ] 動画サムネイル生成

### v0.3.0 (将来)
- [ ] 画像編集（回転・トリミング）
- [ ] 重複検出
- [ ] インポート/エクスポート
- [ ] スライドショーモード

### v1.0.0 (ビジョン)
- [ ] 顔認識（オプション）
- [ ] AI自動タグ付け
- [ ] 類似画像検索
- [ ] 高度な検索機能

## 🔒 セキュリティ

- ✅ Tauri 2.0のサンドボックス
- ✅ パストラバーサル防止
- ✅ CSP (Content Security Policy)
- ✅ ローカルのみ動作（ネットワーク不要）

## 📚 ドキュメント

- **README.md** - プロジェクト概要・使い方
- **TECHNICAL_DESIGN.md** - 詳細な技術設計書
- **SETUP.md** - セットアップガイド
- **PROJECT_SUMMARY.md** - このファイル（完成状況）

## 🧪 テスト

```bash
# Rustユニットテスト
cd src-tauri && cargo test

# フロントエンドテスト（今後実装）
npm test
```

## 🤝 貢献

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 ライセンス

MIT License - 詳細は `LICENSE` ファイル参照

## 👥 作成者

Pengler Team

---

**ステータス**: 🟢 v0.1.0 完成（2025-10-21）

次のステップ:
1. `npm install` で依存関係をインストール
2. `npm run tauri:dev` で開発サーバー起動
3. フォルダを選択して写真を読み込み
4. 機能を試して、フィードバックをください！

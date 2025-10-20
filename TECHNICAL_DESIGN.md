# Pengler - 技術設計書

## 📋 プロジェクト概要

**Pengler（ペングラー）**は、Tauri 2.0を使用したクロスプラットフォーム対応の超軽量写真・動画ライブラリアプリです。
Google Photosのような高速スクロール可能なタイムラインビューを提供しながら、完全にローカルで動作します。

## 🎯 設計目標

1. **超軽量・高速**: 数千〜数万枚の画像でもスムーズに閲覧可能
2. **ローカルファースト**: クラウド同期不要、プライバシー重視
3. **クロスプラットフォーム**: Windows / macOS / Linux対応
4. **直感的UX**: Google Photos風のタイムラインUI

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────┐
│         Frontend (React + Vite)         │
│  ┌──────────────────────────────────┐   │
│  │  Virtual Grid (react-window)     │   │
│  │  - Lazy Loading                  │   │
│  │  - Timeline Headers              │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  State Management (Zustand)      │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ↕ IPC (Tauri Commands)
┌─────────────────────────────────────────┐
│       Backend (Rust + Tauri 2.0)        │
│  ┌──────────────────────────────────┐   │
│  │  File Scanner (walkdir)          │   │
│  │  - Recursive folder scanning     │   │
│  │  - EXIF metadata extraction      │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  Thumbnail Generator (image)     │   │
│  │  - Multi-threaded processing     │   │
│  │  - WebP compression              │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  Cache Manager (SQLite)          │   │
│  │  - Metadata storage              │   │
│  │  - Cache indexing                │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│          File System & Cache            │
│  ~/Pictures/                            │
│  ~/.pengler/                            │
│    ├─ cache/                            │
│    │   └─ thumbnails/                   │
│    └─ pengler.db (SQLite)               │
└─────────────────────────────────────────┘
```

## 📦 技術スタック

### フロントエンド
- **フレームワーク**: React 18 + TypeScript
- **ビルドツール**: Vite
- **UI Components**:
  - `react-window`: 仮想スクロール（10,000+アイテムを高速表示）
  - `framer-motion`: スムーズなアニメーション
  - `react-image-lightbox`: 詳細ビュー
- **状態管理**: Zustand（軽量で高速）
- **日付処理**: dayjs
- **スタイリング**: TailwindCSS

### バックエンド
- **コアフレームワーク**: Tauri 2.0
- **言語**: Rust 1.70+
- **主要Crates**:
  ```toml
  walkdir = "2.4"          # フォルダ再帰スキャン
  image = "0.24"           # 画像処理・サムネイル生成
  webp = "0.2"             # WebP圧縮（高効率）
  kamadak-exif = "0.5"     # EXIF メタデータ抽出
  rayon = "1.8"            # 並列処理
  serde = { version = "1.0", features = ["derive"] }
  serde_json = "1.0"
  rusqlite = "0.30"        # SQLite データベース
  chrono = "0.4"           # 日付処理
  blake3 = "1.5"           # 高速ハッシュ（キャッシュキー生成）
  ```

### ストレージ
- **メタデータDB**: SQLite（軽量・高速・埋め込み可能）
- **サムネイルキャッシュ**: ファイルシステム（WebPフォーマット）

## 🔧 主要機能の実装詳細

### 1. フォルダスキャン（Rust）

```rust
// 並列スキャンで高速化
pub fn scan_folder(path: &Path) -> Result<Vec<MediaFile>> {
    WalkDir::new(path)
        .into_iter()
        .par_bridge()  // Rayon並列処理
        .filter_map(|entry| {
            let entry = entry.ok()?;
            if is_media_file(&entry) {
                Some(extract_metadata(&entry))
            } else {
                None
            }
        })
        .collect()
}
```

**対応フォーマット**:
- 画像: JPEG, PNG, WebP, HEIC, GIF
- 動画: MP4, MOV, AVI, MKV

### 2. サムネイル生成（Rust）

**仕様**:
- サイズ: 300x300px（アスペクト比維持）
- フォーマット: WebP（JPEG比30%軽量）
- 品質: 85%（視覚的劣化なし）
- 保存先: `~/.pengler/cache/thumbnails/{hash}.webp`

```rust
pub fn generate_thumbnail(source: &Path, size: u32) -> Result<Vec<u8>> {
    let img = image::open(source)?;
    let thumbnail = img.resize(size, size, FilterType::Lanczos3);

    // WebPエンコード
    let encoder = webp::Encoder::from_image(&thumbnail)?;
    Ok(encoder.encode(85.0).to_vec())
}
```

### 3. キャッシュ管理（SQLite）

**スキーマ**:
```sql
CREATE TABLE media_files (
    id INTEGER PRIMARY KEY,
    file_path TEXT UNIQUE NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    taken_at DATETIME,
    modified_at DATETIME,
    thumbnail_path TEXT,
    media_type TEXT,  -- 'image' or 'video'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_taken_at ON media_files(taken_at);
CREATE INDEX idx_file_hash ON media_files(file_hash);
```

**キャッシュ戦略**:
- ファイルハッシュで重複検出
- 最大キャッシュサイズ: 500MB（設定可能）
- LRU（Least Recently Used）で古いキャッシュを削除

### 4. 仮想スクロール（React）

```tsx
import { FixedSizeGrid } from 'react-window';

function Gallery({ items }: { items: MediaFile[] }) {
  const COLUMN_COUNT = 5;
  const ITEM_SIZE = 200;

  return (
    <FixedSizeGrid
      columnCount={COLUMN_COUNT}
      columnWidth={ITEM_SIZE}
      height={window.innerHeight}
      rowCount={Math.ceil(items.length / COLUMN_COUNT)}
      rowHeight={ITEM_SIZE}
      width={window.innerWidth}
    >
      {({ columnIndex, rowIndex, style }) => (
        <ThumbnailCell
          item={items[rowIndex * COLUMN_COUNT + columnIndex]}
          style={style}
        />
      )}
    </FixedSizeGrid>
  );
}
```

### 5. タイムラインヘッダー

Google Photos風の日付セクション:
```
┌───────────────────────────────┐
│ 2024年10月                    │ ← Sticky Header
├───────────────────────────────┤
│ [img] [img] [img] [img] [img] │
│ [img] [img] [img] [img] [img] │
├───────────────────────────────┤
│ 2024年9月                     │
├───────────────────────────────┤
│ [img] [img] [img] [img] [img] │
└───────────────────────────────┘
```

## 🚀 パフォーマンス最適化

### バックエンド
- **並列処理**: Rayonで全コア活用
- **インクリメンタルスキャン**: 変更ファイルのみ再処理
- **ストリーミングレスポンス**: 大量データを分割送信

### フロントエンド
- **仮想化**: react-windowで描画を最小限に
- **遅延読み込み**: Intersection Observerでビューポート内のみ読み込み
- **メモ化**: React.memo + useMemo で再レンダリング抑制
- **Web Workers**: 大量データのソート・フィルタリング

### 目標値
- 10,000枚の画像を5秒以内でスキャン
- スクロール時60fps維持
- メモリ使用量: 500MB以下（10,000枚表示時）

## 📂 プロジェクト構成

```
pengler/
├─ src-tauri/              # Rustバックエンド
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ commands/         # Tauri Commands
│  │  │  ├─ mod.rs
│  │  │  ├─ scanner.rs
│  │  │  ├─ thumbnail.rs
│  │  │  └─ cache.rs
│  │  ├─ models/           # データ構造
│  │  │  ├─ mod.rs
│  │  │  └─ media.rs
│  │  └─ utils/
│  │     ├─ mod.rs
│  │     ├─ hash.rs
│  │     └─ exif.rs
│  ├─ Cargo.toml
│  └─ tauri.conf.json
│
├─ src/                    # Reactフロントエンド
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ components/
│  │  ├─ Gallery/
│  │  │  ├─ Gallery.tsx
│  │  │  ├─ ThumbnailGrid.tsx
│  │  │  └─ TimelineHeader.tsx
│  │  ├─ Lightbox/
│  │  │  └─ MediaViewer.tsx
│  │  └─ Sidebar/
│  │     └─ FolderSelector.tsx
│  ├─ stores/
│  │  └─ mediaStore.ts    # Zustand store
│  ├─ hooks/
│  │  └─ useMediaLibrary.ts
│  └─ types/
│     └─ media.ts
│
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ tailwind.config.js
```

## 🔐 セキュリティ考慮事項

1. **パストラバーサル防止**: Tauri APIで安全なファイルアクセス
2. **サンドボックス**: Tauri 2.0のセキュリティモデル活用
3. **CSP（Content Security Policy）**: XSS攻撃対策
4. **ローカルデータのみ**: ネットワークアクセス不要

## 🧪 テスト戦略

### ユニットテスト
- Rust: `cargo test`
- React: Vitest + React Testing Library

### パフォーマンステスト
- 10,000枚画像での読み込み時間計測
- メモリプロファイリング（Chromium DevTools）

### クロスプラットフォームテスト
- Windows 10/11
- macOS 12+
- Ubuntu 22.04+

## 📈 拡張可能性

### フェーズ2（将来実装）
- タグ・アルバム機能
- 簡易編集機能（回転・トリミング）
- スライドショーモード
- 重複検出（パーセプチュアルハッシュ）

### フェーズ3（AI機能）
- 顔認識
- 自動タグ付け
- 類似画像検索

## 🎨 UI/UXガイドライン

- **ダークモード対応**: システム設定に追従
- **キーボードショートカット**:
  - `→/←`: 次/前の画像
  - `ESC`: 詳細ビューを閉じる
  - `Ctrl+F`: 検索
- **アクセシビリティ**: ARIA属性、キーボードナビゲーション

## 📝 ライセンス

MIT License（プロジェクトルートのLICENSE参照）

---

**作成日**: 2025-10-21
**バージョン**: 1.0.0

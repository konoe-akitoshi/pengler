# Setup Guide - Pengler

このガイドでは、Penglerを開発環境で動かすための詳細な手順を説明します。

## 📋 必要な環境

### 1. Node.js と npm

Node.js 18以降が必要です。

```bash
# バージョン確認
node --version  # v18.0.0 以上
npm --version   # 9.0.0 以上
```

インストール方法:
- [Node.js公式サイト](https://nodejs.org/)からダウンロード
- または、[nvm](https://github.com/nvm-sh/nvm)を使用して管理

### 2. Rust

Rust 1.70以降が必要です。

```bash
# インストール (Linux/macOS)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# インストール (Windows)
# https://rustup.rs/ からインストーラーをダウンロード

# バージョン確認
rustc --version  # 1.70.0 以上
cargo --version  # 1.70.0 以上
```

### 3. プラットフォーム別の依存関係

#### Windows
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- WebView2 (Windows 10/11には標準搭載)

#### macOS
```bash
xcode-select --install
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

#### Linux (Fedora)
```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

#### Linux (Arch)
```bash
sudo pacman -Syu
sudo pacman -S \
  webkit2gtk \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  gtk3 \
  libappindicator-gtk3 \
  librsvg
```

## 🚀 セットアップ手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourusername/pengler.git
cd pengler
```

### 2. 依存関係のインストール

```bash
# npm パッケージをインストール
npm install

# Rust の依存関係は自動的にダウンロードされます
```

### 3. 開発サーバーの起動

```bash
# 開発モードで起動
npm run tauri:dev
```

初回起動時は、Rustのコンパイルに数分かかることがあります。

### 4. ビルド（本番用）

```bash
# 最適化ビルド
npm run tauri:build
```

ビルド成果物は以下のディレクトリに生成されます:
- Windows: `src-tauri/target/release/pengler.exe`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/` または `appimage/`

## 🧪 動作確認

### 1. アプリケーション起動

```bash
npm run tauri:dev
```

### 2. フォルダ選択

- サイドバーの「Select Folder」ボタンをクリック
- 写真が含まれるフォルダを選択

### 3. 機能テスト

- ✅ ギャラリービューで写真がグリッド表示される
- ✅ スクロールが滑らかに動作する
- ✅ 写真をクリックするとライトボックスが開く
- ✅ 矢印キー（← →）で写真を切り替え
- ✅ ESCキーでライトボックスが閉じる

## 🔧 トラブルシューティング

### エラー: "webkit2gtk not found"

Linux環境でWebKitが見つからない場合:

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel
```

### エラー: "failed to run custom build command for openssl-sys"

OpenSSL開発ライブラリが不足している場合:

```bash
# Ubuntu/Debian
sudo apt install libssl-dev pkg-config

# macOS
brew install openssl
```

### エラー: "Cannot find module '@tauri-apps/api'"

npm依存関係のインストールが不完全な場合:

```bash
rm -rf node_modules package-lock.json
npm install
```

### パフォーマンスが遅い

デバッグビルドは最適化されていないため遅い場合があります:

```bash
# リリースビルドで確認
npm run tauri:build
# ビルドされたバイナリを直接実行
```

## 📊 開発ツール

### Rust側のログ出力

```bash
# 詳細ログを有効化
RUST_LOG=debug npm run tauri:dev

# 特定モジュールのみ
RUST_LOG=pengler=debug npm run tauri:dev
```

### ブラウザDevTools

開発モード中は、Ctrl+Shift+I（Windows/Linux）またはCmd+Option+I（macOS）でDevToolsが開けます。

### ホットリロード

- フロントエンド（React）: 自動的にリロード
- バックエンド（Rust）: 自動的に再コンパイル＆再起動

## 🎯 次のステップ

1. **コードを理解する**: `TECHNICAL_DESIGN.md`を読む
2. **機能追加**: 新機能を実装してみる
3. **貢献**: プルリクエストを送る

## 📚 参考リンク

- [Tauri 2.0 Documentation](https://v2.tauri.app/)
- [React Documentation](https://react.dev/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [react-window](https://github.com/bvaughn/react-window)

---

問題が解決しない場合は、[GitHub Issues](https://github.com/yourusername/pengler/issues)で報告してください。

# Pengler 📷

**Ultra-lightweight cross-platform photo and video library** built with Tauri 2.0

Pengler is a fast, local-first media library application that provides Google Photos-like timeline browsing experience without cloud sync. Browse thousands of photos with smooth virtual scrolling, automatic thumbnail generation, and EXIF metadata extraction.

## ✨ Features

- **Lightning Fast**: Virtual scrolling handles 10,000+ photos smoothly
- **Timeline View**: Google Photos-style chronological browsing with month headers
- **Local First**: No cloud sync, complete privacy, your data stays on your device
- **Smart Caching**: Automatic WebP thumbnail generation with intelligent cache management
- **EXIF Support**: Automatic date extraction from photo metadata
- **Lightbox Viewer**: Full-screen media viewer with keyboard navigation
- **Cross-Platform**: Windows, macOS, and Linux support

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+
- **Development Tools**:
  - Windows: Microsoft C++ Build Tools
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/pengler.git
   cd pengler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri:dev
   ```

4. Build for production:
   ```bash
   npm run tauri:build
   ```

## 📖 Usage

1. **Launch Pengler** - Open the application
2. **Select Folder** - Click "Select Folder" in the sidebar and choose your photo directory
3. **Browse** - Photos are automatically organized by date with smooth scrolling
4. **View Details** - Click any photo to open full-screen viewer
5. **Navigate** - Use arrow keys (← →) to browse through photos

### Keyboard Shortcuts

- `→` / `←` - Navigate next/previous photo in lightbox
- `ESC` - Close lightbox viewer
- `Ctrl+F` - Search (coming soon)

## 🏗️ Architecture

```
Frontend (React + Vite)
  ├─ Virtual Grid (react-window)
  ├─ State Management (Zustand)
  └─ Framer Motion animations

Backend (Rust + Tauri 2.0)
  ├─ Parallel file scanning (Rayon)
  ├─ Thumbnail generation (image + WebP)
  ├─ EXIF metadata extraction
  └─ SQLite cache management

Cache Storage
  └─ ~/.pengler/
      ├─ cache/thumbnails/ (WebP files)
      └─ pengler.db (SQLite metadata)
```

## 🛠️ Technology Stack

### Frontend
- **React 18** + TypeScript
- **Vite** - Lightning fast HMR
- **TailwindCSS** - Utility-first styling
- **react-window** - Virtual scrolling for performance
- **Zustand** - Lightweight state management
- **Framer Motion** - Smooth animations

### Backend
- **Tauri 2.0** - Secure desktop framework
- **Rust** - Memory-safe systems programming
- **SQLite** - Embedded database
- **Rayon** - Data parallelism
- **image crate** - Image processing
- **BLAKE3** - Fast cryptographic hashing

## 📦 Project Structure

```
pengler/
├─ src/                    # React frontend
│  ├─ components/
│  │  ├─ Gallery/          # Virtual grid gallery
│  │  ├─ Lightbox/         # Full-screen viewer
│  │  └─ Sidebar/          # Folder selector
│  ├─ stores/              # Zustand state
│  └─ types/               # TypeScript types
│
├─ src-tauri/              # Rust backend
│  ├─ src/
│  │  ├─ commands/         # Tauri commands
│  │  │  ├─ scanner.rs     # Folder scanning
│  │  │  ├─ thumbnail.rs   # Thumbnail generation
│  │  │  └─ cache.rs       # Cache management
│  │  ├─ models/           # Data models
│  │  └─ utils/            # Helper functions
│  └─ Cargo.toml
│
├─ TECHNICAL_DESIGN.md     # Technical documentation
└─ package.json
```

## 🔧 Configuration

### Cache Settings

Default cache location: `~/.pengler/cache/`

- **Max cache size**: 500MB (configurable)
- **Thumbnail size**: 300x300px
- **Format**: WebP (85% quality)

To clear cache:
```bash
# Cache management UI coming soon
# For now, manually delete: ~/.pengler/cache/thumbnails/
```

## 🎯 Roadmap

### v0.2.0 (Next Release)
- [ ] Search and filtering
- [ ] Tags and albums
- [ ] Sorting options (date, name, size)
- [ ] Settings panel
- [ ] Video thumbnail generation

### v0.3.0 (Future)
- [ ] Basic image editing (rotate, crop)
- [ ] Duplicate detection
- [ ] Import/export functionality
- [ ] Slideshow mode

### v1.0.0 (Vision)
- [ ] Face recognition (optional)
- [ ] AI auto-tagging
- [ ] Similar photo detection
- [ ] Advanced search

## 🧪 Development

### Run tests
```bash
# Rust tests
cd src-tauri && cargo test

# Frontend tests (coming soon)
npm test
```

### Debug build
```bash
# Enable Rust debug logs
RUST_LOG=debug npm run tauri:dev
```

### Performance profiling
```bash
# Enable performance monitoring
npm run tauri:dev -- --features profiling
```

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Secure desktop framework
- [React](https://react.dev/) - UI library
- [image-rs](https://github.com/image-rs/image) - Image processing
- [react-window](https://github.com/bvaughn/react-window) - Virtual scrolling

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/pengler/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/pengler/discussions)

---

Made with ❤️ by the Pengler team
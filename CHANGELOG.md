# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial open-source release preparation

## [1.0.12] - 2026-07-07

### 🎉 Major Release: Open Source & NPM Publishing

#### ✨ New Features
- **Canvas Rendering Engine**: High-performance Canvas 2D API-based rendering with GPU acceleration
- **Tile-Based Architecture**: Virtual scrolling supporting 100K+ rows with smooth 60 FPS performance
- **Formula Engine**: Excel-compatible formula parser and evaluator with 50+ built-in functions
- **Plugin System**: Extensible architecture with 20+ built-in plugins (Freeze, Sort, AutoFill, etc.)
- **Type System**: 6 base types + 5 renderer types with custom type registration support
- **Hooks System**: 67 lifecycle hooks for comprehensive event interception and customization
- **Web Components UI**: Modern Custom Elements based user interface components
- **Data Validation**: Rule-based validation engine with multiple validator types
- **Conditional Formatting**: Dynamic styling based on cell values and conditions
- **Merge Cells**: Full support for merging and unmerging cells across rows/columns
- **Multi-Sheet Management**: Create, rename, delete, and switch between worksheets
- **Export Functionality**: CSV and Excel format export capabilities
- **Keyboard Shortcuts**: Comprehensive keyboard navigation and shortcut system
- **Touch Support**: Mobile-friendly touch interactions for tablets and smartphones

#### 🔧 Improvements
- **Performance Optimizations**:
  - ChunkedCellStore for efficient memory management
  - Tile caching mechanism for faster scrolling
  - Lazy evaluation for formulas to reduce unnecessary calculations
  - Object pooling for cell instances to minimize GC pressure
  
- **Developer Experience**:
  - Complete JSDoc documentation coverage
  - Vitest testing framework integration with coverage reporting
  - ESLint + Prettier code quality tooling
  - Husky Git hooks for automated checks
  - Webpack 5 build optimization (ESM + UMD dual output)
  
- **API Enhancements**:
  - Unified public API through `src/api/index.js`
  - Backward-compatible function aliases
  - Type-safe constants (FUNCTION_CATEGORY enum)
  - Comprehensive error handling system

#### 📝 Documentation
- Complete README.md with installation guide, API reference, and examples
- Hooks lifecycle documentation with 67 hooks detailed table
- Architecture diagrams (system overview + rendering pipeline)
- Performance benchmarking data
- Comparison with Handsontable
- Contribution guidelines and code of conduct

#### 🛡️ Security & Compliance
- Apache License 2.0 adoption
- URL whitelist validation for hyperlink safety
- Input sanitization for formula parsing
- XSS prevention in cell rendering

### 📦 Package Metadata
- **Package Name**: `@canvas-sheet/core`
- **Registry**: [npmjs.com](https://www.npmjs.com/package/@canvas-sheet/core)
- **License**: Apache-2.0
- **Repository**: https://github.com/jiangsuiting/canvas-implementation-in-excel
- **Author**: jiangsuiting <1158973435@qq.com>

### 🚀 Installation

```bash
# NPM (recommended)
npm install @canvas-sheet/core

# Yarn
yarn add @canvas-sheet/core

# PNPM
pnpm add @canvas-sheet/core
```

### 💻 Quick Start

```javascript
import { Workbook } from '@canvas-sheet/core';

const container = document.getElementById('app');
const workbook = new Workbook(container, {
    startRows: 10000,
    startCols: 26,
    enableFormulas: true,
    defaultStyle: {
        fontSize: 14,
        fontFamily: 'Arial'
    }
});

workbook.setCellValue(0, 0, 'Hello World!');
workbook.setCellValue(1, 0, '=SUM(A1:A100)');
```

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.12 | 2026-07-07 | Open source release with full feature set |
| 1.0.11 | 2026-07-06 | Performance optimizations + bug fixes |
| 1.0.10 | 2026-07-05 | Plugin system enhancement |
| 1.0.9 | 2026-07-04 | Formula engine improvements |
| 1.0.8 | 2026-07-03 | Chart plugin initial version |
| 1.0.7 | 2026-07-02 | Data validation system |
| 1.0.6 | 2026-07-01 | Conditional formatting |
| 1.0.5 | 2026-06-30 | Merge cells support |
| 1.0.4 | 2026-06-29 | Freeze pane plugin |
| 1.0.3 | 2026-06-28 | Sort plugin implementation |
| 1.0.2 | 2026-06-27 | Auto-fill pattern recognition |
| 1.0.1 | 2026-06-26 | Copy/paste functionality |
| 1.0.0 | 2026-06-25 | Initial release |

---

## Migration Guides

### From v1.0.x to v1.0.12 (Open Source Edition)

No breaking changes. This is a maintenance release with:

- ✅ New documentation and examples
- ✅ Improved package metadata for npm publishing
- ✅ Enhanced keywords for better discoverability
- ✅ Standardized license (Apache-2.0)

Simply update:

```bash
npm update @canvas-sheet/core
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup instructions.

## Support

- **Issues**: [GitHub Issues](https://github.com/jiangsuiting/canvas-implementation-in-excel/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jiangsuiting/canvas-implementation-in-excel/discussions)
- **Email**: 1158973435@qq.com

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

[Unreleased]: https://github.com/jiangsuiting/canvas-implementation-in-excel/compare/v1.0.12...HEAD
[1.0.12]: https://github.com/jiangsuiting/canvas-implementation-in-excel/releases/tag/v1.0.12
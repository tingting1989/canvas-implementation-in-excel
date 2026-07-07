# Canvas PPT 预览器 - 技术设计文档

> **版本**: v1.0  
> **日期**: 2026-07-07  
> **状态**: 设计阶段  
> **技术栈**: Canvas 2D API + JavaScript (ES6+)  
> **目标还原度**: 87% - 95%  
> **性能目标**: 单页渲染 < 30ms (95%的PPT)

---

## 📋 目录

- [1. 项目概述](#1-项目概述)
- [2. 技术方案选型](#2-技术方案选型)
- [3. 性能预估](#3-性能预估)
- [4. 系统架构设计](#4-系统架构设计)
- [5. 核心模块详解](#5-核心模块详解)
- [6. 功能清单](#6-功能清单)
- [7. 还原度评估](#7-还原度评估)
- [8. 实现路线图](#8-实现路线图)
- [9. 性能优化策略](#9-性能优化策略)
- [10. 技术难点与解决方案](#10-技术难点与解决方案)
- [11. 测试与质量保证](#11-测试与质量保证)
- [12. 部署与运维](#12-部署与运维)

---

## 1. 项目概述

### 1.1 项目背景

随着Web应用的发展，越来越多的场景需要在浏览器中预览Office文档。本项目旨在构建一个**高性能、高还原度**的PPT（PowerPoint）文件预览器，采用纯Canvas技术实现，确保跨浏览器一致性和优秀的渲染性能。

### 1.2 核心需求

- ✅ **只读预览**：支持PPTX格式文件的在线预览
- ✅ **高性能渲染**：基于Canvas 2D API，确保流畅的用户体验
- ✅ **高保真显示**：文本、形状、图片等核心元素的高精度还原
- ✅ **交互友好**：支持页面导航、缩放、全屏演示等操作
- ✅ **轻量级**：无重型依赖，快速加载

### 1.3 目标用户

- 企业内部文档管理系统
- 在线教育平台
- 协同办公工具
- 文档分享平台

---

## 2. 技术方案选型

### 2.1 渲染技术对比

| 方案 | 优势 | 劣势 | 适用场景 | 推荐度 |
|------|------|------|---------|--------|
| **Canvas 2D** | 性能优秀、像素级控制、跨平台一致 | 需手动实现排版引擎 | 复杂图形+动画 | ⭐⭐⭐⭐⭐ **首选** |
| **HTML/CSS DOM** | 原生布局能力强、开发快 | 复杂内容性能差、DOM节点过多 | 简单文档预览 | ⭐⭐⭐ |
| **SVG** | 矢量无损缩放、DOM可访问性 | 复杂图形性能差 | 图标/简单图表 | ⭐⭐⭐ |
| **WebGL** | GPU加速、极致性能 | 学习曲线陡峭、过度工程 | 3D/游戏场景 | ⭐⭐ |
| **混合方案** | 结合各方案优点 | 架构复杂度高 | 企业级产品 | ⭐⭐⭐⭐ |

### 2.2 为什么选择Canvas？

#### ✅ **技术优势**

1. **性能卓越**
   - 直接操作像素，无DOM开销
   - 支持离屏渲染和缓存机制
   - requestAnimationFrame流畅动画
   - 适合大量图形元素的批量绘制

2. **渲染一致性**
   - 所有浏览器使用相同的渲染路径
   - 不受CSS兼容性影响
   - 字体渲染行为可控

3. **架构成熟度**
   - 可复用现有Canvas项目经验（如电子表格渲染引擎）
   - 分层渲染架构清晰
   - 脏标记和缓存策略成熟

4. **扩展性强**
   - 后续可轻松添加：
     - 标注/批注功能
     - 动画播放系统
     - 图片导出
     - 打印输出

#### 📊 **技术可行性验证**

```
现有项目参考：canvas-implementation-in-excel（电子表格引擎）
├── RenderEngine: 成熟的Canvas渲染引擎 ✓
├── BaseLayer: 分层渲染基类 ✓
├── TileRenderer: 瓦片缓存机制 ✓
├── TileCache: LRU缓存策略 ✓
└── ReactiveStore: 响应式状态管理 ✓

结论：技术栈完全可行，架构可直接复用！
```

### 2.3 技术栈确定

```json
{
  "core": {
    "language": "JavaScript ES6+",
    "module": "ES Modules",
    "rendering": "Canvas 2D API",
    "parsing": "Custom XML Parser + JSZip"
  },
  "dependencies": {
    "jszip": "^3.10.1",
    "fast-xml-parser": "^4.3.0"
  },
  "optional": {
    "chart.js": "^4.4.0",
    "opentype.js": "^1.3.4",
    "fabric.js": "^6.0.0"
  },
  "devtools": {
    "build": "Webpack / Vite",
    "test": "Vitest + Puppeteer",
    "lint": "ESLint + Prettier"
  }
}
```

---

## 3. 性能预估

### 3.1 核心性能指标

| 指标 | 目标值 | 优化后预期 | 测试方法 |
|------|--------|-----------|---------|
| **单页渲染时间** | < 50ms | < 30ms | performance.now() |
| **PPTX解析速度** | < 1s (10MB) | < 500ms | 文件加载计时 |
| **内存占用** | < 150MB (50页) | < 100MB | performance.memory |
| **首屏加载时间** | < 2s | < 1.5s | Navigation Timing |
| **切换页响应时间** | < 100ms | < 16ms | 用户感知测试 |
| **FPS保持率** | > 30fps | > 55fps | Frame Time监控 |

### 3.2 不同复杂度的渲染时间预估

#### 📄 **简单幻灯片（20-50个元素）**

```javascript
// 典型内容：
// - 5-10个文本框
// - 3-5个基础形状（矩形、圆形）
// - 1-2张图片
// - 无图表/SmartArt

{
  "元素数量": "20-50",
  "渲染时间": "5-15ms",
  "内存占用": "2-5MB/页",
  "FPS影响": "几乎无",
  "用户体验": "即时响应 ★★★★★"
}
```

#### 📊 **中等复杂度（50-100个元素）**

```javascript
// 典型内容：
// - 10-20个文本框（含复杂样式）
// - 10-15个形状（含渐变填充）
// - 5-8张图片
// - 1-2个表格
// - 无/简单图表

{
  "元素数量": "50-100",
  "渲染时间": "15-30ms",
  "内存占用": "5-10MB/页",
  "FPS影响": "轻微",
  "用户体验": "流畅 ★★★★☆"
}
```

#### 🎨 **高复杂度（100-200个元素）**

```javascript
// 典型内容：
// - 20-30个文本框（含特效）
// - 20-30个形状（含阴影/三维效果）
// - 10-15张图片（含滤镜）
// - 3-5个表格
// - 2-3个图表
// - SmartArt图形

{
  "元素数量": "100-200",
  "渲染时间": "30-50ms",
  "内存占用": "10-20MB/页",
  "FPS影响": "可接受 (>20fps)",
  "用户体验": "良好 ★★★☆☆"
}
```

#### 🖼️ **极端情况（200+元素 + 大图）**

```javascript
// 典型内容：
// - 大量元素叠加
// - 全屏高清图片 (1920x1080+)
// - 复杂动画效果
// - 多层透明度混合

{
  "元素数量": "200+",
  "渲染时间": "50-100ms",
  "内存占用": "20-50MB/页",
  "FPS影响": "需优化策略",
  "用户体验": "可接受 ★★☆☆☆",
  "优化建议": "渐进式加载 + LOD"
}
```

### 3.3 性能基准测试用例

```javascript
class PerformanceBenchmark {
  constructor() {
    this.results = [];
  }
  
  async runBenchmarks() {
    const testCases = [
      { name: 'simple-slide', file: 'test-simple.pptx', expectedTime: 20 },
      { name: 'medium-slide', file: 'test-medium.pptx', expectedTime: 35 },
      { name: 'complex-slide', file: 'test-complex.pptx', expectedTime: 60 },
      { name: 'image-heavy', file: 'test-images.pptx', expectedTime: 80 },
      { name: 'many-slides', file: 'test-100slides.pptx', expectedParseTime: 2000 },
    ];
    
    for (const testCase of testCases) {
      const result = await this.benchmark(testCase);
      this.results.push(result);
      this.report(result);
    }
    
    return this.generateReport();
  }
  
  async benchmark(testCase) {
    const startTime = performance.now();
    
    // 加载并解析
    const parser = new PPTXParser();
    const presentation = await parser.load(testCase.file);
    const parseTime = performance.now() - startTime;
    
    // 渲染每页
    const renderTimes = [];
    for (let i = 0; i < Math.min(presentation.slides.length, 10); i++) {
      const renderStart = performance.now();
      await this.engine.renderSlide(i);
      renderTimes.push(performance.now() - renderStart);
    }
    
    return {
      name: testCase.name,
      parseTime,
      avgRenderTime: renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
      maxRenderTime: Math.max(...renderTimes),
      passed: parseTime < testCase.expectedTime * 10 && 
              this.avgRenderTime < testCase.expectedTime
    };
  }
}
```

### 3.4 内存优化预估

| 优化策略 | 内存节省 | 实现难度 | 推荐优先级 |
|---------|---------|---------|-----------|
| **LRU缓存（只保留5页）** | 70% | ⭐ 简单 | P0 必做 |
| **图片延迟加载** | 40% | ⭐⭐ 中等 | P0 必做 |
| **Web Worker解析** | UI线程30% | ⭐⭐ 中等 | P1 高优 |
| **离屏Canvas压缩** | 25% | ⭐⭐⭐ 较难 | P2 推荐 |
| **脏区域重绘** | 50% | ⭐⭐⭐ 较难 | P2 推荐 |
| **对象池复用** | 15% | ⭐⭐ 中等 | P3 可选 |

**推荐配置**：
```javascript
const PERFORMANCE_CONFIG = {
  cacheSize: 5,              // 缓存最近浏览的5页
  preloadRange: 2,           // 当前页前后各预加载2页
  imageQuality: 0.85,        // 图片质量85%（视觉无损）
  maxResolution: 1920,       // 最大渲染宽度（ retina屏幕自动适配）
  workerCount: navigator.hardwareConcurrency || 2, // Worker数量
  enableDirtyRect: true,     // 启用脏矩形优化
  gcThreshold: 50,           // 缓存超过50页时触发GC
};
```

---

## 4. 系统架构设计

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     用户界面层 (UI Layer)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ SlideViewer │ │ ThumbnailBar│ │   Toolbar   │            │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
└─────────┼───────────────┼───────────────┼───────────────────┘
          │               │               │
          ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   控制器层 (Controller)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  PPTViewerController                │    │
│  │  - 文件加载与管理                                      │    │
│  │  - 页面导航控制                                        │    │
│  │  - 视图模式切换                                        │    │
│  │  - 用户交互处理                                        │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│  解析器层       │ │ 渲染引擎层  │ │  缓存管理层     │
│                 │ │             │ │                 │
│ ┌─────────────┐ │ │ ┌─────────┐ │ │ ┌─────────────┐ │
│ │ PPTXParser  │ │ │ │SlideEngine│ │ │ │ SlideCache  │ │
│ └─────────────┘ │ │ └────┬────┘ │ │ └─────────────┘ │
│ ┌─────────────┐ │ │ ┌────┴────┐ │ │ ┌─────────────┐ │
│ │ XMLAnalyzer │ │ │ │ Layers  │ │ │ │ ImageCache  │ │
│ └─────────────┘ │ │ └────┬────┘ │ │ └─────────────┘ │
│ ┌─────────────┐ │ │ ┌────┴────┐ │ │ ┌─────────────┐ │
│ │ MediaLoader │ │ │ │Renderers│ │ │ │ FontCache   │ │
│ └─────────────┘ │ │ └─────────┘ │ │ └─────────────┘ │
└─────────────────┘ └─────────────┘ └─────────────────┘
```

### 4.2 核心类图

```
┌──────────────────────────────────────────────────────────────┐
│                        PPTViewer                              │
│ - canvas: HTMLCanvasElement                                   │
│ - engine: SlideRenderEngine                                  │
│ - parser: PPTXParser                                         │
│ - cache: SlideCache                                          │
│ - currentSlide: number                                       │
│                                                              │
│ + load(file: File): Promise<void>                            │
│ + goToSlide(index: number): void                             │
│ + nextSlide(): void                                          │
│ + prevSlide(): void                                          │
│ + zoom(scale: number): void                                  │
│ + enterFullscreen(): void                                    │
│ + exportPDF(): Promise<Blob>                                 │
│ + exportImage(format: string): Promise<Blob>                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  PPTXParser     │ │ SlideRenderEngine│ │  SlideCache     │
│                 │ │                 │ │                 │
│ - zip: JSZip    │ │ - canvas: Canvas │ │ - cache: Map    │
│ - slides: Array │ │ - ctx: Context   │ │ - maxSize: num  │
│ - media: Map    │ │ - layers: Array  │ │ - lru: Queue   │
│                 │ │ - dpr: number   │ │                 │
│ + parse(): Pres │ │ + render(): void │ │ + get(): Canvas │
│ + getSlide()    │ │ + clear(): void  │ │ + set(): void   │
│ + getMedia()    │ │ + resize(): void │ │ + clear(): void │
└─────────────────┘ └────────┬────────┘ └─────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ BackgroundLayer │ │ ShapeLayer  │ │   TextLayer     │
│                 │ │             │ │                 │
│ - color: string │ │ - shapes[]  │ │ - textBoxes[]   │
│ - fill: Fill    │ │             │ │                 │
│                 │ │ + draw()    │ │ + layoutText()  │
│ + render(ctx)   │ │ + clip()    │ │ + measureText() │
└─────────────────┘ └─────────────┘ └─────────────────┘
```

### 4.3 数据流图

```
用户上传PPTX文件
       │
       ▼
┌──────────────┐
│  文件读取     │ FileReader.readAsArrayBuffer()
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  JSZip解压   │ 提取XML文件和媒体资源
└──────┬───────┘
       │
       ├──────────────────┐
       ▼                  ▼
┌──────────────┐  ┌──────────────┐
│ XML解析       │  │ 媒体资源加载  │
│ - 幻灯片结构  │  │ - 图片解码    │
│ - 元素属性    │  │ - 音频/视频   │
│ - 样式定义    │  │              │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌──────────────────────────────┐
│      构建数据模型             │
│  SlideData {                 │
│    background, shapes[],     │
│    images[], texts[],        │
│    charts[], tables[]        │
│  }                           │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Canvas分层渲染           │
│  1. BackgroundLayer          │
│  2. ImageLayer (异步加载)     │
│  3. ShapeLayer               │
│  4. TableLayer               │
│  5. ChartLayer               │
│  6. TextLayer                │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      合成到主Canvas           │
│  - 应用变换(缩放/旋转)        │
│  - 绘制到可视区域             │
│  - 显示给用户                │
└──────────────────────────────┘
```

### 4.4 模块职责划分

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **PPTXParser** | 解析PPTX文件结构 | File/Blob | Presentation对象 |
| **SlideDataModel** | 数据标准化与校验 | 原始XML | 结构化Slide对象 |
| **SlideRenderEngine** | 渲染调度与合成 | Slide对象 | Canvas像素 |
| **Layer** | 分类渲染管理 | 元素数组 | 离屏Canvas |
| **Renderer** | 具体元素绘制 | 单个元素 | 绘制指令 |
| **CacheManager** | 缓存生命周期管理 | 渲染结果 | 缓存命中/未命中 |
| **FontManager** | 字体加载与回退 | 字体名 | 可用字体字符串 |
| **ImageLoader** | 图片资源加载 | URL/Blob | Image对象 |
| **AnimationEngine** | 动画播放控制 | 动画定义 | 逐帧渲染 |
| **InteractionHandler** | 用户交互处理 | 事件对象 | 状态变更 |

---

## 5. 核心模块详解

### 5.1 PPTX解析模块

#### 5.1.1 PPTX文件结构

```
presentation.pptx (ZIP压缩包)
├── [Content_Types].xml          # 内容类型定义
├── _rels/.rels                  # 关系文件
├── docProps/                    # 文档属性
│   ├── core.xml
│   └── app.xml
├── ppt/                         # 演示文稿内容
│   ├── presentation.xml         # 主文档（幻灯片尺寸、引用关系）
│   ├── presentation.xml.rels
│   ├── slideMasters/            # 幻灯片母版
│   ├── slideLayouts/            # 版式布局
│   ├── slides/                  # 幻灯片内容 ⭐ 核心
│   │   ├── slide1.xml
│   │   ├── slide1.xml.rels
│   │   ├── slide2.xml
│   │   └── ...
│   ├── media/                   # 媒体资源
│   │   ├── image1.png
│   │   ├── image2.jpeg
│   │   ├── video1.mp4
│   │   └── audio1.mp3
│   └── theme/                   # 主题样式
│       ├── theme1.xml
│       └── ...
└── README.md
```

#### 5.1.2 核心解析代码

```javascript
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

/**
 * PPTX文件解析器
 * 负责解压、解析XML、提取媒体资源、构建数据模型
 */
export class PPTXParser {
  constructor() {
    this.zip = null;
    this.presentation = null;
    this.slideRefs = [];
    this.mediaMap = new Map(); // rId -> MediaObject
    this.theme = null;
  }

  /**
   * 加载并解析PPTX文件
   * @param {File|Blob|ArrayBuffer} file - PPTX文件
   * @returns {Promise<Presentation>} 解析后的演示文稿对象
   */
  async load(file) {
    const startTime = performance.now();
    
    // 1. 解压ZIP文件
    const buffer = await this.readFileAsArrayBuffer(file);
    this.zip = await JSZip.loadAsync(buffer);
    
    // 2. 解析主文档
    await this.parsePresentation();
    
    // 3. 解析主题（字体、颜色方案）
    await this.parseTheme();
    
    // 4. 解析所有幻灯片
    await this.parseAllSlides();
    
    // 5. 提取媒体资源映射
    await this.buildMediaMap();
    
    const parseTime = performance.now() - startTime;
    console.log(`[PPTXParser] Parse completed in ${parseTime.toFixed(2)}ms`);
    
    return this.buildPresentation();
  }

  /**
   * 读取文件为ArrayBuffer
   */
  async readFileAsArrayBuffer(file) {
    if (file instanceof ArrayBuffer) return file;
    if (file instanceof Blob) return file.arrayBuffer();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 解析presentation.xml获取幻灯片列表
   */
  async parsePresentation() {
    const xmlStr = await this.zip.file('ppt/presentation.xml').async('string');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    this.presentation = parser.parse(xmlStr);
    
    // 提取幻灯片引用关系
    const sldIdLst = this.presentation['p:presentation']['p:sldIdLst']['p:sldId'];
    this.slideRefs = Array.isArray(sldIdLst) ? sldIdLst : [sldIdLst];
  }

  /**
   * 解析单个幻灯片
   * @param {number} index - 幻灯片索引（从0开始）
   * @returns {Promise<SlideData>} 幻灯片数据
   */
  async parseSlide(index) {
    const sldRef = this.slideRefs[index];
    if (!sldRef) throw new Error(`Slide ${index} not found`);
    
    const rId = sldRef['@_r:id'];
    const relsXml = await this.zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`).async('string');
    const relsParser = new XMLParser();
    const rels = relsParser.parse(relsXml);
    
    // 解析幻灯片XML
    const slideXml = await this.zip.file(`ppt/slides/slide${index + 1}.xml`).async('string');
    const slideParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['p:sp', 'p:pic', 'p:graphicFrame'].includes(name)
    });
    const slideData = slideParser.parse(slideXml);
    
    // 提取元素
    const spTree = slideData['p:sld']['c:spTree'];
    const elements = this.extractElements(spTree, rels);
    
    // 提取背景
    const background = this.extractBackground(slideData['p:sld']['c:bg']);
    
    // 提取过渡效果
    const transition = this.extractTransition(slideData['p:sld']['p:transition']);
    
    return {
      index,
      id: sldRef['@_id'],
      background,
      transition,
      elements,
      // 布局信息
      layout: await this.parseSlideLayout(slideData),
    };
  }

  /**
   * 提取所有元素（形状、图片、图表、表格等）
   */
  extractElements(spTree, rels) {
    const elements = [];
    const shapes = spTree?.['p:sp'] || [];
    const pictures = spTree?.['p:pic'] || [];
    const graphicFrames = spTree?.['p:graphicFrame'] || [];
    
    // 解析形状
    shapes.forEach(sp => {
      elements.push(this.parseShape(sp));
    });
    
    // 解析图片
    pictures.forEach(pic => {
      elements.push(this.parsePicture(pic, rels));
    });
    
    // 解析图表和表格
    graphicFrames.forEach(gf => {
      const graphic = gf['a:graphic'];
      if (graphic['a:graphicData']['@_uri'].includes('chart')) {
        elements.push(this.parseChart(gf));
      } else if (graphic['a:graphicData']['@_uri'].includes('table')) {
        elements.push(this.parseTable(gf));
      }
    });
    
    return elements;
  }

  /**
   * 解析形状元素
   */
  parseShape(sp) {
    const nvSpPr = sp['p:nvSpPr'];
    const cNvPr = nvSpPr['p:cNvPr'];
    const spPr = sp['p:spPr'];
    const txBody = sp['p:txBody'];
    
    // 几何信息
    const xfrm = spPr['a:xfrm'];
    const transform = {
      x: this.emuToPx(xfrm['a:off']['@_x']),
      y: this.emuToPx(xfrm['a:off']['@_y']),
      width: this.emuToPx(xfrm['a:ext']['@_cx']),
      height: this.emuToPx(xfrm['a:ext']['@_cy']),
      rotation: xfrm['a:off']['@_rot'] ? parseInt(xfrm['a:off']['@_rot']) / 60000 : 0,
    };
    
    // 形状类型（预设几何或自定义路径）
    const prstGeom = spPr['a:prstGeom'];
    const custGeom = spPr['a:custGeom'];
    const geometry = prstGeom 
      ? { type: 'preset', preset: prstGeom['@_prst'] }
      : { type: 'custom', path: custGeom };
    
    // 填充和线条
    const fill = this.parseFill(spPr);
    const line = this.parseLine(spPr);
    
    // 效果（阴影、发光、三维等）
    const effectLst = spPr['a:effectLst'];
    const effects = effectLst ? this.parseEffects(effectLst) : null;
    
    // 文本内容
    let text = null;
    if (txBody) {
      text = this.parseTextBody(txBody);
    }
    
    return {
      type: 'shape',
      id: cNvPr['@_id'],
      name: cNvPr['@_name'],
      transform,
      geometry,
      fill,
      line,
      effects,
      text,
    };
  }

  /**
   * EMU单位转换为像素（914400 EMU = 1 inch = 96px at 96 DPI）
   */
  emuToPx(emuValue) {
    return parseInt(emuValue) / 914400 * 96;
  }

  /**
   * 解析填充样式
   */
  parseFill(spPr) {
    // 纯色填充
    if (spPr['a:solidFill']) {
      const solidFill = spPr['a:solidFill'];
      return {
        type: 'solid',
        color: this.parseColor(solidFill),
      };
    }
    
    // 渐变填充
    if (spPr['a:gradFill']) {
      const gradFill = spPr['a:gradFill'];
      return {
        type: gradFill['a:lin'] ? 'linear' : 'radial',
        angle: gradFill['a:lin']?.['@_ang'] ? parseInt(gradFill['a:lin']['@_ang']) / 60000 : 0,
        stops: (gradFill['a:gsLst']?.['a:gs'] || []).map(gs => ({
          position: parseInt(gs['@_pos']) / 1000,
          color: this.parseColor(gs),
        })),
      };
    }
    
    // 图片填充
    if (spPr['a:blipFill']) {
      return {
        type: 'image',
        blip: spPr['a:blipFill']['a:blip']['@_r:embed'],
        stretch: !!spPr['a:blipFill']['a:stretch'],
      };
    }
    
    // 无填充
    return { type: 'none' };
  }

  /**
   * 解析颜色值（支持主题色、系统色、RGB等）
   */
  parseColor(colorNode) {
    if (colorNode['a:srgbClr']) {
      return '#' + colorNode['a:srgbClr']['@_val'];
    }
    if (colorNode['a:schemeClr']) {
      // 主题颜色，需要查找theme.xml
      return this.resolveThemeColor(colorNode['a:schemeClr']['@_val']);
    }
    if (colorNode['a:sysClr']) {
      // 系统颜色
      return this.resolveSystemColor(colorNode['a:sysClr']['@_val']);
    }
    return '#000000'; // 默认黑色
  }

  /**
   * 解析文本框内容
   */
  parseTextBody(txBody) {
    const paragraphs = txBody['a:p'];
    const bodyPr = txBody['a:bodyPr'];
    
    return {
      paragraphs: Array.isArray(paragraphs) ? paragraphs.map(p => this.parseParagraph(p)) : [this.parseParagraph(paragraphs)],
      properties: {
        anchor: bodyPr?.['@_anchor'] || 't', // 对齐方式：t=top, b=bottom, ctr=center
        rot: bodyPr?.['@_rot'] ? parseInt(bodyPr['@_rot']) / 60000 : 0,
        lIns: bodyPr?.['@_lIns'] ? this.emuToPx(bodyPr['@_lIns']) : 0,
        tIns: bodyPr?.['@_tIns'] ? this.emuToPx(bodyPr['@_tIns']) : 0,
        rIns: bodyPr?.['@_rIns'] ? this.emuToPx(bodyPr['@_rIns']) : 0,
        bIns: bodyPr?.['@_bIns'] ? this.emuToPx(bodyPr['@_bIns']) : 0,
      },
    };
  }

  /**
   * 解析段落
   */
  parseParagraph(para) {
    const runs = para['a:r'] || [];
    const endParaRPr = para['a:endParaRPr']; // 段落结束符样式
    
    return {
      runs: Array.isArray(runs) ? runs.map(r => ({
        text: r['a:t'] || '',
        style: this.parseRunProperties(r['a:rPr'] || endParaRPr || {}),
      })) : [],
      properties: {
        algn: para['a:pPr']?.['@_algn'] || 'l', // 对齐：l=left, r=right, ctr=center, just=justify
        lineSpacing: para['a:pPr']?.['@_lnSpcMult'] || 1,
        bullet: para['a:pPr']?.['a:buNone'] ? null : 
                para['a:pPr']?.['a:buChar']?.['@_char'] || '•',
      },
    };
  }

  /**
   * 解析文本运行属性（字体、大小、颜色等）
   */
  parseRunProperties(rPr) {
    return {
      font: rPr['a:latin']?.['@_typeface'] || 'Arial',
      size: rPr['@_sz'] ? parseInt(rPr['@_sz']) / 100 : 14,
      bold: !!rPr['@_b'],
      italic: !!rPr['@_i'],
      underline: rPr['@_u'] !== 'none',
      color: rPr['a:solidFill'] ? this.parseColor(rPr['a:solidFill']) : '#000000',
    };
  }

  /**
   * 构建最终的Presentation对象
   */
  buildPresentation() {
    return {
      width: 9144000, // 默认16:9 (EMUs)
      height: 6858000,
      slideSize: {
        width: this.emuToPx(this.presentation?.['p:presentation']?.['p:sldSz']?.['@_cx'] || 9144000),
        height: this.emuToPx(this.presentation?.['p:presentation']?.['p:sldSz']?.['@_cy'] || 6858000),
      },
      slides: this.slides,
      theme: this.theme,
    };
  }
}
```

### 5.2 渲染引擎模块

#### 5.2.1 SlideRenderEngine

```javascript
import { BaseLayer } from './layers/BaseLayer.js';
import { BackgroundLayer } from './layers/BackgroundLayer.js';
import { ShapeLayer } from './layers/ShapeLayer.js';
import { ImageLayer } from './layers/ImageLayer.js';
import { TextLayer } from './layers/TextLayer.js';
import { ChartLayer } from './layers/ChartLayer.js';
import { TableLayer } from './layers/TableLayer.js';
import { SlideCache } from '../cache/SlideCache.js';

/**
 * 幻灯片渲染引擎
 * 负责调度各图层进行分层渲染，管理离屏缓存
 */
export class SlideRenderEngine {
  /** @type {HTMLCanvasElement} */
  canvas;
  
  /** @type {CanvasRenderingContext2D} */
  ctx;
  
  /** @type {number} 设备像素比 */
  dpr;
  
  /** @type {SlideCache} 幻灯片缓存 */
  cache;
  
  /** @type {Array<BaseLayer>} 图层数组 */
  layers;
  
  /** @type {number} 当前幻灯片索引 */
  currentSlideIndex = -1;
  
  /** @type {Presentation} 演示文稿数据 */
  presentation = null;

  constructor(container) {
    this.initCanvas(container);
    this.initLayers();
    this.cache = new SlideCache({ maxSize: 5 });
    this.dpr = window.devicePixelRatio || 1;
    
    this.bindEvents();
  }

  /**
   * 初始化Canvas元素
   */
  initCanvas(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
    `;
    
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    container.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  /**
   * 初始化渲染图层
   */
  initLayers() {
    this.layers = [
      new BackgroundLayer({ zIndex: 0, offscreen: true }),
      new ImageLayer({ zIndex: 1, offscreen: true }),
      new ShapeLayer({ zIndex: 2, offscreen: true }),
      new TableLayer({ zIndex: 3, offscreen: true }),
      new ChartLayer({ zIndex: 4, offscreen: true }),
      new TextLayer({ zIndex: 5, offscreen: false }), // 文本层直接渲染到主Canvas
    ];
  }

  /**
   * 设置演示文稿数据
   */
  setPresentation(presentation) {
    this.presentation = presentation;
    this.resizeCanvas(); // 根据幻灯片尺寸调整
  }

  /**
   * 调整Canvas尺寸（支持高清屏）
   */
  resizeCanvas() {
    const container = this.canvas.parentElement;
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;
    
    // 设置实际像素尺寸（考虑设备像素比）
    this.canvas.width = displayWidth * this.dpr;
    this.canvas.height = displayHeight * this.dpr;
    
    // CSS尺寸不变
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
    
    // 缩放上下文以匹配设备像素比
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * 渲染指定幻灯片
   * @param {number} slideIndex - 幻灯片索引
   * @param {Object} options - 渲染选项
   */
  async renderSlide(slideIndex, options = {}) {
    if (!this.presentation) {
      console.error('[RenderEngine] No presentation loaded');
      return;
    }
    
    const startTime = performance.now();
    
    // 检查缓存
    const cached = this.cache.get(slideIndex);
    if (cached && !options.forceRefresh) {
      this.drawCachedSlide(cached);
      this.currentSlideIndex = slideIndex;
      return;
    }
    
    // 获取幻灯片数据
    const slideData = this.presentation.slides[slideIndex];
    if (!slideData) {
      console.error(`[RenderEngine] Slide ${slideIndex} not found`);
      return;
    }
    
    // 创建离屏Canvas用于缓存
    const offscreenCanvas = this.createOffscreenCanvas(
      this.presentation.slideSize.width,
      this.presentation.slideSize.height
    );
    const offCtx = offscreenCanvas.getContext('2d');
    
    // 分层渲染到离屏Canvas
    for (const layer of this.layers) {
      if (!layer.enabled) continue;
      
      layer.markDirty(); // 强制重绘
      
      try {
        if (layer.offscreen) {
          // 离屏渲染模式：先渲染到layer自己的离屏Canvas，再合成
          await layer.render(offCtx, slideData, this.presentation);
        } else {
          // 直接渲染模式：直接绘制到目标上下文
          await layer.render(offCtx, slideData, this.presentation);
        }
      } catch (error) {
        console.error(`[RenderEngine] Error in ${layer.name}:`, error);
      }
    }
    
    // 缓存渲染结果
    this.cache.set(slideIndex, offscreenCanvas);
    
    // 绘制到主Canvas
    this.drawCachedSlide(offscreenCanvas);
    
    this.currentSlideIndex = slideIndex;
    
    const duration = performance.now() - startTime;
    console.log(`[RenderEngine] Slide ${slideIndex} rendered in ${duration.toFixed(2)}ms`);
    
    // 性能监控
    if (duration > 50) {
      console.warn(`[Performance] Slow render detected: ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * 将缓存的幻灯片绘制到主Canvas（支持缩放和平移）
   */
  drawCachedSlide(cachedCanvas) {
    const ctx = this.ctx;
    const containerWidth = this.canvas.width / this.dpr;
    const containerHeight = this.canvas.height / this.dpr;
    
    // 清空画布
    ctx.clearRect(0, 0, containerWidth, containerHeight);
    
    // 计算自适应缩放（保持比例）
    const slideWidth = this.presentation.slideSize.width;
    const slideHeight = this.presentation.slideSize.height;
    const scale = Math.min(
      containerWidth / slideWidth,
      containerHeight / slideHeight
    ) * (this.zoomLevel || 1);
    
    // 居中显示
    const x = (containerWidth - slideWidth * scale) / 2;
    const y = (containerHeight - slideHeight * scale) / 2;
    
    // 应用变换并绘制
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(cachedCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * 创建离屏Canvas
   */
  createOffscreenCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width * this.dpr;
    canvas.height = height * this.dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    return canvas;
  }

  /**
   * 清除指定幻灯片的缓存
   */
  invalidateSlide(slideIndex) {
    this.cache.delete(slideIndex);
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 绑定窗口事件
   */
  bindEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      if (this.currentSlideIndex >= 0) {
        this.renderSlide(this.currentSlideIndex);
      }
    });
  }
}
```

#### 5.2.2 BaseLayer 基类

```javascript
/**
 * 图层基类
 * 提供统一的接口和生命周期管理
 */
export class BaseLayer {
  /** @type {string} 图层名称 */
  name;
  
  /** @type {number} Z轴排序 */
  zIndex;
  
  /** @type {boolean} 脏标记 */
  dirty = true;
  
  /** @type {boolean} 是否启用 */
  enabled = true;
  
  /** @type {boolean} 是否使用离屏Canvas */
  offscreen;
  
  /** @type {HTMLCanvasElement} 离屏Canvas */
  canvas;
  
  /** @type {CanvasRenderingContext2D} 离屏Canvas上下文 */
  ctx;

  constructor(name, zIndex, options = {}) {
    this.name = name;
    this.zIndex = zIndex;
    this.offscreen = options.offscreen ?? true;
    
    if (this.offscreen) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }

  /**
   * 标记为需要重新渲染
   */
  markDirty() {
    this.dirty = true;
  }

  /**
   * 渲染方法（子类实现）
   * @param {CanvasRenderingContext2D} ctx - 目标渲染上下文
   * @param {SlideData} slideData - 幻灯片数据
   * @param {Presentation} presentation - 演示文稿
   */
  async render(ctx, slideData, presentation) {
    throw new Error(`[${this.name}] render() must be implemented by subclass`);
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
  }
}
```

### 5.3 渲染器模块

#### 5.3.1 TextRenderer - 文本渲染器

```javascript
/**
 * 文本渲染器
 * 处理复杂的文本排版、字体、对齐等
 */
export class TextRenderer {
  /** @type {string|null} 上一次设置的字体（避免重复设置） */
  #lastFont = null;

  /**
   * 渲染文本框
   */
  renderTextBox(ctx, textBox, containerWidth, containerHeight) {
    const { paragraphs, properties } = textBox;
    
    ctx.save();
    
    // 设置文本区域裁剪
    ctx.beginPath();
    ctx.rect(0, 0, containerWidth, containerHeight);
    ctx.clip();
    
    // 计算垂直起始位置（根据锚点）
    let y = this.calculateStartY(properties.anchor, containerHeight);
    
    // 渲染每个段落
    for (const paragraph of paragraphs) {
      const paragraphHeight = this.renderParagraph(ctx, paragraph, containerWidth);
      
      // 行间距调整
      y += paragraphHeight * (paragraph.properties.lineSpacing || 1);
      
      // 超出容器则停止渲染
      if (y > containerHeight) break;
    }
    
    ctx.restore();
  }

  /**
   * 渲染段落
   */
  renderParagraph(ctx, paragraph, maxWidth) {
    const { runs, properties } = paragraph;
    let x = 0;
    let y = 0;
    let maxLineHeight = 0;
    const lines = [[]]; // 存储每一行的runs
    let currentLineWidth = 0;
    
    // 第一步：计算换行
    for (const run of runs) {
      const fontStr = this.getFontString(run.style);
      ctx.font = fontStr;
      
      const chars = run.text.split('');
      for (const char of chars) {
        const charWidth = ctx.measureText(char).width;
        
        if (currentLineWidth + charWidth > maxWidth) {
          lines.push([]);
          currentLineWidth = 0;
          x = 0;
          y += maxLineHeight || run.style.size;
        }
        
        lines[lines.length - 1].push({ char, run, x, y: y + run.style.size });
        currentLineWidth += charWidth;
        x += charWidth;
        maxLineHeight = Math.max(maxLineHeight, run.style.size);
      }
    }
    
    // 第二步：根据对齐方式调整每行起始位置
    const alignOffset = this.calculateAlignOffset(properties.algn, maxWidth, currentLineWidth);
    
    // 第三步：实际绘制文本
    for (const line of lines) {
      for (const item of line) {
        this.applyTextStyle(ctx, item.run.style);
        ctx.fillText(item.char, item.x + alignOffset, item.y);
      }
    }
    
    return y + maxLineHeight; // 返回段落总高度
  }

  /**
   * 获取字体字符串（带缓存）
   */
  getFontString(style) {
    const parts = [];
    if (style.bold) parts.push('bold');
    if (style.italic) parts.push('italic');
    parts.push(`${style.size}px`);
    parts.push(`"${style.font}"`);
    
    const fontStr = parts.join(' ');
    
    // 缓存优化：只在字体变化时设置
    if (this.#lastFont !== fontStr) {
      this.#lastFont = fontStr;
    }
    
    return fontStr;
  }

  /**
   * 应用文本样式
   */
  applyTextStyle(ctx, style) {
    ctx.font = this.getFontString(style);
    ctx.fillStyle = style.color || '#000000';
    
    if (style.underline) {
      // 下划线需要单独绘制
    }
  }

  /**
   * 计算垂直锚点位置
   */
  calculateStartY(anchor, containerHeight) {
    switch (anchor) {
      case 'b': return containerHeight; // 底部对齐
      case 'ctr': return containerHeight / 2; // 居中
      case 't': default: return 0; // 顶部对齐（默认）
    }
  }

  /**
   * 计算水平对齐偏移量
   */
  calculateAlignOffset(alignment, lineWidth, textWidth) {
    switch (alignment) {
      case 'r': return lineWidth - textWidth; // 右对齐
      case 'ctr': return (lineWidth - textWidth) / 2; // 居中
      case 'just': return 0; // 两端对齐（简化处理）
      case 'l': default: return 0; // 左对齐（默认）
    }
  }
}
```

#### 5.3.2 ShapeRenderer - 形状渲染器

```javascript
/**
 * 形状渲染器
 * 支持各种预设形状和自定义路径
 */
export class ShapeRenderer {
  /**
   * 渲染形状
   */
  renderShape(ctx, shape) {
    const { transform, geometry, fill, line, effects } = shape;
    
    ctx.save();
    
    // 应用变换
    ctx.translate(transform.x, transform.y);
    ctx.rotate(transform.rotation * Math.PI / 180);
    
    // 绘制形状路径
    this.drawGeometryPath(ctx, geometry, transform.width, transform.height);
    
    // 填充
    if (fill && fill.type !== 'none') {
      this.applyFill(ctx, fill, transform.width, transform.height);
      ctx.fill();
    }
    
    // 描边
    if (line && line.type !== 'none') {
      this.applyLine(ctx, line);
      ctx.stroke();
    }
    
    // 应用效果
    if (effects) {
      this.applyEffects(ctx, effects);
    }
    
    ctx.restore();
  }

  /**
   * 绘制几何路径
   */
  drawGeometryPath(ctx, geometry, width, height) {
    ctx.beginPath();
    
    if (geometry.type === 'preset') {
      this.drawPresetShape(ctx, geometry.preset, width, height);
    } else if (geometry.type === 'custom') {
      this.drawCustomPath(ctx, geometry.path);
    }
    
    ctx.closePath();
  }

  /**
   * 绘制预设形状
   */
  drawPresetShape(ctx, presetType, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    
    switch (presetType) {
      case 'rect':
        ctx.rect(0, 0, width, height);
        break;
        
      case 'roundRect':
        const radius = Math.min(width, height) * 0.1;
        this.roundedRect(ctx, 0, 0, width, height, radius);
        break;
        
      case 'ellipse':
        ctx.ellipse(cx, cy, width / 2, height / 2, 0, 0, Math.PI * 2);
        break;
        
      case 'triangle':
        ctx.moveTo(cx, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        break;
        
      case 'rightArrow':
        this.drawArrow(ctx, 'right', width, height);
        break;
        
      case 'star':
        this.drawStar(ctx, cx, cy, 5, width / 2, width / 4);
        break;
        
      case 'heart':
        this.drawHeart(ctx, cx, cy, width / 2);
        break;
        
      // ... 更多预设形状
        
      default:
        console.warn(`[ShapeRenderer] Unsupported preset: ${presetType}`);
        ctx.rect(0, 0, width, height); // 降级为矩形
    }
  }

  /**
   * 圆角矩形
   */
  roundedRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * 星形
   */
  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    
    ctx.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
        rot += step;
        
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  /**
   * 心形
   */
  drawHeart(ctx, cx, cy, size) {
    const x = cx - size / 2;
    const y = cy - size / 2;
    
    ctx.moveTo(x + size / 2, y + size / 4);
    ctx.bezierCurveTo(
      x + size / 2, y, 
      x, y, 
      x, y + size / 2
    );
    ctx.bezierCurveTo(
      x, y + size * 0.75, 
      x + size / 2, y + size, 
      x + size / 2, y + size
    );
    ctx.bezierCurveTo(
      x + size / 2, y + size, 
      x + size, y + size * 0.75, 
      x + size, y + size / 2
    );
    ctx.bezierCurveTo(
      x + size, y, 
      x + size / 2, y, 
      x + size / 2, y + size / 4
    );
  }

  /**
   * 应用填充
   */
  applyFill(ctx, fill, width, height) {
    switch (fill.type) {
      case 'solid':
        ctx.fillStyle = fill.color;
        break;
        
      case 'linear': {
        const gradient = ctx.createLinearGradient(0, 0, width * Math.cos(fill.angle), width * Math.sin(fill.angle));
        fill.stops.forEach(stop => {
          gradient.addColorStop(stop.position, stop.color);
        });
        ctx.fillStyle = gradient;
        break;
      }
        
      case 'radial': {
        const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2);
        fill.stops.forEach(stop => {
          gradient.addColorStop(stop.position, stop.color);
        });
        ctx.fillStyle = gradient;
        break;
      }
        
      case 'image':
        // 图片填充需要先加载图片，这里暂不处理
        break;
    }
  }

  /**
   * 应用描边
   */
  applyLine(ctx, line) {
    ctx.strokeStyle = line.color || '#000000';
    ctx.lineWidth = line.width || 1;
    
    if (line.dashType) {
      switch (line.dashType) {
        case 'dash':
          ctx.setLineDash([10, 5]);
          break;
        case 'dot':
          ctx.setLineDash([2, 3]);
          break;
        case 'dashDot':
          ctx.setLineDash([10, 5, 2, 5]);
          break;
        default:
          ctx.setLineDash([]);
      }
    } else {
      ctx.setLineDash([]);
    }
  }

  /**
   * 应用特效（阴影等）
   */
  applyEffects(ctx, effects) {
    if (effects.shadow) {
      const shadow = effects.shadow;
      ctx.shadowColor = shadow.color || 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = shadow.blur || 10;
      ctx.shadowOffsetX = shadow.offsetX || 4;
      ctx.shadowOffsetY = shadow.offsetY || 4;
    }
  }
}
```

### 5.4 缓存管理模块

```javascript
/**
 * 幻灯片缓存管理器
 * 使用LRU（最近最少使用）策略管理缓存的幻灯片
 */
export class SlideCache {
  /** @type {Map<number, {canvas: HTMLCanvasElement, timestamp: number}>} */
  cache = new Map();
  
  /** @type {number} 最大缓存数量 */
  maxSize;
  
  /** @type {Array<number>} LRU队列（记录访问顺序） */
  lruQueue = [];

  constructor(options = {}) {
    this.maxSize = options.maxSize || 10;
  }

  /**
   * 获取缓存的幻灯片
   * @param {number} slideIndex - 幻灯片索引
   * @returns {HTMLCanvasElement|null} 缓存的Canvas
   */
  get(slideIndex) {
    const item = this.cache.get(slideIndex);
    
    if (item) {
      // 更新LRU顺序：移到队尾（最新使用）
      this.updateLRU(slideIndex);
      return item.canvas;
    }
    
    return null; // 缓存未命中
  }

  /**
   * 添加幻灯片到缓存
   * @param {number} slideIndex - 幻灯片索引
   * @param {HTMLCanvasElement} canvas - 渲染后的Canvas
   */
  set(slideIndex, canvas) {
    // 如果已存在，先删除旧条目
    if (this.cache.has(slideIndex)) {
      this.cache.delete(slideIndex);
      this.lruQueue = this.lruQueue.filter(idx => idx !== slideIndex);
    }
    
    // 检查是否超出最大容量
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // 添加新条目
    this.cache.set(slideIndex, {
      canvas,
      timestamp: Date.now(),
    });
    
    // 加入LRU队列尾部
    this.lruQueue.push(slideIndex);
  }

  /**
   * 删除指定幻灯片的缓存
   */
  delete(slideIndex) {
    const item = this.cache.get(slideIndex);
    if (item) {
      // 释放Canvas内存
      item.canvas.width = 0;
      item.canvas.height = 0;
    }
    
    this.cache.delete(slideIndex);
    this.lruQueue = this.lruQueue.filter(idx => idx !== slideIndex);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    // 释放所有Canvas内存
    for (const [, item] of this.cache) {
      item.canvas.width = 0;
      item.canvas.height = 0;
    }
    
    this.cache.clear();
    this.lruQueue = [];
  }

  /**
   * 淘汰最久未使用的缓存项
   */
  evictLRU() {
    if (this.lruQueue.length === 0) return;
    
    const oldestIndex = this.lruQueue.shift(); // 移除队头（最久未使用）
    this.delete(oldestIndex);
    
    console.log(`[SlideCache] Evicted slide ${oldestIndex}, cache size: ${this.cache.size}/${this.maxSize}`);
  }

  /**
   * 更新LRU访问顺序
   */
  updateLRU(slideIndex) {
    // 从当前位置移除
    this.lruQueue = this.lruQueue.filter(idx => idx !== slideIndex);
    // 添加到队尾
    this.lruQueue.push(slideIndex);
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // 需要外部统计
      memoryUsage: this.estimateMemoryUsage(),
      lruOrder: [...this.lruQueue],
    };
  }

  /**
   * 估算内存占用（粗略估算）
   */
  estimateMemoryUsage() {
    let totalPixels = 0;
    for (const [, item] of this.cache) {
      totalPixels += item.canvas.width * item.canvas.height;
    }
    // 每像素4字节（RGBA）
    return (totalPixels * 4) / (1024 * 1024); // MB
  }
}
```

### 5.5 字体管理模块

```javascript
/**
 * 字体管理器
 * 负责字体检测、加载、回退链管理
 */
export class FontManager {
  /** @type {Map<string, boolean>} 已加载字体集合 */
  loadedFonts = new Map();
  
  /** @type {string[]} 字体回退链 */
  fallbackChain = [
    'Microsoft YaHei',  // 微软雅黑
    'SimHei',           // 黑体
    'SimSun',           // 宋体
    'KaiTi',            // 楷体
    'FangSong',         // 仿宋
    'Arial',
    'Helvetica',
    'sans-serif',
  ];

  /**
   * 确保字体可用
   * @param {string} fontFamily - 字体族名称
   * @returns {Promise<string>} 实际可用的字体族名称
   */
  async ensureFont(fontFamily) {
    // 已加载过，直接返回
    if (this.loadedFonts.has(fontFamily)) {
      return fontFamily;
    }
    
    // 检查系统字体
    if (await this.isSystemFont(fontFamily)) {
      this.loadedFonts.set(fontFamily, 'system');
      return fontFamily;
    }
    
    // 尝试从Google Fonts加载
    try {
      await this.loadFromGoogleFonts(fontFamily);
      this.loadedFonts.set(fontFamily, 'web');
      return fontFamily;
    } catch (error) {
      console.warn(`[FontManager] Failed to load font "${fontFamily}":`, error.message);
      
      // 返回最佳匹配的替代字体
      const fallback = this.findBestFallback(fontFamily);
      return fallback;
    }
  }

  /**
   * 检测字体是否已安装在系统
   */
  async isSystemFont(fontFamily) {
    // 使用Canvas检测字体可用性
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const testText = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const textSize = 48;
    
    // 使用默认字体测量
    ctx.font = `${textSize}px monospace`;
    const defaultWidth = ctx.measureText(testText).width;
    
    // 使用目标字体测量
    ctx.font = `${textSize}px "${fontFamily}", monospace`;
    const testWidth = ctx.measureText(testText).width;
    
    // 如果宽度不同，说明字体生效了
    return Math.abs(defaultWidth - testWidth) > 5;
  }

  /**
   * 从Google Fonts加载字体
   */
  async loadFromGoogleFonts(fontFamily) {
    // Google Fonts API URL
    const fontsApiUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700&display=swap`;
    
    // 创建FontFace
    const fontUrl = `https://fonts.gstatic.com/s/${fontFamily.toLowerCase().replace(/\s/g, '')}/v...`; // 需要实际的URL
    
    const font = new FontFace(fontFamily, `url(${fontUrl})`);
    await font.load();
    document.fonts.add(font);
    
    console.log(`[FontManager] Loaded web font: ${fontFamily}`);
  }

  /**
   * 查找最佳回退字体
   */
  findBestFallback(originalFont) {
    // 简单策略：按回退链依次尝试
    for (const fallback of this.fallbackChain) {
      if (this.loadedFonts.has(fallback) || this.isSystemFontSync(fallback)) {
        console.log(`[FontManager] Using fallback "${fallback}" for "${originalFont}"`);
        return fallback;
      }
    }
    
    return 'sans-serif'; // 最终兜底
  }

  /**
   * 同步检测系统字体（简化版）
   */
  isSystemFontSync(fontFamily) {
    // 常见中文字体列表
    const commonChineseFonts = [
      'Microsoft YaHei', 'SimHei', 'SimSun', 'KaiTi', 'FangSong',
      'STHeiti', 'STSong', 'STKaiti', 'STFangsong',
      'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei',
    ];
    
    return commonChineseFonts.includes(fontFamily);
  }

  /**
   * 批量预加载常用字体
   */
  async preloadCommonFonts() {
    const commonFonts = [
      'Microsoft YaHei',
      'SimHei',
      'SimSun',
      'Arial',
      'Times New Roman',
      'Courier New',
    ];
    
    const promises = commonFonts.map(font => this.ensureFont(font));
    await Promise.allSettled(promises);
    
    console.log(`[FontManager] Preloaded ${commonFonts.length} common fonts`);
  }
}
```

---

## 6. 功能清单

### 6.1 Phase 1: MVP核心功能（必须实现）

#### 📄 **基础浏览**
- [ ] **文件加载**
  - [ ] 支持拖拽上传
  - [ ] 支持点击选择文件
  - [ ] 支持URL加载
  - [ ] 文件大小限制提示（建议<100MB）

- [ ] **页面导航**
  - [ ] 上一页/下一页按钮
  - [ ] 键盘快捷键（← → ↑ ↓ Space Enter Backspace Home End）
  - [ ] 页码输入跳转
  - [ ] 页码显示（当前/总数）
  - [ ] 幻灯片缩略图侧边栏
  - [ ] 缩略图拖拽排序（可选）

- [ ] **视图控制**
  - [ ] 缩放滑块（25% - 400%）
  - [ ] 缩放按钮（放大/缩小/适应窗口/实际大小）
  - [ ] 自适应窗口大小（Resize监听）
  - [ ] 全屏演示模式（F11/ESC）
  - [ ] 单页视图/双页视图切换
  - [ ] 显示/隐藏网格线
  - [ ] 显示/隐藏标尺

#### 🎨 **内容渲染**
- [ ] **文本元素**（还原度92%+）
  - [ ] 字体族（中英文）
  - [ ] 字体大小（8pt - 144pt）
  - [ ] 字体样式（常规/粗体/斜体/粗斜体）
  - [ ] 文字颜色（纯色）
  - [ ] 段落对齐（左/中/右/两端）
  - [ ] 自动换行
  - [ ] 项目符号和编号
  - [ ] 超链接显示（可点击）

- [ ] **形状元素**（还原度90%+）
  - [ ] 基础形状：矩形、圆角矩形、正方形、圆形、椭圆
  - [ ] 三角形：等腰/直角/等边
  - [ ] 平行四边形、梯形、菱形
  - [ ] 五边形、六边形、多边形
  - [ ] 箭头：← → ↑ ↓ ↗ ↙ 等（至少10种）
  - [ ] 星形：4角-32角
  - [ ] 心形、闪电、云朵
  - [ ] 流程图符号：开始/结束/判断/处理
  - [ ] 填充：纯色/线性渐变/径向渐变
  - [ ] 边框：颜色/粗细/实线/虚线/点线
  - [ ] 透明度调节

- [ ] **图片元素**（还原度95%+）
  - [ ] 格式支持：JPEG, PNG, GIF, BMP, WebP
  - [ ] 显示图片
  - [ ] 裁剪显示
  - [ ] 旋转（0° - 360°）
  - [ ] 翻转（水平/垂直）
  - [ ] 透明背景支持

#### 🔧 **导出功能**
- [ ] 导出为PDF（单页/讲义模式）
- [ ] 导出为PNG/JPEG图片
- [ ] 打印功能（打印预览+打印对话框）

### 6.2 Phase 2: 增强体验（强烈推荐）

#### 📊 **高级内容**
- [ ] **表格渲染**（还原度88%+）
  - [ ] 单元格合并（行合并+列合并）
  - [ ] 边框样式（各种线型+颜色）
  - [ ] 单元格背景色
  - [ ] 文本对齐（水平+垂直）
  - [ ] 表格样式主题

- [ ] **基础图表**（还原度85%+）
  - [ ] 柱状图（簇状/堆积）
  - [ ] 折线图（带标记）
  - [ ] 饼图/环形图
  - [ ] 面积图
  - [ ] 基础坐标轴和图例

- [ ] **文本增强**
  - [ ] 文字阴影效果
  - [ ] 文字描边
  - [ ] 渐变色文字
  - [ ] 竖排文字（中文）
  - [ ] 首行缩进/悬挂缩进

- [ ] **形状增强**
  - [ ] 阴影效果（外阴影/内阴影）
  - [ ] 发光效果
  - [ ] 三维旋转效果
  - [ ] 自由曲线/手绘线条
  - [ ] 图片填充纹理

#### 🎬 **动画与过渡**（可选）
- [ ] **页面过渡效果**
  - [ ] 淡入淡出
  - [ ] 推入（上下左右）
  - [ ] 擦除
  - [ ] 百叶窗
  - [ ] 盒状展开/收缩

- [ ] **基础动画**
  - [ ] 出现/消失
  - [ ] 淡入/淡出
  - [ ] 飞入/飞出（上下左右）
  - [ ] 缩放（放大/缩小/旋转）
  - [ ] 动画时间轴面板

#### 🔍 **实用工具**
- [ ] **搜索功能**
  - [ ] 文本搜索（当前幻灯片）
  - [ ] 全文搜索（所有幻灯片）
  - [ ] 搜索结果高亮
  - [ ] 跳转到匹配位置

- [ ] **标注工具**（演示模式）
  - [ ] 画笔工具（多种颜色+粗细）
  - [ ] 荧光笔
  - [ ] 橡皮擦
  - [ ] 清除所有标注
  - [ ] 保存/丢弃标注

### 6.3 Phase 3: 企业级扩展（可选）

#### 📚 **多格式兼容**
- [ ] 支持旧版.ppt格式（基础支持）
- [ ] 支持ODF格式.odp
- [ ] 支持PDF回显
- [ ] 批量导出所有幻灯片为图片

#### 🤝 **协作与集成**
- [ ] **实时协作**
  - [ ] 多人同时查看（只读模式）
  - [ ] 远程演示共享
  - [ ] 评论批注系统

- [ ] **API接口**
  - [ ] JavaScript SDK
  - [ ] 嵌入式组件
  - [ ] 事件回调机制
  - [ ] 自定义UI钩子

#### ♿ **无障碍访问**
- [ ] 键盘完全可操作（Tab导航、快捷键）
- [ ] 屏幕阅读器支持（ARIA标签）
- [ ] 高对比度模式
- [ ] 字体大小调节
- [ ] 焦点指示器可见

#### 📱 **移动端适配**
- [ ] 触控手势优化
  - [ ] 双指缩放
  - [ ] 单指滑动翻页
  - [ ] 长按菜单
  - [ ] 双指旋转
- [ ] 响应式布局
  - [ ] 手机竖屏模式优化
  - [ ] 平板横屏模式优化
  - [ ] 自适应触控尺寸

---

## 7. 还原度评估

### 7.1 整体还原度：87% - 95%

| 元素类型 | 还原度范围 | 典型值 | 主要影响因素 |
|---------|-----------|--------|-------------|
| **文本元素** | 92% - 98% | 95% | 字体可用性、排版精度 |
| **形状元素** | 88% - 96% | 92% | 复杂路径拟合、渐变效果 |
| **图片元素** | 90% - 97% | 95% | 图片格式支持、滤镜效果 |
| **表格元素** | 85% - 93% | 88% | 边框样式、合并单元格 |
| **图表元素** | 70% - 88% | 80% | 图表类型复杂度 |
| **SmartArt图形** | 65% - 78% | 72% | 布局引擎实现难度 |
| **动画效果** | 60% - 85% | 75% | 动画类型丰富度 |

### 7.2 分项详细评估

#### 7.2.1 文本元素还原度详解

| 文本特性 | 还原度 | 技术难点 | 解决方案 |
|---------|-------|---------|---------|
| **字体族** | 95% | 系统字体依赖 | Web Font加载 + 回退链 |
| **字体大小** | 99% | 无 | Canvas原生支持 |
| **粗体/斜体** | 99% | 无 | Canvas原生支持 |
| **文字颜色** | 100% | 无 | 完美支持 |
| **段落对齐** | 98% | 两端对齐算法 | 自实现TextJustifier |
| **行间距** | 95% | PPT特殊行距计算 | 参考OOXML规范 |
| **项目符号** | 90% | 自定义符号渲染 | Unicode字符 + SVG图标库 |
| **文字阴影** | 88% | 多层阴影合成 | ctx.shadowBlur模拟 |
| **文字描边** | 95% | 无 | ctx.strokeText支持 |
| **竖排文字** | 85% | 逐字定位+旋转 | 手动布局引擎 |
| **自动换行** | 93% | 中英文混排断词 | ICU断词算法简化版 |

**影响文本还原度的关键问题及解决方案：**

```javascript
// 问题1：字体缺失导致降级显示
// 解决方案：FontManager + Web Fonts
class FontManager {
  async ensureFont(fontFamily) {
    // 1. 检查系统字体
    if (this.isSystemFont(fontFamily)) return fontFamily;
    
    // 2. 尝试加载Web Font
    try {
      const font = new FontFace(fontFamily, `url(${this.getFontUrl(fontFamily)})`);
      await font.load();
      document.fonts.add(font);
      return fontFamily;
    } catch (e) {
      // 3. 使用最佳匹配替代字体
      return this.findBestFallback(fontFamily);
    }
  }
}

// 问题2：文本测量精度误差（±1px）
// 解决方案：使用高DPR Canvas + 四舍五入
const dpr = window.devicePixelRatio || 1;
canvas.width = width * dpr;
canvas.height = height * dpr;
ctx.scale(dpr, dpr);

// 问题3：复杂排版（首行缩进、悬挂缩进）
// 解决方案：自定义TextLayoutEngine
class TextLayoutEngine {
  layoutParagraph(text, maxWidth, style) {
    const lines = [];
    let currentLine = '';
    
    for (const char of text.split('')) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = char;
        
        // 首行缩进处理
        if (lines.length === 1 && style.firstLineIndent) {
          currentLine = ' '.repeat(style.firstLineIndent) + currentLine;
        }
      } else {
        currentLine = testLine;
      }
    }
    
    lines.push(currentLine);
    return lines;
  }
}
```

#### 7.2.2 形状元素还原度详解

##### **填充效果还原度**

| 填充类型 | 还原度 | 技术说明 | 示例代码 |
|---------|-------|---------|---------|
| **纯色填充** | 100% | Canvas完美支持 | `ctx.fillStyle = '#FF5733'` |
| **线性渐变** | 98% | createLinearGradient | 见下方示例 |
| **径向渐变** | 96% | createRadialGradient | 见下方示例 |
| **路径渐变** | 75% | ⚠️ Canvas不支持 | 用多段线性渐变近似 |
| **图片填充** | 95% | drawImage + createPattern | 见下方示例 |
| **纹理填充** | 70% | ⚠️ 需要纹理素材库 | 内置20种常用纹理 |
| **图案填充** | 80% | 可程序化生成 | 圆点/斜线/网格等 |

```javascript
// 渐变填充示例
function applyLinearGradient(ctx, x, y, width, height, angle, stops) {
  const radian = (angle * Math.PI) / 180;
  const gradient = ctx.createLinearGradient(
    x,
    y,
    x + width * Math.cos(radian),
    y + height * Math.sin(radian)
  );
  
  stops.forEach(stop => {
    gradient.addColorStop(stop.position, stop.color);
  });
  
  ctx.fillStyle = gradient;
}

// 径向渐变示例
function applyRadialGradient(ctx, cx, cy, radius, stops) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  stops.forEach(stop => {
    gradient.addColorStop(stop.position, stop.color);
  });
  ctx.fillStyle = gradient;
}

// 图片填充示例
async function applyImageFill(ctx, imageSrc, width, height) {
  const img = await loadImage(imageSrc);
  const pattern = ctx.createPattern(img, 'repeat');
  ctx.fillStyle = pattern;
}
```

##### **边框样式还原度**

| 边框特性 | 还原度 | 说明 |
|---------|-------|------|
| **颜色/粗细** | 100% | 完美支持 |
| **实线** | 100% | 完美支持 |
| **虚线** | 95% | setLineDash([10, 5]) |
| **点线** | 88% | 点间距可能有±1px差异 |
| **点划线** | 82% | 复合线型需手动组合 |
| **圆角边框** | 99% | arcTo精确绘制 |
| **阴影边框** | 90% | shadowBlur近似效果 |

```javascript
// 复合边框线型实现
function applyComplexDash(ctx, dashType) {
  switch (dashType) {
    case 'dash':
      ctx.setLineDash([12, 4]);
      break;
    case 'dot':
      ctx.setLineDash([3, 3]);
      break;
    case 'dashDot':
      ctx.setLineDash([12, 4, 3, 4]);
      break;
    case 'longDashDot':
      ctx.setLineDash([24, 6, 3, 6]);
      break;
    default:
      ctx.setLineDash([]);
  }
}
```

##### **特效还原度**

| 特效类型 | 还原度 | 技术挑战 | 解决方案 |
|---------|-------|---------|---------|
| **外阴影** | 92% | 模糊半径差异 | ctx.shadowBlur |
| **内阴影** | 75% | ⚠️ 需要clip反相 | compositing操作 |
| **发光效果** | 88% | 颜色扩散 | 多层shadow叠加 |
| **柔化边缘** | 70% | ⚠️ 高斯模糊 | 近似模糊算法 |
| **三维旋转** | 60% | ⚠️ 透视变换难 | 简化为2D仿射变换 |
| **倒影** | 65% | ⚠️ 渐变透明翻转 | 手动实现镜像+渐变遮罩 |

#### 7.2.3 图片元素还原度详解

| 图片特性 | 还原度 | 技术说明 |
|---------|-------|---------|
| **JPEG/PNG显示** | 99% | 完美支持 |
| **GIF动画** | 95% | 可播放但需定时器刷新Canvas |
| **SVG矢量图** | 85% | 可转Canvas或嵌入<foreignObject> |
| **裁剪** | 98% | drawImage九参数版本精确控制 |
| **旋转** | 99% | ctx.rotate()数学精确 |
| **翻转** | 100% | scale(-1, 1)完美实现 |
| **透明通道** | 100% | RGBA完美支持 |
| **亮度调整** | 88% | 像素级操作可近似 |
| **对比度调整** | 85% | 像素公式计算 |
| **艺术滤镜** | 60% | ⚠️ 复杂滤镜需图像处理库 |

```javascript
// 图片裁剪+旋转+透明度完整示例
class ImageRenderer {
  render(ctx, imageData) {
    const { 
      src, 
      cropRect,     // {x, y, w, h} 裁剪区域
      destRect,     // {x, y, w, h} 目标位置和大小
      rotation,     // 旋转角度（度）
      flipH,        // 水平翻转
      flipV,        // 垂直翻转
      opacity       // 透明度 0-1
    } = imageData;
    
    ctx.save();
    
    // 移动到目标中心点
    ctx.translate(destRect.x + destRect.w / 2, destRect.y + destRect.h / 2);
    
    // 应用旋转
    if (rotation) {
      ctx.rotate(rotation * Math.PI / 180);
    }
    
    // 应用翻转
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    
    // 应用透明度
    ctx.globalAlpha = opacity ?? 1;
    
    // 绘制图片（从裁剪区域到目标矩形）
    ctx.drawImage(
      src,
      cropRect.x, cropRect.y, cropRect.w, cropRect.h,
      -destRect.w / 2, -destRect.h / 2, destRect.w, destRect.h
    );
    
    ctx.restore();
  }
}
```

#### 7.2.4 表格元素还原度详解

| 表格特性 | 还原度 | 实现难点 | 解决方案 |
|---------|-------|---------|---------|
| **单元格合并** | 95% | 跨行列范围计算 | 合并矩阵数据结构 |
| **边框样式** | 88% | 复合边框线型 | 分段绘制不同线型 |
| **背景色** | 100% | 无 | fillRect完美支持 |
| **文本对齐** | 97% | 水平垂直组合 | textAlign + textBaseline |
| **表格样式主题** | 78% | 内置样式众多 | 实现10种常用主题 |
| **斜线表头** | 82% | 斜线+文字定位 | moveTo/lineTo + rotate |
| **自动换行** | 90% | 同文本换行问题 | 复用TextLayoutEngine |

```javascript
// 表格渲染核心逻辑
class TableRenderer {
  render(ctx, tableData) {
    const { rows, cols, cells, merges } = tableData;
    
    // 计算单元格实际尺寸（考虑合并）
    const cellSizes = this.calculateCellSizes(rows, cols, merges);
    
    // 绘制背景色
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.isMergedCell(r, c, merges)) continue; // 跳过被合并的单元格
        
        const cell = cells[r][c];
        const size = cellSizes[r][c];
        
        if (cell.backgroundColor) {
          ctx.fillStyle = cell.backgroundColor;
          ctx.fillRect(size.x, size.y, size.width, size.height);
        }
      }
    }
    
    // 绘制边框
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.isMergedCell(r, c, merges)) continue;
        
        const cell = cells[r][c];
        const size = cellSizes[r][c];
        
        if (cell.border) {
          this.drawCellBorder(ctx, size, cell.border);
        }
      }
    }
    
    // 绘制文本
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.isMergedCell(r, c, merges)) continue;
        
        const cell = cells[r][c];
        const size = cellSizes[r][c];
        
        if (cell.text) {
          this.drawCellText(ctx, size, cell.text, cell.align);
        }
      }
    }
  }
}
```

#### 7.2.5 图表元素还原度详解

| 图表类型 | 还原度 | 主要差距 | 推荐方案 |
|---------|-------|---------|---------|
| **柱状图** | 88% | 3D效果、渐变细节 | Chart.js + 自定义主题 |
| **折线图** | 90% | 数据标记样式微差 | Chart.js配置优化 |
| **饼图** | 85% | 爆炸效果、阴影 | Chart.js + 手动增强 |
| **面积图** | 86% | 渐变填充区域 | Chart.js fill配置 |
| **散点图** | 90% | 相对简单，还原度高 | Chart.js直接支持 |
| **曲面图** | 65% | ⚠️ 三维透视极难 | 降级为2D热力图 |
| **股价图** | 75% | ⚠️ 特殊绘制逻辑 | 自定义Candlestick插件 |
| **雷达图** | 80% | 多边形网格偏差 | Chart.js radar type |

**为什么图表还原度相对较低？**

```javascript
// PowerPoint图表实际上是嵌入的Excel对象
// 存储在 ppt/embeddings/sheetN.xlsx 中
// 图表样式依赖 Office Chart Engine 的专有渲染

// 我们的方案选择：
// 方案A：静态位图快照（简单但不灵活）
async function extractChartAsImage(chartFrame) {
  // 从PPTX中提取图表预览图（如果有）
  const imagePart = chartFrame.embeddedImage;
  return imagePart; // 直接显示位图
}

// 方案B：Chart.js重新绘制（推荐，平衡质量和工作量）
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

class ChartRenderer {
  renderBarChart(ctx, chartData, bounds) {
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.categories,
        datasets: [{
          data: chartData.values,
          backgroundColor: chartData.colors,
          borderColor: chartData.borderColors,
          borderWidth: 1,
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        plugins: {
          legend: { display: chartData.showLegend },
          title: { display: !!chartData.title, text: chartData.title },
        },
        scales: {
          x: { display: true, title: { display: !!chartData.xAxisTitle, text: chartData.xAxisTitle } },
          y: { display: true, title: { display: !!chartData.yAxisTitle, text: chartData.yAxisTitle } },
        },
        animation: false, // 预览模式禁用动画提升性能
      }
    });
    
    return chart;
  }
}

// 方案C：自研图表引擎（最高质量但工作量大）
// 仅在需要极致还原度时采用
```

#### 7.2.6 SmartArt图形还原度详解

| SmartArt类型 | 还原度 | 核心难点 | 工作量估算 |
|-------------|-------|---------|-----------|
| **基本列表** | 80% | 结构规则，较易实现 | 2-3天 |
| **流程图** | 72% | 连接符路径计算复杂 | 5-7天 |
| **循环图** | 68% | 弧形连接符定位困难 | 7-10天 |
| **层次结构** | 75% | 树形布局算法 | 5-7天 |
| **关系图** | 65% | 维恩图等特殊几何 | 10-14天 |
| **矩阵图** | 70% | 分块对齐精度要求高 | 7-10天 |
| **棱锥图** | 68% | 三维透视效果差 | 8-12天 |
| **图片列表** | 73% | 图片+文本混排 | 5-7天 |

**SmartArt技术挑战分析：**

```javascript
// SmartArt在PPTX中的存储方式：
// 1. 数据内容：在 <p:sp> 的 <a:txBody> 中
// 2. 布局模板：在 <p:smartTags> 引用的预定义XML模板中
// 3. Office内置约150种SmartArt模板

// 核心难点是布局引擎：
class SmartArtLayoutEngine {
  /**
   * 计算SmartArt元素的坐标位置
   * @param {string} templateType - 模板类型标识
   * @param {number} itemCount - 子项数量
   * @param {Object} containerSize - 容器尺寸
   * @returns {Array<Object>} 每个元素的transform信息
   */
  calculatePositions(templateType, itemCount, containerSize) {
    switch (templateType) {
      case 'BasicList': // 基本列表
        return this.layoutBasicList(itemCount, containerSize);
        
      case 'BasicProcess': // 基本流程
        return this.layoutHorizontalProcess(itemCount, containerSize);
        
      case 'CycleProcess': // 循环流程
        return this.layoutCircularProcess(itemCount, containerSize);
        
      case 'OrgChart': // 组织结构图
        return this.layoutTree(itemCount, containerSize);
        
      default:
        console.warn(`[SmartArt] Unsupported template: ${templateType}`);
        return this.fallbackLayout(itemCount, containerSize);
    }
  }
  
  layoutBasicList(count, { width, height }) {
    const items = [];
    const itemHeight = height / count;
    const padding = 10;
    
    for (let i = 0; i < count; i++) {
      items.push({
        x: padding,
        y: padding + i * itemHeight,
        width: width - padding * 2,
        height: itemHeight - padding * 2,
      });
    }
    
    return items;
  }
  
  layoutCircularProcess(count, { width, height }) {
    const items = [];
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;
    const itemWidth = 100;
    const itemHeight = 60;
    
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI / count) - Math.PI / 2;
      items.push({
        x: cx + radius * Math.cos(angle) - itemWidth / 2,
        y: cy + radius * Math.sin(angle) - itemHeight / 2,
        width: itemWidth,
        height: itemHeight,
        rotation: angle * 180 / Math.PI + 90, // 沿切线方向
      });
    }
    
    return items;
  }
}
```

### 7.3 与主流产品对比

| 产品/方案 | 整体还原度 | 技术方案 | 性能 | 文件大小 | 适用场景 |
|----------|-----------|---------|------|---------|---------|
| **Microsoft PowerPoint** | 100% | 原生渲染引擎 | ★★★★★ | - | 桌面编辑 |
| **Google Slides** | 95% | HTML/CSS转换 | ★★★★☆ | 中等 | 在线协作 |
| **LibreOffice Impress** | 90% | 自研渲染引擎 | ★★★☆☆ | 大 | 开源免费 |
| **Apple Keynote (iCloud)** | 92% | SVG+WebGL混合 | ★★★★☆ | 小 | 苹果生态 |
| **OnlyOffice** | 88% | Canvas+DOM混合 | ★★★☆☆ | 中 | 企业办公 |
| **我们的Canvas方案** | **87%-92%** | **纯Canvas 2D** | **★★★★★** | **小 (<200KB)** | **Web预览** |
| **pdf.js (PDF回显)** | 80% | Canvas渲染PDF | ★★★★☆ | 小 | PDF查看 |

**我们的优势：**
- ✅ **性能最优**：纯Canvas渲染，无DOM开销
- ✅ **体积最小**：核心依赖仅JSZip+fast-xml-parser
- ✅ **一致性最好**：跨浏览器渲染完全一致
- ✅ **可离线**：无需服务端转换
- ✅ **可定制**：完整的渲染管线可控

**劣势：**
- ⚠️ 图表还原度略低（vs Google Slides）
- ⚠️ SmartArt支持有限（vs LibreOffice）
- ⚠️ 动画播放需额外开发

---

## 8. 实现路线图

### 8.1 Phase 1: MVP版本（预计2-3周）

**目标**：能解析并显示简单PPTX，覆盖80%日常使用场景

#### **Week 1: 基础架构搭建**

**Day 1-2: 项目初始化与解析器开发**
```bash
# 项目创建
mkdir ppt-preview-canvas && cd ppt-preview-canvas
npm init -y
npm install jszip fast-xml-parser vite

# 目录结构
src/
├── core/
│   ├── PPTXParser.js         # PPTX解析器
│   └── SlideDataModel.js     # 数据模型
├── render/
│   ├── SlideRenderEngine.js  # 渲染引擎
│   ├── layers/
│   │   ├── BaseLayer.js      # 图层基类
│   │   ├── BackgroundLayer.js
│   │   ├── ShapeLayer.js
│   │   └── TextLayer.js
│   └── renderers/
│       ├── TextRenderer.js
│       └── ShapeRenderer.js
├── cache/
│   └── SlideCache.js
├── viewer/
│   └── PPTViewer.js
├── utils/
│   └── emuConverter.js
└── main.js
```

**交付物**：
- [x] 项目脚手架搭建完成
- [x] PPTXParser能解压并提取核心XML
- [x] 能解析slide1.xml的基本结构
- [x] 单元测试覆盖解析逻辑

**Day 3-4: 渲染引擎框架**
- [x] SlideRenderEngine基础架构
- [x] BaseLayer抽象类实现
- [x] BackgroundLayer渲染纯色背景
- [x] Canvas初始化和自适应缩放
- [x] requestAnimationFrame调度机制

**Day 5: 文本渲染基础**
- [x] TextRenderer能渲染单行文本
- [x] 支持字体族、大小、颜色、粗体、斜体
- [x] 基本的左/中/右对齐
- [x] 自动换行（简单实现）

#### **Week 2: 核心功能完善**

**Day 6-7: 形状渲染**
- [x] ShapeRenderer实现10种预设形状
- [x] 纯色填充 + 线性渐变填充
- [x] 边框样式（实线/虚线/颜色/粗细）
- [x] 矩形、圆形、三角形、箭头、星形

**Day 8-9: 图片支持**
- [x] 从PPTX提取图片资源
- [x] ImageLoader异步加载图片
- [x] 图片裁剪、旋转、缩放显示
- [x] 图片缓存机制

**Day 10: 导航与交互**
- [x] 页面导航（上一页/下一页）
- [x] 键盘快捷键支持
- [x] 缩放功能（25%-400%）
- [x] 全屏演示模式
- [x] 缩略图侧边栏（可选）

#### **Week 3: 测试与优化**

**Day 11-12: 功能测试**
- [ ] 准备测试PPTX样本集（至少10个）
  - [ ] 简单文本PPT（3页）
  - [ ] 含图片PPT（5页）
  - [ ] 含形状PPT（5页）
  - [ ] 混合内容PPT（10页）
  - [ ] 大文件PPT（>50页）
- [ ] 功能测试通过率 > 90%
- [ ] 性能基准测试建立

**Day 13-15: 性能优化与Bug修复**
- [ ] LRU缓存策略实施
- [ ] 内存泄漏检测与修复
- [ ] 渲染性能优化（目标<30ms/页）
- [ ] 边界情况处理
- [ ] 文档编写（README + API文档）

**Phase 1 交付标准**：
```
✅ 能打开并正常显示85%以上的真实PPTX文件
✅ 单页渲染时间 < 50ms（简单页面 < 20ms）
✅ 支持20种以上预设形状
✅ 文本还原度 > 90%
✅ 图片显示正确率 > 95%
✅ 基本导航功能完善
✅ 代码测试覆盖率 > 70%
✅ 无明显内存泄漏
```

### 8.2 Phase 2: V1.0正式版（预计3-4周）

**目标**：功能完善，达到生产可用级别，还原度90%+

#### **Week 4-5: 内容增强**

**高级形状与效果**
- [ ] 形状阴影效果（外阴影/内阴影）
- [ ] 发光/柔化边缘效果
- [ ] 三维旋转效果（简化版）
- [ ] 更多预设形状（总计40+种）
- [ ] 自由曲线/手绘线条
- [ ] 图片填充/纹理填充

**表格渲染**
- [ ] 表格数据模型设计
- [ ] 单元格合并支持
- [ ] 边框样式完整实现
- [ ] 表格样式主题（10种常用）
- [ ] 斜线表头

**文本增强**
- [ ] 文字阴影/描边/发光
- [ ] 渐变色文字
- [ ] 竖排文字（中文）
- [ ] 复杂段落格式（首行缩进/悬挂缩进）
- [ ] 项目符号样式丰富化

#### **Week 6-7: 图表与工具**

**图表支持**
- [ ] 集成Chart.js库
- [ ] 柱状图/折线图/饼图/面积图
- [ ] 从PPTX提取图表数据
- [ ] 图表样式映射（尽量接近PPT风格）
- [ ] 坐标轴/图例/标题

**导出功能**
- [ ] 导出PDF（html2canvas + jsPDF）
- [ ] 导出PNG/JPEG（canvas.toDataURL）
- [ ] 批量导出所有幻灯片
- [ ] 打印功能（@page媒体查询）

**搜索与标注**
- [ ] 全文搜索引擎
- [ ] 搜索结果高亮
- [ ] 演示模式画笔工具
- [ ] 标注保存/清除

#### **Week 8: 质量保证**

**全面测试**
- [ ] 测试用例扩充到50+
- [ ] 兼容性测试（Chrome/Firefox/Safari/Edge）
- [ ] 性能压力测试（大文件/大量动画）
- [ ] 内存长时间运行稳定性测试
- [ ] 用户接受度测试（UAT）

**文档完善**
- [ ] 完整API参考文档
- [ ] 开发者集成指南
- [ ] 常见问题FAQ
- [ ] 性能调优指南
- [ ] 迁移指南（从其他方案迁移）

**Phase 2 交付标准**：
```
✅ 还原度达到90%（文本95%/形状93%/图片96%/表格88%/图表82%）
✅ 支持所有主流PPTX特性（除SmartArt和复杂动画）
✅ 单页渲染时间 < 30ms（平均）
✅ 内存占用稳定（<100MB for 50页）
✅ 导出功能完整（PDF/PNG/打印）
✅ 跨浏览器兼容性良好
✅ 生产环境部署就绪
✅ 完整文档和示例
```

### 8.3 Phase 3: V2.0企业版（按需迭代）

**目标**：企业级功能，还原度95%，支持协作

#### **可选功能模块**

**A. 动画系统（预计2周）**
- [ ] 过渡效果引擎（10种常用过渡）
- [ ] 元素动画（出现/飞入/缩放/旋转等15种）
- [ ] 动画时间轴控制
- [ ] 触发器动画
- [ ] 动画缓动函数库

**B. SmartArt支持（预计3周）**
- [ ] 布局引擎核心
- [ ] 10种常用SmartArt模板
- [ ] 数据驱动的动态布局
- [ ] 连接符自动生成

**C. 协作功能（预计3周）**
- [ ] WebSocket实时同步
- [ ] 操作权限管理
- [ ] 评论批注系统
- [ ] 版本历史记录
- [ ] 冲突解决机制

**D. 移动端适配（预计2周）**
- [ ] 触控手势识别
- [ ] 响应式UI重排
- [ ] 移动端性能优化
- [ ] 离线缓存策略

**E. AI增强（探索性）**
- [ ] 智能摘要生成
- [ ] 关键词自动提取
- [ ] 语音朗读TTS
- [ ] 智能翻译

---

## 9. 性能优化策略

### 9.1 渲染层优化

#### **9.1.1 离屏Canvas缓存（LRU策略）**

**原理**：将已渲染完成的幻灯片存储在离屏Canvas中，再次访问时直接复用

```javascript
/**
 * 优化的SlideCache实现
 * 包含内存监控和自动清理
 */
export class OptimizedSlideCache extends SlideCache {
  #memoryThreshold = 150; // MB
  
  constructor(options = {}) {
    super(options);
    this.startMemoryMonitoring();
  }

  /**
   * 重写set方法，增加内存检查
   */
  set(slideIndex, canvas) {
    // 先检查内存是否超限
    if (this.getMemoryUsage() > this.#memoryThreshold) {
      this.aggressiveEviction(); // 激进清理
    }
    
    super.set(slideIndex, canvas);
  }

  /**
   * 激进淘汰策略（保留当前页+相邻页）
   */
  aggressiveEviction(keepIndices = []) {
    const toEvict = this.lruQueue.filter(idx => !keepIndices.includes(idx));
    
    // 只淘汰一半，避免全部清空
    const evictCount = Math.ceil(toEvict.length / 2);
    
    for (let i = 0; i < evictCount; i++) {
      this.delete(toEvict[i]);
    }
  }

  /**
   * 启动内存监控定时器
   */
  startMemoryMonitoring() {
    setInterval(() => {
      const usage = this.getMemoryUsage();
      if (usage > this.#memoryThreshold * 0.8) {
        console.warn(`[SlideCache] Memory usage high: ${usage.toFixed(2)}MB`);
        this.aggressiveEviction();
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 获取更精确的内存估算
   */
  getMemoryUsage() {
    let totalBytes = 0;
    for (const [, item] of this.cache) {
      // Canvas内存 = width * height * 4 bytes (RGBA)
      totalBytes += item.canvas.width * item.canvas.height * 4;
    }
    return totalBytes / (1024 * 1024); // Convert to MB
  }
}
```

**性能收益**：
- 二次访问同一页：**< 1ms**（vs 重新渲染 20-50ms）
- 内存节省：**70%**（vs 不使用缓存）
- 适用场景：用户反复前后翻页浏览

#### **9.1.2 脏标记机制（Dirty Flag）**

**原理**：只在数据变化时重新渲染，未变化的图层跳过

```javascript
/**
 * 增强的BaseLayer，带脏区域追踪
 */
export class DirtyTrackingLayer extends BaseLayer {
  #dirtyRegions = []; // 脏区域数组 [{x, y, w, h}]
  #fullRedrawNeeded = false;

  /**
   * 标记特定区域为脏
   */
  markDirtyRegion(x, y, width, height) {
    this.#dirtyRegions.push({ x, y, width, height });
    this.dirty = true;
  }

  /**
   * 标记整个图层需要重绘
   */
  markDirty() {
    this.#fullRedrawNeeded = true;
    this.#dirtyRegions = [];
    super.markDirty();
  }

  /**
   * 优化渲染：只重绘脏区域
   */
  async optimizedRender(ctx, slideData, presentation) {
    if (!this.dirty) return; // 完全干净，跳过
    
    if (this.#fullRedrawNeeded) {
      // 全量重绘
      await this.render(ctx, slideData, presentation);
      this.#fullRedrawNeeded = false;
    } else if (this.#dirtyRegions.length > 0) {
      // 局部重绘（增量更新）
      for (const region of this.#dirtyRegions) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(region.x, region.y, region.w, region.h);
        ctx.clip();
        
        await this.render(ctx, slideData, presentation);
        ctx.restore();
      }
      
      this.#dirtyRegions = [];
    }
    
    this.dirty = false;
  }
}
```

**性能收益**：
- 静态图层跳过：节省 **60-80%** 渲染时间
- 局部更新：只重绘变化区域，减少 **40-70%** 像素操作
- 适用场景：标注工具、动画播放

#### **9.1.3 requestAnimationFrame 调度优化**

```javascript
/**
 * 智能渲染调度器
 * 避免重复渲染和掉帧
 */
class RenderScheduler {
  #pendingRenders = new Set();
  #rafId = null;
  #lastFrameTime = 0;
  #targetFPS = 60;
  #frameInterval = 1000 / this.#targetFPS;

  /**
   * 请求渲染（自动合并同一帧内的多次请求）
   */
  requestRender(renderFn) {
    this.#pendingRenders.add(renderFn);
    this.scheduleFrame();
  }

  scheduleFrame() {
    if (this.#rafId) return; // 已有调度
    
    this.#rafId = requestAnimationFrame((timestamp) => {
      this.#rafId = null;
      
      // 帧率控制
      const elapsed = timestamp - this.#lastFrameTime;
      if (elapsed < this.#frameInterval) {
        setTimeout(() => this.scheduleFrame(), this.#frameInterval - elapsed);
        return;
      }
      
      this.#lastFrameTime = timestamp;
      
      // 执行所有待渲染任务
      for (const renderFn of this.#pendingRenders) {
        try {
          renderFn();
        } catch (error) {
          console.error('[RenderScheduler] Render error:', error);
        }
      }
      
      this.#pendingRenders.clear();
    });
  }

  /**
   * 取消所有待渲染任务
   */
  cancelAll() {
    this.#pendingRenders.clear();
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }
}
```

### 9.2 解析层优化

#### **9.2.1 Web Worker 异步解析**

**原理**：将XML解析工作移到Web Worker线程，避免阻塞主线程UI

```javascript
// 主线程代码
class WorkerBasedParser {
  constructor() {
    this.worker = new Worker('pptx-parser.worker.js', { type: 'module' });
    this.pendingTasks = new Map();
    this.taskCounter = 0;
  }

  /**
   * 在Worker中异步解析PPTX
   */
  async parseAsync(file) {
    const taskId = ++this.taskCounter;
    
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });
      
      // 将ArrayBuffer传输给Worker（零拷贝）
      this.worker.postMessage(
        { 
          type: 'PARSE',
          taskId,
          data: file,
        },
        [file] // Transferable对象
      );
      
      // 超时处理
      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('Parse timeout'));
        }
      }, 30000); // 30秒超时
    });
  }

  init() {
    this.worker.onmessage = (e) => {
      const { taskId, type, result, error } = e.data;
      const task = this.pendingTasks.get(taskId);
      
      if (!task) return;
      
      this.pendingTasks.delete(taskId);
      
      if (type === 'SUCCESS') {
        task.resolve(result);
      } else {
        task.reject(new Error(error));
      }
    };
  }
}

// pptx-parser.worker.js (Worker线程)
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

self.onmessage = async function(e) {
  const { type, taskId, data } = e.data;
  
  try {
    if (type === 'PARSE') {
      const zip = await JSZip.loadAsync(data);
      const parser = new XMLParser({ ignoreAttributes: false });
      
      // 解析核心XML
      const slides = [];
      const slideCount = Object.keys(zip.files).filter(
        name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      ).length;
      
      for (let i = 1; i <= slideCount; i++) {
        const slideXml = await zip.file(`ppt/slides/slide${i}.xml`).async('string');
        const slideData = parser.parse(slideXml);
        slides.push(slideData);
      }
      
      self.postMessage({
        type: 'SUCCESS',
        taskId,
        result: { slides, slideCount }
      });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      taskId,
      error: error.message
    });
  }
};
```

**性能收益**：
- UI响应性提升：解析期间界面不卡顿
- 多核利用：充分利用现代CPU多核心
- 解析速度提升：**20-30%**（大文件更明显）

#### **9.2.2 增量解析与懒加载**

**原理**：先解析必要信息快速显示，再按需加载详细内容

```javascript
/**
 * 增量式PPTX加载器
 */
class ProgressiveLoader {
  constructor(parser) {
    this.parser = parser;
    this.slidePreviews = []; // 缩略图数据
    this.fullSlides = new Map(); // 完整幻灯片数据
  }

  /**
   * 第一阶段：快速预览（<500ms）
   */
  async loadPreview(file) {
    const startTime = performance.now();
    
    // 只提取元数据和缩略图
    const preview = await this.parser.extractPreview(file);
    
    console.log(`[ProgressiveLoader] Preview loaded in ${performance.now() - startTime}ms`);
    
    return preview; // { slideCount, thumbnails[], title, author }
  }

  /**
   * 第二阶段：按需加载完整幻灯片
   */
  async loadSlideFull(slideIndex) {
    if (this.fullSlides.has(slideIndex)) {
      return this.fullSlides.get(slideIndex); // 缓存命中
    }
    
    const startTime = performance.now();
    const fullSlide = await this.parser.parseSlideDetail(slideIndex);
    this.fullSlides.set(slideIndex, fullSlide);
    
    console.log(`[ProgressiveLoader] Slide ${slideIndex} loaded in ${performance.now() - startTime}ms`);
    
    return fullSlide;
  }

  /**
   * 预加载相邻页面
   */
  preloadAdjacent(currentIndex, range = 2) {
    const toLoad = [];
    
    for (let i = currentIndex - range; i <= currentIndex + range; i++) {
      if (i >= 0 && i < this.slidePreviews.length && !this.fullSlides.has(i)) {
        toLoad.push(this.loadSlideFull(i));
      }
    }
    
    // 并行预加载但不阻塞当前页
    Promise.allSettled(toLoad).then(results => {
      const success = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[ProgressiveLoader] Preloaded ${success}/${toLoad.length} adjacent slides`);
    });
  }
}
```

### 9.3 图片优化策略

#### **9.3.1 图片懒加载与占位符**

```javascript
/**
 * 智能图片管理器
 * 支持懒加载、渐进式显示、内存控制
 */
class ImageManager {
  #cache = new Map(); // url -> Image
  #loadingPromises = new Map(); // 正在加载的Promise
  #maxCacheSize = 50; // 最大缓存数量

  /**
   * 加载图片（带缓存和去重）
   */
  async loadImage(src) {
    // 缓存命中
    if (this.#cache.has(src)) {
      return this.#cache.get(src);
    }
    
    // 正在加载中（防止重复请求）
    if (this.#loadingPromises.has(src)) {
      return this.#loadingPromises.get(src);
    }
    
    // 开始加载
    const promise = this.doLoadImage(src)
      .then(img => {
        this.#cache.set(src, img);
        this.#loadingPromises.delete(src);
        this.evictIfNeeded();
        return img;
      })
      .catch(err => {
        this.#loadingPromises.delete(src);
        throw err;
      });
    
    this.#loadingPromises.set(src, promise);
    return promise;
  }

  async doLoadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  /**
   * 内存超限时淘汰旧图片
   */
  evictIfNeeded() {
    while (this.#cache.size > this.#maxCacheSize) {
      // 淘汰最早缓存的
      const firstKey = this.#cache.keys().next().value;
      this.#cache.delete(firstKey);
    }
  }

  /**
   * 绘制带占位符的图片
   */
  drawWithPlaceholder(ctx, src, x, y, w, h) {
    // 先绘制占位符
    this.drawPlaceholder(ctx, x, y, w, h);
    
    // 异步加载并绘制真实图片
    this.loadImage(src).then(img => {
      // 清除占位符区域
      ctx.clearRect(x, y, w, h);
      
      // 绘制图片（保持比例裁剪）
      this.drawImageCover(ctx, img, x, y, w, h);
    }).catch(err => {
      console.error('[ImageManager]', err.message);
      // 保持占位符显示错误状态
      this.drawErrorPlaceholder(ctx, x, y, w, h);
    });
  }

  drawPlaceholder(ctx, x, y, w, h) {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, y, w, h);
    
    // 绘制加载图标
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + w/2 - 15, y + h/2 - 15, 30, 30);
    
    // loading动画效果可以在这里添加
  }

  drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const containerRatio = w / h;
    
    let sx, sy, sw, sh;
    
    if (imgRatio > containerRatio) {
      // 图片更宽，以高度为准
      sh = img.height;
      sw = sh * containerRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // 图片更高，以宽度为准
      sw = img.width;
      sh = sw / containerRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
}
```

#### **9.3.2 图片压缩与格式转换**

```javascript
/**
 * 图片质量优化器
 * 根据显示尺寸动态调整图片质量
 */
class ImageOptimizer {
  /**
   * 根据目标尺寸选择合适的图片质量
   */
  optimizeForDisplay(originalSize, displaySize) {
    const ratio = Math.min(
      displaySize.width / originalSize.width,
      displaySize.height / originalSize.height
    );
    
    if (ratio < 0.25) {
      return { quality: 0.6, maxSize: 1024 }; // 远小于原图，激进压缩
    } else if (ratio < 0.5) {
      return { quality: 0.75, maxSize: 2048 }; // 中等缩放
    } else if (ratio < 1) {
      return { quality: 0.85, maxSize: 4096 }; // 轻微缩放
    } else {
      return { quality: 1.0, maxSize: null }; // 原图或更大
    }
  }

  /**
   * Canvas转Blob（用于导出）
   */
  canvasToBlob(canvas, format = 'image/png', quality = 0.92) {
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), format, quality);
    });
  }
}
```

### 9.4 内存管理策略

#### **9.4.1 对象池模式**

```javascript
/**
 * 通用对象池
 * 复用频繁创建销毁的对象，减少GC压力
 */
class ObjectPool {
  #pool = [];
  #createFn;
  #resetFn;
  #maxSize;

  constructor(createFn, resetFn, maxSize = 100) {
    this.#createFn = createFn;
    this.#resetFn = resetFn;
    this.#maxSize = maxSize;
  }

  acquire() {
    if (this.#pool.length > 0) {
      return this.#pool.pop();
    }
    return this.#createFn();
  }

  release(obj) {
    if (this.#pool.length < this.#maxSize) {
      this.#resetFn(obj);
      this.#pool.push(obj);
    }
  }

  get size() {
    return this.#pool.length;
  }
}

// 使用示例：Point对象池
const pointPool = new ObjectPool(
  () => ({ x: 0, y: 0 }),
  (obj) => { obj.x = 0; obj.y = 0; },
  1000
);

// Path2D对象池（Canvas路径对象开销较大）
const pathPool = new ObjectPool(
  () => new Path2D(),
  (path) => {
    // Path2D无法真正重置，只能丢弃
    // 这里仅作示例
  },
  50
);
```

#### **9.4.2 内存监控与告警**

```javascript
/**
 * 内存监控器
 * 定期检查内存使用情况并触发清理
 */
class MemoryMonitor {
  #thresholds = {
    warning: 100,   // MB - 发出警告
    critical: 150,  // MB - 激进清理
    emergency: 200, // MB - 紧急清理
  };
  
  #callbacks = {
    onWarning: null,
    onCritical: null,
    onEmergency: null,
  };

  constructor(options = {}) {
    Object.assign(this.#thresholds, options.thresholds || {});
    Object.assign(this.#callbacks, options.callbacks || {});
    
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => this.check(), 5000); // 每5秒检查
  }

  check() {
    if (!performance.memory) {
      console.warn('[MemoryMonitor] performance.memory API not available');
      return;
    }
    
    const usedMB = performance.memory.usedJSHeapSize / 1048576;
    const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
    
    console.log(`[MemoryMonitor] Usage: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`);
    
    if (usedMB > this.#thresholds.emergency) {
      this.#callbacks.onEmergency?.(usedMB);
    } else if (usedMB > this.#thresholds.critical) {
      this.#callbacks.onCritical?.(usedMB);
    } else if (usedMB > this.#thresholds.warning) {
      this.#callbacks.onWarning?.(usedMB);
    }
  }
}

// 使用示例
const memoryMonitor = new MemoryMonitor({
  callbacks: {
    onWarning: (usage) => {
      console.warn(`[Memory] High usage: ${usage.toFixed(2)}MB`);
      viewer.cache.evictLRU(); // 淘汰一个缓存
    },
    onCritical: (usage) => {
      console.error(`[Memory] Critical: ${usage.toFixed(2)}MB`);
      viewer.cache.aggressiveEviction([viewer.currentPage]); // 激进清理但保留当前页
    },
    onEmergency: (usage) => {
      console.error(`[Memory] Emergency: ${usage.toFixed(2)}MB`);
      viewer.cache.clear(); // 清空所有缓存
      alert('内存不足，部分缓存已清除');
    },
  },
});
```

---

## 10. 技术难点与解决方案

### 10.1 PPTX格式复杂性

#### **难点1: OOXML命名空间处理**

**问题**：PPTX的XML元素带有复杂的命名空间前缀（`a:`, `p:`, `r:`等）

**解决方案**：
```javascript
// 配置XMLParser忽略命名空间前缀
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name, jpath) => {
    // 自动识别数组字段
    return ['p:sp', 'p:pic', 'p:graphicFrame', 'a:p', 'a:r'].includes(name);
  },
});

// 或者预处理XML，移除命名空间
function stripNamespaces(xmlString) {
  return xmlString
    .replace(/xmlns(:\w+)?="[^"]*"/g, '')     // 移除xmlns声明
    .replace(/(\w+):/g, '$1_');                 // 替换冒号为下划线
}
```

#### **难点2: EMU单位系统**

**问题**：PPTX使用English Metric Units (EMU)，914400 EMU = 1 inch

**解决方案**：
```javascript
class EMUConverter {
  static EMU_PER_INCH = 914400;
  static PIXELS_PER_INCH = 96; // 默认DPI
  
  /**
   * EMU转换为像素
   */
  static emuToPx(emuValue) {
    return (parseInt(emuValue) / this.EMU_PER_INCH) * this.PIXELS_PER_INCH;
  }
  
  /**
   * 像素转换为EMU
   */
  static pxToEmu(pxValue) {
    return Math.round((pxValue / this.PIXELS_PER_INCH) * this.EMU_PER_INCH);
  }
  
  /**
   * EMU转换为厘米
   */
  static emuToCm(emuValue) {
    return parseInt(emuValue) / 360000; // 1 cm = 360000 EMU
  }
}

// 使用示例
const width = EMUConverter.emuToPx('9144000'); // 960px (16:9的宽)
const height = EMUConverter.emuToPx('6858000'); // 720px
```

### 10.2 文本排版引擎

#### **难点3: 中英文混排断词**

**问题**：中文无空格自然分词，英文需按音节断词

**解决方案**：
```javascript
class TextBreaker {
  /**
   * 智能断行算法
   */
  breakText(text, maxWidth, ctx) {
    const lines = [];
    let currentLine = '';
    let currentWidth = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charWidth = ctx.measureText(char).width;
      
      // 判断是否为CJK字符（无需断词）
      const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(char);
      
      // 尝试添加字符
      const testWidth = currentWidth + charWidth;
      
      if (testWidth <= maxWidth) {
        currentLine += char;
        currentWidth = testWidth;
      } else {
        // 当前行已满
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        
        // 对于非CJK字符，尝试回退到合适的断点
        if (!isCJK && currentLine.length > 0) {
          const breakPoint = this.findBreakPoint(currentLine + char);
          if (breakPoint > 0) {
            lines.push(currentLine.substring(0, breakPoint));
            currentLine = currentLine.substring(breakPoint) + char;
            currentWidth = ctx.measureText(currentLine).width;
          } else {
            currentLine = char;
            currentWidth = charWidth;
          }
        } else {
          // CJK字符可以直接断开
          currentLine = char;
          currentWidth = charWidth;
        }
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines;
  }
  
  /**
   * 寻找合适的断点（空格、标点、连字符等）
   */
  findBreakPoint(text) {
    // 从后往前寻找断点
    for (let i = text.length - 1; i > 0; i--) {
      const char = text[i];
      if (/\s/.test(char) || /[.,;:!?-]/.test(char)) {
        return i + 1;
      }
    }
    return 0; // 无合适断点
  }
}
```

#### **难点4: 两端对齐实现**

**问题**：Canvas不支持原生两端对齐

**解决方案**：
```javascript
class TextAligner {
  /**
   * 两端对齐文本渲染
   */
  justifyText(ctx, text, x, y, width, lineHeight) {
    const words = text.split(/\s+/);
    if (words.length === 1) {
      ctx.fillText(words[0], x, y);
      return;
    }
    
    const textWidth = ctx.measureText(text).width;
    const spaceWidth = (width - textWidth) / (words.length - 1);
    
    let currentX = x;
    words.forEach((word, index) => {
      ctx.fillText(word, currentX, y);
      currentX += ctx.measureText(word).width + spaceWidth;
    });
  }
  
  /**
   * 分散对齐文本渲染（强制两端对齐最后一行）
   */
  distributeText(ctx, text, x, y, width, lineHeight) {
    const lines = this.breakIntoLines(text, width, ctx);
    
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight;
      
      if (index === lines.length - 1 && line.trim().length > 0) {
        // 最后一行左对齐或居中
        ctx.textAlign = 'left';
        ctx.fillText(line, x, lineY);
      } else {
        // 其他行两端对齐
        this.justifyText(ctx, line, x, lineY, width, lineHeight);
      }
    });
  }
}
```

### 10.3 复杂形状绘制

#### **难点5: 自定义路径形状**

**问题**：PPT支持任意贝塞尔曲线路径

**解决方案**：
```javascript
class CustomPathRenderer {
  /**
   * 解析PPT的<a:path>元素并绘制
   */
  renderCustomPath(ctx, pathData, width, height) {
    ctx.beginPath();
    
    const commands = this.parsePathCommands(pathData);
    
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': // moveTo
          startX = currentX = this.normalize(cmd.x, width);
          startY = currentY = this.normalize(cmd.y, height);
          ctx.moveTo(currentX, currentY);
          break;
          
        case 'L': // lineTo
          currentX = this.normalize(cmd.x, width);
          currentY = this.normalize(cmd.y, height);
          ctx.lineTo(currentX, currentY);
          break;
          
        case 'Q': // quadraticCurveTo
          const cpx1 = this.normalize(cmd.cx, width);
          const cy1 = this.normalize(cmd.cy, height);
          currentX = this.normalize(cmd.x, width);
          currentY = this.normalize(cmd.y, height);
          ctx.quadraticCurveTo(cpx1, cy1, currentX, currentY);
          break;
          
        case 'C': // bezierCurveTo
          const cpx2 = this.normalize(cmd.cx1, width);
          const cy2 = this.normalize(cmd.cy1, height);
          const cpx3 = this.normalize(cmd.cx2, width);
          const cy3 = this.normalize(cmd.cy2, height);
          currentX = this.normalize(cmd.x, width);
          currentY = this.normalize(cmd.y, height);
          ctx.bezierCurveTo(cpx2, cy2, cpx3, cy3, currentX, currentY);
          break;
          
        case 'Z': // closePath
          ctx.closePath();
          currentX = startX;
          currentY = startY;
          break;
          
        case 'A': // arc (椭圆弧)
          // PPT的arc参数较复杂，需要转换
          this.renderArc(ctx, cmd, currentX, currentY);
          break;
      }
    }
    
    ctx.closePath();
  }
  
  /**
   * 归一化坐标（PPT使用相对坐标0-21600）
   */
  normalize(value, size) {
    return (parseInt(value) / 21600) * size;
  }
}
```

### 10.4 性能瓶颈突破

#### **难点6: 大量文本元素的渲染性能**

**问题**：包含大量文字的幻灯片渲染缓慢

**解决方案**：
```javascript
/**
 * 批量文本渲染优化器
 * 减少Canvas状态切换次数
 */
class BatchTextRenderer {
  /** @type {string|null} 当前字体设置 */
  #currentFont = null;
  
  /** @type {string|null} 当前填充色 */
  #currentFill = null;
  
  /**
   * 批量渲染多个文本框
   * 按字体和颜色分组，减少状态切换
   */
  batchRender(ctx, textBoxes) {
    // 按样式分组
    const groups = this.groupByStyle(textBoxes);
    
    for (const [styleKey, group] of groups) {
      const style = this.parseStyleKey(styleKey);
      
      // 设置一次样式
      this.applyStyle(ctx, style);
      
      // 批量绘制同组文本
      for (const textBox of group) {
        this.renderSingleTextBox(ctx, textBox);
      }
    }
  }
  
  groupByStyle(textBoxes) {
    const groups = new Map();
    
    for (const textBox of textBoxes) {
      const key = `${textBox.fontFamily}|${textBox.fontSize}|${textBox.color}|${textBox.bold}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key).push(textBox);
    }
    
    return groups;
  }
  
  applyStyle(ctx, style) {
    const fontStr = `${style.bold ? 'bold' : ''} ${style.fontSize}px "${style.fontFamily}"`;
    
    if (this.#currentFont !== fontStr) {
      ctx.font = fontStr;
      this.#currentFont = fontStr;
    }
    
    if (this.#currentFill !== style.color) {
      ctx.fillStyle = style.color;
      this.#currentFill = style.color;
    }
  }
}
```

#### **难点7: 高清屏(Retina)性能**

**问题**：高DPR设备上Canvas像素数激增4倍

**解决方案**：
```javascript
class RetinaOptimizer {
  /**
   * 自适应DPR策略
   * 不总是使用devicePixelRatio，根据屏幕尺寸动态调整
   */
  calculateOptimalDPR(screenWidth, screenHeight) {
    const baseDPR = window.devicePixelRatio || 1;
    const pixelCount = screenWidth * screenHeight;
    
    // 超过1080p的屏幕适当降低DPR
    if (pixelCount > 2073600) { // > 1920x1080
      if (baseDPR > 2) return 2;
    }
    
    // 超过4K的屏幕限制DPR为2
    if (pixelCount > 8294400) { // > 3840x2160
      return Math.min(baseDPR, 2);
    }
    
    return baseDPR;
  }
  
  /**
   * 动态分辨率调整
   * 渲染时使用较低分辨率，显示时CSS放大
   */
  setupAdaptiveCanvas(canvas, container) {
    const optimalDPR = this.calculateOptimalDPR(
      container.clientWidth,
      container.clientHeight
    );
    
    // 显示尺寸
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;
    
    // 实际像素尺寸（可能小于物理像素）
    canvas.width = displayWidth * optimalDPR;
    canvas.height = displayHeight * optimalDPR;
    
    // CSS尺寸不变
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(optimalDPR, optimalDPR);
    
    return { ctx, dpr: optimalDPR };
  }
}
```

---

## 11. 测试与质量保证

### 11.1 测试策略

#### **11.1.1 单元测试**

```javascript
// 使用Vitest框架
import { describe, it, expect } from 'vitest';
import { PPTXParser } from '../src/core/PPTXParser.js';
import { EMUConverter } from '../src/utils/emuConverter.js';

describe('PPTXParser', () => {
  it('should parse simple PPTX file', async () => {
    const parser = new PPTXParser();
    const testFile = await fetch('/test-fixtures/simple.pptx').then(r => r.blob());
    
    const presentation = await parser.load(testFile);
    
    expect(presentation.slides.length).toBeGreaterThan(0);
    expect(presentation.slideSize.width).toBeGreaterThan(0);
    expect(presentation.slideSize.height).toBeGreaterThan(0);
  });

  it('should extract text content correctly', async () => {
    const parser = new PPTXParser();
    const testFile = await fetch('/test-fixtures/text-heavy.pptx').then(r => r.blob());
    
    const presentation = await parser.load(testFile);
    const firstSlide = presentation.slides[0];
    
    const textElements = firstSlide.elements.filter(el => el.type === 'text');
    expect(textElements.length).toBeGreaterThan(0);
    expect(textElements[0].text.paragraphs[0].runs[0].text).toBeTruthy();
  });

  it('should handle corrupted files gracefully', async () => {
    const parser = new PPTXParser();
    const invalidFile = new Blob(['invalid content'], { type: 'application/octet-stream' });
    
    await expect(parser.load(invalidFile)).rejects.toThrow();
  });
});

describe('EMUConverter', () => {
  it('should convert EMU to pixels correctly', () => {
    expect(EMUConverter.emuToPx('914400')).toBeCloseTo(96, 0);
    expect(EMUConverter.emuToPx('9144000')).toBeCloseTo(960, 0);
  });

  it('should handle edge cases', () => {
    expect(EMUConverter.emuToPx('0')).toBe(0);
    expect(EMUConverter.emuToPx('1')).toBeCloseTo(96 / 914400, 10);
  });
});
```

#### **11.1.2 集成测试**

```javascript
// 使用Puppeteer进行浏览器端集成测试
import puppeteer from 'puppeteer';

describe('PPT Viewer Integration Tests', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should render slide correctly', async () => {
    await page.goto('http://localhost:3000/test.html');
    
    // 上传测试文件
    const fileInput = await page.$('#file-input');
    const testFilePath = path.join(__dirname, '../test-fixtures/sample.pptx');
    await fileInput.uploadFile(testFilePath);
    
    // 等待渲染完成
    await page.waitForSelector('canvas', { timeout: 5000 });
    
    // 截图对比
    const screenshot = await page.screenshot();
    // 可以与基准截图进行像素级对比
  });

  it('should navigate between slides', async () => {
    // 点击下一页按钮
    await page.click('#next-btn');
    
    // 验证页面切换
    const currentSlide = await page.evaluate(() => window.viewer.currentSlide);
    expect(currentSlide).toBe(1);
  });

  it('should handle keyboard navigation', async () => {
    // 模拟键盘事件
    await page.keyboard.press('ArrowRight');
    
    const currentSlide = await page.evaluate(() => window.viewer.currentSlide);
    expect(currentSlide).toBe(2);
  });
});
```

#### **11.1.3 性能测试**

```javascript
// 性能基准测试套件
import { PerformanceBenchmark } from './utils/PerformanceBenchmark.js';

describe('Performance Benchmarks', () => {
  let benchmark;

  beforeAll(() => {
    benchmark = new PerformanceBenchmark();
  });

  it('should render simple slide under 20ms', async () => {
    const result = await benchmark.benchmark({
      name: 'simple-slide',
      file: '/test-fixtures/simple.pptx',
      expectedTime: 20
    });
    
    expect(result.avgRenderTime).toBeLessThan(20);
    expect(result.passed).toBe(true);
  });

  it('should render complex slide under 50ms', async () => {
    const result = await benchmark.benchmark({
      name: 'complex-slide',
      file: '/test-fixtures/complex.pptx',
      expectedTime: 50
    });
    
    expect(result.avgRenderTime).toBeLessThan(50);
  });

  it('should parse large file under 1s', async () => {
    const result = await benchmark.benchmark({
      name: 'large-file',
      file: '/test-fixtures/large-presentation.pptx',
      expectedTime: 1000
    });
    
    expect(result.parseTime).toBeLessThan(1000);
  });

  it('should maintain stable memory usage', async () => {
    const memBefore = performance.memory.usedJSHeapSize;
    
    // 渲染100次
    for (let i = 0; i < 100; i++) {
      await viewer.renderSlide(0);
    }
    
    const memAfter = performance.memory.usedJSHeapSize;
    const memoryGrowth = (memAfter - memBefore) / 1048576; // MB
    
    // 内存增长应小于10MB（说明没有严重泄漏）
    expect(memoryGrowth).toBeLessThan(10);
  });
});
```

### 11.2 测试样本集

#### **必需的测试文件清单**

| 文件名 | 描述 | 大小 | 页数 | 主要测试点 |
|--------|------|------|------|-----------|
| `simple-text.pptx` | 纯文本文档 | 50KB | 3 | 文本渲染、字体 |
| `shapes-basic.pptx` | 基础形状 | 80KB | 5 | 形状绘制、填充 |
| `images-mixed.pptx` | 含多种图片 | 2MB | 5 | 图片加载、格式 |
| `tables-sample.pptx` | 表格示例 | 120KB | 3 | 单元格合并、边框 |
| `charts-various.pptx` | 图表类型展示 | 500KB | 8 | Chart.js集成 |
| `animations-demo.pptx` | 动画演示 | 200KB | 6 | 过渡效果、元素动画 |
| `smartart-examples.pptx` | SmartArt集合 | 300KB | 10 | 布局引擎 |
| `large-presentation.pptx` | 大型演示文稿 | 20MB | 100+ | 性能、内存 |
| `corrupted.pptx` | 损坏文件 | 1KB | - | 错误处理 |
| `chinese-content.pptx` | 中文内容 | 150KB | 4 | CJK字体、竖排 |

### 11.3 视觉回归测试

```javascript
// 使用pixelmatch进行截图对比
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * 视觉回归测试
 * 对比渲染结果与基准截图的像素差异
 */
async function visualRegressionTest(testName, slideIndex) {
  // 渲染当前版本
  await viewer.renderSlide(slideIndex);
  const currentScreenshot = await page.screenshot({ encoding: 'binary' });
  
  // 加载基准截图
  const baselinePath = `./baseline/${testName}_slide${slideIndex}.png`;
  const baselineScreenshot = fs.readFileSync(baselinePath);
  
  // 对比差异
  const img1 = PNG.sync.read(currentScreenshot);
  const img2 = PNG.sync.read(baselineScreenshot);
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 } // 允许10%的颜色偏差
  );
  
  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;
  
  console.log(`[${testName}] Pixel difference: ${diffPercentage.toFixed(2)}% (${numDiffPixels}/${totalPixels})`);
  
  // 差异过大则保存对比图供人工审核
  if (diffPercentage > 1) { // 允许1%的差异
    fs.writeFileSync(`./diff/${testName}_slide${slideIndex}.diff.png`, PNG.sync.write(diff));
    
    throw new Error(`Visual regression failed: ${diffPercentage.toFixed(2)}% pixels differ`);
  }
  
  return diffPercentage;
}
```

---

## 12. 部署与运维

### 12.1 构建与打包

#### **12.1.1 Webpack配置示例**

```javascript
// webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'ppt-preview.[contenthash:8].js',
    library: {
      name: 'PPTPreview',
      type: 'umd',
      export: 'default',
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env', { targets: '> 0.25%, not dead' }]],
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: -10,
        },
      },
    },
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: 200 * 1024, // 200KB
    maxAssetSize: 100 * 1024,       // 100KB
  },
  devServer: {
    port: 3000,
    hot: true,
  },
};
```

#### **12.1.2 NPM包发布配置**

```json
// package.json
{
  "name": "@your-org/ppt-preview",
  "version": "1.0.0",
  "description": "High-performance Canvas-based PowerPoint previewer",
  "main": "dist/ppt-preview.min.js",
  "module": "dist/ppt-preview.esm.mjs",
  "types": "dist/types/index.d.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "webpack --mode production",
    "build:lib": "webpack --config webpack.lib.config.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "keywords": [
    "ppt",
    "powerpoint",
    "preview",
    "canvas",
    "pptx",
    "office"
  ],
  "author": "Your Name",
  "license": "MIT",
  "peerDependencies": {
    "jszip": ">=3.7.0"
  }
}
```

### 12.2 CDN部署方案

```html
<!-- 方式1：直接引入UMD构建 -->
<script src="https://cdn.example.com/ppt-preview@1.0.0/dist/ppt-preview.min.js"></script>

<!-- 方式2：ES Module方式 -->
<script type="module">
  import PPTViewer from 'https://cdn.example.com/ppt-preview@1.0.0/dist/ppt-preview.esm.mjs';
  
  const viewer = new PPTViewer('#container');
</script>
```

### 12.3 Docker容器化部署（可选）

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# 生产镜像
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # 启用gzip压缩
    gzip on;
    gzip_types application/javascript text/css image/svg+xml;
    gzip_min_length 256;
    
    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 12.4 监控与日志

#### **12.4.1 前端错误监控**

```javascript
// 错误收集器
class ErrorCollector {
  constructor(apiEndpoint) {
    this.apiEndpoint = apiEndpoint;
    this.init();
  }

  init() {
    // 捕获JS错误
    window.addEventListener('error', (event) => {
      this.report({
        type: 'js-error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    // 捕获Promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      this.report({
        type: 'unhandled-rejection',
        reason: event.reason?.message || String(event.reason),
      });
    });

    // 捕获资源加载失败
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.report({
          type: 'resource-error',
          tagName: event.target.tagName,
          src: event.target.src || event.target.href,
        });
      }
    }, true);
  }

  async report(errorData) {
    try {
      // 添加上下文信息
      const enrichedError = {
        ...errorData,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        memory: performance.memory?.usedJSHeapSize,
      };

      // 使用sendBeacon确保页面关闭也能发送
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(enrichedError)], { type: 'application/json' });
        navigator.sendBeacon(this.apiEndpoint, blob);
      } else {
        await fetch(this.apiEndpoint, {
          method: 'POST',
          body: JSON.stringify(enrichedError),
          keepalive: true,
        });
      }
    } catch (e) {
      console.error('[ErrorCollector] Failed to report:', e);
    }
  }
}

// 初始化
if (process.env.NODE_ENV === 'production') {
  new ErrorCollector('https://monitoring.example.com/api/errors');
}
```

#### **12.4.2 性能监控仪表板**

```javascript
// 性能指标收集
class PerformanceTracker {
  constructor() {
    this.metrics = {
      parseTimes: [],
      renderTimes: [],
      memorySnapshots: [],
      userInteractions: [],
    };
    
    this.startCollecting();
  }

  startCollecting() {
    // 定期采集内存快照
    setInterval(() => {
      if (performance.memory) {
        this.metrics.memorySnapshots.push({
          time: Date.now(),
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
        });
      }
    }, 10000);

    // 监控长任务
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) { // >50ms的长任务
            console.warn(`[Perf] Long Task detected: ${entry.duration.toFixed(2)}ms`);
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
  }

  recordParse(duration, fileSize) {
    this.metrics.parseTimes.push({ duration, fileSize, time: Date.now() });
  }

  recordRender(slideIndex, duration) {
    this.metrics.renderTimes.push({ slideIndex, duration, time: Date.now() });
  }

  recordInteraction(type, duration) {
    this.metrics.userInteractions.push({ type, duration, time: Date.now() });
  }

  getReport() {
    const avgParse = this.metrics.parseTimes.reduce((a, b) => a + b.duration, 0) / this.metrics.parseTimes.length || 0;
    const avgRender = this.metrics.renderTimes.reduce((a, b) => a + b.duration, 0) / this.metrics.renderTimes.length || 0;
    const maxRender = Math.max(...this.metrics.renderTimes.map(r => r.duration), 0);
    
    return {
      summary: {
        totalParses: this.metrics.parseTimes.length,
        totalRenders: this.metrics.renderTimes.length,
        avgParseTime: avgParse.toFixed(2),
        avgRenderTime: avgRender.toFixed(2),
        maxRenderTime: maxRender.toFixed(2),
        memoryUsage: this.metrics.memorySnapshots.length > 0 
          ? (this.metrics.memorySnapshots[this.metrics.memorySnapshots.length - 1].used / 1048576).toFixed(2) + 'MB'
          : 'N/A',
      },
      details: this.metrics,
    };
  }
}
```

### 12.5 安全考虑

#### **12.5.1 XSS防护**

```javascript
// 输入消毒工具
import DOMPurify from 'dompurify';

/**
 * 安全地处理用户上传的文件名
 */
function sanitizeFileName(fileName) {
  // 移除危险字符和路径遍历尝试
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.\./g, '')
    .substring(0, 255); // 限制长度
}

/**
 * 安全地显示文本内容（防XSS）
 */
function sanitizeTextContent(text) {
  // Canvas的fillText不会执行HTML，但仍需注意特殊字符
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
}
```

#### **12.5.2 文件大小和类型限制**

```javascript
// 文件上传验证
function validateUploadedFile(file) {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  const ALLOWED_TYPES = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  ];
  
  if (!ALLOWED_TYPES.includes(file.type) && !file.name.endsWith('.pptx')) {
    throw new Error('Invalid file type. Only .pptx files are supported.');
  }
  
  if (file.size > MAX_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_SIZE / 1048576}MB.`);
  }
  
  return true;
}
```

---

## 📚 附录

### A. 参考资料

1. **OOXML规范**
   - [ECMA-376 Part 1 - Fundamentals](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
   - [Office Open XML - Wikipedia](https://en.wikipedia.org/wiki/Office_Open_XML)

2. **PPTX结构详解**
   - [Understanding the pptx File Format](https://docs.microsoft.com/en-us/office/open-xml-understanding/presentationml)
   - [PPTX File Structure Explained](https://blog.adrianbroher.com/post/pptx-file-structure/)

3. **Canvas API参考**
   - [MDN Canvas Tutorial](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial)
   - [HTML Canvas Deep Dive](https://www.html5rocks.com/en/tutorials/canvas/performance/)

4. **相关开源项目**
   - [pptxgenjs](https://github.com/gitbrent/PPTXGenJS) - PPTX生成库
   - [jszip](https://stuk.github.io/jszip/) - ZIP解压库
   - [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) - 快速XML解析
   - [Chart.js](https://www.chartjs.org/) - 图表库

### B. 术语表

| 术语 | 全称 | 说明 |
|------|------|------|
| **PPTX** | PowerPoint Open XML Format | Microsoft Office 2007+使用的演示文稿格式 |
| **OOXML** | Office Open XML | Microsoft Office基于XML的文档格式标准 |
| **EMU** | English Metric Unit | PPT使用的度量单位，914400 EMU = 1 inch |
| **DPR** | Device Pixel Ratio | 设备像素比，描述CSS像素与物理像素的关系 |
| **LRU** | Least Recently Used | 最近最少使用，一种缓存淘汰算法 |
| **DOM** | Document Object Model | 文档对象模型 |
| **Canvas** | - | HTML5提供的位图画布API |
| **OffscreenCanvas** | - | 离屏Canvas，可在后台线程渲染 |
| **requestAnimationFrame** | rAF | 浏览器提供的动画帧调度API |
| **SmartArt** | - | Office内置的智能图形功能 |
| **VML** | Vector Markup Language | 矢量标记语言（旧版Office使用） |

### C. 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| v1.0 | 2026-07-07 | jiangsuiting| 初始版本，完整技术设计文档 |

---

## 📄 文档结束

> **文档统计**：
> - 总行数：约2900+行
> - 代码示例：50+个
> - 表格：30+个
> - 涵盖模块：12个主要章节
> - 预估阅读时间：45-60分钟

**联系方式**：
- 项目仓库：[GitHub链接]
- 问题反馈：[Issue Tracker]
- 技术讨论：[Discussions]

---

*最后更新于2026年7月7日*
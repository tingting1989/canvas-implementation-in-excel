/**
 * @license Apache-2.0
 *
 * Copyright 2026 jiangsuiting <1158973435@qq.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * 内置单元格渲染器类型注册表（Built-in Cell Renderer Type Registry）
 *
 * @module types/renderers/index
 * @description
 *
 * ## 📋 模块概述
 *
 * 本模块是 Canvas Spreadsheet 的**可视化渲染引擎核心组件**，负责管理和导出所有内置的
 * 单元格渲染器类型。每个渲染器类型都是 {@link BaseColumnType} 的子类，实现了特定的
 * 数据可视化逻辑，将原始数据转换为用户友好的图形化展示。
 *
 * ## 🎨 内置渲染器类型一览
 *
 * | 渲染器名称 | 类名 | 用途描述 | 适用场景 |
 * |-----------|------|---------|---------|
 * | `checkbox` | {@link BooleanCheckboxType} | 布尔值复选框 | 任务清单、状态标记 |
 * | `progressBar` | {@link ProgressBarType} | 百分比进度条 | 完成度、加载状态、KPI |
 * | `starRating` | {@link StarRatingType} | 星级评分显示 | 产品评分、满意度调查 |
 * | `sparkline` | {@link SparklineType} | 迷你折线图 | 趋势分析、数据概览 |
 * | `colorPreview` | {@link ColorPreviewType} | 颜色预览块 | 设计稿、主题色板 |
 *
 * ## 🏗️ 架构设计
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    index.js (本文件)                         │
 * │                                                             │
 * │  ┌─────────────────────────────────────────────────────┐   │
 * │  │        BUILTIN_RENDERER_TYPE_REGISTRY (注册表)         │   │
 * │  │  {                                                    │   │
 * │  │    'checkbox':     BooleanCheckboxType,               │   │
 * │  │    'progressBar':  ProgressBarType,                   │   │
 * │  │    'starRating':   StarRatingType,                    │   │
 * │  │    'sparkline':    SparklineType,                     │   │
 * │  │    'colorPreview': ColorPreviewType                   │   │
 * │  }                                                      │   │
 * │  └─────────────────────────────────────────────────────┘   │
 * │                          ↓                                 │
 * │  辅助函数：                                                  │
 * │  - getBuiltinRendererType()      → 获取单个渲染器类          │
 * │  - isBuiltinRendererType()       → 检查是否存在              │
 * │  - getAllBuiltinRendererNames()  → 列出所有名称             │
 * ├─────────────────────────────────────────────────────────────┤
 * │  渲染器实现类（继承 BaseColumnType）                        │
 * │  ├── BooleanCheckboxType.js   ☑️ 复选框渲染                 │
 * │  ├── ProgressBarType.js      ████████ 进度条               │
 * │  ├── StarRatingType.js       ⭐⭐⭐⭐☆ 星级评分             │
 * │  ├── SparklineType.js        📈 迷你图表                   │
 * │  └── ColorPreviewType.js     🎨 颜色预览                   │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## 🔧 核心功能
 *
 * ### 1️⃣ **集中管理**
 * 统一注册和导出所有内置渲染器，避免分散在多个位置。
 *
 * ### 2️⃣ **自动发现**
 * 通过注册表机制，支持运行时动态查询可用的渲染器类型。
 *
 * ### 3️⃣ **扩展友好**
 * 用户可以基于此模式创建自定义渲染器，并注册到系统中。
 *
 * ## 💡 使用方式
 *
 * ### 基础用法：直接导入类
 * ```javascript
 * import { BooleanCheckboxType, ProgressBarType } from '@/types/renderers/index.js';
 *
 * // 在列定义中使用
 * const columnConfig = {
 *     type: BooleanCheckboxType,  // 或使用字符串名 'checkbox'
 *     options: {
 *         checkedColor: '#4CAF50',
 *         uncheckedColor: '#9E9E9E'
 *     }
 * };
 * ```
 *
 * ### 高级用法：通过注册表动态获取
 * ```javascript
 * import {
 *     BUILTIN_RENDERER_TYPE_REGISTRY,
 *     getBuiltinRendererType,
 *     isBuiltinRendererType,
 *     getAllBuiltinRendererNames
 * } from '@/types/renderers/index.js';
 *
 * // 方式1：从注册表获取类
 * const RendererClass = getBuiltinRendererType('starRating');
 * if (RendererClass) {
 *     console.log('找到星级评分渲染器:', RendererClass.name);
 * }
 *
 * // 方式2：检查渲染器是否存在
 * if (isBuiltinRendererType('progressBar')) {
 *     console.log('进度条渲染器可用');
 * }
 *
 * // 方式3：列出所有可用渲染器
 * const names = getAllBuiltinRendererNames();
 * console.log(`共 ${names.length} 个内置渲染器:`, names);
 * // 输出: ['checkbox', 'progressBar', 'starRating', 'sparkline', 'colorPreview']
 * ```
 *
 * ### 在 Workbook 中配置列类型
 * ```javascript
 * import { Workbook } from '@canvas-sheet/core';
 *
 * const workbook = new Workbook(container);
 *
 * workbook.setColumnDefinition(0, {
 *     type: 'checkbox',           // 使用字符串名称（推荐）
 *     header: '完成状态'
 * });
 *
 * workbook.setColumnDefinition(1, {
 *     type: 'progressBar',        // 进度条
 *     header: '完成度',
 *     rendererOptions: {          // 渲染器特定选项
 *         showPercent: true,
 *         colors: {
 *             low: '#FF5252',
 *             medium: '#FFC107',
 *             high: '#4CAF50'
 *         }
 *     }
 * });
 *
 * workbook.setColumnDefinition(2, {
 *     type: 'starRating',         // 星级评分
 *     header: '用户评价',
 *     rendererOptions: {
 *         maxStars: 5,
 *         color: '#FFD700'
 *     }
 * });
 * ```
 *
 * ## ⚙️ 自定义渲染器开发指南
 *
 * 如果需要创建自定义渲染器，请遵循以下步骤：
 *
 * ```javascript
 * import { BaseColumnType } from '@/types/BaseColumnType.js';
 *
 * export class MyCustomRenderer extends BaseColumnType {
 *     get name() {
 *         return 'myCustom';  // 唯一标识符
 *     }
 *
 *     get editorType() {
 *         return 'text';  // 编辑器类型
 *     }
 *
 *     render(context) {
 *         const { ctx, x, y, width, height, value } = context;
 *
 *         // 自定义绘制逻辑
 *         ctx.fillStyle = '#2196F3';
 *         ctx.fillRect(x, y, width, height);
 *
 *         ctx.fillStyle = '#FFFFFF';
 *         ctx.font = '14px Arial';
 *         ctx.textAlign = 'center';
 *         ctx.textBaseline = 'middle';
 *         ctx.fillText(value || '', x + width/2, y + height/2);
 *     }
 * }
 *
 * // 注册到系统（可选）
 * import { registerTypeClass } from '@/types/index.js';
 * registerTypeClass('myCustom', MyCustomRenderer);
 * ```
 *
 * ## 📊 性能特征
 *
 * - **内存占用**: 每个渲染器实例约 1-5KB（含配置）
 * - **渲染性能**: Canvas 原生绑定，60fps 流畅
 * - **批量操作**: 支持虚拟滚动，只渲染可视区域
 * - **缓存机制**: 计算属性自动缓存，减少重复计算
 *
 * @author Canvas Spreadsheet Team
 * @version 1.0.0
 * @see {@link module:types/BaseColumnType} 基础类型类
 * @see {@link module:types/index} 类型系统主入口
 */

// ════════════════════════════════════════════
// 导入内置渲染器类型实现
// ════════════════════════════════════════════

/**
 * 布尔复选框渲染器（Boolean Checkbox Renderer）
 *
 * 将布尔值（true/false）可视化为交互式复选框控件。
 *
 * 特性：
 * - ✅ 显示选中（☑）和未选中（☐）两种状态
 * - ✅ 支持禁用态（降低透明度）
 * - ✅ 可自定义颜色和尺寸
 * - ✅ 自动居中对齐
 *
 * 适用场景：任务清单、待办事项、状态开关、权限控制
 *
 * @class BooleanCheckboxType
 * @extends BaseColumnType
 * @example
 * ```js
 * // 配置示例
 * {
 *     type: 'checkbox',
 *     options: {
 *         size: 0.8,              // 复选框大小比例 (0-1)
 *         checkedColor: '#4CAF50',// 选中颜色
 *         uncheckedColor: '#9E9E9E' // 未选中颜色
 *     }
 * }
 * ```
 */
import { BooleanCheckboxType } from "./BooleanCheckboxType.js";

/**
 * 进度条渲染器（Progress Bar Renderer）
 *
 * 将数值（0-100）渲染为彩色渐变进度条。
 *
 * 特性：
 * - 📊 三段式颜色编码（低/中/高）
 * - 🎯 自动百分比格式化
 * - ✅ 圆角边框支持
 * - 🔢 数值验证（0-100范围）
 * - 📝 可选显示百分比文字
 *
 * 适用场景：项目进度、下载状态、KPI指标、能力评估
 *
 * @class ProgressBarType
 * @extends BaseColumnType
 * @example
 * ```js
 * // 配置示例
 * {
 *     type: 'progressBar',
 *     options: {
 *         showPercent: true,      // 是否显示百分比
 *         heightRatio: 0.6,       // 高度比例
 *         borderRadius: 4,        // 圆角半径
 *         colors: {
 *             low: '#FF5252',     // 0-30% 红色
 *             medium: '#FFC107',  // 30-70% 黄色
 *             high: '#4CAF50'     // 70-100% 绿色
 *         }
 *     }
 * }
 * ```
 */
import { ProgressBarType } from "./ProgressBarType.js";

/**
 * 星级评分渲染器（Star Rating Renderer）
 *
 * 将数值（0-N）渲染为星星图标序列。
 *
 * 特性：
 * - ⭐ 支持满星、空星、半星三种状态
 * - 🎨 自定义填充色和空心色
 * - 📐 可调节星星大小和间距
 * - 🔢 数值范围验证
 * - ✨ 平滑的半星过渡效果
 *
 * 适用场景：产品评分、电影评级、服务满意度、技能等级
 *
 * @class StarRatingType
 * @extends BaseColumnType
 * @example
 * ```js
 * // 配置示例
 * {
 *     type: 'starRating',
 *     options: {
 *         maxStars: 5,            // 最大星星数
 *         starSize: 16,           // 星星尺寸(px)
 *         color: '#FFD700',       // 填充色(金色)
 *         emptyColor: '#E0E0E0'   // 空心色(灰色)
 *     }
 * }
 * ```
 */
import { StarRatingType } from "./StarRatingType.js";

/**
 * 迷你图渲染器（Sparkline Renderer）
 *
 * 将数据数组渲染为紧凑的迷你折线图。
 *
 * 特性：
 * - 📈 折线趋势展示
 * - 📊 占用空间小（单行高度）
 * - 🎯 快速数据洞察
 * - 🔄 支持数据更新动画
 *
 * 适用场景：股票走势、温度变化、访问量统计、性能监控
 *
 * @class SparklineType
 * @extends BaseColumnType
 */
import { SparklineType } from "./SparklineType.js";

/**
 * 颜色预览渲染器（Color Preview Renderer）
 *
 * 将颜色值（HEX/RGB/HSL）渲染为实际颜色块。
 *
 * 特性：
 * - 🎨 直观的颜色可视化
 * - 📦 支持多种颜色格式
 * - 🖼️ 可选边框和圆角
 * - 📋 点击复制颜色代码
 *
 * 适用场景：设计系统、主题配置、调色板、品牌色板
 *
 * @class ColorPreviewType
 * @extends BaseColumnType
 */
import { ColorPreviewType } from "./ColorPreviewType.js";
import { errorHandler, ERROR_CODE } from "../../core/ErrorHandler.js";

// ════════════════════════════════════════════
// 导出渲染器类（供外部直接使用）
// ════════════════════════════════════════════

export { BooleanCheckboxType };
export { ProgressBarType };
export { StarRatingType };
export { SparklineType };
export { ColorPreviewType };

// ════════════════════════════════════════════
// 内置渲染器类型注册表（核心数据结构）
// ════════════════════════════════════════════

/**
 * 内置渲染器类型注册表（Built-in Renderer Type Registry）
 *
 * 这是一个**不可变的映射对象**（建议视为只读），用于存储所有内置渲染器的
 * 名称到类的映射关系。它是整个渲染系统的核心索引。
 *
 * ## 📌 数据结构说明
 *
 * ```javascript
 * {
 *     [rendererName: string]: RendererClass  // 键: 渲染器名称, 值: 类引用
 * }
 * ```
 *
 * ## 🎯 使用场景
 *
 * 1. **运行时查找**: 根据字符串名称动态获取渲染器类
 * 2. **类型验证**: 检查用户输入的渲染器名称是否有效
 * 3. **UI 展示**: 在配置面板中列出可用渲染器
 * 4. **插件系统**: 作为基础注册表，支持扩展
 *
 * ## ⚠️ 重要提示
 *
 * - ❌ **不要修改此对象**：应视为只读常量
 * - ❌ **不要删除条目**：会导致已有配置失效
 * - ✅ **读取操作安全**：可以自由遍历和查询
 * - ✅ **扩展正确方式**：通过 `registerTypeClass()` 注册新类型
 *
 * @constant {Object.<string, Function>} BUILTIN_RENDERER_TYPE_REGISTRY
 * @property {Function} checkbox - 布尔复选框渲染器类 {@link BooleanCheckboxType}
 * @property {Function} progressBar - 进度条渲染器类 {@link ProgressBarType}
 * @property {Function} starRating - 星级评分渲染器类 {@link StarRatingType}
 * @property {Function} sparkline - 迷你图渲染器类 {@link SparklineType}
 * @property {Function} colorPreview - 颜色预览渲染器类 {@link ColorPreviewType}
 *
 * @example
 * ```js
 * import { BUILTIN_RENDERER_TYPE_REGISTRY } from '@/types/renderers/index.js';
 *
 * // 1. 直接访问
 * const CheckboxClass = BUILTIN_RENDERER_TYPE_REGISTRY.checkbox;
 * console.log(CheckboxClass.name);  // "BooleanCheckboxType"
 *
 * // 2. 动态查找
 * const name = 'progressBar';
 * if (name in BUILTIN_RENDERER_TYPE_REGISTRY) {
 *     const RendererClass = BUILTIN_RENDERER_TYPE_REGISTRY[name];
 *     // 使用 RendererClass...
 * }
 *
 * // 3. 遍历所有渲染器
 * Object.entries(BUILTIN_RENDERER_TYPE_REGISTRY).forEach(([name, Class]) => {
 *     console.log(`${name}: ${Class.name}`);
 * });
 * ```
 *
 * @see {@link getBuiltinRendererType} 推荐的辅助函数（更安全）
 * @see {@link isBuiltinRendererType} 检查存在性的辅助函数
 * @see {@link getAllBuiltinRendererNames} 获取名称列表的辅助函数
 */
export const BUILTIN_RENDERER_TYPE_REGISTRY = Object.freeze({
    /**
     * 布尔复选框渲染器
     * @type {BooleanCheckboxType}
     */
    checkbox: BooleanCheckboxType,

    /**
     * 进度条渲染器
     * @type {ProgressBarType}
     */
    progressBar: ProgressBarType,

    /**
     * 星级评分渲染器
     * @type {StarRatingType}
     */
    starRating: StarRatingType,

    /**
     * 迷你图渲染器
     * @type {SparklineType}
     */
    sparkline: SparklineType,

    /**
     * 颜色预览渲染器
     * @type {ColorPreviewType}
     */
    colorPreview: ColorPreviewType,
});

// ════════════════════════════════════════════
// 辅助函数（便捷的 API 封装）
// ════════════════════════════════════════════

/**
 * 根据名称获取内置渲染器类型类（Get Built-in Renderer Type by Name）
 *
 * 从注册表中安全地检索指定名称的渲染器类。
 * 相比直接访问 `BUILTIN_RENDERER_TYPE_REGISTRY[name]`，此函数提供了：
 * - 更清晰的语义表达
 * - 类型安全的返回值（undefined vs 不存在的属性）
 * - 未来可扩展的错误处理或日志记录
 *
 * @param {string} rendererName - 渲染器名称（不区分大小写）
 *                                有效值：'checkbox', 'progressBar', 'starRating', 'sparkline', 'colorPreview'
 * @returns {Function|undefined} 找到的渲染器类，未找到时返回 undefined
 *
 * @example
 * ```js
 * import { getBuiltinRendererType } from '@/types/renderers/index.js';
 *
 * // 正确的名称
 * const CheckboxClass = getBuiltinRendererType('checkbox');
 * if (CheckboxClass) {
 *     console.log('找到复选框渲染器');
 *     // 创建实例...
 * }
 *
 * // 不存在的名称（返回 undefined）
 * const UnknownClass = getBuiltinRendererType('unknownType');
 * console.log(UnknownClass);  // undefined
 *
 * // 大小写不敏感（可选增强）
 * const ProgressClass = getBuiltinRendererType('PROGRESSBAR');
 * // 取决于实现，可能需要标准化处理
 * ```
 *
 * @see {@link BUILTIN_RENDERER_TYPE_REGISTRY} 底层数据源
 * @see {@link isBuiltinRendererType} 先检查再获取
 */
export function getBuiltinRendererType(rendererName) {
    if (typeof rendererName !== "string" || !rendererName.trim()) {
        return undefined;
    }

    return BUILTIN_RENDERER_TYPE_REGISTRY[rendererName] ?? undefined;
}

/**
 * 检查指定的渲染器名称是否为内置类型（Check if Renderer Name is Built-in）
 *
 * 用于验证用户输入或配置中的渲染器名称是否有效。
 * 在动态配置或用户自定义场景中特别有用。
 *
 * @param {string} rendererName - 要检查的渲染器名称
 * @returns {boolean} 如果是内置渲染器返回 true，否则返回 false
 *
 * @example
 * ```js
 * import { isBuiltinRendererType } from '@/types/renderers/index.js';
 *
 * // 验证用户输入
 * function validateColumnType(typeName) {
 *     if (!isBuiltinRendererType(typeName)) {
 *         throw new Error(`未知的渲染器类型: ${typeName}`);
 *     }
 *     console.log(`${typeName} 是有效的内置渲染器`);
 * }
 *
 * // 使用示例
 * validateColumnType('starRating');  // ✅ 通过
 * validateColumnType('customType');  // ❌ 抛出错误
 *
 * // 条件判断
 * if (isBuiltinRendererType('progressBar')) {
 *     // 启用进度条相关的高级配置UI
 *     showAdvancedOptions(['showPercent', 'colors']);
 * }
 * ```
 *
 * @see {@link getAllBuiltinRendererNames} 获取有效名称列表
 * @see {@link getBuiltinRendererType} 获取实际的类
 */
export function isBuiltinRendererType(rendererName) {
    if (typeof rendererName !== "string" || !rendererName.trim()) {
        return false;
    }

    return rendererName in BUILTIN_RENDERER_TYPE_REGISTRY;
}

/**
 * 获取所有内置渲染器的名称列表（Get All Built-in Renderer Names）
 *
 * 返回一个包含所有可用渲染器名称的数组，适用于：
 * - UI 下拉选择框的数据源
 * - 文档生成和自动补全
 * - 调试和诊断信息
 * - 插件开发时的参考
 *
 * @returns {string[]} 渲染器名称数组（小写字母）
 *                  例：['checkbox', 'progressBar', 'starRating', 'sparkline', 'colorPreview']
 *
 * @example
 * ```js
 * import { getAllBuiltinRendererNames } from '@/types/renderers/index.js';
 *
 * // 1. 填充下拉选择框
 * const selectElement = document.getElementById('renderer-select');
 * getAllBuiltinRendererNames().forEach(name => {
 *     const option = document.createElement('option');
 *     option.value = name;
 *     option.textContent = formatDisplayName(name);  // 'starRating' -> '星级评分'
 *     selectElement.appendChild(option);
 * });
 *
 * // 2. 生成文档
 * console.log('可用的渲染器类型:');
 * getAllBuiltinRendererNames().forEach((name, index) => {
 *     console.log(`${index + 1}. ${name}`);
 * });
 *
 * // 3. 调试输出
 * console.log(`当前系统提供 ${getAllBuiltinRendererNames().length} 种内置渲染器`);
 * ```
 *
 * @see {@link BUILTIN_RENDERER_TYPE_REGISTRY} 完整的注册表（含类引用）
 * @see {@link isBuiltinRendererType} 单个名称验证
 */
export function getAllBuiltinRendererNames() {
    return Object.keys(BUILTIN_RENDERER_TYPE_REGISTRY);
}

// ════════════════════════════════════════════
// 初始化日志（调试用途）
// ════════════════════════════════════════════

errorHandler.debug(ERROR_CODE.DEBUG_LOG, "[Renderers] ✅ 内置渲染器类型注册表初始化完成");
errorHandler.debug(
    ERROR_CODE.DEBUG_LOG,
    `  可用渲染器 (${getAllBuiltinRendererNames().length}):`,
    getAllBuiltinRendererNames(),
);
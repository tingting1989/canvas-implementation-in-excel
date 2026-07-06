/**
 * @fileoverview 编辑器管理器 - 统一管理所有单元格编辑器
 *
 * @module editor/EditorManager
 * @description
 *
 * ## 📌 功能概述
 *
 * EditorManager 采用**门面模式（Facade Pattern）**设计，统一管理所有类型的单元格编辑器。
 * 它负责：
 * - **编辑器注册**：维护编辑器类型 → 实例的映射关系
 * - **自动路由**：根据单元格配置自动选择对应的编辑器
 * - **生命周期管理**：统一创建、显示、隐藏、销毁编辑器
 * - **依赖注入**：向所有编辑器注入共享服务（ViewportService、CanvasContext等）
 *
 * ## 🎯 内置编辑器类型
 *
 * | 类型名 | 编辑器类 | 用途 | 使用场景 |
 * |-------|---------|------|---------|
 * | `text` | TextEditor | 单行文本输入 | 默认编辑器，通用文本 |
 * | `numeric` | NumericEditor | 数字输入 | 数值型数据 |
 * | `date` | DateEditor | 日期选择 | 日期字段 |
 * | `select` | SelectEditor | 下拉选择 | 枚举值、状态选择 |
 * | `textarea` | TextareaEditor | 多行文本 | 长文本、备注 |
 *
 * ## 🚀 自定义编辑器（扩展指南）
 *
 * ### ✨ 快速开始：3步创建自定义编辑器
 *
 * #### 第1步：实现编辑器类
 * ```javascript
 * // MyCustomEditor.js
 * import { CellEditor } from './CellEditor.js';
 *
 * export class MyCustomEditor extends CellEditor {
 *     constructor(renderEngine, sheet) {
 *         super(renderEngine, sheet);
 *         this.activeRow = -1;
 *         this.activeCol = -1;
 *         this.element = null;
 *     }
 *
 *     // 必须实现：初始化 DOM 元素
 *     createEditor() {
 *         this.element = document.createElement('div');
 *         this.element.className = 'my-custom-editor';
 *         document.body.appendChild(this.element);
 *     }
 *
 *     // 必须实现：显示编辑器并定位到指定单元格
 *     show(row, col, cursorMode = "select") {
 *         this.activeRow = row;
 *         this.activeCol = col;
 *
 *         // 获取单元格位置信息
 *         const rect = this.sheet.getCellRect(row, col);
 *
 *         // 定位编辑器
 *         Object.assign(this.element.style, {
 *             position: 'absolute',
 *             left: `${rect.x}px`,
 *             top: `${rect.y}px`,
 *             width: `${rect.width}px`,
 *             height: `${rect.height}px`,
 *             display: 'block',
 *             zIndex: '1000'
 *         });
 *
 *         // 设置初始值（可选）
 *         const currentValue = this.sheet.getCellData(row, col);
 *         this.setValue(currentValue);
 *
 *         // 设置光标位置
 *         if (cursorMode === 'end') {
 *             this.setCursorToEnd();
 *         } else {
 *             this.selectAll();
 *         }
 *     }
 *
 *     // 必须实现：隐藏编辑器
 *     hide() {
 *         if (this.element) {
 *             this.element.style.display = 'none';
 *         }
 *         this.activeRow = -1;
 *         this.activeCol = -1;
 *     }
 *
 *     // 必须实现：销毁编辑器，释放 DOM 资源
 *     destroy() {
 *         if (this.element && this.element.parentNode) {
 *             this.element.parentNode.removeChild(this.element);
 *         }
 *         this.element = null;
 *     }
 *
 *     // 可选实现：更新位置（行列尺寸变化时调用）
 *     updatePosition() {
 *         if (this.activeRow >= 0 && this.activeCol >= 0) {
 *             const rect = this.sheet.getCellRect(this.activeRow, this.activeCol);
 *             Object.assign(this.element.style, {
 *                 left: `${rect.x}px`,
 *                 top: `${rect.y}px`,
 *                 width: `${rect.width}px`,
 *                 height: `${rect.height}px`
 *             });
 *         }
 *     }
 *
 *     // 自定义方法：设置值
 *     setValue(value) {
 *         // 实现具体的值设置逻辑
 *     }
 *
 *     // 自定义方法：获取值
 *     getValue() {
 *         // 返回当前编辑器的值
 *         return '';
 *     }
 *
 *     // 自定义方法：确认编辑（按 Enter 或失焦时调用）
 *     commit() {
 *         const value = this.getValue();
 *         if (this.activeRow >= 0 && this.activeCol >= 0) {
 *             this.sheet.setCellValue(this.activeRow, this.activeCol, value);
 *         }
 *         this.hide();
 *     }
 * }
 * ```
 *
 * #### 第2步：注册到 EditorManager
 * ```javascript
 * import { MyCustomEditor } from './MyCustomEditor.js';
 *
 * // 获取工作表实例
 * const workbook = new Workbook(container, config);
 * const sheet = workbook.getSheet(0);
 *
 * // 创建编辑器实例
 * const myEditor = new MyCustomEditor(sheet.renderEngine, sheet);
 *
 * // 注册到编辑器管理器
 * sheet.editorManager.addEditor('myType', myEditor);
 * console.log('已注册:', Array.from(sheet.editorManager.editors.keys()));
 * // 输出: ["text", "numeric", "date", "select", "textarea", "myType"]
 * ```
 *
 * #### 第3步：在单元格配置中使用
 * ```javascript
 * const config = {
 *     sheets: [{
 *         name: "Sheet1",
 *
 *         // 列级别配置（整列使用该编辑器）
 *         columns: [
 *             { type: "text", width: 120 },
 *             { type: "myType", width: 150 },  // ← 使用自定义编辑器
 *         ],
 *
 *         // 单元格级别配置（覆盖列配置）
 *         cell: [
 *             { row: 0, col: 2, type: "myType" },  // ← 特定单元格使用
 *         ],
 *
 *         data: [
 *             ["姓名", "自定义字段", "状态"],
 *             ["张三", "值1", ""],
 *             ["李四", "值2", ""],
 *         ]
 *     }]
 * };
 * ```
 *
 * ### 🎨 实际应用示例
 *
 * #### 示例1：颜色选择器编辑器
 * ```javascript
 * class ColorPickerEditor extends CellEditor {
 *     #colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
 *
 *     createEditor() {
 *         this.element = document.createElement('div');
 *         this.element.className = 'color-picker-editor';
 *         this.element.innerHTML = `
 *             <div class="color-grid">
 *                 ${this.#colors.map(color => `
 *                     <button class="color-btn" data-color="${color}"
 *                             style="background-color: ${color}">
 *                     </button>
 *                 `).join('')}
 *             </div>
 *         `;
 *
 *         // 绑定点击事件
 *         this.element.addEventListener('click', (e) => {
 *             if (e.target.classList.contains('color-btn')) {
 *                 const color = e.target.dataset.color;
 *                 this.commitValue(color);
 *             }
 *         });
 *
 *         document.body.appendChild(this.element);
 *     }
 *
 *     commitValue(value) {
 *         if (this.activeRow >= 0 && this.activeCol >= 0) {
 *             this.sheet.setCellValue(this.activeRow, this.activeCol, value);
 *         }
 *         this.hide();
 *     }
 * }
 *
 * // 注册
 * sheet.editorManager.addEditor('color', new ColorPickerEditor(
 *     sheet.renderEngine, sheet
 * ));
 * ```
 *
 * #### 示例2：星级评分编辑器
 * ```javascript
 * class RatingEditor extends CellEditor {
 *     #maxStars = 5;
 *
 *     createEditor() {
 *         this.element = document.createElement('div');
 *         this.element.className = 'rating-editor';
 *         this.renderStars(0);
 *         document.body.appendChild(this.element);
 *     }
 *
 *     renderStars(rating) {
 *         this.element.innerHTML = Array.from({length: this.#maxStars}, (_, i) => `
 *             <span class="star ${i < rating ? 'filled' : 'empty'}" data-rating="${i + 1}">
 *                 ★
 *             </span>
 *         `).join('');
 *
 *         this.element.querySelectorAll('.star').forEach(star => {
 *             star.addEventListener('click', () => {
 *                 this.commitValue(parseInt(star.dataset.rating));
 *             });
 *
 *             star.addEventListener('mouseenter', () => {
 *                 this.renderStars(parseInt(star.dataset.rating));
 *             });
 *         });
 *     }
 *
 *     show(row, col, cursorMode) {
 *         super.show(row, col, cursorMode);
 *         const currentValue = parseInt(this.sheet.getCellData(row, col)) || 0;
 *         this.renderStars(currentValue);
 *     }
 * }
 *
 * // 注册
 * sheet.editorManager.addEditor('rating', new RatingEditor(sheet.renderEngine, sheet));
 * ```
 *
 * #### 示例3：图片上传编辑器
 * ```javascript
 * class ImageUploadEditor extends CellEditor {
 *     createEditor() {
 *         this.element = document.createElement('div');
 *         this.element.className = 'image-upload-editor';
 *         this.element.innerHTML = `
 *             <input type="file" accept="image/*" style="display: none;" />
 *             <div class="upload-area">
 *                 <span>📷 点击上传图片</span>
 *             </div>
 *             <img class="preview" style="display: none;" />
 *         `;
 *
 *         const fileInput = this.element.querySelector('input[type="file"]');
 *         const uploadArea = this.element.querySelector('.upload-area');
 *         const preview = this.element.querySelector('.preview');
 *
 *         uploadArea.addEventListener('click', () => fileInput.click());
 *
 *         fileInput.addEventListener('change', (e) => {
 *             const file = e.target.files[0];
 *             if (file) {
 *                 const reader = new FileReader();
 *                 reader.onload = (event) => {
 *                     preview.src = event.target.result;
 *                     preview.style.display = 'block';
 *                     uploadArea.style.display = 'none';
 *
 *                     // 存储base64或URL
 *                     this.currentValue = event.target.result;
 *                 };
 *                 reader.readAsDataURL(file);
 *             }
 *         });
 *
 *         document.body.appendChild(this.element);
 *     }
 *
 *     commit() {
 *         if (this.activeRow >= 0 && this.activeCol >= 0) {
 *             this.sheet.setCellValue(this.activeRow, this.activeCol, this.currentValue || '');
 *         }
 *         this.hide();
 *     }
 * }
 *
 * // 注册
 * sheet.editorManager.addEditor('image', new ImageUploadEditor(sheet.renderEngine, sheet));
 * ```
 *
 * ## 📋 编辑器接口规范（必须实现的方法）
 *
 * 所有自定义编辑器必须实现以下核心接口：
 *
 * | 方法名 | 是否必需 | 参数 | 返回值 | 说明 |
 * |-------|---------|------|-------|------|
 * | `constructor(renderEngine, sheet)` | ✅ 必须 | RenderEngine, Sheet | - | 构造函数 |
 * | `createEditor()` | ✅ 必须 | 无 | void | 创建并初始化DOM元素 |
 * | `show(row, col, cursorMode)` | ✅ 必须 | number, number, string | void | 显示并定位编辑器 |
 * | `hide()` | ✅ 必须 | 无 | void | 隐藏编辑器 |
 * | `destroy()` | ✅ 必须 | 无 | void | 销毁DOM和事件监听 |
 * | `updatePosition()` | ⚠️ 推荐 | 无 | void | 更新位置（响应式布局） |
 *
 * ### 可选属性
 *
 * | 属性名 | 类型 | 说明 |
 * |-------|------|------|
 * | `activeRow` | number | 当前编辑的行号（-1表示未激活） |
 * | `activeCol` | number | 当前编辑的列号（-1表示未激活） |
 * | `element` | HTMLElement | 编辑器的根DOM元素 |
 * | `viewport` | ViewportService | 视口服务（自动注入） |
 * | `canvasContext` | CanvasContext | Canvas上下文（自动注入） |
 * | `sheet` | Sheet | 工作表引用（自动注入） |
 *
 * ## 🔧 高级用法
 *
 * ### 覆盖内置编辑器
 * ```javascript
 * // 可以用自定义版本替换内置编辑器
 * sheet.editorManager.addEditor('text', new CustomTextEditor(
 *     sheet.renderEngine, sheet
 * ));
 * ```
 *
 * ### 动态切换编辑器
 * ```javascript
 * // 根据条件动态更改编辑器类型
 * function changeEditorType(row, col, newType) {
 *     const currentEditor = sheet.editorManager.getActiveEditor();
 *     if (currentEditor) {
 *         currentEditor.hide();
 *     }
 *
 *     // 更新单元格类型配置
 *     sheet.setCellType(row, col, newType);
 *
 *     // 显示新类型的编辑器
 *     sheet.editorManager.show(row, col);
 * }
 * ```
 *
 * ### 调试与检查
 * ```javascript
 * // 查看所有已注册的编辑器
 * console.log('已注册编辑器:', Array.from(sheet.editorManager.editors.keys()));
 *
 * // 获取特定编辑器实例
 * const textEditor = sheet.editorManager.getEditor('text');
 * console.log('TextEditor:', textEditor);
 *
 * // 查看当前活动编辑器
 * const active = sheet.editorManager.getActiveEditor();
 * if (active) {
 *     console.log(`活动编辑器: ${active.constructor.name}`);
 *     console.log(`编辑位置: (${active.activeRow}, ${active.activeCol})`);
 * }
 * ```
 *
 * ## ⚠️ 注意事项
 *
 * 1. **命名冲突**：避免使用内置类型名（text/numeric/date/select/textarea），除非有意覆盖
 * 2. **内存泄漏**：必须在 `destroy()` 中清理DOM和事件监听器
 * 3. **线程安全**：`show()` 方法会先调用 `hide()` 隐藏其他编辑器
 * 4. **样式隔离**：建议为编辑器元素添加独特的 className，避免样式冲突
 * 5. **性能优化**：对于复杂编辑器，考虑懒加载或复用DOM元素
 *
 * @example
 * // 基本用法
 * const workbook = new Workbook(document.getElementById('container'), config);
 * const sheet = workbook.getSheet(0);
 *
 * // 访问编辑器管理器
 * const editorManager = sheet.editorManager;
 *
 * // 显示指定单元格的编辑器
 * editorManager.show(0, 0);  // 显示 A1 单元格的编辑器
 *
 * // 隐藏所有编辑器
 * editorManager.hide();
 *
 * // 获取当前活动的编辑器
 * const activeEditor = editorManager.getActiveEditor();
 *
 * @see {@link module:editor/editors/CellEditor} - 基础编辑器类
 * @see {@link module:editor/editors/TextEditor} - 文本编辑器实现
 * @see {@link module:workbook/Sheet} - 工作表类（提供 getCellTypeInstance 等方法）
 */

import { TextEditor } from "./editors/index.js";
import { NumericEditor } from "./editors/NumericEditor.js";
import { DateEditor } from "./editors/DateEditor.js";
import { SelectEditor } from "./editors/SelectEditor.js";
import { TextareaEditor } from "./editors/TextareaEditor.js";

export class EditorManager {
    /**
     * @type {import("../workbook/Sheet.js").Sheet|null}
     * @private
     */
    #sheet = null;

    /**
     * 创建编辑器管理器实例
     *
     * 在构造函数中会：
     * 1. 保存渲染引擎和工作表引用
     * 2. 初始化 editors Map（用于存储编辑器实例）
     * 3. 自动创建并注册所有内置编辑器
     *
     * @param {import("../render/RenderEngine.js").RenderEngine} renderEngine - 渲染引擎实例
     * @param {import("../workbook/Sheet.js").Sheet} sheet - 当前工作表实例
     *
     * @example
     * // 通常不需要手动创建，由 Sheet 类内部实例化
     * const editorManager = new EditorManager(renderEngine, sheet);
     */
    constructor(renderEngine, sheet) {
        this.renderEngine = renderEngine;
        this.#sheet = sheet;

        /**
         * 已注册的编辑器映射表
         * @type {Map<string, import("./editors/CellEditor.js").CellEditor>}
         * @description key 为编辑器类型名（如 'text', 'numeric'），value 为编辑器实例
         */
        this.editors = new Map();

        this.#initEditors();
    }

    /**
     * 向所有已注册的编辑器注入 ViewportService
     *
     * ViewportService 提供视口坐标转换、滚动位置等信息，
     * 用于编辑器定位和响应式更新。
     *
     * @param {import("../render/ViewportService.js").ViewportService} viewport - 视口服务实例
     *
     * @example
     * // 通常在 Workbook 初始化时自动调用
     * editorManager.setViewport(viewportService);
     */
    setViewport(viewport) {
        for (const editor of this.editors.values()) {
            editor.viewport = viewport;
        }
    }

    /**
     * 向所有已注册的编辑器注入 CanvasContext
     *
     * CanvasContext 提供 Canvas 渲染上下文和相关工具，
     * 某些特殊编辑器可能需要直接操作Canvas。
     *
     * @param {import("../render/CanvasContext.js").CanvasContext} canvasContext - Canvas上下文实例
     *
     * @example
     * // 通常在 Workbook 初始化时自动调用
     * editorManager.setCanvasContext(canvasContext);
     */
    setCanvasContext(canvasContext) {
        for (const editor of this.editors.values()) {
            editor.canvasContext = canvasContext;
        }
    }

    /**
     * 获取当前关联的工作表
     * @returns {import("../workbook/Sheet.js").Sheet}
     */
    get sheet() {
        return this.#sheet;
    }

    /**
     * 设置当前关联的工作表（同时更新所有编辑器的工作表引用）
     * @param {import("../workbook/Sheet.js").Sheet} value - 新的工作表实例
     */
    set sheet(value) {
        this.#sheet = value;
        for (const editor of this.editors.values()) {
            editor.sheet = value;
        }
    }

    /**
     * 初始化所有内置编辑器
     *
     * 内置编辑器包括：
     * - text: 文本编辑器（默认）
     * - numeric: 数字编辑器
     * - date: 日期编辑器
     * - select: 下拉选择编辑器
     * - textarea: 多行文本编辑器
     *
     * @private
     */
    #initEditors() {
        // 文本编辑器 - 最通用的编辑器，用于大多数文本输入场景
        const textEditor = new TextEditor(this.renderEngine, this.#sheet);
        textEditor.createEditor();
        this.editors.set("text", textEditor);

        // 数字编辑器 - 支持数字格式化、验证、步进调整
        const numericEditor = new NumericEditor(this.renderEngine, this.#sheet);
        numericEditor.createEditor();
        this.editors.set("numeric", numericEditor);

        // 日期编辑器 - 提供日期选择界面
        const dateEditor = new DateEditor(this.renderEngine, this.#sheet);
        dateEditor.createEditor();
        this.editors.set("date", dateEditor);

        // 下拉选择编辑器 - 从预定义列表中选择值
        const selectEditor = new SelectEditor(this.renderEngine, this.#sheet);
        selectEditor.createEditor();
        this.editors.set("select", selectEditor);

        // 多行文本编辑器 - 支持换行、自动高度调整
        const textareaEditor = new TextareaEditor(this.renderEngine, this.#sheet);
        textareaEditor.createEditor();
        this.editors.set("textarea", textareaEditor);
    }

    /**
     * 根据单元格位置获取对应的编辑器实例
     *
     * 路由逻辑：
     * 1. 检查单元格是否有自定义类型配置（通过 cell 配置项）
     * 2. 如果有，从 editors Map 中查找对应类型的编辑器
     * 3. 如果找到，返回该编辑器
     * 4. 如果未找到或无配置，回退到默认的 text 编辑器
     *
     * @param {number} row - 行号（从0开始）
     * @param {number} col - 列号（从0开始）
     * @returns {import("./editors/CellEditor.js").CellEditor} 匹配的编辑器实例
     *
     * @private
     *
     * @example
     * // 内部使用示例
     * const editor = this.#getEditorForCell(0, 2);  // 获取 C1 单元格的编辑器
     * // 如果 C1 配置了 type: "select"，则返回 SelectEditor 实例
     * // 否则返回 TextEditor 实例
     */
    #getEditorForCell(row, col) {
        if (this.#sheet) {
            // 通过 Sheet 的 API 获取单元格的类型配置
            const cellType = this.#sheet.getCellTypeInstance(row, col);
            if (cellType) {
                const editorType = cellType.editorType; // 如 "select", "date", "custom"
                const editor = this.editors.get(editorType);
                if (editor) return editor;
            }
        }

        // 回退：如果没有匹配的类型，使用默认的 text 编辑器
        return this.editors.get("text");
    }

    /**
     * 获取默认编辑器（text 编辑器）
     *
     * 为了向后兼容保留此属性，
     * 新代码应使用 getEditor("text") 或直接通过 editors Map 访问
     *
     * @returns {import("./editors/TextEditor.js").TextEditor}
     *
     * @deprecated 推荐使用 getEditor("text") 替代
     */
    get editor() {
        return this.editors.get("text");
    }

    /**
     * 显示指定单元格的编辑器
     *
     * 这是编辑器管理的核心方法，执行流程：
     * 1. 检查工作表是否只读（如果是则不显示）
     * 2. 根据单元格位置和配置确定要使用的编辑器类型
     * 3. 先隐藏当前活动的编辑器（避免多个编辑器同时显示）
     * 4. 调用目标编辑器的 show() 方法显示并定位
     *
     * @param {number} row - 行号（从0开始）
     * @param {number} col - 列号（从0开始）
     * @param {'select'|'end'} [cursorMode='select'] - 光标模式
     *   - 'select': 全选内容（双击进入编辑时使用）
     *   - 'end': 光标移到末尾（单击进入编辑时使用）
     *
     * @example
     * // 双击单元格时调用
     * editorManager.show(0, 0, 'select');  // 全选A1内容
     *
     * // 单击单元格时调用
     * editorManager.show(0, 0, 'end');      // 光标在末尾
     */
    show(row, col, cursorMode = "select") {
        if (this.#sheet?.readOnly) return;

        const editor = this.#getEditorForCell(row, col);
        if (editor) {
            this.hide(); // 先隐藏其他编辑器
            editor.show(row, col, cursorMode);
        }
    }

    /**
     * 隐藏所有编辑器
     *
     * 遍历所有已注册的编辑器并调用它们的 hide() 方法。
     * 通常在以下情况调用：
     * - 用户按下 ESC 键
     * - 点击非编辑区域
     * - 显示另一个编辑器之前
     * - 工作表切换时
     *
     * @example
     * // 按 ESC 键时
     * document.addEventListener('keydown', (e) => {
     *     if (e.key === 'Escape') {
     *         editorManager.hide();
     *     }
     * });
     */
    hide() {
        for (const editor of this.editors.values()) {
            editor.hide();
        }
    }

    /**
     * 注册自定义编辑器 🌟
     *
     * 这是扩展编辑器系统的核心API，允许你：
     * - 添加全新的编辑器类型
     * - 替换现有的内置编辑器
     * - 动态扩展编辑功能
     *
     * @param {string} type - 编辑器类型名称
     *   - 建议：使用小写字母+连字符的命名风格
     *   - 示例：'color-picker', 'traffic-light', 'star-rating'
     *   - ⚠️ 避免：使用内置类型名（除非有意覆盖）
     *
     * @param {import("./editors/CellEditor.js").CellEditor} editor - 编辑器实例
     *   - 必须实现：createEditor(), show(), hide(), destroy()
     *   - 推荐：实现 updatePosition()
     *   - 会自动调用 createEditor() 进行初始化
     *
     * @throws {Error} 如果 editor 缺少必要方法会在运行时报错
     *
     * @example
     * // 基本用法
     * class MyEditor extends CellEditor {
     *     createEditor() {}
     *     show(row, col) {}
     *     hide() {}
     *     destroy() {}
     * }
     *
     * sheet.editorManager.addEditor('my-type', new MyEditor(
     *     sheet.renderEngine,
     *     sheet
     * ));
     *
     * @example
     * // 在单元格配置中使用
     * const config = {
     *     sheets: [{
     *         columns: [
     *             { type: "my-type", width: 150 },
     *         ],
     *         cell: [
     *             { row: 0, col: 5, type: "my-type" },  // 特定单元格
     *         ]
     *     }]
     * };
     *
     * @see {@link module:editor/EditorManager~EditorManager} 类文档中的完整示例
     */
    addEditor(type, editor) {
        this.editors.set(type, editor);
        editor.createEditor(); // 自动初始化编辑器
    }

    /**
     * 获取指定类型的编辑器实例
     *
     * 用于：
     * - 检查某类型编辑器是否已注册
     * - 直接访问编辑器实例进行高级操作
     * - 调试和测试
     *
     * @param {string} type - 编辑器类型名（如 'text', 'select', 'custom'）
     * @returns {import("./editors/CellEditor.js").CellEditor|null} 编辑器实例，如果不存在返回null
     *
     * @example
     * // 检查编辑器是否存在
     * const colorEditor = editorManager.getEditor('color');
     * if (colorEditor) {
     *     console.log('Color editor is registered');
     *     console.log('Instance:', colorEditor);
     * } else {
     *     console.log('Color editor not found');
     * }
     *
     * @example
     * // 直接操作编辑器
     * const selectEditor = editorManager.getEditor('select');
     * if (selectEditor) {
     *     // 访问编辑器的公共属性和方法
     *     console.log('Options:', selectEditor.options);
     * }
     */
    getEditor(type) {
        return this.editors.get(type) || null;
    }

    /**
     * 获取当前正在显示的活动编辑器
     *
     * 通过检查每个编辑器的 activeRow 属性来判断哪个编辑器处于激活状态。
     * 同一时刻最多只有一个编辑器是活动的。
     *
     * @returns {import("./editors/CellEditor.js").CellEditor|null} 活动编辑器实例，如果没有则返回null
     *
     * @example
     * // 检查是否有编辑器正在使用
     * const activeEditor = editorManager.getActiveEditor();
     * if (activeEditor) {
     *     console.log(`正在编辑: (${activeEditor.activeRow}, ${activeEditor.activeCol})`);
     *     console.log(`编辑器类型: ${activeEditor.constructor.name}`);
     * } else {
     *     console.log('没有活动的编辑器');
     * }
     *
     * @example
     * // 强制提交当前编辑
     * const active = editorManager.getActiveEditor();
     * if (active && typeof active.commit === 'function') {
     *     active.commit();  // 提交编辑结果
     * }
     */
    getActiveEditor() {
        for (const editor of this.editors.values()) {
            // activeRow >= 0 表示编辑器正处于显示状态
            if (editor.activeRow >= 0) return editor;
        }
        return null;
    }

    /**
     * 更新当前活动编辑器的位置和大小
     *
     * 当表格的行列尺寸发生变化时（如拖拽调整列宽、行高），
     * 需要同步更新编辑器的位置以保持对齐。
     *
     * 此方法会：
     * 1. 检查是否有活动的编辑器
     * 2. 如果编辑器实现了 updatePosition() 方法，则调用它
     * 3. 编辑器内部会重新计算位置并更新DOM样式
     *
     * @example
     * // 在拖拽调整列宽后调用
     * columnResizer.onResize(() => {
     *     editorManager.updateActiveEditorPosition();
     * });
     *
     * @example
     * // 在窗口大小改变后调用
     * window.addEventListener('resize', () => {
     *     editorManager.updateActiveEditorPosition();
     * });
     */
    updateActiveEditorPosition() {
        const activeEditor = this.getActiveEditor();

        // 只有实现了 updatePosition 方法的编辑器才会被更新
        if (activeEditor && typeof activeEditor.updatePosition === "function") {
            activeEditor.updatePosition();
        }
    }

    /**
     * 销毁所有编辑器并释放资源
     *
     * 清理流程：
     * 1. 遍历所有已注册的编辑器
     * 2. 调用每个编辑器的 destroy() 方法（清理DOM、解绑事件）
     * 3. 清空 editors Map
     * 4. 清空对外部对象的引用（避免内存泄漏）
     *
     * ⚠️ 销毁后，此 EditorManager 实例将不可再使用！
     *
     * @example
     * // 工作表销毁时自动调用
     * sheet.destroy();  // 内部会调用 editorManager.destroy()
     *
     * @example
     * // 手动销毁（通常不需要）
     * editorManager.destroy();
     * // 之后不能再使用此实例
     */
    destroy() {
        for (const editor of this.editors.values()) {
            editor.destroy(); // 清理每个编辑器的资源
        }

        this.editors.clear(); // 清空映射表

        // 清空引用，帮助垃圾回收
        this.renderEngine = null;
        this.#sheet = null;
    }
}

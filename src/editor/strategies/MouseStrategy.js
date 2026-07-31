import { EventStrategy } from "./EventStrategy.js";
import { HOOKS } from "../../constants/hookNames.js";
import { HIT_TYPE } from "../../constants/hitType";
import { DELEGATE_KEYS } from "../../constants/eventNames.js";
import { SHEET_EVENTS } from "../../constants/sheetEvents.js";
import { debounce } from "../../utils/helper.js";
import { STRATEGY_PRIORITY } from "../../constants/strategyPriority.js";

/**
 * 鼠标交互策略 (Mouse Interaction Strategy)
 *
 * 处理Canvas表格中所有鼠标相关的用户交互操作。
 * 是最核心的交互策略之一，负责单元格选择、范围选择等功能。
 *
 * 优先级：50（STRATEGY_PRIORITY.MOUSE_DEFAULT）
 * - 在 ResizeStrategy (100) 和 AutoFillStrategy (90) 之后执行
 * - 确保尺寸调整和自动填充优先捕获鼠标事件
 *
 * 核心功能：
 * ┌────────────────────┬─────────────────────────────────────────┐
 * │ 操作               │ 行为                                    │
 * ├────────────────────┼─────────────────────────────────────────┤
 * │ 单元格单击         │ 选中单元格，触发 ON_CELL_CLICK hook     │
 * │ 单元格双击         │ 进入编辑模式                            │
 * │ 拖拽选择           │ 创建/更新矩形范围选区                   │
 * │ Shift+单击        │ 扩展选区到点击位置                      │
 * │ 行头单击           │ 选中整行                                │
 * │ 列头单击           │ 选中整列                                │
 * │ 左上角按钮单击     │ 全选所有单元格                          │
 * └────────────────────┴─────────────────────────────────────────┘
 *
 * 技术实现要点：
 * - 使用 hitTest() 判断鼠标点击的位置类型
 * - 通过 debounce 区分单击和双击（200ms延迟）
 * - 拖拽时监听 document 的 mousemove/mouseup（支持移出Canvas）
 * - 支持合并单元格的选区处理
 * - 自动滚动：拖拽到边缘时自动滚动表格
 *
 * 事件流程示例（单击单元格）：
 * ```
 * mousedown → hitTest → 更新activeCell → mouseup → debounce(200ms) → ON_CELL_CLICK hook
 * ```
 *
 * 事件流程示例（双击编辑）：
 * ```
 * mousedown → mouseup → mousedown(第2次) → mouseup(第2次) → dblclick → cancel(debounce) → enterEditMode()
 * ```
 *
 * @class MouseStrategy
 * @extends EventStrategy
 *
 * @see EventStrategy - 基类
 * @see ResizeStrategy - 高优先级的尺寸调整策略
 * @see AutoFillStrategy - 高优先级的自动填充策略
 */

// 考虑是否需要将 InteractionPlugin 的功能合并到 MouseStrategy 中
export class MouseStrategy extends EventStrategy {
    /**
     * 策略优先级 - 默认鼠标交互优先级
     *
     * 使用 MOUSE_DEFAULT (50)，确保在以下策略之后执行：
     * - ResizeStrategy (100): 列宽/行高调整（最高优先级）
     * - AutoFillStrategy (90): 自动填充操作
     * - CopyPasteStrategy (10): 复制粘贴快捷键（低于此策略）
     *
     * 这种分层确保鼠标事件被正确的策略捕获：
     * - 在调整手柄区域拖拽 → ResizeStrategy 处理
     * - 在填充柄区域拖拽 → AutoFillStrategy 处理
     * - 其他区域的鼠标操作 → MouseStrategy 处理
     */
    priority = STRATEGY_PRIORITY.MOUSE_DEFAULT;

    /**
     * @private 私有字段 - 是否正在进行拖拽选择操作
     *
     ** 状态管理：**
     * - 初始值：false（未在拖拽状态）
     * - 设置时机：mousedown 时如果非 Shift 键且点击位置有效
     * - 重置时机：mouseup 时结束拖拽
     *
     ** 影响范围：**
     * 此字段控制 `#handleMouseMove()` 中是否执行拖拽选区更新逻辑。
     * 当为 true 时，每次 mousemove 都会计算新的选区范围。
     *
     * @type {boolean}
     */
    #dragging = false;

    /**
     * @private 私有字段 - 拖拽操作的锚点行号（选区起点）
     *
     ** 用途：**
     * 记录用户按下鼠标时的行位置，作为拖拽选区的固定端点。
     * 在整个拖拽过程中保持不变，而焦点端点随鼠标移动变化。
     *
     ** 与 Selection 的关系：**
     * 对应 sheet.selection.getAnchor()[0]（锚点的行分量）。
     * 拖拽时调用 setRange(anchorRow, anchorCol, focusRow, focusCol)，
     * 其中 anchorRow/anchorCol 来自此字段和 #dragAnchorCol。
     *
     ** 初始值和重置：**
     * - 初始值：-1（表示无效/未设置）
     * - 设置时机：mousedown 时记录当前点击的行号
     * - 重置时机：mouseup 后不立即重置（下次 mousedown 时覆盖）
     *
     * @type {number}
     * @see #dragAnchorCol - 配套的锚点列号
     */
    #dragAnchorRow = -1;

    /**
     * @private 私有字段 - 拖拽操作的锚点列号（选区起点）
     *
     ** 用途：**
     * 记录用户按下鼠标时的列位置，作为拖拽选区的固定端点。
     * 与 #dragAnchorRow 配对使用，共同定义选区的锚点坐标。
     *
     ** 使用示例：**
     * ```
     * 用户在 B2 单元格按下鼠标并拖拽到 D5:
     *   #dragAnchorRow = 1 (B2的行号，0-based)
     *   #dragAnchorCol = 1 (B2的列号，0-based)
     *   最终选区: setRange(1, 1, 4, 3) → B2:D5
     * ```
     *
     * @type {number}
     * @see #dragAnchorRow - 配套的锚点行号
     */
    #dragAnchorCol = -1;

    /**
     * @private 私有字段 - 防抖处理后的单元格单击事件触发器
     *
     ** 🎯 核心目的：区分单击和双击事件**
     *
     ** 技术背景：**
     * 浏览器的事件触发顺序如下：
     * ```
     * 单击场景：
     *   mousedown(1) → mouseup(1) → [等待200ms] → 触发 ON_CELL_CLICK ✅
     *
     * 双击场景：
     *   mousedown(1) → mouseup(1) → [等待中...]
     *   mousedown(2) → mouseup(2) → dblclick → cancel() 取消待触发的单击 ❌
     * ```
     *
     ** 实现机制：**
     * 使用 debounce 工具函数创建一个延迟 200ms 执行的函数。
     * 每次 mouseup 时调用此防抖函数（传入 row, col, event）。
     * 如果在 200ms 内收到 dblclick 事件，调用 cancel() 取消执行。
     * 如果 200ms 内无 dblclick，正常触发 HOOKS.ON_CELL_CLICK 钩子。
     *
     ** 为什么是 200ms？**
     * - 浏览器的双击检测窗口通常为 300-500ms
     * - 200ms 是经验值，平衡响应速度和准确率
     * - 过短会导致误判双击为两次单击
     * - 过长会导致单击响应延迟明显
     *
     ** 钩子参数：**
     * 触发时传递三个参数给 HOOKS.ON_CELL_CLICK：
     * - row: 单元格行号（0-based）
     * - col: 单元格列号（0-based）
     * - e: 原始 MouseEvent 对象（可获取坐标、修饰键等）
     *
     ** 生命周期管理：**
     * - 创建时机：类实例化时通过 debounce() 创建
     * - 销毁时机：destroy() 时调用 cancel() 清理定时器
     * - 避免内存泄漏：确保组件销毁时取消待执行的回调
     *
     * @type {Function} debounce 返回的防抖函数，具有 .cancel() 方法
     *
     * @see #handleMouseDown() - mouseup 时调用此触发器
     * @see #handleDoubleClick() - 双击时调用 .cancel() 取消
     * @see destroy() - 销毁时清理资源
     */
    #debouncedCellClick = debounce((row, col, e) => {
        this.handler.runHooks(HOOKS.ON_CELL_CLICK, row, col, e);
    }, 200);

    /**
     * 构造函数 - 初始化鼠标交互策略
     *
     * 执行初始化操作：
     * - 调用 super(handler) 注册到 EventHandler
     * - 所有状态字段已在声明时初始化（#dragging, #dragAnchorRow 等）
     * - #debouncedCellClick 已在声明时通过 debounce() 创建
     *
     * @param {import("../../core/EventHandler.js").EventHandler} handler - 事件处理器实例
     */
    constructor(handler) {
        super(handler);
    }

    /**
     * 公共方法 - 初始化策略（空实现）
     *
     * 基类要求实现此接口，但本策略无需额外的初始化逻辑。
     * 所有必要的初始化都在构造函数或字段声明时完成。
     */
    init() {}

    /**
     * 公共方法 - 销毁策略
     *
     ** 清理操作：**
     * - 调用 `#debouncedCellClick.cancel()` 取消可能存在的待执行定时器
     * - 防止组件销毁后仍触发钩子导致错误
     * - 这是唯一需要手动清理的资源（其他字段会被 GC 回收）
     *
     ** 为什么必须清理防抖函数：**
     * 如果用户单击后立即销毁工作簿（如切换页面），
     * 200ms 内的定时器仍在运行。如果不 cancel()，
     * 定时器到期后会尝试访问已销毁的 handler.sheet，
     * 导致 "Cannot read property of xxx of undefined" 错误。
     */
    destroy() {
        this.#debouncedCellClick.cancel();
    }

    /**
     * 公共方法 - 获取事件处理器映射表
     *
     ** 注册4个鼠标事件的处理器：**
     *
     * | 事件类型 | 监听级别 | 处理方法 | 用途 |
     * |---------|---------|----------|------|
     * | CANVAS_MOUSEDOWN | Canvas 内 | #handleMouseDown() | 鼠标按下（开始交互） |
     * | CANVAS_DBLCLICK | Canvas 内 | #handleDoubleClick() | 双击（进入编辑模式） |
     * | DOCUMENT_MOUSEMOVE | Document 级别 | #handleMouseMove() | 鼠标移动（拖拽选区+悬停事件） |
     * | DOCUMENT_MOUSEUP | Document 级别 | #handleMouseUp() | 鼠标松开（结束拖拽） |
     *
     ** 为什么 MouseMove/MouseUp 使用 Document 级别监听：**
     * - 支持拖拽时鼠标移出 Canvas 区域仍能继续跟踪
     * - 避免快速移动时鼠标"脱离"Canvas 导致拖拽中断
     * - 符合用户的直觉预期（拖拽不应受 Canvas 边界限制）
     *
     ** 性能考虑：**
     * - document 级别的 mousemove 触发频率极高（每秒可达 60-120 次）
     * - #handleMouseMove() 内部做了优化：仅在必要时才更新选区
     * - 未来可考虑使用 requestAnimationFrame 节流（需测试影响）
     *
     * @returns {Object<string, Function>} 事件类型到处理函数的映射
     */
    getEventHandlers() {
        return {
            [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: (e) => this.#handleMouseDown(e),
            [DELEGATE_KEYS.CANVAS_DBLCLICK]: (e) => this.#handleDoubleClick(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEMOVE]: (e) => this.#handleMouseMove(e),
            [DELEGATE_KEYS.DOCUMENT_MOUSEUP]: (e) => this.#handleMouseUp(e),
        };
    }

    /**
     * @private 私有方法 - 处理鼠标按下事件（交互的起始点）
     *
     ** 🎯 核心目的：**
     * 作为所有鼠标交互操作的入口，根据点击位置和按键状态决定后续行为。
     * 这是鼠标事件处理链的第一个环节（mousedown → mousemove → mouseup）。
     *
     ** 执行流程：**
     *
     * **阶段1：前置条件检查**
     * ```
     * 接收 mousedown 事件
     *    ↓
     * 检查策略是否启用? (!this.enabled)
     *   ├── 否 → 直接返回（策略被禁用）
     *   └── 是 ↓
     * 工作表是否存在? (!this.handler.sheet)
     *   ├── 否 → 返回（工作表未初始化）
     *   └── 是 ↓
     * 是否左键单击? (e.button !== 0)
     *   ├── 否 → 返回（忽略右键/中键，由 ContextMenuStrategy 处理）
     *   └── 是 ↓
     * ```
     *
     * **阶段2：位置检测（hitTest）**
     * ```
     * 调用 viewport.hitTest(e.clientX, e.clientY)
     *    ↓
     * 将屏幕坐标转换为逻辑坐标，判断点击位置类型：
     *   ├── CORNER: 左上角全选按钮
     *   ├── COL_HEADER: 列标题头（A, B, C...）
     *   ├── ROW_HEADER: 行标题头（1, 2, 3...）
     *   ├── CELL: 单元格区域
     *   └── null: 点击在空白区域或视口外
     * ```
     *
     * **阶段3：分发到不同的处理逻辑**
     *
     * **情况A：点击表头区域**（CORNER/COL_HEADER/ROW_HEADER）
     * ```
     * 调用 #handleHeaderClick(hit)
     *    ↓
     * 全选 / 选列 / 选行
     *    ↓
     * 触发 AFTER_SELECTION 钩子 + 重绘
     * （不进入拖拽模式）
     * ```
     *
     * **情况B：Shift+点击单元格**（扩展选区）
     * ```
     * 获取当前选区的锚点 (anchorRow, anchorCol)
     *    ↓
     * 设置新选区范围:
     *   setRange(anchorRow, anchorCol, clickRow, clickCol)
     *   锚点保持不变，焦点移动到点击位置
     *    ↓
     * 触发钩子 + 重绘
     * （不进入拖拽模式）
     * ```
     *
     * **情况C：普通点击单元格**（可能开始拖拽）
     * ```
     * 获取合并单元格的左上角位置 (#getTopLeft)
     *    ↓
     * 调用 #debouncedCellClick() 注册延迟单击事件
     *    ↓
     * 更新选区:
     *   合并单元格 → 选择整个合并区域
     *   普通单元格 → 仅选择该单元格
     *    ↓
     * 记录拖拽锚点:
     *   #dragAnchorRow = row
     *   #dragAnchorCol = col
     *   #dragging = true  // 标记开始拖拽
     *    ↓
     * 触发 AFTER_SELECTION 钩子 + 重绘
     * ```
     *
     ** 合并单元格处理：**
     * 无论点击合并区域的哪个部分，都使用 `#getTopLeft()` 获取其左上角坐标，
     * 确保选中整个合并区域而非单个子单元格。这符合 Excel 的标准行为。
     *
     ** 与防抖机制的关系：**
     * 在 mouseup 时会调用 `#debouncedCellClick()` 延迟触发 ON_CELL_CLICK。
     * 如果用户快速双击，dblclick 事件会 cancel 这个延迟调用，
     * 从而避免同时触发"单击"和"双击"两个钩子。
     *
     * @param {MouseEvent} e - 鼠标事件对象
     *   - e.clientX/e.clientY: 鼠标相对于视口的坐标（用于 hitTest）
     *   - e.button: 按下的按钮编号（0=左键, 1=中键, 2=右键）
     *   - e.shiftKey: 是否按住 Shift 键（决定是否扩展选区）
     * @returns {void}
     *
     * @see #handleHeaderClick() - 表头点击的处理逻辑
     * @see #debouncedCellClick - 单击事件的防抖触发器
     * @see #getTopLeft() - 合并单元格坐标转换
     */
    #handleMouseDown(e) {
        if (!this.enabled || !this.handler.sheet) return;
        if (e.button !== 0) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return;

        if (hit.type === HIT_TYPE.CORNER || hit.type === HIT_TYPE.COL_HEADER || hit.type === HIT_TYPE.ROW_HEADER) {
            this.#handleHeaderClick(hit);
            return;
        }

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.#debouncedCellClick(row, col, e);

        if (e.shiftKey) {
            const [anchorRow, anchorCol] = this.handler.sheet.selection.getAnchor();
            this.handler.sheet.selection.setRange(anchorRow, anchorCol, row, col);
        } else {
            const merge = this.handler.sheet.getMerge(row, col);
            if (merge) {
                this.handler.sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
            } else {
                this.handler.sheet.selection.setActive(row, col);
            }
            this.#dragAnchorRow = row;
            this.#dragAnchorCol = col;
            this.#dragging = true;
        }

        const range = this.handler.sheet.selection.getRange();
        const focus = this.handler.sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);

        this.handler.render();
    }

    /**
     * @private 私有字段 - 上一次鼠标悬停的单元格位置（用于检测移入/移出事件）
     *
     ** 🎯 核心目的：**
     * 跟踪鼠标当前所在的单元格位置，用于判断是否发生了"跨单元格移动"。
     * 当鼠标从一个单元格移动到另一个单元格时，触发 CELL_MOUSE_OUT 和 CELL_MOUSE_OVER 事件。
     *
     ** 数据结构：**
     * ```javascript
     * {
     *   row: number,  // 行号（0-based），-1 表示无效或无悬停
     *   col: number   // 列号（0-based），-1 表示无效或无悬停
     * }
     * ```
     *
     ** 状态转换：**
     * ```
     * 初始状态: { row: -1, col: -1 } (未悬停任何单元格)
     *    ↓ 鼠标进入单元格(3, 5)
     * 更新为:   { row: 3, col: 5 }
     *    ↓ 触发 CELL_MOUSE_OVER(3, 5)
     *    ↓ 鼠标移动到单元格(3, 6) (同一行不同列)
     * 检测到:   row相同，col不同 → 触发 CELL_MOUSE_OUT(3, 5)
     * 更新为:   { row: 3, col: 6 } → 触发 CELL_MOUSE_OVER(3, 6)
     *    ↓ 鼠标离开Canvas区域
     * 检测到:   hit === null → 触发 CELL_MOUSE_OUT(3, 6)
     * 重置为:   { row: -1, col: -1 }
     * ```
     *
     ** 为什么需要此缓存？**
     * 每次调用 `#handleMouseMove()` 时都需要知道"上一次在哪个单元格"，
     * 才能判断是否触发了移入/移出事件。如果每次都重新查询 DOM 或状态，
     * 会造成性能浪费。使用简单的内存变量存储上次状态是最优解。
     *
     ** 边界情况处理：**
     * - 初始值 (-1, -1): 表示尚未有任何悬停记录，首次进入时不会触发 OUT 事件
     * - 鼠标快速划过: 可能跳过某些中间单元格（性能优化，可接受）
     * - 拖拽时仍更新: 即使在拖拽模式，也跟踪悬停位置（用于高亮提示等）
     *
     ** 性能影响：**
     * - 存储开销：极小（仅两个数字）
     * - 比较开销：O(1)（两次数值比较）
     * - 无 GC 压力：对象复用，不频繁创建新对象
     *
     * @type {{ row: number, col: number }}
     *
     * @see #handleMouseMove() - 使用此字段的唯一方法
     * @see SHEET_EVENTS.CELL_MOUSE_OUT - 移出事件常量
     * @see SHEET_EVENTS.CELL_MOUSE_OVER - 移入事件常量
     */
    #lastHoverCell = { row: -1, col: -1 };

    /**
     * @private 私有方法 - 处理鼠标移动事件（拖拽选区 + 悬停事件）
     *
     ** 🎯 双重职责：**
     * 此方法同时负责两项功能：
     * 1. **拖拽选区更新**：当 `#dragging === true` 时，根据鼠标位置扩展选区
     * 2. **悬停事件管理**：无论是否拖拽，都跟踪并触发 CELL_MOUSE_OVER/OUT 事件
     *
     ** 执行流程：**
     *
     * **阶段1：前置检查**
     * ```
     * 接收 mousemove 事件
     *    ↓
     * 工作表是否存在? (!this.handler.sheet)
     *   ├── 否 → 直接返回（避免空指针异常）
     *   └── 是 ↓
     * ```
     *
     * **阶段2：位置检测（hitTest）**
     * ```
     * viewport.hitTest(e.clientX, e.clientY)
     *    ↓
     * 返回 hit 对象或 null:
     *   ├── null → 鼠标在Canvas外或空白区域
     *   └── hit → 包含 type, row, col 等信息
     * ```
     *
     * **阶段3：悬停事件处理（始终执行）**
     *
     * **情况A：鼠标离开Canvas区域**（hit === null）
     * ```
     * 检查是否有上次的悬停记录? (#lastHoverCell.row !== -1)
     *   ├── 是 → 触发 CELL_MOUSE_OUT(lastRow, lastCol)
     *   │        重置 #lastHoverCell 为 (-1, -1)
     *   └── 否 → 无操作（已经没有悬停目标）
     * ```
     *
     * **情况B：鼠标在Canvas内**（hit !== null）
     * ```
     * 获取合并单元格的左上角坐标 (#getTopLeft)
     *    ↓
     * 对比当前位置与上次位置:
     *   行号不同 OR 列号不同?
     *   ├── 是 → 触发 CELL_MOUSE_OUT(旧位置)
     *   │        触发 CELL_MOUSE_OVER(新位置)
     *   │        更新 #lastHoverCell = 新位置
     *   └── 否 → 仍在同一单元格内，无操作
     * ```
     *
     * **阶段4：拖拽选区更新（仅在 #dragging === true 时执行）**
     * ```
     * 检查是否处于拖拽状态?
     *   ├── 否 → 结束方法（普通移动，不更新选区）
     *   └── 是 ↓
     * 获取合并单元格信息:
     *   merge = sheet.getMerge(row, col)
     *   focusRow = merge ? merge.bottomRow : row  // 使用合并区域右下角
     *   focusCol = merge ? merge.bottomCol : col
     *    ↓
     * 检查焦点是否变化?
     *   当前焦点 !== 新焦点?
     *   ├── 否 → 无操作（优化：避免不必要的渲染）
     *   └── 是 ↓
     *   更新选区范围:
     *     setRange(anchorRow, anchorCol, focusRow, focusCol)
     *   触发 AFTER_SELECTION 钩子
     *   重绘视口 (handler.render())
     * ```
     *
     ** 合并单元格的拖拽行为：**
     * 当拖拽经过合并单元格时：
     * - 锚点保持不变（按下时的位置）
     * - 焦点使用合并区域的右下角（bottomRow, bottomCol）
     * - 这样可以一次性选中整个合并区域，符合用户预期
     *
     ** 性能优化措施：**
     * 1. **焦点不变则跳过更新**：减少不必要的 setRange + render 调用
     * 2. **hitTest 结果复用**：一次查询同时用于悬停和拖拽逻辑
     * 3. **条件分支短路**：!this.handler.sheet 快速返回
     *
     ** 事件发射格式：**
     * ```javascript
     * // 通过 EventBus 发射，指定 source 为 "MouseStrategy"
     * this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OVER, [row, col, e], {
     *     source: "MouseStrategy"
     * });
     * // 参数说明：
     * // [row, col, e]: 事件数据数组
     * // source: 事件来源标识，便于调试和过滤
     * ```
     *
     * @param {MouseEvent} e - 鼠标移动事件对象
     *   - e.clientX/e.clientY: 鼠标相对于视口的坐标（用于 hitTest）
     * @returns {void}
     *
     * @see #dragging - 控制是否执行拖拽逻辑的状态标志
     * @see #lastHoverCell - 用于检测悬停变化的缓存字段
     * @see #getTopLeft() - 合并单元格坐标转换
     */
    #handleMouseMove(e) {
        // ✅ 修复：移除 #dragging 限制，所有鼠标移动都应触发事件
        if (!this.handler.sheet) return;

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);

        // 鼠标离开单元格区域
        if (!hit) {
            if (this.#lastHoverCell.row !== -1) {
                // ✅ 通过 EventBus 发射鼠标移出事件（指定 source 为 MouseStrategy）
                this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                    source: "MouseStrategy",
                });
                this.#lastHoverCell = { row: -1, col: -1 };
            }
            return;
        }

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        // 检测鼠标移出单元格
        if (this.#lastHoverCell.row !== -1 && (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col)) {
            // ✅ 通过 EventBus 发射鼠标移出事件（指定 source 为 MouseStrategy）
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OUT, [this.#lastHoverCell.row, this.#lastHoverCell.col, e], {
                source: "MouseStrategy",
            });
        }

        // 更新最后悬停位置并触发鼠标悬停事件
        if (this.#lastHoverCell.row !== row || this.#lastHoverCell.col !== col) {
            this.#lastHoverCell = { row, col };

            // ✅ 通过 EventBus 发射鼠标悬停事件（指定 source 为 MouseStrategy）
            this.handler.sheet.bus.emit(SHEET_EVENTS.CELL_MOUSE_OVER, [row, col, e], { source: "MouseStrategy" });
        }

        // 拖拽选择逻辑（仅在拖拽时执行）
        if (!this.#dragging) return;

        const merge = this.handler.sheet.getMerge(row, col);
        const focusRow = merge ? merge.bottomRow : row;
        const focusCol = merge ? merge.bottomCol : col;

        if (focusRow !== this.handler.sheet.selection.getFocus()[0] || focusCol !== this.handler.sheet.selection.getFocus()[1]) {
            this.handler.sheet.selection.setRange(this.#dragAnchorRow, this.#dragAnchorCol, focusRow, focusCol);
            const range = this.handler.sheet.selection.getRange();
            const selFocus = this.handler.sheet.selection.getFocus();
            this.handler.runHooks(HOOKS.AFTER_SELECTION, range, selFocus);
            this.handler.render();
        }
    }

    /**
     * @private 私有方法 - 处理鼠标松开事件（结束拖拽操作）
     *
     ** 🎯 核心目的：**
     * 重置拖拽状态标志，标记拖拽操作已完成。
     * 这是 mousedown → mousemove(多次) → mouseup 事件链的终点。
     *
     ** 执行逻辑：**
     * ```javascript
     * this.#dragging = false;
     * // 将拖拽标志重置为 false
     * // 后续的 mousemove 事件将不再更新选区（直到下次 mousedown）
     * ```
     *
     ** 为什么如此简单？**
     * 此方法仅负责状态清理，不包含业务逻辑：
     * - 选区已在 `#handleMouseMove()` 中实时更新
     * - 钩子通知也在 mousemove 时触发
     * - mouseup 时无需额外操作，只需标记"不再拖拽"
     *
     ** 与防抖机制的关系：**
     * 注意：此方法**不取消** `#debouncedCellClick`。
     * 单击事件的触发由 200ms 定时器控制，与 mouseup 无关。
     * 如果用户单击后立即松开（<200ms），定时器仍会到期触发 ON_CELL_CLICK。
     * 只有 dblclick 事件才会 cancel 这个定时器。
     *
     ** 边界情况：**
     * - 快速点击（mousedown + 立即 mouseup）：#dragging 被设为 true 后立即重置为 false，
     *   但在极短的时间窗口内可能仍被 mousemove 检测到（可忽略）
     * - 鼠标移出Canvas后松开：document 级别的监听确保仍能捕获此事件
     * - 多次快速点击：每次 mouseup 都会执行此方法（幂等操作，安全）
     *
     * @returns {void}
     *
     * @see #handleMouseDown() - 设置 #dragging = true 的地方
     * @see #handleMouseMove() - 检查 #dragging 以决定是否更新选区
     */
    #handleMouseUp() {
        this.#dragging = false;
    }

    /**
     * @private 私有方法 - 处理表头区域的点击事件（全选/选列/选行）
     *
     ** 🎯 功能范围：**
     * 处理三种表头类型的点击：
     * 1. **CORNER（左上角全选按钮）**：选中工作表中所有单元格
     * 2. **COL_HEADER（列标题头）**：选中整列的所有单元格
     * 3. **ROW_HEADER（行标题头）**：选中整行的所有单元格
     *
     ** 执行流程：**
     *
     * **阶段1：根据 hit 类型分发**
     * ```
     * 接收 headerHit 对象 (来自 handleMouseDown 的 hitTest 结果)
     *    ↓
     * 判断 headerHit.type:
     *   ├── CORNER → 全选所有单元格
     *   ├── COL_HEADER → 选中指定列
     *   └── ROW_HEADER → 选中指定行
     * ```
     *
     * **阶段2：调用 Selection API 更新选区**
     *
     * **情况A：CORNER 全选**
     * ```javascript
     * sheet.selection.selectAll(
     *   rc.rowCount - 1,      // 最大行号（最后一行）
     *   rc.realColCount - 1   // 最大列号（最后一列）
     * );
     * // 使用 realColCount 而非 colCount，因为后者可能排除隐藏列
     * ```
     *
     * **情况B：COL_HEADER 选列**
     * ```javascript
     * sheet.selection.selectCol(
     *   headerHit.index,       // 点击的列索引（0-based）
     *   rc.rowCount - 1        // 选中从第0行到最后一行
     * );
     * // 效果：选中整列（如点击 B 列标题 → 选中 B1:B1048576）
     * ```
     *
     * **情况C：ROW_HEADER 选行**
     * ```javascript
     * sheet.selection.selectRow(
     *   headerHit.index,           // 点击的行索引（0-based）
     *   rc.realColCount - 1        // 选中从第0列到最后一列
     * );
     * // 效果：选中整行（如点击第3行标题 → 选中 A3:XFD3）
     * ```
     *
     * **阶段3：后置处理（统一执行）**
     * ```javascript
     * const range = sheet.selection.getRange();   // 获取新选区范围
     * const focus = sheet.selection.getFocus();   // 获取焦点位置
     * this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);
     * this.handler.render();                     // 重绘视口反映变化
     * ```
     *
     ** 与 Excel 行为对比：**
     * | 操作 | Excel | 本实现 |
     * |------|-------|--------|
     * | 单击列头 | 选中整列 | ✅ 一致 |
     * | Shift+列头 | 扩展选区到该列 | ❌ 未实现 |
     * | Ctrl+列头 | 追加选中该列 | ❌ 未实现 |
     * | 单击行头 | 选中整行 | ✅ 一致 |
     * | 单击全选按钮 | 选中所有单元格 | ✅ 一致 |
     *
     ** 性能考虑：**
     * - selectAll/selectCol/selectRow 内部优化了大数据量场景
     * - 不实际遍历每个单元格，仅存储选区范围坐标
     * - 渲染时通过批量绘制高亮矩形实现视觉反馈
     *
     * @param {{ type: string, index: number }} headerHit - hitTest 返回的表头命中信息
     *   - type: 命中的表头类型
     *     - HIT_TYPE.CORNER: 左上角全选按钮
     *     - HIT_TYPE.COL_HEADER: 列标题头（A, B, C...）
     *     - HIT_TYPE.ROW_HEADER: 行标题头（1, 2, 3...）
     *   - index: 命中的行或列索引（0-based），仅在 COL_HEADER 或 ROW_HEADER 时有效
     *     - 对于 COL_HEADER: 表示列号（如点击B列 → index=1）
     *     - 对于 ROW_HEADER: 表示行号（如点击第5行 → index=4）
     * @returns {void}
     *
     * @see HOOKS.AFTER_SELECTION - 触发的选区变更钩子
     * @see Selection.selectAll() - 全选 API
     * @see Selection.selectCol() - 选列 API
     * @see Selection.selectRow() - 选行 API
     */
    #handleHeaderClick(headerHit) {
        const sheet = this.handler.sheet;
        const rc = sheet.rowColManager;

        if (headerHit.type === HIT_TYPE.CORNER) {
            sheet.selection.selectAll(rc.rowCount - 1, rc.realColCount - 1);
        } else if (headerHit.type === HIT_TYPE.COL_HEADER) {
            sheet.selection.selectCol(headerHit.index, rc.rowCount - 1);
        } else if (headerHit.type === HIT_TYPE.ROW_HEADER) {
            sheet.selection.selectRow(headerHit.index, rc.realColCount - 1);
        }

        const range = sheet.selection.getRange();
        const focus = sheet.selection.getFocus();
        this.handler.runHooks(HOOKS.AFTER_SELECTION, range, focus);

        this.handler.render();
    }

    /**
     * @private 私有方法 - 处理鼠标双击事件（进入编辑模式）
     *
     ** 🎯 核心目的：**
     * 在双击的单元格位置进入编辑模式，允许用户修改单元格内容。
     * 这是 Excel 等电子表格软件的标准交互方式。
     *
     ** 与单击的关系（防抖机制）：**
     * ```
     * 浏览器双击事件的完整序列：
     *   mousedown(1) → mouseup(1) → [debounce 开始等待200ms]
     *   mousedown(2) → mouseup(2) → dblclick 触发此方法
     *                                              ↓
     *                                    调用 #debouncedCellClick.cancel()
     *                                    取消待执行的 ON_CELL_CLICK 钩子
     *                                    （避免同时触发"单击"和"双击"）
     * ```
     *
     ** 执行流程：**
     *
     * **阶段1：前置条件检查**
     * ```
     * 接收 dblclick 事件
     *    ↓
     * 检查策略是否启用? (!this.enabled)
     *   ├── 否 → 返回
     *   └── 是 ↓
     * 工作表是否存在? (!this.handler.sheet)
     *   ├── 否 → 返回
     *   └── 是 ↓
     * 取消待执行的单击事件:
     *   #debouncedCellClick.cancel()  // 关键步骤！
     * ```
     *
     * **阶段2：位置检测和验证**
     * ```
     * viewport.hitTest(e.clientX, e.clientY)
     *    ↓
     * 检查结果有效性:
     *   ├── hit === null → 返回（点击在空白区域）
     *   └── hit.type !== CELL → 返回（双击在表头等非单元格区域）
     *    ↓
     * 获取合并单元格左上角坐标 (#getTopLeft)
     * ```
     *
     * **阶段3：触发双击钩子**
     * ```javascript
     * this.handler.runHooks(HOOKS.ON_CELL_DBL_CLICK, row, col, e);
     * // 通知外部组件（如插件系统）发生了双击事件
     * // 参数：行号、列号、原始事件对象
     * ```
     *
     * **阶段4：更新选区**
     * ```javascript
     * 合并单元格?
     *   ├── 是 → 选择整个合并区域 (setRange)
     *   └── 否 → 仅选择该单元格 (setActive)
     * ```
     *
     * **阶段5：检查单元格类型（关键分支）**
     * ```
     * 获取单元格类型实例: cellType = sheet.getCellTypeInstance(row, col)
     *    ↓
     * cellType.isInteractive === true?
     *   ├── 是 → 交互式类型（如 StarRatingType, TrafficLightType）
     *   │       不弹出编辑器，直接返回
     *   │       让 cellType 自行处理双击事件（如切换星级）
     *   │
     *   └── 否 → 普通文本/数字/日期等类型
     *           进入编辑模式: editor.show(row, col, "end")
     *           "end" 表示光标定位到文本末尾
     * ```
     *
     ** 交互式类型的特殊处理：**
     * 某些自定义单元格渲染器（如星级评分、交通灯指示器）需要自己处理鼠标事件，
     * 因为它们的输入方式不是传统的文本编辑。例如：
     * - 星级评分：双击切换选中状态或打开评分面板
     * - 交通灯：双击切换颜色状态
     * - 下拉选择器：双击展开选项列表
     *
     * 这些类型实现了 `isInteractive` 标志和自定义的 `handleDblClick()` 方法。
     *
     ** 编辑器的光标位置：**
     * `editor.show(row, col, "end")` 的第三个参数指定初始光标位置：
     * - "start": 光标在文本开头（0位置）
     * - "end": 光标在文本末尾（便于追加内容）
     * - 数字: 具体的字符偏移量
     *
     ** Excel 兼容性：**
     * | 操作 | Excel | 本实现 |
     * |------|-------|--------|
     * | 双击普通单元格 | 进入编辑模式 | ✅ 一致 |
     * | 双击合并单元格 | 进入编辑模式（作用于合并区域） | ✅ 一致 |
     * | 双击公式单元格 | 显示公式（非计算结果） | ⚠️ 取决于Editor实现 |
     * | 双击只读单元格 | 不进入编辑模式 | ❌ 未实现（需添加readOnly检查） |
     *
     * @param {MouseEvent} e - 鼠标双击事件对象
     *   - e.clientX/e.clientY: 鼠标相对于视口的坐标（用于 hitTest）
     * @returns {void}
     *
     * @see #debouncedCellClick - 需要取消的防抖触发器
     * @see #getTopLeft() - 合并单元格坐标转换
     * @see editor.show() - 显示编辑器的方法
     */
    #handleDoubleClick(e) {
        if (!this.enabled || !this.handler.sheet) return;

        this.#debouncedCellClick.cancel();

        const hit = this.handler.viewport.hitTest(e.clientX, e.clientY);
        if (!hit) return;
        if (hit.type !== HIT_TYPE.CELL) return;

        const { row, col } = this.#getTopLeft(hit.row, hit.col);

        this.handler.runHooks(HOOKS.ON_CELL_DBL_CLICK, row, col, e);

        const merge = this.handler.sheet.getMerge(row, col);
        if (merge) {
            this.handler.sheet.selection.setRange(merge.topRow, merge.topCol, merge.bottomRow, merge.bottomCol);
        } else {
            this.handler.sheet.selection.setActive(row, col);
        }

        // 检查单元格类型是否为交互式类型（如星级评分）
        // 交互式类型通过自身处理用户输入，不需要弹出传统编辑器
        const cellType = this.handler.sheet.getCellTypeInstance(row, col);
        if (cellType?.isInteractive) {
            // 交互式类型：不显示编辑器，让类型自己处理双击事件
            return;
        }

        this.handler.editor.show(row, col, "end");
    }

    /**
     * @private 私有方法 - 获取合并单元格的左上角坐标（坐标规范化工具）
     *
     ** 🎯 核心目的：**
     * 将任意单元格坐标转换为"逻辑上的左上角坐标"。
     * 对于普通单元格，返回原坐标；对于合并单元格内的子单元格，
     * 返回合并区域的左上角坐标。
     *
     ** 为什么需要此方法？**
     * 合并单元格由多个物理单元格组成（如 B2:D4 是一个 3×3 的合并区域），
     * 但逻辑上它们是一个整体。当用户点击 C3 时：
     * - 物理坐标：(row=2, col=2) （C3的位置）
     * - 逻辑坐标：(row=1, col=1) （B2的位置，即合并区域的左上角）
     *
     * 所有选区操作都应使用**逻辑坐标**，确保选中整个合并区域。
     *
     ** 执行逻辑：**
     * ```javascript
     * 输入: (row, col) - 可能是合并区域内任意位置的坐标
     *    ↓
     * 查询合并信息: sheet.getMerge(row, col)
     *    ↓
     * 返回值判断:
     *   ├── 存在合并信息 → 返回 { row: merge.topRow, col: merge.topCol }
     *   │                  （使用合并区域的左上角作为规范坐标）
     *   └── 不存在（null/undefined）→ 返回 { row, col }
     *                              （普通单元格，原样返回）
     * ```
     *
     ** 使用场景：**
     * 此方法被多个地方调用，确保坐标一致性：
     * - `#handleMouseDown()`: 点击时确定选区位置
     * - `#handleMouseMove()`: 拖拽时更新焦点位置
     * - `#handleDoubleClick()`: 双击时进入编辑模式
     *
     ** 数据结构：**
     * ```javascript
     * 返回值: { row: number, col: number }
     * // row: 规范化后的行号（始终是合并区域的 topRow 或原行号）
     * // col: 规范化后的列号（始终是合并区域的 topCol 或原列号）
     * ```
     *
     ** 性能考虑：**
     * - getMerge() 的时间复杂度取决于内部实现（通常 O(1) 或 O(log n)）
     * - 此方法可能在高频调用场景中使用（如 mousemove），需注意性能
     * - 可考虑缓存最近的查询结果（如果成为瓶颈）
     *
     ** 边界情况：**
     * - sheet 为 undefined/null: 使用可选链操作符 `?.` 安全访问
     * - 坐标超出范围: getMerge() 应返回 null，此方法返回原坐标
     * - 嵌套合并（理论上不应存在）: 返回最内层合并的左上角
     *
     ** 示例：**
     * ```
     * 假设 B2:D4 是一个合并区域（topRow=1, topCol=1, bottomRow=3, bottomCol=3）
     *
     * #getTopLeft(1, 1) → { row: 1, col: 1 }  (点击B2本身)
     * #getTopLeft(2, 3) → { row: 1, col: 1 }  (点击D3，返回B2)
     * #getTopLeft(5, 5) → { row: 5, col: 5 }  (点击F6，无合并，原样返回)
     * ```
     *
     * @param {number} row - 行号（0-based 索引）
     *   - 可能是合并区域内任意子单元格的行号
     * @param {number} col - 列号（0-based 索引）
     *   - 可能是合并区域内任意子单元格的列号
     * @returns {{ row: number, col: number }} 规范化后的坐标
     *   - 如果是合并单元格内的位置，返回合并区域的左上角坐标
     *   - 如果是普通单元格，返回传入的原坐标
     *
     * @see Sheet.getMerge() - 底层的合并单元格查询API
     * @see #handleMouseDown() - 主要调用者之一
     * @see #handleMouseMove() - 主要调用者之二
     */
    #getTopLeft(row, col) {
        const merge = this.handler.sheet?.getMerge(row, col);
        if (merge) {
            return { row: merge.topRow, col: merge.topCol };
        }
        return { row, col };
    }
}

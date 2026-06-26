/**
 * DOM 事件名称常量定义
 *
 * 统一管理系统中的所有原生 DOM 事件名称，避免硬编码字符串，
 * 提高代码可维护性和类型安全性。
 *
 * 使用场景：
 * - 事件绑定 (addEventListener)
 * - 事件解绑 (removeEventListener)
 * - 事件分发 (dispatchEvent)
 *
 * @module constants/eventNames
 * @example
 * import { EVENT_NAMES } from './constants/eventNames.js';
 * canvas.addEventListener(EVENT_NAMES.CLICK, handleClick);
 */
export const EVENT_NAMES = {
    /** 鼠标单击事件 - 用于单元格选择、按钮点击等 */
    CLICK: "click",

    /** 鼠标双击事件 - 用于进入编辑模式、选中文字等 */
    DBLCLICK: "dblclick",

    /** 鼠标按下事件 - 用于开始拖拽、绘制选择区域等 */
    MOUSEDOWN: "mousedown",

    /** 鼠标移动事件 - 用于拖拽过程、悬停效果等 */
    MOUSEMOVE: "mousemove",

    /** 鼠标释放事件 - 用于结束拖拽、完成选择等 */
    MOUSEUP: "mouseup",

    /** 键盘按下事件 - 用于快捷键、文本输入等 */
    KEYDOWN: "keydown",

    /** 键盘释放事件 - 用于组合键检测等 */
    KEYUP: "keyup",

    /** 滚动事件 - 用于视口滚动同步 */
    SCROLL: "scroll",

    /** 鼠标滚轮事件 - 用于缩放、快速滚动等 */
    WHEEL: "wheel",

    /** 失去焦点事件 - 用于编辑完成验证等 */
    BLUR: "blur",

    /** 获得焦点事件 - 用于编辑器激活等 */
    FOCUS: "focus",

    /** 右键菜单事件 - 用于显示上下文菜单 */
    CONTEXTMENU: "contextmenu",

    /** 窗口大小改变事件 - 用于响应式布局调整 */
    RESIZE: "resize",

    /** 输入法组合开始事件 - 用于处理中文输入等IME输入 */
    COMPOSITIONSTART: "compositionstart",

    /** 输入法组合结束事件 - 用于确认IME输入结果 */
    COMPOSITIONEND: "compositionend",
};

/**
 * 事件委托键定义
 *
 * 采用 "目标元素:事件类型" 的命名规范，用于事件委托机制。
 * 通过统一的事件键名，实现事件的集中管理和策略分发。
 *
 * 设计原则：
 * - Canvas 相关事件：在 canvas 元素上监听，用于表格交互
 * - Document 相关事件：在 document 上监听，用于全局事件捕获
 *
 * 命名格式："{TARGET}:{EVENT_TYPE}"
 * - TARGET: 事件绑定的目标元素 (canvas/document)
 * - EVENT_TYPE: 具体的DOM事件类型
 *
 * @module constants/eventNames
 * @example
 * import { DELEGATE_KEYS } from './constants/eventNames.js';
 * // 在 EventHandler 中使用
 * getEventHandlers() {
 *     return {
 *         [DELEGATE_KEYS.CANVAS_MOUSEDOWN]: this.handleCanvasMouseDown,
 *     };
 * }
 */
export const DELEGATE_KEYS = {
    /** Canvas 鼠标按下 - 开始单元格选择或拖拽操作 */
    CANVAS_MOUSEDOWN: "canvas:mousedown",

    /** Canvas 鼠标移动 - 处理拖拽过程中的实时反馈 */
    CANVAS_MOUSEMOVE: "canvas:mousemove",

    /** Canvas 鼠标释放 - 完成选择或拖拽操作 */
    CANVAS_MOUSEUP: "canvas:mouseup",

    /** Canvas 双击 - 进入单元格编辑模式 */
    CANVAS_DBLCLICK: "canvas:dblclick",

    /** Canvas 右键菜单 - 显示上下文菜单 */
    CANVAS_CONTEXTMENU: "canvas:contextmenu",

    /** Document 鼠标移动 - 捕获脱离Canvas的拖拽操作 */
    DOCUMENT_MOUSEMOVE: "document:mousemove",

    /** Document 鼠标释放 - 确保即使鼠标离开Canvas也能结束操作 */
    DOCUMENT_MOUSEUP: "document:mouseup",

    /** Document 鼠标按下 - 全局点击检测，用于关闭弹出层等 */
    DOCUMENT_MOUSEDOWN: "document:mousedown",

    /** Document 键盘按下 - 全局键盘事件捕获，确保快捷键始终可用 */
    DOCUMENT_KEYDOWN: "document:keydown",
};

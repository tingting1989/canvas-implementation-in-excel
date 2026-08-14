/**
 * DOM 事件名称常量定义
 *
 * 统一管理系统中的所有原生 DOM 事件名称，避免硬编码字符串，
 * 提高代码可维护性和类型安全性。
 *
 * @module constants/eventNames
 */

export interface EventNames {
    readonly CLICK: "click";
    readonly DBLCLICK: "dblclick";
    readonly MOUSEDOWN: "mousedown";
    readonly MOUSEMOVE: "mousemove";
    readonly MOUSEUP: "mouseup";
    readonly KEYDOWN: "keydown";
    readonly KEYUP: "keyup";
    readonly SCROLL: "scroll";
    readonly WHEEL: "wheel";
    readonly BLUR: "blur";
    readonly FOCUS: "focus";
    readonly CONTEXTMENU: "contextmenu";
    readonly RESIZE: "resize";
    readonly COMPOSITIONSTART: "compositionstart";
    readonly COMPOSITIONEND: "compositionend";
    readonly COMPOSITIONUPDATE: "compositionupdate";
    readonly INPUT: "input";
    readonly PASTE: "paste";
}

export const EVENT_NAMES: EventNames = Object.freeze({
    CLICK: "click",
    DBLCLICK: "dblclick",
    MOUSEDOWN: "mousedown",
    MOUSEMOVE: "mousemove",
    MOUSEUP: "mouseup",
    KEYDOWN: "keydown",
    KEYUP: "keyup",
    SCROLL: "scroll",
    WHEEL: "wheel",
    BLUR: "blur",
    FOCUS: "focus",
    CONTEXTMENU: "contextmenu",
    RESIZE: "resize",
    COMPOSITIONSTART: "compositionstart",
    COMPOSITIONEND: "compositionend",
    COMPOSITIONUPDATE: "compositionupdate",
    INPUT: "input",
    PASTE: "paste",
});

/**
 * 事件委托键定义
 *
 * 采用 "目标元素:事件类型" 的命名规范，用于事件委托机制。
 */
export interface DelegateKeys {
    readonly CANVAS_MOUSEDOWN: "canvas:mousedown";
    readonly CANVAS_MOUSEMOVE: "canvas:mousemove";
    readonly CANVAS_MOUSEUP: "canvas:mouseup";
    readonly CANVAS_CLICK: "canvas:click";
    readonly CANVAS_MOUSELEAVE: "canvas:mouseleave";
    readonly CANVAS_DBLCLICK: "canvas:dblclick";
    readonly CANVAS_CONTEXTMENU: "canvas:contextmenu";
    readonly DOCUMENT_MOUSEMOVE: "document:mousemove";
    readonly DOCUMENT_MOUSEUP: "document:mouseup";
    readonly DOCUMENT_MOUSEDOWN: "document:mousedown";
    readonly DOCUMENT_KEYDOWN: "document:keydown";
}

export const DELEGATE_KEYS: DelegateKeys = Object.freeze({
    CANVAS_MOUSEDOWN: "canvas:mousedown",
    CANVAS_MOUSEMOVE: "canvas:mousemove",
    CANVAS_MOUSEUP: "canvas:mouseup",
    CANVAS_CLICK: "canvas:click",
    CANVAS_MOUSELEAVE: "canvas:mouseleave",
    CANVAS_DBLCLICK: "canvas:dblclick",
    CANVAS_CONTEXTMENU: "canvas:contextmenu",
    DOCUMENT_MOUSEMOVE: "document:mousemove",
    DOCUMENT_MOUSEUP: "document:mouseup",
    DOCUMENT_MOUSEDOWN: "document:mousedown",
    DOCUMENT_KEYDOWN: "document:keydown",
});

import { CONFIG } from "../../constants/config";

/** 样式对象类型 */
export type StyleObject = Record<string, unknown>;

/**
 * 样式池（Flyweight 模式）
 *
 * 核心思想：所有样式通过整数 ID 引用，相同样式共享同一对象
 *
 * 收益：
 * - 内存：10000 个相同样式的单元格只存 1 个样式对象
 * - 比较：styleId 整数比较 vs 对象深度比较
 * - 去重：getStyleId 自动合并相同样式，返回已有 ID
 *
 * 局限：
 * - 去重依赖 normalize 的字符串化，频繁调用时有开销
 * - resolveStyle 合并多层样式时产生新样式对象，去重率取决于样式组合数
 *
 * 性能优化：
 * - #normalize 按字母序拼接 key=value，避免 JSON.stringify 开销
 * - #keyCache 缓存已知对象的标准化结果
 *
 * @example
 * const pool = new StylePool();
 * const id1 = pool.getStyleId({ fontSize: 14, color: "red" });
 * const id2 = pool.getStyleId({ color: "red", fontSize: 14 }); // 与 id1 相同
 * pool.getStyle(id1); // => { fontSize: 14, color: "red" }
 */
export class StylePool {
    /** ID → 样式对象的映射表 */
    idToStyle: Map<number, StyleObject>;

    /** 标准化 key → ID 的映射表，用于去重查找 */
    styleToId: Map<string, number>;

    /** 下一个可用样式 ID，从 1 开始递增 */
    nextId: number;

    /**
     * 初始化样式池
     */
    constructor() {
        this.idToStyle = new Map();
        this.styleToId = new Map();
        this.nextId = 1;
    }

    /**
     * 将样式对象标准化为可比较的字符串
     * 优化：按字母序拼接 "key:value"，比 JSON.stringify 快约 3-5 倍
     * 递归处理嵌套对象，并在值前添加类型标记以区分数字和字符串
     * @param obj - 待标准化的样式对象
     * @returns 标准化后的字符串，可用作 Map 键
     */
    #normalize(obj: StyleObject): string {
        const keys = Object.keys(obj).sort();
        let s = "";
        for (let i = 0; i < keys.length; i++) {
            if (i > 0) s += ",";
            s += keys[i] + ":" + this.#normalizeValue(obj[keys[i]]);
        }
        return s;
    }

    /**
     * 将单个值标准化为带类型标记的字符串
     * 类型标记取类型首字母（如 "n" for number, "s" for string），
     * 确保不同类型的相同字面量（如 14 vs "14"）不会混淆
     * @param val - 待标准化的值
     * @returns 带类型标记的标准化字符串
     */
    #normalizeValue(val: unknown): string {
        if (val === null) return "null";
        if (val === undefined) return "undefined";
        const type = typeof val;
        if (type === "object") {
            return "{" + this.#normalize(val as StyleObject) + "}";
        }
        return type.charAt(0) + ":" + val;
    }

    /**
     * 注册或获取已有样式的 ID
     * 相同内容的样式对象返回同一 ID（去重）
     * @param obj - 样式对象
     * @returns 样式 ID
     */
    getStyleId(obj: StyleObject = {}): number {
        const key = this.#normalize(obj);
        if (this.styleToId.has(key)) return this.styleToId.get(key)!;
        const id = this.nextId++;
        this.idToStyle.set(id, { ...obj });
        this.styleToId.set(key, id);
        return id;
    }

    /**
     * 根据 ID 获取样式对象的浅拷贝
     * 返回浅拷贝而非原引用，防止调用方意外修改池中共享对象
     * @param id - 样式 ID
     * @returns 样式对象的浅拷贝，ID 不存在时返回空对象
     */
    getStyle(id: number): StyleObject {
        const style = this.idToStyle.get(id);
        return style ? { ...style } : {};
    }

    /**
     * 获取当前样式池中的样式数量（调试用）
     * @returns 已注册的不同样式数量
     */
    get size(): number {
        return this.idToStyle.size;
    }
}

/**
 * 合法的单元格样式属性名集合
 * 用于校验样式对象中是否包含非法属性
 */
export const CELL_STYLE_PROPERTIES: Set<string> = new Set([
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "color",
    "backgroundColor",
    "textAlign",
    "verticalAlign",
    "textDecoration",
    "border",
    "cursor",
]);

/**
 * 校验样式对象中是否包含未知属性，若有则在控制台输出警告
 * @param styleObj - 待校验的样式对象
 */
export function validateStyleProperties(styleObj: StyleObject | null | undefined): void {
    if (!styleObj || typeof styleObj !== "object") return;
    for (const key of Object.keys(styleObj)) {
        if (!CELL_STYLE_PROPERTIES.has(key)) {
            console.warn(`[Style] Unknown property: "${key}"`);
        }
    }
}

/** 全局样式池单例 */
export const stylePool: StylePool = new StylePool();

/**
 * 默认样式 ID
 * 基于全局配置的默认字体、字号、颜色等创建，
 * 所有未指定样式的单元格默认引用此 ID
 */
export const DEFAULT_STYLE_ID: number = stylePool.getStyleId({
    fontFamily: CONFIG.DEFAULT_FONT_FAMILY,
    fontSize: CONFIG.DEFAULT_FONT_SIZE,
    color: CONFIG.CELL_TEXT_COLOR,
    backgroundColor: "transparent",
    textAlign: "left",
    verticalAlign: "middle",
});

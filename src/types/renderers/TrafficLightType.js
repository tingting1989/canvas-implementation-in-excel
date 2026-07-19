/**
 * 交通灯状态渲染器（Traffic Light Status Renderer）
 *
 * 将状态值（green/yellow/red）渲染为可视化交通灯指示器，
 * 常用于表示系统状态、健康检查、风险等级等场景。
 *
 * ✨ 核心特性：
 * - 🚦 三色指示灯：绿色（正常）、黄色（警告）、红色（危险）
 * - 🎯 点击交互：直接点击切换状态（循环：绿→黄→红→绿）
 * - 🖱️ 悬停预览：鼠标悬停时显示状态提示和发光效果
 * - ⌨️ 键盘支持：方向键/数字键快速切换状态
 * - ✨ 平滑动画：状态切换时的过渡动画效果
 * - 📐 自适应布局：自动适配单元格大小和对齐方式
 *
 * 适用场景：
 * - 服务器/服务健康状态监控
 * - 项目进度风险标识
 * - 设备运行状态指示
 * - 质量检测等级展示
 * - API 接口可用性标记
 *
 * @module types/renderers/TrafficLightType
 * @example
 * ```javascript
 * // 在列配置中使用
 * {
 *     type: 'trafficLight',
 *     header: '系统状态',
 *     options: {
 *         size: 0.6,                    // 指示灯大小比例 (0-1)
 *         showLabel: true,              // 是否显示文字标签
 *         colors: {                     // 自定义颜色
 *             green: '#4CAF50',
 *             yellow: '#FFC107',
 *             red: '#F44336'
 *         },
 *         labels: {                     // 自定义标签
 *             green: '正常',
 *             yellow: '警告',
 *             red: '危险'
 *         }
 *     }
 * }
 * ```
 */

import { BaseColumnType } from "../BaseColumnType.js";

export class TrafficLightType extends BaseColumnType {
    /**
     * 🎯 静态悬停状态存储（跨实例共享）
     *
     * 解决问题：getCellTypeInstance() 可能每次返回新实例，
     * 导致实例属性在重绘时丢失。
     *
     * 使用 "行,列" 作为 key 存储悬停值。
     * @type {Map<string, boolean>}
     */
    static #hoverStateMap = new Map();

    /**
     * 有效状态值列表（用于验证和循环切换）
     * @type {string[]}
     */
    static VALID_STATES = ["green", "yellow", "red"];

    /**
     * 默认颜色配置
     * @type {Object.<string, string>}
     */
    static DEFAULT_COLORS = Object.freeze({
        green: "#4CAF50",
        yellow: "#FFC107",
        red: "#F44336",
    });

    /**
     * 默认标签配置
     * @type {Object.<string, string>}
     */
    static DEFAULT_LABELS = Object.freeze({
        green: "正常",
        yellow: "警告",
        red: "危险",
    });

    /**
     * 获取或设置单元格的悬停状态（静态方法 - 跨实例共享）
     *
     * @param {string} cellKey - 单元格标识（格式："行,列"）
     * @param {boolean} [newValue] - 新的悬停值（可选，不传则读取）
     * @returns {boolean|null} 当前的悬停状态
     */
    static hoverState(cellKey, newValue) {
        if (newValue !== undefined) {
            TrafficLightType.#hoverStateMap.set(cellKey, newValue);
        }
        return TrafficLightType.#hoverStateMap.get(cellKey) ?? null;
    }

    /**
     * 清除指定单元格的悬停状态
     *
     * @param {string} cellKey - 单元格标识
     */
    static clearHoverState(cellKey) {
        TrafficLightType.#hoverStateMap.delete(cellKey);
    }

    /**
     * 清除所有悬停状态（静态方法）
     */
    static clearAllHoverStates() {
        TrafficLightType.#hoverStateMap.clear();
    }

    /** 当前单元格标识（用于静态状态映射） */
    #currentCellKey = null;

    /** 动画目标状态 */
    #targetState = null;

    /** 动画当前透明度（用于淡入淡出效果） */
    #animationOpacity = 1;

    /** 动画开始时间 */
    #animationStartTime = null;

    /** 动画持续时间（毫秒） */
    static get ANIMATION_DURATION() {
        return 250;
    }

    get name() {
        return "trafficLight";
    }

    get editorType() {
        // 返回 "select" 提供下拉选择框作为备选编辑方式
        return "select";
    }

    /**
     * 标记此类型为交互式类型
     *
     * 交互式类型的特点：
     * - 支持点击、悬停等鼠标操作直接交互
     * - 可通过键盘快捷键操作
     * - 双击时不进入默认编辑模式（使用自定义编辑器）
     *
     * @returns {boolean}
     */
    get isInteractive() {
        return true;
    }

    /**
     * 获取下拉选择器的选项列表
     *
     * @returns {Array<{value: string, label: string}>} 选项数组
     */
    getEditorOptions() {
        const labels = this.options?.labels || TrafficLightType.DEFAULT_LABELS;
        // 颜色配置保留供未来扩展使用
        void (this.options?.colors || TrafficLightType.DEFAULT_COLORS);

        return [
            { value: "green", label: `🟢 ${labels.green}` },
            { value: "yellow", label: `🟡 ${labels.yellow}` },
            { value: "red", label: `🔴 ${labels.red}` },
        ];
    }

    getDefaultStyle(baseStyle) {
        return { ...baseStyle, textAlign: "left", cursor: "pointer" };
    }

    /**
     * 格式化显示值
     *
     * @param {*} value - 原始值
     * @returns {string} 格式化后的文本
     */
    format(value) {
        const labels = this.options?.labels || TrafficLightType.DEFAULT_LABELS;
        return labels[value] || String(value ?? "");
    }

    /**
     * 验证值是否有效
     *
     * @param {*} value - 待验证的值
     * @returns {boolean|string} true 表示有效，错误信息字符串表示无效
     */
    validate(value) {
        if (value === "" || value === null || value === undefined) return true;

        if (!TrafficLightType.VALID_STATES.includes(value)) {
            const validStates = TrafficLightType.VALID_STATES.join("、");
            return `状态值必须是以下之一：${validStates}`;
        }

        return true;
    }

    /**
     * 处理单元格点击事件 ⭐ 点击切换状态
     *
     * 点击时循环切换状态：green → yellow → red → green
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param _event
     * @returns {string|null} 返回新的状态值，或 null 表示无效点击
     */
    handleClick(context, _event) {
        const { value } = context;
        // 防止未使用参数警告
        void _event;

        // 循环切换到下一个状态
        const currentIndex = TrafficLightType.VALID_STATES.indexOf(value);
        const nextIndex = (currentIndex + 1) % TrafficLightType.VALID_STATES.length;
        const newState = TrafficLightType.VALID_STATES[nextIndex];

        // 启动状态切换动画
        this.#startAnimation(newState);

        // 清除悬停状态
        const cellKey = `${context.row},${context.col}`;
        TrafficLightType.hoverState(cellKey, false);

        return newState;
    }

    /**
     * 处理鼠标悬停事件 ⭐ 悬停高亮效果
     *
     * 更新悬停状态以显示发光效果。
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     * @param {MouseEvent} event - 鼠标事件对象
     * @returns {boolean} 是否需要重绘（true=需要重绘显示悬停效果）
     */
    handleHover(context, _event) {
        const cellKey = `${context.row},${context.col}`;
        // 防止未使用参数警告
        void _event;
        this.#currentCellKey = cellKey;

        const currentHover = TrafficLightType.hoverState(cellKey);

        if (currentHover !== true) {
            TrafficLightType.hoverState(cellKey, true);
            return true; // 需要重绘以显示悬停效果
        }

        return false;
    }

    /**
     * 处理鼠标移出事件
     *
     * 清除悬停状态，恢复正常显示。
     *
     * @returns {boolean} 是否需要重绘
     */
    handleMouseLeave() {
        let needsRedraw = false;

        // 清除当前单元格的悬停状态
        if (this.#currentCellKey && TrafficLightType.#hoverStateMap.has(this.#currentCellKey)) {
            TrafficLightType.clearHoverState(this.#currentCellKey);
            needsRedraw = true;
        }

        return needsRedraw;
    }

    /**
     * 处理键盘事件 ⭐ 新增键盘支持
     *
     * 支持以下快捷键：
     * - Arrow Right / Up / Down：循环切换到下一个状态
     * - Arrow Left：切换到上一个状态
     * - 数字键 1-3：直接设置对应状态（1=绿，2=黄，3=红）
     *
     * @param {KeyboardEvent} event - 键盘事件对象
     * @param {*} currentValue - 当前值
     * @returns {string|null} 返回新状态值，或 null 表示未处理
     */
    handleKeydown(event, currentValue) {
        // 根据按键计算新的状态值
        let newState;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp":
            case "ArrowDown": {
                // 切换到下一个状态（循环）
                const currentIndex = TrafficLightType.VALID_STATES.indexOf(currentValue);
                const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % TrafficLightType.VALID_STATES.length;
                newState = TrafficLightType.VALID_STATES[nextIndex];
                break;
            }
            case "ArrowLeft": {
                // 切换到上一个状态（循环）
                const currentIndex = TrafficLightType.VALID_STATES.indexOf(currentValue);
                const prevIndex = currentIndex <= 0 ? TrafficLightType.VALID_STATES.length - 1 : currentIndex - 1;
                newState = TrafficLightType.VALID_STATES[prevIndex];
                break;
            }
            default: {
                // 数字键映射：1=green, 2=yellow, 3=red
                const digit = parseInt(event.key, 10);
                if (digit >= 1 && digit <= 3) {
                    const stateIndex = digit - 1;
                    newState = TrafficLightType.VALID_STATES[stateIndex];
                } else {
                    return null; // 非目标按键，交由默认逻辑处理
                }
                break;
            }
        }

        // 状态未变化时返回 null（避免无意义的更新和动画）
        if (newState === currentValue || newState === undefined) {
            return null;
        }

        // 启动状态切换动画
        this.#startAnimation(newState);

        return newState;
    }

    /**
     * 启动状态切换动画
     *
     * @param {string} targetState - 目标状态值
     */
    #startAnimation(targetState) {
        this.#targetState = targetState;
        this.#animationStartTime = performance.now();
        this.#animationOpacity = 0.5; // 从半透明开始
    }

    /**
     * 更新动画状态
     *
     * 应在 render() 中调用。
     *
     * @returns {number} 当前动画透明度 (0-1)
     */
    #updateAnimation() {
        if (this.#animationStartTime === null || this.#targetState === null) {
            return 1; // 无动画进行中
        }

        const elapsed = performance.now() - this.#animationStartTime;
        const progress = Math.min(elapsed / TrafficLightType.ANIMATION_DURATION, 1);

        // 使用 easeOutCubic 缓动函数
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        this.#animationOpacity = 0.5 + 0.5 * easedProgress; // 从 0.5 渐变到 1

        if (progress >= 1) {
            this.#animationOpacity = 1;
            this.#animationStartTime = null;
            this.#targetState = null;
        }

        return this.#animationOpacity;
    }

    /**
     * 自定义渲染方法（交通灯指示器）
     *
     * 绘制一个圆形指示灯 + 文字标签的组合：
     * - 圆形使用当前状态的填充色
     * - 悬停时添加发光效果（外圈光晕）
     * - 选中时添加边框高亮
     * - 状态切换时有淡入动画
     *
     * @param {import('../CellRenderContext.js').CellRenderContext} context - 单元格渲染上下文
     */
    render(context) {
        const { ctx, x, y, width, height, value, style } = context;
        // displayValue 保留供未来扩展使用（如 tooltip）
        void context.displayValue;

        const cellKey = `${context.row},${context.col}`;
        this.#currentCellKey = cellKey;

        // 检查是否为有效状态值
        if (!TrafficLightType.VALID_STATES.includes(value)) {
            // 无效值：回退到基类渲染（显示原始文本）
            return super.render(context);
        }

        // 获取配置选项
        const colors = this.options?.colors || TrafficLightType.DEFAULT_COLORS;
        const labels = this.options?.labels || TrafficLightType.DEFAULT_LABELS;
        const showLabel = this.options?.showLabel !== false; // 默认显示标签

        // 计算尺寸参数
        const minDimension = Math.min(width, height);
        const baseSize = Math.max(12, minDimension * (this.options?.size || 0.35));
        const radius = baseSize / 2;
        const padding = context.getPadding(context.sheet);

        // 字体样式
        const fontSize = style?.fontSize || 14;
        const fontFamily = style?.fontFamily || "Microsoft YaHei";
        const textColor = style?.color || "#000000";
        const textAlign = style?.textAlign || "left";

        ctx.font = `${fontSize}px ${fontFamily}`;

        // 计算文字宽度（如果显示标签）
        const labelText = showLabel ? labels[value] || "" : "";
        const textWidth = labelText ? ctx.measureText(labelText).width : 0;
        const gap = 6; // 指示灯与文字的间距
        const totalWidth = baseSize + gap + textWidth;

        // 根据对齐方式计算起始 X 坐标
        let startX;
        switch (textAlign) {
            case "right":
                startX = x + width - totalWidth - padding;
                break;
            case "center":
                startX = x + (width - totalWidth) / 2;
                break;
            default: // left
                startX = x + padding;
                break;
        }

        // 指示灯中心坐标
        const indicatorCx = startX + radius;
        const indicatorCy = y + height / 2;

        // 获取当前颜色
        const fillColor = colors[value] || "#CCCCCC";

        // 更新动画状态
        const opacity = this.#updateAnimation();
        ctx.globalAlpha = opacity;

        // 检查悬停状态
        const isHovered = TrafficLightType.hoverState(cellKey) === true;

        // ✨ 绘制悬停发光效果（外圈光晕）
        if (isHovered) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(indicatorCx, indicatorCy, radius + 4, 0, Math.PI * 2);

            // 创建径向渐变模拟发光
            const glowGradient = ctx.createRadialGradient(indicatorCx, indicatorCy, radius, indicatorCx, indicatorCy, radius + 8);
            glowGradient.addColorStop(0, fillColor + "40"); // 25% 透明度
            glowGradient.addColorStop(1, fillColor + "00"); // 完全透明

            ctx.fillStyle = glowGradient;
            ctx.fill();
            ctx.restore();
        }

        // 🔴🟡🟢 绘制主指示灯圆形
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(indicatorCx, indicatorCy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 添加微弱的内阴影效果（增强立体感）
        ctx.save();
        ctx.beginPath();
        ctx.arc(indicatorCx, indicatorCy, radius, 0, Math.PI * 2);
        ctx.clip();

        // 内部高光（左上角）
        const highlightGradient = ctx.createRadialGradient(
            indicatorCx - radius * 0.3,
            indicatorCy - radius * 0.3,
            0,
            indicatorCx,
            indicatorCy,
            radius,
        );
        highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
        highlightGradient.addColorStop(0.7, "rgba(255, 255, 255, 0.1)");
        highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

        ctx.fillStyle = highlightGradient;
        ctx.fill();
        ctx.restore();

        // 🖼️ 选中状态：绘制边框
        if (context.isSelected) {
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(indicatorCx, indicatorCy, radius + 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 📝 绘制文字标签
        if (labelText) {
            const textX = startX + baseSize + gap;

            ctx.globalAlpha = opacity; // 保持与指示灯同步的透明度
            ctx.fillStyle = textColor;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(labelText, textX, indicatorCy);
        }

        // 重置全局透明度
        ctx.globalAlpha = 1;

        // 如果有动画在进行中，标记需要继续更新
        if (this.#animationStartTime !== null) {
            context.needsUpdate = true;
        }

        // 显式返回 undefined 以满足 consistent-return 规则
        return undefined;
    }
}

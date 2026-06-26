export const ERROR_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
};

export const ERROR_CODE = {
    // ── 插件 ──
    /** 插件未注册 */
    PLUGIN_NOT_REGISTERED: "PLUGIN_NOT_REGISTERED",

    /** 插件已加载 */
    PLUGIN_ALREADY_LOADED: "PLUGIN_ALREADY_LOADED",

    /** 插件类未继承 BasePlugin */
    PLUGIN_INVALID_CLASS: "PLUGIN_INVALID_CLASS",

    /** 子类未覆写抽象方法 */
    PLUGIN_ABSTRACT_METHOD: "PLUGIN_ABSTRACT_METHOD",

    // ── 钩子 ──
    /** 钩子回调不是函数 */
    HOOK_CALLBACK_INVALID: "HOOK_CALLBACK_INVALID",

    /** 钩子执行异常 */
    HOOK_EXECUTION_ERROR: "HOOK_EXECUTION_ERROR",

    // ── 类型 ──
    /** 类型未注册 */
    TYPE_NOT_REGISTERED: "TYPE_NOT_REGISTERED",

    /** 类型实例无效 */
    TYPE_INVALID_INSTANCE: "TYPE_INVALID_INSTANCE",

    /** 类型解析失败 */
    TYPE_PARSE_ERROR: "TYPE_PARSE_ERROR",

    // ── 剪贴板 ──
    /** 剪贴板读取失败 */
    CLIPBOARD_READ_ERROR: "CLIPBOARD_READ_ERROR",

    /** 剪贴板写入失败 */
    CLIPBOARD_WRITE_ERROR: "CLIPBOARD_WRITE_ERROR",

    /** 剪贴板类型不一致 */
    CLIPBOARD_TYPE_MISMATCH: "CLIPBOARD_TYPE_MISMATCH",

    // ── 数据 ──
    /** 单元格数据无效 */
    CELL_INVALID_DATA: "CELL_INVALID_DATA",

    /** 行列索引越界 */
    INDEX_OUT_OF_BOUNDS: "INDEX_OUT_OF_BOUNDS",

    // ── 渲染 ──
    /** 渲染异常 */
    RENDER_ERROR: "RENDER_ERROR",

    // ── 公式 ──
    /** 函数名无效（空或非字符串） */
    FORMULA_INVALID_FUNCTION_NAME: "FORMULA_INVALID_FUNCTION_NAME",

    /** 函数实现无效（非函数类型） */
    FORMULA_INVALID_FUNCTION: "FORMULA_INVALID_FUNCTION",

    /** 函数已存在，将被覆盖 */
    FORMULA_FUNCTION_OVERRIDE: "FORMULA_FUNCTION_OVERRIDE",

    /** 函数未注册 */
    FORMULA_FUNCTION_NOT_FOUND: "FORMULA_FUNCTION_NOT_FOUND",

    /** 公式解析错误 */
    FORMULA_PARSE_ERROR: "FORMULA_PARSE_ERROR",

    /** 公式求值错误 */
    FORMULA_EVAL_ERROR: "FORMULA_EVAL_ERROR",

    /** 循环引用检测 */
    FORMULA_CIRCULAR_REFERENCE: "FORMULA_CIRCULAR_REFERENCE",

    /** 参数数量无效 */
    FORMULA_ARGUMENT_COUNT_INVALID: "FORMULA_ARGUMENT_COUNT_INVALID",

    // ── 排序 ──
    /** 排序引擎未初始化 */
    SORT_ENGINE_NOT_INITIALIZED: "SORT_ENGINE_NOT_INITIALIZED",

    // ── 通用 ──
    /** 未知错误 */
    UNKNOWN: "UNKNOWN",

    // 数据验证相关
    /** 数据验证异常 */
    VALIDATION_ERROR: "VALIDATION_ERROR",
    /** 数据验证器未注册 */
    VALIDATOR_NOT_REGISTERED: "VALIDATOR_NOT_REGISTERED",
    /** 数据验证规则无效 */
    VALIDATION_RULE_INVALID: "VALIDATION_RULE_INVALID",
    /** 公式求值错误 */
    FORMULA_EVALUATION_ERROR: "FORMULA_EVALUATION_ERROR",
    /** 正则表达式执行失败 */
    REGEX_EXECUTION_ERROR: "REGEX_EXECUTION_ERROR",
    /** 列表验证功能未实现 */
    LIST_VALIDATION_NOT_IMPLEMENTED: "LIST_VALIDATION_NOT_IMPLEMENTED",
    /** 条件格式插件未初始化 */
    CONDITIONAL_FORMAT_NOT_INITIALIZED: "CONDITIONAL_FORMAT_NOT_INITIALIZED",
    /** 格式模板未找到 */
    FORMAT_TEMPLATE_NOT_FOUND: "FORMAT_TEMPLATE_NOT_FOUND",
    /** 格式应用失败 */
    FORMAT_APPLY_ERROR: "FORMAT_APPLY_ERROR",
    /** 格式移除失败 */
    FORMAT_REMOVE_ERROR: "FORMAT_REMOVE_ERROR",
    /** 公式引擎接口无法实现 */
    FORMULA_ENGINE_INTERFACE_MISSING: "FORMULA_ENGINE_INTERFACE_MISSING",
    /** 用于调试时的信息日志 */
    VALIDATION_DEBUG_LOG: "VALIDATION_DEBUG_LOG",
};

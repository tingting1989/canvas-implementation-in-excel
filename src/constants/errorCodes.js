export const ERROR_LEVEL = Object.freeze({
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    FATAL: 4,
});

export const ERROR_CODE = Object.freeze({
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

    /** 类型名称无效（空或非字符串） */
    TYPE_INVALID_NAME: "TYPE_INVALID_NAME",

    /** 类型构造函数无效（非构造函数） */
    TYPE_INVALID_CLASS: "TYPE_INVALID_CLASS",

    /** 类型已存在，将被覆盖 */
    TYPE_DUPLICATE: "TYPE_DUPLICATE",

    /** 类型实例化失败 */
    TYPE_INSTANTIATION_ERROR: "TYPE_INSTANTIATION_ERROR",

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

    // ── 图层合成器 ──
    /** 图层实例无效（非 BaseLayer 子类） */
    LAYER_INVALID_INSTANCE: "LAYER_INVALID_INSTANCE",

    /** 图层已注册，不可重复注册 */
    LAYER_ALREADY_REGISTERED: "LAYER_ALREADY_REGISTERED",

    /** 图层渲染异常 */
    LAYER_RENDER_ERROR: "LAYER_RENDER_ERROR",

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

    // ── 搜索 ──
    /** 搜索范围为空或无数据 */
    SEARCH_EMPTY_RANGE: "SEARCH_EMPTY_RANGE",

    /** 搜索执行失败 */
    SEARCH_EXECUTION_ERROR: "SEARCH_EXECUTION_ERROR",

    /** 无效的正则表达式 */
    SEARCH_INVALID_REGEX: "SEARCH_INVALID_REGEX",

    /** 替换操作失败 */
    SEARCH_REPLACE_ERROR: "SEARCH_REPLACE_ERROR",

    /** 全部替换失败 */
    SEARCH_REPLACE_ALL_ERROR: "SEARCH_REPLACE_ALL_ERROR",

    /** 替换时跳过不可编辑单元格 */
    SEARCH_CELLS_SKIPPED: "SEARCH_CELLS_SKIPPED",

    /** 渲染高亮失败 */
    SEARCH_HIGHLIGHT_RENDER_ERROR: "SEARCH_HIGHLIGHT_RENDER_ERROR",

    /** 获取可视范围失败 */
    SEARCH_VISIBLE_RANGE_ERROR: "SEARCH_VISIBLE_RANGE_ERROR",

    /** 滚动到单元格失败 */
    SEARCH_SCROLL_TO_CELL_ERROR: "SEARCH_SCROLL_TO_CELL_ERROR",

    /** 同步选区失败 */
    SEARCH_SELECTION_SYNC_ERROR: "SEARCH_SELECTION_SYNC_ERROR",

    /** 键盘事件处理失败 */
    SEARCH_KEYBOARD_EVENT_ERROR: "SEARCH_KEYBOARD_EVENT_ERROR",

    /** 缺少必要的上下文信息 */
    SEARCH_MISSING_CONTEXT: "SEARCH_MISSING_CONTEXT",

    /** 搜索结果过多，已截断 */
    SEARCH_RESULTS_TRUNCATED: "SEARCH_RESULTS_TRUNCATED",

    /** 搜索单元格出错 */
    SEARCH_CELL_SEARCH_ERROR: "SEARCH_CELL_SEARCH_ERROR",

    /** UI 控制器 - 注销 PopupManager 失败 */
    SEARCH_UI_POPUP_UNREGISTER_ERROR: "SEARCH_UI_POPUP_UNREGISTER_ERROR",

    /** UI 控制器 - 获取工作表位置失败 */
    SEARCH_UI_POSITION_ERROR: "SEARCH_UI_POSITION_ERROR",

    /** UI 控制器 - 导航失败 */
    SEARCH_UI_NAVIGATION_ERROR: "SEARCH_UI_NAVIGATION_ERROR",

    /** UI 控制器 - 关闭面板出错 */
    SEARCH_UI_CLOSE_ERROR: "SEARCH_UI_CLOSE_ERROR",

    /** Search Dropdown - 显示错误 */
    SEARCH_DROPDOWN_SHOW_ERROR: "SEARCH_DROPDOWN_SHOW_ERROR",

    /** Search Dropdown - 显示警告 */
    SEARCH_DROPDOWN_WARNING: "SEARCH_DROPDOWN_WARNING",

    /** Search - 没有搜索结果可替换 */
    SEARCH_NO_RESULTS: "SEARCH_NO_RESULTS",

    /** Search - 所有匹配单元格都被跳过（不可编辑） */
    SEARCH_REPLACE_ALL_SKIPPED: "SEARCH_REPLACE_ALL_SKIPPED",

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

    /** 数据验证信息日志 */
    VALIDATION_INFO: "VALIDATION_INFO",

    // ── 导出 ──
    /** 导出功能 - 样式获取失败 */
    EXPORT_STYLE_FETCH_FAILED: "EXPORT_STYLE_FETCH_FAILED",

    /** 导出功能 - 颜色解析失败 */
    EXPORT_COLOR_PARSE_FAILED: "EXPORT_COLOR_PARSE_FAILED",

    /** 导出功能 - 合并单元格处理异常 */
    EXPORT_MERGE_ERROR: "EXPORT_MERGE_ERROR",

    /** 导出功能 - 数据写入异常 */
    EXPORT_DATA_WRITE_ERROR: "EXPORT_DATA_WRITE_ERROR",

    /** 导出功能 - 文件生成失败 */
    EXPORT_FILE_GENERATE_FAILED: "EXPORT_FILE_GENERATE_FAILED",

    // ── 导入 ──
    /** 导入功能 - 文件读取失败 */
    IMPORT_FILE_READ_ERROR: "IMPORT_FILE_READ_ERROR",

    /** 导入功能 - 文件解析失败 */
    IMPORT_FILE_PARSE_ERROR: "IMPORT_FILE_PARSE_ERROR",

    /** 导入功能 - 不支持的文件格式 */
    IMPORT_UNSUPPORTED_FORMAT: "IMPORT_UNSUPPORTED_FORMAT",

    /** 导入功能 - 数据验证失败 */
    IMPORT_DATA_VALIDATION_ERROR: "IMPORT_DATA_VALIDATION_ERROR",

    /** 导入功能 - 样式转换失败 */
    IMPORT_STYLE_CONVERSION_ERROR: "IMPORT_STYLE_CONVERSION_ERROR",

    /** 导入功能 - 用户取消操作 */
    IMPORT_CANCELLED_BY_USER: "IMPORT_CANCELLED_BY_USER",

    /** 导入功能 - 未知错误 */
    IMPORT_UNKNOWN_ERROR: "IMPORT_UNKNOWN_ERROR",

    /** 导入功能 - 无效文件格式 */
    INVALID_FILE_FORMAT: "INVALID_FILE_FORMAT",

    /** 导入功能 - 合并单元格处理警告 */
    IMPORT_MERGE_WARNING: "IMPORT_MERGE_WARNING",

    /** 导入功能 - 尺寸设置警告 */
    IMPORT_DIMENSION_WARNING: "IMPORT_DIMENSION_WARNING",

    /** 导入功能 - 单元格范围解析错误 */
    IMPORT_RANGE_PARSE_ERROR: "IMPORT_RANGE_PARSE_ERROR",

    // ── 图表 ──
    /** 图表缓存重建失败 */
    CHART_CACHE_REBUILD_FAILED: "CHART_CACHE_REBUILD_FAILED",

    /** 图表视口转换器创建失败 */
    CHART_VIEWPORT_TRANSFORM_FAILED: "CHART_VIEWPORT_TRANSFORM_FAILED",

    /** 图表渲染异常 */
    CHART_RENDER_ERROR: "CHART_RENDER_ERROR",

    /** 图表数据提取器初始化失败 */
    CHART_DATA_EXTRACTOR_INIT_FAILED: "CHART_DATA_EXTRACTOR_INIT_FAILED",

    /** 图表缓存管理器事件监听器设置失败 */
    CHART_CACHE_MANAGER_LISTENER_SETUP_FAILED: "CHART_CACHE_MANAGER_LISTENER_SETUP_FAILED",

    /** 图表缓存管理器事件监听器移除失败 */
    CHART_CACHE_MANAGER_LISTENER_REMOVE_FAILED: "CHART_CACHE_MANAGER_LISTENER_REMOVE_FAILED",

    /** 图表缓存管理器 Sheet 或 EventBus 不可用 */
    CHART_CACHE_MANAGER_SHEET_UNAVAILABLE: "CHART_CACHE_MANAGER_SHEET_UNAVAILABLE",

    /** 图表策略调试信息 */
    CHART_STRATEGY_DEBUG: "CHART_STRATEGY_DEBUG",

    /** 图表策略注册成功 */
    CHART_STRATEGY_REGISTERED: "CHART_STRATEGY_REGISTERED",

    /** 图表渲染开始 */
    CHART_RENDER_START: "CHART_RENDER_START",

    /** 图表数据为空警告 */
    CHART_DATA_EMPTY: "CHART_DATA_EMPTY",

    /** 图表类型未找到警告 */
    CHART_TYPE_NOT_FOUND: "CHART_TYPE_NOT_FOUND",

    /** 图表策略无效错误 */
    CHART_INVALID_STRATEGY: "CHART_INVALID_STRATEGY",

    // 通用日志分类
    /** 通用错误 */
    GENERIC_ERROR: "GENERIC_ERROR",

    /** 通用警告 */
    GENERIC_WARN: "GENERIC_WARN",

    /** 通用调试日志 */
    DEBUG_LOG: "DEBUG_LOG",

    // ── 主题 ──
    /** 主题 - 从 localStorage 加载失败 */
    THEME_STORAGE_LOAD_FAILED: "THEME_STORAGE_LOAD_FAILED",

    /** 主题 - 保存到 localStorage 失败 */
    THEME_STORAGE_SAVE_FAILED: "THEME_STORAGE_SAVE_FAILED",

    /** 主题 - 配置必须为对象 */
    THEME_CONFIG_INVALID_TYPE: "THEME_CONFIG_INVALID_TYPE",

    /** 主题 - 缺少 config 属性 */
    THEME_CONFIG_MISSING_CONFIG: "THEME_CONFIG_MISSING_CONFIG",

    /** 主题 - 缺少 config.cell 属性 */
    THEME_CONFIG_MISSING_CELL: "THEME_CONFIG_MISSING_CELL",

    /** 主题 - 不存在 */
    THEME_NOT_FOUND: "THEME_NOT_FOUND",

    /** 主题 - 已存在 */
    THEME_ALREADY_EXISTS: "THEME_ALREADY_EXISTS",

    /** 主题 - 不能删除当前激活的主题 */
    THEME_CANNOT_REMOVE_ACTIVE: "THEME_CANNOT_REMOVE_ACTIVE",
});

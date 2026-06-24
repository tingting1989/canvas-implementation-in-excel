按业务价值排序：

🔴 高优先级（核心表格能力缺失）
功能	Handsontable 实现	影响	建议
公式引擎	=SUM()、=AVERAGE()、=IF()、跨表引用等	没有公式就不是真正意义上的电子表格	这是最大的功能鸿沟。建议引入 hyperformula 或自研最小可用公式引擎
排序	点击列头排序、多列排序、自定义排序函数	数据查看体验严重受限	在 ColumnType 基础上，实现 sortRows(col, order) 和列头排序 UI
筛选/过滤	列头下拉筛选、条件筛选、搜索过滤	大数据量下无法快速定位数据	在 RowColManager 层实现 filterRows(predicate)，配合虚拟滚动
查找替换	Ctrl+F 查找、Ctrl+H 替换、正则匹配	编辑效率大打折扣	可从 KeyboardStrategy 扩展，逐行搜索 + 高亮匹配 Cell
🟡 中优先级（用户体验提升）
功能	Handsontable 实现	影响	建议
只读模式	readOnly: true 全局禁用编辑	查看模式必备	实现简单：Sheet 加 #readOnly 标志，EditorManager 拦截编辑请求
列宽自适应	autoColumnSize、stretchH: "all"	列宽不能自动撑满容器	stretchH 较容易：根据容器宽度 + 列数重新计算 colWidths
行高自适应	autoRowSize 根据内容自动调整行高	长文本被截断	需要 Canvas 的 measureText 逐行计算，较复杂
Word Wrap	自动换行，多行单元格	长文本阅读困难	需要在 TileRenderer 中逐词分割文本，分行绘制
批注/注释	单元格右上角红色三角 + 悬浮提示	协作场景缺失	可先用 DOM overlay 实现，不必修改 Canvas 渲染
列摘要	columnSummary 底部合计行	财务/统计场景必备	渲染时在数据区域底部额外绘制一行汇总数据
自定义边框	上下左右独立边框样式	视觉表达能力受限	当前只绘制右/下边框，需要扩展到四边独立配置
持久化状态	persistentState localStorage 保存列宽/排序等	刷新后丢失用户设置	可封装 StateStorage 工具类，监听变更自动保存
🟢 低优先级（锦上添花）
功能	Handsontable 实现	建议
多语言 (i18n)	内置 20+ 语言包	需要时引入，当前硬编码中文即可
无障碍 (ARIA)	屏幕阅读器支持	Canvas 表格天然不利于无障碍，投入产出比低
触屏支持	移动端手势	当前项目定位 PC 端，延迟考虑
Nested Rows	树形数据行	特定场景需求，非通用功能
Dropdown Menu	区别于 Select 编辑器的下拉菜单	可以用 ContextMenuPlugin 替代
自定义渲染器	renderer 函数自定义单元格渲染	当前 cellsFn 可部分替代，但无法定制渲染
Gantt Chart	甘特图扩展	属 Handsontable Pro 功能，非免费
协作编辑	OT/CRDT 实时同步	独立大工程，需要后端配合
Trim Rows	自动裁剪底部空行	当前已通过稀疏存储实现类似效果
Min/Max Cols/Rows	限制行列数范围	当前已有 MAX_ROWS/MAX_COLS 上限
License Key	商业授权	本项目无需




📋 建议执行顺序
阶段	任务	预估工作量
Phase 1	删除废弃的 ResizeHandleRenderer / DragIndicatorRenderer	0.5 天
Phase 2	BaseLayer 添加 watchForDirty()，清理空回调	0.5 天
Phase 3	HeaderLayer 依赖注入替代 layers 查找	0.5 天
Phase 4	CellEditor 基类重构，消除子类重复代码	2 天
Phase 5	移除 lodash-es 依赖	1 天
Phase 6	Sheet ↔ Workbook 解耦（事件机制）	3 天 ✅ 已完成
Phase 7	Strategy 接口抽象（ViewportService）	3 天
Phase 8	FrozenLayer 拆分重构	2 天
需要我直接开始执行哪个阶段的重构？
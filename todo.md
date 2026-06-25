按业务价值排序：

🔴 高优先级（核心表格能力缺失）
功能	Handsontable 实现	影响	建议
公式引擎	=SUM()、=AVERAGE()、=IF()、跨表引用等	没有公式就不是真正意义上的电子表格	这是最大的功能鸿沟。建议引入 hyperformula 或自研最小可用公式引擎
排序	点击列头排序、多列排序、自定义排序函数	数据查看体验严重受限	在 ColumnType 基础上，实现 sortRows(col, order) 和列头排序 UI
筛选/过滤	列头下拉筛选、条件筛选、搜索过滤	大数据量下无法快速定位数据	在 RowColManager 层实现 filterRows(predicate)，配合虚拟滚动
查找替换	Ctrl+F 查找、Ctrl+H 替换、正则匹配	编辑效率大打折扣	可从 KeyboardStrategy 扩展，逐行搜索 + 高亮匹配 Cell


中优先级（用户体验提升）
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




Phase 1	排序	3 天	🔴 最高	无依赖
Phase 2	筛选/过滤	4 天	🔴 最高	可与 Phase 1 并行
Phase 3	查找替换	3 天	🔴 最高	可与前两阶段并行


需要添加的核心功能 (20% - 高优先级)
🔴 P0 - 必须实现
功能	描述	复杂度	预估工时
1️⃣ 数据验证 (Data Validation)	输入规则、错误提示、下拉列表验证	⭐⭐⭐	3-5天
2️⃣ 筛选/过滤 (Filtering)	列筛选、条件过滤、多条件组合	⭐⭐⭐	2-3天
3️⃣ XLSX 导入导出	完整的 Excel 格式支持（含样式）	⭐⭐⭐⭐	5-7天
4️⃣ 搜索功能 (Search)	全文搜索、正则匹配、高亮显示	⭐⭐	1-2天
🟡 P1 - 重要增强
功能	描述	复杂度	预估工时
5️⃣ 自定义渲染器 (Custom Renderer)	图标、进度条、按钮等自定义组件	⭐⭐⭐	3-4天
6️⃣ 工具提示 (Tooltips)	单元格悬停提示、长文本预览	⭐⭐	1天
7️⃣ 键盘快捷键增强	Ctrl+Z/Y/A/D 等完整快捷键体系	⭐⭐	1-2天
8️⃣ 虚拟滚动优化	百万行数据流畅滚动	⭐⭐⭐	2-3天
9️⃣ 列宽/行高自动调整	双击分隔线自适应内容	⭐	0.5天
🔟 批量操作 API	批量设置值、批量样式应用	⭐⭐	1天
🟢 P2 - 锦上添花
功能	描述	复杂度	预估工时
1️⃣1️⃣ 协作编辑	WebSocket 实时同步、冲突解决	⭐⭐⭐⭐⭐	15-20天
1️⃣2️⃣ 国际化 (i18n)	多语言界面、日期格式本地化	⭐⭐	2-3天
1️⃣3️⃣ 无障碍访问 (A11y)	屏幕阅读器支持、键盘导航优化	⭐⭐⭐	3-4天
1️⃣4️⃣ 主题系统	深色模式、自定义皮肤	⭐⭐	2天
1️⃣5️⃣ 打印功能	页面布局、分页打印	⭐⭐⭐	2-3天
1️⃣6️⃣ 图表集成	内置图表生成（柱状图、折线图等）	⭐⭐⭐⭐	7-10天
1️⃣7️⃣ 数据透视表	动态数据汇总分析	⭐⭐⭐⭐⭐	14-21天
1️⃣8️⃣ 宏/VBA 支持	自动化脚本执行	⭐⭐⭐⭐⭐	30+天

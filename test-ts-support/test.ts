import {
    Workbook,
    ReactiveStore,
    EventStrategy,
    CellEditor,
    BasePlugin,
    PluginManager,
    ImportFilePlugin,
    ExportFilePlugin,
    AutoFillPlugin,
    WebComponent,
    DOMComponent,
    Disposable,
    FormulaEngine,
    FormulaEvaluator,
    BaseColumnType,
    themeStyleProvider,
    functionRegistry,
    FUNCTION_CATEGORY,
    BaseLayer,
    ViewportTransform,
    AUTO_FILL_DIR,
    BORDER_STYLE,
    CHART_TYPE,
    CONTENT_TYPE,
    ERROR_STYLE,
    FONT_STYLE,
    SCROLL_AXIS,
    SORT_ARROW_DIR,
    SORT_ORDER,
    STYLE_SCOPE,
    TEXT_ALIGN,
    VALIDATION_RULE_TYPE,
    VERTICAL_ALIGN,
    EVENT_NAMES,
    HOOKS,
    SHEET_EVENTS,
    CONFIG,
    HIT_TYPE,
    LAYER_Z_INDEX
} from "@canvas-sheet/core";

const appEl = document.getElementById("app")!;
const workbook = new Workbook(appEl);

Workbook.registerPlugin("autoFill", AutoFillPlugin);
workbook.loadPlugin("autoFill");

const sheet = workbook.createSheet("Sheet1", { rowCount: 1000, colCount: 26 });

sheet.setCellValue(0, 0, "Hello");
sheet.setCellValue(0, 1, 42);
sheet.setCellValue(0, 2, "=A1&B1");

const value = sheet.getCellValue(0, 0);

const engine = new FormulaEngine(sheet);
const result = engine.evaluateFormula("=SUM(A1:A10)");

functionRegistry.register("MY_FUNC", (args: unknown[]) => args[0] || 0, FUNCTION_CATEGORY.MATH);

class MyPlugin extends BasePlugin {
    static get pluginName() { return "myPlugin"; }
    onInit() { console.log("MyPlugin initialized"); }
}

Workbook.registerPlugin("myPlugin", MyPlugin);
workbook.loadPlugin("myPlugin");

const store = new ReactiveStore();
store.subscribe((state: unknown) => { console.log("State changed:", state); });

themeStyleProvider.setTheme("dark");

console.log(CONFIG, EVENT_NAMES, HOOKS, SHEET_EVENTS, HIT_TYPE, LAYER_Z_INDEX);
import { BasePlugin } from "./BasePlugin.js";
import { FormulaEngine } from "../formula/FormulaEngine.js";
import { FormulaBarManager } from "../ui/formulaBar/FormulaBarManager.js";

export class FormulaPlugin extends BasePlugin {
    static get PLUGIN_NAME(): string {
        return "formula";
    }

    #active: boolean = false;
    #engine: FormulaEngine | null = null;
    #bar: FormulaBarManager | null = null;
    #afterRenderCallback: (() => void) | null = null;

    get active(): boolean {
        return this.#active;
    }

    get engine(): FormulaEngine | null {
        return this.#engine;
    }

    get bar(): FormulaBarManager | null {
        return this.#bar;
    }

    init(options: Record<string, any> = {}): void {
        super.init(options);

        const wb = this.workbook!;
        const showFormulaBar = options.showFormulaBar !== false;

        this.#engine = new FormulaEngine(wb as any);
        wb.formulaEngine = this.#engine;

        for (const sheet of wb.sheets.values()) {
            this.#engine.registerFormulasBatch(sheet);
        }

        for (const sheet of wb.sheets.values()) {
            this.#engine.recalculateAll(sheet);
        }

        if (showFormulaBar) {
            const container = wb.renderEngine?.outerWrap;
            this.#bar = new FormulaBarManager(wb as any, container!);
            wb.formulaBar = this.#bar;
            this.#hookFormulaBar();
        }

        this.#active = true;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    #registerFormulasFromSheet(sheet: any): void {
        const cellStore = sheet.cellStore;
        if (!cellStore) return;

        for (const [, chunk] of cellStore.chunks) {
            for (const { row, col, cell } of chunk.iterate()) {
                if (cell?.formula && typeof cell.formula === "string" && cell.formula.startsWith("=")) {
                    this.#engine!.setFormula(sheet, row, col, cell.formula);
                }
            }
        }
    }

    #hookFormulaBar(): void {
        const re = this.workbook!.renderEngine;
        if (!re) return;

        this.#afterRenderCallback = () => {
            this.#bar?.update();
        };
        re.addAfterRenderCallback(this.#afterRenderCallback);
    }

    enable(): void {
        super.enable();
        this.#active = true;
    }

    disable(): void {
        super.disable();
        this.#active = false;
        this.renderEngine?.invalidateAll();
        this.render();
    }

    destroy(): void {
        const re = this.workbook?.renderEngine;
        if (re && this.#afterRenderCallback) {
            re.removeAfterRenderCallback(this.#afterRenderCallback);
            this.#afterRenderCallback = null;
        }

        this.disable();

        if (this.#bar) {
            this.#bar.destroy();
            this.#bar = null;
        }

        if (this.#engine) {
            this.#engine.destroy();
            this.#engine = null;
        }

        this.workbook!.formulaEngine = null;
        this.workbook!.formulaBar = null;

        super.destroy();
    }
}

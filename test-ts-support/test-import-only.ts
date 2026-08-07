import {
    Workbook,
    BasePlugin,
    AutoFillPlugin,
    EVENT_NAMES,
    CONFIG
} from "@canvas-sheet/core";

const w: Workbook = new Workbook(document.createElement("div"));
console.log(EVENT_NAMES, CONFIG);
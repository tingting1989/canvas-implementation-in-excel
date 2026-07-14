export const NULL_VALUE_TYPES = {
    BLANK: "blank",
    EMPTY_STRING: "emptyString",
    NULL: "null",
    UNDEFINED: "undefined"
};

export class NullValueHandler {

    static BLANK_DISPLAY = "(空白)";
    static NULL_KEY = "__EXCEL_NULL__";

    static isNullValue(value) {
        return value === null ||
               value === undefined ||
               value === "" ||
               (typeof value === "string" && value.trim() === "");
    }

    static getNullType(value) {
        if (value === null) return NULL_VALUE_TYPES.NULL;
        if (value === undefined) return NULL_VALUE_TYPES.UNDEFINED;
        if (value === "") return NULL_VALUE_TYPES.EMPTY_STRING;
        if (typeof value === "string" && value.trim() === "") return NULL_VALUE_TYPES.BLANK;
        return null;
    }

    static normalizeToKey(value) {
        if (this.isNullValue(value)) {
            return this.NULL_KEY;
        }
        return String(value);
    }

    static formatForDisplay(value) {
        if (this.isNullValue(value)) {
            return this.BLANK_DISPLAY;
        }
        return String(value);
    }

    static isBlankOnly(value) {
        return value === "" || 
               (typeof value === "string" && value.trim() === "");
    }
}

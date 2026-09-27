/*
 * Portions Copyright (c) 2018-2026 XMLmind Software. All rights reserved.
 * Author: Hussein Shafie
 *
 * Portions Copyright (c) 2026 Maxprograms SAS.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import { DitaElement } from "../../dom/DitaElement.js";
import { HtmlElement, HtmlSupport } from "./HtmlSupport.js";
import { DitaBuilder } from "./DitaBuilder.js";
import { HDITAContext, HDITAConverter } from "./HDITAConverter.js";

interface Colspec {
    readonly attributes: Array<[string, string]>;
    colwidth?: string;
}

export class HDITATableConverter {
    private constructor() { }

    static processTable(table: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("table", "- topic/table ");
        HDITAConverter.processCommonAttributes(table, result, ctx);
        HDITATableConverter.processTableBorderAttributes(table, result);

        const caption: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(table), "caption");
        if (caption !== undefined) {
            result.addElement(HDITAConverter.processTitle(caption, ctx));
        }
        HDITATableConverter.processTableContent(table, result, ctx);
        return result;
    }

    private static processTableBorderAttributes(table: HtmlElement, target: DitaElement): void {
        const frameAttr: string | undefined = HtmlSupport.nonEmptyAttribute(table, "frame");
        const borderAttr: string | undefined = HtmlSupport.attribute(table, "border");
        const frame: string = frameAttr !== undefined
            ? HtmlSupport.normalizeSpace(frameAttr)
            : borderAttr !== undefined
                ? (HtmlSupport.normalizeSpace(borderAttr) === "0" ? "void" : "border")
                : "void";

        const rulesAttr: string | undefined = HtmlSupport.nonEmptyAttribute(table, "rules");
        const rules: string = rulesAttr !== undefined
            ? HtmlSupport.normalizeSpace(rulesAttr)
            : borderAttr !== undefined
                ? (HtmlSupport.normalizeSpace(borderAttr) === "0" ? "none" : "all")
                : "none";

        if (frame === "void" && rules === "none") {
            DitaBuilder.setAttr(target, "rowsep", "0");
            DitaBuilder.setAttr(target, "colsep", "0");
        }
    }

    private static tableRows(table: HtmlElement): HtmlElement[] {
        const own: HtmlElement[] = HtmlSupport.childElements(table).filter((el): boolean => el.tagName === "tr");
        const thead: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(table), "thead");
        const tbody: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(table), "tbody");
        return [
            ...own,
            ...HtmlSupport.childElements(thead).filter((el): boolean => el.tagName === "tr"),
            ...HtmlSupport.childElements(tbody).filter((el): boolean => el.tagName === "tr")
        ];
    }

    private static columnCount(rows: HtmlElement[]): number {
        let max: number = 1;
        for (const row of rows) {
            let count: number = 0;
            for (const cell of HtmlSupport.childElements(row).filter((el): boolean => el.tagName === "th" || el.tagName === "td")) {
                const colspan: string | undefined = HtmlSupport.attribute(cell, "colspan");
                count += colspan !== undefined && Number(colspan) > 1 ? Number(colspan) : 1;
            }
            if (count > max) {
                max = count;
            }
        }
        return max;
    }

    private static processColgroupOrCol(element: HtmlElement, target: Colspec[]): void {
        const nestedCols: HtmlElement[] = HtmlSupport.childElements(element).filter((el): boolean => el.tagName === "col");
        if (nestedCols.length > 0) {
            for (const col of nestedCols) {
                HDITATableConverter.processColgroupOrCol(col, target);
            }
            return;
        }
        const width: string = HDITATableConverter.columnWidth(element);
        const span: string | undefined = HtmlSupport.attribute(element, "span");
        const spanCount: number = span !== undefined && Number(span) > 0 ? Number(span) : 1;
        const attributes: Array<[string, string]> = [];
        const id: string | undefined = HtmlSupport.nonEmptyAttribute(element, "id");
        if (id !== undefined) {
            attributes.push(["id", id]);
        }
        for (let index: number = 0; index < spanCount; index++) {
            const spec: Colspec = { attributes: [...attributes] };
            if (width !== "") {
                spec.colwidth = width;
            }
            target.push(spec);
        }
    }

    private static columnWidth(col: HtmlElement): string {
        const style: string | undefined = HtmlSupport.attribute(col, "style");
        let w: string = "";
        if (style !== undefined && /^width:|([; ]width:)/.test(style)) {
            const match: RegExpMatchArray | null = style.match(/^(width:|((.*)[; ]width:))\s*([0-9.%*a-zA-Z]+)(.*)$/);
            w = match !== null ? match[4] : "";
        } else {
            const widthAttr: string | undefined = HtmlSupport.attribute(col, "width");
            w = widthAttr !== undefined && widthAttr.trim() !== "" ? widthAttr.trim() : "";
        }

        if (w === "*") {
            return "1*";
        }
        if (HDITATableConverter.endsWithPositive(w, "*")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "%")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "in")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "cm")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "mm")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "pt")) {
            return w;
        }
        if (HDITATableConverter.endsWithPositive(w, "pc")) {
            return w.slice(0, -2) + "pi";
        }
        if (HDITATableConverter.endsWithPositive(w, "px")) {
            return Math.round((Number(w.slice(0, -2)) / 96.0) * 72.0).toString() + "pt";
        }
        if (w !== "" && Number(w) > 0) {
            return Math.round((Number(w) / 96.0) * 72.0).toString() + "pt";
        }
        return "";
    }

    private static endsWithPositive(value: string, suffix: string): boolean {
        return value.endsWith(suffix) && Number(value.slice(0, -suffix.length)) > 0;
    }

    private static alignStyle(cell: HtmlElement | undefined): string {
        const style: string | undefined = HtmlSupport.attribute(cell, "style");
        if (style === undefined || !style.includes("text-align:")) {
            return "";
        }
        const match: RegExpMatchArray | null = style.match(/^(.*)text-align:\s*(left|center|right|justify)(.*)$/);
        const align: string = match === null ? "" : match[2];
        return align === "justify" ? "left" : align;
    }

    private static alignAttribute(cell: HtmlElement | undefined): string {
        const align: string = HtmlSupport.normalizeSpace(HtmlSupport.attribute(cell, "align") ?? "");
        if (align === "left" || align === "center" || align === "right") {
            return align;
        }
        return align === "justify" ? "left" : "";
    }

    private static valignAttributeOf(cell: HtmlElement | undefined): string {
        const valign: string = HtmlSupport.normalizeSpace(HtmlSupport.attribute(cell, "valign") ?? "");
        if (valign === "top" || valign === "middle" || valign === "bottom") {
            return valign;
        }
        return valign === "baseline" ? "top" : "";
    }

    private static valignStyle(cell: HtmlElement | undefined): string {
        const style: string | undefined = HtmlSupport.attribute(cell, "style");
        if (style === undefined || !style.includes("vertical-align:")) {
            return "";
        }
        const match: RegExpMatchArray | null = style.match(/^(.*)vertical-align:\s*(baseline|top|middle|bottom)(.*)$/);
        const valign: string = match === null ? "" : match[2];
        return valign === "baseline" ? "top" : valign;
    }

    private static processTableContent(table: HtmlElement, tableTarget: DitaElement, ctx: HDITAContext): void {
        const tgroup: DitaElement = DitaBuilder.createElement("tgroup", "- topic/tgroup ");
        const rows: HtmlElement[] = HDITATableConverter.tableRows(table);
        const colCount: number = HDITATableConverter.columnCount(rows);

        const colspecs: Colspec[] = [];
        for (const colgroupOrCol of HtmlSupport.childElements(table).filter((el): boolean => el.tagName === "colgroup" || el.tagName === "col")) {
            HDITATableConverter.processColgroupOrCol(colgroupOrCol, colspecs);
        }

        const cols: number = Math.max(colCount, colspecs.length);
        DitaBuilder.setAttr(tgroup, "cols", cols.toString());

        const align: string = HDITATableConverter.alignStyle(table);
        if (align !== "") {
            DitaBuilder.setAttr(tgroup, "align", align);
        }

        const hasColspan: boolean = rows.some((row): boolean =>
            HtmlSupport.childElements(row).some((cell): boolean => HtmlSupport.attribute(cell, "colspan") !== undefined));

        if (colspecs.length > 0 || hasColspan) {
            const totalPercent: number = colspecs.reduce((sum: number, spec: Colspec): number => {
                if (spec.colwidth !== undefined && spec.colwidth.endsWith("%")) {
                    return sum + Number(spec.colwidth.slice(0, -1));
                }
                return sum;
            }, 0);
            const withColwidth: number = colspecs.filter((spec): boolean => spec.colwidth !== undefined).length;
            const noColwidthCount: number = cols - withColwidth;

            let defaultColwidth: string = "";
            if (noColwidthCount > 0 && totalPercent > 0 && totalPercent < 100) {
                defaultColwidth = Math.max(1, (100.0 - totalPercent) / noColwidthCount).toString() + "*";
            } else if (noColwidthCount > 0 && totalPercent >= 100) {
                defaultColwidth = "1*";
            }

            colspecs.forEach((spec: Colspec, index: number): void => {
                const colspec: DitaElement = DitaBuilder.createElement("colspec", "- topic/colspec ");
                DitaBuilder.setAttr(colspec, "colname", "c" + (index + 1).toString());
                for (const [name, value] of spec.attributes) {
                    DitaBuilder.setAttr(colspec, name, value);
                }
                if (spec.colwidth !== undefined && spec.colwidth.endsWith("%")) {
                    DitaBuilder.setAttr(colspec, "colwidth", spec.colwidth.slice(0, -1) + "*");
                } else if (spec.colwidth === undefined && defaultColwidth !== "") {
                    DitaBuilder.setAttr(colspec, "colwidth", defaultColwidth);
                } else if (spec.colwidth !== undefined) {
                    DitaBuilder.setAttr(colspec, "colwidth", spec.colwidth);
                }
                tgroup.addElement(colspec);
            });

            for (let position: number = colspecs.length + 1; position <= cols; position++) {
                const colspec: DitaElement = DitaBuilder.createElement("colspec", "- topic/colspec ");
                DitaBuilder.setAttr(colspec, "colname", "c" + position.toString());
                if (defaultColwidth !== "") {
                    DitaBuilder.setAttr(colspec, "colwidth", defaultColwidth);
                }
                tgroup.addElement(colspec);
            }
        }

        const thead: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(table), "thead");
        if (thead !== undefined) {
            tgroup.addElement(HDITATableConverter.processTHead(thead, ctx));
        }

        const directRows: HtmlElement[] = HtmlSupport.childElements(table).filter((el): boolean => el.tagName === "tr");
        if (directRows.length > 0) {
            const tbody: DitaElement = DitaBuilder.createElement("tbody", "- topic/tbody ");
            for (const row of directRows) {
                tbody.addElement(HDITATableConverter.processRow(row, table, ctx));
            }
            tgroup.addElement(tbody);
        } else {
            const bodies: HtmlElement[] = HtmlSupport.childElements(table).filter((el): boolean => el.tagName === "tbody");
            if (bodies[0] !== undefined) {
                tgroup.addElement(HDITATableConverter.processTBody(bodies[0], ctx));
            }
        }

        tableTarget.addElement(tgroup);
    }

    private static processValignAttribute(source: HtmlElement, target: DitaElement): void {
        const valign: string = HDITATableConverter.valignAttributeOf(source);
        if (valign !== "") {
            DitaBuilder.setAttr(target, "valign", valign);
        }
    }

    private static processTHead(thead: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("thead", "- topic/thead ");
        HDITAConverter.processCommonAttributes(thead, result, ctx);
        HDITATableConverter.processValignAttribute(thead, result);
        for (const row of HtmlSupport.childElements(thead).filter((el): boolean => el.tagName === "tr")) {
            result.addElement(HDITATableConverter.processRow(row, thead, ctx));
        }
        return result;
    }

    private static processTBody(tbody: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("tbody", "- topic/tbody ");
        HDITAConverter.processCommonAttributes(tbody, result, ctx);
        HDITATableConverter.processValignAttribute(tbody, result);
        for (const row of HtmlSupport.childElements(tbody).filter((el): boolean => el.tagName === "tr")) {
            result.addElement(HDITATableConverter.processRow(row, tbody, ctx));
        }
        return result;
    }

    private static processRow(row: HtmlElement, parent: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("row", "- topic/row ");
        HDITAConverter.processCommonAttributes(row, result, ctx);
        HDITATableConverter.processValignAttribute(row, result);
        if (HDITATableConverter.valignAttributeOf(row) === "" && HDITATableConverter.valignAttributeOf(parent) === "") {
            DitaBuilder.setAttr(result, "valign", "middle");
        }
        let column: number = 1;
        for (const cell of HtmlSupport.childElements(row).filter((el): boolean => el.tagName === "th" || el.tagName === "td")) {
            result.addElement(HDITATableConverter.processCell(cell, row, parent, column, ctx));
            const colspan: string | undefined = HtmlSupport.attribute(cell, "colspan");
            column += colspan !== undefined && Number(colspan) > 1 ? Number(colspan) : 1;
        }
        return result;
    }

    private static processCell(
        cell: HtmlElement,
        row: HtmlElement,
        sectionParent: HtmlElement,
        columnNumber: number,
        ctx: HDITAContext
    ): DitaElement {
        const entry: DitaElement = DitaBuilder.createElement("entry", "- topic/entry ");
        HDITAConverter.processCommonAttributes(cell, entry, ctx);

        const colspan: string | undefined = HtmlSupport.attribute(cell, "colspan");
        if (colspan !== undefined && Number(colspan) > 1) {
            DitaBuilder.setAttr(entry, "namest", "c" + columnNumber.toString());
            DitaBuilder.setAttr(entry, "nameend", "c" + (columnNumber + Number(colspan) - 1).toString());
        }
        const rowspan: string | undefined = HtmlSupport.attribute(cell, "rowspan");
        if (rowspan !== undefined && Number(rowspan) > 1) {
            DitaBuilder.setAttr(entry, "morerows", (Number(rowspan) - 1).toString());
        }
        if (cell.tagName === "th") {
            DitaBuilder.setAttr(entry, "align", "center");
        }

        for (const align of [
            HDITATableConverter.alignAttribute(sectionParent),
            HDITATableConverter.alignStyle(sectionParent),
            HDITATableConverter.alignAttribute(row),
            HDITATableConverter.alignStyle(row),
            HDITATableConverter.alignAttribute(cell),
            HDITATableConverter.alignStyle(cell)
        ]) {
            if (align !== "") {
                DitaBuilder.setAttr(entry, "align", align);
            }
        }

        HDITATableConverter.processValignAttribute(cell, entry);
        const cellValignStyle: string = HDITATableConverter.valignStyle(cell);
        if (cellValignStyle !== "") {
            DitaBuilder.setAttr(entry, "valign", cellValignStyle);
        }

        HDITAConverter.applyTemplatesInto(HtmlSupport.children(cell), entry, ctx);
        return entry;
    }
}

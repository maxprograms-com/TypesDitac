/*
 * Portions Copyright (c) 2026 Maxprograms SAS. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import { MarkdownItPlugin, RuleBlock, StateBlock, Token } from "./MarkdownItTypes.js";

interface TableCell {
    readonly content: string;
    colspan: number;
}

export class TableExtension {
    private static readonly SEPARATOR_CELL: RegExp = /^(:?)-{3,}(:?)$/;
    private static readonly CAPTION: RegExp = /^\s*\[([^\]]*)\]\s*$/;

    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.block.ruler.at("table", TableExtension.table, { alt: ["paragraph", "reference"] });
    };

    private static lineText(state: StateBlock, line: number): string {
        return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
    }

    private static splitRow(text: string): TableCell[] | undefined {
        const segments: string[] = [];
        let current: string = "";
        let hasPipe: boolean = false;
        let pos: number = 0;
        while (pos < text.length) {
            const ch: string = text.charAt(pos);
            if (ch === "\\" && pos + 1 < text.length) {
                current += text.slice(pos, pos + 2);
                pos += 2;
            } else if (ch === "`") {
                let ticks: number = 1;
                while (text.charAt(pos + ticks) === "`") {
                    ticks++;
                }
                const fence: string = "`".repeat(ticks);
                const close: number = text.indexOf(fence, pos + ticks);
                const end: number = close < 0 ? pos + ticks : close + ticks;
                current += text.slice(pos, end);
                pos = end;
            } else if (ch === "|") {
                segments.push(current);
                current = "";
                hasPipe = true;
                pos++;
            } else {
                current += ch;
                pos++;
            }
        }
        segments.push(current);
        if (!hasPipe) {
            return undefined;
        }
        if (text.startsWith("|")) {
            segments.shift();
        }
        if (text.endsWith("|") && !text.endsWith("\\|")) {
            segments.pop();
        }

        const cells: TableCell[] = [];
        for (const segment of segments) {
            // A zero-width cell ("||") widens the cell before it by one column.
            if (segment.length === 0 && cells.length > 0) {
                cells[cells.length - 1].colspan++;
            } else {
                cells.push({ content: segment.trim(), colspan: 1 });
            }
        }
        return cells;
    }

    private static parseSeparator(text: string): string[] | undefined {
        const cells: TableCell[] | undefined = TableExtension.splitRow(text);
        if (cells === undefined) {
            return undefined;
        }
        const aligns: string[] = [];
        for (const cell of cells) {
            const match: RegExpExecArray | null = TableExtension.SEPARATOR_CELL.exec(cell.content);
            if (match === null || cell.colspan > 1) {
                return undefined;
            }
            if (match[1].length > 0 && match[2].length > 0) {
                aligns.push("center");
            } else if (match[1].length > 0) {
                aligns.push("left");
            } else if (match[2].length > 0) {
                aligns.push("right");
            } else {
                aligns.push("");
            }
        }
        return aligns;
    }

    private static table(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
        if (startLine + 2 > endLine) {
            return false;
        }
        const separatorLine: number = startLine + 1;
        if (state.sCount[startLine] - state.blkIndent >= 4 ||
            state.sCount[separatorLine] < state.blkIndent || state.sCount[separatorLine] - state.blkIndent >= 4) {
            return false;
        }
        const aligns: string[] | undefined = TableExtension.parseSeparator(TableExtension.lineText(state, separatorLine));
        if (aligns === undefined) {
            return false;
        }
        const header: TableCell[] | undefined = TableExtension.splitRow(TableExtension.lineText(state, startLine));
        if (header === undefined || header.length !== aligns.length) {
            return false;
        }
        if (silent) {
            return true;
        }

        const terminators: RuleBlock[] = state.md.block.ruler.getRules("blockquote");
        const rows: TableCell[][] = [];
        let nextLine: number = separatorLine + 1;
        let caption: string | undefined;
        for (; nextLine < endLine; nextLine++) {
            if (state.isEmpty(nextLine) || state.sCount[nextLine] < state.blkIndent) {
                break;
            }
            const text: string = TableExtension.lineText(state, nextLine);
            const captionMatch: RegExpExecArray | null = TableExtension.CAPTION.exec(text);
            if (captionMatch !== null) {
                caption = captionMatch[1].trim();
                nextLine++;
                break;
            }
            if (terminators.some((terminator: RuleBlock): boolean => terminator(state, nextLine, endLine, true))) {
                break;
            }
            const row: TableCell[] | undefined = TableExtension.splitRow(text);
            if (row === undefined) {
                break;
            }
            rows.push(row);
        }

        const tableOpen: Token = state.push("table_open", "table", 1);
        tableOpen.map = [startLine, nextLine];
        if (caption !== undefined) {
            state.push("caption_open", "caption", 1);
            TableExtension.pushInline(state, caption, nextLine - 1);
            state.push("caption_close", "caption", -1);
        }

        state.push("thead_open", "thead", 1);
        TableExtension.pushRow(state, header, aligns, "th", startLine);
        state.push("thead_close", "thead", -1);

        if (rows.length > 0) {
            state.push("tbody_open", "tbody", 1);
            rows.forEach((row: TableCell[], index: number): void => {
                TableExtension.pushRow(state, row, aligns, "td", separatorLine + 1 + index);
            });
            state.push("tbody_close", "tbody", -1);
        }

        state.push("table_close", "table", -1);
        state.line = nextLine;
        return true;
    }

    private static pushRow(state: StateBlock, cells: TableCell[], aligns: string[], tag: string, line: number): void {
        const rowOpen: Token = state.push("tr_open", "tr", 1);
        rowOpen.map = [line, line + 1];
        let column: number = 0;
        for (const cell of cells) {
            const cellOpen: Token = state.push(tag + "_open", tag, 1);
            const align: string | undefined = aligns[column];
            if (align !== undefined && align.length > 0) {
                cellOpen.attrSet("align", align);
            }
            if (cell.colspan > 1) {
                cellOpen.attrSet("colspan", cell.colspan.toString());
            }
            TableExtension.pushInline(state, cell.content, line);
            state.push(tag + "_close", tag, -1);
            column += cell.colspan;
        }
        state.push("tr_close", "tr", -1);
    }

    private static pushInline(state: StateBlock, content: string, line: number): void {
        const inline: Token = state.push("inline", "", 0);
        inline.content = content;
        inline.map = [line, line + 1];
        inline.children = [];
    }
}

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

import { MarkdownItPlugin, StateBlock, StateInline, Token } from "./MarkdownItTypes.js";

export class FootnoteExtension {
    private static readonly NCNAME_CHAR: RegExp = new RegExp("[\\p{L}\\p{N}\\p{M}_.·‿⁀-]", "u");

    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.block.ruler.before("reference", "footnote_definition", FootnoteExtension.definition, {
            alt: ["paragraph", "reference", "blockquote", "list"]
        });
        md.inline.ruler.before("link", "footnote_reference", FootnoteExtension.reference);

        md.renderer.rules.footnote_ref = (tokens: Token[], idx: number): string => {
            const label: string = (tokens[idx].meta as { label: string }).label;
            return "<a href=\"#" + FootnoteExtension.toFootnoteId(label) + "\"></a>";
        };
        md.renderer.rules.footnote_open = (tokens: Token[], idx: number): string => {
            const label: string = (tokens[idx].meta as { label: string }).label;
            return "<div data-class=\"fn\" id=\"" + FootnoteExtension.toFootnoteId(label) + "\">";
        };
        md.renderer.rules.footnote_close = (): string => "</div>\n";
    };

    static toFootnoteId(text: string): string {
        const collapsed: string = text.trim().replace(/\s+/g, " ");
        let buffer: string = "";
        let lastChar: string = "";
        for (const c of collapsed) {
            if (FootnoteExtension.NCNAME_CHAR.test(c)) {
                buffer += c;
                lastChar = c;
            } else if (/\s/.test(c)) {
                if (lastChar !== "_") {
                    buffer += "_";
                    lastChar = "_";
                }
            } else {
                buffer += "0x" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase();
                lastChar = c;
            }
        }
        return "__FN" + buffer;
    }

    private static parseLabel(src: string, start: number, max: number): number {
        let pos: number = start;
        while (pos < max) {
            const code: number = src.charCodeAt(pos);
            if (code === 0x5D /* ] */) {
                return pos > start ? pos : -1;
            }
            if (code === 0x0A || code === 0x5B /* [ */) {
                return -1;
            }
            pos++;
        }
        return -1;
    }

    private static reference(state: StateInline, silent: boolean): boolean {
        const start: number = state.pos;
        if (state.src.charCodeAt(start) !== 0x5B /* [ */ || state.src.charCodeAt(start + 1) !== 0x5E /* ^ */) {
            return false;
        }
        const end: number = FootnoteExtension.parseLabel(state.src, start + 2, state.posMax);
        if (end < 0) {
            return false;
        }
        if (!silent) {
            const token: Token = state.push("footnote_ref", "a", 0);
            token.meta = { label: state.src.slice(start + 2, end) };
        }
        state.pos = end + 1;
        return true;
    }

    private static definition(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
        const start: number = state.bMarks[startLine] + state.tShift[startLine];
        const max: number = state.eMarks[startLine];

        if (state.sCount[startLine] - state.blkIndent >= 4) {
            return false;
        }
        if (start + 4 > max || state.src.charCodeAt(start) !== 0x5B /* [ */ || state.src.charCodeAt(start + 1) !== 0x5E /* ^ */) {
            return false;
        }
        const end: number = FootnoteExtension.parseLabel(state.src, start + 2, max);
        if (end < 0 || state.src.charCodeAt(end + 1) !== 0x3A /* : */) {
            return false;
        }
        if (silent) {
            return true;
        }

        const openToken: Token = state.push("footnote_open", "div", 1);
        openToken.meta = { label: state.src.slice(start + 2, end) };

        const afterColon: number = end + 2;
        let pos: number = afterColon;
        const initial: number = state.sCount[startLine] + afterColon - start;
        let offset: number = initial;
        while (pos < max) {
            const code: number = state.src.charCodeAt(pos);
            if (code === 0x09) {
                offset += 4 - offset % 4;
            } else if (code === 0x20) {
                offset++;
            } else {
                break;
            }
            pos++;
        }

        const oldBMark: number = state.bMarks[startLine];
        const oldTShift: number = state.tShift[startLine];
        const oldSCount: number = state.sCount[startLine];
        const oldParentType: string = state.parentType;

        // The first line's content starts after "[^label]:"; the lines that follow must
        // be indented by 4 more columns, except for lazy paragraph continuations.
        state.bMarks[startLine] = afterColon;
        state.tShift[startLine] = pos - afterColon;
        state.sCount[startLine] = offset - initial;
        state.blkIndent += 4;
        state.parentType = "footnote";
        if (state.sCount[startLine] < state.blkIndent) {
            state.sCount[startLine] += state.blkIndent;
        }

        const firstToken: number = state.tokens.length;
        state.md.block.tokenize(state, startLine, endLine);

        state.parentType = oldParentType;
        state.blkIndent -= 4;
        state.bMarks[startLine] = oldBMark;
        state.tShift[startLine] = oldTShift;
        state.sCount[startLine] = oldSCount;

        const first: Token | undefined = state.tokens[firstToken];
        if (first !== undefined && first.type === "paragraph_open") {
            first.hidden = true;
            state.tokens[firstToken + 2].hidden = true;
        }

        state.push("footnote_close", "div", -1);
        return true;
    }
}

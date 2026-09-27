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

import { MarkdownItPlugin, StateBlock, Token } from "./MarkdownItTypes.js";

export class AdmonitionExtension {
    private static readonly ADMONITION_TYPES: string[] = [
        "note", "attention", "caution", "danger", "fastpath", "important",
        "notice", "remember", "restriction", "tip", "trouble", "warning"
    ];

    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.block.ruler.before("fence", "admonition", AdmonitionExtension.block, {
            alt: ["paragraph", "reference", "blockquote", "list"]
        });

        md.renderer.rules.admonition_open = (tokens: Token[], idx: number): string => {
            const meta: { type: string; title: string } = tokens[idx].meta as { type: string; title: string };
            let html: string = "<div data-class=\"note\"";
            if (meta.type !== "note") {
                html += " data-type=\"" + meta.type + "\"";
            }
            html += ">\n";
            if (meta.title.length > 0) {
                html += "<h4 class=\"note-title\">" + meta.title + "</h4>\n";
            }
            return html;
        };
        md.renderer.rules.admonition_close = (): string => "</div>\n";
    };

    private static block(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
        const start: number = state.bMarks[startLine] + state.tShift[startLine];
        const max: number = state.eMarks[startLine];

        if (state.sCount[startLine] - state.blkIndent >= 4) {
            return false;
        }
        if (max - start < 3 || state.src.slice(start, start + 3) !== "!!!") {
            return false;
        }

        const rest: string = state.src.slice(start + 3, max);
        const match: RegExpExecArray | null = /^\s*([A-Za-z]+)\s*(?:"([^"]*)")?\s*$/.exec(rest);
        if (match === null) {
            return false;
        }
        const rawType: string = match[1].toLowerCase();
        if (!AdmonitionExtension.ADMONITION_TYPES.includes(rawType)) {
            return false;
        }

        if (silent) {
            return true;
        }

        const title: string = match[2] === undefined ? "" : match[2].trim().replace(/\s+/g, " ");
        const openToken: Token = state.push("admonition_open", "div", 1);
        openToken.meta = { type: rawType, title: title };

        const bodyLine: number = startLine + 1;
        const oldParentType: string = state.parentType;
        const oldSCount: number | undefined = bodyLine < endLine ? state.sCount[bodyLine] : undefined;

        state.blkIndent += 4;
        state.parentType = "blockquote";
        // The line right after "!!!" is body whatever its indentation; the blocks that
        // follow it must be indented by 4 columns.
        if (oldSCount !== undefined && !state.isEmpty(bodyLine) && oldSCount < state.blkIndent) {
            state.sCount[bodyLine] = state.blkIndent;
        }

        state.line = bodyLine;
        state.md.block.tokenize(state, bodyLine, endLine);

        if (oldSCount !== undefined) {
            state.sCount[bodyLine] = oldSCount;
        }
        state.parentType = oldParentType;
        state.blkIndent -= 4;

        state.push("admonition_close", "div", -1);
        return true;
    }
}

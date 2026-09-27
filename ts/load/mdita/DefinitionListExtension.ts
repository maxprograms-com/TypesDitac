/*
 * Portions Copyright (c) 2014-2015 Vitaly Puzrin, Alex Kocharin (markdown-it-deflist, MIT License).
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

import { MarkdownItPlugin, RuleBlock, StateBlock, Token } from "./MarkdownItTypes.js";

interface TermRun {
    readonly termEnd: number;
    readonly ddLine: number;
    readonly contentStart: number;
    readonly blank: boolean;
}

export class DefinitionListExtension {
    private static readonly DD_DEPTH: string = "ditacDefinitionDepth";

    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.block.ruler.before("paragraph", "deflist", DefinitionListExtension.deflist, {
            alt: ["paragraph", "reference", "blockquote"]
        });
    };

    private static skipMarker(state: StateBlock, line: number): number {
        let start: number = state.bMarks[line] + state.tShift[line];
        const max: number = state.eMarks[line];
        if (start >= max || state.sCount[line] - state.blkIndent >= 4) {
            return -1;
        }
        const marker: number = state.src.charCodeAt(start++);
        if (marker !== 0x7E /* ~ */ && marker !== 0x3A /* : */) {
            return -1;
        }
        if (start < max && start === state.skipSpaces(start)) {
            return -1;
        }
        return start;
    }

    private static scanTerms(state: StateBlock, startLine: number, endLine: number): TermRun | undefined {
        const terminators: RuleBlock[] = state.md.block.ruler.getRules("paragraph");
        let line: number = startLine;
        while (line < endLine && !state.isEmpty(line) && DefinitionListExtension.skipMarker(state, line) < 0) {
            if (line > startLine) {
                if (state.sCount[line] < state.blkIndent) {
                    return undefined;
                }
                for (const terminator of terminators) {
                    if (terminator(state, line, endLine, true)) {
                        return undefined;
                    }
                }
            }
            line++;
        }
        if (line === startLine || line >= endLine) {
            return undefined;
        }
        const blank: boolean = state.isEmpty(line);
        const ddLine: number = blank ? line + 1 : line;
        if (ddLine >= endLine || state.sCount[ddLine] < state.blkIndent) {
            return undefined;
        }
        const contentStart: number = DefinitionListExtension.skipMarker(state, ddLine);
        if (contentStart < 0) {
            return undefined;
        }
        return { termEnd: line, ddLine: ddLine, contentStart: contentStart, blank: blank };
    }

    private static deflist(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
        const env: Record<string, number> = state.env as Record<string, number>;
        if (silent) {
            // Validation mode only checks whether a dd marker ends a paragraph nested in a dd.
            if (!env[DefinitionListExtension.DD_DEPTH]) {
                return false;
            }
            return DefinitionListExtension.skipMarker(state, startLine) >= 0 && state.sCount[startLine] < state.blkIndent;
        }

        let run: TermRun | undefined = DefinitionListExtension.scanTerms(state, startLine, endLine);
        if (run === undefined) {
            return false;
        }

        const dlOpen: Token = state.push("dl_open", "dl", 1);
        const listLines: [number, number] = [startLine, 0];
        dlOpen.map = listLines;

        let loose: boolean = false;
        const firstParagraphs: number[] = [];
        let dtLine: number = startLine;
        let nextLine: number = startLine;

        outer:
        for (;;) {
            for (let line: number = dtLine; line < run.termEnd; line++) {
                const dtOpen: Token = state.push("dt_open", "dt", 1);
                dtOpen.map = [line, line];
                const inline: Token = state.push("inline", "", 0);
                inline.map = [line, line];
                inline.content = state.getLines(line, line + 1, state.blkIndent, false).trim();
                inline.children = [];
                state.push("dt_close", "dt", -1);
            }
            if (run.blank) {
                loose = true;
            }

            let ddLine: number = run.ddLine;
            let contentStart: number = run.contentStart;
            for (;;) {
                const itemIndex: number = state.tokens.length;
                const ddOpen: Token = state.push("dd_open", "dd", 1);
                const itemLines: [number, number] = [ddLine, 0];
                ddOpen.map = itemLines;

                let pos: number = contentStart;
                const max: number = state.eMarks[ddLine];
                let offset: number = state.sCount[ddLine] + contentStart - (state.bMarks[ddLine] + state.tShift[ddLine]);
                while (pos < max) {
                    const ch: number = state.src.charCodeAt(pos);
                    if (ch === 0x09) {
                        offset += 4 - offset % 4;
                    } else if (ch === 0x20) {
                        offset++;
                    } else {
                        break;
                    }
                    pos++;
                }

                const oldTight: boolean = state.tight;
                const oldIndent: number = state.blkIndent;
                const oldTShift: number = state.tShift[ddLine];
                const oldSCount: number = state.sCount[ddLine];
                const oldParentType: string = state.parentType;
                state.blkIndent = state.sCount[ddLine] + 2;
                state.tShift[ddLine] = pos - state.bMarks[ddLine];
                state.sCount[ddLine] = offset;
                state.tight = true;
                state.parentType = "deflist";

                env[DefinitionListExtension.DD_DEPTH] = (env[DefinitionListExtension.DD_DEPTH] ?? 0) + 1;
                state.md.block.tokenize(state, ddLine, endLine);
                env[DefinitionListExtension.DD_DEPTH]--;

                const first: Token | undefined = state.tokens[itemIndex + 1];
                if (first !== undefined && first.type === "paragraph_open") {
                    firstParagraphs.push(itemIndex + 1);
                }

                state.tShift[ddLine] = oldTShift;
                state.sCount[ddLine] = oldSCount;
                state.tight = oldTight;
                state.parentType = oldParentType;
                state.blkIndent = oldIndent;

                state.push("dd_close", "dd", -1);
                itemLines[1] = nextLine = state.line;

                if (nextLine >= endLine || state.sCount[nextLine] < state.blkIndent) {
                    break outer;
                }
                contentStart = DefinitionListExtension.skipMarker(state, nextLine);
                if (contentStart < 0) {
                    break;
                }
                if (state.isEmpty(nextLine - 1)) {
                    loose = true;
                }
                ddLine = nextLine;
            }

            dtLine = nextLine;
            if (state.isEmpty(dtLine) || state.sCount[dtLine] < state.blkIndent) {
                break;
            }
            run = DefinitionListExtension.scanTerms(state, dtLine, endLine);
            if (run === undefined) {
                break;
            }
        }

        // One definition preceded by a blank line makes the whole list loose; in a tight
        // list only the first paragraph of each definition is unwrapped.
        if (!loose) {
            for (const index of firstParagraphs) {
                state.tokens[index].hidden = true;
                state.tokens[index + 2].hidden = true;
            }
        }

        state.push("dl_close", "dl", -1);
        listLines[1] = nextLine;
        state.line = nextLine;
        return true;
    }
}

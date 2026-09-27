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

import { MarkdownItPlugin, RuleInline, StateInline, Token } from "./MarkdownItTypes.js";

export class ScriptExtension {
    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.inline.ruler.after("emphasis", "sub", ScriptExtension.rule("~", "sub"));
        md.inline.ruler.after("emphasis", "sup", ScriptExtension.rule("^", "sup"));
    };

    private static rule(marker: string, tag: string): RuleInline {
        return (state: StateInline, silent: boolean): boolean => {
            const start: number = state.pos;
            const max: number = state.posMax;
            if (silent || state.src.charAt(start) !== marker || start + 2 >= max || /\s/.test(state.src.charAt(start + 1))) {
                return false;
            }

            state.pos = start + 1;
            let found: boolean = false;
            while (state.pos < max) {
                if (state.src.charAt(state.pos) === marker) {
                    if (!/\s/.test(state.src.charAt(state.pos - 1))) {
                        found = true;
                        break;
                    }
                    state.pos++;
                    continue;
                }
                state.md.inline.skipToken(state);
            }
            if (!found || state.pos === start + 1) {
                state.pos = start;
                return false;
            }

            const end: number = state.pos;
            state.posMax = end;
            state.pos = start + 1;
            const openToken: Token = state.push(tag + "_open", tag, 1);
            openToken.markup = marker;
            state.md.inline.tokenize(state);
            const closeToken: Token = state.push(tag + "_close", tag, -1);
            closeToken.markup = marker;
            state.pos = end + 1;
            state.posMax = max;
            return true;
        };
    }
}

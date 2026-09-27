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

import { MarkdownItPlugin, StateInline, Token } from "./MarkdownItTypes.js";

export class KeyrefExtension {
    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.inline.ruler.after("image", "keyref", KeyrefExtension.keyref);
    };

    private static keyref(state: StateInline, silent: boolean): boolean {
        const src: string = state.src;
        const max: number = state.posMax;
        const isImage: boolean = src.charCodeAt(state.pos) === 0x21 /* ! */;
        const bracket: number = isImage ? state.pos + 1 : state.pos;
        if (state.linkLevel > 0 || src.charCodeAt(bracket) !== 0x5B /* [ */ || src.charCodeAt(bracket + 1) === 0x5E /* ^ */) {
            return false;
        }
        const labelStart: number = bracket + 1;
        const labelEnd: number = state.md.helpers.parseLinkLabel(state, bracket, true);
        if (labelEnd < 0) {
            return false;
        }
        const label: string = src.slice(labelStart, labelEnd);
        let key: string = label;
        let pos: number = labelEnd + 1;
        if (pos < max && src.charCodeAt(pos) === 0x28 /* ( */) {
            return false;
        }
        if (pos < max && src.charCodeAt(pos) === 0x5B /* [ */) {
            const refEnd: number = src.indexOf("]", pos + 1);
            const nestedOpen: number = src.indexOf("[", pos + 1);
            if (refEnd >= 0 && refEnd < max && (nestedOpen < 0 || nestedOpen > refEnd)) {
                const reference: string = src.slice(pos + 1, refEnd);
                if (reference.trim().length > 0) {
                    key = reference;
                }
                pos = refEnd + 1;
            }
        }
        key = key.trim();
        const references: Record<string, unknown> | undefined = (state.env as { references?: Record<string, unknown> }).references;
        if (key.length === 0 || (references !== undefined && references[state.md.utils.normalizeReference(key)] !== undefined)) {
            return false;
        }

        if (!silent) {
            if (isImage) {
                const image: Token = state.push("image", "img", 0);
                image.attrs = [["src", "#"], ["alt", ""], ["data-keyref", key]];
                const children: Token[] = [];
                state.md.inline.parse(label, state.md, state.env, children);
                image.children = children;
                image.content = label;
            } else {
                const linkOpen: Token = state.push("link_open", "a", 1);
                linkOpen.attrs = [["href", "#"], ["data-keyref", key]];
                state.pos = labelStart;
                state.posMax = labelEnd;
                state.linkLevel++;
                state.md.inline.tokenize(state);
                state.linkLevel--;
                state.posMax = max;
                state.push("link_close", "a", -1);
            }
        }
        state.pos = pos;
        return true;
    }
}

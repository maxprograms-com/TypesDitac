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

import { MarkdownItPlugin, RuleInline, Token } from "./MarkdownItTypes.js";

function escapeAttribute(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function mediaRule(kind: "audio" | "video", tag: string): RuleInline {
    const marker: string = kind === "audio" ? "!A[" : "!V[";
    return (state, silent): boolean => {
        const start: number = state.pos;
        if (state.src.slice(start, start + marker.length) !== marker) {
            return false;
        }
        let pos: number = start + marker.length;
        const altStart: number = pos;
        let depth: number = 1;
        while (pos < state.posMax && depth > 0) {
            if (state.src[pos] === "[") {
                depth++;
            } else if (state.src[pos] === "]") {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
            pos++;
        }
        if (depth !== 0) {
            return false;
        }
        const alt: string = state.src.slice(altStart, pos);
        pos++;
        if (state.src[pos] !== "(") {
            return false;
        }
        pos++;
        const linksStart: number = pos;
        while (pos < state.posMax && state.src[pos] !== ")") {
            pos++;
        }
        if (pos >= state.posMax) {
            return false;
        }
        const links: string[] = state.src.slice(linksStart, pos).split("|").map((link): string => link.trim())
            .filter((link): boolean => link.length > 0);
        pos++;

        if (silent) {
            return true;
        }

        const token: Token = state.push(tag + "_media", tag, 0);
        token.meta = { alt, links };
        state.pos = pos;
        return true;
    };
}

const mediaTagsPlugin: MarkdownItPlugin = (md): void => {
    md.inline.ruler.before("link", "audio_media", mediaRule("audio", "audio"));
    md.inline.ruler.before("link", "video_media", mediaRule("video", "video"));

    md.renderer.rules.audio_media = (tokens: Token[], idx: number): string => renderMedia(tokens[idx], "audio");
    md.renderer.rules.video_media = (tokens: Token[], idx: number): string => renderMedia(tokens[idx], "video");
};

function renderMedia(token: Token, tag: string): string {
    const meta: { alt: string; links: string[] } = token.meta as { alt: string; links: string[] };
    let html: string = "<" + tag;
    if (meta.alt.length > 0) {
        html += " title=\"" + escapeAttribute(meta.alt) + "\"";
    }
    html += " controls>";
    for (const link of meta.links) {
        html += "<source src=\"" + escapeAttribute(link) + "\"></source>";
    }
    html += "</" + tag + ">";
    return html;
}

export default mediaTagsPlugin;

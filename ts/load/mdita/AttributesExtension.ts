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

import { MarkdownItPlugin, StateCore, StateInline, Token } from "./MarkdownItTypes.js";

interface ParsedAttributes {
    readonly end: number;
    readonly pairs: [string, string][];
}

export class AttributesExtension {
    private static readonly SPEC: RegExp =
        /#([^\s}]+)|\.([^\s}]+)|([A-Za-z_:][\w.:-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'}]+)))?/y;

    static readonly plugin: MarkdownItPlugin = (md): void => {
        md.inline.ruler.push("attributes", AttributesExtension.tokenize);
        md.core.ruler.after("text_join", "attributes", AttributesExtension.resolve);
    };

    private static tokenize(state: StateInline, silent: boolean): boolean {
        if (state.src.charCodeAt(state.pos) !== 0x7B) {
            return false;
        }
        const parsed: ParsedAttributes | undefined = AttributesExtension.parse(state.src, state.pos, state.posMax);
        if (parsed === undefined) {
            return false;
        }
        if (!silent) {
            const token: Token = state.push("attributes", "", 0);
            token.meta = { pairs: parsed.pairs };
        }
        state.pos = parsed.end;
        return true;
    }

    private static parse(src: string, start: number, max: number): ParsedAttributes | undefined {
        const pairs: [string, string][] = [];
        let pos: number = start + 1;
        while (pos < max) {
            while (pos < max && /\s/.test(src.charAt(pos))) {
                pos++;
            }
            if (pos >= max) {
                return undefined;
            }
            if (src.charAt(pos) === "}") {
                return pairs.length > 0 ? { end: pos + 1, pairs: pairs } : undefined;
            }
            AttributesExtension.SPEC.lastIndex = pos;
            const spec: RegExpExecArray | null = AttributesExtension.SPEC.exec(src);
            if (spec === null || pos + spec[0].length > max) {
                return undefined;
            }
            if (spec[1] !== undefined) {
                pairs.push(["id", spec[1]]);
            } else if (spec[2] !== undefined) {
                pairs.push(["class", spec[2]]);
            } else {
                pairs.push([spec[3], spec[4] ?? spec[5] ?? spec[6] ?? ""]);
            }
            pos += spec[0].length;
            if (pos < max && !/[\s}]/.test(src.charAt(pos))) {
                return undefined;
            }
        }
        return undefined;
    }

    private static resolve(state: StateCore): void {
        const tokens: Token[] = state.tokens;
        const containers: Token[] = [];
        const siblings: (Token | undefined)[] = [undefined];
        const removed: Set<number> = new Set<number>();

        for (let i: number = 0; i < tokens.length; i++) {
            const token: Token = tokens[i];
            if (token.nesting === 1) {
                const sibling: Token | undefined = siblings[siblings.length - 1];
                if (token.type === "paragraph_open" && sibling !== undefined && AttributesExtension.isStandalone(tokens[i + 1])) {
                    // A paragraph made only of {...} gives its attributes to the block right before it.
                    const container: Token | undefined = containers[containers.length - 1];
                    for (const child of tokens[i + 1].children ?? []) {
                        AttributesExtension.apply(AttributesExtension.blockOwner(sibling, container), child);
                    }
                    removed.add(i);
                    removed.add(i + 1);
                    removed.add(i + 2);
                    i += 2;
                    continue;
                }
                containers.push(token);
                siblings.push(undefined);
            } else if (token.nesting === -1) {
                siblings.pop();
                siblings[siblings.length - 1] = containers.pop();
            } else {
                if (token.type === "inline" && token.children !== null) {
                    const opener: Token | undefined = containers[containers.length - 1];
                    const owner: Token | undefined = opener === undefined
                        ? undefined
                        : AttributesExtension.blockOwner(opener, containers[containers.length - 2]);
                    const inCell: boolean = opener !== undefined && (opener.type === "td_open" || opener.type === "th_open");
                    token.children = AttributesExtension.resolveInline(state, token.children, owner, inCell);
                }
                siblings[siblings.length - 1] = token;
            }
        }

        if (removed.size > 0) {
            state.tokens = tokens.filter((_token: Token, index: number): boolean => !removed.has(index));
        }
    }

    private static resolveInline(state: StateCore, children: Token[], blockOwner: Token | undefined, inCell: boolean): Token[] {
        const result: Token[] = [];
        const open: Token[] = [];
        let lastClosed: Token | undefined;

        for (let j: number = 0; j < children.length; j++) {
            const child: Token = children[j];
            if (child.type !== "attributes") {
                if (child.nesting === 1) {
                    open.push(child);
                } else if (child.nesting === -1) {
                    lastClosed = open.pop();
                }
                result.push(child);
                continue;
            }

            let end: number = j;
            while (end + 1 < children.length && children[end + 1].type === "attributes") {
                end++;
            }
            const next: Token | undefined = children[end + 1];
            const atEnd: boolean = next === undefined || next.nesting === -1;
            const parent: Token | undefined = open.length > 0 ? open[open.length - 1] : blockOwner;
            const previous: Token | undefined = result.length > 0 ? result[result.length - 1] : undefined;

            let owner: Token | undefined;
            if (previous === undefined || previous.nesting === 1) {
                owner = parent;
            } else if (previous.nesting === -1) {
                owner = lastClosed;
            } else if (previous.type === "softbreak" || previous.type === "hardbreak") {
                owner = parent;
                if (atEnd) {
                    result.pop();
                }
            } else if (previous.type === "text") {
                // "text {...}" ending its parent targets the parent; anything else (no space,
                // more text after, table cells) wraps the text in a <span>.
                if (atEnd && !inCell && /\s$/.test(previous.content)) {
                    owner = parent;
                    previous.content = previous.content.trimEnd();
                    if (previous.content.length === 0) {
                        result.pop();
                    }
                } else {
                    result.pop();
                    const spanOpen: Token = new state.Token("span_open", "span", 1);
                    const spanClose: Token = new state.Token("span_close", "span", -1);
                    result.push(spanOpen, previous, spanClose);
                    owner = spanOpen;
                    lastClosed = spanOpen;
                }
            } else {
                owner = previous;
            }

            for (let k: number = j; k <= end; k++) {
                AttributesExtension.apply(owner, children[k]);
            }
            j = end;
        }
        return result;
    }

    private static isStandalone(inline: Token | undefined): boolean {
        if (inline === undefined || inline.type !== "inline" || inline.children === null) {
            return false;
        }
        let found: boolean = false;
        for (const child of inline.children) {
            if (child.type === "attributes") {
                found = true;
            } else if (child.type !== "softbreak" && !(child.type === "text" && child.content.trim().length === 0)) {
                return false;
            }
        }
        return found;
    }

    private static blockOwner(block: Token, container: Token | undefined): Token {
        if (block.type === "paragraph_open" && container !== undefined && container.type === "list_item_open") {
            return container;
        }
        return block;
    }

    private static apply(owner: Token | undefined, attributes: Token): void {
        if (owner === undefined || attributes.type !== "attributes") {
            return;
        }
        for (const [name, value] of (attributes.meta as { pairs: [string, string][] }).pairs) {
            if (name === "class") {
                owner.attrJoin("class", value);
            } else if (name === "id" && owner.type === "heading_open") {
                continue;
            } else {
                owner.attrSet(name, value);
            }
        }
    }
}

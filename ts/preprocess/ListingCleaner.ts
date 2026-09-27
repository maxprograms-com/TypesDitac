/*
 * Portions Copyright (c) 2018-2025 XMLmind Software. All rights reserved.
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

import { TextNode, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";

interface TextChars {
    readonly parent: DitaElement;
    readonly node: TextNode;
    chars: string[];
    modified: boolean;
}

export class ListingCleaner {
    private static readonly HL_CODE_LISTS: string[][] = [
        ["bourne", "shell", "sh"],
        ["c"],
        ["cmake", "make", "makefile"],
        ["cpp"],
        ["csharp", "c#"],
        ["css21", "css"],
        ["delphi"],
        ["ini"],
        ["java"],
        ["javascript"],
        ["lua"],
        ["m2"],
        ["perl"],
        ["php"],
        ["python"],
        ["ruby"],
        ["sql1999"],
        ["sql2003"],
        ["sql92", "sql"],
        ["tcl"],
        ["upc"],
        ["html"],
        ["xml"]
    ];

    protected constructor() {
    }

    static checkHLCode(hlCode: string): string | undefined {
        for (const hlCodeList of ListingCleaner.HL_CODE_LISTS) {
            if (hlCodeList.some((value: string): boolean => value.toLowerCase() === hlCode.toLowerCase())) {
                return hlCodeList[0];
            }
        }
        return undefined;
    }

    protected static normalizeWhiteSpace(tree: DitaElement, tabWidth: number, unindent: boolean): void {
        const list: TextChars[] = [];
        ListingCleaner.collectTextChars(tree, list);

        if (tabWidth > 0) {
            ListingCleaner.expandTabs(list, tabWidth);
        }
        if (unindent) {
            ListingCleaner.unindentAll(list);
        }

        for (const textChars of list) {
            if (textChars.modified) {
                // Replace the node: it may also be referenced from another tree.
                const content: XMLNode[] = textChars.parent.getContent();
                const index: number = content.indexOf(textChars.node);
                content[index] = new TextNode(textChars.chars.join(""));
                textChars.parent.setContent(content);
            }
        }
    }

    private static collectTextChars(tree: DitaElement, list: TextChars[]): void {
        for (const node of tree.getContent()) {
            if (node instanceof TextNode) {
                list.push({ parent: tree, node, chars: node.getValue().split(""), modified: false });
            } else if (node instanceof DitaElement) {
                ListingCleaner.collectTextChars(node, list);
            }
        }
    }

    private static expandTabs(list: TextChars[], tabWidth: number): void {
        const lineLength: number[] = [0];
        for (const textChars of list) {
            ListingCleaner.expandTabsIn(textChars, tabWidth, lineLength);
        }
    }

    private static expandTabsIn(textChars: TextChars, tabWidth: number, lineLength: number[]): void {
        const buffer: string[] = [];
        let expanded: boolean = false;
        const chars: string[] = textChars.chars;

        for (let i: number = 0; i < chars.length; i++) {
            const c: string = chars[i];
            if (c === "\t") {
                let spaceCount: number = tabWidth - (lineLength[0] % tabWidth);
                lineLength[0] += spaceCount;
                while (spaceCount > 0) {
                    buffer.push(" ");
                    spaceCount--;
                }
                expanded = true;
            } else if (c === "\n") {
                buffer.push(c);
                lineLength[0] = 0;
            } else if (c === "\r") {
                if (i + 1 < chars.length && chars[i + 1] === "\n") {
                    continue;
                }
                buffer.push(c);
                lineLength[0]++;
            } else {
                buffer.push(c);
                lineLength[0]++;
            }
        }

        if (expanded) {
            textChars.chars = buffer;
            textChars.modified = true;
        }
    }

    private static unindentAll(list: TextChars[]): void {
        let current: number = -1;
        const indentation: number[] = [-1];
        for (const textChars of list) {
            current = ListingCleaner.indentation(textChars, current, indentation);
        }

        if (current !== -1) {
            if (current < -1) {
                // Last line only contains space chars.
                current = -current - 1;
            }
            if (indentation[0] < 0 || current < indentation[0]) {
                indentation[0] = current;
            }
        }

        const unindent: number = indentation[0];
        if (unindent > 0) {
            let remain: number = unindent;
            for (const textChars of list) {
                remain = ListingCleaner.unindentOne(textChars, unindent, remain);
            }
        }
    }

    private static indentation(textChars: TextChars, current: number, indentation: number[]): number {
        const chars: string[] = textChars.chars;
        for (const c of chars) {
            if (c === " ") {
                if (current <= -1) {
                    current--;
                }
            } else if (c === "\n") {
                if (current !== -1) {
                    if (current < -1) {
                        // This line only contains space chars.
                        current = -current - 1;
                    }
                    if (indentation[0] < 0 || current < indentation[0]) {
                        indentation[0] = current;
                    }
                    current = -1;
                }
            } else {
                if (current <= -1) {
                    // Not a space char anymore. Prevent current from decreasing.
                    current = -current - 1;
                }
                // Otherwise, ignore open line.
            }
        }
        return current;
    }

    private static unindentOne(textChars: TextChars, unindent: number, remain: number): number {
        const buffer: string[] = [];
        let unindented: boolean = false;
        const chars: string[] = textChars.chars;

        for (const c of chars) {
            if (c === " ") {
                if (remain > 0) {
                    remain--;
                    unindented = true;
                } else {
                    buffer.push(c);
                }
            } else if (c === "\n") {
                // Space chars before a newline char are useless.
                while (buffer.length > 0 && buffer[buffer.length - 1] === " ") {
                    buffer.pop();
                }
                buffer.push(c);
                // Not a space char anymore.
                remain = unindent;
            } else {
                buffer.push(c);
                remain = 0;
            }
        }

        if (unindented) {
            textChars.chars = buffer;
            textChars.modified = true;
        }
        return remain;
    }
}

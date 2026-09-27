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

import type { DefaultTreeAdapterTypes } from "parse5";

export type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
export type HtmlElement = DefaultTreeAdapterTypes.Element;

export class HtmlSupport {
    private constructor() { }

    static isTextNode(node: HtmlNode): node is DefaultTreeAdapterTypes.TextNode {
        return node.nodeName === "#text";
    }

    static isElement(node: HtmlNode): node is HtmlElement {
        return "tagName" in node;
    }

    static attribute(element: HtmlElement | undefined, name: string): string | undefined {
        return element?.attrs.find((entry): boolean => entry.name === name)?.value;
    }

    static nonEmptyAttribute(element: HtmlElement | undefined, name: string): string | undefined {
        const value: string | undefined = HtmlSupport.attribute(element, name);
        return value === undefined || value.trim().length === 0 ? undefined : value;
    }

    static classTokens(element: HtmlElement | undefined): string[] {
        const value: string | undefined = HtmlSupport.attribute(element, "class");
        return value === undefined ? [] : value.trim().split(/\s+/).filter((token: string): boolean => token.length > 0);
    }

    static hasClassToken(element: HtmlElement | undefined, token: string): boolean {
        return HtmlSupport.classTokens(element).includes(token);
    }

    static setHtmlAttribute(element: HtmlElement, name: string, value: string): void {
        const existing: HtmlElement["attrs"][number] | undefined = element.attrs.find((entry) => entry.name === name);
        if (existing !== undefined) {
            existing.value = value;
        } else {
            element.attrs.push({ name, value });
        }
    }

    static children(node: HtmlElement | undefined): HtmlNode[] {
        return node === undefined ? [] : node.childNodes;
    }

    static childElements(node: HtmlElement | undefined): HtmlElement[] {
        return HtmlSupport.children(node).filter(HtmlSupport.isElement);
    }

    static firstChildElement(node: HtmlElement | undefined): HtmlElement | undefined {
        return HtmlSupport.childElements(node)[0];
    }

    static firstElementNamed(nodes: HtmlNode[], tagName: string): HtmlElement | undefined {
        return nodes.find((node): node is HtmlElement => HtmlSupport.isElement(node) && node.tagName === tagName);
    }

    static findDescendant(nodes: HtmlNode[], tagName: string): HtmlElement | undefined {
        for (const node of nodes) {
            if (HtmlSupport.isElement(node)) {
                if (node.tagName === tagName) {
                    return node;
                }
                const found: HtmlElement | undefined = HtmlSupport.findDescendant(node.childNodes, tagName);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    }

    static descendantsNamed(root: HtmlElement, tagName: string): HtmlElement[] {
        const result: HtmlElement[] = [];
        for (const child of root.childNodes) {
            if (HtmlSupport.isElement(child)) {
                if (child.tagName === tagName) {
                    result.push(child);
                }
                result.push(...HtmlSupport.descendantsNamed(child, tagName));
            }
        }
        return result;
    }

    static textContent(node: HtmlNode): string {
        if (HtmlSupport.isTextNode(node)) {
            return node.value;
        }
        if (!HtmlSupport.isElement(node)) {
            return "";
        }
        let text: string = "";
        for (const child of node.childNodes) {
            text += HtmlSupport.textContent(child);
        }
        return text;
    }

    static normalizeSpace(value: string): string {
        return value.trim().replace(/\s+/g, " ");
    }

    private static findPath(current: HtmlElement, target: HtmlElement, path: HtmlElement[]): boolean {
        path.push(current);
        if (current === target) {
            return true;
        }
        for (const child of current.childNodes) {
            if (HtmlSupport.isElement(child) && HtmlSupport.findPath(child, target, path)) {
                return true;
            }
        }
        path.pop();
        return false;
    }

    static parentElement(root: HtmlElement, target: HtmlElement): HtmlElement | undefined {
        const path: HtmlElement[] = [];
        if (!HtmlSupport.findPath(root, target, path) || path.length < 2) {
            return undefined;
        }
        return path[path.length - 2];
    }
}

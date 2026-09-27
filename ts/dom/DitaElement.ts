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

import { XMLElement, XMLNode } from "typesxml";

export class DitaElement extends XMLElement {
    private _parent: DitaElement | undefined;

    constructor(name: string) {
        super(name);
    }

    getParent(): DitaElement | undefined {
        return this._parent;
    }

    setParent(parent: DitaElement | undefined): void {
        this._parent = parent;
    }

    override addElement(node: XMLElement): void {
        if (node instanceof DitaElement) {
            node.setParent(this);
        }
        super.addElement(node);
    }

    override setContent(content: Array<XMLNode>): void {
        for (const node of this.getContent()) {
            if (node instanceof DitaElement && node.getParent() === this) {
                node.setParent(undefined);
            }
        }
        for (const node of content) {
            if (node instanceof DitaElement) {
                node.setParent(this);
            }
        }
        super.setContent(content);
    }

    override removeChild(child: XMLElement): void {
        if (child instanceof DitaElement && child.getParent() === this) {
            child.setParent(undefined);
        }
        super.removeChild(child);
    }

    override getChildren(): DitaElement[] {
        return super.getChildren() as DitaElement[];
    }

    getNextSiblingElement(): DitaElement | undefined {
        if (this._parent === undefined) {
            return undefined;
        }
        const siblings: DitaElement[] = this._parent.getChildren();
        const index: number = siblings.indexOf(this);
        if (index >= 0 && index + 1 < siblings.length) {
            return siblings[index + 1];
        }
        return undefined;
    }

    getPreviousSiblingElement(): DitaElement | undefined {
        if (this._parent === undefined) {
            return undefined;
        }
        const siblings: DitaElement[] = this._parent.getChildren();
        const index: number = siblings.indexOf(this);
        if (index > 0) {
            return siblings[index - 1];
        }
        return undefined;
    }

    isAncestorOf(descendant: DitaElement): boolean {
        let current: DitaElement | undefined = descendant.getParent();
        while (current !== undefined) {
            if (current === this) {
                return true;
            }
            current = current.getParent();
        }
        return false;
    }

    computeElementPointer(): string {
        const segments: number[] = [];
        let current: DitaElement = this;
        while (current._parent !== undefined) {
            const parent: DitaElement = current._parent;
            const siblings: DitaElement[] = parent.getChildren();
            const index: number = siblings.indexOf(current);
            segments.unshift(index >= 0 ? index + 1 : 1);
            current = parent;
        }
        segments.unshift(1);
        return "/" + segments.join("/");
    }
}

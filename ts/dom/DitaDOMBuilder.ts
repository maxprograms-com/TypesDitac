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

import { DOMBuilder, TextNode, XMLAttribute } from "typesxml";
import { DitaElement } from "./DitaElement.js";

export class DitaDOMBuilder extends DOMBuilder {
    override startElement(name: string, atts: XMLAttribute[]): void {
        const element: DitaElement = new DitaElement(name);
        for (const att of atts) {
            element.setAttribute(att);
        }
        if (this.stack.length > 0) {
            const parent: DitaElement = this.stack[this.stack.length - 1] as DitaElement;
            parent.addElement(element);
        } else {
            this.document?.setRoot(element);
        }
        this.stack.push(element);
    }

    override characters(ch: string): void {
        // Also used for the content of CDATA sections. addTextNode() merges the new node into a preceding text node.
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(new TextNode(ch));
        } else {
            super.characters(ch);
        }
    }

    override startCDATA(): void {
        // CDATA sections are character data: they are not kept as separate nodes.
    }

    override endCDATA(): void {
    }
}

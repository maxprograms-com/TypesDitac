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

import { XMLAttribute } from "typesxml";
import { DitaElement } from "../../dom/DitaElement.js";

export class DitaBuilder {
    private constructor() { }

    static createElement(name: string, className?: string): DitaElement {
        const element: DitaElement = new DitaElement(name);
        if (className !== undefined) {
            element.setAttribute(new XMLAttribute("class", className));
        }
        return element;
    }

    static setAttr(element: DitaElement, name: string, value: string | undefined): void {
        if (value !== undefined) {
            element.setAttribute(new XMLAttribute(name, value));
        }
    }

    static addText(element: DitaElement, text: string): void {
        if (text.length > 0) {
            element.addString(text);
        }
    }
}

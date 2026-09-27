/*
 * Portions Copyright (c) 2017-2025 XMLmind Software. All rights reserved.
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

import { DitaElement } from "../dom/DitaElement.js";

export class IndexTermRef {
    readonly source: DitaElement;
    readonly term: string[];

    constructor(source: DitaElement, term: string[]) {
        this.source = source;
        this.term = term;
    }

    equals(other: unknown): boolean {
        if (!(other instanceof IndexTermRef) || this.term.length !== other.term.length) {
            return false;
        }
        for (let index: number = 0; index < this.term.length; index++) {
            if (this.term[index] !== other.term[index]) {
                return false;
            }
        }
        return true;
    }
}
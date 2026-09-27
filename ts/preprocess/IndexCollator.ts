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

export class IndexCollator {
    private static readonly IGNORABLE: RegExp = /[\u0020\u00A0\u202F\u205F\u002D\u00AD\u2010-\u2015\u2212\u207B\u208B]/g;

    private readonly collator: Intl.Collator;

    constructor(lang: string) {
        this.collator = new Intl.Collator(lang, { sensitivity: "variant", ignorePunctuation: false });
    }

    compare(a: string, b: string): number {
        // Spaces and dashes only matter when the terms are otherwise equal.
        const delta: number = this.collator.compare(a.replace(IndexCollator.IGNORABLE, ""), b.replace(IndexCollator.IGNORABLE, ""));
        return delta !== 0 ? delta : this.collator.compare(a, b);
    }
}

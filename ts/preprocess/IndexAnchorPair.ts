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
import { IndexAnchor } from "./IndexAnchor.js";

export class IndexAnchorPair extends IndexAnchor {
    readonly name: string;
    private source2: DitaElement | undefined;
    private file2: string | undefined;
    private id2: string | undefined;

    constructor(source: DitaElement, file: string, id: string, name: string) {
        super(source, file, id);
        this.name = name;
    }

    setAnchor2(source2: DitaElement, file2: string, id2: string): void {
        this.source2 = source2;
        this.file2 = file2;
        this.id2 = id2;
    }

    getSource2(): DitaElement | undefined {
        return this.source2;
    }

    getFile2(): string | undefined {
        return this.file2;
    }

    getId2(): string | undefined {
        return this.id2;
    }
}
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

import { IndexAnchor } from "./IndexAnchor.js";
import { IndexTermRef } from "./IndexTermRef.js";

export class IndexTerm {
    readonly term: string;
    private sortAs: string | undefined;
    private anchorList: IndexAnchor[] | undefined;
    private seeList: IndexTermRef[] | undefined;
    private seeAlsoList: IndexTermRef[] | undefined;
    private subTermList: IndexTerm[] | undefined;

    constructor(term: string) {
        this.term = term;
    }

    setSortAs(sortAs: string): void {
        this.sortAs = sortAs;
    }

    getSortAs(): string | undefined {
        return this.sortAs;
    }

    addAnchor(anchor: IndexAnchor): void {
        if (this.anchorList === undefined) {
            this.anchorList = [anchor];
        } else {
            this.anchorList.push(anchor);
        }
    }

    getAnchorList(): IndexAnchor[] | undefined {
        return this.anchorList;
    }

    addSee(see: IndexTermRef): void {
        if (this.seeList === undefined) {
            this.seeList = [see];
        } else {
            this.seeList.push(see);
        }
    }

    clearSeeList(): void {
        this.seeList = undefined;
    }

    getSeeList(): IndexTermRef[] | undefined {
        return this.seeList;
    }

    addSeeAlso(seeAlso: IndexTermRef): void {
        if (this.seeAlsoList === undefined) {
            this.seeAlsoList = [seeAlso];
        } else {
            this.seeAlsoList.push(seeAlso);
        }
    }

    clearSeeAlsoList(): void {
        this.seeAlsoList = undefined;
    }

    getSeeAlsoList(): IndexTermRef[] | undefined {
        return this.seeAlsoList;
    }

    addSubTerm(subTerm: IndexTerm): void {
        if (this.subTermList === undefined) {
            this.subTermList = [subTerm];
        } else {
            this.subTermList.push(subTerm);
        }
    }

    getSubTermList(): IndexTerm[] | undefined {
        return this.subTermList;
    }
}
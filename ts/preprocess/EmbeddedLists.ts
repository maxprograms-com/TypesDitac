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

import { ListTarget, ListTargetType } from "./ListTarget.js";
import { IndexTerm } from "./IndexTerm.js";

export class EmbeddedLists {
    private readonly targets: Map<ListTargetType, ListTarget[]> = new Map<ListTargetType, ListTarget[]>();
    private indexTerms: IndexTerm[] = [];

    constructor() {
        for (const type of Object.values(ListTargetType)) {
            this.targets.set(type, []);
        }
    }

    setIndexTerms(indexTerms: IndexTerm[]): void {
        this.indexTerms = indexTerms;
    }

    getIndexTerms(): IndexTerm[] {
        return this.indexTerms;
    }

    add(target: ListTarget): void {
        const entries: ListTarget[] | undefined = this.targets.get(target.type);
        if (entries === undefined) {
            this.targets.set(target.type, [target]);
            return;
        }
        if (!entries.includes(target)) {
            entries.push(target);
        }
    }

    addAll(targets: Map<ListTargetType, ListTarget[]>): void {
        for (const entries of targets.values()) {
            for (const target of entries) {
                this.add(target);
            }
        }
    }

    get(type: ListTargetType): ListTarget[] {
        return [...(this.targets.get(type) ?? [])];
    }

    getTypes(): ListTargetType[] {
        return [...this.targets.keys()];
    }

    isEmpty(): boolean {
        for (const entries of this.targets.values()) {
            if (entries.length > 0) {
                return false;
            }
        }
        return true;
    }

    getTargetIds(type: ListTargetType): string[] {
        return this.get(type).map((target: ListTarget): string => target.targetId);
    }

    //TODO Define the TypesDITA list-data element contract used by the target CSS stylesheet.
}

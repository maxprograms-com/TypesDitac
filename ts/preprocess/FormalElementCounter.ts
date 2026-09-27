/*
 * Portions Copyright (c) 2017 XMLmind Software. All rights reserved.
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

import { ChunkEntry } from "./ChunkEntry.js";

export class FormalElementCounter {
    readonly type: string;
    private readonly prefix: string;
    private nonChapterCount: number = 0;
    private partNumber: string | undefined;
    private chapterNumber: string[] | undefined;
    private perChapterCount: number = 0;

    constructor(type: string) {
        this.type = type;
        this.prefix = type + ".";
    }

    traversing(entry: ChunkEntry): void {
        // Unlike part elements, a bookmap may contain only a single appendices element, so there is
        // no need to count appendices elements.
        const num: string[] = entry.number ?? [];
        this.partNumber = num.length > 0 && num[0].startsWith("part.") ? num[0] : undefined;

        // The following, very simple, implementation works because a chapter/appendix cannot have
        // chapter/appendix descendants.
        let index: number = -1;
        for (let i: number = 0; i < num.length; i++) {
            if (num[i].startsWith("chapter.") || num[i].startsWith("appendix.")) {
                index = i;
                break;
            }
        }

        if (index < 0) {
            this.chapterNumber = undefined;
            this.perChapterCount = 0;
            return;
        }

        let newChapterNumber: boolean;
        if (this.chapterNumber !== undefined && index + 1 === this.chapterNumber.length) {
            newChapterNumber = false;
            for (let i: number = 0; i <= index; i++) {
                if (num[i] !== this.chapterNumber[i]) {
                    newChapterNumber = true;
                    break;
                }
            }
        } else {
            newChapterNumber = true;
        }

        if (newChapterNumber) {
            this.chapterNumber = num.slice(0, index + 1);
            this.perChapterCount = 0;
        }
    }

    increment(): void {
        if (this.chapterNumber !== undefined) {
            this.perChapterCount++;
        } else {
            this.nonChapterCount++;
        }
    }

    format(): string {
        if (this.chapterNumber !== undefined) {
            return this.chapterNumber.join(" ") + " " + this.prefix + this.perChapterCount.toString();
        }
        // chapterNumber already includes the number of its parent part, if any, so partNumber is
        // only prefixed in the non-chapter case.
        const partPrefix: string = this.partNumber !== undefined ? this.partNumber + " " : "";
        return partPrefix + this.prefix + this.nonChapterCount.toString();
    }
}

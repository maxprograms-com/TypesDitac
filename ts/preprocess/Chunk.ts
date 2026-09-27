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

import type { DitaElement } from "../dom/DitaElement.js";
import type { I18n } from "../i18n/I18n.js";
import type { ChunkEntry } from "./ChunkEntry.js";

export class Chunk {
    readonly rawRootName: string;
    private entries: ChunkEntry[] = [];
    private rootName: string | undefined;

    constructor(rawRootName: string) {
        this.rawRootName = rawRootName;
    }

    initRootName(rootName: string, i18n: I18n): void {
        if (this.rootName !== undefined) {
            throw new Error(i18n.getString("Chunk", "rootNameAlreadyInitialized"));
        }
        this.rootName = rootName;
    }

    getRootName(): string | undefined {
        return this.rootName;
    }

    prependEntry(entry: ChunkEntry): void {
        if (!this.containsEntry(entry)) {
            this.entries.unshift(entry);
        }
    }

    appendEntry(entry: ChunkEntry): void {
        if (!this.containsEntry(entry)) {
            this.entries.push(entry);
        }
    }

    containsEntry(entry: ChunkEntry): boolean {
        const element: DitaElement | undefined = entry.getElement();
        if (element === undefined) {
            return false;
        }
        for (const existingEntry of this.entries) {
            if (existingEntry.getElement() === element) {
                return true;
            }
        }
        return false;
    }

    hasEntries(): boolean {
        return this.entries.length > 0;
    }

    getEntries(): ChunkEntry[] {
        return [...this.entries];
    }

    toString(): string {
        const lines: string[] = [];
        const name: string = this.rootName === undefined ? "" : this.rootName;
        lines.push(name + " (" + this.rawRootName + "):");
        for (const entry of this.entries) {
            lines.push("    " + entry.toString());
        }
        return lines.join("\n");
    }
}

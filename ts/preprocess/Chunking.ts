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

export enum Chunking {
    NONE = "none",
    SINGLE = "single",
    AUTO = "auto"
}

export function chunkingFromString(spec: string): Chunking | undefined {
    const trimmed: string = spec.trim().toLowerCase();
    switch (trimmed) {
        case "none":
            return Chunking.NONE;
        case "single":
            return Chunking.SINGLE;
        case "auto":
            return Chunking.AUTO;
        default:
            return undefined;
    }
}

export function joinChunkingStringForms(separator: string): string {
    return [Chunking.NONE, Chunking.SINGLE, Chunking.AUTO].join(separator);
}

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

import { fileURLToPath } from "node:url";
import { I18n } from "../i18n/I18n.js";

export type DiagnosticSeverity = "warning" | "error" | "fatal";

export interface DiagnosticEntry {
    readonly severity: DiagnosticSeverity;
    readonly location?: string;
    readonly message: string;
}

export class DiagnosticLog {
    static readonly I18N_DIRECTORY: string = fileURLToPath(new URL("../i18n", import.meta.url));

    readonly entries: DiagnosticEntry[] = [];
    readonly i18n: I18n;

    constructor(i18n: I18n) {
        this.i18n = i18n;
    }

    warning(message: string, location?: string): void {
        this.entries.push({ severity: "warning", location, message });
    }

    error(message: string, location?: string): void {
        this.entries.push({ severity: "error", location, message });
    }

    fatal(message: string, location?: string): void {
        this.entries.push({ severity: "fatal", location, message });
    }

    print(write: (message: string) => void): void {
        for (const entry of this.entries) {
            const location: string = entry.location === undefined ? "" : entry.location + ": ";
            write(entry.severity.toUpperCase() + ": " + location + entry.message);
        }
    }
}
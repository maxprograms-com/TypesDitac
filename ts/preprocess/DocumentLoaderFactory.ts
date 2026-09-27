/*
 * Portions Copyright (c) 2018-2025 XMLmind Software. All rights reserved.
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

import { Catalog } from "typesxml";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DocumentLoader } from "./DocumentLoader.js";

export interface DocumentLoaderFactory {
    getName(): string;
    getExtensions(): string[];
    createLoader(catalog: Catalog, diagnostics: DiagnosticLog): DocumentLoader;
}

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
import { DocumentLoaderFactory } from "./DocumentLoaderFactory.js";
import { HDITALoaderFactory } from "../load/hdita/HDITALoaderFactory.js";
import { MDITALoaderFactory } from "../load/mdita/MDITALoaderFactory.js";

export class DocumentLoaderFactories {
    private static factories: DocumentLoaderFactory[] = [];

    private constructor() { }

    static register(factory: DocumentLoaderFactory): void {
        const name: string = factory.getName();
        DocumentLoaderFactories.factories = DocumentLoaderFactories.factories.filter(
            (existing: DocumentLoaderFactory): boolean => existing.getName() !== name
        );
        DocumentLoaderFactories.factories.push(factory);
    }

    static get(extension: string): DocumentLoaderFactory | undefined {
        const lower: string = extension.toLowerCase();
        for (let index: number = DocumentLoaderFactories.factories.length - 1; index >= 0; index--) {
            const factory: DocumentLoaderFactory = DocumentLoaderFactories.factories[index];
            if (factory.getExtensions().some((ext: string): boolean => ext.toLowerCase() === lower)) {
                return factory;
            }
        }
        return undefined;
    }

    static createLoader(filePath: string, catalog: Catalog, diagnostics: DiagnosticLog): DocumentLoader | undefined {
        const path: string = filePath.split("#", 1)[0].split("?", 1)[0];
        const dotIndex: number = path.lastIndexOf(".");
        if (dotIndex < 0) {
            return undefined;
        }
        const extension: string = path.slice(dotIndex + 1);
        if (extension.length === 0) {
            return undefined;
        }
        const factory: DocumentLoaderFactory | undefined = DocumentLoaderFactories.get(extension);
        return factory?.createLoader(catalog, diagnostics);
    }
}

DocumentLoaderFactories.register(new HDITALoaderFactory());
DocumentLoaderFactories.register(new MDITALoaderFactory());

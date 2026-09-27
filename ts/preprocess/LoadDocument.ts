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

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Catalog, SAXParser, XMLDocument } from "typesxml";
import { DitaDOMBuilder } from "../dom/DitaDOMBuilder.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { DocumentLoader } from "./DocumentLoader.js";
import { DocumentLoaderFactories } from "./DocumentLoaderFactories.js";

export class LoadDocument {
    static readonly DEFAULT_CATALOG: string = fileURLToPath(new URL("../catalog/catalog.xml", import.meta.url));

    readonly catalog: Catalog;
    private readonly diagnostics: DiagnosticLog;

    constructor(diagnostics: DiagnosticLog, catalog: Catalog = new Catalog(LoadDocument.DEFAULT_CATALOG)) {
        this.catalog = catalog;
        this.diagnostics = diagnostics;
    }

    load(filePath: string, validate: boolean = false): XMLDocument {
        if (/^https?:\/\//i.test(filePath)) {
            const formatLoader: DocumentLoader | undefined =
                DocumentLoaderFactories.createLoader(filePath, this.catalog, this.diagnostics);
            const source: string = DitaUtils.retrieve(filePath, this.diagnostics.i18n);
            return formatLoader === undefined
                ? this.loadSource(source, filePath, validate)
                : formatLoader.loadSource(source, filePath, validate);
        }
        const localPath: string = /^file:/i.test(filePath) ? fileURLToPath(new URL(filePath)) : filePath;
        const absolutePath: string = resolve(localPath);
        const formatLoader: DocumentLoader | undefined =
            DocumentLoaderFactories.createLoader(absolutePath, this.catalog, this.diagnostics);
        if (formatLoader !== undefined) {
            return formatLoader.load(absolutePath, validate);
        }
        return this.loadSourceFromFile(absolutePath, validate);
    }

    private loadSource(source: string, location: string, validate: boolean): XMLDocument {
        const builder: DitaDOMBuilder = new DitaDOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        parser.setCatalog(this.catalog);
        parser.setValidating(validate);
        parser.parseString(source);
        const document: XMLDocument | undefined = builder.getDocument();
        if (document === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadDocument", "documentHasNoContent"), [location]));
        }
        return document;
    }

    private loadSourceFromFile(filePath: string, validate: boolean): XMLDocument {
        const builder: DitaDOMBuilder = new DitaDOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        parser.setCatalog(this.catalog);
        parser.setValidating(validate);
        parser.parseFile(filePath);
        const document: XMLDocument | undefined = builder.getDocument();
        if (document === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadDocument", "documentHasNoContent"), [filePath]));
        }
        return document;
    }
}

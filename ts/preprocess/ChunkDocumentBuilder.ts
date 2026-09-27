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

import { XMLAttribute, XMLDocument, XMLNode } from "typesxml";
import { Filters } from "./Filters.js";
import { Flags } from "./Filter.js";
import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { ChunkEntry, ChunkEntryType } from "./ChunkEntry.js";
import { ChunkPlan } from "./ChunkPlan.js";

export const DITAC_NS_URI: string = "http://www.xmlmind.com/ditac/schema/ditac";

export const ENTRY_QNAMES: Map<ChunkEntryType, string> = new Map([
    [ChunkEntryType.TITLE_PAGE, "ditac:titlePage"],
    [ChunkEntryType.TOC, "ditac:toc"],
    [ChunkEntryType.FIGURE_LIST, "ditac:figureList"],
    [ChunkEntryType.TABLE_LIST, "ditac:tableList"],
    [ChunkEntryType.EXAMPLE_LIST, "ditac:exampleList"],
    [ChunkEntryType.EQUATION_LIST, "ditac:equationList"],
    [ChunkEntryType.INDEX_LIST, "ditac:indexList"]
]);

export class ChunkDocumentBuilder {
    private readonly filters: Filters;

    constructor(filters: Filters) {
        this.filters = filters;
    }

    build(plan: ChunkPlan, docLang: string | undefined): Map<string, XMLDocument> {
        const documents: Map<string, XMLDocument> = new Map();
        for (const chunk of plan.chunks) {
            const root: DitaElement = new DitaElement("ditac:chunk");
            root.setAttribute(new XMLAttribute("xmlns:ditac", DITAC_NS_URI));
            if (docLang !== undefined) {
                root.setAttribute(new XMLAttribute("xml:lang", docLang));
            }
            const rootName: string | undefined = chunk.getRootName();
            for (const entry of chunk.getEntries()) {
                root.addElement(this.buildEntry(entry));
            }
            const document: XMLDocument = new XMLDocument();
            document.setRoot(root);
            if (rootName !== undefined) {
                documents.set(rootName, document);
            }
        }
        return documents;
    }

    private buildEntry(entry: ChunkEntry): DitaElement {
        if (entry.type !== ChunkEntryType.TOPIC || entry.loadedTopic === undefined) {
            return new DitaElement(ENTRY_QNAMES.get(entry.type) ?? entry.type);
        }
        const topic: DitaElement = DitaUtils.cloneElement(entry.loadedTopic.element);
        this.removeNestedTopics(topic);
        const flags: Flags | undefined = entry.loadedTopic.getFlags();
        return flags === undefined ? topic : this.filters.flagElement(topic, flags);
    }

    private removeNestedTopics(element: DitaElement): void {
        const content: XMLNode[] = element.getContent();
        element.setContent(content.filter((node: XMLNode): boolean =>
            !(node instanceof DitaElement && DitaUtils.hasClass(node, "topic/topic"))
        ));
    }
}

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

import { XMLAttribute, XMLDocument } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { Chunk } from "./Chunk.js";
import { DITAC_NS_URI, ENTRY_QNAMES } from "./ChunkDocumentBuilder.js";
import { ChunkEntry, ChunkEntryType, TocType } from "./ChunkEntry.js";
import { ChunkPlan } from "./ChunkPlan.js";
import { EmbeddedLists } from "./EmbeddedLists.js";
import { GeneratedListTopicBuilder } from "./GeneratedListTopicBuilder.js";
import { ListTargetType } from "./ListTarget.js";
import { LoadedTopic } from "./LoadedTopic.js";

export class ListsDocumentBuilder {
    private readonly listTopicBuilder: GeneratedListTopicBuilder;

    constructor(diagnostics: DiagnosticLog) {
        this.listTopicBuilder = new GeneratedListTopicBuilder(diagnostics);
    }

    build(plan: ChunkPlan, lists: EmbeddedLists, mapRoot: DitaElement | undefined, docLang: string | undefined, forceTitlePage: boolean, chunkBaseName: (chunk: Chunk) => string): XMLDocument {
        const root: DitaElement = new DitaElement("ditac:lists");
        root.setAttribute(new XMLAttribute("xmlns:ditac", DITAC_NS_URI));
        if (docLang !== undefined) {
            root.setAttribute(new XMLAttribute("xml:lang", docLang));
        }

        if (plan.chunks.length > 0 && this.hasTitlePage(mapRoot, forceTitlePage)) {
            const firstChunk: Chunk = plan.chunks[0];
            firstChunk.prependEntry(new ChunkEntry(firstChunk, ChunkEntryType.TITLE_PAGE, [], undefined, undefined, TocType.NONE, undefined));
        }

        root.addElement(this.buildChunkList(plan.chunks, chunkBaseName));

        const titlePage: DitaElement = new DitaElement("ditac:titlePage");
        if (mapRoot !== undefined) {
            for (const child of this.listTopicBuilder.buildTitlePage(mapRoot, forceTitlePage)) {
                titlePage.addElement(child);
            }
        }
        root.addElement(titlePage);

        const allEntries: ChunkEntry[] = plan.chunks.flatMap((chunk: Chunk): ChunkEntry[] => chunk.getEntries());

        const frontmatterTOC: DitaElement = new DitaElement("ditac:frontmatterTOC");
        for (const child of this.listTopicBuilder.buildTOC(allEntries, TocType.FRONTMATTER, chunkBaseName)) {
            frontmatterTOC.addElement(child);
        }
        root.addElement(frontmatterTOC);

        const toc: DitaElement = new DitaElement("ditac:toc");
        for (const child of this.listTopicBuilder.buildTOC(allEntries, TocType.BODY, chunkBaseName)) {
            toc.addElement(child);
        }
        root.addElement(toc);

        const backmatterTOC: DitaElement = new DitaElement("ditac:backmatterTOC");
        for (const child of this.listTopicBuilder.buildTOC(allEntries, TocType.BACKMATTER, chunkBaseName)) {
            backmatterTOC.addElement(child);
        }
        root.addElement(backmatterTOC);

        const resolveFile: (topic: LoadedTopic) => string = (topic: LoadedTopic): string => {
            const chunk: Chunk | undefined = plan.getChunk(topic);
            return chunk === undefined ? "" : chunkBaseName(chunk);
        };

        for (const type of [ListTargetType.FIGURE, ListTargetType.TABLE, ListTargetType.EXAMPLE, ListTargetType.EQUATION, ListTargetType.INDEX_TERM]) {
            const wrapper: DitaElement = new DitaElement("ditac:" + this.listElementName(type));
            for (const child of this.listTopicBuilder.buildFormalList(lists, type, resolveFile)) {
                wrapper.addElement(child);
            }
            root.addElement(wrapper);
        }

        const document: XMLDocument = new XMLDocument();
        document.setRoot(root);
        return document;
    }

    private listElementName(type: ListTargetType): string {
        switch (type) {
            case ListTargetType.FIGURE:
                return "figureList";
            case ListTargetType.TABLE:
                return "tableList";
            case ListTargetType.EXAMPLE:
                return "exampleList";
            case ListTargetType.EQUATION:
                return "equationList";
            case ListTargetType.INDEX_TERM:
                return "indexList";
        }
    }

    private hasTitlePage(mapRoot: DitaElement | undefined, forceTitlePage: boolean): boolean {
        if (mapRoot === undefined) {
            return forceTitlePage;
        }
        if (DitaUtils.getChildByClass(mapRoot, "topic/title") !== undefined) {
            return true;
        }
        if (DitaUtils.getNonEmptyAttribute(mapRoot, "title") !== undefined) {
            return true;
        }
        return forceTitlePage;
    }

    private buildChunkList(chunks: Chunk[], chunkBaseName: (chunk: Chunk) => string): DitaElement {
        const chunkList: DitaElement = new DitaElement("ditac:chunkList");
        for (const chunk of chunks) {
            const chunkItem: DitaElement = new DitaElement("ditac:chunk");
            chunkItem.setAttribute(new XMLAttribute("file", chunkBaseName(chunk)));
            for (const entry of chunk.getEntries()) {
                chunkItem.addElement(this.buildChunkListEntry(entry));
            }
            chunkList.addElement(chunkItem);
        }
        return chunkList;
    }

    private buildChunkListEntry(entry: ChunkEntry): DitaElement {
        if (entry.type !== ChunkEntryType.TOPIC || entry.loadedTopic === undefined) {
            return new DitaElement(ENTRY_QNAMES.get(entry.type) ?? entry.type);
        }
        const entryItem: DitaElement = new DitaElement("ditac:topic");
        entryItem.setAttribute(new XMLAttribute("number", (entry.number ?? []).join(" ")));
        entryItem.setAttribute(new XMLAttribute("role", entry.role ?? ""));
        const topicElement: DitaElement = entry.loadedTopic.element;
        const title: string = DitaUtils.getTitleTextFromChild(topicElement, true) ?? entry.navtitle ?? "???";
        const id: string = topicElement.getAttribute("id")?.getValue() ?? "";
        entryItem.setAttribute(new XMLAttribute("title", title));
        entryItem.setAttribute(new XMLAttribute("id", id));
        return entryItem;
    }
}

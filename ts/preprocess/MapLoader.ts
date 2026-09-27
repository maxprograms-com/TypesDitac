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

import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

export class MapLoader {
    documents: LoadedDocuments;
    readonly diagnostics: DiagnosticLog;

    constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        this.documents = documents;
        this.diagnostics = diagnostics;
    }

    load(mapPath: string, documents?: LoadedDocuments): LoadedTopic[] {
        if (documents !== undefined) {
            this.documents = documents;
        }
        const map: LoadedDocument = this.documents.load(mapPath);
        const root: DitaElement | undefined = DitaUtils.getRoot(map.document);
        if (root === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocument", "documentHasNoRoot"), [mapPath]));
        }
        this.loadTopics(root, mapPath);
        return this.getAllTopics();
    }

    private loadTopics(element: DitaElement, mapPath: string): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref")) {
                this.loadTopic(child, mapPath);
            }
            this.loadTopics(child, mapPath);
        }
    }

    private loadTopic(topicref: DitaElement, mapPath: string): void {
        let href: string | undefined;
        try {
            href = DitaUtils.doGetLocalTopicURL(topicref, this.diagnostics.i18n);
        } catch (error: unknown) {
            throw new Error(NodeLocation.of(mapPath, topicref) + ": " + (error instanceof Error ? error.message : String(error)));
        }
        if (href === undefined) {
            return;
        }
        const hashIndex: number = href.indexOf("#");
        const hrefPath: string = hashIndex < 0 ? href : href.slice(0, hashIndex);
        const topicPath: string = DitaUtils.resolveDocumentPath(mapPath, hrefPath.split("?", 1)[0]);
        let document: LoadedDocument;
        try {
            document = this.documents.load(topicPath);
        } catch (error: unknown) {
            throw new Error(NodeLocation.of(mapPath, topicref) + ": " + this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                [topicPath, error instanceof Error ? error.message : String(error)]
            ));
        }
        if (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC) {
            throw new Error(NodeLocation.of(mapPath, topicref) + ": " + this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("PreProcessor", "notATopic"),
                [topicPath]
            ));
        }
        const topicId: string | undefined = hashIndex < 0 ? undefined : URIComponent.decode(href.slice(hashIndex + 1).split("/", 1)[0]);
        const topic: LoadedTopic | undefined = topicId === undefined ? document.getFirstTopic() : document.findTopicById(topicId);
        if (topic !== undefined) {
            topic.attachReference(topicref, href);
        }
    }

    private getAllTopics(): LoadedTopic[] {
        const topics: LoadedTopic[] = [];
        for (const document of this.documents.values()) {
            if (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC) {
                continue;
            }
            for (const topic of document.getTopics()) {
                topics.push(topic);
                this.addNestedTopics(topic, topics);
            }
        }
        return topics;
    }

    private addNestedTopics(topic: LoadedTopic, topics: LoadedTopic[]): void {
        for (const nested of topic.getNestedTopics()) {
            topics.push(nested);
            this.addNestedTopics(nested, topics);
        }
    }
}

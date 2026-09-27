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

import { XMLDocument } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { I18n } from "../i18n/I18n.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { LoadedTopic } from "./LoadedTopic.js";

export enum LoadedDocumentType {
    MAP = "map",
    BOOKMAP = "bookmap",
    SUBJECT_SCHEME = "subjectScheme",
    MULTI_TOPIC = "multiTopic",
    TOPIC = "topic",
    DITAVAL = "ditaval"
}

export class LoadedDocument {
    private static readonly XSI_NS_URI: string = "http://www.w3.org/2001/XMLSchema-instance";

    readonly path: string;
    readonly document: XMLDocument;
    readonly type: LoadedDocumentType;
    private readonly properties: Map<string, unknown> = new Map<string, unknown>();
    private topics: LoadedTopic[] | undefined;

    constructor(path: string, document: XMLDocument, i18n: I18n) {
        const root: DitaElement | undefined = DitaUtils.getRoot(document);
        if (root === undefined) {
            throw new Error(i18n.format(i18n.getString("LoadedDocument", "documentHasNoRoot"), [path]));
        }
        this.path = path;
        this.document = document;
        this.type = this.getType(root, i18n);

        // No longer useful.
        const xsiPrefixes: string[] = [];
        for (const attribute of root.getAttributes()) {
            const name: string = attribute.getName();
            if (name.startsWith("xmlns:") && attribute.getValue() === LoadedDocument.XSI_NS_URI) {
                xsiPrefixes.push(name.slice(6));
            }
        }
        for (const prefix of xsiPrefixes) {
            root.removeAttribute(prefix + ":noNamespaceSchemaLocation");
        }
    }

    setProperty(name: string, value: unknown): void {
        if (value === undefined) {
            this.properties.delete(name);
        } else {
            this.properties.set(name, value);
        }
    }

    getProperty(name: string): unknown {
        return this.properties.get(name);
    }

    getTopics(diagnostics?: DiagnosticLog): LoadedTopic[] {
        if (this.topics !== undefined) {
            return this.topics;
        }
        this.topics = [];
        const root: DitaElement | undefined = DitaUtils.getRoot(this.document);
        if (root === undefined) {
            return this.topics;
        }
        if (this.type === LoadedDocumentType.TOPIC) {
            this.topics.push(new LoadedTopic(root, this, undefined, undefined, diagnostics));
            return this.topics;
        }
        if (this.type !== LoadedDocumentType.MULTI_TOPIC) {
            return this.topics;
        }
        for (const child of root.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                this.topics.push(new LoadedTopic(child, this, undefined, undefined, diagnostics));
            }
        }
        return this.topics;
    }

    getTopicCount(): number {
        return this.getTopics().length;
    }

    getFirstTopic(): LoadedTopic | undefined {
        return this.getTopics()[0];
    }

    getSingleTopic(): LoadedTopic | undefined {
        const topics: LoadedTopic[] = this.getTopics();
        if (topics.length !== 1) {
            return undefined;
        }
        return topics[0].getNestedTopics().length > 0 ? undefined : topics[0];
    }

    findTopicById(id: string): LoadedTopic | undefined {
        const topics: LoadedTopic[] = this.getTopics();
        for (const topic of topics) {
            const found: LoadedTopic | undefined = this.findNestedTopic(topic, id);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private getType(root: DitaElement, i18n: I18n): LoadedDocumentType {
        if (root.getName() === "dita") {
            return LoadedDocumentType.MULTI_TOPIC;
        }
        if (root.getName() === "val") {
            return LoadedDocumentType.DITAVAL;
        }
        if (DitaUtils.hasClass(root, "topic/topic")) {
            return LoadedDocumentType.TOPIC;
        }
        if (DitaUtils.hasClass(root, "subjectScheme/subjectScheme")) {
            return LoadedDocumentType.SUBJECT_SCHEME;
        }
        if (DitaUtils.hasClass(root, "bookmap/bookmap")) {
            return LoadedDocumentType.BOOKMAP;
        }
        if (DitaUtils.hasClass(root, "map/map")) {
            return LoadedDocumentType.MAP;
        }
        throw new Error(i18n.format(i18n.getString("LoadedDocument", "unexpectedElement"), [root.getName()]));
    }

    private findNestedTopic(topic: LoadedTopic, id: string): LoadedTopic | undefined {
        if (topic.topicId === id) {
            return topic;
        }
        for (const child of topic.getNestedTopics()) {
            if (DitaUtils.hasClass(child.element, "topic/topic")) {
                const found: LoadedTopic | undefined = this.findNestedTopic(child, id);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    }
}
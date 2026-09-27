/*
 * Portions Copyright (c) 2017-2023 XMLmind Software. All rights reserved.
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

import { ProcessingInstruction, TextNode, XMLAttribute, XMLDocument } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";

export class WrapTopicrefTitle {
    static readonly BASENAME_PREFIX: string = "__TITLE";

    private static counter: number = 0;

    static processMap(map: DitaElement, mapPath: string, documents: LoadedDocuments): void {
        const urlPrefix: string = DitaUtils.resolveDocumentPath(mapPath, WrapTopicrefTitle.BASENAME_PREFIX);
        WrapTopicrefTitle.process(map, urlPrefix, documents);
    }

    private static process(element: DitaElement, urlPrefix: string, documents: LoadedDocuments): void {
        for (const child of element.getChildren()) {
            if (!DitaUtils.hasClass(child, "map/topicref") || WrapTopicrefTitle.isBooklistPlaceholder(child, element)) {
                continue;
            }

            // Raw (untrimmed, "???" not filtered) check.
            const href: string | undefined = child.getAttribute("href")?.getValue();
            if (href === undefined || href.length === 0) {
                const topicDoc: XMLDocument | undefined = WrapTopicrefTitle.createTitleContainer(child);
                if (topicDoc !== undefined) {
                    const topic: DitaElement | undefined = DitaUtils.getRoot(topicDoc);
                    if (topic !== undefined) {
                        const suffix: string = (++WrapTopicrefTitle.counter).toString(36);
                        const path: string = urlPrefix + suffix + ".dita";
                        const synthDoc: LoadedDocument = documents.put(path, topicDoc, false);
                        synthDoc.setProperty("syntheticDocument", true);
                        const id: string | undefined = topic.getAttribute("id")?.getValue();
                        child.setAttribute(new XMLAttribute("href", id === undefined ? path : path + "#" + id));
                    }
                }
            }

            WrapTopicrefTitle.process(child, urlPrefix, documents);
        }
    }

    private static isBooklistPlaceholder(topicref: DitaElement, parent: DitaElement): boolean {
        return DitaUtils.hasClass(parent, "bookmap/booklists") &&
            DitaUtils.getNonEmptyAttribute(topicref, "href") === undefined &&
            DitaUtils.getChildByClass(topicref, "map/topicref") === undefined;
    }

    private static createTitleContainer(topicref: DitaElement): XMLDocument | undefined {
        // We need a navtitle, no matter @locktype.
        let navtitle: DitaElement | undefined;
        let navtitleText: string | undefined;
        let shortdesc: DitaElement | undefined;

        const topicmeta: DitaElement | undefined = DitaUtils.getChildByClass(topicref, "map/topicmeta");
        if (topicmeta !== undefined) {
            navtitle = DitaUtils.getChildByClass(topicmeta, "topic/navtitle");
            shortdesc = DitaUtils.getChildByClass(topicmeta, "map/shortdesc");
        }

        if (navtitle === undefined) {
            const attribute: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "navtitle");
            if (attribute !== undefined) {
                const collapsed: string = DitaUtils.collapseWhitespace(attribute);
                navtitleText = collapsed.length === 0 ? undefined : collapsed;
            }
        }

        if (navtitle === undefined && navtitleText === undefined &&
            DitaUtils.getChildByClass(topicref, "map/topicref") !== undefined) {
            for (const cls of DitaUtils.ROOT_ROLES) {
                if (DitaUtils.hasClass(topicref, cls)) {
                    navtitleText = "__AUTO__" + cls.slice(cls.lastIndexOf("/") + 1) + "__";
                    break;
                }
            }
        }

        if (navtitle === undefined && navtitleText === undefined) {
            return undefined;
        }

        const doc: XMLDocument = new XMLDocument();

        const topic: DitaElement = new DitaElement("topic");
        topic.setAttribute(new XMLAttribute("class", "- topic/topic "));
        topic.setAttribute(new XMLAttribute("id", WrapTopicrefTitle.nextId()));
        doc.setRoot(topic);

        const title: DitaElement = new DitaElement("title");
        title.setAttribute(new XMLAttribute("class", "- topic/title "));
        topic.addElement(title);

        if (navtitle !== undefined) {
            WrapTopicrefTitle.copyChildren(navtitle, title);
        } else {
            title.addString(navtitleText as string);
        }

        if (shortdesc !== undefined) {
            const desc: DitaElement = new DitaElement("shortdesc");
            desc.setAttribute(new XMLAttribute("class", "- map/shortdesc "));
            topic.addElement(desc);

            WrapTopicrefTitle.copyChildren(shortdesc, desc);
        }

        return doc;
    }

    private static copyChildren(source: DitaElement, target: DitaElement): void {
        for (const node of source.getContent()) {
            if (node instanceof DitaElement) {
                target.addElement(DitaUtils.cloneElement(node));
            } else if (node instanceof TextNode) {
                target.addTextNode(new TextNode(node.getValue()));
            } else if (node instanceof ProcessingInstruction) {
                target.addProcessingInstruction(new ProcessingInstruction(node.getTarget(), node.getData()));
            }
        }
    }

    private static nextId(): string {
        return "I_" + (++WrapTopicrefTitle.counter).toString(36) + "_";
    }
}

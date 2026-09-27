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
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { AttributeValues } from "./AttributeValues.js";
import { CascadeMeta } from "./CascadeMeta.js";
import { ConrefPusher } from "./ConrefPusher.js";
import { ConrefIncluder } from "./ConrefIncluder.js";
import { KeySpaces } from "./KeySpaces.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { MaprefIncluder } from "./MaprefIncluder.js";
import { SimplifyTopicrefs } from "./SimplifyTopicrefs.js";

export class MapSimplifier {
    private static readonly KEY_SPACE_ATTRIBUTE: string = "ditac:keySpace";

    readonly documents: LoadedDocuments;
    readonly diagnostics: DiagnosticLog;
    private readonly conrefPusher: ConrefPusher;

    constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.conrefPusher = new ConrefPusher(documents, diagnostics);
    }

    simplify(
        mapDocument: XMLDocument,
        mapPath: string,
        keySpaces?: KeySpaces,
        attrValues?: AttributeValues,
        defaultAttrValues?: AttributeValues
    ): void {
        const root: DitaElement | undefined = DitaUtils.getRoot(mapDocument);
        if (root === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocument", "documentHasNoRoot"), [mapPath]));
        }

        this.simplifyTitle(root);

        const keySpaceCounter: { value: number } = { value: 0 };
        this.addKeySpaces(root, keySpaceCounter);

        const loadedDocs: LoadedDocuments = new LoadedDocuments(this.documents.loader, this.diagnostics, keySpaces);
        loadedDocs.setValidating(this.documents.isValidating());
        loadedDocs.put(mapPath, mapDocument, true);

        this.loadAllMaps(root, mapPath, keySpaceCounter, loadedDocs, attrValues);

        if (attrValues !== undefined && !attrValues.hasAttributes() && defaultAttrValues !== undefined) {
            attrValues.addValues(defaultAttrValues);
        }

        // From here, attrValues is fully initialized.
        const loadedMaps: LoadedDocument[] = [];
        for (const loadedDoc of loadedDocs.values()) {
            if (loadedDoc.type === LoadedDocumentType.MAP || loadedDoc.type === LoadedDocumentType.BOOKMAP) {
                loadedMaps.push(loadedDoc);
                const documentRoot: DitaElement | undefined = DitaUtils.getRoot(loadedDoc.document);
                if (attrValues !== undefined && documentRoot !== undefined) {
                    attrValues.validate(documentRoot, loadedDoc.path, this.diagnostics);
                }
            }
        }

        this.conrefPusher.process(loadedMaps);

        new ConrefIncluder(loadedDocs, this.diagnostics).process(loadedMaps);

        for (const loadedMap of loadedMaps) {
            const documentRoot: DitaElement | undefined = DitaUtils.getRoot(loadedMap.document);
            if (documentRoot !== undefined) {
                CascadeMeta.processMap(documentRoot);
            }
        }

        new MaprefIncluder(loadedDocs, this.diagnostics).process(loadedMaps);

        SimplifyTopicrefs.processMap(root, mapPath, this.diagnostics);
    }

    private simplifyTitle(map: DitaElement): void {
        // Note that bookmap/booktitle specializes topic/title.
        if (DitaUtils.getChildByClass(map, "topic/title") !== undefined) {
            return;
        }
        // Use title attribute if any (found on old maps).
        if (this.getAttribute(map, "title") !== undefined) {
            return;
        }

        // The only way to give a title to a LwDITA map ---
        const topicmeta: DitaElement | undefined = DitaUtils.getChildByClass(map, "map/topicmeta");
        if (topicmeta === undefined) {
            return;
        }
        const navtitle: DitaElement | undefined = DitaUtils.getChildByClass(topicmeta, "topic/navtitle");
        if (navtitle === undefined) {
            return;
        }

        const title: DitaElement = new DitaElement("title");
        title.setAttribute(new XMLAttribute("class", "- topic/title "));
        title.setContent(navtitle.getContent());
        topicmeta.setContent(topicmeta.getContent().filter((node: XMLNode): boolean => node !== navtitle));
        const mapContent: XMLNode[] = map.getContent();
        const contentWithoutEmptyMeta: XMLNode[] = !DitaUtils.hasContent(topicmeta)
            ? mapContent.filter((node: XMLNode): boolean => node !== topicmeta)
            : mapContent;
        map.setContent([title, ...contentWithoutEmptyMeta]);
    }

    private addKeySpaces(map: DitaElement, keySpaceCounter: { value: number }): void {
        // The root element of a root map always defines a key scope,
        // regardless of whether a @keyscope attribute is present.
        map.setAttribute(new XMLAttribute(MapSimplifier.KEY_SPACE_ATTRIBUTE, "0"));
        for (const child of map.getChildren()) {
            this.doAddKeySpaces(child, keySpaceCounter);
        }
    }

    private doAddKeySpaces(element: DitaElement, keySpaceCounter: { value: number }): void {
        if (this.getAttribute(element, "keyscope") !== undefined) {
            element.setAttribute(new XMLAttribute(MapSimplifier.KEY_SPACE_ATTRIBUTE, MapSimplifier.nextKeySpaceId(keySpaceCounter)));
        }
        for (const child of element.getChildren()) {
            this.doAddKeySpaces(child, keySpaceCounter);
        }
    }

    private static nextKeySpaceId(keySpaceCounter: { value: number }): string {
        keySpaceCounter.value++;
        return keySpaceCounter.value.toString(36);
    }

    private loadAllMaps(
        element: DitaElement,
        documentPath: string,
        keySpaceCounter: { value: number },
        loadedDocs: LoadedDocuments,
        attrValues: AttributeValues | undefined
    ): void {
        for (const child of [...element.getChildren()]) {
            let childElement: DitaElement | undefined = child;

            if (DitaUtils.hasClass(child, "map/topicref")) {
                const url: string | undefined = this.getLocalMapURL(child, documentPath);
                if (url !== undefined && loadedDocs.get(url) === undefined) {
                    let loadedDoc: LoadedDocument;
                    try {
                        loadedDoc = loadedDocs.load(url, false);
                    } catch (error) {
                        const message: string = this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                            [url, error instanceof Error ? error.message : String(error)]
                        );
                        this.diagnostics.error(message, NodeLocation.of(documentPath, child));
                        throw new Error(message);
                    }

                    if (loadedDoc.type === LoadedDocumentType.SUBJECT_SCHEME) {
                        loadedDocs.remove(url);
                        const schemeRoot: DitaElement | undefined = DitaUtils.getRoot(loadedDoc.document);
                        if (attrValues !== undefined && schemeRoot !== undefined) {
                            try {
                                attrValues.add(schemeRoot, loadedDoc.path, loadedDocs, this.diagnostics);
                            } catch (error) {
                                const message: string = this.diagnostics.i18n.format(
                                    this.diagnostics.i18n.getString("MapSimplifier", "cannotAddAttributeValues"),
                                    [url, error instanceof Error ? error.message : String(error)]
                                );
                                this.diagnostics.error(message, NodeLocation.of(documentPath, child));
                                throw new Error(message);
                            }
                        }
                        element.setContent(element.getContent().filter((node: XMLNode): boolean => node !== child));
                        childElement = undefined;
                    } else if (loadedDoc.type === LoadedDocumentType.MAP || loadedDoc.type === LoadedDocumentType.BOOKMAP) {
                        const submap: DitaElement | undefined = DitaUtils.getRoot(loadedDoc.document);
                        if (submap !== undefined) {
                            this.doAddKeySpaces(submap, keySpaceCounter);

                            // Consistent with createKeyscopeGroup in MaprefIncluder.
                            if (this.getAttribute(submap, MapSimplifier.KEY_SPACE_ATTRIBUTE) === undefined) {
                                const inherited: string | undefined = this.getAttribute(child, MapSimplifier.KEY_SPACE_ATTRIBUTE);
                                if (inherited !== undefined) {
                                    submap.setAttribute(new XMLAttribute(MapSimplifier.KEY_SPACE_ATTRIBUTE, inherited));
                                }
                            }

                            loadedDocs.put(url, loadedDoc.document, true);

                            this.loadAllMaps(submap, loadedDoc.path, keySpaceCounter, loadedDocs, attrValues);
                        }
                    }
                }
            }

            if (childElement !== undefined) {
                this.loadAllMaps(childElement, documentPath, keySpaceCounter, loadedDocs, attrValues);
            }
        }
    }

    private getLocalMapURL(topicref: DitaElement, documentPath: string): string | undefined {
        const href: string | undefined = this.getAttribute(topicref, "href");
        if (href === undefined) {
            return undefined;
        }

        const scope: string | undefined = DitaUtils.inheritAttribute(topicref, "scope");
        if (scope !== undefined && scope !== "local") {
            return undefined;
        }

        const format: string | undefined = DitaUtils.inheritFormat(topicref, href, scope);
        if (format === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "missingAttribute"), ["format"]),
                NodeLocation.of(documentPath, topicref)
            );
            return undefined;
        }
        if (format !== "ditamap") {
            // Example: ditavalref which has format="ditaval" by default.
            return undefined;
        }

        // LoadedDocuments automatically resolves relative URLs.
        try {
            new URL(href);
        } catch {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "invalidAttribute"), [href, "href"]),
                NodeLocation.of(documentPath, topicref)
            );
            return undefined;
        }
        return href;
    }

    private getAttribute(element: DitaElement, name: string): string | undefined {
        return DitaUtils.getNonEmptyAttribute(element, name);
    }
}

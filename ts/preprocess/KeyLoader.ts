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

import { ProcessingInstruction, XMLAttribute, XMLDocument } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import type { Filters } from "./Filters.js";
import { KeyDefinition } from "./KeyDefinition.js";
import { KeySpace } from "./KeySpace.js";
import { KeySpaces } from "./KeySpaces.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";
import { MapSimplifier } from "./MapSimplifier.js";

interface PendingKeyDefinition {
    readonly keys: string[];
    readonly element: DitaElement;
    readonly keySpace: KeySpace;
    readonly mapPath: string;
    processed: boolean;
}

export class KeyLoader {
    private static readonly SKIPPED_ATTRIBUTES: string[] = ["keys", "processing-role", "id", "class", "keyref", "keyscope"];

    readonly documents: LoadedDocuments;
    readonly diagnostics: DiagnosticLog;
    private filters: Filters | undefined;
    private workingDocuments: LoadedDocuments;

    constructor(diagnostics: DiagnosticLog, documents: LoadedDocuments) {
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.workingDocuments = documents;
    }

    setFilters(filters: Filters | undefined): void {
        this.filters = filters;
    }

    getFilters(): Filters | undefined {
        return this.filters;
    }

    load(mapDocument: XMLDocument, mapPath: string, documents?: LoadedDocuments): KeySpaces {
        this.workingDocuments = documents ?? this.documents;
        const root: DitaElement | undefined = DitaUtils.getRoot(mapDocument);
        if (root === undefined) {
            return new KeySpaces();
        }
        // Keys are collected from a private copy of the map, which is simplified without key spaces.
        const copyDocument: XMLDocument = new XMLDocument();
        copyDocument.setRoot(DitaUtils.cloneElement(root));
        new MapSimplifier(this.documents, this.diagnostics).simplify(copyDocument, mapPath);
        const mapCopy: DitaElement | undefined = DitaUtils.getRoot(copyDocument);
        if (mapCopy === undefined) {
            return new KeySpaces();
        }
        if (this.filters !== undefined) {
            this.filters.filterMap(mapCopy, mapPath);
        }
        const keySpaces: KeySpaces = new KeySpaces();
        const rootKeyscope: string | undefined = this.getAttribute(mapCopy, "keyscope");
        if (rootKeyscope !== undefined) {
            keySpaces.rootKeySpace.initKeyscopeNames(rootKeyscope);
        }
        const pending: PendingKeyDefinition[] = [];
        this.collect(mapCopy, keySpaces.rootKeySpace, keySpaces, mapPath, pending);
        this.resolvePending(pending, keySpaces);
        return keySpaces;
    }

    private resolvePending(pending: PendingKeyDefinition[], keySpaces: KeySpaces): void {
        let previousUnresolved: number = -1;
        for (let pass: number = 0; pass <= 9; pass++) {
            const lastPass: boolean = pass === 9;
            let unresolved: number = 0;
            for (const item of pending) {
                if (item.processed) {
                    continue;
                }
                let skip: boolean = false;
                let add: boolean = true;
                const keyListText: string = item.keys.join(" ");

                if (this.getAttribute(item.element, "conkeyref") !== undefined) {
                    this.diagnostics.warning(
                        this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("KeyLoader", "ignoringAttrInKeydef"),
                            ["conkeyref", keyListText]
                        ),
                        item.mapPath
                    );
                    skip = true;
                }

                const keyref: string | undefined = this.getAttribute(item.element, "keyref");
                if (keyref !== undefined) {
                    if (!keyref.includes("/")) {
                        const target: KeyDefinition | undefined = keySpaces.get(keyref, item.element);
                        if (target !== undefined) {
                            this.setHref(target.element, item.element);
                            this.workingDocuments.addMetadata(target, item.element);
                        } else if (lastPass) {
                            this.diagnostics.warning(
                                this.diagnostics.i18n.format(
                                    this.diagnostics.i18n.getString("KeyLoader", "ignoringAttrInKeydef"),
                                    ["keyref", keyListText]
                                ),
                                item.mapPath
                            );
                            if (this.getAttribute(item.element, "href") === undefined && !DitaUtils.hasContent(item.element)) {
                                skip = true;
                            }
                        } else {
                            add = false;
                            unresolved++;
                        }
                    } else {
                        this.diagnostics.warning(
                            this.diagnostics.i18n.format(
                                this.diagnostics.i18n.getString("KeyLoader", "ignoringAttrInKeydef"),
                                ["keyref", keyListText]
                            ),
                            item.mapPath
                        );
                        if (this.getAttribute(item.element, "href") === undefined && !DitaUtils.hasContent(item.element)) {
                            skip = true;
                        }
                    }
                }

                if (skip) {
                    item.processed = true;
                    this.removeAttribute(item.element, "keys");
                    this.removeAttribute(item.element, "keyref");
                    this.diagnostics.warning(
                        this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("KeyLoader", "skippingKeydef"),
                            [keyListText]
                        ),
                        item.mapPath
                    );
                } else if (add) {
                    this.addDefinition(item);
                }
            }
            if (unresolved === 0) {
                break;
            }
            if (unresolved === previousUnresolved) {
                pass = 8;
            }
            previousUnresolved = unresolved;
        }
    }

    private setHref(from: DitaElement, to: DitaElement): void {
        if (this.getAttribute(to, "href") === undefined && this.getAttribute(from, "href") !== undefined) {
            for (const name of LoadedDocuments.LINKING_ATTRIBUTES) {
                const value: string | undefined = this.getAttribute(from, name);
                if (value === undefined) {
                    this.removeAttribute(to, name);
                } else {
                    to.setAttribute(new XMLAttribute(name, value));
                }
            }
        }
    }

    private addDefinition(item: PendingKeyDefinition): void {
        item.processed = true;
        this.removeAttribute(item.element, "keys");
        this.removeAttribute(item.element, "keyref");
        if (item.keys.every((key: string): boolean => item.keySpace.contains(key))) {
            return;
        }
        const topicref: DitaElement = this.createKeyTopicref(item.element);
        this.normalizeHref(topicref, item.mapPath);
        for (const key of item.keys) {
            if (!item.keySpace.contains(key)) {
                item.keySpace.set(new KeyDefinition(key, topicref, 0, item.mapPath));
                this.addDefinitionToAncestors(item.keySpace, key, topicref, item.mapPath);
            }
        }
    }

    private createKeyTopicref(element: DitaElement): DitaElement {
        const topicref: DitaElement = new DitaElement("topicref");
        topicref.setAttribute(new XMLAttribute("class", "- map/topicref "));
        for (const attribute of element.getAttributes()) {
            const name: string = attribute.getName();
            const value: string = DitaUtils.trimControlAndSpace(attribute.getValue());
            if (!KeyLoader.SKIPPED_ATTRIBUTES.includes(name) && value.length > 0) {
                topicref.setAttribute(new XMLAttribute(name, value));
            }
        }
        const meta: DitaElement | undefined = DitaUtils.getChildByClass(element, "map/topicmeta");
        if (meta !== undefined) {
            topicref.setContent([DitaUtils.cloneElement(meta)]);
        }
        return topicref;
    }

    private normalizeHref(topicref: DitaElement, mapPath: string): void {
        const href: string | undefined = DitaUtils.trimControlAndSpace(topicref.getAttribute("href")?.getValue() ?? "") || undefined;
        if (href === undefined) {
            return;
        }
        try {
            new URL(href);
        } catch {
            return;
        }
        const hashIndex: number = href.indexOf("#");
        const fragment: string | undefined = hashIndex < 0 ? undefined : href.slice(hashIndex + 1);
        if (fragment !== undefined && fragment !== ".") {
            return;
        }
        const scope: string = DitaUtils.trimControlAndSpace(topicref.getAttribute("scope")?.getValue() ?? "") || "local";
        const format: string | undefined = DitaUtils.resolveFormat(
            DitaUtils.trimControlAndSpace(topicref.getAttribute("format")?.getValue() ?? "") || undefined,
            href,
            scope
        );
        if (scope !== "local" || format !== "dita") {
            return;
        }
        const path: string = KeySpaces.getOriginalTopicURL(
            topicref,
            DitaUtils.resolveDocumentPath(mapPath, href.split("?", 1)[0].split("#", 1)[0]),
            mapPath
        );
        let document: LoadedDocument;
        try {
            document = this.workingDocuments.load(path, false);
        } catch (error: unknown) {
            throw new Error(mapPath + ": " + this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                [path, error instanceof Error ? error.message : String(error)]
            ));
        }
        const topic: LoadedTopic | undefined = document.getFirstTopic();
        if (topic === undefined) {
            return;
        }
        topicref.setAttribute(new XMLAttribute("href", URIComponent.setFragment(href, topic.topicId)));
    }

    private addDefinitionToAncestors(
        keySpace: KeySpace,
        key: string,
        element: DitaElement,
        mapPath: string,
        fromChildKeySpace: number = 1
    ): void {
        const parent: KeySpace | undefined = keySpace.getParentKeySpace();
        if (parent === undefined) {
            return;
        }
        for (const scopeName of keySpace.getKeyscopeNames()) {
            const inheritedKey: string = scopeName + "." + key;
            if (!parent.contains(inheritedKey)) {
                parent.set(new KeyDefinition(inheritedKey, element, fromChildKeySpace, mapPath));
            }
            this.addDefinitionToAncestors(parent, inheritedKey, element, mapPath, fromChildKeySpace + 1);
        }
    }

    private collect(
        element: DitaElement,
        current: KeySpace,
        keySpaces: KeySpaces,
        mapPath: string,
        pending: PendingKeyDefinition[]
    ): void {
        const spaceStack: KeySpace[] = [current];
        for (const node of element.getContent()) {
            if (node instanceof ProcessingInstruction) {
                if (node.getTarget() === "ditac-begin-group") {
                    const keySpaceId: string | undefined = this.getPseudoAttribute(node.getData(), "ditac:keySpace");
                    const keyscope: string | undefined = this.getPseudoAttribute(node.getData(), "keyscope");
                    if (keySpaceId === undefined || keyscope === undefined) {
                        throw new Error(
                            mapPath + ": " +
                            this.diagnostics.i18n.format(
                                this.diagnostics.i18n.getString("KeyLoader", "invalidPI"),
                                [node.getTarget(), node.getData()]
                            )
                        );
                    } else {
                        spaceStack.push(this.addKeySpace(keySpaces, keySpaceId, keyscope, spaceStack[spaceStack.length - 1]));
                    }
                } else if (node.getTarget() === "ditac-end-group") {
                    if (spaceStack.length === 1) {
                        this.diagnostics.error(
                            this.diagnostics.i18n.getString("KeyLoader", "unmatchedEndGroupPI"),
                            mapPath
                        );
                    } else {
                        spaceStack.pop();
                    }
                }
                continue;
            }
            if (!(node instanceof DitaElement)) {
                continue;
            }
            const activeSpace: KeySpace = spaceStack[spaceStack.length - 1];
            let childSpace: KeySpace | undefined;
            const keySpaceId: string | undefined = this.getAttribute(node, "ditac:keySpace");
            if (keySpaceId !== undefined) {
                const keyscope: string | undefined = this.getAttribute(node, "keyscope");
                if (keyscope === undefined) {
                    throw new Error(
                        mapPath + ": " +
                        this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("KeyLoader", "missingKeyscope"),
                            [keySpaceId]
                        )
                    );
                }
                childSpace = this.addKeySpace(keySpaces, keySpaceId, keyscope, activeSpace);
            }
            const nodeSpace: KeySpace = childSpace ?? activeSpace;
            const keys: string | undefined = this.getAttribute(node, "keys");
            if (keys !== undefined && DitaUtils.hasClass(node, "map/topicref")) {
                const names: string[] = keys.split(/\s+/).filter((name: string): boolean => name.length > 0);
                pending.push({ keys: names, element: node, keySpace: nodeSpace, mapPath, processed: false });
            }
            this.collect(node, nodeSpace, keySpaces, mapPath, pending);
        }
    }

    private addKeySpace(keySpaces: KeySpaces, keySpaceId: string, keyscope: string, parent: KeySpace): KeySpace {
        let keySpace: KeySpace | undefined = keySpaces.getKeySpaceById(keySpaceId);
        if (keySpace === undefined) {
            keySpace = new KeySpace(keySpaceId, keyscope);
            keySpace.initParentKeySpace(parent);
            parent.addChildKeySpace(keySpace);
            keySpaces.add(keySpace);
        }
        return keySpace;
    }

    private getPseudoAttribute(data: string, name: string): string | undefined {
        const escapedName: string = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match: RegExpMatchArray | null = data.match(new RegExp("(?:^|\\s)" + escapedName + "=\\\"([^\\\"]*)\\\""));
        return match === null || match[1].trim().length === 0 ? undefined : match[1].trim();
    }

    private getAttribute(element: DitaElement, name: string): string | undefined {
        return DitaUtils.getNonEmptyAttribute(element, name);
    }

    private removeAttribute(element: DitaElement, name: string): void {
        element.removeAttribute(name);
    }
}

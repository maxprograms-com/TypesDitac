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
import { I18n } from "../i18n/I18n.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";

interface Ditavalmeta {
    readonly resourcePrefix?: string;
    readonly resourceSuffix?: string;
    readonly keyscopePrefix?: string;
    readonly keyscopeSuffix?: string;
}

interface SplitHref {
    readonly head: string;
    readonly name: string;
    readonly tail: string;
}

export class SimplifyTopicrefs {
    private static readonly KEY_SPACE_ATTRIBUTE: string = "ditac:keySpace";
    private static readonly COPY_OF_ATTRIBUTE: string = "ditac:copyOf";

    private constructor() { }

    static processMap(map: DitaElement, mapPath: string, diagnostics: DiagnosticLog): void {
        const ditavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(map);
        if (ditavalrefs.length > 0) {
            if (ditavalrefs.length > 1) {
                diagnostics.warning(
                    diagnostics.i18n.format(
                        diagnostics.i18n.getString("SimplifyTopicrefs", "severalDitavalrefsInMap"),
                        [mapPath]
                    ),
                    mapPath
                );
                for (let index: number = 1; index < ditavalrefs.length; index++) {
                    SimplifyTopicrefs.removeNode(map, ditavalrefs[index]);
                }
            }

            // Make sure that the ditavalref is found before any other topicref.
            const firstTopicref: DitaElement | undefined = DitaUtils.getChildByClass(map, "map/topicref");
            if (firstTopicref !== undefined && firstTopicref !== ditavalrefs[0]) {
                SimplifyTopicrefs.removeNode(map, ditavalrefs[0]);
                SimplifyTopicrefs.insertBefore(map, ditavalrefs[0], firstTopicref);
            }
        }

        SimplifyTopicrefs.processMap1(map);

        // Starting from here a map branch (including the map itself) directly
        // contains at most a single ditavalref.
        const stack: Ditavalmeta[] = [];
        if (ditavalrefs.length > 0) {
            const pushed: Ditavalmeta | undefined = SimplifyTopicrefs.ditavalmetaFromDitavalref(ditavalrefs[0]);
            if (pushed !== undefined) {
                stack.push(pushed);
            }
        }

        SimplifyTopicrefs.processMap2(map, stack, diagnostics.i18n);
    }

    private static processMap1(tree: DitaElement): void {
        if (DitaUtils.hasClass(tree, "map/topicref")) {
            const ditavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(tree);
            const count: number = ditavalrefs.length;
            if (count > 1) {
                const parent: DitaElement | undefined = tree.getParent();
                if (parent !== undefined) {
                    const siblings: DitaElement[] = parent.getChildren();
                    const nextSibling: DitaElement | undefined = siblings[siblings.indexOf(tree) + 1];

                    for (let index: number = 1; index < count; index++) {
                        const copy: DitaElement = DitaUtils.cloneElement(tree);
                        const copiedDitavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(copy);
                        for (let j: number = 0; j < count; j++) {
                            if (j !== index) {
                                SimplifyTopicrefs.removeNode(copy, copiedDitavalrefs[j]);
                            }
                        }
                        SimplifyTopicrefs.updateKeySpace(copy, "." + (1 + index).toString());
                        SimplifyTopicrefs.insertBefore(parent, copy, nextSibling);
                    }

        // Re-read tree's children on every step: cloning above may have
        // inserted new siblings that themselves need this same pass applied.
                    for (let index: number = 1; index < count; index++) {
                        SimplifyTopicrefs.removeNode(tree, ditavalrefs[index]);
                    }
                }
            }
        }

        let index: number = 0;
        let children: DitaElement[] = tree.getChildren();
        while (index < children.length) {
            SimplifyTopicrefs.processMap1(children[index]);
            index++;
            children = tree.getChildren();
        }
    }

    private static updateKeySpace(tree: DitaElement, suffix: string): void {
        const keySpace: string | undefined = DitaUtils.getNonEmptyAttribute(tree, SimplifyTopicrefs.KEY_SPACE_ATTRIBUTE);
        if (keySpace !== undefined) {
            tree.setAttribute(new XMLAttribute(SimplifyTopicrefs.KEY_SPACE_ATTRIBUTE, keySpace + suffix));
        }
        for (const child of tree.getChildren()) {
            SimplifyTopicrefs.updateKeySpace(child, suffix);
        }
    }

    private static processMap2(tree: DitaElement, stack: Ditavalmeta[], i18n: I18n): void {
        let pushed: Ditavalmeta | undefined;

        if (DitaUtils.hasClass(tree, "map/topicref")) {
            const ditavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(tree);
            if (ditavalrefs.length > 0) {
                pushed = SimplifyTopicrefs.ditavalmetaFromDitavalref(ditavalrefs[0]);
                if (pushed !== undefined) {
                    stack.push(pushed);
                }
            }

            if (stack.length > 0) {
                const href: string | undefined = DitaUtils.getLocalTopicURL(tree, i18n);
                if (href !== undefined) {
                    SimplifyTopicrefs.updateHref(tree, href, stack);
                }

                const keyscope: string | undefined = DitaUtils.getNonEmptyAttribute(tree, "keyscope");
                if (keyscope !== undefined) {
                    SimplifyTopicrefs.updateKeyscope(tree, keyscope, stack);
                }
            }
        }

        for (const child of tree.getChildren()) {
            SimplifyTopicrefs.processMap2(child, stack, i18n);
        }

        if (pushed !== undefined) {
            stack.pop();
        }
    }

    private static updateHref(topicref: DitaElement, href: string, stack: Ditavalmeta[]): void {
        const split: SplitHref | undefined = SimplifyTopicrefs.splitHref(href);
        if (split === undefined) {
            return;
        }
        const head: string = split.head;
        const originalName: string = split.name;
        const tail: string = split.tail;

        let name: string = originalName;
        for (let index: number = stack.length - 1; index >= 0; index--) {
            const item: Ditavalmeta = stack[index];
            name = (item.resourcePrefix ?? "") + name + (item.resourceSuffix ?? "");
        }

        if (name !== originalName) {
            topicref.setAttribute(new XMLAttribute("href", head + DitaUtils.quotePathSegment(name) + tail));
            topicref.setAttribute(new XMLAttribute(SimplifyTopicrefs.COPY_OF_ATTRIBUTE, href));
        }
    }

    private static splitHref(href: string): SplitHref | undefined {
        let pos: number = href.lastIndexOf("#");
        if (pos < 0) {
            pos = href.length - 1;
        }
        pos = href.lastIndexOf(".", pos);
        if (pos < 0) {
            return undefined;
        }
        const tail: string = href.slice(pos); // Starts with '.'.
        let head: string = href.slice(0, pos);

        const slashIndex: number = head.lastIndexOf("/");
        if (slashIndex < 0) {
            return undefined;
        }
        const rawName: string = head.slice(slashIndex + 1);
        head = head.slice(0, slashIndex + 1); // Ends with '/'.

        return { head, name: URIComponent.decode(rawName), tail };
    }

    private static updateKeyscope(topicref: DitaElement, keyscope: string, stack: Ditavalmeta[]): void {
        let value: string = keyscope;
        for (let index: number = stack.length - 1; index >= 0; index--) {
            const item: Ditavalmeta = stack[index];
            value = (item.keyscopePrefix ?? "") + value + (item.keyscopeSuffix ?? "");
        }
        if (value !== keyscope) {
            topicref.setAttribute(new XMLAttribute("keyscope", value));
        }
    }

    private static ditavalmetaFromDitavalref(ditavalref: DitaElement): Ditavalmeta | undefined {
        const container: DitaElement | undefined = DitaUtils.getChildByClass(ditavalref, "ditavalref-d/ditavalmeta");
        if (container === undefined) {
            return undefined;
        }
        const resourcePrefix: string | undefined = SimplifyTopicrefs.getNonEmptyChildText(container, "ditavalref-d/dvrResourcePrefix");
        const resourceSuffix: string | undefined = SimplifyTopicrefs.getNonEmptyChildText(container, "ditavalref-d/dvrResourceSuffix");
        const keyscopePrefix: string | undefined = SimplifyTopicrefs.getNonEmptyChildText(container, "ditavalref-d/dvrKeyscopePrefix");
        const keyscopeSuffix: string | undefined = SimplifyTopicrefs.getNonEmptyChildText(container, "ditavalref-d/dvrKeyscopeSuffix");
        if (resourcePrefix === undefined && resourceSuffix === undefined &&
            keyscopePrefix === undefined && keyscopeSuffix === undefined) {
            return undefined;
        }
        return { resourcePrefix, resourceSuffix, keyscopePrefix, keyscopeSuffix };
    }

    private static getNonEmptyChildText(element: DitaElement, className: string): string | undefined {
        const child: DitaElement | undefined = DitaUtils.getChildByClass(element, className);
        if (child === undefined) {
            return undefined;
        }
        const text: string = child.getText().trim();
        return text.length === 0 ? undefined : text;
    }

    static duplicateTopics(map: DitaElement, i18n: I18n): void {
        const hrefs: Set<string> = new Set<string>();
        const serialNumbers: Map<string, number> = new Map<string, number>();
        SimplifyTopicrefs.duplicateTopicsBranch(map, false, hrefs, serialNumbers, i18n);
    }

    private static duplicateTopicsBranch(
        tree: DitaElement,
        insideReltable: boolean,
        hrefs: Set<string>,
        serialNumbers: Map<string, number>,
        i18n: I18n
    ): void {
        for (const child of tree.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref")) {
                const url: string | undefined = DitaUtils.getLocalTopicURL(child, i18n);
                if (url !== undefined && !insideReltable &&
                    DitaUtils.getNonEmptyAttribute(child, "processing-role") !== "resource-only") {
                    SimplifyTopicrefs.checkHref(child, url, hrefs, serialNumbers);
                }
            }

            const insideReltableBranch: boolean = insideReltable || DitaUtils.hasClass(child, "map/reltable");
            SimplifyTopicrefs.duplicateTopicsBranch(child, insideReltableBranch, hrefs, serialNumbers, i18n);
        }
    }

    private static checkHref(
        topicref: DitaElement,
        url: string,
        hrefs: Set<string>,
        serialNumbers: Map<string, number>
    ): void {
        const hashIndex: number = url.indexOf("#");
        const hasFragment: boolean = hashIndex >= 0;
        const bareUrl: string = hasFragment ? url.slice(0, hashIndex) : url;
        const wildcardUrl: string = bareUrl + "#*";

        if (hrefs.has(url) || (hasFragment && hrefs.has(wildcardUrl))) {
            const split: SplitHref | undefined = SimplifyTopicrefs.splitHref(url);
            if (split === undefined) {
                return;
            }
            const head: string = split.head;
            const name: string = split.name;
            const tail: string = split.tail;

            const copyTo: string | undefined = SimplifyTopicrefs.copyToName(topicref);
            let newName: string;
            if (copyTo !== undefined) {
                newName = copyTo;
            } else {
                const nextSerial: number = serialNumbers.get(bareUrl) ?? 2;
                serialNumbers.set(bareUrl, nextSerial + 1);
                newName = "__" + name + "-" + nextSerial.toString();
            }

            if (newName !== name) {
                topicref.setAttribute(new XMLAttribute("href", head + DitaUtils.quotePathSegment(newName) + tail));
                topicref.setAttribute(new XMLAttribute(SimplifyTopicrefs.COPY_OF_ATTRIBUTE, url));
            }
        } else {
            hrefs.add(url);
            if (hasFragment) {
                // After href="foo.dita#foo", href="foo.dita" must be a copy (but not href="foo.dita#bar").
                hrefs.add(bareUrl);
            } else {
                // After href="foo.dita", any href="foo.dita#..." must be a copy.
                hrefs.add(wildcardUrl);
            }
        }
    }

    private static copyToName(topicref: DitaElement): string | undefined {
        const value: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "copy-to");
        if (value === undefined) {
            return undefined;
        }
        const slashIndex: number = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
        const basename: string = value.slice(slashIndex + 1);
        const extensionIndex: number = basename.lastIndexOf(".");
        const name: string = (extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename).trim();
        return name.length === 0 ? undefined : name;
    }

    static createTopicCopies(tree: DitaElement, mapPath: string, documents: LoadedDocuments, diagnostics: DiagnosticLog): void {
        if (DitaUtils.hasClass(tree, "map/topicref")) {
            SimplifyTopicrefs.createTopicCopy(tree, mapPath, documents, diagnostics);
        }
        for (const child of tree.getChildren()) {
            SimplifyTopicrefs.createTopicCopies(child, mapPath, documents, diagnostics);
        }
    }

    private static createTopicCopy(tree: DitaElement, mapPath: string, documents: LoadedDocuments, diagnostics: DiagnosticLog): void {
        const copyOf: string | undefined = DitaUtils.getNonEmptyAttribute(tree, SimplifyTopicrefs.COPY_OF_ATTRIBUTE);
        if (copyOf === undefined) {
            return;
        }
        tree.removeAttribute(SimplifyTopicrefs.COPY_OF_ATTRIBUTE);
        try {
            new URL(copyOf);
        } catch {
            throw new Error(NodeLocation.of(mapPath, tree) + ": " + diagnostics.i18n.format(
                diagnostics.i18n.getString("Filter", "invalidAttribute"),
                [copyOf, SimplifyTopicrefs.COPY_OF_ATTRIBUTE]
            ));
        }
        const originalPath: string = copyOf.split("#", 2)[0].split("?", 1)[0];

        const href: string | undefined = DitaUtils.getNonEmptyAttribute(tree, "href");
        try {
            new URL(href ?? "");
        } catch {
            throw new Error(NodeLocation.of(mapPath, tree) + ": " + diagnostics.i18n.format(
                diagnostics.i18n.getString("Filter", "invalidAttribute"),
                [href ?? "", "href"]
            ));
        }
        const copyPath: string = (href as string).split("#", 2)[0].split("?", 1)[0];

        let original: LoadedDocument;
        try {
            original = documents.load(originalPath);
        } catch (error) {
            throw new Error(NodeLocation.of(mapPath, tree) + ": " + diagnostics.i18n.format(
                diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                [originalPath, error instanceof Error ? error.message : String(error)]
            ));
        }

        const originalRoot: DitaElement | undefined = DitaUtils.getRoot(original.document);
        if (originalRoot === undefined) {
            return;
        }

        const copy: XMLDocument = new XMLDocument();
        copy.setRoot(DitaUtils.cloneElement(originalRoot));

        // Unprocessed: the copy still needs fresh ids and its own href
        // resolution, applied later alongside every other loaded document.
        const copyDoc: LoadedDocument = documents.put(copyPath, copy, false);
        copyDoc.setProperty("syntheticDocument", originalPath);
    }

    private static insertBefore(parent: DitaElement, newChild: DitaElement, before: DitaElement | undefined): void {
        const content: XMLNode[] = parent.getContent();
        const index: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(index, 0, newChild);
        parent.setContent(content);
    }

    private static removeNode(parent: DitaElement, child: DitaElement): void {
        parent.setContent(parent.getContent().filter((node: XMLNode): boolean => node !== child));
    }
}

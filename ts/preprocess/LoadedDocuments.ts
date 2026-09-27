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
import { ProcessingInstruction, XMLAttribute, XMLDocument, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { CascadeMeta } from "./CascadeMeta.js";
import { LoadDocument } from "./LoadDocument.js";
import { KeyDefinition } from "./KeyDefinition.js";
import { KeySpace } from "./KeySpace.js";
import { KeySpaces } from "./KeySpaces.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";

type DocumentLocation = string | URL;

interface ObjectKeyrefTarget {
    readonly url: string;
    readonly absolute: boolean;
}

export class LoadedDocuments {
    private static readonly SUPPORTED_DITA_VERSIONS: string[] = ["1.0", "1.1", "1.2", "1.3"];

    readonly loader: LoadDocument;
    readonly diagnostics: DiagnosticLog;
    private readonly documents: Map<string, LoadedDocument> = new Map<string, LoadedDocument>();
    private readonly preloadedDocuments: Map<string, LoadedDocument> = new Map<string, LoadedDocument>();
    readonly keySpaces: KeySpaces | undefined;
    private validate: boolean = false;
    private cascadingAttributes: string[] | undefined;

    constructor(loader: LoadDocument, diagnostics: DiagnosticLog, keySpaces?: KeySpaces) {
        this.loader = loader;
        this.diagnostics = diagnostics;
        this.keySpaces = keySpaces;
    }

    setValidating(validate: boolean): void {
        this.validate = validate;
    }

    isValidating(): boolean {
        return this.validate;
    }

    preload(filePath: DocumentLocation): LoadedDocument {
        const canonicalPath: string = this.canonicalize(filePath);
        const existing: LoadedDocument | undefined = this.documents.get(canonicalPath);
        if (existing !== undefined) {
            return existing;
        }
        const preloaded: LoadedDocument | undefined = this.preloadedDocuments.get(canonicalPath);
        if (preloaded !== undefined) {
            return preloaded;
        }
        const document: LoadedDocument = this.createLoadedDocument(canonicalPath, this.loadDocument(canonicalPath, this.validate));
        document.getTopics(this.diagnostics);
        this.preloadedDocuments.set(canonicalPath, document);
        return document;
    }

    private loadDocument(filePath: string, validate: boolean): XMLDocument {
        return this.loader.load(filePath, validate);
    }

    load(filePath: DocumentLocation, process: boolean = true): LoadedDocument {
        const canonicalPath: string = this.canonicalize(filePath);
        const existing: LoadedDocument | undefined = this.documents.get(canonicalPath);
        if (existing !== undefined) {
            return existing;
        }
        const document: LoadedDocument = this.preload(canonicalPath);
        this.preloadedDocuments.delete(canonicalPath);
        this.documents.set(document.path, document);
        if (process) {
            this.processLoadedDocument(document);
        }
        // Not a fatal error.
        this.checkDITAVersion(document);
        return document;
    }

    protected createLoadedDocument(filePath: string, document: XMLDocument): LoadedDocument {
        return new LoadedDocument(filePath, document, this.diagnostics.i18n);
    }

    private checkDITAVersion(document: LoadedDocument): boolean {
        const root: DitaElement | undefined = DitaUtils.getRoot(document.document);
        if (root === undefined) {
            return false;
        }
        let checked: boolean = true;
        if (document.type === LoadedDocumentType.MULTI_TOPIC) {
            for (const child of root.getChildren()) {
                if (!this.checkDITAVersionElement(child, document.path)) {
                    checked = false;
                }
            }
        } else if (document.type !== LoadedDocumentType.DITAVAL) {
            checked = this.checkDITAVersionElement(root, document.path);
        }
        return checked;
    }

    private checkDITAVersionElement(element: DitaElement, documentPath: string): boolean {
        const version: string | undefined = DitaUtils.getNonEmptyAttribute(element, "ditaarch:DITAArchVersion");
        if (version === undefined) {
            this.diagnostics.error(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Filter", "missingAttribute"),
                    ["ditaarch:DITAArchVersion"]
                ),
                NodeLocation.of(documentPath, element)
            );
            return false;
        }
        if (!LoadedDocuments.SUPPORTED_DITA_VERSIONS.includes(version)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("LoadedDocuments", "unsupportedDITAVersion"),
                    [version, LoadedDocuments.SUPPORTED_DITA_VERSIONS.join(", ")]
                ),
                NodeLocation.of(documentPath, element)
            );
        }
        return true;
    }

    put(filePath: DocumentLocation, document: XMLDocument, process: boolean = true): LoadedDocument {
        const canonicalPath: string = this.canonicalize(filePath);
        const loadedDocument: LoadedDocument = this.createLoadedDocument(canonicalPath, document);
        loadedDocument.getTopics(this.diagnostics);
        this.documents.set(canonicalPath, loadedDocument);
        this.preloadedDocuments.delete(canonicalPath);
        if (process) {
            this.processLoadedDocument(loadedDocument);
        }
        return loadedDocument;
    }

    private processLoadedDocument(document: LoadedDocument): void {
        const root: DitaElement | undefined = DitaUtils.getRoot(document.document);
        if (root === undefined) {
            return;
        }
        const keySpaces: KeySpaces | undefined = this.keySpaces;
        if (keySpaces === undefined || document.type === LoadedDocumentType.DITAVAL || document.type === LoadedDocumentType.SUBJECT_SCHEME) {
            this.process(root, document.path);
        } else if (document.type === LoadedDocumentType.TOPIC || document.type === LoadedDocumentType.MULTI_TOPIC) {
            for (const topic of document.getTopics()) {
                this.process(topic.element, document.path, keySpaces, keySpaces.getTopicKeySpace(topic.getHref()));
            }
        } else {
            this.process(root, document.path, keySpaces);
        }
    }

    get(filePath: DocumentLocation): LoadedDocument | undefined {
        return this.documents.get(this.canonicalize(filePath));
    }

    remove(filePath: DocumentLocation): LoadedDocument | undefined {
        const canonicalPath: string = this.canonicalize(filePath);
        const document: LoadedDocument | undefined = this.documents.get(canonicalPath);
        this.documents.delete(canonicalPath);
        this.preloadedDocuments.delete(canonicalPath);
        return document;
    }

    has(filePath: DocumentLocation): boolean {
        return this.documents.has(this.canonicalize(filePath));
    }

    size(): number {
        return this.documents.size;
    }

    values(): IterableIterator<LoadedDocument> {
        return this.documents.values();
    }

    iterator(): IterableIterator<LoadedDocument> {
        return this.documents.values();
    }

    private ensureHasValidId(element: DitaElement, documentPath: string): string {
        const id: string | undefined = DitaUtils.getNonEmptyAttribute(element, "id");
        if (id !== undefined && DitaUtils.isValidId(id)) {
            return id;
        }
        if (id !== undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "invalidAttribute"), [id, "id"]),
                NodeLocation.of(documentPath, element)
            );
        }
        const generated: string = DitaUtils.generateId("I", element);
        element.setAttribute(new XMLAttribute("id", generated));
        return generated;
    }

    private needsId(element: DitaElement): boolean {
        return DitaUtils.hasClass(element, "topic/topic") ||
            DitaUtils.hasClass(element, "topic/section") ||
            DitaUtils.hasClass(element, "topic/table") ||
            DitaUtils.hasClass(element, "topic/fig") ||
            DitaUtils.hasClass(element, "topic/example") ||
            DitaUtils.hasClass(element, "topic/indexterm");
    }

    private process(
        element: DitaElement,
        documentPath: string,
        keySpaces?: KeySpaces,
        topicKeySpace?: KeySpace
    ): void {
        if (this.needsId(element)) {
            this.ensureHasValidId(element, documentPath);
        }
        let currentKeySpace: KeySpace | undefined = topicKeySpace;
        if (DitaUtils.hasClass(element, "topic/topic")) {
            const topicId: string | undefined = DitaUtils.getNonEmptyAttribute(element, "id");
            if (keySpaces !== undefined && topicKeySpace !== undefined && topicId !== undefined) {
                currentKeySpace = keySpaces.getTopicKeySpace(URIComponent.setFragment(documentPath, topicId));
            }
        }
        if (keySpaces !== undefined && currentKeySpace !== undefined) {
            keySpaces.mapElementToKeySpace(element, currentKeySpace);
        }
        for (const attributeName of ["conref", "conrefend", "href"]) {
            this.resolveHref(element, attributeName, documentPath);
        }
        if (keySpaces !== undefined) {
            this.resolveElement(element, keySpaces, documentPath, currentKeySpace);
        }
        if (DitaUtils.hasClass(element, "topic/object")) {
            this.resolveObjectElement(element, keySpaces, documentPath);
        }
        let child: XMLNode | undefined = element.getContent()[0];
        while (child !== undefined) {
            const content: XMLNode[] = element.getContent();
            const childIndex: number = content.indexOf(child);
            const nextChild: XMLNode | undefined = childIndex >= 0 && childIndex + 1 < content.length
                ? content[childIndex + 1]
                : undefined;
            if (child instanceof DitaElement) {
                if (DitaUtils.hasDITANamespace(child)) {
                    this.process(child, documentPath, keySpaces, currentKeySpace);
                }
            } else if (child instanceof ProcessingInstruction && child.getTarget() === "onclick") {
                this.ensureHasValidId(element, documentPath);
            }
            child = nextChild;
        }
    }

    private resolveHref(element: DitaElement, attributeName: string, documentPath: string): void {
        const value: string | undefined = DitaUtils.getNonEmptyAttribute(element, attributeName);
        if (value === undefined) {
            return;
        }
        let href: string = value;
        if (value.startsWith("#")) {
            href = this.getDocumentUrl(documentPath) + this.resolveFragment(value, element, documentPath);
        } else {
            let resolveRelative: boolean = true;
            if (value.startsWith("data:")) {
                resolveRelative = false;
                this.markAbsoluteHref(element, attributeName);
            } else {
                const absolute: string | undefined = this.resolveAbsoluteUri(value);
                if (absolute !== undefined) {
                    href = absolute;
                    resolveRelative = false;
                    this.markAbsoluteHref(element, attributeName);
                }
            }
            if (resolveRelative && attributeName === "href" && !DitaUtils.hasClass(element, "topic/image")) {
                // Do not resolve an href pointing to a peer or external resource.
                const scope: string | undefined = DitaUtils.inheritAttribute(element, "scope");
                if (scope !== undefined && scope !== "local") {
                    resolveRelative = false;
                }
            }
            if (resolveRelative) {
                href = this.createUrl(documentPath, value);
            }
        }
        element.setAttribute(new XMLAttribute(attributeName, href));
    }

    private markAbsoluteHref(element: DitaElement, attributeName: string): void {
        if (attributeName === "href") {
            element.setAttribute(new XMLAttribute("ditac:absoluteHref", "true"));
        }
    }

    private resolveFragment(fragment: string, link: DitaElement, documentPath: string): string {
        if (fragment === "#." || fragment.startsWith("#./")) {
            const topic: DitaElement | undefined = DitaUtils.findAncestorByClass(link, "topic/topic");
            if (topic !== undefined) {
                const topicId: string = this.ensureHasValidId(topic, documentPath);
                return "#" + URIComponent.quoteFragment(topicId) + fragment.slice(2);
            }
        }
        return fragment;
    }

    private getDocumentUrl(documentPath: string): string {
        return /^https?:\/\//i.test(documentPath) ? documentPath : DitaUtils.toFileUrl(documentPath);
    }

    private createUrl(baseLocation: string, spec: string): string {
        if (DitaUtils.hasURIScheme(spec)) {
            return spec;
        }
        if (/^(https?|file):/i.test(baseLocation)) {
            return new URL(spec, baseLocation).toString().replace(/^file:\/\/\//, "file:/");
        }
        const hashIndex: number = spec.indexOf("#");
        const fragment: string = hashIndex < 0 ? "" : spec.slice(hashIndex);
        const withoutFragment: string = hashIndex < 0 ? spec : spec.slice(0, hashIndex);
        const queryIndex: number = withoutFragment.indexOf("?");
        const sourcePath: string = queryIndex < 0 ? withoutFragment : withoutFragment.slice(0, queryIndex);
        const query: string = queryIndex < 0 ? "" : withoutFragment.slice(queryIndex);
        const target: string = sourcePath.length === 0
            ? baseLocation
            : resolve(baseLocation, "..", URIComponent.decode(sourcePath));
        return DitaUtils.toFileUrl(target) + query + fragment;
    }

    private resolveAbsoluteUri(value: string): string | undefined {
        if (!DitaUtils.hasURIScheme(value)) {
            return undefined;
        }
        const catalogUrl: string | undefined = this.resolveCatalogURL(value);
        if (catalogUrl !== undefined) {
            return catalogUrl;
        }
        try {
            return new URL(value).toString();
        } catch {
            return undefined;
        }
    }

    private resolveUri(location: string, documentPath: string): string {
        return this.resolveAbsoluteUri(location) ?? this.createUrl(documentPath, location);
    }

    private resolveCatalogURL(value: string): string | undefined {
        const catalogMatches: Array<string | undefined> = [
            this.loader.catalog.matchSystem(value),
            this.loader.catalog.matchURI(value),
            this.loader.catalog.matchPublic(value)
        ];
        for (const match of catalogMatches) {
            if (match === undefined) {
                continue;
            }
            if (DitaUtils.hasURIScheme(match)) {
                try {
                    return new URL(match).toString();
                } catch {
                    continue;
                }
            }
            return DitaUtils.toFileUrl(resolve(match));
        }
        return undefined;
    }

    private resolveElement(element: DitaElement, keySpaces: KeySpaces, documentPath: string, topicKeySpace: KeySpace | undefined): boolean {
        let resolved: boolean = false;
        const conkeyref: string | undefined = DitaUtils.getNonEmptyAttribute(element, "conkeyref");
        if (conkeyref !== undefined && this.resolveConkeyref(element, conkeyref, keySpaces, documentPath, topicKeySpace)) {
            resolved = true;
        }
        const keyref: string | undefined = DitaUtils.getNonEmptyAttribute(element, "keyref");
        if (keyref !== undefined && this.resolveKeyref(element, keyref, keySpaces, documentPath, topicKeySpace)) {
            resolved = true;
        }
        return resolved;
    }

    private lookupDefinition(keySpaces: KeySpaces, key: string, element: DitaElement, topicKeySpace: KeySpace | undefined): KeyDefinition | undefined {
        return keySpaces.lookupKeyDefinition(topicKeySpace ?? keySpaces.getElementKeySpace(element), key);
    }

    private resolveConkeyref(
        element: DitaElement,
        value: string,
        keySpaces: KeySpaces,
        documentPath: string,
        topicKeySpace: KeySpace | undefined
    ): boolean {
        element.removeAttribute("conkeyref");
        const split: { key: string; id?: string } | undefined = this.splitKeyref("conkeyref", value, element, documentPath);
        if (split === undefined) {
            return false;
        }
        const href: string | undefined = this.lookupDefinition(keySpaces, split.key, element, topicKeySpace)?.getHref();
        if (href === undefined) {
            this.keyrefWarning(element, "conkeyref", value, "conref", documentPath);
            return false;
        }
        element.setAttribute(new XMLAttribute("conref", this.addIdToHref(href, split.id)));
        return true;
    }

    private resolveKeyref(
        element: DitaElement,
        value: string,
        keySpaces: KeySpaces,
        documentPath: string,
        topicKeySpace: KeySpace | undefined
    ): boolean {
        element.removeAttribute("keyref");
        const split: { key: string; id?: string } | undefined = this.splitKeyref("keyref", value, element, documentPath);
        if (split === undefined) {
            return false;
        }
        const definition: KeyDefinition | undefined = this.lookupDefinition(keySpaces, split.key, element, topicKeySpace);
        if (definition === undefined) {
            this.keyrefWarning(element, "keyref", value, "href", documentPath);
            return false;
        }
        const href: string | undefined = this.processKeyref(definition, split.id, element);
        // Remove void elements.
        if (href === undefined && !DitaUtils.hasContent(element)) {
            element.getParent()?.removeChild(element);
        }
        return true;
    }

    private splitKeyref(attributeName: string, value: string, element: DitaElement, documentPath: string): { key: string; id?: string } | undefined {
        const separator: number = value.indexOf("/");
        const key: string = separator < 0 ? value : value.slice(0, separator);
        const id: string | undefined = separator < 0 ? undefined : value.slice(separator + 1);
        if (!DitaUtils.isValidKey(key) || (id !== undefined && !DitaUtils.isValidId(id))) {
            this.diagnostics.error(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "invalidAttribute"), [value, attributeName]),
                NodeLocation.of(documentPath, element)
            );
            return undefined;
        }
        return id === undefined ? { key } : { key, id };
    }

    private keyrefWarning(element: DitaElement, attributeName: string, keyref: string, fallbackAttributeName: string, documentPath: string): void {
        const key: string = DitaUtils.getNonEmptyAttribute(element, fallbackAttributeName) === undefined
            ? "cannotResolveKeyref2"
            : "cannotResolveKeyref";
        this.diagnostics.warning(
            this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("LoadedDocuments", key),
                [attributeName, keyref, fallbackAttributeName]
            ),
            NodeLocation.of(documentPath, element)
        );
    }

    private addIdToHref(href: string, id?: string): string {
        if (id === undefined) {
            return href;
        }
        const quotedId: string = URIComponent.quoteFragment(id);
        return href.includes("#") ? href + "/" + quotedId : href + "#" + quotedId;
    }

    static readonly LINKING_ATTRIBUTES: string[] = ["href", "scope", "format", "ditac:absoluteHref", "ditac:copyOf"];

    private processKeyref(definition: KeyDefinition, id: string | undefined, element: DitaElement): string | undefined {
        let href: string | undefined = definition.getHref();
        if (href !== undefined && definition.getAttribute("linking") === "none" &&
            !DitaUtils.hasClass(element, "abbrev-d/abbreviated-form")) {
            // Not conforming, but an empty abbreviated-form needs content from the glossentry.
            href = undefined;
        }
        if (href !== undefined) {
            href = this.addIdToHref(href, id);
            for (const name of LoadedDocuments.LINKING_ATTRIBUTES) {
                const value: string | undefined = name === "href" ? href : definition.getAttribute(name);
                if (value === undefined) {
                    element.removeAttribute(name);
                } else {
                    element.setAttribute(new XMLAttribute(name, value));
                }
            }
        } else {
            for (const name of LoadedDocuments.LINKING_ATTRIBUTES) {
                element.removeAttribute(name);
            }
        }
        if (DitaUtils.hasClass(element, "map/topicref")) {
            this.addMetadata(definition, element);
        } else {
            this.addContent(definition, element);
        }
        return href;
    }

    private resolveObjectElement(element: DitaElement, keySpaces: KeySpaces | undefined, documentPath: string): void {
        let codebase: string | undefined;
        const codebaseLocation: string | undefined = DitaUtils.getNonEmptyAttribute(element, "codebase");
        if (codebaseLocation !== undefined) {
            // No longer useful.
            element.removeAttribute("codebase");
            codebase = this.resolveUri(codebaseLocation, documentPath);
        }
        if (keySpaces !== undefined) {
            const keyref: string | undefined = DitaUtils.getNonEmptyAttribute(element, "codebasekeyref");
            if (keyref !== undefined) {
                element.removeAttribute("codebasekeyref");
                const resolved: ObjectKeyrefTarget | undefined =
                    this.resolveObjectKeyrefTarget(element, "codebasekeyref", keyref, "codebase", true, keySpaces, documentPath);
                if (resolved !== undefined) {
                    codebase = resolved.url;
                }
            }
        }

        const classid: string | undefined = DitaUtils.getNonEmptyAttribute(element, "classid");
        if (classid !== undefined) {
            if (classid.startsWith("clsid:")) {
                element.setAttribute(new XMLAttribute("ditac:absoluteClassid", "true"));
            } else {
                this.resolveObjectAttributeUrl(element, "classid", classid, codebase, documentPath);
            }
        }
        if (keySpaces !== undefined) {
            this.resolveObjectKeyref(element, "classidkeyref", "classid", keySpaces, documentPath);
        }

        const data: string | undefined = DitaUtils.getNonEmptyAttribute(element, "data");
        if (data !== undefined) {
            this.resolveObjectAttributeUrl(element, "data", data, codebase, documentPath);
        }
        if (keySpaces !== undefined) {
            this.resolveObjectType(element, "datakeyref", keySpaces);
            this.resolveObjectKeyref(element, "datakeyref", "data", keySpaces, documentPath);
        }

        const archive: string | undefined = DitaUtils.getNonEmptyAttribute(element, "archive");
        if (archive !== undefined) {
            this.resolveObjectAttributeUrls(element, "archive", archive, codebase, documentPath);
        }
        if (keySpaces !== undefined) {
            this.resolveObjectKeyrefs(element, "archivekeyrefs", "archive", keySpaces, documentPath);
        }

        for (const param of DitaUtils.findChildrenByClass(element, "topic/param")) {
            this.resolveObjectParam(element, param, keySpaces, documentPath);
        }
    }

    private resolveObjectParam(element: DitaElement, param: DitaElement, keySpaces: KeySpaces | undefined, documentPath: string): void {
        let valuetype: string | undefined = DitaUtils.getNonEmptyAttribute(param, "valuetype");
        if (DitaUtils.getNonEmptyAttribute(param, "keyref") !== undefined) {
            if (valuetype === undefined) {
                valuetype = "ref";
            } else if (valuetype !== "ref") {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocuments", "ignoringAttribute"), ["keyref"]),
                    NodeLocation.of(documentPath, param)
                );
                param.removeAttribute("keyref");
            }
        }
        const name: string | undefined = DitaUtils.getNonEmptyAttribute(param, "name");
        if (valuetype === "ref" || ((name === "source" || name === "track" || name === "poster") && valuetype === undefined)) {
            // Explicit or implicit valuetype=ref.
            param.setAttribute(new XMLAttribute("valuetype", "ref"));
            const location: string | undefined = DitaUtils.getNonEmptyAttribute(param, "value");
            if (location !== undefined) {
                this.resolveObjectAttributeUrl(param, "value", location, undefined, documentPath);
            }
            if (keySpaces !== undefined) {
                this.resolveObjectType(param, "keyref", keySpaces);
                this.resolveObjectKeyref(param, "keyref", "value", keySpaces, documentPath);
            }
        } else if (name === "movie" && valuetype === undefined) {
            // Implicit valuetype=ref depending on the object type.
            const type: string | undefined = DitaUtils.getNonEmptyAttribute(element, "type");
            const location: string | undefined = DitaUtils.getNonEmptyAttribute(param, "value");
            const isRef: boolean = type?.toLowerCase() === "application/x-shockwave-flash" ||
                (location !== undefined && location.toLowerCase().endsWith(".swf"));
            if (isRef) {
                param.setAttribute(new XMLAttribute("valuetype", "ref"));
                param.setAttribute(new XMLAttribute("type", "application/x-shockwave-flash"));
                if (location !== undefined) {
                    this.resolveObjectAttributeUrl(param, "value", location, undefined, documentPath);
                }
                if (keySpaces !== undefined) {
                    this.resolveObjectKeyref(param, "keyref", "value", keySpaces, documentPath);
                }
            }
        }
    }

    private resolveObjectType(element: DitaElement, attributeName: string, keySpaces: KeySpaces): void {
        if (DitaUtils.getNonEmptyAttribute(element, "type") !== undefined) {
            return;
        }
        const keyref: string | undefined = DitaUtils.getNonEmptyAttribute(element, attributeName);
        if (keyref === undefined) {
            return;
        }
        const type: string | undefined = keySpaces.get(keyref, element)?.getAttribute("type");
        if (type !== undefined) {
            element.setAttribute(new XMLAttribute("type", type));
        }
    }

    private resolveObjectKeyref(
        element: DitaElement,
        attributeName: string,
        fallbackAttributeName: string,
        keySpaces: KeySpaces,
        documentPath: string
    ): void {
        const keyref: string | undefined = DitaUtils.getNonEmptyAttribute(element, attributeName);
        if (keyref === undefined) {
            return;
        }
        // No longer useful.
        element.removeAttribute(attributeName);
        const resolved: ObjectKeyrefTarget | undefined =
            this.resolveObjectKeyrefTarget(element, attributeName, keyref, fallbackAttributeName, true, keySpaces, documentPath);
        if (resolved === undefined) {
            return;
        }
        element.setAttribute(new XMLAttribute(fallbackAttributeName, resolved.url));
        const absoluteName: string = "ditac:absolute" + this.capitalize(fallbackAttributeName);
        if (resolved.absolute) {
            element.setAttribute(new XMLAttribute(absoluteName, "true"));
        } else {
            element.removeAttribute(absoluteName);
        }
    }

    private resolveObjectKeyrefs(
        element: DitaElement,
        attributeName: string,
        fallbackAttributeName: string,
        keySpaces: KeySpaces,
        documentPath: string
    ): void {
        const value: string | undefined = DitaUtils.getNonEmptyAttribute(element, attributeName);
        if (value === undefined) {
            return;
        }
        // No longer useful.
        element.removeAttribute(attributeName);
        const urls: string[] = [];
        const absoluteFlags: string[] = [];
        for (const keyref of value.split(/\s+/).filter((item: string): boolean => item.length > 0)) {
            const resolved: ObjectKeyrefTarget | undefined =
                this.resolveObjectKeyrefTarget(element, attributeName, keyref, fallbackAttributeName, false, keySpaces, documentPath);
            if (resolved !== undefined) {
                urls.push(resolved.url);
                absoluteFlags.push(resolved.absolute ? "true" : "false");
            }
        }
        if (urls.length === 0) {
            this.keyrefWarning(element, attributeName, value, fallbackAttributeName, documentPath);
            return;
        }
        element.setAttribute(new XMLAttribute(fallbackAttributeName, urls.join(" ")));
        element.setAttribute(new XMLAttribute("ditac:absolute" + this.capitalize(fallbackAttributeName), absoluteFlags.join(" ")));
    }

    private resolveObjectKeyrefTarget(
        element: DitaElement,
        attributeName: string,
        keyref: string,
        fallbackAttributeName: string,
        warn: boolean,
        keySpaces: KeySpaces,
        documentPath: string
    ): ObjectKeyrefTarget | undefined {
        let target: ObjectKeyrefTarget | undefined;
        const definition: KeyDefinition | undefined = keySpaces.get(keyref, element);
        if (definition !== undefined) {
            const href: string | undefined = definition.getHref();
            const url: string | undefined = href === undefined ? undefined : this.resolveAbsoluteUri(href);
            if (url !== undefined) {
                target = { url, absolute: definition.getAttribute("ditac:absoluteHref") === "true" };
            }
        }
        if (target === undefined && warn) {
            this.keyrefWarning(element, attributeName, keyref, fallbackAttributeName, documentPath);
        }
        return target;
    }

    private resolveObjectAttributeUrls(
        element: DitaElement,
        attributeName: string,
        value: string,
        codebase: string | undefined,
        documentPath: string
    ): void {
        const hrefs: string[] = [];
        const absoluteFlags: string[] = [];
        for (const item of value.split(/\s+/).filter((part: string): boolean => part.length > 0)) {
            const joined: string = this.joinObjectUrl(codebase, item);
            if (joined.startsWith("#")) {
                hrefs.push(this.getDocumentUrl(documentPath) + joined);
                absoluteFlags.push("false");
                continue;
            }
            const absolute: string | undefined = this.resolveAbsoluteUri(joined);
            if (absolute === undefined) {
                hrefs.push(this.createUrl(documentPath, joined));
                absoluteFlags.push("false");
            } else {
                hrefs.push(absolute);
                absoluteFlags.push("true");
            }
        }
        element.setAttribute(new XMLAttribute(attributeName, hrefs.join(" ")));
        element.setAttribute(new XMLAttribute("ditac:absolute" + this.capitalize(attributeName), absoluteFlags.join(" ")));
    }

    private resolveObjectAttributeUrl(
        element: DitaElement,
        attributeName: string,
        value: string,
        codebase: string | undefined,
        documentPath: string
    ): void {
        const joined: string = this.joinObjectUrl(codebase, value);
        let href: string = joined;
        if (joined.startsWith("#")) {
            href = this.getDocumentUrl(documentPath) + joined;
        } else {
            const absolute: string | undefined = this.resolveAbsoluteUri(joined);
            if (absolute === undefined) {
                href = this.createUrl(documentPath, joined);
            } else {
                href = absolute;
                element.setAttribute(new XMLAttribute("ditac:absolute" + this.capitalize(attributeName), "true"));
            }
        }
        element.setAttribute(new XMLAttribute(attributeName, href));
    }

    private joinObjectUrl(codebase: string | undefined, path: string): string {
        if (codebase === undefined) {
            return path;
        }
        try {
            return new URL(path, codebase).toString().replace(/^file:\/\/\//, "file:/");
        } catch {
            return path;
        }
    }

    private capitalize(name: string): string {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    private static readonly VARIABLE_ELEMENTS: string[] = [
        "topic/dt", "topic/cite", "topic/term", "topic/keyword", "topic/ph"
    ];

    private isVariableElement(element: DitaElement): boolean {
        return LoadedDocuments.VARIABLE_ELEMENTS.some((className: string): boolean => DitaUtils.hasClass(element, className));
    }

    private addContent(definition: KeyDefinition, element: DitaElement): void {
        // Get rid of the empty linktext and desc children created by some editors.
        const isLink: boolean = DitaUtils.hasClass(element, "topic/link");
        if (isLink) {
            const linktext: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/linktext");
            if (linktext !== undefined && !DitaUtils.hasContent(linktext)) {
                element.removeChild(linktext);
            }
            const desc: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/desc");
            if (desc !== undefined && !DitaUtils.hasContent(desc)) {
                element.removeChild(desc);
            }
        }
        const meta: DitaElement | undefined = definition.getMeta();
        if (meta === undefined) {
            return;
        }
        if (!DitaUtils.hasContent(element)) {
            if (isLink) {
                const linktext: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/linktext");
                if (linktext !== undefined) {
                    element.addElement(this.copyElement(linktext, "linktext", "topic/linktext"));
                }
            } else if (DitaUtils.hasClass(element, "topic/xref")) {
                const linktext: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/linktext");
                if (linktext !== undefined) {
                    this.copyChildren(linktext, element);
                }
            } else if (this.isVariableElement(element)) {
                let container: DitaElement | undefined;
                const keywords: DitaElement | undefined = DitaUtils.getChildByClass(meta, "topic/keywords");
                if (keywords !== undefined) {
                    container = DitaUtils.getChildByClass(keywords, "topic/keyword");
                }
                if (container === undefined) {
                    container = DitaUtils.getChildByClass(meta, "map/linktext");
                }
                if (container !== undefined) {
                    this.copyChildren(container, element);
                }
            }
        }
        if ((DitaUtils.hasClass(element, "topic/xref") || DitaUtils.hasClass(element, "topic/link")) &&
            DitaUtils.getChildByClass(element, "topic/desc") === undefined) {
            const shortdesc: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/shortdesc");
            if (shortdesc !== undefined) {
                element.addElement(this.copyElement(shortdesc, "desc", "topic/desc"));
            }
        } else if (DitaUtils.hasClass(element, "topic/image") &&
            DitaUtils.getNonEmptyAttribute(element, "alt") === undefined &&
            DitaUtils.getChildByClass(element, "topic/alt") === undefined) {
            const container: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/linktext") ??
                DitaUtils.getChildByClass(meta, "map/shortdesc");
            if (container !== undefined) {
                element.addElement(this.copyElement(container, "alt", "topic/alt"));
            }
        } else if (this.isVariableElement(element)) {
            const shortdesc: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/shortdesc");
            if (shortdesc !== undefined) {
                // May be used as a tooltip.
                const title: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(shortdesc));
                if (title.length > 0) {
                    element.setAttribute(new XMLAttribute("ditac:title", title));
                }
            }
        }
    }

    private copyElement(from: DitaElement, name: string, className: string): DitaElement {
        const source: DitaElement = DitaUtils.cloneElement(from);
        const copy: DitaElement = new DitaElement(name);
        copy.setAttributes(source.getAttributes());
        copy.setAttribute(new XMLAttribute("class", "- " + className + " "));
        copy.setContent(source.getContent());
        return copy;
    }

    private copyChildren(from: DitaElement, to: DitaElement): void {
        const source: DitaElement = DitaUtils.cloneElement(from);
        to.setContent([...to.getContent(), ...source.getContent()]);
    }

    private static readonly BASE_CASCADING_ATTRIBUTES: string[] = [
        "linking", "toc", "print", "search", "type", "translate", "processing-role", "cascade", "rev",
        "audience", "platform", "product", "otherprops", "props", "deliveryTarget"
    ];
    private static readonly FIRST_ADDITIVE_INDEX: number = 9;

    private getCascadingAttributes(topicref: DitaElement): string[] {
        if (this.cascadingAttributes === undefined) {
            const attributes: string[] = [...LoadedDocuments.BASE_CASCADING_ATTRIBUTES];
            const map: DitaElement | undefined = DitaUtils.findAncestorByClass(topicref, "map/map");
            if (map !== undefined) {
                for (const name of DitaUtils.getFilterAttributes(map)) {
                    if (!attributes.includes(name)) {
                        attributes.push(name);
                    }
                }
            }
            this.cascadingAttributes = attributes;
        }
        return this.cascadingAttributes;
    }

    addMetadata(definition: KeyDefinition, topicref: DitaElement): void {
        const sourceMeta: DitaElement | undefined = definition.getMeta();
        if (sourceMeta !== undefined && DitaUtils.getNonEmptyAttribute(sourceMeta, "lockmeta") === "no") {
            return;
        }
        const cascade: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "cascade") ?? definition.getAttribute("cascade");
        const nomerge: boolean = cascade === "nomerge";
        const cascadingAttributes: string[] = this.getCascadingAttributes(topicref);
        for (let index: number = 0; index < cascadingAttributes.length; index++) {
            const name: string = cascadingAttributes[index];
            const cascadedValue: string | undefined = definition.getAttribute(name);
            if (cascadedValue === undefined) {
                continue;
            }
            const localValue: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, name);
            let newValue: string;
            if (localValue === undefined) {
                newValue = cascadedValue;
            } else if (index >= LoadedDocuments.FIRST_ADDITIVE_INDEX) {
                newValue = nomerge ? localValue : this.mergeValues(localValue, cascadedValue);
            } else {
                newValue = localValue;
            }
            if (newValue !== localValue) {
                topicref.setAttribute(new XMLAttribute(name, newValue));
            }
        }
        if (sourceMeta === undefined) {
            return;
        }
        let targetMeta: DitaElement | undefined = DitaUtils.getChildByClass(topicref, "map/topicmeta");
        if (targetMeta === undefined) {
            targetMeta = new DitaElement("topicmeta");
            targetMeta.setAttribute(new XMLAttribute("class", "- map/topicmeta "));
            topicref.setContent([targetMeta, ...topicref.getContent()]);
        }
        for (const child of sourceMeta.getChildren()) {
            const className: string | undefined = CascadeMeta.CASCADED_ELEMENTS.find(
                (name: string): boolean => DitaUtils.hasClass(child, name)
            );
            if (className === undefined) {
                continue;
            }
            const single: boolean = CascadeMeta.SINGLE_ELEMENTS.has(className);
            if (single && DitaUtils.getChildByClass(targetMeta, className) !== undefined) {
                continue;
            }
            const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
                targetMeta,
                CascadeMeta.TOPICMETA_ELEMENTS.indexOf(className),
                CascadeMeta.TOPICMETA_ELEMENTS
            );
            const content: XMLNode[] = targetMeta.getContent();
            const insertionIndex: number = before === undefined ? content.length : content.indexOf(before);
            content.splice(insertionIndex, 0, DitaUtils.cloneElement(child));
            targetMeta.setContent(content);
        }
    }

    private mergeValues(first: string, second: string): string {
        const values: string[] = first.split(/\s+/).filter((value: string): boolean => value.length > 0);
        for (const value of second.split(/\s+/)) {
            if (value.length > 0 && !values.includes(value)) {
                values.push(value);
            }
        }
        return values.join(" ");
    }

    private canonicalize(filePath: DocumentLocation): string {
        if (filePath instanceof URL) {
            if (filePath.protocol === "file:") {
                filePath = fileURLToPath(filePath);
            } else if (filePath.protocol === "http:" || filePath.protocol === "https:") {
                const url: URL = new URL(filePath.toString());
                url.hash = "";
                return url.toString();
            } else {
                throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocuments", "unsupportedURL"), [filePath.toString()]));
            }
        }
        if (/^file:/i.test(filePath)) {
            filePath = fileURLToPath(new URL(filePath));
        }
        if (/^https?:\/\//i.test(filePath)) {
            const url: URL = new URL(filePath);
            url.hash = "";
            return url.toString();
        }
        const withoutFragment: string = filePath.split("#", 1)[0];
        return resolve(withoutFragment.split("?", 1)[0]);
    }
}

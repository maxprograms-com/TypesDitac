/*
 * Portions Copyright (c) 2017-2024 XMLmind Software. All rights reserved.
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

import { XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { AttributeValues } from "./AttributeValues.js";
import { Filter, Flags, Prop, PropValue } from "./Filter.js";
import { LoadDocument } from "./LoadDocument.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";
import { ResourceHandler } from "./ResourceHandler.js";

type ComputedAction = "exclude" | Flags;

const FLAGGABLE_BLOCK_CLASSES: string[] = [
    "topic/topic", "topic/p", "topic/lq", "topic/note", "topic/dl", "topic/ul", "topic/ol",
    "topic/sl", "topic/pre", "topic/lines", "topic/fig", "topic/object", "topic/table",
    "topic/simpletable", "topic/section", "topic/example"
];

const FLAGGABLE_INLINE_CLASSES: string[] = [
    "topic/ph", "topic/term", "topic/xref", "topic/cite", "topic/q", "topic/boolean",
    "topic/state", "topic/keyword", "topic/tm", "topic/image", "topic/foreign"
];

export class Filters {
    readonly diagnostics: DiagnosticLog;
    private readonly documentLoader: LoadDocument;

    private resourceHandler: ResourceHandler | undefined;
    private outDir: string | undefined;
    private attributeValues: AttributeValues | undefined;
    private externalFilter: Filter | undefined;

    private readonly filterStack: Filter[] = [];
    private readonly loadedFilters: Map<string, Filter> = new Map<string, Filter>();

    private filterAttributes: string[] = [];
    private referencedAttributes: string[] = [];

    constructor(diagnostics: DiagnosticLog, documentLoader: LoadDocument) {
        this.diagnostics = diagnostics;
        this.documentLoader = documentLoader;
    }

    setResourceHandler(handler: ResourceHandler | undefined): void {
        this.resourceHandler = handler;
    }

    getResourceHandler(): ResourceHandler | undefined {
        return this.resourceHandler;
    }

    setOutputDirectory(dir: string): void {
        this.outDir = dir;
    }

    setAttributeValues(attributeValues: AttributeValues | undefined): void {
        this.attributeValues = attributeValues;
    }

    getAttributeValues(): AttributeValues | undefined {
        return this.attributeValues;
    }

    setExternalFilter(filter: Filter | undefined): void {
        this.externalFilter = filter;
    }

    getExternalFilter(): Filter | undefined {
        return this.externalFilter;
    }

    private pushFilterFromRef(ditavalref: DitaElement, basePath: string): Filter | undefined {
        const href: string | undefined = ditavalref.getAttribute("href")?.getValue().trim();
        if (href === undefined || href.length === 0) {
            return undefined;
        }
        const path: string = DitaUtils.resolveDocumentPath(basePath, href.split("#", 1)[0]);
        let filter: Filter | undefined = this.loadedFilters.get(path);
        if (filter === undefined) {
            try {
                const loaded: LoadedDocument = new LoadedDocument(path, this.documentLoader.load(path, false), this.diagnostics.i18n);
                const root: DitaElement | undefined = DitaUtils.getRoot(loaded.document);
                if (root === undefined) {
                    throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocument", "documentHasNoRoot"), [path]));
                }
                filter = new Filter(root, path, this.diagnostics.i18n);
            } catch (error: unknown) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                        [path, error instanceof Error ? error.message : String(error)]
                    ),
                    basePath
                );
            }
            if (filter !== undefined) {
                this.loadedFilters.set(path, filter);
                this.attributeValues?.validate(filter, this.diagnostics);
            }
        }
        if (filter !== undefined) {
            this.pushFilter(filter);
        }
        return filter;
    }

    private pushFilter(filter: Filter): void {
        this.filterStack.push(filter);
        this.updateStackState();
    }

    private popFilter(): void {
        this.filterStack.pop();
        this.updateStackState();
    }

    private updateStackState(): void {
        const allAttrs: Set<string> = new Set<string>();
        for (const filter of this.filterStack) {
            for (const prop of filter.getProps()) {
                if (prop.attribute !== undefined) {
                    allAttrs.add(prop.attribute);
                }
            }
        }
        this.referencedAttributes = [...allAttrs];
    }

    validateLoadedFilters(): void {
        if (this.attributeValues === undefined) {
            return;
        }
        for (const filter of this.loadedFilters.values()) {
            this.attributeValues.validate(filter, this.diagnostics);
        }
    }

    filterMap(mapElement: DitaElement, mapPath: string): void {
        this.filterAttributes = DitaUtils.getFilterAttributes(mapElement);

        if (this.externalFilter !== undefined) {
            this.pushFilter(this.externalFilter);
        }

        const ditavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(mapElement);
        const filter: Filter | undefined = ditavalrefs.length > 0
            ? this.pushFilterFromRef(ditavalrefs[0], mapPath)
            : undefined;

        this.filterMap1(mapElement, mapPath);
        this.filterMap2(mapElement, mapPath);

        if (filter !== undefined) {
            this.popFilter();
        }
        if (this.externalFilter !== undefined) {
            this.popFilter();
        }
    }

    private filterMap1(element: DitaElement, mapPath: string): void {
        for (const child of [...element.getChildren()]) {
            if (DitaUtils.isDitavalref(child)) {
                continue;
            }
            const isTopicref: boolean = DitaUtils.hasClass(child, "map/topicref");
            const ditavalrefs: DitaElement[] = isTopicref ? DitaUtils.findDitavalrefs(child) : [];
            const filter: Filter | undefined = ditavalrefs.length > 0
                ? this.pushFilterFromRef(ditavalrefs[0], mapPath)
                : undefined;

            let filterContent: boolean = false;
            let removeHref: boolean = false;

            if (DitaUtils.hasClass(child, "map/topicmeta") || DitaUtils.hasClass(child, "topic/title")) {
                filterContent = true;
            } else if (isTopicref) {
                const href: string | undefined = child.getAttribute("href")?.getValue();
                if (href !== undefined && href.length > 0) {
                    removeHref = this.computeAction(child) === "exclude";
                }
            }

            if (filterContent) {
                this.filterTopicContent(child, false);
            } else {
                if (removeHref) {
                    child.removeAttribute("href");
                }
                this.filterMap1(child, mapPath);
            }

            if (filter !== undefined) {
                this.popFilter();
            }
        }
    }

    private filterMap2(element: DitaElement, mapPath: string): void {
        for (const child of [...element.getChildren()]) {
            if (DitaUtils.isDitavalref(child)) {
                continue;
            }
            const isTopicref: boolean = DitaUtils.hasClass(child, "map/topicref");
            const ditavalrefs: DitaElement[] = isTopicref ? DitaUtils.findDitavalrefs(child) : [];
            const filter: Filter | undefined = ditavalrefs.length > 0
                ? this.pushFilterFromRef(ditavalrefs[0], mapPath)
                : undefined;

            this.filterMap2(child, mapPath);

            if (isTopicref && this.computeAction(child) === "exclude" &&
                child.getChildren().every((nested: DitaElement): boolean => !DitaUtils.hasClass(nested, "map/topicref"))) {
                child.getParent()?.removeChild(child);
            }

            if (filter !== undefined) {
                this.popFilter();
            }
        }
    }

    private filterTopicContent(element: DitaElement, allowFlagging: boolean): void {
        for (const child of [...element.getContent()]) {
            if (!(child instanceof DitaElement)) {
                continue;
            }
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            const action: ComputedAction | undefined = this.computeAction(child);
            if (action === undefined) {
                this.filterTopicContent(child, allowFlagging);
            } else if (action === "exclude") {
                if (DitaUtils.hasClass(child, "map/relcell")) {
                    child.setContent([]);
                } else {
                    child.getParent()?.removeChild(child);
                }
            } else {
                if (allowFlagging) {
                    const parent: DitaElement | undefined = child.getParent();
                    if (parent !== undefined) {
                        const content: XMLNode[] = parent.getContent();
                        const index: number = content.indexOf(child);
                        const flagged: DitaElement = this.flagElement(child, action);
                        if (index >= 0) {
                            content[index] = flagged;
                            parent.setContent(content);
                        }
                    }
                }
                this.filterTopicContent(child, allowFlagging);
            }
        }
    }

    private computeAction(element: DitaElement): ComputedAction | undefined {
        let action: ComputedAction | undefined;
        let hasFlags: boolean = false;
        const flags: Flags = new Flags();

        const elemName: string = element.getName();
        for (const attribute of element.getAttributes()) {
            const attrName: string = attribute.getName();
            const isFilterAttribute: boolean = this.filterAttributes.includes(attrName);
            if (!isFilterAttribute && !this.referencedAttributes.includes(attrName)) {
                continue;
            }
            const attrValue: string = attribute.getValue().trim();
            if (attrValue.length === 0) {
                continue;
            }
            const result: { excluded: boolean; flagged: boolean } =
                this.computeAttributeAction(attrName, attrValue, elemName, isFilterAttribute, flags);
            if (result.flagged) {
                hasFlags = true;
            }
            if (result.excluded) {
                action = "exclude";
                break;
            }
        }

        if (action === undefined && hasFlags) {
            action = flags;
        }
        return action;
    }

    private computeAttributeAction(
        attrName: string,
        attrValue: string,
        elemName: string,
        isFilterAttribute: boolean,
        flags: Flags
    ): { excluded: boolean; flagged: boolean } {
        const keyToValues: Map<string, string[]> = this.parseAttributeValue(attrValue, attrName);
        let flagged: boolean = false;

        for (const [key, values] of keyToValues) {
            let excludeCount: number = 0;
            for (const value of values) {
                let excluded: boolean = false;
                for (const filter of this.filterStack) {
                    const propValue: PropValue | undefined =
                        this.findPropValue(filter.getProps(), key, value, attrName, elemName, isFilterAttribute);
                    if (propValue !== undefined) {
                        if (propValue.action === "exclude") {
                            excluded = true;
                        } else if (propValue.action === "flag" && propValue.flags !== undefined) {
                            flags.set(propValue.flags);
                            flagged = true;
                        }
                    }
                }
                if (excluded) {
                    excludeCount++;
                }
            }
            if (excludeCount === values.length && values.length > 0) {
                return { excluded: true, flagged };
            }
        }

        return { excluded: false, flagged };
    }

    private parseAttributeValue(attrValue: string, attrName: string): Map<string, string[]> {
        const keyToValues: Map<string, string[]> = new Map<string, string[]>();

        if (attrValue.includes("(") &&
            ["audience", "product", "platform", "otherprops"].includes(attrName)) {
            const tokens: string[] = attrValue.replace(/\(/g, " ( ").replace(/\)/g, " ) ")
                .split(/\s+/).filter((token: string): boolean => token.length > 0);
            let group: string = attrName;
            for (let index: number = 0; index < tokens.length; index++) {
                const token: string = tokens[index];
                if (token === "(") {
                    continue;
                } else if (token === ")") {
                    group = attrName;
                } else if (index + 1 < tokens.length && tokens[index + 1] === "(") {
                    group = token;
                } else {
                    const values: string[] = keyToValues.get(group) ?? [];
                    if (!values.includes(token)) {
                        values.push(token);
                    }
                    keyToValues.set(group, values);
                }
            }
            return keyToValues;
        }

        const tokens: string[] = attrValue.split(/\s+/).filter((token: string): boolean => token.length > 0);
        if (tokens.length > 0) {
            keyToValues.set(attrName, tokens);
        }
        return keyToValues;
    }

    private findPropValue(
        props: readonly Prop[],
        key: string,
        value: string,
        attrName: string,
        elemName: string,
        isFilterAttribute: boolean
    ): PropValue | undefined {
        if (key !== attrName) {
            for (const prop of props) {
                if (key === prop.attribute) {
                    const propValue: PropValue | undefined = prop.findValue(value);
                    if (propValue !== undefined) {
                        return propValue;
                    }
                }
            }

            for (const prop of props) {
                if (attrName === prop.attribute) {
                    let propValue: PropValue | undefined = prop.findValue(value);
                    if (propValue !== undefined) {
                        return propValue;
                    }
                    if (this.attributeValues !== undefined) {
                        propValue = prop.findValue(value, key, this.attributeValues, attrName, elemName);
                        if (propValue !== undefined) {
                            return propValue;
                        }
                    }
                }
            }

            for (const prop of props) {
                if (attrName === prop.attribute) {
                    let propValue: PropValue | undefined = prop.findValue(key);
                    if (propValue !== undefined) {
                        return propValue;
                    }
                    if (this.attributeValues !== undefined) {
                        propValue = prop.findValue(key, undefined, this.attributeValues, attrName, elemName);
                        if (propValue !== undefined) {
                            return propValue;
                        }
                    }
                }
            }

            for (const prop of props) {
                if (key === prop.attribute) {
                    const propValue: PropValue | undefined = prop.getWildcardValue();
                    if (propValue !== undefined) {
                        return propValue;
                    }
                }
            }
        } else {
            for (const prop of props) {
                if (attrName === prop.attribute) {
                    let propValue: PropValue | undefined = prop.findValue(value);
                    if (propValue !== undefined) {
                        return propValue;
                    }
                    if (this.attributeValues !== undefined) {
                        propValue = prop.findValue(value, undefined, this.attributeValues, attrName, elemName);
                        if (propValue !== undefined) {
                            return propValue;
                        }
                    }
                }
            }
        }

        for (const prop of props) {
            if (attrName === prop.attribute) {
                const propValue: PropValue | undefined = prop.getWildcardValue();
                if (propValue !== undefined) {
                    return propValue;
                }
            }
        }

        if (isFilterAttribute) {
            for (const prop of props) {
                if (prop.attribute === undefined) {
                    const propValue: PropValue | undefined = prop.findValue(value);
                    if (propValue !== undefined) {
                        return propValue;
                    }
                }
            }
            for (const prop of props) {
                if (prop.attribute === undefined) {
                    const propValue: PropValue | undefined = prop.getWildcardValue();
                    if (propValue !== undefined) {
                        return propValue;
                    }
                }
            }
        }

        return undefined;
    }

    flagElement(flaggable: DitaElement, flags: Flags): DitaElement {
        let element: DitaElement;
        let attrPrefix: string = "";
        if (FLAGGABLE_BLOCK_CLASSES.some((className: string): boolean => DitaUtils.hasClass(flaggable, className))) {
            element = new DitaElement("ditac:flags-block");
            element.addElement(flaggable);
        } else if (FLAGGABLE_INLINE_CLASSES.some((className: string): boolean => DitaUtils.hasClass(flaggable, className))) {
            element = new DitaElement("ditac:flags-inline");
            element.addElement(flaggable);
        } else {
            element = flaggable;
            attrPrefix = "ditac:flags-";
        }

        if (flags.color !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "color", flags.color));
        }
        if (flags.backgroundColor !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "background-color", flags.backgroundColor));
        }
        if (flags.fontWeight !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "font-weight", flags.fontWeight));
        }
        if (flags.fontStyle !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "font-style", flags.fontStyle));
        }
        if (flags.textDecoration !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "text-decoration", flags.textDecoration));
        }
        if (flags.changeBarProps !== undefined) {
            for (let i: number = 0; i + 1 < flags.changeBarProps.length; i += 2) {
                element.setAttribute(new XMLAttribute(attrPrefix + flags.changeBarProps[i], flags.changeBarProps[i + 1]));
            }
        }
        if (flags.startImage !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "startImage", this.flagImagePath(flags.startImage, flags.isAbsoluteStartImageURL)));
        }
        if (flags.startText !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "startText", flags.startText));
        }
        if (flags.endImage !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "endImage", this.flagImagePath(flags.endImage, flags.isAbsoluteEndImageURL)));
        }
        if (flags.endText !== undefined) {
            element.setAttribute(new XMLAttribute(attrPrefix + "endText", flags.endText));
        }

        return element;
    }

    private flagImagePath(url: string, isAbsolute: boolean): string {
        if (!isAbsolute && this.resourceHandler !== undefined && this.outDir !== undefined) {
            try {
                const path: string | undefined = this.resourceHandler.handleResource(url, true, this.outDir);
                if (path !== undefined) {
                    return path;
                }
            } catch (error: unknown) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Filter", "cannotProcessResource"),
                        [url, error instanceof Error ? error.message : String(error)]
                    )
                );
            }
        }
        return DitaUtils.hasURIScheme(url) ? url : DitaUtils.toFileUrl(url);
    }

    filterTopics(mapElement: DitaElement, mapPath: string, documents: LoadedDocuments): void {
        if (this.externalFilter !== undefined) {
            this.pushFilter(this.externalFilter);
        }

        const ditavalrefs: DitaElement[] = DitaUtils.findDitavalrefs(mapElement);
        const filter: Filter | undefined = ditavalrefs.length > 0
            ? this.pushFilterFromRef(ditavalrefs[0], mapPath)
            : undefined;

        this.doFilterTopics(mapElement, mapPath, documents);

        if (filter !== undefined) {
            this.popFilter();
        }
        if (this.externalFilter !== undefined) {
            this.popFilter();
        }
    }

    private doFilterTopics(element: DitaElement, mapPath: string, documents: LoadedDocuments): void {
        for (const child of [...element.getChildren()]) {
            if (DitaUtils.isDitavalref(child) || DitaUtils.hasClass(child, "map/reltable")) {
                continue;
            }
            const isTopicref: boolean = DitaUtils.hasClass(child, "map/topicref");
            const ditavalrefs: DitaElement[] = isTopicref ? DitaUtils.findDitavalrefs(child) : [];
            const filter: Filter | undefined = ditavalrefs.length > 0
                ? this.pushFilterFromRef(ditavalrefs[0], mapPath)
                : undefined;

            if (isTopicref) {
                this.filterReferencedTopics(child, documents);
            }
            this.doFilterTopics(child, mapPath, documents);

            if (filter !== undefined) {
                this.popFilter();
            }
        }
    }

    private filterReferencedTopics(topicref: DitaElement, documents: LoadedDocuments): void {
        const href: string | undefined = topicref.getAttribute("href")?.getValue().trim();
        if (href === undefined || href.length === 0) {
            return;
        }
        const parts: string[] = href.split("#", 2);
        const topicId: string | undefined = parts.length > 1 ? URIComponent.decode(parts[1].split("/", 1)[0]) : undefined;
        const path: string = parts[0];

        const loadedDoc: LoadedDocument | undefined = documents.get(path);
        if (loadedDoc === undefined ||
            (loadedDoc.type !== LoadedDocumentType.MULTI_TOPIC && loadedDoc.type !== LoadedDocumentType.TOPIC)) {
            return;
        }

        let select: "topic" | "branch" | "document" = topicId === undefined ? "document" : "topic";
        const chunk: string | undefined = topicref.getAttribute("chunk")?.getValue();
        if (chunk !== undefined) {
            if (chunk.includes("select-document")) {
                select = "document";
            } else if (chunk.includes("select-branch")) {
                select = "branch";
            } else if (chunk.includes("select-topic")) {
                select = "topic";
            }
        }

        let loadedTopic: LoadedTopic | undefined;
        if (topicId !== undefined) {
            loadedTopic = loadedDoc.findTopicById(topicId);
            if (loadedTopic === undefined) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Chunker", "topicNotFound"),
                        [topicId, loadedDoc.path]
                    ),
                    loadedDoc.path
                );
            }
        } else {
            loadedTopic = loadedDoc.getFirstTopic();
        }
        if (loadedTopic === undefined) {
            return;
        }

        if (loadedDoc.getSingleTopic() !== undefined) {
            this.filterTopic(loadedTopic);
        } else {
            switch (select) {
                case "topic":
                    this.filterTopic(loadedTopic);
                    break;
                case "branch":
                    this.filterBranch(loadedTopic);
                    break;
                case "document":
                    this.filterDocument(loadedDoc);
                    break;
            }
        }
    }

    private filterTopic(loadedTopic: LoadedTopic): void {
        this.filterAttributes = DitaUtils.getFilterAttributes(loadedTopic.element);

        const action: ComputedAction | undefined = this.computeAction(loadedTopic.element);
        if (action === "exclude") {
            loadedTopic.setExcluded(true);
        } else if (action !== undefined) {
            loadedTopic.setFlags(action.copy());
        }

        this.filterTopicContent(loadedTopic.element, true);
    }

    private filterBranch(loadedTopic: LoadedTopic): void {
        this.filterTopic(loadedTopic);
        for (const nestedTopic of loadedTopic.getNestedTopics()) {
            this.filterBranch(nestedTopic);
        }
    }

    private filterDocument(loadedDoc: LoadedDocument): void {
        for (const loadedTopic of loadedDoc.getTopics()) {
            this.filterBranch(loadedTopic);
        }
    }

}

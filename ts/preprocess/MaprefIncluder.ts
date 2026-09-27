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

import { ProcessingInstruction, XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { CascadeMeta } from "./CascadeMeta.js";
import { Incl, Includer, InclusionException } from "./Includer.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";

export class MaprefIncl extends Incl {
    readonly targetPath: string;
    readonly targetId: string | undefined;
    readonly ditavalrefs: DitaElement[];

    constructor(directiveElement: DitaElement, sourcePath: string, href: string, ditavalrefs: DitaElement[]) {
        super(directiveElement, sourcePath);
        const hashIndex: number = href.indexOf("#");
        if (hashIndex < 0) {
            this.targetPath = href;
            this.targetId = undefined;
        } else {
            this.targetPath = href.slice(0, hashIndex);
            this.targetId = URIComponent.decode(href.slice(hashIndex + 1));
        }
        this.ditavalrefs = ditavalrefs;
    }

    getMaprefHref(): string {
        return this.targetId === undefined
            ? this.targetPath
            : URIComponent.setFragment(this.targetPath, this.targetId);
    }
}

export class MaprefIncluder extends Includer {
    private static readonly KEY_SPACE_ATTRIBUTE: string = "ditac:keySpace";
    private static readonly BEGIN_GROUP_PI_TARGET: string = "ditac-begin-group";
    private static readonly END_GROUP_PI_TARGET: string = "ditac-end-group";

    constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        super(documents, diagnostics);
    }

    protected detectInclusion(element: DitaElement, sourcePath: string): Incl | undefined {
        if (!DitaUtils.hasClass(element, "map/topicref")) {
            return undefined;
        }
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
        if (href === undefined) {
            return undefined;
        }
        const scope: string = DitaUtils.getScope(element, href);
        if (scope !== "local") {
            return undefined;
        }
        const format: string | undefined = DitaUtils.getFormat(element, href, scope);
        if (format === undefined) {
            this.reportWarning(
                element,
                sourcePath,
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Filter", "missingAttribute"),
                    ["format"]
                )
            );
            return undefined;
        }
        if (format !== "ditamap") {
            return undefined;
        }
        const type: string | undefined = DitaUtils.getNonEmptyAttribute(element, "type");
        if (type === "scheme") {
            return undefined;
        }
        try {
            new URL(href);
        } catch {
            this.reportWarning(
                element,
                sourcePath,
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                    [href, "href"]
                )
            );
            return undefined;
        }
        return new MaprefIncl(element, sourcePath, href, DitaUtils.findDitavalrefs(element));
    }

    protected fetchIncluded(incl: Incl): void {
        const maprefIncl: MaprefIncl = incl as MaprefIncl;
        const targetDoc: LoadedDocument = this.fetchDoc(maprefIncl.targetPath);
        const rootElement: DitaElement | undefined = DitaUtils.getRoot(targetDoc.document);
        if (rootElement === undefined || !DitaUtils.hasClass(rootElement, "map/map")) {
            throw new InclusionException(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("MaprefIncluder", "notAMap"), [maprefIncl.targetPath]));
        }
        if (DitaUtils.hasClass(rootElement, "subjectScheme/subjectScheme")) {
            maprefIncl.replacementNodes = undefined;
            maprefIncl.appendedNodes = undefined;
            return;
        }

        const target: DitaElement | undefined = maprefIncl.targetId === undefined
            ? rootElement
            : DitaUtils.findById(rootElement, maprefIncl.targetId);
        if (target === undefined) {
            throw new InclusionException(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("ConrefIncluder", "targetNotFound"), [maprefIncl.getMaprefHref(), "href"]));
        }

        this.copyTarget(target, maprefIncl);
        if (maprefIncl.ditavalrefs.length > 0) {
            this.insertDitavalrefs(maprefIncl);
        }
        this.createKeyscopeGroup(target, maprefIncl);
    }

    private copyTarget(mapOrTopicref: DitaElement, incl: MaprefIncl): void {
        const directiveElement: DitaElement = incl.directiveElement;

        if (DitaUtils.hasClass(mapOrTopicref, "map/map")) {
            const replacement: XMLNode[] = [];
            const appended: XMLNode[] = [];
            const children: XMLNode[] = mapOrTopicref.getContent();
            for (let index: number = 0; index < children.length; index++) {
                const child: XMLNode = children[index];
                if (child instanceof ProcessingInstruction) {
                    const piTarget: string = child.getTarget();
                    const isBeginGroup: boolean = piTarget === MaprefIncluder.BEGIN_GROUP_PI_TARGET;
                    const isEndGroup: boolean = piTarget === MaprefIncluder.END_GROUP_PI_TARGET;
                    if (isBeginGroup || isEndGroup) {
                        const sibling: DitaElement | undefined = isBeginGroup
                            ? this.getNextElementIn(children, index)
                            : this.getPreviousElementIn(children, index);
                        const goesToAppended: boolean = sibling !== undefined && DitaUtils.hasClass(sibling, "map/reltable");
                        const clone: ProcessingInstruction = new ProcessingInstruction(child.getTarget(), child.getData());
                        (goesToAppended ? appended : replacement).push(clone);
                    }
                } else if (child instanceof DitaElement) {
                    if (DitaUtils.hasClass(child, "map/topicref") &&
                        !DitaUtils.hasClass(child, "ditavalref-d/ditavalref") &&
                        !DitaUtils.hasClass(child, "bookmap/frontmatter") &&
                        !DitaUtils.hasClass(child, "bookmap/backmatter")) {
                        replacement.push(this.copyTopicrefAs(child, directiveElement));
                    } else if (DitaUtils.hasClass(child, "map/reltable")) {
                        appended.push(this.cloneElement(child));
                    }
                }
            }
            if (replacement.length > 0) {
                incl.replacementNodes = replacement;
            }
            if (appended.length > 0) {
                incl.appendedNodes = appended;
            }
        } else {
            incl.replacementNodes = [this.copyTopicrefAs(mapOrTopicref, directiveElement)];
        }

        if (incl.replacementNodes !== undefined) {
            CascadeMeta.processMapref(directiveElement, this.onlyElements(incl.replacementNodes));
        }
        if (incl.appendedNodes !== undefined) {
            CascadeMeta.processMapref(directiveElement, this.onlyElements(incl.appendedNodes));
        }
    }

    private onlyElements(nodes: XMLNode[]): DitaElement[] {
        const elements: DitaElement[] = [];
        for (const node of nodes) {
            if (node instanceof DitaElement) {
                elements.push(node);
            }
        }
        return elements;
    }

    private getNextElementIn(nodes: XMLNode[], index: number): DitaElement | undefined {
        for (let i: number = index + 1; i < nodes.length; i++) {
            if (nodes[i] instanceof DitaElement) {
                return nodes[i] as DitaElement;
            }
        }
        return undefined;
    }

    private getPreviousElementIn(nodes: XMLNode[], index: number): DitaElement | undefined {
        for (let i: number = index - 1; i >= 0; i--) {
            if (nodes[i] instanceof DitaElement) {
                return nodes[i] as DitaElement;
            }
        }
        return undefined;
    }

    private copyTopicrefAs(source: DitaElement, template: DitaElement): DitaElement {
        const templateClass: string | undefined = DitaUtils.getNonEmptyAttribute(template, "class");
        if (templateClass === undefined || templateClass.includes("mapgroup-d/")) {
            return this.cloneElement(source);
        }
        const copy: DitaElement = new DitaElement(template.getName());
        this.copyInclId(source, copy);
        for (const attribute of source.getAttributes()) {
            copy.setAttribute(new XMLAttribute(attribute.getName(), attribute.getValue()));
        }
        copy.setAttribute(new XMLAttribute("class", templateClass));
        copy.setContent(source.getContent().map((node: XMLNode): XMLNode => this.cloneNode(node)));
        return copy;
    }

    private insertDitavalrefs(incl: MaprefIncl): void {
        const replacementNodes: XMLNode[] | undefined = incl.replacementNodes;
        if (replacementNodes === undefined || replacementNodes.length === 0) {
            return;
        }
        const nodeList: XMLNode[] = [];
        for (const ditavalref of incl.ditavalrefs) {
            for (const original of replacementNodes) {
                const clone: XMLNode = this.cloneNode(original);
                if (clone instanceof DitaElement && DitaUtils.hasClass(clone, "map/topicref")) {
                    this.insertDitavalref(this.cloneElement(ditavalref), clone);
                }
                nodeList.push(clone);
            }
        }
        incl.replacementNodes = nodeList;
    }

    private insertDitavalref(ditavalref: DitaElement, topicref: DitaElement): void {
        const children: XMLNode[] = topicref.getContent();
        let insertIndex: number = children.length;
        for (let index: number = 0; index < children.length; index++) {
            const child: XMLNode = children[index];
            if (child instanceof DitaElement && DitaUtils.hasClass(child, "map/topicref")) {
                insertIndex = index;
                break;
            }
        }
        children.splice(insertIndex, 0, ditavalref);
        topicref.setContent(children);
    }

    private createKeyscopeGroup(mapOrTopicref: DitaElement, incl: MaprefIncl): void {
        const directiveElement: DitaElement = incl.directiveElement;
        const keySpace1: string | undefined = DitaUtils.getNonEmptyAttribute(directiveElement, MaprefIncluder.KEY_SPACE_ATTRIBUTE);
        const keySpace2: string | undefined = DitaUtils.hasClass(mapOrTopicref, "map/map")
            ? DitaUtils.getNonEmptyAttribute(mapOrTopicref, MaprefIncluder.KEY_SPACE_ATTRIBUTE)
            : undefined;
        if (keySpace1 === undefined && keySpace2 === undefined) {
            return;
        }
        const keyscope1: string | undefined = DitaUtils.getNonEmptyAttribute(directiveElement, "keyscope");
        const keyscope2: string | undefined = DitaUtils.getNonEmptyAttribute(mapOrTopicref, "keyscope");
        const keyscope: string = this.mergeTokens(keyscope1, keyscope2);
        const keySpace: string = keySpace2 ?? keySpace1 ?? "";
        incl.replacementNodes = this.addKeyscopeGroup(incl.replacementNodes, keyscope, keySpace);
        incl.appendedNodes = this.addKeyscopeGroup(incl.appendedNodes, keyscope, keySpace);
    }

    private addKeyscopeGroup(nodes: XMLNode[] | undefined, keyscope: string, keySpace: string): XMLNode[] | undefined {
        if (nodes === undefined || nodes.length === 0) {
            return nodes;
        }
        const data: string = "keyscope=\"" + keyscope + "\" " + MaprefIncluder.KEY_SPACE_ATTRIBUTE + "=\"" + keySpace + "\"";
        const beginPI: ProcessingInstruction = new ProcessingInstruction(MaprefIncluder.BEGIN_GROUP_PI_TARGET, data);
        const endPI: ProcessingInstruction = new ProcessingInstruction(MaprefIncluder.END_GROUP_PI_TARGET, "");
        return [beginPI, ...nodes, endPI];
    }

    private mergeTokens(first: string | undefined, second: string | undefined): string {
        const tokens: string[] = [];
        for (const value of [first, second]) {
            if (value === undefined) {
                continue;
            }
            for (const token of value.split(/\s+/)) {
                if (token.length > 0 && !tokens.includes(token)) {
                    tokens.push(token);
                }
            }
        }
        return tokens.join(" ");
    }
}

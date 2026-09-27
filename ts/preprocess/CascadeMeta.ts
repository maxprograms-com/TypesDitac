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

import { XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";

export class CascadeMeta {
    private static readonly RELATED_LINK_ATTRIBUTES: string[] = [
        "cascade", "type", "role", "otherrole", "format", "scope", "rev"
    ];
    private static readonly NON_ADDITIVE_ATTRIBUTES: string[] = [
        "cascade", "linking", "toc", "print", "search", "format", "scope", "type",
        "xml:lang", "translate", "dir", "processing-role", "rev"
    ];
    private static readonly MAPREF_NON_ADDITIVE_ATTRIBUTES: string[] = [
        "cascade", "translate", "linking", "toc", "print", "search", "type",
        "processing-role", "rev"
    ];

    static readonly CASCADED_ELEMENTS: string[] = [
        "topic/audience", "topic/author", "topic/category", "topic/copyright",
        "topic/critdates", "topic/metadata", "topic/permissions", "topic/prodinfo",
        "topic/publisher"
    ];

    static readonly SINGLE_ELEMENTS: Set<string> = new Set<string>([
        "topic/critdates", "topic/permissions", "topic/publisher"
    ]);

    static readonly TOPICMETA_ELEMENTS: string[] = [
        "topic/navtitle", "map/linktext", "map/searchtitle", "map/shortdesc",
        "topic/author", "topic/source", "topic/publisher", "topic/copyright",
        "topic/critdates", "topic/permissions", "topic/metadata", "topic/audience",
        "topic/category", "topic/keywords", "topic/prodinfo", "topic/othermeta",
        "topic/resourceid", "topic/data", "topic/data-about", "topic/foreign",
        "topic/unknown", "map/ux-window"
    ];

    static processMap(map: DitaElement): void {
        const additiveAttributes: string[] = this.additiveFilterAttributes(map);
        const inherited: Map<string, string> = this.readValues(map, this.NON_ADDITIVE_ATTRIBUTES);
        for (const name of additiveAttributes) {
            const value: string | undefined = this.getAttribute(map, name);
            inherited.set(name, value === undefined ? "" : value);
        }
        this.processChildren(map, inherited, this.readMetadata(map), this.NON_ADDITIVE_ATTRIBUTES, additiveAttributes);
    }

    private static additiveFilterAttributes(element: DitaElement): string[] {
        return DitaUtils.getFilterAttributes(element).filter((name: string): boolean => name !== "rev");
    }

    static processMapref(mapref: DitaElement, nodes: DitaElement[]): void {
        const nonAdditiveAttributes: string[] = this.MAPREF_NON_ADDITIVE_ATTRIBUTES;
        const additiveAttributes: string[] = this.additiveFilterAttributes(mapref);
        const inherited: Map<string, string> = this.readValues(mapref, nonAdditiveAttributes);
        for (const name of additiveAttributes) {
            const value: string | undefined = this.getAttribute(mapref, name);
            inherited.set(name, value === undefined ? "" : value);
        }
        const inheritedMetadata: Map<string, DitaElement[]> = this.readMetadata(mapref);
        for (const node of nodes) {
            if (!this.isCascadable(node)) {
                continue;
            }
            const values: Map<string, string> = this.cascadeAttributes(node, inherited, nonAdditiveAttributes, additiveAttributes);
            const metadata: Map<string, DitaElement[]> = this.cascadeMetadata(node, inheritedMetadata, this.hasMetaClass(node));
            if (DitaUtils.hasClass(node, "map/reltable")) {
                this.processReltable(node, values, metadata, nonAdditiveAttributes, additiveAttributes);
            } else {
                this.processChildren(node, values, metadata, nonAdditiveAttributes, additiveAttributes);
            }
        }
    }

    static processTopic(topic: DitaElement): void {
        const relatedLinks: DitaElement | undefined = DitaUtils.getChildByClass(topic, "topic/related-links");
        if (relatedLinks === undefined) {
            return;
        }
        const additiveAttributes: string[] = this.additiveFilterAttributes(relatedLinks);
        const inherited: Map<string, string> = this.readValues(relatedLinks, this.RELATED_LINK_ATTRIBUTES);
        for (const name of additiveAttributes) {
            inherited.set(name, this.getAttribute(relatedLinks, name) ?? "");
        }
        this.checkOtherrole(relatedLinks, inherited);
        this.processRelatedLinks(relatedLinks, inherited, additiveAttributes);
    }

    private static processRelatedLinks(element: DitaElement, inherited: Map<string, string>, additiveAttributes: string[]): void {
        for (const child of element.getChildren()) {
            const isLink: boolean = DitaUtils.hasClass(child, "topic/link");
            const isLinklistOrPool: boolean = DitaUtils.hasClass(child, "topic/linklist") || DitaUtils.hasClass(child, "topic/linkpool");
            if (!isLink && !isLinklistOrPool) {
                continue;
            }
            const values: Map<string, string> = this.cascadeAttributes(child, inherited, this.RELATED_LINK_ATTRIBUTES, additiveAttributes);
            this.checkOtherrole(child, values);
            if (isLinklistOrPool) {
                this.processRelatedLinks(child, values, additiveAttributes);
            }
        }
    }

    private static checkOtherrole(element: DitaElement, values: Map<string, string>): void {
        if (this.getAttribute(element, "otherrole") !== undefined && this.getAttribute(element, "role") !== "other") {
            values.set("otherrole", "");
            element.removeAttribute("otherrole");
        }
    }

    private static processChildren(
        parent: DitaElement,
        inherited: Map<string, string>,
        inheritedMetadata: Map<string, DitaElement[]>,
        nonAdditiveAttributes: string[],
        additiveAttributes: string[]
    ): void {
        for (const child of parent.getChildren()) {
            if (!this.isCascadable(child)) {
                continue;
            }
            const values: Map<string, string> = this.cascadeAttributes(child, inherited, nonAdditiveAttributes, additiveAttributes);
            const metadata: Map<string, DitaElement[]> = this.cascadeMetadata(child, inheritedMetadata, this.hasMetaClass(child));
            if (DitaUtils.hasClass(child, "map/reltable")) {
                this.processReltable(child, values, metadata, nonAdditiveAttributes, additiveAttributes);
            } else {
                this.processChildren(child, values, metadata, nonAdditiveAttributes, additiveAttributes);
            }
        }
    }

    private static processReltable(
        reltable: DitaElement,
        inherited: Map<string, string>,
        inheritedMetadata: Map<string, DitaElement[]>,
        nonAdditiveAttributes: string[],
        additiveAttributes: string[]
    ): void {
        const colspecs: Array<[Map<string, string>, Map<string, DitaElement[]>]> = [];
        for (const child of reltable.getChildren()) {
            if (!this.isCascadable(child)) {
                continue;
            }
            const values: Map<string, string> = this.cascadeAttributes(child, inherited, nonAdditiveAttributes, additiveAttributes);
            const metadata: Map<string, DitaElement[]> = this.cascadeMetadata(child, inheritedMetadata, this.hasMetaClass(child));
            if (DitaUtils.hasClass(child, "map/relheader")) {
                for (const colspec of child.getChildren()) {
                    if (!DitaUtils.hasClass(colspec, "map/relcolspec")) {
                        continue;
                    }
                    const colspecValues: Map<string, string> = this.cascadeAttributes(colspec, values, nonAdditiveAttributes, additiveAttributes);
                    const colspecMetadata: Map<string, DitaElement[]> = this.cascadeMetadata(colspec, metadata, this.hasMetaClass(colspec));
                    colspecs.push([colspecValues, colspecMetadata]);
                    this.processChildren(colspec, colspecValues, colspecMetadata, nonAdditiveAttributes, additiveAttributes);
                }
            } else if (DitaUtils.hasClass(child, "map/relrow") && colspecs.length > 0) {
                this.processRelrow(child, values, metadata, colspecs, nonAdditiveAttributes, additiveAttributes);
            } else {
                this.processChildren(child, values, metadata, nonAdditiveAttributes, additiveAttributes);
            }
        }
    }

    private static processRelrow(
        relrow: DitaElement,
        inherited: Map<string, string>,
        inheritedMetadata: Map<string, DitaElement[]>,
        colspecs: Array<[Map<string, string>, Map<string, DitaElement[]>]>,
        nonAdditiveAttributes: string[],
        additiveAttributes: string[]
    ): void {
        let column: number = 0;
        for (const cell of relrow.getChildren()) {
            if (!DitaUtils.hasClass(cell, "map/relcell")) {
                continue;
            }
            const colspec: [Map<string, string>, Map<string, DitaElement[]>] | undefined = colspecs[column];
            column++;
            let cellInherited: Map<string, string>;
            let cellInheritedMetadata: Map<string, DitaElement[]>;
            if (colspec === undefined) {
                cellInherited = inherited;
                cellInheritedMetadata = inheritedMetadata;
            } else {
                // The colspec's cascade is refined by the relrow's own local attributes/metadata
                // without writing them to the row.
                cellInherited = this.cascadeAttributes(relrow, colspec[0], nonAdditiveAttributes, additiveAttributes, false);
                cellInheritedMetadata = this.cascadeMetadata(relrow, colspec[1], false);
            }
            const values: Map<string, string> = this.cascadeAttributes(cell, cellInherited, nonAdditiveAttributes, additiveAttributes);
            const metadata: Map<string, DitaElement[]> = this.cascadeMetadata(cell, cellInheritedMetadata, this.hasMetaClass(cell));
            this.processChildren(cell, values, metadata, nonAdditiveAttributes, additiveAttributes);
        }
    }

    private static hasMetaClass(element: DitaElement): boolean {
        return DitaUtils.hasClass(element, "map/topicref") ||
            DitaUtils.hasClass(element, "map/reltable") ||
            DitaUtils.hasClass(element, "map/relcolspec");
    }

    private static cascadeAttributes(
        child: DitaElement,
        inherited: Map<string, string>,
        nonAdditiveAttributes: string[],
        additiveAttributes: string[],
        updateElement: boolean = true
    ): Map<string, string> {
        const values: Map<string, string> = new Map<string, string>();
        const cascade: string = this.getAttribute(child, "cascade") ?? inherited.get("cascade") ?? "";
        const nomerge: boolean = cascade === "nomerge";
        for (const name of nonAdditiveAttributes) {
            const local: string | undefined = this.getAttribute(child, name);
            const value: string = local ?? inherited.get(name) ?? "";
            values.set(name, value);
            if (updateElement && local === undefined && value.length > 0) {
                this.setAttribute(child, name, value);
            }
        }
        for (const name of additiveAttributes) {
            const local: string | undefined = this.getAttribute(child, name);
            const parentValue: string = inherited.get(name) ?? "";
            const value: string = local === undefined || nomerge
                ? (local ?? parentValue)
                : this.mergeValues(parentValue, local);
            values.set(name, value);
            if (updateElement && value.length > 0 && (local === undefined || value !== local)) {
                this.setAttribute(child, name, value);
            }
        }
        return values;
    }

    private static cascadeMetadata(
        element: DitaElement,
        inherited: Map<string, DitaElement[]>,
        hasMeta: boolean
    ): Map<string, DitaElement[]> {
        let meta: DitaElement | undefined = hasMeta ? DitaUtils.getChildByClass(element, "map/topicmeta") : undefined;
        const result: Map<string, DitaElement[]> = new Map<string, DitaElement[]>();
        for (const name of this.CASCADED_ELEMENTS) {
            const cascaded: DitaElement[] = inherited.get(name) ?? [];
            if (this.SINGLE_ELEMENTS.has(name)) {
                const localValue: DitaElement | undefined = meta === undefined ? undefined : DitaUtils.getChildByClass(meta, name);
                if (localValue !== undefined) {
                    result.set(name, [localValue]);
                } else {
                    result.set(name, cascaded);
                    if (hasMeta && cascaded.length > 0) {
                        meta = meta ?? this.createMetadata(element);
                        const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
                            meta,
                            this.TOPICMETA_ELEMENTS.indexOf(name),
                            this.TOPICMETA_ELEMENTS
                        );
                        this.insertClonesBefore(meta, [cascaded[0]], before);
                    }
                }
            } else {
                const localValues: DitaElement[] = meta === undefined
                    ? []
                    : meta.getChildren().filter((child: DitaElement): boolean => DitaUtils.hasClass(child, name));
                result.set(name, localValues.length > 0 ? cascaded.concat(localValues) : cascaded);
                if (hasMeta && cascaded.length > 0) {
                    meta = meta ?? this.createMetadata(element);
                    const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
                        meta,
                        this.TOPICMETA_ELEMENTS.indexOf(name),
                        this.TOPICMETA_ELEMENTS
                    );
                    this.insertClonesBefore(meta, cascaded, before);
                }
            }
        }
        return result;
    }

    private static insertClonesBefore(parent: DitaElement, newChildren: DitaElement[], before: DitaElement | undefined): void {
        const clones: DitaElement[] = newChildren.map((child: DitaElement): DitaElement => DitaUtils.cloneElement(child));
        const content: XMLNode[] = parent.getContent();
        const index: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(index, 0, ...clones);
        parent.setContent(content);
    }

    private static readMetadata(element: DitaElement): Map<string, DitaElement[]> {
        const result: Map<string, DitaElement[]> = new Map<string, DitaElement[]>();
        const meta: DitaElement | undefined = DitaUtils.getChildByClass(element, "map/topicmeta");
        for (const name of this.CASCADED_ELEMENTS) {
            result.set(name, meta === undefined
                ? []
                : meta.getChildren().filter((child: DitaElement): boolean => DitaUtils.hasClass(child, name)));
        }
        return result;
    }

    private static createMetadata(element: DitaElement): DitaElement {
        const meta: DitaElement = new DitaElement("topicmeta");
        meta.setAttribute(new XMLAttribute("class", "- map/topicmeta "));
        const content: XMLNode[] = element.getContent();
        const firstChild: DitaElement | undefined = element.getChildren()[0];
        let insertIndex: number;
        if (firstChild === undefined) {
            insertIndex = content.length;
        } else if (DitaUtils.hasClass(firstChild, "topic/title")) {
            insertIndex = content.indexOf(firstChild) + 1;
        } else {
            insertIndex = content.indexOf(firstChild);
        }
        content.splice(insertIndex, 0, meta);
        element.setContent(content);
        return meta;
    }

    private static isCascadable(element: DitaElement): boolean {
        return DitaUtils.hasClass(element, "map/topicref") ||
            DitaUtils.hasClass(element, "map/reltable") ||
            DitaUtils.hasClass(element, "map/relcolspec") ||
            DitaUtils.hasClass(element, "map/relheader") ||
            DitaUtils.hasClass(element, "map/relrow") ||
            DitaUtils.hasClass(element, "map/relcell");
    }

    private static readValues(element: DitaElement, names: string[]): Map<string, string> {
        const values: Map<string, string> = new Map<string, string>();
        for (const name of names) {
            values.set(name, this.getAttribute(element, name) ?? "");
        }
        return values;
    }

    private static mergeValues(parent: string, local: string): string {
        const values: string[] = parent.split(/\s+/).filter((value: string): boolean => value.length > 0);
        for (const value of local.split(/\s+/)) {
            if (value.length > 0 && !values.includes(value)) {
                values.push(value);
            }
        }
        return values.join(" ");
    }

    private static getAttribute(element: DitaElement, name: string): string | undefined {
        const attribute: XMLAttribute | undefined = element.getAttribute(name);
        if (attribute === undefined) {
            return undefined;
        }
        const value: string = DitaUtils.trimControlAndSpace(attribute.getValue());
        return value.length === 0 ? undefined : value;
    }

    private static setAttribute(element: DitaElement, name: string, value: string): void {
        element.setAttribute(new XMLAttribute(name, value));
    }
}

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

import { XMLAttribute, XMLDocument, XMLUtils } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import type { Filter } from "./Filter.js";
import { LoadedDocuments } from "./LoadedDocuments.js";

interface SchemeValue {
    readonly value: string;
    readonly label?: string;
    readonly kindOf?: string;
}

interface ScopedValues {
    readonly elementName?: string;
    readonly values: Map<string, SchemeValue>;
    defaultValue?: string;
}

interface Subject {
    readonly key: string;
    readonly title?: string;
    readonly children: Subject[];
}

interface Enumeration {
    readonly elementName?: string;
    readonly attrName: string;
    readonly subjectKey?: string;
    readonly defaultValue?: string;
}

export class AttributeValues {
    private static readonly NOT_A_SUBJECT: Subject = { key: "", children: [] };
    private static readonly GROUPABLE_ATTRIBUTES: string[] = ["audience", "product", "platform", "otherprops"];

    private readonly attributes: Map<string, ScopedValues[]> = new Map();

    addValues(other: AttributeValues): void {
        for (const [attrName, list] of other.attributes) {
            this.attributes.set(attrName, list.map((scoped: ScopedValues): ScopedValues => ({
                elementName: scoped.elementName,
                values: new Map(scoped.values),
                defaultValue: scoped.defaultValue
            })));
        }
    }

    add(root: DitaElement, path: string, documents: LoadedDocuments, diagnostics: DiagnosticLog): boolean {
        const subjects: Map<string, Subject> = new Map();
        const enumerations: Map<string, Enumeration> = new Map();
        if (!this.parse(root, path, subjects, enumerations, documents, diagnostics)) {
            return false;
        }
        for (const enumeration of enumerations.values()) {
            let list: ScopedValues[] | undefined = this.attributes.get(enumeration.attrName);
            if (list === undefined) {
                list = [];
                this.attributes.set(enumeration.attrName, list);
            }
            let scoped: ScopedValues | undefined = list.find(
                (values: ScopedValues): boolean => values.elementName === enumeration.elementName
            );
            if (scoped === undefined) {
                scoped = { elementName: enumeration.elementName, values: new Map() };
                if (enumeration.elementName === undefined) {
                    list.push(scoped);
                } else {
                    list.unshift(scoped);
                }
            }
            scoped.defaultValue = enumeration.defaultValue;
            scoped.values.clear();
            if (enumeration.subjectKey !== undefined) {
                const subject: Subject | undefined = subjects.get(enumeration.subjectKey);
                if (subject !== undefined) {
                    this.addAllSubjects(subject, undefined, scoped.values);
                }
            }
        }
        return true;
    }

    hasAttributes(): boolean {
        return this.attributes.size > 0;
    }

    private getValues(attrName: string, elementName: string): ScopedValues | undefined {
        const list: ScopedValues[] | undefined = this.attributes.get(attrName);
        if (list === undefined) {
            return undefined;
        }
        for (const values of list) {
            if (values.elementName === undefined || values.elementName === elementName) {
                return values;
            }
        }
        return undefined;
    }

    getKindOfChain(attribute: string, elementName: string, value: string): string[] {
        const scoped: ScopedValues | undefined = this.getValues(attribute, elementName);
        if (scoped === undefined) {
            return [];
        }
        const chain: string[] = [];
        let current: string | undefined = scoped.values.get(value)?.kindOf;
        while (current !== undefined) {
            chain.push(current);
            current = scoped.values.get(current)?.kindOf;
        }
        return chain;
    }

    validate(root: DitaElement, path: string, diagnostics: DiagnosticLog): void;
    validate(filter: Filter, diagnostics: DiagnosticLog): void;
    validate(rootOrFilter: DitaElement | Filter, pathOrDiagnostics: string | DiagnosticLog, diagnosticsArg?: DiagnosticLog): void {
        if (!this.hasAttributes()) {
            return;
        }
        if (rootOrFilter instanceof DitaElement) {
            this.validateElement(rootOrFilter, pathOrDiagnostics as string, diagnosticsArg as DiagnosticLog);
            return;
        }
        this.validateFilter(rootOrFilter, pathOrDiagnostics as DiagnosticLog);
    }

    private validateFilter(filter: Filter, diagnostics: DiagnosticLog): void {
        const documentRoot: DitaElement | undefined = filter.getDocumentRoot();
        const location: string | undefined = filter.getLocation();
        if (documentRoot === undefined || location === undefined) {
            return;
        }
        if (documentRoot.getName() !== "val") {
            diagnostics.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "unexpectedXMLFile"), [location, "val"]),
                location
            );
            return;
        }
        for (const child of documentRoot.getChildren()) {
            const isRevprop: boolean = child.getName() === "revprop";
            if (child.getName() !== "prop" && !isRevprop) {
                continue;
            }
            const attrValue: string | undefined = this.getAttribute(child, "val");
            if (attrValue === undefined) {
                continue;
            }
            const attrName: string | undefined = isRevprop ? "rev" : this.getNameAttribute(child, "att");
            if (attrName === undefined) {
                continue;
            }
            const scopedList: ScopedValues[] | undefined = this.attributes.get(attrName);
            if (scopedList === undefined) {
                continue;
            }
            const found: boolean = scopedList.some((scoped: ScopedValues): boolean => scoped.values.has(attrValue));
            if (!found) {
                diagnostics.warning(
                    diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "unknownAttrValue"), [attrValue, attrName]),
                    location
                );
            }
        }
    }

    private validateElement(element: DitaElement, path: string, diagnostics: DiagnosticLog): void {
        const elementName: string = element.getName();
        for (const attribute of element.getAttributes()) {
            const name: string = attribute.getName();
            const scoped: ScopedValues | undefined = this.getValues(name, elementName);
            if (scoped === undefined) {
                continue;
            }
            const rawValue: string = attribute.getValue();
            if (rawValue.includes("(") && AttributeValues.GROUPABLE_ATTRIBUTES.includes(name)) {
                this.validateGroupedValue(element, name, rawValue, scoped, path, diagnostics);
            } else {
                for (const token of rawValue.split(/\s+/).filter((value: string): boolean => value.length > 0)) {
                    if (!scoped.values.has(token)) {
                        diagnostics.error(
                            diagnostics.i18n.format(
                                diagnostics.i18n.getString("AttributeValues", "unknownAttrValue2"),
                                [token, name, elementName]
                            ),
                            NodeLocation.of(path, element)
                        );
                    }
                }
            }
        }
        for (const attrName of this.attributes.keys()) {
            const scoped: ScopedValues | undefined = this.getValues(attrName, elementName);
            if (scoped?.defaultValue !== undefined && element.getAttribute(attrName) === undefined) {
                element.setAttribute(new XMLAttribute(attrName, scoped.defaultValue));
            }
        }
        for (const child of element.getChildren()) {
            this.validateElement(child, path, diagnostics);
        }
    }

    private validateGroupedValue(
        element: DitaElement,
        attrName: string,
        rawValue: string,
        scoped: ScopedValues,
        path: string,
        diagnostics: DiagnosticLog
    ): void {
        const elementName: string = element.getName();
        const location: string = NodeLocation.of(path, element);
        const tokens: string[] = rawValue.replace(/\(/g, " ( ").replace(/\)/g, " ) ").split(/\s+/).filter(
            (value: string): boolean => value.length > 0
        );
        let group: string | undefined;
        for (let index: number = 0; index < tokens.length; index++) {
            const token: string = tokens[index];
            if (token === "(") {
                continue;
            }
            if (token === ")") {
                group = undefined;
                continue;
            }
            if (!scoped.values.has(token)) {
                diagnostics.error(
                    diagnostics.i18n.format(
                        diagnostics.i18n.getString("AttributeValues", "unknownAttrValue2"),
                        [token, attrName, elementName]
                    ),
                    location
                );
            } else if (group !== undefined && !this.valueIsKindOf(scoped, token, group)) {
                diagnostics.error(
                    diagnostics.i18n.format(
                        diagnostics.i18n.getString("AttributeValues", "attrValueNotMemberOfGroup"),
                        [attrName, elementName, token, group]
                    ),
                    location
                );
            }
            if (tokens[index + 1] === "(") {
                group = token;
            }
        }
    }

    private valueIsKindOf(scoped: ScopedValues, value: string, baseValue: string): boolean {
        let current: string | undefined = value;
        while (current !== undefined) {
            const entry: SchemeValue | undefined = scoped.values.get(current);
            if (entry === undefined) {
                break;
            }
            if (entry.kindOf === baseValue) {
                return true;
            }
            current = entry.kindOf;
        }
        return false;
    }

    private addAllSubjects(subject: Subject, baseValue: string | undefined, values: Map<string, SchemeValue>): void {
        for (const child of subject.children) {
            const value: SchemeValue = { value: child.key, label: child.title, kindOf: baseValue };
            values.set(value.value, value);
            this.addAllSubjects(child, value.value, values);
        }
    }

    private parse(
        root: DitaElement,
        path: string,
        subjects: Map<string, Subject>,
        enumerations: Map<string, Enumeration>,
        documents: LoadedDocuments,
        diagnostics: DiagnosticLog | undefined
    ): boolean {
        if (root.getName() !== "subjectScheme") {
            diagnostics?.error(
                diagnostics.i18n.format(
                    diagnostics.i18n.getString("AttributeValues", "unexpectedXMLFile"),
                    [path, "subjectScheme"]
                ),
                path
            );
            return false;
        }
        for (const child of root.getChildren()) {
            if (child.getName() === "subjectdef") {
                const subject: Subject | undefined = this.parseSubject(child, undefined, subjects, path, diagnostics);
                if (subject === undefined) {
                    return false;
                }
                subjects.set(subject.key, subject);
            } else if (child.getName() === "enumerationdef") {
                const enumeration: Enumeration | undefined = this.parseEnumeration(child, subjects, path, diagnostics);
                if (enumeration === undefined) {
                    return false;
                }
                enumerations.set(this.enumerationId(enumeration), enumeration);
            } else if (child.getName() === "schemeref") {
                if (!this.loadScheme(child, path, subjects, enumerations, documents, diagnostics)) {
                    return false;
                }
            }
        }
        return true;
    }

    private enumerationId(enumeration: Enumeration): string {
        return enumeration.elementName === undefined
            ? enumeration.attrName
            : enumeration.elementName + "/" + enumeration.attrName;
    }

    private loadScheme(
        element: DitaElement,
        basePath: string,
        subjects: Map<string, Subject>,
        enumerations: Map<string, Enumeration>,
        documents: LoadedDocuments,
        diagnostics: DiagnosticLog | undefined
    ): boolean {
        const href: string | undefined = this.getAttribute(element, "href");
        if (href === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingOrInvalidAttribute"), ["href"]),
                basePath
            );
            return false;
        }
        const schemePath: string = DitaUtils.resolveDocumentPath(basePath, href.split("#", 1)[0].split("?", 1)[0]);
        let schemeDocument: XMLDocument;
        try {
            schemeDocument = documents.loader.load(schemePath, false);
        } catch (error: unknown) {
            diagnostics?.error(
                diagnostics.i18n.format(
                    diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                    [schemePath, error instanceof Error ? error.message : String(error)]
                ),
                basePath
            );
            return false;
        }
        const schemeRoot: DitaElement | undefined = DitaUtils.getRoot(schemeDocument);
        if (schemeRoot === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(
                    diagnostics.i18n.getString("AttributeValues", "unexpectedXMLFile"),
                    [schemePath, "subjectScheme"]
                ),
                schemePath
            );
            return false;
        }
        return this.parse(schemeRoot, schemePath, subjects, enumerations, documents, diagnostics);
    }

    private parseSubject(
        element: DitaElement,
        baseTopSubject: Subject | undefined,
        topSubjects: Map<string, Subject>,
        path: string,
        diagnostics: DiagnosticLog | undefined
    ): Subject | undefined {
        const keyref: string | undefined = this.getTokenAttribute(element, "keyref");
        const isRef: boolean = keyref !== undefined;
        const key: string | undefined = isRef ? keyref : this.getTokenAttribute(element, "keys");
        if (key === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingOrInvalidAttribute"), ["keys"]),
                path
            );
            return undefined;
        }
        if (baseTopSubject === undefined) {
            if (isRef) {
                baseTopSubject = topSubjects.get(key);
                if (baseTopSubject === undefined) {
                    diagnostics?.error(
                        diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "noSuchSubject"), [key]),
                        path
                    );
                    return undefined;
                }
            } else {
                baseTopSubject = AttributeValues.NOT_A_SUBJECT;
            }
        }
        let title: string | undefined = this.getAttribute(element, "navtitle");
        const children: Subject[] = [];
        for (const child of element.getChildren()) {
            if (child.getName() === "subjectdef") {
                const subject: Subject | undefined = this.parseSubject(child, baseTopSubject, topSubjects, path, diagnostics);
                if (subject === undefined) {
                    return undefined;
                }
                children.push(subject);
            } else if (child.getName() === "topicmeta") {
                const navtitle: DitaElement | undefined = DitaUtils.getChildByClass(child, "topic/navtitle");
                if (navtitle !== undefined) {
                    title = navtitle.getText();
                }
            }
        }
        if (title !== undefined) {
            title = DitaUtils.collapseWhitespace(title);
            if (title.length === 0) {
                title = undefined;
            }
        }
        if (!isRef) {
            return { key, title, children };
        }
        const base: Subject | undefined = baseTopSubject === AttributeValues.NOT_A_SUBJECT
            ? topSubjects.get(key)
            : key === baseTopSubject.key
                ? baseTopSubject
                : this.findAttrValue(baseTopSubject, key);
        if (base === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "noSuchSubject"), [key]),
                path
            );
            return undefined;
        }
        return {
            key,
            title: title ?? base.title,
            children: children.length === 0 ? base.children : [...base.children, ...children]
        };
    }

    private findAttrValue(subject: Subject, attrValue: string): Subject | undefined {
        for (const child of subject.children) {
            if (child.key === attrValue) {
                return child;
            }
            const found: Subject | undefined = this.findAttrValue(child, attrValue);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private parseEnumeration(
        element: DitaElement,
        topSubjects: Map<string, Subject>,
        path: string,
        diagnostics: DiagnosticLog | undefined
    ): Enumeration | undefined {
        let elementName: string | undefined;
        let attrName: string | undefined;
        let subject: Subject | undefined;
        let defaultValue: string | undefined;
        for (const child of element.getChildren()) {
            if (child.getName() === "elementdef") {
                elementName = this.getNameAttribute(child, "name");
                if (elementName === undefined) {
                    diagnostics?.error(
                        diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingOrInvalidAttribute"), ["name"]),
                        path
                    );
                    return undefined;
                }
            } else if (child.getName() === "attributedef") {
                attrName = this.getNameAttribute(child, "name");
                if (attrName === undefined) {
                    diagnostics?.error(
                        diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingOrInvalidAttribute"), ["name"]),
                        path
                    );
                    return undefined;
                }
            } else if (child.getName() === "subjectdef") {
                if (subject !== undefined) {
                    diagnostics?.error(diagnostics.i18n.getString("AttributeValues", "hasSeveralSubjects"), path);
                    return undefined;
                }
                const keyref: string | undefined = this.getTokenAttribute(child, "keyref");
                if (keyref === undefined) {
                    subject = AttributeValues.NOT_A_SUBJECT;
                } else {
                    subject = topSubjects.get(keyref);
                    if (subject === undefined) {
                        diagnostics?.error(
                            diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "noSuchSubject"), [keyref]),
                            path
                        );
                        return undefined;
                    }
                }
            } else if (child.getName() === "defaultSubject") {
                const keyref: string | undefined = this.getTokenAttribute(child, "keyref");
                if (keyref === undefined) {
                    diagnostics?.error(
                        diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingOrInvalidAttribute"), ["keyref"]),
                        path
                    );
                    return undefined;
                }
                defaultValue = keyref;
            }
        }
        if (attrName === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingChildElement"), ["attributedef"]),
                path
            );
            return undefined;
        }
        if (subject === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "missingChildElement"), ["subjectdef"]),
                path
            );
            return undefined;
        }
        if (defaultValue !== undefined && this.findAttrValue(subject, defaultValue) === undefined) {
            diagnostics?.error(
                diagnostics.i18n.format(diagnostics.i18n.getString("AttributeValues", "invalidDefaultValue"), [defaultValue]),
                path
            );
            return undefined;
        }
        return {
            elementName,
            attrName,
            subjectKey: subject === AttributeValues.NOT_A_SUBJECT ? undefined : subject.key,
            defaultValue
        };
    }

    private getAttribute(element: DitaElement, name: string): string | undefined {
        return DitaUtils.getNonEmptyAttribute(element, name);
    }

    private getTokenAttribute(element: DitaElement, name: string): string | undefined {
        const value: string | undefined = this.getAttribute(element, name);
        return value === undefined || /[ \t\r\n]/.test(value) ? undefined : value;
    }

    private getNameAttribute(element: DitaElement, name: string): string | undefined {
        const value: string | undefined = this.getAttribute(element, name);
        return value === undefined || !XMLUtils.isValidXMLName(value) ? undefined : value;
    }
}

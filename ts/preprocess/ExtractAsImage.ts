/*
 * Portions Copyright (c) 2025 XMLmind Software. All rights reserved.
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

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { XMLAttribute, XMLDocument, XMLNode, XMLWriter } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";

export interface ExtractedValue {
    readonly text?: string;
    readonly element?: DitaElement;
}

export interface ExtractAsImageSpec {
    readonly matches: (element: DitaElement) => boolean;
    readonly extract: (element: DitaElement) => ExtractedValue;
    readonly fileExtension: string | undefined;
}

function childNamed(element: DitaElement, name: string): DitaElement | undefined {
    return element.getChildren().find((candidate: DitaElement): boolean => candidate.getName() === name);
}

function hrefOfChild(element: DitaElement, childName: string): ExtractedValue {
    const ref: DitaElement | undefined = childNamed(element, childName);
    return { text: ref === undefined ? undefined : DitaUtils.getNonEmptyAttribute(ref, "href") };
}

export class ExtractAsImage {
    private readonly outDir: string;
    private readonly diagnostics: DiagnosticLog;
    private readonly specs: ExtractAsImageSpec[] = [];
    private extractCounter: number = 0;

    constructor(outDir: string, diagnostics: DiagnosticLog) {
        this.outDir = outDir;
        this.diagnostics = diagnostics;
        for (const spec of ExtractAsImage.predefinedSpecs()) {
            this.specs.push(spec);
        }
    }

    addSpec(spec: ExtractAsImageSpec): void {
        this.specs.push(spec);
    }

    private static predefinedSpecs(): ExtractAsImageSpec[] {
        return [
            {
                matches: (element: DitaElement): boolean =>
                    element.getName() === "foreign" && DitaUtils.getNonEmptyAttribute(element, "outputclass") === "embed-latex",
                extract: (element: DitaElement): ExtractedValue => ({ text: element.getText() }),
                fileExtension: "tex"
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "mathml" && childNamed(element, "mml:math") !== undefined,
                extract: (element: DitaElement): ExtractedValue => ({ element: childNamed(element, "mml:math") }),
                fileExtension: "mml"
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "mathml" && childNamed(element, "mathmlref") !== undefined,
                extract: (element: DitaElement): ExtractedValue => hrefOfChild(element, "mathmlref"),
                fileExtension: undefined
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "foreign" && childNamed(element, "mml:math") !== undefined,
                extract: (element: DitaElement): ExtractedValue => ({ element: childNamed(element, "mml:math") }),
                fileExtension: "mml"
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "svg-container" && childNamed(element, "svg:svg") !== undefined,
                extract: (element: DitaElement): ExtractedValue => ({ element: childNamed(element, "svg:svg") }),
                fileExtension: "svg"
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "svg-container" && childNamed(element, "svgref") !== undefined,
                extract: (element: DitaElement): ExtractedValue => hrefOfChild(element, "svgref"),
                fileExtension: undefined
            },
            {
                matches: (element: DitaElement): boolean => element.getName() === "foreign" && childNamed(element, "svg:svg") !== undefined,
                extract: (element: DitaElement): ExtractedValue => ({ element: childNamed(element, "svg:svg") }),
                fileExtension: "svg"
            }
        ];
    }

    process(tree: DitaElement, location: string): void {
        for (const spec of this.specs) {
            this.processSpec(tree, spec, location);
        }
    }

    private processSpec(element: DitaElement, spec: ExtractAsImageSpec, location: string): void {
        for (const child of element.getChildren()) {
            let replaced: boolean = false;
            if (spec.matches(child)) {
                const value: ExtractedValue = spec.extract(child);
                const text: string | undefined = value.text?.trim();
                if ((text !== undefined && text.length > 0) || value.element !== undefined) {
                    replaced = this.replace(element, child, text, value.element, spec.fileExtension, location);
                }
            }
            if (!replaced) {
                this.processSpec(child, spec, location);
            }
        }
    }

    private replace(
        parent: DitaElement,
        oldChild: DitaElement,
        text: string | undefined,
        element: DitaElement | undefined,
        fileExtension: string | undefined,
        location: string
    ): boolean {
        let href: string | undefined;
        if (fileExtension === undefined) {
            href = text;
        } else {
            this.extractCounter++;
            const fileName: string = "img" + this.extractCounter.toString().padStart(5, "0") + "." + fileExtension;
            const filePath: string = resolve(this.outDir, fileName);
            try {
                if (text !== undefined) {
                    writeFileSync(filePath, text, "utf8");
                } else if (element !== undefined) {
                    this.ensureNamespaceDeclarations(element);
                    const document: XMLDocument = new XMLDocument();
                    document.setRoot(element);
                    XMLWriter.writeDocument(document, filePath);
                } else {
                    writeFileSync(filePath, "", "utf8");
                }
            } catch (error: unknown) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("ExtractAsImage", "cannotSaveExtractedImage"),
                        [filePath, error instanceof Error ? error.message : String(error)]
                    ),
                    location
                );
                return false;
            }
            href = pathToFileURL(filePath).toString();
        }
        if (href === undefined) {
            this.diagnostics.error(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("ExtractAsImage", "unusableExtractAsImageSpec"),
                    [oldChild.getName()]
                ),
                location
            );
            return false;
        }
        const image: DitaElement = new DitaElement("image");
        image.setAttribute(new XMLAttribute("class", "- topic/image "));
        image.setAttribute(new XMLAttribute("href", href));
        this.replaceChild(parent, oldChild, image);
        return true;
    }

    private replaceChild(parent: DitaElement, oldChild: DitaElement, newChild: DitaElement): void {
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(oldChild);
        if (index >= 0) {
            content.splice(index, 1, newChild);
            parent.setContent(content);
        }
    }

    private ensureNamespaceDeclarations(element: DitaElement): void {
        const prefixes: Set<string> = new Set<string>();
        this.collectPrefixes(element, prefixes);
        for (const prefix of prefixes) {
            if (element.getAttribute("xmlns:" + prefix) !== undefined) {
                continue;
            }
            const uri: string | undefined = this.findNamespaceURI(element.getParent(), prefix);
            if (uri !== undefined) {
                element.setAttribute(new XMLAttribute("xmlns:" + prefix, uri));
            }
        }
    }

    private collectPrefixes(element: DitaElement, prefixes: Set<string>): void {
        const ownPrefix: string | undefined = ExtractAsImage.prefixOf(element.getName());
        if (ownPrefix !== undefined) {
            prefixes.add(ownPrefix);
        }
        for (const attribute of element.getAttributes()) {
            const name: string = attribute.getName();
            if (name === "xmlns" || name.startsWith("xmlns:")) {
                continue;
            }
            const attributePrefix: string | undefined = ExtractAsImage.prefixOf(name);
            if (attributePrefix !== undefined) {
                prefixes.add(attributePrefix);
            }
        }
        for (const child of element.getChildren()) {
            this.collectPrefixes(child, prefixes);
        }
    }

    private static prefixOf(qualifiedName: string): string | undefined {
        const colon: number = qualifiedName.indexOf(":");
        return colon > 0 ? qualifiedName.slice(0, colon) : undefined;
    }

    private findNamespaceURI(start: DitaElement | undefined, prefix: string): string | undefined {
        let current: DitaElement | undefined = start;
        while (current !== undefined) {
            const declared: string | undefined = current.getAttribute("xmlns:" + prefix)?.getValue() ?? current.getAttribute("xmlns")?.getValue();
            if (declared !== undefined) {
                return declared;
            }
            current = current.getParent();
        }
        return undefined;
    }
}

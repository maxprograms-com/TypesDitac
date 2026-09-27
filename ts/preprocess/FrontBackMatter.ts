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

export class FrontBackMatter {
    static add(map: DitaElement, frontItems: string[][] | undefined, backItems: string[][] | undefined): void {
        if (frontItems === undefined && backItems === undefined) {
            return;
        }
        let front: string[][] | undefined = frontItems;
        let back: string[][] | undefined = backItems;
        if (this.countTOCEntries(map) <= 1) {
            front = this.clearTOC(front);
            back = this.clearTOC(back);
        }

        const frontContainer: DitaElement | undefined = DitaUtils.getChildByClass(map, "bookmap/frontmatter");
        const backContainer: DitaElement | undefined = DitaUtils.getChildByClass(map, "bookmap/backmatter");

        front = this.filterExisting(front, frontContainer, backContainer);
        back = this.filterExisting(back, frontContainer, backContainer);

        if (front !== undefined) {
            const built: DitaElement | undefined = this.createFrontBackMatter(front, false);
            if (built !== undefined) {
                this.insertFrontMatter(built, frontContainer, map);
            }
        }
        if (back !== undefined) {
            const built: DitaElement | undefined = this.createFrontBackMatter(back, true);
            if (built !== undefined) {
                this.insertBackMatter(built, backContainer, map);
            }
        }
    }

    private static countTOCEntries(element: DitaElement): number {
        let count: number = 0;
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref") &&
                !DitaUtils.hasClass(child, "bookmap/frontmatter") &&
                !DitaUtils.hasClass(child, "bookmap/backmatter")) {
                count++;
                count += this.countTOCEntries(child);
            }
        }
        return count;
    }

    private static clearTOC(items: string[][] | undefined): string[][] | undefined {
        if (items === undefined) {
            return undefined;
        }
        const cleared: string[][] = items
            .map((group: string[]): string[] => group.filter((name: string): boolean => name !== "toc"))
            .filter((group: string[]): boolean => group.length > 0);
        return cleared.length === 0 ? undefined : cleared;
    }

    private static filterExisting(
        items: string[][] | undefined,
        frontContainer: DitaElement | undefined,
        backContainer: DitaElement | undefined
    ): string[][] | undefined {
        if (items === undefined) {
            return undefined;
        }
        const filtered: string[][] = items
            .map((group: string[]): string[] => group.filter(
                (name: string): boolean => !this.alreadyPresent(name, frontContainer) && !this.alreadyPresent(name, backContainer)
            ))
            .filter((group: string[]): boolean => group.length > 0);
        return filtered.length === 0 ? undefined : filtered;
    }

    private static alreadyPresent(name: string, container: DitaElement | undefined): boolean {
        if (container === undefined) {
            return false;
        }
        const booklists: DitaElement | undefined = DitaUtils.getChildByClass(container, "bookmap/booklists");
        if (booklists === undefined) {
            return false;
        }
        return DitaUtils.getChildByClass(booklists, "bookmap/" + name) !== undefined;
    }

    private static readonly CANONICAL_ORDER: string[] = ["toc", "figurelist", "tablelist", "examplelist", "equationlist", "indexlist"];

    private static canonicalizeGroup(group: string[]): string[] {
        const present: Set<string> = new Set(group);
        return FrontBackMatter.CANONICAL_ORDER.filter((name: string): boolean => present.has(name));
    }

    private static createFrontBackMatter(items: string[][], isBackMatter: boolean): DitaElement | undefined {
        const top: DitaElement = new DitaElement(isBackMatter ? "backmatter" : "frontmatter");
        top.setAttribute(new XMLAttribute("class", isBackMatter ? "- map/topicref bookmap/backmatter " : "- map/topicref bookmap/frontmatter "));

        let done: boolean = false;
        for (const rawGroup of items) {
            const group: string[] = FrontBackMatter.canonicalizeGroup(rawGroup);
            const booklistsElement: DitaElement = new DitaElement("booklists");
            booklistsElement.setAttribute(new XMLAttribute("class", "- map/topicref bookmap/booklists "));
            booklistsElement.setAttribute(new XMLAttribute("chunk", "to-content"));
            if (group.length === 1) {
                booklistsElement.setAttribute(new XMLAttribute("copy-to", group[0]));
            }
            top.addElement(booklistsElement);
            for (const name of group) {
                const section: DitaElement = new DitaElement(name);
                const sectionClass: string = name === "examplelist" || name === "equationlist"
                    ? "- map/topicref bookmap/booklist bookmap/" + name + " "
                    : "- map/topicref bookmap/" + name + " ";
                section.setAttribute(new XMLAttribute("class", sectionClass));
                booklistsElement.addElement(section);
                done = true;
            }
        }
        return done ? top : undefined;
    }

    private static insertFrontMatter(element: DitaElement, frontmatter: DitaElement | undefined, map: DitaElement): void {
        if (frontmatter !== undefined) {
            const content: XMLNode[] = frontmatter.getContent();
            const existing: DitaElement[] = frontmatter.getChildren().filter(
                (child: DitaElement): boolean => DitaUtils.hasClass(child, "bookmap/booklists")
            );
            let before: XMLNode | undefined;
            if (existing.length > 0) {
                const lastIndex: number = content.indexOf(existing[existing.length - 1]);
                before = content[lastIndex + 1];
            } else {
                before = content.find((node: XMLNode): boolean => node instanceof DitaElement);
            }
            this.moveChildren(element, frontmatter, before);
            return;
        }
        const content: XMLNode[] = map.getContent();
        const ditavalrefs: DitaElement[] = map.getChildren().filter(
            (child: DitaElement): boolean => DitaUtils.hasClass(child, "ditavalref-d/ditavalref")
        );
        let insertIndex: number;
        if (ditavalrefs.length > 0) {
            insertIndex = content.indexOf(ditavalrefs[0]) + 1;
        } else {
            const before: DitaElement | undefined =
                map.getChildren().find((child: DitaElement): boolean => DitaUtils.hasClass(child, "map/topicref")) ??
                map.getChildren().find((child: DitaElement): boolean => DitaUtils.hasClass(child, "bookmap/backmatter")) ??
                map.getChildren().find((child: DitaElement): boolean => DitaUtils.hasClass(child, "map/reltable"));
            insertIndex = before === undefined ? content.length : content.indexOf(before);
        }
        content.splice(insertIndex, 0, element);
        map.setContent(content);
    }

    private static insertBackMatter(element: DitaElement, backmatter: DitaElement | undefined, map: DitaElement): void {
        if (backmatter !== undefined) {
            const existing: DitaElement[] = backmatter.getChildren().filter(
                (child: DitaElement): boolean => DitaUtils.hasClass(child, "bookmap/booklists")
            );
            const before: DitaElement | undefined = existing.length > 0 ? existing[0] : undefined;
            this.moveChildren(element, backmatter, before);
            return;
        }
        const content: XMLNode[] = map.getContent();
        const before: DitaElement | undefined = map.getChildren().find(
            (child: DitaElement): boolean => DitaUtils.hasClass(child, "map/reltable")
        );
        const insertIndex: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(insertIndex, 0, element);
        map.setContent(content);
    }

    private static moveChildren(from: DitaElement, to: DitaElement, before: XMLNode | undefined): void {
        const moved: XMLNode[] = from.getContent();
        from.setContent([]);
        const content: XMLNode[] = to.getContent();
        const insertIndex: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(insertIndex, 0, ...moved);
        to.setContent(content);
    }
}

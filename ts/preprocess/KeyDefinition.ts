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

import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";

export class KeyDefinition {
    readonly key: string;
    readonly element: DitaElement;
    readonly fromChildKeySpace: number;
    readonly basePath: string | undefined;

    constructor(key: string, element: DitaElement, fromChildKeySpace: number = 0, basePath?: string) {
        this.key = key;
        this.element = element;
        this.fromChildKeySpace = fromChildKeySpace;
        this.basePath = basePath;
    }

    getAttribute(name: string): string | undefined {
        return DitaUtils.getNonEmptyAttribute(this.element, name);
    }

    getHref(): string | undefined {
        const href: string | undefined = this.getAttribute("href");
        if (href === undefined || this.basePath === undefined || href.startsWith("#") || DitaUtils.hasURIScheme(href)) {
            return href;
        }
        const queryIndex: number = href.indexOf("?");
        const fragmentIndex: number = href.indexOf("#");
        const suffixIndex: number = queryIndex < 0 ? fragmentIndex : fragmentIndex < 0 ? queryIndex : Math.min(queryIndex, fragmentIndex);
        const path: string = suffixIndex < 0 ? href : href.slice(0, suffixIndex);
        const suffix: string = suffixIndex < 0 ? "" : href.slice(suffixIndex);
        return DitaUtils.resolveDocumentPath(this.basePath, path) + suffix;
    }

    isAbsoluteHref(): boolean {
        return this.getAttribute("href") !== undefined && this.getAttribute("ditac:absoluteHref") === "true";
    }

    getMeta(): DitaElement | undefined {
        return this.element.getChildren()[0];
    }

    getText(): string | undefined {
        const meta: DitaElement | undefined = this.getMeta();
        if (meta === undefined) {
            return undefined;
        }
        const keywords: DitaElement | undefined = DitaUtils.getChildByClass(meta, "topic/keywords");
        const keyword: DitaElement | undefined = keywords === undefined ? undefined : DitaUtils.getChildByClass(keywords, "topic/keyword");
        const linkText: DitaElement | undefined = DitaUtils.getChildByClass(meta, "map/linktext");
        const source: DitaElement = keyword ?? linkText ?? meta;
        const text: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(source));
        return text.length === 0 ? undefined : text;
    }
}
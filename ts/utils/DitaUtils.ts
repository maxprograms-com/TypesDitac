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

import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Constants, FileReader, ProcessingInstruction, TextNode, XMLAttribute, XMLDocument, XMLNode, XMLUtils } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { I18n } from "../i18n/I18n.js";
import { URIComponent } from "./URIComponent.js";

export class DitaUtils {
    private static readonly generatedIds: WeakMap<DitaElement, string> = new WeakMap<DitaElement, string>();
    private static nextGeneratedId: number = 0;
    private static radicalIdCounter: number = 0;
    private static readonly ABSOLUTE_SCHEMES: string[] = ["http://", "https://", "ftp://", "mailto:"];
    private static readonly HTML_EXTENSIONS: string[] = ["html", "htm", "shtml", "xhtml", "xhtm", "xht"];
    private static readonly MARKDOWN_EXTENSIONS: string[] = ["md", "markdown", "mdown", "mkdn", "mdwn", "mkd", "rmd"];
    private static readonly DITA_ALIAS_FORMATS: string[] = ["mdita", "markdown", "hdita", "html"];

    static quotePathSegment(segment: string): string {
        return URIComponent.encode(URIComponent.quotePath(segment));
    }

    static hasURIScheme(value: string): boolean {
        return /^[A-Za-z][A-Za-z0-9+.-]+:/.test(value);
    }

    static toFileUrl(absolutePath: string): string {
        return pathToFileURL(absolutePath).href.replace(/^file:\/\/\//, "file:/");
    }

    static resolveDocumentPath(basePath: string, relativePath: string): string {
        if (/^https?:\/\//i.test(relativePath)) {
            return relativePath;
        }
        if (/^https?:\/\//i.test(basePath)) {
            return new URL(relativePath, basePath).toString();
        }
        const localBasePath: string = /^file:/i.test(basePath)
            ? fileURLToPath(new URL(basePath))
            : basePath;
        const localRelativePath: string = /^file:/i.test(relativePath)
            ? fileURLToPath(new URL(relativePath))
            : URIComponent.decode(relativePath);
        return resolve(localBasePath, "..", localRelativePath);
    }

    static readText(filePath: string, encoding?: BufferEncoding): string {
        const reader: FileReader = new FileReader(filePath, encoding);
        let text: string = "";
        try {
            while (reader.dataAvailable()) {
                text += reader.read();
            }
        } finally {
            reader.closeFile();
        }
        return text;
    }

    static retrieve(url: string, i18n: I18n): string {
        return DitaUtils.retrieveBytes(url, i18n).toString("utf8");
    }

    static retrieveBytes(url: string, i18n: I18n): Buffer {
        const parsed: URL = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error(i18n.format(i18n.getString("DITAUtil", "onlyHttpRetrievable"), [url]));
        }
        const fetchScript: string = fileURLToPath(new URL("./Fetch.js", import.meta.url));
        const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [fetchScript, url], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024
        });
        if (result.error !== undefined) {
            throw new Error(i18n.format(i18n.getString("DITAUtil", "cannotRetrieve"), [url, result.error.message]));
        }
        if (result.status !== 0) {
            const detail: string = result.stderr.trim();
            throw new Error(detail.length === 0
                ? i18n.format(i18n.getString("DITAUtil", "cannotRetrieveNoDetail"), [url])
                : i18n.format(i18n.getString("DITAUtil", "cannotRetrieve"), [url, detail]));
        }
        return Buffer.from(result.stdout.trim(), "base64");
    }

    static urlExists(url: string): boolean {
        const checkScript: string = fileURLToPath(new URL("./CheckURL.js", import.meta.url));
        const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [checkScript, url], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024
        });
        if (result.error !== undefined || result.status !== 0) {
            return false;
        }
        return result.stdout.trim() === "true";
    }

    static getRoot(document: XMLDocument): DitaElement | undefined {
        // TypesXML types getRoot() as XMLElement; every root built in this port is a DitaElement.
        return document.getRoot() as DitaElement | undefined;
    }

    static hasDITANamespace(element: DitaElement): boolean {
        const name: string = element.getName();
        return !name.includes(":") || name.startsWith("ditac:");
    }

    static hasContent(element: DitaElement): boolean {
        let content: Array<XMLNode> = element.getContent();
        for (const node of content) {
            if (node.getNodeType() === Constants.TEXT_NODE) {
                const text: string = (node as TextNode).getValue().trim();
                if (text.length > 0) {
                    return true;
                }
            }
            if (node.getNodeType() === Constants.ELEMENT_NODE) {
                return true;
            }
        }
        return false;
    }

    static getNonEmptyAttribute(element: DitaElement, name: string): string | undefined {
        const attribute: XMLAttribute | undefined = element.getAttribute(name);
        if (attribute === undefined) {
            return undefined;
        }
        const value: string = DitaUtils.trimControlAndSpace(attribute.getValue());
        return value.length === 0 || value === "???" ? undefined : value;
    }

    static trimControlAndSpace(value: string): string {
        let start: number = 0;
        let end: number = value.length;
        while (start < end && value.charCodeAt(start) <= 0x20) {
            start++;
        }
        while (end > start && value.charCodeAt(end - 1) <= 0x20) {
            end--;
        }
        return value.substring(start, end);
    }

    static getScope(element: DitaElement, href: string | undefined): string {
        const scope: string | undefined = DitaUtils.getNonEmptyAttribute(element, "scope");
        if (scope !== undefined) {
            return scope;
        }
        if (href !== undefined &&
            DitaUtils.ABSOLUTE_SCHEMES.some((scheme: string): boolean => href.startsWith(scheme)) &&
            DitaUtils.getNonEmptyAttribute(element, "ditac:absoluteHref") === "true") {
            return "external";
        }
        return "local";
    }

    static getFormat(element: DitaElement, href: string | undefined, scope: string | undefined): string | undefined {
        return DitaUtils.resolveFormat(DitaUtils.getNonEmptyAttribute(element, "format"), href, scope);
    }

    static resolveFormat(format: string | undefined, href: string | undefined, scope: string | undefined): string | undefined {
        let resolved: string | undefined = format;
        if (resolved !== undefined) {
            const semicolon: number = resolved.indexOf(";");
            if (semicolon >= 0) {
                resolved = resolved.slice(0, semicolon).trim();
            }
            resolved = resolved.length === 0 ? undefined : resolved.toLowerCase();
        }
        if (resolved === undefined && href !== undefined) {
            resolved = DitaUtils.formatFromExtension(href);
        }
        if (resolved !== undefined && (scope === undefined || scope === "local") &&
            DitaUtils.DITA_ALIAS_FORMATS.includes(resolved)) {
            resolved = "dita";
        }
        return resolved;
    }

    private static formatFromExtension(href: string): string | undefined {
        const path: string = href.split("#", 1)[0].split("?", 1)[0];
        if (path.length === 0) {
            return undefined;
        }
        const dotIndex: number = path.lastIndexOf(".");
        const slashIndex: number = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        let ext: string | undefined = dotIndex > slashIndex ? path.slice(dotIndex + 1).trim().toLowerCase() : undefined;
        if (ext !== undefined && ext.length === 0) {
            ext = undefined;
        }
        if (ext !== undefined) {
            if (ext === "xml") {
                return "dita";
            }
            if (DitaUtils.HTML_EXTENSIONS.includes(ext)) {
                return "html";
            }
            if (DitaUtils.MARKDOWN_EXTENSIONS.includes(ext)) {
                return "markdown";
            }
            return ext;
        }
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return "html";
        }
        if (path.endsWith("/")) {
            return "x-directory";
        }
        return undefined;
    }

    private static readonly FILTER_ATTRIBUTES: string[] = [
        "rev", "deliveryTarget", "audience", "platform", "product", "otherprops", "props"
    ];
    private static readonly OTHER_META_ATTRIBUTES: string[] = [
        "xml:lang", "translate", "dir", "outputclass", "importance", "status", "base"
    ];

    static filterAttributeIsSingle(index: number): boolean {
        return index === 0;
    }

    static otherMetaAttributeIsSingle(index: number): boolean {
        return index < DitaUtils.OTHER_META_ATTRIBUTES.length - 1;
    }

    static getFilterAttributes(element: DitaElement): string[] {
        const domains: string | undefined = DitaUtils.lookupAncestorAttribute(element, "domains");
        return DitaUtils.getMetaAttributes(domains, DitaUtils.FILTER_ATTRIBUTES, "a(props");
    }

    static getOtherMetaAttributes(element: DitaElement): string[] {
        const domains: string | undefined = DitaUtils.lookupAncestorAttribute(element, "domains");
        return DitaUtils.getMetaAttributes(domains, DitaUtils.OTHER_META_ATTRIBUTES, "a(base");
    }

    private static getMetaAttributes(domains: string | undefined, attrNames: string[], specializationPrefix: string): string[] {
        let allAttrNames: string[] = attrNames;
        if (domains !== undefined) {
            let pos: number = 0; // fixed offset past prefix + space
            for (; ;) {
                pos = domains.indexOf(specializationPrefix, pos);
                if (pos < 0) {
                    break;
                }
                pos += 7;
                const start: number = pos;
                pos = domains.indexOf(")", pos);
                if (pos < 0) {
                    break;
                }
                const end: number = pos;
                pos++;
                const names: string[] = domains.slice(start, end).trim().split(/\s+/).filter(
                    (name: string): boolean => name.length > 0
                );
                for (const name of names) {
                    if (!allAttrNames.includes(name)) {
                        allAttrNames = [...allAttrNames, name];
                    }
                }
            }
        }
        return allAttrNames;
    }

    static findChildByClassFrom(element: DitaElement, fromIndex: number, classNames: string[]): DitaElement | undefined {
        for (const child of element.getChildren()) {
            for (let index: number = fromIndex; index < classNames.length; index++) {
                if (DitaUtils.hasClass(child, classNames[index])) {
                    return child;
                }
            }
        }
        return undefined;
    }

    static lookupAncestorAttribute(target: DitaElement, name: string): string | undefined {
        let current: DitaElement | undefined = target;
        while (current !== undefined) {
            const value: string | undefined = DitaUtils.getNonEmptyAttribute(current, name);
            if (value !== undefined) {
                return value;
            }
            current = current.getParent();
        }
        return undefined;
    }

    static lookupAncestorAttributeRaw(target: DitaElement, name: string): string | undefined {
        let current: DitaElement | undefined = target;
        while (current !== undefined) {
            const value: string | undefined = current.getAttribute(name)?.getValue();
            if (value !== undefined && value.length > 0) {
                return value;
            }
            current = current.getParent();
        }
        return undefined;
    }

    private static getRawAttribute(element: DitaElement, name: string): string | undefined {
        const attribute: XMLAttribute | undefined = element.getAttribute(name);
        if (attribute === undefined) {
            return undefined;
        }
        const value: string = attribute.getValue();
        return value.length === 0 ? undefined : value;
    }

    static inheritAttribute(target: DitaElement, name: string): string | undefined {
        let cellIndex: number = -1;
        let current: DitaElement | undefined = target;
        while (current !== undefined) {
            if (cellIndex >= 0 && DitaUtils.hasClass(current, "map/reltable")) {
                const header: DitaElement | undefined = DitaUtils.getChildByClass(current, "map/relheader");
                const colspec: DitaElement | undefined = header?.getChildren()[cellIndex];
                const columnValue: string | undefined = colspec === undefined
                    ? undefined
                    : DitaUtils.getRawAttribute(colspec, name);
                if (columnValue !== undefined) {
                    return columnValue;
                }
            }
            const value: string | undefined = DitaUtils.getRawAttribute(current, name);
            if (value !== undefined) {
                return value;
            }
            const parent: DitaElement | undefined = current.getParent();
            if (DitaUtils.hasClass(current, "map/relcell") && parent !== undefined) {
                cellIndex = parent.getChildren().indexOf(current);
            }
            current = parent;
        }
        return undefined;
    }

    static inheritFormat(
        target: DitaElement,
        href: string | undefined,
        scope: string | undefined
    ): string | undefined {
        return DitaUtils.resolveFormat(DitaUtils.inheritAttribute(target, "format"), href, scope);
    }

    static isValidKey(value: string | undefined): boolean {
        if (value === undefined || value.length === 0) {
            return false;
        }
        for (let index: number = 0; index < value.length; index++) {
            const c: string = value.charAt(index);
            if ("-_.!~*'()".includes(c)) {
                continue;
            }
            if (!/[\p{L}\p{Nd}]/u.test(c)) {
                return false;
            }
        }
        return true;
    }

    static getTextContent(element: DitaElement): string {
        let text: string = "";
        for (const node of element.getContent()) {
            if (node instanceof TextNode) {
                text += node.getValue();
            } else if (node instanceof DitaElement &&
                !DitaUtils.hasClass(node, "topic/draft-comment") &&
                !DitaUtils.hasClass(node, "topic/required-cleanup")) {
                text += DitaUtils.getTextContent(node);
            }
        }
        return text;
    }

    static getTitleTextFromChild(element: DitaElement, preferNavtitle: boolean): string | undefined {
        if (preferNavtitle && DitaUtils.hasClass(element, "topic/topic")) {
            const titlealts: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/titlealts");
            const navtitle: DitaElement | undefined = titlealts === undefined
                ? undefined
                : DitaUtils.getChildByClass(titlealts, "topic/navtitle");
            if (navtitle !== undefined) {
                const text: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(navtitle));
                if (text.length > 0) {
                    return text;
                }
            }
        }
        const title: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/title");
        if (title !== undefined) {
            const text: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(title));
            if (text.length > 0) {
                return text;
            }
        }
        return undefined;
    }

    static hasClass(element: DitaElement, className: string): boolean {
        const classAttribute: XMLAttribute | undefined = element.getAttribute("class");
        if (classAttribute === undefined) {
            return false;
        }
        const classTokens: string[] = classAttribute.getValue().trim().split(/\s+/);
        for (const token of classTokens) {
            if (token === className || token.endsWith("/" + className)) {
                return true;
            }
            if (className.startsWith("*/") && token.endsWith(className.slice(1)) && token.length > className.length - 1) {
                return true;
            }
        }
        return false;
    }

    static getChildByClass(element: DitaElement, className: string): DitaElement | undefined {
        const children: DitaElement[] = element.getChildren();
        for (const child of children) {
            if (DitaUtils.hasClass(child, className)) {
                return child;
            }
        }
        return undefined;
    }

    static findAncestorByClass(element: DitaElement, className: string): DitaElement | undefined {
        let current: DitaElement | undefined = element;
        while (current !== undefined) {
            if (DitaUtils.hasClass(current, className)) {
                return current;
            }
            current = current.getParent();
        }
        return undefined;
    }

    static findChildrenByClass(element: DitaElement, className: string): DitaElement[] {
        return element.getChildren().filter((child: DitaElement): boolean => DitaUtils.hasClass(child, className));
    }

    static getDescendantByClass(element: DitaElement, fromIndex: number, classNames: string[]): DitaElement | undefined {
        for (const child of element.getChildren()) {
            for (let index: number = fromIndex; index < classNames.length; index++) {
                if (DitaUtils.hasClass(child, classNames[index])) {
                    return child;
                }
            }
            const found: DitaElement | undefined = DitaUtils.getDescendantByClass(child, fromIndex, classNames);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    static collapseWhitespace(value: string): string {
        let result: string = value.replace(/[ \t\r\n]+/g, " ");
        if (result.endsWith(" ")) {
            result = result.substring(0, result.length - 1);
        }
        if (result.startsWith(" ")) {
            result = result.substring(1);
        }
        return result;
    }

    static getSubRole(role: string | undefined): string {
        const subRoles: Map<string, string> = new Map([
            ["part", "chapter"],
            ["chapter", "section1"],
            ["section1", "section2"],
            ["section2", "section3"],
            ["section3", "section4"],
            ["section4", "section5"],
            ["section5", "section6"],
            ["section6", "section7"],
            ["section7", "section8"],
            ["section8", "section9"],
            ["section9", "section9"],
            ["appendices", "appendix"]
        ]);
        return role === undefined ? "section1" : subRoles.get(role) ?? "section1";
    }

    static isValidId(value: string): boolean {
        return XMLUtils.isValidNMTOKEN(value);
    }

    static makeUniqueId(candidate: string, used: Map<string, DitaElement>, element?: DitaElement): string {
        let id: string = candidate;
        let counter: number = 2;
        let existing: DitaElement | undefined = used.get(id);
        while (existing !== undefined && existing !== element) {
            if (counter >= 100) {
                do {
                    id = candidate + "-" + (++DitaUtils.radicalIdCounter).toString(36);
                    existing = used.get(id);
                } while (existing !== undefined && existing !== element);
                break;
            }
            id = candidate + "-" + counter.toString();
            counter++;
            existing = used.get(id);
        }
        if (element !== undefined) {
            used.set(id, element);
        }
        return id;
    }

    static readonly ROOT_ROLES: string[] = [
        "bookmap/toc",
        "bookmap/figurelist",
        "bookmap/tablelist",
        "bookmap/examplelist",
        "bookmap/equationlist",
        "bookmap/abbrevlist",
        "bookmap/trademarklist",
        "bookmap/bibliolist",
        "bookmap/glossarylist",
        "bookmap/indexlist",
        "bookmap/booklist", // Must be after the other *lists.
        "bookmap/notices",
        "bookmap/dedication",
        "bookmap/colophon",
        "bookmap/bookabstract",
        "bookmap/draftintro",
        "bookmap/preface",
        "bookmap/part",
        "bookmap/chapter",
        "bookmap/appendices",
        "bookmap/appendix",
        "bookmap/amendments"
    ];

    static getTopicrefHref(element: DitaElement): string | undefined {
        return DitaUtils.getNonEmptyAttribute(element, "href");
    }

    static getTopicrefParent(element: DitaElement): DitaElement | undefined {
        const parent: DitaElement | undefined = element.getParent();
        return parent !== undefined && DitaUtils.hasClass(parent, "map/topicref") ? parent : undefined;
    }

    static getTopicrefChildren(element: DitaElement): DitaElement[] {
        return element.getChildren().filter((child: DitaElement): boolean => DitaUtils.hasClass(child, "map/topicref"));
    }

    private static getTopicrefRawNavtitle(element: DitaElement): string | undefined {
        const topicmeta: DitaElement | undefined = DitaUtils.getChildByClass(element, "map/topicmeta");
        const navtitle: DitaElement | undefined = topicmeta === undefined
            ? undefined
            : DitaUtils.getChildByClass(topicmeta, "topic/navtitle");
        if (navtitle !== undefined) {
            const text: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(navtitle));
            if (text.length > 0) {
                return text;
            }
        }
        const attribute: string | undefined = DitaUtils.getNonEmptyAttribute(element, "navtitle");
        if (attribute !== undefined) {
            const text: string = DitaUtils.collapseWhitespace(attribute);
            if (text.length > 0) {
                return text;
            }
        }
        return undefined;
    }

    static getTopicrefNavtitle(element: DitaElement): string | undefined {
        const title: string | undefined = DitaUtils.getTopicrefRawNavtitle(element);
        return title !== undefined && DitaUtils.getNonEmptyAttribute(element, "locktitle") === "yes" ? title : undefined;
    }

    static getTopicrefRole(element: DitaElement): string {
        for (const cls of DitaUtils.ROOT_ROLES) {
            if (DitaUtils.hasClass(element, cls)) {
                return cls.slice(cls.lastIndexOf("/") + 1);
            }
        }
        if (DitaUtils.isTopicrefFrontmatterSection(element, "bookmap/frontmatter")) {
            // A plain topicref contained in frontmatter. Not a normal section1.
            return "frontmattersection";
        }
        if (DitaUtils.isTopicrefFrontmatterSection(element, "bookmap/backmatter")) {
            // A plain topicref contained in backmatter. Not a normal section1.
            return "backmattersection";
        }
        return "section1";
    }

    private static isTopicrefFrontmatterSection(element: DitaElement, frontmatterClass: string): boolean {
        const parent: DitaElement | undefined = DitaUtils.getTopicrefParent(element);
        if (parent !== undefined && DitaUtils.hasClass(parent, frontmatterClass)) {
            return true;
        }
        const grandparent: DitaElement | undefined = parent === undefined ? undefined : DitaUtils.getTopicrefParent(parent);
        if (parent !== undefined && grandparent !== undefined &&
            DitaUtils.hasClass(grandparent, frontmatterClass) &&
            DitaUtils.getNonEmptyAttribute(parent, "href") === undefined &&
            DitaUtils.getTopicrefRawNavtitle(parent) === undefined) {
            // topicref is contained in a dummy topicgroup (no href, no
            // navtitle) itself contained in frontmatter/backmatter.
            return true;
        }
        return false;
    }

    static getDescendants(element: DitaElement): DitaElement[] {
        const result: DitaElement[] = [];
        const children: DitaElement[] = element.getChildren();
        for (const child of children) {
            result.push(child);
            result.push(...DitaUtils.getDescendants(child));
        }
        return result;
    }

    static findById(root: DitaElement, id: string, includeSelf: boolean = true): DitaElement | undefined {
        if (includeSelf) {
            const rootId: XMLAttribute | undefined = root.getAttribute("id");
            if (rootId !== undefined && rootId.getValue().length > 0 && rootId.getValue().trim() === id) {
                return root;
            }
        }
        for (const element of DitaUtils.getDescendants(root)) {
            const elementId: XMLAttribute | undefined = element.getAttribute("id");
            if (elementId !== undefined && elementId.getValue().length > 0 && elementId.getValue().trim() === id) {
                return element;
            }
        }
        return undefined;
    }

    static cloneElement(element: DitaElement): DitaElement {
        const clone: DitaElement = new DitaElement(element.getName());
        const attributes: XMLAttribute[] = element.getAttributes();
        const clonedAttributes: XMLAttribute[] = [];
        for (const attribute of attributes) {
            clonedAttributes.push(new XMLAttribute(attribute.getName(), attribute.getValue()));
        }
        clone.setAttributes(clonedAttributes);

        const content: XMLNode[] = element.getContent();
        const clonedContent: XMLNode[] = [];
        for (const node of content) {
            if (node instanceof DitaElement) {
                clonedContent.push(DitaUtils.cloneElement(node));
            } else if (node instanceof ProcessingInstruction) {
                clonedContent.push(new ProcessingInstruction(node.getTarget(), node.getData()));
            } else if (node instanceof TextNode) {
                clonedContent.push(new TextNode(node.getValue()));
            } else {
                clonedContent.push(node);
            }
        }
        clone.setContent(clonedContent);
        return clone;
    }

    private static checkDomainsFlag: boolean | undefined;

    static checkDomains(superset: string, subset: string): boolean {
        if (DitaUtils.checkDomainsFlag === undefined) {
            const prop: string | undefined = process.env.DITAC_CHECK_DOMAINS;
            DitaUtils.checkDomainsFlag = (prop !== undefined && prop.length > 0);
        }
        if (DitaUtils.checkDomainsFlag) {
            return DitaUtils.doCheckDomains(superset, subset);
        }
        return true;
    }

    static doCheckDomains(superset: string, subset: string): boolean {
        const collapsedSuperset: string = DitaUtils.collapseWhitespace(superset);
        const collapsedSubset: string = DitaUtils.collapseWhitespace(subset);
        if (collapsedSuperset === collapsedSubset || collapsedSuperset.includes(collapsedSubset)) {
            return true;
        }
        const supersetList: string[] = DitaUtils.splitDomains(collapsedSuperset);
        const subsetList: string[] = DitaUtils.splitDomains(collapsedSubset);
        for (const domain1 of subsetList) {
            const domain2: string | undefined = DitaUtils.findDomain(supersetList, domain1);
            if (domain2 === undefined || !DitaUtils.domainIsLessConstrainedThan(domain2, domain1)) {
                return false;
            }
        }
        return true;
    }

    private static splitDomains(domains: string): string[] {
        const list: string[] = [];
        const count: number = domains.length;
        let start: number = -1;
        for (let i: number = 0; i < count; ++i) {
            const c: string = domains.charAt(i);
            switch (c) {
                case "(":
                    if (i === 0 || domains.charAt(i - 1) !== "a") {
                        start = i;
                    }
                    break;
                case ")":
                    if (start >= 0) {
                        if (i - start > 1) {
                            list.push(domains.substring(start, i + 1));
                        }
                        start = -1;
                    }
                    break;
            }
        }
        return list;
    }

    private static findDomain(list: string[], domain: string): string | undefined {
        for (const item of list) {
            if (item === domain) {
                return item;
            }
        }
        const domainParts: string[] = DitaUtils.splitDomain(domain);
        for (const item of list) {
            const itemParts: string[] = DitaUtils.splitDomain(item);
            let foundDomainParts: boolean = true;
            for (const domainPart of domainParts) {
                if (!domainPart.endsWith("-c")) {
                    let foundDomainPart: boolean = false;
                    for (const itemPart of itemParts) {
                        if (itemPart === domainPart) {
                            foundDomainPart = true;
                            break;
                        }
                    }
                    if (!foundDomainPart) {
                        foundDomainParts = false;
                        break;
                    }
                }
            }
            if (foundDomainParts) {
                return item;
            }
        }
        return undefined;
    }

    private static splitDomain(domain: string): string[] {
        return domain.substring(1, domain.length - 1).trim().split(/\s+/);
    }

    private static domainIsLessConstrainedThan(less: string, more: string): boolean {
        if (!less.includes("-c")) {
            return true;
        }
        const lessParts: string[] = DitaUtils.splitDomain(less);
        const moreParts: string[] = DitaUtils.splitDomain(more);
        for (const lessPart of lessParts) {
            if (lessPart.endsWith("-c")) {
                let foundLessPart: boolean = false;
                for (const morePart of moreParts) {
                    if (morePart === lessPart) {
                        foundLessPart = true;
                        break;
                    }
                }
                if (!foundLessPart) {
                    return false;
                }
            }
        }
        return true;
    }

    static getLocalTopicURL(topicref: DitaElement, i18n: I18n): string | undefined {
        try {
            return DitaUtils.doGetLocalTopicURL(topicref, i18n);
        } catch {
            return undefined;
        }
    }

    static doGetLocalTopicURL(topicref: DitaElement, i18n: I18n): string | undefined {
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "href");
        if (href === undefined) {
            return undefined;
        }
        const scope: string = DitaUtils.getScope(topicref, href);
        if (scope !== "local") {
            return undefined;
        }
        const format: string | undefined = DitaUtils.getFormat(topicref, href, scope);
        if (format === undefined) {
            throw new Error(i18n.format(i18n.getString("Filter", "missingAttribute"), ["format"]));
        }
        if (format !== "dita") {
            return undefined;
        }
        try {
            new URL(href);
        } catch {
            throw new Error(i18n.format(i18n.getString("Filter", "invalidAttribute"), [href, "href"]));
        }
        return href;
    }

    static generateId(prefix: string, element: DitaElement): string {
        const existing: string | undefined = DitaUtils.generatedIds.get(element);
        if (existing !== undefined) {
            return existing;
        }
        // Stable per-element counter; only needs to be unique and deterministic, not identity-hash-like.
        DitaUtils.nextGeneratedId++;
        const generated: string = prefix + "_" + DitaUtils.nextGeneratedId.toString(36) + "_";
        DitaUtils.generatedIds.set(element, generated);
        return generated;
    }

    static findDitavalrefs(element: DitaElement): DitaElement[] {
        const result: DitaElement[] = [];
        for (const child of element.getChildren()) {
            if (DitaUtils.isDitavalref(child)) {
                result.push(child);
            }
        }
        return result;
    }

    static isDitavalref(element: DitaElement): boolean {
        return DitaUtils.hasClass(element, "ditavalref-d/ditavalref");
    }

    static containsDitavalrefs(element: DitaElement): boolean {
        return DitaUtils.getDescendantByClass(element, 0, ["ditavalref-d/ditavalref"]) !== undefined;
    }
}

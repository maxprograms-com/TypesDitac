/*
 * Portions Copyright (c) 2018-2026 XMLmind Software. All rights reserved.
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

import { DitaElement } from "../../dom/DitaElement.js";
import { DiagnosticLog } from "../../utils/DiagnosticLog.js";
import { HtmlElement, HtmlNode, HtmlSupport } from "./HtmlSupport.js";
import { DitaBuilder } from "./DitaBuilder.js";
import { HDITATableConverter } from "./HDITATableConverter.js";

export interface HDITAContext {
    readonly documentNodes: HtmlNode[];
    readonly documentRoot: HtmlElement;
    readonly rootName: string;
    readonly documentPath: string;
    readonly diagnostics: DiagnosticLog;
}

const DIV_WRAPPED_ELEMENTS: string[] = [
    "address", "aside", "article", "section", "nav", "h1", "h2", "h3", "h4", "h5", "h6"
];

const PH_WRAPPED_ELEMENTS: string[] = ["bdi", "bdo", "mark", "big", "small", "time"];

const FLOW_CONTAINER_DESCENDANTS: string[] = [
    "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "nav", "aside", "header", "footer",
    "blockquote", "address", "hr", "p", "pre", "ul", "ol", "dl", "table", "figure", "fieldset",
    "form", "details", "dialog", "script", "template"
];

const FOOTNOTE_HOST_PARENTS: string[] = [
    "pre", "dd", "div", "td", "th", "figure", "li", "blockquote", "p", "span", "section"
];

const NO_IMAGE_PH_PARENTS: string[] = [
    "em", "strong", "dfn", "abbr", "acronym", "code", "var", "kdb", "samp",
    "cite", "b", "i", "q", "sub", "sup", "tt", "u", "s", "strike"
];

const META_NAMES_IN_PROLOG: string[] = [
    "description", "author", "source", "publisher", "dcterms.publisher", "created", "dcterms.created",
    "revised", "dcterms.modified", "permissions", "audience", "category", "keyword", "resourceid"
];

const ADMONITION_TYPES: string[] = [
    "note", "attention", "caution", "danger", "fastpath", "important",
    "notice", "remember", "restriction", "tip", "trouble", "warning"
];

export class HDITAConverter {
    private constructor() { }

    static checkId(text: string): string {
        const collapsed: string = HtmlSupport.normalizeSpace(text);
        const base: string = collapsed.length === 0 ? "_" : collapsed;
        const extras: string = String.fromCharCode(0x00B7, 0x203F, 0x2040);
        const pattern: RegExp = new RegExp("[^\\p{L}\\p{N}\\p{M}_.:" + extras + "-]+", "gu");
        const sanitized: string = base.replace(pattern, "_");
        return /^[\p{L}_:]/u.test(sanitized) ? sanitized : "_" + sanitized;
    }

    static processCommonAttributes0(source: HtmlElement, target: DitaElement): void {
        DitaBuilder.setAttr(target, "xml:lang", HtmlSupport.nonEmptyAttribute(source, "lang"));

        const translate: string | undefined = HtmlSupport.attribute(source, "translate");
        if (translate === "" || translate === "no" || translate === "yes") {
            DitaBuilder.setAttr(target, "translate", translate === "" ? "yes" : translate);
        }

        const dir: string | undefined = HtmlSupport.attribute(source, "dir");
        if (dir === "rtl" || dir === "ltr") {
            DitaBuilder.setAttr(target, "dir", dir);
        }

        DitaBuilder.setAttr(target, "props", HtmlSupport.nonEmptyAttribute(source, "data-props"));
        DitaBuilder.setAttr(target, "conref", HtmlSupport.nonEmptyAttribute(source, "data-conref"));
    }

    static processCommonAttributes1(source: HtmlElement, target: DitaElement): void {
        DitaBuilder.setAttr(target, "id", HtmlSupport.nonEmptyAttribute(source, "id"));
        HDITAConverter.processCommonAttributes0(source, target);
    }

    static processCommonAttributes(
        source: HtmlElement,
        target: DitaElement,
        ctx: HDITAContext,
        addRole: boolean = false
    ): void {
        HDITAConverter.processCommonAttributes1(source, target);

        const rawClass: string = HtmlSupport.attribute(source, "class") ?? "";
        let effectiveClass: string = rawClass;
        const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, source);
        const grandparent: HtmlElement | undefined = parent === undefined
            ? undefined
            : HtmlSupport.parentElement(ctx.documentRoot, parent);
        if (source.tagName === "h1" && parent?.tagName === "article" && grandparent?.tagName === "body") {
            effectiveClass = rawClass.replace(/(^|\s+)(map|topic|concept|task|reference)(\s+|$)/, " ").trim();
        } else if (source.tagName === "h2" && parent?.tagName === "article" && grandparent?.tagName === "body") {
            effectiveClass = rawClass.replace(/(^|\s+)(section|example)(\s+|$)/, " ").trim();
        }

        if (effectiveClass !== "" || addRole) {
            const outputclass: string = addRole
                ? HtmlSupport.normalizeSpace(effectiveClass + " role-" + source.tagName)
                : effectiveClass;
            DitaBuilder.setAttr(target, "outputclass", outputclass);
        }
    }

    static processLinkAttributes(source: HtmlElement, target: DitaElement): void {
        DitaBuilder.setAttr(target, "format", HtmlSupport.nonEmptyAttribute(source, "type"));
        DitaBuilder.setAttr(target, "scope", HtmlSupport.nonEmptyAttribute(source, "rel"));
    }

    static processKeyrefAttribute(source: HtmlElement, target: DitaElement): void {
        DitaBuilder.setAttr(target, "keyref", HtmlSupport.nonEmptyAttribute(source, "data-keyref"));
    }

    private static inheritedLang(source: HtmlElement, ctx: HDITAContext): string | undefined {
        let current: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, source);
        const chain: HtmlElement[] = [];
        while (current !== undefined) {
            chain.push(current);
            current = HtmlSupport.parentElement(ctx.documentRoot, current);
        }
        for (let index: number = chain.length - 1; index >= 0; index--) {
            const lang: string | undefined = HtmlSupport.nonEmptyAttribute(chain[index], "lang");
            if (lang !== undefined) {
                return lang;
            }
        }
        return undefined;
    }

    static processTopicArticle(article: HtmlElement, ctx: HDITAContext): DitaElement {
        const h1: HtmlElement | undefined = HtmlSupport.firstChildElement(article)?.tagName === "h1"
            ? HtmlSupport.firstChildElement(article)
            : undefined;
        const h1Classes: string[] = h1 === undefined ? [] : HtmlSupport.classTokens(h1);

        const isConcept: boolean = HtmlSupport.attribute(article, "data-class") === "concept" || h1Classes.includes("concept");
        const topicName: string = isConcept ? "concept" : "topic";
        const bodyName: string = isConcept ? "conbody" : "body";

        const root: DitaElement = DitaBuilder.createElement(topicName);
        HDITAConverter.processCommonAttributes(article, root, ctx);

        if (HtmlSupport.attribute(article, "lang") === undefined) {
            DitaBuilder.setAttr(root, "xml:lang", HDITAConverter.inheritedLang(article, ctx));
        }

        const idAttr: string | undefined = HtmlSupport.attribute(article, "id");
        if (idAttr === undefined || idAttr === "???") {
            DitaBuilder.setAttr(root, "id", HtmlSupport.normalizeSpace(ctx.rootName) !== ""
                ? HDITAConverter.checkId(ctx.rootName)
                : topicName);
        }

        const kids: HtmlElement[] = HtmlSupport.childElements(article);
        if (h1 !== undefined) {
            root.addElement(HDITAConverter.processTitle(h1, ctx));
            const second: HtmlElement | undefined = kids[1];
            const p: HtmlElement | undefined = second?.tagName === "p" ? second : undefined;
            const shortdesc: DitaElement | undefined = HDITAConverter.processDescription(p, ctx);
            if (shortdesc !== undefined) {
                root.addElement(shortdesc);
            }
            const meta: DitaElement | undefined = HDITAConverter.processMeta(ctx);
            if (meta !== undefined) {
                root.addElement(meta);
            }
            root.addElement(HDITAConverter.processTopicBody(article, bodyName, p !== undefined ? 2 : 1, ctx));
        } else {
            const html: HtmlElement | undefined = HtmlSupport.firstElementNamed(ctx.documentNodes, "html");
            const head: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(html), "head");
            const title: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(head), "title");
            if (title !== undefined) {
                const titleElement: DitaElement = DitaBuilder.createElement("title");
                DitaBuilder.addText(titleElement, HtmlSupport.textContent(title));
                root.addElement(titleElement);
            }
            const first: HtmlElement | undefined = kids[0];
            const p: HtmlElement | undefined = first?.tagName === "p" ? first : undefined;
            const shortdesc: DitaElement | undefined = HDITAConverter.processDescription(p, ctx);
            if (shortdesc !== undefined) {
                root.addElement(shortdesc);
            }
            const meta: DitaElement | undefined = HDITAConverter.processMeta(ctx);
            if (meta !== undefined) {
                root.addElement(meta);
            }
            root.addElement(HDITAConverter.processTopicBody(article, bodyName, p !== undefined ? 1 : 0, ctx));
        }

        return root;
    }

    static processTitle(element: HtmlElement, ctx: HDITAContext): DitaElement {
        const title: DitaElement = DitaBuilder.createElement("title");
        HDITAConverter.processCommonAttributes(element, title, ctx);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(element), title, ctx);
        return title;
    }

    private static processDescription(firstP: HtmlElement | undefined, ctx: HDITAContext): DitaElement | undefined {
        if (firstP !== undefined) {
            if (HtmlSupport.children(firstP).length === 0) {
                return undefined;
            }
            return HDITAConverter.processShortdesc(firstP, ctx);
        }
        const description: HtmlElement | undefined = HDITAConverter.firstMeta(ctx, ["description"]);
        if (description === undefined) {
            return undefined;
        }
        const shortdesc: DitaElement = DitaBuilder.createElement("shortdesc");
        DitaBuilder.addText(shortdesc, HtmlSupport.attribute(description, "content") ?? "");
        return shortdesc;
    }

    private static processShortdesc(element: HtmlElement, ctx: HDITAContext): DitaElement {
        const shortdesc: DitaElement = DitaBuilder.createElement("shortdesc");
        HDITAConverter.processCommonAttributes(element, shortdesc, ctx);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(element), shortdesc, ctx);
        return shortdesc;
    }

    private static allMetas(ctx: HDITAContext): HtmlElement[] {
        const head: HtmlElement | undefined = HtmlSupport.firstElementNamed(ctx.documentNodes, "head");
        return HtmlSupport.childElements(head).filter(
            (element): boolean => element.tagName === "meta" && HtmlSupport.attribute(element, "name") !== undefined
        );
    }

    private static metasNamed(ctx: HDITAContext, names: string[]): HtmlElement[] {
        return HDITAConverter.allMetas(ctx).filter((meta): boolean => names.includes(HtmlSupport.attribute(meta, "name") ?? ""));
    }

    private static firstMeta(ctx: HDITAContext, names: string[]): HtmlElement | undefined {
        return HDITAConverter.metasNamed(ctx, names)[0];
    }

    static processMeta(ctx: HDITAContext): DitaElement | undefined {
        const prolog: DitaElement = DitaBuilder.createElement("prolog");
        HDITAConverter.appendMetaContent(prolog, ctx);
        return prolog.getChildren().length === 0 ? undefined : prolog;
    }

    private static appendMetaContent(prolog: DitaElement, ctx: HDITAContext): void {
        for (const meta of HDITAConverter.metasNamed(ctx, ["author"])) {
            prolog.addElement(HDITAConverter.convertMeta(meta));
        }
        const source: HtmlElement | undefined = HDITAConverter.firstMeta(ctx, ["source"]);
        if (source !== undefined) {
            prolog.addElement(HDITAConverter.convertMeta(source));
        }
        const publisher: HtmlElement | undefined = HDITAConverter.firstMeta(ctx, ["publisher", "dcterms.publisher"]);
        if (publisher !== undefined) {
            prolog.addElement(HDITAConverter.convertMeta(publisher));
        }
        if (HDITAConverter.metasNamed(ctx, ["created", "dcterms.created", "revised", "dcterms.modified"]).length > 0) {
            const critdates: DitaElement = DitaBuilder.createElement("critdates");
            const created: HtmlElement | undefined = HDITAConverter.firstMeta(ctx, ["created", "dcterms.created"]);
            if (created !== undefined) {
                critdates.addElement(HDITAConverter.convertMeta(created));
            }
            for (const revised of HDITAConverter.metasNamed(ctx, ["revised", "dcterms.modified"])) {
                critdates.addElement(HDITAConverter.convertMeta(revised));
            }
            prolog.addElement(critdates);
        }
        const permissions: HtmlElement | undefined = HDITAConverter.firstMeta(ctx, ["permissions"]);
        if (permissions !== undefined) {
            prolog.addElement(HDITAConverter.convertMeta(permissions));
        }
        if (HDITAConverter.metasNamed(ctx, ["audience", "category", "keyword"]).length > 0) {
            const metadata: DitaElement = DitaBuilder.createElement("metadata");
            for (const audience of HDITAConverter.metasNamed(ctx, ["audience"])) {
                metadata.addElement(HDITAConverter.convertMeta(audience));
            }
            for (const category of HDITAConverter.metasNamed(ctx, ["category"])) {
                metadata.addElement(HDITAConverter.convertMeta(category));
            }
            const keywordMetas: HtmlElement[] = HDITAConverter.metasNamed(ctx, ["keyword"]);
            if (keywordMetas.length > 0) {
                const keywords: DitaElement = DitaBuilder.createElement("keywords");
                for (const keyword of keywordMetas) {
                    keywords.addElement(HDITAConverter.convertMeta(keyword));
                }
                metadata.addElement(keywords);
            }
            prolog.addElement(metadata);
        }
        for (const resourceid of HDITAConverter.metasNamed(ctx, ["resourceid"])) {
            prolog.addElement(HDITAConverter.convertMeta(resourceid));
        }
        for (const other of HDITAConverter.allMetas(ctx).filter(
            (meta): boolean => !META_NAMES_IN_PROLOG.includes(HtmlSupport.attribute(meta, "name") ?? "")
        )) {
            prolog.addElement(HDITAConverter.convertMeta(other));
        }
    }

    private static convertMeta(meta: HtmlElement): DitaElement {
        const name: string = HtmlSupport.attribute(meta, "name") ?? "";
        const content: string = HtmlSupport.normalizeSpace(HtmlSupport.attribute(meta, "content") ?? "");
        if (name === "author" || name === "source" || name === "category" || name === "keyword") {
            const element: DitaElement = DitaBuilder.createElement(name);
            DitaBuilder.addText(element, content);
            return element;
        }
        if (name === "publisher" || name === "dcterms.publisher") {
            const element: DitaElement = DitaBuilder.createElement("publisher");
            DitaBuilder.addText(element, content);
            return element;
        }
        if (name === "created" || name === "dcterms.created") {
            const element: DitaElement = DitaBuilder.createElement("created");
            DitaBuilder.setAttr(element, "date", content);
            return element;
        }
        if (name === "revised" || name === "dcterms.modified") {
            const element: DitaElement = DitaBuilder.createElement("revised");
            DitaBuilder.setAttr(element, "modified", content);
            return element;
        }
        if (name === "permissions") {
            const element: DitaElement = DitaBuilder.createElement("permissions");
            DitaBuilder.setAttr(element, "view", content);
            return element;
        }
        if (name === "audience") {
            const element: DitaElement = DitaBuilder.createElement("audience");
            DitaBuilder.setAttr(element, "type", content);
            return element;
        }
        if (name === "resourceid") {
            const element: DitaElement = DitaBuilder.createElement("resourceid");
            DitaBuilder.setAttr(element, "appid", content);
            return element;
        }
        const data: DitaElement = DitaBuilder.createElement("data");
        DitaBuilder.setAttr(data, "name", name);
        DitaBuilder.setAttr(data, "value", content);
        return data;
    }

    private static processTopicBody(article: HtmlElement, bodyName: string, after: number, ctx: HDITAContext): DitaElement {
        const body: DitaElement = DitaBuilder.createElement(bodyName);
        const rest: HtmlElement[] = HtmlSupport.childElements(article).slice(after);
        const firstH2Index: number = rest.findIndex((element): boolean => element.tagName === "h2");

        if (firstH2Index < 0) {
            HDITAConverter.applyTemplatesInto(rest, body, ctx);
            return body;
        }

        HDITAConverter.applyTemplatesInto(rest.slice(0, firstH2Index), body, ctx);

        let index: number = firstH2Index;
        while (index < rest.length) {
            const heading: HtmlElement = rest[index];
            let end: number = index + 1;
            while (end < rest.length && rest[end].tagName !== "h2") {
                end++;
            }
            const sectionName: string = HtmlSupport.hasClassToken(heading, "example") ? "example" : "section";
            const section: DitaElement = DitaBuilder.createElement(sectionName);
            section.addElement(HDITAConverter.processTitle(heading, ctx));
            HDITAConverter.applyTemplatesInto(rest.slice(index + 1, end), section, ctx);
            body.addElement(section);
            index = end;
        }

        return body;
    }

    private static processTopLevelSection(section: HtmlElement, ctx: HDITAContext): DitaElement {
        const sectionName: string = HtmlSupport.attribute(section, "data-class") === "example" ? "example" : "section";
        const result: DitaElement = DitaBuilder.createElement(sectionName);
        HDITAConverter.processCommonAttributes(section, result, ctx);

        const kids: HtmlElement[] = HtmlSupport.childElements(section);
        const heading: HtmlElement | undefined = kids[0] !== undefined && /^h[1-6]$/.test(kids[0].tagName)
            ? kids[0]
            : undefined;
        if (heading !== undefined) {
            result.addElement(HDITAConverter.processTitle(heading, ctx));
            HDITAConverter.applyTemplatesInto(kids.slice(1), result, ctx);
        } else {
            HDITAConverter.applyTemplatesInto(HtmlSupport.children(section), result, ctx);
        }
        return result;
    }

    private static processDefinitionList(dl: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("dl");
        HDITAConverter.processCommonAttributes(dl, result, ctx);

        const terms: HtmlElement[] = HtmlSupport.childElements(dl).filter(
            (el): boolean => el.tagName === "dt" || el.tagName === "dd"
        );
        let groupStart: number = 0;
        for (let index: number = 1; index <= terms.length; index++) {
            const isBoundary: boolean = index === terms.length ||
                (terms[index].tagName === "dt" && terms[index - 1].tagName === "dd");
            if (isBoundary) {
                const entry: DitaElement = DitaBuilder.createElement("dlentry");
                HDITAConverter.applyTemplatesInto(terms.slice(groupStart, index), entry, ctx);
                result.addElement(entry);
                groupStart = index;
            }
        }
        return result;
    }

    private static processOrderedList(ol: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("ol");
        HDITAConverter.processCommonAttributes(ol, result, ctx);

        const type: string | undefined = HtmlSupport.attribute(ol, "type");
        const start: string | undefined = HtmlSupport.attribute(ol, "start");
        if (type !== undefined || start !== undefined) {
            let piece: string = "";
            if (type !== undefined) {
                piece = type === "a" ? "lower-alpha"
                    : type === "A" ? "upper-alpha"
                        : type === "i" ? "lower-roman"
                            : type === "I" ? "upper-roman"
                                : "decimal";
            }
            piece += " ";
            if (start !== undefined && Number(start) >= 0) {
                piece += "start(" + start + ")";
            }
            DitaBuilder.setAttr(result, "outputclass", HtmlSupport.normalizeSpace((HtmlSupport.attribute(ol, "class") ?? "") + " " + piece));
        }
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(ol), result, ctx);
        return result;
    }

    private static processFigure(figure: HtmlElement, ctx: HDITAContext): DitaElement {
        const fig: DitaElement = DitaBuilder.createElement("fig");
        HDITAConverter.processCommonAttributes(figure, fig, ctx);
        const caption: HtmlElement | undefined = HtmlSupport.childElements(figure).find((el): boolean => el.tagName === "figcaption");
        if (caption !== undefined) {
            fig.addElement(HDITAConverter.processTitle(caption, ctx));
        }
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(figure).filter((node): boolean => node !== caption), fig, ctx);
        return fig;
    }

    private static processNote(div: HtmlElement, ctx: HDITAContext): DitaElement {
        const note: DitaElement = DitaBuilder.createElement("note");
        const type: string | undefined = HtmlSupport.attribute(div, "data-type");
        if (type !== undefined && ADMONITION_TYPES.includes(type)) {
            DitaBuilder.setAttr(note, "type", type);
        }
        HDITAConverter.processCommonAttributes(div, note, ctx);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(div), note, ctx);
        return note;
    }

    private static processBlockquote(blockquote: HtmlElement, ctx: HDITAContext): DitaElement {
        const lq: DitaElement = DitaBuilder.createElement("lq");
        HDITAConverter.processCommonAttributes(blockquote, lq, ctx);
        HDITAConverter.processKeyrefAttribute(blockquote, lq);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(blockquote), lq, ctx);
        return lq;
    }

    private static processPre(pre: HtmlElement, ctx: HDITAContext): DitaElement {
        const code: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(pre), "code");
        if (code !== undefined && HtmlSupport.children(pre).length === 1) {
            const codeblock: DitaElement = DitaBuilder.createElement("codeblock");
            HDITAConverter.processCommonAttributes(pre, codeblock, ctx);
            HDITAConverter.applyTemplatesInto(HtmlSupport.children(code), codeblock, ctx);
            return codeblock;
        }
        const preElement: DitaElement = DitaBuilder.createElement("pre");
        HDITAConverter.processCommonAttributes(pre, preElement, ctx);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(pre), preElement, ctx);
        return preElement;
    }

    private static processFootnoteDiv(div: HtmlElement, ctx: HDITAContext): DitaElement {
        const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, div);
        const fn: DitaElement = HDITAConverter.processFootnote(div, ctx);
        if (parent !== undefined && FOOTNOTE_HOST_PARENTS.includes(parent.tagName)) {
            return fn;
        }
        const wrapper: DitaElement = DitaBuilder.createElement("div");
        wrapper.addElement(fn);
        return wrapper;
    }

    private static processFootnoteSpan(span: HtmlElement, ctx: HDITAContext): DitaElement {
        const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, span);
        const fn: DitaElement = HDITAConverter.processFootnote(span, ctx);
        if (parent !== undefined && FOOTNOTE_HOST_PARENTS.includes(parent.tagName)) {
            return fn;
        }
        const wrapper: DitaElement = DitaBuilder.createElement("ph");
        wrapper.addElement(fn);
        return wrapper;
    }

    private static processFootnote(element: HtmlElement, ctx: HDITAContext): DitaElement {
        const fn: DitaElement = DitaBuilder.createElement("fn");
        HDITAConverter.processCommonAttributes0(element, fn);
        const id: string | undefined = HtmlSupport.attribute(element, "id");
        if (id !== undefined) {
            const pattern: RegExp = new RegExp("^(?:[^/]+/)?" + id + "$");
            const hasMatchingLink: boolean = HDITAConverter.descendantsInDocument(ctx, "a").some((a): boolean => {
                const href: string = HtmlSupport.attribute(a, "href") ?? "";
                return pattern.test(href.startsWith("#") ? href.slice(1) : href);
            });
            if (hasMatchingLink) {
                DitaBuilder.setAttr(fn, "id", id);
            }
        }
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(element), fn, ctx);
        return fn;
    }

    private static descendantsInDocument(ctx: HDITAContext, tagName: string): HtmlElement[] {
        const results: HtmlElement[] = [];
        for (const node of ctx.documentNodes) {
            if (HtmlSupport.isElement(node)) {
                if (node.tagName === tagName) {
                    results.push(node);
                }
                results.push(...HtmlSupport.descendantsNamed(node, tagName));
            }
        }
        return results;
    }

    private static findById(ctx: HDITAContext, id: string): HtmlElement | undefined {
        for (const node of ctx.documentNodes) {
            if (HtmlSupport.isElement(node)) {
                if (HtmlSupport.attribute(node, "id") === id) {
                    return node;
                }
                const found: HtmlElement | undefined = HDITAConverter.findByIdIn(node, id);
                if (found !== undefined) {
                    return found;
                }
            }
        }
        return undefined;
    }

    private static findByIdIn(element: HtmlElement, id: string): HtmlElement | undefined {
        for (const child of HtmlSupport.childElements(element)) {
            if (HtmlSupport.attribute(child, "id") === id) {
                return child;
            }
            const found: HtmlElement | undefined = HDITAConverter.findByIdIn(child, id);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private static processAnchor(a: HtmlElement, ctx: HDITAContext): DitaElement {
        const href: string | undefined = HtmlSupport.attribute(a, "href");
        if (href === undefined) {
            const ph: DitaElement = DitaBuilder.createElement("ph");
            HDITAConverter.processCommonAttributes(a, ph, ctx);
            HDITAConverter.processKeyrefAttribute(a, ph);
            HDITAConverter.applyTemplatesInto(HtmlSupport.children(a), ph, ctx);
            return ph;
        }

        const xref: DitaElement = DitaBuilder.createElement("xref");
        const dataKeyref: string | undefined = HtmlSupport.nonEmptyAttribute(a, "data-keyref");
        const isMDITAKeyRef: boolean = dataKeyref !== undefined && href === "#" &&
            HtmlSupport.normalizeSpace(HtmlSupport.textContent(a)) === dataKeyref;

        const normalizedHref: string = href.startsWith("#")
            ? (href.includes("/") ? href : "#./" + href.slice(1))
            : href;

        if (!isMDITAKeyRef) {
            DitaBuilder.setAttr(xref, "href", normalizedHref);
        }

        HDITAConverter.processCommonAttributes(a, xref, ctx);
        HDITAConverter.processLinkAttributes(a, xref);
        HDITAConverter.processKeyrefAttribute(a, xref);

        let type: string = "";
        if (normalizedHref.startsWith("#")) {
            const ref: string = normalizedHref.includes("/")
                ? normalizedHref.slice(normalizedHref.indexOf("/") + 1)
                : normalizedHref.slice(1);
            const target: HtmlElement | undefined = HDITAConverter.findById(ctx, ref);
            if (target !== undefined && HtmlSupport.attribute(target, "data-class") === "fn" &&
                (target.tagName === "span" || target.tagName === "div")) {
                type = "fn";
            }
        }

        if (type !== "") {
            DitaBuilder.setAttr(xref, "type", type);
        } else if (!isMDITAKeyRef) {
            HDITAConverter.applyTemplatesInto(HtmlSupport.children(a), xref, ctx);
        }

        return xref;
    }

    private static processObject(object: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("object");
        HDITAConverter.processCommonAttributes(object, result, ctx);
        for (const name of ["data", "type", "name", "tabindex"]) {
            DitaBuilder.setAttr(result, name, HtmlSupport.attribute(object, name));
        }
        HDITAConverter.processMediaContent0(object, result);
        HDITAConverter.applyTemplatesInto(HtmlSupport.childElements(object).filter((el): boolean => el.tagName === "param"), result, ctx);
        return result;
    }

    private static processMediaContent0(source: HtmlElement, target: DitaElement): void {
        for (const name of ["width", "height"]) {
            const value: string | undefined = HtmlSupport.attribute(source, name);
            if (value !== undefined && Number(value) > 0) {
                DitaBuilder.setAttr(target, name, value);
            }
        }
        const title: string | undefined = HtmlSupport.nonEmptyAttribute(source, "title");
        if (title !== undefined) {
            const desc: DitaElement = DitaBuilder.createElement("desc");
            DitaBuilder.addText(desc, title);
            target.addElement(desc);
        }
    }

    private static processParam(param: HtmlElement): DitaElement | undefined {
        if (HtmlSupport.attribute(param, "name") === undefined) {
            return undefined;
        }
        const result: DitaElement = DitaBuilder.createElement("param");
        HDITAConverter.processCommonAttributes1(param, result);
        DitaBuilder.setAttr(result, "name", HtmlSupport.attribute(param, "name"));
        DitaBuilder.setAttr(result, "value", HtmlSupport.attribute(param, "value"));
        return result;
    }

    private static mediaSourceElement(name: string, value: string | undefined): DitaElement {
        const el: DitaElement = DitaBuilder.createElement("media-source", "+ topic/param media-d/media-source ");
        DitaBuilder.setAttr(el, "name", name);
        DitaBuilder.setAttr(el, "value", value);
        return el;
    }

    private static mediaTrackElement(element: HtmlElement): DitaElement {
        const el: DitaElement = DitaBuilder.createElement("media-track", "+ topic/param media-d/media-track ");
        DitaBuilder.setAttr(el, "name", "track");
        DitaBuilder.setAttr(el, "value", HtmlSupport.attribute(element, "src"));
        DitaBuilder.setAttr(el, "type", HtmlSupport.nonEmptyAttribute(element, "kind"));
        return el;
    }

    private static processMediaContent(source: HtmlElement, target: DitaElement): void {
        HDITAConverter.processMediaContent0(source, target);
        const poster: string | undefined = HtmlSupport.nonEmptyAttribute(source, "poster");
        if (poster !== undefined) {
            const el: DitaElement = DitaBuilder.createElement("video-poster", "+ topic/param media-d/video-poster ");
            DitaBuilder.setAttr(el, "name", "poster");
            DitaBuilder.setAttr(el, "value", poster);
            target.addElement(el);
        }
        for (const [attr, name, className] of [
            ["controls", "media-controls", "+ topic/param media-d/media-controls "],
            ["autoplay", "media-autoplay", "+ topic/param media-d/media-autoplay "],
            ["loop", "media-loop", "+ topic/param media-d/media-loop "],
            ["muted", "media-muted", "+ topic/param media-d/media-muted "]
        ]) {
            if (HtmlSupport.attribute(source, attr) !== undefined) {
                const el: DitaElement = DitaBuilder.createElement(name, className);
                DitaBuilder.setAttr(el, "name", attr);
                DitaBuilder.setAttr(el, "value", "true");
                target.addElement(el);
            }
        }
        const src: string | undefined = HtmlSupport.nonEmptyAttribute(source, "src");
        if (src !== undefined) {
            target.addElement(HDITAConverter.mediaSourceElement("source", src));
        }
        for (const sourceEl of HtmlSupport.childElements(source).filter(
            (el): boolean => el.tagName === "source" && HtmlSupport.attribute(el, "src") !== undefined
        )) {
            target.addElement(HDITAConverter.mediaSourceElement("source", HtmlSupport.attribute(sourceEl, "src")));
        }
        for (const trackEl of HtmlSupport.childElements(source).filter(
            (el): boolean => el.tagName === "track" && HtmlSupport.attribute(el, "src") !== undefined
        )) {
            target.addElement(HDITAConverter.mediaTrackElement(trackEl));
        }
    }

    private static processAudio(audio: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("audio", "+ topic/object media-d/audio ");
        HDITAConverter.processCommonAttributes(audio, result, ctx);
        HDITAConverter.processMediaContent(audio, result);
        return result;
    }

    private static processVideo(video: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement("video", "+ topic/object media-d/video ");
        HDITAConverter.processCommonAttributes(video, result, ctx);
        HDITAConverter.processMediaContent(video, result);
        return result;
    }

    private static processImage(img: HtmlElement, ctx: HDITAContext, placement: string = ""): DitaElement {
        const image: DitaElement = DitaBuilder.createElement("image");
        HDITAConverter.processCommonAttributes(img, image, ctx);
        HDITAConverter.processKeyrefAttribute(img, image);

        const dataKeyref: string | undefined = HtmlSupport.nonEmptyAttribute(img, "data-keyref");
        const alt: string | undefined = HtmlSupport.attribute(img, "alt");
        const isMDITAKeyRef: boolean = dataKeyref !== undefined && HtmlSupport.attribute(img, "src") === "#" &&
            HtmlSupport.normalizeSpace(alt ?? "") === dataKeyref;

        if (!isMDITAKeyRef) {
            DitaBuilder.setAttr(image, "href", HtmlSupport.attribute(img, "src"));
        }
        for (const name of ["width", "height"]) {
            const value: string | undefined = HtmlSupport.attribute(img, name);
            if (value !== undefined && Number(value) > 0) {
                DitaBuilder.setAttr(image, name, value);
            }
        }
        const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, img);
        const placement2: string = placement !== "" ? placement : (parent?.tagName === "figure" ? "break" : "");
        if (placement2 !== "") {
            DitaBuilder.setAttr(image, "placement", placement2);
        }
        if (alt !== undefined && alt !== "" && !isMDITAKeyRef) {
            const altElement: DitaElement = DitaBuilder.createElement("alt");
            DitaBuilder.addText(altElement, alt);
            image.addElement(altElement);
        }
        return image;
    }

    private static processImgElement(img: HtmlElement, ctx: HDITAContext): DitaElement {
        const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, img);
        if (parent !== undefined && NO_IMAGE_PH_PARENTS.includes(parent.tagName)) {
            const ph: DitaElement = DitaBuilder.createElement("ph");
            ph.addElement(HDITAConverter.processImage(img, ctx));
            return ph;
        }
        return HDITAConverter.processImage(img, ctx);
    }

    private static processImageParagraph(p: HtmlElement, ctx: HDITAContext): DitaElement {
        const img: HtmlElement = HtmlSupport.firstElementNamed(HtmlSupport.children(p), "img") as HtmlElement;
        const title: string = HtmlSupport.normalizeSpace(HtmlSupport.attribute(img, "title") ?? "");
        if (title !== "") {
            const fig: DitaElement = DitaBuilder.createElement("fig");
            const titleElement: DitaElement = DitaBuilder.createElement("title");
            DitaBuilder.addText(titleElement, title);
            fig.addElement(titleElement);
            fig.addElement(HDITAConverter.processImage(img, ctx, "break"));
            return fig;
        }
        return HDITAConverter.processImage(img, ctx, "break");
    }

    private static isImageOnlyParagraph(p: HtmlElement): boolean {
        const nodes: HtmlNode[] = HtmlSupport.children(p);
        return nodes.length === 1 && HtmlSupport.isElement(nodes[0]) && nodes[0].tagName === "img" && p.attrs.length === 0;
    }

    private static wrapGeneric(
        name: string,
        source: HtmlElement,
        ctx: HDITAContext,
        addRole: boolean = false
    ): DitaElement {
        const result: DitaElement = DitaBuilder.createElement(name);
        HDITAConverter.processCommonAttributes(source, result, ctx, addRole);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(source), result, ctx);
        return result;
    }

    private static wrapGenericWithKeyref(name: string, source: HtmlElement, ctx: HDITAContext): DitaElement {
        const result: DitaElement = DitaBuilder.createElement(name);
        HDITAConverter.processCommonAttributes(source, result, ctx);
        HDITAConverter.processKeyrefAttribute(source, result);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(source), result, ctx);
        return result;
    }

    static applyTemplate(node: HtmlNode, ctx: HDITAContext): DitaElement | string | undefined {
        if (HtmlSupport.isTextNode(node)) {
            return node.value;
        }
        if (!HtmlSupport.isElement(node)) {
            return undefined;
        }
        const element: HtmlElement = node;
        const name: string = element.tagName;

        if (name === "p" && HDITAConverter.isImageOnlyParagraph(element)) {
            return HDITAConverter.processImageParagraph(element, ctx);
        }

        if (name === "table") {
            const parent: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, element);
            const table: DitaElement = HDITATableConverter.processTable(element, ctx);
            if (parent !== undefined && (parent.tagName === "td" || parent.tagName === "th" || parent.tagName === "figure" ||
                (parent.tagName === "div" && HtmlSupport.attribute(parent, "data-class") === "fn"))) {
                const p: DitaElement = DitaBuilder.createElement("p");
                p.addElement(table);
                return p;
            }
            return table;
        }

        switch (name) {
            case "dl": return HDITAConverter.processDefinitionList(element, ctx);
            case "ol": return HDITAConverter.processOrderedList(element, ctx);
            case "figure": return HDITAConverter.processFigure(element, ctx);
            case "blockquote": return HDITAConverter.processBlockquote(element, ctx);
            case "pre": return HDITAConverter.processPre(element, ctx);
            case "a": return HDITAConverter.processAnchor(element, ctx);
            case "object": return HDITAConverter.processObject(element, ctx);
            case "param": return HDITAConverter.processParam(element);
            case "audio": return HDITAConverter.processAudio(element, ctx);
            case "video": return HDITAConverter.processVideo(element, ctx);
            case "img": return HDITAConverter.processImgElement(element, ctx);
            case "source":
                return HtmlSupport.attribute(element, "src") !== undefined
                    ? HDITAConverter.mediaSourceElement("source", HtmlSupport.attribute(element, "src"))
                    : undefined;
            case "track":
                return HtmlSupport.attribute(element, "src") !== undefined ? HDITAConverter.mediaTrackElement(element) : undefined;
            case "strong": case "b": return HDITAConverter.wrapGeneric("b", element, ctx);
            case "em": case "i": return HDITAConverter.wrapGeneric("i", element, ctx);
            case "span":
                if (HtmlSupport.attribute(element, "data-class") === "fn") {
                    return HDITAConverter.processFootnoteSpan(element, ctx);
                }
                return HDITAConverter.wrapGenericWithKeyref("ph", element, ctx);
            case "s": case "strike": return HDITAConverter.wrapGeneric("line-through", element, ctx);
            case "dfn": return HDITAConverter.wrapGenericWithKeyref("term", element, ctx);
            case "abbr": case "acronym": return HDITAConverter.wrapGenericWithKeyref("keyword", element, ctx);
            case "code": return HDITAConverter.wrapGenericWithKeyref("codeph", element, ctx);
            case "var": return HDITAConverter.wrapGenericWithKeyref("varname", element, ctx);
            case "kbd": return HDITAConverter.wrapGenericWithKeyref("userinput", element, ctx);
            case "samp": return HDITAConverter.wrapGenericWithKeyref("systemoutput", element, ctx);
            case "cite": return HDITAConverter.wrapGenericWithKeyref("cite", element, ctx);
            case "dt": return HDITAConverter.wrapGenericWithKeyref("dt", element, ctx);
            case "dd": return HDITAConverter.wrapGeneric("dd", element, ctx);
            case "li": return HDITAConverter.wrapGeneric("li", element, ctx);
            case "div":
                if (HtmlSupport.attribute(element, "data-class") === "note") {
                    return HDITAConverter.processNote(element, ctx);
                }
                if (HtmlSupport.attribute(element, "data-class") === "fn") {
                    return HDITAConverter.processFootnoteDiv(element, ctx);
                }
                return HDITAConverter.wrapGeneric("div", element, ctx);
            case "p": return HDITAConverter.wrapGeneric("p", element, ctx);
            case "ul": return HDITAConverter.wrapGeneric("ul", element, ctx);
            case "sub": return HDITAConverter.wrapGeneric("sub", element, ctx);
            case "sup": return HDITAConverter.wrapGeneric("sup", element, ctx);
            case "u": return HDITAConverter.wrapGeneric("u", element, ctx);
            case "q": return HDITAConverter.wrapGeneric("q", element, ctx);
            case "tt": return HDITAConverter.wrapGeneric("tt", element, ctx);
            case "del": case "ins": {
                const containerName: string = FLOW_CONTAINER_DESCENDANTS.some(
                    (tag): boolean => HtmlSupport.findDescendant(HtmlSupport.children(element), tag) !== undefined
                ) ? "div" : "ph";
                return HDITAConverter.wrapGeneric(containerName, element, ctx, true);
            }
            default: break;
        }

        if (DIV_WRAPPED_ELEMENTS.includes(name)) {
            return HDITAConverter.wrapGeneric("div", element, ctx, true);
        }

        if (PH_WRAPPED_ELEMENTS.includes(name)) {
            return HDITAConverter.wrapGeneric("ph", element, ctx, true);
        }

        HDITAConverter.warnIgnoredElement(element, ctx);
        return undefined;
    }

    static warnIgnoredElement(element: HtmlElement, ctx: HDITAContext): void {
        ctx.diagnostics.warning(
            ctx.diagnostics.i18n.format(
                ctx.diagnostics.i18n.getString("HDITAConverter", "ignoringElement"),
                [element.tagName]
            ),
            ctx.documentPath
        );
    }

    static applyTemplatesInto(nodes: HtmlNode[], target: DitaElement, ctx: HDITAContext): void {
        for (const node of nodes) {
            if (HtmlSupport.isElement(node) && node.tagName === "section" &&
                HtmlSupport.parentElement(ctx.documentRoot, node)?.tagName === "article") {
                target.addElement(HDITAConverter.processTopLevelSection(node, ctx));
                continue;
            }
            const converted: DitaElement | string | undefined = HDITAConverter.applyTemplate(node, ctx);
            if (typeof converted === "string") {
                DitaBuilder.addText(target, converted);
            } else if (converted !== undefined) {
                target.addElement(converted);
            }
        }
    }
}

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
import { HtmlElement, HtmlNode, HtmlSupport } from "./HtmlSupport.js";
import { DitaBuilder } from "./DitaBuilder.js";
import { HDITAContext, HDITAConverter } from "./HDITAConverter.js";

export class HDITAMapConverter {
    private constructor() { }

    static processMap(root: HtmlElement, ctx: HDITAContext): DitaElement {
        const map: DitaElement = DitaBuilder.createElement("map");
        HDITAConverter.processCommonAttributes(root, map, ctx);

        if (HtmlSupport.attribute(root, "lang") === undefined) {
            const lang: string | undefined = HDITAMapConverter.inheritedLang(root, ctx);
            if (lang !== undefined) {
                DitaBuilder.setAttr(map, "xml:lang", lang);
            }
        }

        const h1: HtmlElement | undefined = HtmlSupport.firstChildElement(root)?.tagName === "h1"
            ? HtmlSupport.firstChildElement(root)
            : undefined;
        const metas: HtmlElement[] = HDITAMapConverter.headMetas(ctx);

        const kids: HtmlElement[] = HtmlSupport.childElements(root);
        if (h1 !== undefined) {
            const topicmeta: DitaElement = DitaBuilder.createElement("topicmeta");
            topicmeta.addElement(HDITAMapConverter.processMapTitle(h1, ctx));
            if (metas.length > 0) {
                HDITAMapConverter.processMapMeta(topicmeta, ctx);
            }
            map.addElement(topicmeta);
            HDITAMapConverter.applyTemplatesMapInto(kids.slice(1), map, ctx);
        } else {
            const title: HtmlElement | undefined = HtmlSupport.firstElementNamed(ctx.documentNodes, "title");
            if (title !== undefined || metas.length > 0) {
                const topicmeta: DitaElement = DitaBuilder.createElement("topicmeta");
                if (title !== undefined) {
                    const navtitle: DitaElement = DitaBuilder.createElement("navtitle");
                    DitaBuilder.addText(navtitle, HtmlSupport.textContent(title));
                    topicmeta.addElement(navtitle);
                }
                if (metas.length > 0) {
                    HDITAMapConverter.processMapMeta(topicmeta, ctx);
                }
                map.addElement(topicmeta);
            }
            HDITAMapConverter.applyTemplatesMapInto(kids, map, ctx);
        }

        return map;
    }

    private static inheritedLang(root: HtmlElement, ctx: HDITAContext): string | undefined {
        let current: HtmlElement | undefined = HtmlSupport.parentElement(ctx.documentRoot, root);
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

    private static processMapTitle(h1: HtmlElement, ctx: HDITAContext): DitaElement {
        const navtitle: DitaElement = DitaBuilder.createElement("navtitle");
        HDITAConverter.processCommonAttributes1(h1, navtitle);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(h1), navtitle, ctx);
        return navtitle;
    }

    private static headMetas(ctx: HDITAContext): HtmlElement[] {
        const head: HtmlElement | undefined = HtmlSupport.firstElementNamed(ctx.documentNodes, "head");
        return HtmlSupport.childElements(head).filter(
            (element): boolean => element.tagName === "meta" && HtmlSupport.attribute(element, "name") !== undefined
        );
    }

    private static metasNamed(ctx: HDITAContext, names: string[]): HtmlElement[] {
        return HDITAMapConverter.headMetas(ctx).filter((meta): boolean => names.includes(HtmlSupport.attribute(meta, "name") ?? ""));
    }

    private static firstMeta(ctx: HDITAContext, names: string[]): HtmlElement | undefined {
        return HDITAMapConverter.metasNamed(ctx, names)[0];
    }

    private static readonly META_NAMES_IN_TOPICMETA: string[] = [
        "author", "source", "publisher", "dcterms.publisher", "created", "dcterms.created",
        "revised", "dcterms.modified", "permissions", "audience", "category", "keyword", "resourceid"
    ];

    private static processMapMeta(topicmeta: DitaElement, ctx: HDITAContext): void {
        for (const meta of HDITAMapConverter.metasNamed(ctx, ["author"])) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(meta));
        }
        const source: HtmlElement | undefined = HDITAMapConverter.firstMeta(ctx, ["source"]);
        if (source !== undefined) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(source));
        }
        const publisher: HtmlElement | undefined = HDITAMapConverter.firstMeta(ctx, ["publisher", "dcterms.publisher"]);
        if (publisher !== undefined) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(publisher));
        }
        if (HDITAMapConverter.metasNamed(ctx, ["created", "dcterms.created", "revised", "dcterms.modified"]).length > 0) {
            const critdates: DitaElement = DitaBuilder.createElement("critdates");
            const created: HtmlElement | undefined = HDITAMapConverter.firstMeta(ctx, ["created", "dcterms.created"]);
            if (created !== undefined) {
                critdates.addElement(HDITAMapConverter.convertMeta(created));
            }
            for (const revised of HDITAMapConverter.metasNamed(ctx, ["revised", "dcterms.modified"])) {
                critdates.addElement(HDITAMapConverter.convertMeta(revised));
            }
            topicmeta.addElement(critdates);
        }
        const permissions: HtmlElement | undefined = HDITAMapConverter.firstMeta(ctx, ["permissions"]);
        if (permissions !== undefined) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(permissions));
        }
        for (const audience of HDITAMapConverter.metasNamed(ctx, ["audience"])) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(audience));
        }
        for (const category of HDITAMapConverter.metasNamed(ctx, ["category"])) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(category));
        }
        const keywordMetas: HtmlElement[] = HDITAMapConverter.metasNamed(ctx, ["keyword"]);
        if (keywordMetas.length > 0) {
            const keywords: DitaElement = DitaBuilder.createElement("keywords");
            for (const keyword of keywordMetas) {
                keywords.addElement(HDITAMapConverter.convertMeta(keyword));
            }
            topicmeta.addElement(keywords);
        }
        for (const resourceid of HDITAMapConverter.metasNamed(ctx, ["resourceid"])) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(resourceid));
        }
        for (const other of HDITAMapConverter.headMetas(ctx).filter(
            (meta): boolean => !HDITAMapConverter.META_NAMES_IN_TOPICMETA.includes(HtmlSupport.attribute(meta, "name") ?? "")
        )) {
            topicmeta.addElement(HDITAMapConverter.convertMeta(other));
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

    private static processKeydef(div: HtmlElement, ctx: HDITAContext): DitaElement | undefined {
        const firstChild: HtmlElement | undefined = HtmlSupport.firstChildElement(div);
        if (firstChild === undefined) {
            return undefined;
        }
        const isKeyedAnchor: boolean = firstChild.tagName === "a" &&
            HtmlSupport.nonEmptyAttribute(firstChild, "href") !== undefined &&
            HtmlSupport.nonEmptyAttribute(firstChild, "data-keys") !== undefined;
        const isKeyedLinktext: boolean = firstChild.tagName === "span" &&
            HtmlSupport.attribute(firstChild, "data-class") === "linktext" &&
            HtmlSupport.nonEmptyAttribute(firstChild, "data-keys") !== undefined;
        if (!isKeyedAnchor && !isKeyedLinktext) {
            return undefined;
        }
        const keydef: DitaElement = DitaBuilder.createElement("keydef");
        DitaBuilder.setAttr(keydef, "keys", HtmlSupport.attribute(firstChild, "data-keys"));
        HDITAConverter.processCommonAttributes(div, keydef, ctx);
        const converted: DitaElement | string | undefined = HDITAMapConverter.applyTemplateMap(firstChild, ctx);
        if (converted !== undefined && typeof converted !== "string") {
            for (const child of converted.getChildren()) {
                keydef.addElement(child);
            }
            for (const [attrName, attrValue] of converted.getAttributes().map(
                (attribute): [string, string] => [attribute.getName(), attribute.getValue()]
            )) {
                if (attrName !== "class") {
                    DitaBuilder.setAttr(keydef, attrName, attrValue);
                }
            }
        }
        return keydef;
    }

    private static processLink(a: HtmlElement, ctx: HDITAContext): DitaElement {
        const topicref: DitaElement = DitaBuilder.createElement("topicref");
        DitaBuilder.setAttr(topicref, "href", HtmlSupport.attribute(a, "href"));
        HDITAConverter.processCommonAttributes(a, topicref, ctx);
        HDITAConverter.processLinkAttributes(a, topicref);
        HDITAConverter.processKeyrefAttribute(a, topicref);
        const processingRole: string | undefined = HtmlSupport.nonEmptyAttribute(a, "data-processing-role");
        if (processingRole !== undefined) {
            DitaBuilder.setAttr(topicref, "processing-role", processingRole);
        }
        const text: HtmlNode[] = HtmlSupport.children(a);
        if (text.length > 0) {
            const topicmeta: DitaElement = DitaBuilder.createElement("topicmeta");
            const navtitle: DitaElement = DitaBuilder.createElement("navtitle");
            HDITAConverter.applyTemplatesInto(text, navtitle, ctx);
            topicmeta.addElement(navtitle);
            topicref.addElement(topicmeta);
        }
        return topicref;
    }

    private static processLinktext(span: HtmlElement, ctx: HDITAContext): DitaElement {
        const topicmeta: DitaElement = DitaBuilder.createElement("topicmeta");
        const linktext: DitaElement = DitaBuilder.createElement("linktext");
        HDITAConverter.processCommonAttributes(span, linktext, ctx);
        HDITAConverter.applyTemplatesInto(HtmlSupport.children(span), linktext, ctx);
        topicmeta.addElement(linktext);
        return topicmeta;
    }

    private static findAnchorWithHref(node: HtmlElement): HtmlElement | undefined {
        if (node.tagName === "a" && HtmlSupport.nonEmptyAttribute(node, "href") !== undefined) {
            return node;
        }
        for (const child of HtmlSupport.childElements(node)) {
            const found: HtmlElement | undefined = HDITAMapConverter.findAnchorWithHref(child);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private static processTopicrefItem(li: HtmlElement, ctx: HDITAContext): DitaElement {
        const topicref: DitaElement = DitaBuilder.createElement("topicref");
        const kids: HtmlElement[] = HtmlSupport.childElements(li);
        const first: HtmlElement | undefined = kids[0];
        const anchor: HtmlElement | undefined = first === undefined
            ? undefined
            : HDITAMapConverter.findAnchorWithHref(first);

        if (anchor !== undefined) {
            const converted: DitaElement | string | undefined = HDITAMapConverter.applyTemplateMap(anchor, ctx);
            if (converted !== undefined && typeof converted !== "string") {
                for (const child of converted.getChildren()) {
                    topicref.addElement(child);
                }
                for (const attribute of converted.getAttributes()) {
                    if (attribute.getName() !== "class") {
                        topicref.setAttribute(attribute);
                    }
                }
            }
            HDITAMapConverter.applyTemplatesMapInto(kids.slice(1), topicref, ctx);
        } else {
            HDITAConverter.processCommonAttributes(li, topicref, ctx);
            HDITAMapConverter.applyTemplatesMapInto(kids, topicref, ctx);
        }
        return topicref;
    }

    private static applyTemplateMap(node: HtmlElement, ctx: HDITAContext): DitaElement | string | undefined {
        switch (node.tagName) {
            case "div":
                if (HtmlSupport.attribute(node, "data-class") === "keydef") {
                    return HDITAMapConverter.processKeydef(node, ctx);
                }
                break;
            case "a": return HDITAMapConverter.processLink(node, ctx);
            case "span":
                if (HtmlSupport.attribute(node, "data-class") === "linktext") {
                    return HDITAMapConverter.processLinktext(node, ctx);
                }
                break;
            case "li": return HDITAMapConverter.processTopicrefItem(node, ctx);
            default: break;
        }
        HDITAConverter.warnIgnoredElement(node, ctx);
        return undefined;
    }

    private static applyTemplatesMapInto(nodes: HtmlElement[], target: DitaElement, ctx: HDITAContext): void {
        for (const node of nodes) {
            if (node.tagName === "ul") {
                HDITAMapConverter.applyTemplatesMapInto(HtmlSupport.childElements(node).filter((el): boolean => el.tagName === "li"), target, ctx);
                continue;
            }
            const converted: DitaElement | string | undefined = HDITAMapConverter.applyTemplateMap(node, ctx);
            if (converted !== undefined && typeof converted !== "string") {
                target.addElement(converted);
            }
        }
    }
}

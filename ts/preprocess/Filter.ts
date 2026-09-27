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
import { I18n } from "../i18n/I18n.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { AttributeValues } from "./AttributeValues.js";
import type { LoadDocument } from "./LoadDocument.js";

export type Action = "exclude" | "flag" | "include" | "passthrough";

export class Flags {
    color: string | undefined;
    backgroundColor: string | undefined;
    fontWeight: string | undefined;
    fontStyle: string | undefined;
    textDecoration: string | undefined;
    changeBarProps: string[] | undefined;
    startImage: string | undefined;
    isAbsoluteStartImageURL: boolean = false;
    startText: string | undefined;
    endImage: string | undefined;
    isAbsoluteEndImageURL: boolean = false;
    endText: string | undefined;
    conflictColor: string | undefined;
    conflictBackgroundColor: string | undefined;

    set(other: Flags): void {
        if (other.color !== undefined) {
            this.color = this.color !== undefined && this.color !== other.color && other.conflictColor !== undefined
                ? other.conflictColor
                : other.color;
        }
        if (other.backgroundColor !== undefined) {
            this.backgroundColor = this.backgroundColor !== undefined &&
                this.backgroundColor !== other.backgroundColor && other.conflictBackgroundColor !== undefined
                ? other.conflictBackgroundColor
                : other.backgroundColor;
        }
        if (other.fontWeight !== undefined) {
            this.fontWeight = other.fontWeight;
        }
        if (other.fontStyle !== undefined) {
            this.fontStyle = other.fontStyle;
        }
        if (other.textDecoration !== undefined) {
            this.textDecoration = other.textDecoration;
        }
        if (other.changeBarProps !== undefined) {
            this.changeBarProps = other.changeBarProps;
        }
        if (other.startImage !== undefined) {
            this.startImage = other.startImage;
            this.isAbsoluteStartImageURL = other.isAbsoluteStartImageURL;
        }
        if (other.startText !== undefined) {
            this.startText = other.startText;
        }
        if (other.endImage !== undefined) {
            this.endImage = other.endImage;
            this.isAbsoluteEndImageURL = other.isAbsoluteEndImageURL;
        }
        if (other.endText !== undefined) {
            this.endText = other.endText;
        }
    }

    clear(): void {
        this.color = undefined;
        this.backgroundColor = undefined;
        this.fontWeight = undefined;
        this.fontStyle = undefined;
        this.textDecoration = undefined;
        this.changeBarProps = undefined;
        this.startImage = undefined;
        this.isAbsoluteStartImageURL = false;
        this.startText = undefined;
        this.endImage = undefined;
        this.isAbsoluteEndImageURL = false;
        this.endText = undefined;
    }

    isEmpty(): boolean {
        return this.color === undefined &&
            this.backgroundColor === undefined &&
            this.fontWeight === undefined &&
            this.fontStyle === undefined &&
            this.textDecoration === undefined &&
            this.changeBarProps === undefined &&
            this.startImage === undefined &&
            this.startText === undefined &&
            this.endImage === undefined &&
            this.endText === undefined;
    }

    copy(): Flags {
        const copy: Flags = new Flags();
        copy.color = this.color;
        copy.backgroundColor = this.backgroundColor;
        copy.fontWeight = this.fontWeight;
        copy.fontStyle = this.fontStyle;
        copy.textDecoration = this.textDecoration;
        copy.changeBarProps = this.changeBarProps;
        copy.startImage = this.startImage;
        copy.isAbsoluteStartImageURL = this.isAbsoluteStartImageURL;
        copy.startText = this.startText;
        copy.endImage = this.endImage;
        copy.isAbsoluteEndImageURL = this.isAbsoluteEndImageURL;
        copy.endText = this.endText;
        return copy;
    }
}

export class PropValue {
    readonly value: string | undefined;
    readonly action: Action;
    readonly flags: Flags | undefined;

    constructor(value: string | undefined, action: Action, flags: Flags | undefined) {
        this.value = value;
        this.action = action;
        this.flags = flags;
    }
}

export class Prop {
    readonly attribute: string | undefined;
    private values: PropValue[];

    constructor(attribute: string | undefined, value: PropValue) {
        this.attribute = attribute;
        this.values = [value];
    }

    addValue(value: PropValue): void {
        const index: number = this.values.findIndex(
            (v: PropValue): boolean => v.value === value.value
        );
        if (index < 0) {
            this.values.push(value);
        } else {
            this.values[index] = value;
        }
    }

    findValue(searched: string): PropValue | undefined;
    findValue(
        from: string,
        excludedAncestor: string | undefined,
        attributeValues: AttributeValues,
        attribute: string,
        elementName: string
    ): PropValue | undefined;
    findValue(
        searched: string,
        excludedAncestor?: string,
        attributeValues?: AttributeValues,
        attribute?: string,
        elementName?: string
    ): PropValue | undefined {
        if (attributeValues === undefined || attribute === undefined || elementName === undefined) {
            return this.values.find((value: PropValue): boolean => value.value === searched);
        }
        for (const ancestor of attributeValues.getKindOfChain(attribute, elementName, searched)) {
            if (ancestor === excludedAncestor) {
                break;
            }
            const propValue: PropValue | undefined = this.values.find(
                (value: PropValue): boolean => value.value === ancestor
            );
            if (propValue !== undefined) {
                return propValue;
            }
        }
        return undefined;
    }

    getWildcardValue(): PropValue | undefined {
        return this.values.find((value: PropValue): boolean => value.value === undefined);
    }

    getValueCount(): number {
        return this.values.length;
    }

    getValues(): readonly PropValue[] {
        return this.values;
    }
}

const NAMED_COLORS: string[] = [
    "aqua", "black", "blue", "fuchsia", "gray", "green", "lime",
    "maroon", "navy", "olive", "purple", "red", "silver", "teal",
    "white", "yellow", "orange"
];

export class Filter {
    private documentRoot: DitaElement | undefined;
    private location: string | undefined;
    private props: Prop[] = [];
    private conflictColor: string | undefined;
    private conflictBackgroundColor: string | undefined;

    constructor();
    constructor(documentRoot: DitaElement, location: string, i18n: I18n);
    constructor(documentRoot?: DitaElement, location?: string, i18n?: I18n) {
        if (documentRoot === undefined || i18n === undefined) {
            return;
        }
        this.documentRoot = documentRoot;
        this.location = location;
        if (documentRoot.getName() !== "val") {
            this.reportError(documentRoot, "notADitaval", [documentRoot.getName()], i18n);
        }
        for (const child of documentRoot.getChildren()) {
            if (child.getName() === "prop") {
                this.parseProp(child, i18n);
            } else if (child.getName() === "revprop") {
                this.parseRevprop(child, i18n);
            } else if (child.getName() === "style-conflict") {
                this.parseStyleConflict(child, i18n);
            } else {
                this.reportError(child, "unknownElement", [child.getName()], i18n);
            }
        }
        if (this.conflictColor !== undefined || this.conflictBackgroundColor !== undefined) {
            for (const prop of this.props) {
                for (const value of prop.getValues()) {
                    if (value.flags !== undefined) {
                        value.flags.conflictColor = this.conflictColor;
                        value.flags.conflictBackgroundColor = this.conflictBackgroundColor;
                    }
                }
            }
        }
    }

    static load(location: string, loader: LoadDocument, i18n: I18n): Filter {
        const documentRoot: DitaElement | undefined = DitaUtils.getRoot(loader.load(location, false));
        if (documentRoot === undefined) {
            throw new Error(i18n.format(i18n.getString("LoadedDocument", "documentHasNoRoot"), [location]));
        }
        return new Filter(documentRoot, location, i18n);
    }

    static copyOf(other: Filter): Filter {
        const copy: Filter = new Filter();
        copy.documentRoot = other.documentRoot;
        copy.location = other.location;
        copy.props = other.props;
        copy.conflictColor = other.conflictColor;
        copy.conflictBackgroundColor = other.conflictBackgroundColor;
        return copy;
    }

    setProps(props: Prop[] | undefined): void {
        this.props = props ?? [];
    }

    addExcludeProps(...pairs: string[]): void {
        let props: Prop[] = this.props;
        for (let i: number = 0; i + 1 < pairs.length; i += 2) {
            props = [...props, Filter.newExcludeProp(pairs[i], pairs[i + 1])];
        }
        this.props = props;
    }

    static newExcludeProp(attrName: string, attrValue: string): Prop {
        return new Prop(attrName, new PropValue(attrValue, "exclude", undefined));
    }

    getProps(): readonly Prop[] {
        return this.props;
    }

    setConflictColor(conflictColor: string | undefined): void {
        this.conflictColor = conflictColor;
    }

    getConflictColor(): string | undefined {
        return this.conflictColor;
    }

    setConflictBackgroundColor(conflictBackgroundColor: string | undefined): void {
        this.conflictBackgroundColor = conflictBackgroundColor;
    }

    getConflictBackgroundColor(): string | undefined {
        return this.conflictBackgroundColor;
    }

    getDocumentRoot(): DitaElement | undefined {
        return this.documentRoot;
    }

    getLocation(): string | undefined {
        return this.location;
    }

    private parseProp(element: DitaElement, i18n: I18n): void {
        const attrName: string | undefined = element.getAttribute("att")?.getValue().trim();
        this.doParseProp(element, attrName === undefined || attrName.length === 0 ? undefined : attrName, i18n);
    }

    private parseRevprop(element: DitaElement, i18n: I18n): void {
        this.doParseProp(element, "rev", i18n);
    }

    private doParseProp(element: DitaElement, attrName: string | undefined, i18n: I18n): void {
        const rawValue: string | undefined = element.getAttribute("val")?.getValue().trim();
        const attrValue: string | undefined = rawValue === undefined || rawValue.length === 0 ? undefined : rawValue;

        const action: string | undefined = element.getAttribute("action")?.getValue().trim();
        if (action === undefined || action.length === 0) {
            this.reportError(element, "missingAttribute", ["action"], i18n);
            return;
        }

        let propAction: Action | undefined;
        let flags: Flags | undefined;

        if (action === "exclude") {
            propAction = "exclude";
        } else if (action === "include") {
            propAction = "include";
        } else if (action === "passthrough") {
            propAction = "passthrough";
        } else if (action === "flag") {
            flags = new Flags();
            flags.color = this.parseColor(element, "color", i18n);
            flags.backgroundColor = this.parseColor(element, "backcolor", i18n);

            const style: string | undefined = element.getAttribute("style")?.getValue().trim();
            if (style !== undefined && style.length > 0) {
                if (style === "underline" || style === "double-underline") {
                    flags.textDecoration = "underline";
                } else if (style === "overline") {
                    flags.textDecoration = "overline";
                } else if (style === "line-through") {
                    flags.textDecoration = "line-through";
                } else if (style === "italics") {
                    flags.fontStyle = "italic";
                } else if (style === "bold") {
                    flags.fontWeight = "bold";
                } else {
                    this.reportError(element, "invalidStyle", [style], i18n);
                }
            }

            const changebar: string | undefined = element.getAttribute("changebar")?.getValue().trim();
            if (changebar !== undefined && changebar.length > 0) {
                flags.changeBarProps = Filter.parseChangeBarProps(changebar);
            }

            const startflag: DitaElement | undefined = element.getChildren().find(
                (child: DitaElement): boolean => child.getName() === "startflag"
            );
            if (startflag !== undefined) {
                this.parseStartEndFlag(startflag, true, flags, i18n);
            }

            const endflag: DitaElement | undefined = element.getChildren().find(
                (child: DitaElement): boolean => child.getName() === "endflag"
            );
            if (endflag !== undefined) {
                this.parseStartEndFlag(endflag, false, flags, i18n);
            }

            if (flags.isEmpty()) {
                flags = undefined;
            }
            if (flags !== undefined) {
                propAction = "flag";
            }
        } else {
            this.reportError(element, "invalidAttribute", [action, "action"], i18n);
            return;
        }

        if (propAction === undefined) {
            return;
        }

        let prop: Prop | undefined = this.props.find(
            (p: Prop): boolean => p.attribute === attrName
        );
        const propValue: PropValue = new PropValue(attrValue, propAction, flags);
        if (prop === undefined) {
            prop = new Prop(attrName, propValue);
            this.props.push(prop);
        } else {
            prop.addValue(propValue);
        }
    }

    private static parseChangeBarProps(styles: string): string[] | undefined {
        const parsed: string[] = Filter.splitStyleProps(styles);
        const result: string[] = [];
        for (const item of parsed) {
            const separator: number = item.indexOf(":");
            if (separator <= 0 || separator >= item.length - 1) {
                continue;
            }
            let name: string = item.slice(0, separator).trim();
            const value: string = item.slice(separator + 1).trim();
            if (name.length === 0 || value.length === 0) {
                continue;
            }
            if (!name.startsWith("change-bar-")) {
                name = "change-bar-" + name;
            }
            if (["change-bar-color", "change-bar-offset", "change-bar-placement", "change-bar-style", "change-bar-width"].includes(name)) {
                result.push(name, value);
            }
        }
        return result.length === 0 ? undefined : result;
    }

    private static splitStyleProps(styles: string): string[] {
        const list: string[] = [];
        let quote: string = "";
        let buffer: string | undefined;
        for (const c of styles) {
            if (c === ";") {
                if (quote !== "") {
                    buffer = (buffer ?? "") + c;
                } else if (buffer !== undefined) {
                    const style: string = buffer.trim();
                    if (style.length > 0) {
                        list.push(style);
                    }
                    buffer = undefined;
                }
            } else if (c === "\"" || c === "'") {
                if (quote !== "") {
                    if (c === quote) {
                        const last: string | undefined = buffer !== undefined && buffer.length > 0
                            ? buffer[buffer.length - 1]
                            : undefined;
                        if (last !== "\\") {
                            quote = "";
                        }
                    }
                } else {
                    quote = c;
                }
                buffer = (buffer ?? "") + c;
            } else {
                buffer = (buffer ?? "") + c;
            }
        }
        if (buffer !== undefined) {
            const style: string = buffer.trim();
            if (style.length > 0) {
                list.push(style);
            }
        }
        return list;
    }

    private parseStartEndFlag(element: DitaElement, isStartflag: boolean, flags: Flags, i18n: I18n): void {
        let url: string | undefined;
        let isAbsoluteURL: boolean = false;

        const imageref: string | undefined = element.getAttribute("imageref")?.getValue().trim();
        if (imageref !== undefined && imageref.length > 0) {
            if (DitaUtils.hasURIScheme(imageref)) {
                url = imageref;
                isAbsoluteURL = true;
            } else if (this.location !== undefined) {
                try {
                    url = DitaUtils.resolveDocumentPath(this.location, imageref);
                } catch {
                    this.reportError(element, "invalidAttribute", [imageref, "imageref"], i18n);
                    return;
                }
            } else {
                url = imageref;
            }
        }

        let text: string | undefined;
        const altText: DitaElement | undefined = element.getChildren().find(
            (child: DitaElement): boolean => child.getName() === "alt-text"
        );
        if (altText !== undefined) {
            const rawText: string = altText.getText().trim().replace(/\s+/g, " ");
            text = rawText.length === 0 ? undefined : rawText;
        }

        if (url !== undefined || text !== undefined) {
            if (isStartflag) {
                flags.startImage = url;
                flags.isAbsoluteStartImageURL = isAbsoluteURL;
                flags.startText = text;
            } else {
                flags.endImage = url;
                flags.isAbsoluteEndImageURL = isAbsoluteURL;
                flags.endText = text;
            }
        }
    }

    private parseStyleConflict(element: DitaElement, i18n: I18n): void {
        this.conflictColor = this.parseColor(element, "foreground-conflict-color", i18n);
        this.conflictBackgroundColor = this.parseColor(element, "background-conflict-color", i18n);
    }

    private parseColor(element: DitaElement, attrName: string, i18n: I18n): string | undefined {
        const value: string | undefined = element.getAttribute(attrName)?.getValue().trim();
        if (value === undefined || value.length === 0) {
            return undefined;
        }
        if (NAMED_COLORS.includes(value) || /^#[0-9A-Fa-f]{6}$/.test(value)) {
            return value;
        }
        this.reportError(element, "invalidColor", [value], i18n);
        return undefined;
    }

    private reportError(element: DitaElement | undefined, key: string, args: string[], i18n: I18n): void {
        let message: string = i18n.format(i18n.getString("Filter", key), args);
        if (element !== undefined) {
            message = NodeLocation.of(this.location ?? "???", element) + ": " + message;
        }
        throw new Error(message);
    }
}

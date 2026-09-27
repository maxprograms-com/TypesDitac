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

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageUtils } from "typesbcp47";
import { TextNode, XMLAttribute, XMLDocument, XMLNode, XMLWriter } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { AttributeValues } from "./AttributeValues.js";
import { CascadeMeta } from "./CascadeMeta.js";
import { Chunk } from "./Chunk.js";
import { ChunkDocumentBuilder } from "./ChunkDocumentBuilder.js";
import { ChunkEntryType } from "./ChunkEntry.js";
import { Chunking } from "./Chunking.js";
import { ChunkPlan } from "./ChunkPlan.js";
import { CollectionLinkProcessor } from "./CollectionLinkProcessor.js";
import { ConrefIncluder } from "./ConrefIncluder.js";
import { ConrefPusher } from "./ConrefPusher.js";
import { CopyMeta } from "./CopyMeta.js";
import { EmbeddedLists } from "./EmbeddedLists.js";
import { ExtractAsImage, ExtractAsImageSpec } from "./ExtractAsImage.js";
import { Filter } from "./Filter.js";
import { Filters } from "./Filters.js";
import { FormalElementCounter } from "./FormalElementCounter.js";
import { FrontBackMatter } from "./FrontBackMatter.js";
import { KeyLoader } from "./KeyLoader.js";
import { KeySpaces } from "./KeySpaces.js";
import { ListingProcessor } from "./ListingProcessor.js";
import { ListsDocumentBuilder } from "./ListsDocumentBuilder.js";
import { ListTarget, ListTargetType } from "./ListTarget.js";
import { ListTargetCollector } from "./ListTargetCollector.js";
import { LoadDocument } from "./LoadDocument.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";
import { MapLoader } from "./MapLoader.js";
import { MapSimplifier } from "./MapSimplifier.js";
import { ReltableProcessor } from "./ReltableProcessor.js";
import { ResourceHandler } from "./ResourceHandler.js";
import { SimplifyTopicrefs } from "./SimplifyTopicrefs.js";
import { UnifiedDocumentBuilder } from "./UnifiedDocumentBuilder.js";
import { WrapTopicrefTitle } from "./WrapTopicrefTitle.js";

interface Target {
    readonly topic: LoadedTopic;
    readonly chunk?: Chunk;
    readonly elementId?: string;
}

type LinkTarget = Target;

type TargetResolution =
    | { readonly target: LinkTarget }
    | { readonly error: "invalidAttribute" | "pointsOutsidePreprocessedTopics" };

export class TypesDitacPreprocessor {
    private static readonly IMAGE_ELEMENTS: string[] = [
        "topic/image",
        "svg-d/svgref",
        "mathml-d/mathmlref"
    ];

    private static readonly XREF_ELEMENTS: string[] = [
        "topic/ph",
        "topic/term",
        "topic/keyword",
        "topic/cite",
        "topic/dt",
        "glossentry/glossAlternateFor",
        "topic/xref"
    ];

    documents: LoadedDocuments;
    readonly conrefPusher: ConrefPusher;
    readonly keyLoader: KeyLoader;
    readonly mapSimplifier: MapSimplifier;
    readonly mapLoader: MapLoader;
    readonly listTargetCollector: ListTargetCollector;
    readonly unifiedDocumentBuilder: UnifiedDocumentBuilder;
    readonly reltableProcessor: ReltableProcessor;
    readonly collectionLinkProcessor: CollectionLinkProcessor;
    readonly diagnostics: DiagnosticLog;
    private readonly chunkDocumentBuilder: ChunkDocumentBuilder;
    private readonly listsDocumentBuilder: ListsDocumentBuilder;
    private readonly topicIdRegistry: Map<string, DitaElement> = new Map<string, DitaElement>();
    private chunkPlan: ChunkPlan | undefined;
    private chunkDocuments: Map<string, XMLDocument> = new Map();
    private listsDocument: XMLDocument | undefined;
    private unifiedDocument: XMLDocument | undefined;
    private externalAttributeValues: AttributeValues | undefined;
    private defaultAttributeValues: AttributeValues | undefined;
    private attributeValues: AttributeValues = new AttributeValues();
    private readonly filters: Filters;
    private lang: string | undefined;
    private extractAsImage: boolean = false;
    private rootName: string | undefined;
    private extension: string | undefined;
    private outDir: string = "";
    private readonly extractAsImageSpecs: ExtractAsImageSpec[] = [];
    private frontMatter: string[][] | undefined;
    private backMatter: string[][] | undefined;
    private media: "screen" | "print" = "print";
    private resourceHandler: ResourceHandler | undefined;
    private chunking: Chunking = Chunking.NONE;
    private forceTitlePage: boolean = false;
    private partRestartsChapterNumber: boolean = false;

    constructor(
        documents: LoadedDocuments,
        diagnostics: DiagnosticLog,
        mapLoader?: MapLoader,
        listTargetCollector?: ListTargetCollector,
        unifiedDocumentBuilder?: UnifiedDocumentBuilder,
        conrefPusher?: ConrefPusher,
        keyLoader?: KeyLoader,
        mapSimplifier?: MapSimplifier
    ) {
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.conrefPusher = conrefPusher ?? new ConrefPusher(documents, diagnostics);
        this.keyLoader = keyLoader ?? new KeyLoader(diagnostics, documents);
        this.mapSimplifier = mapSimplifier ?? new MapSimplifier(documents, diagnostics);
        this.mapLoader = mapLoader ?? new MapLoader(documents, diagnostics);
        this.listTargetCollector = listTargetCollector === undefined
            ? new ListTargetCollector(diagnostics)
            : listTargetCollector;
        this.unifiedDocumentBuilder = unifiedDocumentBuilder === undefined
            ? new UnifiedDocumentBuilder(diagnostics.i18n)
            : unifiedDocumentBuilder;
        this.reltableProcessor = new ReltableProcessor(diagnostics);
        this.collectionLinkProcessor = new CollectionLinkProcessor(diagnostics);
        this.filters = new Filters(diagnostics, documents.loader);
        this.chunkDocumentBuilder = new ChunkDocumentBuilder(this.filters);
        this.listsDocumentBuilder = new ListsDocumentBuilder(diagnostics);
    }

    private determineDocLang(mapRoot: DitaElement | undefined, mapPath: string): string | undefined {
        const candidates: (string | undefined)[] = [mapRoot?.getAttribute("xml:lang")?.getValue().trim(), this.lang?.trim()];
        for (const candidate of candidates) {
            if (candidate === undefined || candidate.length === 0) {
                continue;
            }
            const normalized: string | undefined = LanguageUtils.normalizeCode(candidate);
            if (normalized !== undefined) {
                return normalized;
            }
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("PreProcessor", "invalidLanguageCode"), [candidate]),
                mapPath
            );
        }
        return undefined;
    }

    setLang(lang: string): void {
        this.lang = lang;
    }

    setAttributeValues(attributeValues: AttributeValues | undefined): void {
        this.externalAttributeValues = attributeValues;
    }

    getAttributeValues(): AttributeValues | undefined {
        return this.externalAttributeValues;
    }

    setDefaultAttributeValues(attributeValues: AttributeValues | undefined): void {
        this.defaultAttributeValues = attributeValues;
    }

    getDefaultAttributeValues(): AttributeValues | undefined {
        return this.defaultAttributeValues;
    }

    setExtendedToc(extendedToc: string): void {
        this.unifiedDocumentBuilder.setExtendedToc(extendedToc);
    }

    getLang(): string | undefined {
        return this.lang;
    }

    addExtractAsImageSpec(spec: ExtractAsImageSpec): void {
        this.extractAsImageSpecs.push(spec);
    }

    setExtractAsImage(extract: boolean): void {
        this.extractAsImage = extract;
    }

    setResourceHandler(handler: ResourceHandler | undefined): void {
        this.resourceHandler = handler;
        this.filters.setResourceHandler(handler);
    }

    getResourceHandler(): ResourceHandler | undefined {
        return this.resourceHandler;
    }

    setFrontMatter(items: string[][] | undefined): void {
        this.frontMatter = items === undefined || items.length === 0 ? undefined : items;
    }

    getFrontMatter(): string[][] | undefined {
        return this.frontMatter;
    }

    setBackMatter(items: string[][] | undefined): void {
        this.backMatter = items === undefined || items.length === 0 ? undefined : items;
    }

    getBackMatter(): string[][] | undefined {
        return this.backMatter;
    }

    setMedia(media: "screen" | "print"): void {
        this.media = media;
    }

    getMedia(): "screen" | "print" {
        return this.media;
    }

    setChunking(chunking: Chunking): void {
        this.chunking = chunking;
    }

    getChunking(): Chunking {
        return this.chunking;
    }

    setForceTitlePage(force: boolean): void {
        this.forceTitlePage = force;
    }

    getForceTitlePage(): boolean {
        return this.forceTitlePage;
    }

    setPartRestartsChapterNumber(restarts: boolean): void {
        this.partRestartsChapterNumber = restarts;
    }

    getPartRestartsChapterNumber(): boolean {
        return this.partRestartsChapterNumber;
    }

    process(mapPath: string, outFile: string, externalFilter?: Filter): XMLDocument {
        const absoluteOutFile: string = resolve(outFile);
        this.outDir = dirname(absoluteOutFile);
        if (!existsSync(this.outDir) || !statSync(this.outDir).isDirectory()) {
            const message: string = this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("PreProcessor", "noOutputDirectory"),
                [this.outDir]
            );
            this.diagnostics.error(message, this.outDir);
            throw new Error(message);
        }

        const baseName: string = basename(absoluteOutFile).trim();
        if (baseName.length === 0) {
            this.rootName = undefined;
            this.extension = undefined;
        } else {
            const dot: number = baseName.lastIndexOf(".");
            const rootName: string = (dot > 0 ? baseName.slice(0, dot) : baseName).trim();
            this.rootName = rootName.length === 0 || rootName === "_" || rootName === "*" ? undefined : rootName;
            const extension: string | undefined = dot > 0 ? baseName.slice(dot + 1).trim() : undefined;
            this.extension = extension === undefined || extension.length === 0 ? undefined : extension;
        }

        if (this.resourceHandler !== undefined) {
            this.resourceHandler.setMedia(this.media);
            this.resourceHandler.reset();
        }
        this.filters.setOutputDirectory(this.outDir);

        this.attributeValues = new AttributeValues();
        if (this.externalAttributeValues !== undefined) {
            this.attributeValues.addValues(this.externalAttributeValues);
        }

        const loader: LoadDocument = this.documents.loader;
        const validating: boolean = this.documents.isValidating();
        const loadedDocs: LoadedDocuments = new LoadedDocuments(loader, this.diagnostics);
        loadedDocs.setValidating(validating);
        const map: LoadedDocument = loadedDocs.load(mapPath, false);
        const mapDocument: XMLDocument = map.document;
        const mapRoot: DitaElement | undefined = DitaUtils.getRoot(mapDocument);
        if (mapRoot === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("LoadedDocument", "documentHasNoRoot"), [map.path]));
        }

        const keyFilter: Filter = externalFilter === undefined ? new Filter() : Filter.copyOf(externalFilter);
        keyFilter.addExcludeProps("print", this.media === "print" ? "no" : "printonly");
        this.filters.setExternalFilter(keyFilter);
        this.keyLoader.setFilters(this.filters);
        const keySpaces: KeySpaces = this.keyLoader.load(mapDocument, map.path, loadedDocs);

        // Simplify the main map. This also processes it. Afterwards, attribute values are fully initialized.
        this.mapSimplifier.simplify(mapDocument, map.path, keySpaces, this.attributeValues, this.defaultAttributeValues);
        SimplifyTopicrefs.duplicateTopics(mapRoot, this.diagnostics.i18n);

        if (externalFilter !== undefined) {
            this.attributeValues.validate(externalFilter, this.diagnostics);
        }
        this.filters.setAttributeValues(this.attributeValues);
        this.filters.validateLoadedFilters();
        FrontBackMatter.add(mapRoot, this.frontMatter, this.backMatter);
        this.prepareChunking(mapRoot);
        keySpaces.mapTopicsToKeySpaces(mapRoot, loadedDocs, map.path);

        // Topic copies must be created from unprocessed topics.
        SimplifyTopicrefs.createTopicCopies(mapRoot, map.path, loadedDocs, this.diagnostics);

        const loadedDocs2: LoadedDocuments = new LoadedDocuments(loader, this.diagnostics, keySpaces);
        loadedDocs2.setValidating(validating);
        for (const loadedDoc of [...loadedDocs.values()]) {
            // The main map has already been processed by the map simplifier.
            const put: LoadedDocument = loadedDocs2.put(loadedDoc.path, loadedDoc.document, loadedDoc.document !== mapDocument);
            put.setProperty("syntheticDocument", loadedDoc.getProperty("syntheticDocument"));
        }
        this.documents = loadedDocs2;

        const topics: LoadedTopic[] = this.mapLoader.load(mapPath, this.documents);
        this.validateAttributeValues(this.attributeValues);

        const topicDocuments: LoadedDocument[] = [...this.documents.values()].filter(
            (document: LoadedDocument): boolean =>
                document.type === LoadedDocumentType.TOPIC || document.type === LoadedDocumentType.MULTI_TOPIC
        );
        new ConrefIncluder(this.documents, this.diagnostics).process(topicDocuments);
        for (const topic of topics) {
            CascadeMeta.processTopic(topic.element);
        }
        this.applyMapFilter(mapRoot, map.path, externalFilter, true);
        CopyMeta.processMap(mapRoot, this.documents);
        this.applyTopicFilters(mapRoot, map.path, externalFilter);
        this.conrefPusher.process(topicDocuments);
        WrapTopicrefTitle.processMap(mapRoot, map.path, this.documents);
        this.collectionLinkProcessor.process(mapRoot, this.documents, map.path);
        this.reltableProcessor.process(mapRoot, this.documents, map.path);
        this.chunkPlan = ChunkPlan.fromMap(
            mapRoot, this.documents, map.path, this.diagnostics, this.rootName,
            map.type === LoadedDocumentType.BOOKMAP, this.partRestartsChapterNumber
        );
        this.processLinks(this.chunkPlan, map.path, topics, this.documents);
        if (this.extractAsImage) {
            this.extractImages(this.chunkPlan, this.outDir);
        }
        if (this.resourceHandler !== undefined) {
            this.processResources(this.chunkPlan, mapRoot, map.path);
        }
        this.sortColspecs(this.chunkPlan);
        this.numberEquations(this.chunkPlan);
        this.numberListingLines(this.chunkPlan);
        const chunkBaseName: (chunk: Chunk) => string = (chunk: Chunk): string => this.chunkBaseName(chunk.getRootName() ?? "");
        const collectedTargets: Map<ListTargetType, ListTarget[]> = this.listTargetCollector.collect(
            this.chunkPlan, chunkBaseName, this.topicIdRegistry
        );
        const lists: EmbeddedLists = new EmbeddedLists();
        lists.addAll(collectedTargets);
        const docLang: string | undefined = this.determineDocLang(mapRoot, map.path);
        lists.setIndexTerms(this.listTargetCollector.indexTerms.getSortedEntries(docLang ?? "en"));
        const listsDocument: XMLDocument = this.listsDocumentBuilder.build(this.chunkPlan, lists, mapRoot, docLang, this.forceTitlePage, chunkBaseName);
        this.listsDocument = listsDocument;
        this.chunkDocuments = this.chunkDocumentBuilder.build(this.chunkPlan, docLang);
        const unifiedDocument: XMLDocument = this.unifiedDocumentBuilder.merge(map, this.chunkDocuments, listsDocument);
        this.unifiedDocument = unifiedDocument;
        return unifiedDocument;
    }

    static readonly DITAC_SUFFIX: string = ".ditac";
    static readonly DITAC_LISTS_BASENAME: string = "ditac_lists.ditac_lists";
    static readonly DITAC_SUBDIR_BASENAME: string = "ditac_files";

    private chunkBaseName(rootName: string): string {
        let buffer: string = DitaUtils.quotePathSegment(rootName);
        if (this.extension !== undefined) {
            buffer += "." + DitaUtils.quotePathSegment(this.extension);
        }
        return buffer;
    }

    getChunkDocuments(): ReadonlyMap<string, XMLDocument> {
        return this.chunkDocuments;
    }

    getListsDocument(): XMLDocument | undefined {
        return this.listsDocument;
    }

    getUnifiedDocument(): XMLDocument | undefined {
        return this.unifiedDocument;
    }

    getOutputDirectory(): string {
        return this.outDir;
    }

    writeChunkOutput(): { listsFile: string; chunkFiles: string[] } {
        const listsFile: string = join(this.outDir, TypesDitacPreprocessor.DITAC_LISTS_BASENAME);
        if (this.listsDocument !== undefined) {
            XMLWriter.writeDocument(this.listsDocument, listsFile);
        }
        const chunkFiles: string[] = [];
        for (const [rootName, document] of this.chunkDocuments) {
            const chunkFile: string = join(this.outDir, rootName + TypesDitacPreprocessor.DITAC_SUFFIX);
            XMLWriter.writeDocument(document, chunkFile);
            chunkFiles.push(chunkFile);
        }
        return { listsFile, chunkFiles };
    }

    private extractImages(plan: ChunkPlan, outDir: string): void {
        const extractDir: string = join(outDir, TypesDitacPreprocessor.DITAC_SUBDIR_BASENAME);
        try {
            if (existsSync(extractDir)) {
                rmSync(extractDir, { recursive: true, force: true });
            }
            mkdirSync(extractDir);
        } catch (error: unknown) {
            this.diagnostics.error(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("PreProcessor", "cannotCreateDirectory"),
                    [extractDir, error instanceof Error ? error.message : String(error)]
                ),
                extractDir
            );
            throw error;
        }
        const extractor: ExtractAsImage = new ExtractAsImage(extractDir, this.diagnostics);
        for (const spec of this.extractAsImageSpecs) {
            extractor.addSpec(spec);
        }
        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);
                extractor.process(topic.element, topic.getAncestorDocument().path);
            }
        }
    }

    private processResources(plan: ChunkPlan, mapRoot: DitaElement | undefined, mapPath: string): void {
        const handler: ResourceHandler | undefined = this.resourceHandler;
        if (handler === undefined) {
            return;
        }
        if (mapRoot !== undefined) {
            const title: DitaElement | undefined = DitaUtils.getChildByClass(mapRoot, "topic/title");
            if (title !== undefined) {
                this.processResourcesInElement(title, handler, mapPath);
            }
            const metadata: DitaElement | undefined = DitaUtils.getChildByClass(mapRoot, "map/topicmeta");
            if (metadata !== undefined) {
                this.processResourcesInElement(metadata, handler, mapPath);
            }
        }
        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);
                this.processResourcesInElement(topic.element, handler, topic.getAncestorDocument().path);
            }
        }
    }

    private processResourcesInElement(element: DitaElement, handler: ResourceHandler, documentPath: string): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            if (DitaUtils.hasClass(child, "topic/image")) {
                this.processResource(child, "href", true, handler, documentPath);
            } else if (DitaUtils.hasClass(child, "topic/object")) {
                this.processObjectResources(child, handler, documentPath);
            } else {
                this.processResourcesInElement(child, handler, documentPath);
            }
        }
    }

    private processObjectResources(element: DitaElement, handler: ResourceHandler, documentPath: string): void {
        this.processResource(element, "classid", false, handler, documentPath);
        this.processResource(element, "data", false, handler, documentPath);
        this.processArchiveResources(element, handler, documentPath);
        for (const parameter of element.getChildren().filter(
            (child: DitaElement): boolean => DitaUtils.hasClass(child, "topic/param")
        )) {
            const name: string | undefined = DitaUtils.getNonEmptyAttribute(parameter, "name");
            if (name === "source" || name === "track") {
                this.processResource(parameter, "value", false, handler, documentPath);
            } else if (name === "poster") {
                this.processResource(parameter, "value", true, handler, documentPath);
            }
        }
        this.processResourcesInElement(element, handler, documentPath);
    }

    private processResource(
        element: DitaElement,
        attributeName: string,
        isImage: boolean,
        handler: ResourceHandler,
        documentPath: string
    ): void {
        const absoluteAttributeName: string = "ditac:absolute" + attributeName[0].toUpperCase() + attributeName.slice(1);
        if (DitaUtils.getNonEmptyAttribute(element, absoluteAttributeName) !== undefined) {
            element.removeAttribute(absoluteAttributeName);
            return;
        }
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, attributeName);
        if (href === undefined) {
            return;
        }
        const resolved: string | undefined = this.tryHandleResource(handler, href, isImage, element, documentPath);
        if (resolved !== undefined && resolved !== href) {
            element.setAttribute(new XMLAttribute(attributeName, resolved));
        }
    }

    private processArchiveResources(element: DitaElement, handler: ResourceHandler, documentPath: string): void {
        const absoluteAttributeName: string = "ditac:absoluteArchive";
        const absoluteValue: string | undefined = DitaUtils.getNonEmptyAttribute(element, absoluteAttributeName);
        element.removeAttribute(absoluteAttributeName);
        const archive: string | undefined = DitaUtils.getNonEmptyAttribute(element, "archive");
        if (archive === undefined || absoluteValue === undefined) {
            return;
        }
        const absoluteFlags: string[] = absoluteValue.split(/\s+/);
        const hrefs: string[] = archive.split(/\s+/);
        const resolvedHrefs: string[] = [];
        let changed: boolean = false;
        for (let index: number = 0; index < hrefs.length; index++) {
            if (absoluteFlags[index] === "true") {
                resolvedHrefs.push(hrefs[index]);
                continue;
            }
            const resolved: string | undefined = this.tryHandleResource(handler, hrefs[index], false, element, documentPath);
            if (resolved !== undefined && resolved !== hrefs[index]) {
                changed = true;
                resolvedHrefs.push(resolved);
            } else {
                resolvedHrefs.push(hrefs[index]);
            }
        }
        if (changed) {
            element.setAttribute(new XMLAttribute("archive", resolvedHrefs.join(" ")));
        }
    }

    private tryHandleResource(
        handler: ResourceHandler,
        href: string,
        isImage: boolean,
        element: DitaElement,
        documentPath: string
    ): string | undefined {
        try {
            return handler.handleResource(href, isImage, this.outDir);
        } catch (error: unknown) {
            const message: string = this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("Filter", "cannotProcessResource"),
                [href, error instanceof Error ? error.message : String(error)]
            );
            this.diagnostics.error(message, NodeLocation.of(documentPath, element));
            return undefined;
        }
    }

    private sortColspecs(plan: ChunkPlan): void {
        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);
                this.sortColspecsInElement(topic.element, topic.getAncestorDocument().path);
            }
        }
    }

    private sortColspecsInElement(element: DitaElement, location: string): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            if (DitaUtils.hasClass(child, "topic/tgroup")) {
                this.sortColspecsInGroup(child, location);
            } else {
                this.sortColspecsInElement(child, location);
            }
        }
    }

    private sortColspecsInGroup(tgroup: DitaElement, location: string): void {
        const colspecs: DitaElement[] = DitaUtils.findChildrenByClass(tgroup, "topic/colspec");
        if (colspecs.length <= 1) {
            return;
        }
        const hasColnums: boolean = colspecs.some((colspec: DitaElement): boolean => this.getColnum(colspec, location, false) >= 1);
        if (!hasColnums) {
            return;
        }
        let prevColnum: number = 0;
        for (const colspec of colspecs) {
            let colnum: number = this.getColnum(colspec, location, true);
            if (colnum >= 1) {
                if (colnum <= prevColnum) {
                    this.diagnostics.error(
                        this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("PreProcessor", "unsortedColnum"),
                            [colnum.toString(), prevColnum.toString()]
                        ),
                        location
                    );
                }
            } else {
                colnum = prevColnum + 1;
                colspec.setAttribute(new XMLAttribute("colnum", colnum.toString()));
            }
            prevColnum = colnum;
        }
        const sorted: DitaElement[] = colspecs.slice().sort(
            (a: DitaElement, b: DitaElement): number => this.getColnum(a, location, false) - this.getColnum(b, location, false)
        );
        const content: XMLNode[] = tgroup.getContent();
        const lastIndex: number = content.lastIndexOf(colspecs[colspecs.length - 1]);
        const anchor: XMLNode | undefined = content[lastIndex + 1];
        const remaining: XMLNode[] = content.filter((node: XMLNode): boolean => !colspecs.includes(node as DitaElement));
        const insertIndex: number = anchor === undefined ? remaining.length : remaining.indexOf(anchor);
        remaining.splice(insertIndex, 0, ...sorted);
        tgroup.setContent(remaining);
    }

    private getColnum(colspec: DitaElement, location: string, reportError: boolean): number {
        const value: string | undefined = DitaUtils.getNonEmptyAttribute(colspec, "colnum");
        if (value === undefined) {
            return -1;
        }
        const normalized: string = value.trim();
        const decimalPattern: RegExp = /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|Infinity|NaN)[fFdD]?$/;
        const hexadecimalPattern: RegExp = /^[+-]?0[xX](?:[0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?|\.[0-9a-fA-F]+)[pP][+-]?[0-9]+[fFdD]?$/;
        const parsesAsDouble: boolean = decimalPattern.test(normalized) || hexadecimalPattern.test(normalized);
        if (!parsesAsDouble) {
            if (reportError) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("PreProcessor", "invalidColnum"),
                        [value]
                    ),
                    location
                );
            }
            return -1;
        }
        const suffix: string = normalized.slice(-1).toLowerCase();
        const numericValue: string = suffix === "f" || suffix === "d"
            ? normalized.slice(0, -1)
            : normalized;
        let parsed: number;
        if (hexadecimalPattern.test(normalized)) {
            const sign: number = numericValue.startsWith("-") ? -1 : 1;
            const unsigned: string = numericValue.replace(/^[+-]/, "");
            const parts: string[] = unsigned.slice(2).split(/[pP]/);
            const significandParts: string[] = parts[0].split(".");
            const fraction: string = significandParts.length === 1 ? "" : significandParts[1];
            const significand: number = Number.parseInt(significandParts[0] + fraction, 16);
            const exponent: number = Number.parseInt(parts[1], 10);
            parsed = sign * significand * Math.pow(16, exponent - fraction.length * 4);
        } else {
            parsed = Number(numericValue);
        }
        let colnum: number;
        if (Number.isNaN(parsed)) {
            colnum = 0;
        } else if (parsed >= 2147483647) {
            colnum = 2147483647;
        } else if (parsed <= -2147483648) {
            colnum = -2147483648;
        } else {
            colnum = Math.trunc(parsed);
        }
        return colnum >= 1 ? colnum : -1;
    }

    private numberEquations(plan: ChunkPlan): void {
        const equationCounter: FormalElementCounter = new FormalElementCounter("equation");
        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);
                equationCounter.traversing(entry);
                this.numberEquationsInElement(topic.element, equationCounter);
            }
        }
    }

    private numberEquationsInElement(element: DitaElement, counter: FormalElementCounter): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            if (DitaUtils.hasClass(child, "equation-d/equation-block")) {
                const numbers: DitaElement[] = DitaUtils.findChildrenByClass(child, "equation-d/equation-number");
                if (numbers.length > 0) {
                    counter.increment();
                    const value: string = counter.format();
                    for (const number of numbers) {
                        if (!DitaUtils.hasContent(number)) {
                            number.addString(value);
                            number.setAttribute(new XMLAttribute("ditac:filled", "true"));
                        }
                    }
                }
            } else {
                this.numberEquationsInElement(child, counter);
            }
        }
    }

    private numberListingLines(plan: ChunkPlan): void {
        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);
                ListingProcessor.processTopic(topic.element, topic.getAncestorDocument().path, this.diagnostics);
            }
        }
    }

    private applyMapFilter(mapRoot: DitaElement, mapPath: string, externalFilter: Filter | undefined, excludeResourceOnly: boolean): void {
        const filterCopy: Filter = externalFilter === undefined ? new Filter() : Filter.copyOf(externalFilter);
        if (excludeResourceOnly) {
            filterCopy.addExcludeProps("processing-role", "resource-only");
        }
        filterCopy.addExcludeProps("print", this.media === "print" ? "no" : "printonly");
        this.filters.setExternalFilter(filterCopy);
        this.filters.filterMap(mapRoot, mapPath);
    }

    private applyTopicFilters(mapRoot: DitaElement | undefined, mapPath: string, externalFilter: Filter | undefined): void {
        if (mapRoot === undefined) {
            return;
        }
        if (externalFilter === undefined && !DitaUtils.containsDitavalrefs(mapRoot)) {
            return;
        }
        this.filters.setExternalFilter(externalFilter);
        this.filters.filterTopics(mapRoot, mapPath, this.documents);
    }

    private validateAttributeValues(values: AttributeValues): void {
        if (!values.hasAttributes()) {
            return;
        }
        for (const document of this.documents.values()) {
            if (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC) {
                continue;
            }
            const root: DitaElement | undefined = DitaUtils.getRoot(document.document);
            if (root !== undefined) {
                values.validate(root, document.path, this.diagnostics);
            }
        }
    }

    private prepareChunking(mapRoot: DitaElement): void {
        let chunkMode: Chunking = this.chunking;
        if (chunkMode === Chunking.AUTO && this.media === "print") {
            chunkMode = Chunking.NONE;
        }
        if (chunkMode !== Chunking.AUTO) {
            this.discardChunk(mapRoot, chunkMode === Chunking.SINGLE);
            mapRoot.setAttribute(new XMLAttribute("chunk", "to-content"));
        }
    }

    private discardChunk(element: DitaElement, keepSelect: boolean): void {
        for (const child of element.getChildren()) {
            if (keepSelect) {
                const value: string | undefined = child.getAttribute("chunk")?.getValue();
                if (value !== undefined && value.length > 0) {
                    const tokens: string[] = value.trim().split(/\s+/);
                    const select: string | undefined = tokens.find((token: string): boolean => token.startsWith("select-"));
                    if (select === undefined) {
                        child.removeAttribute("chunk");
                    } else {
                        child.setAttribute(new XMLAttribute("chunk", select));
                    }
                }
            } else {
                child.removeAttribute("chunk");
            }
            this.discardChunk(child, keepSelect);
        }
    }

    private processLinks(
        plan: ChunkPlan,
        mapPath: string,
        topics: ReadonlyArray<LoadedTopic>,
        loadedDocuments: LoadedDocuments
    ): void {
        const targets: Map<string, Target> = this.indexTopics(plan, mapPath, topics);
        this.normalizeTopicIds(plan);
        const glossEntries: Set<DitaElement> = new Set<DitaElement>();
        const processed: Set<DitaElement> = new Set<DitaElement>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic.element)) {
                    continue;
                }
                processed.add(topic.element);
                this.rewriteTopic(topic.element, topic, chunk, plan, targets, mapPath, glossEntries, loadedDocuments);
            }
        }
    }

    private normalizeTopicIds(plan: ChunkPlan): void {
        const used: Map<string, DitaElement> = this.topicIdRegistry;
        const processed: Set<DitaElement> = new Set<DitaElement>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic.element)) {
                    continue;
                }
                processed.add(topic.element);
                const originalTopicId: string = topic.element.getAttribute("id")?.getValue().trim() || topic.topicId;
                const topicId: string = DitaUtils.makeUniqueId(originalTopicId, used, topic.element);
                topic.element.setAttribute(new XMLAttribute("id", topicId));
                this.processIds(topic.element, topicId, used, topic.getAncestorDocument().path);
            }
        }
    }

    private processIds(
        element: DitaElement,
        topicId: string,
        used: Map<string, DitaElement>,
        documentPath: string
    ): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            if (!DitaUtils.hasDITANamespace(child)) {
                continue;
            }
            const originalId: string | undefined = DitaUtils.getNonEmptyAttribute(child, "id");
            if (originalId !== undefined) {
                if (DitaUtils.hasClass(child, "topic/resourceid")) {
                    used.set(originalId, child);
                } else {
                    const candidate: string = topicId + "__" + originalId;
                    if (used.has(candidate)) {
                        this.diagnostics.warning(
                            this.diagnostics.i18n.format(
                                this.diagnostics.i18n.getString("PreProcessor", "duplicateId"),
                                [originalId, "???"]
                            ),
                            documentPath
                        );
                    }
                    const flattenedId: string = DitaUtils.makeUniqueId(candidate, used, child);
                    child.setAttribute(new XMLAttribute("id", flattenedId));
                }
            }
            this.processIds(child, topicId, used, documentPath);
        }
    }

    private indexTopics(
        plan: ChunkPlan,
        mapPath: string,
        topics: ReadonlyArray<LoadedTopic>
    ): Map<string, Target> {
        const targets: Map<string, Target> = new Map();
        const indexedTopics: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                if (entry.type !== ChunkEntryType.TOPIC || entry.loadedTopic === undefined) {
                    continue;
                }
                const topic: LoadedTopic = entry.loadedTopic;
                if (indexedTopics.has(topic)) {
                    continue;
                }
                indexedTopics.add(topic);
                const target: Target = { topic, chunk };
                this.addTarget(targets, topic.getAncestorDocument().path + "#" + topic.topicId, target);
                this.addTarget(targets, topic.getHref(), target);
                const sourceHref: string | undefined = topic.getSourceHref();
                if (sourceHref !== undefined) {
                    this.addTarget(targets, sourceHref, target);
                    this.addTarget(targets, this.normalizeTarget(sourceHref, mapPath), target);
                }
                if (topic === topic.getAncestorDocument().getFirstTopic()) {
                    const documentPath: string = topic.getAncestorDocument().path;
                    this.addTarget(targets, documentPath, target);
                    this.addTarget(targets, this.normalizePath(documentPath, mapPath), target);
                }
            }
        }
        for (const topic of topics) {
            if (indexedTopics.has(topic)) {
                continue;
            }
            const target: Target = { topic, chunk: plan.getChunk(topic) };
            const sourceHref: string | undefined = topic.getSourceHref();
            if (sourceHref !== undefined) {
                this.addTarget(targets, sourceHref, target);
                this.addTarget(targets, this.normalizeTarget(sourceHref, mapPath), target);
            }
            const documentPath: string = topic.getAncestorDocument().path;
            this.addTarget(targets, documentPath + "#" + topic.topicId, target);
            this.addTarget(targets, topic.getHref(), target);
        }
        return targets;
    }

    private addTarget(targets: Map<string, Target>, href: string, target: Target): void {
        targets.set(href, target);
    }

    private rewriteTopic(
        element: DitaElement,
        currentTopic: LoadedTopic,
        currentChunk: Chunk,
        plan: ChunkPlan,
        targets: Map<string, Target>,
        mapPath: string,
        glossEntries: Set<DitaElement>,
        loadedDocuments: LoadedDocuments
    ): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            let deeper: boolean = true;
            if (TypesDitacPreprocessor.IMAGE_ELEMENTS.some((cls): boolean => DitaUtils.hasClass(child, cls))) {
                this.checkImageHref(child, currentTopic.getAncestorDocument().path);
            } else {
                const href: XMLAttribute | undefined = child.getAttribute("href");
                if (href !== undefined &&
                    this.isLocalDitaHref(child, href.getValue(), currentTopic.getAncestorDocument().path)) {
                    const target: TargetResolution = this.targetURLToChunkRef(
                        href.getValue(), currentTopic, targets, currentTopic.getAncestorDocument().path, loadedDocuments
                    );
                    if ("error" in target) {
                        if (target.error === "invalidAttribute") {
                            this.diagnostics.error(
                                this.diagnostics.i18n.format(
                                    this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                                    [href.getValue(), "href"]
                                ),
                                currentTopic.getAncestorDocument().path + ": href=\"" + href.getValue() + "\""
                            );
                        } else {
                            this.diagnostics.warning(
                                this.diagnostics.i18n.format(
                                    this.diagnostics.i18n.getString("LinkGenerator", "pointsOutsidePreprocessedTopics"),
                                    [href.getValue()]
                                ),
                                currentTopic.getAncestorDocument().path + ": href=\"" + href.getValue() + "\""
                            );
                        }
                    } else if (!this.rewriteResolvedLink(child, target.target, currentChunk, plan)) {
                        this.diagnostics.warning(
                            this.diagnostics.i18n.format(
                                this.diagnostics.i18n.getString("LinkGenerator", "pointsOutsidePreprocessedTopics"),
                                [href.getValue()]
                            ),
                            currentTopic.getAncestorDocument().path + ": href=\"" + href.getValue() + "\""
                        );
                    } else {
                        const targetElement: DitaElement | undefined = this.resolveTargetElement(target.target);
                        if (targetElement === undefined) {
                            this.diagnostics.warning(
                                this.diagnostics.i18n.format(
                                    this.diagnostics.i18n.getString("PreProcessor", "noHrefTarget"),
                                    [target.target.topic.getHref()]
                                ),
                                currentTopic.getAncestorDocument().path + ": href=\"" + href.getValue() + "\""
                            );
                        } else {
                            const done: boolean = this.fillLinkContent(
                                child, targetElement, glossEntries, currentTopic.getAncestorDocument().path
                            );
                            if (!done) {
                                this.diagnostics.warning(
                                    this.diagnostics.i18n.format(
                                        this.diagnostics.i18n.getString("PreProcessor", "noLinkText"),
                                        [child.getName(), targetElement.getName(), targetElement.getAttribute("id")?.getValue() ?? ""]
                                    ),
                                    currentTopic.getAncestorDocument().path + ": href=\"" + href.getValue() + "\""
                                );
                            }
                            deeper = child.getAttribute("ditac:filled") === undefined;
                        }
                    }
                }
            }
            if (deeper) {
                this.rewriteTopic(child, currentTopic, currentChunk, plan, targets, mapPath, glossEntries, loadedDocuments);
            }
        }
    }

    private rewriteResolvedLink(element: DitaElement, target: Target, currentChunk: Chunk, plan: ChunkPlan): boolean {
        const targetChunk: Chunk | undefined = target.chunk ?? plan.getChunk(target.topic);
        if (targetChunk === undefined) {
            return false;
        }
        const targetName: string | undefined = targetChunk.getRootName();
        if (targetName === undefined) {
            return false;
        }
        const targetId: string = this.targetId(target);
        const prefix: string = targetChunk === currentChunk ? "" : this.chunkBaseName(targetName);
        element.setAttribute(new XMLAttribute("href", prefix + "#" + URIComponent.quoteFragment(targetId)));
        return true;
    }

    private targetURLToChunkRef(
        href: string,
        currentTopic: LoadedTopic | undefined,
        targets: Map<string, Target>,
        mapPath: string,
        loadedDocuments: LoadedDocuments
    ): TargetResolution {
        if (href.startsWith("#")) {
            const fragment: string = href.slice(1);
            const slash: number = fragment.lastIndexOf("/");
            const topicPart: string = slash >= 0 ? fragment.slice(0, slash) : fragment;
            const elementPart: string | undefined = slash >= 0 ? fragment.slice(slash + 1) : undefined;
            const topicId: string = URIComponent.decode(topicPart.trim());
            const elementId: string | undefined = elementPart === undefined || elementPart.trim().length === 0
                ? undefined
                : URIComponent.decode(elementPart.trim());
            if (topicId.length === 0) {
                return { error: "invalidAttribute" };
            }
            const documentPath: string | undefined = currentTopic === undefined
                ? undefined
                : currentTopic.getAncestorDocument().path;
            const target: Target | undefined = documentPath === undefined
                ? undefined
                : targets.get(documentPath + "#" + topicId);
            return target === undefined
                ? { error: "pointsOutsidePreprocessedTopics" }
                : { target: { ...target, elementId } };
        }
        const parts: string[] = href.split("#", 2);
        const base: string = parts[0];
        const normalizedBase: string = this.normalizePath(base, mapPath);
        const normalizedTarget: string = this.normalizeTarget(href, mapPath);
        if (parts.length === 1) {
            const existingTarget: Target | undefined = targets.get(base) ?? targets.get(normalizedBase);
            if (existingTarget !== undefined) {
                return { target: existingTarget };
            }
            const loadedTarget: LoadedTopic | undefined = this.loadTarget(
                normalizedBase, undefined, loadedDocuments, targets
            );
            if (loadedTarget === undefined) {
                return { error: "pointsOutsidePreprocessedTopics" };
            }
            return { target: { topic: loadedTarget } };
        }
        const fragment: string = parts[1];
        const slash: number = fragment.lastIndexOf("/");
        const topicPart: string = slash >= 0 ? fragment.slice(0, slash) : fragment;
        const elementPart: string | undefined = slash >= 0 ? fragment.slice(slash + 1) : undefined;
        const topicId: string = URIComponent.decode(topicPart.trim());
        const elementId: string | undefined = elementPart === undefined || elementPart.trim().length === 0
            ? undefined
            : URIComponent.decode(elementPart.trim());
        if (topicId.length === 0) {
            return { error: "invalidAttribute" };
        }
        const candidates: string[] = [
            base + "#" + topicPart,
            base + "#" + topicId,
            normalizedTarget,
            normalizedBase + "#" + topicPart,
            normalizedBase + "#" + topicId
        ];
        for (const candidate of candidates) {
            const target: Target | undefined = targets.get(candidate);
            if (target !== undefined) {
                return { target: { ...target, elementId } };
            }
        }
        for (const target of new Set<Target>(targets.values())) {
            if (target.topic.getAncestorDocument().path === normalizedBase && target.topic.topicId === topicId) {
                return { target: { ...target, elementId } };
            }
            const sourceHref: string | undefined = target.topic.getSourceHref();
            if (sourceHref !== undefined) {
                const sourceParts: string[] = sourceHref.split("#", 2);
                const sourceTopicId: string | undefined = sourceParts.length === 2
                    ? URIComponent.decode(sourceParts[1].split("/", 1)[0])
                    : undefined;
                if (sourceTopicId === topicId && this.normalizePath(sourceParts[0], mapPath) === normalizedBase) {
                    return { target: { ...target, elementId } };
                }
            }
        }
        const loadedTarget: LoadedTopic | undefined = this.loadTarget(
            normalizedBase, topicId, loadedDocuments, targets
        );
        if (loadedTarget !== undefined) {
            return { target: { topic: loadedTarget, elementId } };
        }
        return { error: "pointsOutsidePreprocessedTopics" };
    }

    private loadTarget(
        documentPath: string,
        topicId: string | undefined,
        loadedDocuments: LoadedDocuments,
        targets: Map<string, Target>
    ): LoadedTopic | undefined {
        try {
            const document: LoadedDocument = loadedDocuments.load(documentPath);
            const topic: LoadedTopic | undefined = topicId === undefined
                ? document.getFirstTopic()
                : document.findTopicById(topicId);
            if (topic !== undefined) {
                this.addTarget(targets, topicId === undefined ? documentPath : documentPath + "#" + topicId, { topic });
                return topic;
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    private resolveTarget(target: Target): { id: string; element?: DitaElement } {
        const topicId: string = target.topic.element.getAttribute("id")?.getValue() ?? target.topic.topicId;
        if (target.elementId === undefined) {
            return { id: topicId, element: target.topic.element };
        }
        const wantedId: string = topicId + "__" + target.elementId;
        for (const element of this.ownDescendants(target.topic.element)) {
            if (element.getAttribute("id")?.getValue() === wantedId) {
                return { id: wantedId, element };
            }
        }
        return { id: wantedId };
    }

    private ownDescendants(element: DitaElement): DitaElement[] {
        const result: DitaElement[] = [];
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return result;
            }
            result.push(child);
            result.push(...this.ownDescendants(child));
        }
        return result;
    }

    private targetId(target: Target): string {
        return this.resolveTarget(target).id;
    }

    private resolveTargetElement(target: Target): DitaElement | undefined {
        return this.resolveTarget(target).element;
    }

    private normalizePath(href: string, mapPath: string): string {
        const queryIndex: number = href.indexOf("?");
        const base: string = queryIndex < 0 ? href : href.slice(0, queryIndex);
        if (base.startsWith("file:")) {
            try {
                return fileURLToPath(new URL(base));
            } catch {
                return base;
            }
        }
        return base.length === 0 ? mapPath : DitaUtils.resolveDocumentPath(mapPath, base);
    }

    private normalizeTarget(href: string, mapPath: string): string {
        const hashIndex: number = href.indexOf("#");
        if (hashIndex < 0) {
            return this.normalizePath(href, mapPath);
        }
        const base: string = href.slice(0, hashIndex);
        return this.normalizePath(base, mapPath) + href.slice(hashIndex);
    }

    private isLocalDitaHref(element: DitaElement, href: string, documentPath: string): boolean {
        const scope: string = DitaUtils.getScope(element, href);
        if (scope !== "local") {
            return false;
        }
        const format: string | undefined = DitaUtils.getFormat(element, href, scope);
        if (format === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("DITAUtil", "missingAttribute"),
                    ["format"]
                ),
                documentPath + ": href=\"" + href + "\""
            );
            return false;
        }
        return format === "dita";
    }

    private checkImageHref(element: DitaElement, documentPath: string): void {
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
        if (href === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Filter", "missingAttribute"),
                    ["href"]
                ),
                documentPath
            );
            return;
        }
        if (href.startsWith("data:")) {
            return;
        }
        if (/^https?:\/\//i.test(href)) {
            try {
                new URL(href);
            } catch {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                        [href, "href"]
                    ),
                    documentPath + ": href=\"" + href + "\""
                );
                return;
            }
            if (!DitaUtils.urlExists(href.split("#", 1)[0])) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("PreProcessor", "noSuchFile"),
                        [href]
                    ),
                    documentPath + ": href=\"" + href + "\""
                );
            }
            return;
        }
        let filePath: string;
        if (href.startsWith("file:")) {
            try {
                filePath = fileURLToPath(href);
            } catch {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                        [href, "href"]
                    ),
                    documentPath + ": href=\"" + href + "\""
                );
                return;
            }
        } else {
            filePath = href.split("#", 1)[0];
        }
        if (!existsSync(filePath)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("PreProcessor", "noSuchFile"),
                    [filePath]
                ),
                documentPath + ": href=\"" + href + "\""
            );
        }
    }

    private fillLinkContent(element: DitaElement, target: DitaElement, glossEntries: Set<DitaElement>, documentPath: string): boolean {
        if (DitaUtils.hasClass(element, "topic/link")) {
            return this.addLinkText(element, target);
        }
        if (DitaUtils.hasClass(element, "abbrev-d/abbreviated-form")) {
            return this.addAbbrev(element, target, glossEntries, documentPath);
        }
        if (TypesDitacPreprocessor.XREF_ELEMENTS.some((cls): boolean => DitaUtils.hasClass(element, cls))) {
            return this.addXrefText(element, target, documentPath);
        }
        return true;
    }

    private addLinkText(link: DitaElement, target: DitaElement): boolean {
        let linktext: DitaElement | undefined = DitaUtils.getChildByClass(link, "topic/linktext");
        if (linktext !== undefined && DitaUtils.collapseWhitespace(DitaUtils.getTextContent(linktext)).length === 0) {
            link.removeChild(linktext);
            linktext = undefined;
        }
        let desc: DitaElement | undefined = DitaUtils.getChildByClass(link, "topic/desc");
        if (desc !== undefined && DitaUtils.collapseWhitespace(DitaUtils.getTextContent(desc)).length === 0) {
            link.removeChild(desc);
            desc = undefined;
        }
        let done: boolean = false;
        if (linktext !== undefined) {
            done = true;
        } else {
            const title: DitaElement | undefined = DitaUtils.hasClass(target, "topic/title") ? target : this.getTitleFromChild(target, true);
            if (title !== undefined) {
                const newLinktext: DitaElement = new DitaElement("linktext");
                newLinktext.setAttribute(new XMLAttribute("class", "- topic/linktext "));
                this.insertBefore(link, newLinktext, desc);
                this.copyChildren(title, newLinktext);
                done = true;
                link.setAttribute(new XMLAttribute("ditac:filled", "true"));
            }
        }
        if (desc === undefined) {
            let shortdesc: DitaElement | undefined = DitaUtils.getChildByClass(target, "topic/shortdesc");
            if (shortdesc === undefined && DitaUtils.hasClass(target, "topic/topic")) {
                const container: DitaElement | undefined = DitaUtils.getChildByClass(target, "topic/abstract");
                if (container !== undefined) {
                    shortdesc = DitaUtils.getChildByClass(container, "topic/shortdesc");
                }
            }
            if (shortdesc !== undefined) {
                const newDesc: DitaElement = new DitaElement("desc");
                newDesc.setAttribute(new XMLAttribute("class", "- topic/desc "));
                link.addElement(newDesc);
                this.copyChildren(shortdesc, newDesc);
            }
        }
        return done;
    }

    private addAbbrev(abbrev: DitaElement, target: DitaElement, glossEntries: Set<DitaElement>, documentPath: string): boolean {
        const useLongForm: boolean = !glossEntries.has(target);
        if (useLongForm) {
            glossEntries.add(target);
        }
        const longForm: DitaElement | undefined = DitaUtils.getDescendantByClass(target, 0, ["glossentry/glossSurfaceForm"]);
        const shortForm: DitaElement | undefined = DitaUtils.getDescendantByClass(
            target, 0, ["glossentry/glossAcronym", "glossentry/glossAbbreviation", "glossentry/glossShortForm"]
        );
        let done: boolean;
        if (useLongForm) {
            if (longForm === undefined) {
                done = this.addXrefText(abbrev, target, documentPath);
            } else {
                this.fillXref(abbrev, longForm);
                done = true;
            }
        } else if (shortForm === undefined) {
            done = this.addXrefText(abbrev, target, documentPath);
        } else {
            this.fillXref(abbrev, shortForm);
            done = true;
            const title: string = longForm === undefined ? "" : DitaUtils.collapseWhitespace(DitaUtils.getTextContent(longForm));
            if (title.length > 0) {
                abbrev.setAttribute(new XMLAttribute("ditac:title", title));
            }
        }
        return done;
    }

    private addXrefText(xref: DitaElement, target: DitaElement, documentPath: string): boolean {
        if (DitaUtils.hasContent(xref)) {
            return true;
        }
        const isXref: boolean = DitaUtils.hasClass(xref, "topic/xref");
        const xrefType: string | undefined = xref.getAttribute("type")?.getValue().trim();
        if (isXref && xrefType === "fn") {
            return true;
        }
        if (DitaUtils.hasClass(target, "topic/fn") && isXref && xrefType === undefined) {
            if (!this.isLwDITA(xref)) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("PreProcessor", "missingAttribute2"),
                        ["type", "fn"]
                    ),
                    documentPath + ": " + xref.getName()
                );
            }
            xref.setAttribute(new XMLAttribute("type", "fn"));
            return true;
        }
        if (DitaUtils.hasClass(target, "topic/li")) {
            const parent: DitaElement | undefined = target.getParent();
            if (parent !== undefined && DitaUtils.hasClass(parent, "topic/ol")) {
                const number: number = this.listItemIndex(parent, target);
                if (number > 0) {
                    xref.addTextNode(new TextNode(number.toString()));
                    xref.setAttribute(new XMLAttribute("ditac:filled", "true"));
                    return true;
                }
            }
        }
        if (DitaUtils.hasClass(target, "topic/dlentry")) {
            const term: DitaElement | undefined = DitaUtils.getChildByClass(target, "topic/dt");
            if (term !== undefined) {
                this.fillXref(xref, term);
                return true;
            }
        }
        const title: DitaElement | undefined = DitaUtils.hasClass(target, "topic/title") ? target : this.getTitleFromChild(target, true);
        if (title === undefined) {
            return false;
        }
        this.fillXref(xref, title);
        return true;
    }

    private fillXref(xref: DitaElement, title: DitaElement): void {
        this.copyChildren(title, xref);
        xref.setAttribute(new XMLAttribute("ditac:filled", "true"));
    }

    private isLwDITA(element: DitaElement): boolean {
        const domains: string | undefined = DitaUtils.lookupAncestorAttribute(element, "domains");
        if (domains === undefined) {
            return false;
        }
        const collapsed: string = DitaUtils.collapseWhitespace(domains);
        return collapsed.length > 0 && collapsed.indexOf(" xdita-c)") > 0;
    }

    private getTitleFromChild(element: DitaElement, preferNavtitle: boolean): DitaElement | undefined {
        let titleElement: DitaElement | undefined;
        if (preferNavtitle && DitaUtils.hasClass(element, "topic/topic")) {
            const titlealts: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/titlealts");
            if (titlealts !== undefined) {
                const navtitle: DitaElement | undefined = DitaUtils.getChildByClass(titlealts, "topic/navtitle");
                if (navtitle !== undefined) {
                    titleElement = this.checkTitleChild(navtitle);
                }
            }
        }
        if (titleElement === undefined) {
            const title: DitaElement | undefined = DitaUtils.getChildByClass(element, "topic/title");
            if (title !== undefined) {
                titleElement = this.checkTitleChild(title);
            }
        }
        return titleElement;
    }

    private checkTitleChild(element: DitaElement): DitaElement | undefined {
        return DitaUtils.collapseWhitespace(DitaUtils.getTextContent(element)).length > 0 ? element : undefined;
    }

    private listItemIndex(parent: DitaElement, element: DitaElement): number {
        let index: number = 1;
        for (const child of parent.getChildren()) {
            if (child === element) {
                return index;
            }
            if (child.getName() === element.getName()) {
                index++;
            }
        }
        return -1;
    }

    private insertBefore(parent: DitaElement, newChild: DitaElement, before: DitaElement | undefined): void {
        if (before === undefined) {
            parent.addElement(newChild);
            return;
        }
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(before);
        if (index < 0) {
            parent.addElement(newChild);
            return;
        }
        content.splice(index, 0, newChild);
        parent.setContent(content);
    }

    private copyChildren(source: DitaElement, target: DitaElement): void {
        const content: XMLNode[] = target.getContent();
        for (const node of source.getContent()) {
            content.push(node instanceof DitaElement ? DitaUtils.cloneElement(node) : node);
        }
        target.setContent(content);
    }

}

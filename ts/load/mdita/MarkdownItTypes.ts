/*
 * Portions Copyright (c) 2026 Maxprograms SAS. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import MarkdownIt from "markdown-it";

export type MarkdownItInstance = InstanceType<typeof MarkdownIt>;
export type MarkdownItPlugin = (md: MarkdownItInstance) => void;
export type RuleBlock = Parameters<MarkdownItInstance["block"]["ruler"]["before"]>[2];
export type RuleInline = Parameters<MarkdownItInstance["inline"]["ruler"]["before"]>[2];
export type StateBlock = Parameters<RuleBlock>[0];
export type StateInline = Parameters<RuleInline>[0];
export type RuleCore = Parameters<MarkdownItInstance["core"]["ruler"]["after"]>[2];
export type StateCore = Parameters<RuleCore>[0];
export type RenderRule = MarkdownItInstance["renderer"]["rules"][string];
export type Token = Parameters<NonNullable<RenderRule>>[0][number];

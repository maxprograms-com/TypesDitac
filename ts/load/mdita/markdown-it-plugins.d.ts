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

type AmbientMarkdownItPlugin =
    (md: ReturnType<typeof import("markdown-it", { with: { "resolution-mode": "require" } })>) => void;

declare module "markdown-it-abbr" {
    const plugin: AmbientMarkdownItPlugin;
    export default plugin;
}

declare module "markdown-it-ins" {
    const plugin: AmbientMarkdownItPlugin;
    export default plugin;
}

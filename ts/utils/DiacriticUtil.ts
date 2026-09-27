/*
 * Portions Copyright (c) 2017-2025 XMLmind Software. All rights reserved.
 * Author: Hussein Shafie
 *
 * Portions Copyright (c) 2026 Maxprograms SAS.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export class DiacriticUtil {
    private static readonly diacritics: string[] = [];

    static {
        for (let c: number = 0; c < 0x300; ++c) {
            DiacriticUtil.diacritics[c] = String.fromCharCode(c);
        }

        function mapRange(c1: number, c2: number, c: string): void {
            for (let i: number = c1; i <= c2; ++i) {
                DiacriticUtil.diacritics[i] = c;
            }
        }

        function mapChar(c1: number, c: string): void {
            DiacriticUtil.diacritics[c1] = c;
        }

        mapRange(0x00C0, 0x00C5, "A");
        mapChar(0x00C6, String.fromCharCode(0xe6));
        mapChar(0x00C7, "C");
        mapRange(0x00C8, 0x00CB, "E");
        mapRange(0x00CC, 0x00CF, "I");
        mapChar(0x00D1, "N");
        mapRange(0x00D2, 0x00D8, "O");
        mapRange(0x00D9, 0x00DC, "U");
        mapChar(0x00DD, "Y");
        mapRange(0x00E0, 0x00E5, "a");
        mapChar(0x00E7, "c");
        mapRange(0x00E8, 0x00EB, "e");
        mapRange(0x00EC, 0x00EF, "i");
        mapChar(0x00F0, String.fromCharCode(0xd0));
        mapChar(0x00F1, "n");
        mapRange(0x00F2, 0x00F8, "o");
        mapRange(0x00F9, 0x00FC, "u");
        mapChar(0x00FD, "y");
        mapChar(0x00FE, String.fromCharCode(0x00de));
        mapChar(0x00FF, "y");
        mapRange(0x0100, 0x0105, "a");
        mapRange(0x0106, 0x010D, "c");
        mapRange(0x010E, 0x0111, "d");
        mapRange(0x0112, 0x011B, "e");
        mapRange(0x011C, 0x0123, "g");
        mapRange(0x0124, 0x0127, "h");
        mapRange(0x0128, 0x0131, "i");
        mapChar(0x0133, String.fromCharCode(0x0132));
        mapRange(0x0134, 0x0135, "j");
        mapRange(0x0136, 0x0137, "k");
        mapRange(0x0139, 0x0142, "l");
        mapRange(0x0143, 0x0149, "n");
        mapRange(0x014C, 0x0151, "o");
        mapRange(0x0154, 0x0159, "r");
        mapRange(0x015A, 0x0161, "s");
        mapRange(0x0162, 0x0167, "t");
        mapRange(0x0168, 0x0173, "u");
        mapRange(0x0174, 0x0175, "w");
        mapRange(0x0176, 0x0178, "y");
        mapRange(0x0179, 0x017E, "z");
        mapChar(0x017F, "s");
        mapRange(0x0180, 0x0183, "b");
        mapChar(0x0186, "o");
        mapRange(0x0187, 0x0188, "c");
        mapRange(0x0189, 0x018C, "d");
        mapChar(0x018E, "E");
        mapChar(0x0190, "E");
        mapChar(0x0191, "F");
        mapChar(0x0192, "f");
        mapChar(0x0193, "G");
        mapChar(0x0197, "I");
        mapChar(0x0198, "K");
        mapChar(0x0199, "k");
        mapChar(0x019A, "l");
        mapChar(0x019C, "M");
        mapChar(0x019D, "N");
        mapChar(0x019E, "n");
        mapChar(0x019F, "O");
        mapChar(0x01A0, "O");
        mapChar(0x01A1, "o");
        mapChar(0x01A3, String.fromCharCode(0x01a2));
        mapChar(0x01A4, "P");
        mapChar(0x01A5, "p");
        mapChar(0x01AB, "t");
        mapChar(0x01AC, "T");
        mapChar(0x01AD, "t");
        mapChar(0x01AE, "T");
        mapChar(0x01AF, "U");
        mapChar(0x01B0, "u");
        mapChar(0x01B2, "V");
        mapChar(0x01B3, "Y");
        mapChar(0x01B4, "y");
        mapChar(0x01B5, "Z");
        mapChar(0x01B6, "z");
        mapChar(0x01B8, String.fromCharCode(0X01B7));
        mapChar(0x01B9, String.fromCharCode(0x01b7));
        mapChar(0x01BA, String.fromCharCode(0x01b7));
        mapChar(0x01CD, "A");
        mapChar(0x01CE, "a");
        mapChar(0x01CF, "I");
        mapChar(0x01D0, "i");
        mapChar(0x01D1, "O");
        mapChar(0x01D2, "o");
        mapRange(0x01D3, 0x01DC, "u");
        mapChar(0x01DD, "e");
        mapChar(0x01DE, "A");
        mapChar(0x01DF, "a");
        mapChar(0x01E0, "A");
        mapChar(0x01E1, "a");
        mapChar(0x01E2, String.fromCharCode(0XC6));
        mapChar(0x01E3, String.fromCharCode(0xc6));
        mapChar(0x01E4, "G");
        mapChar(0x01E5, "g");
        mapChar(0x01E6, "G");
        mapChar(0x01E7, "g");
        mapChar(0x01E8, "K");
        mapChar(0x01E9, "k");
        mapChar(0x01EA, "O");
        mapChar(0x01EB, "o");
        mapChar(0x01EC, "O");
        mapChar(0x01ED, "o");
        mapChar(0x01EE, String.fromCharCode(0X01B7));
        mapChar(0x01EF, String.fromCharCode(0x01b7));
        mapChar(0x01F0, "j");
        mapChar(0x01F3, String.fromCharCode(0x01f1));
        mapChar(0x01F4, "G");
        mapChar(0x01F5, "g");
        mapChar(0x01FA, "A");
        mapChar(0x01FB, "a");
        mapChar(0x01FC, String.fromCharCode(0XC6));
        mapChar(0x01FD, String.fromCharCode(0xc6));
        mapChar(0x01FE, "O");
        mapChar(0x01FF, "o");
        mapChar(0x0200, "A");
        mapChar(0x0201, "a");
        mapChar(0x0202, "A");
        mapChar(0x0203, "a");
        mapChar(0x0204, "E");
        mapChar(0x0205, "e");
        mapChar(0x0206, "E");
        mapChar(0x0207, "e");
        mapChar(0x0208, "I");
        mapChar(0x0209, "i");
        mapChar(0x020A, "I");
        mapChar(0x020B, "i");
        mapChar(0x020C, "O");
        mapChar(0x020D, "o");
        mapChar(0x020E, "O");
        mapChar(0x020F, "o");
        mapChar(0x0210, "R");
        mapChar(0x0211, "r");
        mapChar(0x0212, "R");
        mapChar(0x0213, "r");
        mapChar(0x0214, "U");
        mapChar(0x0215, "u");
        mapChar(0x0216, "U");
        mapChar(0x0217, "u");
        mapChar(0x0250, "a");
        mapChar(0x0253, "b");
        mapChar(0x0254, "o");
        mapChar(0x0255, "c");
        mapChar(0x0256, "d");
        mapChar(0x0257, "d");
        mapChar(0x0258, "e");
        mapChar(0x025B, "e");
        mapChar(0x025C, "e");
        mapChar(0x025D, "e");
        mapChar(0x025E, "e");
        mapChar(0x025F, "j");
        mapChar(0x0260, "g");
        mapChar(0x0261, "g");
        mapChar(0x0262, "G");
        mapChar(0x0265, "h");
        mapChar(0x0266, "h");
        mapChar(0x0268, "i");
        mapChar(0x026A, "I");
        mapChar(0x026B, "l");
        mapChar(0x026C, "l");
        mapChar(0x026D, "l");
        mapChar(0x026F, "m");
        mapChar(0x0270, "m");
        mapChar(0x0271, "m");
        mapChar(0x0272, "n");
        mapChar(0x0273, "n");
        mapChar(0x0274, "N");
        mapChar(0x0275, "o");
        mapChar(0x0276, "\u0152");
        mapChar(0x0279, "r");
        mapChar(0x027A, "r");
        mapChar(0x027B, "r");
        mapChar(0x027C, "r");
        mapChar(0x027D, "r");
        mapChar(0x027E, "r");
        mapChar(0x027F, "r");
        mapChar(0x0280, "R");
        mapChar(0x0281, "R");
        mapChar(0x0282, "s");
        mapChar(0x0284, "j");
        mapChar(0x0287, "t");
        mapChar(0x0288, "t");
        mapChar(0x0289, "u");
        mapChar(0x028B, "v");
        mapChar(0x028C, "v");
        mapChar(0x028D, "w");
        mapChar(0x028E, "z");
        mapChar(0x028F, "Y");
        mapChar(0x0290, "z");
        mapChar(0x0291, "z");
        mapChar(0x0292, String.fromCharCode(0x01b7));
        mapChar(0x0293, String.fromCharCode(0x01b7));
        mapChar(0x0297, "c");
        mapChar(0x0299, "B");
        mapChar(0x029A, "e");
        mapChar(0x029B, "G");
        mapChar(0x029C, "H");
    }

    private constructor() {}

    public static collapseChar(c: string): string {
        if (c.length === 0) {
            return c;
        }
        const code: number = c.charCodeAt(0);
        if (code >= DiacriticUtil.diacritics.length) {
            return c;
        }
        const tc: string = DiacriticUtil.diacritics[code];
        return (tc.charCodeAt(0) === 0) ? c : tc;
    }

    public static collapse(s: string): string {
        const count: number = s.length;
        let result: string = "";
        for (let i: number = 0; i < count; ++i) {
            result += DiacriticUtil.collapseChar(s.charAt(i));
        }
        return result;
    }
}

/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements the FontData class for character bbox data
 *                and stretchy delimiters.
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

import {OptionList} from '../../util/Options.js';

/*
 * Data about a character
 *   [height, depth, width, italic-correction, skew, options]
 */
export type CharData =
    [number, number, number] |
    [number, number, number, number] |
    [number, number, number, number, number] |
    [number, number, number, number, number, OptionList];

export type CharMap = {
    [n: number]: CharData;
};

export type CharMapMap = {
    [name: string]: CharMap;
};

/*
 * Data for a variant
 */
export type VariantData = {
    /*
     * A list of CharMaps that must be updated when characters are
     * added to this variant
     */
    linked: CharMap[];
    /*
     * The character data for this variant
     */
    chars: CharMap;
};

export type VariantMap = {
    [name: string]: VariantData;
};

/*
 * Stretchy delimiter data
 */
export type DelimiterData = {
    dir: string;                 // 'V' or 'H' for vertcial or horizontal
    sizes?: number[];            // Array of fixed sizes for this character
    variants?: number[];         // The variants in which the different sizes can be found (if not the default)
    stretch?: number[];          // The unicode character numbers for the parts of multi-character versions [beg, ext, end, mid?]
    HDW?: number[];              // [h, d, w] (for vertical, h and d are the normal size, w is the multi-character width,
                                 //            for horizontal, h and d are the multi-character ones, w is for the normal size).
};

export type DelimiterMap = {
    [n: number]: DelimiterData;
};

/*
 * Font parameters (for TeX typesetting rules)
 */
export type FontParameters = {
    x_height: number,
    quad: number,
    num1: number,
    num2: number,
    num3: number,
    denom1: number,
    denom2: number,
    sup1: number,
    sup2: number,
    sup3: number,
    sub1: number,
    sub2: number,
    sup_drop: number,
    sub_drop: number,
    delim1: number,
    delim2: number,
    axis_height: number,
    rule_thickness: number,
    big_op_spacing1: number,
    big_op_spacing2: number,
    big_op_spacing3: number,
    big_op_spacing4: number,
    big_op_spacing5: number,

    surd_height: number,

    scriptspace: number,
    nulldelimiterspace: number,
    delimiterfactor: number,
    delimitershortfall: number,

    min_rule_thickness: number
};

/*
 * The stretch direction
 */
export const V = 'V';
export const H = 'H';

/****************************************************************************/
/*
 *  The FontData class (for storing character bounding box data by variant,
 *                      and the stretchy delimiter data).
 */
export class FontData {

    /*
     *  The standard variants to define
     */
    protected static defaultVariants = [
        ['normal'],
        ['bold', 'normal'],
        ['italic', 'normal'],
        ['bold-italic', 'italic', 'bold'],
        ['double-struck', 'bold'],
        ['fraktur', 'normal'],
        ['bold-fraktur', 'bold', 'fraktur'],
        ['script', 'normal'],
        ['bold-script', 'bold', 'script'],
        ['sans-serif', 'normal'],
        ['bold-sans-serif', 'bold', 'sans-serif'],
        ['sans-serif-italic', 'italic', 'sans-serif'],
        ['bold-sans-serif-italic', 'bold-italic', 'sans-serif'],
        ['monospace', 'normal']
    ];

    /*
     *  The default font parameters for the font
     */
    public static defaultParams: FontParameters = {
        x_height:         .442,
        quad:             1,
        num1:             .676,
        num2:             .394,
        num3:             .444,
        denom1:           .686,
        denom2:           .345,
        sup1:             .413,
        sup2:             .363,
        sup3:             .289,
        sub1:             .15,
        sub2:             .247,
        sup_drop:         .386,
        sub_drop:         .05,
        delim1:          2.39,
        delim2:          1.0,
        axis_height:      .25,
        rule_thickness:   .06,
        big_op_spacing1:  .111,
        big_op_spacing2:  .167,
        big_op_spacing3:  .2,
        big_op_spacing4:  .45, // .6,  // better spacing for under arrows and braces
        big_op_spacing5:  .1,

        surd_height:      .075,

        scriptspace:         .05,
        nulldelimiterspace:  .12,
        delimiterfactor:     901,
        delimitershortfall:   .3,

        min_rule_thickness:  1.25     // in pixels
    };

    /*
     * The default delimiter and character data
     */
    protected static defaultDelimiters: DelimiterMap = {};
    protected static defaultChars: CharMapMap = {};

    /*
     * The default variants for the fixed size stretchy delimiters
     */
    protected static defaultSizeVariants: string[] = [];

    /*
     * The actual variant, delimiter, and size information for this font
     */
    protected variant: VariantMap = {};
    protected delimiters: DelimiterMap = {};
    protected sizeVariants: string[];

    /*
     * The actual font parameters for this font
     */
    public params: FontParameters;

    /*
     * Copies the data from the defaults to the instance
     *
     * @constructor
     */
    constructor() {
        let CLASS = (this.constructor as typeof FontData);
        this.params = {...CLASS.defaultParams};
        this.sizeVariants = CLASS.defaultSizeVariants.slice(0);
        this.createVariants(CLASS.defaultVariants);
        this.defineDelimiters(CLASS.defaultDelimiters);
        for (const name of Object.keys(CLASS.defaultChars)) {
            this.defineChars(name, CLASS.defaultChars[name]);
        }
    }

    /*
     * Creates the data structure for a variant (an object with prototype chain
     *   that includes a copy of the linked variant, and then the inherited variant chain.
     *   The linked copy is updated automatically when the link variant is modified.
     *   (The idea is to be able to have something like bold-italic inherit from both
     *   bold and intalic by having the prototype chain include a copy of bold plus
     *   the full italic chain.  So if something is not defined explicitly in bold-italic,
     *   it defaults first to a bold version, than an italic version, then the normal
     *   version, which is in the italic prototype chain.)
     *
     * @param{string} name     The new variant to create
     * @param{string} inherit  The variant to use if a character is not in this one
     * @param{string} link     A variant to search before the inherit one (but only
     *                           its top-level object).
     */
    public createVariant(name: string, inherit: string = null, link: string = null) {
        let variant = {
            linked: [] as CharMap[],
            chars: (inherit ? Object.create(this.variant[inherit].chars) : {}) as CharMap
        };
        if (link && this.variant[link]) {
            Object.assign(variant.chars, this.variant[link].chars);
            this.variant[link].linked.push(variant.chars);
            variant.chars = Object.create(variant.chars);
        }
        this.variant[name] = variant;
    }

    /*
     * Create a collection of variants
     *
     * @param{string[][]} variants  Array of [name, inherit?, link?] values for
     *                              the variants to define
     */
    public createVariants(variants: string[][]) {
        for (const variant of variants) {
            this.createVariant(variant[0], variant[1], variant[2]);
        }
    }

    /*
     * Defines new character data in a given variant
     *
     * @param{string} name    The variant for these characters
     * @param{CharMap} chars  The characters to define
     */
    public defineChars(name: string, chars: CharMap) {
        let variant = this.variant[name];
        Object.assign(variant.chars, chars);
        for (const link of variant.linked) {
            Object.assign(link, chars);
        }
    }

    /*
     * Defines strety delimiters
     *
     * @param{DelimiterMap} delims  The delimiters to define
     */
    public defineDelimiters(delims: DelimiterMap) {
        Object.assign(this.delimiters, delims);
    }

    /*
     * @param{number} n  The delimiter character number whose data is desired
     * @return{DelimiterData}  The data for that delimiter (or undefined)
     */
    public getDelimiter(n: number) {
        return this.delimiters[n];
    }

    /*
     * @param{number} n  The delimiter character number whose variant is needed
     * @param{number} i  The index in the size array of the size whose variant is needed
     * @return{string}   The variant of the i-th size for delimiter n
     */
    public getSizeVariant(n: number, i: number) {
        if (this.delimiters[n].variants) {
            i = this.delimiters[n].variants[i];
        }
        return this.sizeVariants[i];
    }

    /*
     * @param{string} name  The variant whose character data is being querried
     * @param{number} n     The unicode number for the character to be found
     * @return{CharData}    The data for the given character (or undefined)
     */
    public getChar(name: string, n: number) {
        return this.variant[name].chars[n];
    }

    /*
     * @param{string} name   The name of the variant whose data is to be obtained
     * @return{VariantData}  The data for the requested variant (or undefined)
     */
    public getVariant(name: string) {
        return this.variant[name];
    }

}

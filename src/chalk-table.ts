/*
MIT License

Copyright (c) 2019 Packem

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


This code is currently not available as typescript package in npm,
so we took over the code here and hacked in into typescript using 'any' where needed
*/

import chalk from 'chalk'
import stripAnsi from 'strip-ansi'

export function chalkTable(options: any, data: any) {
    const pad = (text: any, length: any) => {
        if (typeof text === "undefined") {
            text = "";
        }

        return (
            "" +
            text +
            new Array(Math.max(length - stripAnsi("" + text).length + 1, 0)).join(" ")
        );
    };

    if (typeof options === "object" && Array.isArray(options)) {
        const tmp = data;
        data = options;
        options = tmp;
    }

    if (!options) {
        options = {};
    }

    if (!options.intersectionCharacter) {
        options.intersectionCharacter = "+";
    }

    let columns: any;
    if (options.columns) {
        columns = options.columns;
    } else {
        columns = [];
        data.forEach((e: any) =>
            Object.keys(e)
                .filter(k => {
                    return columns.indexOf(k) === -1;
                })
                .forEach(k => {
                    columns.push(k);
                })
        );
    }

    columns = columns.map((e: any) => {
        if (typeof e === "string") {
            e = {
                name: e,
                field: e
            };
        }

        e.name = chalk.bold(e.name);
        e.width = stripAnsi(e.name).length;

        return e;
    });

    data.forEach((e: any) =>
        columns.forEach((column: any) => {
            if (typeof e[column.field] === "undefined") {
                return;
            }

            column.width = Math.max(
                column.width,
                ("" + stripAnsi(e[column.field])).length
            );
        })
    );

    let output = [];

    const separator = [""]
        .concat(columns.map((e: any) => new Array(e.width + 1).join("-")))
        .concat([""])
        .join("-" + options.intersectionCharacter + "-");

    output.push(separator);
    if (!options.noHeader) {
        output.push(
            [""]
                .concat(columns.map((e: any) => pad(e.name, e.width)))
                .concat([""])
                .join(" | ")
        );
        output.push(separator);
    }
    data.forEach((row: any) => {
        output.push(
            [""]
                .concat(columns.map((column: any) => pad(row[column.field], column.width)))
                .concat([""])
                .join(" | ")
        );
    });
    output.push(separator);

    const leftPad = " ".repeat(options.leftPad) || "";

    return (
        leftPad +
        output.map(e => e.replace(/^[ -]/, "").replace(/[ -]$/, "")).join("\n" + leftPad)
    );
};
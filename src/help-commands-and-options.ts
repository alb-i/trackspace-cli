/**
 * This module contains verbose descriptions of options and commands,
 * along with default settings.
 */
import { configHelp, defaultConfigPath, defaultConfig } from './config.js'

import shellEscape from 'shell-escape'

let shortHands: any | undefined = defaultConfig.shorthands

export function setShorthands(shs: any) {
    shortHands = shs
}

export function setUserShorthands(shs: any) {
    shortHands = { ...shortHands, ...shs }
}

/**
 * COMMAND LINE OPTIONS
 */

export const optionDefinitions = [
    { name: 'verbose', alias: 'v', type: Boolean, defaultValue: false, description: 'Enables verbose output.' },
    { name: 'command', alias: 'C', type: String, multiple: true, defaultOption: true, description: 'A (single) command sequence to run.' },
    {
        name: 'config', alias: 'c', type: String, defaultValue: defaultConfigPath, typeLabel: '{underline file}',
        description: `Use the given configuration file instead of the standard configuration file at ${defaultConfigPath}`
    },
    { name: 'saveConfig', alias: '!', type: Boolean, defaultValue: false, description: 'Enables to save the configuration to the config-file path after running.' },
    { name: 'login', type: Boolean, defaultValue: false, description: 'Run the login process before doing any work.' },
    { name: 'rmCookies', alias: 'r', type: Boolean, defaultValue: false, description: 'Removes the cookie file after doing the work.' },

    { name: 'process', alias: 'p', type: String, defaultValue: 'show', typeLabel: '{underline cmd}', description: 'A post search command that is run on the results of the search query. See section `Processing Options`.' },
    { name: 'skip', alias: 's', type: Number, multiple: true, typeLabel: '{underline k}', description: 'Skips the first {underline k} entries in the output table, if {underline k} >= 0; otherwise skips to the last -{underline k} entries in the output table. Multiple limits may be given and are taken in order of the processing steps, so you might need to use --command afterwards.', defaultValue: 0 },
    { name: 'limit', alias: 'L', type: Number, multiple: true, typeLabel: '{underline n}', description: 'Only returns the first {underline n} entries in the output table if {underline n} >= 0, does not limit the output if {underline n} < 0.  Multiple limits may be given and are taken in order of the processing steps, so you might need to use --command afterwards.', defaultValue: -1 },

    { name: 'ordered', type: Boolean, description: 'Forces ordered output on. (Default is off for JSON output, on for print output)' },
    { name: 'unordered', type: Boolean, description: 'Forces ordered output off. (Default is off for JSON output, on for print output)' },
    { name: 'long', alias: 'l', type: Boolean, defaultValue: false, description: 'Enables a longer print output.' },
    { name: 'shorten', alias: 'S', type: Number, defaultValue: 7, description: 'Sets the maximum lines length that any content is shortened to when output is not longer.' },
    { name: 'json', alias: 'j', type: Boolean, defaultValue: false, description: 'Writes the output as JSON to stdout.' },
    { name: 'file', alias: 'f', type: Boolean, defaultValue: false, description: 'If set, then the arguments to the form interactions are considered to be a list of JSON files.' },
    { name: 'defaults', typeLabel: '{underline path}', alias: 'd', type: String, description: 'Uses the JSON form dictionary found at {underline path} as the default value template for form submission.' }
]

/**
 * TOP LEVEL COMMANDS
 */


const commandHelp = [
    {
        name: '{bold show}',
        summary: 'Run the browse-API for the given list of trackspace keys (`ABC-123`, etc.) and displays a short overview.'
    },
    {
        name: '{bold search}',
        summary: 'Run a search for issues for a given list of JQL search queries. Either returns the obtained data or does whatever the --process option tells it to.'
    },
    {
        name: '{bold browse}',
        summary: 'Run the browse-API for the given list of trackspace keys (`ABC-123`, etc.)'
    },
    {
        name: '{bold comments}',
        summary: 'Obtain all comments for the given list of trackspace keys (`ABC-123`, etc.)'
    },
    {
        name: '{bold add} {underline kind} {italic [...]}',
        summary: 'Adds a piece of information of the given {underline kind} to an issue. See below for more information.'
    },
    {
        name: '{bold form} {underline kind}',
        summary: 'Obtain the JSON describing the form of the given {underline kind}. See below for information on the supported forms.'
    },
    {
        name: '{bold submit} {underline kind}',
        summary: 'Submits a form of the given {underline kind} to the trackspace API. If the --file option is set, then every other argument is considered to be a JSON file path with the corresponding data of the created item. Otherwise, each parameter should follow the form {bold {underline key}={underline value}}, where {underline key} is a top-level form input name and {underline value} is the corresponding value to be transmitted to the API. See below for information on the supported forms.'
    },
    {
        name: '{bold do} {underline action} {italic [options...]} {italic keys...}',
        summary: 'Performs an {underline action} on the given list of trackspacke keys (`ABC-123`). See below for a list of supported actions.'
    },
    {
        name: '{bold id}',
        summary: 'Use the browse-API to convert the given list of trackspace keys (`ABC-123`, etc.) to issue IDs.'
    },
    {
        name: '{bold summary}',
        summary: 'Obtain the issue summary for the given list of issue ids, or keys.'
    },
    {
        name: '{bold watch}',
        summary: 'Start watching the issues from the given list of issue ids, or keys.'
    },
    {
        name: '{bold unwatch}',
        summary: 'Stop watching the issues from the given list of issue ids, or keys.'
    },


]

const doHelp = [
    {
        name: '{bold list} {italic keys...}',
        summary: 'Returns a list of possible actions that are available for the given {italic keys}.'
    }
]

const addHelp = [
    {
        name: '{bold comment} {underline key} {italic body...}',
        summary: 'Adds a comment to the issue with the give {underline key} (`ABC-123`, etc.). The contents of the comment are composed from the remaining arguments.'
    }
]


const formHelp = [

    {
        name: '{bold create-issue}',
        summary: 'Form for creating a new issue.'
    },
    {
        name: '{bold done} {underline key}',
        summary: 'Form used to put an issue with the given {underline key} (`ABC-123`, etc.) to done. This allows for different resolution states, and comments.'
    }
]

/**
 * SEARCH RESULT PIPEABLE COMMANDS
 */

const processHelp = [
    {
        name: '{bold browse}',
        summary: 'Runs the browse-API on each of the returned search queries.'
    },
    {
        name: '{bold comments}',
        summary: 'Obtains all the comments on each of the returned search queries.'
    },
    {
        name: '{bold print}',
        summary: 'Prints the search result plainly (in a table).'
    },
    {
        name: '{bold show}',
        summary: 'Shows a quick overview of each returned issue. (This is the default behavior of search.)'
    },
    {
        name: '{bold summary}',
        summary: 'Obtains the issue summary for each of the ids returned by the search queries. '
    },
    {
        name: '{bold watch}',
        summary: 'Start watching the issues returned by the search query.'
    },
    {
        name: '{bold unwatch}',
        summary: 'Stop watching the issues returned by the search query.'
    }
]

/**
 * HELP
 */



export function usageSections() {
    return [
        {
            header: 'TrackSpace Tool - CLI for trackspace',
            content: 'A hacked together CLI for trackspace, {italic expect everything to break at any time!}'
        },
        {
            header: 'Usage',
            content: '{bold tst} [Options] [-C] {underline command} [arg1] [arg2] [..] [argN]'
        },
        {
            header: 'Options',
            optionList: optionDefinitions
        },
        {
            header: 'Configuration File Keys',
            content: 'The configuration file consists of a JSON-dictionary where the following keys may be set:'
        },
        {
            content: configHelp
        },
        {
            header: 'Commands',
            content: commandHelp
        },
        {
            header: "Form/Submit Kinds",
            content: formHelp
        },
        {
            header: "Submit JSON Format",
            content: 'The keys in the submit JSON dictionary correspond to the field names obtained from the form JSON dictionary (jq `.name` for a list). The value of the key is the value submitted. The input JSON dictionary is merged into the default value dictionary for the corresponding form type. If a key is missing from the merged dictionary, then it is checked whether the item is required. If not, then no data for the item will be transmitted. Otherwise, the default value from the form JSON will be submitted.'
        },
        {
            header: "Add Kinds",
            content: addHelp
        },
        {
            header: "Do Actions",
            content: doHelp
        },
        {
            header: 'Search Result Processing Options',
            content: processHelp
        },
        {
            header: 'Short-Hands for Commands',
            content: 'The first command parameter may also be a shorthand that is expanded according to the following table.'
        }
        ,
        {

            content: [
                {
                    name: '{italic {underline shorthand}}',
                    summary: '{italic Expansion}'
                },
                ...Object.entries(shortHands).map((v, i, a) => {
                    let [name, what]: [string, any] = v

                    let aWhat: string[] = what

                    return {
                        name: `{bold {italic ${name}}}`,
                        summary: shellEscape(aWhat)
                    }
                })]
        },
    ]
}
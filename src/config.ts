/**
 * This module provides the configuration options and their defaults.
 */

import readlineSync from 'readline-sync'
import os from 'os'
import path from 'path'

import child_process from 'node:child_process'

export const dotPath = path.join(os.homedir(), '.trackspace')
export const defaultConfigPath = path.join(dotPath, 'config.json')
export const defaultLocalConfigPath = path.join(dotPath, 'config.2.json')
export const defaultCookiePath = path.join(dotPath, 'cookies.txt')

/**
 * used for typing the contents of the config.json file
 */
export interface TstConfig {
    // customizable settings
    username?: string
    storeCookies?: boolean
    loadCookies?: boolean
    cookiePath?: string
    askLogin?: boolean
    testCredentials?: boolean
    passwordCommandLine? : string
    otpCommandLine? : string

    // probably static settings
    endpoint?: string
    todoListField? : string

    // even more obscure settings
    loginPath?: string
    browsePath?: string
    pinPathEnd?: string

    //proxy URL
    setProxy?: string
    maxConcurrentRequests?: number

    consoleWidth?: number

    //configured short-hand commands
    shorthands?:any
    //configured short-hand commands, for user
    userShorthands?:any

    createIssueDefault?:any
    makeDoneDefault?:any

}

export const shortHands = {
    '@me': ['search','assignee = currentuser() AND resolution = Unresolved'],
    '@watch': ['search','watcher = currentuser() AND resolution = Unresolved'],
    '@me-full': ['search', 'assignee = currentuser()'],
    '@closed':   ['search','assignee = currentuser() AND resolution != Unresolved'],
    '@work': ['search','assignee = currentuser() AND resolution = Unresolved AND status != "To Do"'],
    '@now': ['search','assignee = currentuser() AND resolution = Unresolved AND status = "In Progress"'],
    'watching': ['search','watcher = currentuser()'],
    'watching-closed': ['search','watcher = currentuser() AND resolution != Unresolved'],
    'put':['do','put'],
    'create':['submit','create-issue'],
    'todo': ['do','put','to do'],
    'progress': ['do','put','in progress'],
    'hold': ['do','put','on hold'],
    'select': ['do','put','selected'],
    'done': ['submit','done'],
    '++': ['add','comment'],
    '+': ['add','checkitem']
}

/** 
 * used as default configuration values
 */

export const defaultConfig: TstConfig = {
    endpoint: 'https://trackspace.lhsystems.com',
    loginPath: '/login.jsp',
    pinPathEnd: 'pinvalidation',
    todoListField: 'customfield_24106',
    storeCookies: true,
    loadCookies: true,
    askLogin: true,
    cookiePath: defaultCookiePath,
    browsePath: '/browse/',
    testCredentials: true,
    consoleWidth: 65,
    maxConcurrentRequests: 40,
    shorthands: shortHands
}

function defaultFor(key: string): string {
    if (key in defaultConfig) {
        let k = key as (keyof typeof defaultConfig)
        let v: any = defaultConfig[k]
        return `(default: {underline ${v}} : {underline ${typeof v}})`
    }
    let type = 'string'
    // This would be the point where settings without a default value and a different type should set the type-variable accordingly

    if (key == 'createIssueDefault' || key == 'userShorthands')
        type = 'JSON dictionary'

    return `(default: {italic unset} : {italic ${type}})`
}

function execSync(commandline : string) : string {
    return child_process.execSync(commandline).toString()
}

/** settings help */

export const configHelp = [
    {
        name: 'username',
        summary: 'The username used to login to trackspace. If it is not set, then the name will be interactively queried whenever a login is required.'
    },
    {
        name: 'endpoint',
        summary: 'Set the trackspace base URL.'
    },
    {
        name: 'cookiePath',
        summary: 'Path where the cookies obtained through the login-process are stored to.'
    },
    {
        name: 'storeCookies',
        summary: 'If set, then the cookies obtained from a successful login attempt will be stored to the configured file.'
    },
    {
        name: 'loadCookies',
        summary: 'If set, then the cookie from the configured file are loaded before attempting any requests.'
    },
    {
        name: 'askLogin',
        summary: 'If set, then the user will be asked for login credentials whenever a redirection to the login (or PIN validation) page is detected.'
    },
    {
        name: 'passwordCommandLine',
        summary: 'If set, then this command is run and the standard output is used as password if there is a login prompt. You may wish to combine this with "pass".'
    },
    {
        name: 'otpCommandLine',
        summary: 'If set, then this command is run and the standard output is used as PIN entry for the second factor simulation. You may wish to combine this with "pass otp".'
    },
    {
        name: 'testCredentials',
        summary: 'If set, then a test whether the credentials work is done before starting with the actual commands. This has the benefit of only having to login once at the start if the current credentials are no longer valid, instead of multiple API requests triggering the login-process.'
    },
    {
        name: 'setProxy',
        summary: 'If set, then this is interpreted as proxy server URL through which all requests will go. May look like `http://localhost:3128`.'
    },
    {
        name: 'maxConcurrentRequests',
        summary: 'Sets the maximum number of concurrent requests against the trackspace API.'
    },
    {
        name: 'createIssueDefault',
        summary: 'A JSON dictionary with the default values used for submitting a create-issue-form.'
    },
    {
        name: 'userShorthands',
        summary: 'A JSON dictionary where each key corresponds to a user-defined short-hand, and each value is a list of strings defining what the short-hand should be replaced with. For example, it could be set to something like this {italic \\{"watching-recent": ["search","watcher = currentuser() AND createdDate >= startOfDay(-3d)"]\\}}, which would define the user short-hand {italic watching-recent} to be replaced by a search query.'
    }

].map((v, i, a) => {
    let newline = '\n'

    if (i == a.length - 1)
        newline = ''
    let s = { summary: `${v.summary}\n${defaultFor(v.name)}${newline}`,
            name: `{bold ${v.name}}` }

    return { ...v, ...s }
})
/**
 * these default values are written to the dotPath/config.json
 * (these will stick after the first run, until the config
 *  file is deleted.)
 */
export const initialConfig: TstConfig = {
    endpoint: defaultConfig.endpoint,
    askLogin: defaultConfig.askLogin,
    testCredentials: defaultConfig.testCredentials
}

/** queryConfig interface */

export interface QueryConfig {
    getUsername(config: TstConfig): string
    getPassword(config: TstConfig): string
    getPin(config: TstConfig): string

    effective(config: TstConfig): TstConfig
}

/**
 * this objects of this class are used to allow the user to enter missing information on the fly
 */
export class QueryConfigStdin implements QueryConfig {

    private defaults: TstConfig

    constructor(defaults?: TstConfig) {
        if (defaults !== undefined)
            this.defaults = defaults!
        else
            this.defaults = defaultConfig
    }

    getUsername(config: TstConfig): string {
        let cfg = { ...this.defaults, ...config }

        if (cfg.username === undefined) {
            config.username = readlineSync.question('Enter username: ')

            cfg = { ...this.defaults, ...config }
        }

        return cfg.username!
    }

    getPassword(config: TstConfig): string {
        let cfg = {...this.defaults, ...config}

        if (cfg.passwordCommandLine === undefined) {
            return readlineSync.question('Enter password: ', { hideEchoBack: true })
        } else {
            let result = execSync(cfg.passwordCommandLine)
            return result.replace(/(\r|\n)*$/,"")
        }
    }

    getPin(config: TstConfig): string {
        let cfg = {...this.defaults, ...config}

        if (cfg.otpCommandLine === undefined) {
            return readlineSync.question('Enter 2FA PIN: ')
        } else {
            let result = execSync(cfg.otpCommandLine)
            return result.replace(/(\r|\n)*$/,"")
        }
    }

    effective(config: TstConfig): TstConfig {
        return { ...this.defaults, ...config }
    }
}
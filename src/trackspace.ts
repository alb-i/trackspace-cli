/**
 * This module provides the wrapper around the trackspace API
 * 
 */
import { TstConfig, QueryConfig } from './config.js'

import { fetch, updateCookies } from './net.js'

import { URLSearchParams } from 'url'
import { RequestRedirect, RequestInit, RequestInfo, Response } from 'node-fetch'
import fs, { StatSyncFn } from 'fs'
import * as cheerio from 'cheerio'
import { getAttributeValue } from 'domutils'





function formEncode(payload: any) {
    let data = new URLSearchParams()

    for (const k in payload) {
        const v = payload[k]

        data.append(k, v)
    }

    return data
}



/**
 * Quick hack function to unescape the comments from the browse page...
 * 
 * @param l 
 * @returns 
 */
function unescapeStringLiteral(l: string) {
    return l.replaceAll('\\u003c', '<').replaceAll('\\u003e', '>').replaceAll('\\\\u00A0', '\u00A0').replaceAll('\\\\n', '\n').replaceAll('\\\\t', '\t').replaceAll('\\\'', '\'').replaceAll('\\\\/', '/').replaceAll('\\\\\\"', '"').replaceAll('\\\\', '\\')
}

/**
 * common interface for both synchronous and asynchronous API calls agaist trackspace
 */
export interface TrackSpaceAPICall {
    /** URL for the API call */
    url: string
    /** override options of the API call (SyncRequestInit or RequestInit) */
    options?: RequestInit
}

export interface TrackSpaceComment {
    id: string,
    html?: string,
    text: string
}

export interface TrackSpaceBrowse {
    /** the trackspace key for the object, usually looks like ABC-321 */
    'key': string,
    /** this is the issue ID of corresponding to the key, which is used in the backend-ish APIs */
    'id': string,
    'type': string,
    'priority': string,
    'affects': string,
    'fixes': string,
    'components': string,
    'labels': string,
    'status': string,
    'description': string,
    'summary': string,
    'resolution': string,
    'assignee': string,
    'reporter': string,
    'owner': string,
    'created': string,
    'updated': string,
    'resolved': string,
    'custom': Map<string, string>,
    'comments': TrackSpaceComment[]
}

export class LogonError extends Error {
    constructor(message: string) {
        super(`LogonError received for ${message}`)

        this.name = "LogonError"
    }
}




export class TrackSpaceAPI {
    private interactiveConfig: TstConfig
    private config: TstConfig
    private query: QueryConfig

    public cookieMap: Map<string, string> = new Map<string, string>()
    public cookies: string = ''

    public verbose: boolean = false /* it's okay to mess with the verbose settings from outside the object */

    constructor(config: TstConfig, query: QueryConfig, verbose?: boolean) {
        this.interactiveConfig = config
        this.query = query
        this.config = this.query.effective(config)
        if (verbose) this.verbose = true

        if (this.config.loadCookies) {
            this.readCookies()
        }
    }

    /**
     * Reads cookies from the configured file
     */
    readCookies() {
        try {
            let data: string = fs.readFileSync(this.config.cookiePath!, 'utf8')

            this.cookies = data
            this.cookieMap.clear()

            data.split("; ").forEach(
                (c, idx, a) => {
                    let k = c.split('=')[0].trim()
                    this.cookieMap.set(k, c)
                }
            )
        } catch (error) {
            if (this.verbose) console.log(`Error reading cookies: ${error}`)
        }
    }

    /**
     * Stores the current cookies to the configured file
     */
    storeCookies() {
        let path = this.config.cookiePath!

        if (this.verbose) console.log(`Saving cookies to ${path}`)

        fs.writeFileSync(path, this.cookies, 'utf8')
    }

    /**
 * Deletes the current cookies file from the configuration
 */
    rmCookies() {
        let path = this.config.cookiePath!

        if (this.verbose) console.log(`Deleting cookies from ${path}`)

        fs.rmSync(path)
    }


    /**
     * Tries to get the endpoint base URL synchronously. Always
     * 
     * @returns true, if the test succeeds.
     */
    async testCredentials() {

        try {
            await this.apiCall({
                url: `${this.config.endpoint}/`
            })
        }
        catch (error) {
            if (this.verbose) {
                console.log(`Credential test threw error: ${error}.`)
            }
            return false
        }


        return true
    }


    /**
     * Performs a logon to trackspace
     * 
     * @returns true, if login attempt succeeded, false otherwise.
     */
    async login() {

        console.log("Proceeding with login attempt.")

        // first, just get the login form and a session cookie

        let response = await fetch(`${this.config.endpoint}${this.config.loginPath}`,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                    'Origin': `${this.config.endpoint}`
                }
            })

        if (this.verbose) {
            console.log("Login Step 1")
            console.log(response)
            console.log(response.headers)
        }

        // get to the cookies

        let cookies = response.headers.get('set-cookie')

        let cookieMap = new Map<string, string>()



        if (cookies) {
            let updated = updateCookies(cookies, response.headers.raw()['set-cookie'])

            cookies = updated.cookies
            cookieMap = updated.cookieMap
        }

        cookieMap.set('cookieconsent_status', 'cookieconsent_status=dismiss')

        cookies = ''

        cookieMap.forEach((v, k, a) => {
            if (cookies != '') cookies = cookies + '; '
            cookies = cookies + v
        })

        // now, 'fill' the login form; use different library because the redirect is stealing our token

        let payload = {
            'os_username': this.query.getUsername(this.interactiveConfig),
            'os_password': this.query.getPassword(this.interactiveConfig),
            'os_destination': '',
            'user_role': '',
            'atl_token': '',
            'login': 'Log In'
        }

        let manual: RequestRedirect = "manual" // we need this guy to scan the cookies of the 302

        let options = {
            method: 'POST',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                'Origin': `${this.config.endpoint}`,
                'Referer': `${this.config.endpoint}${this.config.loginPath}`,
                'DNT': '1'
            },
            body: formEncode(payload),
            redirect: manual
        }

        response = await fetch(`${this.config.endpoint}${this.config.loginPath}`, options)

        cookies = response.headers.get('set-cookie')

        if (cookies) {
            let updated = updateCookies(cookies, response.headers.raw()['set-cookie'])

            cookies = updated.cookies
            cookieMap = updated.cookieMap
        }

        cookies = ''

        cookieMap.forEach((v, k, a) => {
            if (cookies != '') cookies = cookies + '; '
            cookies = cookies + v
        })

        this.cookieMap = cookieMap
        this.cookies = cookies

        if (this.verbose) {
            console.log("Login Step 2")
            console.log(response)
            console.log(response.headers)
        }

        // Check the header

        if (!response.headers.get('x-seraph-loginreason')?.endsWith("OK")) {
            console.log(`Authentication failed, code = ${response.headers.get('x-seraph-loginreason')}`)
            return false
        }

        // Test whether we need to do a second factor auth; in that case, we get another 302 on the root

        let options2 = {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                'Origin': `${this.config.endpoint}`,
                'Referer': `${this.config.endpoint}${this.config.loginPath}`,
                'DNT': '1'
            },
            redirect: manual
        }

        response = await fetch(`${this.config.endpoint}/`, options2)

        if (this.verbose) {
            console.log("Login Step 3")
            console.log(response)
            console.log(response.headers)
        }

        if (response.status == 302) {
            // need second factor, too. *pinvalidation*

            let url = response.headers.get('location')

            if (! url?.startsWith('https://')) {
                url = `${this.config.endpoint}${url}`
            }

            if (this.verbose) {
                console.log(`  .. received URL: ${url}`)
            }

            let payload2 = {
                '2fpin': this.query.getPin(this.interactiveConfig),
                'atl_token': '$atl_token',
                'twofalogin': 'pinlogin'
            }

            let options3 = {
                method: 'POST',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                    'Origin': `${this.config.endpoint}`,
                    'Referer': `${this.config.endpoint}${this.config.loginPath}`,
                    'DNT': '1'
                },
                body: formEncode(payload2),
                redirect: manual
            }

            response = await fetch(url, options3)

            
            cookies = response.headers.get('set-cookie')

            if (cookies) {
                let updated = updateCookies(cookies, response.headers.raw()['set-cookie'])

                cookies = updated.cookies
                cookieMap = updated.cookieMap
            }

            cookies = ''

            cookieMap.forEach((v, k, a) => {
                if (cookies != '') cookies = cookies + '; '
                cookies = cookies + v
            })

            this.cookieMap = cookieMap
            this.cookies = cookies

            

            if (this.verbose) {
                
                console.log("Login Step 4 (2FA)")
                console.log(response)
                console.log(response.headers)
                console.log(" ... redirect location: ", response.headers.get('location'))

                console.log("Cookie-Response: ", response.headers.raw()['set-cookie'])
                console.log("Cookies: ", cookies)
            }

            // validate the PIN

            options2 = {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                    'Origin': `${this.config.endpoint}`,
                    'Referer': `${this.config.endpoint}${this.config.loginPath}`,
                    'DNT': '1'
                },
                redirect: manual
            }

            response = await fetch(`${this.config.endpoint}/`, options2)

            if (this.verbose) {
                console.log("Login Step 5")
                console.log(response)
                console.log(response.headers)
            }

            if (response.status == 200) {
                if (this.config.storeCookies)
                    this.storeCookies()

                return true
            } else {
                console.log("2FA PIN validation failed.")

                if (this.verbose) {
                    console.log("Response URL: ", response.headers.get('location'))
                    console.log("Response Status: ",response.status)
                }

                if (this.config.storeCookies)
                this.storeCookies()
                return false
            }
        } else if (response.status == 200) {
            if (this.config.storeCookies)
                this.storeCookies()

            return true
        }

        return false

    }

    /**
     * Runs an asynchronous call against the trackspace API
     * 
     * @param params    API call parameters
     * @returns  a promise to a node-fetch Response
     */
    async apiCall(params: TrackSpaceAPICall): Promise<Response> {
        let manual: RequestRedirect = "manual"

        let defaultOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Cookie': this.cookies,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:103.0) Gecko/20100101 Firefox/103.0',
                'Origin': `${this.config.endpoint}`,
                'Referer': `${this.config.endpoint}${this.config.loginPath}`,
                'DNT': '1'
            },
            redirect: manual
        }

        let headersCombined = { ...defaultOptions.headers, ...params.options?.headers }

        let call: Promise<Response>

        if (params.options !== undefined) {
            if (this.verbose) {
                console.log("apiCall", params.url, { ...defaultOptions, ...params.options, ...{ headers: headersCombined } })
            }

            call = fetch(params.url, { ...defaultOptions, ...params.options, ...{ headers: headersCombined } })
        }
        else {
            if (this.verbose) {
                console.log("apiCall", params.url, defaultOptions)
            }

            call = fetch(params.url, defaultOptions)
        }

        let r = call.then(async (response) => {

            if (this.verbose) {
                console.log(" --> response ", response)
            }

            if (response.status == 302) {
                let url = response.headers.get('location')
                if ((url?.split('?')[0].endsWith(this.config.loginPath!)) ||
                    (url?.split('?')[0].endsWith(this.config.pinPathEnd!))) {
                    /* I'm convinced that we are not logged in correctly */
                    throw new LogonError(`${url} <-302- ${params.url}`)
                }

            }
            return response
        })

        return r
    }

    /**
     * Generates the API call to browse for a given ID
     * 
     * @param key   trackspace key (xxx-###) to the item that should be browsed
     *  
     * @returns API call parameters, to be used with .apiCall(..) or .apiCallSync(..)
     */
    browseCall(key: string): TrackSpaceAPICall {
        let url = `${this.config.endpoint}${this.config.browsePath}${key}`

        return { 'url': url }
    }


    /**
     * Parses the response of a browseCall api call
     * 
     * @param text    html body of the browse API response
     * @returns  filled TrackSpaceBrowse object
     */
    browseParse(text: string): TrackSpaceBrowse | undefined {
        let $ = cheerio.load(text)

        function getVal(id: string) {
            return $(`span[id="${id}"]`).text().trim()
        }


        function collectText(itemSelector: string) {
            let text = ''
            $(itemSelector).children().map((idx, elt) => {
                let t = $(elt).text().trim()

                if (t != '') {
                    if (text != '')
                        text += '\n'
                    text += t
                }
            }
            )
            if (text == '') {
                text = $(itemSelector).text().trim()
            }
            return text
        }

        function getLabels(id: string) {
            let plain = $(`span[id="${id}"]`).text().trim()
            if (plain == '') {
                return collectText(`ul[id="${id}"]`)
            }

            return plain
        }

        function customVal(title: string) {
            let custom_id = $(`*[title="${title}"]`).children('label').attr()?.for

            return collectText(`*[id="${custom_id}-val"]`)
        }

        let id = $(`input[name="id"]`).attr()?.value

        if (id === undefined)
            return undefined

        const customFields = ["Epic Link", "Teams",/*"Templates",*/"Sprint",
            "PercentDone",
            "Severity", "Interference Level", "Impact", "Scope", "Airlines",
            "Detected in",
            "Time in Open (hrs)", "Resolution time (hrs)", "Time until Closed after Resolved (hrs)",
            "Relevant for", "Requestor", "Department.", "Impacted area"]

        function mangle(t: string) {
            let x = t.toLowerCase().trim()
            if (x.endsWith(".")) return x.substring(0, x.length - 1)
            return x
        }

        let customValues = new Map<string, string>()

        customFields.map((t, i, a) => {
            let v = customVal(t)
            if (v) customValues.set(mangle(t), v)
        })

        let comments: TrackSpaceComment[] = this.commentsParse(text)



        let info: TrackSpaceBrowse = {
            'key': $('a[id="key-val"]').text().trim(),
            'id': id,
            'type': getVal('type-val'),
            'priority': getVal('priority-val'),
            'affects': getVal('versions-val'),
            'fixes': getVal('fixfor-val'),
            'components': getVal('components-val'),
            'labels': getLabels(`labels-${id}-value`), //why is there an id here? why?
            'status': $('span[id="status-val"]').children('span').text().trim(),
            'description': collectText('div[id="description-val"]'),
            'summary': $('h1[id="summary-val"]').text().trim(),
            'resolution': getVal('resolution-val'),
            'assignee': collectText('span[id="assignee-val"]'),
            'reporter': collectText('span[id="reporter-val"]'),
            'owner': customVal('Owner'),
            'created': getVal('created-val'),
            'updated': getVal('updated-val'),
            'resolved': getVal('resolutiondate-val'),
            'custom': customValues,
            'comments': comments
        }

        return info
    }


    commentsCall(key: string): TrackSpaceAPICall {
        return {
            url: `${this.config.endpoint}${this.config.browsePath}${key}?page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel&showAll=true`
        }
    }

    commentsParse(htmlBody: string): TrackSpaceComment[] {

        let comments: TrackSpaceComment[] = []

        function commentsParse0(htmlBody: string) {
            let $$ = cheerio.load(htmlBody)


            function collectCommentText(item: any) {
                let text = ''
                item.children().map((idx: any, elt: any) => {
                    let t = $$(elt).text().trim()

                    if (t != '') {
                        if (text != '')
                            text += '\n'
                        text += t
                    }
                }
                )
                if (text == '') {
                    text = item.text().trim()
                }
                return text
            }

            $$('div[id^="comment-"]').each((idx, elt) => {
                let commentDiv = $$(elt)

                let comment: TrackSpaceComment = {
                    'id': commentDiv.attr()['id'],
                    'html': commentDiv.html()!,
                    'text': collectCommentText(commentDiv.find('.concise'))
                }

                comments.push(comment)
            })

        }


        let $ = cheerio.load(htmlBody)

        const commentsStartMarker = 'WRM._unparsedData["activity-panel-pipe-id"]="\\"'

        $('script').each((idx, elt) => {
            let tag = $(elt)
            let txt = tag.text()

            txt.split("\n").forEach((v, i, a) => {
                if (v.startsWith(commentsStartMarker)) {

                    let stringLiteral = v.substring(commentsStartMarker.length, v.length - 4)

                    let data = unescapeStringLiteral(unescapeStringLiteral(stringLiteral))

                    commentsParse0(data)

                }
            })
        })


        return comments
    }


    /**
     * Get all comments
     * 
     * @param key  trackspace key (ABC-123)
     * @returns a list containing all comments for the item
     */
    async comments(key: string): Promise<TrackSpaceComment[]> {

        let r = await this.apiCall(this.commentsCall(key))

        return this.commentsParse(await r.text())
    }

    /**
     * Asynchronous API call to 'browse'
     * 
     * @param key     trackspace key
     * @returns  promise to TrackSpaceBrowse object corresponding to the key
     */

    async browse(key: string): Promise<TrackSpaceBrowse | undefined> {
        let response = this.apiCall(this.browseCall(key))

        return response.then((response) => response.text().then((body) => this.browseParse(body)))
    }

    /**
     * Asynchronous API call to 'browse' which only parses for the issue id
     *
     * @param key  trackspace key
     * @returns the issue id
     */
    async id(key: string): Promise<string | undefined> {
        let response = await this.apiCall(this.browseCall(key))

        let text = await response.text()

        let $ = cheerio.load(text)

        let id = $(`input[name="id"]`).attr()?.value

        return id
    }

    /**
     * Takes a string which may be an ID or a key, and converts it to an ID, if it is a key
     * 
     * @param idOrKey   id or key
     * @returns  corresponding id
     */
    async toId(idOrKey: string): Promise<string | undefined> {
        if (isNaN(Number(idOrKey))) {
            return this.id(idOrKey)
        } else return idOrKey
    }

    /**
     * Generate API call; takes care of the nasty stuff
     * 
     * @param path      path relative to endpoint, including leading '/'
     * @param options   options for synthesizing the call
     * @returns trackspace api call structure
     */
    api(path: string, options?: any): TrackSpaceAPICall {
        let requestOptions: any = {}

        if (options?.getJson) {
            requestOptions = { ...requestOptions, ...{ headers: { ...requestOptions.headers, ...{ 'Accept': 'application/json, text/javascript, */*; q=0.01' } } } }
        }

        if (options?.noXSRF) {
            requestOptions = { ...requestOptions, ...{ headers: { ...requestOptions.headers, ...{ 'X-Atlassian-Token': 'no-check' } } } }
        }


        if (options?.postFormData !== undefined) {
            requestOptions = {
                ...requestOptions, ...{
                    headers: { ...requestOptions.headers, ...{ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } },
                    method: 'POST',
                    body: formEncode(options.postFormData)
                }
            }
        }

        if (options?.postJsonData !== undefined) {
            requestOptions = {
                ...requestOptions, ...{
                    headers: { ...requestOptions.headers, ...{ 'Content-Type': 'application/json' } },
                    method: 'POST',
                    body: JSON.stringify(options.postJsonData)
                }
            }
        }

        if (options?.method) {
            requestOptions = { ...requestOptions, ...{ method: options.method } }
        }


        let appendUrl = ''

        if (options?.getParamData !== undefined) {
            appendUrl = `?${formEncode(options.postFormData)}`

        }

        if (options?.options) {
            requestOptions = { ...requestOptions, ...options.options }
        }


        return {
            url: `${this.config.endpoint}${path}${appendUrl}`,
            options: requestOptions
        }
    }


    /**
     * get the summary of an issue
     * 
     * @param issueId   id of the issue
     * @returns a summary of the issues state
     */
    async issueSummary(issueId: string): Promise<any> {

        let id = await this.toId(issueId)

        let c = this.api(`/rest/dev-status/1.0/issue/summary?issueId=${id}`)
        let r = await this.apiCall(c)

        return r.json()
    }

    /**
     * run a jql query to search for issues
     * 
     * @param jql        jql query
     * @returns json response, contains the keys and the ids of the found issues
     */
    async searchIssues(jql: string) {

        let c = this.api('/rest/issueNav/1/issueTable', {
            postFormData: {
                jql: jql,
                startIndex: "0",
                layoutKey: "list-view"
            },
            noXSRF: true
        })

        let r = await this.apiCall(c)

        return r.json()
    }

    /**
     * Unwatch an issue
     * 
     * @param issueId  issue id or key
     * @returns API result (contains a count of watchers left)
     */

    async unwatch(issueId: string): Promise<any> {
        let id = await this.toId(issueId)

        let c = this.api(`/rest/api/1.0/issues/${id}/watchers`, {
            method: 'DELETE'
        })


        let r = await this.apiCall(c)

        return r.json()
    }

    /**
    * Watch an issue
    * 
    * @param issueId  issue id or key
    * @returns API result (contains a count of watchers left)
    */

    async watch(issueId: string): Promise<any> {
        let id = await this.toId(issueId)

        let c = this.api(`/rest/api/1.0/issues/${id}/watchers`, {
            method: 'POST'
        })


        let r = await this.apiCall(c)

        return r.json()
    }

    parseForm(formDescription: any): any {
        let fields: any[] = formDescription.fields

        let required = new Map<string, any>()
        let optional = new Map<string, any>()

        fields.forEach((field, idx, a) => {

            let label = field.label

            let $ = cheerio.load(field.editHtml)

            let input = $(`*[id='${field.id}']`) // may be input, textarea, or other item
            let name = input.attr()?.name
            let value = input.attr()?.value

            let suggestor = $(`*[data-suggestions]`)

            let suggestions: any = undefined

            let attr: any = suggestor.attr()
            if (attr !== undefined) {
                let text = attr['data-suggestions']

                let s = JSON.parse(text)

                if (s !== undefined) {

                    suggestions = s
                }
            }

            let options = new Map<string, any>()

            $('option').each(
                (idx, elt) => {
                    let opt = $(elt)

                    let value0 = opt.attr()?.value
                    let what = opt.text()

                    if (opt.attr()?.selected) { // default option is selected
                        if (value === undefined) {
                            value = value0
                        }
                    }

                    if (what !== undefined) {
                        options.set(what.trim(), value0)
                    }

                }
            )

            let isrequired = field.required || (name == 'reporter') //reporter is wrongly reported as not required. But it is, indeed.

            let jfield: any = {
                'name': name,
                'value': value,
                'required': isrequired,
                'suggestions': suggestions
            }

            if (options.size > 0)
                jfield["options"] = Object.fromEntries(options)

            if (jfield.value === undefined)
                delete jfield['value']
            if (jfield.suggestions === undefined)
                delete jfield['suggestions']

            if (field.required) required.set(label, jfield)
            else optional.set(label, jfield)
        })

        return Object.fromEntries([...required, ...optional])
    }

    /**
     * Grabs the done/closure from trackspace and processes it 
     * to better useable json
     * 
     * @param key   trackspace key or id
     * @returns     issue form json
     */
    async doneForm(key: string) {

        let id = await this.toId(key)

        const what = 'done'

        let actions = (await this.scanActions(key)).put

        let actionId = actions[what].id

        let c = this.api(`/secure/CommentAssignIssue!default.jspa?decorator=none&id=${id}&action=${actionId}`)

        let r = await this.apiCall(c)
        let body = await r.text()

        let $ = cheerio.load(body)

        function getVal(id: string) {
            return $(`span[id="${id}"]`).text().trim()
        }


        function collectText(itemSelector:any) {
            let text = ''
            $(itemSelector).children().map((idx, elt) => {
                let t = $(elt).text().trim()

                if (t != '') {
                    if (text != '')
                        text += '\n'
                    text += t
                }
            }
            )
            if (text == '') {
                text = $(itemSelector).text().trim()
            }
            return text
        }

        function getLabels(id: string) {
            let plain = $(`span[id="${id}"]`).text().trim()
            if (plain == '') {
                return collectText(`ul[id="${id}"]`)
            }

            return plain
        }

        function customVal(title: string) {
            let custom_id = $(`*[title="${title}"]`).children('label').attr()?.for

            return collectText(`*[id="${custom_id}-val"]`)
        }

        let inputs: any = {}

        let processItem = (idx:number, elt:any) => {
            let e = $(elt)

            if (e.attr()['name'] !== undefined) {


             
                let options :any = {}

                let defaultOption : any = undefined

                e.find('option').each((idx, elt)=> {
                    let e0 = $(elt)
                    let label =collectText(elt).trim()

                    let thisOpt = Object.fromEntries([[label, 
                        e0.attr()['value']]])

                    if (e0.attr()['selected'] !== undefined) {
                        defaultOption = label
                    }

                    options = {...options,...thisOpt}

                })

                if (Object.keys(options).length < 1) options = undefined

                let thisInput = {
                    name: e.attr()['name'],
                    value: e.attr()['value'],
                    type: e.attr()['type'],
                    id: e.attr()['id'],
                    options:options,
                    defaultOption:defaultOption
                }


                let name = thisInput.name


                inputs = { ...inputs, ...Object.fromEntries([[name, thisInput]]) }
            }
        }

        $('input').each(processItem)

        $('select').each(processItem)
        $('textarea').each(processItem)

        let labels :any = {}

        $('*[for]').each((idx,elt)=>{
            let e = $(elt)

            let label = collectText(elt)
            let for_ = e.attr()['for']

            labels = {...labels, ...Object.fromEntries([[for_, label]])}
        })


        return {
            'dialog-title': collectText('h2[class="dialog-title"]').trim(),
            key: key,
            id: id,
            fields: inputs,
            labels: labels
        }

    }

    /**
     * Tries to put an issue to done (-> resolving it).
     * 
     * @param key          trackspace key or id
     * @param json         json representing the form data
     * @param defaultVal   default value overrides
     * 
     * @returns   result
     */
    async makeDone(key:string, json: any, defaultVal?: any | undefined) {

        // get the form for default values etc.
        let form = await this.doneForm(key)


        let defValues: any = {}

        if (defaultVal !== undefined) {
            defValues = defaultVal
        } else {
            defValues = this.config.makeDoneDefault
        }


        let formValues = new Map<string, any>()


        Object.keys(form.fields).forEach((k,i,a)=> {
            let f = form.fields[k]

            if (f.value !== undefined) {
                formValues.set(f.name, f.value)
            } else {
                if (f.defaultOption !== undefined) {
                    formValues.set(f.name, f.options[f.defaultOption])
                }
            }
        })


        let userFormData = { ...Object.fromEntries(formValues), ...defValues, ...json }

        let c = this.api('/secure/CommentAssignIssue.jspa', {
            postFormData: userFormData,
            noXSRF: true
        })

        let r = await this.apiCall(c)


        return {'body': await r.text(), 'response':r}

    }
    /**
     * Grabs the create-issue form from trackspace and processes it 
     * to better useable json
     * 
     * @returns  issue form json
     */
    async createIssueForm(): Promise<any> {
        let c = this.api('/secure/QuickCreateIssue!default.jspa?decorator=none')

        let r = await this.apiCall(c)

        let formData: any = await r.json()
        return this.parseForm(formData)

    }

    async createIssue(json: any, defaultVal?: any | undefined) {


        let defValues: any = {}

        if (defaultVal !== undefined) {
            defValues = defaultVal
        } else {
            defValues = this.config.createIssueDefault
        }

        let defaultOrJson = { ...defValues, ...json }

        // POST https://trackspace.lhsystems.com/secure/QuickCreateIssue.jspa?decorator=none
        // has atl_token and formToken from the createIssueForm API code

        let c = this.api('/secure/QuickCreateIssue!default.jspa?decorator=none')

        if (defaultOrJson.pid !== undefined) {

            /* this will yield the default values for the project we are trying to create an issue for */

            c = this.api(`/secure/QuickCreateIssue!default.jspa?decorator=none`, {
                postFormData: {
                    ...{
                        'pid': defaultOrJson.pid
                    }
                },
                noXSRF: true
            })
        }


        let r = await this.apiCall(c)

        let formData: any = await r.json()

        let template = this.parseForm(formData)

        let atl_token = formData.atl_token
        let formToken = formData.formToken

        // This doesn't work, we need to figure out how to fix the project id from the other data to get the correct defaults

        let formValues = new Map<string, any>()

        // Set default values for required items

        for (const p in template) {
            const field: any = template[p]

            if (field.required) {
                let name = field.name
                let value = field.value
                if (value === undefined) {
                    value = ''
                    if (field.options !== undefined) {
                        let optName = Object.entries(field.options)[0][0]
                        value = `${field.options[optName]}`
                    }
                }

                formValues.set(name, value)
            }
        }




        let userFormData = { ...Object.fromEntries(formValues), ...defValues, ...json }

        if (!userFormData.description) // this is common practice 
            userFormData.description = userFormData.summary

        if (this.verbose) {
            console.log("userFormData = ", userFormData)
        }

        c = this.api(`/secure/QuickCreateIssue.jspa?decorator=none`, {
            postFormData: {
                ...{
                    'atl_token': atl_token,
                    'formToken': formToken,
                    'isCreateIssue': true
                }, ...userFormData
            },
            noXSRF: true
        })


        r = await this.apiCall(c)

        return await r.json()

    }

    // API ToDos

    /*
    Set description

    POST
    https://trackspace.lhsystems.com/secure/AjaxIssueAction.jspa?decorator=none

    formData:

    description <- new description text
    issueId <- id of the issue
    singleFieldEdit <- "true"
    fieldsToForcePresent <- "description"

    (atl_token field, but probably not used)

    set noXSRF
    

    */

    /**
     * Post a comment to an issue
     * 
     * @param key  trackspace issue key
     * @param body     comment body
     */
    async addComment(key: string, body: string) {

        let c = this.api(`/rest/api/2/issue/${key}/comment`, {
            postJsonData: { body: body },
            noXSRF: true
        })

        let r = await this.apiCall(c)

        return await r.json()

    }

    /** put something into TODO goes through a link:
     * 
     * /secure/WorkflowUIDispatcher.jspa?id=3649480&action=11&atl_token=B1CJ-HPIR-HN4W-VAJE_468513616c99414724bde14c06c2bb0d0b44c41d_lin
     * 
     * GET /secure/WorkflowUIDispatcher.jspa
     * 
     * URL-Params:
     * id <- issue ID
     * action <- 11 'TO DO'
     * atl_token <- (test whether this can be omitted, we have a cookie)
     * 
     */

    /**
     * Uses the browse-API to obtain a list of possible actions
     * 
     * @param key  trackspace key
     * @returns a json describing the available actions
     */
    async scanActions(key: string) {
        let response = this.apiCall(this.browseCall(key))

        let text = await (await response).text()

        let $ = cheerio.load(text)

        function collectText(item: any) {
            let text = ''
            item.children().map((idx: any, elt: any) => {
                let t = $(elt).text().trim()

                if (t != '') {
                    if (text != '')
                        text += '\n'
                    text += t
                }
            }
            )
            if (text == '') {
                text = item.text().trim()
            }
            return text
        }

        let actions: any = {}

        $('*[id^="action_id_"]').each((i, e) => {
            let elt = $(e)
            let label = collectText(elt).trim().toLowerCase()

            actions = {
                ...actions, ...Object.fromEntries([[label, {
                    id: elt.attr('id')!.substring('action_id_'.length),
                    href: elt.attr('href')
                }]])
            }

        })

        return { key: key, put: actions }
    }

    async putAction(what: string, key: string) {
        if (isNaN(Number(what))) {
            let actions = (await this.scanActions(key)).put

            what = what.trim().toLocaleLowerCase()

            if (actions[what]) {
                let url: string = actions[what].href


                let c = this.api(url, { noXSRF: true })

                let r = await this.apiCall(c)
                let body = await r.text()

                return { key: key, what: what, response: r, body: body }
            } else {
                return { key: key, what: what, response: { status: -999, statusText: `Action ${what} is undefined!` }, body: '' }
            }

        } else {
            let id = await this.toId(key)

            let url = `/secure/WorkflowUIDispatcher.jspa?id=${id}&action=${what}`

            let c = this.api(url, { noXSRF: true })

            let r = await this.apiCall(c)
            let body = await r.text()

            return { key: key, what: what, response: r, body: body }

        }
    }

}
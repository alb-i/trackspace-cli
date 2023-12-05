/**
 * This module provides the network interactions
 */

import { RequestRedirect, RequestInit, RequestInfo, Response } from 'node-fetch'

const fetch0 = (url: RequestInfo, init?: RequestInit) => import("node-fetch").then(({ default: fetch }) => fetch(url, init));

import httpsProxyAgent from 'https-proxy-agent'
const {HttpsProxyAgent} = httpsProxyAgent


let proxyAgent : any

let verbose = false

export function setVerbose(enabled:boolean) {
    verbose = enabled
}

/**
 * Sets the proxy URL
 * 
 * @param proxyUrl    URL of the proxy, for instance, 'http://localhost:3128'
 *                    an empty string will disable the proxy
 */
export function setProxy(proxyUrl:string) {
    if (proxyUrl !== "")
        proxyAgent = new HttpsProxyAgent(proxyUrl)
}

let requestsReceived : number = 0
let requestsDone : number = 0

let maxConcurrentCount : number = 40

export function setConcurrency(maxConcurrency:number) {
    maxConcurrentCount = maxConcurrency
}

const waitAmount = 25
const waitAmountFactor = 5

export async function fetch(url:RequestInfo, init?:RequestInit) : Promise<Response> {

    let init0 = {}


    // This is our position in the queue
    let thisRequest = requestsReceived
    requestsReceived += 1

    if (proxyAgent !== undefined) {
        init0 = {
            agent: proxyAgent
        }
    }

    // everyone lines up in the queue and waits for their turn
    while (thisRequest-requestsDone >= maxConcurrentCount) {
        // try not to trample the front of the queue
        await new Promise(resolve => setTimeout(resolve, (thisRequest-requestsDone)*waitAmountFactor + waitAmount))
    }

    let r : Response

    let retryCount = 0
    let doRetry = true

    while (doRetry && retryCount < 4) {
        doRetry = false
        retryCount += 1
        try {
            r = await fetch0(url,{...init0,...init})
        }
        catch (error:any) {

            if (verbose) {
                console.log("Received error upon fetch: ",error)
                console.log("  ... for url",url)
            }

            if (error.message.code === 'ETIMEDOUT') {
                if (verbose)
                    console.log("Attempting rety.")
                doRetry = true

                await new Promise(resolve => setTimeout(resolve, 3000))
            } else {
                throw(error)
            }
        }
    }

    // let the next request in
    requestsDone += 1

    return r!
}


 /**
* Update the current cookies according to a response   
* 
* @param cookies          previous cookies, as txt
* @param setCookies       set cookies response array
* @returns object with cookies and setCookies property, that have been updated
*/
export function updateCookies(cookies: string, setCookies: string[]) {
   let cookieMap = new Map<string, string>()

   cookies.split("; ").forEach(
       (c, idx, a) => {
           let k = c.split('=')[0].trim()
           cookieMap.set(k, c)
       }
   )

   setCookies.forEach(
       (cookie, idx, a) => {
           let c = cookie.split(';')[0].trim()
           let k = c.split('=')[0].trim()

           cookieMap.set(k, c)
       }
   )

   {
       let cookies = ''

       cookieMap.forEach((v, k, a) => {
           if (cookies != '') cookies = cookies + '; '
           cookies = cookies + v
       })

       return {cookies: cookies, cookieMap: cookieMap}
   }
}
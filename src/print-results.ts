/**
 * This module handles printing the output
 */

import chalk from 'chalk'

import { chalkTable } from './chalk-table.js'

import { limitArray } from './limit-output.js'

import stripAnsi from 'strip-ansi'
import { write } from 'fs'

let options: any = {}
let config : any = {}

export function setPrintOptions(opts: any, cfg:any) {
    options = opts
    config = cfg
}



// Helper that turns Maps into JSON dictionaries
function replacer(key: any, value: any) {
    if (value instanceof Map) {
        return Object.fromEntries(value.entries())
    } else {
        return value
    }
}

function pad(s: string, padLength: number) {
    while (stripAnsi(s).length < padLength) {
        s = s + ' '
    }
    return s
}

function writeRow(name: string, content: string, decorator: (x: string) => string, onlyFirstLines?: number) {
    const lineSize = options.consoleWidth

    let lines = content.split('\n')
    let spaces = pad('', stripAnsi(name).length - 2) + chalk.dim(chalk.gray('| '))
    let col1 = name
    let linecount = 0
    let limit = 1000
    if (onlyFirstLines)
        limit = onlyFirstLines
    lines.forEach((line, idx, a) => {

        let parts = line.split(' ')
        let run = ''
        parts.forEach((pt, i, a) => {

            if (stripAnsi(run).length + stripAnsi(pt).length - spaces.length + 1 < lineSize) {
                if (i == 0)
                    run = pt
                else
                    run = run + ' ' + pt
            } else {
                linecount += 1
                if (linecount <= limit)
                    console.log(`${col1}${decorator(run)}`)

                col1 = spaces
                run = pt

            }
        })
        linecount += 1
        if (linecount <= limit)
            console.log(`${col1}${decorator(run)}`)
        col1 = spaces
    })

    if (linecount > limit)
        console.log(`${col1}${decorator(chalk.dim('[...]'))}`)

}

let needToSeparate = false

let showLastQuery : string = ''

/**
 * Common routine that handles printing of elements
 * 
 * @param command    last command in the chain
 * @param result   result object
 */
export function printResults(command: string, result: any) {
    let space = 0 ? options.json : 3

    if (options.json) {
        console.log(JSON.stringify(result, replacer, space))
    } else {

        if (needToSeparate && command != 'show') {
            console.log('')
            console.log(chalk.gray('--8<----->8--'))
            console.log('')
        }

        needToSeparate = true

        if (command != 'show') {
            if (result['tst-search-query'] != undefined) {
                console.log(`${chalk.white('Search Query')}: ${chalk.bold(chalk.red(result['tst-search-query']))}`)
            }
            if (result['tst-search-result-index'] != undefined) {
                let idorkey = ''
                if (result['tst-search-result-id'] != undefined) {
                    idorkey += ` id=${chalk.yellowBright(result['tst-search-result-id'])}`
                }
                if (result['tst-search-result-key'] != undefined) {
                    idorkey += ` key=${chalk.yellowBright(result['tst-search-result-key'])}`
                }
                console.log(`${chalk.white('Search Result')}: ${chalk.green(result['tst-search-result-index'] + 1)}/${result['tst-search-result-total']}${idorkey}`)
            }
        } else {
            if (result['tst-search-query'] != undefined) {
                if (showLastQuery != result['tst-search-query']) {
                    showLastQuery = result['tst-search-query']
                    console.log(`${chalk.white('Search Query')}: ${chalk.bold(chalk.red(result['tst-search-query']))} (${result['tst-search-result-total']})`)
                }
            }

        }

        function printComments(comments: any, test: (idx: number) => boolean,showNumber?:boolean,alwaysShorten?:boolean,leftpadName?:string) {
            let cs: any[] = comments
            let names: string[] = []
            const colorList = [chalk.blue, chalk.red, chalk.green, chalk.yellow, chalk.magenta, chalk.cyan]

            let leftpadName0 = ''
            if (leftpadName!== undefined)
                leftpadName0=leftpadName

            cs.forEach((c, i, a) => {

                if (test(i) == false)
                    return

                let text: string = c.text
                let byLine = text.trim().split('\n')
                let name = byLine[0].trim()
                if (names.indexOf(name) < 0)
                    names.push(name)
                let nameIdx = names.indexOf(name)
                let color = colorList[nameIdx % colorList.length]
                let intro = byLine[1].substring(0, 56).trim()

                byLine[1] = byLine[1].substring(56).trim()
                byLine.shift()

                let message = byLine.join('\n')

                writeRow(leftpadName0+chalk.italic(chalk.bold(color(name))) + ' ', intro, chalk.gray)

                let leftpad = chalk.dim(pad(`(${i + 1})`, 6)) + chalk.dim(chalk.gray('| '))
                if (showNumber !== undefined) {
                    if (!showNumber) 
                        leftpad = chalk.dim(pad('', 6)) + chalk.dim(chalk.gray('| '))
                }


                if (options.long && (!alwaysShorten))
                    writeRow(leftpad, message, (x) => chalk.italic(color(x)))
                else
                    writeRow(leftpad, message, (x) => chalk.italic(color(x)), options.shorten)



            })
        }

        function niceStatus(result:any) {
            let status = result.status

            switch (status) {
                case 'In Progress':
                case 'Analysis':
                case 'Implementation':
                case 'Acceptance':
                    {
                        status = chalk.bold(chalk.cyan(status))
                        break;
                    }
                case 'Closed':
                case 'Resolved':
                case 'Done':
                    {
                        status = chalk.dim(chalk.green(status))
                        break;
                    }

                default: {
                    status = chalk.bold(chalk.red(status))
                    break;
                }
            }

            if (result.resolution == 'Unresolved') status += ' - ' + chalk.bgMagenta(chalk.whiteBright(result.resolution))
            else status += ' - ' + chalk.gray(result.resolution)

            return status
        }

        function chopDate(s:any) {
            let x = `${s}`.trim()+' '
            return x.split(' ')[0]
        }

        function lastCommentDate(result:any) {
            let comments = result.comments

            if ((comments === undefined)||(comments.length == 0)) {
                return chalk.dim(chalk.grey('(uncommented)'))
            }
            let c = comments[comments.length -1]

            let text: string = c.text
            let byLine = text.trim().split('\n')
            let name = byLine[0].trim()
            let intro = byLine[1].substring(0, 56).split(' - ')
            let date = intro[1].substring(0,17).trim()

            return chalk.italic(chalk.yellow(chopDate(date))) + ' by ' + chalk.italic(name.substring(0,30))
        }


        let errors = result.errorMessages
        if (errors !== undefined) {
            console.log()
            console.log(`${chalk.red(errors.join('\n'))}`)
        }

        switch (command) {
            case 'search': {


                let data = result.issueTable

                if (data === undefined)
                    return

                console.log(`${chalk.white('Search Results')}: ${chalk.green(data.total)}`)
                const options = {
                    skinny: true,
                    intersectionCharacter: 'x',
                    columns: [
                        { field: "index", name: chalk.bold(chalk.grey("#")) },
                        { field: "key", name: chalk.bold(chalk.greenBright("Key")) },
                        { field: "id", name: chalk.bold(chalk.cyan("ID")) },
                    ]
                }
                let ids: number[] = data.issueIds
                let keys: string[] = data.issueKeys

                let i = ids[Symbol.iterator]()
                let j = keys[Symbol.iterator]()

                let table: any[] = []
                let index = 0

                let test = limitArray(ids.length)

                while (true) {
                    const id = i.next()
                    const key = j.next()
                    if (id.done === true)
                        break;
                    if (key.done === true)
                        break;


                    index += 1
                    if (test(index - 1) == false)
                        continue

                    table.push({ 'index': chalk.grey(`${index}`), 'key': chalk.bold(chalk.greenBright(`${key.value}`)), 'id': chalk.cyan(`${id.value}`) })

                }


                console.log()

                console.log(chalkTable(options, table))
                console.log()
                break;
            }
            case 'browse': {
                let status = niceStatus(result)
                let url = `${config.endpoint}${config.browsePath}${result.key}`

                console.log()
                console.log(`${chalk.bold(chalk.whiteBright(result.key))} (${result.id}) - ${chalk.yellow(result.type)} - ${status}`)
                console.log()

                const padLength = 16

                writeRow(pad(chalk.white('Summary') + ': ', padLength), result.summary, (x) => chalk.bold(chalk.magenta(x)))
                writeRow(pad(chalk.white('Link') + ': ', padLength), url, (x) => chalk.underline(chalk.dim(chalk.blue(x))))
                writeRow(pad(chalk.white('Assigned to') + ': ', padLength), result.assignee, (x) => chalk.bold(chalk.red(x)))

                let maybeResolved = ''
                if (result.resolved)
                    maybeResolved = ` -> ${chalk.green(result.resolved)}`
                writeRow(pad(chalk.white('Timeline') + ': ', padLength), `${chalk.blue(result.created)} -> ${chalk.yellow(result.updated)}${maybeResolved}`, (x) => x)

                if (options.long)
                    writeRow(pad(chalk.white('Description') + ': ', padLength), result.description, chalk.italic)
                else
                    writeRow(pad(chalk.white('Description') + ': ', padLength), result.description, chalk.italic, options.shorten)

                if (result.comments)
                    console.log()

                printComments(result.comments, limitArray(result.comments.length))



                break;
            }

            case 'create-issue': {

                if (result.issueKey !== undefined) {

                console.log(`Created issue ${chalk.bold(chalk.yellow(result.issueKey))}.`)
                } else {
                    if (result.errors !== undefined) {

                        let keys = Object.keys(result.errors)

                        keys.forEach((v,i,a)=> {
                            console.log(`Error with ${chalk.bold(chalk.red(v))}: ${chalk.redBright(result.errors[v])}`)
                        })
                    }
                }

                break;
            }

            case 'do-list': {

                console.log(`Supported actions for ${chalk.bold(chalk.yellow(result.key))}:`)

                let keys = Object.keys(result).filter((v,i,a)=> v!='key')

                keys.forEach(
                    (v,i,a)=> {
                        let actions = Object.keys(result[v]).sort()

                        writeRow(`  ${chalk.bold(chalk.white(v))}: `,actions.join(chalk.grey(", ")), (x)=>chalk.italic(chalk.greenBright(x)))
                    })
                
                break;
            }

            case 'do-put': {
                let responseText = `${chalk.bold(result.response.status)} ${result.response.statusText}`
                if (result.response.status == 302)
                    responseText = chalk.green(responseText)
                else
                    responseText = chalk.red(responseText)
                console.log()
                console.log(`Put ${chalk.bold(chalk.yellow(result.key))} -> ${chalk.bold(chalk.cyan(result.what))}: ${responseText}`)
                console.log()

                break;
            }

            case 'comments': {
                if (result['tst-comments-key'] !== undefined) {
                    console.log()
                    console.log(chalk.underline(`Comments for ${chalk.bold(chalk.whiteBright(result['tst-comments-key']))}`))
                    console.log()
                }

                printComments(result.comments, limitArray(result.comments.length))
                break;
            }

            case 'show': {
                let maybeSearchIndex = ''
                if (result['tst-search-result-index'] != undefined) {
                    maybeSearchIndex = pad(chalk.dim(chalk.gray(`${result['tst-search-result-index']}`)),4)
                }
                let leftpad = pad('',stripAnsi(maybeSearchIndex).length)
                let status = niceStatus(result)

                let maybeResolved = ''
                if (result.resolved)
                    maybeResolved = ` -> ${chalk.green(chopDate(result.resolved))}`

                let url = `${config.endpoint}${config.browsePath}${result.key}`

                console.log(`${maybeSearchIndex}${chalk.whiteBright(result.key)} (${result.id}) - ${chalk.yellow(result.type)} - ${status} - ${chalk.bold(chalk.red(result.assignee))}`)
                console.log(`${leftpad}${chalk.dim(chalk.gray('  | '))}${chalk.dim('Link: '+chalk.blue(chalk.underline(url)))}`)
                console.log(`${leftpad}${chalk.dim(chalk.gray('  | '))}${lastCommentDate(result)} - ${chalk.blue(chopDate(result.created))} -> ${chalk.yellow(chopDate(result.updated))}${maybeResolved}`)
                writeRow(`${leftpad}${chalk.dim(chalk.gray('  | '))}`,result.summary,(x)=>chalk.italic(chalk.bold(chalk.white(x))))

                if (options.long) {
                    printComments(result.comments,(x)=>x == result.comments.length-1,false,true,`${leftpad}${chalk.dim(chalk.gray('  | '))}`)
                }

                console.log()

                break;
            }

            default: {

                console.log(result)
                break;
            }
        }
    }
}
/**
 * This is the main program entry point.
 * 
 * Sorry for the mess.
 */

import shellEscape from 'shell-escape'

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

import { TrackSpaceAPI } from './trackspace.js'
import { TstConfig, initialConfig, QueryConfigStdin, dotPath, defaultConfigPath } from './config.js'


import commandLineArgs from 'command-line-args'
import commandLineUsage from 'command-line-usage'

import { setConcurrency, setProxy, setVerbose} from './net.js'


import { setPrintOptions, printResults } from './print-results.js'
import { setLimiterOptions, limitArray } from './limit-output.js'

import { optionDefinitions, setShorthands, setUserShorthands, usageSections } from './help-commands-and-options.js'
import chalk from 'chalk'

//Hack to get around the top-level await:

(async () => {

  // Parse command line

  const options = commandLineArgs(optionDefinitions)

  let verbose = options.verbose
  if (verbose) console.log('CLI options:', options)

  setVerbose(verbose)

  if (options.unordered !== undefined) {
    options.ordered = false
  }

  if (options.ordered === undefined) {
    options.ordered = !options.json
    if (verbose) console.log(`options.ordered <- ${options.ordered} [default value]`)
  }



  // create dotPath, initial config.json

  if (options.config == defaultConfigPath) {
    if (!existsSync(dotPath)) {
      mkdirSync(dotPath)
    }
    if (!existsSync(defaultConfigPath)) {
      writeFileSync(defaultConfigPath, JSON.stringify(initialConfig), 'utf8')
    }
  }

  // Load config

  let config: TstConfig = initialConfig

  try {
    let data: string = readFileSync(options.config, 'utf8')
    config = JSON.parse(data)
    if (verbose) console.log(`Read config file ${options.config}`)
  } catch (error) {
    if (verbose) console.log(`Could not load config file ${options.config}:`, error)
  }

  if (verbose) console.log('Loaded config:', config)

  let query = new QueryConfigStdin()

  let effectiveConfig = query.effective(config)

  if (verbose) console.log('Effective config:', effectiveConfig)

  if (effectiveConfig.setProxy !== undefined) {
    if (verbose) console.log(`Setting proxy to ${effectiveConfig.setProxy}`)
    setProxy(effectiveConfig.setProxy)
  }

  if (effectiveConfig.maxConcurrentRequests !== undefined) {
    if (verbose) console.log(`Setting max. concurrent fetch requests to ${effectiveConfig.maxConcurrentRequests}`)
    setConcurrency(effectiveConfig.maxConcurrentRequests)
  }

  if (effectiveConfig.shorthands !== undefined) {
    if (verbose) console.log(`Setting effective shorthands to `, effectiveConfig.shorthands)
    setShorthands(effectiveConfig.shorthands)
  }

  if (effectiveConfig.userShorthands !== undefined) {
    if (verbose) console.log(`Setting effective userShorthands to `, effectiveConfig.userShorthands)
    setUserShorthands(effectiveConfig.userShorthands)
  }


  let ts = new TrackSpaceAPI(config = config, query = query, verbose = options.verbose)

  if (options.login) {
    let result = await ts.login()
    if (!result)
      throw `Login attempt failed!`
  }

  if (effectiveConfig.testCredentials) {
    if (!(await ts.testCredentials())) {
      await ts.login()
    }
  }

  options.consoleWidth = effectiveConfig.consoleWidth

  // push the options to the print module
  setPrintOptions(options, effectiveConfig)
  // push the options to the limits module
  setLimiterOptions(options)

  // dispatch different things that can be done using the 'do' command
  function doAction(what: string, moreOptions: string[]) {
    switch (what) {
      case 'list': {
        return async (x: string) => {

          return ts.scanActions(x)
        }
      }
      case 'put': {
        let what = moreOptions[0]
        moreOptions.shift()
        return async (x: string) => {
          return ts.putAction(what, x)
        }
      }
      default: {
        console.log(`Unknown thing to do ${what}. Run 'tst help' for long help.`)

        return async (x: string) => { return {} }
      }
    }
  }

  if (undefined != options.command) {

    if (options.command.length >= 1) {
      let shorties = { ...effectiveConfig.shorthands, ...effectiveConfig.userShorthands }
      let shs = Object.keys(shorties)
      let cmd0 = options.command[0].trim()

      if (shs.indexOf(cmd0) > -1) {
        let additionalOptions = options.command.slice(1, options.command.length)


        if (!options.json) console.log(`${chalk.gray('...->')} ${chalk.greenBright(shellEscape(shorties[cmd0]))} ${chalk.yellow(shellEscape(additionalOptions))}\n`)
        options.command = [...shorties[cmd0], ...additionalOptions]

      }
    }

    let cmd = options.command[0]

    options.command.splice(0, 1)

    // parse the command
    switch (cmd) {
      case 'search': {
        let args: string[] = options.command!


        let waitForPromises: (Promise<any>)[] = []

        let processingStep = (x: any, q: string) => {
          printResults('search', { ...{ 'tst-search-query': q }, ...x })
        }

        function augmentResult(x: any, q: string, idx: number, total: number, id?: number, key?: string) {
          let searchInfo = {
            'tst-search-query': q,
            'tst-search-result-index': idx,
            'tst-search-result-total': total,
            'tst-search-result-id': id,
            'tst-search-result-key': key
          }
          return { ...searchInfo, ...x }
        }

        let lastPromise: Promise<any> | undefined = undefined

        // parse the post-processing option for the search results
        switch (options.process) {
          case 'show':
          case 'browse': {

            processingStep = (x: any, q: string) => {
              let keys: string[] = x.issueTable.issueKeys

              let test = limitArray(keys.length)

              keys.forEach(async (v, i, a) => {

                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.browse(v).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult(s, q, i, x.issueTable.total, undefined, v)
                    printResults(options.process, result)

                  })
                }


                lastPromise = thisPromise(lastPromise)

              })

            }
            break;
          }
          case 'summary': {
            processingStep = (x: any, q: string) => {
              let ids: number[] = x.issueTable.issueIds

              let test = limitArray(ids.length)


              ids.forEach((v, i, a) => {
                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.issueSummary(`${v}`).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult(s, q, i, x.issueTable.total, v)
                    printResults(options.process, result)
                  }

                  )
                }

                lastPromise = thisPromise(lastPromise)
              })
            }
            break;
          }
          case 'unwatch': {
            processingStep = (x: any, q: string) => {
              let ids: number[] = x.issueTable.issueIds

              let test = limitArray(ids.length)


              ids.forEach((v, i, a) => {
                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.unwatch(`${v}`).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult(s, q, i, x.issueTable.total, v)
                    printResults(options.process, result)
                  }

                  )
                }

                lastPromise = thisPromise(lastPromise)
              })
            }
            break;
          }
          case 'watch': {
            processingStep = (x: any, q: string) => {
              let ids: number[] = x.issueTable.issueIds

              let test = limitArray(ids.length)


              ids.forEach((v, i, a) => {
                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.watch(`${v}`).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult(s, q, i, x.issueTable.total, v)
                    printResults(options.process, result)
                  }

                  )
                }

                lastPromise = thisPromise(lastPromise)
              })
            }
            break;
          }
          case 'comments': {

            processingStep = (x: any, q: string) => {
              let keys: string[] = x.issueTable.issueKeys

              let test = limitArray(keys.length)

              keys.forEach((v, i, a) => {

                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.comments(`${v}`).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult({ 'comments': s, 'tst-comments-key': v }, q, i, x.issueTable.total, undefined, v)
                    printResults(options.process, result)
                  })
                }
                lastPromise = thisPromise(lastPromise)
              })

            }
            break;
          }
          case 'items': {

            processingStep = (x: any, q: string) => {
              let keys: string[] = x.issueTable.issueKeys

              let test = limitArray(keys.length)

              keys.forEach((v, i, a) => {

                if (test(i) == false)
                  return

                async function thisPromise(lp: Promise<any> | undefined) {
                  return ts.getChecklist(`${v}`).then(async (s) => {

                    if (lp !== undefined) {
                      await lp
                    }

                    let result = augmentResult({ 'items': s, 'tst-items-key': v }, q, i, x.issueTable.total, undefined, v)
                    printResults(options.process, result)
                  })
                }
                lastPromise = thisPromise(lastPromise)
              })

            }
            break;
          }
          case 'print': {
            break;
          }
          default:
            {
              console.log(`Unknown search query processing command: ${options.process}`)
              console.log("Reverting to printing!")
              break;
            }
        }



        args.forEach((v, i, a) => {
          waitForPromises.push(ts.searchIssues(v).then(
            (x: any) => {
              if (x.errorMessages !== undefined) {
                printResults('search', x)
              } else {
                try {
                  processingStep(x, v)
                } catch (error) {
                  printResults('search', { ...x, ...{ 'errorMessages': ['Caught error in processingStep(..)', `${error}`] } })
                }
              }
            }
          )
          )
        })

        break;
      }
      case 'comments': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.comments(v).then(
            (x) => {
              printResults('comments', { ...{ 'tst-comments-key': v, 'comments': x } })
            }
          )
        })

        break;
      }
      case 'items': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.getChecklist(v).then(
            (x) => {
              printResults('items', { ...{ 'tst-items-key': v, 'items': x } })
            }
          )
        })

        break;
      }
      case 'id': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.id(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-id-key': v, 'id': x } })
            }
          )
        })

        break;
      }

      case 'unwatch': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.unwatch(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-unwatch-id': v }, ...x })
            }
          )
        })

        break;
      }
      case 'relax': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.relaxChecklist(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-relax-id': v }, ...x })
            }
          )
        })

        break;
      }
      case 'watch': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.watch(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-watch-id': v }, ...x })
            }
          )
        })

        break;
      }
      case 'summary': {
        let args: string[] = options.command!


        args.forEach((v, i, a) => {
          ts.issueSummary(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-summary-id': v }, ...x })
            }
          )
        })

        break;
      }
      case 'show':
      case 'browse': {
        let args: string[] = options.command!

        args.forEach((v, i, a) => {
          ts.browse(v).then(
            (x) => {
              printResults(cmd, { ...{ 'tst-browse-key': v }, ...x })

            }
          )
        })


        break;
      }
      case 'help': {
        if (verbose)
          console.log(JSON.stringify(usageSections()))
        console.log(commandLineUsage(usageSections()))
        break;
      }
      
      case 'submit': {
        let kind = options.command[0]
        options.command.shift()

        let process = async (form: any) => { }

        let defaultVal: any = undefined

        if (options.defaults) {
          let data: string = readFileSync(options.defaults, 'utf8')
          defaultVal = JSON.parse(data)
        }

        switch (kind) {
          case 'create-issue': {
            process = async (form) => { printResults(kind, await ts.createIssue(form, defaultVal)) }

            break;
          }
          case 'done': {
            let key = options.command[0]
            options.command.shift()

            process = async (form) => { printResults(kind, await ts.makeDone(key, form, defaultVal)) }
            break;
          }
          default: {
            console.log(`Unknown form ${kind}. Run 'tst help' for long help.`)
            break;
          }
        }



        if (options.file) {
          let args: string[] = options.command

          args.forEach((v, i, a) => {
            let data: string = readFileSync(v, 'utf8')
            let form = JSON.parse(data)

            process(form)
          })

        } else {
          let formData = new Map<string, string>()
          let args: string[] = options.command

          args.forEach((v, i, a) => {
            let splitted = v.split('=')
            let key = splitted[0]
            splitted.shift()
            let value = splitted.join('=')

            formData.set(key.trim(), value)
          })

          let form = Object.fromEntries(formData)

          process(form)
        }




        break;

      }
      case 'form': {
        let kind = options.command[0]
        options.command.shift()

        let params: string[] = options.command

        switch (kind) {
          case 'create-issue': {
            let form = await ts.createIssueForm()
            printResults(`form-${kind}`, form)
            break;
          }
          case 'done': {

            params.forEach(async (v, i, a) => {
              let form = await ts.doneForm(v)
              printResults(`form-${kind}`, form)

            })

            break;
          }
          default: {
            console.log(`Unknown form ${kind}. Run 'tst help' for long help.`)
            break;
          }
        }
        break;
      }

      case 'add': {
        let kind = options.command[0]
        options.command.shift()

        switch (kind) {
          case 'comment': {
            let issueKey = options.command[0]
            options.command.shift()
            let body = options.command.join(' ')

            let json = await ts.addComment(issueKey, body)

            printResults(`add-${kind}`, json)
            break;
          }
          case 'checkitem': {
            let issueKey = options.command[0]
            options.command.shift()
            let body = options.command.join(' ')

            let json = await ts.addChecklistItem(issueKey, body)

            printResults(`add-${kind}`, json)
            break;
          }
          default: {
            console.log(`Unknown thing to add ${kind}. Run 'tst help' for long help.`)
            break;
          }
        }
        break;
      }

      case 'check': {
        let key = options.command[0]
        options.command.shift()

        let args: string[] = options.command

        let result = await ts.checkItems(key,args)

        printResults('check', result)

        break;
      }

      case 'uncheck': {
        let key = options.command[0]
        options.command.shift()

        let args: string[] = options.command

        let result = await ts.checkItems(key,args,false)

        printResults('uncheck', result)

        break;
      }

      case 'do': {
        let kind = options.command[0]
        options.command.shift()

        let action = doAction(kind, options.command)
        let args: string[] = options.command

        args.forEach(async (v, i, a) => {
          let result = await action(v)
          printResults(`do-${kind}`, result)
        })


        break;
      }

      default: {
        console.log(`Unknown command ${cmd}. Run 'tst help' for long help.`)
        break;
      }
    }


  } else {
    console.log("No command issued. Run 'tst help' for long help.")
  }



  if (options.saveConfig) {
    if (verbose) console.log(`Saving current configuration to ${options.config}`)
    writeFileSync(options.config, JSON.stringify(config), 'utf8')
  }

  if (options.rmCookies) {
    ts.rmCookies()
  }
})()
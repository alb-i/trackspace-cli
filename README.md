# Discontinuation Notice

Recently, trackspace has changed the way the login works and I am not going to fix the code. This project is now discontinued.

# Trackspace Tool

Command-line interface to trackspace.

Usage examples:
```
	tst help

	tst @me

	tst create summary='Update trackspaceTool'

	tst watching-closed -p unwatch
```

## Requirements

### Global setup of typescript

* `brew install node`
* `npm install -g typescript`
* `npm install -g '@types/node'`

Bundle script that will build a single commonjs file in the `./build` folder (and a tst-link): 

* `./bundle.sh`

Install all the dependencies from the root directory:

* `npm install`

Compile from the root directory:

* `tsc`

### Project requirements

(You don't need to install these manually, but if you want to cannibalize on the depends, this may be handy.)

* `npm install esbuild`
* `npm install minify`
* `npm install command-line-args --save`
* `npm install '@types/command-line-args' --save`
* `npm install os --save`
* `npm install path --save`
* `npm install fs --save`
* `npm install readline-sync --save`
* `npm install '@types/readline-sync' --save`
* `npm install 'node-fetch' --save`
* `npm install 'cheerio' --save`
* `npm install '@types/cheerio' --save`
* `npm install --save-dev @tsconfig/recommended`
* `npm install command-line-usage --save`
* `npm install '@types/command-line-usage' --save`
* `npm install https-proxy-agent --save`
* `npm install chalk --save`
* `npm install '@types/chalk' --save`
* `npm install strip-ansi --save`
* `npm install '@types/strip-ansi' --save`
* `npm install shell-escape --save`
* `npm install '@types/shell-escape' --save`

#### Learnings

* `sync-fetch` has problems with proxy configuration (pretty much unfixable) -> We forgo the sync apis

## Configuration

Run `tst help` to see a list of configuration options.

The file `~/.trackspace/config.json` contains the default configuration as a JSON dictionary. The most important keys are:

* `"username"` - set your username so you do not have to enter it everytime you want to login.
* `"createIssueDefault"` - a dictionary with key-value pairs that are used as a default when you create issues, you might want to set the following keys here:
	* `"pid"` - default project id
	* `"issuetype"` - default issue type 
	* `"priority"` - default priority
* `"userShorthands"`: a dictionary where the keys are user-defined shorthands, and the values are arrays of strings that consists of the replacement command. Example:
	``` "userShorthands": { "recent": ["search", "project in (\"XXX"\",\"YYY\") AND createdDate >= startOfDay(-3d)"]} ```
* `"setProxy"`: set a proxy that is used for all requests to trackSpace


## Hacking

The code is roughly organized as follows:

* `src/chalk-table.ts`:
	* 3rd party module that was not available as typescript

* `src/config.ts`:
	* Configuration settings
	* Built-in shorthands
	* Configuration help
	* Code used to query the configuration

* `src/help-commands-and-options.ts`:
	* (Parser-) definitions of command-line options
	* All help related stuff (except for configuration help)

* `src/limit-output.ts`:
	* Code used to restrict search results to a certain range.

* `src/main.ts`:
	* Main entry point
	* Parse command line
	* Load config
	* Parse commands and do stuff
		* `function doAction(..)` - use this to add functionality for the 'do' command
		* `switch (cmd) {...}` - use this to add a new top-level command
		* `switch (options.process) {...}` - use this to add a new option to process search results
	* Save config and cookies

* `src/net.ts`:
	* wrapper around `fetch`
	* handles proxy settings 
	* handles limiting maximum number of concurrent connections

* `src/print-results.ts`:
	* handles output

* `src/trackspace.ts`:
	* implements the API used to access trackSpace

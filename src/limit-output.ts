/**
 * This module handles limiting the output
 */

 let options : any = {}

 export function setLimiterOptions(opts:any) {
     options = opts
 }

 /**
  * synthesize a function that can be used to limit arrays to parts
  * 
  * @param length length of the array
  * @returns  a function that checks whether the given array index should be printed
  */
 export function limitArray(length:number){
    let skip = options.skip[0]
    let limit = options.limit[0]
  
    if (options.skip.length > 1) {
      options.skip.shift()
    }
    if (options.limit.length > 1) {
      options.limit.shift()
    }
  
    if (skip < 0)
      skip = length + skip
  
    if (limit < 0)
      limit = length
    else
      limit = skip + limit
  
    function synthesizeChecker(skip:number, limit:number) {
      return (idx:number) => (idx >= skip) && (idx < limit)
    }
  
    return synthesizeChecker(skip,limit)
  }
export type QueryResultWithError={error:unknown}

export function throwFirstQueryError(...results:QueryResultWithError[]){
  for(const result of results){
    if(result.error)throw result.error
  }
}

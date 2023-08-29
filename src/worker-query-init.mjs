import JSONTag from '@muze-nl/jsontag';
import worker_threads from 'node:worker_threads';
import * as queryWorker from '@muze-nl/simplystore/src/worker-query.mjs';

/*
 * This creates reverse links for the slo opendata curriculum dataset
 * So if ldk_vakleergebied[x].vakleergebied[y], it adds vakleergebied[y].ldk_vakleergebied[x]
 * The reverse link is not enumerable so won't be shown by default
 * only if you explicitly select() it
 */
function sloIndex(root) {
  Object.entries(root).forEach(([datatype,dataset]) => {
    if (datatype==='Deprecated') {
        return
    }
    console.log('linking '+datatype+' ('+dataset.length+')')
    dataset.forEach(entity => {
        Object.entries(entity).forEach(([propertyName,propertyValue]) => {
            if (Array.isArray(propertyValue) && typeof root[propertyName] !== 'undefined') {
                propertyValue.forEach(linkedEntity => {
                    if (!linkedEntity.id) {
                        return
                    }
                    if (typeof linkedEntity[datatype] === 'undefined') {
                        Object.defineProperty(linkedEntity, datatype, { 
                              value: []
                            })
                    }
                    linkedEntity[datatype].push(entity)
                })
            } else if (JSONTag.getType(propertyValue)==='object') {
                if (!propertyValue.id) {
                        return
                    }
                if (typeof propertyValue[datatype] === 'undefined') {
                    Object.defineProperty(propertyValue, datatype, { 
                          value: []
                        })
                }
                propertyValue[datatype].push(entity)
            }
        })
    })
  })
}

async function initialize() {
	let meta = {}
	let dataspace = JSONTag.parse(worker_threads.workerData, null, meta)
	//console.log('starting')
	sloIndex(dataspace)
	await queryWorker.initialize(dataspace,meta)
	//console.log('initialized')
	return queryWorker.runQuery
}

export default initialize()
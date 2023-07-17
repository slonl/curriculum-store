import simplystore from '@muze-nl/simplystore'
import fs from 'fs'
import JSONTag from '@muze-nl/jsontag'

const datafile = process.env.DATAFILE || 'data/curriculum.jsontag'
const port     = process.env.NODE_PORT || 3000

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

let meta = {}
const dataspace = JSONTag.parse(fs.readFileSync(datafile).toString(),null,meta)
sloIndex(dataspace)

function countObjects() {
    let count = 0
    return Object.values(dataspace).map(list => list.length).reduce((count,length) => count + length, 0)
}

simplystore.get('/status/', (req, res, next) => 
{
    let result = {
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)+'MB',
        datasets: Object.keys(dataspace),
        objects: countObjects(dataspace)
    }
    res.setHeader('content-type','application/json')
    res.send(JSON.stringify(result, null, 4)+"\n")
})

simplystore.run({
	dataspace: dataspace,
	meta: meta,
	port: port
})
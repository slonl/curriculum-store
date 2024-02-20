import JSONTag from '@muze-nl/jsontag'
import fastStringify from '@muze-nl/simplystore/src/fastStringify.mjs'
import fs from 'node:fs'

if (process.argv.length<=3) {
	console.log('usage: node ./convert.mjs {inputfile} {outputfile}')
	process.exit()
}

// parse command line
let inputFile = process.argv[2]
let outputFile = process.argv[3]

// load file
let input = fs.readFileSync(inputFile, 'utf-8')

// parse jsontag
let meta = {}
let dataspace = JSONTag.parse(input, null, meta)

/*
 * This creates reverse links for the slo opendata curriculum dataset
 * So if ldk_vakleergebied[x].vakleergebied[y], it adds vakleergebied[y].ldk_vakleergebied[x]
 * The reverse link is not enumerable so won't be shown by default
 * only if you explicitly select() it
 */
function sloIndex(root) {
    Object.entries(root).forEach(([datatype,dataset]) => {
        if (datatype==='Deprecated' || datatype==="NiveauIndex") {
            return
        }
        console.log('linking '+datatype+' ('+dataset.length+')')
        dataset.forEach(entity => {
            Object.entries(entity).forEach(([propertyName,propertyValue]) => {
            	if (!propertyValue) {
            		return
            	}
                if (Array.isArray(propertyValue) && typeof root[propertyName] !== 'undefined') {
                    propertyValue.forEach(linkedEntity => {
                        if (!linkedEntity) {
                            console.error('No entities for '+datatype, entity)
                            return
                        }
                        if (!linkedEntity.id) {
                            return
                        }
                        if (typeof linkedEntity[datatype] === 'undefined') {
                        	console.log('defining',datatype,linkedEntity.id)
                            Object.defineProperty(linkedEntity, datatype, {
                                value: [],
                                enumerable: false
                            })
                        }
                        linkedEntity[datatype].push(entity)
                    })
                } else if (JSONTag.getType(propertyValue)==='object') {
                    if (!propertyValue.id) {
                        return
                    }
                    if (typeof propertyValue[datatype] === 'undefined') {
                       	console.log('defining',datatype,propertyValue.id)
                        Object.defineProperty(propertyValue, datatype, {
                            value: [],
                            enumerable: false
                        })
                    }
                    propertyValue[datatype].push(entity)
                }
            })
        })
    })
}

function indexRoots(data) {
    //@TODO: root entities should be defined in the context.json
    //for each curriculum context
    const roots = [
        'Examenprogramma',
        'LdkVakleergebied',
        'Syllabus',
        'FoDomein',
        'RefVakleergebied',
        'ErkGebied',
        'ExamenprogrammaBgProfiel',
        'KerndoelVakleergebied',
        'InhVakleergebied',
        'NhCategorie',
        'FoDomein'
    ]

    function isObject(data)
    {
        return typeof data === 'object' && !(
            data instanceof String
            || data instanceof Number
            || data instanceof Boolean
            || Array.isArray(data)
            || data === null
        )
    }

    function registerRoot(entity, root)
    {
        if (!isObject(entity)) {
            return
        }
        if (typeof entity.root === 'undefined') {
            Object.defineProperty(entity, 'root', {
                value: [],
                enumerable: false
            })
        }
        if (entity.root.indexOf(root)===-1) {
            entity.root.push(root)
        }
        Object.values(entity).forEach(v => {
            if (Array.isArray(v)) {
                v.forEach(sub => {
                    registerRoot(sub, root)
                })
            }
        })
    }

    roots.forEach((rootType) => {
        if (Array.isArray(data[rootType])) {
            for ( let e of data[rootType] ) {
                registerRoot(e, e)
            }
        } else {
            console.error(rootType+' not found')
        }
    })

}

function hideReplace(data) {
    for (let a of Object.values(data)) {
        for (let e of a) {
            if (e.replaces) {
                Object.defineProperty(e, 'replaces', {
                    enumerable: false
                })
            }
            if (e.replacedBy) {
                Object.defineProperty(e, 'replacedBy', {
                    enumerable: false
                })
            }
        }
    }
}

hideReplace(dataspace) // prevents cycles in the data
sloIndex(dataspace) // adds reverse links from child to parent
indexRoots(dataspace) // adds the set of ultimate root entities for each child entity

// write resultset to output
let strData = fastStringify(dataspace)

fs.writeFileSync(outputFile, strData)

console.log('Converted data written to ',outputFile)

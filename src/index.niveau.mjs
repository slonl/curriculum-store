import JSONTag from '@muze-nl/jsontag'
import { getParents, getChildren, flatten } from './util.mjs'
import { previous } from '@muze-nl/od-jsontag/src/symbols.mjs'

export default {
	create(data, meta) {
		meta.index.niveau = {}
	    for (let entityType in meta.schema.types) {
	        if (!meta.schema.types[entityType].root) {
	            continue
	        }
			console.log('creating niveau index for '+entityType)
	        data[entityType].forEach(e => registerNiveauIndex(e, meta))
	    }
	},
	update(data, meta, changes) {
		for (const entity of changes) {
			if (entity.Niveau) {
				entity.NiveauIndex = Array.slice(entity.Niveau)
			}
		}
		for (const entity of changes) {
			if (entity.Niveau || entity[previous].Niveau) {
				// check if we need to update any parent
	            if (diff(entity.Niveau, entity[previous].Niveau)) {
	    			updateParents(entity, meta)
	            }
			}
	    }
	}
}

let indent = 0
let spaces = ' '.repeat(100)

function registerNiveauIndex(entity, meta) {
    const type = JSONTag.getAttribute(entity, 'class')
    if (!type) {
        return
    }
    let children = meta.schema.types[type].children
    let niveaus = []
    if (entity.Niveau) {
        niveaus.push(entity.Niveau)
    } else if (entity.NiveauIndex && entity.NiveauIndex.length) {
        niveaus.push(entity.NiveauIndex)
    } else {
        Object.keys(children).forEach(childType => {
            if (childType=='Vakleergebied') {
                return // is not a true parent in any case
            }
            if (entity[childType]) {
            	indent++
                niveaus.push(entity[childType].map(child => registerNiveauIndex(child, meta)))
                indent--
            }
        })
    }
    if (niveaus.length) {
	    niveaus = flatten(niveaus) // unique
	    if (typeof entity.NiveauIndex === 'undefined' || !entity.NiveauIndex) {
            entity.NiveauIndex = niveaus
        }
    }
//	console.log(spaces.substring(0,indent)+' register niveau',entity.id, niveaus.length)
    return niveaus
}

function updateParents(entity, meta) {
	const parents = getParents(entity, meta)
	for (const parent of parents) {
		if (parent.Niveau) {
			parent.NiveauIndex = Array.slice(parent.Niveau)
			continue
		}
		const children = getChildren(parent, meta)
		const niveaus = getNiveaus(children)
		if (!parent.NiveauIndex || diff(niveaus, parent.NiveauIndex)) {
			parent.NiveauIndex = niveaus
			updateParents(parent, meta)
		}
	}
}

function getNiveaus(children) {
	let niveaus = new Set()
	for (const child of children) {
		if (child.NiveauIndex) {
			for (const niveau of child.NiveauIndex) {
				niveaus.add(niveau.id)
			}
		}
	}
	return Array.from(niveaus)
}

function diff(a, b) {
	const set1 = new Set(a);
	const set2 = new Set(b);

	if (set1.size !== set2.size) return true;

	for (const str of set1) {
		if (!set2.has(str)) return true;
	}

	return false;
}
import JSONTag from '@muze-nl/jsontag'
import getParents from './util.mjs'

export function createNiveauIndex(data, meta) {
	meta.index.niveau = {}
    for (let entityType in meta.schema.types) {
        if (!meta.schema.types[entityType].root) {
            continue
        }
        data[entityType].forEach(registerNiveauIndex)
    }
}

export function updateNiveauIndex(data, meta, changes) {
	for (const entity of changes) {
		if (entity.Niveau) {
			entity.NiveauIndex = Array.slice(entity.Niveau)
		}
	}
	for (const entity of changes) {
		if (entity.Niveau) {
			// check if we need to update any parent
			// FIXME: if entity.Niveau has changed....
			updateParents(entity)
		}
    }
}

function registerNiveauIndex(entity) {
    const type = JSONTag.getAttribute(entity, 'class')
    if (!type) {
        return
    }
    let children = meta.schema.types[type].children
    let niveaus = []
    Object.keys(children).forEach(childType => {
        if (childType=='Vakleergebied') {
            return // is not a true parent in any case
        }
        if (entity[childType]) {
            niveaus.push(entity[childType].map(child => registerNiveauIndex(child)))
        }
    })
    if (entity.NiveauIndex && entity.NiveauIndex.length) {
        niveaus.push(entity.NiveauIndex)
    }
    if (entity.Niveau) {
        // @FIXME: probably only set entity.Niveau in NiveauIndex
        niveaus.push(entity.Niveau)
    }
    niveaus = flatten(niveaus).filter(Boolean)
    if (niveaus.length) {
        if (typeof entity.NiveauIndex === 'undefined') {
            entity.NiveauIndex = [] //can't use non-enumerable here, since default JSONTag will ignore it
        }
        niveaus = niveaus.filter(n => entity.NiveauIndex.findIndex(ni => ni.id==n.id)===-1)
        entity.NiveauIndex.splice(entity.NiveauIndex.length, 0, ...niveaus)
        for (let n of entity.NiveauIndex) {
            if (!niveauIndex[n.title]) {
                niveauIndex[n.title] = {
                    id: n.id,
                    title: n.title
                }
            }
            if (!niveauIndex[n.title][type]) {
                niveauIndex[n.title][type] = new Set()
            }
            niveauIndex[n.title][type].add(entity)
        }
    }
    return niveaus
}

function updateParents(entity) {
	const parents = getParents(entity)
	const niveaus = entity.Niveau.map(e => e.id)
	for (const parent of parents) {
		if (parent.Niveau) {
			parent.NiveauIndex = Array.slice(parent.Niveau)
			continue
		}
		const children = getChildren(parent)
		const niveaus = getNiveaus(children)
		if (!parent.NiveauIndex || diff(niveaus, parent.NiveauIndex)) {
			parent.NiveauIndex = niveaus
			updateParents(parent)
			//FIXME: update meta.index.niveau
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
	// return true if array/set a and b have different contents
}
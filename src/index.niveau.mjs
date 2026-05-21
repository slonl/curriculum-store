import JSONTag from '@muze-nl/jsontag'
import getParents from './util.mjs'
import { previous } from '@muze-nl/od-jsontag'

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
		if (entity.Niveau || entity[previous].Niveau) {
			// check if we need to update any parent
            if (diff(entity.Niveau, entity[previous].Niveau)) {
    			updateParents(entity)
            }
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
                niveaus.push(entity[childType].map(child => registerNiveauIndex(child)))
            }
        })
    }
    niveaus = Array.from(new Set(flatten(niveaus).filter(Boolean))) // unique
    if (niveaus.length) {
        if (typeof entity.NiveauIndex === 'undefined' || !entity.NiveauIndex) {
            entity.NiveauIndex = niveaus
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
	// @TODO: return true if array/set a and b have different contents
}
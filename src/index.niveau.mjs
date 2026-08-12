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
            console.log('creating niveau index for ' + entityType)
            data[entityType].forEach(e => registerNiveauIndex(e, meta))
        }
    },
    update(data, meta, changes) {
        for (const entity of changes) {
            let changed = false

            if (diff(entity.Niveau, entity[previous]?.Niveau)) {
                changed = updateNiveauIndex(entity, meta)
            }

            if (childrenDiff(entity, entity[previous], meta)) {
                changed = updateNiveauIndex(entity, meta) || changed
            }

            if (changed) {
                updateParents(entity, meta)
            }
        }
    }
}

function registerNiveauIndex(entity, meta) {
    const niveaus = calculateNiveauIndex(entity, meta, { rebuildChildren: true })
    setNiveauIndex(entity, niveaus, { empty: 'delete' })
    return niveaus
}

function updateParents(entity, meta) {
    const parents = getParents(entity, meta)

    for (const parent of parents) {
        if (updateNiveauIndex(parent, meta)) {
            updateParents(parent, meta)
        }
    }
}

function updateNiveauIndex(entity, meta) {
    if (!entity) {
        return false
    }

    const niveaus = calculateNiveauIndex(entity, meta, { rebuildChildren: false })

    if (!entity.NiveauIndex && !niveaus.length) {
        return false
    }

    if (!entity.NiveauIndex || diff(niveaus, entity.NiveauIndex)) {
        setNiveauIndex(entity, niveaus)
        return true
    }

    return false
}

function getNiveauChildren(entity, meta) {
    return getChildren(entity, meta).filter(child => {
        return JSONTag.getAttribute(child, 'class') !== 'Vakleergebied'
    })
}

function childrenDiff(entity, previousEntity, meta) {
    if (!previousEntity) {
        return false
    }

    return diff(
        getNiveauChildren(entity, meta),
        getNiveauChildren(previousEntity, meta)
    )
}

function calculateNiveauIndex(entity, meta, { rebuildChildren }) {
    if (!entity) {
        return []
    }

    if (entity.Niveau) {
        if (rebuildChildren) {
            getNiveauChildren(entity, meta).forEach(child => {
                registerNiveauIndex(child, meta)
            })
        }
        return unique(entity.Niveau)
    }

    return getNiveaus(getNiveauChildren(entity, meta), meta, { rebuildChildren })
}

function getNiveaus(children, meta, { rebuildChildren }) {
    const niveaus = new Map()

    for (const child of children) {
        const childNiveaus = getChildNiveaus(child, meta, { rebuildChildren })

        for (const niveau of childNiveaus) {
            niveaus.set(key(niveau), niveau)
        }
    }

    return Array.from(niveaus.values())
}

function getChildNiveaus(child, meta, { rebuildChildren }) {
    if (rebuildChildren || !child.NiveauIndex || child.Niveau) {
        return registerNiveauIndex(child, meta)
    }

    return child.NiveauIndex
}

function setNiveauIndex(entity, niveaus, options = {}) {
    if (niveaus.length) {
        entity.NiveauIndex = niveaus
        return
    }

    if (options.empty === 'delete') {
        delete entity.NiveauIndex
    } else {
        entity.NiveauIndex = []
    }
}

function unique(values) {
    const result = flatten(values).reduce((result, value) => {
        result.set(key(value), value)
        return result
    }, new Map())

    return Array.from(result.values())
}

function diff(a = [], b = []) {
    const set1 = new Set(a.map(key))
    const set2 = new Set(b.map(key))

    if (set1.size !== set2.size) {
        return true
    }

    for (const value of set1) {
        if (!set2.has(value)) {
            return true
        }
    }

    return false
}

function key(value) {
    return value?.id ?? value
}

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
    const type = JSONTag.getAttribute(entity, 'class')
    if (!type) {
        return
    }

    const children = meta.schema.types[type].children
    let niveaus = []

    if (entity.Niveau) {
        niveaus.push(entity.Niveau)
    } else if (entity.NiveauIndex && entity.NiveauIndex.length) {
        niveaus.push(entity.NiveauIndex)
    } else {
        Object.keys(children).forEach(childType => {
            if (childType === 'Vakleergebied') {
                return
            }
            if (entity[childType]) {
                niveaus.push(entity[childType].map(child => registerNiveauIndex(child, meta)))
            }
        })
    }

    if (niveaus.length) {
        niveaus = flatten(niveaus)
        if (typeof entity.NiveauIndex === 'undefined' || !entity.NiveauIndex) {
            entity.NiveauIndex = niveaus
        }
    }

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

    const niveaus = entity.Niveau
        ? entity.Niveau.slice()
        : getNiveaus(getNiveauChildren(entity, meta))

    if (!entity.NiveauIndex || diff(niveaus, entity.NiveauIndex)) {
        entity.NiveauIndex = niveaus
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

function getNiveaus(children) {
    const niveaus = new Map()

    for (const child of children) {
        if (child.NiveauIndex) {
            for (const niveau of child.NiveauIndex) {
                niveaus.set(key(niveau), niveau)
            }
        }
    }

    return Array.from(niveaus.values())
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
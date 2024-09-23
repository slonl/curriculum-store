import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from 'jaqt'
import JSONTag from '@muze-nl/jsontag'
import {source,isProxy} from '@muze-nl/od-jsontag/src/symbols.mjs'
import applyValues from 'array-apply-partial-diff'
import {appendFileSync} from 'fs'

function log(message) {
    console.log(process.cwd()+': '+message)
    appendFileSync(process.cwd()+'simplystore.log', message+"\n")
}

function findChild(root, child, type) {
    // walk over children of root untill you find child
    // naive implementation
    if (root[type]?.includes(child)) {
        return true
    }
    for (let prop of Object.keys(root)) {
        if (/^[A-Z]/.test(prop)) {
            for (let node of root[prop]) {
                if (!node) {
                    continue //Tag contains null
                }
                if (findChild(node, child, type)) {
                    return true
                }
            }
        }
    }
    return false
}

export default {
    patch: (dataspace, command, request, meta) => {
        function fromIndex(id) {
            return meta.index.id.get('/uuid/'+id)?.deref()
        }
        function hasIndex(id) {
            return meta.index.id.has('/uuid/'+id)
        }
        // changeHistory is command.value
        if (!Array.isArray(command.value)) {
            throw new Error('Patch: Invalid value, must be an array')
        }
        let updatedEntities = 0
        if (!command.value.length) {
            return updatedEntities
        }
        let errors = []
        let localIds = new Map()

        function missingEntries(a, b) {
            return a.filter(x => !b.includes(x))
        }

        function addedEntries(a, b) {
            return b.filter(x => !a.includes(x))
        }

        function resolveLinks(arr) {
            arr = arr.map(v => {
                if (v instanceof JSONTag.Link) {
                    if (meta.index.has(v.value)) {
                        return meta.index.get(v.value).deref()
                    }
                }
                return v
            })
        }

        function appendEntity(child, type, root=null) {
            if (!child.id) {
                if (!child.uuid) {
                    throw new Error('new entity missing id and uuid')
                }
                child.id = child.uuid
                delete child.uuid
            } else {
                if (child.id.substring(0,6)=='/uuid/') {
                    child.id = child.id.substring(6)
                }
            }
            for (let key in child) {
                if (key[0]=='@' || key[0]=='$') {
                    delete child[key]
                }
            }
            try {
                JSONTag.setAttribute(child, 'id', '/uuid/'+child.id)
                if (child[source]) {
                    JSONTag.setAttribute(child[source], 'id', '/uuid/'+child.id)
                }
            } catch(e) {
                throw new Error(e.message+' id '+JSON.stringify(child))
            }
            try {
                JSONTag.setAttribute(child, 'class', type)
                if (child[source]) {
                    JSONTag.setAttribute(child[source], 'class', type)
                }
            } catch(e) {
                throw new Error(e.message+' class '+JSON.stringify(type)+' '+child.id)
            }
            if (root && !Array.isArray(root)) { // make sure root is always an array, if set
                root = [root]
            }
            if (!child.root || !Array.isArray(child.root)) {
                // fix incorrect or missing child.root: must always exist and be a non-enumerable array
                // in particular orphans may not have a .root property, so add it here
                Object.defineProperty(child, 'root', {
                    configurable: true,
                    writable: true,
                    enumerable: false,
                    value: child.root ? [child.root] : []
                })
            }
            if (root) {
                // merge root and child.root, only add missing entries
                let current = child.root.map(e => e.id)
                root.filter(e => !current.includes(e.id)).forEach(e => {
                    child.root.push(e)
                })
            }
            dataspace[type].push(child)
            let proxy = dataspace[type][dataspace[type].length-1]

            Object.keys(child).forEach(prop => {
                if (Array.isArray(child[prop])) {
                    child[prop] = child[prop].map(v => {
                        if (v.$mark=='inserted') {
                            v = addEntity(v, child)
                        }
                        return v
                    })
                } else if (prop[0]>='A' && prop[0]<='Z') { //Vakleergebied in erk/referentiekader/leerdoelenkaart
                    if (child[prop].$mark=='inserted') {
                        child[prop] = addEntity(child[prop], child)
                    }
                }
            })

            child = proxy
            meta.index.id.set('/uuid/'+child.id, child)

            return child
        }

        function addEntity(child, parent) {
            if (!child.id) {
                if (!child.uuid) {
                    throw new Error('new entity missing id and uuid')
                }
                child.id = child.uuid
                delete child.uuid
            } else {
                if (child.id.substring(0,6)=='/uuid/') {
                    child.id = child.id.substring(6)
                }
            }
            if (hasIndex(child.id)) {
                return fromIndex(child.id)
            }
            let type = child['@type']
            let root = parent.root
            for (let key in child) {
                if (key[0]=='@' || key[0]=='$') {
                    delete child[key]
                }
            }
            child.unreleased = true
            let parentType = JSONTag.getAttribute(parent[source] ?? parent, 'class')
            if (!parentType) {
                throw new Error('No parent type found: '+parent.id, { details: [parent, parent[source]] })
            }
            Object.defineProperty(child, parentType, {
                configurable: true,
                writable: true,
                enumerable: false,
                value: [parent]
            })
            return appendEntity(child, type, root)
        }

        function cleanEntity(entity) {
            const walk = function(node, type, callback) {
                Object.keys(node).forEach(property => {
                    if (property[0]>='A' && property[0]<='Z') {
                        if (!meta.schema.types[type]?.children[property]) {
                            throw new Error('Unknown child relation '+type+'.'+property,{cause:node})
                        }
                        if (!Array.isArray(node[property])) {
                            if (meta.schema.types[type]?.properties[property]?.type!='object') {
                                throw new Error('Child relation '+type+'.'+property+' must be an array',{cause:node})
                            }
                            walk(node[property], property, callback)
                        } else {
                            node[property].forEach(n => walk(n, property, callback))
                        }
                    }
                    callback(node, type)
                })
            }

            walk(entity, entity['@type'], (e,t) => {
                Object.keys(e).forEach(p => {
                    if (p[0]=='@' || p[0]=='$') {
                        // ignore these, will be removed by appendEntity
                    } else if (p[0]<'A' || p[0]>'Z') { // properties
                        if (p==='uuid') {
                            p = 'id'
                        }
                        if (!meta.schema.types[t]?.properties[p]) {
                            throw new Error('Unknown property '+t+'.'+p, {cause:e})
                        }
                    }
                })
            })
        }

        function mergeEntity(newNode, current) {
            // merge newNode changes into current
            // remove deleted children
            // mark new children (not existing entities) with $mark='inserted'
            Object.keys(newNode).forEach(prop => {
                if (prop[0]=='$' || prop[0]=='@') {
                    return
                }
                if (prop[0]>='A' && prop[0]<='Z') {
                    return
                }
                if (newNode[prop]) { // ignore empty
                    if (newNode[prop]=='-') { 
                        delete current[prop] // TODO: check type and set empty value with correct type from schema
                    } else {
                        switch(typeof newNode[prop]) {
                            case 'string':
                            case 'number':
                            case 'boolean':
                                current[prop]=newNode[prop]
                            break
                            case 'object':
                                if (newNode[prop] instanceof String) {
                                    current[prop] = ''+newNode[prop]
                                } else if (newNode[prop] instanceof Number) {
                                    current[prop] = +newNode[prop]
                                }
                            break
                        }
                    }
                }
            })
        }

        function linkEntity(entity) {
            const walk = function(node, callback) {
                callback(node)
                Object.keys(node).forEach(property => {
                    if (property[0]>='A' && property[0]<='Z') {
                        if (!Array.isArray(node[property])) {
                            walk(node[property], callback)
                        } else {
                            node[property].forEach(n => walk(n, callback))
                        }
                    }
                })
            }

            walk(entity, e => {
                Object.keys(e).forEach(property => {
                    if (property[0]>='A' && property[0]<='Z') {
                        if (!Array.isArray(e[property])) {
                            let id = e[property].id || e[property].uuid
                            if (id) {
                                let current = fromIndex(id)
                                if (current) {
                                    mergeEntity(e[property], current)
                                    e[property] = current
                                } else {
                                    e[property].$mark = 'inserted'
                                }
                            }
                        } else {
                            e[property].forEach((n,i) => {
                                let id = n.id || n.uuid
                                if (id) {
                                    let current = fromIndex(id)
                                    if (current) {
                                        mergeEntity(n, current)
                                        e[property][i] = current
                                    } else {
                                        n.$mark='inserted'
                                    }
                                }
                            })
                        }
                    }
                })
            })
        }

        let prop, entity, currentValue

        for (let change of command.value) {
            updatedEntities++
            switch(change.name) {
                case 'newEntity':
                    /*  change = {
                            name: 'addEntity',
                            entityType: 'Examenprogramma',
                            entity: {
                                id: {uuid},
                                title: ...
                            }
                        }
                    */
                    cleanEntity(change.entity)
                    linkEntity(change.entity)
                    appendEntity(change.entity, change['@type'], [change.entity])

                break
                case 'updateEntity':
                default:
                    // apply change if possible
                    entity = fromIndex(change.id)
                    if (!entity) {
                        errors.push({
                            code: 404,
                            message: `Entity not found: ${change.id}`,
                            details: {
                                id: change.id
                            }
                        })
                        continue;
                    }
                    prop = change.property
                    currentValue = entity[prop]
                    if (Array.isArray(change.newValue) || Array.isArray(currentValue)) {
                        if (!currentValue || !Array.isArray(currentValue)) {
                            // in case this is the first new child of this type
                            currentValue = []
                        }
                        if (!Array.isArray(change.newValue)) {
                            errors.push({
                                code: 406,
                                message: `Property ${prop} expected to be an Array`,
                                details: {
                                    id: change.id,
                                    prop,
                                    value: change.newValue
                                }
                            })
                            continue;
                        }
                        resolveLinks(change.newValue)
                        resolveLinks(change.prevValue)
                        let tobeRemoved = missingEntries(change.prevValue, change.newValue)
                        let newValue = change.newValue.map(v => {
                            if (v.$mark=='inserted') {
                                v = addEntity(v, entity)
                            }
                            return v
                        })
                        if (prop==='niveaus') { // niveaus are sent as an array of Niveau title
                            prop = 'Niveau'
                            newValue = from(dataspace.Niveau)
                            .where({
                                title: anyOf(...newValue)
                            })
                        }
                        let completeArray = entity[prop]?.map(e => e.id) || []
                        let prevValue = change.prevValue?.map(e => e.id) || []
                        let changedValue = newValue.map(e => e.id)
                        let appliedArray = applyValues(completeArray, prevValue, changedValue)
                        entity[prop] = appliedArray.map(id => fromIndex(id))
                        if (!entity.unreleased) { // changes in arrays always result in marking released entities dirty
                            entity.dirty = true
                        }

                        // change root. find remaining roots of any tobeRemoved entities
                        // for each root, walk until you find tobeRemoved item, if not, remove root
                        for (let child of tobeRemoved) {
                            if (!child.root) {
                                throw new Error('child has no root '+JSON.stringify(child))
                            }
                            let roots = child.root.slice()
                            let childType = JSONTag.getAttribute(child[source] ?? child, 'class')
                            if (!childType) {
                                throw new Error('No child type found', {details: child})
                            }
                            for (let root of child.root) {
                                if (!findChild(root, child, childType)) {
                                    roots.splice(roots.indexOf(root),1)
                                }
                            }
                            child.root = roots
                            if (child.root.length==0) {
                                child.deleted = true // mark for deprecation
                            }

                            // change {parent}, remove entity from tobeRemoved[entity[type]]
                            let entityType = JSONTag.getAttribute(entity[source] ?? entity, 'class')
                            child[entityType] = child[entityType].filter(e => e.id!=entity.id)
                            if (child[entityType].length==0) {
                                delete child[entityType]
                            }
                        }
                    } else {
/*
@FIXME: re-enable this check when merging is implemented
                        if (currentValue && currentValue!=change.prevValue && currentValue!=change.newValue) {
                            // for now this is an error, should try to merge
                            errors.push({
                                code: 409,
                                message: `Property ${prop} has changed`,
                                details: {
                                    id: change.id,
                                    prop,
                                    value: currentValue,
                                    expected: change.prevValue
                                }
                            })
                            continue
                        }
*/
                        entity[prop] = change.newValue
                        if (!entity.unreleased && (typeof change.dirty=='undefined' || change.dirty==true)) {
                            // only skip setting dirty on unreleased entities or if dirty is explicitly defined and falsy
                            entity.dirty = true
                        }
                    }
                break
            }
        }
        if (errors.length) {
            if (errors.length===1) {
                throw errors[0]
            } else {
                throw {
                    code: 400,
                    message: `${errors.length} errors found`,
                    details: errors
                }
            }
        }
        return updatedEntities
    }
}
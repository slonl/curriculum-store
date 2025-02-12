import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from '@muze-nl/jaqt'
import * as odJSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'
import JSONTag from '@muze-nl/jsontag'
import applyValues from 'array-apply-partial-diff'
import {importEntity} from './import.merge.mjs'
import { appendFileSync } from 'fs'

function log(message) {
    appendFileSync(process.cwd()+'/data/import-log.txt', message+"\n")
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
            arr.forEach((v,i,a) => {
                if (odJSONTag.getType(v)=='link') {
                    if (meta.index.id.has(''+v)) {
                        a[i] = meta.index.id.get(''+v).deref()
                    } else {
                        throw new Error('Cannot resolve link '+v)
                    }
                }
            })
        }

        function deleteEntity(entity) {
            if (!entity.id) {
                if (!entity.uuid) {
                    throw new Error('to be deleted entity missing id and uuid')
                }
                entity.id = entity.uuid
                delete entity.uuid
            } else {
                if (entity.id.substring(0,6)=='/uuid/') {
                    entity.id = entity.id.substring(6)
                }
            }            
            entity = fromIndex(entity.id)
            if (!entity) {
                throw new Error('to be deleted entity not found: '+entity.id)
            }
            entity.deleted = true
        }

        function undeleteEntity(entity) {
            if (!entity.id) {
                if (!entity.uuid) {
                    throw new Error('to be restored entity missing id and uuid')
                }
                entity.id = entity.uuid
                delete entity.uuid
            } else {
                if (entity.id.substring(0,6)=='/uuid/') {
                    entity.id = entity.id.substring(6)
                }
            }            
            entity = fromIndex(entity.id)
            if (!entity) {
                throw new Error('to be restored entity not found: '+entity.id)
            }
            delete entity.deleted
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
                odJSONTag.setAttribute(child, 'id', '/uuid/'+child.id)
            } catch(e) {
                throw new Error(e.message+' id '+JSON.stringify(child))
            }
            try {
                odJSONTag.setAttribute(child, 'class', type)
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
                } else if (prop[0]>='A' && prop[0]<='Z') {
                    if (child[prop].$mark == 'inserted') {
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
            let parentType = odJSONTag.getAttribute(parent, 'class')
            if (!parentType) {
                throw new Error('No parent type found for '+parent.id,{ details: [parent, parent[source]] })
            }
            Object.defineProperty(child, parentType, {
                configurable: true,
                writable: true,
                enumerable: false,
                value: [parent]
            })
            return appendEntity(child, type, root)
        }

        let prop, entity, currentValue

        for (let change of command.value) {
            updatedEntities++
            switch(change.name) {
                case 'importEntity':
                    /*  change = {
                            name: 'addEntity',
                            entityType: 'Examenprogramma',
                            entity: {
                                id: {uuid},
                                title: ...
                            }
                        }
                    */
                    updatedEntities += importEntity(change.entity, [change.entity], dataspace, meta)
                break
                case 'newEntity':
                    appendEntity(change.entity, change['@type'], [change.entity])
                break
                case 'deleteEntity':
                    entity = fromIndex(change.id)
                    if (!entity?.id) {
                        errors.push({
                            code: 404,
                            message: `Entity not found: ${change.id}`,
                            details: {
                                id: change.id
                            }
                        })
                        log('Entity not found '+change.id)
                        continue;
                    }
                    deleteEntity(entity)
                break
                case 'undeleteEntity':
                    entity = fromIndex(change.id)
                    if (!entity?.id) {
                        errors.push({
                            code: 404,
                            message: `Entity not found: ${change.id}`,
                            details: {
                                id: change.id
                            }
                        })
                        log('Entity not found '+change.id)
                        continue;
                    }
                    undeleteEntity(entity)
                break
                case 'updateEntity':
                    log('change '+change.id+' '+change.name)
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
                        log('Entity not found '+change.id)
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
                        let tobeRemoved = []
                        if (!change.prevValue) {
                            change.prevValue = []
                        }
                        if (!Array.isArray(change.prevValue)) {
                            errors.push({
                                code: 406,
                                message: `Property ${prop} expected to be an Array`,
                                details: {
                                    id: change.id,
                                    prop,
                                    value: change.prevValue
                                }
                            })
                            continue;
                        }
                        resolveLinks(change.prevValue)
                        tobeRemoved = missingEntries(change.prevValue, change.newValue) || []
                        log('checking newValue '+JSONTag.stringify(change.newValue))
                        let newValue = change.newValue?.map(v => {
                            if (v.$mark=='inserted') {
                                log('found new entity '+entity.id)
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
                        let prevValue     = change.prevValue?.map(e => e.id) || []
                        let changedValue  = newValue?.map(e => e.id) || []
                        let appliedArray  = applyValues(completeArray, prevValue, changedValue)
                        entity[prop]      = appliedArray.map(id => fromIndex(id))
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
                            let childType = odJSONTag.getAttribute(child, 'class')
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
                            let entityType = odJSONTag.getAttribute(entity, 'class')
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
                default: 
                    throw new Error('Unknown change name '+change.name)
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
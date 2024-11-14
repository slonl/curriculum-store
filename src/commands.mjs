import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from '@muze-nl/jaqt'
import * as odJSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'
import JSONTag from '@muze-nl/jsontag'
import applyValues from 'array-apply-partial-diff'
import {importEntity, addEntity, findChild, registerRoot, updateRoot, removeParent, missingEntries, addedEntries} from './import.merge.mjs'

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

        function addChild(child, parent) {
            child = addEntity(child, dataspace, meta)
            registerRoot(child, parent.root)
            const childType = odJSONTag.getAttribute(child, 'class')
            if (!childType) {
                throw new Error('No entity type found: '+child.id, { cause: child })
            }
            const parentType = odJSONTag.getAttribute(parent, 'class')
            if (!parentType) {
                throw new Error('No parent type found: '+parent.id, { cause: parent })
            }
            if (typeof child[parentType]=='undefined') {
                Object.defineProperty(child, parentType, {
                    configurable: true,
                    writable: true,
                    enumerable: false,
                    value: []
                })
            }
            child[parentType].push(parent)
            //FIXME: check if children of this child are also added
            return child
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
                        change.newValue = resolveLinks(change.newValue)
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
                        change.prevValue = resolveLinks(change.prevValue)
	                    tobeRemoved = missingEntries(change.prevValue, change.newValue)
                        let newValue = change.newValue.map(v => {
                            if (v.$mark=='inserted') {
                                v = addChild(v, entity)
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
                        let changedValue  = newValue.map(e => e.id)
                        let appliedArray  = applyValues(completeArray, prevValue, changedValue)
                        entity[prop]      = appliedArray.map(id => fromIndex(id))
                        if (!entity.unreleased) { // changes in arrays always result in marking released entities dirty
                            entity.dirty = true
                        }

                        // change root. find remaining roots of any tobeRemoved entities
                        // for each root, walk until you find tobeRemoved item, if not, remove root
                        for (let child of tobeRemoved) {
                            updateRoot(child)
                            removeParent(child, entity)
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
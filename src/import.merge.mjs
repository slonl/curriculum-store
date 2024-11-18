import * as odJSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'
import JSONTag from '@muze-nl/jsontag'
import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from '@muze-nl/jaqt'
import applyValues from 'array-apply-partial-diff'
import { appendFileSync } from 'fs'

// TODO: frontend already checks for inconsistent properties - should this code do that as well?

function log(message) {
	appendFileSync(process.cwd()+'/data/import-log.txt', message+"\n")
}

/**
 * Imports an entity, with all its children. Merges changes in existing entities.
 * Adds new entities. If importedRoot is set, all entity.root sets are updated with
 * this root, for all children.
 */
export function importEntity(importedEntity, importedRoot, dataspace, meta)
{
    if (!meta.schema) {
        throw new Error('No schemas loaded')
    }
	if (!importedEntity.id) {
		if (!importedEntity.uuid) {
			throw new Error('imported entity missing id', { cause: importedEntity })
		}
		importedEntity.id = importedEntity.uuid
		delete importedEntity.uuid
	} else if (importedEntity.id.substring(0,6)=='/uuid/') {
		importedEntity.id = importedEntity.id.substring(6)
	}
	log('importing entity '+importedEntity.id)

	/**
	 * Tests if all entities match their schema's
	 * changed e.uuid to e.id property
	 */
	function testImportedEntities()
	{
	    walkTopDown(importedEntity, e => {
	    	let type = odJSONTag.getAttribute(e, 'class')
	    	if (!type) {
		    	type = e['@type']
		    }
	    	if (!type) {
	    		throw new Error('No @type given', {cause: e})
	    	}
	    	if (!meta.schema.types[type]) {
	    		throw new Error('Unknown type '+type, {cause: e})
	    	}
	        Object.keys(e).forEach(property => {
	            if (isTemporaryProperty(property)) {
	                // ignore these, will be removed by appendEntity
	            } else if (isLiteralProperty(property)) {
	                if (property==='uuid') {
	                    property = 'id'
	                    e.id=e.uuid
	                    delete e.uuid
	                }
	                if (property==='niveaus') { // list of Niveau titles, replace with actual Niveaus
	                	e.Niveau = from(dataspace.Niveau)
                        .where({
                            title: anyOf(...e.niveaus)
                        })
                        delete e.niveaus
                        return
	                }
	                if (!meta.schema.types[type]?.properties[property]) {
	                    throw new Error('Unknown property '+type+'.'+property, {cause:e})
	                }
	            } else if (isChildRelation(property)) {
	                if (!meta.schema.types[type]?.children[property]) {
	                    throw new Error('Unknown child relation '+type+'.'+property,{cause:e})
	                }
	                if (!Array.isArray(e[property])) {
	                    if (meta.schema.types[type]?.properties[property]?.type!='object') {
	                        throw new Error('Child relation '+type+'.'+property+' must be an array',{cause:e})
	                    }
	                }
	            } else {
	            	throw new Error('Unknown property name '+type+'.'+property, {cause: e})
	            }
	        })
	    })
	}

	/**
	 * Replaces importedEntities with the existing entities, if available
	 * Merges the changes, appends new root entries to their roots
	 */
	function linkImportedEntities()
	{
		let changeCount = 0

	    /**
	     * 
	     */
	    function MergeIfNeeded(importedEntity) {
	    	let isChanged = false
            let id = importedEntity.id
	        if (id) {
	            let storedEntity = fromIndex(id)
	            if (storedEntity) {
	                if (mergeImportedEntity(importedEntity, storedEntity)) {
	                	log('change detected in '+storedEntity.id)
	                	isChanged = true
	                }
	                // if (registerRoot(storedEntity, importedRoot)) {
	                // 	log('root change detected in '+storedEntity.id)
	                // 	isChanged = true
	                // }
                	return [isChanged, storedEntity]
	            }
	        }
	        return [isChanged, importedEntity]
	    }

	    walkDepthFirst(importedEntity, (importedEntity) => {
	    	log('walking to '+importedEntity.id)
	        Object.keys(importedEntity).forEach(property => {
	            if (isChildRelation(property)) {
	                if (!Array.isArray(importedEntity[property])) {
	                	let [changed, newEntity] = MergeIfNeeded(importedEntity[property])
	                    if (changed) {
	                    	changeCount++
	                    }
	                    if (newEntity!=importedEntity[property]) { 
	                    	importedEntity[property] = newEntity
	                    }
	                } else {
	                    importedEntity[property].forEach((importedChild,i) => {
	                    	let [changed, newEntity] = MergeIfNeeded(importedChild)
	                    	if (changed) {
	                    		changeCount++
	                    	}
	                    	if (newEntity!=importedChild) {
	                    		importedEntity[property][i] = newEntity
	                    	}
	                    })
	                }
	            }
	        })
	    })

	    // handle root here, walk only walks over child entities
	    let current = fromIndex(importedEntity.id)
	    if (current) {
	    	log('merging '+importedEntity.id)
	    	if (mergeImportedEntity(importedEntity, current)) {
	    		log('change detected '+current.id)
	    		changeCount++
	    	} else {
	    		log('no change')
	    	}
	    	// if (importedRoot) {
	    	// 	log('register root '+importedRoot)
		    // 	registerRoot(current, importedRoot)
		    // }
	    	// from here on, use the merged storedEntity instead of 
	    	// the importedEntity
		    importedEntity = current
		}
	    return changeCount
	}

	/**
	 * Merges properties and child links from importedEntity into existing storedEntity
	 * Handles special values like '' and '-'.
	 * (TODO) Tests that values have the correct type and that required values
	 * are not deleted.
	 * Ignores any properties that are temporary, e.g. '@type' 
	 * Sets the storedEntity.dirty flag to true, if any changes have been applied
	 * Must be called depth first, so all child entities have been merged already
	 */
	function mergeImportedEntity(importedEntity, storedEntity)
	{
		let changed = false
		// for all lowercase properties in importedEntity
		for (let property of Object.keys(importedEntity)) {
			if (isLiteralProperty(property)) {
				// set these in storedEntity
				switch(importedEntity[property]) {
					case '-':
						// handle '-' as delete this property
						// TODO: check that property is not required
						delete storedEntity[property]
						changed = true
					break
					case '':
						// handle '' as keep this property
					break
					default:
						// TODO: make sure the type of value is correct according to the schema
						// only update storedEntity if there is an actual change
						if (storedEntity[property]!==importedEntity[property]) {
							if (typeof importedEntity[property] == 'string') {
								// only mark dirty if the change is other than whitespace
								let stored = storedEntity[property].replace(/\s+/g, '')
								let imported = importedEntity[property].replace(/\s+/g, '')
								log(property+' stored '+stored+'; new '+imported)
								storedEntity[property] = importedEntity[property]
								if (stored !== imported) {
									changed = true
									log('updated '+property+' on '+storedEntity.id)
								}
							} else {
								storedEntity[property] = importedEntity[property]
								changed = true
								log('updated '+property+' on '+storedEntity.id)
							}
						}
					break
				}
			} else if (isChildRelation(property)) {
				const newValue = mergeChildRelations(importedEntity[property], storedEntity, property)
				if (newValue) {
					storedEntity[property] = newValue
					changed = true
					log('updated child property '+property+' on '+storedEntity.id)
				}
			}
		}
		if (changed) {
			storedEntity.dirty = true
			log('dirty set on '+storedEntity.id)
		}
		return changed
	}

	let removedChildren = new Set()
	/**
	 * merges existing entity property with newValue, if needed
	 * newValue must contain entities that have already been stored
	 * only returns an array if entity[property] must be updated
	 */
	function mergeChildRelations(newValue, entity, property)
	{
		const currentValue = entity[property]
	    if (Array.isArray(newValue) || Array.isArray(currentValue)) {
		    if (!currentValue || !Array.isArray(currentValue)) {
		        // in case this is the first new child of this type
		        currentValue = []
		    }
		    if (!newValue || !Array.isArray(newValue)) {
		    	throw new Error('Expected property '+property+' to be an array', {cause: newValue})
		    }
		    let changed = false
		    let tobeRemoved = missingEntries(currentValue, newValue)
		    if (tobeRemoved.length) {
		    	log('tobeRemoved '+JSONTag.stringify(tobeRemoved))
		    	changed = true
		    } else {
			    let tobeAdded   = addedEntries(currentValue, newValue)
			    if (tobeAdded.length) {
			    	changed = true
			    } else {
				    let reordered   = orderChanges(currentValue, newValue)
				    if (reordered.length) {
				    	changed = true
				    }
				}
			}
			if (changed) {
			    let currentSet  = currentValue.map(e => e.id) || []
			    let newSet      = newValue.map(e => e.id)
			    let appliedSet  = applyValues(currentSet, currentSet, newSet)
			    newValue        = appliedSet.map(id => fromIndex(id))
			    log('merge child array: was: '
			    		+currentValue.map(e => e.id).join(',')
			    		+' remove '+(tobeRemoved.join(',')
			    		+'; now '+newValue.map(e => e.id).join(',')))
			    // change root. find remaining roots of any tobeRemoved entities
			    // for each root, walk until you find tobeRemoved item, if not, remove root
			    for (let childId of tobeRemoved) {
			    	removedChildren.add(childId)
			    	removeParent(fromIndex(childId), entity)
			    }
			    return newValue
			}
		} else if (currentValue?.id!=newValue?.id) {
			log('merge child relations non array '+currentValue.id+':'+newValue.id)
			return newValue
		}
	}

	/**
	 * Walks over the tree from importedEntity, from the root down
	 * Each entity that is not yet in the index (so a new entity)
	 * is added to the dataspace and meta indexes
	 * returns a count of new entities added
	 */
	function appendNewEntities()
	{
		let newCount = 0
		log('appendNewEntities '+importedEntity.id)
		walkDepthFirst(importedEntity, entity => {
			Object.keys(entity).forEach(property => {
				if (isChildRelation(property)) {
					if (Array.isArray(entity[property])) {
						entity[property].forEach((child, index, arr) => {
							if (!hasIndex(child.id)) {
								arr[index] = addEntity(child, dataspace, meta)
								newCount++
							}
						})
					} else {
						const child = entity[property]
						if (!hasIndex(child.id)) {
							entity[property] = addEntity(child, dataspace, meta)
							newCount++
						}
					}
				}
			})
		})
		return newCount
	}

	function linkParentProperties()
	{
		const linkParent = (child, parent) => {
			log('linkParent '+child.id+' '+parent.id)
			let updated = false
			child = fromIndex(child.id)
			parent = fromIndex(parent.id)
			const parentType = odJSONTag.getAttribute(parent, 'class');
			if (!parentType) {
				throw new Error('parent '+parent.id+' has no class attribute')
			}
			if (typeof child[parentType] === 'undefined') {
				Object.defineProperty(child, parentType, {
					value: [],
					enumerable: false,
					writable: true,
					configurable: true
				})
				updated = true
				log('added parent property '+parentType+' to child '+child.id)
			}
			if (child[parentType].indexOf(parent)===-1) {
				child[parentType].push(parent)
				updated = true
				log('added parent '+parent.id+' to child '+child.id)
			}
			return updated
		}

		let updated = 0
		walkDepthFirst(importedEntity, entity => {
			Object.keys(entity).forEach(property => {
				if (isChildRelation(property)) {
					if (Array.isArray(entity[property])) {
						log('linkParentCall '+entity.id+' '+property)
						log(JSON.stringify(entity[property].map(e => e.id)))
						entity[property].forEach(child => {
							if (linkParent(child, entity)) {
								updated++
							}
						})
					} else {
						log('linkParentCall single '+entity.id+' '+entity[property]?.id)
						if (linkParent(entity[property], entity)) {
							updated++
						}
					}
				}
			})
		})
		return updated
	}

	function updateNiveauIndex(entity)
	{
		const type = odJSONTag.getAttribute(entity, 'class')
		if (!meta.schema.types[type]) {
			throw new Error('Unknown type '+type)
		}
		const children = meta.schema.types[type].children
		let niveaus = []
		Object.keys(children).forEach(childType => {
			if (childType=='Vakleergebied') {
				return // don't handle Vakleergebied as parent or child
			}
			if (Array.isArray(entity[childType])) {
				niveaus.push(entity[childType].map(child => updateNiveauIndex(child)))
			}
		})
		// don't add existing entity.NiveauIndex, as child entities may have disappeared
		if (entity.Niveau) {
			niveaus.push(entity.Niveau)
		}
		niveaus = flatten(niveaus).filter(Boolean)
		if (niveaus.length && typeof entity.NiveauIndex === 'undefined') {
			entity.NiveauIndex = []
			// NOTE: do not make NiveauIndex non-enumerable - or it won't show up in the tree query
			// Object.defineProperty(entity, 'NiveauIndex', {
			// 	value: [],
			// 	enumerable: false,
			// 	writable: true,
			// 	configurable: true
			// })
		}
		if (niveaus.length || entity.NiveauIndex) {
			niveaus = niveaus.filter(n => entity.NiveauIndex.findIndex(ni => ni.id==n.id)===-1)
			entity.NiveauIndex.splice(entity.NiveauIndex.length, 0, ...niveaus)
			return entity.NiveauIndex
		}
		return []
	}

	/**
	 * returns a stored entity by id (only uuid)
	 */
    function fromIndex(id)
    {
        return meta.index.id.get('/uuid/'+id)?.deref()
    }

    /**
     * returns true if an entity with that uuid is in the dataspace
     */
    function hasIndex(id)
    {
        return meta.index.id.has('/uuid/'+id)
    }

	// checks that all entities are valid, throws error otherwise
	testImportedEntities()

	// merges changed entities, replaces imported entities with their (updated) stored versions
	let updatedCount = linkImportedEntities()

	// adds new entities to the indexes and their type array (e.g. data.Vakleergebied)
	let newCount = appendNewEntities()
	
	// make sure the reverse/parent properties have the new parents
	log('updated before linkParentProperties '+updatedCount)
	updatedCount += linkParentProperties()
	log('updated after linkParentProperties '+updatedCount)

	// new children with niveaus may have been imported, or existing children removed
	updateNiveauIndex(importedEntity)

	// add importedRoot entries to all children, if set
    if (Array.isArray(importedRoot) && importedRoot.length) {
    	importedRoot.forEach((r,i) => {
    	   	let existingRoot = fromIndex(r.id)
	    	if (existingRoot) {
		    	importedRoot[i] = existingRoot
	    	} else {
	    		importedRoot[i] = null
	    	}
	    })
		updatedCount += updateRoots(importedEntity, importedRoot)
    }
    // remove roots that no longer link (indirectly) to removed children from them
    for (let childId of removedChildren) {
    	if (updateRoot(fromIndex(childId))) {
    		updatedCount++
    	}
    }

	log('done importing '+importedEntity.id+' ['+updatedCount+','+newCount+']')
	return [updatedCount,newCount]

	log('done')
}


/**
 * Each import command has a single root entity
 * This makes sure that the root[] property of an entity
 * is available and updated with that root.
 */
export function registerRoot(entity, roots) {
    if (typeof entity.root === 'undefined') {
        Object.defineProperty(entity, 'root', {
            value: [],
            enumerable: false,
            configurable: true,
            writable: true
        })
    }
    if (!Array.isArray(roots)) {
    	roots = [roots]
    }
   	roots.forEach(root => {
   		if (entity.root.indexOf(root)===-1) {
   			log('adding root entity '+root.id+' to entity '+entity.id)
   			entity.root.push(root)
   			return true
    	}
    })
}

function updateRoots(node, roots) {
	let updated = 0
	walkTopDown(node, node => {
		if (registerRoot(node, roots)) {
			updated++
		}
	})
	return updated
}

function walkDepthFirst(node, callback) {
    Object.keys(node).forEach(property => {
        if (isChildRelation(property)) {
            if (!Array.isArray(node[property])) {
                walkDepthFirst(node[property], callback)
            } else {
                node[property].forEach(n => walkDepthFirst(n, callback))
            }
        }
    })
    callback(node)
}

function walkTopDown(node, callback) {
    callback(node)
    Object.keys(node).forEach(property => {
        if (isChildRelation(property)) {
            if (!Array.isArray(node[property])) {
                walkTopDown(node[property], callback)
            } else {
                node[property].forEach(n => walkTopDown(n, callback))
            }
        }
    })
}

export function isChildRelation(property) {
	return /[A-Z]/.test(property[0])
}

export function isLiteralProperty(property) {
	return /[a-z_]/.test(property[0])
}

export function isTemporaryProperty(property) {
	return property[0]=='$' || property[0]=='@'
}

export function flatten(arr) {
    let result = new Set()
    arr.forEach(v => {
        if (Array.isArray(v)) {
            flatten(v).forEach(v => result.add(v))
        } else {
            result.add(v)
        }
    })
    return Array.from(result)
}

export function missingEntries(a, b) {
    return a?.map(e => e.id).filter(x => !b?.map(e => e.id).includes(x))
}

export function addedEntries(a, b) {
    return b?.map(e => e.id).filter(x => !a?.map(e => e.id).includes(x))
}

export function orderChanges(a, b) {
	return a?.map(e => e.id).join(',') != b?.map(e => e.id).join(',')
}

export function updateRoot(child)
{
    if (!child.root) {
//        throw new Error('child has no root '+JSON.stringify(child))
        return false
    }
    let updated = false
    let roots = child.root.slice()
    let childType = odJSONTag.getAttribute(child, 'class')
    if (!childType) {
        throw new Error('No child type found', {details: child})
    }
    for (let root of child.root) {
        if (!findChild(root, child, childType)) {
            roots.splice(roots.indexOf(root),1)
            updated++
        }
    }
    child.root = roots
    if (child.root.length==0 && !child.deleted) {
        child.deleted = true // mark for deprecation
        updated++
    }
    return updated
}

export function findChild(root, child, type) {
    // walk over children of root untill you find child
    // naive implementation
    if (root[type]?.includes(child)) {
        return true
    }
    for (let prop of Object.keys(root)) {
        if (isChildRelation(prop)) {
        	if (Array.isArray(root[prop])) {
	            for (let node of root[prop]) {
	                if (!node) {
	                    continue //Tag contains null
	                }
	                if (findChild(node, child, type)) {
	                    return true
	                }
	            }
	        } else {
	        	return root[prop]==child
	        }
        }
    }
    return false
}

export function removeParent(child, parent) {
	const parentType = odJSONTag.getAttribute(parent, 'class')
	log('removing parent '+parentType+' '+parent.id+' from '+child.id)
    child[parentType] = child[parentType].filter(e => e.id!=parent.id)
    if (child[parentType].length==0) {
        delete child[parentType]
    }
}

/**
 * Adds a single new stored entity based on the imported entity
 */
export function addEntity(entity, dataspace, meta)
{
	/**
	 * returns a stored entity by id (only uuid)
	 */
    function fromIndex(id)
    {
        return meta.index.id.get('/uuid/'+id)?.deref()
    }

    /**
     * returns true if an entity with that uuid is in the dataspace
     */
    function hasIndex(id)
    {
        return meta.index.id.has('/uuid/'+id)
    }

	const current = fromIndex(entity.id)
	if (current) {
		return current // entity has already been added
	}
	const type = entity['@type']
	for (let key in entity) {
        if (key[0]=='@' || key[0]=='$') {
            delete entity[key]
        }
    }
    entity.unreleased = true
    log('adding entity '+JSON.stringify(entity))
    dataspace[type].push(entity)
    entity = dataspace[type][dataspace[type].length-1]
    try {
        odJSONTag.setAttribute(entity, 'class', type)
        log('set class '+type+' on '+entity.id)
    } catch(e) {
        throw new Error(e.message+' class '+JSON.stringify(type)+' '+entity.id)
    }
    try {
        odJSONTag.setAttribute(entity, 'id', '/uuid/'+entity.id)
    } catch(e) {
        throw new Error(e.message+' id '+JSON.stringify(entity))
    }
    meta.index.id.set('/uuid/'+entity.id, entity)
    log('added /uuid/'+entity.id)
    return meta.index.id.get('/uuid/'+entity.id)
}

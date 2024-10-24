import * as JSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'
import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from '@muze-nl/jaqt'
import applyValues from 'array-apply-partial-diff'

// TODO: frontend already checks for inconsistent properties - should this code do that as well?

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

	/**
	 * Tests if all entities match their schema's
	 * changed e.uuid to e.id property
	 */
	function testImportedEntities()
	{
	    walkTopDown(importedEntity, e => {
	    	if (!e['@type']) {
	    		throw new Error('No @type given', {cause: e})
	    	}
	    	if (!meta.schema.types[e['@type']]) {
	    		throw new Error('Unknown type '+e['@type'], {cause: e})
	    	}
	    	const type = e['@type']
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
	                if (!meta.schema.types[type]?.propertyerties[property]) {
	                    throw new Error('Unknown property '+type+'.'+property, {cause:e})
	                }
	            } else if (isChildRelation(property)) {
	                if (!meta.schema.types[type]?.children[property]) {
	                    throw new Error('Unknown child relation '+type+'.'+property,{cause:e})
	                }
	                if (!Array.isArray(e[property])) {
	                    if (meta.schema.types[type]?.propertyerties[property]?.type!='object') {
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

	    // make sure importedRoot is a storedNode or will be soon
	    if (importedRoot) {
	    	let existingRoot = fromIndex(importedRoot.id)
	    	if (existingRoot) {
		    	importedRoot = existingRoot
		    }
	    }
	    // handle root here, walk only walks over child entities
	    let current = fromIndex(importedEntity.id)
	    if (current) {
	    	if (mergeImportedEntity(importedEntity, current)) {
	    		changeCount++
	    	}
	    	if (importedRoot) {
		    	registerRoot(current, importedRoot)
		    }
	    }

	    function MergeIfNeeded(importedEntity) {
	    	let isChanged = false
            let id = importedEntity.id
	        if (id) {
	            let storedEntity = fromIndex(id)
	            if (storedEntity) {
	                if (mergeImportedEntity(importedEntity, storedEntity)) {	                	
	                	isChanged = true
	                }
	                if (registerRoot(storedEntity, importedRoot)) {
	                	isChanged = true
	                }
	                if (isChanged) {
	                	return storedEntity
	                }
	            }
	        }
	    }

	    walkDepthFirst(importedEntity, (importedEntity) => {
	        Object.keys(importedEntity).forEach(property => {
	            if (isChildRelation(property)) {
	                if (!Array.isArray(importedEntity[property])) {
	                	let storedEntity = MergeIfNeeded(importedEntity[property])
	                    if (storedEntity) {
	                    	changeCount++
	                    	importedEntity[property] = storedEntity
	                    }
	                } else {
	                    importedEntity[property].forEach((importedChild,i) => {
	                    	let storedEntity = MergeIfNeeded(importedChild)
	                    	if (storedEntity) {
	                    		changeCount++
	                    		importedEntity[property][i] = storedEntity
	                    	}
	                    })
	                }
	            }
	        })
	    })
	    if (current) {
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
	 */
	function mergeImportedEntity(importedEntity, storedEntity)
	{
		let changed = false
		// for all lowercase propertyerties in importedEntity
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
							storedEntity[property] = importedEntity[property]
							changed = true
						}
					break
				}
			} else if (isChildRelation(property)) {
				const newValue = mergeChildRelations(importedEntity[property], storedEntity, property)
				if (newValue) {
					storedEntity[property] = newValue
					changed = true
				}
			}
		}
		if (changed) {
			storedEntity.dirty = true
		}
		return changed
	}

	function mergeChildRelations(newValue, entity, property) {
		const currentValue = entity[property]
	    if (Array.isArray(newValue) || Array.isArray(currentValue)) {
		    if (!currentValue || !Array.isArray(currentValue)) {
		        // in case this is the first new child of this type
		        currentValue = []
		    }
		    if (!newValue || !Array.isArray(newValue)) {
		    	throw new Error('Expected property '+property+' to be an array', {cause: newValue})
		    }
		    let tobeRemoved = missingEntries(currentValue, newValue)
		    let currentSet  = currentValue.map(e => e.id) || []
		    let newSet      = newValue.map(e => e.id)
		    let appliedSet  = applyValues(currentSet, currentSet, newSet)
		    newValue        = appliedSet.map(id => fromIndex(id))

		    // change root. find remaining roots of any tobeRemoved entities
		    // for each root, walk until you find tobeRemoved item, if not, remove root
		    for (let child of tobeRemoved) {
		    	updateRoot(child)
		    	removeParent(child, entity)
		    }
		    return newValue
		} else if (currentValue!=newValue) {
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
		walkDepthFirst(importedEntity, entity => {
			Object.keys(entity).forEach(property => {
				if (isChildRelation(property)) {
					if (Array.isArray(entity[property])) {
						entity[property].forEach((child, index, arr) => {
							if (!hasIndex(child.id)) {
								arr[index] = addEntity(child, dataspace, meta)
							    registerRoot(arr[index], importedRoot)
								newCount++
							}
						})
					} else {
						const child = entity[property]
						if (!hasIndex(child.id)) {
							entity[property] = addEntity(child, dataspace, meta)
							registerRoot(entity[property], importedRoot)
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
			const parentType = JSONTag.getAttribute(parent, 'class');
			if (typeof child[parentType] === 'undefined') {
				Object.defineProperty(child, parentType, {
					value: [],
					enumerable: false
				})
			}
			if (child[parentType].indexOf(parent)===-1) {
				child[parentType].push(parent)
			}
		}

		walkDepthFirst(importedEntity, entity => {
			Object.keys(entity).forEach(property => {
				if (isChildRelation(property)) {
					if (Array.isArray(entity[property])) {
						entity[property].forEach(child => {
							linkParent(child, entity)
						})
					} else {
						linkParent(entity[property], entity)
					}
				}
			})
		})
	}

	function updateNiveauIndex(entity)
	{
		const type = JSONTag.getAttribute(entity, 'class')
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
		entity.NiveauIndex = niveaus
		return niveaus
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
	linkParentProperties()

	// new children with niveaus may have been imported, or existing children removed
	updateNiveauIndex(importedEntity)

	return [updatedCount,newCount]
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
   			entity.root.push(root)
   			return true
    	}
    })
}

function walkDepthFirst(node, callback) {
    Object.keys(node).forEach(property => {
        if (isChildRelation(property)) {
            if (!Array.isArray(node[property])) {
                walk(node[property], callback)
            } else {
                node[property].forEach(n => walk(n, callback))
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
                walk(node[property], callback)
            } else {
                node[property].forEach(n => walk(n, callback))
            }
        }
    })
}

export function isChildRelation(property) {
	return /[A..Z]/.test(property[0])
}

export function isLiteralProperty(property) {
	return /[a..z_]/.test(property[0])
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
    return a.filter(x => !b.includes(x))
}

export function addedEntries(a, b) {
    return b.filter(x => !a.includes(x))
}

export function updateRoot(child)
{
    if (!child.root) {
        throw new Error('child has no root '+JSON.stringify(child))
    }
    let roots = child.root.slice()
    let childType = JSONTag.getAttribute(child, 'class')
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
	const parentType = JSONTag.getAttribute(entity, 'class')
    child[parentType] = child[parentType].filter(e => e.id!=parent.id)
    if (child[parentType].length==0) {
        delete child[entityType]
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
    dataspace[type].push(entity)
    entity = dataspace[type][dataspace[type].length-1]
    try {
        JSONTag.setAttribute(entity, 'class', type)
    } catch(e) {
        throw new Error(e.message+' class '+JSON.stringify(type)+' '+entity.id)
    }
    try {
        JSONTag.setAttribute(entity, 'id', '/uuid/'+entity.id)
    } catch(e) {
        throw new Error(e.message+' id '+JSON.stringify(entity))
    }
    meta.index.id.set('/uuid/'+entity.id, entity)
    return entity
}

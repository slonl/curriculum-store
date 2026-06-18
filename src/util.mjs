import JSONTag from '@muze-nl/jsontag'

export function getParents(entity, meta) {
	const parentTypes = Object.getOwnPropertyNames(entity)
	.filter(prop => meta.schema.types[prop])
	.filter(prop => !Object.getOwnPropertyDescriptor(entity, prop).enumerable)

	let result = new Set()	
	for (const parentType of parentTypes) {
		if (Array.isArray(entity[parentType])) {
			for (const parent of entity[parentType]) {
				result.add(parent)
			}
		} else if (entity[parentType]) {
			result.add(parent)
		}
	}
	return Array.from(result)
}

export function getChildren(entity, meta) {
	const datatype = JSONTag.getAttribute(entity, 'class')
	const childTypes = meta.schema.types[datatype]?.children
	if (!childTypes) {
		return []
	}
	let result = new Set()
	for (const childType in childTypes) {
		if (Array.isArray(entity[childType])) {
			for (const child of entity[childType]) {
				result.add(child)
			}
		} else if (entity[childType]) {
			result.add(entity[childType])
		}
	}
	return Array.from(result)
}

/**
 * This function requires that the data is a DAG, so doen't contain cycles
 * Dive will walk over the graph, from entity up through all its parents calling callbackUp
 * untill there either are no more parents, or all parents have returned
 * a truthy result
 * Then it walks back along the same path and runs callbackDown
 */
export function dive(entity, meta, callbackUp=null, callbackDown=null) {
	let found = []
	if (callbackUp) {
		for (const parent of getParents(entity, meta)) {
			let result = callbackUp(parent)
			if (!result) {
				if (parent.id==entity.id) {
					console.error('entity',entity.id,'has itself as parent')
					process.exit()
				}
				result = dive(parent, meta, callbackUp, callbackDown)
			}
			if (result) {
				found = found.concat(result)
			}
		}
	}
	if (callbackDown) {
		callbackDown(entity, found)
	}
	return found
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
    return Array.from(result).filter(Boolean)
}

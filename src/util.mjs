export function getParents(entity) {
	const parentTypes = Object.getOwnPropertyNames(entity)
	.filter(prop => meta.types.includes(prop))
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
	const datatype = JSONTag.getAttribute('class', entity)
	const childTypes = meta.types[datatype]?.children
	if (!childTypes) {
		return []
	}
	let result = new Set()
	for (const childType of childTypes) {
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
export function dive(entity, callbackUp=null, callbackDown=null) {
	let found = []
	if (callbackUp) {
		for (const parent of getParents(entity)) {
			let result = callbackUp(parent)
			if (!result) {
				result = dive(parent, callbackUp, callbackDown)
			}
			if (result) {
				found = found.concat(result)
			}
		}
	}
	found = new Set(found)
	if (callbackDown) {
		callbackDown(entity, found)
	}
	return found
}
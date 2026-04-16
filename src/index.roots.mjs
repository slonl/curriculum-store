import JSONTag from '@muze-nl/jsontag'
import {dive} from './util.mjs'

export function createRootIndex(data, meta) {
	Object.keys(meta.index.id).forEach(id => {
		const entity = meta.index.id.get(id)?.deref()
    	updateRoots(entity) //note: this is inefficient
	}
}

export function updateRootIndex(data, meta, changes) {
	for (const entity of changes) {
		updateRoots(entity)
	}
}


/**
 * makes sure that the root property of this entity is correct
 * removes any roots that are no longer listed in its parents
 * adds any roots that are now available in its parents
 * so this must recurse from the child to the root
 * or at least untill all parents have up-to-date roots
 */
function updateRoots(entity) {
    if (!entity || !entity.id) {
        return
    }
    dive(entity, (e) => {
    	// going up untill e is a root
    	const datatype = JSONTag.getAttribute(e, 'class')
    	const root = meta.types[datatype]?.root
    	if (root) {
    		return [e]
    	}
    }, (e, roots) => {
	    if (typeof e.root === 'undefined') {
	        Object.defineProperty(e, 'root', {
	            value: [],
	            enumerable: false
	        })
	    }
       	e.root = Array.from(roots)
    })
}
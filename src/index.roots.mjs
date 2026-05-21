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
		if (entity[previous]) {
			updateChildRoots(entity)
		} else {
			updateRoots(entity)
		}
	}
}

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

function updateChildRoots(entity) {
	const currChildren = getChildren(entity)
	const prevChildren = getChildren(entity[previous])
	prevChildren.forEach(child => {
		if (!currChildren.has(child)) {
			updateRoots(child)
			//FIXME: and do this for all descendants....
			// which is killing for performance, since each descendant would need to fetch all possible roots again
			// so - step 1: figure out if this child.root has changed (is a root no removed)
			// if so - find all current descendants from this root (walk from root over all children)
			// then find all descendant of this child
			// if there are descendants of this child that are not in the descendants of root, make sure that
			// their root entry is uptodate (descendant.root.remove(root))
		}
	})
}
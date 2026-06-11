import JSONTag from '@muze-nl/jsontag'
import {dive, getChildren} from './util.mjs'
import {previous} from '@muze-nl/od-jsontag/src/symbols.mjs'

export default {
	create(data, meta) {
		console.log('creating root index')
		meta.index.id.keys().forEach(id => {
			const entity = meta.index.id.get(id)
	    	createRoots(entity, meta) //note: this is inefficient
		})
	},
	update(data, meta, changes) {
		for (const entity of changes) {
			if (entity[previous]) {
				updateChildRoots(entity, meta)
			} else {
				createRoots(entity, meta)
			}
		}
	}
}

function createRoots(entity, meta) {
//	console.log('root for ',entity.id)
    if (!entity || !entity.id) {
        return
    }
    dive(entity, meta, (e) => {
    	// going up untill e is a root
    	const datatype = JSONTag.getAttribute(e, 'class')
    	const root = meta.schema.types[datatype]?.root
    	if (root) {
    		return [e]
    	}
    }, (e, roots) => {
    	if (!roots?.length) {
    		return
    	}
	    if (typeof e.root === 'undefined') {
	        Object.defineProperty(e, 'root', {
	            value: [],
	            enumerable: false,
	            writable: true
	        })
	    }
       	e.root = Array.from(new Set(e.root.concat(roots)))
//    	console.log('set root of '+e.id,e.root.length)
    })
}

function updateChildRoots(entity, meta) {
	const currChildren = getChildren(entity, meta)
	const prevChildren = getChildren(entity[previous], meta)
	prevChildren.forEach(child => {
		if (!currChildren.has(child)) {
			updateRoots(child, meta)
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

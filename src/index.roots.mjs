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
	// console.log('root for ',entity.id)
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
    	defineRootProperty(e)
       	e.root = Array.from(new Set(e.root.concat(roots)))
    	// console.log('set root of '+e.id,e.root.length)
    })
}

function updateChildRoots(entity, meta) {
	const queue = []
	const seen = new Set()

	const currChildren = getChildren(entity, meta)
	const prevChildren = getChildren(entity[previous], meta)

	queue.push(entity)

	for (const child of currChildren) {
		queue.push(child)
	}
	for (const child of prevChildren) {
		queue.push(child)
	}

	while (queue.length) {
		const child = queue.shift()
		if (!child || seen.has(child)) {
			continue
		}
		seen.add(child)

		if (updateRoots(child, meta)) {
			for (const grandChild of getChildren(child, meta)) {
				queue.push(grandChild)
			}
		}
	}
}

function updateRoots(entity, meta) {
	if (!entity || !entity.id) {
		return false
	}

	const roots = findRoots(entity, meta)
	const currentRoots = Array.isArray(entity.root) ? entity.root : []

	if (!rootDiff(currentRoots, roots)) {
		return false
	}

	defineRootProperty(entity)
	entity.root = roots
	return true
}

function findRoots(entity, meta) {
	const roots = []
	const datatype = JSONTag.getAttribute(entity, 'class')

	if (meta.schema.types[datatype]?.root) {
		roots.push(entity)
	}

	dive(entity, meta, (e) => {
		const datatype = JSONTag.getAttribute(e, 'class')
		if (meta.schema.types[datatype]?.root) {
			return [e]
		}
	}).forEach(root => roots.push(root))

	return uniqueRoots(roots)
}

function defineRootProperty(entity) {
	if (typeof entity.root === 'undefined') {
		Object.defineProperty(entity, 'root', {
			value: [],
			enumerable: false,
			writable: true
		})
	}
}

function uniqueRoots(roots) {
	const seen = new Set()
	return roots.filter(root => {
		if (!root || seen.has(root)) {
			return false
		}
		seen.add(root)
		return true
	})
}

function rootDiff(a, b) {
	if (a.length !== b.length) {
		return true
	}
	const set = new Set(a)
	return b.some(root => !set.has(root))
}
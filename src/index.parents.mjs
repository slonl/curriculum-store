import JSONTag from '@muze-nl/jsontag'
import {getChildren} from './util.mjs'

export function createParentIndex(data, meta) {
	Object.keys(meta.index.id).forEach(id => {
		const entity = meta.index.id.get(id)?.deref()
		updateEntity(entity)
	})
}

export function updateParentIndex(data, meta, changes) {
	for (const entity of changes) {
		updateEntity(entity)
	}
}

function updateEntity(entity) {
	if (!entity) { return }
	// find all children that have been unlinked from this entity
	const currChildren = getChildren(entity)
	if (entity[previous]) {
		const prevChildren = getChildren(entity[previous])
		prevChildren.forEach(c => {
			if (!currChildren.has(c)) {
				unlinkParent(c, entity)
			}
		})
	}
	// now make sure all current children have a parent link back
	currChildren.forEach(c => {
		linkParent(c, entity)
	})
}

function unlinkParent(child, parent) {
	const datatype = JSONTag.getAttribute('class', parent)
	if (child[datatype]?.includes(parent)) {
		child[datatype] = child[datatype].filter(p => p!==parent)
	}
}

function linkParent(child, parent) {
	const datatype = JSONTag.getAttribute('class', parent)
	defineParentProperty(child, datatype)
	if (!child[datatype].includes(parent)) {
		child[datatype].push(parent)
	}
}

function defineParentProperty(entity, datatype) {
	if (typeof entity[datatype] === 'undefined') {
		Object.defineProperty(entity, datatype, {
			value: [],
			enumerable: false
		})
	}	
}
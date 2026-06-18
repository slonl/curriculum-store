import JSONTag from '@muze-nl/jsontag'
import {getChildren} from './util.mjs'
import {previous} from '@muze-nl/od-jsontag/src/symbols.mjs'

export default {
	create(data, meta) {
		console.log('creating parent index')
		meta.index.id.keys().forEach(id => {
			const entity = meta.index.id.get(id)
			updateEntity(entity, meta)
		})
	},
	update(data, meta, changes) {
		for (const entity of changes) {
			updateEntity(entity, meta)
		}
	}
}

let indent = 0
let spaces = ' '.repeat(100)

function updateEntity(entity, meta) {
	if (!entity) { return }
	// find all children that have been unlinked from this entity
	const currChildren = getChildren(entity, meta)
	//console.log(spaces.substring(0,indent)+'update parents for '+entity.id,currChildren.length)
	if (entity[previous]) {
		const prevChildren = getChildren(entity[previous], meta)
		prevChildren.forEach(child => {
			if (!currChildren.includes(child)) {
				unlinkParent(child, entity)
			}
		})
	}
	// now make sure all current children have a parent link back
	indent++
	currChildren.forEach(child => {
		if (!child) {
			console.error('broken children: ',entity.id)
			console.log(currChildren)
			process.exit()
		}
		linkParent(child, entity)
	})
	indent--
}

function unlinkParent(child, parent) {
	const datatype = JSONTag.getAttribute(parent, 'class')
	if (child[datatype]?.includes(parent)) {
		child[datatype] = child[datatype].filter(p => p!==parent)
	}
}

function linkParent(child, parent) {
	// console.log(spaces.substring(0,indent)+'linking parent '+parent.id+' to '+child.id)
	if (child.id==parent.id) {
		console.error('refusing to link parent to itself',parent.id)
		process.exit()
	}
	const datatype = JSONTag.getAttribute(parent, 'class')
	defineParentProperty(child, datatype)
	if (!child[datatype].includes(parent)) {
		child[datatype].push(parent)
	}
}

function defineParentProperty(entity, datatype) {
	if (typeof entity[datatype] === 'undefined') {
		Object.defineProperty(entity, datatype, {
			value: [],
			enumerable: false,
			configurable: true,
			writable: true
		})
	}	
}
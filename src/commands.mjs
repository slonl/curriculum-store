import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from 'jaqt'
import JSONTag from '@muze-nl/jsontag'
import {source,isProxy} from '@muze-nl/od-jsontag/src/symbols.mjs'

function findChild(root, child, type) {
	// walk over children of root untill you find child
	// naive implementation
	if (root[type]?.includes(child)) {
		return true
	}
	for (let prop of Object.keys(root)) {
		if (/^[A-Z]/.test(prop)) {
			for (let node of root[prop]) {
				if (!node) {
					continue //Tag contains null
				}
				if (findChild(node, child, type)) {
					return true
				}
			}
		}
	}
	return false
}

export default {
	patch: (dataspace, command, request, meta) => {
		function fromIndex(id) {
			return meta.index.id.get('/uuid/'+id)?.deref()
		}
		function hasIndex(id) {
			return meta.index.id.has('/uuid/'+id)
		}
		// changeHistory is command.value
		if (!Array.isArray(command.value)) {
			throw new Error('Patch: Invalid value, must be an array')
		}
		let updatedEntities = 0
		if (!command.value.length) {
			return updatedEntities
		}
		let errors = []
		let localIds = new Map()

		function missingEntries(a, b) {
			return a.filter(x => !b.includes(x))
		}

		function addedEntries(a, b) {
			return b.filter(x => !a.includes(x))
		}

		function sortByOrder(order, currValue) {
			let holes = []
			let sortValue = []
			let i=0
			for(let v of currValue) {
				if (order.indexOf(v)==-1) {
					holes.push(i)
				} else {
					sortValue.push(v)
				}
				i++
			}
			let sortByObject = (order.reduce((obj,item,index) => { return { ...obj, [item]:index }}, {}))
			sortValue.sort((a,b) => sortByObject[a] - sortByObject[b])
			let nextValue = []
			let currIndex = 0
			for (let hole of holes) {
				while (hole>=currIndex && currIndex<sortValue.length) {
					nextValue.push(sortValue[currIndex])
					currIndex++
				}
				nextValue.push(currValue[hole])
			}
			while (currIndex<sortValue.length) {
				nextValue.push(sortValue[currIndex])
				currIndex++
			}
			return nextValue
		}

		function resolveLinks(arr) {
			arr = arr.map(v => {
				if (v instanceof JSONTag.Link) {
					if (meta.index.has(v.value)) {
						return meta.index.get(v.value).deref()
					}
				}
				return v
			})
		}

		function addEntity(child, parent) {
			if (!child.id) {
				if (!child.uuid) {
					throw new Error('new entity missing id and uuid')
				}
				child.id = child.uuid
				delete child.uuid
			} else {
				if (child.id.substring(0,6)=='/uuid/') {
					child.id = child.id.substring(6)
				}
			}
			if (hasIndex(child.id)) {
				return fromIndex(child.id)
			}
			let type = child['@type']
			let root = parent.root
			for (let key in child) {
				if (key[0]=='@') {
					delete child[key]
				}
			}
			child.unreleased = true
			try {
				JSONTag.setAttribute(child, 'id', '/uuid/'+child.id)
			} catch(e) {
				throw new Error(e.message+' id '+JSON.stringify(child))
			}
			try {
				JSONTag.setAttribute(child, 'class', type)
			} catch(e) {
				throw new Error(e.message+' class '+JSON.stringify(type))
			}
			Object.defineProperty(child, 'root', {
				configurable: true,
				writable: true,
				enumerable: false,
				value: root
			})
			let parentType = JSONTag.getAttribute(parent[source] ?? parent, 'class')
			if (!parentType) {
				throw new Error('No parent type found',{ details: [parent, parent[source]] })
			}
			Object.defineProperty(child, parentType, {
				configurable: true,
				writable: true,
				enumerable: false,
				value: [parent]
			})
			dataspace[type].push(child)

			let proxy = dataspace[type][dataspace[type].length-1]
			child = proxy
			meta.index.id.set('/uuid/'+child.id, child)
			return child
		}

		let prop, entity, currentValue

		for (let change of command.value) {
			updatedEntities++
			// apply change if possible
			entity = fromIndex(change.id)
			if (!entity) {
				errors.push({
					code: 404,
					message: `Entity not found: ${change.id}`,
					details: {
						id: change.id
					}
				})
				continue;
			}
			prop = change.property
			currentValue = entity[prop]
			if (Array.isArray(change.newValue) || Array.isArray(currentValue)) {
				if (!currentValue || !Array.isArray(currentValue)) {
					// in case this is the first new child of this type
					currentValue = []
				}
				if (!Array.isArray(change.newValue)) {
					errors.push({
						code: 406,
						message: `Property ${prop} expected to be an Array`,
						details: {
							id: change.id,
							prop,
							value: change.newValue
						}
					})
					continue;
				}
				resolveLinks(change.newValue)
				resolveLinks(change.prevValue)
				let tobeRemoved = missingEntries(change.prevValue, change.newValue)
				let tobeAdded = addedEntries(change.prevValue, change.newValue)
				currentValue = currentValue.filter(v => tobeRemoved.indexOf(v)===-1)
				for (let v of tobeAdded) {
					if (!hasIndex(v.id)) {
						v = addEntity(v, entity)
					}
					currentValue.unshift(v)
				}
				// now make sure the order of newValue matches that of currentValue
				// ignore any values that aren't in newValue
				// FIXME: this doesn't work - inserted entries are added at the end
				let newValue = sortByOrder(change.newValue, currentValue)
				if (prop==='niveaus') { // niveaus are sent as an array of Niveau title
					prop = 'Niveau'
					newValue = from(dataspace.Niveau)
					.where({
						title: anyOf(...newValue)
					})
					//FIXME: not all niveaus may be sent with the command
					// only alter what is in the set of all niveaus for this command
				}
				entity[prop] = newValue
				if (!entity.unreleased) { // changes in arrays always result in marking released entities dirty
					entity.dirty = true
				}

				// change root. find remaining roots of any tobeRemoved entities
				// for each root, walk until you find tobeRemoved item, if not, remove root
				for (let child of tobeRemoved) {
					if (!child.root) {
						throw new Error('child has no root '+JSON.stringify(child))
					}
					let roots = child.root.slice()
					let childType = JSONTag.getAttribute(child[source] ?? child, 'class')
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

					// change {parent}, remove entity from tobeRemoved[entity[type]]
					let entityType = JSONTag.getAttribute(entity[source] ?? entity, 'class')
					child[entityType] = child[entityType].filter(e => e.id!=entity.id)
					if (child[entityType].length==0) {
						delete child[entityType]
					}
				}
			} else {
				if (currentValue && currentValue!=change.prevValue && currentValue!=change.newValue) {
					// for now this is an error, should try to merge
					errors.push({
						code: 409,
						message: `Property ${prop} has changed`,
						details: {
							id: change.id,
							prop,
							value: currentValue,
							expected: change.prevValue
						}
					})
					continue
				}
				entity[prop] = change.newValue
				if (!entity.unreleased && (typeof change.dirty=='undefined' || change.dirty==true)) {
					// only skip setting dirty on unreleased entities or if dirty is explicitly defined and falsy
					entity.dirty = true
				}
			}
		}
		if (errors.length) {
			if (errors.length===1) {
				throw errors[0]
			} else {
				throw {
					code: 400,
					message: `${errors.length} errors found`,
					details: errors
				}
			}
		}
		return updatedEntities
	}
}
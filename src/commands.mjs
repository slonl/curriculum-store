import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from 'jaqt'
import JSONTag from '@muze-nl/jsontag'
import {source,isProxy} from '@muze-nl/simplystore/src/symbols.mjs'

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
		let prop, entity, currentValue

		for (let change of command.value) {
			updatedEntities++
			// apply change if possible
			entity = meta.index.id.get(change.id)?.deref()
			if (!entity) {
				entity = localIds.get(change.id)
			}
			switch(change.type) {
				case 'insert':
					// first add the child
					let type = change.child['@type']
					change.child.id = ''+change.child.uuid
					delete change.child.uuid
					for (let key in change.child) {
						if (key[0]=='@') {
							delete change.child[key]
						}
					}
					JSONTag.setAttribute(change.child, 'id', '/uuid/'+change.child.id)
					JSONTag.setAttribute(change.child, 'class', change.property)
					Object.defineProperty(change.child, 'root', {
						configurable: true,
						writable: true,
						enumerable: false,
						value: [entity]
					})
					let entityType = JSONTag.getAttribute(entity[source] ?? entity, 'class')
					if (!entityType) {
						throw new Error('No parent type found',{ details: [entity, entity[source]] })
					}
					Object.defineProperty(change.child, entityType, {
						configurable: true,
						writable: true,
						enumerable: false,
						value: [entity]
					})
					dataspace[type].push(change.child)
					let proxy = dataspace[type][dataspace[type].length-1]
					change.child = proxy
					meta.index.id.set('/uuid/'+change.child.id, change.child)

					prop = change.property
					let updateValue = []
					for (let v of change.newValue) {
						if (JSONTag.getType(v)=='link') {
							// unresolved link
							let id = ''+v
							let ref = meta.index.id.get(id)?.deref()
							if (ref) {
								v = ref
							} else {
								throw new Error('no reference found for '+id)
							}
						}
						updateValue.push(v)
					}
					entity[prop] = updateValue
				break
				case 'undelete':
					// FIXME: undo delete, so remove entities from removed list here
				case 'delete':
					// FIXME: keep track of entities removed and check at the end if they are orphans
					// if so - mark them as deleted, will be deprecated on release
					// TODO: also update #root and #{parents}
				case 'patch':
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
					if (Array.isArray(currentValue)) {
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
						let tobeRemoved = missingEntries(change.prevValue, change.newValue)
						let tobeAdded = addedEntries(change.prevValue, change.newValue)
						currentValue = currentValue.filter(v => tobeRemoved.indexOf(v)===-1)
						for (let v of tobeAdded) {
							currentValue.push(v)
						}
						// now make sure the order of newValue matches that of currentValue
						// ignore any values that aren't in newValue
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
						// change root. find remaining roots of any tobeRemoved entities
						// for each root, walk until you find tobeRemoved item, if not, remove root
						for (let child of tobeRemoved) {
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
						if (currentValue!=change.prevValue) {
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
					}
				break
				default:
					errors.push({
						code: 405,
						message: `Patch type not supported: ${change.type}`,
						details: {
							change
						}
					})
				break
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
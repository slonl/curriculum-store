import {_,from,not,anyOf,allOf,asc,desc,sum,count,avg,max,min} from 'array-where-select'

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

		for (let change of command.value) {
			updatedEntities++
			// apply change if possible
			let entity = meta.index.id.get(change.id)?.deref()
			switch(change.type) {
				case 'insert':
throw new Error('insert not yet implemented',change)
				break
				case 'delete':
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
throw new Error('delete not yet implemented',change)
				break
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
					let prop = change.property
					let currentValue = entity[prop]
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
						}
						entity[prop] = newValue
						//TODO: update parent/root references
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
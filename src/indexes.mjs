import {createIdIndex, updateIdIndex, loadIdIndex} from 'index.id.mjs'
import {createParentIndex, updateParentIndex} from 'index.parent.mjs'
import {createNiveauIndex, updateNiveauIndex} from 'index.niveau.mjs'
import {createRootIndex, updateRootIndex} from 'index.roots.mjs'
//TODO: automatically make an offset/size index for the input od-jsontag data
const indexes = {
	id: {
		create: createIdIndex,
		update: updateIdIndex,
		load: loadIdIndex
	},
	parent: {
		create: createParentIndex,
		update: updateParentIndex
	},
	root: {
		create: createRootIndex,
		update: updateRootIndex
	},
	niveau: {
		create: createNiveauIndex,
		update: updateNiveauIndex
	}
}

export default indexes;
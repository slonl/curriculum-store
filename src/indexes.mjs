import {createIdIndex, updateIdIndex, loadIdIndex} from 'index.id.mjs'
import {createParentIndex, updateParentIndex} from 'index.parent.mjs'
import {createNiveauIndex, updateNiveauIndex} from 'index.niveau.mjs'

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
	niveau: {
		create: createNiveauIndex,
		update: updateNiveauIndex
	}
}

export default indexes;
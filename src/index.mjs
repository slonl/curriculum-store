import index from '@muze-nl/simplystore/src/index.mjs'
import parentIndex from './index.parents.mjs'
import niveauIndex from './index.niveau.mjs'
import rootIndex from './index.roots.mjs'

export default {
	create(data, meta) {
		index.create(data, meta)
		parentIndex.create(data, meta)
		rootIndex.create(data, meta)
		niveauIndex.create(data, meta)
	},
	update(data, meta, changes) {
		index.update(data, meta, changes)
		parentIndex.update(data, meta, changes)
		rootIndex.update(data, meta, changes)
		niveauIndex.update(data, meta, changes)
	},
	load(meta, uuid=null) {
		return index.load(meta, uuid)
	}
}
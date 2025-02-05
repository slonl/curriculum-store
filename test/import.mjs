import JSONTag from '@muze-nl/jsontag'
import { importEntity } from '../src/import.merge.mjs'
import { metaIdProxy } from '@muze-nl/simplystore/src/command-worker-module.mjs'
import tap from 'tap'

const metaId = new Map()

const odJSONTag = JSONTag // odJSONTag specifics arent used in these tests

const meta = {
	index: {
	},
	schema: { // dummy schema just for these tests
		types: {
			RootType: {
				properties: {
					id: true,
					prefix: true,
					title: true,
					type: true
				},
				children: {
					ChildType: true
				}
			},
			ChildType: {
				properties: {
					id: true,
					prefix: true,
					title: true,
					type: true
				},
				children: {

				}
			}
		}
	}
}

// import code needs get/forEach to return objects with deref() function
// so this implements that, can't use the simplystore implementation
// because that needs a lot of other stuff (odJSONTag etc.)
meta.index.id = {
    forEach: (callback) => {
        metaId.forEach((ref,id) => {
            callback({
                deref: () => {
                    return metaId.get(id)
                }
            },id)
        })
    },
    set: (id,ref) => {
        metaId.set(id, ref)
    },
    get: (id) => {
        let ob = metaId.get(id)
        if (ob) {
            return {
                deref: () => {
                    return ob
                }
            }
        }
    },
    has: (id) => {
        return metaId.has(id)
    }
}

const dataspace = {
	RootType: [],
	ChildType: []
}

tap.test('import tree', t => {
	// importEntity needs JSONTag class attributes
	const tree = JSONTag.parse(`
<object class="RootType" id="rootid">{
	"id":"rootid",
	"prefix":"R",
	"title":"A root entity",
	"@type": "RootType",
	"ChildType": [
		<object class="ChildType" id="child1id">{
			"id": "child1id",
			"prefix": "R/c1",
			"title": "the first child",
			"@type": "ChildType"
		}
	]
}
`)
	const [updatedCount, newCount] = importEntity(tree, [tree], dataspace, meta)
	t.equal(dataspace.RootType[0], tree)
	t.equal(dataspace.ChildType[0], tree.ChildType[0])
	t.end()
})



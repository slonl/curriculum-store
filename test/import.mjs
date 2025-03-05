import JSONTag from '@muze-nl/jsontag'
import serialize, {stringify} from '@muze-nl/od-jsontag/src/serialize.mjs'
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
					Niveau: true
				}
			},
			Niveau: {
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

tap.test('import updated tree', t => {
	// importEntity needs JSONTag class attributes
	const tree = JSONTag.parse(`
<object class="RootType" id="rootid">{
	"id":"rootid",
	"prefix":"R",
	"title":"A root entity",
	"@type": "RootType",
	"ChildType": [
		<object class="ChildType" id="child2id">{
			"id": "child2id",
			"prefix": "R/c1",
			"title": "a replacement child",
			"@type": "ChildType"
		}
	]
}
`)
	const [updatedCount, newCount] = importEntity(tree, [tree], dataspace, meta)
	t.equal(dataspace.ChildType[0].deleted, true)
	t.equal(dataspace.ChildType[1], tree.ChildType[0])
	t.end()
})

tap.test('import x tree with Niveau', t => {
	// importEntity needs JSONTag class attributes
	const tree1 = JSONTag.parse(`
<object class="RootType" id="root2id">{
	"id":"root2id",
	"prefix":"R2",
	"title":"A second root entity",
	"@type": "RootType",
	"ChildType": [
		<object class="ChildType" id="child3id">{
			"id": "child3id",
			"prefix": "R2/c1",
			"title": "a child",
			"@type": "ChildType",
			"Niveau": [
				{
					"id": "niveau1",
					"title": "Niveau 1",
					"@type": "Niveau"
				}
			]
		},
		<object class="ChildType" id="child4id">{
			"id": "child4id",
			"prefix": "R2/c2",
			"title": "another child",
			"@type": "ChildType",
			"Niveau": [
				{
					"id": "niveau1",
					"title": "Niveau 1",
					"@type": "Niveau"
				}
			]
		}	
	]
}
`)
	const tree2 = JSONTag.parse(`
<object class="RootType" id="root3id">{
	"id":"root3id",
	"prefix":"R3",
	"title":"A third root entity",
	"@type": "RootType",
	"ChildType": [
		<object class="ChildType" id="child3id">{
			"id": "child3id",
			"prefix": "R2/c1",
			"title": "a child",
			"@type": "ChildType",
			"Niveau": [
				{
					"id": "niveau1",
					"title": "Niveau 1",
					"@type": "Niveau"
				}
			]
		},
		<object class="ChildType" id="child4id">{
			"id": "child4id",
			"prefix": "R2/c2",
			"title": "another child",
			"@type": "ChildType",
			"Niveau": [
				{
					"id": "niveau1",
					"title": "Niveau 1",
					"@type": "Niveau"
				}
			]
		}	
	]
}
`)
	const [updatedCount, newCount] = importEntity(tree1, [tree1], dataspace, meta)
	const [updatedCount2, newCount2] = importEntity(tree2, [tree2], dataspace, meta)

	const root1 = meta.index.id.get('/uuid/root2id').deref()
	const root2 = meta.index.id.get('/uuid/root3id').deref()
	t.equal(root1.ChildType[0], root2.ChildType[0])
	t.equal(root1.ChildType[1], root2.ChildType[1])
	t.equal(root1.ChildType[0].Niveau[0], root2.ChildType[0].Niveau[0])
	t.equal(root1.ChildType[1].Niveau[0], root2.ChildType[1].Niveau[0])
	t.equal(dataspace.Niveau[0], root1.ChildType[0].Niveau[0])

	const out = stringify(serialize(dataspace, {meta, changes: true})) // serialize only changes
	const expectedOut = `(52){"RootType":[~1-3],"ChildType":[~4-7],"Niveau":[~8]}
(156)<object class="RootType" id="/uuid/rootid">{"id":"rootid","prefix":"R","title":"A root entity","ChildType":[~5],"unreleased":true,#"root":[~1],"dirty":true}
(174)<object class="RootType" id="/uuid/root2id">{"id":"root2id","prefix":"R2","title":"A second root entity","ChildType":[~6-7],"unreleased":true,"NiveauIndex":[~8],#"root":[~2]}
(173)<object class="RootType" id="/uuid/root3id">{"id":"root3id","prefix":"R3","title":"A third root entity","ChildType":[~6-7],"unreleased":true,"NiveauIndex":[~8],#"root":[~3]}
(149)<object class="ChildType" id="/uuid/child1id">{"id":"child1id","prefix":"R/c1","title":"the first child","unreleased":true,#"root":[],"deleted":true}
(157)<object class="ChildType" id="/uuid/child2id">{"id":"child2id","prefix":"R/c1","title":"a replacement child","unreleased":true,#"RootType":[~1],#"root":[~1]}
(183)<object class="ChildType" id="/uuid/child3id">{"id":"child3id","prefix":"R2/c1","title":"a child","Niveau":[~8],"unreleased":true,#"RootType":[~2-3],"NiveauIndex":[~8],#"root":[~2-3]}
(189)<object class="ChildType" id="/uuid/child4id">{"id":"child4id","prefix":"R2/c2","title":"another child","Niveau":[~8],"unreleased":true,#"RootType":[~2-3],"NiveauIndex":[~8],#"root":[~2-3]}
(130)<object class="Niveau" id="/uuid/niveau1">{"id":"niveau1","title":"Niveau 1","unreleased":true,#"ChildType":[~6-7],#"root":[~2-3]}`
	t.equal(out, expectedOut)

	t.end()
})
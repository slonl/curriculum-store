import tap from 'tap'
import JSONTag from '@muze-nl/jsontag'
import { previous } from '@muze-nl/od-jsontag/src/symbols.mjs'

import niveauIndex from '../src/index.niveau.mjs'

// These tests encode the accepted NiveauIndex invariant:
// 1. NiveauIndex is derived data.
// 2. Own Niveau is authoritative and exactly determines that entity's
//    NiveauIndex.
// 3. Entities without own Niveau derive a de-duplicated union from relevant
//    child NiveauIndex values.
// 4. Vakleergebied is a related link, not a child propagation path.

function freshMeta() {
	return {
		index: {},
		schema: {
			types: {
				RootType: {
					root: true,
					children: { ChildType: true, Vakleergebied: true }
				},
				ChildType: {
					children: { LessonType: true, Niveau: true }
				},
				LessonType: {
					children: { Niveau: true }
				},
				Niveau: {
					children: {}
				},
				Vakleergebied: {
					children: { ChildType: true, Niveau: true }
				}
			}
		}
	}
}

function entity(type, id, extra = {}) {
	const value = JSONTag.parse(`<object class="${type}" id="${id}">{"id":"${id}"}`)
	Object.assign(value, extra)
	return value
}

function setPrevious(entity, previousEntity) {
	Object.defineProperty(entity, previous, {
		value: previousEntity,
		enumerable: false,
		writable: true,
		configurable: true
	})
}

function ids(values = []) {
	return values.map(value => value.id).sort()
}

tap.test('niveauIndex.create indexes descendants when parent Niveau is authoritative', t => {
	const rootNiveau = entity('Niveau', 'niveau-root')
	const childNiveau = entity('Niveau', 'niveau-child')

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]

	const root = entity('RootType', 'root')
	root.Niveau = [rootNiveau]
	root.ChildType = [child]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(child.NiveauIndex), ['niveau-child'], 'child receives its own NiveauIndex')
	t.same(ids(root.NiveauIndex), ['niveau-root'], 'parent own Niveau is authoritative')
	t.end()
})

tap.test('niveauIndex.create ignores existing derived NiveauIndex', t => {
	const existingNiveau = entity('Niveau', 'niveau-existing')
	const childNiveau = entity('Niveau', 'niveau-child')

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]

	const root = entity('RootType', 'root')
	root.NiveauIndex = [existingNiveau]
	root.ChildType = [child]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(child.NiveauIndex), ['niveau-child'], 'child is indexed from own Niveau')
	t.same(ids(root.NiveauIndex), ['niveau-child'], 'existing derived NiveauIndex is not source state')
	t.end()
})

tap.test('niveauIndex.create stops propagation at intermediate entity with Niveau', t => {
	const childNiveau = entity('Niveau', 'niveau-child')
	const lessonNiveau = entity('Niveau', 'niveau-lesson')

	const lesson = entity('LessonType', 'lesson')
	lesson.Niveau = [lessonNiveau]

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]
	child.LessonType = [lesson]

	const root = entity('RootType', 'root')
	root.ChildType = [child]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(lesson.NiveauIndex), ['niveau-lesson'], 'grandchild is indexed')
	t.same(ids(child.NiveauIndex), ['niveau-child'], 'intermediate own Niveau is authoritative')
	t.same(ids(root.NiveauIndex), ['niveau-child'], 'root inherits the intermediate authoritative NiveauIndex')
	t.end()
})

tap.test('niveauIndex.create de-duplicates child-derived Niveau', t => {
	const niveau = entity('Niveau', 'niveau-shared')

	const childA = entity('ChildType', 'child-a')
	childA.Niveau = [niveau]

	const childB = entity('ChildType', 'child-b')
	childB.Niveau = [niveau]

	const root = entity('RootType', 'root')
	root.ChildType = [childA, childB]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(root.NiveauIndex), ['niveau-shared'], 'duplicate child levels are materialized once')
	t.end()
})

tap.test('niveauIndex.create ignores Vakleergebied as a niveau parent, matching the old script', t => {
	const vakNiveau = entity('Niveau', 'niveau-vakleergebied')
	const childNiveau = entity('Niveau', 'niveau-child')

	const vakChild = entity('ChildType', 'vak-child')
	vakChild.Niveau = [vakNiveau]

	const realChild = entity('ChildType', 'real-child')
	realChild.Niveau = [childNiveau]

	const vakleergebied = entity('Vakleergebied', 'vakleergebied')
	vakleergebied.ChildType = [vakChild]

	const root = entity('RootType', 'root')
	root.Vakleergebied = [vakleergebied]
	root.ChildType = [realChild]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(root.NiveauIndex), ['niveau-child'], 'Vakleergebied subtree does not contribute to parent NiveauIndex')
	t.end()
})

tap.test('niveauIndex.update derives levels from a newly linked child with Niveau but no NiveauIndex yet', t => {
	const childNiveau = entity('Niveau', 'niveau-child')

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]

	const previousRoot = entity('RootType', 'root')
	previousRoot.ChildType = []

	const root = entity('RootType', 'root')
	root.ChildType = [child]
	root.NiveauIndex = []
	setPrevious(root, previousRoot)

	niveauIndex.update(null, freshMeta(), [root])

	t.same(ids(child.NiveauIndex), ['niveau-child'], 'new child receives its own NiveauIndex')
	t.same(ids(root.NiveauIndex), ['niveau-child'], 'parent can derive from child.Niveau when child.NiveauIndex is not populated yet')
	t.end()
})

tap.test('niveauIndex.update does not let child changes override parent own Niveau', t => {
	const rootNiveau = entity('Niveau', 'niveau-root')
	const oldChildNiveau = entity('Niveau', 'niveau-old-child')
	const newChildNiveau = entity('Niveau', 'niveau-new-child')

	const previousChild = entity('ChildType', 'child')
	previousChild.Niveau = [oldChildNiveau]

	const child = entity('ChildType', 'child')
	child.Niveau = [newChildNiveau]
	child.NiveauIndex = [oldChildNiveau]
	setPrevious(child, previousChild)

	const root = entity('RootType', 'root')
	root.Niveau = [rootNiveau]
	root.ChildType = [child]
	root.NiveauIndex = [rootNiveau]

	Object.defineProperty(child, 'RootType', {
		value: [root],
		enumerable: false,
		writable: true,
		configurable: true
	})

	niveauIndex.update(null, freshMeta(), [child])

	t.same(ids(child.NiveauIndex), ['niveau-new-child'], 'child own NiveauIndex updates')
	t.same(ids(root.NiveauIndex), ['niveau-root'], 'parent own Niveau remains authoritative')
	t.end()
})

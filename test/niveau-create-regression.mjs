import tap from 'tap'
import JSONTag from '@muze-nl/jsontag'
import { previous } from '@muze-nl/od-jsontag/src/symbols.mjs'

import niveauIndex from '../src/index.niveau.mjs'

// These tests encode the old scripts/tojsontag.mjs addNiveauIndex behavior:
// 1. Always recurse into children first, except Vakleergebied.
// 2. Then merge existing NiveauIndex.
// 3. Then merge own Niveau.
// 4. Write the merged result back to entity.NiveauIndex.
//
// The current refactored create() short-circuits when an entity has Niveau or
// an existing NiveauIndex, so several of these tests are expected to fail until
// src/index.niveau.mjs is made behaviorally equivalent to the old script.

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

tap.test('niveauIndex.create merges child-derived Niveau with parent own Niveau', t => {
	const rootNiveau = entity('Niveau', 'niveau-root')
	const childNiveau = entity('Niveau', 'niveau-child')

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]

	const root = entity('RootType', 'root')
	root.Niveau = [rootNiveau]
	root.ChildType = [child]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(child.NiveauIndex), ['niveau-child'], 'child still receives its own NiveauIndex')
	t.same(ids(root.NiveauIndex), ['niveau-child', 'niveau-root'], 'parent keeps own Niveau and inherits child Niveau')
	t.end()
})

tap.test('niveauIndex.create completes an existing partial NiveauIndex from children', t => {
	const existingNiveau = entity('Niveau', 'niveau-existing')
	const childNiveau = entity('Niveau', 'niveau-child')

	const child = entity('ChildType', 'child')
	child.Niveau = [childNiveau]

	const root = entity('RootType', 'root')
	root.NiveauIndex = [existingNiveau]
	root.ChildType = [child]

	niveauIndex.create({ RootType: [root] }, freshMeta())

	t.same(ids(child.NiveauIndex), ['niveau-child'], 'child is still indexed')
	t.same(ids(root.NiveauIndex), ['niveau-child', 'niveau-existing'], 'existing NiveauIndex is preserved and child levels are appended')
	t.end()
})

tap.test('niveauIndex.create does not stop at an intermediate entity with Niveau', t => {
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
	t.same(ids(child.NiveauIndex), ['niveau-child', 'niveau-lesson'], 'intermediate entity keeps own Niveau and inherits descendant Niveau')
	t.same(ids(root.NiveauIndex), ['niveau-child', 'niveau-lesson'], 'root inherits through the intermediate entity')
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

	t.same(ids(root.NiveauIndex), ['niveau-child'], 'parent can derive from child.Niveau when child.NiveauIndex is not populated yet')
	t.end()
})

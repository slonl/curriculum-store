import tap from 'tap'
import JSONTag from '@muze-nl/jsontag'
import { previous } from '@muze-nl/od-jsontag/src/symbols.mjs'

import parentIndex from '../src/index.parents.mjs'
import rootIndex from '../src/index.roots.mjs'
import niveauIndex from '../src/index.niveau.mjs'

const meta = {
	schema: {
		types: {
			RootType: {
				root: true,
				children: { ChildType: true }
			},
			ChildType: {
				children: { LessonType: true }
			},
			LessonType: {
				children: { Niveau: true }
			},
			Niveau: {
				children: {}
			},
			Vakleergebied: {
				children: {}
			}
		}
	}
}

function entity(type, id) {
	return JSONTag.parse(`<object class="${type}" id="${id}">{"id":"${id}"}`)
}

function setPrevious(entity, previousEntity) {
	Object.defineProperty(entity, previous, {
		value: previousEntity,
		enumerable: false,
		writable: true,
		configurable: true
	})
}

function setHidden(entity, prop, value) {
	Object.defineProperty(entity, prop, {
		value,
		enumerable: false,
		writable: true,
		configurable: true
	})
}

function ids(values = []) {
	return values.map(value => value.id).sort()
}

tap.test('parents.update removes old parent links and adds new parent links', t => {
	const oldChild = entity('ChildType', 'old-child')
	const newChild = entity('ChildType', 'new-child')
	const parent = entity('RootType', 'root')

	const previousParent = entity('RootType', 'root')
	previousParent.ChildType = [oldChild]

	parent.ChildType = [newChild]
	setPrevious(parent, previousParent)
	setHidden(oldChild, 'RootType', [parent])

	parentIndex.update(null, meta, [parent])

	t.same(oldChild.RootType, [])
	t.same(newChild.RootType, [parent])

	t.end()
})

tap.test('roots.update recalculates roots for moved child and descendants', t => {
	const rootA = entity('RootType', 'root-a')
	const rootB = entity('RootType', 'root-b')
	const child = entity('ChildType', 'child')
	const lesson = entity('LessonType', 'lesson')

	child.LessonType = [lesson]

	const previousRootA = entity('RootType', 'root-a')
	const previousRootB = entity('RootType', 'root-b')

	previousRootA.ChildType = [child]
	previousRootB.ChildType = []

	rootA.ChildType = []
	rootB.ChildType = [child]

	setPrevious(rootA, previousRootA)
	setPrevious(rootB, previousRootB)

	setHidden(child, 'RootType', [rootA])
	setHidden(lesson, 'ChildType', [child])

	child.root = [rootA]
	lesson.root = [rootA]

	parentIndex.update(null, meta, [rootA, rootB])
	rootIndex.update(null, meta, [rootA, rootB])

	t.same(ids(child.root), ['root-b'])
	t.same(ids(lesson.root), ['root-b'])

	t.end()
})

tap.test('niveauIndex.update reacts when children change without Niveau changing', t => {
	const niveau1 = entity('Niveau', 'niveau-1')
	const child = entity('ChildType', 'child')

	child.Niveau = [niveau1]
	child.NiveauIndex = [niveau1]

	const rootA = entity('RootType', 'root-a')
	const rootB = entity('RootType', 'root-b')

	const previousRootA = entity('RootType', 'root-a')
	const previousRootB = entity('RootType', 'root-b')

	previousRootA.ChildType = [child]
	previousRootB.ChildType = []

	rootA.ChildType = []
	rootB.ChildType = [child]

	rootA.NiveauIndex = [niveau1]
	rootB.NiveauIndex = []

	setPrevious(rootA, previousRootA)
	setPrevious(rootB, previousRootB)

	setHidden(child, 'RootType', [rootA])

	parentIndex.update(null, meta, [rootA, rootB])
	niveauIndex.update(null, meta, [rootA, rootB])

	t.same(rootA.NiveauIndex, [])
	t.same(rootB.NiveauIndex, [niveau1])

	t.end()
})

tap.test('niveauIndex.update propagates child Niveau changes to ancestors', t => {
	const niveau1 = entity('Niveau', 'niveau-1')
	const niveau2 = entity('Niveau', 'niveau-2')

	const root = entity('RootType', 'root')
	const child = entity('ChildType', 'child')

	const previousChild = entity('ChildType', 'child')
	previousChild.Niveau = [niveau1]

	child.Niveau = [niveau2]
	child.NiveauIndex = [niveau1]

	root.ChildType = [child]
	root.NiveauIndex = [niveau1]

	setPrevious(child, previousChild)
	setHidden(child, 'RootType', [root])

	niveauIndex.update(null, meta, [child])

	t.same(child.NiveauIndex, [niveau2])
	t.same(root.NiveauIndex, [niveau2])

	t.end()
})
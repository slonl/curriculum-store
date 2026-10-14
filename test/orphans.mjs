import tap from 'tap'
import JSONTag from '@muze-nl/jsontag'
import commands from '../src/commands.mjs'

function fixture() {
    const types = { Root: { root: true }, Child: {},
        KerndoelUitstroomprofiel: {}, Deprecated: {} }
    const index = new Map()
    function entity(type, id, extra = {}) {
        const value = { id, ...extra }
        JSONTag.setAttribute(value, 'class', type)
        index.set('/uuid/' + id, { deref: () => value })
        return value
    }
    const missing = entity('Child', 'missing')
    const empty = entity('Child', 'empty', { root: [] })
    const linked = entity('Child', 'linked', { root: [{}] })
    const root = entity('Root', 'root')
    const profile = entity('KerndoelUitstroomprofiel', 'profile')
    const deprecated = entity('Deprecated', 'deprecated')
    const unknownType = entity('UnknownType', 'unknown-type')
    const meta = { schema: { types }, index: { id: index } }
    const remove = ids => commands.patch({}, { value: ids.map(id => ({
        name: 'deleteEntity', id, orphanOnly: true
    })) }, {}, meta)
    return { missing, empty, linked, root, profile, deprecated, unknownType,
        remove, meta }
}

tap.test('selected orphans are marked deleted while retaining their content', t => {
    const f = fixture()
    f.remove(['missing', 'empty'])
    t.equal(f.missing.deleted, true)
    t.equal(f.empty.deleted, true)
    t.equal(JSONTag.getAttribute(f.empty, 'class'), 'Child')
    t.equal(f.empty.id, 'empty')
    t.notOk(f.linked.deleted)
    t.doesNotThrow(() => f.remove(['empty']), 'repeated marking is harmless')
    t.end()
})

tap.test('stale or ineligible selections are rejected before any deletion', t => {
    for (const id of ['linked', 'root', 'profile', 'deprecated',
        'unknown-type', 'unknown']) {
        const f = fixture()
        t.throws(() => f.remove(['missing', id]), /no longer an orphan/, id)
        t.notOk(f.missing.deleted, 'earlier selection remains unchanged')
    }
    const f = fixture()
    f.empty.root.push(f.root)
    t.throws(() => f.remove(['empty']), /no longer an orphan/,
        'an entity attached after listing cannot be deleted as an orphan')
    t.notOk(f.empty.deleted)
    commands.patch({}, { value: [{ name: 'deleteEntity', id: 'linked' }] },
        {}, f.meta)
    t.equal(f.linked.deleted, true, 'ordinary deleteEntity behavior is preserved')
    t.end()
})

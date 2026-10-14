import tap from 'tap'

const variables = [
    'QUERY_MEMORY_LIMIT',
    'QUERY_TIMEOUT',
    'SLOW_QUERY_TIMEOUT'
]
let importCounter = 0

async function loadOptions(environment = {}) {
    const previous = new Map(variables.map(name => [name, process.env[name]]))
    for (const name of variables) {
        delete process.env[name]
    }
    for (const [name, value] of Object.entries(environment)) {
        process.env[name] = String(value)
    }
    try {
        const url = new URL('../src/store-options.mjs?test=' + importCounter++,
            import.meta.url)
        return (await import(url)).default
    }
    finally {
        for (const [name, value] of previous) {
            if (value === undefined) {
                delete process.env[name]
            }
            else {
                process.env[name] = value
            }
        }
    }
}

tap.test('query limits preserve SimplyStore defaults', async t => {
    const options = await loadOptions()
    t.equal(options.queryMemoryLimit, 64)
    t.equal(options.timeout, 1000)
    t.equal(options.slowTimeout, 10000)
})

tap.test('query limits can be configured independently', async t => {
    const options = await loadOptions({
        QUERY_MEMORY_LIMIT: 96,
        QUERY_TIMEOUT: 1500,
        SLOW_QUERY_TIMEOUT: 20000
    })
    t.equal(options.queryMemoryLimit, 96)
    t.equal(options.timeout, 1500)
    t.equal(options.slowTimeout, 20000)
})

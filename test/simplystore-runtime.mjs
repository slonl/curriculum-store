import tap from 'tap'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import process from 'node:process'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

tap.test('published runtime supports curriculum queries, commands and restart',
    { timeout: 60000 }, async t => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'curriculum-'))
        const data = path.join(directory, 'data')
        await fs.mkdir(data)
        const datafile = path.join(data, 'data.jsontag')
        const schemaFile = path.join(data, 'schema.jsontag')
        const input = path.join(directory, 'input.jsontag')
        const socket = net.createServer()
        socket.listen(0)
        await once(socket, 'listening')
        const port = socket.address().port
        await new Promise(resolve => socket.close(resolve))
        const env = {
            ...process.env, DATA_FILE: datafile, SCHEMA_FILE: schemaFile,
            INDEX_FILE: path.join(repo, 'src/index.mjs'),
            COMMANDS: path.join(repo, 'src/commands.mjs'),
            COMMAND_LOG: path.join(data, 'command-log.jsontag'),
            COMMAND_STATUS: path.join(data, 'command-status.jsontag'),
            NODE_PORT: String(port)
        }
        const options = { cwd: directory, env, timeout: 15000 }
        const serverFile = path.join(repo, 'src/curriculum-store.mjs')
        let server
        let output = ''
        async function stop() {
            if (server && server.exitCode === null && !server.signalCode) {
                const exit = once(server, 'exit')
                server.kill('SIGTERM')
                const timer = setTimeout(() => server.kill('SIGKILL'), 5000)
                try {
                    await exit
                }
                finally {
                    clearTimeout(timer)
                }
            }
            server = undefined
        }
        t.teardown(async () => {
            await stop()
            await fs.rm(directory, { recursive: true, force: true })
        })
        async function start() {
            output = ''
            server = spawn(process.execPath,
                ['--no-node-snapshot', serverFile], {
                    cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe']
                })
            server.stdout.on('data', bytes => { output += bytes })
            server.stderr.on('data', bytes => { output += bytes })
            for (let attempt = 0; attempt < 100; attempt++) {
                if (server.exitCode !== null) {
                    throw new Error(output)
                }
                if (output.includes('SimplyStore listening on port ')) {
                    return
                }
                await delay(50)
            }
            throw new Error('Server startup timed out: ' + output)
        }
        async function request(route, body) {
            const response = await fetch(`http://127.0.0.1:${port}${route}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { accept: 'application/json',
                    'content-type': 'text/plain' },
                body, signal: AbortSignal.timeout(5000)
            })
            return { status: response.status, value: await response.json() }
        }
        await fs.writeFile(schemaFile, JSON.stringify({ types: {
            RootType: { root: true, children: { ChildType: true } },
            ChildType: { children: {} }
        } }))
        await fs.writeFile(input, `{"RootType":[
            <object class="RootType" id="/uuid/root">{
                "id":"root","title":"original","ChildType":[]
            }],"ChildType":[]}`)
        await execute(process.execPath, [path.join(repo,
            'node_modules/@muze-nl/simplystore/scripts/convert.mjs'),
        input, datafile, env.INDEX_FILE, schemaFile], options)
        const manifest = path.join(data, 'data.integrity.jsontag')
        t.ok((await fs.stat(manifest)).size, 'conversion publishes integrity')
        await fs.unlink(manifest)
        await t.rejects(execute(process.execPath,
            ['--no-node-snapshot', serverFile], options), { code: 1 },
        'startup rejects a missing integrity manifest')
        const initialize = path.join(repo, 'scripts/init-integrity.mjs')
        await execute(process.execPath, [initialize], options)
        t.ok((await fs.stat(manifest)).size, 'initializer seals existing files')
        await t.rejects(execute(process.execPath, [initialize], options),
            { code: 1 }, 'initializer refuses an existing baseline')
        await start()
        t.same(await request('/query/',
            'from(data.RootType).select({title:_})'),
        { status: 200, value: [{ title: 'original' }] }, 'JAQT works')
        t.same(await request('/query/',
            '[typeof process,typeof require,typeof fetch]'),
        { status: 200, value: ['undefined', 'undefined', 'undefined'] },
        'queries have no host APIs')
        t.equal((await request('/query/', "import('node:fs')")).status,
            422, 'query imports fail')
        const command = JSON.stringify({ id: 'upgrade-check', name: 'patch',
            value: [
                { name: 'updateEntity', id: 'root', property: 'title',
                    prevValue: 'original', newValue: 'updated' },
                { name: 'newEntity', '@type': 'RootType',
                    entity: { id: 'new', title: 'added', ChildType: [] } }
            ] })
        const accepted = await request('/command', command)
        t.ok(accepted.status < 300, 'curriculum patch accepted')
        let status
        for (let attempt = 0; attempt < 100; attempt++) {
            status = await request('/command/upgrade-check')
            if (['done', 'failed', 'unsafe'].includes(status.value.status)) {
                break
            }
            await delay(50)
        }
        t.equal(status.value.status, 'done', JSON.stringify(status.value))
        const query = `[meta.index.id.get('/uuid/root').title,
            meta.index.id.get('/uuid/new').title,
            meta.index.id.get('/uuid/new').root[0].id]`
        const expected = { status: 200, value: ['updated', 'added', 'new'] }
        t.same(await request('/query/', query), expected,
            'commands update IDs and curriculum root index')
        for (const kind of ['id', 'offset']) {
            t.ok((await fs.stat(path.join(data,
                `index.${kind}.upgrade-check.json`))).size,
            `${kind} index is persisted`)
        }
        await stop()
        await start()
        t.same(await request('/query/', query), expected,
            'queries see persisted command results after restart')
    })

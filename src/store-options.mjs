import path from 'node:path'
import process from 'node:process'

const datafile = process.env.DATA_FILE || './data/data.jsontag'
const directory = path.dirname(datafile)

export default {
    datafile,
    schemaFile: process.env.SCHEMA_FILE || './data/schema.jsontag',
    indexFile: path.resolve(process.env.INDEX_FILE || './src/index.mjs'),
    commandsFile: path.resolve(process.env.COMMANDS || './src/commands.mjs'),
    commandLog: process.env.COMMAND_LOG ||
        path.join(directory, 'command-log.jsontag'),
    commandStatus: process.env.COMMAND_STATUS ||
        path.join(directory, 'command-status.jsontag'),
    port: Number(process.env.NODE_PORT || 3000)
}

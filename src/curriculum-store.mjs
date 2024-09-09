import simplystore from '@muze-nl/simplystore'
import process from 'node:process'

const datafile     = process.env.DATA_FILE || './data/data.jsontag'
const commandsFile = process.env.COMMANDS || process.cwd()+'/src/commands.mjs'
const port         = process.env.NODE_PORT || 3000

simplystore.run({
	datafile,
	port,
	commandsFile,
})
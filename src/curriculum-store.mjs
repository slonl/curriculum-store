import simplystore from '@muze-nl/simplystore'

const datafile     = process.env.DATA_FILE || './data/data.jsontag'
const commandsFile = process.env.COMMANDS || './src/commands.mjs'
const port         = process.env.NODE_PORT || 3000

import(commandsFile).then(module => {
	console.log('Commands:',commandsFile,Object.keys(module.default))
	console.log('Data file:',datafile)
})

simplystore.run({
	datafile,
	port,
	commandsFile,
})
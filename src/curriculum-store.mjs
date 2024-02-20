import simplystore from '@muze-nl/simplystore'

const datafile = process.env.DATAFILE || './data/data.jsontag'
const port     = process.env.NODE_PORT || 3000

simplystore.run({
	datafile: datafile,
	port: port,
})
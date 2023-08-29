import simplystore from '@muze-nl/simplystore'
import fs from 'fs'
import JSONTag from '@muze-nl/jsontag'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datafile = process.env.DATAFILE || 'data/curriculum.jsontag'
const port     = process.env.NODE_PORT || 3000

simplystore.run({
	datafile: datafile,
	port: port,
	queryWorker: __dirname+'/worker-query-init.mjs'
})
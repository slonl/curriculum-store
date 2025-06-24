import simplystore from '@muze-nl/simplystore'
import process from 'node:process'

const datafile     = process.env.DATA_FILE || './data/data.jsontag'
const schemaFile   = process.env.SCHEMA_FILE || './data/schema.jsontag'
const commandsFile = process.env.COMMANDS || process.cwd()+'/src/commands.mjs'
const port         = process.env.NODE_PORT || 3000

async function checkServerAndStart(port) {
  try {
    const response = await fetch(`http://localhost:${port}`, {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    console.log(`Not starting simplystore: something is already running on the server port: ${response.status}`);  
  } catch (error) {
    console.log('Starting simplystore');
    simplystore.run({
      datafile,
      schemaFile,
      port,
      commandsFile,
    }) 
  }
}

checkServerAndStart(port)

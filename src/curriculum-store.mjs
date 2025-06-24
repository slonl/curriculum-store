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
    console.log(`Server is already running! Status: ${response.status}`);
    
    return true;
  
  } catch (error) {
    console.log('Server was not running:', error.message);
    console.log('Starting simplystore');
    simplystore.run({
      datafile,
      schemaFile,
      port,
      commandsFile,
    }) 
    
    return false;

  }
}

checkServerAndStart(port)

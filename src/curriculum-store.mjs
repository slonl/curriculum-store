import simplystore from '@muze-nl/simplystore'
import process from 'node:process'

import options from './store-options.mjs'

async function checkServerAndStart(port) {
  try {
    const response = await fetch(`http://localhost:${port}`, {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    console.log(`Not starting simplystore: something is already running on the server port: ${response.status}`);  
  } catch (error) {
    console.log('Starting simplystore');
    await simplystore.run(options)
  }
}

checkServerAndStart(options.port).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})

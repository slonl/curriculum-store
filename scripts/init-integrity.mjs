import process from 'node:process'
import { initializeIntegrity }
    from '@muze-nl/simplystore/src/initialize-integrity.mjs'
import options from '../src/store-options.mjs'

try {
    console.log(JSON.stringify(await initializeIntegrity(options), null, 2))
}
catch (error) {
    console.error(error.message)
    process.exitCode = 1
}

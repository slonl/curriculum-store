import fs from 'fs'
import JSONTag from '@muze-nl/jsontag'
import parse from '@muze-nl/od-jsontag/src/parse.mjs'
import * as odJSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'

let commandQueue = []

function loadCommandLog(commandLog) {
    if (!fs.existsSync(commandLog)) {
        return
    }
    let log = fs.readFileSync(commandLog, 'utf-8')
    if (log) {
        let lines = log.split("\n").filter(Boolean)
        for(let line of lines) {
            let command = JSONTag.parse(line)
            commandQueue.push(command)
        }
    }
}

loadCommandLog(process.cwd()+'/command-log.jsontag')

for(let command of commandQueue) {
  console.log(command.author, command.message, command.value.map(change => { return { name: change.name, type: change['@type']}}))
}
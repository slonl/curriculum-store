import Curriculum from 'curriculum-js'
// load node filesystem support
import fs from 'fs'
import JSONTag from '@muze-nl/jsontag'
import parse from '@muze-nl/od-jsontag/src/parse.mjs'
import * as odJSONTag from '@muze-nl/od-jsontag/src/jsontag.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const config = {
	owner: 'slonl',
	branchName: 'editor-test',
	authToken: process.env.AUTH_TOKEN
}
const meta = {
	index: {
		id: new Map()
	}
}

function getUUID(url) {
	const u = new URL(url, 'https://localhost/')
	return u.pathname.split('/') // split path into filenames
		.filter(Boolean) // remove empty filenames, e.g. if url ends with '/' 
		.pop() // return last element
}

function convertToCamelCase(str) {
    return str
        .toLowerCase()
        .replace(/_./g, match => match.charAt(1).toUpperCase())
        .replace(/^./g, match => match.charAt(0).toUpperCase());
}

function toJSON(ob) {
	const type = odJSONTag.getAttribute(ob, 'class')
	if (!type) {
		console.log('no type',ob)
		process.exit()	
	}
	let result = {
		id: getUUID(odJSONTag.getAttribute(ob, 'id'))
	}
	const props = ['deleted','dirty']
	props.concat(Object.keys(meta.schema.types[type].properties))
	.forEach(property => {
		if (typeof ob[property] != 'undefined') {
			result[property] = ob[property]
		}
	})
//	console.log(meta.schema.types[type])
	Object.entries(meta.schema.types[type].children).forEach(([childType, childDef]) => {
		const snakeCaseType = childDef.label + '_id'
		if (ob[childType] && ob[childType].length) {
			result[snakeCaseType] = ob[childType].map(child => {
				return getUUID(odJSONTag.getAttribute(child, 'id'))
			})
		}
	})
	return result
}

function loadCommandStatus(commandStatusFile) {
    let status = new Map()
    if (fs.existsSync(commandStatusFile)) {
        let file = fs.readFileSync(commandStatusFile, 'utf-8')
        if (file) {
            let lines = file.split("\n").filter(Boolean) //filter clears empty lines
            for(let line of lines) {
                let command = JSONTag.parse(line)
                status.set(command.command, command.status)
            }
        } else {
            console.error('Could not open command status',commandStatusFile)
        }
    } else {
        console.log('no command status', commandStatusFile)
    }
    return status
}

function loadCommandLog(status, commandLog) {
    let commands = []
    if (!fs.existsSync(commandLog)) {
    	console.log(commandLog+' does not exist')
        return commands
    }
    let log = fs.readFileSync(commandLog, 'utf-8')
    if (log) {
        let lines = log.split("\n").filter(Boolean)
        for(let line of lines) {
            let command = JSONTag.parse(line)
            let state = status.get(command.id)
            switch(state) {
                case 'accepted': // command has not yet run
                    break;
                case 'done': // command is finished successfully
                    commands.push(command)
                    break;
                default: // error, do nothing
                    break;
            } 
        }
    } else {
    	console.log(commandLog + ' is empty')
    }
    return commands
}

function loadSchema(schemafile) {
	let tempMeta = {}
	let jsontag = fs.readFileSync(schemafile, 'utf-8')
	return JSONTag.parse(jsontag, null, tempMeta)
}

async function commitChanges(datafile, commands) {	
	let count = 0
	const extension = datafile.split('.').pop()
	const basefile = datafile.substring(0, datafile.length - (extension.length + 1)) //+1 for . character
	let jsontag
	let commits = {}
	let tempMeta = {}
	if (fs.existsSync(__dirname+'/data/committed.json')) {
		commits = fs.readFileSync(__dirname+'/data/committed.json')
		commits = JSON.parse(commits)
	}
	commands.push('done')
	let command = null
	do {
		console.log('reading jsontag',datafile)
		if (fs.existsSync(datafile)) {
			jsontag = fs.readFileSync(datafile, 'utf-8')
			dataspace = parse(jsontag, tempMeta) // tempMeta is needed to combine the resultArray, using meta conflicts with meta.index.id
			// write data back to git repositories
			if (command && !commits[command.id]) {
				updateContexts()
				for (let context of Object.values(meta.schema.contexts)) {
					let schema = curriculum.schemas[context.label]
					let schemaName = context.label;
//					let fullSchemaName = 'curriculum-'+schemaName;
					console.log('committing',schemaName)
					const props = Object.keys(schema.properties)
					for (let propertyName of props) {
						if (propertyName=='deprecated' || propertyName=='alias') {
							continue
						}
						if (typeof schema.properties[propertyName]['#file'] != 'undefined') {
							const fileName = schema.properties[propertyName]['#file']
//							console.log(schemaName, curriculum.schema, curriculum.schemas)
							const propCamel = convertToCamelCase(propertyName)
							let fileData
							try {
								fileData = JSON.stringify(curriculum.data[propCamel], null, "\t")
							} catch(error) {
								console.error('stringify', error)
								process.exit()
							}
							if (isChanged(propCamel, fileData)) {
								console.log('writing',fileName)
								try {
									await curriculum.sources[schemaName].writeFile(fileName, fileData, command.message, command.author)
								} catch(error) {
									console.error(error)
									process.exit()
								}
							} else {
								console.log('skipping',fileName)
							}
						} else {
							console.log('no file', propertyName)
						}
					}
				}
				commits[command.id] = true
				fs.writeFileSync(__dirname+'/data/committed.json', JSON.stringify(commits))
				count++
			}

			for (let context of Object.values(meta.schema.contexts)) {
				const schemaName = context.label
				const schema = curriculum.schemas[schemaName]
				const props = Object.keys(schema.properties)
				for (let propertyName of props) {
					if (propertyName=='deprecated' || propertyName=='alias') {
						continue
					}
					const propCamel = convertToCamelCase(propertyName)
					lastContents[propertyName] = JSON.stringify(curriculum.data[propCamel], null, "\t")
				}
			}

			command = commands.shift()
			datafile = basefile + '.' + command.id + '.' + extension
		}
	} while(commands.length)
	return dataspace
}

function isChanged(type, data) {
	return lastContents[type]!=data
}

const curriculum = new Curriculum()
let dataspace = {}
const lastContents = {}
function updateContexts() {
	Object.keys(meta.schema.types).forEach(type => {
		if (type==='Deprecated' || type=='Alias') {
			return
		}
		if (!dataspace[type]) {
			console.log('missing dataspace['+type+']')
			return
		}
		console.log('updating',type)
		curriculum.data[type] = dataspace[type].map(toJSON)
	})
}

async function main() {
	const schemas = {}
	meta.schema = loadSchema(__dirname+'/data/schema.jsontag')
	await Promise.all(Object.values(meta.schema.contexts).map(async context => {
		console.log('loading github',context.label)
		schemas[context.label] = await curriculum.loadContextFromGithub(
			context.label, 
			'curriculum-'+context.label,
			config.owner,
			config.branchName,
			config.authToken
		)
//		console.log('schema',context.label,schemas[context.label])
		return true
	}))
	const status = loadCommandStatus(__dirname+'/command-status.jsontag')
	const commands = loadCommandLog(status, __dirname+'/command-log.jsontag')
	await commitChanges(__dirname+'/data/data.jsontag',commands)
	console.log('done')
}

main()
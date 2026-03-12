import Curriculum from 'curriculum-js'
// load node filesystem support
import fs from 'fs'
import JSONTag from '@muze-nl/jsontag'
import Parser from '@muze-nl/od-jsontag/src/parse.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const config = {
	owner: 'slonl',
	branchName: 'editor-dev',
	authToken: process.env.AUTH_TOKEN
}
if (!config.authToken) {
	console.error('Need AUTH_TOKEN env variable for github access.')
	process.exit()
} else {
	console.log('committing to '+config.owner+'/'+config.brancheName)
}

const meta = {
	index: {
		id: new Map()
	}
}

function convertToCamelCase(str) {
    return str
        .toLowerCase()
        .replace(/_id/g, '')
        .replace(/_./g, match => match.charAt(1).toUpperCase())
        .replace(/^./g, match => match.charAt(0).toUpperCase());
}

function toJSON(ob) {
	let result = {}	
	// property order in ob can differ from existing order in
	// git source, since ob is result of transformations for simplystore
	// so look up the original ob using its id in the git source
	// use the property order there
	// add any missing properties at the end
	let original = curriculum.index.id[ob.id]
	if (!original) {
		original = ob
	}
	for (let prop of Object.getOwnPropertyNames(original)) {
		const camelCaseKey = convertToCamelCase(prop)
		if (typeof ob[camelCaseKey] !== 'undefined' && isValidProp(ob, camelCaseKey)) {
			let {key, value} = convertProp(ob, camelCaseKey)
			result[key] = value
		}
	}
	for (let prop of Object.getOwnPropertyNames(ob)) {
		if (isValidProp(ob, prop)) {
			let {key, value} = convertProp(ob, prop)
			result[key] = value
		}
	}
	if (!result.id) {
		throw new Error('entity has no .id',ob)
	}
	if (result.NiveauIndex) {
		throw new Error('toJSON result should not have NiveauIndex',result)
	}
	return result
}

function isValidProp(ob, prop) {
	const type = JSONTag.getAttribute(ob, 'class')
	let props = meta.schema.types[type]?.properties
	if (!props) {
		throw new Error('entity has no properties in schema', type, ob)
	}
	if (props[prop]) {
		return true
	}	
	props = ['deleted','dirty','replaces','replacedBy']
	if (props.indexOf(prop)!==-1) {
		return true
	}
	const children = meta.schema.types[type]?.children
	if (children[prop]) {
		return true
	}
	return false
}

function convertProp(ob, prop) {
	const type = JSONTag.getAttribute(ob, 'class')
	let props = meta.schema.types[type]?.properties
	let def = {
		key: prop,
		value: ob[prop]
	}
	if (prop == 'replacedBy' || prop == 'replaces') {
		def.value = ob[prop].map(e => e.id)
		return def
	}
	if (props[prop]?.type=='object') {
		def.key = meta.schema.types[prop].label+'_id'
		def.value = ob[prop].id
		return def
	}
	if (props[prop]) {
		return def
	}
	let children = meta.schema.types[type]?.children
	if (children[prop]) {
		def.key = meta.schema.types[prop].label+'_id'
		def.value = ob[prop].map(e => e.id)
		return def
	}
	return def
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
	const extension = datafile.split('.').pop()
	const basefile = datafile.substring(0, datafile.length - (extension.length + 1)) //+1 for . character
	const parser = new Parser()
	let tempMeta = {}
	let jsontag
	let commits = {}
	parser.meta = tempMeta  // tempMeta is needed to combine the resultArray, using meta conflicts with meta.index.id
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
			dataspace = parser.parse(jsontag)
			updateContexts()
			// write data back to git repositories
			if (command && !commits[command.id]) {
				for (let context of Object.values(meta.schema.contexts)) {
					let schema = curriculum.schemas[context.label]
					let schemaName = context.label;
					console.log('committing',schemaName)
					const props = Object.keys(schema.properties)
					for (let propertyName of props) {
						if (propertyName=='deprecated' || propertyName=='alias') {
							continue
						}
						if (typeof schema.properties[propertyName]['#file'] != 'undefined') {
							const fileName = schema.properties[propertyName]['#file']
							const propCamel = convertToCamelCase(propertyName)
							let fileData = JSON.stringify(curriculum.data[propCamel], null, "\t")
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
					lastContents[propCamel] = JSON.stringify(curriculum.data[propCamel], null, "\t")
					console.log('updated contents for '+propCamel)
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
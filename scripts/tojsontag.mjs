// load the curriculum-js library
import Curriculum from 'curriculum-js'
// load node filesystem support
import fs from 'fs'
import repl from 'repl';
import JSONTag from '@muze-nl/jsontag'

const curriculum = new Curriculum()
let meta = {}
let parsed = {}
let storeSchema = {
    contexts: {},
    types: {},
    properties: {}
}

function flatten(arr) {
    let result = new Set()
    arr.forEach(v => {
        if (Array.isArray(v)) {
            flatten(v).forEach(v => result.add(v))
        } else {
            result.add(v)
        }
    })
    return Array.from(result)
}

function addNiveauIndex(entity) {
    let type = JSONTag.getAttribute(entity, 'class')
    if (!type) {
        return
    }
    let children = meta.schema.types[type].children
    let niveaus = []
    Object.keys(children).forEach(childType => {
        if (childType=='Vakleergebied') {
            return // is not a true parent in any case
        }
        if (entity[childType]) {
            niveaus.push(entity[childType].map(child => addNiveauIndex(child)))
        }
    })
    if (entity.NiveauIndex && entity.NiveauIndex.length) {
        niveaus.push(entity.NiveauIndex)
    }
    if (entity.Niveau) {
        // @FIXME: probably only set entity.Niveau in NiveauIndex
        niveaus.push(entity.Niveau)
    }
    niveaus = flatten(niveaus).filter(Boolean)
    if (niveaus.length) {
        if (typeof entity.NiveauIndex === 'undefined') {
            entity.NiveauIndex = [] //can't use non-enumerable here, since default JSONTag will ignore it
        }
        niveaus = niveaus.filter(n => entity.NiveauIndex.findIndex(ni => ni.id==n.id)===-1)
        entity.NiveauIndex.splice(entity.NiveauIndex.length, 0, ...niveaus)
    }
    return niveaus
}

const makeNiveauIndex = () => {
    Object.entries(meta.schema.types).forEach(([typeName, typeData]) => {
        if (!typeData.root) {
            return
        }
        curriculum.data[typeName].forEach(addNiveauIndex)
    })
}

const snakeToCamel = str =>
  str.replace(/([-_][a-z])/g, group =>
    group
      .toUpperCase()
      .replace('-', '')
      .replace('_', '')
  );

const capitalizeFirstLetter = str => 
  str[0].toUpperCase()+str.substring(1)

const linkIds = ob => {
    Object.keys(ob).forEach(prop => {
        if (prop.substring(prop.length-3)=='_id') {
            let newname = capitalizeFirstLetter(prop.substring(0, prop.length-3))
            if (Array.isArray(ob[prop])) {
                ob[newname] = ob[prop].map(id => curriculum.index.id[id])
            } else {
                ob[newname] = curriculum.index.id[ob[prop]]
            }
            delete ob[prop]
        }
    })
    Object.keys(ob).forEach(prop => {
        let camelCase = snakeToCamel(prop)
        if (camelCase!==prop) {
            ob[camelCase] = ob[prop]
            delete ob[prop]
        }
        if (ob.types && ob.types.length) {
            ob.types = ob.types.map(snakeToCamel)
        }
    })
    if (ob.replacedBy) {
        ob.replacedBy = ob.replacedBy.map(id => curriculum.index.id[id] || id)
    }
    if (ob.replaces) {
        ob.replaces = ob.replaces.map(id => curriculum.index.id[id] || id)
    }
}

// create new curriculum instance

// create an async function, so we can use await inside it
async function main() {
    
    // read the list of all contexts from the file /curriculum-contexts.txt
    const schemas = fs.readFileSync('curriculum-contexts.txt','utf8')
        .split(/\n/g)             // split the file on newlines
        .map(line => line.trim()) // remove leading and trailing whitespace
        .filter(Boolean)          // filter empty lines

    // load all contexts from the editor/ and master/ folders
    let loadedSchemas = schemas.map(
        schema => curriculum.loadContextFromFile(schema, './editor/'+schema+'/context.json')
    )

    // wait untill all contexts have been loaded, and return the promise values as schemas
    Promise.allSettled(loadedSchemas).then((settledSchemas) => {
        loadedSchemas = settledSchemas.map(promise => promise.value)
    })
    .then(() => {
        // set type, class and id for each object
        Object.keys(curriculum.index.id).forEach(id => {
            let type = curriculum.index.type[id]
            let ob = curriculum.index.id[id]
            JSONTag.setAttribute(ob, 'class', capitalizeFirstLetter(snakeToCamel(type)))
            JSONTag.setAttribute(ob, 'id', '/uuid/'+id)
            // replace all entity_id properties with entity arrays of actual objects
            linkIds(ob)
        })

        Object.keys(curriculum.data).forEach(datatype => {
            let camelCase = capitalizeFirstLetter(snakeToCamel(datatype))
            if (camelCase!==datatype) {
                curriculum.data[camelCase] = curriculum.data[datatype]
                delete curriculum.data[datatype]
            }
        })
    })
    .then(() => {
        return Promise.allSettled(loadedSchemas.map(async schema => {
            let name = schema.$id.substring('https://opendata.slo.nl/curriculum/schemas/curriculum-'.length)
            name = name.substring(0, name.length - '/context.json'.length)
            parsed[name] = await curriculum.parseSchema(schema)

            let cName = capitalizeFirstLetter(snakeToCamel(name))
            storeSchema.contexts[cName] = {
                label: name
            }
            JSONTag.setAttribute(storeSchema.contexts[cName], 'id', '/schema/contexts/'+cName+'/')
            let typeDef = {
                label: '',
                properties: {},
                children: {}
            }
            Object.keys(parsed[name].definitions).forEach(type => {
                if (['inhoud','uuid','uuidArray','baseid','base','allEntities'].indexOf(type)!=-1) {
                    return
                }
                let cType = capitalizeFirstLetter(snakeToCamel(type))
                if (!storeSchema.types[cType]) {
                    storeSchema.types[cType] = JSON.parse(JSON.stringify(typeDef))
                }
                if (!JSONTag.getAttribute(storeSchema.types[cType], 'id')) {
                    JSONTag.setAttribute(storeSchema.types[cType], 'id', '/schema/types/'+cType+'/')
                }
                if (['Examenprogramma','Vakleergebied','LdkVakleergebied','Syllabus','FoDomein','RefVakleergebied','ErkGebied','ErkTaalprofiel',
                    'ExamenprogrammaBgProfiel','KerndoelVakleergebied','InhVakleergebied','NhCategorie','FoSet'].includes(cType)) {
                    storeSchema.types[cType].root = true
                }
                let cTypeDef = storeSchema.types[cType]
                cTypeDef.label = type
                Object.keys(parsed[name].definitions[type].properties).forEach(prop => {
                    if (prop.substring(prop.length-3)=='_id') {
                        prop = prop.substring(0, prop.length-3)
                        let CamelProp = capitalizeFirstLetter(snakeToCamel(prop))
                        if (!storeSchema.types[CamelProp]) {
                            storeSchema.types[CamelProp] = JSON.parse(JSON.stringify(typeDef))
                            storeSchema.types[CamelProp].label = prop
                        }
                        cTypeDef.children[CamelProp] = storeSchema.types[CamelProp]
			if (CamelProp=='Vakleergebied') {
				let vtype = parsed[name].definitions[type].properties.vakleergebied_id.type
				if (vtype!='array') {
					storeSchema.types[cType].properties.Vakleergebied = {
						type: "object"
					}
				}
			}
                    } else {
                        if (!storeSchema.properties[prop]) {
                            storeSchema.properties[prop] = parsed[name].definitions[type].properties[prop]
                            if (parsed[name].definitions[type].required?.includes(prop)) {
                                storeSchema.properties[prop].required = true
                            }
                            if (['replaces','replacedBy','unreleased','dirty','id'].indexOf(prop)!=-1) {
                                storeSchema.properties[prop].editable = false
                            }
                            JSONTag.setAttribute(storeSchema.properties[prop], 'id','/schema/properties/'+prop+'/')
                        }
                        cTypeDef.properties[prop] = storeSchema.properties[prop]
                    }
                })
                storeSchema.contexts[cName][cType] = cTypeDef
                storeSchema.types[cType] = cTypeDef
            })
            return true
        }))
    })
    .then(() => {
        meta.schema = storeSchema
        makeNiveauIndex(curriculum.data)
        // save as single jsontag blob
        let fileData = JSONTag.stringify(curriculum.data, null, 4)
        fs.writeFileSync('../data/curriculum.jsontag', fileData)
        let schemaData = JSONTag.stringify(storeSchema, null, 4)
        fs.writeFileSync('../data/schema.jsontag', schemaData)
    })
}

main()
// load the curriculum-js library
import Curriculum from 'curriculum-js'
// load node filesystem support
import fs from 'fs'
import repl from 'repl';
import JSONTag from '@muze-nl/jsontag'

const snakeToCamel = str =>
  str.replace(/([-_][a-z])/g, group =>
    group
      .toUpperCase()
      .replace('-', '')
      .replace('_', '')
  );

const capitalizeFirstLetter = str => 
  str[0].toUpperCase()+str.substring(1)

// create an async function, so we can use await inside it
async function main() {

    // create new curriculum instance
    const curriculum = new Curriculum()
    
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
        })

        Object.keys(curriculum.data).forEach(datatype => {
            let camelCase = capitalizeFirstLetter(snakeToCamel(datatype))
            if (camelCase!==datatype) {
                curriculum.data[camelCase] = curriculum.data[datatype]
                delete curriculum.data[datatype]
            }
        })

        // save as single jsontag blob
        let fileData = JSONTag.stringify(curriculum.data, null, 4)
        fs.writeFileSync('../data/curriculum.jsontag', fileData);
    })
}

main()

export function updateNiveauIndex(){
    entity = fromIndex(change.id)
    const child = entity

    // find parent(s)
    function findParents(child){
        const parentProps = Object.getOwnPropertyNames(child)
            .filter(prop => prop[0].match(/[A-Z]/))
            .filter(prop => !Object.getOwnPropertyDescriptor(child, prop).enumerable)
        const parents = new Set(parentProps.map(parentProp => child[parentProp]).flat()) // how well does this handle null or undefined?
        return Array.from(parents) // might want to add a '?? []' to it
    }

    function addNiveauWhenNeeded(entity){
        // check all children, make a set of their niveau and niveauIndexes
        // if any of the children contain that niveau.title: add it

    }

    function removeNiveauWhenNeeded(entity){
        // check all children, make a set of their niveau and niveauIndexes
        // if none of the children contain that niveau.title: remove it
    }


    function parentChange(child){
        let parents = findParents(child)
        if( parents == null){ // return Array.from(parents) in findParents() might throw a borken.
            return
        }

        for(let parent of parents){
            addNiveauWhenNeeded(parent)
            removeNiveauWhenNeeded(parent)

            // recursive call, 
            // stop heuristic unclear -> parent.niveau / parent.niveauIndex difference unclear to Govert 
            // -> niveau is a leaf (cannot happen on parent) (?)
            // -> niveauIndex is only on a parent, or parent.root (?)
            if (parent != parent.root){
                parentChange(parent)
            } else if ( parent.nivauIndex ) {
                parentChange(parent)
            }
        }
    }
}


export default function makeNiveauIndex(curriculum) {

	var niveauIndex = [];

	// ignore related links that aren't parent-child relations		
	var ignore = {
		'alias': ['parent_id'],
		'ldk_vakleergebied': ['vakleergebied_id'],
		'ldk_vakkern': ['lpib_vakkern_id'],
		'ldk_vaksubkern': ['lpib_vaksubkern_id'],
		'ldk_vakinhoud': ['lpib_vakinhoud_id'],
		'kerndoel_vakleergebied': ['vakleergebied_id'],
		'examenprogramma_vakleergebied': ['vakleergebied_id'],
		'lpib_leerlijn': ['vakleergebied_id', 'lpib_vakinhoud_id'],
		'lpib_vakkencluster': ['vakleergebied_id'],
		'lpib_vakleergebied': ['vakleergebied_id'],
		'inh_vakleergebied': ['vakleergebied_id'],
		'ref_vakleergebied': ['vakleergebied_id'],
		'erk_vakleergebied': ['vakleergebied_id'],
		'doelniveau': ['kerndoel_id','examenprogramma_eindterm_id','examenprogramma_subdomein_id','examenprogramma_domein_id','doel_id']
	};
	
	function shouldIgnore(section, property) {
		return (ignore[section] && ignore[section].indexOf(property)!==-1);
	}
	
	// deprecate all entities with 'deleted' true or 1
	for (let entityId in curriculum.index.id) {
		let entity = curriculum.index.id[entityId]
		if (entity.deleted) {
			console.log('deleted '+entity.id)
			curriculum.deprecate(entity)
			entity.deprecated = true
		} else {
			delete entity.deprecated
		}
		if (entity.replaced_by) {
			entity.replacedBy = entity.replaced_by
			delete entity.replaced_by
			entity.deprecated = true
		}
	}

	function getNiveauIndex(niveauId) {
		var niveauOb = niveauIndex.filter(function(niveauOb) {
			return niveauOb.niveau_id == niveauId;
		}).pop();
		if (!niveauOb) {
			niveauOb = {
				niveau_id: niveauId,
				ldk_vakleergebied_id: [],
				ldk_vakkern_id: [],
				ldk_vaksubkern_id: [],
				ldk_vakinhoud_id: [],
				doel_id: [],
				kerndoel_id: [],
				kerndoel_vakleergebied_id: [],
				kerndoel_domein_id: [],
				kerndoel_uitstroomprofiel_id: [],
				examenprogramma_eindterm_id: [],
				examenprogramma_subdomein_id: [],
				examenprogramma_domein_id: [],
				examenprogramma_id: [],
				examenprogramma_vakleergebied_id: [],
				syllabus_specifieke_eindterm_id: [],
				syllabus_toelichting_id: [],
				syllabus_vakbegrip_id: [],
				syllabus_id: [],
				syllabus_vakleergebied_id: [],
				inh_vakleergebied_id: [],
				inh_inhoudslijn_id: [],
				inh_cluster_id: [],
				ref_vakleergebied_id: [],
				ref_domein_id: [],
				ref_subdomein_id: [],
				ref_onderwerp_id: [],
				ref_deelonderwerp_id: [],
				ref_tekstkenmerk_id: [],
				erk_vakleergebied_id: [],
				erk_gebied_id: [],
				erk_categorie_id: [],
				erk_taalactiviteit_id: [],
				erk_schaal_id: [],
				erk_candobeschrijving_id: [],
				erk_voorbeeld_id: [],
				erk_lesidee_id: [],
				nh_categorie_id: [],
				nh_sector_id: [],
				nh_schoolsoort_id: [],
				nh_leerweg_id: [],
				nh_bouw_id: [],
				nh_niveau_id: []
			};
			niveauIndex.push(niveauOb);
		}
		return niveauOb;
	}

	var seen = {};

	function addParentsToNiveauIndex(parents, niveaus, indent="") {
		if (indent==="") {
			seen = {};
		}
		if (niveaus) {
			niveaus.forEach(function(niveauId) {
				if (typeof seen[niveauId] == 'undefined') {
					seen[niveauId] = {};
				}
				var niveau = getNiveauIndex(niveauId);
				parents.forEach(function(parentId) {
					if (seen[niveauId][parentId]) {
						return;
					}
					seen[niveauId][parentId]=true;
					var parent = curriculum.index.id[parentId];
					let section = curriculum.index.type[parentId]

					if (Array.isArray(niveau[section+'_id'])) {
						if (niveau[section+'_id'].indexOf(parentId)==-1) {
							niveau[section+'_id'].push(parentId);
						}
						let myParents = curriculum.index.references[parentId]
						if (typeof myParents != 'undefined') {
							addParentsToNiveauIndex(myParents, niveaus, indent+"  ");
						}
					}
				});
			});
		}
	}

	function onlyUnique(value, index, self) {
		return self.indexOf(value)===index;
	}

	var count = 0;
	var error = 0;

	function isRootType(type) {
		return ['vakleergebied','ldk_vakleergebied','examenprogramma','syllabus', 'inh_vakleergebied'
		].indexOf(type)>=0
	}

	function addChildrenWithNiveau(entity,section,niveau_id=null) {
		function getChildren(e) {
			var childIds = []
			Object.keys(e).forEach(p => {
				if (p.substring(p.length-3)==='_id' && p.substring(0, section.length)===section ) {
					childIds = childIds.concat(e[p])
				}
			})
			let children = [... new Set(childIds)].map(id => curriculum.index.id[id])
			return children
		}
		if (!niveau_id) {
			console.log('missing niveau_id in '+entity.id+' ('+section+')')
		}
		var index = getNiveauIndex(niveau_id);
		let type = curriculum.index.type[entity.id]
		if (index[type+'_id'].indexOf(entity.id)===-1) {
			index[type+'_id'].push(entity.id)
		}
		var children = getChildren(entity);
		if (!children) {
			return
		}
		children.forEach(child => {
			addChildrenWithNiveau(child,section,niveau_id)
		})
	}

	function addEntityWithNiveau(entity, section) {
		var parents = curriculum.index.references[entity.id]
		if (!parents) {
			if (!isRootType(curriculum.index.type[entity.id])) {
				console.log('missing entity parents for '+entity.id+' '+curriculum.index.type[entity.id])
				error++
			}
			return
		}
		count++;
		if (entity.niveau_id) {
			addParentsToNiveauIndex(parents, entity.niveau_id);
			if (section == 'doelniveau') {
				entity.niveau_id.forEach(function(niveauId) {
					var index = getNiveauIndex(niveauId);
					if (entity.doel_id) {
						entity.doel_id.forEach(function(doelId) {
							if (index.doel_id.indexOf(doelId)==-1) {
								index.doel_id.push(doelId);
							}
						});
					}
					if (entity.kerndoel_id) {
						entity.kerndoel_id.forEach(function(kerndoelId) {
							if (index.kerndoel_id.indexOf(kerndoelId)==-1) {
								index.kerndoel_id.push(kerndoelId);
							}
						});
					}
				});
			} else if (['examenprogramma_eindterm','kerndoel'].includes(section)) {
				entity.niveau_id.forEach(function(niveauId) {
					var index = getNiveauIndex(niveauId);
					index[section+'_id'].push(entity.id);
				});
			} else if (['examenprogramma','syllabus'].includes(section)) {
				// add a niveauIndex entry to the section_vakleergebied entities
				entity.niveau_id.forEach(function(niveauId) {
					var index = getNiveauIndex(niveauId);
					if (Array.isArray(entity[section+'_vakleergebied_id'])) {
						entity[section+'_vakleergebied_id'].forEach(function(vlgEntityId) {
							index[section+'_vakleergebied_id'].push(vlgEntityId);
						});
					}
				})
			} else {
				console.log('unknown section for niveauIndex',section);
			}
		} else {
			console.log('no niveau_id for entity '+entity.id, section);
		}
	}

	// for each doelniveau, add its parents to the niveauIndex
	curriculum.data.doelniveau.forEach(function(entity) {
		addEntityWithNiveau(entity, 'doelniveau');
	});
	curriculum.data.kerndoel.forEach(function(entity) {
		addEntityWithNiveau(entity, 'kerndoel');
	});
	curriculum.data.examenprogramma.forEach(function(entity) {
		addEntityWithNiveau(entity, 'examenprogramma');
	});
	curriculum.data.syllabus.forEach(function(entity) {
		let ex = entity.examenprogramma_id
		if (!Array.isArray(ex)) {
			ex = [ ex ]
		}
		ex.forEach(ex_id => {
			let e = curriculum.index.id[ex_id]
			let niveau_id = e.niveau_id
			if (!niveau_id) {
				console.log(e, niveau_id)
			} else {
				if (!Array.isArray(niveau_id)) {
					niveau_id = [ niveau_id ];
				}
				niveau_id.forEach(n => addChildrenWithNiveau(entity, 'syllabus', n));
			}
		})
	});

	var c = 0;
	var total = curriculum.data.examenprogramma_eindterm.length;
	curriculum.data.examenprogramma_eindterm.forEach(function(entity) {
		c++;
		process.stdout.write("\r"+c+'/'+total+' '+entity.id);
		addEntityWithNiveau(entity, 'examenprogramma_eindterm');
	});
	console.log("\n"+count+' correct, '+error+' errors');
	return niveauIndex
}

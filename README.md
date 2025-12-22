## Notes from current WIP:

### To move the data to be useable by curriculum-store:
1. run `./init.sh` from the scripts folder
2. do an 'npm update' in the root folder ( in `curriculum-store/ here` ).
3. from the scripts folder run `node tojsontag.mjs`
4. convert the curriculum.jsontag database from the scripts folder using `node convert.mjs ../data/schema.jsontag ../data/curriculum.jsontag ../data/data.json`

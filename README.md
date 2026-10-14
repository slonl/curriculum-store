## Notes from current WIP:

### To move the data to be useable by curriculum-store:
1. run `./init.sh` from the scripts folder
2. do an 'npm update' in the root folder ( in `curriculum-store/ here` ).
3. from the scripts folder run `node tojsontag.mjs`
4. convert the curriculum.jsontag database from the scripts folder using `node convert.mjs ../data/schema.jsontag ../data/curriculum.jsontag ../data/data.jsontag`

### Query limits

Set `QUERY_MEMORY_LIMIT` to the query isolate's memory limit in MiB (default:
64). This limit is shared by normal and slow queries. Set `QUERY_TIMEOUT` to the
normal-query deadline in milliseconds (default: 1000), and
`SLOW_QUERY_TIMEOUT` to the slow-query deadline in milliseconds (default:
10000).

Large dataset scans, such as the editor orphan query, may require higher memory
and slow-query timeout values. Restart the store after changing these variables.

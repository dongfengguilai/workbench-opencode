import {createHash} from 'node:crypto';
// Fixed local port; labels derive only from maintainer-managed identities.
export function previewOrigin(username){return 'http://u-'+createHash('sha256').update(username).digest('hex').slice(0,40)+'.localhost:8445';}
export function workbenchOrigin(username){return previewOrigin(username).replace('http://','http://workbench.').replace(':8445',':8444');}

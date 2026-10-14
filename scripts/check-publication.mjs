import {readFileSync} from 'node:fs';
// Evaluate an explicit release manifest rather than bypassing TypeScript business gates.
const release=JSON.parse(readFileSync('source/publication-approval.json','utf8'));
if(release.publicCatalogueVerified!==true || !release.reviewDate || !release.hostApprovalReference || !release.legalReviewReference){
  console.error('Public deployment blocked: catalogue legality and hosting approval are unresolved. See docs/LAUNCH.md.');
  process.exit(1);
}
if(release.orderingEnabled===true){
  console.error('Online ordering requires a separate legal/business review. Do not enable it through this manifest.');process.exit(1);
}

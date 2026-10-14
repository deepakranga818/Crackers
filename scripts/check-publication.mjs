import {readFileSync} from 'node:fs';
// Evaluate explicit release records rather than bypassing TypeScript business gates.
const release=JSON.parse(readFileSync('source/publication-approval.json','utf8'));
const checklist=JSON.parse(readFileSync('source/verification.json','utf8'));
const open=Object.entries(checklist).filter(([,item])=>item.verified!==true||!item.reference);
if(release.publicCatalogueVerified!==true || !release.reviewDate || !release.hostApprovalReference || !release.legalReviewReference){
  console.error('Public deployment blocked: catalogue legality and hosting approval are unresolved. See docs/LAUNCH.md.');
  process.exit(1);
}
if(open.length){
  console.error('Public deployment blocked: unverified items in source/verification.json:');
  for(const [key,item] of open)console.error(`- ${key} (${item.group}): ${item.requires}`);
  process.exit(1);
}
if(release.orderingEnabled===true){
  console.error('Online ordering requires a separate legal/business review. Do not enable it through this manifest.');process.exit(1);
}

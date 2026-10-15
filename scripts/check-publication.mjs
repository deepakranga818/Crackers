import {readFileSync} from 'node:fs';
// Evaluate explicit release records rather than bypassing TypeScript business gates.
// Optional argv[2]: path to an alternative release manifest (used by tests).
const release=JSON.parse(readFileSync(process.argv[2]??'source/publication-approval.json','utf8'));
const checklist=JSON.parse(readFileSync('source/verification.json','utf8'));
// Struck-through MRP and "% off" claims need recorded owner confirmation before they are shown.
if(release.referencePrices?.confirmed===true&&!String(release.referencePrices.reference??'').trim()){
  console.error('referencePrices.confirmed is true but no confirmation reference is recorded in the release manifest.');
  process.exit(1);
}
if(release.audience==='private-friends'){
  // Private friends list: public approvals are not required, but it must stay unlisted.
  const hidden=readFileSync('index.html','utf8').includes('content="noindex,nofollow"')&&/^Disallow:\s*\/\s*$/m.test(readFileSync('public/robots.txt','utf8'));
  if(!hidden){console.error('Private deployment must keep noindex and a robots.txt Disallow.');process.exit(1);}
  console.log('Private friends deployment: not a public launch; licence, legal and hosting items stay unverified.');
  process.exit(0);
}
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

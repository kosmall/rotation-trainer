// `npm run forever:verify`: lists every assumption flagged verify:true, with its source note.
import { collectVerify } from '../src/forever/verify';

const items = collectVerify();
console.log(`${items.length} assumptions flagged verify:true\n`);
console.log('| File | Name | Source / note |\n|---|---|---|');
for (const a of items) console.log(`| ${a.file} | ${a.name} | ${a.source.replace(/\|/g, '/')} |`);

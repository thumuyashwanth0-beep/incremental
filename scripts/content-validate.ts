import { loadMisconceptions, loadRawQuestions } from "../src/lib/content/load";
import { validateContent } from "../src/lib/content/validate";

const { valid, errors, warnings } = validateContent(loadRawQuestions(), loadMisconceptions());
for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`\n${valid.length} valid question(s), ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);

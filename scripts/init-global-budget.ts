import { initializeGlobalBudget } from '../src/global-budget.js';
const [file, limit] = process.argv.slice(2);
if (!file || !limit) throw new Error('Usage: node dist/scripts/init-global-budget.js D:/path/budget.json TOTAL_LIMIT');
initializeGlobalBudget(file, Number(limit));
console.log('Global budget initialized; existing ledgers are never overwritten.');

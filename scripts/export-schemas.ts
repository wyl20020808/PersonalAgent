import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configSchema, editSchema, planSchema, reviewSchema } from '../src/schema.js';
import { stateSchema } from '../src/store.js';
import { deliverySchema, deliveryStateSchema } from '../src/delivery.js';

const root = fileURLToPath(new URL('../../schemas/', import.meta.url)); mkdirSync(root, { recursive: true });
for (const [name, schema] of Object.entries({ config: configSchema, plan: planSchema, edits: editSchema, review: reviewSchema, state: stateSchema, delivery: deliverySchema, 'delivery-state': deliveryStateSchema })) {
  writeFileSync(path.join(root, `${name}.schema.json`), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...schema }, null, 2));
}

/** Standalone seed runner: `npm run seed`. */
import { seedDemo } from '../bootstrap/seed.ts';
import { store } from '../core/store.ts';

seedDemo();
console.log('Agents:', store.agents.list().map((a) => `${a.name} (${a.status})`).join(', '));

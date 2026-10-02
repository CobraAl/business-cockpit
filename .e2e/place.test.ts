// Unit check of placeTask ordering. Run: npx tsx .e2e/place.test.ts
import { emptyData, isArchived, placeTask, withCol } from '../src/lib/store';
import type { AppData, Task } from '../src/types';

const mk = (id: string, col: Task['col'], position: number): Task => ({ id, title: id, col, clientId: '', projectId: '', due: '', note: '', position, doneAt: '' });
const order = (d: AppData, col: Task['col']) => d.tasks.filter((t) => t.col === col).sort((a, b) => a.position - b.position).map((t) => t.id).join('');
let fail = 0;
const eq = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${got}${ok ? '' : ' (want ' + want + ')'}`);
};
const base = (): AppData => ({ ...emptyData(), tasks: [mk('a', 'todo', 0), mk('b', 'todo', 1), mk('c', 'todo', 2), mk('x', 'done', 0)] });

eq('move c to top', order(placeTask(base(), 'c', 'todo', 'a'), 'todo'), 'cab');
eq('move a to end', order(placeTask(base(), 'a', 'todo', null), 'todo'), 'bca');
eq('move a between b and c', order(placeTask(base(), 'a', 'todo', 'c'), 'todo'), 'bac');
eq('no-op keeps object', String(placeTask(base(), 'a', 'todo', 'b') === placeTask(base(), 'a', 'todo', 'b')), 'false');
const d0 = base();
eq('no-op returns same data', String(placeTask(d0, 'a', 'todo', 'b') === d0), 'true');
eq('drop on itself is no-op', String(placeTask(d0, 'b', 'todo', 'b') === d0), 'true');
const cross = placeTask(base(), 'x', 'todo', 'b');
eq('cross-column into middle', order(cross, 'todo'), 'axbc');
eq('source column emptied', order(cross, 'done'), '');
eq('into empty column', order(placeTask(base(), 'a', 'blocked', null), 'blocked'), 'a');
// one row changed per move
const moved = placeTask(base(), 'c', 'todo', 'b');
eq('only moved row changes', String(base().tasks.filter((t, i) => JSON.stringify(t) !== JSON.stringify(moved.tasks[i])).length), '1');
// precision exhaustion: keep inserting between a and its neighbour
let d = base();
for (let k = 0; k < 80; k++) d = placeTask(d, k % 2 ? 'c' : 'b', 'todo', 'a' === 'a' ? (k % 2 ? 'b' : 'c') : null);
eq('stays consistent after 80 moves', String(new Set(d.tasks.filter((t) => t.col === 'todo').map((t) => t.position)).size), '3');
process.exitCode = fail ? 1 : 0;

// Real precision exhaustion: insert 60 cards, each one right after 'a' (before the previous one).
let e: AppData = { ...emptyData(), tasks: [mk('a', 'todo', 0), mk('b', 'todo', 1), ...Array.from({ length: 60 }, (_, k) => mk('c' + k, 'done', k))] };
let prev = 'b';
for (let k = 0; k < 60; k++) {
  e = placeTask(e, 'c' + k, 'todo', prev);
  prev = 'c' + k;
}
const col = e.tasks.filter((t) => t.col === 'todo').sort((a, b) => a.position - b.position).map((t) => t.id);
const want = ['a', ...Array.from({ length: 60 }, (_, k) => 'c' + (59 - k)), 'b'];
eq('60 nested inserts keep exact order', String(col.join(',') === want.join(',')), 'true');
eq('positions stay unique', String(new Set(e.tasks.filter((t) => t.col === 'todo').map((t) => t.position)).size), '62');

// Done date and archiving
const toDone = placeTask(base(), 'a', 'done', null).tasks.find((t) => t.id === 'a')!;
eq('entering Done stamps doneAt', String(!!toDone.doneAt && Date.now() - Date.parse(toDone.doneAt) < 5000), 'true');
const backOut = placeTask({ ...base(), tasks: [...base().tasks.filter((t) => t.id !== 'a'), toDone] }, 'a', 'todo', null).tasks.find((t) => t.id === 'a')!;
eq('leaving Done clears doneAt', JSON.stringify(backOut.doneAt), '""');
const x = base().tasks.find((t) => t.id === 'x')!;
eq('reorder inside Done keeps doneAt', placeTask({ ...base(), tasks: [...base().tasks.filter((t) => t.id !== 'x'), { ...x, doneAt: '2026-01-01T00:00:00.000Z' }, mk('y', 'done', 1)] }, 'x', 'done', null).tasks.find((t) => t.id === 'x')!.doneAt, '2026-01-01T00:00:00.000Z');
eq('withCol same column is identity', String(withCol(x, 'done') === x), 'true');
const day = 86_400_000;
eq('done 8 days ago is archived', String(isArchived({ ...x, doneAt: new Date(Date.now() - 8 * day).toISOString() })), 'true');
eq('done 6 days ago is shown', String(isArchived({ ...x, doneAt: new Date(Date.now() - 6 * day).toISOString() })), 'false');
eq('done without date is shown', String(isArchived({ ...x, doneAt: '' })), 'false');
eq('not done is never archived', String(isArchived({ ...mk('z', 'todo', 0), doneAt: new Date(Date.now() - 30 * day).toISOString() })), 'false');

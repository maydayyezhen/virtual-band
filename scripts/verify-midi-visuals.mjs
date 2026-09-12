import assert from 'node:assert/strict';
import { VisualPerformance } from '../src/midi/VisualPerformance.ts';

function fixture(notes) {
  const events = [];
  const track = { type: 'keyboard', program: 0, notes };
  const plan = { instruments: [{ assignments: [{ track, instance: 0, tier: 'lower' }] }] };
  const visual = new VisualPerformance(plan,
    note => events.push(['on', note.note]), note => events.push(['off', note.note]),
    () => events.push(['reset']));
  return { visual, events };
}
const note = (start, end, pitch = 60) => ({ start, end, note: pitch, velocity: 100 });
{
  const { visual, events } = fixture([note(0, 10)]);
  visual.update(0);
  assert.deepEqual(events, [['reset'], ['on', 60]], 'time-zero note');
  visual.seek(6);
  assert.deepEqual(events.slice(-2), [['reset'], ['on', 60]], 'long notes survive visual seek');
  visual.clear();
  visual.update(6.1);
  assert.deepEqual(events.slice(-2), [['reset'], ['on', 60]], 'paused hold resumes');
}
{
  const { visual, events } = fixture([note(0, .5), note(.5, 1)]);
  visual.update(.4);
  events.length = 0;
  visual.update(.51);
  assert.deepEqual(events, [['off', 60], ['on', 60]], 'release before retrigger');
}
{
  const { visual, events } = fixture([note(0, .5), note(.2, 1)]);
  visual.update(.4);
  events.length = 0;
  visual.update(.51);
  assert.deepEqual(events, [], 'old same-pitch off cannot clear a newer voice');
}
{
  const { visual, events } = fixture([note(0, .1), note(.2, .3), note(5, 10, 64)]);
  visual.update(0);
  events.length = 0;
  visual.update(6);
  assert.deepEqual(events, [['off', 60], ['on', 64]], 'stalled renderer only restores current pose');
  events.length = 0;
  visual.update(7);
  assert.deepEqual(events, [], 'slow frames do not keep resetting held poses');
}
console.log('MIDI visual timeline: time zero, long hold, resume, retrigger, overlap, stalled frame passed.');

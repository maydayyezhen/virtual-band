import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {MusicAnalysis} from '../src/lighting/MusicAnalysis.ts';
import {prepareSectionShow} from '../src/lighting/SectionShow.ts';
import {bohemianRhapsody, BOHEMIAN_SECTIONS} from '../src/lighting/shows/BohemianRhapsody.ts';
import {prepareMatchingShow} from '../src/shows/catalog.ts';
import {LightingSession} from '../src/lighting/LightingSession.ts';
const require=createRequire(import.meta.url), {Midi}=require('@tonejs/midi');
const rig={id:'test',fixtures:['rear','side','floor','par'].flatMap(group=>Array.from({length:group==='side'?4:group==='par'?14:6},(_,i)=>({id:`${group}-${i}`,type:group==='par'?'par':'beam',group,groups:[group,...(group==='par'&&i>=6?['front-floor']:[])],position:[i,12,-5]}))),
 pixels:Array.from({length:56},(_,i)=>({id:`pixel-${i}`,index:i%28,row:Math.floor(i/28),count:28})),gobos:Array.from({length:4},(_,i)=>({id:`gobo-${i}`,index:i}))};
const bytes=fs.readFileSync('public/examples/bohemian-rhapsody/queen.mid');
const binary=Uint8Array.from(bytes).buffer;
const music=new MusicAnalysis(binary), show=prepareSectionShow(bohemianRhapsody,music,rig);
assert.equal(music.ppq,192);
assert.equal(show.sections.length,11);
for(const chapter of BOHEMIAN_SECTIONS){const t=music.secondsAtBeat(chapter.beat);assert.ok(Math.abs(music.at(t).quarter-chapter.beat)<1e-8);assert.equal(show.evaluate(t).section,chapter.name);}
const tempo=music.secondsAtBeat(296);
assert.ok(Math.abs(music.at(tempo-.01).bpm-78)<.001);
assert.ok(Math.abs(music.at(tempo+.01).bpm-154)<.001);
assert.ok(Math.abs(music.at(tempo+.001).quarter-music.at(tempo).quarter-154*.001/60)<1e-7,'fractional ticks stay continuous');
assert.ok(music.groups.choir.length>0&&music.groups.guitar.length>0&&music.groups.kick.length>0,'raw parts remain independent of visual plan');
const sampled=[];
for(let t=0;t<=music.duration;t+=.137){const f=show.evaluate(t);sampled.push([t,f]);assert.ok(f.fixtures.every(x=>x.target.every(Number.isFinite)&&Number.isFinite(x.intensity)&&x.intensity>=0&&x.intensity<=2));assert.ok(f.gobos.every(x=>x.opacity>=0&&x.opacity<=1));}
for(const [t,f] of sampled.reverse())assert.deepEqual(show.evaluate(t),f,'reverse seeks equal initial evaluation');
assert.ok(show.evaluate(music.duration+5).fixtures.every(f=>f.intensity===0));
assert.ok(show.evaluate(music.duration+5).pixels.every(p=>p.color.every(c=>c===0)));
assert.equal((await prepareMatchingShow(binary,rig)).lighting.id,'bohemian-rhapsody');
const unrelated=new Midi();unrelated.addTrack().addNote({midi:60,time:0,duration:1,velocity:1});
assert.equal(await prepareMatchingShow(Uint8Array.from(unrelated.toArray()).buffer,rig),null,'unrelated MIDI never borrows Queen arrangement');
// A synthetic tempo change and a sustained note exercise timing and envelopes independently of the demo.
const m=new Midi();m.header.tempos=[{ticks:0,bpm:120},{ticks:480,bpm:60}];m.header.update();const track=m.addTrack();track.channel=3;track.instrument.number=52;track.addNote({midi:72,ticks:0,durationTicks:1440,velocity:.8});
const analysis=new MusicAnalysis(m.toArray());
assert.ok(Math.abs(analysis.secondsAtBeat(2)-1.5)<1e-8);assert.ok(Math.abs(analysis.at(1).quarter-1.5)<1e-8);assert.equal(analysis.at(1).choirChannel,3);assert.equal(analysis.at(1).choirNote,72);assert.ok(analysis.at(2).choir>.07,'held melody contributes after onset decay');
let writes=0,releases=0;
const session=new LightingSession({rig,acquire:()=>({apply:()=>writes++,release:()=>releases++})});
session.setShow(show,20);session.update(20);assert.equal(writes,1,'paused time does not rewrite');session.update(40);session.update(20);assert.equal(writes,3);session.setEnabled(false);assert.equal(releases,1);session.update(30);assert.equal(writes,3);session.setEnabled(true,30);assert.equal(writes,4);session.setShow(null);assert.equal(releases,2);
assert.throws(()=>show.evaluate(NaN));
console.log(`Lighting: ${sampled.length} deterministic frames, 11 chapters, tempo map, held notes, content matching, pause/seek/release passed. Duration ${music.duration.toFixed(3)} s.`);

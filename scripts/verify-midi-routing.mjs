import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { routeProgram, routeTrack, describeTrackTone } from '../src/midi/routeTracks.ts';
import { parseMidi } from '../src/midi/parseMidi.ts';
import { GENERAL_MIDI_TONES } from '../src/audio/GeneralMidiTones.ts';
const require=createRequire(import.meta.url),{Midi}=require('@tonejs/midi');

// Explicit GM boundary cases keep display policy separate from the standard sound names.
const cases=[
 [0,'Acoustic Grand Piano','piano'],[1,'Bright Acoustic Piano','piano'],[2,'Electric Grand Piano','keyboard'],[3,'Honky-tonk Piano','piano'],[4,'Electric Piano 1','keyboard'],[23,'Tango Accordion','keyboard'],
 [24,'Acoustic Guitar (nylon)','acoustic'],[25,'Acoustic Guitar (steel)','acoustic'],
 [26,'Electric Guitar (jazz)','electric'],[31,'Guitar Harmonics','electric'],
 [32,'Acoustic Bass','bass'],[37,'Slap Bass 2','bass'],[38,'Synth Bass 1','keyboard'],[39,'Synth Bass 2','keyboard'],
 [40,'Violin','violin'],[41,'Viola','violin'],[42,'Cello','cello'],[43,'Contrabass','violin'],
 [44,'Tremolo Strings','keyboard'],[45,'Pizzicato Strings','violin'],[46,'Orchestral Harp','keyboard'],
 [47,'Timpani','keyboard'],[48,'String Ensemble 1','keyboard'],[49,'String Ensemble 2','keyboard'],[127,'Gunshot','keyboard'],
 [64,'Soprano Sax','keyboard'],[65,'Alto Sax','saxophone'],[66,'Tenor Sax','keyboard'],
];
for(const [program,name,type] of cases){assert.equal(GENERAL_MIDI_TONES[program],name);assert.equal(routeProgram(program,false).type,type,`${program} ${name}`);}
assert.equal(GENERAL_MIDI_TONES.length,128);
for(let p=0;p<128;p++){
 const expected=p<=1||p===3?'piano':p===42?'cello':p===65?'saxophone':p>=24&&p<=25?'acoustic':p>=26&&p<=31?'electric':p>=32&&p<=37?'bass':(p>=40&&p<=43)||p===45?'violin':'keyboard';
 assert.equal(routeProgram(p,false).type,expected,`GM ${p}`);
 assert.equal(routeProgram(p,true).type,'drums',`percussion overrides program ${p}`);
}
for(const p of [-1,128,Infinity,NaN,44.5]){assert.equal(routeProgram(p,false).type,'keyboard');assert.match(routeProgram(p,false).reason,/无效|超出/);}

// Encode and parse real MIDI bytes, rather than testing only manually constructed track metadata.
const midi=new Midi();
for(const [program] of cases){const t=midi.addTrack();t.instrument.number=program;t.channel=0;t.addNote({midi:60,time:0,duration:1,velocity:.8});}
const drum=midi.addTrack();drum.channel=9;drum.instrument.number=47;drum.addNote({midi:36,time:0,duration:1,velocity:.8});
const parsed=parseMidi(midi.toArray());
for(const track of parsed.tracks){const before=JSON.stringify(track),routed=routeTrack(track);assert.equal(routed.notes,track.notes);assert.equal(routed.program,track.program);assert.equal(JSON.stringify(track),before);assert.equal(routed.type,routeProgram(track.program,track.isDrums).type);}
assert.equal(describeTrackTone(parsed.tracks.find(t=>t.program===47&&!t.isDrums)),'47 Timpani');
const queen=parseMidi(fs.readFileSync('public/examples/bohemian-rhapsody/queen.mid'));
assert.equal(queen.tracks.length,13);
assert.equal(routeTrack(queen.tracks.find(t=>t.program===47)).type,'keyboard');
assert.match(routeTrack(queen.tracks.find(t=>t.program===47)).reason,/定音鼓/);
assert.equal(describeTrackTone(queen.tracks.find(t=>t.program===48)),'48 String Ensemble 1');
assert.equal(routeTrack(queen.tracks.find(t=>t.program===48)).type,'keyboard','an ensemble is not a solo cello');
console.log('GM routing: all 128 programs, string/harp/timpani boundaries, percussion priority, invalid values, real MIDI round trip and Queen tracks passed.');

'use strict';

// Queen · Another One Bites the Dust camera demo.
// Phrase-aware Agent planner: MIDI musical boundaries first, camera decisions second.
// No fixed shotSeconds loop: cues land on detected rests, entrances, texture changes and fills.
(() => {
  const SONG_ID = 'dust';
  const ARRANGEMENT_ID = 'dust-phrase-demo';
  const songs = window.VIRTUAL_BAND_SONGS || {};
  let tries = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function bpmOf(song) {
    const match = String(song?.bpm ?? '').match(/[\d.]+/);
    const bpm = match ? Number(match[0]) : 110;
    return Number.isFinite(bpm) && bpm > 20 ? bpm : 110;
  }

  function descriptor(ev) {
    const instrument = ev?.i;
    if (instrument === 'lower' || instrument === 'upper') {
      return {id:'keyboard', type:'keyboard', target:'keyboard', label:'键盘', sub:instrument};
    }
    if (instrument === 'drums') return {id:'drums', type:'drums', target:'drums', label:'架子鼓', sub:'drums'};
    if (instrument === 'bass') return {id:'bass', type:'bass', target:'bass', label:'Bass', sub:'bass'};
    if (instrument === 'guitar') {
      const index = Math.max(0, Number(ev.x) || 0);
      if (index > 2) return null;
      return {id:`acoustic:${index}`, type:'acoustic', target:`acoustic ${index + 1}`, label:`木吉他 ${index + 1}`, sub:'guitar'};
    }
    if (instrument === 'electric') {
      const index = Math.max(0, Number(ev.x) || 0);
      if (index > 2) return null;
      return {id:`electric:${index}`, type:'electric', target:`electric ${index + 1}`, label:`电吉他 ${index + 1}`, sub:'electric'};
    }
    return null;
  }

  function analyze(song) {
    const groups = new Map();
    const onsets = [];
    let first = Infinity;
    let last = 0;

    for (const ev of song?.events || []) {
      const d = descriptor(ev);
      if (!d) continue;
      let group = groups.get(d.id);
      if (!group) {
        group = {...d, events:[]};
        groups.set(d.id, group);
      }
      const s = Number(ev.s ?? 0);
      const rawEnd = Number(ev.e ?? ev.ve ?? s + .08);
      const e = Number.isFinite(rawEnd) ? Math.max(s, rawEnd) : s + .08;
      const v = clamp(Number(ev.v ?? 96), 1, 127) / 127;
      const note = {s, e, v, sub:d.sub};
      group.events.push(note);
      onsets.push({t:s, target:d.target, type:d.type, v});
      first = Math.min(first, s);
      last = Math.max(last, e);
    }

    for (const group of groups.values()) group.events.sort((a, b) => a.s - b.s);
    onsets.sort((a, b) => a.t - b.t);

    return {
      song,
      bpm:bpmOf(song),
      duration:Math.max(.001, Number(song?.duration) || last || 1),
      first:Number.isFinite(first) ? first : 0,
      last,
      groups:[...groups.values()],
      onsets,
    };
  }

  function windowStats(group, start, end) {
    let hits = 0;
    let onsets = 0;
    let sustaining = 0;
    let weight = 0;
    let lower = 0;
    let upper = 0;
    let peak = 0;

    for (const ev of group.events) {
      if (ev.s > end) break;
      if (ev.e < start) continue;
      hits++;
      if (ev.s >= start && ev.s <= end) onsets++;
      if (ev.s <= start && ev.e >= start) sustaining++;
      peak = Math.max(peak, ev.v);
      const overlap = Math.max(0, Math.min(ev.e, end) - Math.max(ev.s, start));
      const contribution = .42 + ev.v * .82 + Math.min(.7, overlap * .38);
      weight += contribution;
      if (ev.sub === 'lower') lower += contribution;
      else if (ev.sub === 'upper') upper += contribution;
    }
    return {hits, onsets, sustaining, weight, lower, upper, peak};
  }

  function activeSet(analysis, start, end) {
    const set = new Set();
    for (const group of analysis.groups) {
      const stats = windowStats(group, start, end);
      if (stats.onsets || stats.sustaining || stats.weight > .9) set.add(group.target);
    }
    return set;
  }

  function onsetCount(analysis, start, end, type=null) {
    let count = 0;
    for (const onset of analysis.onsets) {
      if (onset.t < start) continue;
      if (onset.t > end) break;
      if (!type || onset.type === type) count++;
    }
    return count;
  }

  function setDistance(a, b) {
    const union = new Set([...a, ...b]);
    if (!union.size) return 0;
    let diff = 0;
    for (const item of union) if (a.has(item) !== b.has(item)) diff++;
    return diff / union.size;
  }

  function collectPhraseBoundaries(analysis) {
    const beat = 60 / analysis.bpm;
    const candidates = [];
    const add = (t, score, reason) => {
      if (!Number.isFinite(t) || t <= analysis.first + .35 || t >= analysis.last - .55) return;
      candidates.push({t, score, reasons:[reason]});
    };

    for (const group of analysis.groups) {
      let previous = null;
      for (const ev of group.events) {
        if (previous) {
          const gap = ev.s - previous.s;
          const silence = ev.s - previous.e;
          if (silence >= Math.max(.42, beat * .65)) {
            add(ev.s, 1.7 + Math.min(1.8, silence / beat * .42), `rest:${group.target}`);
          } else if (gap >= Math.max(.8, beat * 1.35)) {
            add(ev.s, 1.2 + Math.min(1.1, gap / beat * .25), `phrase:${group.target}`);
          }
          if (silence >= Math.max(1.6, beat * 2.6)) {
            add(ev.s, 3.1 + Math.min(1.2, silence / beat * .2), `reentry:${group.target}`);
          }
        }
        previous = ev;
      }
    }

    for (let i = 1; i < analysis.onsets.length; i++) {
      const gap = analysis.onsets[i].t - analysis.onsets[i - 1].t;
      if (gap >= Math.max(.48, beat * .78)) {
        add(analysis.onsets[i].t, 2.5 + Math.min(2, gap / beat * .55), 'global-breath');
      }
    }

    const probe = beat;
    const span = beat * 1.75;
    for (let t = analysis.first + span; t < analysis.last - span; t += probe) {
      const beforeSet = activeSet(analysis, t - span, t - .04);
      const afterSet = activeSet(analysis, t + .04, t + span);
      const texture = setDistance(beforeSet, afterSet);
      const beforeDensity = onsetCount(analysis, t - span, t - .04);
      const afterDensity = onsetCount(analysis, t + .04, t + span);
      const densityDelta = Math.abs(afterDensity - beforeDensity) / Math.max(3, beforeDensity + afterDensity);

      if (texture >= .24 || densityDelta >= .28) {
        add(t, 1.4 + texture * 3.2 + densityDelta * 2.2, texture >= .45 ? 'texture-change' : 'density-change');
      }

      const recentDrums = onsetCount(analysis, t - beat * .85, t, 'drums');
      const baselineDrums = onsetCount(analysis, t - beat * 3.1, t - beat * 1.1, 'drums') / 2;
      const afterDrums = onsetCount(analysis, t, t + beat * .75, 'drums');
      if (recentDrums >= 4 && recentDrums > Math.max(2, baselineDrums * 1.65) && afterDrums <= recentDrums) {
        add(t, 2.6 + Math.min(1.5, recentDrums * .12), 'drum-fill');
      }
    }

    candidates.sort((a, b) => a.t - b.t);
    const clusterWindow = Math.min(.55, beat * .72);
    const clustered = [];
    for (const item of candidates) {
      const last = clustered[clustered.length - 1];
      if (last && item.t - last.t <= clusterWindow) {
        if (item.score > last.score) last.t = item.t;
        last.score += item.score * .62;
        for (const reason of item.reasons) if (!last.reasons.includes(reason)) last.reasons.push(reason);
      } else {
        clustered.push({t:item.t, score:item.score, reasons:[...item.reasons]});
      }
    }

    const minSpacing = Math.max(1.65, beat * 1.9);
    const selected = [];
    for (const item of clustered) {
      if (item.score < 1.55) continue;
      const previous = selected[selected.length - 1];
      if (!previous || item.t - previous.t >= minSpacing) {
        selected.push(item);
      } else if (item.score > previous.score * 1.12) {
        selected[selected.length - 1] = item;
      } else {
        previous.score += item.score * .18;
        for (const reason of item.reasons) if (!previous.reasons.includes(reason)) previous.reasons.push(reason);
      }
    }

    return selected;
  }

  function wasQuiet(group, t, beat) {
    const lookback = Math.max(2.2, beat * 3.2);
    for (const ev of group.events) {
      if (ev.s >= t - .18) break;
      if (ev.e >= t - lookback && ev.s <= t - .18) return false;
    }
    return true;
  }

  function viewFor(candidate, serial) {
    if (candidate.type === 'keyboard') {
      if (candidate.stats.lower > candidate.stats.upper * 1.35) return 'observeLower';
      if (candidate.stats.upper > candidate.stats.lower * 1.35) return 'observeUpper';
      return 'observeAll';
    }
    if (candidate.type === 'drums') return ['observeAll','observeLeft','observeRight'][serial % 3];
    if (candidate.type === 'bass') return serial % 3 === 1 ? 'neck' : 'overall';
    if (candidate.type === 'electric' || candidate.type === 'acoustic') return serial % 3 === 2 ? 'neck' : 'overall';
    return 'overall';
  }

  function buildPlan(song) {
    const analysis = analyze(song);
    if (!analysis.groups.length) return null;
    const beat = 60 / analysis.bpm;
    const boundaries = collectPhraseBoundaries(analysis);
    const cues = [{p:0, t:0, kind:'stage', view:'front', label:'开场全景', phrase:{reasons:['start']}}];
    const lastShown = new Map();
    const shownCount = new Map();
    let lastTarget = 'stage';
    let serial = 0;
    let instrumentCuesSinceStage = 0;
    let lastCueTime = 0;

    for (let bi = 0; bi < boundaries.length && serial < 84; bi++) {
      const boundary = boundaries[bi];
      const t = boundary.t;
      const nextT = boundaries[bi + 1]?.t ?? Math.min(analysis.last, t + beat * 8);
      const phraseEnd = Math.min(nextT, t + Math.max(2.2, beat * 7));
      if (t - lastCueTime < Math.max(1.55, beat * 1.7)) continue;

      const candidates = [];
      for (const group of analysis.groups) {
        const stats = windowStats(group, Math.max(0, t - .12), phraseEnd);
        if (!stats.hits || (!stats.onsets && !stats.sustaining)) continue;

        const since = t - (lastShown.get(group.target) ?? -999);
        const count = shownCount.get(group.target) || 0;
        const entrance = wasQuiet(group, t, beat) && stats.onsets > 0;

        let score = stats.weight;
        if (entrance) score *= 1.82;
        score *= clamp(.65 + since / Math.max(9, beat * 15), .65, 1.85);
        score /= 1 + count * .075;
        if (group.type === 'bass' && !entrance) score *= .82;
        if (group.target === lastTarget) score *= .31;
        if (stats.onsets >= 2 && stats.peak > .88) score *= 1.1;
        if (boundary.reasons.some(r => r === `reentry:${group.target}` || r === `rest:${group.target}`)) score *= 1.3;

        candidates.push({...group, stats, score, entrance});
      }
      candidates.sort((a, b) => b.score - a.score);

      const activeCount = candidates.filter(c => c.stats.weight >= 1.0).length;
      const strongStructuralBoundary = boundary.score >= 3.2 || boundary.reasons.some(r => ['global-breath','texture-change','drum-fill'].includes(r));
      const stageSlot = activeCount >= 3 && instrumentCuesSinceStage >= 3 && strongStructuralBoundary;

      if (stageSlot || !candidates.length) {
        const stageViews = ['front','left','right','front','top'];
        const view = stageViews[Math.floor(serial / 4) % stageViews.length];
        cues.push({
          p:clamp(t / analysis.duration, 0, 1), t,
          kind:'stage', view,
          label:activeCount >= 4 ? '段落转换 · 合奏' : '段落转换 · 舞台关系',
          phrase:{score:Number(boundary.score.toFixed(2)), reasons:[...boundary.reasons], end:phraseEnd},
        });
        lastTarget = 'stage';
        instrumentCuesSinceStage = 0;
      } else {
        let chosen = candidates[0];
        if (chosen.target === lastTarget && candidates[1] && candidates[1].score >= chosen.score * .42) chosen = candidates[1];

        const view = viewFor(chosen, serial);
        cues.push({
          p:clamp(t / analysis.duration, 0, 1), t,
          kind:'instrument', target:chosen.target, view,
          label:`${chosen.label}${chosen.entrance ? ' · 乐句进入' : ''}`,
          midi:{
            hits:chosen.stats.hits,
            onsets:chosen.stats.onsets,
            weight:Number(chosen.stats.weight.toFixed(2)),
          },
          phrase:{score:Number(boundary.score.toFixed(2)), reasons:[...boundary.reasons], end:phraseEnd},
        });
        lastShown.set(chosen.target, t);
        shownCount.set(chosen.target, (shownCount.get(chosen.target) || 0) + 1);
        lastTarget = chosen.target;
        instrumentCuesSinceStage++;
      }

      lastCueTime = t;
      serial++;
    }

    const end = Math.min(analysis.duration - .2, Math.max(0, analysis.last - .75));
    if (end > lastCueTime + 1.2) {
      cues.push({p:clamp(end / analysis.duration, 0, 1), t:end, kind:'stage', view:'front', label:'收尾全景', phrase:{reasons:['ending']}});
    }

    return {
      id:ARRANGEMENT_ID,
      song:SONG_ID,
      label:'Queen · Another One Bites the Dust · Phrase Agent',
      midiGrounded:true,
      midiGuard:true,
      phraseAware:true,
      generatedAt:Date.now(),
      analysis:{bpm:analysis.bpm, boundaries:boundaries.length},
      cues,
    };
  }

  function attach() {
    const api = window.VirtualBandAgentCamera;
    const song = songs[SONG_ID];
    const songSelect = document.getElementById('bp-song');
    if (!api || !song || !songSelect) return false;

    const plan = buildPlan(song);
    if (!plan) return false;
    api.register(plan);
    api.activate(ARRANGEMENT_ID);

    if (songSelect.value !== SONG_ID) {
      songSelect.value = SONG_ID;
      songSelect.dispatchEvent(new Event('change', {bubbles:true}));
    }

    const distribution = {};
    const intervals = [];
    for (let i = 0; i < plan.cues.length; i++) {
      const cue = plan.cues[i];
      const key = cue.kind === 'instrument' ? cue.target : 'stage';
      distribution[key] = (distribution[key] || 0) + 1;
      if (i) intervals.push(Number((cue.t - plan.cues[i - 1].t).toFixed(2)));
    }
    const avgInterval = intervals.length ? intervals.reduce((a,b) => a+b, 0) / intervals.length : 0;
    console.info('[Agent Camera] Queen phrase-aware MIDI plan ready', {
      cues:plan.cues.length,
      detectedBoundaries:plan.analysis.boundaries,
      averageShotSeconds:Number(avgInterval.toFixed(2)),
      shotIntervals:intervals,
      distribution,
    });
    return true;
  }

  function wait() {
    if (attach()) return;
    if (++tries < 600) requestAnimationFrame(wait);
    else console.warn('[Agent Camera] Queen phrase-aware MIDI demo could not attach.');
  }

  wait();
})();

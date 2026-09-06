'use strict';

// Queen · Another One Bites the Dust camera demo.
// Generated from the loaded MIDI, not from hand-written percentages. The planner
// deliberately balances long-running parts (especially Bass) against fresh entrances.
(() => {
  const SONG_ID = 'dust';
  const ARRANGEMENT_ID = 'dust-midi-demo';
  const songs = window.VIRTUAL_BAND_SONGS || {};
  let tries = 0;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
      group.events.push({s, e, v, sub:d.sub});
      first = Math.min(first, s);
      last = Math.max(last, e);
    }
    for (const group of groups.values()) group.events.sort((a, b) => a.s - b.s);
    return {
      duration:Math.max(.001, Number(song?.duration) || last || 1),
      first:Number.isFinite(first) ? first : 0,
      last,
      groups:[...groups.values()],
    };
  }

  function statsAt(group, t, ahead=2.6, back=.22) {
    const start = Math.max(0, t - back);
    const end = t + ahead;
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
      if (ev.s >= t - .08 && ev.s <= t + 1.55) onsets++;
      if (ev.s <= t && ev.e >= t) sustaining++;
      peak = Math.max(peak, ev.v);
      const overlap = Math.max(0, Math.min(ev.e, end) - Math.max(ev.s, start));
      const contribution = .42 + ev.v * .82 + Math.min(.62, overlap * .34);
      weight += contribution;
      if (ev.sub === 'lower') lower += contribution;
      else if (ev.sub === 'upper') upper += contribution;
    }
    return {hits, onsets, sustaining, weight, lower, upper, peak};
  }

  function wasQuiet(group, t) {
    for (const ev of group.events) {
      if (ev.s >= t - .45) break;
      if (ev.e >= t - 3.1 && ev.s <= t - .45) return false;
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

    // Slightly shorter holds than Wish because this groove is rhythmically clearer.
    const shotSeconds = 4.7;
    const cues = [{p:0, t:0, kind:'stage', view:'front', label:'开场全景'}];
    const lastShown = new Map();
    const shownCount = new Map();
    let lastTarget = 'stage';
    let serial = 0;
    let t = Math.max(1.7, analysis.first + .18);

    while (t < Math.min(analysis.duration - 2.0, analysis.last + .7) && serial < 84) {
      const candidates = [];
      for (const group of analysis.groups) {
        const stats = statsAt(group, t);
        // No onset and no held note means the instrument is not eligible for a close shot.
        if (!stats.hits || (!stats.onsets && !stats.sustaining)) continue;

        const since = t - (lastShown.get(group.target) ?? -999);
        const count = shownCount.get(group.target) || 0;
        const entrance = wasQuiet(group, t) && stats.onsets > 0;

        let score = stats.weight;
        if (entrance) score *= 1.72;

        // Coverage debt: an active instrument that has not been seen for a while climbs fast.
        score *= clamp(.68 + since / 13.5, .68, 1.72);
        score /= 1 + count * .07;

        // A continuously active part (the famous Bass line here) should remain important,
        // but must not lock the programme output forever.
        if (group.type === 'bass' && !entrance) score *= .86;
        if (group.target === lastTarget) score *= .34;

        // Fresh high-velocity entries deserve a little extra attention.
        if (stats.onsets >= 2 && stats.peak > .88) score *= 1.12;

        candidates.push({...group, stats, score, entrance});
      }
      candidates.sort((a, b) => b.score - a.score);

      const activeCount = candidates.filter(c => c.stats.weight >= 1.05).length;
      const stageSlot = serial > 0 && serial % 5 === 0 && activeCount >= 3;

      if (stageSlot || !candidates.length) {
        const stageViews = ['front','left','right','front','top'];
        const view = stageViews[Math.floor(serial / 5) % stageViews.length];
        cues.push({
          p:clamp(t / analysis.duration, 0, 1), t,
          kind:'stage', view,
          label:activeCount >= 4 ? '合奏全景' : '舞台关系',
        });
        lastTarget = 'stage';
      } else {
        let chosen = candidates[0];
        // If the leader was just shown, accept a genuinely active runner-up even when
        // its raw activity is lower. This is the anti-bass-lock test for this song.
        if (chosen.target === lastTarget && candidates[1] && candidates[1].score >= chosen.score * .42) {
          chosen = candidates[1];
        }
        const view = viewFor(chosen, serial);
        cues.push({
          p:clamp(t / analysis.duration, 0, 1), t,
          kind:'instrument', target:chosen.target, view,
          label:`${chosen.label}${chosen.entrance ? ' · 新进入' : ''}`,
          midi:{
            hits:chosen.stats.hits,
            onsets:chosen.stats.onsets,
            weight:Number(chosen.stats.weight.toFixed(2)),
          },
        });
        lastShown.set(chosen.target, t);
        shownCount.set(chosen.target, (shownCount.get(chosen.target) || 0) + 1);
        lastTarget = chosen.target;
      }

      serial++;
      t += activeCount >= 4 ? shotSeconds * .90 : shotSeconds;
    }

    const end = Math.min(analysis.duration - .2, Math.max(0, analysis.last - .9));
    if (end > 0) cues.push({p:clamp(end / analysis.duration, 0, 1), t:end, kind:'stage', view:'front', label:'收尾全景'});

    return {
      id:ARRANGEMENT_ID,
      song:SONG_ID,
      label:'Queen · Another One Bites the Dust · MIDI Agent',
      midiGrounded:true,
      midiGuard:true,
      generatedAt:Date.now(),
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

    // This branch is currently testing the Queen arrangement, so boot directly into it.
    // Users can still choose another song afterwards from the normal song library.
    if (songSelect.value !== SONG_ID) {
      songSelect.value = SONG_ID;
      songSelect.dispatchEvent(new Event('change', {bubbles:true}));
    }

    const distribution = {};
    for (const cue of plan.cues) {
      const key = cue.kind === 'instrument' ? cue.target : 'stage';
      distribution[key] = (distribution[key] || 0) + 1;
    }
    console.info('[Agent Camera] Queen MIDI plan ready', {cues:plan.cues.length, distribution});
    return true;
  }

  function wait() {
    if (attach()) return;
    if (++tries < 600) requestAnimationFrame(wait);
    else console.warn('[Agent Camera] Queen MIDI demo could not attach.');
  }

  wait();
})();

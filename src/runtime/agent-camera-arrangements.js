'use strict';

// Agent camera layer. The Agent plan must be grounded in the loaded MIDI data.
// Priority: user manual control > Agent arrangement > MIDI auto director.
(() => {
  const $ = id => document.getElementById(id);
  const songs = window.VIRTUAL_BAND_SONGS || {};
  const stage = $('stage');
  const menu = $('camera-menu');
  const songSelect = $('bp-song');
  const modeSelect = $('bp-mode');
  const playButton = $('bp-play');
  const progress = $('bp-progress');
  const STORE = 'vb-agent-camera-arrangement';
  const AUTO_STORE = 'vb-director-enabled';
  const TICK = 120;
  const MANUAL_HOLD = 8000;

  const registry = new Map();
  const analysisCache = new Map();
  let camera = null;
  let director = null;
  const storedArrangement = localStorage.getItem(STORE);
  let selectedId = storedArrangement === null || storedArrangement === 'wish-demo' ? 'wish-midi-demo' : storedArrangement;
  let activeRun = null;
  let cueIndex = 0;
  let lastProgress = 0;
  let manualUntil = 0;
  let autoSuspended = false;
  let autoWasEnabled = false;
  let attached = false;
  let tries = 0;
  let timer = 0;

  const clamp = (v,a,b) => Math.min(b, Math.max(a,v));

  function describeEvent(ev) {
    const i = ev?.i;
    if (i === 'lower' || i === 'upper') return {id:'keyboard', type:'keyboard', target:'keyboard', label:'键盘', sub:i};
    if (i === 'drums') return {id:'drums', type:'drums', target:'drums', label:'架子鼓', sub:'drums'};
    if (i === 'bass') return {id:'bass', type:'bass', target:'bass', label:'Bass', sub:'bass'};
    if (i === 'guitar') {
      const index = Math.max(0, Number(ev.x) || 0);
      if (index > 2) return null;
      return {id:`acoustic:${index}`, type:'acoustic', target:`acoustic ${index + 1}`, label:`木吉他 ${index + 1}`, sub:'guitar'};
    }
    if (i === 'electric') {
      const index = Math.max(0, Number(ev.x) || 0);
      if (index > 2) return null;
      return {id:`electric:${index}`, type:'electric', target:`electric ${index + 1}`, label:`电吉他 ${index + 1}`, sub:'electric'};
    }
    return null;
  }

  function analyzeSong(songId) {
    if (analysisCache.has(songId)) return analysisCache.get(songId);
    const song = songs[songId];
    if (!song || !Array.isArray(song.events)) return null;
    const groups = new Map();
    let first = Infinity, last = 0;
    for (const ev of song.events) {
      const d = describeEvent(ev);
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
      group.events.push({s,e,v,sub:d.sub});
      first = Math.min(first, s);
      last = Math.max(last, e);
    }
    for (const group of groups.values()) group.events.sort((a,b) => a.s - b.s);
    const result = {
      song,
      duration: Math.max(.001, Number(song.duration) || last || 1),
      first: Number.isFinite(first) ? first : 0,
      last,
      groups:[...groups.values()],
      byTarget:new Map([...groups.values()].map(group => [group.target, group])),
    };
    analysisCache.set(songId, result);
    return result;
  }

  function statsAt(group, t, ahead=2.8, back=.25) {
    const start = Math.max(0, t - back);
    const end = t + ahead;
    let hits = 0, onsets = 0, sustaining = 0, weight = 0, lower = 0, upper = 0;
    for (const ev of group.events) {
      if (ev.s > end) break;
      if (ev.e < start) continue;
      hits++;
      if (ev.s >= t - .08 && ev.s <= t + 1.6) onsets++;
      if (ev.s <= t && ev.e >= t) sustaining++;
      const overlap = Math.max(0, Math.min(ev.e, end) - Math.max(ev.s, start));
      const contribution = .45 + ev.v * .8 + Math.min(.65, overlap * .35);
      weight += contribution;
      if (ev.sub === 'lower') lower += contribution;
      else if (ev.sub === 'upper') upper += contribution;
    }
    return {hits,onsets,sustaining,weight,lower,upper};
  }

  function quietBefore(group, t) {
    let hits = 0;
    for (const ev of group.events) {
      if (ev.s >= t - .45) break;
      if (ev.e >= t - 3.0 && ev.s <= t - .45) hits++;
    }
    return hits === 0;
  }

  function chooseView(candidate, serial) {
    if (candidate.type === 'keyboard') {
      if (candidate.stats.lower > candidate.stats.upper * 1.35) return 'observeLower';
      if (candidate.stats.upper > candidate.stats.lower * 1.35) return 'observeUpper';
      return 'observeAll';
    }
    if (candidate.type === 'drums') return ['observeAll','observeLeft','observeRight'][serial % 3];
    if (candidate.type === 'electric' || candidate.type === 'acoustic' || candidate.type === 'bass') {
      return serial % 3 === 1 ? 'neck' : 'overall';
    }
    return 'overall';
  }

  function buildMidiArrangement(songId, options={}) {
    const analysis = analyzeSong(songId);
    if (!analysis) return null;
    const duration = analysis.duration;
    const shotSeconds = clamp(Number(options.shotSeconds) || 5.4, 4.2, 8.0);
    const id = options.id || `${songId}-midi-plan`;
    const label = options.label || `${songId} · MIDI 分析编排`;
    const cues = [{p:0, t:0, kind:'stage', view:'front', label:'开场全景'}];
    const lastShown = new Map();
    const shownCount = new Map();
    let lastTarget = '';
    let serial = 0;
    let t = Math.max(2.0, analysis.first + .25);

    while (t < Math.min(duration - 2.2, analysis.last + .8) && serial < 72) {
      const candidates = [];
      for (const group of analysis.groups) {
        const stats = statsAt(group, t);
        if (!stats.hits || (!stats.onsets && !stats.sustaining)) continue;
        const since = t - (lastShown.get(group.target) ?? -999);
        const count = shownCount.get(group.target) || 0;
        const entrance = quietBefore(group, t) && stats.onsets > 0;
        let score = stats.weight * (entrance ? 1.55 : 1);
        score *= clamp(.72 + since / 18, .72, 1.45);
        score /= 1 + count * .055;
        if (group.target === lastTarget) score *= .48;
        candidates.push({...group, stats, score, entrance});
      }
      candidates.sort((a,b) => b.score - a.score);

      const activeCount = candidates.filter(c => c.stats.weight >= 1.1).length;
      const stageSlot = serial > 0 && serial % 4 === 0 && activeCount >= 3;
      if (stageSlot || !candidates.length) {
        const stageViews = ['front','left','right','front','top'];
        const view = stageViews[Math.floor(serial / 4) % stageViews.length];
        cues.push({p:clamp(t / duration,0,1), t, kind:'stage', view, label:activeCount >= 4 ? '合奏全景' : '舞台关系'});
        lastTarget = 'stage';
      } else {
        let chosen = candidates[0];
        if (chosen.target === lastTarget && candidates[1] && candidates[1].score >= chosen.score * .55) chosen = candidates[1];
        const view = chooseView(chosen, serial);
        cues.push({
          p:clamp(t / duration,0,1), t, kind:'instrument', target:chosen.target, view,
          label:`${chosen.label}${chosen.entrance ? ' · 进入' : ''}`,
          midi:{hits:chosen.stats.hits, weight:Number(chosen.stats.weight.toFixed(2))},
        });
        lastShown.set(chosen.target, t);
        shownCount.set(chosen.target, (shownCount.get(chosen.target) || 0) + 1);
        lastTarget = chosen.target;
      }
      serial++;
      t += activeCount >= 4 ? shotSeconds * .92 : shotSeconds;
    }

    const endTime = Math.min(duration - .25, Math.max(0, analysis.last - 1.0));
    if (endTime > 0) cues.push({p:clamp(endTime / duration,0,1), t:endTime, kind:'stage', view:'front', label:'收尾全景'});
    return {id, song:songId, label, midiGrounded:true, midiGuard:true, generatedAt:Date.now(), cues};
  }

  function register(arrangement) {
    if (!arrangement?.id || !arrangement?.song || !Array.isArray(arrangement.cues)) return false;
    const analysis = analyzeSong(arrangement.song);
    const duration = analysis?.duration || 1;
    const cues = arrangement.cues
      .map(cue => {
        const t = Number(cue.t);
        const p = Number.isFinite(Number(cue.p)) ? Number(cue.p) : (Number.isFinite(t) ? t / duration : NaN);
        return {...cue, p, t:Number.isFinite(t) ? t : p * duration};
      })
      .filter(cue => Number.isFinite(cue.p) && cue.p >= 0 && cue.p <= 1)
      .sort((a,b) => a.p - b.p);
    registry.set(arrangement.id, {...arrangement, cues});
    rebuildSelect();
    return true;
  }

  function isPlaying() {
    return modeSelect?.value === 'song' && /停止/.test(playButton?.textContent || '');
  }

  function progressRatio() {
    const p = parseFloat(progress?.style.width || '');
    return Number.isFinite(p) ? clamp(p / 100, 0, 1) : 0;
  }

  function resolveRoot(target) {
    const text = String(target || '').toLowerCase();
    const roots = camera?.roots || [];
    if (text === 'keyboard' || text.includes('键盘')) return roots.find(r => (r.name || '').includes('dual-tier')) || null;
    if (text === 'drums' || text.includes('鼓')) return roots.find(r => (r.name || '').includes('Band Drums')) || null;
    if (text === 'bass') return roots.find(r => (r.name || '').includes('Fingered Bass')) || null;
    let m = text.match(/(?:acoustic|木吉他)\s*(\d+)?/);
    if (m) {
      const index = Math.max(1, Number(m[1]) || 1);
      return roots.find(r => new RegExp(`Wish Acoustic ${index}$`).test(r.name || '')) || null;
    }
    m = text.match(/(?:electric|电吉他)\s*(\d+)?/);
    if (m) {
      const index = Math.max(1, Number(m[1]) || 1);
      return roots.find(r => new RegExp(`Electric ${index}$`).test(r.name || '')) || null;
    }
    return null;
  }

  function normalizeView(root, view) {
    const name = root?.name || '';
    if (view !== 'overall') return view;
    if (name.includes('dual-tier')) return 'observeAll';
    if (name.includes('Band Drums')) return 'observeAll';
    return view;
  }

  function cueIsMidiValid(arrangement, cue) {
    if (cue.kind !== 'instrument' || arrangement.midiGuard === false) return true;
    const analysis = analyzeSong(arrangement.song);
    const group = analysis?.byTarget.get(cue.target);
    if (!group) return false;
    const t = Number.isFinite(Number(cue.t)) ? Number(cue.t) : cue.p * analysis.duration;
    const stats = statsAt(group, t, 2.3, .35);
    return stats.hits > 0 && (stats.onsets > 0 || stats.sustaining > 0);
  }

  function setStatus(text, active=false) {
    const status = $('camera-agent-status');
    const section = menu?.querySelector('.camera-agent-section');
    if (status) status.textContent = text;
    section?.classList.toggle('active', active);
  }

  function suspendAuto() {
    if (autoSuspended || !director) return;
    autoWasEnabled = !!director.state?.enabled;
    if (autoWasEnabled) {
      director.disable();
      // This is a temporary override, not a user preference change.
      localStorage.setItem(AUTO_STORE, '1');
    }
    autoSuspended = true;
  }

  function restoreAuto() {
    if (!autoSuspended || !director) return;
    const restore = autoWasEnabled;
    autoSuspended = false;
    autoWasEnabled = false;
    if (restore) director.enable();
  }

  function executeCue(arrangement, cue) {
    if (!cue || performance.now() < manualUntil) return false;
    if (!cueIsMidiValid(arrangement, cue)) {
      setStatus(`跳过 · ${cue.label || cue.target} 未演奏`, true);
      return false;
    }
    if (cue.kind === 'stage') {
      camera.view(cue.view || 'front');
      setStatus(`Agent · ${cue.label || cue.view || '舞台'} · MIDI✓`, true);
      return true;
    }
    if (cue.kind === 'instrument') {
      const root = resolveRoot(cue.target);
      if (!root) return false;
      camera.focusView(root, normalizeView(root, cue.view || 'overall'));
      setStatus(`Agent · ${cue.label || cue.target} · MIDI✓`, true);
      return true;
    }
    return false;
  }

  function latestCueIndex(cues, p) {
    let i = 0;
    while (i < cues.length && cues[i].p <= p + 1e-6) i++;
    return i;
  }

  function resetRun(arrangement, p=0, executeLatest=false) {
    activeRun = arrangement;
    cueIndex = latestCueIndex(arrangement.cues, p);
    lastProgress = p;
    if (executeLatest && cueIndex > 0) executeCue(arrangement, arrangement.cues[cueIndex - 1]);
  }

  function tick() {
    camera = window.VirtualBandCamera || camera;
    director = window.VirtualBandDirector || director;
    if (!camera || !director) return;

    const arrangement = registry.get(selectedId) || null;
    const matches = arrangement && arrangement.song === songSelect?.value;
    const playing = !!matches && isPlaying();

    if (!playing) {
      if (autoSuspended) restoreAuto();
      if (arrangement && !matches) setStatus(`仅 ${arrangement.label}`, false);
      else if (arrangement) setStatus(arrangement.midiGrounded ? `等待播放 · ${arrangement.cues.length} 镜头 · MIDI✓` : '等待播放', false);
      else setStatus('自动导播', false);
      activeRun = null;
      cueIndex = 0;
      lastProgress = 0;
      manualUntil = 0;
      return;
    }

    suspendAuto();
    const p = progressRatio();
    const now = performance.now();

    if (activeRun !== arrangement || p + .015 < lastProgress) {
      resetRun(arrangement, p, true);
      return;
    }

    if (now < manualUntil) {
      setStatus(`用户接管 ${Math.max(1, Math.ceil((manualUntil - now) / 1000))}s`, true);
      lastProgress = p;
      return;
    }

    if (manualUntil) {
      manualUntil = 0;
      const currentIndex = latestCueIndex(arrangement.cues, p);
      cueIndex = Math.max(cueIndex, currentIndex);
      if (currentIndex > 0) executeCue(arrangement, arrangement.cues[currentIndex - 1]);
      lastProgress = p;
      return;
    }

    let lastDue = null;
    while (cueIndex < arrangement.cues.length && arrangement.cues[cueIndex].p <= p + 1e-6) {
      lastDue = arrangement.cues[cueIndex++];
    }
    if (lastDue) executeCue(arrangement, lastDue);
    lastProgress = p;
  }

  function manualTakeover() {
    if (!activeRun || !isPlaying()) return;
    manualUntil = performance.now() + MANUAL_HOLD;
    setStatus('用户接管 8s', true);
  }

  function activate(id) {
    selectedId = registry.has(id) ? id : '';
    localStorage.setItem(STORE, selectedId);
    activeRun = null;
    cueIndex = 0;
    lastProgress = 0;
    manualUntil = 0;
    syncSelect();
    if (!selectedId) restoreAuto();
    return selectedId;
  }

  function rebuildSelect() {
    const select = $('camera-agent-select');
    if (!select) return;
    const value = selectedId;
    select.innerHTML = '<option value="">自动 · MIDI 导播</option>' + [...registry.values()]
      .map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    select.value = registry.has(value) ? value : '';
  }

  function syncSelect() {
    const select = $('camera-agent-select');
    if (select) select.value = registry.has(selectedId) ? selectedId : '';
  }

  function setupUi() {
    const panel = menu?.querySelector('.camera-panel');
    if (!panel) return;
    panel.querySelector('.camera-agent-section')?.remove();
    const section = document.createElement('div');
    section.className = 'camera-agent-section';
    section.innerHTML = '<label>镜头编排<select id="camera-agent-select"></select></label><small id="camera-agent-status">自动导播</small>';
    const directorSection = panel.querySelector('.camera-director-section');
    if (directorSection) directorSection.insertAdjacentElement('afterend', section);
    else panel.prepend(section);

    $('camera-agent-style')?.remove();
    const style = document.createElement('style');
    style.id = 'camera-agent-style';
    style.textContent =
      '.camera-agent-section{display:grid;gap:5px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-agent-section label{display:grid;gap:4px;font-size:8px;color:#73878e}.camera-agent-section select{width:100%;height:29px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#b8c5c6;padding:0 6px;font-size:9px}'+
      '.camera-agent-section small{font-size:8px;color:#71858d}.camera-agent-section.active small{color:#cddbd7}';
    document.head.appendChild(style);

    rebuildSelect();
    $('camera-agent-select')?.addEventListener('change', event => activate(event.target.value));
  }

  function installManualHooks() {
    stage?.addEventListener('pointerdown', manualTakeover, {capture:true, passive:true});
    stage?.addEventListener('wheel', manualTakeover, {capture:true, passive:true});
    menu?.addEventListener('click', event => {
      if (event.target.closest('#camera-agent-select,#camera-director-toggle')) return;
      if (event.target.closest('[data-camera],[data-focus-view],#zoom-in,#zoom-out,#reset,#camera-focus-back')) manualTakeover();
    }, true);
  }

  function attach() {
    if (attached) return true;
    camera = window.VirtualBandCamera;
    director = window.VirtualBandDirector;
    if (!camera || !director || !stage || !menu || !songSelect || !modeSelect || !playButton || !progress) return false;

    const wishPlan = buildMidiArrangement('wish', {
      id:'wish-midi-demo',
      label:'Wish You Were Here · MIDI 分析编排',
      shotSeconds:5.4,
    });
    if (wishPlan) register(wishPlan);
    setupUi();
    installManualHooks();
    timer = setInterval(tick, TICK);

    window.VirtualBandAgentCamera = {
      register,
      activate,
      deactivate(){return activate('');},
      useAuto(){return activate('');},
      buildFromMidi:buildMidiArrangement,
      analyze(songId){
        const a = analyzeSong(songId);
        if (!a) return null;
        return {duration:a.duration, first:a.first, last:a.last, instruments:a.groups.map(g => ({id:g.id,target:g.target,label:g.label,type:g.type,notes:g.events.length}))};
      },
      get arrangements(){return [...registry.values()].map(a => ({...a, cues:a.cues.map(c => ({...c}))}));},
      get state(){return {selectedId, active:!!activeRun && isPlaying(), song:songSelect.value, cueIndex, autoSuspended, manualHoldMs:Math.max(0, manualUntil - performance.now())};},
    };

    attached = true;
    console.info(`[Agent Camera] MIDI-grounded arrangement layer attached · Wish demo ${wishPlan?.cues.length || 0} cues · user > agent > auto`);
    return true;
  }

  function wait() {
    if (attach()) return;
    if (++tries < 600) requestAnimationFrame(wait);
    else console.warn('[Agent Camera] director/camera unavailable after waiting.');
  }

  wait();
})();

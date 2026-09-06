'use strict';

// Camera v3 · balanced MIDI-aware auto director.
// Reads the already-loaded song library + transport UI, then only calls the public
// VirtualBandCamera API. It never owns a second Three.js render loop.
(() => {
  const camera = window.VirtualBandCamera;
  const songs = window.VIRTUAL_BAND_SONGS || {};
  const stage = document.getElementById('stage');
  const menu = document.getElementById('camera-menu');
  const songSelect = document.getElementById('bp-song');
  const modeSelect = document.getElementById('bp-mode');
  const playButton = document.getElementById('bp-play');
  const progress = document.getElementById('bp-progress');
  const timeLabel = document.getElementById('bp-time');

  if (!camera || !stage || !songSelect || !modeSelect || !playButton || !progress) {
    console.warn('[Director v3] camera or player UI unavailable; auto director disabled.');
    return;
  }

  const STORAGE_KEY = 'vb-director-enabled';
  const TICK_MS = 120;
  const MIN_HOLD_MS = 3000;
  const STRONG_HOLD_MS = 1750;
  const MANUAL_HOLD_MS = 8000;
  const STAGE_RETURN_MS = 11000;
  const STAGE_SEQUENCE = ['front', 'left', 'front', 'right', 'top', 'front'];
  const WEIGHT = { keyboard:1.05, drums:1.00, electric:1.12, acoustic:.92, bass:.78 };

  let enabled = localStorage.getItem(STORAGE_KEY) !== '0';
  let cachedSong = null;
  let cachedSongKey = '';
  let timeline = [];
  let lastTickSongTime = 0;
  let lastCutAt = -Infinity;
  let lastStageAt = -Infinity;
  let manualHoldUntil = 0;
  let currentTarget = 'stage';
  let currentShot = 'front';
  let stageIndex = 0;
  let cutCount = 0;
  let wasPlaying = false;
  let lastScores = [];
  const lastShown = new Map();

  function bpmFor(song) {
    const match = String(song?.bpm ?? '').match(/[\d.]+/);
    const bpm = match ? Number(match[0]) : 120;
    return Number.isFinite(bpm) && bpm > 20 ? bpm : 120;
  }

  function currentSong() {
    return songs[songSelect.value] || null;
  }

  function isPlaying() {
    return modeSelect.value === 'song' && /停止/.test(playButton.textContent || '');
  }

  function parseClock(text) {
    const match = String(text || '').match(/(\d+):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  }

  function songTime(song) {
    const pct = parseFloat(progress.style.width || '');
    if (Number.isFinite(pct) && song?.duration > 0) {
      return Math.max(0, Math.min(song.duration, song.duration * pct / 100));
    }
    const fallback = parseClock(timeLabel?.textContent);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function descriptorForEvent(ev) {
    const instrument = ev?.i;
    if (instrument === 'lower' || instrument === 'upper') {
      return { id:'keyboard', type:'keyboard', index:0, sub:instrument, label:'键盘' };
    }
    if (instrument === 'drums') return { id:'drums', type:'drums', index:0, sub:'drums', label:'架子鼓' };
    if (instrument === 'bass') return { id:'bass', type:'bass', index:0, sub:'bass', label:'Bass' };
    if (instrument === 'guitar') {
      const index = Math.max(0, Number(ev.x) || 0);
      return { id:`acoustic:${index}`, type:'acoustic', index, sub:'guitar', label:`木吉他 ${index + 1}` };
    }
    if (instrument === 'electric') {
      const index = Math.max(0, Number(ev.x) || 0);
      return { id:`electric:${index}`, type:'electric', index, sub:'electric', label:`电吉他 ${index + 1}` };
    }
    return null;
  }

  function rebuildTimeline(song) {
    cachedSong = song;
    cachedSongKey = `${songSelect.value}:${song?.events?.length || 0}:${song?.duration || 0}`;
    const groups = new Map();
    for (const ev of song?.events || []) {
      const d = descriptorForEvent(ev);
      if (!d) continue;
      let group = groups.get(d.id);
      if (!group) {
        group = {...d, events:[]};
        groups.set(d.id, group);
      }
      const s = Number(ev.s ?? 0);
      const e = Number(ev.e ?? ev.ve ?? s + .08);
      const v = Math.max(1, Math.min(127, Number(ev.v ?? 96))) / 127;
      group.events.push({s, e:Number.isFinite(e) ? e : s + .08, v, sub:d.sub});
    }
    timeline = [...groups.values()];
    for (const group of timeline) group.events.sort((a,b) => a.s - b.s);
    lastScores = [];
  }

  function ensureTimeline(song) {
    const key = `${songSelect.value}:${song?.events?.length || 0}:${song?.duration || 0}`;
    if (song !== cachedSong || key !== cachedSongKey) rebuildTimeline(song);
  }

  function lowerBound(events, time) {
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].s < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function scoreGroup(group, t, now) {
    const events = group.events;
    const start = t - 1.25;
    const end = t + .10;
    let i = lowerBound(events, start);
    let score = 0, hits45 = 0, hits18 = 0, lower = 0, upper = 0, maxVelocity = 0;
    for (; i < events.length && events[i].s <= end; i++) {
      const ev = events[i];
      const age = t - ev.s;
      const decay = age >= 0 ? Math.exp(-age / .52) : .42;
      const contribution = (.32 + ev.v * .92) * decay;
      score += contribution;
      maxVelocity = Math.max(maxVelocity, ev.v);
      if (age >= 0 && age <= .45) hits45++;
      if (age >= 0 && age <= .18) hits18++;
      if (ev.s <= t && ev.e >= t) score += .24 + ev.v * .22;
      if (ev.sub === 'lower') lower += contribution;
      else if (ev.sub === 'upper') upper += contribution;
    }
    score += Math.min(1.6, hits45 * .18);
    score *= WEIGHT[group.type] || 1;
    const last = lastShown.get(group.id);
    if (last != null) score *= 1 + Math.min(.28, Math.max(0, now - last) / 40000 * .28);
    if (group.id === currentTarget) score *= .82;
    const strong = group.type === 'drums'
      ? hits45 >= 5 || (hits45 >= 3 && maxVelocity > .9)
      : hits18 >= 4 || (hits45 >= 4 && maxVelocity > .94);
    return {...group, score, strong, hits45, lower, upper};
  }

  function rootFor(candidate) {
    const roots = camera.roots || [];
    if (candidate.type === 'keyboard') return roots.find(r => (r.name || '').includes('dual-tier')) || null;
    if (candidate.type === 'drums') return roots.find(r => (r.name || '').includes('Band Drums')) || null;
    if (candidate.type === 'bass') return roots.find(r => (r.name || '').includes('Fingered Bass')) || null;
    if (candidate.type === 'acoustic') {
      return roots.find(r => new RegExp(`Wish Acoustic ${candidate.index + 1}$`).test(r.name || '')) || null;
    }
    if (candidate.type === 'electric') {
      return roots.find(r => new RegExp(`Electric ${candidate.index + 1}$`).test(r.name || '')) || null;
    }
    return null;
  }

  function keyboardShot(candidate) {
    if (candidate.lower > candidate.upper * 1.28) return 'observeLower';
    if (candidate.upper > candidate.lower * 1.28) return 'observeUpper';
    return 'observeAll';
  }

  function instrumentShot(candidate) {
    if (candidate.type === 'keyboard') return keyboardShot(candidate);
    if (candidate.type === 'drums') return ['observeAll','observeLeft','observeRight'][cutCount % 3];
    if (candidate.type === 'electric') return cutCount % 3 === 1 ? 'neck' : 'overall';
    if (candidate.type === 'acoustic') return cutCount % 4 === 2 ? 'neck' : 'overall';
    if (candidate.type === 'bass') return cutCount % 4 === 3 ? 'neck' : 'overall';
    return 'overall';
  }

  function nearBoundary(t, song, bars=false) {
    const beat = 60 / bpmFor(song);
    const span = bars ? beat * 4 : beat;
    const phase = ((t % span) + span) % span;
    const distance = Math.min(phase, span - phase);
    return distance <= Math.min(bars ? .20 : .14, span * .24);
  }

  function setStatus(text, active=false) {
    const status = document.getElementById('camera-director-status');
    const toggle = document.getElementById('camera-director-toggle');
    if (status) status.textContent = text;
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = enabled ? '开启' : '关闭';
      toggle.classList.toggle('active', active && enabled);
    }
  }

  function cutStage(view, reason='全景') {
    camera.view(view);
    const now = performance.now();
    lastCutAt = now;lastStageAt = now;currentTarget = 'stage';currentShot = view;cutCount++;
    setStatus(`${reason} · ${view === 'front' ? '正面' : view === 'left' ? '左侧' : view === 'right' ? '右侧' : '高机位'}`, true);
  }

  function cutCandidate(candidate, reason='') {
    const root = rootFor(candidate);if (!root) return false;
    const shot = instrumentShot(candidate);
    if (candidate.id === currentTarget && shot === currentShot) return false;
    camera.focusView(root, shot);
    const now = performance.now();
    lastCutAt = now;currentTarget = candidate.id;currentShot = shot;cutCount++;
    lastShown.set(candidate.id, now);
    const suffix = reason ? ` · ${reason}` : '';
    setStatus(`${candidate.label} · ${shotLabel(shot)}${suffix}`, true);
    return true;
  }

  function shotLabel(id) {
    return ({
      observeAll:'演奏总览',observeLower:'下层观察',observeUpper:'上层观察',
      observeLeft:'左侧观察',observeRight:'右侧观察',overall:'整体',neck:'指板',body:'琴身'
    })[id] || id;
  }

  function resetRun(forceStage=false) {
    lastTickSongTime = 0;lastCutAt = -Infinity;lastStageAt = -Infinity;
    currentTarget = 'stage';currentShot = 'front';stageIndex = 0;cutCount = 0;lastShown.clear();
    if (forceStage && enabled && modeSelect.value === 'song') cutStage('front', '开场');
  }

  function manualOverride() {
    if (!enabled) return;
    manualHoldUntil = performance.now() + MANUAL_HOLD_MS;
    setStatus('手动接管 8s');
  }

  function chooseAndCut(song, t, now) {
    const scores = timeline.map(group => scoreGroup(group, t, now)).filter(item => item.score > .24).sort((a,b) => b.score - a.score);
    lastScores = scores.map(({id,label,type,score,strong}) => ({id,label,type,score,strong}));
    const top = scores[0];
    const activeCount = scores.filter(item => item.score > .72).length;
    const sinceCut = now - lastCutAt;
    const sinceStage = now - lastStageAt;

    if (t < 1.35) {
      if (currentTarget !== 'stage' && sinceCut > STRONG_HOLD_MS) cutStage('front', '开场');
      return;
    }

    if (sinceStage > STAGE_RETURN_MS && sinceCut >= MIN_HOLD_MS && nearBoundary(t, song, true)) {
      stageIndex = (stageIndex + 1) % STAGE_SEQUENCE.length;
      cutStage(STAGE_SEQUENCE[stageIndex], activeCount >= 4 ? '合奏' : '回全景');
      return;
    }

    if (!top) {
      if (currentTarget !== 'stage' && sinceCut >= MIN_HOLD_MS && nearBoundary(t, song, true)) {
        stageIndex = (stageIndex + 1) % STAGE_SEQUENCE.length;
        cutStage(STAGE_SEQUENCE[stageIndex], '间奏');
      }
      return;
    }

    if (top.strong && sinceCut >= STRONG_HOLD_MS && nearBoundary(t, song, false)) {
      cutCandidate(top, top.type === 'drums' ? 'Fill' : '强调');
      return;
    }

    if (sinceCut < MIN_HOLD_MS || !nearBoundary(t, song, false)) return;

    if (activeCount >= 5 && sinceStage > 6500 && nearBoundary(t, song, true)) {
      stageIndex = (stageIndex + 1) % STAGE_SEQUENCE.length;
      cutStage(STAGE_SEQUENCE[stageIndex], '合奏');
      return;
    }

    const current = scores.find(item => item.id === currentTarget);
    const currentScore = current?.score || 0;
    const dominance = top.score / Math.max(.25, currentScore);
    if (currentTarget === 'stage' || top.id !== currentTarget || dominance > 1.18 || sinceCut > 5000) {
      cutCandidate(top);
    }
  }

  function tick() {
    const now = performance.now();
    const song = currentSong();
    const playing = !!song && isPlaying();

    if (!enabled) {
      setStatus('关闭');wasPlaying = playing;return;
    }
    if (modeSelect.value !== 'song') {
      setStatus('仅曲库模式');wasPlaying = playing;return;
    }
    if (!song) {
      setStatus('无曲目');wasPlaying = false;return;
    }

    ensureTimeline(song);
    const t = songTime(song);
    if (playing && !wasPlaying) resetRun(true);
    if (playing && t + .45 < lastTickSongTime) resetRun(false);
    wasPlaying = playing;lastTickSongTime = t;

    if (!playing) {
      setStatus('等待播放');return;
    }
    if (now < manualHoldUntil) {
      setStatus(`手动接管 ${Math.max(1,Math.ceil((manualHoldUntil-now)/1000))}s`);return;
    }
    chooseAndCut(song, t, now);
  }

  function setupUi() {
    const panel = menu?.querySelector('.camera-panel');
    if (!panel) return;
    panel.querySelector('.camera-director-section')?.remove();
    const section = document.createElement('div');
    section.className = 'camera-director-section';
    section.innerHTML = '<div class="camera-director-copy"><strong>自动导播</strong><small id="camera-director-status">等待播放</small></div>'+
      '<button id="camera-director-toggle" type="button" aria-pressed="false">开启</button>';
    const prefs = panel.querySelector('.camera-pref-section');
    panel.insertBefore(section, prefs || panel.querySelector('#camera-v2-note') || null);

    document.getElementById('camera-director-style')?.remove();
    const style = document.createElement('style');style.id = 'camera-director-style';
    style.textContent =
      '.camera-director-section{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}'+
      '.camera-director-copy{display:grid;gap:2px;min-width:0}.camera-director-copy strong{font-size:10px;font-weight:600;color:#dce7e5}.camera-director-copy small{font-size:8px;color:#71858d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}'+
      '#camera-director-toggle{height:28px;min-width:48px;border:1px solid var(--line);border-radius:7px;background:#ffffff05;color:#8fa1a5;font-size:9px;cursor:pointer}'+
      '#camera-director-toggle[aria-pressed="true"]{color:#d8e8e4;border-color:#78958e;background:#8fb6aa17}'+
      '#camera-director-toggle.active{background:#8fb6aa25}';
    document.head.appendChild(style);

    section.querySelector('#camera-director-toggle')?.addEventListener('click', event => {
      event.preventDefault();event.stopPropagation();
      enabled = !enabled;localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      manualHoldUntil = 0;
      if (enabled) {resetRun(false);setStatus(isPlaying() ? '准备接管' : '等待播放');}
      else setStatus('关闭');
    });
  }

  function installManualOverrideHooks() {
    // Listen on the stage ancestor so Camera v2's stopImmediatePropagation on the canvas
    // cannot hide a real user takeover from the director.
    stage.addEventListener('pointerdown', manualOverride, {capture:true,passive:true});
    stage.addEventListener('wheel', manualOverride, {capture:true,passive:true});
    menu?.addEventListener('click', event => {
      if (event.target.closest('#camera-director-toggle')) return;
      if (event.target.closest('[data-camera],[data-focus-view],#zoom-in,#zoom-out,#reset,#camera-focus-back')) manualOverride();
    }, true);
  }

  function resolveTarget(target) {
    if (target?.isObject3D) return target;
    const text = String(target || '').toLowerCase();
    const roots = camera.roots || [];
    if (text === 'keyboard' || text.includes('键盘')) return roots.find(r => (r.name || '').includes('dual-tier')) || null;
    if (text === 'drums' || text.includes('鼓')) return roots.find(r => (r.name || '').includes('Band Drums')) || null;
    if (text === 'bass') return roots.find(r => (r.name || '').includes('Fingered Bass')) || null;
    const acoustic = text.match(/(?:acoustic|木吉他)\s*(\d+)?/);
    if (acoustic) {
      const index = Math.max(1, Number(acoustic[1]) || 1);
      return roots.find(r => new RegExp(`Wish Acoustic ${index}$`).test(r.name || '')) || null;
    }
    const electric = text.match(/(?:electric|电吉他)\s*(\d+)?/);
    if (electric) {
      const index = Math.max(1, Number(electric[1]) || 1);
      return roots.find(r => new RegExp(`Electric ${index}$`).test(r.name || '')) || null;
    }
    return roots.find(r => (r.name || '').toLowerCase().includes(text)) || null;
  }

  setupUi();installManualOverrideHooks();
  setStatus(enabled ? '等待播放' : '关闭');
  const timer = window.setInterval(tick, TICK_MS);

  window.VirtualBandDirector = {
    enable(){enabled=true;localStorage.setItem(STORAGE_KEY,'1');manualHoldUntil=0;resetRun(false);setStatus(isPlaying()?'准备接管':'等待播放');},
    disable(){enabled=false;localStorage.setItem(STORAGE_KEY,'0');setStatus('关闭');},
    toggle(){enabled?this.disable():this.enable();return enabled;},
    setStyle(style){return style === 'balanced';},
    cutToStageView(view='front'){cutStage(['front','left','right','top'].includes(view)?view:'front','手动指令');},
    cutToInstrument(target,view='overall'){
      const root=resolveTarget(target);if(!root)return false;
      camera.focusView(root,view);lastCutAt=performance.now();currentTarget=root.name||'manual';currentShot=view;return true;
    },
    hold(ms=MANUAL_HOLD_MS){manualHoldUntil=performance.now()+Math.max(0,Number(ms)||0);},
    destroy(){window.clearInterval(timer);},
    get state(){
      return {enabled,style:'balanced',playing:isPlaying(),currentTarget,currentShot,manualHoldMs:Math.max(0,manualHoldUntil-performance.now()),scores:lastScores.map(item=>({...item}))};
    },
  };

  console.info('[Director v3] balanced MIDI-aware auto director attached');
})();

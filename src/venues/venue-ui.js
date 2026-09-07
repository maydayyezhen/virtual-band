'use strict';

(() => {
  if (document.getElementById('venue-menu')) return;
  const actions = document.querySelector('.top-actions');
  if (!actions) return;

  const details = document.createElement('details');
  details.className = 'ui-popover venue-menu';
  details.id = 'venue-menu';
  details.innerHTML = `
    <summary>场景</summary>
    <div class="popover-panel venue-panel">
      <div class="popover-heading venue-heading">
        <div><span>VENUE</span><strong>演出场景</strong></div>
        <small>可随时切换</small>
      </div>
      <label class="field-label" for="bp-venue">场景预设</label>
      <select id="bp-venue" aria-label="选择演出场景">
        <option value="nocturne" selected>NOCTURNE · Livehouse</option>
        <option value="none">无 · 纯乐队</option>
      </select>
    </div>`;

  const midi = actions.querySelector('#bp-import');
  actions.insertBefore(details, midi || null);

  const style = document.createElement('style');
  style.id = 'venue-ui-style';
  style.textContent = `
    .venue-panel{right:0;top:45px;width:min(250px,calc(100vw - 28px));padding:14px}
    .venue-heading{margin-bottom:12px}
    .venue-panel select{width:100%;height:36px;border:1px solid #cad9e023;border-radius:10px;background:#1c2b32;color:#e6ece9;padding:0 10px;font-size:11px;outline:none}
    .venue-panel select:focus{border-color:#c9ddda66}
    @media(max-width:700px){.venue-panel{right:-72px}}
  `;
  document.head.appendChild(style);
})();

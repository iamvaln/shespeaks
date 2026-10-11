// Cover images (the still a platform shows before the video plays): episode 1, her wish in the audience;
// episode 2, her on stage under the amber light. The episode comes from <body data-ep>.
(function () {
  const C = SS.C;
  const EP = document.body.dataset.ep;
  const mid = 'text-anchor="middle"';

  const header = (label) => `<image href="../../public/brand/shespeaks-logo-nuit.svg" x="370" y="70" width="340" height="140"/>
    <text x="540" y="268" ${mid} font-family="IBM Plex Mono" font-weight="500" font-size="30" letter-spacing="6" fill="${C.amber}">${label}</text>`;

  function cover1() {
    const lines = SS.t(['Ah… si j’osais', 'prendre la', 'parole…'], ['Ah… if only', 'I dared to take', 'the stage…']);
    let bumps = '';
    for (let x = 200; x <= 880; x += 113) bumps += `<circle cx="${x}" cy="360" r="70"/><circle cx="${x}" cy="760" r="70"/>`;
    for (let y = 450; y <= 680; y += 115) bumps += `<circle cx="140" cy="${y}" r="70"/><circle cx="940" cy="${y}" r="70"/>`;
    return `<rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="40" cy="260" r="1150" fill="url(#stageLight)"/>
      <g filter="url(#blur8)" fill="${C.raised}"><circle cx="70" cy="1150" r="70"/><ellipse cx="70" cy="1320" rx="130" ry="110"/><circle cx="1010" cy="1110" r="64"/><ellipse cx="1010" cy="1275" rx="120" ry="100"/></g>
      ${SS.person('her', { hair: 'braids', skin: 'warm', outfit: 'hoodie', top: '#3A4060', band: C.muted, transform: 'translate(120 860) scale(1.4)' })}
      <g fill="${C.ink}">${bumps}<rect x="140" y="360" width="800" height="400" rx="60"/></g>
      <circle cx="420" cy="870" r="26" fill="${C.ink}"/><circle cx="470" cy="930" r="14" fill="${C.ink}"/>
      <text ${mid} font-family="Archivo" font-weight="800" font-size="84" fill="${C.night}">${lines.map((l, i) => `<tspan x="540" y="${500 + i * 96}">${l}</tspan>`).join('')}</text>
      ${header(SS.t('ÉPISODE 1', 'EPISODE 1'))}`;
  }

  function cover2() {
    const rows = [{ y: 1440, r: 62, n: 7 }, { y: 1660, r: 86, n: 5 }, { y: 1900, r: 112, n: 4 }];
    const crowd = rows.map((row, k) => Array.from({ length: row.n }, (_, i) => SS.crowdHead(-40 + (i + (k % 2) * 0.5) * (1160 / (row.n - 1)), row.y, row.r, ['#252A47', '#1D2140', '#161A33'][k])).join('')).join('');
    const claps = [[170, 1300], [880, 1280], [330, 1520], [760, 1500]].map(([x, y], i) => `<text x="${x}" y="${y}" font-size="${70 + (i % 2) * 14}" ${mid}>👏</text>`).join('');
    return `<rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="1000" r="900" fill="url(#amberLight)"/>
      <polygon points="470,0 610,0 900,1250 180,1250" fill="url(#beamAmber)"/>
      <ellipse cx="540" cy="1252" rx="340" ry="54" fill="${C.amber}"/>
      <g transform="translate(540 1244) scale(2.2) translate(-901 -702)">${SS.herPresenter()}</g>
      ${crowd}${claps}
      <text x="540" y="400" ${mid} font-family="Archivo" font-weight="800" font-size="132" fill="${C.ink}" data-max="1000">${SS.t('Et après ?', 'What’s next?')}</text>
      ${header(SS.t('ÉPISODE 2', 'EPISODE 2'))}`;
  }

  function build() {
    SS.$('stage').innerHTML = `${SS.defs()}${EP === '2' ? cover2() : cover1()}`;
    if (EP === '2') SS.$('hpBody').style.color = C.amber;
    else SS.pose('her', { look: [-0.9, -0.7], brow: 0.6, smile: 0.5, tilt: -3 });
    SS.fitAll();
  }

  SS.start(1, build, () => {});
})();

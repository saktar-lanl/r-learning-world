/* Ruhaimah's Learning World — v4
   One script for every page. Each page sets <body data-subject="...">. */
'use strict';
const app = document.getElementById('app');
const STORE_KEY = 'ruhaimah-learning-v3';   // kept so existing progress carries over
const LEGACY_KEY = 'ruhaimah-v1';
const VOICE_KEY = 'ruhaimah-voice-settings';
const defaultSave = {stickerBook:[],routine:null,stars:0,stats:{},days:{},journal:'',dailyDone:{},resume:null,storiesRead:{},ttt:{win:0,lose:0,tie:0},stickers:0};
const defaultVoice = {mic:true,audio:true,sfx:true,autoRead:true,speed:.85,pitch:1.05,voiceURI:''};
let saved = loadSaved();
let voicePrefs = loadVoicePrefs();
let currentQuiz = null;

/* ---------- storage ---------- */
function loadSaved(){
  let out = JSON.parse(JSON.stringify(defaultSave));
  for (const key of [LEGACY_KEY, STORE_KEY]){
    try{
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      if (v) out = {...out, ...v, stats:{...out.stats, ...(v.stats||{})}, days:{...out.days, ...(v.days||{})}, ttt:{...defaultSave.ttt, ...(v.ttt||{})}, storiesRead:{...(v.storiesRead||{})}, dailyDone:{...(v.dailyDone||{})}};
    }catch(e){}
  }
  if (out.resume && out.resume.subject === 'bangla') out.resume = null;
  return out;
}
function loadVoicePrefs(){
  let p = {...defaultVoice};
  try{ p = Object.assign(p, JSON.parse(localStorage.getItem(VOICE_KEY) || '{}')); }catch(e){}
  // older versions stored a too-slow speed; keep within a friendly range
  p.speed = Math.min(1.15, Math.max(.6, Number(p.speed) || .85));
  p.pitch = Math.min(1.35, Math.max(.8, Number(p.pitch) || 1.05));
  ['sfx','autoRead','audio','mic'].forEach(k => { if (typeof p[k] !== 'boolean') p[k] = defaultVoice[k]; });
  return p;
}
function saveAll(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(saved)); localStorage.setItem(VOICE_KEY, JSON.stringify(voicePrefs)); }catch(e){}
  const b = document.getElementById('starsBtn');
  if (b) b.innerHTML = '⭐ <span>' + (saved.stars || 0) + '</span>';
}

/* ---------- small helpers ---------- */
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
function rand(min, max){ return min + Math.floor(Math.random() * (max - min + 1)); }
function dateKey(d){ const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }
function todayKey(){ return dateKey(new Date()); }
function trackDay(){ saved.days[todayKey()] = (saved.days[todayKey()] || 0) + 1; }
function statFor(k){ return saved.stats[k] || {right:0,total:0}; }
function pctFor(k){ const s = statFor(k); return s.total ? Math.round(s.right * 100 / s.total) : 0; }
function streak(){
  let s = 0; const d = new Date();
  if (!saved.days[dateKey(d)]) d.setDate(d.getDate() - 1); // today not started yet still keeps yesterday's streak
  while (saved.days[dateKey(d)]){ s++; d.setDate(d.getDate() - 1); }
  return s;
}
function accuracy(){ let r = 0, t = 0; Object.entries(saved.stats).forEach(([k, v]) => { if (k !== 'bangla'){ r += v.right || 0; t += v.total || 0; } }); return t ? Math.round(r * 100 / t) : 0; }

function toast(msg){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._id); toast._id = setTimeout(() => t.classList.remove('show'), 2300);
}
function show(html){
  html = String(html).replace(/>([^<]*)\bNaN\b/g, '>$10').replace(/>([^<]*)\bundefined\b/g, '>$1');
  if (typeof Listen !== 'undefined') Listen.stop();
  app.innerHTML = html;
  window.scrollTo({top:0, behavior:'auto'});
}

/* Speak buttons: text is stored in a list so quotes and apostrophes never break the HTML */
const SAY = [];
function sayIdx(i, el){ const t = SAY[i]; if (t == null) return; speak(t); }
function sayAttr(text){ SAY.push(text); return `sayIdx(${SAY.length - 1}, this)`; }
function speakBtn(text, label){ return label ? `<button class="btn small sky" onclick="${sayAttr(text)}">🔊 ${esc(label)}</button>` : `<button class="speak-btn" aria-label="Listen" title="Listen" onclick="${sayAttr(text)}">🔊</button>`; }

/* ---------- voice engine ----------
   - ranks every English voice on the device and picks the most natural one
   - speaks in short sentence chunks (avoids Chrome cutting long speech off)
   - can highlight the line being read
   - never fails silently: falls back to the device default voice */
const synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
let speechToken = 0;
const Voice = {
  list: [],
  init(){
    if (!synth) return;
    const load = () => { this.list = synth.getVoices() || []; if (typeof refreshVoiceList === 'function') refreshVoiceList(); };
    load();
    try{ synth.addEventListener('voiceschanged', load); }catch(e){ synth.onvoiceschanged = load; }
    setTimeout(load, 400); setTimeout(load, 1500);
  },
  score(v){
    const n = v.name || '', l = (v.lang || '').replace('_', '-');
    if (!/^en(-|$)/i.test(l)) return -1;
    let s = 0;
    if (/^en-US/i.test(l)) s += 30; else if (/^en-(GB|AU|CA|IE|NZ|IN)/i.test(l)) s += 18; else s += 10;
    if (/natural|neural/i.test(n)) s += 45;
    if (/online/i.test(n)) s += 20;
    if (/enhanced|premium|siri/i.test(n)) s += 40;
    if (/google us english/i.test(n)) s += 28;
    if (/google uk english female/i.test(n)) s += 18;
    if (/\b(ava|samantha|allison|susan|zoe|aria|jenny|emma|michelle|ana|nicky|evan|joelle|karen|moira|serena|libby|sonia|natasha|clara)\b/i.test(n)) s += 14;
    if (/female/i.test(n)) s += 3;
    if (/compact|espeak|robot|fred|albert|bad news|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|jester|organ|superstar|wobble|bahh|good news|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i.test(n)) s -= 70;
    return s;
  },
  english(){ return this.list.filter(v => this.score(v) >= 0).sort((a, b) => this.score(b) - this.score(a)); },
  pick(){ const en = this.english(); return en.find(v => v.voiceURI === voicePrefs.voiceURI) || en[0] || null; }
};
function cleanForSpeech(t){
  return String(t == null ? '' : t).replace(/\bNaN\b|\bundefined\b|\bnull\b/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\s*\+\s*/g, ' plus ').replace(/\s*=\s*\?/g, ' equals what?').replace(/\s*=\s*/g, ' equals ')
    .replace(/(\d)\s*[−-]\s*(\d)/g, '$1 minus $2')
    .replace(/→/g, ', then ').replace(/\s*\/\s*/g, ', ').replace(/_+/g, ' blank ')
    .replace(/\n+/g, '. ').replace(/\s{2,}/g, ' ').trim();
}
function chunkText(t){
  const parts = t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t];
  const out = []; let cur = '';
  parts.forEach(p => { if ((cur + p).length > 160 && cur){ out.push(cur.trim()); cur = p; } else cur += p; });
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [t];
}
function setSpeaking(on){ const b = document.getElementById('stopBtn'); if (b) b.classList.toggle('speaking', !!on); }
function stopSpeaking(){
  speechToken++;
  try{ synth && synth.cancel(); }catch(e){}
  setSpeaking(false);
  document.querySelectorAll('.reading').forEach(e => e.classList.remove('reading'));
}
/* speak(text | [lines], {onPart(i), gap, rate, quiet}) → Promise */
function speak(text, opts = {}){
  if (!voicePrefs.audio){ if (!opts.quiet) toast('🔇 Voice is off. Turn it on in ⚙️ Settings.'); return Promise.resolve(false); }
  if (!synth){ if (!opts.quiet) toast('This browser cannot speak. Try Chrome, Edge or Safari.'); return Promise.resolve(false); }
  stopSpeaking();
  const token = speechToken;
  const v = opts.lang ? (Voice.forLang(opts.lang) || Voice.pick()) : Voice.pick();
  const lines = Array.isArray(text) ? text : [text];
  const chunks = [];
  lines.forEach((line, li) => { const c = cleanForSpeech(line); if (c) chunkText(c).forEach(x => chunks.push({text:x, part:li})); });
  if (!chunks.length) return Promise.resolve(false);
  setSpeaking(true);
  return new Promise(resolve => {
    let i = 0;
    const next = () => {
      if (token !== speechToken) return resolve(false);
      if (i >= chunks.length){ setSpeaking(false); opts.onPart && opts.onPart(-1); return resolve(true); }
      const ch = chunks[i++];
      const newPart = i === 1 || chunks[i - 2].part !== ch.part;
      if (newPart && opts.onPart) opts.onPart(ch.part);
      const u = new SpeechSynthesisUtterance(ch.text);
      u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v;
      u.rate = opts.rate || voicePrefs.speed; u.pitch = opts.pitch || voicePrefs.pitch; u.volume = 1;
      let finished = false;
      const fin = () => {
        if (finished) return; finished = true; clearTimeout(guard);
        const lastOfPart = i >= chunks.length || chunks[i].part !== ch.part;
        setTimeout(next, lastOfPart ? (opts.gap ?? 260) : 90);
      };
      u.onend = fin;
      u.onerror = e => {
        if (e && e.error === 'not-allowed'){ setSpeaking(false); if (!opts.quiet) toast('Tap a 🔊 button to start the voice.'); speechToken++; return resolve(false); }
        fin();
      };
      // safety net for browsers that forget to fire "end"
      const guard = setTimeout(fin, 2500 + ch.text.length * 110 / u.rate);
      try{ synth.resume(); synth.speak(u); }catch(e){ fin(); }
    };
    next();
  });
}
/* Read a list of DOM lines aloud, highlighting each one */
function readLines(lines, els, opts = {}){
  return speak(lines, {...opts, onPart: i => {
    els.forEach(e => e.classList.remove('reading'));
    if (i >= 0 && els[i]){ els[i].classList.add('reading'); els[i].scrollIntoView({block:'nearest', behavior:'smooth'}); }
  }});
}
const cheers = ['Great job!','Wonderful!','You got it!','Super star!','Amazing!','Fantastic!','Well done!','Brilliant!'];
const tryAgains = ['Nice try!','Almost!','Good thinking!','Keep going!'];

/* ---------- sound effects (made in the browser, no files) ---------- */
const Sfx = {
  ctx: null,
  tone(freq, dur, type = 'sine', when = 0, vol = .12){
    if (!voicePrefs.sfx) return;
    try{
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .05);
    }catch(e){}
  },
  tap(){ this.tone(700, .07, 'triangle', 0, .06); },
  good(){ [523, 659, 784].forEach((f, i) => this.tone(f, .18, 'triangle', i * .09)); },
  bad(){ this.tone(260, .18, 'sine', 0, .08); this.tone(220, .22, 'sine', .12, .08); },
  win(){ [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, .2, 'triangle', i * .11)); },
  pop(){ this.tone(900, .05, 'square', 0, .03); }
};

/* ---------- rewards ---------- */
const STICKERS = ['🦄','🌈','🦋','🌸','🐬','🍓','🚀','🐱','🌟','🧁','🐼','🎈','🍉','🦁','🐢','🌻','🐙','🍩','🦊','👑','🐳','🍭','🎀','🪐'];
function confetti(n = 26){
  const bits = ['🎉','⭐','✨','🌟','💖','🎈','🦄'];
  for (let i = 0; i < n; i++){
    const s = document.createElement('div'); s.className = 'confetti'; s.textContent = pick(bits);
    s.style.left = Math.random() * 100 + 'vw'; s.style.animationDuration = (1.6 + Math.random() * 1.6) + 's'; s.style.animationDelay = (Math.random() * .4) + 's';
    s.style.fontSize = (20 + Math.random() * 18) + 'px';
    document.body.appendChild(s); setTimeout(() => s.remove(), 3800);
  }
}
function flyStar(fromEl){
  const btn = document.getElementById('starsBtn'); if (!btn || !fromEl || !fromEl.getBoundingClientRect) return;
  const a = fromEl.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const s = document.createElement('div'); s.className = 'star-fly'; s.textContent = '⭐';
  s.style.left = (a.left + a.width / 2 - 17) + 'px'; s.style.top = (a.top + a.height / 2 - 17) + 'px';
  document.body.appendChild(s);
  requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transform = `translate(${b.left - a.left - a.width / 2 + 20}px, ${b.top - a.top - a.height / 2}px) scale(.6)`; s.style.opacity = '.3'; }));
  setTimeout(() => s.remove(), 900);
}
function addStars(n, fromEl){
  saved.stars = (saved.stars || 0) + n;
  if (fromEl) flyStar(fromEl);
}
const DAILY = [
  {key:'reading', label:'Read a story', icon:'📖', subjects:['reading'], go:"openSubject('reading')"},
  {key:'math', label:'Math practice', icon:'🧮', subjects:['math'], go:"startQuiz('math')"},
  {key:'discover', label:'Discover something', icon:'🔭', subjects:['science','body','geo','general'], go:"openSubject('science')"},
  {key:'think', label:'Think & write', icon:'🧩', subjects:['english','logic','school'], go:"openSubject('logic')"},
  {key:'fun', label:'Fun finish', icon:'🎉', subjects:['rhymes','art','chess','games'], go:"openSubject('games')"}
];
function markDaily(subject){
  const d = DAILY.find(x => x.subjects.includes(subject)); if (!d) return;
  const t = todayKey(); saved.dailyDone[t] = saved.dailyDone[t] || {};
  if (!saved.dailyDone[t][d.key]){
    saved.dailyDone[t][d.key] = true;
  }
}
function recordResult(subject, ok, fromEl){
  if (!saved.stats[subject]) saved.stats[subject] = {right:0,total:0};
  saved.stats[subject].total++;
  if (ok){ saved.stats[subject].right++; addStars(1, fromEl); Sfx.good(); } else Sfx.bad();
  trackDay(); markDaily(subject); saveAll();
}
function setResume(page){ stopSpeaking(); saved.resume = page; saveAll(); }

/* ---------- subjects ---------- */
const subjects = [
  {key:'reading', emoji:'📚', title:'Reading & phonics', desc:'Stories, letter sounds, blending and sight words', color:'#ffe3ee'},
  {key:'math', emoji:'🧮', title:'Math', desc:'Counting, adding, shapes, patterns & puzzles', color:'#dcf6e5'},
  {key:'english', emoji:'✏️', title:'English & writing', desc:'Sentences, opposites and spelling', color:'#fff0cf'},
  {key:'science', emoji:'🔬', title:'Science', desc:'Planets, animals and plants', color:'#dcf0ff'},
  {key:'body', emoji:'🧍', title:'Human body', desc:'Body parts, senses and bones', color:'#e6f4ff'},
  {key:'logic', emoji:'🧩', title:'Logic & puzzles', desc:'Patterns, sorting and thinking', color:'#ece2ff'},
  {key:'school', emoji:'🎯', title:'School practice', desc:'Mixed kindergarten practice', color:'#dde6ff'},
  {key:'general', emoji:'💡', title:'General knowledge', desc:'Seasons, days, months and shapes', color:'#ffe6d3'},
  {key:'geo', emoji:'🌍', title:'Geography', desc:'USA states and Bangladesh maps', color:'#d6f4ec'},
  {key:'rhymes', emoji:'🎵', title:'Rhymes', desc:'Nursery rhymes to read and repeat', color:'#fff1c2'},
  {key:'art', emoji:'🎨', title:'Art studio', desc:'Draw, stamp, trace and save', color:'#ffe1ef'},
  {key:'chess', emoji:'♟️', title:'Chess', desc:'How each piece moves', color:'#e9e5ff'},
  {key:'alphabets', emoji:'🔤', title:'Bangla & Arabic', desc:'বাংলা and العربية letters, words and numbers', color:'#e2f5dc', isNew:true},
  {key:'games', emoji:'🎲', title:'Games', desc:'Tic-tac-toe, memory and color games', color:'#ffdfe6'}
];
const subj = k => subjects.find(s => s.key === k) || subjects[0];

/* ---------- lesson cards: [emoji, title, text, what the voice says] ---------- */
const lessons = {
  reading:[
    ['🐱','Sound family: -at','cat, bat, hat, mat, sat','The at family. Cat. Bat. Hat. Mat. Sat.'],
    ['🔤','Sight words','the, and, is, can, you, we, go, see','The. And. Is. Can. You. We. Go. See.'],
    ['🚢','Blending sounds','s-a-t → sat\nc-a-p → cap\nsh-i-p → ship','S, a, t. Sat. C, a, p. Cap. Sh, i, p. Ship.'],
    ['🐷','Sound family: -ig','pig, big, dig, wig, fig','The ig family. Pig. Big. Dig. Wig. Fig.'],
    ['☀️','Sound family: -un','sun, run, fun, bun','The un family. Sun. Run. Fun. Bun.'],
    ['🅰️','Vowels','a, e, i, o, u','The vowels are a, e, i, o, and u.']
  ],
  math:[
    ['➕','Adding','When we add, we put things together.\n3 + 2 = 5','When we add, we put things together. Three plus two equals five.'],
    ['➖','Taking away','When we subtract, we take some away.\n5 − 2 = 3','When we subtract, we take some away. Five minus two equals three.'],
    ['🔗','Number bonds','5 can be 2 and 3, or 4 and 1, or 5 and 0.','Five can be two and three. Or four and one. Or five and zero.'],
    ['👉','Count on','Start at 4. Count on 3 more: 5, 6, 7.\nSo 4 + 3 = 7.','Start at four. Count on three more. Five, six, seven. So four plus three equals seven.'],
    ['🔟','Count to 20','1 2 3 4 5 6 7 8 9 10\n11 12 13 14 15 16 17 18 19 20','One, two, three, four, five, six, seven, eight, nine, ten. Eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen, twenty.'],
    ['⚖️','More or less','9 is more than 4.\n2 is less than 6.','Nine is more than four. Two is less than six.']
  ],
  english:[
    ['🔠','Sentence basics','A sentence starts with a capital letter and ends with a period.','A sentence starts with a capital letter and ends with a period.'],
    ['↔️','Opposites','big / small\nhot / cold\nup / down\nhappy / sad','Big and small. Hot and cold. Up and down. Happy and sad.'],
    ['🐶','Naming words','A noun is a person, place or thing: dog, park, mom.','A noun is a person, place, or thing. Dog. Park. Mom.'],
    ['🏃','Action words','A verb is something you do: run, jump, eat, sing.','A verb is something you do. Run. Jump. Eat. Sing.'],
    ['🐞','One or many','one cat → two cats\none bug → three bugs','One cat, two cats. One bug, three bugs. We add an s for more than one.'],
    ['❓','Asking','A question ends with a question mark. Do you like cake?','A question ends with a question mark. Do you like cake?']
  ],
  science:[
    ['🐾','Animals need','Animals need food, water, air and a safe home.','Animals need food, water, air, and a safe home.'],
    ['🌱','Plants need','Most plants need sunlight, water, air and soil to grow.','Most plants need sunlight, water, air, and soil to grow.'],
    ['🦋','Life cycle','egg → caterpillar → chrysalis → butterfly','A butterfly starts as an egg, then a caterpillar, then a chrysalis, and finally a butterfly.'],
    ['🧊','Water changes','Cold water freezes into ice. Hot water turns into steam.','Cold water freezes into ice. Hot water turns into steam.'],
    ['🐟','Animal homes','Fish live in water. Birds build nests. Bees live in hives.','Fish live in water. Birds build nests. Bees live in hives.'],
    ['🧲','Magnets','Magnets pull things made of iron, like paper clips.','Magnets pull things made of iron, like paper clips.']
  ],
  body:[
    ['💪','Our body','Your body helps you move, think, breathe and play.','Your body helps you move, think, breathe, and play.'],
    ['🦴','Bones','Bones hold your body up. All your bones together are your skeleton.','Bones hold your body up. All your bones together are called your skeleton.'],
    ['👀','Five senses','see 👀 hear 👂 smell 👃 taste 👅 touch ✋','We have five senses. See, hear, smell, taste, and touch.'],
    ['🥦','Healthy habits','Eat healthy food, drink water, sleep well and move every day.','Eat healthy food, drink water, sleep well, and move your body every day.'],
    ['🧼','Wash your hands','Wash with soap for 20 seconds, the time it takes to sing ABC.','Wash your hands with soap for twenty seconds. That is about the time it takes to sing the ABC song.']
  ],
  logic:[
    ['🔴','Patterns','red, blue, red, blue… What comes next?','Look at the pattern. Red, blue, red, blue. What comes next?'],
    ['🗂️','Sorting','We can sort by color, size or shape.','We can sort things by color, size, or shape.'],
    ['🔍','Odd one out','🍎 🍌 🍇 🚗 — the car is not a fruit!','Apple, banana, grapes, car. The car is the odd one out, because it is not a fruit.'],
    ['📏','Biggest & smallest','🐘 is bigger than 🐭.','An elephant is bigger than a mouse.']
  ],
  school:[
    ['👂','Listen first','Listen carefully, try your best and stay calm.','Listen carefully, try your best, and stay calm.'],
    ['✅','Check your work','When you finish, look back and check your answer.','When you finish, look back and check your answer.'],
    ['🙋','Ask for help','If you are stuck, raise your hand and ask.','If you are stuck, raise your hand and ask for help.'],
    ['✍️','Write your name','Start with a capital letter: Ruhaimah.','Write your name with a capital letter at the start.']
  ],
  general:[
    ['🌸','Seasons','spring 🌸 summer ☀️ fall 🍂 winter ❄️','The four seasons are spring, summer, fall, and winter.'],
    ['📅','Days of the week','Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday','Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. There are seven days in a week.'],
    ['🗓️','Months','January, February, March, April, May, June, July, August, September, October, November, December','There are twelve months. January, February, March, April, May, June, July, August, September, October, November, December.'],
    ['🔺','Shapes','circle ⚪ square 🟥 triangle 🔺 star ⭐','Circle. Square. Triangle. Star.'],
    ['🌦️','Weather','sunny ☀️ rainy 🌧️ snowy ❄️ windy 🌬️','The weather can be sunny, rainy, snowy, or windy.'],
    ['🌈','Rainbow colors','red, orange, yellow, green, blue, purple','The rainbow colors are red, orange, yellow, green, blue, and purple.']
  ]
};

const ALPHABET = [['A','🍎','apple'],['B','⚽','ball'],['C','🐱','cat'],['D','🐶','dog'],['E','🥚','egg'],['F','🐟','fish'],['G','🍇','grapes'],['H','🎩','hat'],['I','🐛','insect'],['J','🧃','juice'],['K','🪁','kite'],['L','🦁','lion'],['M','🌙','moon'],['N','👃','nose'],['O','🐙','octopus'],['P','🐷','pig'],['Q','👸','queen'],['R','🐰','rabbit'],['S','☀️','sun'],['T','🌳','tree'],['U','☂️','umbrella'],['V','🎻','violin'],['W','🐳','whale'],['X','🦊','fox'],['Y','🪀','yo-yo'],['Z','🦓','zebra']];

/* Traditional nursery rhymes (public domain) */
const EN_RHYMES = [
  {title:'Twinkle, Twinkle, Little Star', emoji:'⭐', lines:['Twinkle, twinkle, little star,','How I wonder what you are!','Up above the world so high,','Like a diamond in the sky.','Twinkle, twinkle, little star,','How I wonder what you are!']},
  {title:'Rain, Rain, Go Away', emoji:'🌧️', lines:['Rain, rain, go away,','Come again another day.','Little children want to play,','Rain, rain, go away.']},
  {title:'One, Two, Buckle My Shoe', emoji:'👟', lines:['One, two, buckle my shoe,','Three, four, shut the door,','Five, six, pick up sticks,','Seven, eight, lay them straight,','Nine, ten, a big fat hen!']},
  {title:'Humpty Dumpty', emoji:'🥚', lines:['Humpty Dumpty sat on a wall,','Humpty Dumpty had a great fall.','All the king’s horses and all the king’s men','Couldn’t put Humpty together again.']},
  {title:'Jack and Jill', emoji:'🪣', lines:['Jack and Jill went up the hill','To fetch a pail of water.','Jack fell down and broke his crown,','And Jill came tumbling after.']},
  {title:'Hickory, Dickory, Dock', emoji:'🐭', lines:['Hickory, dickory, dock,','The mouse ran up the clock.','The clock struck one,','The mouse ran down,','Hickory, dickory, dock.']},
  {title:'Baa, Baa, Black Sheep', emoji:'🐑', lines:['Baa, baa, black sheep,','Have you any wool?','Yes sir, yes sir,','Three bags full.','One for the master,','And one for the dame,','And one for the little boy','Who lives down the lane.']},
  {title:'Row, Row, Row Your Boat', emoji:'🚣', lines:['Row, row, row your boat,','Gently down the stream.','Merrily, merrily, merrily, merrily,','Life is but a dream.']},
  {title:'Little Miss Muffet', emoji:'🕷️', lines:['Little Miss Muffet','Sat on a tuffet,','Eating her curds and whey;','Along came a spider,','Who sat down beside her','And frightened Miss Muffet away.']}
];

const bodyParts = [
  {id:'head',name:'Head',fact:'Your head holds your brain.'},
  {id:'eye',name:'Eyes',fact:'Your eyes help you see.'},
  {id:'ear',name:'Ears',fact:'Your ears help you hear.'},
  {id:'nose',name:'Nose',fact:'Your nose helps you smell.'},
  {id:'mouth',name:'Mouth',fact:'Your mouth helps you talk and eat.'},
  {id:'heart',name:'Heart',fact:'Your heart pumps blood all around your body.'},
  {id:'lungs',name:'Lungs',fact:'Your lungs help you breathe.'},
  {id:'stomach',name:'Stomach',fact:'Your stomach helps digest your food.'},
  {id:'arm',name:'Arms',fact:'You use your arms to lift and hug.'},
  {id:'hand',name:'Hands',fact:'Hands help you hold, draw and wave.'},
  {id:'leg',name:'Legs',fact:'Legs help you stand, walk and jump.'},
  {id:'foot',name:'Feet',fact:'Feet help you balance and walk.'},
  {id:'bones',name:'Bones / Skeleton',fact:'Bones hold your body up and protect the soft parts inside, like your brain, heart and lungs.'}
];
let activeBodyPart = 'head';

const planets = [
  {name:'Mercury',fact:'Mercury is the closest planet to the Sun.'},
  {name:'Venus',fact:'Venus is the hottest planet. It is very bright.'},
  {name:'Earth',fact:'Earth is our home planet.'},
  {name:'Mars',fact:'Mars is called the red planet.'},
  {name:'Jupiter',fact:'Jupiter is the biggest planet.'},
  {name:'Saturn',fact:'Saturn has beautiful rings.'},
  {name:'Uranus',fact:'Uranus is an icy giant that spins on its side.'},
  {name:'Neptune',fact:'Neptune is the farthest planet from the Sun.'}
];

const usaStates = [
['AL','Alabama','Montgomery','South'],['AK','Alaska','Juneau','West'],['AZ','Arizona','Phoenix','West'],['AR','Arkansas','Little Rock','South'],['CA','California','Sacramento','West'],['CO','Colorado','Denver','West'],['CT','Connecticut','Hartford','Northeast'],['DE','Delaware','Dover','South'],['FL','Florida','Tallahassee','South'],['GA','Georgia','Atlanta','South'],['HI','Hawaii','Honolulu','West'],['ID','Idaho','Boise','West'],['IL','Illinois','Springfield','Midwest'],['IN','Indiana','Indianapolis','Midwest'],['IA','Iowa','Des Moines','Midwest'],['KS','Kansas','Topeka','Midwest'],['KY','Kentucky','Frankfort','South'],['LA','Louisiana','Baton Rouge','South'],['ME','Maine','Augusta','Northeast'],['MD','Maryland','Annapolis','South'],['MA','Massachusetts','Boston','Northeast'],['MI','Michigan','Lansing','Midwest'],['MN','Minnesota','Saint Paul','Midwest'],['MS','Mississippi','Jackson','South'],['MO','Missouri','Jefferson City','Midwest'],['MT','Montana','Helena','West'],['NE','Nebraska','Lincoln','Midwest'],['NV','Nevada','Carson City','West'],['NH','New Hampshire','Concord','Northeast'],['NJ','New Jersey','Trenton','Northeast'],['NM','New Mexico','Santa Fe','West'],['NY','New York','Albany','Northeast'],['NC','North Carolina','Raleigh','South'],['ND','North Dakota','Bismarck','Midwest'],['OH','Ohio','Columbus','Midwest'],['OK','Oklahoma','Oklahoma City','South'],['OR','Oregon','Salem','West'],['PA','Pennsylvania','Harrisburg','Northeast'],['RI','Rhode Island','Providence','Northeast'],['SC','South Carolina','Columbia','South'],['SD','South Dakota','Pierre','Midwest'],['TN','Tennessee','Nashville','South'],['TX','Texas','Austin','South'],['UT','Utah','Salt Lake City','West'],['VT','Vermont','Montpelier','Northeast'],['VA','Virginia','Richmond','South'],['WA','Washington','Olympia','West'],['WV','West Virginia','Charleston','South'],['WI','Wisconsin','Madison','Midwest'],['WY','Wyoming','Cheyenne','West']
];
const bdDivisions = {
  'Barishal':['Barguna','Barishal','Bhola','Jhalokati','Patuakhali','Pirojpur'],
  'Chattogram':['Bandarban','Brahmanbaria','Chandpur','Chattogram','Cumilla',"Cox's Bazar",'Feni','Khagrachhari','Lakshmipur','Noakhali','Rangamati'],
  'Dhaka':['Dhaka','Faridpur','Gazipur','Gopalganj','Kishoreganj','Madaripur','Manikganj','Munshiganj','Narayanganj','Narsingdi','Rajbari','Shariatpur','Tangail'],
  'Khulna':['Bagerhat','Chuadanga','Jashore','Jhenaidah','Khulna','Kushtia','Magura','Meherpur','Narail','Satkhira'],
  'Mymensingh':['Jamalpur','Mymensingh','Netrokona','Sherpur'],
  'Rajshahi':['Bogura','Chapainawabganj','Joypurhat','Naogaon','Natore','Pabna','Rajshahi','Sirajganj'],
  'Rangpur':['Dinajpur','Gaibandha','Kurigram','Lalmonirhat','Nilphamari','Panchagarh','Rangpur','Thakurgaon'],
  'Sylhet':['Habiganj','Moulvibazar','Sunamganj','Sylhet']
};
const mapColors = ['#f7b4d3','#a9ddff','#f6d98b','#b8e8c1','#d3c1ff','#f6b58b','#9ee1d8','#d8c1a6'];
const bdAliases = {barisal:'barishal',chittagong:'chattogram',comilla:'cumilla',jessore:'jashore',bogra:'bogura',netrakona:'netrokona',coxsbazar:'coxsbazar',maulvibazar:'moulvibazar',nawabganj:'chapainawabganj',jhalakati:'jhalokati'};
function normName(s){ const k = String(s).toLowerCase().replace(/[^a-z]/g, '').replace(/district$|division$/, ''); return bdAliases[k] || k; }

const illustratedStories = [
 {title:'The Red Kite',emoji:'🪁',scene:'kite',lines:['Sam has a red kite.','The wind blows.','The kite goes up, up, up!','Sam smiles.'],q:'What color is the kite?',choices:['Red','Blue','Green'],a:'Red'},
 {title:'A Cat in a Box',emoji:'🐱',scene:'cat',lines:['A cat sees a box.','The cat jumps in.','It sits in the box.','It takes a nap.'],q:'Where does the cat nap?',choices:['In a box','On a tree','In a car'],a:'In a box'},
 {title:'The Little Seed',emoji:'🌱',scene:'seed',lines:['Mia plants a seed.','She gives it water.','The sun shines.','A little plant grows.'],q:'What does Mia plant?',choices:['A seed','A rock','A shoe'],a:'A seed'},
 {title:'The Pond',emoji:'🐸',scene:'pond',lines:['A frog sits by a pond.','A duck swims past.','The frog hops on a leaf.','Splash! It jumps in.'],q:'What swims past the frog?',choices:['A duck','A dog','A cat'],a:'A duck'},
 {title:'A Trip to the Moon',emoji:'🚀',scene:'moon',lines:['Ben sees the moon.','He draws a rocket.','He puts stars in the sky.','Ben dreams of space.'],q:'What does Ben draw?',choices:['A rocket','A boat','A train'],a:'A rocket'},
 {title:'The Lost Ball',emoji:'⚽',scene:'ball',lines:['Lily has a ball.','It rolls under a tree.','Her friend sees it.','They play together.'],q:'Where did the ball roll?',choices:['Under a tree','Into a lake','On a roof'],a:'Under a tree'},
 {title:'A Rainy Day',emoji:'☔',scene:'rain',lines:['It is raining.','Ava puts on her boots.','She gets her umbrella.','She jumps in a puddle.'],q:'What keeps Ava dry?',choices:['An umbrella','A book','A ball'],a:'An umbrella'},
 {title:'The Butterfly',emoji:'🦋',scene:'butterfly',lines:['A butterfly lands on a flower.','It has orange wings.','It flies over the grass.','I watch it fly away.'],q:'What color are its wings?',choices:['Orange','Black','Blue'],a:'Orange'}
];

/* ---------- pictures (from the original site) ---------- */
function bodySVG(active = 'head'){
  if (active === 'bones') return skeletonSVG('', false);
  const SKIN = '#f8cfb2', LINE = '#b97c5c', on = id => active === id;
  const limb = (x1, y1, x2, y2, w, c = SKIN) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LINE}" stroke-width="${w + 5}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const ring = (id, shape) => on(id) ? `<g class="hl-ring">${shape}</g>` : '';
  const glow = id => on(id) ? 'filter="url(#bodyGlow)"' : '';
  const lung = X => `M${X(163)} 178 C${X(141)} 170 ${X(124)} 190 ${X(124)} 220 C${X(124)} 246 ${X(140)} 256 ${X(157)} 248 C${X(163)} 245 ${X(165)} 236 ${X(165)} 226 Z`;
  const M = x => 340 - x, I = x => x;
  return `<svg viewBox="0 0 340 560" width="100%" role="img" aria-label="Cartoon body diagram${active ? ': ' + active + ' is glowing' : ''}">
  <defs><filter id="bodyGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="b"/><feFlood flood-color="#ffb020"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <ellipse cx="170" cy="540" rx="110" ry="12" fill="#d7ebf7"/>
  <!-- legs and shoes -->
  <g ${glow('leg')}>${limb(144, 352, 140, 492, 28)}${limb(196, 352, 200, 492, 28)}</g>
  <g ${glow('foot')}><path d="M112 512 Q112 494 140 494 Q160 494 160 510 Q160 522 136 522 Q112 522 112 512 Z" fill="#ff7aa8" stroke="#d44f80" stroke-width="3"/><path d="M228 512 Q228 494 200 494 Q180 494 180 510 Q180 522 204 522 Q228 522 228 512 Z" fill="#ff7aa8" stroke="#d44f80" stroke-width="3"/><path d="M118 512 H156 M222 512 H184" stroke="#fff" stroke-width="3" opacity=".7"/></g>
  <!-- shorts -->
  <path d="M112 296 Q170 308 228 296 L234 356 L178 356 L170 334 L162 356 L106 356 Z" fill="#8b6cf0" stroke="#6248c8" stroke-width="3"/>
  <!-- arms and hands -->
  <g ${glow('arm')}>${limb(116, 178, 86, 290, 24)}${limb(224, 178, 254, 290, 24)}<path d="M108 170 Q116 160 132 162 L128 196 L104 192 Z M232 170 Q224 160 208 162 L212 196 L236 192 Z" fill="#7cd3f7" stroke="#3f9cc8" stroke-width="3"/></g>
  <g ${glow('hand')}><circle cx="82" cy="306" r="16" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/><ellipse cx="96" cy="298" rx="6" ry="9" transform="rotate(-30 96 298)" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/><circle cx="258" cy="306" r="16" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/><ellipse cx="244" cy="298" rx="6" ry="9" transform="rotate(30 244 298)" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>
  <!-- body with a see-inside window -->
  <path d="M122 166 Q170 152 218 166 Q230 170 230 186 L226 300 Q170 312 114 300 L110 186 Q110 170 122 166 Z" fill="#7cd3f7" stroke="#3f9cc8" stroke-width="3"/>
  <rect x="124" y="172" width="92" height="124" rx="30" fill="#fff4ec" stroke="#3f9cc8" stroke-width="2" stroke-dasharray="6 5"/>
  <g ${glow('lungs')} opacity="${on('lungs') ? 1 : .85}"><path d="${lung(I)}" fill="${on('lungs') ? '#ff8fab' : '#ffc4d1'}" stroke="#e07a91" stroke-width="2.5"/><path d="${lung(M)}" fill="${on('lungs') ? '#ff8fab' : '#ffc4d1'}" stroke="#e07a91" stroke-width="2.5"/><path d="M170 176 V196 M170 196 Q160 202 152 210 M170 196 Q180 202 188 210" stroke="#e07a91" stroke-width="3" fill="none"/></g>
  <g ${glow('heart')}><path d="M180 236 C160 222 160 202 172 202 C176 202 179 205 180 209 C181 205 184 202 188 202 C200 202 200 222 180 236 Z" fill="${on('heart') ? '#ff2e55' : '#ff5c7a'}" stroke="#c2183c" stroke-width="2.5"/></g>
  <g ${glow('stomach')}><path d="M158 262 C160 248 190 246 200 260 C208 274 198 292 180 290 C168 289 172 278 158 272 Z" fill="${on('stomach') ? '#ffad4d' : '#ffd29a'}" stroke="#e0903a" stroke-width="2.5"/></g>
  <!-- neck and head -->
  <rect x="160" y="140" width="20" height="24" rx="6" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/>
  <g ${glow('ear')}><circle cx="116" cy="100" r="12" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/><circle cx="224" cy="100" r="12" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/><path d="M114 96 q5 4 0 9 M226 96 q-5 4 0 9" stroke="${LINE}" stroke-width="2" fill="none"/></g>
  <g ${glow('head')}><circle cx="170" cy="96" r="54" fill="${SKIN}" stroke="${LINE}" stroke-width="3"/></g>
  <path d="M116 98 C110 46 148 30 172 32 C204 32 232 52 224 100 C214 74 200 62 186 64 C180 74 160 78 140 76 C130 82 120 90 116 98 Z" fill="#4a2e2a"/>
  <path d="M222 70 C246 80 246 120 232 138 C230 120 228 100 222 90 Z" fill="#4a2e2a"/><circle cx="226" cy="64" r="9" fill="#ff7aa8"/>
  <g ${glow('eye')}><ellipse cx="151" cy="100" rx="11" ry="12" fill="#fff" stroke="#5a4366" stroke-width="2"/><ellipse cx="189" cy="100" rx="11" ry="12" fill="#fff" stroke="#5a4366" stroke-width="2"/><circle cx="152" cy="102" r="6.5" fill="#3b2a4a"/><circle cx="190" cy="102" r="6.5" fill="#3b2a4a"/><circle cx="154" cy="99" r="2.2" fill="#fff"/><circle cx="192" cy="99" r="2.2" fill="#fff"/></g>
  <circle cx="138" cy="120" r="8" fill="#ff9fae" opacity=".55"/><circle cx="202" cy="120" r="8" fill="#ff9fae" opacity=".55"/>
  <g ${glow('nose')}><path d="M170 106 Q164 116 171 117" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/></g>
  <g ${glow('mouth')}><path d="M154 126 Q170 142 186 126 Q170 132 154 126 Z" fill="#c2405e" stroke="#a02c48" stroke-width="2.5" stroke-linejoin="round"/></g>
  <!-- glowing rings for the chosen part -->
  ${ring('head', '<circle cx="170" cy="92" r="64"/>')}
  ${ring('eye', '<circle cx="151" cy="100" r="18"/><circle cx="189" cy="100" r="18"/>')}
  ${ring('ear', '<circle cx="116" cy="100" r="19"/><circle cx="224" cy="100" r="19"/>')}
  ${ring('nose', '<circle cx="170" cy="112" r="13"/>')}
  ${ring('mouth', '<ellipse cx="170" cy="131" rx="24" ry="13"/>')}
  ${ring('heart', '<circle cx="180" cy="218" r="25"/>')}
  ${ring('lungs', '<ellipse cx="170" cy="213" rx="56" ry="46"/>')}
  ${ring('stomach', '<ellipse cx="180" cy="270" rx="32" ry="26"/>')}
  ${ring('arm', '<rect x="62" y="158" width="64" height="146" rx="30" transform="rotate(14 94 231)"/><rect x="214" y="158" width="64" height="146" rx="30" transform="rotate(-14 246 231)"/>')}
  ${ring('hand', '<circle cx="84" cy="304" r="27"/><circle cx="256" cy="304" r="27"/>')}
  ${ring('leg', '<rect x="122" y="344" width="40" height="160" rx="20"/><rect x="178" y="344" width="40" height="160" rx="20"/>')}
  ${ring('foot', '<ellipse cx="136" cy="510" rx="34" ry="22"/><ellipse cx="204" cy="510" rx="34" ry="22"/>')}
</svg>`;
}
function storyPicture(scene){
 if (scene && typeof scene === 'object') return emojiScene(scene);
 const tree='<rect x="249" y="105" width="22" height="103" rx="5" fill="#98623d"/><circle cx="260" cy="90" r="56" fill="#70be73"/><circle cx="225" cy="104" r="33" fill="#83cf7c"/>';
 const kid='<circle cx="89" cy="109" r="25" fill="#c98d65"/><path d="M65 106Q60 75 88 77Q116 75 115 108Q90 90 65 106" fill="#523735"/><circle cx="82" cy="110" r="2.5"/><circle cx="98" cy="110" r="2.5"/><path d="M84 120Q90 125 96 120" fill="none" stroke="#703f3a" stroke-width="2"/><path d="M69 140Q90 125 111 140L117 191H62Z" fill="#a184ea"/><path d="M77 190V218M103 190V218" stroke="#47567e" stroke-width="11" stroke-linecap="round"/><path d="M68 145L48 168M111 145L136 125" stroke="#c98d65" stroke-width="10" stroke-linecap="round"/>';
 const flower='<path d="M0 15V50" stroke="#40965c" stroke-width="5"/><ellipse cx="-9" cy="35" rx="12" ry="5" fill="#69ba68"/><g fill="#f4a0bd"><circle cx="-10" cy="0" r="10"/><circle cx="10" cy="0" r="10"/><circle cx="0" cy="-10" r="10"/><circle cx="0" cy="10" r="10"/></g><circle r="8" fill="#ffcf60"/>';
 const scenes={kite:kid+'<path d="M136 125Q190 130 228 62" fill="none" stroke="#776b86" stroke-width="2"/><path d="M228 18L263 61L228 104L193 61Z" fill="#e95e64" stroke="#b83d4f" stroke-width="2"/><path d="M228 18V104M193 61H263" stroke="#ffb6ae" stroke-width="2"/>',cat:'<rect x="105" y="130" width="140" height="83" rx="8" fill="#c28c57"/><ellipse cx="175" cy="131" rx="70" ry="19" fill="#97663f"/><ellipse cx="175" cy="114" rx="50" ry="34" fill="#edb56e"/><path d="M137 92L141 57L163 81M187 81L211 57L216 94" fill="#edb56e"/><path d="M151 111Q159 117 167 111M183 111Q191 117 199 111" fill="none" stroke="#664736" stroke-width="3"/><path d="M169 123L181 123L175 128Z" fill="#bb6876"/>',seed:kid+'<path d="M172 202Q230 172 300 202V224H172Z" fill="#9e6b43"/><g transform="translate(240 151)">'+flower+'</g><path d="M136 125L169 142" stroke="#c98d65" stroke-width="8"/><path d="M150 133H180V163H150Z" fill="#5fb6dd"/><path d="M180 145L202 160" stroke="#5fb6dd" stroke-width="8"/><path d="M203 169L201 180M210 172L208 183" stroke="#5fb6dd" stroke-width="3"/>',pond:'<ellipse cx="175" cy="177" rx="151" ry="55" fill="#73cae6"/><ellipse cx="112" cy="184" rx="45" ry="13" fill="#69ae67"/><ellipse cx="112" cy="162" rx="30" ry="20" fill="#76c76a"/><circle cx="96" cy="146" r="12" fill="#76c76a"/><circle cx="128" cy="146" r="12" fill="#76c76a"/><circle cx="96" cy="144" r="4"/><circle cx="128" cy="144" r="4"/><path d="M100 165Q112 172 124 165" fill="none" stroke="#326c39" stroke-width="2"/><ellipse cx="238" cy="156" rx="37" ry="22" fill="#fff5cb"/><circle cx="263" cy="133" r="18" fill="#fff5cb"/><path d="M278 132L298 139L278 145Z" fill="#ef9a3b"/><circle cx="267" cy="129" r="3"/>',moon:'<rect width="350" height="240" fill="#202957"/><circle cx="265" cy="64" r="40" fill="#f6e9bd"/><circle cx="251" cy="50" r="9" fill="#d6cba5"/><circle cx="282" cy="75" r="12" fill="#d6cba5"/><g fill="#fff4b9"><circle cx="55" cy="40" r="3"/><circle cx="180" cy="32" r="4"/><circle cx="320" cy="120" r="3"/><circle cx="42" cy="140" r="4"/></g><g transform="translate(150 120) rotate(28)"><path d="M0 -70Q40 -30 24 32H-24Q-40 -30 0 -70" fill="#f5f6ff"/><path d="M-24 10L-46 45L-20 35M24 10L46 45L20 35" fill="#ed747a"/><circle cy="-18" r="15" fill="#83ceef"/><path d="M-13 35L0 80L13 35Z" fill="#ffc45b"/></g>',ball:tree+kid+'<circle cx="240" cy="207" r="19" fill="#fff" stroke="#667" stroke-width="2"/><path d="M240 194L251 202L247 215H233L229 202Z" fill="#505168"/>',rain:'<rect width="350" height="240" fill="#dbe6f4"/><ellipse cx="100" cy="218" rx="76" ry="14" fill="#9bcde8"/>'+kid+'<path d="M28 102Q86 13 148 102Z" fill="#ef7b9b"/><path d="M88 102V160Q88 173 99 173" fill="none" stroke="#6b5979" stroke-width="4"/><g stroke="#8bb5dc" stroke-width="3">'+Array.from({length:16},(_,i)=>`<path d="M${12+i*21} ${20+(i%4)*36}l-7 15"/>`).join('')+'</g>',butterfly:'<g transform="translate(245 145)">'+flower+'</g><g transform="translate(150 105)"><ellipse cx="-26" cy="-20" rx="35" ry="29" transform="rotate(25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="26" cy="-20" rx="35" ry="29" transform="rotate(-25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="-22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse cx="22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse rx="5" ry="33" fill="#694944"/><path d="M0 -28L-12 -43M0 -28L12 -43" stroke="#694944" stroke-width="2"/></g>'};
 return `<svg class="story-art" viewBox="0 0 350 240" role="img" aria-label="Illustration for ${esc(scene)}"><rect width="350" height="240" fill="#dff3ff"/><circle cx="302" cy="40" r="24" fill="#ffe39a"/><path d="M0 190Q90 153 180 190T350 190V240H0Z" fill="#b9e5a9"/>${scenes[scene]}</svg>`;
}
function planetPicture(name){const colors={Mercury:['#d7d3cc','#77736e'],Venus:['#f6d692','#b77b45'],Earth:['#67c5fa','#2457a3'],Mars:['#f0a16b','#a94d38'],Jupiter:['#f6d9ad','#b98b68'],Saturn:['#fae5ad','#c5a26b'],Uranus:['#b5f1eb','#58a9b8'],Neptune:['#72a8ff','#244aaf']};let c=colors[name];let id='planet'+name;let detail='';if(name==='Earth') detail='<path d="M45 37L60 25 80 32 83 48 69 54 65 70 53 69 49 55 37 48Z M92 72L111 67 122 79 111 92 105 111 95 105 89 85Z M92 30L120 34 129 51 112 58 99 47Z" fill="#71bc79"/><path d="M28 61Q55 48 83 63M80 102Q112 91 130 103" stroke="#fff" stroke-width="7" opacity=".55" fill="none"/>';else if(['Jupiter','Saturn','Venus','Neptune','Uranus'].includes(name)) detail=Array.from({length:7},(_,i)=>`<path d="M15 ${33+i*15}Q80 ${46+i*15} 145 ${31+i*15}" stroke="${i%2?c[1]:'#fff3d9'}" opacity="${name==='Jupiter'?.56:.20}" stroke-width="${i%2?8:5}" fill="none"/>`).join('')+(name==='Jupiter'?'<ellipse cx="105" cy="92" rx="19" ry="8" fill="#bb644d"/>':'');else detail=Array.from({length:10},(_,i)=>`<circle cx="${36+(i*23)%83}" cy="${36+(i*31)%88}" r="${3+i%8}" fill="${c[1]}" opacity=".34"/>`).join('');return `<svg viewBox="0 0 160 160" class="planet-picture" role="img" aria-label="Illustration of ${name}"><defs><radialGradient id="${id}" cx="32%" cy="27%" r="74%"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient><clipPath id="${id}clip"><circle cx="80" cy="80" r="56"/></clipPath></defs>${name==='Saturn'?'<ellipse cx="80" cy="80" rx="78" ry="22" transform="rotate(-22 80 80)" stroke="#e6c98a" stroke-width="12" fill="none"/>':''}<circle cx="80" cy="80" r="56" fill="url(#${id})"/><g clip-path="url(#${id}clip)">${detail}</g>${name==='Saturn'?'<path d="M7 103Q61 117 148 53" stroke="#f5d9a1" stroke-width="8" fill="none" opacity=".9"/>':''}</svg>`;}

/* ---------- Skeleton: a friendly cartoon skeleton with tappable bones ---------- */
const BONES = [
  {id:'skull', name:'Skull', fact:'Your skull is like a helmet. It protects your brain.'},
  {id:'jaw', name:'Jaw', fact:'Your jaw is the only bone in your head that moves. It helps you chew and talk.'},
  {id:'spine', name:'Spine (backbone)', fact:'Your spine is a stack of small bones. It holds you up and lets you bend and twist.'},
  {id:'collar', name:'Collarbones', fact:'Your collarbones join your arms to your body. You can feel them just below your neck.'},
  {id:'ribs', name:'Ribs', fact:'Your ribs make a cage that protects your heart and lungs. Most people have 12 pairs of ribs.'},
  {id:'arm', name:'Arm bones', fact:'Your upper arm has one bone. Your lower arm has two bones side by side.'},
  {id:'hand', name:'Hand bones', fact:'Each hand has 27 bones! That is why your fingers can move in so many ways.'},
  {id:'pelvis', name:'Hip bones', fact:'Your hip bones are shaped like a bowl. They join your legs to your spine.'},
  {id:'leg', name:'Thigh bone', fact:'Your thigh bone is the biggest and strongest bone in your body!'},
  {id:'knee', name:'Kneecap', fact:'Your kneecap is a small round bone that protects the front of your knee.'},
  {id:'shin', name:'Shin bones', fact:'Your lower leg has two bones. The big one in front is your shin bone.'},
  {id:'foot', name:'Foot bones', fact:'Each foot has 26 bones that help you stand, walk and jump.'}
];
const BONE_FUN = [
  ['🦴','206 bones','Grown-ups have 206 bones. Babies have about 300, and some join together as they grow.'],
  ['👂','The tiniest bone','The smallest bone in your body is inside your ear. It is about as big as a grain of rice!'],
  ['🥛','Strong bones','Milk, yogurt, cheese and leafy greens help build strong bones. So do running and jumping!'],
  ['🩹','Bones can heal','If a bone breaks, your body can grow new bone to fix it. A cast keeps it still while it heals.']
];
let activeBone = 'skull';
function cartoonBone(x1, y1, x2, y2, w, fill, line){
  const L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L, o = w * .42, r = w * .62;
  const knobs = [[x1 + nx * o, y1 + ny * o], [x1 - nx * o, y1 - ny * o], [x2 + nx * o, y2 + ny * o], [x2 - nx * o, y2 - ny * o]];
  const layer = (c, extra) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w + extra}" stroke-linecap="round"/>` + knobs.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + extra / 2).toFixed(1)}" fill="${c}"/>`).join('');
  return layer(line, 5) + layer(fill, 0);
}
function skeletonSVG(active, clickable){
  const F = id => active === id ? '#ffd27a' : '#fffaf0', O = id => active === id ? '#e0952a' : '#a8997f';
  const B = (id, x1, y1, x2, y2, w) => cartoonBone(x1, y1, x2, y2, w, F(id), O(id));
  const both = fn => fn(x => x) + fn(x => 300 - x); // draw left side, then mirror it
  const g = (id, inner) => { const b = BONES.find(x => x.id === id); return `<g class="bone-g ${active === id ? 'sel' : ''}" ${clickable ? `onclick="pickBone('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickBone('${id}')}" role="button" tabindex="0" aria-label="${b.name}"` : ''}><title>${b.name}</title>${inner}</g>`; };
  const ribOuter = [114, 106, 101, 99, 100, 104];
  const parts = [
    g('pelvis', `<path d="M150 356 C128 343 97 343 97 372 C97 399 124 409 140 398 L150 405 L160 398 C176 409 203 399 203 372 C203 343 172 343 150 356 Z" fill="${F('pelvis')}" stroke="${O('pelvis')}" stroke-width="3"/><ellipse cx="127" cy="384" rx="9" ry="7" fill="#eef9ff" stroke="${O('pelvis')}" stroke-width="2"/><ellipse cx="173" cy="384" rx="9" ry="7" fill="#eef9ff" stroke="${O('pelvis')}" stroke-width="2"/>`),
    g('spine', Array.from({length:19}, (_, i) => `<rect x="${i < 3 ? 143 : 141}" y="${128 + i * 12}" width="${i < 3 ? 14 : 18}" height="9" rx="4" fill="${F('spine')}" stroke="${O('spine')}" stroke-width="2"/>`).join('')),
    g('ribs', ribOuter.map((ox, i) => { const y = 164 + i * 15, d = X => `M${X(146)} ${y} C${X(128)} ${y - 7} ${X(ox)} ${y - 5} ${X(ox)} ${y + 12} C${X(ox)} ${y + 20} ${X(ox + 3)} ${y + 24} ${X(ox + 6)} ${y + 27}`;
      return both(X => `<path d="${d(X)}" fill="none" stroke="${O('ribs')}" stroke-width="8.5" stroke-linecap="round"/><path d="${d(X)}" fill="none" stroke="${F('ribs')}" stroke-width="4" stroke-linecap="round"/>`); }).join('') + `<rect x="143" y="156" width="14" height="80" rx="7" fill="${F('ribs')}" stroke="${O('ribs')}" stroke-width="2.5"/>`),
    g('collar', both(X => B('collar', X(143), 150, X(97), 149, 7))),
    g('arm', both(X => B('arm', X(100), 158, X(86), 262, 10) + B('arm', X(84), 274, X(73), 364, 6.5) + B('arm', X(94), 275, X(85), 365, 5.5))),
    g('hand', both(X => `<ellipse cx="${X(79)}" cy="${377}" rx="12" ry="7" fill="${F('hand')}" stroke="${O('hand')}" stroke-width="2.5"/>` + [[70, 63], [76, 71], [82, 80], [88, 89]].map(([a, b]) => B('hand', X(a), 388, X(b), 414, 3.4)).join('') + B('hand', X(69), 381, X(57), 397, 3.4))),
    g('leg', both(X => B('leg', X(131), 404, X(125), 528, 12))),
    g('knee', both(X => `<circle cx="${X(125)}" cy="540" r="8.5" fill="${F('knee')}" stroke="${O('knee')}" stroke-width="3"/>`)),
    g('shin', both(X => B('shin', X(123), 553, X(121), 658, 10) + B('shin', X(136), 557, X(134), 654, 5))),
    g('foot', both(X => `<ellipse cx="${X(124)}" cy="672" rx="11" ry="8" fill="${F('foot')}" stroke="${O('foot')}" stroke-width="2.5"/>` + [[118, 96, 680], [120, 99, 688], [123, 104, 695]].map(([a, b, y]) => B('foot', X(a), 674, X(b), y, 3.6)).join(''))),
    g('jaw', `<path d="M117 97 Q119 130 150 132 Q181 130 183 97 Q166 109 150 109 Q134 109 117 97 Z" fill="${F('jaw')}" stroke="${O('jaw')}" stroke-width="3"/>` + Array.from({length:6}, (_, i) => `<rect x="${133 + i * 6}" y="108" width="5" height="7" rx="1.5" fill="#fff" stroke="${O('jaw')}" stroke-width="1"/>`).join('')),
    g('skull', `<path d="M150 12 C100 12 96 58 106 84 C110 96 118 104 126 104 L174 104 C182 104 190 96 194 84 C204 58 200 12 150 12 Z" fill="${F('skull')}" stroke="${O('skull')}" stroke-width="3"/><ellipse cx="131" cy="66" rx="13" ry="15" fill="#4a3d5c"/><ellipse cx="169" cy="66" rx="13" ry="15" fill="#4a3d5c"/><circle cx="127" cy="61" r="3" fill="#fff" opacity=".7"/><circle cx="165" cy="61" r="3" fill="#fff" opacity=".7"/><path d="M150 82 l-7 13 h14 z" fill="#4a3d5c"/>` + Array.from({length:6}, (_, i) => `<rect x="${133 + i * 6}" y="98" width="5" height="7" rx="1.5" fill="#fff" stroke="${O('skull')}" stroke-width="1"/>`).join(''))
  ];
  return `<svg class="skeleton-svg" viewBox="0 0 300 712" width="100%" role="img" aria-label="Cartoon skeleton">${parts.join('')}</svg>`;
}
function skeletonPanel(){
  const b = BONES.find(x => x.id === activeBone) || BONES[0];
  return `<div class="body-wrap">
      <div class="svg-box skeleton-box" id="skelBox">${skeletonSVG(activeBone, true)}</div>
      <div>
        <div class="fact" id="boneFact"><h3>🦴 ${esc(b.name)}</h3><p style="font-size:22px">${esc(b.fact)}</p><div class="row-buttons">${speakBtn(b.name + '. ' + b.fact, 'Listen')}</div></div>
        <div class="label-list" id="boneBtns">${BONES.map(x => `<button class="body-btn ${x.id === activeBone ? 'active' : ''}" data-bone="${x.id}" onclick="pickBone('${x.id}')">${esc(x.name)}</button>`).join('')}</div>
        <div class="grid lesson-grid">${BONE_FUN.map(([em, t, f]) => `<div class="lesson-card"><span class="big-emoji">${em}</span><h3>${t}</h3><p>${f}</p><div class="row-buttons">${speakBtn(f, 'Listen')}</div></div>`).join('')}</div>
      </div>
    </div>`;
}
function pickBone(id){
  activeBone = id; const b = BONES.find(x => x.id === id);
  const box = document.getElementById('skelBox'); if (box) box.innerHTML = skeletonSVG(id, true);
  const f = document.getElementById('boneFact'); if (f) f.innerHTML = `<h3>🦴 ${esc(b.name)}</h3><p style="font-size:22px">${esc(b.fact)}</p><div class="row-buttons">${speakBtn(b.name + '. ' + b.fact, 'Listen')}</div>`;
  document.querySelectorAll('#boneBtns .body-btn').forEach(x => x.classList.toggle('active', x.dataset.bone === id));
  Sfx.tap(); speak(b.name + '. ' + b.fact, {quiet:true});
}

/* ---------- navigation: no page reloads, browser back button works ---------- */
let pageKey = document.body.dataset.subject || '';
function nav(key, mode, extra = {}){ routeTo(key, mode || 'subject', extra); return true; }
function goHome(){ routeTo('', 'subject'); }
function openSubject(k){ routeTo(k, 'subject'); }
function startLearn(k){ routeTo(k, 'learn'); }
function startQuiz(k){ routeTo(k, 'quiz'); }
function startPlay(k, game){ routeTo(k, 'play', game ? {game} : {}); }
function openStory(i){ routeTo('reading', 'story', {index:i}); }
function resumeNow(){
  const r = saved.resume;
  if (!r || !r.subject) return openRoutine();
  if (r.page === 'story') return openStory(r.index || 0);
  if (r.page === 'lesson') return startLearn(r.subject);
  if (r.page === 'quiz') return startQuiz(r.subject);
  if (r.page === 'play') return startPlay(r.subject);
  return openSubject(r.subject);
}
function resumeLabel(){
  const r = saved.resume; if (!r || !r.subject || !subjects.some(s => s.key === r.subject)) return 'Start learning';
  const s = subj(r.subject);
  const what = {story:'story', lesson:'learn', quiz:'quiz', play:'game'}[r.page] || '';
  return `Continue: ${s.title}${what ? ' ' + what : ''}`;
}
function crumbs(backLabel, backAction){ return `<div class="crumbs"><button class="btn small" onclick="${backAction}">← ${esc(backLabel)}</button></div>`; }

/* ---------- home ---------- */
function greeting(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function dailyCards(){
  const done = saved.dailyDone[todayKey()] || {};
  return DAILY.map((d, i) => `<div class="path-step ${done[d.key] ? 'done' : ''}">
      <span class="num">${done[d.key] ? '✓' : i + 1}</span><strong>${d.icon} ${d.label}</strong>
      <button class="btn small ${done[d.key] ? 'secondary' : 'primary'}" onclick="${d.go}">${done[d.key] ? 'Do more' : 'Start'}</button></div>`).join('');
}
function renderHome(){
  stopSpeaking();
  const R = routineState(), plan = routinePlan(), rDone = R.done;
  const book = saved.stickerBook || [];
  const cards = subjects.map(s => {
    const st = statFor(s.key), pct = pctFor(s.key);
    return `<button class="subject-card" style="background:${s.color}" onclick="openSubject('${s.key}')">
      ${s.isNew ? '<span class="new-badge">NEW</span>' : ''}<span class="emoji">${s.emoji}</span>
      <strong>${esc(s.title)}</strong><small>${esc(s.desc)}</small>
      <span class="mini-bar">${st.total ? `<span class="progress" style="display:block;height:8px;margin:0"><i style="width:${pct}%"></i></span>` : ''}</span></button>`;
  }).join('');
  show(`
    <section class="hero">
      <h1>${greeting()}, Ruhaimah!</h1>
      <p>What would you like to learn today? Pick a subject, read a story, or play a game.</p>
      <div class="hero-buttons">
        <button class="btn primary big" onclick="openRoutine()">${rDone ? '✅ Routine done! See my sticker' : R.scores.length ? `🌞 Continue routine (${R.scores.length}/${plan.length})` : '🌞 Start today’s routine'}</button>
        <button class="btn secondary" onclick="openSubject('games')">🎲 Play Tic-Tac-Toe</button>
        <button class="btn gold" onclick="${sayAttr(greeting() + ', Ruhaimah! What would you like to learn today?')}">🔊 Say hello</button>
      </div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>🌞 Today’s routine</h2><span class="pill ${rDone ? 'mint' : ''}">${R.scores.length} / ${plan.length} checks · 🔥 ${streak()} day streak</span></div>
      <div class="path">${plan.map((p, i) => `<div class="path-step ${R.scores[i] ? 'done' : ''}"><span class="num">${R.scores[i] ? '✓' : i + 1}</span><strong>${p.icon} ${esc(p.title)}</strong></div>`).join('')}
        <div class="path-step gift-step ${rDone ? 'done' : ''}"><span class="num">🎁</span><strong>${rDone ? R.sticker.e + ' ' + esc(R.sticker.name) : 'Surprise sticker'}</strong></div></div>
      <div class="row-buttons"><button class="btn primary" onclick="openRoutine()">${rDone ? 'See today’s routine' : R.scores.length ? 'Continue →' : 'Start the routine →'}</button><button class="btn gold" onclick="renderStickerBook()">📒 My sticker book (${new Set(book.map(s => s.e)).size})</button>${saved.resume && saved.resume.subject ? `<button class="btn" onclick="resumeNow()">▶️ ${esc(resumeLabel())}</button>` : ''}</div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>📚 Choose a subject</h2><span class="muted">Every subject has Learn, Quiz and Play.</span></div>
      <div class="grid subject-grid">${cards}</div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>👩‍👧 Grown-ups</h2><div class="row-buttons" style="margin:0"><button class="btn small" onclick="openDashboard()">📊 Progress</button><button class="btn small" onclick="renderSettings()">🎙️ Voice settings</button></div></div>
      <p class="muted">Progress is saved in this browser. Use the dashboard to export it or move it to another device.</p>
    </section>`);
}
function showDailyPath(){ openRoutine(); }

/* ---------- subject page ---------- */
const playNames = {math:'Count the stars',english:'Build a sentence',logic:'Finish the pattern',school:'Follow directions',general:'Calendar game',chess:'Knight jump',reading:'Word builder',science:'Planet challenge',body:'Body detective',rhymes:'Rhyme time',art:'Color detective',geo:'Capital explorer'};
function renderSubject(key){
  if (key === 'games') return renderGamesHub();
  const s = subj(key);
  setResume({page:'subject', subject:key});
  const st = statFor(key), pct = pctFor(key);
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel">
    <div class="section-title"><h1>${s.emoji} ${esc(s.title)}</h1><span class="pill">${st.total ? `⭐ ${st.right} right · ${pct}%` : 'Let’s begin!'}</span></div>
    <p class="muted">${esc(s.desc)}.</p>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="mode-grid">
      <div class="mode-card learn"><div class="bigicon">📘</div><h3>Learn</h3><p>Look, listen and explore.</p><button class="btn primary" onclick="startLearn('${key}')">Open Learn</button></div>
      <div class="mode-card quiz"><div class="bigicon">📝</div><h3>Quiz</h3><p>5 mixed questions. Earn stars!</p><button class="btn gold" onclick="startQuiz('${key}')">Start Quiz</button></div>
      <div class="mode-card play"><div class="bigicon">🎮</div><h3>Play</h3><p>${(PLAY_SETS[key] || []).length || 1} games: ${esc((PLAY_SETS[key] || [[0, playNames[key] || 'Mini game']]).slice(0, 3).map(x => x[1].replace(/^\S+ /, '')).join(', '))}…</p><button class="btn" style="background:#ffd3e8" onclick="startPlay('${key}')">Let’s play</button></div>
    </div>
  </section>`);
  speak(`${s.title}. Choose learn, quiz, or play.`, {quiet:true});
}

/* ---------- learn (generic lesson cards) ---------- */
function lessonCards(list){
  return `<div class="grid lesson-grid">${list.map(([em, title, text, say]) => `<div class="lesson-card"><span class="big-emoji">${em}</span><h3>${esc(title)}</h3><div style="white-space:pre-wrap">${esc(text)}</div><div class="row-buttons">${speakBtn(say, 'Read aloud')}</div></div>`).join('')}</div>`;
}
function renderLearn(key){
  setResume({page:'lesson', subject:key});
  const special = {reading:readingLibrary, geo:renderGeographyLearn, science:renderScienceLearn, body:renderBodyLearn, rhymes:renderRhymes, art:renderArt, chess:renderChess, games:renderGamesHub, math:renderMathLearn, english:renderEnglishLearn, general:renderGeneralLearn, logic:renderLogicLearn, school:renderSchoolLearn, alphabets:renderAlphabets};
  if (special[key]) return special[key]();
  const s = subj(key);
  show(`${crumbs(s.title, `openSubject('${key}')`)}
  <section class="panel"><div class="section-title"><h1>📘 Learn: ${esc(s.title)}</h1>${speakBtn(`Let’s learn ${s.title}! Tap a card to hear it.`)}</div>
    ${lessonCards(lessons[key] || [])}
    <div class="row-buttons"><button class="btn gold" onclick="startQuiz('${key}')">📝 Ready for the quiz</button></div>
  </section><section class="panel">${activityChips(key)}</section>`);
}

/* ---------- quiz engine ---------- */
function blankFact(f){ return f.replace(/Your \w+|Hands|Legs|Feet|You use your \w+/, '___'); }
function numChoices(ans){
  const set = new Set([ans]);
  for (const d of shuffle([1, -1, 2, -2, 3])){ if (set.size >= 3) break; if (ans + d >= 0) set.add(ans + d); }
  return shuffle([...set]).map(String);
}
function renderQuiz(key){
  if (key === 'games') return renderGamesHub();
  setResume({page:'quiz', subject:key});
  currentQuiz = {subject:key, index:0, right:0, items:makeQuiz(key), results:[]};
  if (!currentQuiz.items.length) return renderSubject(key);
  renderQuizCard();
}
function renderQuizCard(){
  const Q = currentQuiz, q = Q.items[Q.index];
  if (!q) return quizDone();
  const s = subj(Q.subject);
  const dots = Q.items.map((_, i) => `<span class="${i < Q.index ? (Q.results[i] ? 'right' : 'wrong') : i === Q.index ? 'now' : ''}"></span>`).join('');
  const sayQ = q.say || q.q;
  show(`${Q.back ? crumbs(Q.back[0], Q.back[1]) : crumbs(s.title, `openSubject('${Q.subject}')`)}
  <section class="panel">
    <div class="section-title"><h1>${Q.title ? esc(Q.title) : `📝 ${esc(s.title)} quiz`}</h1><span class="pill">${Q.tag ? esc(Q.tag) + ' · ' : ''}Question ${Q.index + 1} of ${Q.items.length}</span></div>
    <div class="quiz-dots" aria-hidden="true">${dots}</div>
    ${q.passage ? `<div class="story-layout">${q.scene ? storyPicture(q.scene) : ''}<div class="story-box">${esc(q.passage)}<div class="row-buttons">${speakBtn(q.passage, 'Read the story')}</div></div></div>` : ''}
    <div class="question">${speakBtn(sayQ)}<h2>${esc(q.q)}</h2></div>
    ${q.visual ? `<div class="q-visual" aria-hidden="true">${esc(q.visual)}</div>` : ''}${q.html || ''}
    <div class="choice-grid">${q.choices.map((c, i) => `<button class="choice" data-i="${i}" onclick="answerQuiz(${i}, this)">${esc(c)}</button>`).join('')}</div>
    <div class="feedback" id="feedback" aria-live="polite"></div>
    <button id="nextQuestion" class="btn primary big" hidden onclick="nextQuestion()">${Q.index + 1 < Q.items.length ? 'Next question →' : Q.onDone ? 'Finish this check ✓' : 'See my stars 🌟'}</button>
  </section>`);
  if (voicePrefs.autoRead) speak(q.passage ? [q.passage, sayQ] : sayQ, {quiet:true});
}
function nextQuestion(){ stopSpeaking(); currentQuiz.index++; renderQuizCard(); }
function answerQuiz(i, el){
  const Q = currentQuiz, q = Q.items[Q.index];
  if (Q.results[Q.index] !== undefined) return;
  const ans = q.choices[i], ok = ans === q.a;
  Q.results[Q.index] = ok; if (ok) Q.right++;
  document.querySelectorAll('.choice').forEach(b => { b.disabled = true; const c = q.choices[+b.dataset.i]; if (c === q.a) b.classList.add('good'); else if (b === el) b.classList.add('bad'); });
  recordResult(Q.subject, ok, el);
  const cheer = ok ? pick(cheers) : pick(tryAgains);
  const fb = document.getElementById('feedback');
  fb.className = 'feedback ' + (ok ? 'good' : 'bad');
  fb.textContent = (ok ? '🌟 ' + cheer + ' ' : '💜 ' + cheer + ' The answer is ' + q.a + '. ') + (q.passage ? '' : (q.explain || ''));
  speak(ok ? `${cheer} ${q.passage ? '' : q.explain || ''}` : `${cheer} The answer is ${q.a}.`, {quiet:true});
  const nb = document.getElementById('nextQuestion'); nb.hidden = false; nb.focus({preventScroll:true});
}
function quizDone(){
  if (currentQuiz.onDone) return currentQuiz.onDone(currentQuiz);
  const Q = currentQuiz, s = subj(Q.subject), n = Q.items.length || 0, r = Math.min(n, Q.right || 0);
  const msg = r === n ? 'Perfect score!' : r >= n - 2 ? 'Great work!' : 'Good practice! Let’s try again.';
  const big = r === n ? '🏆' : r >= n - 2 ? '🌟' : '💪';
  show(`${crumbs(s.title, `openSubject('${Q.subject}')`)}
  <section class="panel celebrate"><div class="big">${big}</div><h1>${msg}</h1>
    <p style="font-size:24px">You got <b>${r}</b> out of <b>${n}</b> right.</p>
    <p style="font-size:40px;letter-spacing:4px">${'⭐'.repeat(r)}${'<span style="opacity:.2">⭐</span>'.repeat(n - r)}</p>
    <div class="row-buttons" style="justify-content:center"><button class="btn primary big" onclick="renderQuiz('${Q.subject}')">🔁 Play again</button><button class="btn" onclick="startLearn('${Q.subject}')">📘 Learn more</button><button class="btn" onclick="goHome()">🏠 Home</button></div>
  </section>`);
  if (r >= n - 1){ confetti(); Sfx.win(); }
  speak(`${msg} You got ${r} out of ${n} right.`, {quiet:true});
}

/* ---------- parent dashboard ---------- */
function openDashboard(){
  stopSpeaking();
  const rows = subjects.map(s => { const st = statFor(s.key), pct = pctFor(s.key); return `<tr><td>${s.emoji} ${esc(s.title)}</td><td>${st.right || 0} / ${st.total || 0}</td><td style="min-width:120px"><div class="progress" style="margin:0"><i style="width:${pct}%"></i></div></td><td>${st.total ? pct + '%' : '—'}</td></tr>`; }).join('');
  const book = saved.stickerBook || [];
  const shelf = book.length ? book.slice(-30).map(s => `<span title="${esc(s.name)} · ${s.date} · ${s.right}/${s.total}">${s.e}</span>`).join('') : '<span class="tiny">No stickers yet. Finish a daily routine to earn one.</span>';
  const routineDays = book.length, avg = book.length ? Math.round(book.reduce((a, s) => a + s.right / s.total, 0) / book.length * 100) : 0;
  const t = saved.ttt || {win:0, lose:0, tie:0};
  const last7 = Array.from({length:7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const k = dateKey(d); return {label:d.toLocaleDateString('en-US', {weekday:'short'}), n:saved.days[k] || 0}; });
  const maxN = Math.max(1, ...last7.map(x => x.n));
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel"><div class="section-title"><h1>📊 Parent dashboard</h1><button class="btn small" onclick="exportProgress()">⬇️ Export progress</button></div>
    <div class="grid stat-grid"><div class="stat"><b>${saved.stars || 0}</b>Total stars</div><div class="stat"><b>${accuracy()}%</b>Accuracy</div><div class="stat"><b>${streak()}</b>Day streak</div><div class="stat"><b>${Object.keys(saved.days).length}</b>Active days</div><div class="stat"><b>${Object.keys(saved.storiesRead || {}).length}/${illustratedStories.length}</b>Stories read</div></div>
    <h2 style="margin-top:20px">This week</h2>
    <div style="display:flex;gap:10px;align-items:flex-end;height:120px">${last7.map(x => `<div style="flex:1;text-align:center"><div title="${x.n} activities" style="height:${Math.round(x.n / maxN * 90) + 4}px;background:${x.n ? 'linear-gradient(#8f6cf0,#6b46d6)' : '#ece4fb'};border-radius:10px 10px 4px 4px"></div><span class="tiny">${x.label}</span></div>`).join('')}</div>
    <h2 style="margin-top:20px">🌞 Daily routines</h2><p><b>${routineDays}</b> routine${routineDays === 1 ? '' : 's'} finished · average score <b>${avg}%</b></p><div class="sticker-shelf">${shelf}</div><p class="tiny">One sticker per finished routine. 9–10 right = golden, 7–8 = silver, 5–6 = bronze, otherwise a sprout sticker. <a href="#" onclick="renderStickerBook();return false">Open sticker book</a></p>
    <h2 style="margin-top:20px">By subject</h2>
    <div style="overflow:auto"><table class="dash"><thead><tr><th>Subject</th><th>Right / tried</th><th>Progress</th><th>Accuracy</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p><b>Tic-tac-toe vs Unicorn Bot:</b> ${t.win} wins · ${t.tie} ties · ${t.lose} losses</p>
    ${saved.journal ? `<h2>✍️ Latest writing</h2><div class="story-box">${esc(saved.journal)}</div>` : ''}
    <div class="row-buttons"><button class="btn secondary" onclick="importProgressPrompt()">⬆️ Import progress</button><button class="btn warn" onclick="resetProgress()">Reset progress</button></div>
  </section>`);
}
function exportProgress(){ const blob = new Blob([JSON.stringify(saved, null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ruhaimah-learning-progress.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }
function importProgressPrompt(){ const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try{ const d = JSON.parse(r.result); saved = {...JSON.parse(JSON.stringify(defaultSave)), ...d, ttt:{...defaultSave.ttt, ...(d.ttt || {})}}; saveAll(); toast('Progress imported'); openDashboard(); }catch(err){ toast('Could not read that file'); } }; r.readAsText(f); }; input.click(); }
function resetProgress(){ if (confirm('Reset all saved progress on this browser?')){ saved = JSON.parse(JSON.stringify(defaultSave)); saveAll(); goHome(); } }

/* ---------- voice settings ---------- */
function renderSettings(){
  stopSpeaking();
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel"><h1>🎙️ Voice & sound settings</h1>
    <p class="muted">Changes save automatically. The best-sounding voice on this device is picked for you; you can choose another below.</p>
    <div class="settings-grid">
      <div class="lesson-card"><h3>🔊 Sound</h3>
        <label class="switch"><input type="checkbox" id="audioOn" ${voicePrefs.audio ? 'checked' : ''} onchange="saveSettings()"> Voice reads aloud</label>
        <label class="switch"><input type="checkbox" id="autoRead" ${voicePrefs.autoRead ? 'checked' : ''} onchange="saveSettings()"> Read quiz questions automatically</label>
        <label class="switch"><input type="checkbox" id="sfxOn" ${voicePrefs.sfx ? 'checked' : ''} onchange="saveSettings()"> Happy sound effects</label>
        <label class="switch"><input type="checkbox" id="micOn" ${voicePrefs.mic !== false ? 'checked' : ''} ${SR ? '' : 'disabled'} onchange="saveSettings()"> 🎤 Listen when she reads aloud</label>
        <p class="tiny">${SR ? 'The microphone is only used when she taps 🎤. In Chrome and Edge, speech is sent to Google or Microsoft to be recognized; in Safari it’s handled by Apple. This site saves no recordings.' : 'This browser can’t listen to reading (try Chrome, Edge or Safari). A grown-up check is used instead.'}</p>
      </div>
      <div class="lesson-card"><h3>🐢 Speed <span class="tiny" id="speedLbl"></span></h3>
        <input type="range" id="speed" min="0.6" max="1.15" step="0.05" value="${voicePrefs.speed}" oninput="saveSettings(true)" onchange="saveSettings()">
        <div class="tiny" style="display:flex;justify-content:space-between"><span>Slower</span><span>Faster</span></div>
        <h3 style="margin-top:10px">🎵 Voice tone <span class="tiny" id="pitchLbl"></span></h3>
        <input type="range" id="pitch" min="0.8" max="1.35" step="0.05" value="${voicePrefs.pitch}" oninput="saveSettings(true)" onchange="saveSettings()">
        <div class="tiny" style="display:flex;justify-content:space-between"><span>Lower</span><span>Brighter</span></div>
      </div>
    </div>
    <div class="row-buttons"><button class="btn primary" onclick="testVoice()">🔊 Test the voice</button><button class="btn" onclick="stopSpeaking()">⏹ Stop</button><button class="btn" onclick="resetVoice()">↺ Reset to recommended</button></div>
    <h2 style="margin-top:22px">Choose a voice</h2>
    <div id="voiceList" class="voice-list"><p class="muted">Looking for voices…</p></div>
    <div class="fact" style="margin-top:18px"><h3>💡 Want a more natural voice?</h3>
      <ul style="margin:0;padding-left:20px">
        <li><b>iPad / iPhone:</b> Settings → Accessibility → Spoken Content → Voices → English → download <b>Ava (Enhanced)</b> or <b>Samantha (Enhanced)</b>.</li>
        <li><b>Mac:</b> System Settings → Accessibility → Spoken Content → System voice → Manage Voices → add an <b>Enhanced</b> or <b>Premium</b> voice.</li>
        <li><b>Windows:</b> Microsoft Edge has very natural “Online (Natural)” voices built in.</li>
        <li><b>Android:</b> Settings → Accessibility → Text-to-speech → Google engine → install voice data → English (US).</li>
      </ul>
      <p class="tiny">After adding a voice, reload this page.</p></div>
  </section>`);
  saveSettings(true, true); refreshVoiceList();
}
function refreshVoiceList(){
  const el = document.getElementById('voiceList'); if (!el) return;
  const vs = Voice.english(), best = vs[0], cur = Voice.pick();
  if (!synth){ el.innerHTML = '<p class="muted">This browser cannot speak. Try Chrome, Edge or Safari.</p>'; return; }
  if (!vs.length){ el.innerHTML = '<p class="muted">No English voices found yet. The device default voice will be used.</p>'; return; }
  el.innerHTML = `<div class="voice-row ${!voicePrefs.voiceURI ? 'active' : ''}"><span class="name">✨ Automatic (best available${best ? ': ' + esc(best.name) : ''})</span><button class="btn small ${!voicePrefs.voiceURI ? 'primary' : ''}" onclick="chooseVoice('')">${!voicePrefs.voiceURI ? 'Selected' : 'Use'}</button></div>` +
    vs.slice(0, 40).map((v, i) => `<div class="voice-row ${voicePrefs.voiceURI === v.voiceURI ? 'active' : ''}"><span class="name">${esc(v.name)} <span class="tiny">${esc(v.lang)}</span></span>${i < 3 && Voice.score(v) > 40 ? '<span class="tag">Natural</span>' : ''}<button class="btn small sky" onclick="previewVoice(${i})">▶</button><button class="btn small ${voicePrefs.voiceURI === v.voiceURI ? 'primary' : ''}" onclick="chooseVoice(${i})">${voicePrefs.voiceURI === v.voiceURI ? 'Selected' : 'Use'}</button></div>`).join('');
}
function previewVoice(i){ const v = Voice.english()[i]; if (!v) return; const keep = voicePrefs.voiceURI; voicePrefs.voiceURI = v.voiceURI; speak('Hi Ruhaimah! Let’s read a story together.'); voicePrefs.voiceURI = keep; }
function chooseVoice(i){ voicePrefs.voiceURI = i === '' ? '' : (Voice.english()[i] || {}).voiceURI || ''; saveAll(); refreshVoiceList(); testVoice(); }
function testVoice(){ speak('Hello Ruhaimah! Welcome to your learning world. Let’s have fun learning together!'); }
function resetVoice(){ voicePrefs = {...defaultVoice}; saveAll(); renderSettings(); toast('Voice reset'); }
function saveSettings(quiet, labelsOnly){
  const g = id => document.getElementById(id);
  if (!labelsOnly){
    voicePrefs.audio = g('audioOn').checked; voicePrefs.autoRead = g('autoRead').checked; voicePrefs.sfx = g('sfxOn').checked; if (g('micOn') && SR) voicePrefs.mic = g('micOn').checked;
    voicePrefs.speed = Number(g('speed').value); voicePrefs.pitch = Number(g('pitch').value);
    saveAll(); if (!quiet) toast('Saved ✓');
  }
  const sp = voicePrefs.speed, pi = voicePrefs.pitch;
  g('speedLbl').textContent = sp < .75 ? '(extra slow)' : sp < .92 ? '(slow & clear)' : sp < 1.05 ? '(normal)' : '(quick)';
  g('pitchLbl').textContent = pi < .95 ? '(calm)' : pi < 1.12 ? '(natural)' : '(cheerful)';
}

/* ---------- reading ---------- */
function renderStory(i){
  i = Math.max(0, Math.min(illustratedStories.length - 1, i));
  setResume({page:'story', subject:'reading', index:i});
  const x = illustratedStories[i];
  show(`${crumbs('Story library', "readingLibrary.tab='stories';startLearn('reading')")}
  <section class="panel"><div class="section-title"><h1>${x.emoji} ${esc(x.title)}</h1><span class="pill">${i + 1} / ${illustratedStories.length}</span></div>
    <div class="story-layout">${storyPicture(x.scene)}<div>
      <div class="story-box">${x.lines.map((l, j) => `<button class="story-line" onclick="readStoryLine(${i},${j})">${l.split(' ').map(w => `<span class="w" data-say="${esc(w.replace(/[^\w']/g, ''))}">${esc(w)}</span>`).join(' ')} <span aria-hidden="true">🔊</span></button>`).join('')}</div>
      <div class="row-buttons"><button class="btn primary" onclick="readWholeStory(${i})">🔊 Read to me</button>${Listen.available() ? `<button class="btn secondary" onclick="storyReadMine(${i})"><span class="mic-mini">🎤</span> I’ll read it!</button>` : ''}<button class="btn gold" onclick="storyQuiz(${i})">📝 Story question</button></div>
      <p id="storyFb" class="feedback" aria-live="polite"></p>
    </div></div>
    <div class="row-buttons"><button class="btn" ${i === 0 ? 'disabled' : ''} onclick="renderStory(${i - 1})">← Previous</button><button class="btn" ${i === illustratedStories.length - 1 ? 'disabled' : ''} onclick="renderStory(${i + 1})">Next story →</button></div>
  </section>`);
}
function readStoryLine(i, j){ const els = [...document.querySelectorAll('.story-line')]; readLines([illustratedStories[i].lines[j]], [els[j]]); }
function readWholeStory(i){
  const els = [...document.querySelectorAll('.story-line')];
  readLines(illustratedStories[i].lines, els, {gap:420}).then(done => {
    if (done && !saved.storiesRead[i]){ saved.storiesRead[i] = true; trackDay(); markDaily('reading'); addStars(1, document.querySelector('.story-box')); saveAll(); toast('📖 Story read! +1 star'); }
  });
}
function storyQuiz(i){
  const x = illustratedStories[i];
  currentQuiz = {subject:'reading', index:0, right:0, results:[], items:[{q:x.q, choices:shuffle(x.choices), a:x.a, explain:x.lines.join(' '), passage:x.lines.join(' '), scene:x.scene}]};
  renderQuizCard();
}

/* ---------- math ---------- */
let tenCount = 0;
const NUMW = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
function tenTap(i){ const btns = document.querySelectorAll('#tenFrame button'); const on = btns[i].classList.contains('on'); tenSet(on ? tenCount - 1 : tenCount + 1); }
function tenSet(n, quiet){
  tenCount = Math.max(0, Math.min(10, n));
  document.querySelectorAll('#tenFrame button').forEach((b, i) => { b.classList.toggle('on', i < tenCount); b.textContent = i < tenCount ? '🐞' : ''; });
  document.getElementById('tenNum').textContent = tenCount;
  const w = tenCount === 10 ? 'Ten! The frame is full.' : `${NUMW[tenCount]}. ${10 - tenCount} more to make ten.`;
  document.getElementById('tenWords').textContent = w.charAt(0).toUpperCase() + w.slice(1);
  if (!quiet){ Sfx.pop(); speak(w, {quiet:true}); }
}

/* ---------- english ---------- */
function renderEnglishLearn(){
  setResume({page:'lesson', subject:'english'});
  show(`${crumbs('English', "openSubject('english')")}
  <section class="panel"><div class="section-title"><h1>✏️ Learn: English</h1>${speakBtn('Let’s learn English! Tap a card to hear it.')}</div>${lessonCards(lessons.english)}</section>
  <section class="panel">${activityChips('english')}</section>
  <section class="panel"><h2>✍️ Writing box</h2><p class="muted">Write one or two sentences about your favorite animal. Then press 🔊 to hear your writing.</p>
    <textarea id="journal" style="width:100%;min-height:150px;border:3px solid #e0d7f5;border-radius:20px;padding:14px;font-size:22px" placeholder="My favorite animal is…">${esc(saved.journal || '')}</textarea>
    <div class="row-buttons"><button class="btn primary" onclick="saveJournal()">💾 Save</button><button class="btn secondary" onclick="speak(document.getElementById('journal').value || 'Please write your sentence first.')">🔊 Read my writing</button><button class="btn" onclick="checkWriting()">✅ Check my sentence</button></div>
    <p id="writeTip" class="feedback" aria-live="polite"></p>
  </section>`);
}
function saveJournal(){ saved.journal = document.getElementById('journal').value; trackDay(); markDaily('english'); saveAll(); toast('Saved! ✍️'); }
function checkWriting(){
  const t = document.getElementById('journal').value.trim(), tip = document.getElementById('writeTip');
  let msg;
  if (!t) msg = 'Write a sentence first!';
  else if (!/^[A-Z]/.test(t)) msg = 'Tip: start your sentence with a capital letter.';
  else if (!/[.!?]$/.test(t)) msg = 'Tip: end your sentence with a period.';
  else { msg = '🌟 Great sentence! Capital letter at the start and a period at the end.'; saveJournal(); recordResult('english', true, tip); }
  tip.textContent = msg; speak(msg, {quiet:true});
}

/* ---------- science ---------- */
function planetDetails(i){ const p = planets[i], box = document.getElementById('planetInfo'); if (!box) return Promise.resolve(false); box.innerHTML = `<h2>${p.name}</h2><p>Planet number ${i + 1} from the Sun. ${esc(p.fact)}</p>`; document.querySelectorAll('.planet-card').forEach((c, j) => c.style.outline = j === i ? '4px solid #ffc23d' : ''); return speak(`Planet number ${i + 1}. ${p.name}. ${p.fact}`); }
async function planetTour(){
  const t = speechToken + 1;
  for (let i = 0; i < planets.length; i++){
    const card = document.querySelectorAll('.planet-card')[i]; if (!card) return;
    card.scrollIntoView({block:'nearest', behavior:'smooth'});
    const ok = await planetDetails(i);
    if (!ok || speechToken !== t) return;
  }
}

/* ---------- body ---------- */
function renderBodyLearn(){
  setResume({page:'lesson', subject:'body'});
  const p = bodyParts.find(x => x.id === activeBodyPart) || bodyParts[0];
  show(`${crumbs('Human body', "openSubject('body')")}
  <section class="panel">
    <div class="section-title"><h1>🧍 Learn: Human body</h1>${speakBtn('Tap a body part to learn about it.')}</div>
    <div class="body-wrap">
      <div class="svg-box">${bodySVG(activeBodyPart)}<div class="skeleton-tip">🦴 Tap <strong>Bones / Skeleton</strong> to see the bones inside, or <a href="#skeleton" onclick="document.getElementById('skeleton').scrollIntoView({behavior:'smooth'});return false">explore each bone below ↓</a></div></div>
      <div>
        <div class="fact"><h3>${p.name}</h3><p style="font-size:22px">${p.fact}</p><div class="row-buttons">${speakBtn(p.name + '. ' + p.fact, 'Listen')}</div></div>
        <div class="label-list">${bodyParts.map(x => `<button class="body-btn ${x.id === activeBodyPart ? 'active' : ''}" onclick="pickBodyPart('${x.id}')">${x.name}</button>`).join('')}</div>
      </div>
    </div>
  </section>
  <section class="panel" id="skeleton"><div class="section-title"><h2>🦴 Skeleton explorer</h2><span class="pill">Tap a bone!</span></div>
    <p class="muted">Your skeleton is all the bones inside your body. Tap a bone on the picture or a name to learn about it.</p>${skeletonPanel()}</section>
  <section class="panel"><h2>📖 Body facts</h2>${lessonCards(lessons.body)}</section>
  <section class="panel">${activityChips('body')}</section>`);
}
function pickBodyPart(id){ activeBodyPart = id; const y = window.scrollY; renderBodyLearn(); window.scrollTo(0, y); const p = bodyParts.find(x => x.id === id); speak(p.name + '. ' + p.fact, {quiet:true}); }

/* ---------- rhymes ---------- */
function renderRhymes(){
  setResume({page:'lesson', subject:'rhymes'});
  show(`${crumbs('Rhymes', "openSubject('rhymes')")}
  <section class="panel"><div class="section-title"><h1>🎵 Nursery rhymes</h1><span class="pill">${EN_RHYMES.length} rhymes</span></div>
    <p class="muted">Tap <b>Listen</b> to hear the rhyme and follow the yellow line. Try <b>Echo</b>: the voice reads a line, then you say it back!</p>
    <div class="grid lesson-grid">${EN_RHYMES.map((r, i) => `<div class="rhyme-card" id="rhyme${i}"><span class="rhyme-emoji">${r.emoji}</span><h3>${esc(r.title)}</h3><div>${r.lines.map(l => `<span class="rhyme-line">${esc(l)}</span>`).join('')}</div><div class="row-buttons"><button class="btn small secondary" onclick="speakRhyme(${i})">🔊 Listen</button><button class="btn small" onclick="speakRhyme(${i}, true)">🗣️ Echo</button></div></div>`).join('')}</div>
  </section><section class="panel">${activityChips('rhymes')}</section>`);
}
function speakRhyme(i, echo){
  const r = EN_RHYMES[i], card = document.getElementById('rhyme' + i);
  const els = card ? [...card.querySelectorAll('.rhyme-line')] : [];
  if (echo) toast('🗣️ Listen, then say each line back!');
  readLines(r.lines, els, {gap: echo ? 2600 : 320, rate: Math.min(voicePrefs.speed, .9)}).then(done => { if (done){ trackDay(); markDaily('rhymes'); saveAll(); } });
}

/* ---------- art studio ---------- */
const ART = {color:'#ff4f8a', size:12, tool:'brush', stamp:'⭐', hue:0, undo:[]};
const ART_COLORS = ['#ff4f8a','#ff7a3d','#ffc928','#3cc48a','#2fb5e9','#4f79ff','#8b5cf6','#8b5a3c','#2b2142','#ffffff'];
const ART_STAMPS = ['⭐','❤️','🌸','🦄','🦋','🌈','☀️','🐱'];
function renderArt(){
  setResume({page:'lesson', subject:'art'});
  show(`${crumbs('Art', "openSubject('art')")}
  <section class="panel"><div class="section-title"><h1>🎨 Art studio</h1>${speakBtn('Draw anything you like! Pick a color, a brush, or a stamp.')}</div>${artTabBar('draw')}
    <div class="tabs">${[['','✏️ Free draw'],['star','⭐ Trace a star'],['heart','❤️ Heart'],['house','🏠 House'],['sun','☀️ Sun'],['fish','🐟 Fish']].map(([k, l]) => `<button class="tab ${k === '' ? 'active' : ''}" data-guide="${k}" onclick="setGuide('${k}')">${l}</button>`).join('')}</div>
    <div class="art-layout">
      <div class="canvas-stack"><canvas id="guideCanvas" width="960" height="630"></canvas><canvas id="draw" width="960" height="630" aria-label="Drawing area"></canvas></div>
      <div class="art-tools">
        <div><span class="setting-label">Colors</span><div class="swatches">${ART_COLORS.map(c => `<button class="swatch ${c === ART.color ? 'active' : ''}" style="background:${c}" aria-label="color" onclick="artColor('${c}', this)"></button>`).join('')}</div></div>
        <div><span class="setting-label">Brush</span><div class="sizes">${[6, 12, 24, 40].map(s => `<button class="size-btn ${s === ART.size ? 'active' : ''}" aria-label="size ${s}" onclick="artSize(${s}, this)"><i style="width:${Math.min(s, 30)}px;height:${Math.min(s, 30)}px"></i></button>`).join('')}</div></div>
        <div><span class="setting-label">Tools</span><div class="stamps"><button class="tool-btn active" data-tool="brush" onclick="artTool('brush', this)" title="Brush">🖌️</button><button class="tool-btn" data-tool="rainbow" onclick="artTool('rainbow', this)" title="Rainbow brush">🌈</button><button class="tool-btn" data-tool="eraser" onclick="artTool('eraser', this)" title="Eraser">🧽</button><button class="tool-btn" onclick="artUndo()" title="Undo">↩️</button></div></div>
        <div><span class="setting-label">Stamps</span><div class="stamps">${ART_STAMPS.map(s => `<button class="tool-btn" data-tool="stamp" onclick="artTool('stamp', this, '${s}')">${s}</button>`).join('')}</div></div>
        <div class="row-buttons" style="margin:0"><button class="btn small warn" onclick="clearCanvas()">🗑️ Clear</button><button class="btn small secondary" onclick="saveDrawing()">💾 Save picture</button></div>
      </div>
    </div>
  </section><section class="panel">${activityChips('art')}</section>`);
  setupCanvas();
}
function artColor(c, el){ ART.color = c; if (ART.tool !== 'brush'){ ART.tool = 'brush'; document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'brush')); } document.querySelectorAll('.swatch').forEach(b => b.classList.remove('active')); el.classList.add('active'); Sfx.tap(); }
function artSize(s, el){ ART.size = s; document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); Sfx.tap(); }
function artTool(t, el, stamp){ ART.tool = t; if (stamp) ART.stamp = stamp; document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); Sfx.tap(); }
function setupCanvas(){
  const c = document.getElementById('draw'); if (!c) return;
  const ctx = c.getContext('2d'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ART.undo = []; let on = false, last = null;
  const pos = e => { const r = c.getBoundingClientRect(); return {x:(e.clientX - r.left) * (c.width / r.width), y:(e.clientY - r.top) * (c.height / r.height)}; };
  const snap = () => { ART.undo.push(ctx.getImageData(0, 0, c.width, c.height)); if (ART.undo.length > 20) ART.undo.shift(); };
  c.addEventListener('pointerdown', e => {
    e.preventDefault(); snap(); const p = pos(e);
    if (ART.tool === 'stamp'){ ctx.globalCompositeOperation = 'source-over'; ctx.font = `${ART.size * 3 + 30}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ART.stamp, p.x, p.y); Sfx.pop(); return; }
    on = true; last = p; try{ c.setPointerCapture(e.pointerId); }catch(err){}
    drawDot(p);
  });
  c.addEventListener('pointermove', e => { if (!on) return; e.preventDefault(); const p = pos(e); drawSeg(last, p); last = p; });
  ['pointerup','pointercancel','pointerleave'].forEach(ev => c.addEventListener(ev, () => { on = false; }));
  function style(){
    ctx.lineWidth = ART.tool === 'eraser' ? ART.size * 2 : ART.size;
    ctx.globalCompositeOperation = ART.tool === 'eraser' ? 'destination-out' : 'source-over';
    if (ART.tool === 'rainbow'){ ART.hue = (ART.hue + 4) % 360; ctx.strokeStyle = ctx.fillStyle = `hsl(${ART.hue} 90% 60%)`; }
    else ctx.strokeStyle = ctx.fillStyle = ART.color;
  }
  function drawDot(p){ style(); ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
  function drawSeg(a, b){ style(); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  setGuide(ART.guide || '');
}
function artUndo(){ const c = document.getElementById('draw'); const s = ART.undo.pop(); if (c && s) c.getContext('2d').putImageData(s, 0, 0); else toast('Nothing to undo'); }
function clearCanvas(){ const c = document.getElementById('draw'); if (!c) return; const ctx = c.getContext('2d'); ART.undo.push(ctx.getImageData(0, 0, c.width, c.height)); ctx.clearRect(0, 0, c.width, c.height); }
function setGuide(k){
  ART.guide = k;
  document.querySelectorAll('[data-guide]').forEach(b => b.classList.toggle('active', b.dataset.guide === k));
  const g = document.getElementById('guideCanvas'); if (!g) return;
  const ctx = g.getContext('2d'); ctx.clearRect(0, 0, g.width, g.height);
  if (!k) return;
  ctx.save(); ctx.strokeStyle = '#c9bfe6'; ctx.lineWidth = 10; ctx.setLineDash([18, 16]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cx = 480, cy = 320; ctx.beginPath();
  if (k === 'star'){ for (let i = 0; i < 10; i++){ const r = i % 2 ? 100 : 240, a = -Math.PI / 2 + i * Math.PI / 5; ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + 10 + r * Math.sin(a)); } ctx.closePath(); }
  if (k === 'heart'){ ctx.moveTo(cx, cy + 210); ctx.bezierCurveTo(cx - 330, cy, cx - 170, cy - 250, cx, cy - 110); ctx.bezierCurveTo(cx + 170, cy - 250, cx + 330, cy, cx, cy + 210); }
  if (k === 'house'){ ctx.rect(cx - 180, cy - 40, 360, 250); ctx.moveTo(cx - 220, cy - 40); ctx.lineTo(cx, cy - 230); ctx.lineTo(cx + 220, cy - 40); ctx.rect(cx - 45, cy + 80, 90, 130); ctx.rect(cx - 140, cy + 10, 70, 60); ctx.rect(cx + 70, cy + 10, 70, 60); }
  if (k === 'sun'){ ctx.arc(cx, cy, 120, 0, Math.PI * 2); for (let i = 0; i < 12; i++){ const a = i * Math.PI / 6; ctx.moveTo(cx + 160 * Math.cos(a), cy + 160 * Math.sin(a)); ctx.lineTo(cx + 250 * Math.cos(a), cy + 250 * Math.sin(a)); } }
  if (k === 'fish'){ ctx.ellipse(cx - 40, cy, 230, 130, 0, 0, Math.PI * 2); ctx.moveTo(cx + 180, cy); ctx.lineTo(cx + 320, cy - 110); ctx.lineTo(cx + 320, cy + 110); ctx.closePath(); ctx.moveTo(cx - 170 + 18, cy - 30); ctx.arc(cx - 170, cy - 30, 18, 0, Math.PI * 2); }
  ctx.stroke(); ctx.restore();
  if (k) speak('Trace the dotted lines!', {quiet:true});
}
function saveDrawing(){
  const d = document.getElementById('draw'), g = document.getElementById('guideCanvas'); if (!d) return;
  const out = document.createElement('canvas'); out.width = d.width; out.height = d.height;
  const ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(g, 0, 0); ctx.drawImage(d, 0, 0);
  const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = `ruhaimah-art-${todayKey()}.png`; a.click();
  trackDay(); markDaily('art'); addStars(1, d); saveAll(); toast('🖼️ Picture saved! +1 star'); Sfx.good();
}

/* ---------- chess ---------- */
const PIECES = {
  king:{sym:'♔', name:'King', rule:'The king moves one square in any direction.'},
  queen:{sym:'♕', name:'Queen', rule:'The queen moves many squares in any straight or diagonal line.'},
  rook:{sym:'♖', name:'Rook', rule:'The rook moves in straight lines: up, down, left and right.'},
  bishop:{sym:'♗', name:'Bishop', rule:'The bishop moves diagonally, like an X.'},
  knight:{sym:'♘', name:'Knight', rule:'The knight moves in an L shape: two squares, then one to the side. It can jump!'},
  pawn:{sym:'♙', name:'Pawn', rule:'The pawn moves forward one square. On its very first move it may go two.'}
};
const CH = {piece:'rook', size:7, found:[], show:false};
function chessMoves(piece, n){
  const c = Math.floor(n / 2), out = [];
  const add = (r, col) => { if (r >= 0 && r < n && col >= 0 && col < n && !(r === c && col === c)) out.push(r * n + col); };
  const ray = dirs => dirs.forEach(([dr, dc]) => { for (let k = 1; k < n; k++) add(c + dr * k, c + dc * k); });
  if (piece === 'king') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(c + dr, c + dc);
  if (piece === 'rook') ray([[1,0],[-1,0],[0,1],[0,-1]]);
  if (piece === 'bishop') ray([[1,1],[1,-1],[-1,1],[-1,-1]]);
  if (piece === 'queen') ray([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
  if (piece === 'knight') [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([a, b]) => add(c + a, c + b));
  if (piece === 'pawn'){ add(c - 1, c); }
  return [...new Set(out)];
}
function renderChess(){
  setResume({page:'lesson', subject:'chess'});
  const P = PIECES[CH.piece], n = CH.size, c = Math.floor(n / 2), moves = chessMoves(CH.piece, n);
  const cells = Array.from({length:n * n}, (_, i) => { const r = Math.floor(i / n), col = i % n; const center = r === c && col === c; const found = CH.found.includes(i);
    return `<button class="${(r + col) % 2 ? 'dark' : 'light'} ${found ? 'hit' : ''} ${CH.show && moves.includes(i) && !found ? 'can' : ''}" aria-label="Row ${r + 1} column ${col + 1}" onclick="chessTap(${i})">${center ? P.sym : found ? '⭐' : ''}</button>`; }).join('');
  show(`${crumbs('Chess', "openSubject('chess')")}
  <section class="panel"><div class="section-title"><h1>♟️ Learn: Chess</h1>${speakBtn('Pick a chess piece. Then tap every square it can move to!')}</div>
    <div class="piece-pick">${Object.entries(PIECES).map(([k, p]) => `<button class="btn ${k === CH.piece ? 'primary' : ''}" onclick="chessPick('${k}')"><span class="big">${p.sym}</span>${p.name}</button>`).join('')}</div>
    <div class="chess-wrap" style="margin-top:16px">
      <div class="board" id="board" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>
      <div><div class="fact"><h2>${P.sym} ${P.name}</h2><p style="font-size:21px">${P.rule}</p><div class="row-buttons">${speakBtn(P.name + '. ' + P.rule, 'Listen')}</div></div>
        <h3>🎯 Find every square the ${P.name.toLowerCase()} can reach</h3>
        <div class="progress"><i style="width:${Math.round(CH.found.length / moves.length * 100)}%"></i></div>
        <p id="chessMsg" class="feedback" aria-live="polite">${CH.found.length} of ${moves.length} found</p>
        <div class="row-buttons"><button class="btn small" onclick="CH.show=!CH.show;renderChess()">${CH.show ? '🙈 Hide' : '👀 Show'} moves</button><button class="btn small" onclick="CH.found=[];renderChess()">↺ Start over</button></div>
      </div>
    </div>
  </section>
  <section class="panel"><h2>♟️ The chess board at the start</h2><p class="muted">This is how the pieces stand when a game begins. Tap a piece to hear its name and how it moves. White always goes first!</p>
    <div class="chess-wrap">${chessSetupBoard()}<div class="fact" id="setupInfo"><h3>Tap a piece!</h3><p>The queen starts on her own color.</p></div></div></section>
  <section class="panel">${activityChips('chess')}</section>`);
}
function chessPick(k){ CH.piece = k; CH.found = []; CH.show = false; const y = window.scrollY; renderChess(); window.scrollTo(0, y); const P = PIECES[k]; speak(P.name + '. ' + P.rule, {quiet:true}); }
function chessTap(i){
  const n = CH.size, moves = chessMoves(CH.piece, n), btn = document.querySelectorAll('#board button')[i];
  if (i === Math.floor(n / 2) * n + Math.floor(n / 2)) return speak(PIECES[CH.piece].rule, {quiet:true});
  if (CH.found.includes(i)) return;
  if (moves.includes(i)){
    CH.found.push(i); Sfx.good();
    if (CH.found.length === moves.length){ recordResult('chess', true, btn); confetti(); speak(`You found them all! The ${PIECES[CH.piece].name} is easy for you now.`, {quiet:true}); }
    const y = window.scrollY; renderChess(); window.scrollTo(0, y);
  } else {
    Sfx.bad(); btn.classList.add('miss'); setTimeout(() => btn.classList.remove('miss'), 600);
    const m = document.getElementById('chessMsg'); m.textContent = 'Not that one. ' + PIECES[CH.piece].rule; speak('Not that one. ' + PIECES[CH.piece].rule, {quiet:true});
  }
}

/* ---------- geography maps (drawing code from the original site) ---------- */
let geoDataCache = {}; let mapState = {mode:'usStates',game:false,target:null,done:[],selected:null,wrong:null,showLabels:true};
function geoItems(mode){
  if(mode==='usStates') return usaStates.map(s=>({key:normName(s[1]),name:s[1],label:s[0],group:s[3],fact:'Capital: '+s[2]}));
  if(mode==='bdDivisions') return Object.keys(bdDivisions).map((d,i)=>({key:normName(d),name:d,label:d,group:d,fact:bdDivisions[d].length+' districts'}));
  return Object.entries(bdDivisions).flatMap(([div,arr])=>arr.map(n=>({key:normName(n),name:n,label:n,group:div,fact:div+' Division'})));
}
function chooseNewTarget(){ const pool=geoItems(mapState.mode).filter(x=>!mapState.done.includes(x.key)); mapState.target=pool.length?pool[Math.floor(Math.random()*pool.length)].key:null; }
let mapRequest=0;
async function drawMapScreen(){
  const request=++mapRequest, mode=mapState.mode;
  const items=geoItems(mapState.mode); if(!mapState.selected) mapState.selected=items[0].key; if(mapState.game && !mapState.target) chooseNewTarget();
  const sel = items.find(x=>x.key===mapState.selected) || items[0];
  const tar = items.find(x=>x.key===mapState.target);
  const area=document.getElementById('mapArea'); if(!area) return;
  area.innerHTML=`<div class="toolbar"><button class="btn small ${!mapState.game?'primary':''}" onclick="loadMapMode('${mapState.mode}',false)">🔍 Explore</button><button class="btn small ${mapState.game?'primary gold':''}" onclick="loadMapMode('${mapState.mode}',true)">🎯 Find on map</button><button class="btn small" onclick="mapState.showLabels=!mapState.showLabels; drawMapScreen()">${mapState.showLabels?'Hide':'Show'} labels</button><button class="btn small" onclick="speak(${esc(JSON.stringify(mapState.game?'Find '+(tar?tar.name:''):sel.name+'. '+sel.fact))})">🔊 Hear</button></div>
  <div class="fact"><h3>${mapState.game ? (tar ? 'Find: '+tar.name : '🎉 Great job!') : sel.name}</h3><p>${mapState.game ? (tar ? 'Tap the correct area on the map.' : 'You found them all!') : sel.fact}</p></div>
  <div class="map-card" id="mapCanvas">Loading map…</div><div class="legend" id="mapLegend"></div><p class="tiny">Map boundaries: ${mode==='usStates'?'<a href="https://github.com/PublicaMundi/MappingAPI" target="_blank" rel="noopener">PublicaMundi</a>':'<a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">geoBoundaries</a> (CC BY 4.0)'}. Educational map.</p>`;
  try{ const data=await loadGeoJSON(mode); if(request!==mapRequest||!document.getElementById('mapCanvas'))return; renderGeoSVG(data, items); } catch(e){ if(request!==mapRequest||!document.getElementById('mapCanvas'))return; document.getElementById('mapCanvas').innerHTML='<p>Map could not load right now.</p>'; if(mapState.mode==='usStates') renderUSTileFallback(); else renderBDFallback(); }
}
function renderUSTileFallback(){
  const host=document.getElementById('mapCanvas'); const items=geoItems('usStates');
  host.innerHTML = `<div style="display:grid;grid-template-columns:repeat(12,minmax(40px,1fr));gap:4px;min-width:560px">${usaStates.map(s=>`<button class="btn small" style="padding:8px;border-radius:12px;background:#fff" onclick="mapTap('${normName(s[1])}')">${s[0]}</button>`).join('')}</div>`;
}
function renderBDFallback(){
  const host=document.getElementById('mapCanvas'); const items=geoItems(mapState.mode);
  host.innerHTML=`<div class="grid lesson-grid">${items.map(it=>`<button class="btn small" onclick="mapTap('${it.key}')">${it.name}</button>`).join('')}</div>`;
}
async function loadGeoJSON(mode){
  if(geoDataCache[mode]) return geoDataCache[mode];
  if(mode==='usStates'){
    const res=await fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json');
    const data=await res.json(); return geoDataCache[mode]=data;
  }
  const adm = mode==='bdDivisions' ? 'ADM1' : 'ADM2';
  const meta = await (await fetch(`https://www.geoboundaries.org/api/current/gbOpen/BGD/${adm}/`)).json();
  const data = await (await fetch(meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL)).json();
  return geoDataCache[mode]=data;
}
function renderGeoSVG(data, items){
  const ns='http://www.w3.org/2000/svg'; const host=document.getElementById('mapCanvas'); host.innerHTML='';
  const svg=document.createElementNS(ns,'svg'); svg.setAttribute('viewBox', mapState.mode==='usStates'?'0 0 800 520':'0 0 600 760'); svg.style.cssText='width:100%;min-width:360px;display:block'; host.appendChild(svg);
  const groups=[...new Set(items.map(x=>x.group))]; const legend=document.getElementById('mapLegend'); legend.innerHTML=groups.map((g,i)=>`<span class="chip" style="background:${mapColors[i%mapColors.length]}">${g}</span>`).join('');
  const features=(data.features||[]).map(f=>({raw:f,item:items.find(it=>it.key===normName(f.properties.name||f.properties.shapeName||f.properties.Name||''))})).filter(x=>x.item);
  function polys(f){ if(f.geometry.type==='Polygon') return [f.geometry.coordinates]; if(f.geometry.type==='MultiPolygon') return f.geometry.coordinates; return []; }
  function drawSet(set, box, shift=false){
    const all=set.flatMap(x=>polys(x.raw).flat(2));
    const fix=p=>{ let [x,y]=p; if(shift&&x>0) x-=360; return [x,y]; };
    const pts=all.map(fix); if(!pts.length) return;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const [x,y] of pts){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    const cos=Math.cos(((minY+maxY)/2)*Math.PI/180); const scale=Math.min(box[2]/((maxX-minX)*cos), box[3]/(maxY-minY));
    const proj=p=>{ let [x,y]=fix(p); return [box[0]+(box[2]-((maxX-minX)*cos*scale))/2 + (x-minX)*cos*scale, box[1]+(box[3]-((maxY-minY)*scale))/2 + (maxY-y)*scale] };
    set.forEach(obj=>{
      const path=document.createElementNS(ns,'path');
      const d=polys(obj.raw).map(poly => poly.map(ring => ring.map((p,i)=>{ const q=proj(p); return `${i?'L':'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`}).join(' ') + ' Z').join(' ')).join(' ');
      path.setAttribute('d', d); path.setAttribute('fill', mapState.done.includes(obj.item.key)?'#81d49c' : mapState.wrong===obj.item.key ? '#f7a6a6' : mapColors[groups.indexOf(obj.item.group)%mapColors.length]); path.setAttribute('stroke', (!mapState.game && mapState.selected===obj.item.key)?'#5d3fb6':'#fff'); path.setAttribute('stroke-width', (!mapState.game && mapState.selected===obj.item.key)?3:1.2); path.setAttribute('fill-rule','evenodd');path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',obj.item.name);path.style.cursor='pointer'; path.onclick=()=>mapTap(obj.item.key);path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();mapTap(obj.item.key)}}; svg.appendChild(path);
      const title=document.createElementNS(ns,'title'); title.textContent=obj.item.name; path.appendChild(title);
      if(mapState.showLabels){ const ring=polys(obj.raw).map(p=>p[0]).sort((a,b)=>b.length-a.length)[0]; if(ring){ const labelPts=ring.map(proj); const x=labelPts.reduce((s,p)=>s+p[0],0)/labelPts.length; const y=labelPts.reduce((s,p)=>s+p[1],0)/labelPts.length; const t=document.createElementNS(ns,'text'); t.setAttribute('x',x); t.setAttribute('y',y); t.setAttribute('text-anchor','middle'); t.setAttribute('font-size', mapState.mode==='bdDistricts'?8:11); t.setAttribute('font-weight','700'); t.setAttribute('fill','#35275a'); t.setAttribute('pointer-events','none'); t.textContent=obj.item.label; svg.appendChild(t);} }
    });
  }
  if(mapState.mode==='usStates'){
    drawSet(features.filter(x=>!['alaska','hawaii'].includes(x.item.key)), [14,14,772,378]);
    drawSet(features.filter(x=>x.item.key==='alaska'), [18,402,190,105], true);
    drawSet(features.filter(x=>x.item.key==='hawaii'), [228,410,120,82]);
  } else {
    drawSet(features, [15,15,570,720]);
  }
}
function mapTap(key){
  const items=geoItems(mapState.mode); const item=items.find(x=>x.key===key); if(!item) return;
  if(mapState.game&&(!mapState.target||mapState.done.includes(key)))return; if(!mapState.game){ mapState.selected=key; drawMapScreen(); speak(item.name+'. '+item.fact); return; }
  const ok = key===mapState.target; recordResult('geo', ok); mapState.wrong = ok?null:key; if(ok){ mapState.done.push(key); chooseNewTarget(); speak(mapState.target?'Great job! Now find '+items.find(x=>x.key===mapState.target).name+'.':'Great job!',{quiet:true}); if(!mapState.target){ setTimeout(()=>speak('Wonderful! You found them all!'),900); confetti(); Sfx.win(); } } else { speak('That is '+item.name+'. Try again!',{quiet:true}); }
  drawMapScreen();
}

function geoTabs(game){
  const modes = [['usStates', game ? '🇺🇸 Find a state' : '🇺🇸 USA states'], ['bdDivisions', game ? '🇧🇩 Find a division' : '🇧🇩 Bangladesh divisions'], ['bdDistricts', game ? '🇧🇩 Find a district' : '🇧🇩 Bangladesh districts']];
  return `<div class="tabs">${modes.map(([m, l]) => `<button class="tab" data-mode="${m}" onclick="loadMapMode('${m}', ${game})">${l}</button>`).join('')}</div>`;
}
function loadMapMode(mode, game){
  mapState = {mode, game, target:null, done:[], selected:null, wrong:null, showLabels:!game};
  document.querySelectorAll('.tabs .tab[data-mode]').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  drawMapScreen();
}
const GEO_TABS = [['world','🌍 World'],['usStates','🇺🇸 USA states'],['bdDivisions','🇧🇩 Bangladesh divisions'],['bdDistricts','🇧🇩 Bangladesh districts']];
function renderGeographyLearn(tab){
  tab = tab || renderGeographyLearn.tab || 'world'; renderGeographyLearn.tab = tab;
  setResume({page:'lesson', subject:'geo'});
  show(`${crumbs('Geography', "openSubject('geo')")}
  <section class="panel"><div class="section-title"><h1>🌍 Explore the map</h1>${speakBtn('Explore the map. Tap a place to hear about it.')}</div>
    <div class="tabs">${GEO_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" onclick="renderGeographyLearn('${k}')">${l}</button>`).join('')}</div>
    <div id="${tab === 'world' ? 'worldZone' : 'mapArea'}"></div></section>
  <section class="panel"><h2>📖 Map words</h2>${lessonCards([['🌍','Continents','There are 7 continents: Asia, Africa, North America, South America, Europe, Australia and Antarctica.','There are seven continents. Asia, Africa, North America, South America, Europe, Australia, and Antarctica.'],['🌊','Oceans','The 5 oceans are the Pacific, Atlantic, Indian, Arctic and Southern.','The five oceans are the Pacific, Atlantic, Indian, Arctic, and Southern oceans.'],['⛰️','Mountains','A mountain is very tall land. Mount Everest is the tallest.','A mountain is very tall land. Mount Everest is the tallest mountain in the world.'],['🏝️','Islands','An island has water all around it.','An island is land with water all around it.'],['🏜️','Deserts','A desert is a very dry place. The Sahara is in Africa.','A desert is a very dry place. The Sahara desert is in Africa.'],['🧭','Directions','North, south, east and west. On most maps, north is up.','North, south, east, and west. On most maps, north is at the top.']])}</section>
  <section class="panel">${activityChips('geo')}</section>`);
  if (tab === 'world') renderWorld('worldZone'); else loadMapMode(tab, false);
}
function renderGeographyQuiz(){
  setResume({page:'quiz', subject:'geo'});
  show(`${crumbs('Geography', "openSubject('geo')")}
  <section class="panel"><div class="section-title"><h1>📝 Map quiz</h1><span class="pill">Find it on the map</span></div>${geoTabs(true)}<div id="mapArea"></div></section>`);
  loadMapMode('usStates', true);
}

let playScore = 0;
function playWin(k, el){
  playScore++; const p = document.getElementById('playScore'); if (p) p.textContent = `⭐ ${playScore} this game`;
  recordResult(k, true, el);
  const c = pick(cheers); const fb = document.getElementById('playFeedback'); if (fb){ fb.className = 'feedback good'; fb.textContent = '🌟 ' + c; }
  speak(c, {quiet:true});
  if (playScore % 5 === 0) confetti();
  const nb = document.getElementById('playNext'); if (nb){ nb.classList.add('primary'); nb.focus({preventScroll:true}); }
}
function playMiss(msg){ Sfx.bad(); const fb = document.getElementById('playFeedback'); if (fb){ fb.className = 'feedback bad'; fb.textContent = msg || 'Try again! You can do it.'; } speak(msg || 'Try again!', {quiet:true}); }
function newPlay(k){
  const z = document.getElementById('playZone'); if (!z) return;
  let q = '', say = '', opts = [], ans = '', visual = '';
  const footer = `<p id="playFeedback" class="feedback" aria-live="polite"></p><button id="playNext" class="btn big" onclick="newPlay('${k}')">Next challenge →</button>`;
  if (k === 'math'){
    const n = rand(3, 10); q = 'Tap each star to count it. How many stars?';
    visual = `<div class="play-stars">${Array.from({length:n}, () => `<button aria-label="star" onclick="if(!this.disabled){this.disabled=true;this.textContent='✅';Sfx.pop();const c=document.getElementById('counted');c.textContent=+c.textContent+1;speak(NUMW[+c.textContent]||c.textContent,{quiet:true,gap:0})}">⭐</button>`).join('')}</div><p style="font-size:22px">Counted: <b id="counted">0</b></p>`;
    opts = numChoices(n); ans = String(n);
  } else if (k === 'english' || k === 'reading'){
    const words = k === 'english' ? pick([['I','like','cats.'],['We','can','run.'],['The','sun','is','hot.'],['My','dog','is','big.'],['I','see','a','bird.']]) : pick([['c','a','t'],['s','u','n'],['d','o','g'],['p','i','g'],['b','u','s'],['h','a','t'],['f','i','s','h']]);
    const sep = k === 'english' ? ' ' : '', target = words.join(sep);
    q = k === 'english' ? 'Tap the words in the right order:' : 'Tap the letters to spell:';
    z.innerHTML = `<div class="question">${speakBtn(k === 'english' ? target : target + '. ' + words.join(', ') + '. ' + target)}<h2>${esc(q)} <span style="color:var(--purple)">${esc(target)}</span></h2></div>
      <div id="built" class="story-box built"></div><div class="row-buttons" id="pieces"></div>${footer}`;
    if (voicePrefs.autoRead) speak(k === 'english' ? 'Build the sentence: ' + target : 'Spell the word ' + target, {quiet:true});
    const out = [];
    shuffle(words).forEach(w => { const b = document.createElement('button'); b.className = 'btn big gold'; b.textContent = w;
      b.onclick = () => { if (w !== words[out.length]) return playMiss('Try another one!'); out.push(w); b.disabled = true; Sfx.pop(); document.getElementById('built').textContent = out.join(sep); if (k === 'reading') speak(w, {quiet:true, gap:0}); if (out.length === words.length) playWin(k, b); };
      document.getElementById('pieces').append(b); });
    return;
  } else if (k === 'chess'){
    z.innerHTML = `<div class="question">${speakBtn('Tap a square the knight can jump to. Remember the L shape!')}<h2>Tap a square the knight ♘ can jump to.</h2></div><div class="mini-board" id="miniBoard"></div>${footer}`;
    let done = false;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++){ const b = document.createElement('button'); b.textContent = r === 2 && c === 2 ? '♘' : ''; b.style.background = (r + c) % 2 ? '#b7a0df' : '#f4e7ce'; b.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
      b.onclick = () => { if (done || (r === 2 && c === 2)) return; if (Math.abs(r - 2) * Math.abs(c - 2) === 2){ done = true; b.textContent = '⭐'; playWin(k, b); } else { b.style.background = '#ffc3b9'; playMiss('Try an L shape: two squares, then one to the side.'); } };
      document.getElementById('miniBoard').append(b); }
    return;
  } else if (k === 'logic'){
    const a = pick(['🔵','🟢','⭐','🍎','🐱']); let b = pick(['🔺','🟪','❤️','🍌','🐶']); const type = rand(0, 1);
    const seq = type ? [a, a, b, a, a] : [a, b, a, b, a]; ans = type ? b : b;
    q = 'What comes next?'; say = 'Look at the pattern. What comes next?'; visual = `<div class="q-visual">${seq.join(' ')} ❓</div>`; opts = [a, b, '🟡'];
  } else if (k === 'school'){
    const shapes = [['circle','⚪'],['square','🟥'],['triangle','🔺'],['star','⭐'],['heart','❤️']];
    const t = pick(shapes); q = `Tap the ${t[0]}.`; ans = t[1]; opts = shuffle(shapes).slice(0, 3).map(x => x[1]); if (!opts.includes(ans)) opts[0] = ans;
  } else if (k === 'general'){
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], i = rand(0, 6);
    q = `What day comes after ${days[i]}?`; ans = days[(i + 1) % 7]; opts = [ans, days[(i + 2) % 7], days[(i + 6) % 7]];
  } else if (k === 'science'){
    const i = rand(0, 7); q = `Which planet is number ${i + 1} from the Sun?`; ans = planets[i].name; opts = [ans, planets[(i + 1) % 8].name, planets[(i + 3) % 8].name];
    visual = `<div class="q-visual">☀️ ${'🪐'.repeat(i)}❓</div>`;
  } else if (k === 'body'){
    const p = pick(bodyParts.filter(x => x.id !== 'bones')); q = 'Which body part? ' + blankFact(p.fact); ans = p.name; opts = [ans, ...shuffle(bodyParts.filter(x => x.name !== ans && x.id !== 'bones')).slice(0, 2).map(x => x.name)];
    say = q.replace('___', 'blank');
  } else if (k === 'rhymes'){
    const x = pick([['cat','hat','dog','sun'],['star','car','fish','book'],['cake','lake','tree','ball'],['hill','Jill','cup','pen'],['clock','sock','bed','fan'],['bee','tree','pig','box'],['boat','coat','ring','map']]);
    q = `Which word rhymes with “${x[0]}”?`; ans = x[1]; opts = x.slice(1);
  } else if (k === 'art'){
    const x = pick([['Red','#e75060'],['Blue','#4384df'],['Green','#49b779'],['Yellow','#f5cf45'],['Purple','#8b5cf6'],['Orange','#ff8a3d'],['Pink','#ff8fc5']]);
    q = 'What color is this?'; ans = x[0]; visual = `<div style="width:120px;height:120px;border-radius:28px;background:${x[1]};margin:12px 0;box-shadow:var(--shadow-s)"></div>`;
    opts = [ans, ...shuffle(['Red','Blue','Green','Yellow','Purple','Orange','Pink'].filter(c => c !== ans)).slice(0, 2)];
  } else if (k === 'geo'){
    const x = pick(usaStates); q = `What is the capital of ${x[1]}?`; ans = x[2]; opts = [ans, ...shuffle(usaStates.filter(y => y[2] !== ans)).slice(0, 2).map(y => y[2])];
  }
  z.innerHTML = `<div class="question">${speakBtn(say || q)}<h2>${esc(q)}</h2></div>${visual}<div class="choice-grid" id="playOptions"></div>${footer}`;
  if (voicePrefs.autoRead) speak(say || q, {quiet:true});
  let done = false;
  shuffle([...new Set(opts)]).forEach(x => { const b = document.createElement('button'); b.className = 'choice'; b.textContent = x;
    b.onclick = () => { if (done) return; if (x === ans){ done = true; b.classList.add('good'); playWin(k, b); } else { b.disabled = true; b.classList.add('bad'); playMiss(); } };
    document.getElementById('playOptions').append(b); });
}

/* ---------- Games hub ---------- */
function renderGamesHub(){
  setResume({page:'subject', subject:'games'});
  const t = saved.ttt;
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel"><div class="section-title"><h1>🎲 Games</h1><span class="pill">🏆 ${t.win} wins vs Unicorn Bot</span></div>
    <div class="mode-grid">
      <div class="mode-card play"><div class="bigicon">⭕❌</div><h3>Tic-Tac-Toe</h3><p>Get three in a row! Play the Unicorn Bot or a friend.</p><button class="btn primary" onclick="renderTicTacToe()">Play Tic-Tac-Toe</button></div>
      <div class="mode-card learn"><div class="bigicon">🃏</div><h3>Memory match</h3><p>Flip the cards and find the pairs.</p><button class="btn primary" onclick="renderMemory()">Play Memory</button></div>
      <div class="mode-card quiz"><div class="bigicon">🌈</div><h3>Color memory</h3><p>Watch the colors flash, then copy them!</p><button class="btn primary" onclick="renderSimon()">Play Color memory</button></div>
      <div class="mode-card learn"><div class="bigicon">♟️</div><h3>Chess moves</h3><p>Learn how each chess piece moves.</p><button class="btn gold" onclick="startLearn('chess')">Open Chess</button></div>
    </div>
  </section>`);
  speak('Games! Pick tic-tac-toe or memory match.', {quiet:true});
}

/* ---------- Tic-Tac-Toe ---------- */
const TTT_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const TTT_MARKS = [['🦄','⭐'],['❌','⭕'],['🐱','🐶'],['🍓','🍌']];
const TTT = {board:Array(9).fill(''), turn:'X', mode:'bot', level:'easy', marks:0, over:false, winLine:null, busy:false, firstX:true, score:{X:0, O:0, tie:0}};
try{ const s = JSON.parse(localStorage.getItem('ruhaimah-ttt-prefs') || '{}'); ['mode','level','marks'].forEach(k => { if (s[k] !== undefined) TTT[k] = s[k]; }); }catch(e){}
function tttSavePrefs(){ try{ localStorage.setItem('ruhaimah-ttt-prefs', JSON.stringify({mode:TTT.mode, level:TTT.level, marks:TTT.marks})); }catch(e){} }
function tttMark(p){ return TTT_MARKS[TTT.marks][p === 'X' ? 0 : 1]; }
function tttName(p){ return TTT.mode === 'bot' ? (p === 'X' ? 'Ruhaimah' : 'Unicorn Bot') : (p === 'X' ? 'Player 1' : 'Player 2'); }
function tttWinner(b){ for (const l of TTT_LINES){ const [a, c, d] = l; if (b[a] && b[a] === b[c] && b[a] === b[d]) return {p:b[a], line:l}; } return b.every(Boolean) ? {p:'tie'} : null; }
function renderTicTacToe(){
  setResume({page:'subject', subject:'games'});
  show(`${crumbs('Games', 'renderGamesHub()')}
  <section class="panel"><div class="section-title"><h1>⭕ Tic-Tac-Toe</h1>${speakBtn('Tic tac toe! Take turns. Get three in a row, across, down, or corner to corner, to win!')}</div>
    <div class="ttt-wrap">
      <div><div class="ttt-status" id="tttStatus" aria-live="polite"></div><div class="ttt-board" id="tttBoard" role="grid" aria-label="Tic-tac-toe board"></div></div>
      <div>
        <div class="score-row" id="tttScores"></div>
        <span class="setting-label">Play against</span>
        <div class="seg">${[['bot','🤖 Unicorn Bot'],['friend','👫 A friend']].map(([k, l]) => `<button class="${TTT.mode === k ? 'active' : ''}" onclick="tttSet('mode','${k}')">${l}</button>`).join('')}</div>
        ${TTT.mode === 'bot' ? `<span class="setting-label">How tricky is the bot?</span><div class="seg">${[['easy','🐣 Easy'],['medium','🐰 Medium'],['hard','🦁 Hard']].map(([k, l]) => `<button class="${TTT.level === k ? 'active' : ''}" onclick="tttSet('level','${k}')">${l}</button>`).join('')}</div>` : ''}
        <span class="setting-label">Pieces</span>
        <div class="seg">${TTT_MARKS.map((m, i) => `<button class="${TTT.marks === i ? 'active' : ''}" onclick="tttSet('marks',${i})" aria-label="${m[0]} and ${m[1]}">${m[0]} ${m[1]}</button>`).join('')}</div>
        <div class="row-buttons"><button class="btn primary big" onclick="tttNew()">🔁 New game</button><button class="btn small" onclick="TTT.score={X:0,O:0,tie:0};tttDraw()">Reset score</button></div>
        <p class="tiny">💡 Tip: the middle square is a strong first move!</p>
      </div>
    </div>
  </section>`);
  tttNew(true);
}
function tttSet(k, v){ TTT[k] = v; tttSavePrefs(); if (k !== 'marks') TTT.score = {X:0, O:0, tie:0}; Sfx.tap(); renderTicTacToe(); }
function tttNew(quiet){
  TTT.board = Array(9).fill(''); TTT.over = false; TTT.winLine = null; TTT.busy = false;
  // take turns going first so it stays fair
  TTT.turn = TTT.firstX ? 'X' : 'O'; TTT.firstX = !TTT.firstX;
  tttDraw();
  const who = tttName(TTT.turn);
  if (!quiet || TTT.turn === 'O') speak(TTT.mode === 'bot' && TTT.turn === 'O' ? 'Unicorn Bot goes first this time.' : `${who}, you go first!`, {quiet:true});
  if (TTT.mode === 'bot' && TTT.turn === 'O') tttBotTurn();
}
function tttDraw(){
  const b = document.getElementById('tttBoard'); if (!b) return;
  b.innerHTML = TTT.board.map((v, i) => `<button class="ttt-cell ${TTT.winLine && TTT.winLine.includes(i) ? 'win' : ''}" ${v || TTT.over || TTT.busy ? 'disabled' : ''} aria-label="Square ${i + 1}${v ? ', ' + tttName(v) : ', empty'}" onclick="tttPlay(${i})">${v ? `<span class="mark">${tttMark(v)}</span>` : ''}</button>`).join('');
  const st = document.getElementById('tttStatus'), w = tttWinner(TTT.board);
  if (w && w.p === 'tie') st.textContent = '🤝 It’s a tie! Good game.';
  else if (w) st.textContent = `🎉 ${tttName(w.p)} ${tttMark(w.p)} wins!`;
  else st.textContent = TTT.busy ? `${tttMark('O')} Unicorn Bot is thinking…` : `${tttMark(TTT.turn)} ${tttName(TTT.turn)}’s turn`;
  const sc = document.getElementById('tttScores');
  if (sc) sc.innerHTML = `<div class="score ${!TTT.over && TTT.turn === 'X' ? 'turn' : ''}">${tttMark('X')} ${tttName('X')}<b>${TTT.score.X}</b></div><div class="score">🤝 Ties<b>${TTT.score.tie}</b></div><div class="score ${!TTT.over && TTT.turn === 'O' ? 'turn' : ''}">${tttMark('O')} ${tttName('O')}<b>${TTT.score.O}</b></div>`;
}
function tttPlay(i){
  if (TTT.over || TTT.busy || TTT.board[i]) return;
  if (TTT.mode === 'bot' && TTT.turn !== 'X') return;
  tttMove(i);
  if (!TTT.over && TTT.mode === 'bot') tttBotTurn();
}
function tttMove(i){
  TTT.board[i] = TTT.turn; Sfx.pop();
  const w = tttWinner(TTT.board);
  if (w){ TTT.over = true; TTT.winLine = w.line || null; tttEnd(w.p); }
  else TTT.turn = TTT.turn === 'X' ? 'O' : 'X';
  tttDraw();
  if (!TTT.over && TTT.mode === 'friend') speak(`${tttName(TTT.turn)}’s turn`, {quiet:true});
}
function tttEnd(p){
  if (p === 'tie'){ TTT.score.tie++; speak('It’s a tie! Good game.', {quiet:true}); if (TTT.mode === 'bot'){ saved.ttt.tie++; trackDay(); markDaily('games'); saveAll(); } return; }
  TTT.score[p]++;
  if (TTT.mode === 'bot'){
    if (p === 'X'){ saved.ttt.win++; recordResult('games', true, document.getElementById('tttBoard')); confetti(); Sfx.win(); speak(pick(['You win! Amazing!','You beat Unicorn Bot! Fantastic!','Three in a row! You win!']), {quiet:true}); }
    else { saved.ttt.lose++; trackDay(); markDaily('games'); saveAll(); speak('Unicorn Bot wins this time. Want to try again?', {quiet:true}); }
  } else { confetti(); Sfx.win(); speak(`${tttName(p)} wins! Great game!`, {quiet:true}); }
}
function tttBotTurn(){
  TTT.busy = true; tttDraw();
  setTimeout(() => { if (!document.getElementById('tttBoard') || TTT.over){ TTT.busy = false; return; } TTT.busy = false; tttMove(tttBotPick()); }, 650 + Math.random() * 350);
}
function tttBotPick(){
  const b = TTT.board, empty = b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  const winning = p => { for (const i of empty){ const t = b.slice(); t[i] = p; if (tttWinner(t) && tttWinner(t).p === p) return i; } return -1; };
  const lvl = TTT.level;
  if (lvl === 'easy'){ // sometimes notices a win, rarely blocks
    if (Math.random() < .5){ const w = winning('O'); if (w >= 0) return w; }
    if (Math.random() < .25){ const bl = winning('X'); if (bl >= 0) return bl; }
    return pick(empty);
  }
  if (lvl === 'medium'){
    const w = winning('O'); if (w >= 0) return w;
    const bl = winning('X'); if (bl >= 0 && Math.random() < .85) return bl;
    if (!b[4] && Math.random() < .5) return 4;
    return pick(empty);
  }
  // hard: perfect play (minimax)
  const mm = (bd, p, depth) => {
    const w = tttWinner(bd); if (w) return w.p === 'O' ? 10 - depth : w.p === 'X' ? depth - 10 : 0;
    let best = p === 'O' ? -99 : 99;
    bd.forEach((v, i) => { if (v) return; bd[i] = p; const s = mm(bd, p === 'O' ? 'X' : 'O', depth + 1); bd[i] = ''; best = p === 'O' ? Math.max(best, s) : Math.min(best, s); });
    return best;
  };
  let bestScore = -99, moves = [];
  empty.forEach(i => { const t = b.slice(); t[i] = 'O'; const s = mm(t, 'X', 1); if (s > bestScore){ bestScore = s; moves = [i]; } else if (s === bestScore) moves.push(i); });
  return pick(moves);
}

/* ---------- Memory match ---------- */
const MEM = {cards:[], open:[], matched:0, moves:0, lock:false, size:6};
const MEM_SETS = [['🦄','🌈','🦋','🌸','🍓','🐬','🚀','🐱','🌟','🧁'],['🐶','🐱','🐰','🦊','🐼','🦁','🐸','🐵','🐷','🐮'],['🍎','🍌','🍇','🍉','🍓','🍒','🍍','🥝','🍑','🍋']];
function renderMemory(size){
  if (size) MEM.size = size;
  setResume({page:'subject', subject:'games'});
  const set = pick(MEM_SETS);
  MEM.cards = shuffle([...set.slice(0, MEM.size), ...set.slice(0, MEM.size)]); MEM.open = []; MEM.matched = 0; MEM.moves = 0; MEM.lock = false;
  show(`${crumbs('Games', 'renderGamesHub()')}
  <section class="panel"><div class="section-title"><h1>🃏 Memory match</h1><span class="pill" id="memInfo">Moves: 0</span></div>
    <p>Flip two cards. If they match, they stay open! Find all ${MEM.size} pairs.</p>
    <div class="seg" style="max-width:420px;margin-bottom:12px">${[[4,'🐣 4 pairs'],[6,'🐰 6 pairs'],[8,'🦁 8 pairs']].map(([n, l]) => `<button class="${MEM.size === n ? 'active' : ''}" onclick="renderMemory(${n})">${l}</button>`).join('')}</div>
    <div class="memory-grid" id="memGrid">${MEM.cards.map((c, i) => `<button class="mem-card" aria-label="Card ${i + 1}" onclick="memFlip(${i}, this)"><span>${c}</span></button>`).join('')}</div>
    <div class="row-buttons"><button class="btn primary" onclick="renderMemory()">🔁 New game</button></div>
  </section>`);
  speak('Memory match! Flip two cards to find a pair.', {quiet:true});
}
function memFlip(i, el){
  if (MEM.lock || el.classList.contains('open') || el.classList.contains('matched')) return;
  el.classList.add('open'); Sfx.tap(); MEM.open.push([i, el]);
  if (MEM.open.length < 2) return;
  MEM.moves++; document.getElementById('memInfo').textContent = 'Moves: ' + MEM.moves;
  const [[a, ea], [b, eb]] = MEM.open; MEM.open = [];
  if (MEM.cards[a] === MEM.cards[b]){
    setTimeout(() => { ea.classList.add('matched'); eb.classList.add('matched'); Sfx.good(); }, 250);
    MEM.matched++;
    if (MEM.matched === MEM.size){ setTimeout(() => { if (!document.getElementById('memGrid')) return; recordResult('games', true, document.getElementById('memGrid')); confetti(); Sfx.win(); speak(`You found all the pairs in ${MEM.moves} moves! Great memory!`, {quiet:true}); const mi = document.getElementById('memInfo'); if (mi) mi.textContent = `🎉 Done in ${MEM.moves} moves!`; }, 500); }
  } else {
    MEM.lock = true;
    setTimeout(() => { ea.classList.remove('open'); eb.classList.remove('open'); MEM.lock = false; }, 900);
  }
}


/* ---------- Daily routine: 5 checks → a surprise sticker based on her score ---------- */
const STICKER_TIERS = [
  {key:'gold', min:.9, label:'Superstar', frame:'#ffc23d', bonus:3, msg:'Superstar! You got so many right! You earned a super rare golden sticker!',
   stickers:[['🦄','Golden Unicorn'],['👑','Royal Crown'],['🐉','Friendly Dragon'],['🧚','Sparkle Fairy'],['🏆','Champion Trophy'],['💎','Magic Gem'],['🦚','Proud Peacock'],['🌟','Shining Star'],['🪄','Magic Wand'],['🏰','Castle']]},
  {key:'silver', min:.7, label:'Great job', frame:'#9fb4ff', bonus:2, msg:'Great job! You earned a shiny silver sticker!',
   stickers:[['🌈','Rainbow'],['🦋','Butterfly'],['🐬','Dolphin'],['🚀','Rocket'],['🎠','Carousel'],['🦜','Parrot'],['🎨','Paint Palette'],['🐼','Panda'],['🦊','Fox'],['🪐','Ringed Planet']]},
  {key:'bronze', min:.5, label:'Good work', frame:'#f0a875', bonus:1, msg:'Good work! You earned a sweet sticker!',
   stickers:[['🌸','Flower'],['🐢','Turtle'],['🍓','Strawberry'],['🐣','Chick'],['🧁','Cupcake'],['🐞','Ladybug'],['🎈','Balloon'],['🍪','Cookie'],['🐠','Fish'],['🍉','Watermelon']]},
  {key:'sprout', min:0, label:'Keep growing', frame:'#8fd6a8', bonus:1, msg:'You finished every check! Every day you grow a little more. Here is a sprout sticker!',
   stickers:[['🌱','Little Sprout'],['🐛','Caterpillar'],['🍀','Lucky Clover'],['🐌','Snail'],['🐥','Baby Chick'],['🌼','Daisy']]}
];
const tierFor = pct => STICKER_TIERS.find(t => pct >= t.min);
const DISCOVER = [['science','🔬 Science'],['body','🧍 Human body'],['general','💡 World facts']];
const THINK = [['logic','🧩 Logic'],['english','✏️ English'],['school','🎯 School skills']];

function dayNumber(){ const d = new Date(); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5); }
function routinePlan(){
  const n = dayNumber(), [dk, dl] = DISCOVER[n % 3], [tk, tl] = THINK[(n + 1) % 3];
  return [
    {key:'story', icon:'📖', title:'Story time', subject:'reading', desc:'Read a picture story and answer a question.', story:n % illustratedStories.length},
    {key:'phonics', icon:'🔤', title:'Letters & sounds', subject:'reading', desc:'2 questions about letters and rhymes.'},
    {key:'math', icon:'🧮', title:'Math', subject:'math', desc:'3 math questions.'},
    {key:'discover', icon:'🔭', title:'Discover: ' + dl.replace(/^\S+ /, ''), subject:dk, desc:`2 ${dl.replace(/^\S+ /, '').toLowerCase()} questions.`},
    {key:'think', icon:'🧠', title:'Think: ' + tl.replace(/^\S+ /, ''), subject:tk, desc:`2 ${tl.replace(/^\S+ /, '').toLowerCase()} questions.`}
  ];
}
function routineState(){
  if (!saved.routine || saved.routine.date !== todayKey()) saved.routine = {date:todayKey(), step:0, scores:[], done:false, sticker:null, opened:false};
  return saved.routine;
}
function phonicsItem(){
  const r = Math.random();
  if (r < .34) return blendItem();
  if (r < .67){
    const [L, em, w] = pick(ALPHABET), others = shuffle(ALPHABET.filter(x => x[0] !== L)).slice(0, 2);
    return {q:`Which word starts with ${L}?`, choices:shuffle([`${em} ${w}`, ...others.map(o => `${o[1]} ${o[2]}`)]), a:`${em} ${w}`, explain:`${w} starts with the letter ${L}.`};
  }
  const x = pick([['cat','hat','dog','sun'],['star','car','fish','book'],['cake','lake','tree','ball'],['hill','Jill','cup','pen'],['bee','tree','pig','box'],['boat','coat','ring','map'],['fun','sun','bed','cup']]);
  return {q:`Which word rhymes with “${x[0]}”?`, choices:shuffle(x.slice(1)), a:x[1], explain:`${x[0]} and ${x[1]} rhyme.`};
}
function routineItems(step){
  if (step.key === 'story'){ const x = illustratedStories[step.story]; return [{q:x.q, choices:shuffle(x.choices), a:x.a, explain:x.lines.join(' '), passage:x.lines.join(' '), scene:x.scene}]; }
  if (step.key === 'phonics'){ const a = phonicsItem(); let b = phonicsItem(); while (b.q === a.q) b = phonicsItem(); return [a, b]; }
  if (step.key === 'math') return Array.from({length:3}, mathItem);
  return makeQuiz(step.subject).slice(0, 2);
}
function openRoutine(){ if (!nav('', 'routine')) renderRoutine(); }
function routineTotals(){ const r = routineState(); const right = r.scores.reduce((s, x) => s + x.right, 0), total = r.scores.reduce((s, x) => s + x.total, 0); return {right, total, pct: total ? right / total : 0}; }

function renderRoutine(justDone){
  stopSpeaking();
  const r = routineState(), plan = routinePlan();
  if (r.done && !r.opened) return renderStickerReveal();
  const t = routineTotals();
  const list = plan.map((s, i) => {
    const sc = r.scores[i], cur = i === r.step && !r.done;
    return `<div class="routine-step ${sc ? 'done' : ''} ${cur ? 'current' : ''} ${justDone === i ? 'just' : ''}">
      <span class="check">${sc ? '✓' : i + 1}</span>
      <span class="r-icon">${s.icon}</span>
      <span class="r-text"><b>${esc(s.title)}</b><small>${sc ? `${'⭐'.repeat(sc.right)}${'<span style="opacity:.25">⭐</span>'.repeat(sc.total - sc.right)}` : esc(s.desc)}</small></span>
      ${cur ? `<button class="btn primary" onclick="startRoutineStep()">${i === 0 && !r.scores.length ? 'Start' : 'Go'} →</button>` : ''}</div>`;
  }).join('');
  const next = plan[r.step];
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel routine-panel">
    <div class="section-title"><h1>🌞 Today’s routine</h1><span class="pill">${r.scores.length} / ${plan.length} checks done</span></div>
    <p class="muted">${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})} · Finish all ${plan.length} checks to open today’s surprise sticker! 🎁</p>
    <div class="progress" style="height:18px"><i style="width:${r.scores.length / plan.length * 100}%"></i></div>
    <div class="routine-list">${list}</div>
    ${r.done ? `<div class="fact" style="text-align:center"><h2>✅ All done for today!</h2>${stickerCard(r.sticker, true)}<p>You got <b>${t.right}</b> of <b>${t.total}</b> right. Come back tomorrow for a new sticker!</p><div class="row-buttons" style="justify-content:center"><button class="btn primary" onclick="renderStickerBook()">📒 My sticker book</button><button class="btn" onclick="openSubject('games')">🎲 Play a game</button></div></div>`
      : `<div class="mystery"><div class="gift">🎁</div><div><b>Today’s surprise sticker</b><br><span class="tiny">The more you get right, the rarer the sticker: 🌱 → 🥉 → 🥈 → 🏆 golden!</span></div></div>`}
  </section>`);
  if (justDone !== undefined && !r.done) speak(`Check ${justDone + 1} done! Next: ${next.title}.`, {quiet:true});
  else if (justDone === undefined && !r.done) speak(r.scores.length ? `Welcome back! Next is ${next.title}.` : `Good ${greeting().split(' ')[1]}, Ruhaimah! Let’s do today’s routine. Finish all five checks to get a surprise sticker!`, {quiet:true});
}
function startRoutineStep(){
  const r = routineState(), plan = routinePlan(), step = plan[r.step]; if (!step) return renderRoutine();
  currentQuiz = {subject:step.subject, index:0, right:0, results:[], items:routineItems(step),
    title:`${step.icon} ${step.title}`, tag:`Check ${r.step + 1} of ${plan.length}`, back:['Today’s routine', 'renderRoutine()'],
    onDone: Q => finishRoutineStep(Q)};
  renderQuizCard();
}
function finishRoutineStep(Q){
  const r = routineState(), plan = routinePlan(), i = r.step;
  r.scores[i] = {right:Q.right, total:Q.items.length};
  r.step = i + 1; Sfx.good();
  if (r.step >= plan.length){
    r.done = true;
    const t = routineTotals(), tier = tierFor(t.pct);
    const have = new Set((saved.stickerBook || []).map(s => s.e));
    const pool = tier.stickers.filter(s => !have.has(s[0]));
    const [e, name] = pick(pool.length ? pool : tier.stickers);
    r.sticker = {e, name, tier:tier.key, right:t.right, total:t.total, date:todayKey()};
    saved.stickerBook = (saved.stickerBook || []).concat([r.sticker]);
    addStars(tier.bonus); trackDay(); saveAll();
    return renderStickerReveal();
  }
  saveAll(); renderRoutine(i);
}
function stickerCard(s, small){
  if (!s) return '';
  const t = STICKER_TIERS.find(x => x.key === s.tier) || STICKER_TIERS[3];
  return `<div class="sticker-card tier-${t.key} ${small ? 'small' : ''}" style="--frame:${t.frame}"><span class="s-emoji">${s.e}</span><b>${esc(s.name)}</b><small>${t.label}</small></div>`;
}
function renderStickerReveal(){
  const r = routineState(), s = r.sticker, t = STICKER_TIERS.find(x => x.key === s.tier);
  show(`<section class="panel celebrate">
    <h1>🎉 You finished today’s routine!</h1>
    <p style="font-size:22px">You got <b>${s.right}</b> out of <b>${s.total}</b> right.</p>
    <div id="revealZone"><button class="gift-btn" onclick="openGift()" aria-label="Open your surprise sticker">🎁<span>Tap to open!</span></button></div>
    <div id="revealAfter" hidden>
      <p style="font-size:22px;font-weight:800" id="revealMsg">${esc(t.msg)}</p>
      <div class="row-buttons" style="justify-content:center"><button class="btn primary big" onclick="renderStickerBook()">📒 Put it in my sticker book</button><button class="btn" onclick="goHome()">🏠 Home</button></div>
    </div>
  </section>`);
  speak('You finished today’s routine! Tap the present to open your surprise sticker!', {quiet:true});
}
function openGift(){
  const r = routineState(), s = r.sticker, t = STICKER_TIERS.find(x => x.key === s.tier);
  r.opened = true; saveAll();
  document.getElementById('revealZone').innerHTML = `<div class="reveal-pop">${stickerCard(s)}</div>`;
  document.getElementById('revealAfter').hidden = false;
  Sfx.win(); confetti(s.tier === 'gold' ? 60 : 34);
  speak(`${t.msg} It’s the ${s.name}!`, {quiet:true});
}
function renderStickerBook(){
  stopSpeaking();
  const book = saved.stickerBook || [], have = new Set(book.map(s => s.e));
  const tiers = STICKER_TIERS.map(t => `<h3 style="margin-top:16px">${t.key === 'gold' ? '🏆' : t.key === 'silver' ? '🥈' : t.key === 'bronze' ? '🥉' : '🌱'} ${t.label} stickers <span class="tiny">${t.key === 'gold' ? '(9–10 right)' : t.key === 'silver' ? '(7–8 right)' : t.key === 'bronze' ? '(5–6 right)' : '(finish the routine)'}</span></h3>
    <div class="book-row">${t.stickers.map(([e, n]) => have.has(e) ? `<div class="book-slot got" style="--frame:${t.frame}" title="${esc(n)}"><span>${e}</span><small>${esc(n)}</small></div>` : `<div class="book-slot" title="Not found yet"><span>❔</span><small>???</small></div>`).join('')}</div>`).join('');
  const recent = book.slice(-14).reverse().map(s => `<div class="check"><span style="font-size:30px">${s.e}</span><span style="flex:1"><b>${esc(s.name)}</b><br><span class="tiny">${new Date(s.date + 'T12:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})}</span></span><span class="pill">${s.right}/${s.total}</span></div>`).join('');
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel"><div class="section-title"><h1>📒 My sticker book</h1><span class="pill">${have.size} / ${STICKER_TIERS.reduce((n, t) => n + t.stickers.length, 0)} collected</span></div>
    <p class="muted">Finish the daily routine to get a new sticker each day. Get more answers right for rarer stickers!</p>
    ${tiers}
    ${recent ? `<h2 style="margin-top:22px">🗓️ My sticker days</h2><div class="checklist">${recent}</div>` : ''}
    <div class="row-buttons"><button class="btn primary" onclick="openRoutine()">🌞 Today’s routine</button></div>
  </section>`);
}

/* ---------- Listening: she reads aloud, the app checks the words ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function setListening(on){ document.querySelectorAll('.mic-btn').forEach(b => b.classList.toggle('listening', !!on)); }
const Listen = {
  rec:null, err:null,
  available(){ return !!SR && voicePrefs.mic !== false && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)); },
  start(opts = {}){
    this.stop(); stopSpeaking();
    return new Promise(resolve => {
      let r; try{ r = new SR(); }catch(e){ return resolve({alts:[], text:'', error:'unsupported'}); }
      this.rec = r; this.err = null;
      r.lang = 'en-US'; r.interimResults = !!opts.onInterim; r.maxAlternatives = 5; r.continuous = !!opts.continuous;
      const alts = []; let finalText = '';
      r.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++){
          const res = e.results[i];
          if (res.isFinal){ for (let j = 0; j < res.length; j++) alts.push(res[j].transcript); finalText += ' ' + res[0].transcript; }
          else interim += ' ' + res[0].transcript;
        }
        if (opts.onInterim && opts.onInterim((finalText + ' ' + interim).trim()) === true){ try{ r.stop(); }catch(err){} }
      };
      r.onerror = e => { this.err = e.error; };
      r.onend = () => { if (this.rec === r) this.rec = null; clearTimeout(timer); setListening(false); resolve({alts, text:finalText.trim(), error:this.err}); };
      const timer = setTimeout(() => { try{ r.stop(); }catch(e){} }, opts.maxMs || 6000);
      try{ r.start(); setListening(true); Sfx.tone(880, .08, 'sine', 0, .05); }catch(e){ clearTimeout(timer); resolve({alts:[], text:'', error:'start'}); }
    });
  },
  stop(){ if (this.rec){ try{ this.rec.abort(); }catch(e){} this.rec = null; } setListening(false); }
};
const NUM_WORDS = {0:'zero',1:'one',2:'two',3:'three',4:'four',5:'five',6:'six',7:'seven',8:'eight',9:'nine',10:'ten'};
const HOMOPHONES = {sun:['son'],be:['bee'],bee:['be'],see:['sea'],sea:['see'],to:['two','too'],two:['to','too'],too:['to','two'],for:['four'],four:['for'],no:['know'],red:['read'],eight:['ate'],ate:['eight'],one:['won'],hi:['high'],blue:['blew'],new:['knew'],by:['buy','bye'],there:['their'],right:['write'],would:['wood'],our:['hour'],rap:['wrap'],hen:['hands'],cat:['kat','cats'],dog:['dogs'],pen:['pin'],pin:['pen'],ten:['tin'],bug:['bugs'],ship:['chip'],chip:['ship']};
function normWords(t){ return String(t).toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean).map(w => NUM_WORDS[w] || w.replace(/'/g, '')); }
function lev(a, b){ const m = Array.from({length:a.length + 1}, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
function wordMatches(heard, target){ target = target.toLowerCase(); return heard === target || (HOMOPHONES[target] || []).includes(heard) || (target.length >= 5 && lev(heard, target) <= 1); }
function judgeWord(target, alts){
  let close = null;
  for (const a of alts){ const ws = normWords(a); if (ws.some(w => wordMatches(w, target))) return {ok:true}; ws.forEach(w => { if (!close && lev(w, target.toLowerCase()) <= 1) close = w; }); }
  return {ok:false, close, heard:alts[0] || ''};
}
/* mic + grown-up check widget used by blending and sight words */
function micBlock(id){ return `<div class="mic-zone" id="${id}">${Listen.available() ? `<button class="mic-btn" onclick="${id}Go()" aria-label="Tap and say it">🎤</button><div class="mic-help"><b>Tap the microphone</b>, then say the word.<div id="${id}Heard" class="tiny"></div></div>` : ''}</div>`; }
function grownUpCheck(el, yes, retry, reason){
  el.innerHTML = `<div class="grownup"><span class="tiny">${esc(reason || 'Grown-up check')}</span><b>Did she say it right?</b><div class="row-buttons" style="margin-top:6px"><button class="btn secondary">✅ Yes!</button><button class="btn">🔁 Try again</button></div></div>`;
  const [y, n] = el.querySelectorAll('button'); y.onclick = yes; n.onclick = retry;
}
function micError(err){
  if (err === 'not-allowed' || err === 'service-not-allowed') return 'The microphone is blocked. Allow it in the browser, or use the grown-up check.';
  if (err === 'no-speech') return 'I didn’t hear anything. Tap 🎤 and speak a little louder.';
  if (err === 'network') return 'Listening needs internet. Use the grown-up check.';
  if (err === 'audio-capture') return 'No microphone found. Use the grown-up check.';
  return '';
}
/* Ask her to say one word; resolves true when she gets it (by mic or grown-up check) */
function sayWordCheck(id, target, onCorrect){
  const zone = document.getElementById(id); let tries = 0;
  const showCheck = reason => grownUpCheck(zone, () => onCorrect('check'), () => { zone.outerHTML = micBlock(id); wire(); }, reason);
  function wire(){
    window[id + 'Go'] = async () => {
      const heardEl = document.getElementById(id + 'Heard'); if (heardEl) heardEl.textContent = 'Listening… 👂';
      const res = await Listen.start({maxMs:5000});
      if (res.error === 'aborted' || !document.getElementById(id)) return;
      const msg = micError(res.error);
      if (msg && !res.alts.length){ if (heardEl) heardEl.textContent = msg; if (res.error !== 'no-speech') showCheck('Listening isn’t working here'); return; }
      const j = judgeWord(target, res.alts); tries++;
      if (j.ok) return onCorrect('mic');
      Sfx.bad();
      const said = j.heard ? `I heard “${j.heard.trim()}”.` : '';
      if (heardEl) heardEl.textContent = `${said} ${j.close ? 'So close!' : 'Let’s try again!'}`;
      speak(`${j.close ? 'So close!' : 'Good try!'} Listen again and try once more.`, {quiet:true});
      if (tries >= 2) showCheck('Tricky one! Grown-up check');
    };
  }
  if (!Listen.available()){ showCheck(SR ? 'Listening is turned off in Settings' : 'This browser can’t listen. Grown-up check'); return; }
  wire();
}

/* ---------- phonics data ---------- */
const SOUND = {a:'ah',b:'buh',c:'kuh',d:'duh',e:'eh',f:'fuh',g:'guh',h:'huh',i:'ih',j:'juh',k:'kuh',l:'luh',m:'mmm',n:'nnn',o:'aw',p:'puh',q:'kwuh',r:'ruh',s:'sss',t:'tuh',u:'uh',v:'vuh',w:'wuh',x:'ks',y:'yuh',z:'zzz',sh:'shhh',ch:'chuh',th:'thuh',ck:'kuh',wh:'wuh'};
const DIGRAPHS = [['sh','🚢','ship','shhh, like when you ask someone to be quiet'],['ch','🍟','chip','chuh, like a train: choo choo'],['th','🛁','bath','thuh, put your tongue between your teeth'],['ck','🦆','duck','kuh, at the end of a word'],['wh','🐳','whale','wuh, like the wind']];
const BLEND_WORDS = [
  [['c','a','t'],'🐱'],[['h','a','t'],'🎩'],[['b','a','t'],'🦇'],[['m','a','p'],'🗺️'],[['v','a','n'],'🚐'],[['p','a','n'],'🍳'],[['r','a','t'],'🐀'],[['b','a','g'],'👜'],[['c','a','n'],'🥫'],[['c','a','p'],'🧢'],
  [['d','o','g'],'🐶'],[['l','o','g'],'🪵'],[['p','o','t'],'🍲'],[['b','o','x'],'📦'],[['f','o','x'],'🦊'],[['m','o','p'],'🧹'],[['h','o','t'],'🔥'],
  [['p','i','g'],'🐷'],[['p','i','n'],'📌'],[['l','i','p'],'👄'],[['s','i','x'],'6️⃣'],[['k','i','d'],'🧒'],[['f','i','n'],'🦈'],[['w','i','n'],'🏆'],
  [['s','u','n'],'☀️'],[['b','u','s'],'🚌'],[['b','u','g'],'🐛'],[['c','u','p'],'☕'],[['n','u','t'],'🥜'],[['h','u','g'],'🤗'],[['r','u','n'],'🏃'],
  [['h','e','n'],'🐔'],[['b','e','d'],'🛏️'],[['n','e','t'],'🥅'],[['p','e','n'],'🖊️'],[['j','e','t'],'✈️'],[['w','e','b'],'🕸️'],[['l','e','g'],'🦵'],[['t','e','n'],'🔟'],[['r','e','d'],'🔴'],
  [['sh','i','p'],'🚢',2],[['f','i','sh'],'🐟',2],[['ch','i','p'],'🍟',2],[['b','a','th'],'🛁',2],[['d','u','ck'],'🦆',2],[['s','o','ck'],'🧦',2],[['r','o','ck'],'🪨',2],[['sh','o','p'],'🛍️',2],[['ch','i','ck'],'🐤',2],[['m','o','th'],'🦋',2]
];
const WORD_EMOJI = Object.fromEntries(BLEND_WORDS.map(([s, e]) => [s.join(''), e]).concat([['man','👨'],['dig','⛏️'],['hop','🐇'],['top','🔝'],['pop','🎈'],['mug','☕'],['jug','🏺'],['vet','🩺'],['wet','💧'],['pet','🐹'],['bin','🗑️'],['tin','🥫'],['dot','⚫'],['cot','🛏️'],['bun','🍔'],['fun','🎉'],['nap','😴'],['tap','🚰'],['big','🐘'],['fig','🫐'],['wig','💇'],['cop','👮'],['tug','🚢'],['set','🧩'],['get','🤲']]));
const FAMILIES = [
  ['at','bcfhmprs','zj'],['an','cfmprtv','zl'],['ig','bdfpwj','zh'],['op','chmpt','zn'],['ug','bdhjmrt','zv'],
  ['et','bgjlmnpsvw','zf'],['in','bfptw','zl'],['ot','cdghlnpr','zf'],['un','bfrs','zm'],['ap','cglmnst','vh']
];
const SIGHT_LEVELS = [
  {name:'🐣 Level 1', words:'a and away big blue can come down find for funny go help here I in is it jump little look make me my not one play red run said see the three to two up we where yellow you'},
  {name:'🐰 Level 2', words:'all am are at ate be black brown but came did do eat four get good have he into like must new no now on our out please pretty ran ride saw say she so soon that there they this too under want was well went what white who will with yes'},
  {name:'🦁 Level 3', words:'after again any ask by could every fly from give going had has her him his how just know let live may of old once open over put round some stop take thank them then think walk were when'}
].map(l => ({...l, words:l.words.split(' ')}));
const READ_SENTENCES = [
  ['The cat sat on a mat.','🐱'],['A big pig can dig.','🐷'],['The sun is hot.','☀️'],['I can see a red bug.','🐞'],['Dad has a big map.','🗺️'],['The dog ran to the log.','🐶'],
  ['Ten hens sit in a pen.','🐔'],['The fox is in the box.','🦊'],['We can hop and jump.','🐸'],['Mom and I go to the shop.','🛍️'],['The duck is in the pond.','🦆'],['I like my blue cup.','☕'],
  ['A fish can swim.','🐟'],['Look at the big ship!','🚢'],['She has a pink hat.','👒'],['Can you run fast?','🏃'],['The bus is red and big.','🚌'],['I see six fish in the net.','🥅']
];
const soundOf = g => SOUND[g] || g;
const soundSay = g => `${soundOf(g)}.`;

/* ---------- Reading & phonics hub (tabs) ---------- */
const READ_TABS = [['stories','📚 Stories'],['sounds','🔤 Letter sounds'],['blend','🧩 Blend it'],['families','🏠 Word families'],['sight','👀 Sight words'],['aloud','🎤 Read aloud']];
function readingLibrary(tab){
  tab = tab || readingLibrary.tab || 'stories'; readingLibrary.tab = tab;
  setResume({page:'lesson', subject:'reading'}); Listen.stop();
  const head = `${crumbs('Reading', "openSubject('reading')")}<section class="panel"><div class="section-title"><h1>📚 Reading & phonics</h1>${Listen.available() ? '<span class="pill mint">🎤 Listening is on</span>' : '<span class="pill">✋ Grown-up check mode</span>'}</div>
    <div class="tabs">${READ_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" onclick="readingLibrary('${k}')">${l}</button>`).join('')}</div><div id="readZone"></div></section>`;
  show(head);
  ({stories:tabStories, sounds:tabSounds, blend:tabBlend, families:tabFamilies, sight:tabSight, aloud:tabAloud})[tab]();
}
const RZ = html => { document.getElementById('readZone').innerHTML = html; };
function tabStories(){
  const read = saved.storiesRead || {};
  RZ(`<p>Choose a picture story. Tap 🔊 to listen, or 🎤 to read it yourself. <span class="pill">${Object.keys(read).length} / ${illustratedStories.length} read</span></p>
    <div class="grid story-grid">${illustratedStories.map((x, i) => `<button class="story-tile" onclick="openStory(${i})">${storyPicture(x.scene)}<strong>${read[i] ? '<span class="done-mark">✅</span>' : ''}${esc(x.title)}</strong><small>4 short sentences</small></button>`).join('')}</div>`);
}
function tabSounds(){
  RZ(`<h2>🔤 Letter sounds</h2><p class="muted">Tap a letter to hear its <b>sound</b> and a word that starts with it.</p>
    <div class="alphabet-grid">${ALPHABET.map(([L, em, w]) => `<button class="alpha" onclick="${sayAttr(L === 'X' ? 'X says ks, like in fox.' : `${soundOf(L.toLowerCase())}. ${soundOf(L.toLowerCase())}. ${w}.`)}"><b>${L}${L.toLowerCase()}</b><span>${em}</span><small>${w}</small></button>`).join('')}</div>
    <h2 style="margin-top:20px">👯 Two letters, one sound</h2>
    <div class="grid lesson-grid">${DIGRAPHS.map(([d, em, w, tip]) => `<div class="lesson-card"><span class="big-emoji">${em}</span><h3 style="font-size:34px;margin:0">${d}</h3><p><b>${w}</b>: ${esc(tip)}</p><div class="row-buttons">${speakBtn(`${d.split('').join(' ')} says ${tip}. ${w}.`, 'Listen')}</div></div>`).join('')}</div>
    <h2 style="margin-top:20px">👂 Sound detective</h2><p class="muted">Listen to the sound. Which picture starts with it?</p><div id="soundGame"></div>`);
  soundGame();
}
function soundGame(){
  const z = document.getElementById('soundGame'); if (!z) return;
  const pool = ALPHABET.filter(x => !'QXUIEV'.includes(x[0]));
  const t = pick(pool), opts = shuffle([t, ...shuffle(pool.filter(x => x[0] !== t[0])).slice(0, 2)]);
  const s = soundOf(t[0].toLowerCase());
  z.innerHTML = `<div class="question"><button class="speak-btn" onclick="speak('${s}. ${s}. Which picture starts with ${s}?')">🔊</button><h2>Which picture starts with <span style="color:var(--purple)">/${t[0].toLowerCase()}/</span>?</h2></div>
    <div class="choice-grid">${opts.map(o => `<button class="choice" style="font-size:54px" aria-label="${o[2]}" data-ok="${o[0] === t[0]}">${o[1]}<br><small style="font-size:18px">${o[2]}</small></button>`).join('')}</div><p id="playFeedback" class="feedback"></p><button class="btn" onclick="soundGame()">Next sound →</button>`;
  z.querySelectorAll('.choice').forEach(b => b.onclick = () => { if (b.dataset.ok === 'true'){ b.classList.add('good'); recordResult('reading', true, b); speak(`Yes! ${t[2]} starts with ${s}.`, {quiet:true}); setTimeout(soundGame, 1600); } else { b.classList.add('bad'); b.disabled = true; Sfx.bad(); speak(`Listen: ${s}. ${t[2]}.`, {quiet:true}); } });
  speak(`${s}. ${s}. Which picture starts with ${s}?`, {quiet:true});
}

/* Blend it: hear each sound, then say the whole word */
const BL = {level:1, word:null};
function tabBlend(){
  const list = BLEND_WORDS.filter(w => (w[2] || 1) === BL.level), item = BL.word && list.includes(BL.word) ? BL.word : pick(list); BL.word = item;
  const [parts, em] = item, word = parts.join('');
  const others = shuffle(list.filter(w => w !== item)).slice(0, 2);
  RZ(`<div class="section-title"><h2>🧩 Blend it!</h2><div class="seg">${[[1,'🐣 Short words'],[2,'🦁 sh · ch · th · ck']].map(([l, n]) => `<button class="${BL.level === l ? 'active' : ''}" onclick="BL.level=${l};BL.word=null;tabBlend()">${n}</button>`).join('')}</div></div>
    <p class="muted">1. Tap each tile to hear its sound. 2. Tap <b>🐢 Slow blend</b>. 3. Say the whole word!</p>
    <div class="blend-tiles" id="tiles">${parts.map((p, i) => `<button class="tile" onclick="tileSay(${i})">${p}</button>`).join('')}<span class="blend-eq">=</span><span class="blend-pic" id="blendPic">❓</span></div>
    <div class="row-buttons"><button class="btn primary" onclick="slowBlend()">🐢 Slow blend</button><button class="btn" onclick="fastBlend()">🐇 Fast blend</button></div>
    ${micBlock('blendMic')}
    <details class="tiny" style="margin-top:6px"><summary>Need help? Pick the picture instead</summary><div class="choice-grid">${shuffle([item, ...others]).map(w => `<button class="choice" style="font-size:44px" data-w="${w[0].join('')}">${w[1]}</button>`).join('')}</div></details>
    <p id="playFeedback" class="feedback" aria-live="polite"></p>
    <div class="row-buttons"><button class="btn big" id="blendNext" onclick="BL.word=null;tabBlend()">Next word →</button></div>`);
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => b.dataset.w === word ? blendWin('pick', b) : (b.classList.add('bad'), b.disabled = true, Sfx.bad()));
  sayWordCheck('blendMic', word, how => blendWin(how));
  speak(['Let’s blend!', ...parts.map(soundSay)], {gap:450, quiet:true, onPart: i => tileGlow(i - 1)});
}
function tileGlow(i){ document.querySelectorAll('#tiles .tile').forEach((t, j) => t.classList.toggle('on', j === i)); }
function tileSay(i){ const p = BL.word[0][i]; tileGlow(i); speak(soundSay(p), {quiet:true, onPart: k => { if (k < 0) tileGlow(-1); }}); }
function slowBlend(){ const ps = BL.word[0]; speak(ps.map(soundSay), {gap:550, rate:.75, onPart: i => tileGlow(i)}); }
function fastBlend(){ const ps = BL.word[0]; speak(ps.map(p => soundOf(p)).join(' '), {rate:1.05, onPart: i => document.querySelectorAll('#tiles .tile').forEach(t => t.classList.toggle('on', i === 0))}); }
function blendWin(how, el){
  const word = BL.word[0].join(''), fb = document.getElementById('playFeedback') || document.createElement('p');
  const bp = document.getElementById('blendPic'); if (!bp) return; bp.textContent = BL.word[1];
  document.querySelectorAll('#tiles .tile').forEach(t => t.classList.add('done'));
  const z = document.getElementById('blendMic'); if (z) z.innerHTML = `<div class="mic-ok">✅ ${how === 'mic' ? 'I heard you say' : 'The word is'} <b>${esc(word)}</b>!</div>`;
  recordResult('reading', true, el || document.getElementById('tiles'));
  saved.blendCount = (saved.blendCount || 0) + 1; saveAll();
  const c = pick(cheers); fb.className = 'feedback good'; fb.textContent = `🌟 ${c} ${BL.word[0].join(' - ')} makes ${word}!`;
  speak([`${c}`, `${BL.word[0].map(soundOf).join(', ')}.`, `${word}!`], {quiet:true, gap:300});
  const bn = document.getElementById('blendNext'); if (bn) bn.classList.add('primary');
}

/* Word families: change the first letter to make new words */
const FAM = {i:0};
function tabFamilies(){
  const [rime, real, silly] = FAMILIES[FAM.i], onsets = shuffle((real + silly).split(''));
  RZ(`<div class="section-title"><h2>🏠 The “-${rime}” family</h2>${speakBtn(`The ${rime} family. Tap a letter to make a new word. Is it a real word or a silly word?`)}</div>
    <div class="tabs">${FAMILIES.map(([r], i) => `<button class="tab ${i === FAM.i ? 'active' : ''}" onclick="FAM.i=${i};tabFamilies()">-${r}</button>`).join('')}</div>
    <div class="family-build"><span class="tile onset" id="onset">?</span><span class="tile rime">${rime}</span><span class="blend-eq">=</span><span class="blend-pic" id="famPic">🏠</span></div>
    <p id="famMsg" class="feedback" style="min-height:34px">Tap a letter to put it in front!</p>
    <div class="onset-row">${onsets.map(o => `<button class="btn big gold" onclick="famTry('${o}')">${o}</button>`).join('')}</div>
    <h3 style="margin-top:16px">Real words found: <span id="famFound"></span></h3>`);
  FAM.found = new Set(); famShow();
}
function famShow(){ const el = document.getElementById('famFound'); if (el) el.textContent = [...FAM.found].join(', ') || '—'; }
function famTry(o){
  const [rime, real] = FAMILIES[FAM.i], word = o + rime, isReal = real.includes(o);
  document.getElementById('onset').textContent = o;
  document.getElementById('famPic').textContent = isReal ? (WORD_EMOJI[word] || '✅') : '🤪';
  const msg = document.getElementById('famMsg');
  msg.className = 'feedback ' + (isReal ? 'good' : 'bad');
  msg.textContent = isReal ? `“${word}” is a real word!` : `“${word}” is a silly word! 😄`;
  speak([`${soundOf(o)}. ${rime}.`, `${word}!`, isReal ? 'That is a real word!' : 'That is a silly word!'], {quiet:true, gap:250});
  if (isReal && !FAM.found.has(word)){ FAM.found.add(word); famShow(); if (FAM.found.size === real.length){ recordResult('reading', true, msg); confetti(); setTimeout(() => speak(`You found all the ${rime} words!`, {quiet:true}), 2600); } else Sfx.pop(); }
}

/* Sight words: flash cards she reads to the app */
const SW = {level:0, idx:0, order:[]};
function tabSight(){
  const L = SIGHT_LEVELS[SW.level]; saved.sightKnown = saved.sightKnown || {};
  if (!SW.order.length || SW.orderLevel !== SW.level){ SW.order = shuffle(L.words); SW.idx = 0; SW.orderLevel = SW.level; }
  const w = SW.order[SW.idx % SW.order.length], known = L.words.filter(x => saved.sightKnown[x]).length;
  const micOK = w.length > 1;
  RZ(`<div class="section-title"><h2>👀 Sight words</h2><div class="seg">${SIGHT_LEVELS.map((l, i) => `<button class="${i === SW.level ? 'active' : ''}" onclick="SW.level=${i};tabSight()">${l.name}</button>`).join('')}</div></div>
    <p class="muted">Sight words are words we read by looking. Read the card out loud!</p>
    <div class="progress"><i style="width:${known / L.words.length * 100}%"></i></div><p class="tiny">${known} of ${L.words.length} words read correctly</p>
    <div class="flash-card ${saved.sightKnown[w] ? 'known' : ''}" id="flash">${esc(w)}</div>
    ${micOK ? micBlock('sightMic') : '<div class="mic-zone" id="sightMic"></div>'}
    <p id="playFeedback" class="feedback" aria-live="polite"></p>
    <div class="row-buttons"><button class="btn sky" onclick="${sayAttr(w)}">🔊 Hear it</button><button class="btn big" id="sightNext" onclick="SW.idx++;tabSight()">Next card →</button></div>
    <details style="margin-top:10px"><summary class="tiny">See all ${L.words.length} words</summary><div class="word-cloud">${L.words.map(x => `<span class="${saved.sightKnown[x] ? 'known' : ''}">${esc(x)}</span>`).join('')}</div></details>`);
  const win = how => {
    saved.sightKnown[w] = (saved.sightKnown[w] || 0) + 1; recordResult('reading', true, document.getElementById('flash'));
    const fl = document.getElementById('flash'); if (!fl) return; fl.classList.add('known');
    const z = document.getElementById('sightMic'); if (z) z.innerHTML = `<div class="mic-ok">✅ ${how === 'mic' ? 'I heard' : 'Yes,'} “${esc(w)}”!</div>`;
    const fb = document.getElementById('playFeedback'); if (fb){ fb.className = 'feedback good'; fb.textContent = '🌟 ' + pick(cheers); }
    speak(pick(cheers), {quiet:true}); const sn = document.getElementById('sightNext'); if (sn) sn.classList.add('primary');
  };
  if (micOK) sayWordCheck('sightMic', w, win);
  else grownUpCheck(document.getElementById('sightMic'), () => win('check'), () => speak(w), 'One-letter word. Grown-up check');
}

/* Read aloud: words light up green as she reads them */
const RA = {i:0};
function tabAloud(){
  const [text, em] = READ_SENTENCES[RA.i % READ_SENTENCES.length];
  RZ(`<div class="section-title"><h2>🎤 Read it to me</h2><span class="pill">Sentence ${RA.i % READ_SENTENCES.length + 1} of ${READ_SENTENCES.length}</span></div>
    <p class="muted">${Listen.available() ? 'Tap the microphone and read the sentence. Each word turns green when I hear it!' : 'Read the sentence out loud to a grown-up. Tap a word to hear it.'}</p>
    <div class="read-card"><span class="read-emoji">${em}</span><div id="readWords" class="read-words">${wordSpans(text)}</div></div>
    <div class="row-buttons">${Listen.available() ? '<button class="mic-btn" onclick="aloudGo()" aria-label="Start reading">🎤</button>' : ''}<button class="btn sky" onclick="aloudHear()">🔊 Read it to me</button><button class="btn big" id="aloudNext" onclick="RA.i++;tabAloud()">Next sentence →</button></div>
    <p id="playFeedback" class="feedback" aria-live="polite"></p><div id="aloudCheck"></div>`);
  if (!Listen.available()) grownUpCheck(document.getElementById('aloudCheck'), () => aloudDone(1), () => {}, 'Grown-up check');
}
function wordSpans(text){ return text.split(' ').map(w => `<span class="w" onclick="speak(this.dataset.say)" data-say="${esc(w.replace(/[^\w']/g, ''))}">${esc(w)}</span>`).join(' '); }
function aloudHear(){ const spans = [...document.querySelectorAll('#readWords .w')]; readLines(spans.map(s => s.dataset.say), spans, {gap:120}); }
async function aloudGo(){
  const spans = [...document.querySelectorAll('#readWords .w')];
  const res = await listenRead(spans, document.getElementById('playFeedback'));
  if (res !== null) aloudDone(res);
}
function aloudDone(score){
  const fb = document.getElementById('playFeedback'); if (!fb) return;
  if (score >= .8){ fb.className = 'feedback good'; fb.textContent = '🌟 ' + pick(cheers) + ' You read the whole sentence!'; recordResult('reading', true, document.getElementById('readWords')); speak(pick(cheers) + ' Great reading!', {quiet:true}); document.getElementById('aloudNext').classList.add('primary'); }
  else { fb.className = 'feedback bad'; fb.textContent = '💜 Good try! Tap the orange words to hear them, then try again.'; speak('Good try! Let’s practice the orange words.', {quiet:true}); }
}
/* Listen while she reads a set of word spans; marks words green in order. Resolves with the share of words read. */
async function listenRead(spans, statusEl){
  const target = spans.map(s => normWords(s.dataset.say)[0] || '');
  spans.forEach(s => s.classList.remove('heard', 'missed'));
  if (statusEl){ statusEl.className = 'feedback'; statusEl.textContent = 'Listening… start reading! 👂'; }
  let got = 0;
  const align = text => {
    const heard = normWords(text); let p = 0;
    for (const h of heard){ for (let k = p; k < Math.min(p + 3, target.length); k++){ if (wordMatches(h, target[k])){ p = k + 1; break; } } }
    return p;
  };
  const res = await Listen.start({continuous:true, maxMs:Math.max(7000, target.length * 1400), onInterim: text => {
    const p = align(text);
    if (p > got){ got = p; spans.forEach((s, i) => s.classList.toggle('heard', i < got)); }
    return got >= target.length;
  }});
  if (res.error === 'aborted' || !spans[0].isConnected) return null;
  if (!got && res.error){ const m = micError(res.error); if (statusEl) statusEl.textContent = m || 'Let’s try again!'; return res.error === 'no-speech' ? null : (grownUpCheck(document.getElementById('aloudCheck') || statusEl, () => aloudDone(1), () => {}, 'Listening isn’t working here'), null); }
  // count matches anywhere (she may skip around)
  const heardAll = normWords(res.text + ' ' + res.alts.join(' '));
  spans.forEach((s, i) => { const ok = i < got || heardAll.some(h => wordMatches(h, target[i])); s.classList.toggle('heard', ok); s.classList.toggle('missed', !ok); });
  const n = spans.filter(s => s.classList.contains('heard')).length;
  return n / spans.length;
}

/* Story page: let her read the story herself */
async function storyReadMine(i){
  const box = document.querySelector('.story-box');
  const spans = [...box.querySelectorAll('.w')];
  const fb = document.getElementById('storyFb');
  const score = await listenRead(spans, fb);
  if (score === null) return;
  if (score >= .75){ fb.className = 'feedback good'; fb.textContent = `🌟 Wonderful reading! You read ${Math.round(score * 100)}% of the words.`; recordResult('reading', true, box); if (!saved.storiesRead[i]){ saved.storiesRead[i] = true; saveAll(); } confetti(18); speak('Wonderful reading!', {quiet:true}); }
  else { fb.className = 'feedback bad'; fb.textContent = '💜 Good try! Tap the orange words to hear them, then read again.'; speak('Good try! Tap the orange words to hear them.', {quiet:true}); }
}

/* Extra question types for quizzes and the daily routine */
function blendItem(){
  const list = BLEND_WORDS.filter(w => (w[2] || 1) === 1), t = pick(list), others = shuffle(list.filter(w => w !== t)).slice(0, 2);
  return {q:`Blend the sounds: ${t[0].join(' – ')}. Which picture?`, say:`Blend the sounds. ${t[0].map(soundOf).join('. ')}. Which picture is it?`, choices:shuffle([t, ...others]).map(w => `${w[1]} ${w[0].join('')}`), a:`${t[1]} ${t[0].join('')}`, explain:`${t[0].join(' - ')} makes ${t[0].join('')}.`};
}

/* ---------- Math hub: hands-on activities ---------- */
const MATH_TABS = [['count','🔢 Counting'],['add','➕ Adding'],['sub','➖ Take away'],['skip','🦘 Skip counting'],['compare','⚖️ More or less'],['oddeven','👫 Odd & even'],['shapes','🔷 Shapes'],['patterns','🔁 Patterns'],['puzzles','🧩 Puzzles']];
const OBJ = ['🍎','⭐','🐟','🧁','🌸','🐞','🎈','🍓','🐥','🚗','🦋','🍪'];
const NUMW20 = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
function renderMathLearn(tab){
  tab = tab || renderMathLearn.tab || 'count'; renderMathLearn.tab = tab;
  setResume({page:'lesson', subject:'math'});
  show(`${crumbs('Math', "openSubject('math')")}
  <section class="panel"><div class="section-title"><h1>🧮 Math playground</h1><button class="btn small gold" onclick="startQuiz('math')">📝 Math quiz</button></div>
    <div class="tabs">${MATH_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" onclick="renderMathLearn('${k}')">${l}</button>`).join('')}</div>
    <div id="mathZone"></div></section>`);
  ({count:mCount, add:mAdd, sub:mSub, skip:mSkip, compare:mCompare, oddeven:mOddEven, shapes:mShapes, patterns:mPatterns, puzzles:mPuzzles})[tab]();
}
const MZ = html => { document.getElementById('mathZone').innerHTML = html; };
const tip = (text, say) => `<div class="math-tip">${speakBtn(say || text)}<span>💡 ${text}</span></div>`;
function mathWin(btn, z, msg){
  recordResult('math', true, btn);
  const c = pick(cheers), fb = z.querySelector('.m-fb'); if (fb){ fb.className = 'feedback good m-fb'; fb.textContent = '🌟 ' + c + (msg ? ' ' + msg : ''); }
  speak(c + (msg ? ' ' + msg : ''), {quiet:true});
  const n = z.querySelector('.m-next'); if (n){ n.classList.add('primary'); n.focus({preventScroll:true}); }
}
/* A multiple-choice round. gen() returns {q, say, visual, opts:[string|{label,html}], ans, explain, after(z), hideOpts} */
function mathRound(zoneId, gen){
  const z = document.getElementById(zoneId); if (!z) return;
  const r = gen();
  z.innerHTML = `<div class="question">${speakBtn(r.say || r.q)}<h2>${esc(r.q)}</h2></div><div class="m-vis">${r.visual || ''}</div><div class="m-help"></div>
    <div class="choice-grid m-opts" ${r.hideOpts ? 'hidden' : ''}></div><p class="feedback m-fb" aria-live="polite"></p><button class="btn big m-next">Next →</button>`;
  z.querySelector('.m-next').onclick = () => { stopSpeaking(); mathRound(zoneId, gen); };
  let done = false;
  r.opts.forEach(o => {
    const label = typeof o === 'object' ? o.label : String(o);
    const b = document.createElement('button'); b.className = 'choice' + (!/[A-Za-z0-9]/.test(label) && !(typeof o === 'object' && o.html) ? ' emoji-choice' : ''); b.innerHTML = typeof o === 'object' && o.html ? o.html : esc(label); b.setAttribute('aria-label', label);
    b.onclick = () => {
      if (done) return;
      if (label === String(r.ans)){ done = true; b.classList.add('good'); mathWin(b, z, r.explain); }
      else { b.classList.add('bad'); b.disabled = true; Sfx.bad(); const fb = z.querySelector('.m-fb'); fb.className = 'feedback bad m-fb'; fb.textContent = '💜 ' + pick(tryAgains) + ' Try again!'; speak(pick(tryAgains) + ' Try again.', {quiet:true}); }
    };
    z.querySelector('.m-opts').append(b);
  });
  if (r.after) r.after(z);
  if (voicePrefs.autoRead && !r.noAutoRead) speak(r.say || r.q, {quiet:true});
}
function numOpts(ans, n = 3, min = 0){ const s = new Set([ans]); for (const d of shuffle([1, -1, 2, -2, 3, -3])){ if (s.size >= n) break; if (ans + d >= min) s.add(ans + d); } return shuffle([...s]).map(String); }
const emo = (e, n) => Array.from({length:n}, () => `<span class="m-obj">${e}</span>`).join('');
function numberLine(max, pos){ return `<div class="nline"><div class="nl-track">${Array.from({length:max + 1}, (_, i) => `<span class="nl-tick" style="left:${i / max * 100}%"><b>${i}</b></span>`).join('')}<span class="frog" style="left:${pos / max * 100}%">🐸</span></div></div>`; }

/* ---------- Counting ---------- */
const MC = {max:10};
function mCount(){
  MZ(`${tip('Touch each thing one time and say the number. The last number tells how many!')}
    <h2>👆 Tap to count</h2><div class="seg" style="max-width:340px">${[[10,'Up to 10'],[20,'Up to 20']].map(([m, l]) => `<button class="${MC.max === m ? 'active' : ''}" onclick="MC.max=${m};mCount()">${l}</button>`).join('')}</div>
    <div id="tapCount"></div>
    <h2 style="margin-top:22px">🔟 Ten frame</h2><p class="muted">Tap a box to add a ladybug. Tap again to take it away.</p>
    <div class="body-wrap"><div><div class="ten-frame" id="tenFrame">${Array.from({length:10}, (_, i) => `<button aria-label="Box ${i + 1}" onclick="tenTap(${i})"></button>`).join('')}</div>
      <div class="row-buttons"><button class="btn small" onclick="tenSet(0)">Clear</button><button class="btn small" onclick="tenSet(${rand(1, 9)})">Surprise me</button></div></div>
      <div class="fact" style="text-align:center"><div class="big-number" id="tenNum">0</div><p id="tenWords" style="font-size:22px;font-weight:800"></p></div></div>
    <h2 style="margin-top:22px">🔍 Find the number</h2><div id="chartGame"></div>`);
  tapCount(); tenSet(0, true); chartGame();
}
function tapCount(){
  const z = document.getElementById('tapCount'); if (!z) return;
  const n = rand(3, MC.max), e = pick(OBJ); let c = 0;
  z.innerHTML = `<p style="font-size:20px">How many ${e}? Tap each one!</p><div class="count-field">${Array.from({length:n}, (_, i) => `<button class="count-obj" aria-label="item ${i + 1}">${e}</button>`).join('')}</div>
    <p class="big-number" style="font-size:48px" id="cNum">0</p><p class="feedback m-fb"></p><button class="btn m-next" onclick="tapCount()">New set →</button>`;
  z.querySelectorAll('.count-obj').forEach(b => b.onclick = () => {
    if (b.classList.contains('counted')) return speak('You already counted that one!', {quiet:true});
    c++; b.classList.add('counted'); b.insertAdjacentHTML('beforeend', `<i>${c}</i>`); z.querySelector('#cNum').textContent = c; Sfx.pop();
    if (c === n){ speak(`${NUMW20[c] || c}! There are ${n}!`, {quiet:true}); setTimeout(() => mathWin(b, z, `There are ${n}.`), 900); }
    else speak(NUMW20[c] || String(c), {quiet:true, gap:0});
  });
}
function chartGame(){
  const z = document.getElementById('chartGame'); if (!z) return;
  const max = MC.max === 10 ? 30 : 100, t = rand(1, max);
  z.innerHTML = `<div class="question"><button class="speak-btn" onclick="speak('Find ${t}')">🔊</button><h2>Find <span style="color:var(--purple)">${t}</span> on the chart!</h2></div>
    <div class="hundred">${Array.from({length:max}, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div><p class="feedback m-fb"></p>`;
  z.querySelectorAll('.hundred button').forEach(b => b.onclick = () => {
    const v = +b.dataset.n;
    if (v === t){ b.classList.add('hit'); mathWin(b, z, `You found ${t}!`); setTimeout(chartGame, 1800); }
    else { b.classList.add('miss'); setTimeout(() => b.classList.remove('miss'), 700); Sfx.bad(); speak(`That is ${v}. Find ${t}.`, {quiet:true}); }
  });
  speak(`Find ${t}`, {quiet:true});
}

/* ---------- Adding ---------- */
const MA = {max:10};
function mAdd(){
  MZ(`${tip('Adding means putting groups together. Tap “Put together” or hop with the frog to help!', 'Adding means putting groups together.')}
    <div class="seg" style="max-width:340px">${[[10,'Sums to 10'],[20,'Sums to 20']].map(([m, l]) => `<button class="${MA.max === m ? 'active' : ''}" onclick="MA.max=${m};mAdd()">${l}</button>`).join('')}</div><div id="mathGame"></div>`);
  mathRound('mathGame', () => {
    const a = rand(1, MA.max === 10 ? 6 : 12), b = rand(1, Math.min(MA.max - a, MA.max === 10 ? 5 : 9)), e = pick(OBJ), s = a + b;
    return {q:`${a} + ${b} = ?`, visual:`<div class="m-groups"><div class="m-group">${emo(e, a)}</div><span class="m-op">➕</span><div class="m-group">${emo(e, b)}</div></div>`, opts:numOpts(s), ans:s, explain:`${a} plus ${b} is ${s}.`,
      after: z => {
        const h = z.querySelector('.m-help');
        h.innerHTML = `<div class="row-buttons"><button class="btn small sky">🤝 Put together</button><button class="btn small secondary">🐸 Hop on the number line</button></div><div class="m-helper"></div>`;
        const [tog, hop] = h.querySelectorAll('button'), area = h.querySelector('.m-helper');
        tog.onclick = () => { z.querySelector('.m-vis').innerHTML = `<div class="m-group joined">${emo(e, s)}</div>`; const spans = [...z.querySelectorAll('.m-vis .m-obj')]; readLines(spans.map((_, i) => NUMW20[i + 1] || String(i + 1)), spans, {gap:60}); };
        hop.onclick = () => {
          let pos = a, hops = 0;
          area.innerHTML = `${numberLine(MA.max, a)}<div class="row-buttons"><button class="btn primary">Hop +1</button><span class="pill" id="hopInfo">Start at ${a}. Hop ${b} times!</span></div>`;
          speak(`Start at ${a}. Hop ${b} times.`, {quiet:true});
          area.querySelector('.btn').onclick = ev => {
            if (hops >= b) return;
            hops++; pos++; const f = area.querySelector('.frog'); f.style.left = (pos / MA.max * 100) + '%'; f.classList.remove('hop'); void f.offsetWidth; f.classList.add('hop'); Sfx.pop();
            area.querySelector('#hopInfo').textContent = hops < b ? `${hops} hop${hops > 1 ? 's' : ''}… on ${pos}` : `🎉 Landed on ${pos}!`;
            speak(hops < b ? String(pos) : `${pos}! ${a} plus ${b} is ${pos}.`, {quiet:true, gap:0});
            if (hops >= b) ev.target.disabled = true;
          };
        };
      }};
  });
}

/* ---------- Take away ---------- */
function mSub(){
  MZ(`${tip('Taking away means some go away. Tap the right number to make them fly away, then count what is left!')}<div id="mathGame"></div>`);
  mathRound('mathGame', () => {
    const a = rand(3, 10), b = rand(1, a - 1), e = pick(OBJ), left = a - b;
    return {q:`${a} − ${b} = ?`, say:`${a} take away ${b}. Tap ${b} to take them away.`, hideOpts:true, noAutoRead:false,
      visual:`<p style="font-size:20px">Tap <b>${b}</b> to take them away!</p><div class="count-field">${Array.from({length:a}, () => `<button class="count-obj">${e}</button>`).join('')}</div>`,
      opts:numOpts(left), ans:left, explain:`${a} take away ${b} leaves ${left}.`,
      after: z => { let taken = 0; z.querySelectorAll('.count-obj').forEach(o => o.onclick = () => {
        if (o.classList.contains('gone') || taken >= b) return;
        taken++; o.classList.add('gone'); Sfx.pop(); speak(`${taken}`, {quiet:true, gap:0});
        if (taken === b){ setTimeout(() => { z.querySelector('.m-opts').hidden = false; z.querySelector('.m-vis p').innerHTML = `<b>${b}</b> flew away! How many are <b>left</b>?`; speak('How many are left?', {quiet:true}); }, 500); }
      }); }};
  });
}

/* ---------- Skip counting ---------- */
const MS = {step:2};
function mSkip(){
  const st = MS.step, max = {2:30, 3:36, 5:60, 10:100}[st];
  MZ(`${tip(`Skip counting by ${st}s means jumping ${st} numbers each time.`)}
    <div class="seg" style="max-width:520px">${[2, 3, 5, 10].map(s => `<button class="${s === st ? 'active' : ''}" onclick="MS.step=${s};mSkip()">by ${s}s</button>`).join('')}</div>
    <h2>🦘 Tap the next number</h2><div class="skip-seq" id="skipSeq">Start: </div>
    <div class="hundred ${max > 60 ? 'h100' : ''}" id="skipChart">${Array.from({length:max}, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="row-buttons"><button class="btn sky" onclick="skipSing()">🎵 Count along</button><button class="btn" onclick="mSkip()">↺ Start over</button></div><p class="feedback m-fb" id="skipFb"></p>
    <h2 style="margin-top:22px">❓ Fill the gap</h2><div id="mathGame"></div>`);
  let next = st; const seq = [];
  document.querySelectorAll('#skipChart button').forEach(b => b.onclick = () => {
    const v = +b.dataset.n; if (b.classList.contains('hit')) return;
    if (v === next){ b.classList.add('hit'); seq.push(v); document.getElementById('skipSeq').textContent = 'Counting: ' + seq.join(', '); Sfx.pop(); speak(String(v), {quiet:true, gap:0}); next += st;
      if (next > max){ const z = document.querySelector('#mathZone'); recordResult('math', true, b); confetti(); document.getElementById('skipFb').className = 'feedback good'; document.getElementById('skipFb').textContent = `🌟 You counted by ${st}s all the way to ${v}!`; setTimeout(() => speak(`Amazing! You counted by ${st}s to ${v}!`, {quiet:true}), 600); } }
    else { b.classList.add('miss'); setTimeout(() => b.classList.remove('miss'), 600); Sfx.bad(); speak(`Not ${v}. Jump ${st} from ${next - st}.`, {quiet:true}); }
  });
  speak(`Count by ${st}s. Tap ${st} first!`, {quiet:true});
  mathRound('mathGame', () => {
    const s = pick([2, 3, 5, 10]), start = s * rand(0, 4) + s, arr = Array.from({length:5}, (_, i) => start + s * i), gap = rand(1, 3);
    return {q:arr.map((x, i) => i === gap ? '__' : x).join(', '), say:`Count by ${s}s. ${arr.map((x, i) => i === gap ? 'what' : x).join(', ')}. What number is missing?`, opts:shuffle([arr[gap], arr[gap] + 1, arr[gap] - 1].map(String)), ans:arr[gap], explain:`Counting by ${s}s: ${arr.join(', ')}.`, noAutoRead:true};
  });
}
function skipSing(){ const st = MS.step, max = {2:30, 3:36, 5:60, 10:100}[st], nums = []; for (let v = st; v <= max; v += st) nums.push(v);
  const btns = nums.map(n => document.querySelector(`#skipChart button[data-n="${n}"]`));
  speak(nums.map(String), {gap:150, onPart: i => { btns.forEach(b => b.classList.remove('sing')); if (i >= 0) btns[i].classList.add('sing'); }}); }

/* ---------- More or less ---------- */
function mCompare(){
  MZ(`${tip('More means a bigger amount. Less means a smaller amount. The hungry alligator always eats the bigger number! 🐊')}
    <h2>👀 Which group?</h2><div id="mathGame"></div><h2 style="margin-top:22px">🐊 Alligator numbers</h2><div id="mathGame2"></div>`);
  mathRound('mathGame', () => {
    const e = pick(OBJ); let a = rand(1, 10), b = rand(1, 10); if (Math.random() < .12) b = a;
    const word = pick(['more', 'less']), ans = a === b ? 'same' : (word === 'more' ? (a > b ? 'left' : 'right') : (a < b ? 'left' : 'right'));
    return {q:`Which group has ${word.toUpperCase()}?`, say:`Which group has ${word}?`, opts:[{label:'left', html:`<div class="m-group">${emo(e, a)}</div>`}, {label:'right', html:`<div class="m-group">${emo(e, b)}</div>`}, {label:'same', html:'🟰 They are the same'}], ans,
      explain:a === b ? `Both have ${a}.` : `${Math.max(a, b)} is more than ${Math.min(a, b)}.`};
  });
  mathRound('mathGame2', () => {
    if (Math.random() < .35){ const n = rand(1, 19), more = Math.random() < .5, ans = more ? n + 1 : n - 1; return {q:`What is 1 ${more ? 'more' : 'less'} than ${n}?`, opts:numOpts(ans), ans, explain:`1 ${more ? 'more' : 'less'} than ${n} is ${ans}.`, noAutoRead:true}; }
    const a = rand(0, 20); let b = rand(0, 20); if (Math.random() < .15) b = a;
    const ans = a > b ? '>' : a < b ? '<' : '=';
    return {q:`${a}  ?  ${b}`, say:`Is ${a} more than, less than, or equal to ${b}?`, visual:`<div class="gator-row"><span>${a}</span><span class="gator-q">❓</span><span>${b}</span></div>`,
      opts:[{label:'>', html:'<b class="sym">&gt;</b> more than'}, {label:'<', html:'<b class="sym">&lt;</b> less than'}, {label:'=', html:'<b class="sym">=</b> equal'}], ans, noAutoRead:true,
      explain:ans === '=' ? `${a} equals ${b}.` : `${a} is ${ans === '>' ? 'more' : 'less'} than ${b}. The alligator eats ${Math.max(a, b)}!`};
  });
}

/* ---------- Odd & even ---------- */
function mOddEven(){
  MZ(`${tip('Even numbers can make pairs with nobody left over. Odd numbers always have one left over!')}
    <h2>🧦 Pair the socks</h2><div id="pairGame"></div><h2 style="margin-top:22px">🔢 Odd or even?</h2><div id="mathGame"></div>`);
  pairGame();
  mathRound('mathGame', () => { const n = rand(1, 30), ans = n % 2 ? 'Odd' : 'Even'; return {q:`Is ${n} odd or even?`, opts:['Odd', 'Even'], ans, explain:`${n} is ${ans.toLowerCase()}. ${ans === 'Even' ? 'Even numbers end in 0, 2, 4, 6 or 8.' : 'Odd numbers end in 1, 3, 5, 7 or 9.'}`, noAutoRead:true}; });
}
const PAIR_COLORS = ['#ffd6e7','#d9f0ff','#e3f8ec','#fff1c2','#ece2ff','#ffe1d3','#d6f4ec'];
function pairGame(){
  const z = document.getElementById('pairGame'); if (!z) return;
  const n = rand(4, 12), e = pick(['🧦','🧤','👟','🐟','🍒','🐧']); let sel = null, pairs = 0;
  z.innerHTML = `<p style="font-size:20px">Tap two ${e} to make a pair. Can every one find a partner?</p><div class="count-field">${Array.from({length:n}, () => `<button class="count-obj">${e}</button>`).join('')}</div>
    <div class="choice-grid" id="oeOpts" hidden><button class="choice" data-v="Even">👫 Even, everyone has a partner</button><button class="choice" data-v="Odd">🙋 Odd, one is left over</button></div><p class="feedback m-fb"></p><button class="btn m-next" onclick="pairGame()">New socks →</button>`;
  speak(`Tap two to make a pair. Can every one find a partner?`, {quiet:true});
  const items = [...z.querySelectorAll('.count-obj')];
  const check = () => { const free = items.filter(i => !i.dataset.p); if (free.length < 2){ z.querySelector('#oeOpts').hidden = false; speak(`${n}. Is ${n} odd or even?`, {quiet:true}); } };
  items.forEach(it => it.onclick = () => {
    if (it.dataset.p) return;
    if (!sel){ sel = it; it.classList.add('picked'); Sfx.tap(); return; }
    if (sel === it){ sel.classList.remove('picked'); sel = null; return; }
    const c = PAIR_COLORS[pairs % PAIR_COLORS.length]; pairs++;
    [sel, it].forEach(x => { x.dataset.p = pairs; x.classList.remove('picked'); x.classList.add('paired'); x.style.background = c; x.insertAdjacentHTML('beforeend', `<i>${pairs}</i>`); });
    sel = null; Sfx.pop(); speak(`${pairs} pair${pairs > 1 ? 's' : ''}`, {quiet:true, gap:0}); check();
  });
  z.querySelectorAll('#oeOpts .choice').forEach(b => b.onclick = () => {
    const ans = n % 2 ? 'Odd' : 'Even';
    if (b.dataset.v === ans){ b.classList.add('good'); z.querySelectorAll('#oeOpts .choice').forEach(x => x.disabled = true); mathWin(b, z, `${n} is ${ans.toLowerCase()}! ${ans === 'Odd' ? 'One is left over.' : 'Everyone has a partner.'}`); }
    else { b.classList.add('bad'); b.disabled = true; Sfx.bad(); speak('Look again. Is one left over?', {quiet:true}); }
  });
}

/* ---------- Shapes ---------- */
const polyPts = (n, r = 44, rot = -90) => Array.from({length:n}, (_, i) => { const a = (rot + i * 360 / n) * Math.PI / 180; return `${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
const SHAPES = {
  circle:{sides:0, corners:0, ex:'⚽ a ball, 🍪 a cookie', d:'<circle cx="50" cy="50" r="42"/>'},
  oval:{sides:0, corners:0, ex:'🥚 an egg', d:'<ellipse cx="50" cy="50" rx="45" ry="30"/>'},
  triangle:{sides:3, corners:3, ex:'🍕 a pizza slice', d:'<polygon points="50,8 94,88 6,88"/>'},
  square:{sides:4, corners:4, ex:'🪟 a window, 🧇 a waffle', d:'<rect x="12" y="12" width="76" height="76" rx="2"/>'},
  rectangle:{sides:4, corners:4, ex:'🚪 a door, 📱 a phone', d:'<rect x="4" y="24" width="92" height="52" rx="2"/>'},
  diamond:{sides:4, corners:4, ex:'🪁 a kite', d:'<polygon points="50,4 88,50 50,96 12,50"/>'},
  pentagon:{sides:5, corners:5, ex:'🏠 the front of a house', d:`<polygon points="${polyPts(5)}"/>`},
  hexagon:{sides:6, corners:6, ex:'🐝 a honeycomb', d:`<polygon points="${polyPts(6, 45, 0)}"/>`},
  octagon:{sides:8, corners:8, ex:'🛑 a stop sign', d:`<polygon points="${polyPts(8, 45, -67.5)}"/>`},
  star:{sides:10, corners:10, ex:'⭐ stars in a drawing', d:`<polygon points="${Array.from({length:10}, (_, i) => { const r = i % 2 ? 19 : 46, a = (-90 + i * 36) * Math.PI / 180; return `${(50 + r * Math.cos(a)).toFixed(1)},${(54 + r * Math.sin(a)).toFixed(1)}`; }).join(' ')}"/>`},
  heart:{sides:null, corners:1, ex:'❤️ a valentine', d:'<path d="M50 90 C10 62 4 38 18 24 C30 12 46 18 50 32 C54 18 70 12 82 24 C96 38 90 62 50 90 Z"/>'}
};
const SHAPE_COLORS = ['#ff6fae','#4f9dff','#3cc48a','#ffc23d','#a77bf3','#ff8a5b','#2fc2c9'];
function shapeSVG(name, color, size = 90){ return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="shape-svg" aria-hidden="true"><g fill="${color}" stroke="#3b2a4a" stroke-width="3" stroke-linejoin="round">${SHAPES[name].d}</g></svg>`; }
function shapeFacts(n){ const s = SHAPES[n]; return s.sides === null ? `A heart has curvy sides.` : s.sides === 0 ? `A ${n} is round. It has no sides and no corners.` : `A ${n} has ${s.sides} sides and ${s.corners} corners.`; }
function mShapes(){
  MZ(`${tip('Count the sides (the straight lines) and the corners (where two sides meet).')}
    <div class="grid lesson-grid shape-cards">${Object.keys(SHAPES).map((n, i) => `<button class="lesson-card shape-card" onclick="${sayAttr(`${n}. ${shapeFacts(n)} Like ${SHAPES[n].ex.replace(/\p{Extended_Pictographic}/gu, '')}.`)}">${shapeSVG(n, SHAPE_COLORS[i % SHAPE_COLORS.length], 84)}<h3>${n[0].toUpperCase() + n.slice(1)}</h3><small>${SHAPES[n].sides === null ? 'curvy sides' : SHAPES[n].sides === 0 ? 'no sides · no corners' : `${SHAPES[n].sides} sides · ${SHAPES[n].corners} corners`}</small><small>Like ${SHAPES[n].ex}</small></button>`).join('')}</div>
    <h2 style="margin-top:22px">🎯 Shape game</h2><div id="mathGame"></div>`);
  mathRound('mathGame', () => {
    const names = Object.keys(SHAPES);
    if (Math.random() < .5){
      const t = pick(names), opts = shuffle([t, ...shuffle(names.filter(n => n !== t)).slice(0, 3)]);
      return {q:`Tap the ${t}!`, opts:opts.map((n, i) => ({label:n, html:shapeSVG(n, SHAPE_COLORS[i % SHAPE_COLORS.length], 80)})), ans:t, explain:shapeFacts(t)};
    }
    const t = pick(names.filter(n => SHAPES[n].sides > 0 && SHAPES[n].sides <= 8));
    return {q:'How many sides does this shape have?', visual:`<div style="margin:8px 0">${shapeSVG(t, pick(SHAPE_COLORS), 130)}</div>`, opts:numOpts(SHAPES[t].sides, 3, 3), ans:SHAPES[t].sides, explain:`It is a ${t}. ${shapeFacts(t)}`};
  });
}

/* ---------- Patterns ---------- */
const PAT_SETS = [['🔴','🔵','🟢'],['🍎','🍌','🍇'],['⭐','🌙','☀️'],['🐶','🐱','🐰'],['🟥','🟨','🟦'],['❤️','💛','💜'],['🔺','⚪','🟩']];
const PAT_UNITS = [[0,1],[0,0,1],[0,1,1],[0,1,2],[0,0,1,1]];
function mPatterns(){
  MZ(`${tip('A pattern repeats again and again. Say it out loud to hear the pattern!')}
    <h2>➡️ What comes next?</h2><div id="mathGame"></div>
    <h2 style="margin-top:22px">🎨 Make your own pattern</h2><p class="muted">Tap the pictures to build a pattern. I’ll tell you when it repeats!</p>
    <div class="pat-build" id="patBuild"></div><div class="row-buttons" id="patPick">${['🔴','🔵','🟢','🟡','⭐','❤️','🐱','🍎'].map(x => `<button class="tool-btn" style="width:58px">${x}</button>`).join('')}<button class="btn small warn" id="patClear">Clear</button></div><p class="feedback" id="patFb"></p>`);
  mathRound('mathGame', () => {
    const set = pick(PAT_SETS), unit = pick(PAT_UNITS), len = unit.length * 2 + rand(1, unit.length), seq = Array.from({length:len + 1}, (_, i) => set[unit[i % unit.length]]);
    const missingMid = Math.random() < .35, hole = missingMid ? rand(1, len - 1) : len;
    const show = seq.slice(0, missingMid ? len : len).map((x, i) => i === hole ? '❓' : x).concat(missingMid ? [] : ['❓']);
    const ans = seq[hole], opts = shuffle([...new Set([ans, ...set])]);
    return {q:missingMid ? 'Which one is missing?' : 'What comes next?', visual:`<div class="q-visual">${show.join(' ')}</div>`, opts, ans, explain:'The pattern keeps repeating.'};
  });
  const seq = [], build = document.getElementById('patBuild'), fb = document.getElementById('patFb');
  const draw = () => { build.innerHTML = seq.map(x => `<span>${x}</span>`).join('') || '<span class="tiny">Your pattern goes here</span>'; };
  draw();
  document.querySelectorAll('#patPick .tool-btn').forEach(b => b.onclick = () => {
    if (seq.length >= 12) return; seq.push(b.textContent); draw(); Sfx.pop();
    for (let k = 2; k <= 4; k++){
      if (seq.length >= k * 2 && seq.every((x, i) => x === seq[i % k]) && new Set(seq.slice(0, k)).size > 1){
        const name = seq.slice(0, k).map(x => String.fromCharCode(65 + [...new Set(seq.slice(0, k))].indexOf(x))).join('');
        fb.className = 'feedback good'; fb.textContent = `🌟 You made a pattern! It goes ${name} ${name}…`;
        if (seq.length === k * 2){ recordResult('math', true, build); speak(`You made a pattern! ${name.split('').join(' ')}, ${name.split('').join(' ')}.`, {quiet:true}); }
        return;
      }
    }
    fb.className = 'feedback'; fb.textContent = seq.length >= 4 ? 'Keep going! Try repeating the same pictures again.' : '';
  });
  document.getElementById('patClear').onclick = () => { seq.length = 0; draw(); fb.textContent = ''; };
}

/* ---------- Puzzles ---------- */
function mPuzzles(){
  MZ(`${tip('Puzzles make your brain strong! Take your time and use your fingers to help.')}
    <h2>🔟 Make 10</h2><p class="muted">Tap two cards that add up to 10.</p><div id="make10"></div>
    <h2 style="margin-top:22px">🏠 Number bond houses</h2><div id="mathGame"></div>`);
  make10();
  mathRound('mathGame', () => {
    const whole = rand(3, 10), p1 = rand(1, whole - 1), p2 = whole - p1, hide = pick(['whole', 'p1', 'p2']);
    const v = {whole, p1, p2}, ans = v[hide];
    const box = k => `<div class="bond-box ${k === hide ? 'q' : ''}">${k === hide ? '?' : v[k]}</div>`;
    const visual = `<div class="bond"><div class="bond-roof">${box('whole')}</div><div class="bond-legs"><span></span><span></span></div><div class="bond-parts">${box('p1')}${box('p2')}</div></div>`;
    const sentence = hide === 'whole' ? `${p1} + ${p2} = ?` : hide === 'p1' ? `? + ${p2} = ${whole}` : `${p1} + ? = ${whole}`;
    return {q:sentence, say:hide === 'whole' ? `${p1} and ${p2} make what?` : `What number and ${hide === 'p1' ? p2 : p1} make ${whole}?`, visual, opts:numOpts(ans), ans, explain:`${p1} and ${p2} make ${whole}.`};
  });
}
function make10(){
  const z = document.getElementById('make10'); if (!z) return;
  const pairs = shuffle([[1, 9], [2, 8], [3, 7], [4, 6], [5, 5], [0, 10]]).slice(0, 4);
  const cards = shuffle(pairs.flat()); let sel = null, found = 0;
  z.innerHTML = `<div class="make10">${cards.map(n => `<button class="m10" data-n="${n}">${n}</button>`).join('')}</div><p class="feedback m-fb"></p><button class="btn m-next" onclick="make10()">New cards →</button>`;
  z.querySelectorAll('.m10').forEach(b => b.onclick = () => {
    if (b.classList.contains('done')) return;
    if (!sel){ sel = b; b.classList.add('picked'); Sfx.tap(); return; }
    if (sel === b){ b.classList.remove('picked'); sel = null; return; }
    const a = +sel.dataset.n, c = +b.dataset.n;
    if (a + c === 10){ [sel, b].forEach(x => { x.classList.remove('picked'); x.classList.add('done'); }); found++; Sfx.good(); speak(`${a} and ${c} make 10!`, {quiet:true});
      if (found === pairs.length) setTimeout(() => { confetti(); mathWin(b, z, 'You made 10 every time!'); }, 900); }
    else { sel.classList.remove('picked'); b.classList.add('miss'); setTimeout(() => b.classList.remove('miss'), 600); Sfx.bad(); speak(`${a} and ${c} make ${a + c}. Try again!`, {quiet:true}); }
    sel = null;
  });
}

/* Richer quiz questions (used by the Math quiz and the daily routine) */
function mathItem(forced){
  const E = pick(OBJ), type = forced || pick(['add','add','sub','count','compare','next','skip','oddeven','shape','pattern','bond','moreless']);
  if (type === 'add'){ const a = rand(1, 6), b = rand(1, 4); return {q:`${a} + ${b} = ?`, visual:`${E.repeat(a)} ➕ ${E.repeat(b)}`, choices:numChoices(a + b), a:String(a + b), explain:`${a} plus ${b} equals ${a + b}.`}; }
  if (type === 'sub'){ const a = rand(3, 9), b = rand(1, a - 1); return {q:`${a} − ${b} = ?`, visual:E.repeat(a), say:`${a} take away ${b}. How many are left?`, choices:numChoices(a - b), a:String(a - b), explain:`${a} take away ${b} leaves ${a - b}.`}; }
  if (type === 'count'){ const n = rand(3, 12); return {q:'How many can you count?', visual:E.repeat(n), choices:numChoices(n), a:String(n), explain:`There are ${n}.`}; }
  if (type === 'compare'){ const a = rand(1, 20); let b = rand(1, 20); while (b === a) b = rand(1, 20); return {q:'Which number is bigger?', choices:[String(a), String(b)], a:String(Math.max(a, b)), explain:`${Math.max(a, b)} is bigger than ${Math.min(a, b)}.`}; }
  if (type === 'skip'){ const s = pick([2, 5, 10]), st = s * rand(1, 3), arr = [st, st + s, st + 2 * s]; return {q:`Count by ${s}s: ${arr.join(', ')}, __`, say:`Count by ${s}s. ${arr.join(', ')}. What comes next?`, choices:shuffle([st + 3 * s, st + 3 * s + 1, st + 3 * s - 1].map(String)), a:String(st + 3 * s), explain:`${arr.join(', ')}, ${st + 3 * s}.`}; }
  if (type === 'oddeven'){ const n = rand(1, 20), a = n % 2 ? 'odd' : 'even'; return {q:`Is ${n} odd or even?`, choices:['odd', 'even'], a, explain:`${n} is ${a}.`}; }
  if (type === 'shape'){ const t = pick(['triangle','square','rectangle','pentagon','hexagon','octagon']); return {q:'How many sides does this shape have?', html:`<div style="margin:8px 0">${shapeSVG(t, pick(SHAPE_COLORS), 120)}</div>`, choices:numChoices(SHAPES[t].sides), a:String(SHAPES[t].sides), explain:`It is a ${t}. ${shapeFacts(t)}`}; }
  if (type === 'pattern'){ const set = pick(PAT_SETS), u = pick(PAT_UNITS), seq = Array.from({length:u.length * 2 + 1}, (_, i) => set[u[i % u.length]]), ans = seq.pop(); return {q:'What comes next?', visual:seq.join(' ') + ' ❓', say:'Look at the pattern. What comes next?', choices:shuffle([...new Set([ans, ...set])]), a:ans, explain:'The pattern repeats.'}; }
  if (type === 'bond'){ const w = rand(4, 10), p = rand(1, w - 1); return {q:`${p} + ? = ${w}`, say:`What number and ${p} make ${w}?`, choices:numChoices(w - p), a:String(w - p), explain:`${p} and ${w - p} make ${w}.`}; }
  if (type === 'moreless'){ const n = rand(2, 19), m = Math.random() < .5, a = m ? n + 1 : n - 1; return {q:`What is 1 ${m ? 'more' : 'less'} than ${n}?`, choices:numChoices(a), a:String(a), explain:`1 ${m ? 'more' : 'less'} than ${n} is ${a}.`}; }
  const n = rand(1, 18); return {q:`What number comes after ${n}?`, choices:numChoices(n + 1), a:String(n + 1), explain:`After ${n} comes ${n + 1}.`};
}

/* ---------- Reusable activity engines: sort it, match it, put in order ---------- */
const sw = c => `<span class="swatch-dot" style="background:${c}"></span>`;
const flagImg = (iso2, w = 80) => `<img class="flag-img" src="https://flagcdn.com/w${w}/${iso2.toLowerCase()}.png" alt="flag" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${iso2.toUpperCase()}'}))">`;
function engineDone(z, subject, msg){
  recordResult(subject, true, z); confetti(22); Sfx.win();
  const fb = z.querySelector('.e-fb'); if (fb){ fb.className = 'feedback good e-fb'; fb.textContent = '🏆 ' + msg; }
  speak(msg, {quiet:true});
  const again = z.querySelector('.e-again'); if (again) again.classList.add('primary');
}
/* SORT: one item at a time, tap the bin it belongs in */
function sortGame(zoneId, subject, set){
  const z = document.getElementById(zoneId); if (!z) return;
  const items = shuffle(set.items).slice(0, set.n || 6); let i = 0, mistakes = 0;
  z.innerHTML = `<div class="question">${speakBtn(set.say || set.title)}<h2>${esc(set.title)}</h2></div>
    <div class="sort-item" id="${zoneId}Item"></div>
    <div class="sort-bins">${set.bins.map((b, k) => `<button class="sort-bin" data-k="${k}"><span class="bin-head">${b[1]} ${esc(b[0])}</span><span class="bin-items"></span></button>`).join('')}</div>
    <p class="feedback e-fb" aria-live="polite"></p><button class="btn e-again">🔁 Play again</button>`;
  z.querySelector('.e-again').onclick = () => sortGame(zoneId, subject, set);
  const showItem = () => { const it = items[i]; z.querySelector(`#${zoneId}Item`).innerHTML = it ? `<span class="si-emoji">${it[0]}</span><b>${esc(it[1])}</b>` : '🎉'; if (it) speak(it[1], {quiet:true, gap:0}); };
  z.querySelectorAll('.sort-bin').forEach(b => b.onclick = () => {
    const it = items[i]; if (!it) return;
    if (+b.dataset.k === it[2]){
      b.querySelector('.bin-items').insertAdjacentHTML('beforeend', `<span>${it[0]}</span>`); b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 400); Sfx.pop(); i++;
      if (i >= items.length) return engineDone(z, subject, mistakes ? 'All sorted! Great job!' : 'All sorted with no mistakes! Amazing!');
      showItem();
    } else { mistakes++; b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 450); Sfx.bad(); const fb = z.querySelector('.e-fb'); fb.className = 'feedback bad e-fb'; fb.textContent = `Hmm, think again! Where does ${it[1]} go?`; speak(`Think again. Where does ${it[1]} go?`, {quiet:true}); }
  });
  const first = items[0]; z.querySelector(`#${zoneId}Item`).innerHTML = `<span class="si-emoji">${first[0]}</span><b>${esc(first[1])}</b>`;
  if (voicePrefs.autoRead) speak([set.say || set.title, first[1]], {quiet:true});
}
/* MATCH: tap one card on the left, then its partner on the right */
function matchGame(zoneId, subject, set){
  const z = document.getElementById(zoneId); if (!z) return;
  const pairs = shuffle(set.pairs).slice(0, set.n || 5);
  const L = pairs.map((p, k) => ({k, html:p[0], say:p[2] || ''})), R = shuffle(pairs.map((p, k) => ({k, html:p[1], say:p[3] || ''})));
  let sel = null, done = 0;
  z.innerHTML = `<div class="question">${speakBtn(set.say || set.title)}<h2>${esc(set.title)}</h2></div>
    <div class="match-cols"><div class="match-col">${L.map(x => `<button class="match-card" data-side="L" data-k="${x.k}">${x.html}</button>`).join('')}</div><div class="match-col">${R.map(x => `<button class="match-card" data-side="R" data-k="${x.k}">${x.html}</button>`).join('')}</div></div>
    <p class="feedback e-fb" aria-live="polite"></p><button class="btn e-again">🔁 New cards</button>`;
  z.querySelector('.e-again').onclick = () => matchGame(zoneId, subject, set);
  const colors = ['#ffd6e7','#d9f0ff','#e3f8ec','#fff1c2','#ece2ff','#ffe1d3'];
  z.querySelectorAll('.match-card').forEach(c => c.onclick = () => {
    if (c.classList.contains('matched')) return;
    const item = (c.dataset.side === 'L' ? L : R).find(x => x.k === +c.dataset.k); if (item.say) speak(item.say, {quiet:true, gap:0});
    if (!sel || sel.dataset.side === c.dataset.side){ if (sel) sel.classList.remove('picked'); sel = c; c.classList.add('picked'); Sfx.tap(); return; }
    if (sel.dataset.k === c.dataset.k){
      const col = colors[done % colors.length]; [sel, c].forEach(x => { x.classList.remove('picked'); x.classList.add('matched'); x.style.background = col; }); done++; Sfx.good();
      if (done === pairs.length) engineDone(z, subject, 'You matched them all!');
    } else { const a = sel; a.classList.add('no'); c.classList.add('no'); setTimeout(() => { a.classList.remove('no', 'picked'); c.classList.remove('no'); }, 450); Sfx.bad(); }
    sel = null;
  });
  if (voicePrefs.autoRead) speak(set.say || set.title, {quiet:true});
}
/* ORDER: tap the tiles in the right order */
function orderGame(zoneId, subject, set){
  const z = document.getElementById(zoneId); if (!z) return;
  const seq = typeof set.items === 'function' ? set.items() : set.items; let next = 0;
  z.innerHTML = `<div class="question">${speakBtn(set.say || set.title)}<h2>${esc(set.title)}</h2></div>
    <div class="order-line">${seq.map((_, i) => `<span class="order-slot">${i + 1}</span>`).join('')}</div>
    <div class="order-tiles">${shuffle(seq.map((s, i) => ({s, i}))).map(x => `<button class="order-tile" data-i="${x.i}">${x.s[0]}</button>`).join('')}</div>
    <p class="feedback e-fb" aria-live="polite"></p><button class="btn e-again">🔁 Play again</button>`;
  z.querySelector('.e-again').onclick = () => orderGame(zoneId, subject, set);
  const slots = z.querySelectorAll('.order-slot');
  z.querySelectorAll('.order-tile').forEach(t => t.onclick = () => {
    const i = +t.dataset.i;
    if (i === next){ slots[next].innerHTML = seq[i][0]; slots[next].classList.add('filled'); t.classList.add('used'); t.disabled = true; Sfx.pop(); speak(seq[i][1] || '', {quiet:true, gap:0}); next++;
      if (next === seq.length) engineDone(z, subject, set.done || 'Perfect order!'); }
    else { t.classList.add('no'); setTimeout(() => t.classList.remove('no'), 450); Sfx.bad(); const fb = z.querySelector('.e-fb'); fb.className = 'feedback bad e-fb'; fb.textContent = next ? 'Not yet! What comes next?' : 'Not yet! What comes first?'; }
  });
  if (voicePrefs.autoRead) speak(set.say || set.title, {quiet:true});
}

/* ---------- activity data ---------- */
const SORTS = {
  living:{title:'Living or not living?', say:'Is it living or not living? Living things grow, eat and breathe.', bins:[['Living','🌱'],['Not living','🪨']], items:[['🐶','dog',0],['🌳','tree',0],['🐟','fish',0],['🌻','flower',0],['🐦','bird',0],['🧒','child',0],['🍄','mushroom',0],['🪨','rock',1],['🚗','car',1],['⚽','ball',1],['🪑','chair',1],['📱','phone',1],['🧸','teddy bear',1]]},
  float:{title:'Float or sink?', say:'Will it float on the water, or sink to the bottom?', bins:[['Floats','🛟'],['Sinks','⚓']], items:[['🦆','rubber duck',0],['🍃','leaf',0],['🪵','wood',0],['🎈','balloon',0],['🧽','sponge',0],['🍎','apple',0],['🪨','rock',1],['🔑','key',1],['🪙','coin',1],['⚓','anchor',1],['🔩','metal bolt',1],['🧲','magnet',1]]},
  habitats:{title:'Land, water or air?', say:'Where does this animal move around: on land, in water, or in the air?', bins:[['Land','🌳'],['Water','🌊'],['Air','☁️']], items:[['🦁','lion',0],['🐘','elephant',0],['🐇','rabbit',0],['🐍','snake',0],['🐬','dolphin',1],['🐙','octopus',1],['🦈','shark',1],['🐠','fish',1],['🦅','eagle',2],['🦋','butterfly',2],['🐝','bee',2],['🦜','parrot',2]], n:8},
  healthy:{title:'Everyday food or sometimes treat?', say:'Is it an everyday food that helps you grow, or a sometimes treat?', bins:[['Everyday','🥦'],['Sometimes','🍭']], items:[['🍎','apple',0],['🥕','carrot',0],['🥦','broccoli',0],['🍌','banana',0],['🥛','milk',0],['🥚','egg',0],['🍚','rice',0],['🍭','lollipop',1],['🍩','donut',1],['🍟','fries',1],['🥤','soda',1],['🍬','candy',1],['🍰','cake',1]]},
  fruitveg:{title:'Fruit or vegetable?', bins:[['Fruit','🍓'],['Vegetable','🥕']], items:[['🍎','apple',0],['🍌','banana',0],['🍇','grapes',0],['🍓','strawberry',0],['🍉','watermelon',0],['🍊','orange',0],['🥕','carrot',1],['🥦','broccoli',1],['🌽','corn',1],['🥔','potato',1],['🥒','cucumber',1],['🧅','onion',1]]},
  clothes:{title:'Hot day or cold day?', say:'Would you wear it on a hot day or a cold day?', bins:[['Hot day','☀️'],['Cold day','❄️']], items:[['🩳','shorts',0],['🕶️','sunglasses',0],['👒','sun hat',0],['🩴','flip-flops',0],['👗','sundress',0],['🧤','gloves',1],['🧣','scarf',1],['🧥','coat',1],['🥾','boots',1],['🧦','warm socks',1]]},
  warmcool:{title:'Warm color or cool color?', say:'Warm colors feel like fire and sun. Cool colors feel like water and grass.', bins:[['Warm','🔥'],['Cool','💧']], items:[[sw('#e53935'),'red',0],[sw('#fb8c00'),'orange',0],[sw('#fdd835'),'yellow',0],[sw('#ff6f91'),'pink',0],[sw('#1e88e5'),'blue',1],[sw('#43a047'),'green',1],[sw('#8e24aa'),'purple',1],[sw('#26c6da'),'turquoise',1]]},
  nounverb:{title:'Naming word or action word?', say:'Is it a naming word, like dog, or an action word, like run?', bins:[['Naming word','🏷️'],['Action word','🏃']], items:[['🐶','dog',0],['⚽','ball',0],['🏠','house',0],['👩','mom',0],['🍎','apple',0],['🛏️','bed',0],['🏃','run',1],['🤸','jump',1],['🍽️','eat',1],['🎤','sing',1],['🏊','swim',1],['📖','read',1]]},
  oddeven:{title:'Odd or even?', say:'Is the number odd or even?', bins:[['Odd','🙋'],['Even','👫']], items:Array.from({length:20}, (_, i) => [`<b class="big-digit">${i + 1}</b>`, String(i + 1), (i + 1) % 2 ? 0 : 1])},
  vehicles:{title:'Road, water or sky?', say:'Where does it go: on the road, on water, or in the sky?', bins:[['Road','🛣️'],['Water','🌊'],['Sky','☁️']], items:[['🚗','car',0],['🚌','bus',0],['🚲','bike',0],['🚒','fire truck',0],['⛵','sailboat',1],['🚤','speedboat',1],['🛳️','ship',1],['✈️','airplane',2],['🚁','helicopter',2],['🎈','hot air balloon',2]], n:8},
  corners:{title:'Corners or no corners?', bins:[['Has corners','📐'],['No corners','⚪']], items:[]}
};
SORTS.corners.items = [['circle',1],['oval',1],['triangle',0],['square',0],['rectangle',0],['hexagon',0],['star',0],['pentagon',0]].map(([n, b], i) => [shapeSVG(n, SHAPE_COLORS[i % SHAPE_COLORS.length], 70), n, b]);
const MATCHES = {
  babies:{title:'Match each animal to its baby', pairs:[['🐱 cat','kitten'],['🐶 dog','puppy'],['🐄 cow','calf'],['🐑 sheep','lamb'],['🐴 horse','foal'],['🐸 frog','tadpole'],['🦆 duck','duckling'],['🐻 bear','cub'],['🐔 hen','chick 🐥'],['🦘 kangaroo','joey']].map(([a, b]) => [a, b, a.replace(/^\S+ /, ''), b.replace(/ \S+$/, '')])},
  homes:{title:'Match each animal to its home', pairs:[['🐝 bee','hive'],['🐦 bird','nest 🪺'],['🐟 fish','water 🌊'],['🐻 bear','cave'],['🐜 ant','anthill'],['🕷️ spider','web 🕸️'],['🐰 rabbit','burrow'],['🐴 horse','stable'],['🐶 dog','kennel']].map(([a, b]) => [a, b, a.replace(/^\S+ /, ''), b.replace(/ \S+$/, '')])},
  senses:{title:'Match the body part to the sense', pairs:[['👀 eyes','see'],['👂 ears','hear'],['👃 nose','smell'],['👅 tongue','taste'],['✋ skin','touch']].map(([a, b]) => [a, b, a.slice(3), b]), n:5},
  opposites:{title:'Match the opposites', pairs:[['big','small'],['hot','cold'],['up','down'],['happy','sad'],['fast','slow'],['day','night'],['open','closed'],['wet','dry'],['tall','short'],['full','empty'],['loud','quiet']].map(([a, b]) => [a, b, a, b])},
  plurals:{title:'Match one to many', pairs:[['cat','cats'],['box','boxes'],['mouse','mice'],['child','children'],['foot','feet'],['baby','babies'],['man','men'],['tooth','teeth']].map(([a, b]) => [`one ${a}`, `two ${b}`, `one ${a}`, `two ${b}`])},
  rhymepairs:{title:'Match the rhyming words', pairs:[['cat','hat'],['sun','fun'],['star','car'],['cake','lake'],['bee','tree'],['frog','log'],['bug','rug'],['moon','spoon'],['fish','dish'],['king','ring']].map(([a, b]) => [a, b, a, b])},
  jobs:{title:'Match the helper to their tool', pairs:[['🧑‍⚕️ doctor','🩺'],['🧑‍🍳 chef','🍳'],['🧑‍🚒 firefighter','🚒'],['🧑‍🌾 farmer','🚜'],['🧑‍🏫 teacher','📚'],['🧑‍✈️ pilot','✈️'],['🧑‍🎨 artist','🎨'],['👮 police officer','🚓'],['🧑‍🚀 astronaut','🚀']].map(([a, b]) => [a, `<span class="big-emo">${b}</span>`, a.replace(/^\S+ /, ''), ''])},
  weather:{title:'Match the weather to what you need', pairs:[['☀️ sunny','🕶️ sunglasses'],['🌧️ rainy','☂️ umbrella'],['❄️ snowy','🧤 gloves'],['🌬️ windy','🪁 kite'],['🌊 beach day','🩱 swimsuit']].map(([a, b]) => [a, b, a.slice(3), b.slice(3)])},
  colormix:{title:'Match the paint mix to the new color', pairs:[[`${sw('#e53935')}+${sw('#fdd835')}`,'orange'],[`${sw('#1e88e5')}+${sw('#fdd835')}`,'green'],[`${sw('#e53935')}+${sw('#1e88e5')}`,'purple'],[`${sw('#e53935')}+${sw('#ffffff')}`,'pink'],[`${sw('#222')}+${sw('#ffffff')}`,'gray']].map(([a, b]) => [a, b, '', b])},
  chess:{title:'Match the chess piece to its name', pairs:[['♔','King'],['♕','Queen'],['♖','Rook'],['♗','Bishop'],['♘','Knight'],['♙','Pawn']].map(([a, b]) => [`<span class="big-emo">${a}</span>`, b, b, b])},
  dots:{title:'Match the number to the dots', pairs:Array.from({length:10}, (_, i) => [`<b class="big-digit">${i + 1}</b>`, `<span class="dots">${'●'.repeat(i + 1)}</span>`, String(i + 1), ''])},
  shapeobj:{title:'Match the shape to something real', pairs:[['circle','⚽'],['triangle','🍕'],['rectangle','🚪'],['octagon','🛑'],['hexagon','🐝'],['star','🌟'],['heart','❤️'],['oval','🥚']].map(([n, e], i) => [shapeSVG(n, SHAPE_COLORS[i % SHAPE_COLORS.length], 56), `<span class="big-emo">${e}</span>`, n, ''])},
  letters:{title:'Match big letters to small letters', get pairs(){ return ALPHABET.map(([L]) => [`<b class="big-digit">${L}</b>`, `<b class="big-digit">${L.toLowerCase()}</b>`, L, L]); }}
};
const ORDERS = {
  butterfly:{title:'Put the butterfly life cycle in order', items:[['🥚 Egg','egg'],['🐛 Caterpillar','caterpillar'],['🫛 Chrysalis','chrysalis'],['🦋 Butterfly','butterfly']], done:'Egg, caterpillar, chrysalis, butterfly!'},
  plant:{title:'How does a plant grow? Put it in order', items:[['🌰 Seed','seed'],['🌱 Sprout','sprout'],['🪴 Plant','plant'],['🌻 Flower','flower']]},
  chicken:{title:'Put the chicken life cycle in order', items:[['🥚 Egg','egg'],['🐣 Hatching','hatching'],['🐥 Chick','chick'],['🐔 Hen','hen']]},
  planets:{title:'Put the planets in order from the Sun', items:() => planets.map(p => [`${planetPicture(p.name).replace('class="planet-picture"', 'class="planet-mini"')}<small>${p.name}</small>`, p.name])},
  days:{title:'Put the days of the week in order', items:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => [d, d])},
  seasons:{title:'Put the seasons in order', items:[['🌸 Spring','spring'],['☀️ Summer','summer'],['🍂 Fall','fall'],['❄️ Winter','winter']]},
  months:{title:'Put these months in order', items:() => { const m = ['January','February','March','April','May','June','July','August','September','October','November','December'], s = rand(0, 7); return m.slice(s, s + 5).map(x => [x, x]); }},
  numbers:{title:'Put the numbers in order, smallest first', items:() => shuffle(Array.from({length:20}, (_, i) => i + 1)).slice(0, 5).sort((a, b) => a - b).map(n => [`<b class="big-digit">${n}</b>`, String(n)])},
  sizes:{title:'Put the animals in order, smallest to biggest', items:[['🐜','ant'],['🐭','mouse'],['🐱','cat'],['🐴','horse'],['🐘','elephant']].map(([e, n]) => [`<span class="big-emo">${e}</span>`, n])},
  abc:{title:'Put the letters in ABC order', items:() => { const s = rand(0, 21); return ALPHABET.slice(s, s + 5).map(([L]) => [`<b class="big-digit">${L}</b>`, L]); }},
  morning:{title:'Put the morning routine in order', items:[['😴 Wake up','wake up'],['🪥 Brush teeth','brush your teeth'],['👕 Get dressed','get dressed'],['🥣 Eat breakfast','eat breakfast'],['🎒 Go to school','go to school']]},
  handwash:{title:'Put the hand-washing steps in order', items:[['💧 Wet hands','wet your hands'],['🧼 Add soap','add soap'],['👐 Scrub 20 seconds','scrub for 20 seconds'],['🚿 Rinse','rinse'],['🧻 Dry','dry your hands']]},
  rainbow:{title:'Put the rainbow colors in order', items:[['red','#e53935'],['orange','#fb8c00'],['yellow','#fdd835'],['green','#43a047'],['blue','#1e88e5'],['purple','#8e24aa']].map(([n, c]) => [`${sw(c)}<small>${n}</small>`, n])},
  story:{title:'Put the story in order', items:() => { const st = pick(illustratedStories); return st.lines.map(l => [`<span class="order-text">${esc(l)}</span>`, l]); }},
  rhymelines:{title:'Put the rhyme lines in order', items:() => { const r = pick(EN_RHYMES.filter(x => x.lines.length <= 6)); return r.lines.slice(0, 4).map(l => [`<span class="order-text">${esc(l)}</span>`, l]); }}
};
/* Which activities each subject's Play page offers (classic = the original mini game) */
const PLAY_SETS = {
  reading:[['classic','🔤 Word builder'],['o:story','📖 Story order'],['m:letters','🔠 Big & small letters'],['m:rhymepairs','🎵 Rhyme match'],['o:abc','🔡 ABC order']],
  math:[['classic','⭐ Count the stars'],['o:numbers','🔢 Number order'],['m:dots','⚫ Numbers & dots'],['s:oddeven','👫 Odd or even'],['m:shapeobj','🔷 Shapes around us']],
  english:[['classic','✏️ Build a sentence'],['m:opposites','↔️ Opposites'],['m:plurals','🐞 One & many'],['s:nounverb','🏷️ Naming or action']],
  science:[['classic','🪐 Planet challenge'],['m:babies','🐣 Animal babies'],['m:homes','🏠 Animal homes'],['s:living','🌱 Living or not'],['s:float','🛟 Float or sink'],['s:habitats','🌊 Land, water, air'],['o:butterfly','🦋 Butterfly cycle'],['o:plant','🌻 Plant growth'],['o:chicken','🐥 Chicken cycle'],['o:planets','☀️ Planet order']],
  body:[['classic','🕵️ Body detective'],['m:senses','👀 Five senses'],['s:healthy','🥦 Healthy food'],['o:handwash','🧼 Wash your hands'],['o:morning','🌅 Morning routine']],
  logic:[['classic','🔁 Finish the pattern'],['s:fruitveg','🍓 Fruit or vegetable'],['o:sizes','🐘 Small to big'],['s:corners','📐 Corners or not'],['s:vehicles','🚗 Road, water, sky']],
  school:[['classic','🎯 Follow directions'],['o:abc','🔡 ABC order'],['o:numbers','🔢 Number order'],['m:shapeobj','🔷 Shapes around us'],['o:morning','🎒 Getting ready']],
  general:[['classic','📅 Calendar game'],['o:days','📆 Days in order'],['o:seasons','🍂 Seasons in order'],['o:months','🗓️ Months in order'],['m:jobs','🧑‍🚒 Community helpers'],['m:weather','☂️ Weather gear'],['s:clothes','🧥 Hot or cold'],['s:vehicles','🚌 Vehicles']],
  geo:[['classic','🏛️ State capitals'],['m:flags','🚩 Flags'],['m:continentAnimals','🦘 Continent animals'],['m:capitals','🌍 World capitals']],
  rhymes:[['classic','🎵 Rhyme time'],['o:rhymelines','📜 Rhyme in order'],['m:rhymepairs','🤝 Rhyming pairs']],
  art:[['classic','🎨 Color detective'],['m:colormix','🧪 Color mixing'],['s:warmcool','🔥 Warm or cool'],['o:rainbow','🌈 Rainbow order']],
  chess:[['classic','♘ Knight jump'],['m:chess','♟️ Piece names']],
  alphabets:[['classic','🔎 Find the letter'],['m:bnPics','🇧🇩 বাংলা pictures'],['m:arPics','🇸🇦 Arabic pictures'],['o:bnVowels','🔤 বাংলা vowels in order'],['o:arOrder','🔤 Arabic letters in order']]
};
function runActivity(zoneId, subject, id){
  const [kind, name] = id.split(':');
  if (kind === 's') return sortGame(zoneId, subject, SORTS[name]);
  if (kind === 'm') return matchGame(zoneId, subject, MATCHES[name]);
  if (kind === 'o') return orderGame(zoneId, subject, ORDERS[name]);
}
/* Play page: a menu of games for the subject */
function renderPlay(key, gameId){
  if (key === 'games') return renderGamesHub();
  setResume({page:'play', subject:key});
  const s = subj(key), list = PLAY_SETS[key] || [['classic', playNames[key] || 'Play']];
  const cur = list.some(x => x[0] === gameId) ? gameId : (renderPlay.last && renderPlay.last[key] && list.some(x => x[0] === renderPlay.last[key]) ? renderPlay.last[key] : list[0][0]);
  renderPlay.last = renderPlay.last || {}; renderPlay.last[key] = cur;
  show(`${crumbs(s.title, `openSubject('${key}')`)}
  <section class="panel"><div class="section-title"><h1>🎮 ${esc(s.title)} games</h1><span class="pill" id="playScore">⭐ 0 this game</span></div>
    <div class="tabs game-tabs">${list.map(([id, label]) => `<button class="tab ${id === cur ? 'active' : ''}" onclick="renderPlay('${key}','${id}')">${label}</button>`).join('')}<button class="tab" onclick="renderPlay('${key}', pick(${JSON.stringify(list.map(x => x[0])).replace(/"/g, '&quot;')}.filter(x=>x!=='${cur}')))">🔀 Surprise me</button></div>
    <div id="playZone"></div></section>`);
  playScore = 0;
  if (cur === 'classic') (key === 'alphabets' ? alphaFindPlay() : newPlay(key)); else runActivity('playZone', key, cur);
}
/* Activity chips used on Learn pages */
function activityChips(key, ids){
  const list = (PLAY_SETS[key] || []).filter(x => !ids || ids.includes(x[0]));
  return `<div class="activity-strip"><b>🎮 Try an activity:</b> ${list.map(([id, label]) => `<button class="btn small" onclick="startPlay('${key}','${id}')">${label}</button>`).join('')}</div>`;
}

/* ---------- More content: question banks by topic, stories, rhymes, lessons ---------- */
/* q(topic, question, answer, [wrong answers], explanation, spoken version) */
const q = (t, qq, a, w, explain, say) => ({t, q:qq, a, choices:[a, ...w], explain, say});
const QBANK = {
  english:[
    q('grammar','Which word is an action?','jump',['table','blue'],'Jump is something you can do.'),
    q('grammar','Which word is a thing?','ball',['run','happy'],'A ball is a thing. It is a naming word.'),
    q('grammar','Which word describes something?','fluffy',['eat','door'],'Fluffy is a describing word.'),
    q('grammar','Which word is a place?','park',['sing','soft'],'A park is a place.'),
    q('grammar','Which word is a person?','teacher',['chair','slowly'],'A teacher is a person.'),
    q('punctuation','What goes at the end of a question?','?',['.','!'],'A question ends with a question mark.','What goes at the end of a question? A question mark, a period, or an exclamation mark?'),
    q('punctuation','Which sentence is written correctly?','I like cats.',['i like cats.','i Like cats'],'A sentence starts with a capital letter and ends with a period.'),
    q('punctuation','Which name is written correctly?','Ruhaimah',['ruhaimah','rUHAIMAH'],'Names start with a capital letter.'),
    q('punctuation','Which one shows excitement?','We won!',['We won.','we won'],'An exclamation mark shows excitement!'),
    q('punctuation','Which is a complete sentence?','The cat sleeps.',['cat the','sleeps'],'A sentence tells a whole idea.'),
    q('vowels','Which letter is a vowel?','e',['b','t'],'E is a vowel. The vowels are a, e, i, o, u.'),
    q('vowels','Which letter is NOT a vowel?','m',['a','o'],'M is not a vowel.'),
    q('synonyms','Which word means the same as happy?','glad',['sad','slow'],'Happy and glad mean the same thing.'),
    q('synonyms','Which word means the same as small?','little',['huge','loud'],'Small and little mean the same thing.'),
    q('synonyms','Which word means the same as fast?','quick',['slow','tall'],'Fast and quick mean the same thing.'),
    q('synonyms','Which word means the same as start?','begin',['stop','end'],'Start and begin mean the same thing.'),
    q('spelling','Which word is spelled right?','cat',['kat','catt'],'C, a, t spells cat.'),
    q('spelling','Which word is spelled right?','dog',['dawg','dogg'],'D, o, g spells dog.'),
    q('spelling','Which word is spelled right?','fish',['fisch','fsh'],'F, i, s, h spells fish.'),
    q('spelling','Which word is spelled right?','book',['buk','bok'],'B, o, o, k spells book.'),
    q('spelling','Which word is spelled right?','tree',['trea','tre'],'T, r, e, e spells tree.')
  ],
  science:[
    q('space','Which planet do we live on?','Earth',['Mars','Jupiter'],'We live on Earth.'),
    q('space','Which one is a star?','the Sun',['the Moon','Earth'],'The Sun is a star.'),
    q('space','Which planet has big rings?','Saturn',['Earth','Mars'],'Saturn is famous for its rings.'),
    q('space','Which is the biggest planet?','Jupiter',['Mercury','Earth'],'Jupiter is the biggest planet.'),
    q('space','Which planet is called the red planet?','Mars',['Venus','Neptune'],'Mars looks red.'),
    q('space','What goes around the Earth?','the Moon',['the Sun','Jupiter'],'The Moon travels around Earth.'),
    q('plants','What do plants need to grow?','sunlight and water',['shoes','television'],'Plants need sunlight and water.'),
    q('plants','Which part of a plant drinks water from the soil?','roots',['petals','leaves'],'Roots drink water from the soil.'),
    q('plants','What does a seed grow into?','a plant',['a rock','a bird'],'A seed grows into a plant.'),
    q('animals','What does a caterpillar turn into?','a butterfly',['a frog','a bird'],'A caterpillar becomes a butterfly.'),
    q('animals','Where does a fish live?','in water',['in a tree','in the sky'],'Fish live in water.'),
    q('animals','Which animal has a long trunk?','elephant',['giraffe','zebra'],'An elephant has a long trunk.'),
    q('animals','Which animal can fly?','bird',['dog','cow'],'Birds can fly.'),
    q('animals','What does a cow give us?','milk',['eggs','honey'],'Cows give us milk.'),
    q('animals','What do bees make?','honey',['milk','wool'],'Bees make honey.'),
    q('animals','A baby dog is called a…','puppy',['kitten','calf'],'A baby dog is a puppy.'),
    q('weather','What falls from clouds when it rains?','water drops',['sand','leaves'],'Rain is water falling from clouds.'),
    q('weather','What do you see after rain when the sun shines?','a rainbow',['snow','stars'],'Sunlight and raindrops make a rainbow.'),
    q('weather','What is snow?','frozen water',['hot sand','cotton'],'Snow is frozen water.'),
    q('materials','What is ice?','frozen water',['hot sand','a cloud'],'Ice is frozen water.'),
    q('materials','What does a magnet pull?','paper clips',['paper','wood'],'Magnets pull things made of iron, like paper clips.'),
    q('materials','Which one floats on water?','a rubber duck',['a rock','a key'],'A rubber duck floats.'),
    q('dinosaurs','Are there dinosaurs alive today?','No, they lived long ago',['Yes, in the park','Yes, at school'],'Dinosaurs lived a very long time ago. Birds are their relatives!'),
    q('dinosaurs','How do we learn about dinosaurs?','from fossils',['from TV','from cookies'],'Fossils are bones and footprints left in rocks.'),
    q('dinosaurs','Which dinosaur had three horns?','Triceratops',['T. rex','Stegosaurus'],'Tri means three. Triceratops had three horns.')
  ],
  body:[
    q('senses','What do you use to smell?','nose',['ears','feet'],'You smell with your nose.'),
    q('senses','What do you use to hear?','ears',['eyes','knees'],'You hear with your ears.'),
    q('senses','What do you use to taste?','tongue',['elbow','hair'],'Your tongue tastes food.'),
    q('senses','How many senses do we have?','5',['3','10'],'We have five senses: see, hear, smell, taste and touch.'),
    q('organs','Which part helps you think?','brain',['knee','foot'],'Your brain helps you think.'),
    q('organs','Which part pumps blood?','heart',['stomach','ear'],'Your heart pumps blood.'),
    q('organs','Which part helps you breathe?','lungs',['toes','hair'],'Your lungs help you breathe.'),
    q('bones','What is a skeleton made of?','bones',['water','clouds'],'A skeleton is made of bones.'),
    q('bones','Which bone protects your brain?','skull',['ribs','kneecap'],'Your skull protects your brain.'),
    q('bones','What protects your heart and lungs?','ribs',['toes','hair'],'Your ribs protect your heart and lungs.'),
    q('health','How long should you wash your hands?','20 seconds',['1 second','1 hour'],'Wash for about 20 seconds.'),
    q('health','Which drink is best for your body?','water',['soda','syrup'],'Water is the best drink.'),
    q('health','How often should you brush your teeth?','two times a day',['once a year','never'],'Brush in the morning and before bed.'),
    q('health','Which is a healthy snack?','an apple',['candy','chips'],'An apple is a healthy snack.'),
    q('health','What helps your body grow and rest?','sleep',['screens','sugar'],'Sleep helps you grow and feel good.'),
    q('parts','How many fingers are on one hand?','5',['4','10'],'One hand has five fingers.'),
    q('parts','What do you use to walk?','legs and feet',['ears','nose'],'Legs and feet help you walk.')
  ],
  logic:[
    q('patterns','What comes next? 🔴 🔵 🔴 🔵 🔴 ❓','🔵',['🔴','🟢'],'The pattern repeats red, blue.','Red, blue, red, blue, red. What comes next?'),
    q('patterns','What comes next? ⭐ ⭐ 🌙 ⭐ ⭐ 🌙 ⭐ ❓','⭐',['🌙','☀️'],'Star, star, moon. So after one star comes another star.','Star, star, moon, star, star, moon, star. What comes next?'),
    q('patterns','What comes next? 2, 4, 6, …','8',['7','10'],'We count by twos: 2, 4, 6, 8.','Two, four, six. What comes next?'),
    q('oddone','Which is the odd one out? 🍎 🍌 🚗 🍇','🚗',['🍎','🍇'],'The car is not a fruit.','Apple, banana, car, grapes. Which is the odd one out?'),
    q('oddone','Which is the odd one out? 🐶 🐱 🐰 🌳','🌳',['🐱','🐰'],'The tree is not an animal.','Dog, cat, rabbit, tree. Which is the odd one out?'),
    q('oddone','Which is the odd one out? ✈️ 🚁 🚗 🦅','🚗',['✈️','🦅'],'The car cannot fly.','Airplane, helicopter, car, eagle. Which one cannot fly?'),
    q('size','Which number is the biggest?','9',['4','2'],'Nine is the biggest.'),
    q('size','Which number is the smallest?','3',['7','5'],'Three is the smallest.'),
    q('size','Which animal is the biggest?','🐘',['🐭','🐱'],'The elephant is the biggest.','Which animal is the biggest? Elephant, mouse, or cat?'),
    q('sorting','Which one is a fruit?','🍓',['🥕','🍞'],'A strawberry is a fruit.','Which one is a fruit? Strawberry, carrot, or bread?'),
    q('sorting','Which one belongs in the kitchen?','🍳',['🛏️','🚿'],'A frying pan belongs in the kitchen.','Which one belongs in the kitchen? Frying pan, bed, or shower?'),
    q('sorting','Which one do you wear on your feet?','👟',['🧢','🧤'],'Shoes go on your feet.','Which one do you wear on your feet? Shoes, cap, or gloves?'),
    q('riddles','I have four legs and say “moo”. What am I?','cow',['cat','duck'],'A cow says moo!'),
    q('riddles','I am yellow, I shine in the sky, and I keep you warm. What am I?','the Sun',['the Moon','a banana'],'The Sun shines and keeps us warm.'),
    q('riddles','You can open me and read my pages. What am I?','a book',['a door','a box'],'Books have pages.'),
    q('riddles','I have hands but I cannot clap. What am I?','a clock',['a robot','a tree'],'A clock has hands that point to the time.'),
    q('riddles','I am full of holes but I can hold water. What am I?','a sponge',['a cup','a rock'],'A sponge has holes and soaks up water.'),
    q('shapes','How many sides does a triangle have?','3',['4','5'],'A triangle has three sides.'),
    q('shapes','Which shape has no corners?','circle',['square','triangle'],'A circle has no corners.')
  ],
  school:[
    q('letters','Which letter comes after B?','C',['A','D'],'A, B, C. C comes after B.'),
    q('letters','Which letter comes before F?','E',['G','D'],'E, F. E comes before F.'),
    q('letters','Which word starts with the letter M?','moon',['sun','cat'],'Moon starts with M.'),
    q('numbers','Which number comes after 7?','8',['6','9'],'Seven, eight. Eight comes after seven.'),
    q('numbers','Which number comes before 10?','9',['11','8'],'Nine comes before ten.'),
    q('shapes','Which shape is round?','circle',['square','triangle'],'A circle is round.'),
    q('shapes','How many sides does a square have?','4',['3','5'],'A square has four sides.'),
    q('colors','What color do you get when you mix red and yellow?','orange',['green','purple'],'Red and yellow make orange.'),
    q('colors','What color is grass?','green',['purple','orange'],'Grass is green.'),
    q('habits','What should you do before you answer?','listen carefully',['guess fast','close the screen'],'It is important to listen carefully.'),
    q('habits','After you finish, you should…','check your work',['throw your pencil','skip everything'],'Checking helps you catch mistakes.'),
    q('habits','What do you do if you need help in class?','raise your hand',['shout','hide'],'Raise your hand and ask.'),
    q('money','Which coin is worth 1 cent?','penny',['dime','quarter'],'A penny is worth 1 cent.'),
    q('money','Which coin is worth 10 cents?','dime',['penny','nickel'],'A dime is worth 10 cents.'),
    q('money','Which coin is worth 25 cents?','quarter',['nickel','penny'],'A quarter is worth 25 cents.'),
    q('money','Which coin is worth 5 cents?','nickel',['dime','quarter'],'A nickel is worth 5 cents.')
  ],
  general:[
    q('calendar','How many seasons are there?','4',['2','8'],'There are four seasons: spring, summer, fall and winter.'),
    q('calendar','How many days are in a week?','7',['5','10'],'There are seven days in a week.'),
    q('calendar','How many months are in a year?','12',['7','10'],'There are twelve months in a year.'),
    q('calendar','Which month comes first?','January',['June','December'],'January is the first month of the year.'),
    q('calendar','Which season is the coldest?','winter',['summer','spring'],'Winter is the coldest season.'),
    q('calendar','In which season do leaves fall from trees?','fall',['spring','summer'],'In fall, many leaves change color and fall.'),
    q('weather','What do you use on a rainy day?','an umbrella',['sunglasses','a sled'],'An umbrella keeps you dry.'),
    q('weather','What do you wear on a snowy day?','a warm coat',['shorts','flip-flops'],'A warm coat keeps you cozy.'),
    q('helpers','Who helps us when we are sick?','a doctor',['a pilot','a baker'],'A doctor helps us when we are sick.'),
    q('helpers','Who puts out fires?','a firefighter',['a chef','a farmer'],'Firefighters put out fires.'),
    q('helpers','Who grows our food?','a farmer',['a dentist','a painter'],'Farmers grow food.'),
    q('helpers','Who flies an airplane?','a pilot',['a teacher','a vet'],'A pilot flies the plane.'),
    q('helpers','Who takes care of sick animals?','a vet',['a pilot','a baker'],'A vet is an animal doctor.'),
    q('safety','In the USA, what number do you call in an emergency?','911',['123','000'],'Call 911 in an emergency in the USA.'),
    q('safety','What do you do before crossing the street?','look both ways',['run fast','close your eyes'],'Stop, look left and right, then cross with a grown-up.'),
    q('safety','What do you wear when riding a bike?','a helmet',['a crown','slippers'],'A helmet protects your head.'),
    q('manners','What do you say when someone gives you something?','thank you',['go away','no'],'We say thank you.'),
    q('manners','What do you say when you need something?','please',['hurry','give'],'Please is a magic word.'),
    q('time','When do we usually see stars?','at night',['at lunch','in the morning'],'We see stars at night.'),
    q('time','When do you eat breakfast?','in the morning',['at midnight','at bedtime'],'Breakfast is the morning meal.'),
    q('vehicles','Which one can fly?','an airplane',['a car','a boat'],'An airplane flies in the sky.'),
    q('vehicles','Which one goes on water?','a boat',['a bus','a bike'],'A boat goes on water.')
  ],
  rhymes:[
    q('rhymes','Which rhyme is about a star?','Twinkle, Twinkle, Little Star',['Rain, Rain, Go Away','Humpty Dumpty'],'Twinkle, Twinkle is about a little star.'),
    q('rhymes','Who sat on a wall?','Humpty Dumpty',['Jack','Miss Muffet'],'Humpty Dumpty sat on a wall.'),
    q('rhymes','Where did Jack and Jill go?','up the hill',['to the beach','to school'],'Jack and Jill went up the hill.'),
    q('rhymes','What ran up the clock?','a mouse',['a cat','a dog'],'The mouse ran up the clock.'),
    q('rhymes','How many bags of wool did the black sheep have?','3',['2','5'],'Three bags full!'),
    q('rhymes','What do you row in the song?','a boat',['a car','a bike'],'Row, row, row your boat.'),
    q('rhymes','Who had a little lamb?','Mary',['Jill','Bo'],'Mary had a little lamb.'),
    q('rhymes','In “Hey Diddle Diddle”, what jumped over the moon?','the cow',['the dog','the spoon'],'The cow jumped over the moon!'),
    q('rhymes','Who frightened Miss Muffet?','a spider',['a mouse','a cat'],'A spider sat down beside her.')
  ],
  chess:[
    q('pieces','Which piece moves in an L shape?','Knight ♘',['King ♔','Rook ♖'],'The knight moves in an L shape.'),
    q('pieces','Which piece moves diagonally?','Bishop ♗',['Pawn ♙','Rook ♖'],'The bishop moves diagonally.'),
    q('pieces','Which piece moves in straight lines?','Rook ♖',['Knight ♘','Bishop ♗'],'The rook moves in straight lines.'),
    q('pieces','Which piece can move in every direction, many squares?','Queen ♕',['Pawn ♙','King ♔'],'The queen is the strongest piece.'),
    q('pieces','How far does the king move?','one square',['two squares','across the board'],'The king moves one square at a time.'),
    q('pieces','Which piece can jump over other pieces?','Knight ♘',['Rook ♖','Queen ♕'],'Only the knight can jump.'),
    q('board','How many squares are on a chess board?','64',['20','100'],'A chess board has 64 squares, 8 by 8.'),
    q('board','Which piece starts in the corner?','Rook ♖',['King ♔','Bishop ♗'],'The rooks start in the corners.'),
    q('board','How many pawns does each player have?','8',['2','12'],'Each player has 8 pawns in a row.'),
    q('rules','Which color moves first?','White',['Black','Red'],'White always moves first.'),
    q('rules','What is it called when the king is trapped and the game ends?','checkmate',['checkers','goal'],'Checkmate ends the game!'),
    q('rules','Which piece do you have to protect?','King ♔',['Pawn ♙','Rook ♖'],'Protect your king!')
  ],
  art:[
    q('mixing','Red + yellow makes…','orange',['green','purple'],'Red and yellow make orange.','Red and yellow make what color?'),
    q('mixing','Blue + yellow makes…','green',['orange','pink'],'Blue and yellow make green.','Blue and yellow make what color?'),
    q('mixing','Red + blue makes…','purple',['yellow','brown'],'Red and blue make purple.','Red and blue make what color?'),
    q('mixing','Red + white makes…','pink',['black','blue'],'Red and white make pink.','Red and white make what color?'),
    q('colors','Which are the three primary colors?','red, yellow, blue',['pink, gray, green','black, white, brown'],'Red, yellow and blue are the primary colors.'),
    q('colors','Which is a warm color?','orange',['blue','green'],'Orange feels warm, like the sun.'),
    q('colors','What color is the sky on a sunny day?','blue',['green','black'],'The sky is blue on a sunny day.'),
    q('tools','What do you paint with?','a brush',['a spoon','a shoe'],'We paint with a brush.'),
    q('tools','What do you use to cut paper?','scissors',['a fork','a pillow'],'Scissors cut paper. Use them carefully!'),
    q('music','Which instrument do you hit with sticks?','drum',['flute','violin'],'You hit a drum with sticks.'),
    q('music','Which instrument do you blow into?','flute',['drum','piano'],'You blow into a flute.'),
    q('music','Which instrument has black and white keys?','piano',['guitar','trumpet'],'A piano has black and white keys.'),
    q('shapes','How many sides does a triangle have?','3',['4','5'],'A triangle has three sides.')
  ],
  geo:[
    q('world','How many continents are there?','7',['5','10'],'There are seven continents.'),
    q('world','Which is the biggest ocean?','Pacific',['Atlantic','Indian'],'The Pacific Ocean is the biggest.'),
    q('world','Which is the biggest continent?','Asia',['Europe','Australia'],'Asia is the biggest continent.'),
    q('world','Which continent is the coldest?','Antarctica',['Africa','Asia'],'Antarctica is covered in ice.'),
    q('world','Where do kangaroos live?','Australia',['Europe','Antarctica'],'Kangaroos live in Australia.'),
    q('world','Where do penguins like emperor penguins live?','Antarctica',['Africa','Europe'],'Emperor penguins live in Antarctica.'),
    q('land','What is a big hill with a pointy top called?','mountain',['river','lake'],'A mountain is very tall land.'),
    q('land','What is land with water all around it?','island',['desert','forest'],'An island has water all around.'),
    q('land','What is a very dry, sandy place?','desert',['ocean','rainforest'],'Deserts are dry and sandy.'),
    q('land','What do we call water that flows to the sea?','river',['mountain','cave'],'A river flows to the sea.'),
    q('usa','What is the capital of the USA?','Washington, D.C.',['New York','Texas'],'Washington, D.C. is the capital.'),
    q('usa','How many states are in the USA?','50',['13','100'],'The USA has 50 states.'),
    q('usa','What is the national bird of the USA?','bald eagle',['penguin','parrot'],'The bald eagle is the national bird.'),
    q('bangladesh','What is the capital of Bangladesh?','Dhaka',['Sylhet','Khulna'],'Dhaka is the capital of Bangladesh.'),
    q('bangladesh','What is the national animal of Bangladesh?','Royal Bengal tiger',['elephant','kangaroo'],'The Royal Bengal tiger lives in the Sundarbans.'),
    q('bangladesh','What is the national flower of Bangladesh?','water lily (shapla)',['rose','tulip'],'The shapla, a water lily, is the national flower.'),
    q('bangladesh','What is the national fruit of Bangladesh?','jackfruit',['apple','grapes'],'The jackfruit is the national fruit.'),
    q('bangladesh','What colors are on the flag of Bangladesh?','green and red',['blue and white','black and yellow'],'Green with a red circle.'),
    q('directions','Where does the Sun come up in the morning?','east',['west','under the bed'],'The Sun rises in the east.'),
    q('directions','On a map, which way is usually up?','north',['south','down'],'North is usually at the top of a map.')
  ]
};

/* Generated questions (fresh every time) */
const GEN = {
  english:[
    ['opposites', () => { const p = pick(MATCHES.opposites.pairs), o = shuffle(MATCHES.opposites.pairs.filter(x => x !== p)).slice(0, 2).map(x => x[1]); return {q:`What is the opposite of ${p[0]}?`, choices:[p[1], ...o], a:p[1], explain:`${p[0]} and ${p[1]} are opposites.`}; }],
    ['plurals', () => { const p = pick([['cat','cats','cates'],['box','boxes','boxs'],['mouse','mice','mouses'],['child','children','childs'],['foot','feet','foots'],['baby','babies','babys'],['bus','buses','busses'],['tooth','teeth','tooths']]); return {q:`One ${p[0]}, two…`, choices:[p[1], p[2], p[0]], a:p[1], explain:`One ${p[0]}, two ${p[1]}.`}; }],
    ['rhyme', () => { const p = pick(MATCHES.rhymepairs.pairs), o = shuffle(['sock','pen','dog','cup','leg','bed','map','box'].filter(w => w !== p[1])).slice(0, 2); return {q:`Which word rhymes with ${p[0]}?`, choices:[p[1], ...o], a:p[1], explain:`${p[0]} and ${p[1]} rhyme.`}; }],
    ['missing', () => { const w = pick(BLEND_WORDS.filter(x => x[0].length === 3 && x[0].every(g => g.length === 1))), word = w[0].join(''), v = w[0][1], others = shuffle('aeiou'.split('').filter(x => x !== v)).slice(0, 2); return {q:`${w[1]}  ${w[0][0]} _ ${w[0][2]}: which letter is missing?`, say:`Which letter is missing in ${word}?`, choices:[v, ...others], a:v, explain:`${word} is spelled ${w[0].join(', ')}.`}; }]
  ],
  science:[
    ['planet order', () => { const i = rand(0, 7); return {q:`Which planet is number ${i + 1} from the Sun?`, choices:[planets[i].name, planets[(i + 2) % 8].name, planets[(i + 5) % 8].name], a:planets[i].name, explain:`The order is ${planets.map(p => p.name).join(', ')}.`}; }],
    ['animal babies', () => { const p = pick(MATCHES.babies.pairs), o = shuffle(MATCHES.babies.pairs.filter(x => x !== p)).slice(0, 2).map(x => x[3]); return {q:`A baby ${p[2]} is called a…`, choices:[p[3], ...o], a:p[3], explain:`A baby ${p[2]} is a ${p[3]}.`}; }],
    ['animal homes', () => { const p = pick(MATCHES.homes.pairs), o = shuffle(MATCHES.homes.pairs.filter(x => x !== p)).slice(0, 2).map(x => x[3]); return {q:`Where does a ${p[2]} live?`, choices:[p[3], ...o], a:p[3], explain:`A ${p[2]} lives in a ${p[3]}.`}; }],
    ['living', () => { const it = pick(SORTS.living.items); return {q:`Is a ${it[1]} living or not living?`, visual:it[0], choices:['living', 'not living'], a:it[2] ? 'not living' : 'living', explain:it[2] ? `A ${it[1]} does not grow or eat.` : `A ${it[1]} is alive. It grows.`}; }]
  ],
  body:[
    ['highlight', () => { const ask = bodyParts.filter(x => x.id !== 'bones'), t = pick(ask); return {q:'Which body part is glowing orange?', html:`<div class="svg-box" style="max-width:280px">${bodySVG(t.id)}</div>`, choices:[t.name, ...shuffle(ask.filter(x => x.id !== t.id)).slice(0, 2).map(x => x.name)], a:t.name, explain:t.fact}; }],
    ['skeleton', () => { const b = pick(BONES); return {q:'Which bone is glowing?', html:`<div class="svg-box skeleton-box" style="max-width:220px">${skeletonSVG(b.id, false)}</div>`, choices:[b.name, ...shuffle(BONES.filter(x => x.id !== b.id)).slice(0, 2).map(x => x.name)], a:b.name, explain:b.fact}; }],
    ['food', () => { const g = pick(SORTS.healthy.items.filter(x => x[2] === 0)), b = shuffle(SORTS.healthy.items.filter(x => x[2] === 1)).slice(0, 2); return {q:'Which is an everyday healthy food?', say:`Which is an everyday healthy food? ${[g, ...b].map(x => x[1]).join(', ')}?`, choices:[`${g[0]} ${g[1]}`, ...b.map(x => `${x[0]} ${x[1]}`)], a:`${g[0]} ${g[1]}`, explain:`${g[1]} helps your body grow strong.`}; }]
  ],
  logic:[
    ['sequence', () => { const set = pick(PAT_SETS), u = pick(PAT_UNITS), seq = Array.from({length:u.length * 2 + 1}, (_, i) => set[u[i % u.length]]), ans = seq.pop(); return {q:'What comes next?', visual:seq.join(' ') + ' ❓', say:'Look at the pattern. What comes next?', choices:[...new Set([ans, ...set])], a:ans, explain:'The pattern repeats.'}; }],
    ['sizes', () => { const s = ORDERS.sizes.items, i = rand(0, s.length - 2), j = rand(i + 1, s.length - 1); const big = Math.random() < .5; return {q:`Which is ${big ? 'bigger' : 'smaller'}?`, say:`Which is ${big ? 'bigger' : 'smaller'}, ${s[i][1]} or ${s[j][1]}?`, choices:[s[i][1], s[j][1]], a:big ? s[j][1] : s[i][1], explain:`A ${s[j][1]} is bigger than a ${s[i][1]}.`}; }]
  ],
  school:[
    ['clock', () => { const h = rand(1, 12); return {q:'What time is it?', html:clockSVG(h, 0, 150), choices:[`${h} o’clock`, `${h % 12 + 1} o’clock`, `${(h + 5) % 12 + 1} o’clock`], a:`${h} o’clock`, explain:`The short hand points to ${h}. It is ${h} o’clock.`}; }],
    ['abc', () => { const i = rand(0, 24), L = ALPHABET[i][0], n = ALPHABET[i + 1][0]; return {q:`Which letter comes after ${L}?`, choices:[n, ALPHABET[(i + 3) % 26][0], ALPHABET[(i + 20) % 26][0]], a:n, explain:`${L}, ${n}.`}; }]
  ],
  general:[
    ['days', () => { const d = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], i = rand(0, 6), after = Math.random() < .6; const a = after ? d[(i + 1) % 7] : d[(i + 6) % 7]; return {q:`Which day comes ${after ? 'after' : 'before'} ${d[i]}?`, choices:[...new Set([a, d[(i + 2) % 7], d[(i + 4) % 7]])], a, explain:`${after ? d[i] + ', ' + a : a + ', ' + d[i]}.`}; }],
    ['months', () => { const m = ['January','February','March','April','May','June','July','August','September','October','November','December'], i = rand(0, 10); return {q:`Which month comes after ${m[i]}?`, choices:[m[i + 1], m[(i + 3) % 12], m[(i + 7) % 12]], a:m[i + 1], explain:`${m[i]}, then ${m[i + 1]}.`}; }],
    ['clock', () => GEN.school[0][1]()],
    ['jobs', () => { const p = pick(MATCHES.jobs.pairs), o = shuffle(MATCHES.jobs.pairs.filter(x => x !== p)).slice(0, 2).map(x => x[2]); return {q:'Who uses this?', html:`<div class="q-visual">${p[1]}</div>`, choices:[p[2], ...o], a:p[2], explain:`A ${p[2]} uses it.`}; }]
  ],
  rhymes:[
    ['next line', () => { const r = pick(EN_RHYMES), i = rand(0, r.lines.length - 2), right = r.lines[i + 1].replace(/[,.;!]$/, ''); const wrong = shuffle(EN_RHYMES.filter(x => x !== r).flatMap(x => x.lines)).slice(0, 2).map(l => l.replace(/[,.;!]$/, '')); return {q:`“${r.lines[i]}” What comes next?`, choices:[right, ...wrong], a:right, explain:`In ${r.title}: ${r.lines[i]} ${r.lines[i + 1]}`}; }],
    ['rhyming words', () => GEN.english[2][1]()]
  ],
  art:[
    ['color quiz', () => { const x = pick([['red','#e53935'],['blue','#1e88e5'],['green','#43a047'],['yellow','#fdd835'],['purple','#8e24aa'],['orange','#fb8c00'],['pink','#ff6f91'],['brown','#8d5a3b']]); return {q:'What color is this?', html:`<div style="width:110px;height:110px;border-radius:26px;background:${x[1]};margin:10px 0"></div>`, choices:[x[0], ...shuffle(['red','blue','green','yellow','purple','orange','pink','brown'].filter(c => c !== x[0])).slice(0, 2)], a:x[0], explain:`That is ${x[0]}.`}; }],
    ['shapes', () => { const names = Object.keys(SHAPES), t = pick(names); return {q:'What shape is this?', html:`<div style="margin:8px 0">${shapeSVG(t, pick(SHAPE_COLORS), 120)}</div>`, choices:[t, ...shuffle(names.filter(n => n !== t)).slice(0, 2)], a:t, explain:shapeFacts(t)}; }]
  ],
  geo:[
    ['state capitals', () => { const x = pick(usaStates); return {q:`What is the capital of ${x[1]}?`, choices:[x[2], ...shuffle(usaStates.filter(y => y[2] !== x[2])).slice(0, 2).map(y => y[2])], a:x[2], explain:`The capital of ${x[1]} is ${x[2]}.`}; }]
  ],
  reading:[
    ['story', () => { const x = pick(illustratedStories); return {q:x.q, choices:x.choices.slice(), a:x.a, explain:x.lines.join(' '), passage:x.lines.join(' '), scene:x.scene}; }],
    ['blending', () => blendItem()],
    ['phonics', () => phonicsItem()],
    ['sight words', () => { const w = pick(SIGHT_LEVELS[0].words.filter(x => x.length > 1)), o = shuffle(SIGHT_LEVELS[0].words.filter(x => x !== w && x.length > 1)).slice(0, 2); return {q:'Listen. Which word did you hear?', say:`Which word is: ${w}?`, visual:'👂🔊', choices:[w, ...o], a:w, explain:`That word is ${w}.`}; }],
    ['letters', () => { const L = pick(ALPHABET)[0], up = Math.random() < .5; return {q:up ? `Which is the small letter for ${L}?` : `Which is the big letter for ${L.toLowerCase()}?`, choices:shuffle([L, ...shuffle(ALPHABET.filter(x => x[0] !== L)).slice(0, 2).map(x => x[0])]).map(c => up ? c.toLowerCase() : c), a:up ? L.toLowerCase() : L, explain:`${L} and ${L.toLowerCase()} are the same letter.`}; }],
    ['digraphs', () => { const d = pick(DIGRAPHS), others = shuffle(DIGRAPHS.filter(x => x !== d)).slice(0, 2); return {q:`Which word has the “${d[0]}” sound?`, choices:[`${d[1]} ${d[2]}`, ...others.map(o => `${o[1]} ${o[2]}`)], a:`${d[1]} ${d[2]}`, explain:`${d[2]} has the ${d[0]} sound.`}; }]
  ],
  math:Array.from(['add','sub','count','compare','next','skip','oddeven','shape','pattern','bond','moreless','clock'], t => [t, () => t === 'clock' ? GEN.school[0][1]() : mathItem(t)])
};
/* Build a 5-question quiz that mixes different topics of the subject */
function makeQuiz(key){
  const bank = (QBANK[key] || []).map(it => [it.t, () => ({...it, choices:it.choices.slice()})]);
  const pool = [...bank, ...(GEN[key] || [])];
  if (!pool.length) return [];
  const byTopic = {}; pool.forEach(([t, f]) => (byTopic[t] = byTopic[t] || []).push(f));
  const topics = shuffle(Object.keys(byTopic)), out = [], seenQ = new Set();
  let guard = 0;
  while (out.length < 5 && guard++ < 60){
    const t = topics[out.length % topics.length] || pick(Object.keys(byTopic));
    const item = pick(byTopic[t])();
    if (!item || seenQ.has(item.q + item.a)) continue;
    seenQ.add(item.q + item.a);
    item.a = String(item.a); item.choices = shuffle([...new Set(item.choices.map(String))]);
    if (!item.choices.includes(item.a)) item.choices[0] = item.a;
    out.push(item);
  }
  return out;
}

/* ---------- clock ---------- */
function clockSVG(h, m = 0, size = 180){
  const ha = ((h % 12) + m / 60) * 30 - 90, ma = m * 6 - 90, R = Math.PI / 180;
  const nums = Array.from({length:12}, (_, i) => { const a = ((i + 1) * 30 - 90) * R; return `<text x="${100 + 74 * Math.cos(a)}" y="${100 + 74 * Math.sin(a) + 7}" text-anchor="middle" font-size="20" font-weight="800" fill="#3b2a4a">${i + 1}</text>`; }).join('');
  return `<svg viewBox="0 0 200 200" width="${size}" height="${size}" class="clock-svg" role="img" aria-label="Clock showing ${h} o'clock"><circle cx="100" cy="100" r="94" fill="#fff" stroke="#8b6cf0" stroke-width="8"/>${nums}
    <line x1="100" y1="100" x2="${100 + 46 * Math.cos(ha * R)}" y2="${100 + 46 * Math.sin(ha * R)}" stroke="#ff6fae" stroke-width="9" stroke-linecap="round"/>
    <line x1="100" y1="100" x2="${100 + 66 * Math.cos(ma * R)}" y2="${100 + 66 * Math.sin(ma * R)}" stroke="#4f79ff" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#3b2a4a"/></svg>`;
}

/* ---------- more stories (pictures made from emoji) ---------- */
illustratedStories.push(
  {title:'The Big Bus',emoji:'🚌',scene:{bg:'day', art:[['🏫',290,120,64],['🚌',170,175,96],['🧒',60,190,44],['👧',100,195,40]]},lines:['The big bus is red.','Kids get on the bus.','The bus goes to school.','Beep, beep!'],q:'Where does the bus go?',choices:['To school','To the moon','To the zoo'],a:'To school'},
  {title:'Fish in the Sea',emoji:'🐟',scene:{bg:'sea', art:[['🐳',230,110,100],['🐟',90,150,54],['🫧',140,80,30],['🌿',40,215,50],['🐚',300,220,34]]},lines:['A little fish swims.','It sees a big whale.','The whale says hi.','They swim together.'],q:'What does the fish see?',choices:['A big whale','A cat','A bus'],a:'A big whale'},
  {title:'Pip the Puppy',emoji:'🐶',scene:{bg:'beach', art:[['🐶',140,160,90],['🦴',255,205,50],['🏖️',290,90,60]]},lines:['Pip is a little puppy.','Pip digs in the sand.','Pip finds a bone.','Pip is so happy!'],q:'What does Pip find?',choices:['A bone','A hat','A cup'],a:'A bone'},
  {title:'The Snowman',emoji:'⛄',scene:{bg:'snow', art:[['⛄',170,155,110],['❄️',60,60,36],['❄️',290,80,30],['🧒',290,190,50]]},lines:['It is a cold day.','We make a snowman.','He has a carrot nose.','The sun comes out. Drip, drip!'],q:'What is the snowman’s nose?',choices:['A carrot','A ball','A stick'],a:'A carrot'},
  {title:'Bee and the Flower',emoji:'🐝',scene:{bg:'day', art:[['🌸',200,175,90],['🐝',100,95,60],['🍯',300,210,40]]},lines:['A bee flies to a flower.','The flower is pink.','The bee gets sweet nectar.','Buzz, buzz, back home!'],q:'What color is the flower?',choices:['Pink','Blue','Black'],a:'Pink'},
  {title:'Night Sky',emoji:'🌙',scene:{bg:'night', art:[['🌙',260,70,70],['⭐',80,50,30],['⭐',160,90,24],['🏠',150,185,90],['🦉',290,175,46]]},lines:['The sun goes down.','The moon comes up.','Stars twinkle and shine.','Good night, sleep tight!'],q:'What comes up at night?',choices:['The moon','The sun','A rainbow'],a:'The moon'},
  {title:'Ruhaimah’s Garden',emoji:'🍅',scene:{bg:'day', art:[['👧',80,170,80],['🍅',210,200,46],['🍅',255,195,40],['🐰',300,200,50],['🌻',180,130,60]]},lines:['Ruhaimah has a garden.','She grows red tomatoes.','A bunny hops by.','She shares with the bunny.'],q:'What does she grow?',choices:['Tomatoes','Cars','Shoes'],a:'Tomatoes'},
  {title:'The Rainbow',emoji:'🌈',scene:{bg:'day', art:[['🌈',175,110,150],['☁️',60,60,50],['☁️',290,60,50],['🦆',120,210,40]]},lines:['The rain stops.','A rainbow comes out.','It has many colors.','Red, orange, yellow, green, blue, purple!'],q:'When does the rainbow come out?',choices:['After the rain','At midnight','Inside a box'],a:'After the rain'}
);
function emojiScene(sc, title){
  const bgs = {day:['#dff3ff','#b9e5a9'], sea:['#7cc7ee','#4aa3d6'], beach:['#dff3ff','#f6dfa1'], snow:['#e8f0fb','#ffffff'], night:['#202957','#2f3b6e']};
  const [sky, ground] = bgs[sc.bg] || bgs.day;
  return `<svg class="story-art" viewBox="0 0 350 240" role="img" aria-label="Picture for ${esc(title || 'story')}"><rect width="350" height="240" fill="${sky}"/>${sc.bg === 'sea' ? '<path d="M0 40 Q45 30 90 40 T180 40 T270 40 T350 40" stroke="#bfe7fb" stroke-width="5" fill="none"/>' : sc.bg === 'night' ? '' : '<circle cx="302" cy="40" r="24" fill="#ffe39a"/>'}<path d="M0 190Q90 153 180 190T350 190V240H0Z" fill="${ground}"/>${sc.art.map(([e, x, y, s]) => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" dominant-baseline="middle">${e}</text>`).join('')}</svg>`;
}

/* ---------- more rhymes (traditional, public domain) ---------- */
EN_RHYMES.push(
  {title:'Mary Had a Little Lamb', emoji:'🐑', lines:['Mary had a little lamb,','Its fleece was white as snow;','And everywhere that Mary went','The lamb was sure to go.']},
  {title:'Hey Diddle Diddle', emoji:'🐄', lines:['Hey diddle diddle,','The cat and the fiddle,','The cow jumped over the moon;','The little dog laughed','To see such sport,','And the dish ran away with the spoon.']},
  {title:'Pat-a-Cake', emoji:'🎂', lines:['Pat-a-cake, pat-a-cake, baker’s man,','Bake me a cake as fast as you can;','Pat it and prick it and mark it with B,','And put it in the oven for baby and me.']}
);

/* ---------- more lesson cards ---------- */
lessons.english.push(['🌈','Describing words','An adjective tells more: a red ball, a tiny bug, a happy girl.','A describing word tells more about something. A red ball. A tiny bug. A happy girl.'], ['👯','Same meaning','happy = glad\nsmall = little\nfast = quick','Some words mean the same thing. Happy and glad. Small and little. Fast and quick.'], ['🅰️','Capital letters','Use capitals for the start of a sentence, names, and the word I.','Use capital letters at the start of a sentence, for names, and for the word I.']);
lessons.science.push(['🦖','Dinosaurs','Dinosaurs lived millions of years ago. We learn about them from fossils.','Dinosaurs lived millions of years ago. We learn about them from fossils, which are bones and footprints in rocks.'], ['🌈','Rainbows','Sunlight shining through raindrops makes a rainbow.','When sunlight shines through raindrops, it makes a rainbow.'], ['🌍','Day and night','Earth spins around. When our side faces the Sun, it is day.','Earth spins around and around. When our side faces the Sun it is day, and when it faces away it is night.'], ['🔊','Sound','Sounds are made when things shake, or vibrate.','Sounds are made when things shake. That shaking is called vibration.']);
lessons.body.push(['🦷','Teeth','Kids have 20 baby teeth. Brush twice a day for 2 minutes!','Kids have twenty baby teeth. Brush them two times a day for two minutes.'], ['🍽️','Food groups','Fruits, vegetables, grains, protein and dairy help you grow.','Eat fruits, vegetables, grains, protein, and dairy to grow big and strong.'], ['💓','Feel your heart','Jump for 20 seconds, then put your hand on your chest. Feel it beat fast!','Jump for twenty seconds. Then put your hand on your chest and feel your heart beat fast!']);
lessons.logic.push(['🤔','Riddles','A riddle is a puzzle question. Listen to the clues!','A riddle is a puzzle question. Listen carefully to the clues.'], ['🧩','Same and different','Look closely: what is the same? What is different?','Look closely. What is the same? What is different?']);
lessons.school.push(['🪙','Coins','penny 1¢ · nickel 5¢ · dime 10¢ · quarter 25¢','A penny is one cent. A nickel is five cents. A dime is ten cents. A quarter is twenty-five cents.'], ['🕐','Telling time','The short hand shows the hour. The long hand shows the minutes.','On a clock, the short hand shows the hour, and the long hand shows the minutes.'], ['🤝','Being a good friend','Share, take turns, and use kind words.','A good friend shares, takes turns, and uses kind words.']);
lessons.general.push(['🧑‍🚒','Community helpers','Doctors, firefighters, teachers and farmers help us every day.','Doctors, firefighters, teachers, and farmers help us every day.'], ['🚦','Staying safe','Look both ways, wear a helmet, and call 911 in an emergency.','Look both ways before crossing. Wear a helmet on a bike. In an emergency in the USA, call nine one one.'], ['🙏','Kind words','please · thank you · sorry · excuse me','Kind words are please, thank you, sorry, and excuse me.'], ['👪','Family','Families come in many shapes. They love and care for each other.','Families come in many shapes and sizes. They love and care for each other.']);
const RIDDLES = QBANK.logic.filter(x => x.t === 'riddles');
const DINOS = [['🦖','T. rex','A huge meat-eater with tiny arms and big teeth.'],['🦕','Brachiosaurus','A giant plant-eater with a very long neck, taller than a house!'],['🦏','Triceratops','A plant-eater with three horns and a bony frill.'],['🦎','Stegosaurus','A plant-eater with big plates on its back and a spiky tail.'],['🦅','Pteranodon','A flying reptile that lived with the dinosaurs.'],['🐦','Birds today','Birds are the living relatives of dinosaurs!']];

/* ---------- Science explorer (tabs) ---------- */
const SCI_TABS = [['space','🪐 Space'],['animals','🐾 Animals'],['plants','🌱 Plants & life cycles'],['weather','🌦️ Weather'],['dinos','🦖 Dinosaurs'],['experiments','🧪 Experiments']];
function renderScienceLearn(tab){
  tab = tab || renderScienceLearn.tab || 'space'; renderScienceLearn.tab = tab;
  setResume({page:'lesson', subject:'science'});
  const head = `${crumbs('Science', "openSubject('science')")}<section class="panel"><h1>🔬 Science explorer</h1>
    <div class="tabs">${SCI_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" onclick="renderScienceLearn('${k}')">${l}</button>`).join('')}<button class="tab" onclick="startLearn('body')">🧍 Human body</button></div><div id="sciZone">`;
  let body = '', after = null;
  if (tab === 'space'){
    body = `<div class="space-intro"><span style="font-size:48px">☀️</span><div><h2>Our solar system</h2><p>Eight planets travel around the Sun. Tap a planet to learn about it. (Pictures are not to scale.)</p></div></div>
      <div class="row-buttons"><button class="btn primary" onclick="planetTour()">🚀 Take the planet tour</button><button class="btn" onclick="startPlay('science','o:planets')">☀️ Put planets in order</button></div>
      <div class="grid planet-grid">${planets.map((p, i) => `<button class="planet-card" onclick="planetDetails(${i})">${planetPicture(p.name)}<strong>${i + 1}. ${p.name}</strong><small>${esc(p.fact)}</small></button>`).join('')}</div>
      <div id="planetInfo" class="fact" aria-live="polite"><h2>Choose a planet!</h2></div>
      ${lessonCards([['☀️','The Sun','A star that gives us light and heat.','The Sun is a star. It gives us light and heat.'],['🌙','The Moon','Our Moon travels around Earth. Sometimes we see it in the daytime too.','The Moon travels around Earth. Sometimes we can see it in the daytime too.'],['🌍','Day and night','Earth spins. When our side faces the Sun, it is day.','Earth spins around and around. When our side faces the Sun it is day, and when it faces away it is night.'],['👩‍🚀','Astronauts','Astronauts float in space because there is no gravity pulling them down to the floor.','Astronauts float inside their spaceship. They train for a long time to go to space.']])}`;
  } else if (tab === 'animals'){
    body = `${lessonCards(lessons.science.filter(x => ['Animals need','Animal homes'].includes(x[1])).concat([['🍼','Animal babies','A baby cat is a kitten. A baby cow is a calf. A baby kangaroo is a joey!','A baby cat is a kitten. A baby cow is a calf. A baby kangaroo is called a joey!'],['🥩','What animals eat','Some eat plants, some eat meat, and some eat both.','Some animals eat plants, some eat meat, and some eat both.'],['❄️','Staying warm','Polar bears have thick fur and fat to stay warm in the snow.','Polar bears have thick fur and fat to keep them warm in the snow.']]))}
      <h2 style="margin-top:18px">🐣 Animal babies match</h2><div id="sciGame"></div>`;
    after = () => matchGame('sciGame', 'science', MATCHES.babies);
  } else if (tab === 'plants'){
    body = `${lessonCards(lessons.science.filter(x => ['Plants need','Life cycle'].includes(x[1])).concat([['🌳','Parts of a plant','roots · stem · leaves · flower','A plant has roots, a stem, leaves, and a flower. Roots drink water. Leaves catch sunlight.'],['🐸','Frog life cycle','egg → tadpole → froglet → frog','A frog starts as an egg, then a tadpole, then a froglet, and finally a frog.']]))}
      <h2 style="margin-top:18px">🦋 Life cycle puzzle</h2><div class="tabs"><button class="tab" onclick="orderGame('sciGame','science',ORDERS.butterfly)">🦋 Butterfly</button><button class="tab" onclick="orderGame('sciGame','science',ORDERS.plant)">🌻 Plant</button><button class="tab" onclick="orderGame('sciGame','science',ORDERS.chicken)">🐥 Chicken</button></div><div id="sciGame"></div>`;
    after = () => orderGame('sciGame', 'science', ORDERS.butterfly);
  } else if (tab === 'weather'){
    body = `${lessonCards([['☀️','Sunny','The Sun shines and it feels warm.','On a sunny day the Sun shines and it feels warm.'],['🌧️','Rainy','Clouds drop water. Plants love the rain!','On a rainy day, clouds drop water. Plants love the rain!'],['❄️','Snowy','When it is very cold, rain freezes into snow.','When it is very cold, water freezes and falls as snow.'],['🌬️','Windy','Wind is moving air. It flies kites and spins windmills.','Wind is moving air. It can fly kites and spin windmills.'],['⛈️','Storms','Thunder is the loud sound that lightning makes. Stay inside!','Thunder is the loud sound that lightning makes. Stay inside during a storm.'],['🌈','Rainbows','Sunlight shining through raindrops makes a rainbow.','When sunlight shines through raindrops, it makes a rainbow.']])}
      <h2 style="margin-top:18px">☂️ Dress for the weather</h2><div id="sciGame"></div>`;
    after = () => matchGame('sciGame', 'science', MATCHES.weather);
  } else if (tab === 'dinos'){
    body = `<p class="muted">Dinosaurs lived millions of years ago, long before people. We learn about them from fossils.</p><div class="grid lesson-grid">${DINOS.map(([e, n, f]) => `<div class="lesson-card"><span class="big-emoji">${e}</span><h3>${n}</h3><p>${f}</p><div class="row-buttons">${speakBtn(`${n}. ${f}`, 'Listen')}</div></div>`).join('')}</div>`;
  } else {
    body = `${lessonCards(lessons.science.filter(x => ['Water changes','Magnets','Sound'].includes(x[1])))}
      <h2 style="margin-top:18px">🧪 Try an experiment game</h2><div class="tabs"><button class="tab" onclick="sortGame('sciGame','science',SORTS.float)">🛟 Float or sink</button><button class="tab" onclick="sortGame('sciGame','science',SORTS.living)">🌱 Living or not</button><button class="tab" onclick="sortGame('sciGame','science',SORTS.habitats)">🌊 Land, water, air</button></div><div id="sciGame"></div>`;
    after = () => sortGame('sciGame', 'science', SORTS.float);
  }
  show(head + body + `</div></section><section class="panel">${activityChips('science')}</section>`);
  if (after) after();
}

/* ---------- General knowledge: calendar, clock, helpers ---------- */
const CLK = {h:3};
function renderGeneralLearn(){
  setResume({page:'lesson', subject:'general'});
  const now = new Date(), day = now.toLocaleDateString('en-US', {weekday:'long'}), date = now.toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
  const m = now.getMonth(), season = [2,3,4].includes(m) ? ['🌸','spring'] : [5,6,7].includes(m) ? ['☀️','summer'] : [8,9,10].includes(m) ? ['🍂','fall'] : ['❄️','winter'];
  show(`${crumbs('General knowledge', "openSubject('general')")}
  <section class="panel"><div class="section-title"><h1>💡 Learn: the world around us</h1>${speakBtn(`Today is ${day}, ${date}. It is ${season[1]}.`)}</div>
    <div class="today-card"><div class="today-day">${day}</div><div>${date}</div><div class="today-season">${season[0]} It is ${season[1]} (in the north)</div></div>
    ${lessonCards(lessons.general)}</section>
  <section class="panel"><h2>🕐 Clock lab</h2><p class="muted">The short pink hand shows the hour. Tap the buttons to move it!</p>
    <div class="body-wrap"><div id="clockBox" style="text-align:center"></div><div><div class="fact" style="text-align:center"><div class="big-number" id="clkDigital"></div><p id="clkWords" style="font-size:22px;font-weight:800"></p></div>
      <div class="row-buttons"><button class="btn" onclick="clockSet(CLK.h-1)">⏪ 1 hour back</button><button class="btn primary" onclick="clockSet(CLK.h+1)">1 hour forward ⏩</button></div>
      <h3 style="margin-top:14px">🎯 Clock challenge</h3><p id="clkGoal"></p><button class="btn gold" onclick="clockCheck()">✅ Check my clock</button><p class="feedback" id="clkFb"></p></div></div></section>
  <section class="panel">${activityChips('general')}</section>`);
  CLK.goal = rand(1, 12); clockSet(CLK.h, true);
}
function clockSet(h, quiet){
  CLK.h = ((h - 1 + 12) % 12) + 1;
  document.getElementById('clockBox').innerHTML = clockSVG(CLK.h, 0, 220);
  document.getElementById('clkDigital').textContent = `${CLK.h}:00`;
  document.getElementById('clkWords').textContent = `${CLK.h} o’clock`;
  document.getElementById('clkGoal').innerHTML = `Make the clock show <b>${CLK.goal} o’clock</b>.`;
  if (!quiet){ Sfx.tap(); speak(`${CLK.h} o'clock`, {quiet:true, gap:0}); }
}
function clockCheck(){
  const fb = document.getElementById('clkFb');
  if (CLK.h === CLK.goal){ fb.className = 'feedback good'; fb.textContent = `🌟 Yes! It is ${CLK.goal} o’clock.`; recordResult('general', true, fb); speak(`Yes! It is ${CLK.goal} o'clock!`, {quiet:true}); CLK.goal = rand(1, 12); setTimeout(() => clockSet(CLK.h, true), 1500); }
  else { fb.className = 'feedback bad'; fb.textContent = `Not yet. The short hand should point to ${CLK.goal}.`; Sfx.bad(); speak(`Not yet. Move the short hand to ${CLK.goal}.`, {quiet:true}); }
}

/* ---------- Logic: riddles ---------- */
function renderLogicLearn(){
  setResume({page:'lesson', subject:'logic'});
  show(`${crumbs('Logic & puzzles', "openSubject('logic')")}
  <section class="panel"><div class="section-title"><h1>🧩 Learn: thinking skills</h1>${speakBtn('Let’s use our thinking brains!')}</div>${lessonCards(lessons.logic)}</section>
  <section class="panel"><h2>🤔 Riddle time</h2><p class="muted">Listen to the riddle, think, then tap to see the answer!</p>
    <div class="grid lesson-grid">${RIDDLES.map(r => `<div class="lesson-card riddle"><p style="font-size:20px;font-weight:800">${esc(r.q)}</p><div class="row-buttons">${speakBtn(r.q, 'Listen')}<button class="btn small gold" onclick="this.outerHTML='<b class=&quot;riddle-ans&quot;>${esc(r.a)}! 🎉</b>';speak(${esc(JSON.stringify(r.explain))},{quiet:true})">💡 Answer</button></div></div>`).join('')}</div></section>
  <section class="panel"><h2>🔁 Pattern maker</h2><div id="logicGame"></div></section>
  <section class="panel">${activityChips('logic')}</section>`);
  orderGame('logicGame', 'logic', ORDERS.sizes);
}

/* ---------- School practice: coins and the clock ---------- */
const COINS = [['penny','1¢','#c97b4a',1],['nickel','5¢','#b9bcc2',5],['dime','10¢','#d6d9de',10],['quarter','25¢','#c5c9cf',25]];
function renderSchoolLearn(){
  setResume({page:'lesson', subject:'school'});
  show(`${crumbs('School practice', "openSubject('school')")}
  <section class="panel"><div class="section-title"><h1>🎯 Learn: school skills</h1>${speakBtn('Let’s get ready for school!')}</div>${lessonCards(lessons.school)}</section>
  <section class="panel"><h2>🪙 US coins</h2><p class="muted">Tap a coin to hear its name and value. A dime is small, but it is worth more than a nickel!</p>
    <div class="coin-row">${COINS.map(([n, v, c, cents], i) => `<button class="coin" style="--c:${c};--s:${[58, 66, 54, 74][i]}px" onclick="speak('${n}. ${cents} ${cents === 1 ? 'cent' : 'cents'}.')"><span>${v}</span></button><b>${n}</b>`).join('')}</div>
    <h3 style="margin-top:14px">🛒 Coin shop</h3><div id="coinGame"></div></section>
  <section class="panel">${activityChips('school')}</section>`);
  coinGame();
}
function coinGame(){
  const z = document.getElementById('coinGame'); if (!z) return;
  const item = pick([['🍎', 'apple'], ['🍪', 'cookie'], ['✏️', 'pencil'], ['🎈', 'balloon'], ['🍬', 'candy']]), price = pick([2, 3, 5, 6, 7, 10, 11, 15]); let total = 0;
  z.innerHTML = `<p style="font-size:20px">The ${item[1]} ${item[0]} costs <b>${price}¢</b>. Tap pennies and nickels to pay exactly!</p>
    <div class="row-buttons"><button class="btn" id="addP">+ penny 1¢</button><button class="btn" id="addN">+ nickel 5¢</button><button class="btn warn" id="clr">Start over</button></div>
    <p class="big-number" style="font-size:42px" id="coinTotal">0¢</p><p class="feedback m-fb"></p><button class="btn m-next" onclick="coinGame()">New item →</button>`;
  const upd = v => { total += v; Sfx.pop(); z.querySelector('#coinTotal').textContent = total + '¢';
    if (total === price){ mathWin(z.querySelector('#coinTotal'), z, `You paid ${price} cents!`); recordResult('school', true); }
    else if (total > price){ const fb = z.querySelector('.m-fb'); fb.className = 'feedback bad m-fb'; fb.textContent = 'Too much! Start over.'; speak('Oops, too much. Start over!', {quiet:true}); } };
  z.querySelector('#addP').onclick = () => upd(1); z.querySelector('#addN').onclick = () => upd(5); z.querySelector('#clr').onclick = () => { total = 0; z.querySelector('#coinTotal').textContent = '0¢'; z.querySelector('.m-fb').textContent = ''; };
  speak(`The ${item[1]} costs ${price} cents.`, {quiet:true});
}

/* ---------- Art: color lab & music ---------- */
const PAINTS = [['red','#e53935'],['yellow','#fdd835'],['blue','#1e88e5'],['white','#ffffff'],['black','#222222']];
const MIXES = {'red+yellow':['orange','#fb8c00'],'blue+yellow':['green','#43a047'],'blue+red':['purple','#8e24aa'],'red+white':['pink','#ff8fb1'],'black+white':['gray','#9e9e9e'],'blue+white':['light blue','#90caf9'],'white+yellow':['cream','#fff3b0'],'black+red':['dark red','#8b1a1a'],'black+blue':['navy','#1a237e'],'black+yellow':['olive','#7c7a1c']};
const ART_TABS = [['draw','🖌️ Draw'],['lab','🧪 Color lab'],['music','🎹 Music']];
const artTabBar = cur => `<div class="tabs">${ART_TABS.map(([k, l]) => `<button class="tab ${k === cur ? 'active' : ''}" onclick="${k === 'draw' ? 'renderArt()' : k === 'lab' ? 'renderColorLab()' : 'renderMusic()'}">${l}</button>`).join('')}</div>`;
function renderColorLab(){
  setResume({page:'lesson', subject:'art'}); let picks = [];
  show(`${crumbs('Art', "openSubject('art')")}<section class="panel"><h1>🎨 Art studio</h1>${artTabBar('lab')}
    <p class="muted">Tap two paint colors and watch them mix!</p>
    <div class="paint-row">${PAINTS.map(([n, c]) => `<button class="paint" style="--c:${c}" data-n="${n}"><span></span>${n}</button>`).join('')}</div>
    <div class="mix-area"><div class="mix-slot" id="mixA">?</div><span class="m-op">➕</span><div class="mix-slot" id="mixB">?</div><span class="m-op">🟰</span><div class="mix-result" id="mixR">🎨</div></div>
    <p class="feedback" id="mixFb"></p></section><section class="panel">${activityChips('art')}</section>`);
  document.querySelectorAll('.paint').forEach(b => b.onclick = () => {
    const n = b.dataset.n, c = PAINTS.find(p => p[0] === n)[1];
    if (picks.length === 2) picks = [];
    picks.push(n); Sfx.pop();
    const slot = document.getElementById(picks.length === 1 ? 'mixA' : 'mixB'); slot.style.background = c; slot.textContent = '';
    if (picks.length === 1){ const b2 = document.getElementById('mixB'); b2.style.background = ''; b2.textContent = '?'; const r = document.getElementById('mixR'); r.style.background = ''; r.textContent = '🎨'; document.getElementById('mixFb').textContent = ''; speak(n, {quiet:true}); return; }
    const key = picks.slice().sort().join('+'), res = picks[0] === picks[1] ? [picks[0], c] : MIXES[key];
    const r = document.getElementById('mixR'); r.textContent = ''; r.style.background = res[1]; r.classList.remove('pop'); void r.offsetWidth; r.classList.add('pop');
    const msg = picks[0] === picks[1] ? `${picks[0]} and ${picks[0]} is still ${picks[0]}!` : `${picks[0]} and ${picks[1]} make ${res[0]}!`;
    document.getElementById('mixFb').className = 'feedback good'; document.getElementById('mixFb').textContent = '🌈 ' + msg; speak(msg, {quiet:true});
    if (picks[0] !== picks[1]){ trackDay(); markDaily('art'); saveAll(); }
  });
}
const NOTES = [['C','#ff5a5f',261.63],['D','#ff9f1c',293.66],['E','#ffd23f',329.63],['F','#3cc48a',349.23],['G','#2fb5e9',392.0],['A','#4f79ff',440.0],['B','#8b5cf6',493.88],['C','#ff6fae',523.25]];
const SONGS = {twinkle:{name:'⭐ Twinkle, Twinkle', notes:[0,0,4,4,5,5,4,3,3,2,2,1,1,0]}, mary:{name:'🐑 Mary Had a Little Lamb', notes:[2,1,0,1,2,2,2,1,1,1,2,4,4,2,1,0,1,2,2,2,2,1,1,2,1,0]}, scale:{name:'🎵 Up the scale', notes:[0,1,2,3,4,5,6,7]}};
function playNote(i){
  try{ const ctx = Sfx.ctx = Sfx.ctx || new (window.AudioContext || window.webkitAudioContext)(), t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = NOTES[i][2]; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .9); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 1); }catch(e){}
}
const MUS = {song:null, pos:0};
function renderMusic(){
  setResume({page:'lesson', subject:'art'}); stopSpeaking();
  show(`${crumbs('Art', "openSubject('art')")}<section class="panel"><h1>🎨 Art studio</h1>${artTabBar('music')}
    <p class="muted">Tap the bars to play music! Or pick a song and follow the glowing bar.</p>
    <div class="row-buttons">${Object.entries(SONGS).map(([k, s]) => `<button class="btn small ${MUS.song === k ? 'primary' : ''}" onclick="MUS.song='${k}';MUS.pos=0;renderMusic()">${s.name}</button>`).join('')}<button class="btn small" onclick="MUS.song=null;renderMusic()">🎹 Free play</button></div>
    <p class="feedback" id="musFb">${MUS.song ? `Follow the glowing bar to play ${SONGS[MUS.song].name}!` : 'Free play: make your own song!'}</p>
    <div class="xylo">${NOTES.map(([n, c], i) => `<button class="xbar" style="--c:${c};--h:${100 - i * 6}%" data-i="${i}"><span>${n}</span></button>`).join('')}</div></section>
    <section class="panel">${activityChips('art')}</section>`);
  const bars = [...document.querySelectorAll('.xbar')];
  const glow = () => bars.forEach((b, k) => b.classList.toggle('next', !!MUS.song && SONGS[MUS.song].notes[MUS.pos] === k));
  bars.forEach(b => b.onpointerdown = e => {
    e.preventDefault(); const i = +b.dataset.i; playNote(i); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180);
    if (MUS.song){ const s = SONGS[MUS.song];
      if (s.notes[MUS.pos] === i){ MUS.pos++; if (MUS.pos >= s.notes.length){ MUS.pos = 0; recordResult('art', true, b); confetti(24); document.getElementById('musFb').textContent = `🎉 You played ${s.name}!`; } }
    }
    glow();
  });
  glow();
}

/* ---------- Chess: the starting board ---------- */
const START_ROW = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
const BLACK_SYM = {king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟'};
function chessSetupBoard(){
  const cells = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
    const p = r === 0 ? START_ROW[c] : r === 1 ? 'pawn' : r === 6 ? 'pawn' : r === 7 ? START_ROW[c] : null, black = r < 2;
    cells.push(`<button class="${(r + c) % 2 ? 'dark' : 'light'}" ${p ? `onclick="chessSetupTap('${p}', ${black})"` : ''} aria-label="${p ? (black ? 'black ' : 'white ') + p : 'empty square'}">${p ? `<span class="${black ? 'pc-b' : 'pc-w'}">${black ? BLACK_SYM[p] : PIECES[p].sym}</span>` : ''}</button>`);
  }
  return `<div class="board board8" style="grid-template-columns:repeat(8,1fr)">${cells.join('')}</div>`;
}
function chessSetupTap(p, black){ const P = PIECES[p]; const el = document.getElementById('setupInfo'); if (el) el.innerHTML = `<h3>${black ? BLACK_SYM[p] : P.sym} ${black ? 'Black' : 'White'} ${P.name}</h3><p>${P.rule}</p>`; speak(`${black ? 'Black' : 'White'} ${P.name}. ${P.rule}`, {quiet:true}); }

/* ---------- Games: Simon color memory ---------- */
const SIMON = {seq:[], pos:0, busy:false, pads:[['#ff5a5f',329.63],['#2fb5e9',392],['#3cc48a',440],['#ffd23f',523.25]]};
function renderSimon(){
  setResume({page:'subject', subject:'games'});
  show(`${crumbs('Games', 'renderGamesHub()')}<section class="panel"><div class="section-title"><h1>🌈 Color memory</h1><span class="pill">🏆 Best: ${saved.simonBest || 0}</span></div>
    <p>Watch the colors light up, then tap them in the same order. Each round adds one more!</p>
    <div class="simon">${SIMON.pads.map((p, i) => `<button class="simon-pad" style="--c:${p[0]}" data-i="${i}" aria-label="pad ${i + 1}"></button>`).join('')}</div>
    <p class="ttt-status" id="simonMsg">Tap Start!</p><div class="row-buttons"><button class="btn primary big" onclick="simonStart()">▶️ Start</button></div></section>`);
  document.querySelectorAll('.simon-pad').forEach(b => b.onpointerdown = e => { e.preventDefault(); simonTap(+b.dataset.i); });
}
function simonFlash(i){ const b = document.querySelectorAll('.simon-pad')[i]; if (!b) return; b.classList.add('lit'); Sfx.tone(SIMON.pads[i][1], .35, 'sine', 0, .18); setTimeout(() => b.classList.remove('lit'), 350); }
function simonStart(){ SIMON.seq = []; simonNext(); }
function simonNext(){
  SIMON.seq.push(rand(0, 3)); SIMON.pos = 0; SIMON.busy = true;
  const m = document.getElementById('simonMsg'); if (m) m.textContent = `👀 Watch… (round ${SIMON.seq.length})`;
  SIMON.seq.forEach((v, k) => setTimeout(() => simonFlash(v), 700 + k * 600));
  setTimeout(() => { SIMON.busy = false; const mm = document.getElementById('simonMsg'); if (mm) mm.textContent = '👆 Your turn!'; }, 700 + SIMON.seq.length * 600);
}
function simonTap(i){
  if (SIMON.busy || !SIMON.seq.length) return;
  simonFlash(i);
  if (SIMON.seq[SIMON.pos] !== i){
    const score = SIMON.seq.length - 1; SIMON.seq = []; Sfx.bad();
    if (score > (saved.simonBest || 0)){ saved.simonBest = score; saveAll(); }
    const m = document.getElementById('simonMsg'); if (m) m.textContent = `Oops! You remembered ${score} in a row. Tap Start to play again.`;
    speak(`You remembered ${score} in a row!`, {quiet:true}); if (score >= 3) recordResult('games', true); return;
  }
  SIMON.pos++;
  if (SIMON.pos === SIMON.seq.length){ SIMON.busy = true; const m = document.getElementById('simonMsg'); if (m) m.textContent = '🌟 Great memory!'; setTimeout(simonNext, 900); }
}

/* ---------- Interactive world map (country shapes: Natural Earth, public domain) ---------- */
const CONTINENTS = {
  'Asia':{name:'Asia', color:'#ffb4c8', animals:'🐼 🐘 🐯 🐪', fact:'Asia is the biggest continent. More people live here than anywhere else. Bangladesh is in Asia!', box:[25, -12, 150, 80]},
  'Africa':{name:'Africa', color:'#ffd27a', animals:'🦁 🦒 🦓 🦛', fact:'Africa has the Sahara, the biggest hot desert, and the long Nile River.', box:[-20, -36, 55, 38]},
  'North America':{name:'North America', color:'#a9ddff', animals:'🦅 🐻 🦬 🦌', fact:'North America has the United States, Canada and Mexico.', box:[-170, 7, -50, 84]},
  'South America':{name:'South America', color:'#b8e8c1', animals:'🦜 🦙 🐒 🐆', fact:'South America has the Amazon, the biggest rainforest in the world.', box:[-85, -56, -33, 13]},
  'Europe':{name:'Europe', color:'#d3c1ff', animals:'🦔 🦌 🦊 🐻', fact:'Europe has many countries close together, like France, Italy and the United Kingdom.', box:[-25, 34, 45, 72]},
  'Oceania':{name:'Australia & Oceania', color:'#ffc4a3', animals:'🦘 🐨 🦜 🐢', fact:'Australia is the smallest continent. Kangaroos and koalas live there.', box:[110, -48, 180, 0]},
  'Antarctica':{name:'Antarctica', color:'#e6edf5', animals:'🐧 🦭 🐋', fact:'Antarctica is the coldest place on Earth. It is covered in ice, and penguins live here.', box:[-180, -90, 180, -60]}
};
const OCEANS = [['Pacific Ocean', -145, 8, 'The Pacific is the biggest and deepest ocean.'], ['Pacific Ocean', 170, -18, 'The Pacific is the biggest and deepest ocean.'], ['Atlantic Ocean', -38, 22, 'The Atlantic is between the Americas, Europe and Africa.'], ['Indian Ocean', 78, -24, 'The Indian Ocean is warm. It is south of India and Bangladesh.'], ['Arctic Ocean', 20, 83, 'The Arctic Ocean is near the North Pole. Polar bears live nearby.'], ['Southern Ocean', 40, -60, 'The Southern Ocean goes all the way around Antarctica.']];
const COUNTRY_INFO = {
  'United States':['Washington, D.C.','has 50 states and the bald eagle.'], 'Canada':['Ottawa','has lots of lakes, forests and moose.'], 'Mexico':['Mexico City','is famous for tacos and colorful festivals.'],
  'Brazil':['Brasília','has the giant Amazon rainforest.'], 'Argentina':['Buenos Aires','has the tall Andes mountains.'], 'Peru':['Lima','has Machu Picchu, an old city in the mountains.'], 'Chile':['Santiago','is very long and thin.'], 'Colombia':['Bogotá','grows lots of coffee and flowers.'],
  'United Kingdom':['London','has the Big Ben clock tower.'], 'France':['Paris','has the Eiffel Tower.'], 'Spain':['Madrid','is sunny with beautiful beaches.'], 'Italy':['Rome','is shaped like a boot!'], 'Germany':['Berlin','is famous for castles and forests.'], 'Norway':['Oslo','is a place to see the northern lights.'], 'Sweden':['Stockholm','has snowy winters and long summer days.'], 'Greece':['Athens','has very old temples.'],
  'Russia':['Moscow','is the biggest country in the world.'], 'China':['Beijing','has the Great Wall and giant pandas.'], 'India':['New Delhi','has the Taj Mahal and Bengal tigers.'], 'Bangladesh':['Dhaka','has the Sundarbans, home of the Royal Bengal tiger, and many rivers.'], 'Pakistan':['Islamabad','has very tall mountains.'], 'Nepal':['Kathmandu','has Mount Everest, the tallest mountain.'],
  'Japan':['Tokyo','is made of islands and has Mount Fuji.'], 'South Korea':['Seoul','is famous for kimchi.'], 'Indonesia':['Jakarta','has more than 17,000 islands.'], 'Malaysia':['Kuala Lumpur','has tall twin towers and rainforests.'], 'Thailand':['Bangkok','has elephants and golden temples.'], 'Mongolia':['Ulaanbaatar','has wide grasslands and wild horses.'],
  'Saudi Arabia':['Riyadh','has big deserts and the holy city of Makkah.'], 'Turkey':['Ankara','is in both Europe and Asia.'], 'Iran':['Tehran','has beautiful carpets and mountains.'], 'Iraq':['Baghdad','has two famous rivers, the Tigris and Euphrates.'], 'United Arab Emirates':['Abu Dhabi','has the tallest building, the Burj Khalifa.'],
  'Egypt':['Cairo','has the pyramids and the Nile River.'], 'Nigeria':['Abuja','has more people than any other country in Africa.'], 'Kenya':['Nairobi','has lions, zebras and giraffes.'], 'South Africa':['Pretoria','has three capital cities and penguins on its beaches!'], 'Morocco':['Rabat','has colorful markets and the Sahara.'], 'Ethiopia':['Addis Ababa','is where coffee comes from.'], 'Madagascar':['Antananarivo','is an island with lemurs.'],
  'Australia':['Canberra','has kangaroos and koalas.'], 'New Zealand':['Wellington','has kiwi birds.'], 'Greenland':['Nuuk','is the biggest island in the world.'], 'Antarctica':['', 'is the coldest place on Earth.']
};
const FIND_COUNTRIES = ['United States','Canada','Mexico','Brazil','Argentina','Peru','Chile','Russia','China','India','Bangladesh','Australia','Egypt','Japan','Saudi Arabia','South Africa','France','United Kingdom','Italy','Greenland','Kenya','Indonesia','Nigeria','Turkey','Spain','Germany','Norway','Madagascar','Mongolia','Pakistan','Iran','New Zealand'];
const WM = {data:null, mode:'continents', target:null, zoom:null, sel:null, found:0, tries:0, level:'continents'};
const W = 1000, H = 500, px = lon => (lon + 180) / 360 * W, py = lat => (90 - lat) / 180 * H;
async function loadWorld(){
  if (WM.data) return WM.data;
  const res = await fetch('world.json'); const raw = await res.json();
  WM.data = raw.filter(f => f.c !== 'Seven seas (open ocean)').map(f => ({...f, d:f.p.map(poly => poly.map(r => 'M' + r.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L') + 'Z').join('')).join('')}));
  return WM.data;
}
function countryCard(f){
  const info = COUNTRY_INFO[f.n], c = CONTINENTS[f.c];
  return `<div class="country-card">${f.i ? flagImg(f.i, 80) : ''}<div><h3>${esc(f.n)}</h3><p>🌍 ${c ? c.name : f.c}${info && info[0] ? ` · 🏛️ Capital: <b>${esc(info[0])}</b>` : ''}</p>${info ? `<p>${esc(f.n)} ${esc(info[1])}</p>` : ''}</div></div>`;
}
function renderWorld(zoneId){
  const z = document.getElementById(zoneId); if (!z) return;
  z.innerHTML = `<div class="toolbar">
      <div class="seg">${[['continents','🗺️ Continents'],['countries','🏳️ Countries'],['find','🎯 Find it!']].map(([m, l]) => `<button class="${WM.mode === m ? 'active' : ''}" onclick="WM.mode='${m}';WM.target=null;WM.sel=null;renderWorld('${zoneId}')">${l}</button>`).join('')}</div>
      ${WM.mode === 'find' ? `<div class="seg">${[['continents','Continents'],['countries','Countries']].map(([m, l]) => `<button class="${WM.level === m ? 'active' : ''}" onclick="WM.level='${m}';WM.target=null;renderWorld('${zoneId}')">${l}</button>`).join('')}</div>` : ''}
    </div>
    <div class="fact world-info" id="worldInfo" aria-live="polite"></div>
    <div class="zoom-row">${Object.entries(CONTINENTS).filter(([k]) => k !== 'Antarctica').map(([k, c]) => `<button class="chip-btn ${WM.zoom === k ? 'active' : ''}" style="--c:${c.color}" onclick="worldZoom('${k}')">${c.name}</button>`).join('')}<button class="chip-btn ${!WM.zoom ? 'active' : ''}" onclick="worldZoom(null)">🌍 Whole world</button></div>
    <div class="world-wrap"><svg id="worldSvg" class="world-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="World map"><rect width="${W}" height="${H}" fill="#a9d8f5"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="22" fill="#2a5d80">Loading the world… 🌍</text></svg></div>
    <p class="tiny">Map: Natural Earth (public domain). Flags: flagcdn.com. Country borders are simplified for kids.</p>`;
  loadWorld().then(() => drawWorld(zoneId)).catch(() => { const s = document.getElementById('worldSvg'); if (s) s.innerHTML = `<rect width="${W}" height="${H}" fill="#a9d8f5"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="22">The world map could not load. Check the internet.</text>`; });
}
function worldInfo(html){ const el = document.getElementById('worldInfo'); if (el) el.innerHTML = html; }
function drawWorld(zoneId){
  const svg = document.getElementById('worldSvg'); if (!svg || !WM.data) return;
  if (WM.mode === 'find' && !WM.target) worldNewTarget();
  const fill = f => {
    const c = CONTINENTS[f.c] ? CONTINENTS[f.c].color : '#ddd';
    if (WM.mode === 'countries') return WM.sel === f.n ? '#ff9f1c' : c;
    if (WM.mode === 'continents' && WM.sel && WM.sel !== f.c) return '#f4f1ea';
    return c;
  };
  const labels = WM.mode === 'continents' ? Object.entries(CONTINENTS).map(([k, c]) => { const [x1, y1, x2, y2] = c.box; return `<text class="cont-label" x="${px((x1 + x2) / 2)}" y="${py((y1 + y2) / 2)}" text-anchor="middle">${c.name}</text>`; }).join('') : '';
  svg.innerHTML = `<rect width="${W}" height="${H}" fill="#a9d8f5"/>
    ${WM.data.map((f, i) => `<path d="${f.d}" fill="${fill(f)}" stroke="#ffffff" stroke-width="${WM.zoom ? .6 : .9}" data-i="${i}" class="wpath"><title>${esc(f.n)}</title></path>`).join('')}
    ${OCEANS.map(([n, lon, lat], k) => `<text class="ocean-label" x="${px(lon)}" y="${py(lat)}" text-anchor="middle" data-o="${k}">${n}</text>`).join('')}${labels}`;
  svg.querySelectorAll('.wpath').forEach(p => p.addEventListener('click', () => worldTap(WM.data[+p.dataset.i], p)));
  svg.querySelectorAll('.ocean-label').forEach(t => t.addEventListener('click', () => { const o = OCEANS[+t.dataset.o]; worldInfo(`<h3>🌊 ${o[0]}</h3><p>${o[3]}</p>`); speak(`${o[0]}. ${o[3]}`, {quiet:true}); }));
  setViewBox(svg, WM.zoom);
  if (WM.mode === 'find'){
    const t = WM.target; worldInfo(`<h3>🎯 Find ${esc(t)}!</h3><p>Tap it on the map. ${WM.found ? `Found: <b>${WM.found}</b> ⭐` : ''}</p>`);
  } else if (!WM.sel) worldInfo(WM.mode === 'continents' ? '<h3>🗺️ The 7 continents</h3><p>Tap a continent to learn about it. Tap an ocean name to hear about the ocean.</p>' : '<h3>🏳️ Countries of the world</h3><p>Tap any country to see its name and flag. Use the buttons to zoom in on a continent.</p>');
}
function setViewBox(svg, key){
  if (!key){ svg.setAttribute('viewBox', `0 0 ${W} ${H}`); return; }
  const [x1, y1, x2, y2] = CONTINENTS[key].box, pad = 4;
  svg.setAttribute('viewBox', `${px(x1 - pad)} ${py(y2 + pad)} ${px(x2 + pad) - px(x1 - pad)} ${py(y1 - pad) - py(y2 + pad)}`);
}
function worldZoom(key){ WM.zoom = key; document.querySelectorAll('.zoom-row .chip-btn').forEach(b => b.classList.toggle('active', b.textContent === (key ? CONTINENTS[key].name : '🌍 Whole world'))); const svg = document.getElementById('worldSvg'); if (svg){ svg.classList.add('zooming'); setViewBox(svg, key); setTimeout(() => svg.classList.remove('zooming'), 400); drawWorld(); } Sfx.tap(); }
function worldNewTarget(){
  const cont = Object.keys(CONTINENTS).filter(k => k !== WM.lastTarget);
  WM.target = WM.level === 'continents' ? CONTINENTS[pick(cont)].name : pick(FIND_COUNTRIES.filter(n => n !== WM.lastTarget));
  WM.lastTarget = WM.target; WM.tries = 0;
  speak(`Find ${WM.target}!`, {quiet:true});
}
function worldTap(f, path){
  const cont = CONTINENTS[f.c];
  if (WM.mode === 'continents'){
    WM.sel = f.c; drawWorld();
    worldInfo(`<h3>${cont ? cont.name : f.c} <span class="big-emo">${cont ? cont.animals : ''}</span></h3><p>${cont ? cont.fact : ''}</p><p class="tiny">You tapped ${esc(f.n)}.</p>`);
    speak(`${cont.name}. ${cont.fact}`, {quiet:true}); trackDay(); markDaily('geo'); return;
  }
  if (WM.mode === 'countries'){
    WM.sel = f.n; drawWorld(); worldInfo(countryCard(f));
    const info = COUNTRY_INFO[f.n];
    speak(`${f.n}. ${info && info[0] ? 'The capital is ' + info[0] + '. ' : ''}${info ? f.n + ' ' + info[1] : 'It is in ' + (cont ? cont.name : '') + '.'}`, {quiet:true}); return;
  }
  // find game
  const ok = WM.level === 'continents' ? (cont && cont.name === WM.target) : f.n === WM.target;
  if (ok){
    WM.found++; recordResult('geo', true, path); confetti(14);
    const msg = WM.level === 'continents' ? `${cont.name}! ${cont.fact}` : `${f.n}! ${COUNTRY_INFO[f.n] ? f.n + ' ' + COUNTRY_INFO[f.n][1] : ''}`;
    speak(`Yes! ${msg}`, {quiet:true});
    worldInfo(`<h3>🌟 You found ${esc(WM.target)}!</h3><p>${esc(msg)}</p><button class="btn primary" onclick="WM.target=null;drawWorld()">Next →</button>`);
    path.setAttribute('fill', '#3cc48a');
  } else {
    WM.tries++; Sfx.bad(); path.setAttribute('fill', '#ff9b8a'); setTimeout(() => drawWorld(), 700);
    const hint = WM.level === 'countries' && WM.tries >= 2 ? (() => { const t = WM.data.find(x => x.n === WM.target); return t ? ` Hint: it is in ${CONTINENTS[t.c].name}.` : ''; })() : '';
    speak(`That is ${f.n}. Try again!${hint}`, {quiet:true});
    setTimeout(() => worldInfo(`<h3>🎯 Find ${esc(WM.target)}!</h3><p>That was ${esc(f.n)}. Try again!${esc(hint)}</p>`), 10);
  }
}
/* geography activities */
MATCHES.flags = {title:'Match the flag to the country', pairs:[['BD','Bangladesh'],['US','United States'],['CA','Canada'],['GB','United Kingdom'],['JP','Japan'],['IN','India'],['BR','Brazil'],['SA','Saudi Arabia'],['FR','France'],['CN','China'],['AU','Australia'],['EG','Egypt'],['MX','Mexico'],['TR','Turkey'],['DE','Germany']].map(([i, n]) => [flagImg(i, 80), n, '', n])};
MATCHES.continentAnimals = {title:'Match the animal to its continent', pairs:[['🦘 kangaroo','Australia'],['🐧 penguin','Antarctica'],['🦁 lion','Africa'],['🐼 panda','Asia'],['🦬 bison','North America'],['🦙 llama','South America'],['🦔 hedgehog','Europe']].map(([a, b]) => [a, b, a.slice(3), b])};
MATCHES.capitals = {title:'Match the country to its capital', pairs:Object.entries(COUNTRY_INFO).filter(([n, v]) => v[0] && FIND_COUNTRIES.includes(n)).map(([n, v]) => [n, v[0], n, v[0]])};
GEN.geo.push(
  ['flags', () => { const p = pick(MATCHES.flags.pairs), o = shuffle(MATCHES.flags.pairs.filter(x => x !== p)).slice(0, 2).map(x => x[1]); return {q:'Which country has this flag?', html:`<div style="margin:10px 0">${p[0].replace('w80', 'w160')}</div>`, choices:[p[1], ...o], a:p[1], explain:`That is the flag of ${p[1]}.`}; }],
  ['continents', () => { const n = pick(Object.keys(COUNTRY_INFO).filter(k => k !== 'Antarctica')); const f = {Egypt:'Africa',Kenya:'Africa',Nigeria:'Africa','South Africa':'Africa',Morocco:'Africa',Ethiopia:'Africa',Madagascar:'Africa',Brazil:'South America',Argentina:'South America',Peru:'South America',Chile:'South America',Colombia:'South America','United States':'North America',Canada:'North America',Mexico:'North America',Greenland:'North America',Australia:'Australia & Oceania','New Zealand':'Australia & Oceania'}[n] || (['United Kingdom','France','Spain','Italy','Germany','Norway','Sweden','Greece','Russia'].includes(n) ? 'Europe' : 'Asia');
    const names = Object.values(CONTINENTS).map(c => c.name).filter(x => x !== 'Antarctica'); return {q:`Which continent is ${n} in?`, choices:[f, ...shuffle(names.filter(x => x !== f)).slice(0, 2)], a:f, explain:`${n} is in ${f}.`}; }],
  ['world capitals', () => { const [n, v] = pick(Object.entries(COUNTRY_INFO).filter(([, v]) => v[0])); const o = shuffle(Object.values(COUNTRY_INFO).filter(x => x[0] && x[0] !== v[0])).slice(0, 2).map(x => x[0]); return {q:`What is the capital of ${n}?`, choices:[v[0], ...o], a:v[0], explain:`The capital of ${n} is ${v[0]}.`}; }]
);

/* ---------- Bangla & Arabic alphabets ---------- */
/* [letter, name in English letters, how an English voice should say it, word, word in English letters, meaning, emoji] */
const BN_VOWELS = [
  ['অ','ô','aw','অজগর','ôjogor','python','🐍'],['আ','a','aah','আম','am','mango','🥭'],['ই','i','ee','ইঁদুর','indur','mouse','🐭'],['ঈ','dirgho i','long ee','ঈগল','igol','eagle','🦅'],
  ['উ','u','oo','উট','ut','camel','🐪'],['ঊ','dirgho u','long oo','ঊষা','usha','dawn','🌅'],['ঋ','ri','ree','ঋষি','rishi','wise man','🧙'],['এ','e','eh','একতারা','ektara','one-string guitar','🪕'],
  ['ঐ','oi','oy','ঐরাবত','oirabot','elephant','🐘'],['ও','o','oh','ওল','ol','yam','🍠'],['ঔ','ou','ow','ঔষধ','oushodh','medicine','💊']
];
const BN_CONS = [
  ['ক','ko','kaw','কলা','kola','banana','🍌'],['খ','kho','khaw','খরগোশ','khorgosh','rabbit','🐰'],['গ','go','gaw','গরু','goru','cow','🐄'],['ঘ','gho','ghaw','ঘড়ি','ghori','clock','⏰'],['ঙ','ungo','ung','ব্যাঙ','byang','frog','🐸'],
  ['চ','cho','chaw','চাঁদ','chand','moon','🌙'],['ছ','chho','chhaw','ছাতা','chhata','umbrella','☂️'],['জ','jo','jaw','জাহাজ','jahaj','ship','🚢'],['ঝ','jho','jhaw','ঝুড়ি','jhuri','basket','🧺'],['ঞ','niyo','nee-yaw','মিঞা','mia','man','👨'],
  ['ট','ṭo','taw','টমেটো','tomato','tomato','🍅'],['ঠ','ṭho','thaw','ঠোঁট','thot','lips','👄'],['ড','ḍo','daw','ডাব','dab','green coconut','🥥'],['ঢ','ḍho','dhaw','ঢোল','dhol','drum','🥁'],['ণ','murdhonno no','naw','হরিণ','horin','deer','🦌'],
  ['ত','to','taw, soft','তরমুজ','tormuj','watermelon','🍉'],['থ','tho','thaw, soft','থালা','thala','plate','🍽️'],['দ','do','daw, soft','দরজা','dorja','door','🚪'],['ধ','dho','dhaw, soft','ধান','dhan','rice plant','🌾'],['ন','donto no','naw','নৌকা','nouka','boat','⛵'],
  ['প','po','paw','পাখি','pakhi','bird','🐦'],['ফ','pho','faw','ফুল','phul','flower','🌸'],['ব','bo','baw','বই','boi','book','📖'],['ভ','bho','bhaw','ভালুক','bhaluk','bear','🐻'],['ম','mo','maw','মাছ','mach','fish','🐟'],
  ['য','ontostho jo','jaw','যাদু','jadu','magic','🪄'],['র','ro','raw','রংধনু','rongdhonu','rainbow','🌈'],['ল','lo','law','লেবু','lebu','lemon','🍋'],['শ','talobbo sho','shaw','শাপলা','shapla','water lily','🪷'],['ষ','murdhonno sho','shaw','ষাঁড়','shar','bull','🐂'],
  ['স','donto so','saw','সাপ','shap','snake','🐍'],['হ','ho','haw','হাঁস','hash','duck','🦆'],['ড়','ṛo','raw, flapped','পাহাড়','pahar','hill','⛰️'],['ঢ়','ṛho','rhaw','আষাঢ়','ashar','rainy month','🌧️'],['য়','ontostho o','yaw','ময়ূর','moyur','peacock','🦚'],
  ['ৎ','khondo to','t','শরৎ','shorot','autumn','🍂'],['ং','onushar','ng','রং','rong','color','🎨'],['ঃ','bisorgo','h','দুঃখ','dukkho','sad','😢'],['ঁ','chondrobindu','a nasal sound','চাঁদ','chand','moon','🌙']
];
const BN_NUMS = [['০','shunno','zero'],['১','ek','one'],['২','dui','two'],['৩','tin','three'],['৪','char','four'],['৫','panch','five'],['৬','chhoy','six'],['৭','shat','seven'],['৮','at','eight'],['৯','noy','nine'],['১০','dosh','ten']];
/* [letter, name, Arabic name (for an Arabic voice), sound hint, word, word in English letters, meaning, emoji, joins to next letter?] */
const AR_LETTERS = [
  ['ا','alif','ألف','ah','أسد','asad','lion','🦁',0],['ب','ba','باء','b','بطة','batta','duck','🦆',1],['ت','ta','تاء','t','تفاحة','tuffaha','apple','🍎',1],['ث','tha','ثاء','th, as in think','ثعلب','tha‘lab','fox','🦊',1],
  ['ج','jim','جيم','j','جمل','jamal','camel','🐪',1],['ح','ḥa','حاء','a breathy h','حصان','ḥisan','horse','🐴',1],['خ','kha','خاء','kh, like clearing your throat','خروف','kharuf','sheep','🐑',1],['د','dal','دال','d','دب','dubb','bear','🐻',0],
  ['ذ','dhal','ذال','th, as in this','ذرة','dhura','corn','🌽',0],['ر','ra','راء','a rolled r','ريشة','risha','feather','🪶',0],['ز','zay','زاي','z','زرافة','zarafa','giraffe','🦒',0],['س','sin','سين','s','سمكة','samaka','fish','🐟',1],
  ['ش','shin','شين','sh','شمس','shams','sun','☀️',1],['ص','ṣad','صاد','a heavy s','صقر','ṣaqr','falcon','🦅',1],['ض','ḍad','ضاد','a heavy d','ضفدع','ḍifda‘','frog','🐸',1],['ط','ṭa','طاء','a heavy t','طائرة','ṭa’ira','airplane','✈️',1],
  ['ظ','ẓa','ظاء','a heavy th','ظرف','ẓarf','envelope','✉️',1],['ع','‘ayn','عين','a deep throat sound','عين','‘ayn','eye','👁️',1],['غ','ghayn','غين','gh, like gargling','غيمة','ghayma','cloud','☁️',1],['ف','fa','فاء','f','فيل','fil','elephant','🐘',1],
  ['ق','qaf','قاف','a deep k','قمر','qamar','moon','🌙',1],['ك','kaf','كاف','k','كتاب','kitab','book','📖',1],['ل','lam','لام','l','ليمون','laymun','lemon','🍋',1],['م','mim','ميم','m','موز','mawz','banana','🍌',1],
  ['ن','nun','نون','n','نجمة','najma','star','⭐',1],['ه','ha','هاء','h','هدية','hadiyya','gift','🎁',1],['و','waw','واو','w','وردة','warda','rose','🌹',0],['ي','ya','ياء','y','يد','yad','hand','✋',1]
];
const AR_NUMS = [['٠','sifr','zero','صفر'],['١','wahid','one','واحد'],['٢','ithnan','two','اثنان'],['٣','thalatha','three','ثلاثة'],['٤','arba‘a','four','أربعة'],['٥','khamsa','five','خمسة'],['٦','sitta','six','ستة'],['٧','sab‘a','seven','سبعة'],['٨','thamaniya','eight','ثمانية'],['٩','tis‘a','nine','تسعة'],['١٠','‘ashara','ten','عشرة']];

/* Speak in Bangla or Arabic when the device has that voice; otherwise use an English pronunciation guide */
Voice.forLang = function(code){ return this.list.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(code)).sort((a, b) => this.score({...a, lang:'en-US', name:a.name}) - this.score({...b, lang:'en-US', name:b.name}))[0] || null; };
let langNoticeShown = {};
function speakIn(code, native, english){
  const v = Voice.forLang(code);
  if (v) return speak(native, {lang:code, quiet:true});
  if (!langNoticeShown[code]){ langNoticeShown[code] = true; toast(`No ${code === 'bn' ? 'Bangla' : 'Arabic'} voice on this device, so the English voice will help. See ⚙️ Settings for tips.`); }
  return speak(english, {quiet:true});
}
const ALPHA_TABS = [['bnv','🇧🇩 বাংলা স্বরবর্ণ'],['bnc','🇧🇩 ব্যঞ্জনবর্ণ'],['bnn','🇧🇩 সংখ্যা ১২৩'],['ar','🇸🇦 الحروف Arabic'],['arn','🇸🇦 Arabic numbers ١٢٣']];
function renderAlphabets(tab){
  tab = tab || renderAlphabets.tab || 'bnv'; renderAlphabets.tab = tab;
  setResume({page:'lesson', subject:'alphabets'});
  const isAr = tab.startsWith('ar');
  const bnV = !!Voice.forLang('bn'), arV = !!Voice.forLang('ar');
  show(`${crumbs('Bangla & Arabic', "openSubject('alphabets')")}
  <section class="panel"><div class="section-title"><h1>🔤 Bangla & Arabic letters</h1><span class="pill ${(isAr ? arV : bnV) ? 'mint' : ''}">${(isAr ? arV : bnV) ? '🔊 Native voice ready' : '🔊 English helper voice'}</span></div>
    <div class="tabs">${ALPHA_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" onclick="renderAlphabets('${k}')">${l}</button>`).join('')}</div>
    <div id="alphaZone"></div></section>
  <section class="panel">${activityChips('alphabets')}</section>`);
  ({bnv:() => alphaGrid('bn', BN_VOWELS, 'স্বরবর্ণ: vowels', 'Bangla has 11 vowels. Tap a letter to hear it and see a word.'), bnc:() => alphaGrid('bn', BN_CONS, 'ব্যঞ্জনবর্ণ: consonants', 'Bangla has 39 consonants. Tap a letter to hear it and see a word.'), bnn:() => numGrid('bn'), ar:() => alphaGrid('ar', AR_LETTERS, 'Arabic letters', 'Arabic has 28 letters and is read from right to left. Tap a letter to see its shapes and a word.'), arn:() => numGrid('ar')})[tab]();
}
function alphaGrid(lang, list, title, intro){
  const z = document.getElementById('alphaZone');
  z.innerHTML = `<h2>${title}</h2><p class="muted">${intro}</p>
    <div class="alpha-detail" id="alphaDetail"></div>
    <div class="letter-grid ${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${list.map((L, i) => `<button class="letter-btn ${lang}" onclick="alphaPick('${lang}',${list === BN_VOWELS ? "'v'" : list === BN_CONS ? "'c'" : "'a'"},${i})"><span class="glyph">${L[0]}</span><small>${esc(L[1])}</small></button>`).join('')}</div>`;
  alphaPick(lang, list === BN_VOWELS ? 'v' : list === BN_CONS ? 'c' : 'a', 0, true);
}
function alphaPick(lang, set, i, quiet){
  const list = set === 'v' ? BN_VOWELS : set === 'c' ? BN_CONS : AR_LETTERS, L = list[i], d = document.getElementById('alphaDetail'); if (!d) return;
  document.querySelectorAll('.letter-btn').forEach((b, k) => b.classList.toggle('active', k === i));
  let html;
  if (lang === 'bn'){
    const [ch, name, , word, wr, mean, em] = L;
    html = `<div class="alpha-card"><div class="alpha-big bn">${ch}</div><div class="alpha-info"><h2>${ch} <small>(${esc(name)})</small></h2><p class="alpha-word"><span class="big-emo">${em}</span> <span class="bn-text">${word}</span> <small>${esc(wr)} = ${esc(mean)}</small></p>
      <div class="row-buttons"><button class="btn sky" onclick="alphaSay('bn','${set}',${i})">🔊 Hear it</button><button class="btn secondary" onclick="openTrace('${ch}','bn')">✏️ Trace it</button><button class="btn" ${i === 0 ? 'disabled' : ''} onclick="alphaPick('bn','${set}',${i - 1})">←</button><button class="btn" ${i === list.length - 1 ? 'disabled' : ''} onclick="alphaPick('bn','${set}',${i + 1})">→</button></div></div></div>`;
  } else {
    const [ch, name, , hint, word, wr, mean, em, joins] = L, T = 'ـ';
    const forms = joins ? [['Alone', ch], ['Start', ch + T], ['Middle', T + ch + T], ['End', T + ch]] : [['Alone', ch], ['End', T + ch]];
    html = `<div class="alpha-card"><div class="alpha-big ar">${ch}</div><div class="alpha-info"><h2>${esc(name)} <small>(sounds like ${esc(hint)})</small></h2><p class="alpha-word"><span class="big-emo">${em}</span> <span class="ar-text">${word}</span> <small>${esc(wr)} = ${esc(mean)}</small></p>
      <div class="ar-forms">${forms.map(([n, f]) => `<div><span class="ar-text">${f}</span><small>${n}</small></div>`).join('')}</div>${joins ? '' : '<p class="tiny">This letter does not join to the letter after it.</p>'}
      <div class="row-buttons"><button class="btn sky" onclick="alphaSay('ar','a',${i})">🔊 Hear it</button><button class="btn secondary" onclick="openTrace('${ch}','ar')">✏️ Trace it</button><button class="btn" ${i === 0 ? 'disabled' : ''} onclick="alphaPick('ar','a',${i - 1})">→</button><button class="btn" ${i === list.length - 1 ? 'disabled' : ''} onclick="alphaPick('ar','a',${i + 1})">←</button></div></div></div>`;
  }
  d.innerHTML = html;
  if (!quiet){ alphaSay(lang, set, i); trackDay(); saveAll(); }
}
function alphaSay(lang, set, i){
  if (lang === 'bn'){ const L = (set === 'v' ? BN_VOWELS : BN_CONS)[i]; return speakIn('bn', `${L[0]}। ${L[3]}।`, `${L[2]}. ${L[4]}. ${L[5]}.`); }
  const L = AR_LETTERS[i]; return speakIn('ar', `${L[2]}. ${L[4]}.`, `${L[1]}. ${L[5]}. ${L[6]}.`);
}
function numGrid(lang){
  const list = lang === 'bn' ? BN_NUMS : AR_NUMS, z = document.getElementById('alphaZone');
  z.innerHTML = `<h2>${lang === 'bn' ? 'বাংলা সংখ্যা: Bangla numbers' : 'الأرقام: Arabic numbers'}</h2><p class="muted">Tap a number to hear it. Count the dots to check!</p>
    <div class="grid lesson-grid">${list.map((n, i) => `<button class="lesson-card num-card" onclick="${lang === 'bn' ? `speakIn('bn','${n[0]}','${n[1]}. ${n[2]}')` : `speakIn('ar','${n[3]}','${n[1]}. ${n[2]}')`}"><span class="glyph ${lang}">${n[0]}</span><b>${esc(n[1])}</b><small>${n[2]} · ${i}</small><span class="dots">${'●'.repeat(i)}</span></button>`).join('')}</div>`;
}
/* tracing a big letter */
function openTrace(ch, lang){
  const d = document.getElementById('alphaDetail'); if (!d) return;
  d.insertAdjacentHTML('beforeend', `<div class="trace-box" id="traceBox"><div class="canvas-stack trace-stack"><canvas id="traceGuide" width="420" height="420"></canvas><canvas id="traceDraw" width="420" height="420"></canvas></div>
    <div class="row-buttons"><button class="btn small warn" onclick="document.getElementById('traceDraw').getContext('2d').clearRect(0,0,420,420)">🗑️ Clear</button><button class="btn small primary" onclick="traceDone()">✅ I traced it!</button><button class="btn small" onclick="document.getElementById('traceBox').remove()">Close</button></div></div>`);
  document.getElementById('traceBox').scrollIntoView({behavior:'smooth', block:'center'});
  const g = document.getElementById('traceGuide').getContext('2d');
  g.font = `${lang === 'ar' ? 280 : 300}px ${lang === 'ar' ? '"Noto Naskh Arabic","Geeza Pro","Arial"' : '"Noto Sans Bengali","Kohinoor Bangla","Nirmala UI","Vrinda",sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f1ecff'; g.fillText(ch, 210, lang === 'ar' ? 200 : 230); g.setLineDash([10, 9]); g.lineWidth = 4; g.strokeStyle = '#b9a8ee'; g.strokeText(ch, 210, lang === 'ar' ? 200 : 230);
  const c = document.getElementById('traceDraw'), ctx = c.getContext('2d'); ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#ff6fae';
  let on = false, last = null; const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { on = true; last = pos(e); try{ c.setPointerCapture(e.pointerId); }catch(err){} e.preventDefault(); });
  c.addEventListener('pointermove', e => { if (!on) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(ev => c.addEventListener(ev, () => on = false));
  speak('Trace the letter with your finger!', {quiet:true});
}
function traceDone(){ recordResult('alphabets', true, document.getElementById('traceBox')); confetti(16); speak(pick(cheers) + ' Beautiful writing!', {quiet:true}); }

/* alphabet games */
MATCHES.bnPics = {title:'Match the Bangla letter to its picture', get pairs(){ return [...BN_VOWELS, ...BN_CONS.slice(0, 32)].map(L => [`<span class="glyph bn">${L[0]}</span>`, `<span class="big-emo">${L[6]}</span><small>${L[4]}</small>`, '', L[5]]); }};
MATCHES.arPics = {title:'Match the Arabic letter to its picture', get pairs(){ return AR_LETTERS.map(L => [`<span class="glyph ar">${L[0]}</span>`, `<span class="big-emo">${L[7]}</span><small>${L[5]}</small>`, L[1], L[6]]); }};
ORDERS.bnVowels = {title:'Put the first Bangla vowels in order', items:() => BN_VOWELS.slice(0, 6).map(L => [`<span class="glyph bn">${L[0]}</span>`, L[2]])};
ORDERS.arOrder = {title:'Put these Arabic letters in order (start on the right!)', items:() => { const s = rand(0, 23); return AR_LETTERS.slice(s, s + 5).map(L => [`<span class="glyph ar">${L[0]}</span>`, L[1]]); }};
playNames.alphabets = 'Find the letter';
function alphaFindPlay(){
  const z = document.getElementById('playZone'); if (!z) return;
  const isAr = Math.random() < .5, list = isAr ? AR_LETTERS : [...BN_VOWELS, ...BN_CONS], t = pick(list), opts = shuffle([t, ...shuffle(list.filter(x => x !== t)).slice(0, 3)]);
  const sayIt = () => isAr ? speakIn('ar', t[2], `Find ${t[1]}. Like ${t[5]}, ${t[6]}.`) : speakIn('bn', t[0], `Find ${t[2]}. Like ${t[4]}, ${t[5]}.`);
  z.innerHTML = `<div class="question"><button class="speak-btn" id="afSay">🔊</button><h2>Find the ${isAr ? 'Arabic' : 'Bangla'} letter <span style="color:var(--purple)">${esc(t[1])}</span> <span class="big-emo">${isAr ? t[7] : t[6]}</span></h2></div>
    <div class="choice-grid">${opts.map((o, k) => `<button class="choice" data-k="${k}"><span class="glyph ${isAr ? 'ar' : 'bn'}">${o[0]}</span></button>`).join('')}</div><p id="playFeedback" class="feedback"></p><button id="playNext" class="btn big" onclick="alphaFindPlay()">Next letter →</button>`;
  z.querySelector('#afSay').onclick = sayIt;
  let done = false;
  z.querySelectorAll('.choice').forEach(b => b.onclick = () => { if (done) return; const o = opts[+b.dataset.k]; if (o === t){ done = true; b.classList.add('good'); playWin('alphabets', b); } else { b.classList.add('bad'); b.disabled = true; playMiss('Look again!'); } });
  sayIt();
}
GEN.alphabets = [
  ['bangla letters', () => { const all = [...BN_VOWELS, ...BN_CONS], t = pick(all); return {q:`Which letter is this?`, html:`<div class="q-glyph bn">${t[0]}</div>`, say:'Which Bangla letter is this?', choices:[t[1], ...shuffle(all.filter(x => x !== t && x[1] !== t[1])).slice(0, 2).map(x => x[1])], a:t[1], explain:`That is ${t[1]}, like ${t[4]}, ${t[5]}.`}; }],
  ['bangla words', () => { const all = [...BN_VOWELS, ...BN_CONS.slice(0, 32)], t = pick(all); return {q:`Which letter does ${t[6]} ${t[4]} (${t[5]}) start with?`, html:`<div class="q-glyph bn" style="font-size:44px">${t[3]}</div>`, choices:[t[0], ...shuffle(all.filter(x => x !== t)).slice(0, 2).map(x => x[0])], a:t[0], explain:`${t[4]} starts with ${t[0]}.`}; }],
  ['arabic letters', () => { const t = pick(AR_LETTERS); return {q:'Which Arabic letter is this?', html:`<div class="q-glyph ar">${t[0]}</div>`, choices:[t[1], ...shuffle(AR_LETTERS.filter(x => x !== t)).slice(0, 2).map(x => x[1])], a:t[1], explain:`That is ${t[1]}, like ${t[5]}, ${t[6]}.`}; }],
  ['arabic words', () => { const t = pick(AR_LETTERS); return {q:`Which letter does ${t[7]} ${t[5]} (${t[6]}) start with?`, html:`<div class="q-glyph ar" style="font-size:48px">${t[4]}</div>`, choices:[t[0], ...shuffle(AR_LETTERS.filter(x => x !== t)).slice(0, 2).map(x => x[0])], a:t[0], explain:`${t[5]} starts with ${t[1]}.`}; }],
  ['numbers', () => { const bn = Math.random() < .5, list = bn ? BN_NUMS : AR_NUMS, i = rand(1, 9); return {q:`Which ${bn ? 'Bangla' : 'Arabic'} number is ${i}?`, choices:[list[i][0], list[(i + 3) % 10][0], list[(i + 6) % 10][0]], a:list[i][0], explain:`${list[i][0]} is ${i}, said “${list[i][1]}”.`}; }]
];

/* ---------- router: moves between subjects without reloading the page ---------- */
function parseLocation(){
  const file = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  const key = !file || file === 'index' ? '' : file;
  const p = new URLSearchParams(location.search), extra = {};
  p.forEach((v, k) => { if (k !== 'mode') extra[k] = v; });
  return {key, mode:p.get('mode') || 'subject', extra};
}
function dispatchRoute(key, mode, extra){
  if (!key || !subjects.some(s => s.key === key)){
    if (mode === 'routine') return renderRoutine();
    if (mode === 'stickers') return renderStickerBook();
    return renderHome();
  }
  if (mode === 'learn') return renderLearn(key);
  if (mode === 'quiz') return renderQuiz(key);
  if (mode === 'play') return renderPlay(key, extra.game);
  if (mode === 'story' && key === 'reading') return renderStory(Math.max(0, Math.min(illustratedStories.length - 1, Number(extra.index) || 0)));
  return renderSubject(key);
}
function routeTo(key, mode = 'subject', extra = {}, push = true){
  stopSpeaking();
  if (typeof Listen !== 'undefined') Listen.stop();
  pageKey = key; document.body.dataset.subject = key;
  if (push){
    const qs = mode !== 'subject' ? '?' + new URLSearchParams({mode, ...extra}) : '';
    try{ history.pushState({key, mode, extra}, '', (key || 'index') + '.html' + qs); }catch(e){}
  }
  document.title = key && subjects.some(s => s.key === key) ? `${subj(key).title} | Ruhaimah’s Learning World` : 'Ruhaimah’s Learning World';
  dispatchRoute(key, mode, extra);
}
window.addEventListener('popstate', e => { const st = e.state || parseLocation(); routeTo(st.key || '', st.mode || 'subject', st.extra || {}, false); });

/* ---------- start ---------- */
Voice.init();
saveAll();
(function boot(){
  const st = parseLocation();
  try{ history.replaceState(st, ''); }catch(e){}
  routeTo(st.key, st.mode, st.extra, false);
})();

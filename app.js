/* Ruhaimah's Learning World — v4
   One script for every page. Each page sets <body data-subject="...">. */
'use strict';
const app = document.getElementById('app');
const STORE_KEY = 'ruhaimah-learning-v3';   // kept so existing progress carries over
const LEGACY_KEY = 'ruhaimah-v1';
const VOICE_KEY = 'ruhaimah-voice-settings';
const defaultSave = {stars:0,stats:{},days:{},journal:'',dailyDone:{},resume:null,storiesRead:{},ttt:{win:0,lose:0,tie:0},stickers:0};
const defaultVoice = {audio:true,sfx:true,autoRead:true,speed:.85,pitch:1.05,voiceURI:''};
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
  ['sfx','autoRead','audio'].forEach(k => { if (typeof p[k] !== 'boolean') p[k] = defaultVoice[k]; });
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
  return String(t)
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
  const v = Voice.pick();
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
  const before = Math.floor((saved.stars || 0) / 10);
  saved.stars = (saved.stars || 0) + n;
  const after = Math.floor(saved.stars / 10);
  if (fromEl) flyStar(fromEl);
  if (after > before){
    const st = STICKERS[(after - 1) % STICKERS.length];
    setTimeout(() => { toast(`🎁 New sticker unlocked: ${st}`); confetti(30); Sfx.win(); }, 500);
  }
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
    const all = DAILY.every(x => saved.dailyDone[t][x.key]);
    if (all) setTimeout(() => { toast('🏆 Daily path complete! +3 bonus stars'); addStars(3); saveAll(); confetti(40); }, 900);
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
  {key:'reading', emoji:'📚', title:'Reading & phonics', desc:'Picture stories, ABCs and sounds', color:'#ffe3ee'},
  {key:'math', emoji:'🧮', title:'Math', desc:'Counting, adding and taking away', color:'#dcf6e5'},
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
  {key:'games', emoji:'🎲', title:'Games', desc:'Tic-tac-toe and memory match', color:'#ffdfe6', isNew:true}
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

/* ---------- quiz banks (5 random questions each time) ---------- */
const quizBank = {
  english:[
    {q:'Which is the opposite of big?', choices:['small','loud','run'], a:'small', explain:'Small is the opposite of big.'},
    {q:'Which is the opposite of hot?', choices:['cold','wet','tall'], a:'cold', explain:'Cold is the opposite of hot.'},
    {q:'Which sentence is written correctly?', choices:['i like cats.','I like cats.','i Like cats'], a:'I like cats.', explain:'A sentence starts with a capital letter and ends with a period.'},
    {q:'Which word means more than one dog?', choices:['dogs','dog','a dog'], a:'dogs', explain:'Dogs means more than one dog.'},
    {q:'Which word is an action?', choices:['jump','table','blue'], a:'jump', explain:'Jump is something you can do.'},
    {q:'Which word is a thing?', choices:['ball','run','happy'], a:'ball', explain:'A ball is a thing. It is a naming word.'},
    {q:'What goes at the end of a question?', choices:['?','.','!'], a:'?', say:'What goes at the end of a question? A question mark, a period, or an exclamation mark?', explain:'A question ends with a question mark.'},
    {q:'Which word rhymes with cake?', choices:['lake','cat','sun'], a:'lake', explain:'Cake and lake rhyme.'},
    {q:'Which letter is a vowel?', choices:['a','b','t'], a:'a', explain:'A is a vowel. The vowels are a, e, i, o, u.'},
    {q:'Which is the opposite of up?', choices:['down','in','fast'], a:'down', explain:'Down is the opposite of up.'}
  ],
  science:[
    {q:'Which planet do we live on?', choices:['Mars','Earth','Jupiter'], a:'Earth', explain:'We live on Earth.'},
    {q:'What do plants need to grow?', choices:['sunlight and water','shoes','television'], a:'sunlight and water', explain:'Plants need sunlight and water.'},
    {q:'Which one is a star?', choices:['the Moon','the Sun','Earth'], a:'the Sun', explain:'The Sun is a star.'},
    {q:'Which planet comes after Earth?', choices:['Venus','Mars','Saturn'], a:'Mars', explain:'The order is Mercury, Venus, Earth, Mars.'},
    {q:'Which planet has big rings?', choices:['Earth','Saturn','Mars'], a:'Saturn', explain:'Saturn is famous for its rings.'},
    {q:'Which is the biggest planet?', choices:['Jupiter','Mercury','Earth'], a:'Jupiter', explain:'Jupiter is the biggest planet.'},
    {q:'What does a caterpillar turn into?', choices:['a butterfly','a frog','a bird'], a:'a butterfly', explain:'A caterpillar becomes a butterfly.'},
    {q:'Where does a fish live?', choices:['in water','in a tree','in the sky'], a:'in water', explain:'Fish live in water.'},
    {q:'What is ice?', choices:['frozen water','hot sand','a cloud'], a:'frozen water', explain:'Ice is frozen water.'},
    {q:'What does a magnet pull?', choices:['paper clips','paper','wood'], a:'paper clips', explain:'Magnets pull things made of iron, like paper clips.'}
  ],
  logic:[
    {q:'What comes next?', visual:'🔴 🔵 🔴 🔵 🔴 ❓', say:'Red, blue, red, blue, red. What comes next?', choices:['🔵','🔴','🟢'], a:'🔵', explain:'The pattern repeats red, blue.'},
    {q:'What comes next?', visual:'⭐ ⭐ 🌙 ⭐ ⭐ 🌙 ⭐ ❓', say:'Star, star, moon, star, star, moon, star. What comes next?', choices:['⭐','🌙','☀️'], a:'⭐', explain:'Star, star, moon. So after one star comes another star.'},
    {q:'Which is the odd one out?', visual:'🍎 🍌 🚗 🍇', say:'Apple, banana, car, grapes. Which is the odd one out?', choices:['🍎','🚗','🍇'], a:'🚗', explain:'The car is not a fruit.'},
    {q:'Which is the odd one out?', visual:'🐶 🐱 🐰 🌳', say:'Dog, cat, rabbit, tree. Which is the odd one out?', choices:['🌳','🐱','🐰'], a:'🌳', explain:'The tree is not an animal.'},
    {q:'Which is the biggest number?', choices:['4','9','2'], a:'9', explain:'Nine is the biggest.'},
    {q:'Which is the smallest number?', choices:['7','3','5'], a:'3', explain:'Three is the smallest.'},
    {q:'Which animal is the biggest?', choices:['🐘','🐭','🐱'], a:'🐘', say:'Which animal is the biggest? Elephant, mouse, or cat?', explain:'The elephant is the biggest.'},
    {q:'How many sides does a triangle have?', choices:['3','4','5'], a:'3', explain:'A triangle has three sides.'},
    {q:'What comes next? 2, 4, 6, …', choices:['8','7','10'], a:'8', say:'Two, four, six. What comes next?', explain:'We count by twos: 2, 4, 6, 8.'},
    {q:'Which one is a fruit?', choices:['🍓','🥕','🍞'], a:'🍓', say:'Which one is a fruit? Strawberry, carrot, or bread?', explain:'A strawberry is a fruit.'}
  ],
  school:[
    {q:'Which letter comes after B?', choices:['C','A','D'], a:'C', explain:'A, B, C. C comes after B.'},
    {q:'Which number comes after 7?', choices:['8','6','9'], a:'8', explain:'Seven, eight. Eight comes after seven.'},
    {q:'Which shape is round?', choices:['circle','square','triangle'], a:'circle', explain:'A circle is round.'},
    {q:'How many sides does a square have?', choices:['4','3','5'], a:'4', explain:'A square has four sides.'},
    {q:'What should you do before you answer?', choices:['listen carefully','guess fast','close the screen'], a:'listen carefully', explain:'It is important to listen carefully.'},
    {q:'After you finish, you should…', choices:['check your work','throw your pencil','skip everything'], a:'check your work', explain:'Checking helps you catch mistakes.'},
    {q:'Which word starts with the letter M?', choices:['moon','sun','cat'], a:'moon', explain:'Moon starts with M.'},
    {q:'What color do you get when you mix red and yellow?', choices:['orange','green','purple'], a:'orange', explain:'Red and yellow make orange.'},
    {q:'Which is the letter S?', choices:['S','Z','C'], a:'S', say:'Which one is the letter S?', explain:'That is the letter S.'},
    {q:'How many legs does a dog have?', choices:['4','2','6'], a:'4', explain:'A dog has four legs.'}
  ],
  general:[
    {q:'How many seasons are there?', choices:['2','4','8'], a:'4', explain:'There are four seasons: spring, summer, fall and winter.'},
    {q:'Which day comes after Monday?', choices:['Sunday','Tuesday','Friday'], a:'Tuesday', explain:'Tuesday comes after Monday.'},
    {q:'How many days are in a week?', choices:['7','5','10'], a:'7', explain:'There are seven days in a week.'},
    {q:'How many months are in a year?', choices:['12','7','10'], a:'12', explain:'There are twelve months in a year.'},
    {q:'Which season is the coldest?', choices:['winter','summer','spring'], a:'winter', explain:'Winter is the coldest season.'},
    {q:'What do you use on a rainy day?', choices:['an umbrella','sunglasses','a sled'], a:'an umbrella', explain:'An umbrella keeps you dry.'},
    {q:'Which one can fly?', choices:['an airplane','a car','a boat'], a:'an airplane', explain:'An airplane flies in the sky.'},
    {q:'Which month comes first?', choices:['January','June','December'], a:'January', explain:'January is the first month of the year.'},
    {q:'When do we usually see stars?', choices:['at night','at lunch','in the morning'], a:'at night', explain:'We see stars at night.'},
    {q:'Who helps us when we are sick?', choices:['a doctor','a pilot','a baker'], a:'a doctor', explain:'A doctor helps us when we are sick.'}
  ],
  rhymes:[
    {q:'Which rhyme is about a star?', choices:['Twinkle, Twinkle, Little Star','Rain, Rain, Go Away','Humpty Dumpty'], a:'Twinkle, Twinkle, Little Star', explain:'Twinkle, Twinkle is about a little star.'},
    {q:'Who sat on a wall?', choices:['Humpty Dumpty','Jack','Miss Muffet'], a:'Humpty Dumpty', explain:'Humpty Dumpty sat on a wall.'},
    {q:'Where did Jack and Jill go?', choices:['up the hill','to the beach','to school'], a:'up the hill', explain:'Jack and Jill went up the hill.'},
    {q:'What ran up the clock?', choices:['a mouse','a cat','a dog'], a:'a mouse', explain:'The mouse ran up the clock.'},
    {q:'How many bags of wool did the black sheep have?', choices:['3','2','5'], a:'3', explain:'Three bags full!'},
    {q:'Which word rhymes with star?', choices:['car','fish','book'], a:'car', explain:'Star and car rhyme.'},
    {q:'Which word rhymes with hill?', choices:['Jill','hat','cup'], a:'Jill', explain:'Hill and Jill rhyme.'},
    {q:'Which word rhymes with clock?', choices:['dock','cat','sun'], a:'dock', explain:'Clock and dock rhyme.'},
    {q:'What do you row in the song?', choices:['a boat','a car','a bike'], a:'a boat', explain:'Row, row, row your boat.'}
  ],
  chess:[
    {q:'Which piece moves in an L shape?', choices:['Knight ♘','King ♔','Rook ♖'], a:'Knight ♘', explain:'The knight moves in an L shape.'},
    {q:'Which piece moves diagonally?', choices:['Bishop ♗','Pawn ♙','Rook ♖'], a:'Bishop ♗', explain:'The bishop moves diagonally.'},
    {q:'Which piece moves in straight lines?', choices:['Rook ♖','Knight ♘','Bishop ♗'], a:'Rook ♖', explain:'The rook moves in straight lines.'},
    {q:'Which piece can move in every direction, many squares?', choices:['Queen ♕','Pawn ♙','King ♔'], a:'Queen ♕', explain:'The queen is the strongest piece.'},
    {q:'How far does the king move?', choices:['one square','two squares','across the board'], a:'one square', explain:'The king moves one square at a time.'},
    {q:'Which piece can jump over other pieces?', choices:['Knight ♘','Rook ♖','Queen ♕'], a:'Knight ♘', explain:'Only the knight can jump.'},
    {q:'How many squares are on a chess board?', choices:['64','20','100'], a:'64', explain:'A chess board has 64 squares, 8 by 8.'},
    {q:'Which piece moves forward one square?', choices:['Pawn ♙','Bishop ♗','Queen ♕'], a:'Pawn ♙', explain:'The pawn moves forward.'}
  ],
  art:[
    {q:'Red + yellow makes…', choices:['orange','green','purple'], a:'orange', say:'Red and yellow make what color?', explain:'Red and yellow make orange.'},
    {q:'Blue + yellow makes…', choices:['green','orange','pink'], a:'green', say:'Blue and yellow make what color?', explain:'Blue and yellow make green.'},
    {q:'Red + blue makes…', choices:['purple','yellow','brown'], a:'purple', say:'Red and blue make what color?', explain:'Red and blue make purple.'},
    {q:'Red + white makes…', choices:['pink','black','blue'], a:'pink', say:'Red and white make what color?', explain:'Red and white make pink.'},
    {q:'Which one is a color?', choices:['blue','circle','square'], a:'blue', explain:'Blue is a color.'},
    {q:'How many sides does a triangle have?', choices:['3','4','5'], a:'3', explain:'A triangle has three sides.'},
    {q:'What do you paint with?', choices:['a brush','a spoon','a shoe'], a:'a brush', explain:'We paint with a brush.'},
    {q:'What color is the sky on a sunny day?', choices:['blue','green','black'], a:'blue', explain:'The sky is blue on a sunny day.'}
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
  {id:'bones',name:'Bones / Skeleton',fact:'Bones hold your body up and protect your organs.'}
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
function bodySVG(active='head'){
  const hi = id => active===id ? '#ffb74d' : '#7fbee9';
  return `<svg viewBox="0 0 340 600" width="100%" aria-label="Kid-friendly body diagram">
    <circle cx="170" cy="82" r="48" fill="#ffd9c9" stroke="#80594a" stroke-width="2"/>
    <rect x="130" y="130" width="80" height="150" rx="30" fill="#7fd1ff" stroke="#4e7e9a" stroke-width="2"/>
    <rect x="82" y="145" width="42" height="120" rx="20" fill="#ffd9c9" stroke="#80594a" stroke-width="2"/>
    <rect x="216" y="145" width="42" height="120" rx="20" fill="#ffd9c9" stroke="#80594a" stroke-width="2"/>
    <rect x="138" y="280" width="28" height="170" rx="16" fill="#ffd9c9" stroke="#80594a" stroke-width="2"/>
    <rect x="174" y="280" width="28" height="170" rx="16" fill="#ffd9c9" stroke="#80594a" stroke-width="2"/>
    <rect x="126" y="448" width="52" height="24" rx="10" fill="#c3e27a" stroke="#6c8d35" stroke-width="2"/>
    <rect x="166" y="448" width="52" height="24" rx="10" fill="#c3e27a" stroke="#6c8d35" stroke-width="2"/>
    <circle cx="152" cy="92" r="6" fill="#342547"/>
    <circle cx="188" cy="92" r="6" fill="#342547"/>
    <path d="M153 120 Q170 134 187 120" fill="none" stroke="#a24a60" stroke-width="4" stroke-linecap="round"/>
    <circle cx="170" cy="108" r="4" fill="#ff9c87"/>
    <ellipse cx="152" cy="210" rx="18" ry="24" fill="${hi('heart')}" opacity=".95"/>
    <ellipse cx="187" cy="210" rx="22" ry="28" fill="${hi('lungs')}" opacity=".75"/>
    <ellipse cx="152" cy="212" rx="22" ry="28" fill="${hi('lungs')}" opacity=".75"/>
    <ellipse cx="170" cy="270" rx="34" ry="28" fill="${hi('stomach')}" opacity=".8"/>
    <circle cx="170" cy="82" r="52" fill="transparent" stroke="${hi('head')}" stroke-width="6"/>
    <circle cx="170" cy="92" r="18" fill="transparent" stroke="${hi('eye')}" stroke-width="4" opacity="${active==='eye'?1:0}"/>
    <circle cx="117" cy="95" r="13" fill="transparent" stroke="${hi('ear')}" stroke-width="6"/>
    <path d="M170 100 L170 115" stroke="${hi('nose')}" stroke-width="6" stroke-linecap="round"/>
    <path d="M150 122 Q170 142 190 122" fill="none" stroke="${hi('mouth')}" stroke-width="6" stroke-linecap="round"/>
    <rect x="76" y="145" width="188" height="125" rx="28" fill="transparent" stroke="${hi('arm')}" stroke-width="6" opacity=".9"/>
    <rect x="36" y="286" width="44" height="38" rx="12" fill="transparent" stroke="${hi('hand')}" stroke-width="6"/>
    <rect x="126" y="278" width="78" height="174" rx="20" fill="transparent" stroke="${hi('leg')}" stroke-width="6"/>
    <rect x="120" y="442" width="102" height="38" rx="14" fill="transparent" stroke="${hi('foot')}" stroke-width="6"/>
    <g opacity="${active==='bones' ? 1 : .32}">
      <circle cx="275" cy="100" r="28" fill="#fff" stroke="#888" stroke-width="3"/>
      <line x1="275" y1="128" x2="275" y2="240" stroke="#888" stroke-width="6"/>
      <line x1="240" y1="155" x2="310" y2="155" stroke="#888" stroke-width="6"/>
      <line x1="248" y1="155" x2="232" y2="210" stroke="#888" stroke-width="6"/>
      <line x1="302" y1="155" x2="318" y2="210" stroke="#888" stroke-width="6"/>
      <line x1="255" y1="240" x2="235" y2="325" stroke="#888" stroke-width="6"/>
      <line x1="295" y1="240" x2="315" y2="325" stroke="#888" stroke-width="6"/>
      <text x="275" y="355" text-anchor="middle" font-size="13" fill="#666">Simple skeleton</text>
    </g>
  </svg>`;
}
function storyPicture(scene){
 const tree='<rect x="249" y="105" width="22" height="103" rx="5" fill="#98623d"/><circle cx="260" cy="90" r="56" fill="#70be73"/><circle cx="225" cy="104" r="33" fill="#83cf7c"/>';
 const kid='<circle cx="89" cy="109" r="25" fill="#c98d65"/><path d="M65 106Q60 75 88 77Q116 75 115 108Q90 90 65 106" fill="#523735"/><circle cx="82" cy="110" r="2.5"/><circle cx="98" cy="110" r="2.5"/><path d="M84 120Q90 125 96 120" fill="none" stroke="#703f3a" stroke-width="2"/><path d="M69 140Q90 125 111 140L117 191H62Z" fill="#a184ea"/><path d="M77 190V218M103 190V218" stroke="#47567e" stroke-width="11" stroke-linecap="round"/><path d="M68 145L48 168M111 145L136 125" stroke="#c98d65" stroke-width="10" stroke-linecap="round"/>';
 const flower='<path d="M0 15V50" stroke="#40965c" stroke-width="5"/><ellipse cx="-9" cy="35" rx="12" ry="5" fill="#69ba68"/><g fill="#f4a0bd"><circle cx="-10" cy="0" r="10"/><circle cx="10" cy="0" r="10"/><circle cx="0" cy="-10" r="10"/><circle cx="0" cy="10" r="10"/></g><circle r="8" fill="#ffcf60"/>';
 const scenes={kite:kid+'<path d="M136 125Q190 130 228 62" fill="none" stroke="#776b86" stroke-width="2"/><path d="M228 18L263 61L228 104L193 61Z" fill="#e95e64" stroke="#b83d4f" stroke-width="2"/><path d="M228 18V104M193 61H263" stroke="#ffb6ae" stroke-width="2"/>',cat:'<rect x="105" y="130" width="140" height="83" rx="8" fill="#c28c57"/><ellipse cx="175" cy="131" rx="70" ry="19" fill="#97663f"/><ellipse cx="175" cy="114" rx="50" ry="34" fill="#edb56e"/><path d="M137 92L141 57L163 81M187 81L211 57L216 94" fill="#edb56e"/><path d="M151 111Q159 117 167 111M183 111Q191 117 199 111" fill="none" stroke="#664736" stroke-width="3"/><path d="M169 123L181 123L175 128Z" fill="#bb6876"/>',seed:kid+'<path d="M172 202Q230 172 300 202V224H172Z" fill="#9e6b43"/><g transform="translate(240 151)">'+flower+'</g><path d="M136 125L169 142" stroke="#c98d65" stroke-width="8"/><path d="M150 133H180V163H150Z" fill="#5fb6dd"/><path d="M180 145L202 160" stroke="#5fb6dd" stroke-width="8"/><path d="M203 169L201 180M210 172L208 183" stroke="#5fb6dd" stroke-width="3"/>',pond:'<ellipse cx="175" cy="177" rx="151" ry="55" fill="#73cae6"/><ellipse cx="112" cy="184" rx="45" ry="13" fill="#69ae67"/><ellipse cx="112" cy="162" rx="30" ry="20" fill="#76c76a"/><circle cx="96" cy="146" r="12" fill="#76c76a"/><circle cx="128" cy="146" r="12" fill="#76c76a"/><circle cx="96" cy="144" r="4"/><circle cx="128" cy="144" r="4"/><path d="M100 165Q112 172 124 165" fill="none" stroke="#326c39" stroke-width="2"/><ellipse cx="238" cy="156" rx="37" ry="22" fill="#fff5cb"/><circle cx="263" cy="133" r="18" fill="#fff5cb"/><path d="M278 132L298 139L278 145Z" fill="#ef9a3b"/><circle cx="267" cy="129" r="3"/>',moon:'<rect width="350" height="240" fill="#202957"/><circle cx="265" cy="64" r="40" fill="#f6e9bd"/><circle cx="251" cy="50" r="9" fill="#d6cba5"/><circle cx="282" cy="75" r="12" fill="#d6cba5"/><g fill="#fff4b9"><circle cx="55" cy="40" r="3"/><circle cx="180" cy="32" r="4"/><circle cx="320" cy="120" r="3"/><circle cx="42" cy="140" r="4"/></g><g transform="translate(150 120) rotate(28)"><path d="M0 -70Q40 -30 24 32H-24Q-40 -30 0 -70" fill="#f5f6ff"/><path d="M-24 10L-46 45L-20 35M24 10L46 45L20 35" fill="#ed747a"/><circle cy="-18" r="15" fill="#83ceef"/><path d="M-13 35L0 80L13 35Z" fill="#ffc45b"/></g>',ball:tree+kid+'<circle cx="240" cy="207" r="19" fill="#fff" stroke="#667" stroke-width="2"/><path d="M240 194L251 202L247 215H233L229 202Z" fill="#505168"/>',rain:'<rect width="350" height="240" fill="#dbe6f4"/><ellipse cx="100" cy="218" rx="76" ry="14" fill="#9bcde8"/>'+kid+'<path d="M28 102Q86 13 148 102Z" fill="#ef7b9b"/><path d="M88 102V160Q88 173 99 173" fill="none" stroke="#6b5979" stroke-width="4"/><g stroke="#8bb5dc" stroke-width="3">'+Array.from({length:16},(_,i)=>`<path d="M${12+i*21} ${20+(i%4)*36}l-7 15"/>`).join('')+'</g>',butterfly:'<g transform="translate(245 145)">'+flower+'</g><g transform="translate(150 105)"><ellipse cx="-26" cy="-20" rx="35" ry="29" transform="rotate(25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="26" cy="-20" rx="35" ry="29" transform="rotate(-25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="-22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse cx="22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse rx="5" ry="33" fill="#694944"/><path d="M0 -28L-12 -43M0 -28L12 -43" stroke="#694944" stroke-width="2"/></g>'};
 return `<svg class="story-art" viewBox="0 0 350 240" role="img" aria-label="Illustration for ${esc(scene)}"><rect width="350" height="240" fill="#dff3ff"/><circle cx="302" cy="40" r="24" fill="#ffe39a"/><path d="M0 190Q90 153 180 190T350 190V240H0Z" fill="#b9e5a9"/>${scenes[scene]}</svg>`;
}
function planetPicture(name){const colors={Mercury:['#d7d3cc','#77736e'],Venus:['#f6d692','#b77b45'],Earth:['#67c5fa','#2457a3'],Mars:['#f0a16b','#a94d38'],Jupiter:['#f6d9ad','#b98b68'],Saturn:['#fae5ad','#c5a26b'],Uranus:['#b5f1eb','#58a9b8'],Neptune:['#72a8ff','#244aaf']};let c=colors[name];let id='planet'+name;let detail='';if(name==='Earth') detail='<path d="M45 37L60 25 80 32 83 48 69 54 65 70 53 69 49 55 37 48Z M92 72L111 67 122 79 111 92 105 111 95 105 89 85Z M92 30L120 34 129 51 112 58 99 47Z" fill="#71bc79"/><path d="M28 61Q55 48 83 63M80 102Q112 91 130 103" stroke="#fff" stroke-width="7" opacity=".55" fill="none"/>';else if(['Jupiter','Saturn','Venus','Neptune','Uranus'].includes(name)) detail=Array.from({length:7},(_,i)=>`<path d="M15 ${33+i*15}Q80 ${46+i*15} 145 ${31+i*15}" stroke="${i%2?c[1]:'#fff3d9'}" opacity="${name==='Jupiter'?.56:.20}" stroke-width="${i%2?8:5}" fill="none"/>`).join('')+(name==='Jupiter'?'<ellipse cx="105" cy="92" rx="19" ry="8" fill="#bb644d"/>':'');else detail=Array.from({length:10},(_,i)=>`<circle cx="${36+(i*23)%83}" cy="${36+(i*31)%88}" r="${3+i%8}" fill="${c[1]}" opacity=".34"/>`).join('');return `<svg viewBox="0 0 160 160" class="planet-picture" role="img" aria-label="Illustration of ${name}"><defs><radialGradient id="${id}" cx="32%" cy="27%" r="74%"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient><clipPath id="${id}clip"><circle cx="80" cy="80" r="56"/></clipPath></defs>${name==='Saturn'?'<ellipse cx="80" cy="80" rx="78" ry="22" transform="rotate(-22 80 80)" stroke="#e6c98a" stroke-width="12" fill="none"/>':''}<circle cx="80" cy="80" r="56" fill="url(#${id})"/><g clip-path="url(#${id}clip)">${detail}</g>${name==='Saturn'?'<path d="M7 103Q61 117 148 53" stroke="#f5d9a1" stroke-width="8" fill="none" opacity=".9"/>':''}</svg>`;}

/* ---------- navigation (each subject has its own page) ---------- */
const pageKey = document.body.dataset.subject || '';
function nav(key, mode, extra = {}){
  if (key === pageKey) return false;
  stopSpeaking();
  const q = mode && mode !== 'subject' ? '?' + new URLSearchParams({mode, ...extra}) : '';
  location.href = (key || 'index') + '.html' + q;
  return true;
}
function goHome(){ if (!nav('')) renderHome(); }
function openSubject(k){ if (!nav(k)) renderSubject(k); }
function startLearn(k){ if (!nav(k, 'learn')) renderLearn(k); }
function startQuiz(k){ if (!nav(k, 'quiz')) renderQuiz(k); }
function startPlay(k){ if (!nav(k, 'play')) renderPlay(k); }
function openStory(i){ if (!nav('reading', 'story', {index:i})) renderStory(i); }
function resumeNow(){
  const r = saved.resume;
  if (!r || !r.subject) return showDailyPath();
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
  const done = saved.dailyDone[todayKey()] || {}, doneCount = DAILY.filter(d => done[d.key]).length;
  const toNext = 10 - ((saved.stars || 0) % 10);
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
        <button class="btn primary big" onclick="resumeNow()">▶️ ${esc(resumeLabel())}</button>
        <button class="btn secondary" onclick="openSubject('games')">🎲 Play Tic-Tac-Toe</button>
        <button class="btn gold" onclick="${sayAttr(greeting() + ', Ruhaimah! What would you like to learn today?')}">🔊 Say hello</button>
      </div>
      <div class="next-sticker"><span class="tiny"><b>${toNext}</b> more ⭐ to your next sticker</span><div class="progress"><i style="width:${(10 - toNext) * 10}%"></i></div></div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>🗓️ Today’s learning path</h2><span class="pill ${doneCount === DAILY.length ? 'mint' : ''}">${doneCount} / ${DAILY.length} done · 🔥 ${streak()} day streak</span></div>
      <div class="path">${dailyCards()}</div>
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
function showDailyPath(){ renderHome(); setTimeout(() => { const p = document.querySelector('.path'); p && p.scrollIntoView({behavior:'smooth', block:'center'}); }, 50); }

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
      <div class="mode-card quiz"><div class="bigicon">📝</div><h3>${key === 'geo' ? 'Map quiz' : 'Quiz'}</h3><p>${key === 'geo' ? 'Find places on the map.' : '5 questions. Earn stars!'}</p><button class="btn gold" onclick="startQuiz('${key}')">Start Quiz</button></div>
      <div class="mode-card play"><div class="bigicon">🎮</div><h3>Play</h3><p>${esc(playNames[key] || 'Mini game')}</p><button class="btn" style="background:#ffd3e8" onclick="startPlay('${key}')">Let’s play</button></div>
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
  const special = {reading:readingLibrary, geo:renderGeographyLearn, science:renderScienceLearn, body:renderBodyLearn, rhymes:renderRhymes, art:renderArt, chess:renderChess, games:renderGamesHub, math:renderMathLearn, english:renderEnglishLearn};
  if (special[key]) return special[key]();
  const s = subj(key);
  show(`${crumbs(s.title, `openSubject('${key}')`)}
  <section class="panel"><div class="section-title"><h1>📘 Learn: ${esc(s.title)}</h1>${speakBtn(`Let’s learn ${s.title}! Tap a card to hear it.`)}</div>
    ${lessonCards(lessons[key] || [])}
    <div class="row-buttons"><button class="btn gold" onclick="startQuiz('${key}')">📝 Ready for the quiz</button><button class="btn" onclick="startPlay('${key}')">🎮 Play a game</button></div>
  </section>`);
}

/* ---------- quiz engine ---------- */
function blankFact(f){ return f.replace(/Your \w+|Hands|Legs|Feet|You use your \w+/, '___'); }
function numChoices(ans){
  const set = new Set([ans]);
  for (const d of shuffle([1, -1, 2, -2, 3])){ if (set.size >= 3) break; if (ans + d >= 0) set.add(ans + d); }
  return shuffle([...set]).map(String);
}
function mathItem(){
  const E = pick(['🍎','⭐','🐟','🧁','🌸','🐞','🎈']);
  const type = pick(['add','add','sub','count','compare','next']);
  if (type === 'add'){ const a = rand(1, 6), b = rand(1, 4); return {q:`${a} + ${b} = ?`, visual:`${E.repeat(a)} ➕ ${E.repeat(b)}`, choices:numChoices(a + b), a:String(a + b), explain:`${a} plus ${b} equals ${a + b}.`}; }
  if (type === 'sub'){ const a = rand(3, 9), b = rand(1, a - 1); return {q:`${a} − ${b} = ?`, visual:`${E.repeat(a)}`, say:`${a} take away ${b}. How many are left?`, choices:numChoices(a - b), a:String(a - b), explain:`${a} take away ${b} leaves ${a - b}.`}; }
  if (type === 'count'){ const n = rand(3, 12); return {q:'How many can you count?', visual:E.repeat(n), choices:numChoices(n), a:String(n), explain:`There are ${n}.`}; }
  if (type === 'compare'){ const a = rand(1, 20); let b = rand(1, 20); while (b === a) b = rand(1, 20); return {q:'Which number is bigger?', choices:[String(a), String(b)], a:String(Math.max(a, b)), explain:`${Math.max(a, b)} is bigger than ${Math.min(a, b)}.`}; }
  const n = rand(1, 18); return {q:`What number comes after ${n}?`, choices:numChoices(n + 1), a:String(n + 1), explain:`After ${n} comes ${n + 1}.`};
}
function makeQuiz(key){
  if (key === 'math') return Array.from({length:5}, mathItem);
  if (key === 'reading'){
    const stories = shuffle(illustratedStories).slice(0, 3).map(x => ({q:x.q, choices:x.choices, a:x.a, explain:x.lines.join(' '), passage:x.lines.join(' '), scene:x.scene}));
    const letters = shuffle(ALPHABET).slice(0, 2).map(([L, em, w]) => {
      const others = shuffle(ALPHABET.filter(x => x[0] !== L)).slice(0, 2);
      return {q:`Which word starts with ${L}?`, choices:shuffle([[em, w], ...others.map(o => [o[1], o[2]])]).map(([e, ww]) => `${e} ${ww}`), a:`${em} ${w}`, explain:`${w} starts with the letter ${L}.`};
    });
    return shuffle([...stories, ...letters]);
  }
  if (key === 'body'){
    const ask = bodyParts.filter(x => x.id !== 'bones');
    return shuffle(ask).slice(0, 5).map((t, i) => i < 3
      ? {q:'Which body part is glowing orange?', html:`<div class="svg-box" style="max-width:300px">${bodySVG(t.id)}</div>`, choices:shuffle([t.name, ...shuffle(ask.filter(x => x.id !== t.id)).slice(0, 2).map(x => x.name)]), a:t.name, explain:t.fact}
      : {q:'Which body part? ' + blankFact(t.fact), say:'Which body part? ' + blankFact(t.fact).replace('___','blank'), choices:shuffle([t.name, ...shuffle(ask.filter(x => x.id !== t.id)).slice(0, 2).map(x => x.name)]), a:t.name, explain:t.fact});
  }
  return shuffle(quizBank[key] || []).slice(0, 5).map(q => ({...q, choices:shuffle(q.choices)}));
}
function renderQuiz(key){
  if (key === 'geo') return renderGeographyQuiz();
  if (key === 'games') return renderGamesHub();
  setResume({page:'quiz', subject:key});
  currentQuiz = {subject:key, index:0, right:0, items:makeQuiz(key), results:[]};
  renderQuizCard();
}
function renderQuizCard(){
  const Q = currentQuiz, q = Q.items[Q.index];
  if (!q) return quizDone();
  const s = subj(Q.subject);
  const dots = Q.items.map((_, i) => `<span class="${i < Q.index ? (Q.results[i] ? 'right' : 'wrong') : i === Q.index ? 'now' : ''}"></span>`).join('');
  const sayQ = q.say || q.q;
  show(`${crumbs(s.title, `openSubject('${Q.subject}')`)}
  <section class="panel">
    <div class="section-title"><h1>📝 ${esc(s.title)} quiz</h1><span class="pill">Question ${Q.index + 1} of ${Q.items.length}</span></div>
    <div class="quiz-dots" aria-hidden="true">${dots}</div>
    ${q.passage ? `<div class="story-layout">${q.scene ? storyPicture(q.scene) : ''}<div class="story-box">${esc(q.passage)}<div class="row-buttons">${speakBtn(q.passage, 'Read the story')}</div></div></div>` : ''}
    <div class="question">${speakBtn(sayQ)}<h2>${esc(q.q)}</h2></div>
    ${q.visual ? `<div class="q-visual" aria-hidden="true">${esc(q.visual)}</div>` : ''}${q.html || ''}
    <div class="choice-grid">${q.choices.map((c, i) => `<button class="choice" data-i="${i}" onclick="answerQuiz(${i}, this)">${esc(c)}</button>`).join('')}</div>
    <div class="feedback" id="feedback" aria-live="polite"></div>
    <button id="nextQuestion" class="btn primary big" hidden onclick="nextQuestion()">${Q.index + 1 < Q.items.length ? 'Next question →' : 'See my stars 🌟'}</button>
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
  const Q = currentQuiz, s = subj(Q.subject), n = Q.items.length, r = Q.right;
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
  const got = Math.floor((saved.stars || 0) / 10);
  const shelf = STICKERS.map((s, i) => `<span class="${i < got ? '' : 'locked'}" title="${i < got ? 'Unlocked' : 'Locked'}">${s}</span>`).join('');
  const t = saved.ttt || {win:0, lose:0, tie:0};
  const last7 = Array.from({length:7}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const k = dateKey(d); return {label:d.toLocaleDateString('en-US', {weekday:'short'}), n:saved.days[k] || 0}; });
  const maxN = Math.max(1, ...last7.map(x => x.n));
  show(`${crumbs('Home', 'goHome()')}
  <section class="panel"><div class="section-title"><h1>📊 Parent dashboard</h1><button class="btn small" onclick="exportProgress()">⬇️ Export progress</button></div>
    <div class="grid stat-grid"><div class="stat"><b>${saved.stars || 0}</b>Total stars</div><div class="stat"><b>${accuracy()}%</b>Accuracy</div><div class="stat"><b>${streak()}</b>Day streak</div><div class="stat"><b>${Object.keys(saved.days).length}</b>Active days</div><div class="stat"><b>${Object.keys(saved.storiesRead || {}).length}/${illustratedStories.length}</b>Stories read</div></div>
    <h2 style="margin-top:20px">This week</h2>
    <div style="display:flex;gap:10px;align-items:flex-end;height:120px">${last7.map(x => `<div style="flex:1;text-align:center"><div title="${x.n} activities" style="height:${Math.round(x.n / maxN * 90) + 4}px;background:${x.n ? 'linear-gradient(#8f6cf0,#6b46d6)' : '#ece4fb'};border-radius:10px 10px 4px 4px"></div><span class="tiny">${x.label}</span></div>`).join('')}</div>
    <h2 style="margin-top:20px">Stickers</h2><div class="sticker-shelf">${shelf}</div><p class="tiny">A new sticker every 10 stars.</p>
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
    voicePrefs.audio = g('audioOn').checked; voicePrefs.autoRead = g('autoRead').checked; voicePrefs.sfx = g('sfxOn').checked;
    voicePrefs.speed = Number(g('speed').value); voicePrefs.pitch = Number(g('pitch').value);
    saveAll(); if (!quiet) toast('Saved ✓');
  }
  const sp = voicePrefs.speed, pi = voicePrefs.pitch;
  g('speedLbl').textContent = sp < .75 ? '(extra slow)' : sp < .92 ? '(slow & clear)' : sp < 1.05 ? '(normal)' : '(quick)';
  g('pitchLbl').textContent = pi < .95 ? '(calm)' : pi < 1.12 ? '(natural)' : '(cheerful)';
}

/* ---------- reading ---------- */
function readingLibrary(){
  setResume({page:'lesson', subject:'reading'});
  const read = saved.storiesRead || {};
  show(`${crumbs('Reading', "openSubject('reading')")}
  <section class="panel"><div class="section-title"><h1>📚 Story library</h1><span class="pill">${Object.keys(read).length} / ${illustratedStories.length} read</span></div>
    <p>Choose a picture story. Read it yourself, or tap 🔊 and follow the yellow line.</p>
    <div class="grid story-grid">${illustratedStories.map((x, i) => `<button class="story-tile" onclick="openStory(${i})">${storyPicture(x.scene)}<strong>${read[i] ? '<span class="done-mark">✅</span>' : ''}${esc(x.title)}</strong><small>4 short sentences</small></button>`).join('')}</div>
  </section>
  <section class="panel"><div class="section-title"><h2>🔤 ABC sounds</h2>${speakBtn('Tap a letter to hear it.')}</div>
    <div class="alphabet-grid">${ALPHABET.map(([L, em, w]) => `<button class="alpha" onclick="${sayAttr(L === 'X' ? `X. X is in fox.` : `${L}. ${L} is for ${w}.`)}"><b>${L}${L.toLowerCase()}</b><span>${em}</span><small>${w}</small></button>`).join('')}</div>
  </section>
  <section class="panel"><h2>🧩 Phonics & sight words</h2>${lessonCards(lessons.reading)}</section>`);
}
function renderStory(i){
  i = Math.max(0, Math.min(illustratedStories.length - 1, i));
  setResume({page:'story', subject:'reading', index:i});
  const x = illustratedStories[i];
  show(`${crumbs('Story library', "startLearn('reading')")}
  <section class="panel"><div class="section-title"><h1>${x.emoji} ${esc(x.title)}</h1><span class="pill">${i + 1} / ${illustratedStories.length}</span></div>
    <div class="story-layout">${storyPicture(x.scene)}<div>
      <div class="story-box">${x.lines.map((l, j) => `<button class="story-line" onclick="readStoryLine(${i},${j})">${esc(l)} <span aria-hidden="true">🔊</span></button>`).join('')}</div>
      <div class="row-buttons"><button class="btn primary" onclick="readWholeStory(${i})">🔊 Read to me</button><button class="btn gold" onclick="storyQuiz(${i})">📝 Story question</button></div>
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
function renderMathLearn(){
  setResume({page:'lesson', subject:'math'});
  show(`${crumbs('Math', "openSubject('math')")}
  <section class="panel"><div class="section-title"><h1>🧮 Learn: Math</h1>${speakBtn('Let’s learn math! Tap the boxes to count.')}</div>
    <div class="body-wrap">
      <div><h2>🔟 Ten frame</h2><p>Tap a box to add a ladybug. Tap again to take it away.</p>
        <div class="ten-frame" id="tenFrame">${Array.from({length:10}, (_, i) => `<button aria-label="Box ${i + 1}" onclick="tenTap(${i})"></button>`).join('')}</div>
        <div class="row-buttons"><button class="btn small" onclick="tenSet(0)">Clear</button><button class="btn small" onclick="tenSet(${rand(1, 9)})">Surprise me</button></div></div>
      <div class="fact" style="text-align:center"><div class="big-number" id="tenNum">0</div><p id="tenWords" style="font-size:22px;font-weight:800"></p></div>
    </div>
  </section>
  <section class="panel"><h2>📖 Math ideas</h2>${lessonCards(lessons.math)}
    <div class="row-buttons"><button class="btn gold" onclick="startQuiz('math')">📝 Math quiz</button></div></section>`);
  tenSet(0, true);
}
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
function renderScienceLearn(tab = 'space'){
  setResume({page:'lesson', subject:'science'});
  show(`${crumbs('Science', "openSubject('science')")}
  <section class="panel"><h1>🔬 Science explorer</h1>
    <div class="tabs"><button class="tab ${tab === 'space' ? 'active' : ''}" onclick="renderScienceLearn('space')">🪐 Planets & space</button><button class="tab ${tab === 'nature' ? 'active' : ''}" onclick="renderScienceLearn('nature')">🌱 Animals & plants</button><button class="tab" onclick="openSubject('body')">🧍 Human body</button></div>
    ${tab === 'space' ? `<div class="space-intro"><span style="font-size:48px">☀️</span><div><h2>Our solar system</h2><p>Eight planets travel around the Sun. Tap a planet to learn about it. (Pictures are not to scale.)</p></div></div>
      <div class="row-buttons"><button class="btn primary" onclick="planetTour()">🚀 Take the planet tour</button></div>
      <div class="grid planet-grid">${planets.map((p, i) => `<button class="planet-card" onclick="planetDetails(${i})">${planetPicture(p.name)}<strong>${i + 1}. ${p.name}</strong><small>${esc(p.fact)}</small></button>`).join('')}</div>
      <div id="planetInfo" class="fact" aria-live="polite"><h2>Choose a planet!</h2></div>
      <div class="grid lesson-grid"><div class="lesson-card"><span class="big-emoji">☀️</span><h3>The Sun</h3><p>A star that gives us light and heat.</p><div class="row-buttons">${speakBtn('The Sun is a star. It gives us light and heat.', 'Listen')}</div></div><div class="lesson-card"><span class="big-emoji">🌙</span><h3>The Moon</h3><p>Our Moon travels around Earth. Sometimes we see it in the daytime too.</p><div class="row-buttons">${speakBtn('The Moon travels around Earth. Sometimes we can see it in the daytime too.', 'Listen')}</div></div></div>`
    : lessonCards(lessons.science)}
  </section>`);
}
function planetDetails(i){ const p = planets[i]; document.getElementById('planetInfo').innerHTML = `<h2>${p.name}</h2><p>Planet number ${i + 1} from the Sun. ${esc(p.fact)}</p>`; document.querySelectorAll('.planet-card').forEach((c, j) => c.style.outline = j === i ? '4px solid #ffc23d' : ''); return speak(`Planet number ${i + 1}. ${p.name}. ${p.fact}`); }
async function planetTour(){
  const t = speechToken + 1;
  for (let i = 0; i < planets.length; i++){
    const ok = await planetDetails(i);
    document.querySelectorAll('.planet-card')[i].scrollIntoView({block:'nearest', behavior:'smooth'});
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
      <div class="svg-box">${bodySVG(activeBodyPart)}<div class="skeleton-tip">🦴 Tap <strong>Bones / Skeleton</strong> to see a simple skeleton.</div></div>
      <div>
        <div class="fact"><h3>${p.name}</h3><p style="font-size:22px">${p.fact}</p><div class="row-buttons">${speakBtn(p.name + '. ' + p.fact, 'Listen')}</div></div>
        <div class="label-list">${bodyParts.map(x => `<button class="body-btn ${x.id === activeBodyPart ? 'active' : ''}" onclick="pickBodyPart('${x.id}')">${x.name}</button>`).join('')}</div>
      </div>
    </div>
  </section>
  <section class="panel"><h2>📖 Body facts</h2>${lessonCards(lessons.body)}</section>`);
}
function pickBodyPart(id){ activeBodyPart = id; const y = window.scrollY; renderBodyLearn(); window.scrollTo(0, y); const p = bodyParts.find(x => x.id === id); speak(p.name + '. ' + p.fact, {quiet:true}); }

/* ---------- rhymes ---------- */
function renderRhymes(){
  setResume({page:'lesson', subject:'rhymes'});
  show(`${crumbs('Rhymes', "openSubject('rhymes')")}
  <section class="panel"><div class="section-title"><h1>🎵 Nursery rhymes</h1><span class="pill">${EN_RHYMES.length} rhymes</span></div>
    <p class="muted">Tap <b>Listen</b> to hear the rhyme and follow the yellow line. Try <b>Echo</b>: the voice reads a line, then you say it back!</p>
    <div class="grid lesson-grid">${EN_RHYMES.map((r, i) => `<div class="rhyme-card" id="rhyme${i}"><span class="rhyme-emoji">${r.emoji}</span><h3>${esc(r.title)}</h3><div>${r.lines.map(l => `<span class="rhyme-line">${esc(l)}</span>`).join('')}</div><div class="row-buttons"><button class="btn small secondary" onclick="speakRhyme(${i})">🔊 Listen</button><button class="btn small" onclick="speakRhyme(${i}, true)">🗣️ Echo</button></div></div>`).join('')}</div>
  </section>`);
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
  <section class="panel"><div class="section-title"><h1>🎨 Art studio</h1>${speakBtn('Draw anything you like! Pick a color, a brush, or a stamp.')}</div>
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
  </section>`);
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
  </section>`);
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
function renderGeographyLearn(){
  setResume({page:'lesson', subject:'geo'});
  show(`${crumbs('Geography', "openSubject('geo')")}
  <section class="panel"><div class="section-title"><h1>🌍 Explore the map</h1>${speakBtn('Explore the map. Tap a place to hear its name.')}</div>${geoTabs(false)}<div id="mapArea"></div></section>`);
  loadMapMode('usStates', false);
}
function renderGeographyQuiz(){
  setResume({page:'quiz', subject:'geo'});
  show(`${crumbs('Geography', "openSubject('geo')")}
  <section class="panel"><div class="section-title"><h1>📝 Map quiz</h1><span class="pill">Find it on the map</span></div>${geoTabs(true)}<div id="mapArea"></div></section>`);
  loadMapMode('usStates', true);
}

/* ---------- Play: one mini game per subject ---------- */
function renderPlay(key){
  if (key === 'games') return renderGamesHub();
  setResume({page:'play', subject:key});
  const s = subj(key);
  show(`${crumbs(s.title, `openSubject('${key}')`)}
  <section class="panel"><div class="section-title"><h1>🎮 ${esc(playNames[key] || 'Play')}</h1><span class="pill" id="playScore">⭐ 0 this game</span></div><div id="playZone"></div></section>`);
  playScore = 0; newPlay(key);
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
      <div class="mode-card quiz"><div class="bigicon">♟️</div><h3>Chess moves</h3><p>Learn how each chess piece moves.</p><button class="btn gold" onclick="startLearn('chess')">Open Chess</button></div>
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
    if (MEM.matched === MEM.size){ setTimeout(() => { recordResult('games', true, document.getElementById('memGrid')); confetti(); Sfx.win(); speak(`You found all the pairs in ${MEM.moves} moves! Great memory!`, {quiet:true}); document.getElementById('memInfo').textContent = `🎉 Done in ${MEM.moves} moves!`; }, 500); }
  } else {
    MEM.lock = true;
    setTimeout(() => { ea.classList.remove('open'); eb.classList.remove('open'); MEM.lock = false; }, 900);
  }
}

/* ---------- start ---------- */
Voice.init();
saveAll();
(function boot(){
  const p = new URLSearchParams(location.search), mode = p.get('mode');
  if (!pageKey) return renderHome();
  if (!subjects.some(s => s.key === pageKey)) return renderHome();
  if (mode === 'learn') return renderLearn(pageKey);
  if (mode === 'quiz') return renderQuiz(pageKey);
  if (mode === 'play') return renderPlay(pageKey);
  if (mode === 'story' && pageKey === 'reading') return renderStory(Number(p.get('index')) || 0);
  renderSubject(pageKey);
})();

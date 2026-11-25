
const app = document.getElementById('app');
const STORE_KEY='ruhaimah-learning-v3';
const LEGACY_KEY='ruhaimah-v1';
const VOICE_KEY='ruhaimah-voice-settings';
const defaultSave={stars:0,stats:{},days:{},journal:'',dailyDone:{},resume:null};
let saved=loadSaved();
let voicePrefs=loadVoicePrefs();
let currentQuiz=null;
let geoDataCache={};
let mapState={mode:'usStates',game:false,target:null,done:[],selected:null,wrong:null,showLabels:true};
let speechToken=0, currentAudio=null;

function loadSaved(){
  let out=JSON.parse(JSON.stringify(defaultSave));
  try{ const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null'); if(legacy) out={...out,...legacy,stats:{...out.stats,...(legacy.stats||{})}}; }catch(e){}
  try{ const now=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(now) out={...out,...now,stats:{...out.stats,...(now.stats||{})},days:{...out.days,...(now.days||{})}}; }catch(e){}
  return out;
}
function loadVoicePrefs(){
  try{return Object.assign({speed:.8,pitch:1,audio:true,lang:'auto'},JSON.parse(localStorage.getItem(VOICE_KEY)||'{}'))}catch(e){return {speed:.8,pitch:1,audio:true,lang:'auto'}}
}
function saveAll(){
  try{localStorage.setItem(STORE_KEY,JSON.stringify(saved));localStorage.setItem(VOICE_KEY,JSON.stringify(voicePrefs));}catch(e){}
  document.getElementById('starsBtn').textContent='⭐ '+(saved.stars||0);
}
function todayKey(){return new Date().toLocaleDateString('en-CA')}
function trackDay(){saved.days[todayKey()]=(saved.days[todayKey()]||0)+1;saveAll()}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._id);toast._id=setTimeout(()=>t.classList.remove('show'),2200)}
function esc(s){return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function statFor(k){return saved.stats[k]||{right:0,total:0}}
function streak(){ const keys=Object.keys(saved.days).sort(); if(!keys.length) return 0; let s=0; let d=new Date(); while(true){ const key=d.toISOString().slice(0,10); if(saved.days[key]){s++; d.setDate(d.getDate()-1);} else break;} return s; }
function accuracy(){ const vals=Object.entries(saved.stats).filter(([k])=>k!=='bangla').map(([,v])=>v); let r=0,t=0; vals.forEach(v=>{r+=v.right||0;t+=v.total||0}); return t?Math.round(r*100/t):0 }
function recordResult(subject, ok){ if(!saved.stats[subject]) saved.stats[subject]={right:0,total:0}; saved.stats[subject].total++; if(ok) saved.stats[subject].right++; if(ok){ saved.stars=(saved.stars||0)+1; toast('⭐ Great job! +1 star'); } trackDay(); saveAll(); }
function setResume(page){stopSpeaking();saved.resume=page; saveAll();}
function stopSpeaking(){ speechToken++; try{speechSynthesis.cancel()}catch(e){} if(currentAudio){try{currentAudio.pause()}catch(e){} currentAudio=null} }
let activeUtterance=null,lastSpoken='';
function englishVoices(){return 'speechSynthesis' in window?speechSynthesis.getVoices().filter(v=>/^en([-_]|$)/i.test(v.lang)):[]}
function usVoices(){return englishVoices().filter(v=>/^en[-_]US$/i.test(v.lang))}
function naturalUS(){return usVoices().filter(v=>/enhanced|premium|natural|neural|google us english/i.test(v.name)&&!/compact|espeak|robot/i.test(v.name))}
function pickVoice(){const vs=usVoices();return vs.find(v=>v.voiceURI===voicePrefs.voiceURI)||naturalUS()[0]||vs.find(v=>/samantha|ava|jenny|aria/i.test(v.name))||vs.find(v=>v.default)||vs[0]||null}
function speakRhyme(index){const r=EN_RHYMES[index];if(r)speak(r.text,true)}
function speak(text,rhyme=false){lastSpoken=String(text);if(!voicePrefs.audio){toast('Sound is off. Turn it on in Settings.');return}if(!('speechSynthesis' in window)){toast('Speech is unavailable in this browser.');return}stopSpeaking();const token=speechToken;const synth=window.speechSynthesis;const v=rhyme?(naturalUS().find(v=>v.voiceURI===voicePrefs.voiceURI)||naturalUS()[0]):pickVoice();if(!v){toast(rhyme?'No enhanced US voice found. Download an enhanced US English voice in device settings.':'No US English voice available. Check device settings.');return}const u=new SpeechSynthesisUtterance(rhyme?lastSpoken.replace(/\n/g,' '):lastSpoken.replace(/\n/g,'. ').replace(/\s*\+\s*/g,' plus ').replace(/\s*=\s*/g,' equals '));u.lang='en-US';u.voice=v;u.rate=rhyme?.95:Number(voicePrefs.speed)||.85;u.pitch=rhyme?1:Number(voicePrefs.pitch)||1;u.volume=1;activeUtterance=u;u.onerror=e=>{if(token===speechToken&&!['canceled','interrupted'].includes(e.error))toast('Voice could not play. Check device voice settings.')};u.onend=()=>{if(token===speechToken)activeUtterance=null};try{synth.resume();synth.speak(u)}catch(e){toast('Speech is unavailable. Try another browser.')}}
function refreshVoices(){const el=document.getElementById('voiceChoice');if(!el)return;const vs=usVoices();el.innerHTML='<option value="">Automatic US English voice</option>'+vs.map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');el.value=voicePrefs.voiceURI||'';}
if('speechSynthesis' in window){speechSynthesis.addEventListener('voiceschanged',refreshVoices)}
const subjects=[
  {key:'reading', emoji:'📚', title:'Reading & phonics', desc:'Stories, sounds and sight words', color:'#ffe7ef'},
  {key:'math', emoji:'🧮', title:'Math', desc:'Addition, subtraction and number sense', color:'#e0f7e8'},
  {key:'english', emoji:'✏️', title:'English & writing', desc:'Grammar, spelling and sentence writing', color:'#fff1d3'},
  {key:'science', emoji:'🔬', title:'Science', desc:'Space, animals and nature', color:'#dff3ff'},
  {key:'body', emoji:'🧍', title:'Human body', desc:'Body parts and bones', color:'#ebf7ff'},
  {key:'logic', emoji:'🧩', title:'Logic & puzzles', desc:'Patterns, sorting and thinking', color:'#efe4ff'},
  {key:'school', emoji:'🎯', title:'School practice', desc:'Mixed kindergarten practice', color:'#dfe9ff'},
  {key:'general', emoji:'💡', title:'General knowledge', desc:'Seasons, calendar and everyday facts', color:'#ffe8d7'},
  {key:'geo', emoji:'🌍', title:'Geography', desc:'USA states and Bangladesh map', color:'#d9f6ef'},
  {key:'rhymes', emoji:'🎵', title:'Rhymes', desc:'English nursery rhymes', color:'#fff3c9'},
  {key:'art', emoji:'🎨', title:'Art & creativity', desc:'Draw, color and create', color:'#ffe4f1'},
  {key:'chess', emoji:'♟️', title:'Chess', desc:'Learn how pieces move', color:'#ece9ff'},
];

const lessons={
  reading:[
    {title:'Short story', text:'Mia has a little red bag. She puts a book and a snack inside. Then she goes to the park with her mom.', listen:'Mia has a little red bag. She puts a book and a snack inside. Then she goes to the park with her mom.'},
    {title:'Sound family', text:'-at family: cat, bat, hat, mat.\nTry reading each word slowly.', listen:'At family. Cat. Bat. Hat. Mat.'},
    {title:'Sight words', text:'Read these words: the, and, is, can, you, we, go', listen:'The. And. Is. Can. You. We. Go.'},
    {title:'Blending', text:'Say the sounds slowly: s-a-t = sat.\nc-a-p = cap.\nsh-i-p = ship.', listen:'S-a-t says sat. C-a-p says cap. Sh-i-p says ship.'}
  ],
  math:[
    {title:'Addition', text:'When we add, we put numbers together. Example: 3 + 2 = 5', listen:'When we add, we put numbers together. Three plus two equals five.'},
    {title:'Number bonds', text:'5 can be 2 and 3, or 4 and 1, or 5 and 0.', listen:'Five can be two and three. Or four and one. Or five and zero.'},
    {title:'Count on', text:'Start at 4. Count on 3 more: 5, 6, 7. So 4 + 3 = 7.', listen:'Start at four. Count on three more. Five, six, seven.'}
  ],
  english:[
    {title:'Sentence basics', text:'A sentence starts with a capital letter and ends with a period.', listen:'A sentence starts with a capital letter and ends with a period.'},
    {title:'Opposites', text:'big / small\nhot / cold\nup / down', listen:'Big and small. Hot and cold. Up and down.'},
    {title:'Writing prompt', text:'Write about your favorite animal in one or two sentences.', listen:'Write about your favorite animal in one or two sentences.'}
  ],
  science:[
    {title:'Solar system', text:'The planets in order are: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.', listen:'The planets in order are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.'},
    {title:'Animals need', text:'Animals need food, water, air and a safe home.', listen:'Animals need food, water, air, and a safe home.'},
    {title:'Plants need', text:'Most plants need sunlight, water, air and nutrients to grow.', listen:'Most plants need sunlight, water, air, and nutrients to grow.'}
  ],
  body:[
    {title:'Our body', text:'Your body helps you move, think, breathe and play.', listen:'Your body helps you move, think, breathe, and play.'},
    {title:'Bones', text:'Bones help hold your body up. Your skeleton is the group of bones inside your body.', listen:'Bones help hold your body up. Your skeleton is the group of bones inside your body.'},
    {title:'Healthy habits', text:'Eat healthy food, drink water, sleep well and move your body every day.', listen:'Eat healthy food, drink water, sleep well, and move your body every day.'}
  ],
  logic:[
    {title:'Pattern', text:'Look at the pattern: red, blue, red, blue... What comes next?', listen:'Look at the pattern. Red, blue, red, blue. What comes next?'},
    {title:'Sorting', text:'We can sort by color, size or shape.', listen:'We can sort by color, size, or shape.'}
  ],
  school:[
    {title:'Test tip', text:'Listen carefully, try your best and stay calm.', listen:'Listen carefully, try your best, and stay calm.'},
    {title:'Check your work', text:'When you finish, look back and check your answer.', listen:'When you finish, look back and check your answer.'}
  ],
  general:[
    {title:'Seasons', text:'The four seasons are spring, summer, fall and winter.', listen:'The four seasons are spring, summer, fall, and winter.'},
    {title:'Weekdays', text:'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.', listen:'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.'}
  ]
};

const quizzes={
  reading:[
    {q:'Which word rhymes with cat?', choices:['sun','hat','cup'], a:'hat', explain:'Cat and hat end with the same sound.'},
    {q:'Which word starts with sh?', choices:['ship','sip','cap'], a:'ship', explain:'S and h together make the sh sound.'},
    {q:'What did Mia carry?', choices:['a kite','a red bag','a shoe'], a:'a red bag', explain:'Mia had a little red bag.'}
  ],
  math:[
    {q:'3 + 2 = ?', choices:['4','5','6'], a:'5', explain:'Three plus two equals five.'},
    {q:'5 + 1 = ?', choices:['7','6','4'], a:'6', explain:'Five plus one equals six.'},
    {q:'2 + 4 = ?', choices:['5','6','7'], a:'6', explain:'Two plus four equals six.'}
  ],
  english:[
    {q:'Which one is the opposite of big?', choices:['small','loud','run'], a:'small', explain:'Small is the opposite of big.'},
    {q:'Which sentence begins correctly?', choices:['i like cats.','I like cats.','i Like cats.'], a:'I like cats.', explain:'A sentence starts with a capital letter.'},
    {q:'Choose the plural:', choices:['dogs','dog','a dog'], a:'dogs', explain:'Dogs means more than one dog.'}
  ],
  science:[
    {q:'Which planet do we live on?', choices:['Mars','Earth','Jupiter'], a:'Earth', explain:'We live on Earth.'},
    {q:'What do plants need?', choices:['sunlight and water','shoes','television'], a:'sunlight and water', explain:'Plants need sunlight and water.'},
    {q:'Which is a star?', choices:['Moon','Sun','Earth'], a:'Sun', explain:'The Sun is a star.'}
  ],
  body:[
    {q:'Which part helps you think?', choices:['brain','knee','foot'], a:'brain', explain:'Your brain helps you think.'},
    {q:'Which part helps you breathe?', choices:['lungs','toes','ears'], a:'lungs', explain:'Your lungs help you breathe.'},
    {q:'What is a skeleton made of?', choices:['bones','water','clouds'], a:'bones', explain:'A skeleton is made of bones.'}
  ],
  logic:[
    {q:'What comes next? Red, blue, red, blue, ...', choices:['green','blue','red'], a:'red', explain:'The pattern repeats red, blue.'},
    {q:'Which is the biggest number?', choices:['4','9','2'], a:'9', explain:'Nine is the biggest.'}
  ],
  school:[
    {q:'What should you do before clicking an answer?', choices:['listen carefully','guess fast','close the screen'], a:'listen carefully', explain:'It is important to listen carefully.'},
    {q:'After finishing, you should...', choices:['check your work','throw your pencil','skip everything'], a:'check your work', explain:'Checking helps you catch mistakes.'}
  ],
  general:[
    {q:'How many seasons are there?', choices:['2','4','8'], a:'4', explain:'There are four seasons.'},
    {q:'Which comes after Monday?', choices:['Sunday','Tuesday','Friday'], a:'Tuesday', explain:'Tuesday comes after Monday.'}
  ]
};

const EN_RHYMES=[
  {title:'Twinkle, Twinkle, Little Star', text:`Twinkle, twinkle, little star,\nHow I wonder what you are.\nUp above the world so high,\nLike a diamond in the sky.`},
  {title:'Rain, Rain, Go Away', text:`Rain, rain, go away,\nCome again another day.\nLittle children want to play,\nRain, rain, go away.`},
  {title:'One, Two, Buckle My Shoe', text:`One, two, buckle my shoe,\nThree, four, shut the door,\nFive, six, pick up sticks,\nSeven, eight, lay them straight.`}
];
const bodyParts=[
  {id:'head',name:'Head',fact:'Your head holds your brain.', x:170,y:72},
  {id:'eye',name:'Eyes',fact:'Your eyes help you see.', x:170,y:92},
  {id:'ear',name:'Ears',fact:'Your ears help you hear.', x:118,y:95},
  {id:'nose',name:'Nose',fact:'Your nose helps you smell.', x:170,y:108},
  {id:'mouth',name:'Mouth',fact:'Your mouth helps you talk and eat.', x:170,y:125},
  {id:'heart',name:'Heart',fact:'Your heart pumps blood.', x:152,y:212},
  {id:'lungs',name:'Lungs',fact:'Your lungs help you breathe.', x:185,y:212},
  {id:'stomach',name:'Stomach',fact:'Your stomach helps digest food.', x:170,y:270},
  {id:'arm',name:'Arms',fact:'You use your arms to lift and hug.', x:80,y:210},
  {id:'hand',name:'Hands',fact:'Hands help you hold and draw.', x:52,y:310},
  {id:'leg',name:'Legs',fact:'Legs help you stand and walk.', x:140,y:410},
  {id:'foot',name:'Feet',fact:'Feet help you balance and walk.', x:136,y:545},
  {id:'bones',name:'Bones / Skeleton',fact:'Bones hold your body up and protect organs.', x:270,y:120}
];
let activeBodyPart='head';

const planets=[
  {name:'Mercury',fact:'Mercury is the closest planet to the Sun.', color:'#b0b0b0'},
  {name:'Venus',fact:'Venus is very hot and bright.', color:'#d8b17a'},
  {name:'Earth',fact:'Earth is our home planet.', color:'#4db6ff'},
  {name:'Mars',fact:'Mars is known as the red planet.', color:'#cc6446'},
  {name:'Jupiter',fact:'Jupiter is the biggest planet.', color:'#d8b289'},
  {name:'Saturn',fact:'Saturn has beautiful rings.', color:'#e4c86d'},
  {name:'Uranus',fact:'Uranus is an icy giant.', color:'#8bd8df'},
  {name:'Neptune',fact:'Neptune is far from the Sun.', color:'#5c89ff'}
];

const usaStates = [
['AL','Alabama','Montgomery','South',6,0],['AK','Alaska','Juneau','West',0,7],['AZ','Arizona','Phoenix','West',1,4],['AR','Arkansas','Little Rock','South',5,3],['CA','California','Sacramento','West',0,3],['CO','Colorado','Denver','West',3,3],['CT','Connecticut','Hartford','Northeast',10,2],['DE','Delaware','Dover','South',9,3],['FL','Florida','Tallahassee','South',10,6],['GA','Georgia','Atlanta','South',8,5],['HI','Hawaii','Honolulu','West',2,7],['ID','Idaho','Boise','West',1,1],['IL','Illinois','Springfield','Midwest',6,2],['IN','Indiana','Indianapolis','Midwest',7,2],['IA','Iowa','Des Moines','Midwest',5,2],['KS','Kansas','Topeka','Midwest',4,3],['KY','Kentucky','Frankfort','South',7,3],['LA','Louisiana','Baton Rouge','South',5,5],['ME','Maine','Augusta','Northeast',11,0],['MD','Maryland','Annapolis','South',9,2],['MA','Massachusetts','Boston','Northeast',10,1],['MI','Michigan','Lansing','Midwest',7,1],['MN','Minnesota','Saint Paul','Midwest',5,0],['MS','Mississippi','Jackson','South',6,5],['MO','Missouri','Jefferson City','Midwest',5,3],['MT','Montana','Helena','West',2,1],['NE','Nebraska','Lincoln','Midwest',4,2],['NV','Nevada','Carson City','West',1,2],['NH','New Hampshire','Concord','Northeast',11,1],['NJ','New Jersey','Trenton','Northeast',9,1],['NM','New Mexico','Santa Fe','West',2,4],['NY','New York','Albany','Northeast',9,0],['NC','North Carolina','Raleigh','South',9,4],['ND','North Dakota','Bismarck','Midwest',4,0],['OH','Ohio','Columbus','Midwest',8,2],['OK','Oklahoma','Oklahoma City','South',4,4],['OR','Oregon','Salem','West',0,1],['PA','Pennsylvania','Harrisburg','Northeast',8,1],['RI','Rhode Island','Providence','Northeast',11,2],['SC','South Carolina','Columbia','South',9,5],['SD','South Dakota','Pierre','Midwest',4,1],['TN','Tennessee','Nashville','South',7,4],['TX','Texas','Austin','South',4,5],['UT','Utah','Salt Lake City','West',2,3],['VT','Vermont','Montpelier','Northeast',10,0],['VA','Virginia','Richmond','South',8,3],['WA','Washington','Olympia','West',0,0],['WV','West Virginia','Charleston','South',8,2],['WI','Wisconsin','Madison','Midwest',6,1],['WY','Wyoming','Cheyenne','West',3,2]
];
const bdDivisions={
  'Barishal':['Barguna','Barishal','Bhola','Jhalokati','Patuakhali','Pirojpur'],
  'Chattogram':['Bandarban','Brahmanbaria','Chandpur','Chattogram','Cumilla',"Cox's Bazar",'Feni','Khagrachhari','Lakshmipur','Noakhali','Rangamati'],
  'Dhaka':['Dhaka','Faridpur','Gazipur','Gopalganj','Kishoreganj','Madaripur','Manikganj','Munshiganj','Narayanganj','Narsingdi','Rajbari','Shariatpur','Tangail'],
  'Khulna':['Bagerhat','Chuadanga','Jashore','Jhenaidah','Khulna','Kushtia','Magura','Meherpur','Narail','Satkhira'],
  'Mymensingh':['Jamalpur','Mymensingh','Netrokona','Sherpur'],
  'Rajshahi':['Bogura','Chapainawabganj','Joypurhat','Naogaon','Natore','Pabna','Rajshahi','Sirajganj'],
  'Rangpur':['Dinajpur','Gaibandha','Kurigram','Lalmonirhat','Nilphamari','Panchagarh','Rangpur','Thakurgaon'],
  'Sylhet':['Habiganj','Moulvibazar','Sunamganj','Sylhet']
};
const mapColors=['#f7b4d3','#a9ddff','#f6d98b','#b8e8c1','#d3c1ff','#f6b58b','#9ee1d8','#d8c1a6'];
const bdAliases={barisal:'barishal',chittagong:'chattogram',comilla:'cumilla',jessore:'jashore',bogra:'bogura',netrakona:'netrokona'};
function normName(s){ let k=String(s).toLowerCase().replace(/[^a-z]/g,'').replace(/district$|division$/,''); return bdAliases[k] || k; }

function statsOverview(){
  return `
    <div class="panel">
      <div class="section-title"><h2>🌟 Learning stars & progress</h2><span class="pill">🔥 Streak: ${streak()} day${streak()===1?'':'s'}</span></div>
      <div class="grid stat-grid">
        <div class="stat"><b>${saved.stars||0}</b>Stars earned</div>
        <div class="stat"><b>${accuracy()}%</b>Overall accuracy</div>
        <div class="stat"><b>${Object.keys(saved.days).length}</b>Learning days</div>
        <div class="stat"><b>${Object.keys(saved.stats).length}</b>Subjects practiced</div>
      </div>
    </div>`
}

function goHome(){
  stopSpeaking();
  const subjectCards=subjects.map(s=>`
    <button class="subject-card" style="background:${s.color}" onclick="openSubject('${s.key}')">
      <span class="emoji">${s.emoji}</span>
      <strong>${esc(s.title)}</strong>
      <small>${esc(s.desc)}</small>
    </button>`).join('');
  const dayCards=[
    ['📖 Read a story','Open reading and listen to one short story','openSubject(\'reading\')'],
    ['🧮 Math game','Practice 5 quick addition questions','openSubject(\'math\')'],
    ['🌍 Explore a map','Try USA or Bangladesh map','openSubject(\'geo\')'],
    ['🎵 Listen to a rhyme','Choose English nursery rhymes','openSubject(\'rhymes\')']
  ].map(x=>`<div class="lesson-card"><strong>${x[0]}</strong><p class="muted">${x[1]}</p><button class="btn small primary" onclick="${x[2]}">Start</button></div>`).join('');
  app.innerHTML=`
    <section class="hero">
      <h1>Welcome back, Ruhaimah!</h1>
      <p>A magical learning world with reading, math, maps, science, rhymes, art and more. Big buttons, friendly voice, and fun little quizzes.</p>
      <div class="hero-buttons">
        <button class="btn primary" onclick="resumeNow()">▶️ Continue learning</button>
        <button class="btn secondary" onclick="showDailyPath()">🗓️ Daily path</button>
        <button class="btn gold" onclick="renderSettings()">🎙️ Voice settings</button>
      </div>
    </section>
    ${statsOverview()}
    <section class="panel">
      <div class="section-title"><h2>🪄 Today’s smooth learning path</h2><button class="btn small" onclick="showDailyPath()">Open full plan</button></div>
      <div class="grid lesson-grid">${dayCards}</div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>📚 Choose a subject</h2><span class="muted">Each subject has a Learn area and a Quiz area.</span></div>
      <div class="grid subject-grid">${subjectCards}</div>
    </section>
    <section class="panel">
      <div class="section-title"><h2>👩‍👧 Parent corner</h2><button class="btn small" onclick="openDashboard()">Open dashboard</button></div>
      <div class="checklist">
        <div class="check">✅ Shorter screens and less clutter for easier focus</div>
        <div class="check">✅ Separate Learn and Quiz buttons in every subject</div>
        <div class="check">✅ Slower, friendlier voice with pauses</div>
        <div class="check">✅ “Continue” flow so she can jump back in quickly</div>
      </div>
    </section>`;
}

function showDailyPath(){
  setResume({page:'daily'});
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="goHome()">← Home</button></div>
  <section class="panel"><h1>🗓️ Daily Learning Path</h1><p class="muted">About 25 to 30 minutes.</p>
    <div class="grid lesson-grid">
      <div class="lesson-card"><strong>1. Reading</strong><p>Read a short story and answer a question.</p><button class="btn small primary" onclick="openSubject('reading')">Start</button></div>
      <div class="lesson-card"><strong>2. Phonics</strong><p>Practice sounds, letters or simple words.</p><button class="btn small primary" onclick="startLearn('reading')">Start</button></div>
      <div class="lesson-card"><strong>3. Math</strong><p>Do 5 addition questions.</p><button class="btn small primary" onclick="startQuiz('math', true)">Start</button></div>
      <div class="lesson-card"><strong>4. Discover</strong><p>Explore planets, body parts or maps.</p><button class="btn small primary" onclick="openSubject('science')">Start</button></div>
      <div class="lesson-card"><strong>5. Fun finish</strong><p>Choose rhymes, art or chess.</p><button class="btn small primary" onclick="openSubject('rhymes')">Start</button></div>
    </div>
  </section>`;
}

function resumeNow(){
  const r=saved.resume;
  if(!r || r.page==='home') return goHome();
  if(r.page==='story') return openStory(r.index);
  if(r.page==='subject') return openSubject(r.subject);
  if(r.page==='lesson') return startLearn(r.subject);
  if(r.page==='quiz') return startQuiz(r.subject, r.quick);
  if(r.page==='daily') return showDailyPath();
  if(r.page==='dashboard') return openDashboard();
  goHome();
}

function openSubject(key){
  const s=subjects.find(x=>x.key===key);
  setResume({page:'subject',subject:key});
  const st=statFor(key);
  const pct=st.total?Math.round(st.right*100/st.total):0;
  app.innerHTML=`
  <div class="crumbs"><button class="btn small" onclick="goHome()">← Home</button></div>
  <section class="panel">
    <div class="section-title"><h1>${s.emoji} ${esc(s.title)}</h1><span class="pill">Accuracy: ${pct}%</span></div>
    <p class="muted">${esc(s.desc)}. Choose learning or quiz mode.</p>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="learn-quiz">
      <div class="mode-card learn"><div class="bigicon">📘</div><h3>Learn</h3><p>Listen, read, explore and practice slowly.</p><button class="btn primary" onclick="startLearn('${key}')">Open Learn</button></div>
      <div class="mode-card quiz"><div class="bigicon">📝</div><h3>Quiz</h3><p>Try a few questions and earn stars.</p><button class="btn gold" onclick="startQuiz('${key}', false)">Open Quiz</button></div>
    </div>
  </section>`;
}

function startLearn(key){
  setResume({page:'lesson',subject:key});
  if(key==='reading') return readingLibrary();
  if(key==='geo') return renderGeographyLearn();
  if(key==='science') return renderScienceLearn();
  if(key==='body') return renderBodyLearn();
  if(key==='rhymes') return renderRhymes();
  if(key==='art') return renderArt();
  if(key==='chess') return renderChess();
  const list=lessons[key]||[];
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('${key}')">← ${esc(subjects.find(s=>s.key===key).title)}</button></div>
  <section class="panel"><div class="section-title"><h1>📘 Learn: ${esc(subjects.find(s=>s.key===key).title)}</h1><button class="btn small" onclick="speak('Welcome to ${subjects.find(s=>s.key===key).title}. Let us learn together!')">🔊 Listen</button></div>
    <div class="grid lesson-grid">${list.map((x,i)=>`<div class="lesson-card"><h3>${esc(x.title)}</h3><div style="white-space:pre-wrap">${esc(x.text)}</div><div class="row-buttons"><button class="btn small secondary" onclick="speak(${esc(JSON.stringify(x.listen))}) ">🔊 Read aloud</button>${key==='english'&&x.title==='Writing prompt'?'<button class="btn small" onclick="openWriting()">✍️ Open writing box</button>':''}</div></div>`).join('')}</div>
  </section>`;
}

function startQuiz(key, quick=false){
  setResume({page:'quiz',subject:key,quick});
  if(key==='geo') return renderGeographyQuiz();
  if(key==='science') return renderScienceQuiz();
  if(key==='body') return renderBodyQuiz();
  if(key==='rhymes') return renderRhymesQuiz();
  let items=quizzes[key]||[];if(key==='reading')items=illustratedStories.map(x=>({q:x.q,choices:x.choices,a:x.a,explain:x.lines.join(' '),passage:x.lines.join(' '),scene:x.scene})).sort(()=>Math.random()-.5);if(key==='math'){items=Array.from({length:5},()=>{let a=Math.floor(Math.random()*10),b=Math.floor(Math.random()*10),sum=a+b;let choices=[sum,sum+1,sum>0?sum-1:sum+2].sort(()=>Math.random()-.5).map(String);return {q:`${a} + ${b} = ?`,choices,a:String(sum),explain:`${a} plus ${b} equals ${sum}.`}})}if(key==='chess')items=[{q:'Which piece moves in an L shape?',choices:['Knight','King','Rook'],a:'Knight',explain:'The knight moves in an L shape.'},{q:'Which piece moves diagonally?',choices:['Bishop','Pawn','Rook'],a:'Bishop',explain:'The bishop moves diagonally.'}];if(key==='art')items=[{q:'Which is a color?',choices:['Blue','Circle','Square'],a:'Blue',explain:'Blue is a color.'},{q:'How many sides does a triangle have?',choices:['Three','Four','Five'],a:'Three',explain:'A triangle has three sides.'}];currentQuiz={subject:key,index:0,right:0,items:items.slice(0,5)};
  renderQuizCard();
}
function renderQuizCard(){
  const q=currentQuiz.items[currentQuiz.index];
  if(!q){ return quizDone(); }
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('${currentQuiz.subject}')">← ${esc(subjects.find(s=>s.key===currentQuiz.subject).title)}</button></div>
  <section class="panel">
    <div class="section-title"><h1>📝 Quiz: ${esc(subjects.find(s=>s.key===currentQuiz.subject).title)}</h1><button class="btn small" onclick="speak(${esc(JSON.stringify(q.q))})">🔊 Read question</button></div>
    <div class="progress"><i style="width:${Math.round((currentQuiz.index/currentQuiz.items.length)*100)}%"></i></div>
    ${q.passage?`<div class="story-layout">${q.scene?storyPicture(q.scene):''}<div class="story-box">${esc(q.passage)}</div></div>`:''}<h2>${esc(q.q)}</h2>
    <div class="choice-grid">${q.choices.map(c=>`<button class="choice" onclick="answerQuiz(${JSON.stringify(c).replace(/"/g,'&quot;')})">${esc(c)}</button>`).join('')}</div>
    <div class="feedback" id="feedback" aria-live="polite"></div><button id="nextQuestion" class="btn primary" hidden onclick="stopSpeaking();currentQuiz.index++;renderQuizCard()">Next question →</button>
  </section>`;
}
function answerQuiz(ans){
  const q=currentQuiz.items[currentQuiz.index];
  const buttons=[...document.querySelectorAll('.choice')];
  buttons.forEach(b=>{b.disabled=true; if(b.textContent===q.a)b.classList.add('good'); if(b.textContent===ans && ans!==q.a)b.classList.add('bad');});
  const ok=ans===q.a; if(ok) currentQuiz.right++; recordResult(currentQuiz.subject, ok); document.getElementById('feedback').textContent=(ok?'Great job! ':'Not quite. ')+(q.explain||q.ex||'');
  const read=(ok?'Wonderful! ':'Let us learn. ')+(q.explain||q.ex||''); speak(read);
  document.getElementById('nextQuestion').hidden=false;
}
function quizDone(){
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('${currentQuiz.subject}')">← Back</button></div>
  <section class="panel"><h1>🎉 Quiz complete!</h1><p>You answered <strong>${currentQuiz.right}</strong> out of <strong>${currentQuiz.items.length}</strong> correctly.</p>
  <div class="row-buttons"><button class="btn primary" onclick="startQuiz('${currentQuiz.subject}', false)">Try again</button><button class="btn" onclick="openSubject('${currentQuiz.subject}')">Back to subject</button></div></section>`;
}

function openWriting(){
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="startLearn('english')">← English</button></div>
  <section class="panel"><h1>✍️ Writing Box</h1><p class="muted">Write one or two sentences.</p>
  <textarea id="journal" style="width:100%;min-height:140px;border:2px solid #e0d7f5;border-radius:18px;padding:14px">${esc(saved.journal||'')}</textarea>
  <div class="row-buttons"><button class="btn primary" onclick="saved.journal=document.getElementById('journal').value;saveAll();toast('Saved!')">Save</button><button class="btn secondary" onclick="speak(document.getElementById('journal').value||'Please write your sentence first.')">🔊 Read my writing</button></div>
  </section>`;
}

function renderScienceQuiz(){
  setResume({page:'quiz',subject:'science'});
  const qs=[
    {q:'Which planet comes after Earth?',choices:['Venus','Mars','Saturn'],a:'Mars',ex:'The order is Mercury, Venus, Earth, Mars.'},
    {q:'Which planet has rings?',choices:['Earth','Saturn','Mars'],a:'Saturn',ex:'Saturn is famous for its rings.'},
    {q:'What gives us light and heat?',choices:['The Moon','The Sun','A cloud'],a:'The Sun',ex:'The Sun gives us light and heat.'}
  ];
  currentQuiz={subject:'science',index:0,right:0,items:qs}; renderQuizCard();
}

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
function renderBodyLearn(){
  setResume({page:'lesson',subject:'body'});
  const p=bodyParts.find(x=>x.id===activeBodyPart) || bodyParts[0];
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('body')">← Human body</button></div>
  <section class="panel">
    <div class="section-title"><h1>🧍 Learn: Human Body</h1><button class="btn small" onclick="speak('Let us learn body parts and bones!')">🔊 Listen</button></div>
    <div class="body-wrap">
      <div class="svg-box">${bodySVG(activeBodyPart)}<div class="skeleton-tip">🦴 Tap <strong>Bones / Skeleton</strong> to see a kid-friendly simple skeleton.</div></div>
      <div>
        <div class="fact"><h3>${p.name}</h3><p>${p.fact}</p><div class="row-buttons"><button class="btn small secondary" onclick="speak('${p.name}. ${p.fact}')">🔊 English</button></div></div>
        <div class="label-list">${bodyParts.map(x=>`<button class="body-btn ${x.id===activeBodyPart?'active':''}" onclick="activeBodyPart='${x.id}';renderBodyLearn()">${x.name}</button>`).join('')}</div>
      </div>
    </div>
  </section>`;
}
function renderBodyQuiz(){
  setResume({page:'quiz',subject:'body'});
  const ask = bodyParts.filter(x=>x.id!=='bones');
  const target = ask[Math.floor(Math.random()*ask.length)];
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('body')">← Human body</button></div>
  <section class="panel">
    <div class="section-title"><h1>📝 Quiz: Human Body</h1><button class="btn small" onclick="speak('Which body part is highlighted?')">🔊 Read question</button></div>
    <p>Which body part is highlighted?</p>
    <div class="body-wrap">
      <div class="svg-box">${bodySVG(target.id)}</div>
      <div class="label-list">${[target,...ask.filter(x=>x.id!==target.id).sort(()=>Math.random()-.5).slice(0,7)].sort(()=>Math.random()-.5).map((x,i,a)=>x).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).map(x=>`<button class="body-btn" onclick="bodyQuizAnswer('${x.id}','${target.id}')">${x.name}</button>`).join('')}</div>
    </div><p id="bodyFeedback" aria-live="polite"></p><button id="bodyNext" class="btn primary" hidden onclick="renderBodyQuiz()">Next question →</button>
  </section>`;
}
function bodyQuizAnswer(ans,target){ const ok=ans===target; recordResult('body', ok); speak(ok?'Amazing! You found it.':'Nice try. Let us learn and try again.'); document.querySelectorAll('.body-btn').forEach(b=>b.disabled=true);document.getElementById('bodyFeedback').textContent=ok?'Wonderful!':'The answer is '+bodyParts.find(p=>p.id===target).name+'.';document.getElementById('bodyNext').hidden=false; }

function renderRhymes(){
  setResume({page:'lesson',subject:'rhymes'});
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('rhymes')">← Rhymes</button></div>
  <section class="panel"><div class="section-title"><h1>🎵 Learn: Rhymes</h1><span class="pill">English nursery rhymes</span></div><p class="muted">Rhymes use an enhanced American English voice when available, at natural pitch and rhythm. If none is available, the page will ask you to enable one rather than use a robotic fallback. Rhymes are spoken, not sung.</p>
    
    <div class="grid lesson-grid">${EN_RHYMES.map((r,i)=>`<div class="rhyme-card"><h3>${esc(r.title)}</h3><pre>${esc(r.text)}</pre><div class="row-buttons"><button class="btn small secondary" onclick="speakRhyme(${i})">🔊 Listen to rhyme</button></div></div>`).join('')}</div>
  </section>`;
}
function renderRhymesQuiz(){
  setResume({page:'quiz',subject:'rhymes'});
  currentQuiz={subject:'rhymes',index:0,right:0,items:[
    {q:'Which rhyme mentions a star?',choices:['Twinkle, Twinkle, Little Star','Rain, Rain, Go Away','One, Two, Buckle My Shoe'],a:'Twinkle, Twinkle, Little Star',ex:'That rhyme talks about a little star.'},
    {q:'Which rhyme talks about rain?',choices:['Rain, Rain, Go Away','Twinkle, Twinkle, Little Star','One, Two, Buckle My Shoe'],a:'Rain, Rain, Go Away',ex:'Rain, Rain, Go Away is about rain.'}
  ]};
  renderQuizCard();
}

function renderArt(){
  setResume({page:'lesson',subject:'art'});
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('art')">← Art</button></div>
    <section class="panel"><div class="section-title"><h1>🎨 Art Studio</h1><button class="btn small" onclick="speak('Draw anything you like!')">🔊 Listen</button></div>
      <div class="canvas-wrap"><canvas id="draw" width="640" height="420"></canvas></div>
      <div class="toolbar"><button class="btn small" onclick="setDrawColor('#ff4f8a')">Pink</button><button class="btn small" onclick="setDrawColor('#4f79ff')">Blue</button><button class="btn small" onclick="setDrawColor('#1e9f6e')">Green</button><button class="btn small" onclick="setDrawColor('#f4a62a')">Orange</button><button class="btn small warn" onclick="clearCanvas()">Clear</button></div>
    </section>`;
  setupCanvas();
}
let drawColor='#ff4f8a';
function setDrawColor(c){ drawColor=c; }
function setupCanvas(){ const c=document.getElementById('draw'); if(!c) return; const ctx=c.getContext('2d'); ctx.lineCap='round'; ctx.lineWidth=6; let on=false; const pos=e=>{const r=c.getBoundingClientRect(); const p=e.touches?e.touches[0]:e; return {x:(p.clientX-r.left)*(c.width/r.width), y:(p.clientY-r.top)*(c.height/r.height)}}; const start=e=>{on=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y);}; const move=e=>{if(!on)return; e.preventDefault(); const p=pos(e); ctx.strokeStyle=drawColor; ctx.lineTo(p.x,p.y); ctx.stroke();}; ['mousedown','touchstart'].forEach(ev=>c.addEventListener(ev,start)); ['mousemove','touchmove'].forEach(ev=>c.addEventListener(ev,move,{passive:false})); ['mouseup','mouseleave','touchend'].forEach(ev=>c.addEventListener(ev,()=>on=false)); }
function clearCanvas(){ const c=document.getElementById('draw'); if(!c) return; c.getContext('2d').clearRect(0,0,c.width,c.height); }

function renderChess(){
  setResume({page:'lesson',subject:'chess'});
  const pieces=[['♔ King','The king moves one square in any direction.'],['♕ Queen','The queen moves many squares in any direction.'],['♖ Rook','The rook moves in straight lines.'],['♗ Bishop','The bishop moves diagonally.'],['♘ Knight','The knight moves in an L shape.'],['♙ Pawn','The pawn moves forward one square.']];
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('chess')">← Chess</button></div>
  <section class="panel"><div class="section-title"><h1>♟️ Learn: Chess</h1><button class="btn small" onclick="speak('Let us learn chess pieces!')">🔊 Listen</button></div>
  <div class="grid lesson-grid">${pieces.map(p=>`<div class="lesson-card"><h3>${p[0]}</h3><p>${p[1]}</p><button class="btn small secondary" onclick="speak('${p[0].replace(/♔ |♕ |♖ |♗ |♘ |♙ /,'')}. ${p[1]}')">🔊 Hear it</button></div>`).join('')}</div></section>`;
}

function renderGeographyLearn(){
  setResume({page:'lesson',subject:'geo'});
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('geo')">← Geography</button></div>
  <section class="panel"><div class="section-title"><h1>🌍 Learn: Geography</h1><button class="btn small" onclick="speak('Explore the map. Choose USA states or Bangladesh.')">🔊 Listen</button></div>
    <div class="tabs"><button class="tab active" onclick="loadMapMode('usStates',false)">🇺🇸 USA States</button><button class="tab" onclick="loadMapMode('bdDivisions',false)">🇧🇩 Bangladesh Divisions</button><button class="tab" onclick="loadMapMode('bdDistricts',false)">🇧🇩 Bangladesh Districts</button></div>
    <div id="mapArea"></div>
  </section>`;
  loadMapMode('usStates', false);
}
function renderGeographyQuiz(){
  setResume({page:'quiz',subject:'geo'});
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('geo')">← Geography</button></div>
  <section class="panel"><div class="section-title"><h1>📝 Quiz: Geography</h1><span class="pill">Find on the map</span></div>
    <div class="tabs"><button class="tab active" onclick="loadMapMode('usStates',true)">🇺🇸 Find a State</button><button class="tab" onclick="loadMapMode('bdDivisions',true)">🇧🇩 Find a Division</button><button class="tab" onclick="loadMapMode('bdDistricts',true)">🇧🇩 Find a District</button></div>
    <div id="mapArea"></div>
  </section>`;
  loadMapMode('usStates', true);
}
function geoItems(mode){
  if(mode==='usStates') return usaStates.map(s=>({key:normName(s[1]),name:s[1],label:s[0],group:s[3],fact:'Capital: '+s[2]}));
  if(mode==='bdDivisions') return Object.keys(bdDivisions).map((d,i)=>({key:normName(d),name:d,label:d,group:d,fact:bdDivisions[d].length+' districts'}));
  return Object.entries(bdDivisions).flatMap(([div,arr])=>arr.map(n=>({key:normName(n),name:n,label:n,group:div,fact:div+' Division'})));
}
function loadMapMode(mode, game){ mapState={mode,game,target:null,done:[],selected:null,wrong:null,showLabels:!game}; drawMapScreen(); }
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
  const ok = key===mapState.target; recordResult('geo', ok); mapState.wrong = ok?null:key; if(ok){ mapState.done.push(key); chooseNewTarget(); speak('Great job!'); if(!mapState.target) speak('Wonderful! You found them all!'); } else { speak('Try again!'); }
  drawMapScreen();
}

function openDashboard(){
  setResume({page:'dashboard'});
  const rows = subjects.map(s=>{const st=statFor(s.key); const pct=st.total?Math.round((st.right/st.total)*100):0; return `<tr><td>${s.emoji} ${esc(s.title)}</td><td>${st.right||0}</td><td>${st.total||0}</td><td>${pct}%</td></tr>`}).join('');
  app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="goHome()">← Home</button></div>
  <section class="panel"><div class="section-title"><h1>👩‍👧 Parent Dashboard</h1><button class="btn small" onclick="exportProgress()">⬇️ Export progress</button></div>
    <div class="grid stat-grid"><div class="stat"><b>${saved.stars||0}</b>Total stars</div><div class="stat"><b>${accuracy()}%</b>Accuracy</div><div class="stat"><b>${streak()}</b>Current streak</div><div class="stat"><b>${Object.keys(saved.days).length}</b>Active days</div></div>
    <div style="overflow:auto;margin-top:14px"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px">Subject</th><th style="text-align:left;padding:8px">Right</th><th style="text-align:left;padding:8px">Total</th><th style="text-align:left;padding:8px">Accuracy</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row-buttons"><button class="btn secondary" onclick="importProgressPrompt()">⬆️ Import progress</button><button class="btn warn" onclick="resetProgress()">Reset</button></div>
  </section>`;
}
function exportProgress(){ const blob=new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ruhaimah-learning-progress.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
function importProgressPrompt(){ const input=document.createElement('input'); input.type='file'; input.accept='application/json'; input.onchange=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ try{ saved=Object.assign({}, defaultSave, JSON.parse(r.result)); saveAll(); toast('Progress imported'); openDashboard(); }catch(err){ alert('Could not import file'); } }; r.readAsText(f); }; input.click(); }
function resetProgress(){ if(confirm('Reset all saved progress on this browser?')){ saved=JSON.parse(JSON.stringify(defaultSave)); saveAll(); goHome(); } }

function renderSettings(){stopSpeaking();app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="goHome()">← Home</button></div><section class="panel"><h1>🎙️ English voice settings</h1><p>Choose a US English voice that sounds clear and friendly on this device. Rhymes automatically use an enhanced or natural US voice when available.</p><div class="settings-grid"><div class="lesson-card"><h3>Sound</h3><label><input type="checkbox" id="audioOn" ${voicePrefs.audio?'checked':''}> Audio on</label></div><div class="lesson-card"><h3>English voice</h3><select id="voiceChoice" class="inline-select" style="max-width:100%"></select></div><div class="lesson-card"><h3>Speed</h3><select id="speed" class="inline-select">${[[.65,'Extra slow'],[.8,'Slow and clear'],[.95,'Regular']].map(([v,t])=>`<option value="${v}" ${voicePrefs.speed===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="lesson-card"><h3>Tone</h3><select id="pitch" class="inline-select">${[[1,'Natural'],[1.06,'Cheerful'],[1.12,'Bright']].map(([v,t])=>`<option value="${v}" ${voicePrefs.pitch===v?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="row-buttons"><button class="btn primary" onclick="saveSettings();speak('Hello! Welcome to your learning world. Let us have fun learning together!')">🔊 Save and test voice</button><button class="btn" onclick="stopSpeaking()">Stop</button></div><p class="tiny">Voice quality depends on the English voices available in your browser and device. Try another voice if the first one sounds robotic.</p></section>`;refreshVoices()}
function saveSettings(){voicePrefs.audio=document.getElementById('audioOn').checked;voicePrefs.speed=Number(document.getElementById('speed').value);voicePrefs.pitch=Number(document.getElementById('pitch').value);voicePrefs.voiceURI=document.getElementById('voiceChoice').value;saveAll();toast('Settings saved')}
// Reset voice defaults once for this English edition.
try{if(!localStorage.getItem('english-voice-v5')){voicePrefs={audio:true,speed:.8,pitch:1,voiceURI:''};localStorage.setItem('english-voice-v5','1')}}catch(e){}
if(saved.resume&&saved.resume.subject==='bangla')saved.resume=null;

const illustratedStories=[
 {title:'The Red Kite',emoji:'🪁',scene:'kite',lines:['Sam has a red kite.','The wind blows.','The kite goes up, up, up!','Sam smiles.'],q:'What color is the kite?',choices:['Red','Blue','Green'],a:'Red'},
 {title:'A Cat in a Box',emoji:'🐱',scene:'cat',lines:['A cat sees a box.','The cat jumps in.','It sits in the box.','It takes a nap.'],q:'Where does the cat nap?',choices:['In a box','On a tree','In a car'],a:'In a box'},
 {title:'The Little Seed',emoji:'🌱',scene:'seed',lines:['Mia plants a seed.','She gives it water.','The sun shines.','A little plant grows.'],q:'What does Mia plant?',choices:['A seed','A rock','A shoe'],a:'A seed'},
 {title:'The Pond',emoji:'🐸',scene:'pond',lines:['A frog sits by a pond.','A duck swims past.','The frog hops on a leaf.','Splash! It jumps in.'],q:'What swims past the frog?',choices:['A duck','A dog','A cat'],a:'A duck'},
 {title:'A Trip to the Moon',emoji:'🚀',scene:'moon',lines:['Ben sees the moon.','He draws a rocket.','He puts stars in the sky.','Ben dreams of space.'],q:'What does Ben draw?',choices:['A rocket','A boat','A train'],a:'A rocket'},
 {title:'The Lost Ball',emoji:'⚽',scene:'ball',lines:['Lily has a ball.','It rolls under a tree.','Her friend sees it.','They play together.'],q:'Where did the ball roll?',choices:['Under a tree','Into a lake','On a roof'],a:'Under a tree'},
 {title:'A Rainy Day',emoji:'☔',scene:'rain',lines:['It is raining.','Ava puts on her boots.','She gets her umbrella.','She jumps in a puddle.'],q:'What keeps Ava dry?',choices:['An umbrella','A book','A ball'],a:'An umbrella'},
 {title:'The Butterfly',emoji:'🦋',scene:'butterfly',lines:['A butterfly lands on a flower.','It has orange wings.','It flies over the grass.','I watch it fly away.'],q:'What color are its wings?',choices:['Orange','Black','Blue'],a:'Orange'}
];
function storyPicture(scene){
 const tree='<rect x="249" y="105" width="22" height="103" rx="5" fill="#98623d"/><circle cx="260" cy="90" r="56" fill="#70be73"/><circle cx="225" cy="104" r="33" fill="#83cf7c"/>';
 const kid='<circle cx="89" cy="109" r="25" fill="#c98d65"/><path d="M65 106Q60 75 88 77Q116 75 115 108Q90 90 65 106" fill="#523735"/><circle cx="82" cy="110" r="2.5"/><circle cx="98" cy="110" r="2.5"/><path d="M84 120Q90 125 96 120" fill="none" stroke="#703f3a" stroke-width="2"/><path d="M69 140Q90 125 111 140L117 191H62Z" fill="#a184ea"/><path d="M77 190V218M103 190V218" stroke="#47567e" stroke-width="11" stroke-linecap="round"/><path d="M68 145L48 168M111 145L136 125" stroke="#c98d65" stroke-width="10" stroke-linecap="round"/>';
 const flower='<path d="M0 15V50" stroke="#40965c" stroke-width="5"/><ellipse cx="-9" cy="35" rx="12" ry="5" fill="#69ba68"/><g fill="#f4a0bd"><circle cx="-10" cy="0" r="10"/><circle cx="10" cy="0" r="10"/><circle cx="0" cy="-10" r="10"/><circle cx="0" cy="10" r="10"/></g><circle r="8" fill="#ffcf60"/>';
 const scenes={kite:kid+'<path d="M136 125Q190 130 228 62" fill="none" stroke="#776b86" stroke-width="2"/><path d="M228 18L263 61L228 104L193 61Z" fill="#e95e64" stroke="#b83d4f" stroke-width="2"/><path d="M228 18V104M193 61H263" stroke="#ffb6ae" stroke-width="2"/>',cat:'<rect x="105" y="130" width="140" height="83" rx="8" fill="#c28c57"/><ellipse cx="175" cy="131" rx="70" ry="19" fill="#97663f"/><ellipse cx="175" cy="114" rx="50" ry="34" fill="#edb56e"/><path d="M137 92L141 57L163 81M187 81L211 57L216 94" fill="#edb56e"/><path d="M151 111Q159 117 167 111M183 111Q191 117 199 111" fill="none" stroke="#664736" stroke-width="3"/><path d="M169 123L181 123L175 128Z" fill="#bb6876"/>',seed:kid+'<path d="M172 202Q230 172 300 202V224H172Z" fill="#9e6b43"/><g transform="translate(240 151)">'+flower+'</g><path d="M136 125L169 142" stroke="#c98d65" stroke-width="8"/><path d="M150 133H180V163H150Z" fill="#5fb6dd"/><path d="M180 145L202 160" stroke="#5fb6dd" stroke-width="8"/><path d="M203 169L201 180M210 172L208 183" stroke="#5fb6dd" stroke-width="3"/>',pond:'<ellipse cx="175" cy="177" rx="151" ry="55" fill="#73cae6"/><ellipse cx="112" cy="184" rx="45" ry="13" fill="#69ae67"/><ellipse cx="112" cy="162" rx="30" ry="20" fill="#76c76a"/><circle cx="96" cy="146" r="12" fill="#76c76a"/><circle cx="128" cy="146" r="12" fill="#76c76a"/><circle cx="96" cy="144" r="4"/><circle cx="128" cy="144" r="4"/><path d="M100 165Q112 172 124 165" fill="none" stroke="#326c39" stroke-width="2"/><ellipse cx="238" cy="156" rx="37" ry="22" fill="#fff5cb"/><circle cx="263" cy="133" r="18" fill="#fff5cb"/><path d="M278 132L298 139L278 145Z" fill="#ef9a3b"/><circle cx="267" cy="129" r="3"/>',moon:'<rect width="350" height="240" fill="#202957"/><circle cx="265" cy="64" r="40" fill="#f6e9bd"/><circle cx="251" cy="50" r="9" fill="#d6cba5"/><circle cx="282" cy="75" r="12" fill="#d6cba5"/><g fill="#fff4b9"><circle cx="55" cy="40" r="3"/><circle cx="180" cy="32" r="4"/><circle cx="320" cy="120" r="3"/><circle cx="42" cy="140" r="4"/></g><g transform="translate(150 120) rotate(28)"><path d="M0 -70Q40 -30 24 32H-24Q-40 -30 0 -70" fill="#f5f6ff"/><path d="M-24 10L-46 45L-20 35M24 10L46 45L20 35" fill="#ed747a"/><circle cy="-18" r="15" fill="#83ceef"/><path d="M-13 35L0 80L13 35Z" fill="#ffc45b"/></g>',ball:tree+kid+'<circle cx="240" cy="207" r="19" fill="#fff" stroke="#667" stroke-width="2"/><path d="M240 194L251 202L247 215H233L229 202Z" fill="#505168"/>',rain:'<rect width="350" height="240" fill="#dbe6f4"/><ellipse cx="100" cy="218" rx="76" ry="14" fill="#9bcde8"/>'+kid+'<path d="M28 102Q86 13 148 102Z" fill="#ef7b9b"/><path d="M88 102V160Q88 173 99 173" fill="none" stroke="#6b5979" stroke-width="4"/><g stroke="#8bb5dc" stroke-width="3">'+Array.from({length:16},(_,i)=>`<path d="M${12+i*21} ${20+(i%4)*36}l-7 15"/>`).join('')+'</g>',butterfly:'<g transform="translate(245 145)">'+flower+'</g><g transform="translate(150 105)"><ellipse cx="-26" cy="-20" rx="35" ry="29" transform="rotate(25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="26" cy="-20" rx="35" ry="29" transform="rotate(-25)" fill="#f7aa53" stroke="#774b44" stroke-width="3"/><ellipse cx="-22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse cx="22" cy="21" rx="22" ry="24" fill="#f4bd64"/><ellipse rx="5" ry="33" fill="#694944"/><path d="M0 -28L-12 -43M0 -28L12 -43" stroke="#694944" stroke-width="2"/></g>'};
 return `<svg class="story-art" viewBox="0 0 350 240" role="img" aria-label="Illustration for ${esc(scene)}"><rect width="350" height="240" fill="#dff3ff"/><circle cx="302" cy="40" r="24" fill="#ffe39a"/><path d="M0 190Q90 153 180 190T350 190V240H0Z" fill="#b9e5a9"/>${scenes[scene]}</svg>`;
}
let storyIndex=0;
function readingLibrary(){setResume({page:'lesson',subject:'reading'});app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('reading')">← Reading</button></div><section class="panel"><h1>📚 Story library</h1><p>Choose a picture story. Read it yourself or listen.</p><div class="grid story-grid">${illustratedStories.map((x,i)=>`<button class="story-tile" onclick="openStory(${i})">${storyPicture(x.scene)}<strong>${x.title}</strong><small>4 short sentences</small></button>`).join('')}</div><h2>🔤 Phonics & sight words</h2><div class="grid lesson-grid">${lessons.reading.slice(1).map((x,i)=>`<div class="lesson-card"><h3>${esc(x.title)}</h3><p style="white-space:pre-wrap">${esc(x.text)}</p><button class="btn small" onclick="speak(${esc(JSON.stringify(x.listen))})">🔊 Listen</button></div>`).join('')}</div></section>`;}
function openStory(i){storyIndex=i;setResume({page:'story',subject:'reading',index:i});let x=illustratedStories[i];app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="readingLibrary()">← Story library</button></div><section class="panel"><div class="section-title"><h1>${x.emoji} ${x.title}</h1><span class="pill">${i+1} / ${illustratedStories.length}</span></div><div class="story-layout">${storyPicture(x.scene)}<div><div class="story-box">${x.lines.map((l,j)=>`<button class="story-line" onclick="speak(illustratedStories[${i}].lines[${j}])">${esc(l)} <span aria-hidden="true">🔊</span></button>`).join('')}</div><div class="row-buttons"><button class="btn primary" onclick="speak(illustratedStories[${i}].lines.join(' '))">🔊 Read the whole story</button><button class="btn gold" onclick="storyQuiz(${i})">📝 Story quiz</button></div></div></div><div class="row-buttons"><button class="btn" ${i===0?'disabled':''} onclick="openStory(${i-1})">← Previous story</button><button class="btn" ${i===illustratedStories.length-1?'disabled':''} onclick="openStory(${i+1})">Next story →</button></div></section>`;}
function storyQuiz(i){setResume({page:'story',subject:'reading',index:i});let x=illustratedStories[i];currentQuiz={subject:'reading',index:0,right:0,items:[{q:x.q,choices:x.choices,a:x.a,explain:x.lines.join(' '),passage:x.lines.join(' '),scene:x.scene}]};renderQuizCard()}
function planetPicture(name){const colors={Mercury:['#d7d3cc','#77736e'],Venus:['#f6d692','#b77b45'],Earth:['#67c5fa','#2457a3'],Mars:['#f0a16b','#a94d38'],Jupiter:['#f6d9ad','#b98b68'],Saturn:['#fae5ad','#c5a26b'],Uranus:['#b5f1eb','#58a9b8'],Neptune:['#72a8ff','#244aaf']};let c=colors[name];let id='planet'+name;let detail='';if(name==='Earth') detail='<path d="M45 37L60 25 80 32 83 48 69 54 65 70 53 69 49 55 37 48Z M92 72L111 67 122 79 111 92 105 111 95 105 89 85Z M92 30L120 34 129 51 112 58 99 47Z" fill="#71bc79"/><path d="M28 61Q55 48 83 63M80 102Q112 91 130 103" stroke="#fff" stroke-width="7" opacity=".55" fill="none"/>';else if(['Jupiter','Saturn','Venus','Neptune','Uranus'].includes(name)) detail=Array.from({length:7},(_,i)=>`<path d="M15 ${33+i*15}Q80 ${46+i*15} 145 ${31+i*15}" stroke="${i%2?c[1]:'#fff3d9'}" opacity="${name==='Jupiter'?.56:.20}" stroke-width="${i%2?8:5}" fill="none"/>`).join('')+(name==='Jupiter'?'<ellipse cx="105" cy="92" rx="19" ry="8" fill="#bb644d"/>':'');else detail=Array.from({length:10},(_,i)=>`<circle cx="${36+(i*23)%83}" cy="${36+(i*31)%88}" r="${3+i%8}" fill="${c[1]}" opacity=".34"/>`).join('');return `<svg viewBox="0 0 160 160" class="planet-picture" role="img" aria-label="Illustration of ${name}"><defs><radialGradient id="${id}" cx="32%" cy="27%" r="74%"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient><clipPath id="${id}clip"><circle cx="80" cy="80" r="56"/></clipPath></defs>${name==='Saturn'?'<ellipse cx="80" cy="80" rx="78" ry="22" transform="rotate(-22 80 80)" stroke="#e6c98a" stroke-width="12" fill="none"/>':''}<circle cx="80" cy="80" r="56" fill="url(#${id})"/><g clip-path="url(#${id}clip)">${detail}</g>${name==='Saturn'?'<path d="M7 103Q61 117 148 53" stroke="#f5d9a1" stroke-width="8" fill="none" opacity=".9"/>':''}</svg>`;}
function renderScienceLearn(tab='space'){setResume({page:'lesson',subject:'science'});app.innerHTML=`<div class="crumbs"><button class="btn small" onclick="openSubject('science')">← Science</button></div><section class="panel"><h1>🔬 Science explorer</h1><div class="tabs"><button class="tab ${tab==='space'?'active':''}" onclick="renderScienceLearn('space')">🪐 Planets & space</button><button class="tab ${tab==='nature'?'active':''}" onclick="renderScienceLearn('nature')">🌱 Animals & plants</button><button class="tab" onclick="renderBodyLearn()">🧍 Human body</button></div>${tab==='space'?`<div class="space-intro"><span style="font-size:48px">☀️</span><div><h2>Our solar system</h2><p>Eight planets travel around the Sun. Tap a planet to learn more. Illustrations are not to scale.</p></div></div><div class="grid planet-grid">${planets.map((p,i)=>`<button class="planet-card" onclick="planetDetails(${i})">${planetPicture(p.name)}<strong>${i+1}. ${p.name}</strong><small>${esc(p.fact)}</small></button>`).join('')}</div><div id="planetInfo" class="fact" aria-live="polite"><h2>Choose a planet!</h2></div><div class="grid lesson-grid"><div class="lesson-card"><h3>☀️ The Sun</h3><p>A star that gives us light and heat.</p><button class="btn small" onclick="speak('The Sun is a star. It gives us light and heat.')">🔊 Listen</button></div><div class="lesson-card"><h3>🌙 The Moon</h3><p>Our Moon travels around Earth. We can see it in daytime too.</p><button class="btn small" onclick="speak('The Moon travels around Earth. We can see it in the daytime too.')">🔊 Listen</button></div></div>`:`<div class="grid lesson-grid">${lessons.science.slice(1).map(x=>`<div class="lesson-card"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p><button class="btn small" onclick="speak(${esc(JSON.stringify(x.listen))})">🔊 Listen</button></div>`).join('')}<div class="lesson-card"><h3>🦋 Life cycle</h3><p>Egg → caterpillar → chrysalis → butterfly.</p><button class="btn small" onclick="speak('A butterfly starts as an egg, then a caterpillar, then a chrysalis, and finally a butterfly.')">🔊 Listen</button></div></div>`}</section>`;}
function planetDetails(i){let p=planets[i];document.getElementById('planetInfo').innerHTML=`<h2>${p.name}</h2><p>Planet number ${i+1} from the Sun. ${esc(p.fact)}</p>`;speak(`Planet number ${i+1}. ${p.name}. ${p.fact}`);}

saveAll();
if('speechSynthesis' in window){ try{ speechSynthesis.getVoices(); }catch(e){} }

const pageKey=document.body.dataset.subject||'';
function routeSubject(key,mode='subject',extra={}){if(pageKey!==key){stopSpeaking();location.href=key+'.html?'+new URLSearchParams({mode,...extra});return true}return false}
const localHome=goHome,localSubject=openSubject,localLearn=startLearn,localQuiz=startQuiz,localStory=openStory,localBody=renderBodyLearn;
goHome=function(){if(pageKey){stopSpeaking();location.href='index.html';return}localHome()};
openSubject=function(k){if(!routeSubject(k))localSubject(k)};
startLearn=function(k){if(!routeSubject(k,'learn')){localLearn(k);addPlay(k)}};
startQuiz=function(k,q=false){if(!routeSubject(k,'quiz',{quick:q?'1':'0'}))localQuiz(k,q)};
openStory=function(i){if(!routeSubject('reading','story',{index:i}))localStory(i)};
renderBodyLearn=function(){if(!routeSubject('body','learn'))localBody()};
function addPlay(k){const specs={math:['Count the stars','Tap stars to count them.'],english:['Build a sentence','Tap the words in the right order.'],logic:['Finish the pattern','Choose the missing shape.'],school:['Practice following directions','Listen and select the correct shape.'],general:['Calendar game','Choose the day after the given day.'],chess:['Knight practice','Find a square the knight can reach.'],reading:['Word builder','Tap the letters to build a word.'],science:['Planet challenge','Choose the planet in the requested position.'],body:['Body detective','Choose the body part that matches the clue.'],rhymes:['Rhyme time','Choose the word that rhymes.'],art:['Color detective','Choose the matching color.'],geo:['Capital explorer','Match a state to its capital.']};let sp=specs[k];if(!sp)return;let section=document.createElement('section');section.className='panel';section.innerHTML=`<h2>🎮 ${sp[0]}</h2><p>${sp[1]}</p><div id="playZone"></div>`;app.append(section);newPlay(k)}
function newPlay(k){let z=document.getElementById('playZone');if(!z)return;let pick=a=>a[Math.floor(Math.random()*a.length)],q='',opts=[],ans='',visual='';if(k==='math'){let n=3+Math.floor(Math.random()*7);q='Tap each star, then choose how many there are.';visual=`<div class="play-stars">${Array.from({length:n},()=>'<button aria-label="Count one star" onclick="if(!this.disabled){this.disabled=true;this.textContent=\'✅\';document.getElementById(\'counted\').textContent=Number(document.getElementById(\'counted\').textContent)+1}">⭐</button>').join('')}</div><p>Counted: <b id="counted">0</b></p>`;opts=[n-1,n,n+1].map(String);ans=String(n)}else if(k==='english'||k==='reading'){let words=k==='english'?pick([['I','like','cats.'],['We','can','run.'],['The','sun','shines.']]):pick([['c','a','t'],['s','u','n'],['d','o','g']]);let target=words.join(k==='english'?' ':'');q=k==='english'?'Build this sentence: '+target:'Build the word: '+target;z.innerHTML=`<h3>${esc(q)}</h3><button class="btn small" onclick="speak(${esc(JSON.stringify(target))})">🔊 Listen</button><div id="built" class="story-box" style="min-height:60px"></div><div class="row-buttons" id="pieces"></div><p id="playFeedback" aria-live="polite"></p><button class="btn" onclick="newPlay('${k}')">New challenge</button>`;let out=[];words.slice().sort(()=>Math.random()-.5).forEach(w=>{let b=document.createElement('button');b.className='btn primary';b.textContent=w;b.onclick=()=>{if(w!==words[out.length]){document.getElementById('playFeedback').textContent='Try another piece!';return}out.push(w);b.disabled=true;document.getElementById('built').textContent=out.join(k==='english'?' ':'');if(out.length===words.length){recordResult(k,true);document.getElementById('playFeedback').textContent='🌟 Wonderful!'}};document.getElementById('pieces').append(b)});return}else if(k==='logic'){let a=pick(['🔵','🟢','⭐']),b=pick(['🔺','🟪','❤️']);q=`${a} ${b} ${a} ${b} ${a} ?`;opts=[a,b,'🟡'];ans=b}else if(k==='school'){ans=pick(['circle','square','triangle']);q='Tap the '+ans;opts=['circle','square','triangle'];visual='<p>🔵 &nbsp; 🟪 &nbsp; 🔺</p>'}else if(k==='general'){let days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],i=Math.floor(Math.random()*7);q='What day comes after '+days[i]+'?';ans=days[(i+1)%7];opts=[ans,days[(i+2)%7],days[(i+3)%7]]}else if(k==='chess'){q='Tap a square the knight can reach.';z.innerHTML='<h3>'+q+'</h3><div class="mini-board" id="miniBoard"></div><p id="playFeedback" aria-live="polite"></p><button class="btn" onclick="newPlay(\'chess\')">Reset board</button>';let done=false;for(let r=0;r<5;r++)for(let c=0;c<5;c++){let b=document.createElement('button');b.textContent=r===2&&c===2?'♘':'·';b.style.background=(r+c)%2?'#b7a0df':'#f4e7ce';b.setAttribute('aria-label',`Row ${r+1}, column ${c+1}`);b.onclick=()=>{if(done)return;let ok=Math.abs(r-2)*Math.abs(c-2)===2;document.getElementById('playFeedback').textContent=ok?'Great knight move!':'Try an L shape: two squares and one sideways.';if(ok){done=true;b.textContent='⭐';recordResult(k,true)}};document.getElementById('miniBoard').append(b)}return}else if(k==='science'){let i=Math.floor(Math.random()*8);q=`Which planet is number ${i+1} from the Sun?`;ans=planets[i].name;opts=[ans,planets[(i+1)%8].name,planets[(i+3)%8].name]}else if(k==='body'){let p=pick(bodyParts);q=p.fact;ans=p.name;opts=[ans,...bodyParts.filter(x=>x.name!==ans).sort(()=>Math.random()-.5).slice(0,2).map(x=>x.name)]}else if(k==='rhymes'){let x=pick([['cat','hat','dog','sun'],['star','car','fish','book'],['cake','lake','tree','ball']]);q='Which word rhymes with '+x[0]+'?';ans=x[1];opts=x.slice(1)}else if(k==='art'){let x=pick([['Red','#e75060'],['Blue','#4384df'],['Green','#49b779'],['Yellow','#f5cf45']]);q='What color is this?';ans=x[0];visual=`<div style="width:90px;height:90px;border-radius:22px;background:${x[1]}"></div>`;opts=['Red','Blue','Green','Yellow']}else if(k==='geo'){let x=pick(usaStates);q='What is the capital of '+x[1]+'?';ans=x[2];opts=[ans,...usaStates.filter(y=>y[2]!==ans).sort(()=>Math.random()-.5).slice(0,2).map(y=>y[2])]}
z.innerHTML=`<h3>${esc(q)}</h3><button class="btn small" onclick="speak(${esc(JSON.stringify(q))})">🔊 Listen</button>${visual}<div class="row-buttons" id="playOptions"></div><p id="playFeedback" aria-live="polite"></p><button class="btn" onclick="newPlay('${k}')">Next challenge →</button>`;let done=false;opts.sort(()=>Math.random()-.5).forEach(x=>{let b=document.createElement('button');b.className='btn';b.textContent=x;b.onclick=()=>{if(done)return;let ok=x===ans;document.getElementById('playFeedback').textContent=ok?'🌟 Wonderful work!':'Try again! You can do it.';if(ok){done=true;b.classList.add('secondary');recordResult(k,true);speak('Wonderful work!')}else b.disabled=true};document.getElementById('playOptions').append(b)})}
if(pageKey){const p=new URLSearchParams(location.search);if(p.get('mode')==='learn')startLearn(pageKey);else if(p.get('mode')==='quiz')startQuiz(pageKey,p.get('quick')==='1');else if(p.get('mode')==='story'&&pageKey==='reading')openStory(Math.max(0,Math.min(illustratedStories.length-1,Number(p.get('index'))||0)));else openSubject(pageKey)}else goHome();

'use strict';

const { EmbedBuilder } = require('discord.js');

const BLUE   = '#5865F2';
const PINK   = '#ff6b9d';
const GREEN  = '#57F287';
const YELLOW = '#FEE75C';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const pct  = (seed, extra = 0) => Math.abs((seed.split('').reduce((a, c) => a + c.charCodeAt(0), extra) * 2654435761) % 101);

// ── Response banks ────────────────────────────────────────────────────────────
const TRUTHS = [
  "What's the most embarrassing thing you've ever done?",
  "Have you ever lied to your best friend? What about?",
  "What's your biggest fear?",
  "Have you ever cheated on a test?",
  "What's the weirdest dream you've ever had?",
  "What's a secret you've never told anyone?",
  "Who was your first crush?",
  "What's the pettiest thing you've ever done?",
  "What's your most embarrassing childhood memory?",
  "Have you ever ghosted someone? Why?",
  "What's something you're ashamed to admit you enjoy?",
  "Have you ever stolen something?",
  "What's the worst thing you've done that no one knows about?",
  "Who here would you trade lives with for a day?",
  "What's a lie you told that got out of hand?",
];

const DARES = [
  "Send a voice message saying 'I love you' to the last person you texted.",
  "Change your nickname to 'Stinky' for the next hour.",
  "Type your deepest secret in reverse in chat.",
  "Talk in uwu for the next 10 minutes.",
  "Post your most recent photo from your camera roll (nothing private!).",
  "DM a random server member and say 'I've been watching you.'",
  "Change your server avatar to something embarrassing for 30 mins.",
  "Write a compliment about every person currently in chat.",
  "Do 15 push-ups and post a selfie when done.",
  "Send a message to your mom that just says 'oink'.",
  "Speak in a different accent for the next 5 minutes.",
  "Admit to a bad opinion you've been hiding.",
  "Send a thumbs up to the last 5 people you talked to.",
  "Type only in capital letters for the next 10 minutes.",
  "Make up a rap verse about the person above you.",
];

const NHIE = [
  "Never have I ever lied about my age online.",
  "Never have I ever eaten food off the floor.",
  "Never have I ever stayed up more than 48 hours straight.",
  "Never have I ever blocked someone and then unblocked them to lurk.",
  "Never have I ever cried at a video game.",
  "Never have I ever pretended to be sick to avoid plans.",
  "Never have I ever Googled myself.",
  "Never have I ever sent a risky text to the wrong person.",
  "Never have I ever snuck out of the house.",
  "Never have I ever laughed so hard I cried in public.",
];

const WYR = [
  "Would you rather have unlimited money but no friends, or no money but amazing friends?",
  "Would you rather be able to fly or be invisible?",
  "Would you rather know when you'll die or how you'll die?",
  "Would you rather always speak the truth or always lie?",
  "Would you rather be famous but hated or anonymous but loved?",
  "Would you rather eat pizza every day or never eat pizza again?",
  "Would you rather be stranded on a desert island with no food, or with no water but a ton of food?",
  "Would you rather lose all your memories or never make new ones?",
  "Would you rather be able to talk to animals or speak every human language?",
  "Would you rather have no internet for a year or no music for a year?",
];

const PARANOIA = [
  "Who in this server is most likely to survive a zombie apocalypse?",
  "Who in this server would you trust with your life?",
  "Who here texts back the fastest?",
  "Who here would be the worst roommate?",
  "Who here is most likely to become famous?",
  "Who is the biggest drama starter in this server?",
  "Who here would you call at 3am with a problem?",
  "Who here is most likely to go viral?",
  "Who in this server gives the best advice?",
  "Who here would last 5 minutes in a horror movie?",
];

const FORTUNES = [
  "A beautiful journey awaits you — pack light.",
  "The answer you seek is closer than you think.",
  "Your charm is irresistible — use it wisely.",
  "Someone is thinking about you right now.",
  "A surprise is around the corner. Stay open.",
  "Hard work now = big rewards later.",
  "Trust your gut. It's smarter than your brain.",
  "Change is coming. Embrace it.",
  "The stars align in your favor today.",
  "Your kindness will come back to you tenfold.",
];

const ADVICE = [
  "Drink water. Seriously, go drink some water right now.",
  "Stop comparing your chapter 1 to someone else's chapter 20.",
  "Reply to that text you've been ignoring.",
  "Sleep more. Everything is worse when you're tired.",
  "You don't have to be productive every single day.",
  "If it won't matter in 5 years, don't spend more than 5 minutes on it.",
  "Tell someone you appreciate them today.",
  "Step outside for 10 minutes. It actually helps.",
  "The person you were yesterday doesn't have to be who you are today.",
  "It's okay to outgrow people.",
];

const FACTS = [
  "Honey never expires. Archaeologists found 3000-year-old honey in Egyptian tombs and it was still good.",
  "A group of flamingos is called a 'flamboyance'.",
  "Crows can recognize and remember human faces.",
  "The Eiffel Tower can be 15cm taller in summer due to thermal expansion.",
  "Bananas are berries, but strawberries are not.",
  "Octopuses have three hearts and blue blood.",
  "The shortest war in history lasted 38–45 minutes (Anglo-Zanzibar War, 1896).",
  "A day on Venus is longer than a year on Venus.",
  "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
  "Wombat poop is cube-shaped.",
];

const JOKES = [
  { setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything." },
  { setup: "I told my wife she was drawing her eyebrows too high.", punchline: "She looked surprised." },
  { setup: "Why don't skeletons fight each other?", punchline: "They don't have the guts." },
  { setup: "What do you call a fake noodle?", punchline: "An impasta." },
  { setup: "Why did the scarecrow win an award?", punchline: "Because he was outstanding in his field." },
  { setup: "I only know 25 letters of the alphabet.", punchline: "I don't know why." },
  { setup: "Why can't you trust an atom?", punchline: "They make up literally everything." },
  { setup: "What's a skeleton's least favorite room?", punchline: "The living room." },
  { setup: "I used to hate facial hair.", punchline: "But then it grew on me." },
  { setup: "Why did the bicycle fall over?", punchline: "Because it was two-tired." },
];

const DADJOKES = [
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
  "Why do cows wear bells? Because their horns don't work.",
  "I would tell you a construction joke, but I'm still working on it.",
  "What do you call a fish without eyes? A fsh.",
  "I used to play piano by ear. Now I use my hands.",
  "I asked my dog what two minus two is. He said nothing.",
  "Why did the coffee file a police report? It got mugged.",
  "I'm on a seafood diet. I see food and I eat it.",
  "What do you call cheese that isn't yours? Nacho cheese.",
];

const RIDDLES = [
  { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An echo" },
  { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
  { q: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. What am I?", a: "A map" },
  { q: "What has hands but can't clap?", a: "A clock" },
  { q: "I'm light as a feather, yet the strongest person can't hold me for more than a few minutes. What am I?", a: "Breath" },
  { q: "What gets wetter the more it dries?", a: "A towel" },
  { q: "I have a head and a tail but no body. What am I?", a: "A coin" },
];

const QUOTES = [
  '"The only way to do great work is to love what you do." — Steve Jobs',
  '"In the middle of every difficulty lies opportunity." — Albert Einstein',
  '"It does not matter how slowly you go as long as you do not stop." — Confucius',
  '"Life is what happens when you\'re busy making other plans." — John Lennon',
  '"The future belongs to those who believe in the beauty of their dreams." — Eleanor Roosevelt',
  '"Two things are infinite: the universe and human stupidity. And I\'m not sure about the universe." — Einstein',
  '"Be yourself; everyone else is already taken." — Oscar Wilde',
  '"You only live once, but if you do it right, once is enough." — Mae West',
];

const ROASTS = [
  "You're the human equivalent of a participation trophy.",
  "You have something on your face. Oh wait, that's just your face.",
  "I'd agree with you but then we'd both be wrong.",
  "You're not stupid; you just have bad luck thinking.",
  "I'd call you a tool, but they're actually useful.",
  "You're proof that evolution can go in reverse.",
  "Your secrets are safe with me. I never pay attention to the boring stuff.",
  "If brains were gas, you wouldn't have enough to power a fly around a cheerio.",
  "You're like a cloud. When you disappear, it's a beautiful day.",
  "I'd explain it to you, but I left my crayons at home.",
];

const COMPLIMENTS = [
  "You light up every room you walk into — fr.",
  "Your energy is genuinely contagious in the best way.",
  "You're one of those rare people who actually listens.",
  "You make everything better just by being there.",
  "Your sense of humor is elite. Like, actually elite.",
  "You have a really great vibe. It's hard to explain but it's real.",
  "People are lucky to know you.",
  "You're stronger than you think.",
  "There's something magnetic about your personality.",
  "You're doing better than you give yourself credit for.",
];

const KILL_MSGS = [
  "%killer eliminated %target with a perfectly placed LEGO on the floor.",
  "%killer destroyed %target in an intense battle of wits. %target had none.",
  "%killer sent %target to the shadow realm.",
  "%killer defeated %target using nothing but a spoon.",
  "%killer obliterated %target. It wasn't even close.",
  "%killer used their final form and deleted %target from existence.",
];

const HUG_MSGS      = ["%a gave %b the warmest hug 🤗", "%a hugged %b so tight they almost fused into one person 💙", "%a glomped %b out of nowhere!"];
const SLAP_MSGS     = ["%a slapped %b into next week 👋", "%a smacked %b with the force of a thousand suns 💥", "%a said no more and slapped %b."];
const PAT_MSGS      = ["%a gently patted %b on the head 🥺", "%a gave %b the most wholesome head pat ❤️", "%a pat pat pat 🌸"];
const KISS_MSGS     = ["%a kissed %b 💋", "%a gave %b a big smooch 😘", "%a planted a kiss on %b's cheek 💕"];
const POKE_MSGS     = ["%a poked %b. %b has been poked.", "%a ☝️ poked %b repeatedly until they responded.", "%a poked %b in the ribs."];
const CUDDLE_MSGS   = ["%a cuddled up with %b 🥰", "%a and %b are now in cuddle mode 💞", "%a refused to let go of %b 🫂"];
const BITE_MSGS     = ["%a bit %b! Did they deserve it? Probably.", "%a chomped %b. Ouch.", "%a om nom nom'd %b 🦷"];
const TICKLE_MSGS   = ["%a tickled %b until they couldn't breathe 😂", "%a snuck up and tickled %b mercilessly!", "%a's fingers found %b's weakest spot. Tickle attack! 🫵"];
const HEADPAT_MSGS  = ["%a gave %b the softest headpat 🥰", "%a pat pat pat 🐾 %b is now calmer.", "%a blessed %b with a premium headpat ✨"];
const BONK_MSGS     = ["%a bonked %b with a giant foam hammer 🔨", "%a sent %b to horny jail (via bonk) 🚔", "%a: *bonk* %b: ow"];
const YEET_MSGS     = ["%a yeeted %b into the stratosphere 🚀", "%a YEET'd %b across the server 💨", "%a yote %b into next week."];
const FEED_MSGS     = ["%a fed %b some snacks 🍪", "%a brought %b homemade cookies 🍪✨", "%a said 'open wide!' and fed %b 🥄"];
const BAKA_MSGS     = ["%a called %b a baka 😤", "%a: %b, you absolute baka!", "%b... baka! 😠 — %a"];
const CRY_MSGS      = ["%a is crying... someone comfort them 😭", "%a burst into tears. %b pls help.", "%a has entered full sob mode 😢"];
const BLUSH_MSGS    = ["%a is blushing so hard rn 😳", "%a's face is redder than a tomato 🍅", "%a: *hides face* 🫣"];
const WAVE_MSGS     = ["%a waved at %b 👋", "%a gave %b the friendliest wave!", "%a: *waves enthusiastically at %b* 👋"];
const WINK_MSGS     = ["%a winked at %b 😉", "%a: *wink* 😏 — directed at %b", "%a sent %b a cheeky wink 😜"];
const DANCE_MSGS    = ["%a started dancing 💃", "%a broke out into an impromptu dance 🕺", "%a is dancing and nobody can stop them 🎵"];
const LAUGH_MSGS    = ["%a is dying of laughter 😂", "%a: HAHAHAHAHA 💀", "%a cannot stop laughing. Someone help."];
const NEKO_MSGS     = ["%a went full neko mode 🐱 *nyan~*", "%a: *ears perk up* nyaa~ 🐾", "%a is being adorably catlike again 🐈"];
const LICK_MSGS     = ["%a licked %b. Unexpected.", "%a: *lick* 👅 %b: ??", "%a licked %b's cheek. Bold move."];
const SMUG_MSGS     = ["%a is wearing their smuggest expression 😏", "%a: *smug face* 😤", "%a is absolutely, infuriatingly smug right now."];
const STARE_MSGS    = ["%a is staring intensely at %b 👀", "%a locked eyes with %b and refused to look away.", "%a: *stares* 🔍 %b: 😳"];
const THROW_MSGS    = ["%a threw %b like a frisbee 🥏", "%a: *YOINK* and threw %b 💨", "%a flung %b across the channel."];
const CARRY_MSGS    = ["%a carried %b bridal style 💪", "%a said 'I got you' and picked up %b 🫂", "%a is carrying %b to safety."];
const HIGHFIVE_MSGS = ["%a and %b high-fived! 🙏", "%a held their hand up — %b slapped it perfectly! ✋", "%a gave %b an epic high five 🤚"];
const HANDHOLD_MSGS = ["%a is holding %b's hand 🤝", "%a grabbed %b's hand gently 💕", "%a and %b: *hand holding* 🫂"];
const PECK_MSGS     = ["%a gave %b a quick peck 😚", "%a pecked %b on the cheek and zoomed away 💨", "%a: *sneaky cheek peck* 😘 — %b"];
const NUZZLE_MSGS   = ["%a nuzzled against %b 🥺", "%a: *nuzzle nuzzle* against %b 💞", "%a buried their face against %b."];
const GLOMP_MSGS    = ["%a glomped %b out of nowhere! 💥", "%a: *running start* GLOMP — %b", "%a launched themselves at %b. 100% attachment."];
const FACEPALM_MSGS = ["%a facepalmed so hard 🤦", "%a: *facepalm* 😩", "%a's hand met their face at terminal velocity."];
const POUT_MSGS     = ["%a is pouting 😤", "%a: *full pout mode activated* 🫦", "%a put on their best pout and aimed it at %b."];
const SHRUG_MSGS    = ["%a: ¯\\_(ツ)_/¯", "%a shrugged. Not their problem.", "%a shrugged at %b's request."];
const TACKLE_MSGS   = ["%a tackled %b to the ground 💥", "%a ran full speed into %b. No warning.", "%a: *TACKLE* — %b has been taken down."];
const YAWN_MSGS     = ["%a yawned loudly 🥱", "%a: *yaaawn* 😴 now everyone else is yawning too.", "%a is absolutely exhausted."];
const NAUGHTY_MSGS  = ["%a is being naughty... 😈", "%a has been added to the naughty list 🎅❌", "%a: *does something naughty* 👀"];

function action(templates, a, b) {
  return pick(templates).replace(/%a/g, a).replace(/%b/g, b || 'nobody');
}

// ── Hack theatrical output ───────────────────────────────────────────────────
function hackLines(target) {
  const lines = [
    `> Accessing ${target}'s IP address...`,
    `> IP: ${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
    `> Scanning ports... 22/ssh OPEN`,
    `> Exploiting vulnerability CVE-2024-${Math.floor(Math.random()*9999)}...`,
    `> Dumping password hashes...`,
    `> Password cracked: **${pick(['password123','hunter2','qwerty','iloveyou','12345'])}**`,
    `> Access granted. Welcome, hacker.`,
    `> Uploading ${Math.floor(Math.random()*999)} MB of cringe...`,
    `> Done. ${target} has been pwned. 💀`,
  ];
  return lines.join('\n');
}

// ── Text transformers ─────────────────────────────────────────────────────────
function uwuify(text) {
  return text
    .replace(/r|l/g, 'w')
    .replace(/R|L/g, 'W')
    .replace(/n([aeiou])/g, 'ny$1')
    .replace(/N([aeiou])/g, 'Ny$1')
    .replace(/ove/g, 'uv')
    .replace(/!+/g, ' owo!')
    .replace(/\?+/g, ' uwu?');
}

function emojify(text) {
  const map = { a:'🇦',b:'🇧',c:'🇨',d:'🇩',e:'🇪',f:'🇫',g:'🇬',h:'🇭',i:'🇮',j:'🇯',k:'🇰',l:'🇱',m:'🇲',n:'🇳',o:'🇴',p:'🇵',q:'🇶',r:'🇷',s:'🇸',t:'🇹',u:'🇺',v:'🇻',w:'🇼',x:'🇽',y:'🇾',z:'🇿',' ':' ' };
  return text.toLowerCase().split('').map(c => map[c] || c).join(' ');
}

function toMorse(text) {
  const map = {a:'.-',b:'-...',c:'-.-.',d:'-..',e:'.',f:'..-.',g:'--.',h:'....',i:'..',j:'.---',k:'-.-',l:'.-..',m:'--',n:'-.',o:'---',p:'.--.',q:'--.-',r:'.-.',s:'...',t:'-',u:'..-',v:'...-',w:'.--',x:'-..-',y:'-.--',z:'--..',' ':'/'};
  return text.toLowerCase().split('').map(c => map[c] || c).join(' ');
}

function toBinary(text) {
  return text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ');
}

function clap(text) { return text.split(' ').join(' 👏 '); }

function vaporwave(text) {
  return text.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 33 && code <= 126) return String.fromCharCode(code + 65248);
    return c;
  }).join('');
}

function zalgo(text) {
  const above = ['̍','̎','̄','̅','̿','̑','̆','̐','͒','͗','͑','̇','̈','̊','͂','̓','̈́','͊','͋','͌','̃','̂','̌','͐','̀','́','̋','̏','̒','̓','̔','̽','̉','ͣ'];
  return text.split('').map(c => c + pick(above) + pick(above)).join('');
}

// ── Build command list ────────────────────────────────────────────────────────
module.exports = [

  // Truth or Dare cluster
  { name: 'truth', aliases: [], description: 'Random truth question',
    async execute(message) {
      const q = pick(TRUTHS);
      const embed = new EmbedBuilder().setColor(PINK).setTitle('🔮 Truth').setDescription(q).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'dare', aliases: [], description: 'Random dare',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(PINK).setTitle('🔥 Dare').setDescription(pick(DARES)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'tod', aliases: ['truthordare'], description: 'Truth or Dare',
    async execute(message) {
      const isTruth = Math.random() < 0.5;
      const embed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle(isTruth ? '🔮 Truth' : '🔥 Dare')
        .setDescription(isTruth ? pick(TRUTHS) : pick(DARES))
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'nhie', aliases: ['neverhaveiever'], description: 'Never have I ever',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🙋 Never Have I Ever').setDescription(pick(NHIE)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'wyr', aliases: ['wouldyourather'], description: 'Would you rather',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🤔 Would You Rather').setDescription(pick(WYR)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'paranoia', aliases: [], description: 'Paranoia game',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(PINK).setTitle('👀 Paranoia').setDescription(pick(PARANOIA)).setFooter({ text: 'The person to your left answers.' }).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // 8ball
  { name: '8ball', aliases: [], description: 'Magic 8-ball',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Ask a question: `,8ball will I win?`');
      const answers = ['It is certain.','It is decidedly so.','Without a doubt.','Yes, definitely.','You may rely on it.','As I see it, yes.','Most likely.','Outlook good.','Yes.','Signs point to yes.','Reply hazy, try again.','Ask again later.','Better not tell you now.','Cannot predict now.','Concentrate and ask again.','Don\'t count on it.','My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.'];
      const ans = pick(answers);
      const positive = answers.indexOf(ans) < 10;
      const embed = new EmbedBuilder()
        .setColor(positive ? GREEN : '#ED4245')
        .setTitle('🎱 Magic 8-Ball')
        .addFields(
          { name: 'Question', value: args.join(' ') },
          { name: 'Answer', value: ans },
        )
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Quick text embeds
  { name: 'fortune', aliases: [], description: 'Fortune cookie',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(YELLOW).setTitle('🥠 Fortune Cookie').setDescription(`*"${pick(FORTUNES)}"*`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'advice', aliases: [], description: 'Random advice',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(GREEN).setTitle('💡 Advice').setDescription(pick(ADVICE)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'fact', aliases: ['funfact'], description: 'Random fact',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('📚 Fun Fact').setDescription(pick(FACTS)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'joke', aliases: [], description: 'Random joke',
    async execute(message) {
      const j = pick(JOKES);
      const embed = new EmbedBuilder().setColor(YELLOW).setTitle('😂 Joke').setDescription(`${j.setup}\n\n||${j.punchline}||`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'dadjoke', aliases: ['dj'], description: 'Dad joke',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(YELLOW).setTitle('👨 Dad Joke').setDescription(pick(DADJOKES)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'riddle', aliases: [], description: 'Random riddle',
    async execute(message) {
      const r = pick(RIDDLES);
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🧩 Riddle').setDescription(r.q).setFooter({ text: `Answer: ${r.a}` }).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'quote', aliases: [], description: 'Random quote',
    async execute(message) {
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('✨ Quote').setDescription(pick(QUOTES)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Horoscope
  { name: 'horoscope', aliases: [], description: 'Get a horoscope',
    async execute(message, args) {
      const signs = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
      const sign = (args[0] || '').toLowerCase();
      if (!signs.includes(sign)) return message.reply(`❌ Valid signs: ${signs.join(', ')}`);
      const fortunes2 = ['Today favors bold moves.','Rest and recharge — big energy is coming.','A meaningful connection awaits.','Expect the unexpected.','Your patience will pay off.','Trust your instincts today.','Creative energy is at an all-time high.','A lesson is disguised as an obstacle.','Something lost will be found.','The universe is conspiring in your favor.'];
      const embed = new EmbedBuilder().setColor(PINK).setTitle(`♈ ${sign.charAt(0).toUpperCase() + sign.slice(1)} Horoscope`).setDescription(pick(fortunes2)).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Percentage generators
  { name: 'ship', aliases: [], description: 'Love compatibility',
    async execute(message, args) {
      const u1 = message.mentions.users.first();
      const u2 = message.mentions.users.at(1);
      if (!u1 || !u2) return message.reply('❌ Mention two users: `,ship @user1 @user2`');
      const score = pct(u1.id + u2.id, 42);
      const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
      const embed = new EmbedBuilder()
        .setColor(PINK).setTitle('💘 Shipometer')
        .setDescription(`**${u1.username}** ❤️ **${u2.username}**\n\`${bar}\` **${score}%**\n\n${score >= 80 ? 'Perfect match 💕' : score >= 50 ? 'There might be something there 👀' : score >= 25 ? 'A little rocky...' : 'Yikes. Not looking good 💔'}`)
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'iq', aliases: [], description: 'Random IQ',
    async execute(message, args) {
      const t = message.mentions.users.first() || message.author;
      const score = pct(t.id, 7);
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🧠 IQ Test Results').setDescription(`**${t.username}**'s IQ is **${score}**\n${score >= 130 ? 'Absolutely galaxy-brained 🌌' : score >= 100 ? 'Pretty solid 🙂' : score >= 70 ? 'Questionable at best 👀' : 'Not a single thought behind those eyes 💀'}`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'pp', aliases: [], description: 'PP size',
    async execute(message) {
      const t = message.mentions.users.first() || message.author;
      const size = pct(t.id, 13) % 20;
      const bar = '8' + '='.repeat(size) + 'D';
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('📏 PP Meter').setDescription(`**${t.username}**:\n\`${bar}\` (${size} inches)`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'simp', aliases: [], description: 'Simp percentage',
    async execute(message) {
      const t = message.mentions.users.first() || message.author;
      const score = pct(t.id, 99);
      const embed = new EmbedBuilder().setColor(PINK).setTitle('😔 Simp-O-Meter').setDescription(`**${t.username}** is **${score}%** simp\n${score >= 80 ? 'Certified simp 🪣' : score >= 50 ? 'Halfway there 😅' : 'Not too bad 👍'}`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'sus', aliases: [], description: 'Sus level',
    async execute(message) {
      const t = message.mentions.users.first() || message.author;
      const score = pct(t.id, 69);
      const embed = new EmbedBuilder().setColor('#f0a500').setTitle('📮 Sus-O-Meter').setDescription(`**${t.username}** is **${score}%** sus\n${score >= 80 ? 'Ejected. It was them. 🚀' : score >= 50 ? 'Acting kinda sus ngl 👀' : 'Probably not the impostor.'}`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'gay', aliases: [], description: 'Gay percentage',
    async execute(message) {
      const t = message.mentions.users.first() || message.author;
      const score = pct(t.id, 55);
      const embed = new EmbedBuilder().setColor(PINK).setTitle('🏳️‍🌈 Gay-O-Meter').setDescription(`**${t.username}** is **${score}%** gay 🌈`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'ratio', aliases: [], description: 'Ratio someone',
    async execute(message) {
      const t = message.mentions.users.first();
      await message.reply(t ? `ratio + you fell off + L + ${t} is cringe` : 'ratio + L + you fell off');
    }
  },

  // Games
  { name: 'rps', aliases: [], description: 'Rock paper scissors',
    async execute(message, args) {
      const choices = ['rock','paper','scissors'];
      const player = (args[0] || '').toLowerCase();
      if (!choices.includes(player)) return message.reply('❌ Choose: rock, paper, or scissors');
      const bot = pick(choices);
      let result = 'It\'s a **tie**!';
      if ((player === 'rock' && bot === 'scissors') || (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper')) result = 'You **win**! 🎉';
      if ((bot === 'rock' && player === 'scissors') || (bot === 'paper' && player === 'rock') || (bot === 'scissors' && player === 'paper')) result = 'You **lose**! 💀';
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🪨 Rock Paper Scissors').setDescription(`You: **${player}**\nBot: **${bot}**\n\n${result}`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  // coinflip, roll/dice moved to gambling.js (interactive)
  { name: 'trivia', aliases: [], description: 'Random trivia',
    async execute(message) {
      const questions = [
        { q: 'What is the capital of Australia?', a: 'Canberra', opts: ['Sydney','Melbourne','Canberra','Brisbane'] },
        { q: 'How many sides does a hexagon have?', a: '6', opts: ['5','6','7','8'] },
        { q: 'What planet is known as the Red Planet?', a: 'Mars', opts: ['Venus','Jupiter','Mars','Saturn'] },
        { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', opts: ['Michelangelo','Raphael','Leonardo da Vinci','Picasso'] },
        { q: 'What is the chemical symbol for gold?', a: 'Au', opts: ['Go','Gd','Au','Ag'] },
        { q: 'In what year did World War II end?', a: '1945', opts: ['1943','1944','1945','1946'] },
        { q: 'How many bones are in the adult human body?', a: '206', opts: ['196','206','216','226'] },
        { q: 'What is the fastest land animal?', a: 'Cheetah', opts: ['Lion','Cheetah','Horse','Greyhound'] },
      ];
      const t = pick(questions);
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('🧠 Trivia').setDescription(`**${t.q}**\n\n${t.opts.map((o,i) => `${['🇦','🇧','🇨','🇩'][i]} ${o}`).join('\n')}`).setFooter({ text: `Answer: ||${t.a}||` }).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'choose', aliases: ['pick'], description: 'Pick between options',
    async execute(message, args) {
      const options = args.join(' ').split('|').map(s => s.trim()).filter(Boolean);
      if (options.length < 2) return message.reply('❌ Usage: `,choose option1 | option2 | option3`');
      const embed = new EmbedBuilder().setColor(GREEN).setTitle('🎯 I choose...').setDescription(`**${pick(options)}**`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Action commands — target required
  { name: 'hug',       aliases: [], description: 'Hug someone',         async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(HUG_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'slap',      aliases: [], description: 'Slap someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(SLAP_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'pat',       aliases: [], description: 'Pat someone',         async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(PAT_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'kiss',      aliases: [], description: 'Kiss someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(KISS_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'poke',      aliases: [], description: 'Poke someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(POKE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'cuddle',    aliases: [], description: 'Cuddle someone',      async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(CUDDLE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'bite',      aliases: [], description: 'Bite someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(BITE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'tickle',    aliases: [], description: 'Tickle someone',      async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(TICKLE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'headpat',   aliases: ['pat2'], description: 'Headpat someone', async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(HEADPAT_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'bonk',      aliases: [], description: 'Bonk someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(BONK_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'yeet',      aliases: [], description: 'Yeet someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(action(YEET_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'feed',      aliases: [], description: 'Feed someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(action(FEED_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'baka',      aliases: [], description: 'Call someone baka',   async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(BAKA_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'lick',      aliases: [], description: 'Lick someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(LICK_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'stare',     aliases: [], description: 'Stare at someone',    async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(action(STARE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'throw',     aliases: [], description: 'Throw someone',       async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(THROW_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'carry',     aliases: [], description: 'Carry someone',       async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(CARRY_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'highfive',  aliases: ['hf'], description: 'High five someone', async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(action(HIGHFIVE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'handhold',  aliases: [], description: 'Hold someone\'s hand',async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(HANDHOLD_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'peck',      aliases: [], description: 'Peck someone',        async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(PECK_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'nuzzle',    aliases: [], description: 'Nuzzle someone',      async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(NUZZLE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'glomp',     aliases: [], description: 'Glomp someone',       async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(GLOMP_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'tackle',    aliases: [], description: 'Tackle someone',      async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(TACKLE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'wave',      aliases: [], description: 'Wave at someone',     async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(action(WAVE_MSGS, message.author.username, t.username)).setTimestamp()] }); } },
  { name: 'wink',      aliases: [], description: 'Wink at someone',     async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention someone!'); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(WINK_MSGS, message.author.username, t.username)).setTimestamp()] }); } },

  // Action commands — no target required
  { name: 'cry',       aliases: [], description: 'Cry',                 async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(action(CRY_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'blush',     aliases: [], description: 'Blush',               async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(BLUSH_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'neko',      aliases: [], description: 'Go neko',             async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(NEKO_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'smug',      aliases: [], description: 'Smug face',           async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(SMUG_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'dance',     aliases: [], description: 'Dance',               async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(DANCE_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'laugh',     aliases: ['lol'], description: 'Laugh',          async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(action(LAUGH_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'facepalm',  aliases: ['fp'], description: 'Facepalm',        async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(FACEPALM_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'pout',      aliases: [], description: 'Pout',                async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(PINK).setDescription(action(POUT_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'shrug',     aliases: [], description: 'Shrug',               async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(action(SHRUG_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'yawn',      aliases: [], description: 'Yawn',                async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(action(YAWN_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },
  { name: 'naughty',   aliases: [], description: 'Be naughty',          async execute(message) { const t = message.mentions.users.first(); await message.reply({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(action(NAUGHTY_MSGS, message.author.username, t?.username)).setTimestamp()] }); } },

  { name: 'roast',     aliases: [], description: 'Roast someone',       async execute(message) { const t = message.mentions.users.first(); const embed = new EmbedBuilder().setColor('#ED4245').setTitle('🔥 Roast').setDescription(t ? `${t} ${pick(ROASTS)}` : pick(ROASTS)).setTimestamp(); await message.reply({ embeds: [embed] }); } },
  { name: 'compliment',aliases: [], description: 'Compliment someone',  async execute(message) { const t = message.mentions.users.first(); const embed = new EmbedBuilder().setColor(PINK).setTitle('💖 Compliment').setDescription(t ? `${t} — ${pick(COMPLIMENTS)}` : pick(COMPLIMENTS)).setTimestamp(); await message.reply({ embeds: [embed] }); } },
  { name: 'kill',      aliases: [], description: 'Fake kill',           async execute(message) { const t = message.mentions.users.first(); if (!t) return message.reply('❌ Mention a target!'); const msg2 = pick(KILL_MSGS).replace('%killer', message.author.username).replace('%target', t.username); const embed = new EmbedBuilder().setColor('#ED4245').setTitle('💀 Eliminated').setDescription(msg2).setTimestamp(); await message.reply({ embeds: [embed] }); } },

  // Fake hack
  { name: 'hack', aliases: [], description: 'Fake hack',
    async execute(message) {
      const t = message.mentions.users.first();
      if (!t) return message.reply('❌ Mention someone to hack!');
      const msg = await message.reply('```\n> Initializing...\n```');
      await new Promise(r => setTimeout(r, 1500));
      await msg.edit(`\`\`\`\n${hackLines(t.username)}\n\`\`\``);
    }
  },

  // Marry / divorce (simple, no persistence)
  { name: 'marry', aliases: [], description: 'Propose marriage',
    async execute(message) {
      const t = message.mentions.users.first();
      if (!t) return message.reply('❌ Mention someone to propose to!');
      if (t.id === message.author.id) return message.reply('❌ You can\'t marry yourself... probably.');
      const embed = new EmbedBuilder().setColor(PINK).setTitle('💍 Proposal').setDescription(`${message.author} has proposed to ${t}!\n\n*(This is just for fun — no database persistence yet)*`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
  { name: 'divorce', aliases: [], description: 'Divorce',
    async execute(message) {
      const embed = new EmbedBuilder().setColor('#ED4245').setTitle('📄 Divorce Papers').setDescription(`${message.author} has filed for divorce. The lawyers are being called...`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Text transformers
  { name: 'emojify', aliases: [], description: 'Emojify text',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,emojify <text>`');
      const result = emojify(args.join(' '));
      await message.reply(result.slice(0, 2000));
    }
  },
  { name: 'morse', aliases: [], description: 'Morse code',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,morse <text>`');
      await message.reply(`\`${toMorse(args.join(' ')).slice(0, 1990)}\``);
    }
  },
  { name: 'binary', aliases: [], description: 'Binary',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,binary <text>`');
      await message.reply(`\`${toBinary(args.join(' ')).slice(0, 1990)}\``);
    }
  },
  { name: 'uwu', aliases: [], description: 'UwUify text',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,uwu <text>`');
      await message.reply(uwuify(args.join(' ')).slice(0, 2000));
    }
  },
  { name: 'clap', aliases: [], description: 'Clap between words',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,clap <text>`');
      await message.reply(clap(args.join(' ')).slice(0, 2000));
    }
  },
  { name: 'vaporwave', aliases: ['vapor','ae'], description: 'Vaporwave text',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,vaporwave <text>`');
      await message.reply(vaporwave(args.join(' ')).slice(0, 2000));
    }
  },
  { name: 'zalgo', aliases: ['creepy'], description: 'Zalgo/creepy text',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,zalgo <text>`');
      await message.reply(zalgo(args.join(' ')).slice(0, 2000));
    }
  },

  // Hot or not
  { name: 'hotornot', aliases: [], description: 'Who is hotter',
    async execute(message) {
      const u1 = message.mentions.users.first();
      const u2 = message.mentions.users.at(1);
      if (!u1 || !u2) return message.reply('❌ Mention two users: `,hotornot @user1 @user2`');
      const winner = Math.random() < 0.5 ? u1 : u2;
      const embed = new EmbedBuilder().setColor(PINK).setTitle('🔥 Hot or Not').setDescription(`After careful analysis...\n\n**${winner.username}** is hotter 🔥`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Steal
  { name: 'steal', aliases: [], description: 'Steal from someone',
    async execute(message) {
      const t = message.mentions.users.first();
      if (!t) return message.reply('❌ Mention someone to steal from!');
      const items = ['their WiFi password','their last snack','their motivation','their vibe','their whole personality','absolutely nothing — they caught you 💀','$0.02 and a broken pen'];
      const embed = new EmbedBuilder().setColor(YELLOW).setTitle('🕵️ Theft Attempt').setDescription(`${message.author} tried to steal from ${t} and got away with **${pick(items)}**!`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // Rate
  { name: 'rate', aliases: [], description: 'Rate anything',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,rate <thing>`');
      const thing = args.join(' ');
      const score = Math.floor(Math.random() * 11);
      const bar = '█'.repeat(score) + '░'.repeat(10 - score);
      const embed = new EmbedBuilder().setColor(BLUE).setTitle('⭐ Rating').setDescription(`**${thing}**\n\`${bar}\` **${score}/10**\n${score >= 9 ? 'Absolutely peak.' : score >= 7 ? 'Pretty solid ngl.' : score >= 5 ? 'Mid.' : score >= 3 ? 'Not great...' : 'Delete it.'}`).setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },

  // blackjack, slots, hilo, guess moved to gambling.js (interactive)

  // ── Scramble ─────────────────────────────────────────────────────────────────
  { name: 'scramble', aliases: [], description: 'Unscramble the word',
    async execute(message, args) {
      const WORDS = ['discord','javascript','keyboard','monitor','internet','python','database','algorithm','function','variable'];
      const word = pick(WORDS);
      const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🔀 Word Scramble')
        .setDescription(`Unscramble this word:\n\n**\`${scrambled}\`**\n\nType your answer now! You have 20 seconds.`)
        .setFooter({ text: `Hint: ${word.length} letters` })
        .setTimestamp();
      await message.reply({ embeds: [embed] });

      const filter = m => m.author.id === message.author.id;
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 }).catch(() => null);
      const answer = collected?.first()?.content?.toLowerCase().trim();

      if (answer === word) {
        await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('✅ Correct!').setDescription(`**${word}** — well done, ${message.author}!`).setTimestamp()] });
      } else {
        await message.channel.send({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ Time\'s up!').setDescription(`The word was **${word}**.`).setTimestamp()] });
      }
    }
  },

  // ── Hangman ──────────────────────────────────────────────────────────────────
  { name: 'hangman', aliases: [], description: 'Play hangman',
    async execute(message) {
      const WORDS = ['apple','tiger','planet','guitar','castle','flower','jungle','wizard','rocket','bridge'];
      const word = pick(WORDS);
      const letters = new Set();
      let wrong = 0;
      const MAX = 6;

      const STAGES = ['😀','😐','😟','😰','😱','😵','💀'];
      const display = () => word.split('').map(c => letters.has(c) ? `**${c}**` : `\\_`).join(' ');
      const wrongLetters = () => [...letters].filter(l => !word.includes(l)).join(', ') || 'none';

      const buildEmbed = () => new EmbedBuilder()
        .setColor(wrong >= MAX ? '#ED4245' : wrong >= 4 ? YELLOW : BLUE)
        .setTitle(`${STAGES[wrong]} Hangman`)
        .addFields(
          { name: 'Word',           value: display() },
          { name: 'Wrong guesses',  value: `${wrongLetters()} (${wrong}/${MAX})` },
        )
        .setFooter({ text: 'Type a single letter to guess!' })
        .setTimestamp();

      const sent = await message.reply({ embeds: [buildEmbed()] });

      const filter = m => m.author.id === message.author.id && /^[a-z]$/i.test(m.content);
      const collector = message.channel.createMessageCollector({ filter, time: 60000 });

      collector.on('collect', async (m) => {
        const letter = m.content.toLowerCase();
        letters.add(letter);
        if (!word.includes(letter)) wrong++;

        const won = word.split('').every(c => letters.has(c));
        if (won || wrong >= MAX) {
          collector.stop();
          const finalEmbed = new EmbedBuilder()
            .setColor(won ? GREEN : '#ED4245')
            .setTitle(won ? '🎉 You Win!' : '💀 You Lose!')
            .setDescription(`The word was **${word}**`)
            .setTimestamp();
          await sent.edit({ embeds: [finalEmbed] });
        } else {
          await sent.edit({ embeds: [buildEmbed()] });
        }
      });

      collector.on('end', async (_, reason) => {
        if (reason === 'time') {
          await sent.edit({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('⏰ Time\'s up!').setDescription(`The word was **${word}**`).setTimestamp()] });
        }
      });
    }
  },

  // ── Math Race ────────────────────────────────────────────────────────────────
  { name: 'mathrace', aliases: [], description: 'Solve the math problem first',
    async execute(message) {
      const a = Math.floor(Math.random() * 20) + 1;
      const b = Math.floor(Math.random() * 20) + 1;
      const ops = ['+','-','×'];
      const op  = pick(ops);
      const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('⚡ Math Race')
        .setDescription(`**${a} ${op} ${b} = ?**\n\nFirst to answer correctly wins! (30s)`)
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });

      const filter = m => parseInt(m.content) === answer;
      const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 }).catch(() => null);

      if (collected?.size) {
        const winner = collected.first().author;
        await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('🏆 Winner!').setDescription(`${winner} answered first! **${a} ${op} ${b} = ${answer}**`).setTimestamp()] });
      } else {
        await message.channel.send({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('⏰ No one answered!').setDescription(`The answer was **${answer}**`).setTimestamp()] });
      }
    }
  },
];

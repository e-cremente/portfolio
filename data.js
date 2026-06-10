/* =================================================================
   DATI DEI PROGETTI
   -----------------------------------------------------------------
   Per aggiungere un gioco nuovo: copia un blocco { ... } qui sotto,
   cambia i campi e basta. Comparirà automaticamente nella home e
   avrà la sua pagina di dettaglio (project.html?id=IL-TUO-ID).

   Campi:
   - id        : identificativo univoco usato nell'URL (minuscolo, senza spazi)
   - engine    : "unity" | "unreal"  (usato dal filtro)
   - date      : AAAAMMGG  (usato dall'ordinamento)
   - videoId   : ID del video YouTube (la miniatura diventa l'anteprima).
                 Lascia "" se non c'è video.
   - image     : immagine di anteprima/dettaglio se NON c'è un video
                 (es. "Images/Logo.png"). Usata solo se videoId è "".
   - github    : link alla repo
   - download  : { url, en, it }  -> testo del bottone nelle due lingue
   - gameplay  : (opzionale) link a un video gameplay extra
   - tech      : etichette tecnologiche mostrate sulle card
   - en / it   : testi nelle due lingue
       title   : titolo
       worked  : "What I worked on" (può contenere HTML)
       devtime : tempo di sviluppo
       short   : descrizione BREVE per la card della home
       long    : array di paragrafi per la pagina di dettaglio (HTML ammesso)
   ================================================================= */

const PROJECTS = [
  {
    id: "snakeshifter",
    engine: "unity",
    date: "20241219",
    videoId: "TF1pGFTLkf8",
    image: "",
    github: "https://github.com/e-cremente/SnakeShifter",
    download: { url: "https://drive.google.com/file/d/1zugG4ZqbVVemEuA-xUsaNpnmlXmuvn1W/view?usp=drive_link", en: "Download .exe build", it: "Scarica build .exe" },
    tech: ["Unity", "C#", "Fake 2D"],
    en: {
      title: "SnakeShifter",
      worked: "Everything, from start to finish.",
      devtime: "3 weeks",
      short: "My very first project — a twist on classic Snake where shape and colour decide what you're allowed to eat next.",
      long: [
        "A big classic. This was my first ever project from every point of view: first time working in a team with designers, first academic project, first time touching Unity. Looking back at it makes me nostalgic!",
        "The game is a reinterpretation of the classic Snake. In SnakeShifter you start as a white snake, and after eating your first \"fruit\" you can only eat fruits that share the same shape or the same colour as the last one (ever played Uno?). Add ticking time bombs (the pulsating fruits), increasing speed and power-ups, and you get a pretty entertaining game for a first attempt!",
        "It looks 2D but it's actually an orthographic camera looking down on the play field. The whole thing uses only Unity's basic shapes and runs on a system of custom ticks fired at calculated moments. The code is what it is — I smile when I look back at this project, but I can't say I didn't have fun!"
      ]
    },
    it: {
      title: "SnakeShifter",
      worked: "Tutto, dall'inizio alla fine.",
      devtime: "3 settimane",
      short: "Il mio primissimo progetto — una rivisitazione del classico Snake dove forma e colore decidono cosa puoi mangiare.",
      long: [
        "Un grande classico. È stato il mio primissimo progetto sotto ogni punto di vista: primo lavoro in team con dei designer, primo progetto accademico, primo approccio a Unity. Riguardarlo mi mette un po' di nostalgia!",
        "Il gioco è una rivisitazione del classico Snake. In SnakeShifter inizi come un serpente bianco e, dopo aver mangiato il primo \"frutto\", puoi mangiare solo i frutti successivi che condividono la stessa forma o lo stesso colore dell'ultimo (mai giocato a Uno?). Aggiungici delle bombe a tempo (i frutti pulsanti), la velocità che aumenta e i power-up, e ottieni un gioco piuttosto divertente per essere un esordio!",
        "Sembra 2D ma in realtà è solo una camera ortografica che inquadra dall'alto il campo di gioco. Usa esclusivamente le forme base di Unity e funziona su un sistema di tick personalizzati che scattano in momenti calcolati. Il codice è quello che è — sorrido anch'io riguardando questo progetto, ma non posso dire di non essermi divertito!"
      ]
    }
  },

  {
    id: "suspack",
    engine: "unity",
    date: "20250220",
    videoId: "",
    image: "Images/SusPackLogo.png",
    github: "https://github.com/e-cremente/SusPack/",
    download: { url: "https://globalgamejam.org/games/2025/suspack-8", en: "Build on Global Game Jam", it: "Build su Global Game Jam" },
    tech: ["Unity", "C#", "First Person", "Jam"],
    en: {
      title: "SusPack",
      worked: "CCC (Camera, Character, Controller), the weapon (animation integration, reload, shooting) and the projectile (environment interaction, collisions with floor/enemies with different behaviours), the BubbleWrap behaviour, game rules, the box interaction system; helped with game flow and UI; voiced the main character.",
      devtime: "1 week",
      short: "My first ever game jam, and the dear child I keep in my heart. Steal back your \"suspicious packages\" with a bubble-wrap gun.",
      long: [
        "Of all my projects, SusPack is like the dear child I always keep in my heart. It was my very first game jam (aka a deeply unhealthy lifestyle of sleepless nights and a food intake not really definable as a \"diet\") and my first work done entirely outside my academic career. The jam's theme was \"Bubble\".",
        "It may seem like nothing, but student projects are always \"safer\": you have experienced people covering your back and helping out, especially during the planning phases. Here we were completely independent, and I also worked with people I'd never met before (a minority, but still)... and let me tell you, it absolutely shows. The repository of this project is a complete mess, and I still remember that on the last day all the colliders in the level magically disappeared, which meant a frantic last-minute scramble to put everything back (we failed). If that isn't the core experience of a game jam, I don't know what is.",
        "In SusPack you play as a man who sent some... \"suspicious packages\" to an acquaintance while inebriated. The morning after, he regrets it and infiltrates the post warehouse to \"steal back\" the packages before they're sent for good. If only the office weren't guarded by patrolling robots ready to stop anyone from interfering with their job... With your bubble-wrap gun you have to retrieve all the packages without getting caught, and then escape the warehouse.",
        "P.S. Even though we never recorded a proper trailer and the gameplay footage is kind of random, someone decided to speedrun our game 10 minutes after we released it. I still don't know how he finished it so fast, but my team and I were flattered to see our game being speedrun! You can watch that glorious run <a href=\"https://drive.google.com/file/d/1a1fKjwZlBnMqGhCJPplJoQY-YAUvzbYL/view?usp=drive_link\" target=\"_blank\" rel=\"noopener\">here</a>. Just please don't judge the game from it — it looks like a showcase of everything that's broken (walking during the black screen after a restart, clipping through things we didn't manage to re-collider in time)... Still, fun!"
      ]
    },
    it: {
      title: "SusPack",
      worked: "CCC (Camera, Character, Controller), l'arma (integrazione animazioni, ricarica, sparo) e il proiettile (interazione con l'ambiente, collisioni con pavimento/nemici con comportamenti diversi), il comportamento del pluriball, le regole di gioco, il sistema di interazione con le scatole; ho dato una mano con il flusso di gioco e la UI; ho doppiato il protagonista.",
      devtime: "1 settimana",
      short: "La mia primissima game jam, e il pargolo che porto nel cuore. Riprenditi i tuoi \"pacchi sospetti\" con una pistola a pluriball.",
      long: [
        "Di tutti i miei progetti, SusPack è come il pargolo che tengo sempre nel cuore. È stata la mia primissima game jam (ovvero uno stile di vita profondamente malsano fatto di notti insonni e un apporto alimentare non proprio definibile come \"dieta\") e il mio primo lavoro interamente fuori dal percorso accademico. Il tema della jam era \"Bubble\".",
        "Sembrerà una sciocchezza, ma i progetti da studente sono sempre più \"sicuri\": hai persone esperte che ti coprono le spalle e ti aiutano, soprattutto nelle fasi di organizzazione. Qui eravamo completamente indipendenti, e ho anche lavorato con persone mai conosciute prima (la minoranza, ma comunque)... e lascia che te lo dica, si vede tutto. La repository di questo progetto è un disastro completo, e mi ricordo ancora che l'ultimo giorno tutti i collider del livello sono spariti magicamente, il che ha significato una corsa contro il tempo negli ultimi minuti per rimettere tutto a posto (non ci siamo riusciti). Se questa non è l'essenza di una game jam, non so cosa lo sia.",
        "In SusPack interpreti un uomo che ha spedito dei... \"pacchi sospetti\" a un conoscente mentre era ubriaco. La mattina dopo se ne pente e si infiltra nel magazzino postale per \"rubarsi indietro\" i pacchi prima che vengano spediti per davvero. Se solo l'ufficio non fosse sorvegliato da robot di pattuglia pronti a impedire a chiunque di intralciare il loro lavoro... Con la tua pistola a pluriball devi recuperare tutti i pacchi senza farti beccare, e poi scappare dal magazzino.",
        "P.S. Anche se non abbiamo mai registrato un vero trailer e il gameplay mostrato è un po' casuale, c'è una persona che ha deciso di fare una speedrun del nostro gioco 10 minuti dopo che l'avevamo rilasciato. Ancora non so come abbia fatto a finirlo così in fretta, ma io e il team siamo stati lusingati di vedere il nostro gioco \"speedrunnato\"! Quella gloriosa performance la puoi vedere <a href=\"https://drive.google.com/file/d/1a1fKjwZlBnMqGhCJPplJoQY-YAUvzbYL/view?usp=drive_link\" target=\"_blank\" rel=\"noopener\">qui</a>. Ti prego però di non giudicare il gioco da questo — sembra una vetrina di tutto ciò che è rotto (camminare durante lo schermo nero dopo un restart, attraversare oggetti a cui non siamo riusciti a rimettere il collider in tempo)... Ciononostante, divertente!"
      ]
    }
  },

  {
    id: "ragnaraft",
    engine: "unity",
    date: "20250417",
    videoId: "8Ox535Wi5cY",
    image: "",
    github: "https://github.com/e-cremente/Ragnaraft",
    download: { url: "https://drive.google.com/file/d/1DjS-zeoIHLirU1AU7NxXBxGilSZlriHv/view?usp=drive_link", en: "Download for Android", it: "Scarica per Android" },
    tech: ["Unity", "C#", "Mobile", "2D"],
    en: {
      title: "Ragnaraft",
      worked: "CCC, level interactions (collisions and hazards), level construction (section ordering and obstacle spawning), collectibles and save systems, the tutorial section, asset integration and animations; helped with sound and UI.",
      devtime: "1.5 months",
      short: "My first mobile experiment: a local co-op game on a single phone screen where one viking literally is the boat.",
      long: [
        "This was my second project and my first ever mobile experiment! The task was to make a game playable in local co-op on a single mobile screen.",
        "My first instinct was to push for cooperation rather than competition, and I managed to convince the rest of the team to go that way. The idea was a little vehicle that moves in different directions depending on where the players tap. After some brainstorming we landed on a small story about two vikings and a boat — which ended up being a situation where, instead of two vikings on a boat, one of the vikings IS the boat and the other one rides him. And so Ragnaraft was born! Ride through the obstacles and reach the end to get to the damsel!",
        "P.S. Shortly after we finished, the game <a href=\"https://store.steampowered.com/app/3570070/Paddle_Paddle_Paddle/\" target=\"_blank\" rel=\"noopener\">Paddle Paddle Paddle</a> came out. I'll be honest, I was a bit salty to see an idea so similar to ours go viral after release — but at the same time I was happy, because it's proof that the concept behind our game works!"
      ]
    },
    it: {
      title: "Ragnaraft",
      worked: "CCC, interazioni col livello (collisioni e ostacoli), costruzione del livello (ordinamento delle sezioni e spawn degli ostacoli), collezionabili e sistemi di salvataggio, la sezione tutorial, integrazione degli asset e animazioni; ho dato una mano con audio e UI.",
      devtime: "1 mese e mezzo",
      short: "Il mio primo esperimento mobile: un co-op locale su un solo schermo del telefono, dove un vichingo è letteralmente la barca.",
      long: [
        "Questo è stato il mio secondo progetto e il mio primissimo esperimento mobile! Il compito era creare un gioco giocabile in co-op locale su un singolo schermo di smartphone.",
        "Il mio primo istinto è stato spingere verso la cooperazione invece che la competizione, e sono riuscito a convincere il resto del team a seguire questa strada. L'idea era un piccolo veicolo che si muove in direzioni diverse a seconda di dove toccano i giocatori. Dopo un po' di brainstorming siamo arrivati a una storiella su due vichinghi e una barca — che è finita per essere una situazione in cui, invece di due vichinghi su una barca, uno dei vichinghi È la barca e l'altro lo cavalca. E così è nato Ragnaraft! Attraversa gli ostacoli e arriva alla fine per raggiungere la damigella!",
        "P.S. Poco dopo che avevamo finito, è uscito il gioco <a href=\"https://store.steampowered.com/app/3570070/Paddle_Paddle_Paddle/\" target=\"_blank\" rel=\"noopener\">Paddle Paddle Paddle</a>. Sarò onesto, mi sono un po' rosicato nel vedere un'idea così simile alla nostra diventare virale dopo l'uscita — ma allo stesso tempo ero contento, perché è la prova che il concept dietro al nostro gioco funziona!"
      ]
    }
  },

  {
    id: "toduat",
    engine: "unity",
    date: "20250627",
    videoId: "Z7FnocU8ekk",
    image: "",
    github: "https://github.com/e-cremente/ToDuat",
    download: { url: "https://drive.google.com/file/d/10ADsGcVMAdr5Mb-4aUeahfINGpgOv4G2/view?usp=drive_link", en: "Download .exe build", it: "Scarica build .exe" },
    gameplay: "https://youtu.be/ypKf5tZiVtY",
    tech: ["Unity", "C#", "First Person"],
    en: {
      title: "ToDuat!",
      worked: "CCC, the interaction system (organs, vases, tables), game flow and rules, the quest system, the tutorial; helped with the dialogue system, machine behaviours and animations, and the systems that let designers easily create new days and new bodies (potentially adding new levels or an infinite mode in the future).",
      devtime: "2 months",
      short: "The first game I'd call \"complete\". You're Anubis' assistant in an Egyptian funeral-service sim — judge the dead and send them on their way.",
      long: [
        "ToDuat! is probably the first game I consider closer to the \"complete\" side. It has a flow, it has personality and — something not to be taken for granted — you can actually reach an ending!",
        "The assigned task was a first-person \"job simulator\" with a twist. We drew our job from a jar of little papers and ended up with \"funeral services\". We set the game in an Egyptian atmosphere, with the twist of being Anubis' assistant.",
        "The flow: a body arrives and you help Anubis make his judgement — is this body worthy of being sent to Duat, or is it a sinner who must be sent to rot in \"hell\"? Following a set of instructions Anubis left you, you purify the body, prepare it for its voyage, and send it to the correct destination. The game spans 4 different days, split into two work shifts. As you progress, new machinery, instructions and difficulties pile onto the cauldron of activities. Depending on how well you perform, you can reach different endings. Will Anubis be satisfied with your work, or will he consider sending you to rot in \"hell\"?",
        "I think this game has more potential than the average 2-month project. I'll admit there's a bit of a lack of feedback, and the way the player is instructed just isn't clear enough, which creates some confusion early on.",
        "During development I tried hard not to use Unity's default CharacterController and built my movement from scratch, without a Rigidbody. Unfortunately, no matter how hard I tried, the movement just isn't fine-tuned enough: by spamming some buttons (go on, try — eventually you'll manage) you can clip through things. Grrrr... maddening! There's also a flow-breaking bug at the start if you do your best to NOT follow what the tutorial tells you. Will I fix it one day? Maybe...",
        "P.S. A teammate of mine kept working on this project for a while, implementing a more solid movement with the CharacterController. If you want to try that build, contact me and I'll find a way to get it to you!"
      ]
    },
    it: {
      title: "ToDuat!",
      worked: "CCC, il sistema di interazione (organi, vasi, tavoli), flusso e regole di gioco, il sistema di quest, il tutorial; ho dato una mano con il sistema di dialoghi, i comportamenti dei macchinari e le animazioni, e i sistemi che permettono ai designer di creare facilmente nuovi giorni e nuovi corpi (con la possibilità, in futuro, di aggiungere nuovi livelli o una modalità infinita).",
      devtime: "2 mesi",
      short: "Il primo gioco che definirei \"completo\". Sei l'assistente di Anubi in un simulatore di servizi funebri egizio — giudica i morti e mandali al loro destino.",
      long: [
        "ToDuat! è probabilmente il primo gioco che considero più dal lato \"completo\". Ha un flusso, ha una personalità e — cosa da non dare per scontata — puoi davvero raggiungere un finale!",
        "Il compito assegnato era un \"job simulator\" in prima persona con un twist. Abbiamo estratto il mestiere da un barattolo di bigliettini ed è uscito \"servizi funebri\". Abbiamo ambientato il gioco in un'atmosfera egizia, con il twist di essere l'assistente di Anubi.",
        "Il flusso: arriva un corpo e tu aiuti Anubi a dare il suo giudizio — questo corpo è degno di essere mandato a Duat, o è un peccatore da spedire a marcire all'\"inferno\"? Seguendo una serie di istruzioni che Anubi ti ha lasciato, purifichi il corpo, lo prepari per il suo viaggio e lo mandi alla destinazione corretta. Il gioco si svolge in 4 giorni diversi, divisi in due turni di lavoro. Man mano che avanzi, nuovi macchinari, istruzioni e difficoltà si aggiungono al calderone di attività. A seconda di come te la cavi, puoi raggiungere finali diversi. Anubi sarà soddisfatto del tuo lavoro, o penserà di mandarti a marcire all'\"inferno\"?",
        "Penso che questo gioco abbia più potenziale della media dei progetti fatti in 2 mesi. Ammetto che c'è un po' di carenza di feedback e che il modo in cui il giocatore viene istruito non è abbastanza chiaro, creando un po' di confusione all'inizio.",
        "Durante lo sviluppo ho fatto del mio meglio per non usare il CharacterController di default di Unity, costruendo il movimento da zero, senza Rigidbody. Purtroppo, per quanto ci abbia provato, il movimento non è abbastanza rifinito: spammando alcuni tasti (provaci, prima o poi ci riuscirai) riesci ad attraversare gli oggetti. Grrrr... che rabbia! C'è anche un bug che rompe il flusso all'inizio del gioco se fai del tuo meglio per NON seguire quello che dice il tutorial. Lo correggerò un giorno? Forse...",
        "P.S. Un mio compagno di team ha continuato a lavorare a questo progetto per un po', implementando un movimento più solido con il CharacterController. Se vuoi provare quella build, contattami e troverò un modo per fartela avere!"
      ]
    }
  },

  {
    id: "robbot",
    engine: "unity",
    date: "20250706",
    videoId: "I3Cz8Wfr-kU",
    image: "",
    github: "https://github.com/e-cremente/RobBot-Inspector",
    download: { url: "https://drive.google.com/file/d/1NcYP1n2Z7GNiMq2WmD6wdxNgB8UMHhBP/view?usp=drive_link", en: "Download .exe build", it: "Scarica build .exe" },
    tech: ["Unity", "C#", "Third Person", "Jam"],
    en: {
      title: "Rob-Bot Inspector",
      worked: "CCC, level construction, animation integration, shaders (shadow cones and texture swapping), quick-time events; helped with the interaction system.",
      devtime: "1 week",
      short: "A text-free jam game about a robot ticket inspector who turns into a thief whenever he steps into the shadows.",
      long: [
        "This is a cute one. It's the child of the last academy game jam we did in 2025 with Unity, before the end of our first year. The theme was \"Duality\", so we made a game about a robot underground ticket inspector that becomes a thief while in the shadows. The goal is to check as many tickets as possible and fine creatures without one (when in the light), OR steal money and wallets from as many creatures as possible (while in the shadows).",
        "As a jam diversifier, we chose to make a game with no text at all, so I hope the cute drawings are enough to explain the rules!",
        "This jam was the first time I experimented a bit more with shaders. I'll say I managed to do what I'd set out to do (not without help), and I learned to appreciate that magical feeling when you see your shader working as intended. At the same time... boy, is it hard to make decent shaders. Luckily, whatever is hard to learn in game development is also intrinsically interesting to me. Which is just to say: it's definitely not over between us, shaders."
      ]
    },
    it: {
      title: "Rob-Bot Inspector",
      worked: "CCC, costruzione del livello, integrazione delle animazioni, shader (coni d'ombra e cambio texture), quick time event; ho dato una mano con il sistema di interazione.",
      devtime: "1 settimana",
      short: "Un gioco da jam senza testo, su un robot controllore di biglietti che diventa un ladro ogni volta che entra nell'ombra.",
      long: [
        "Questo è un progetto carino. È figlio dell'ultima game jam accademica fatta nel 2025 con Unity, prima della fine del primo anno. Il tema era \"Dualità\", così abbiamo fatto un gioco su un robot controllore di biglietti della metropolitana che diventa un ladro quando è nell'ombra. L'obiettivo è controllare più biglietti possibile e multare le creature che non ce l'hanno (quando si è nella luce), OPPURE rubare soldi e portafogli a più creature possibile (quando si è nell'ombra).",
        "Come diversificatore della jam abbiamo scelto di fare un gioco senza alcun testo, quindi spero che i disegnini carini bastino a spiegare le regole!",
        "Questa jam è stata la prima volta in cui ho sperimentato un po' di più con gli shader. Dirò che sono riuscito a fare ciò che mi ero prefissato (non senza aiuto), e ho imparato ad apprezzare quella sensazione magica di quando vedi il tuo shader funzionare come volevi. Allo stesso tempo... ragazzi se è difficile fare shader decenti. Per fortuna, tutto ciò che è difficile da imparare nello sviluppo di videogiochi è anche intrinsecamente interessante per me. Il che è solo per dire: non è assolutamente finita tra noi, shader."
      ]
    }
  },

  {
    id: "tatuchatoi",
    engine: "unreal",
    date: "20251214",
    videoId: "q-73yuBfTSo",
    image: "",
    github: "https://github.com/e-cremente/Tatuchatoi",
    download: { url: "https://drive.google.com/file/d/15rOl-Y7oj_XkibktzJFhw-hmKFiM2nGZ/view?usp=drive_link", en: "Download .exe build", it: "Scarica build .exe" },
    tech: ["Unreal Engine", "C++ / Blueprints", "First Person", "Jam"],
    en: {
      title: "Tatuchatoi",
      worked: "Basic character movement, skill system, helped with UI and parkour mechanics.",
      devtime: "1 week",
      short: "A jam game in which you need to surpass some short challenges depending on which random set of skills you are given through the game.",
      long: [
        "This was officially my first steps in Unreal Engine game dev. I have to say the impact was harsh, coming from someone using Unity for a year in a row, but at the end of the day if you can use one engine, you will get pretty used to another one in a relatively short time.",
        "The theme of this Jam was \"Fate\", so in this game you will have to speak with a mysterious lady that will give you a random set of skills (understandable from the \"tarot\" cards appearing on the bottom left of the screen) which you will have to use to surpass a relatively short, but not so simple, set of challenges.",
        "Around the map there are a total of 4 points of interest, with the lighthouse always being the last one, while the first three will always be in random order depending on which set of skills you've been given.",
        "I gotta say, being this the first experience with Unreal and having only 1 week to produce everything, I think me and my team didn't do a bad job (yes yes I know... There basically isn't a tutorial in the game which makes it almost unplayable without watching the playthrough video).",
        "As (almost, I think) any other Unreal Engine beginner, we sperimented a lot with Blueprints, leaving the C++ alone basically for everything for this project. It was great but also scary. As an Italian I love spaghetti but man... When you use a visual coding system you can really SEE certain things."
      ]
    },
    it: {
      title: "Tatuchatoi",
      worked: "Movimento base del character, sistema di skill, ho aiutato con la UI e con le meccaniche di parkour",
      devtime: "1 settimana",
      short: "Un gioco da jam in cui devi superare alcune brevi sfide a seconda di quale random set di skill ti viene attribuito durante il gioco.",
      long: [
        "Questi sono stati ufficialmente i miei primi passi nello sviluppo di videogiochi su Unreal Engine. Devo ammettere che l'impatto è stato duro, detto da uno che fino a quel momento ha usato Unity per un anno di fila, ma alla fine una volta che sai usare un engine, abituarsi è una questione di tempo relativamente breve.",
        "Il tema della Jam era \"Fate\", quindi in questo gioco dovrai parlare con una misteriosa donna che ti consegnerà un set di skill randomico (comprensibile dalle carte dei \"tarocchi\" che appaiono in basso a sinistra dello schermo) che dovrai usare per superare una serie di brevi, ma non così semplici, sfide.",
        "In giro per la mappa ci sono 4 punti di interesse in totale, con il faro che è sempre l'ultimo, mentre le prime tre saranno in ordine casuale a seconda del set di skill che hai ricevuto.",
        "Devo dire, essendo questa la prima esperienza con Unreal e avendo solo una settimana per produrre tutto, penso che io e il mio team non abbiamo fatto un brutto lavoro (si si lo so... Dal momento che non c'è un tutorial il gioco è pressoché ingiocabile se non si guarda il video playthrough).",
        "Come tutti (o quasi, penso) i novizi di Unreal Engine, abbiamo sperimentato molto con i Blueprints, lasciando stare il C++ praticamente per ogni cosa in questo progetto. Una bella esperienza ma anche spaventosa. Da italiano adoro gli spaghetti ma... Quando usi un sistema di coding visuale, certe cose le puoi proprio VEDERE."
      ]
    }
  },

  {
    id: "stillhear",
    engine: "unreal",
    date: "20260626",
    videoId: "",
    image: "Images/StillHear.png",
    github: "",
    download: { url: "", en: "Build not available yet", it: "Build non ancora disponibile" },
    tech: ["Unreal Engine", "C++ / Blueprints", "Third Person", "Puzzle Game"],

    /* -------------------------------------------------------------
        SHOWCASE (opzionale): una clip per ogni feature.
        Schema di ogni voce:
          type   : "video" (consigliato) | "image" | "gif" | "youtube"
          media  : percorso del file. video -> .mp4/.webm ; image -> .png/.jpg/.webp ;
                  gif -> .gif ; youtube -> solo l'ID del video.
          poster : (opzionale, solo video) immagine mostrata prima del play.
          en/it  : { title, desc } -> didascalia nelle due lingue.
        Suggerimento: registra clip CORTE (5-12s) e silenziose; un .mp4/.webm
        pesa ~10x meno di una GIF a parità di qualità. Metti i file dentro
        "Images/stillhear/" con i nomi qui sotto e compariranno da soli.
        ------------------------------------------------------------- */
    showcase: [
      {
        type: "image", media: "Images/stillhear/cameravolumes.png", poster: "",
        en: { title: "Volume-based camera system", desc: "Cameras switch and blend based on trigger volumes placed across the level — and the active volume also drives the player's input direction." },
        it: { title: "Sistema di camere basato su volumi", desc: "Le camere cambiano e si blendano in base ai volumi posti nel livello; il volume attivo coordina anche la direzione dell'input del giocatore." }
        },
      {
        type: "video", media: "Images/stillhear/cameravolumes.mp4", poster: "",
        en: { title: "", desc: "" },
        it: { title: "", desc: "" }
      },
      {
        type: "video", media: "Images/stillhear/edgegrab.mp4", poster: "",
        en: { title: "Gameplay Ability System & abilities", desc: "Set up Unreal's Gameplay Ability System and authored a large set of the player's abilities on top of it." },
        it: { title: "Gameplay Ability System e abilità", desc: "Configurato il Gameplay Ability System di Unreal e realizzato gran parte delle abilità del giocatore." }
      },
      {
        type: "video", media: "Images/stillhear/weather.mp4", poster: "",
        en: { title: "Dynamic weather system", desc: "A weather system centred on rain, lightning and thunder." },
        it: { title: "Sistema meteo dinamico", desc: "Un sistema meteo incentrato su pioggia, fulmini e tuoni." }
      },
      {
        type: "video", media: "Images/stillhear/wormpatrol.mp4", poster: "",
        en: { title: "Enemy: AI, skills & animation", desc: "Built one of the game's main enemies end to end: AI behaviour, skills, animation and control rig." },
        it: { title: "Nemico: IA, abilità e animazione", desc: "Realizzato uno dei nemici principali dall'inizio alla fine: comportamento IA, abilità, animazione e control rig." }
      },
      {
        type: "video", media: "Images/stillhear/wormattack.mp4", poster: "",
        en: { title: "", desc: "" },
        it: { title: "", desc: "" }
      },
      {
        type: "image", media: "Images/stillhear/padpreset.png", poster: "",
        en: { title: "Input rebinding system", desc: "A complete, functional input-rebinding system for both keyboard and gamepad." },
        it: { title: "Sistema di rebinding dei comandi", desc: "Un sistema di rebinding completo e funzionante, sia per tastiera sia per gamepad." }
      },
      {
        type: "image", media: "Images/stillhear/keyboardpreset.png", poster: "",
        en: { title: "", desc: "" },
        it: { title: "", desc: "" }
      }
    ],
    en: {
        title: "Still Hear",
        worked: [
            "Complex Camera system based on Volumes which also handles input, implementation of Gameplay Ability System and vast amount of abilities, research and integration of plugins such as Flow Graph and Common UI, creation of several Shaders, for both Surface Materials and Post Processes",
            " implementation of a Weather System focusing around Rain, Lightnings and Thunders, implementation of the complete AI behaviour, skills, animation and control rig for one of the main enemies of the game, implementation of a complete and functional Input Rebinding system, for both keyboard and gamepad.",
        ],
        devtime: "7 months",
        short: "A Puzzle Platformer game in which you interpret the last Sound Keeper trying to restore the armony in a World where Sound Eaters unleashed chaos.",
        long: [
            ""
        ]
    },
    it: {
        title: "Still Hear",
        worked: [
            "Sistema complesso di Camere basato su Volumi che coordinano anche l'input, implementazione del Gameplay Ability System e di una grande quantità delle abilità, ricerca e integrazione di plugin quali Flow Graph e Common UI, creazione di numerosi Shader, sia per Materiali Surface che Post Process",
            " implementazione di un Sistema Meteo incentrato su Pioggia, Fulmini e Tuoni, implementazione completa del comportamento AI, skill, animazioni e control rig per uno dei nemici principali del gioco, implementazione di un completo e funzionale sistema di Input Rebinding, sia per tastiera che per gamepad.",
        ],
        devtime: "7 mesi",
        short: "Un gioco Puzzle Platformer dove interpreti l'ultimo Portatore del Suono che cerca di riportare l'armonia in un Mondo in cui i Divoratori del Suono hanno seminato il chaos.",
        long: [
            ""
        ]
    }
  }
];

// Deterministic Spanish conjugator for the local (offline) drill.
// Persons index order: 0=yo, 1=tú, 2=él/ella/usted, 3=nosotros, 4=ellos/ellas/ustedes
// Supported tenses: "present", "preterite".
//
// Each verb entry (keyed by lowercase infinitive):
//   en: English base word (string, regular -s/-ed handled automatically),
//       OR { base, third, past } for irregular English,
//       OR { presentByPerson:[...5], pastByPerson:[...5] } for be-like verbs.
//   present / preterite: explicit 5-form arrays ONLY when irregular/stem-changing.
//     When omitted, regular endings are generated from the infinitive.
//   For reflexive verbs (infinitive ends in "se"), give the forms WITHOUT the
//   reflexive pronoun; the engine prepends me/te/se/nos/se automatically.

(function (global) {
  const REFLEX = ["me", "te", "se", "nos", "se"];

  function regularPresent(inf) {
    const stem = inf.slice(0, -2);
    const end = inf.slice(-2);
    if (end === "ar") return ["o", "as", "a", "amos", "an"].map(e => stem + e);
    if (end === "er") return ["o", "es", "e", "emos", "en"].map(e => stem + e);
    return ["o", "es", "e", "imos", "en"].map(e => stem + e); // -ir
  }

  function regularPreterite(inf) {
    const stem = inf.slice(0, -2);
    const end = inf.slice(-2);
    if (end === "ar") {
      let yo;
      if (inf.endsWith("gar")) yo = inf.slice(0, -3) + "gué";
      else if (inf.endsWith("car")) yo = inf.slice(0, -3) + "qué";
      else if (inf.endsWith("zar")) yo = inf.slice(0, -3) + "cé";
      else yo = stem + "é";
      return [yo, stem + "aste", stem + "ó", stem + "amos", stem + "aron"];
    }
    // -er / -ir
    return [stem + "í", stem + "iste", stem + "ió", stem + "imos", stem + "ieron"];
  }

  // The imperfect is the most regular tense in Spanish: no stem changes, no
  // spelling changes, and only three irregular verbs in the whole language
  // (ser, ir, ver) — all handled by explicit overrides in the table below.
  function regularImperfect(inf) {
    const stem = inf.slice(0, -2);
    const end = inf.slice(-2);
    if (end === "ar") return ["aba", "abas", "aba", "ábamos", "aban"].map(e => stem + e);
    return ["ía", "ías", "ía", "íamos", "ían"].map(e => stem + e); // -er / -ir
  }

  // English helpers (single-word regular verbs only) --------------------------
  function engThird(b) {
    if (/(s|x|z|ch|sh)$/.test(b)) return b + "es";
    if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ies";
    if (/o$/.test(b)) return b + "es";
    return b + "s";
  }
  function engPast(b) {
    if (/e$/.test(b)) return b + "d";
    if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + "ied";
    return b + "ed";
  }

  // ---- Verb table -----------------------------------------------------------
  // Only irregular Spanish forms are listed; regular verbs need just `en`.
  const V = {
    // ---- irregular verbs ----
    ser: { tag: "(permanent)", en: { presentByPerson: ["am", "are", "is", "are", "are"], pastByPerson: ["was", "were", "was", "were", "were"] },
      present: ["soy", "eres", "es", "somos", "son"], preterite: ["fui", "fuiste", "fue", "fuimos", "fueron"],
      imperfect: ["era", "eras", "era", "éramos", "eran"] },
    estar: { tag: "(temporary)", en: { presentByPerson: ["am", "are", "is", "are", "are"], pastByPerson: ["was", "were", "was", "were", "were"] },
      present: ["estoy", "estás", "está", "estamos", "están"], preterite: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvieron"] },
    tener: { en: { base: "have", third: "has", past: "had" },
      present: ["tengo", "tienes", "tiene", "tenemos", "tienen"], preterite: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvieron"] },
    ir: { en: { base: "go", third: "goes", past: "went" },
      present: ["voy", "vas", "va", "vamos", "van"], preterite: ["fui", "fuiste", "fue", "fuimos", "fueron"],
      imperfect: ["iba", "ibas", "iba", "íbamos", "iban"] },
    hacer: { en: { base: "make", third: "makes", past: "made" },
      present: ["hago", "haces", "hace", "hacemos", "hacen"], preterite: ["hice", "hiciste", "hizo", "hicimos", "hicieron"] },
    poder: { en: { base: "can", third: "can", past: "could" }, enImperf: "used to be able to",
      present: ["puedo", "puedes", "puede", "podemos", "pueden"], preterite: ["pude", "pudiste", "pudo", "pudimos", "pudieron"] },
    querer: { en: { base: "want", third: "wants", past: "wanted" },
      present: ["quiero", "quieres", "quiere", "queremos", "quieren"], preterite: ["quise", "quisiste", "quiso", "quisimos", "quisieron"] },
    saber: { tag: "(a fact)", en: { base: "know", third: "knows", past: "knew" },
      present: ["sé", "sabes", "sabe", "sabemos", "saben"], preterite: ["supe", "supiste", "supo", "supimos", "supieron"] },
    ver: { en: { base: "see", third: "sees", past: "saw" },
      present: ["veo", "ves", "ve", "vemos", "ven"], preterite: ["vi", "viste", "vio", "vimos", "vieron"],
      imperfect: ["veía", "veías", "veía", "veíamos", "veían"] },
    decir: { en: { base: "say", third: "says", past: "said" },
      present: ["digo", "dices", "dice", "decimos", "dicen"], preterite: ["dije", "dijiste", "dijo", "dijimos", "dijeron"] },
    venir: { en: { base: "come", third: "comes", past: "came" },
      present: ["vengo", "vienes", "viene", "venimos", "vienen"], preterite: ["vine", "viniste", "vino", "vinimos", "vinieron"] },
    poner: { en: { base: "put", third: "puts", past: "put" },
      present: ["pongo", "pones", "pone", "ponemos", "ponen"], preterite: ["puse", "pusiste", "puso", "pusimos", "pusieron"] },
    salir: { en: { base: "leave", third: "leaves", past: "left" },
      present: ["salgo", "sales", "sale", "salimos", "salen"] }, // preterite regular
    traer: { en: { base: "bring", third: "brings", past: "brought" },
      present: ["traigo", "traes", "trae", "traemos", "traen"], preterite: ["traje", "trajiste", "trajo", "trajimos", "trajeron"] },
    dar: { en: { base: "give", third: "gives", past: "gave" },
      present: ["doy", "das", "da", "damos", "dan"], preterite: ["di", "diste", "dio", "dimos", "dieron"] },

    // ---- common verbs pt.1 ----
    comer: { en: "eat", enIrr: { third: "eats", past: "ate" } },
    tomar: { en: { base: "drink", third: "drinks", past: "drank" } },
    dormir: { en: { base: "sleep", third: "sleeps", past: "slept" },
      present: ["duermo", "duermes", "duerme", "dormimos", "duermen"], preterite: ["dormí", "dormiste", "durmió", "dormimos", "durmieron"] },
    caminar: { en: "walk" },
    correr: { en: { base: "run", third: "runs", past: "ran" } },
    trabajar: { en: "work" },
    jugar: { en: "play",
      present: ["juego", "juegas", "juega", "jugamos", "juegan"] }, // preterite regular -gar → jugué
    estudiar: { en: "study" },
    viajar: { en: "travel" },
    llegar: { en: "arrive" }, // preterite regular -gar → llegué
    comprar: { en: { base: "buy", third: "buys", past: "bought" } },
    vender: { en: { base: "sell", third: "sells", past: "sold" } },
    escuchar: { en: { base: "listen to", third: "listens to", past: "listened to" } },
    hablar: { en: { base: "speak", third: "speaks", past: "spoke" } },
    leer: { en: { base: "read", third: "reads", past: "read" },
      preterite: ["leí", "leíste", "leyó", "leímos", "leyeron"] },
    escribir: { en: { base: "write", third: "writes", past: "wrote" } },
    pensar: { en: { base: "think", third: "thinks", past: "thought" },
      present: ["pienso", "piensas", "piensa", "pensamos", "piensan"] },

    // ---- physical actions ----
    sentarse: { en: { base: "sit down", third: "sits down", past: "sat down" },
      present: ["siento", "sientas", "sienta", "sentamos", "sientan"] }, // preterite regular (sentar)
    levantarse: { en: { base: "stand up", third: "stands up", past: "stood up" } },
    saltar: { en: "jump" },
    lanzar: { en: { base: "throw", third: "throws", past: "threw" } }, // -zar → lancé
    patear: { en: "kick" },
    golpear: { en: "punch" },
    abofetear: { en: "slap" },
    bailar: { en: "dance" },
    nadar: { en: { base: "swim", third: "swims", past: "swam" } },
    escalar: { en: "climb" },
    caerse: { en: { base: "fall", third: "falls", past: "fell" },
      present: ["caigo", "caes", "cae", "caemos", "caen"], preterite: ["caí", "caíste", "cayó", "caímos", "cayeron"] },
    empujar: { en: "push" },
    jalar: { en: "pull" },
    levantar: { en: "lift" },
    cargar: { en: "carry" }, // -gar → cargué
    estirarse: { en: { base: "stretch", third: "stretches", past: "stretched" } },
    gatear: { en: "crawl" },

    // ---- common verbs pt.2 ----
    necesitar: { en: "need" },
    moverse: { en: "move", present: ["muevo", "mueves", "mueve", "movemos", "mueven"] },
    cambiar: { en: "change" },
    enviar: { en: { base: "send", third: "sends", past: "sent" },
      present: ["envío", "envías", "envía", "enviamos", "envían"] },
    recibir: { en: "receive" },
    intentar: { en: "try" },
    parar: { en: "stop" },
    volver: { en: "return", present: ["vuelvo", "vuelves", "vuelve", "volvemos", "vuelven"] },
    ponerse: { en: { base: "put on", third: "puts on", past: "put on" },
      present: ["pongo", "pones", "pone", "ponemos", "ponen"], preterite: ["puse", "pusiste", "puso", "pusimos", "pusieron"] },
    quitarse: { en: { base: "take off", third: "takes off", past: "took off" } },
    despertarse: { en: { base: "wake up", third: "wakes up", past: "woke up" },
      present: ["despierto", "despiertas", "despierta", "despertamos", "despiertan"] },
    vestirse: { en: { base: "get dressed", third: "gets dressed", past: "got dressed" },
      present: ["visto", "vistes", "viste", "vestimos", "visten"], preterite: ["vestí", "vestiste", "vistió", "vestimos", "vistieron"] },
    sentir: { en: { base: "feel", third: "feels", past: "felt" },
      present: ["siento", "sientes", "siente", "sentimos", "sienten"], preterite: ["sentí", "sentiste", "sintió", "sentimos", "sintieron"] },
    olvidar: { en: { base: "forget", third: "forgets", past: "forgot" } },
    recordar: { en: "remember", present: ["recuerdo", "recuerdas", "recuerda", "recordamos", "recuerdan"] },
    entender: { en: { base: "understand", third: "understands", past: "understood" },
      present: ["entiendo", "entiendes", "entiende", "entendemos", "entienden"] },
    explicar: { en: "explain" }, // -car → expliqué
    ayudar: { en: "help" },
    preguntar: { en: "ask" },
    contestar: { en: "answer" },
    llamar: { en: "call" },
    esperar: { en: "wait" },
    encontrar: { en: { base: "find", third: "finds", past: "found" },
      present: ["encuentro", "encuentras", "encuentra", "encontramos", "encuentran"] },
    perder: { en: { base: "lose", third: "loses", past: "lost" },
      present: ["pierdo", "pierdes", "pierde", "perdemos", "pierden"] },
    ganar: { en: { base: "win", third: "wins", past: "won" } },
    pagar: { en: { base: "pay", third: "pays", past: "paid" } }, // -gar → pagué
    abrir: { en: "open" },
    cerrar: { en: "close", present: ["cierro", "cierras", "cierra", "cerramos", "cierran"] },
    empezar: { en: "start", present: ["empiezo", "empiezas", "empieza", "empezamos", "empiezan"] }, // -zar → empecé
    seguir: { en: "continue",
      present: ["sigo", "sigues", "sigue", "seguimos", "siguen"], preterite: ["seguí", "seguiste", "siguió", "seguimos", "siguieron"] },
    terminar: { en: "finish" },

    // ---- common verbs pt.3 ----
    conocer: { tag: "(a person/place)", en: { base: "know", third: "knows", past: "knew" },
      present: ["conozco", "conoces", "conoce", "conocemos", "conocen"] },
    aprender: { en: "learn" },
    imaginar: { en: "imagine" },
    creer: { en: "believe", preterite: ["creí", "creíste", "creyó", "creímos", "creyeron"] },
    dudar: { en: "doubt" },
    decidir: { en: "decide" },
    elegir: { en: { base: "choose", third: "chooses", past: "chose" },
      present: ["elijo", "eliges", "elige", "elegimos", "eligen"], preterite: ["elegí", "elegiste", "eligió", "elegimos", "eligieron"] },
    planear: { en: "plan" },
    enfocarse: { en: "focus" }, // -car → me enfoqué
    practicar: { en: "practice" }, // -car → practiqué
    mejorar: { en: "improve" },

    // ---- common verbs pt.4 ----
    usar: { en: "use" },
    ducharse: { en: "shower" },
    desayunar: { en: { base: "eat breakfast", third: "eats breakfast", past: "ate breakfast" } },
    almorzar: { en: { base: "eat lunch", third: "eats lunch", past: "ate lunch" },
      present: ["almuerzo", "almuerzas", "almuerza", "almorzamos", "almuerzan"] }, // preterite regular -zar → almorcé
    cenar: { en: { base: "eat dinner", third: "eats dinner", past: "ate dinner" } },
    cocinar: { en: "cook" },
    limpiar: { en: "clean" },
    lavar: { en: "wash" },
    secar: { en: "dry" }, // preterite regular -car → sequé
    quedarse: { en: "stay" },
    manejar: { en: { base: "drive", third: "drives", past: "drove" } },
    estacionar: { en: "park" },
    pasear: { en: "stroll" },
    ejercitarse: { en: "exercise" },
    descansar: { en: "rest" },
    disfrutar: { en: "enjoy" },
    visitar: { en: "visit" },
    llevar: { en: { base: "take", third: "takes", past: "took" } },
    abrazar: { en: { base: "hug", third: "hugs", past: "hugged" } }, // preterite regular -zar → abracé
  };

  function isReflexive(inf) { return inf.endsWith("se"); }

  // Returns the 5 Spanish forms for a verb+tense, or null if not conjugable.
  function conjugate(inf, tense) {
    inf = inf.toLowerCase().trim();
    const entry = V[inf];
    if (!entry) return null;
    if (!["present", "preterite", "imperfect"].includes(tense)) return null;

    const reflexive = isReflexive(inf);
    // For reflexive verbs, strip the "se" so the regular generator sees a normal
    // infinitive ending in ar/er/ir (e.g. "levantarse" -> "levantar").
    const genInf = reflexive ? inf.slice(0, -2) : inf;

    let forms = entry[tense];
    if (!forms) {
      forms = tense === "present" ? regularPresent(genInf)
        : tense === "imperfect" ? regularImperfect(genInf)
        : regularPreterite(genInf);
    }
    if (reflexive) forms = forms.map((f, i) => REFLEX[i] + " " + f);
    return forms;
  }

  // English rendering for a verb at a given person (0-4) and tense.
  function englishForm(inf, tense, person) {
    inf = inf.toLowerCase().trim();
    const entry = V[inf];
    if (!entry) return null;
    let en = entry.en;
    if (typeof en === "string") {
      const base = en;
      en = { base, third: engThird(base), past: engPast(base) };
      if (entry.enIrr) en = Object.assign(en, entry.enIrr);
    }
    let form;
    // The imperfect is glossed "used to ..." throughout — it's the standard
    // teaching gloss and, unlike "was/ate", it can never be confused with the
    // preterite in an English prompt.
    if (tense === "imperfect") {
      // `enImperf` covers verbs where "used to " + base is ungrammatical
      // ("used to can" -> "used to be able to").
      form = entry.enImperf || "used to " + (en.presentByPerson ? "be" : en.base);
    } else if (en.presentByPerson) {
      form = tense === "present" ? en.presentByPerson[person] : en.pastByPerson[person];
    } else if (tense === "present") {
      form = person === 2 ? en.third : en.base;
    } else {
      form = en.past;
    }
    if (entry.tag) form += " " + entry.tag;
    return form;
  }

  function isDrillable(inf) {
    inf = (inf || "").toLowerCase().trim();
    return !!V[inf];
  }

  // Verbs that naturally take a direct object (for the object-pronoun drill).
  // Intransitive/reflexive/modal verbs are excluded so prompts stay sensible.
  const TRANSITIVE = new Set([
    "tener", "hacer", "querer", "saber", "ver", "poner", "traer", "dar", "decir",
    "comer", "tomar", "comprar", "vender", "escuchar", "leer", "escribir",
    "llamar", "esperar", "encontrar", "perder", "ganar", "pagar", "abrir",
    "cerrar", "empezar", "terminar", "conocer", "aprender", "estudiar",
    "recordar", "olvidar", "entender", "imaginar", "creer", "ayudar",
    "necesitar", "cambiar", "enviar", "recibir", "intentar", "explicar",
    "contestar", "decidir", "elegir", "planear", "practicar", "mejorar",
    "lanzar", "patear", "golpear", "abofetear", "empujar", "jalar", "levantar",
    "cargar", "parar", "seguir", "dudar",
    "usar", "cocinar", "limpiar", "lavar", "secar", "manejar", "estacionar",
    "pasear", "disfrutar", "visitar", "llevar", "abrazar",
  ]);
  function canTakeObject(inf) {
    inf = (inf || "").toLowerCase().trim();
    return !!V[inf] && TRANSITIVE.has(inf);
  }

  // Describes a verb's shape so the tag system can label it without a second
  // hand-maintained list: an explicit forms array here means "irregular".
  function pattern(inf) {
    inf = (inf || "").toLowerCase().trim();
    const reflexive = isReflexive(inf);
    const genInf = reflexive ? inf.slice(0, -2) : inf;
    const ending = genInf.slice(-2);
    if (!["ar", "er", "ir"].includes(ending)) return null;
    const entry = V[inf];
    const spellingChange = ending === "ar" &&
      (genInf.endsWith("gar") || genInf.endsWith("car") || genInf.endsWith("zar"));
    return {
      known: !!entry,
      reflexive,
      ending: "-" + ending,
      present: entry && entry.present ? "irregular" : "regular",
      preterite: entry && entry.preterite ? "irregular" : (spellingChange ? "spelling-change" : "regular"),
      imperfect: entry && entry.imperfect ? "irregular" : "regular",
    };
  }

  global.Conjugator = { conjugate, englishForm, isDrillable, canTakeObject, pattern, REFLEX };
})(window);

// Local (offline) drill UI — conjugation practice and straight vocab practice.
// Depends on: global `state`/`save`/`render` (app.js), `Conjugator` (conjugator.js),
// and the drill DOM in index.html.
(function () {
  const PERSONS = [
    { label: "yo", eng: ["I"] },
    { label: "tú", eng: ["You"] },
    { label: "él/ella", eng: ["He", "She"] },
    { label: "nosotros", eng: ["We"] },
    { label: "ellos/ellas", eng: ["They"] },
  ];
  const PERSON_BY_VALUE = {
    "yo (I)": 0,
    "tú (you, informal)": 1,
    "él/ella/usted (he/she/you formal)": 2,
    "nosotros (we)": 3,
    "ellos/ellas/ustedes (they/you all)": 4,
  };
  const TENSE_MAP = { "present tense": "present", "preterite tense": "preterite" };
  const TENSE_LABEL = { present: "present", preterite: "preterite" };
  const SUBJECT_PRONOUNS = new Set([
    "yo", "tú", "tu", "él", "el", "ella", "usted", "nosotros", "nosotras",
    "ellos", "ellas", "ustedes",
  ]);

  const DOP_OBJECTS = [
    { en: "him", dop: "lo" },
    { en: "her", dop: "la" },
    { en: "it (masculine)", dop: "lo" },
    { en: "it (feminine)", dop: "la" },
    { en: "them (masculine)", dop: "los" },
    { en: "them (feminine)", dop: "las" },
    { en: "me", dop: "me" },
    { en: "you", dop: "te" },
    { en: "us", dop: "nos" },
  ];

  const conjCounts = {}; // "inf|tense|person" -> times shown (conjugation mode only)
  const dopCounts = {};  // "inf|tense|person|dop" -> times shown (object-pronoun mode)
  let currentItems = [];
  let currentKind = null; // "conj" | "vocab"
  let graded = false; // true after Check, so Enter/primary button advances
  const score = { correct: 0, total: 0 };
  const streak = { cur: 0, best: 0 };

  const $ = id => document.getElementById(id);

  function renderScore() {
    const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
    $("drillScore").textContent = score.total ? `${score.correct}/${score.total} — ${pct}%` : "";
  }

  function renderStreak() {
    if (streak.cur > 0) {
      $("drillStreak").textContent = `🔥 ${streak.cur} in a row` + (streak.best > streak.cur ? ` (best ${streak.best})` : "");
    } else {
      $("drillStreak").textContent = streak.best ? `best streak: ${streak.best}` : "";
    }
  }

  // ---- "needs work" (focus) & "got wrong" lists (vocab mode) ----
  function countFlag(flag) {
    let n = 0;
    state.sets.forEach(s => s.terms.forEach(t => { if (t[flag]) n++; }));
    return n;
  }
  function updateFocusUI() {
    const f = countFlag("focus");
    const w = countFlag("wrong");
    const fTxt = f ? `(${f} term${f > 1 ? "s" : ""})` : "(empty)";
    const wTxt = w ? `(${w} term${w > 1 ? "s" : ""})` : "(empty)";
    $("focusCount").textContent = fTxt;
    $("wrongCount").textContent = wTxt;
    $("drillWrongCount").textContent = wTxt;
    $("drillOnlyWrongToggle").checked = $("vocabOnlyWrong").checked;
  }

  function itemsPerRound() {
    const v = $("numSentences").value;
    if (v === "random") return Math.floor(Math.random() * 5) + 1;
    return Math.max(1, Math.min(5, +v || 1));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ======================= CONJUGATION MODE =======================
  function drillableVerbs() {
    const out = [];
    const seen = new Set();
    const unavailable = new Set();
    state.sets
      .filter(s => s.checked && s.name.startsWith("VERBS"))
      .forEach(s => {
        s.terms
          .filter(t => t.checked !== false)
          .forEach(t => {
            const inf = (t.es || "").toLowerCase().trim();
            if (!inf || seen.has(inf)) return;
            if (!Conjugator.isDrillable(inf)) {
              unavailable.add(t.es.trim());
              return;
            }
            seen.add(inf);
            out.push({ inf, display: t.es.trim(), must: !!t.must });
          });
      });
    return { verbs: out, unavailable: [...unavailable] };
  }

  function selectedTenses() {
    const all = [...document.querySelectorAll("#tenseRow input.can-cb:checked")].map(i => i.value);
    const supported = all.map(v => TENSE_MAP[v]).filter(Boolean);
    const unsupported = all.filter(v => !TENSE_MAP[v]);
    return { tenses: supported.length ? supported : ["present"], unsupported };
  }

  function selectedPersons() {
    const out = [...document.querySelectorAll("#personRow input.can-cb:checked")]
      .map(i => PERSON_BY_VALUE[i.value])
      .filter(v => v !== undefined);
    return out.length ? out : [0, 1, 2, 3, 4];
  }

  const comboKey = c => `${c.inf}|${c.tense}|${c.person}`;

  function pickWeightedCombos(combos, k) {
    const ranked = combos
      .map(c => ({ c, n: conjCounts[comboKey(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const picked = [];
    for (let i = 0; i < k; i++) picked.push(ranked[i % ranked.length].c);
    return picked;
  }

  function buildConjItem(v, tense, person) {
    const forms = Conjugator.conjugate(v.inf, tense);
    const correct = forms ? forms[person] : null;
    const pdef = PERSONS[person];
    const subject = pdef.eng[Math.floor(Math.random() * pdef.eng.length)];
    let verbEng = Conjugator.englishForm(v.inf, tense, person);
    // Some English verbs are identical in present & past (put, read, ...),
    // so add a tense hint to keep the prompt unambiguous.
    const otherTense = tense === "present" ? "preterite" : "present";
    const otherEng = Conjugator.englishForm(v.inf, otherTense, person);
    if (verbEng.toLowerCase() === (otherEng || "").toLowerCase()) {
      verbEng += tense === "present" ? " (present)" : " (past)";
    }
    return {
      kind: "conj",
      inf: v.inf, display: v.display, tense, person,
      correct, accept: [correct],
      prompt: `${subject} ${verbEng}`,
    };
  }

  function generateConjRound() {
    const { verbs, unavailable } = drillableVerbs();
    const { tenses, unsupported } = selectedTenses();
    const persons = selectedPersons();

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (unavailable.length) notes.push("Verbs not yet available for local drill: " + unavailable.join(", ") + ".");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!verbs.length) {
      $("drillStatus").textContent = "Check at least one VERBS set with locally-supported verbs to start drilling.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const perMustVerb = $("drillPerMustVerb").checked;
    const shuffleOn = $("drillShuffle").checked;
    const mustVerbs = verbs.filter(v => v.must);

    let items;
    if (perMustVerb && mustVerbs.length) {
      items = mustVerbs.map(v => {
        const combos = [];
        tenses.forEach(t => persons.forEach(p => combos.push({ inf: v.inf, display: v.display, tense: t, person: p })));
        const c = pickWeightedCombos(combos, 1)[0];
        return buildConjItem(v, c.tense, c.person);
      });
    } else {
      const combos = [];
      verbs.forEach(v => tenses.forEach(t => persons.forEach(p =>
        combos.push({ inf: v.inf, display: v.display, tense: t, person: p }))));
      const chosen = pickWeightedCombos(combos, itemsPerRound());
      items = chosen.map(c => buildConjItem(verbs.find(v => v.inf === c.inf), c.tense, c.person));
    }
    if (shuffleOn) shuffle(items);

    items.forEach(it => (conjCounts[comboKey(it)] = (conjCounts[comboKey(it)] || 0) + 1));
    currentItems = items;
    currentKind = "conj";

    $("drillStatus").textContent = `${verbs.length} verb(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · ${persons.length} subject(s) in rotation`;
    renderItems(items);
  }

  // ======================= OBJECT-PRONOUN MODE =======================
  // Reuse the conjugation verb collection, but keep only transitive verbs.
  function transitiveVerbs() {
    const { unavailable } = drillableVerbs();
    const verbs = [];
    const seen = new Set();
    const notTransitive = new Set();
    state.sets
      .filter(s => s.checked && s.name.startsWith("VERBS"))
      .forEach(s => {
        s.terms
          .filter(t => t.checked !== false)
          .forEach(t => {
            const inf = (t.es || "").toLowerCase().trim();
            if (!inf || seen.has(inf)) return;
            if (!Conjugator.isDrillable(inf)) return; // already flagged as unavailable
            if (!Conjugator.canTakeObject(inf)) { notTransitive.add(t.es.trim()); return; }
            seen.add(inf);
            verbs.push({ inf, display: t.es.trim() });
          });
      });
    return { verbs, unavailable, notTransitive: [...notTransitive] };
  }

  const dopKey = c => `${c.inf}|${c.tense}|${c.person}|${c.obj.dop}`;

  function pickWeightedDop(combos, k) {
    const ranked = combos
      .map(c => ({ c, n: dopCounts[dopKey(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const picked = [];
    for (let i = 0; i < k; i++) picked.push(ranked[i % ranked.length].c);
    return picked;
  }

  function buildDopItem(v, tense, person, obj) {
    const forms = Conjugator.conjugate(v.inf, tense);
    const verbForm = forms ? forms[person] : null;
    const correct = `${obj.dop} ${verbForm}`;
    const subject = PERSONS[person].eng[Math.floor(Math.random() * PERSONS[person].eng.length)];
    let verbEng = Conjugator.englishForm(v.inf, tense, person);
    const otherTense = tense === "present" ? "preterite" : "present";
    const otherEng = Conjugator.englishForm(v.inf, otherTense, person);
    if (verbEng.toLowerCase() === (otherEng || "").toLowerCase()) {
      verbEng += tense === "present" ? " (present)" : " (past)";
    }
    return {
      kind: "dop",
      inf: v.inf, display: v.display, tense, person, obj,
      correct, accept: [correct],
      prompt: `${subject} ${verbEng} ${obj.en}`,
    };
  }

  function generateDopRound() {
    const { verbs, unavailable, notTransitive } = transitiveVerbs();
    const { tenses, unsupported } = selectedTenses();
    const persons = selectedPersons();

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (unavailable.length) notes.push("Verbs not available for local drill: " + unavailable.join(", ") + ".");
    if (notTransitive.length) notes.push("Verbs skipped (don't take a direct object): " + notTransitive.join(", ") + ".");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!verbs.length) {
      $("drillStatus").textContent = "Check at least one VERBS set with transitive verbs (e.g. ver, tener, comprar) to drill object pronouns.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const shuffleOn = $("drillShuffle").checked;
    const combos = [];
    verbs.forEach(v => tenses.forEach(t => persons.forEach(p => DOP_OBJECTS.forEach(obj =>
      combos.push({ inf: v.inf, display: v.display, tense: t, person: p, obj })))));
    const chosen = pickWeightedDop(combos, itemsPerRound());
    let items = chosen.map(c => buildDopItem(verbs.find(v => v.inf === c.inf), c.tense, c.person, c.obj));
    if (shuffleOn) shuffle(items);

    items.forEach(it => (dopCounts[dopKey(it)] = (dopCounts[dopKey(it)] || 0) + 1));
    currentItems = items;
    currentKind = "dop";

    $("drillStatus").textContent = `${verbs.length} transitive verb(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · direct object pronouns`;
    renderItems(items);
  }

  // ======================= POSSESSIVE MODE =======================
  // "My friend is tired" -> "mi amigo está cansado".
  // Drills possessive agreement, ser vs estar, and adjective agreement.
  const possCounts = {};

  // Which copula an adjective takes, keyed by the ENGLISH term — English already
  // disambiguates the pairs Spanish collapses ("bored" está / "boring" ser).
  // Adjectives absent from this map are EXCLUDED from the drill rather than
  // risk grading a correct answer as wrong.
  const COPULA = {
    // --- estar: conditions & states ---
    tired: "estar", sad: "estar", depressed: "estar", angry: "estar", confused: "estar",
    bored: "estar", afraid: "estar", stressed: "estar", anxious: "estar", nervous: "estar",
    excited: "estar", calm: "estar", alert: "estar", jealous: "estar", curious: "estar",
    sick: "estar", drunk: "estar", sober: "estar", hungry: "estar", thirsty: "estar",
    sleepy: "estar", alive: "estar", dead: "estar", lost: "estar", full: "estar",
    empty: "estar", clean: "estar", dirty: "estar", open: "estar", closed: "estar",
    busy: "estar", ready: "estar", wet: "estar", dry: "estar", alone: "estar",
    together: "estar", broken: "estar", fixed: "estar", injured: "estar",
    pregnant: "estar", available: "estar", unavailable: "estar", obsessed: "estar",
    addicted: "estar", "free (available)": "estar",
    // --- ser: inherent characteristics ---
    big: "ser", small: "ser", tall: "ser", short: "ser", fast: "ser", slow: "ser",
    strong: "ser", weak: "ser", beautiful: "ser", ugly: "ser", young: "ser", old: "ser",
    rich: "ser", poor: "ser", easy: "ser", difficult: "ser", interesting: "ser",
    boring: "ser", funny: "ser", serious: "ser", new: "ser", different: "ser",
    same: "ser", right: "ser", wrong: "ser", loud: "ser", quiet: "ser",
    possible: "ser", impossible: "ser", necessary: "ser", important: "ser",
    normal: "ser", strange: "ser", dangerous: "ser", safe: "ser", smart: "ser",
    stupid: "ser", creative: "ser", talented: "ser", responsible: "ser",
    irresponsible: "ser", mature: "ser", kind: "ser", rude: "ser", polite: "ser",
    honest: "ser", patient: "ser", impatient: "ser", generous: "ser", selfish: "ser",
    lazy: "ser", hardworking: "ser", shy: "ser", outgoing: "ser", brave: "ser",
    cowardly: "ser", cruel: "ser", loyal: "ser", wise: "ser", cunning: "ser",
    blind: "ser", deaf: "ser", expensive: "ser", cheap: "ser", heavy: "ser",
    disgusting: "ser", spicy: "ser", sweet: "ser", sour: "ser", salty: "ser",
    friendly: "ser", comfortable: "ser", uncomfortable: "ser", public: "ser",
    private: "ser", common: "ser", rare: "ser", modern: "ser", ancient: "ser",
    local: "ser", foreign: "ser", national: "ser", international: "ser",
    legal: "ser", illegal: "ser", real: "ser", fake: "ser", complete: "ser",
    incomplete: "ser", popular: "ser", average: "ser", useful: "ser",
    arrogant: "ser", humble: "ser", masculine: "ser", feminine: "ser",
    athletic: "ser", artistic: "ser", muscular: "ser", bald: "ser", skinny: "ser",
    fat: "ser", attractive: "ser", smooth: "ser", rough: "ser", evil: "ser",
    "free (no cost)": "ser", "light (weight)": "ser", "loud (person/personality)": "ser",
    red: "ser", blue: "ser", green: "ser", yellow: "ser", orange: "ser", purple: "ser",
    pink: "ser", white: "ser", gray: "ser", brown: "ser", black: "ser",
    // --- both are correct (meaning shifts, but neither is an error here) ---
    happy: "both", good: "both", bad: "both", handsome: "both", pretty: "both",
    cute: "both", cold: "both", hot: "both", delicious: "both", healthy: "both",
    "cool (temperature)": "both",
  };

  const POSSESSIVES = [
    { en: ["My"],  sing: "mi", plural: "mis" },
    { en: ["Your"], sing: "tu", plural: "tus" },
    { en: ["His", "Her", "Their"], sing: "su", plural: "sus" },
    { en: ["Our"], sing: { m: "nuestro", f: "nuestra" }, plural: { m: "nuestros", f: "nuestras" } },
  ];

  function possForm(poss, gender, number) {
    const slot = number === "plural" ? poss.plural : poss.sing;
    return typeof slot === "string" ? slot : slot[gender];
  }

  function pluralizeAdj(w) {
    if (w === "joven") return "jóvenes";
    if (/[aeiouáéíóú]$/.test(w)) return w + "s";
    if (/z$/.test(w)) return w.slice(0, -1) + "ces";
    return w + "es";
  }

  // "Cansado / Cansada" + (f, plural) -> "cansadas"
  function inflectAdj(esRaw, gender, number) {
    const alts = (esRaw || "").split("/").map(s => s.trim()).filter(Boolean);
    let base = (gender === "f" && alts.length > 1 ? alts[1] : alts[0]) || "";
    base = base.replace(/\s*\(.*/, "").trim().toLowerCase();
    if (!base || /\s/.test(base)) return null; // skip multi-word entries
    return number === "plural" ? pluralizeAdj(base) : base;
  }

  function possAdjectives() {
    const out = [], seen = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("ADJECTIVES")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const en = (t.en || "").trim().toLowerCase();
        const copula = COPULA[en];
        if (!copula || seen.has(en)) return;
        if (!inflectAdj(t.es, "m", "sing")) return;
        seen.add(en);
        out.push({ en: (t.en || "").trim(), es: t.es, copula });
      });
    });
    return out;
  }

  function possNouns() {
    const out = [];
    state.sets.filter(s => s.checked && s.name.startsWith("NOUNS")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const n = parseNoun(t);
        if (n) out.push(n);
      });
    });
    return out;
  }

  function generatePossRound() {
    const nouns = possNouns();
    const adjs = possAdjectives();
    const { tenses, unsupported } = selectedTenses();

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (!adjs.length) notes.push("Check an ADJECTIVES set. (Adjectives with an ambiguous ser/estar reading are skipped so grading stays reliable.)");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!nouns.length || !adjs.length) {
      $("drillStatus").textContent = "Check at least one NOUNS set and one ADJECTIVES set to drill possessives.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const combos = [];
    tenses.forEach(tense => nouns.forEach(n => adjs.forEach(a => POSSESSIVES.forEach(p => {
      combos.push({ tense, n, a, p });
    }))));

    const key = c => `${c.p.sing.m || c.p.sing}|${c.n.variants[0].word}|${c.a.en}|${c.tense}`;
    const ranked = combos
      .map(c => ({ c, n: possCounts[key(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const k = itemsPerRound();
    const chosen = [];
    for (let i = 0; i < k; i++) chosen.push(ranked[i % ranked.length].c);

    let items = chosen.map(c => {
      const isPl = c.n.number === "plural";
      const pick = Math.floor(Math.random() * 3);
      const possEn = c.p.en[pick % c.p.en.length];

      const copulas = c.a.copula === "both" ? ["ser", "estar"] : [c.a.copula];
      const accept = [];
      c.n.variants.forEach(nv => {
        const poss = possForm(c.p, nv.gender, nv.number);
        const adj = inflectAdj(c.a.es, nv.gender, nv.number);
        copulas.forEach(cop => {
          const verb = Conjugator.conjugate(cop, c.tense)[isPl ? 4 : 2];
          accept.push(`${poss} ${nv.word} ${verb} ${adj}`);
        });
      });

      const beEn = c.tense === "present" ? (isPl ? "are" : "is") : (isPl ? "were" : "was");
      const prompt = `${possEn} ${c.n.enNoun} ${beEn} ${c.a.en.toLowerCase()}`;

      return {
        kind: "poss",
        prompt,
        correct: accept[0],
        accept,
        copula: c.a.copula,
        tense: c.tense,
        key: key(c),
      };
    });
    if ($("drillShuffle").checked) shuffle(items);

    items.forEach(it => (possCounts[it.key] = (possCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "poss";

    $("drillStatus").textContent =
      `${nouns.length} noun(s) · ${adjs.length} adjective(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · possessive + ser/estar agreement`;
    renderItems(items);
  }

  // ======================= INDIRECT-OBJECT-ONLY MODE =======================
  // Verbs whose person-complement is a true INDIRECT object, so the pronoun is
  // le/les — not lo/la. (escuchar/ver/llamar/esperar/ayudar take a DIRECT object
  // despite the English "to/for", so they are deliberately excluded here.)
  const iopCounts = {};
  const IOP_PRONOUNS = [
    { es: "me",  en: ["me"] },
    { es: "te",  en: ["you"] },
    { es: "le",  en: ["him", "her"], noun: "sing" },
    { es: "nos", en: ["us"] },
    { es: "les", en: ["them"], noun: "plural" },
  ];
  const IOP_VERBS = [
    { inf: "hablar", prep: "to" },
    { inf: "contestar", prep: "" },
    { inf: "preguntar", prep: "" },
    { inf: "escribir", prep: "to" },
    { inf: "pagar", prep: "" },
    { inf: "creer", prep: "" },
    { inf: "explicar", prep: "to" },
  ];

  function iopAvailableVerbs() {
    const have = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("VERBS")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        have.add((t.es || "").split("/")[0].trim().toLowerCase());
      });
    });
    return IOP_VERBS.filter(v => have.has(v.inf) && Conjugator.isDrillable(v.inf));
  }

  function generateIopRound() {
    const verbs = iopAvailableVerbs();
    const { tenses, unsupported } = selectedTenses();
    const personIdx = selectedPersons();
    const subjects = PP_SUBJECTS.filter(s => personIdx.includes(s.idx));
    const { people } = gustarNouns();

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (!verbs.length) notes.push("Check a set with an indirect-object verb (hablar, contestar, preguntar, escribir, pagar, creer, explicar).");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!verbs.length || !subjects.length) {
      $("drillStatus").textContent = "Need at least one indirect-object verb (hablar, preguntar…) and one subject.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const combos = [];
    tenses.forEach(tense => verbs.forEach(v => {
      const forms = Conjugator.conjugate(v.inf, tense);
      if (!forms) return;
      subjects.forEach(subj => {
        IOP_PRONOUNS.forEach(iop => {
          if (subj.clash === iop.es) return; // "I speak to me"
          // Bare pronoun: "le habla"
          combos.push({ tense, v, subj, iop, conj: forms[subj.idx], recipient: null });
          // Named recipient keeps the pronoun too: "le habla al hombre"
          if (iop.noun) {
            people.forEach(n => {
              const isPlural = n.variants[0].number === "plural";
              if ((iop.noun === "plural") !== isPlural) return;
              combos.push({ tense, v, subj, iop, conj: forms[subj.idx], recipient: n });
            });
          }
        });
      });
    }));

    if (!combos.length) {
      $("drillStatus").textContent = "No drillable combinations — try checking more verbs or subjects.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const key = c =>
      `${c.v.inf}|${c.subj.idx}|${c.iop.es}|${c.tense}|${c.recipient ? c.recipient.variants[0].word : "-"}`;
    const ranked = combos
      .map(c => ({ c, n: iopCounts[key(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const k = itemsPerRound();
    const chosen = [];
    for (let i = 0; i < k; i++) chosen.push(ranked[i % ranked.length].c);

    let items = chosen.map(c => {
      const pick = Math.floor(Math.random() * 2);
      const subjEn = c.subj.en[pick % c.subj.en.length];
      const verbEn = c.tense === "present"
        ? Conjugator.englishForm(c.v.inf, "present", c.subj.idx === 2 ? 2 : 0)
        : Conjugator.englishForm(c.v.inf, "preterite", 0);
      const prep = c.v.prep ? " " + c.v.prep : "";

      let prompt, accept;
      if (!c.recipient) {
        const iopEn = c.iop.en[pick % c.iop.en.length];
        prompt = `${subjEn} ${verbEn}${prep} ${iopEn}`;
        accept = [`${c.iop.es} ${c.conj}`];
      } else {
        prompt = `${subjEn} ${verbEn}${prep} the ${c.recipient.enNoun}`;
        accept = c.recipient.variants.map(nv => `${c.iop.es} ${c.conj} ${aPhrase(nv)}`);
      }

      return {
        kind: "iop",
        prompt,
        correct: accept[0],
        accept,
        redundant: !!c.recipient,
        iopEs: c.iop.es,
        tense: c.tense,
        inf: c.v.inf,
        key: key(c),
      };
    });
    if ($("drillShuffle").checked) shuffle(items);

    items.forEach(it => (iopCounts[it.key] = (iopCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "iop";

    $("drillStatus").textContent =
      `${verbs.length} verb(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · indirect object pronouns only`;
    renderItems(items);
  }

  // ======================= DOUBLE-OBJECT-PRONOUN MODE =======================
  // Two pronouns together: indirect BEFORE direct ("me lo", "te la"), and the
  // key rule — le/les becomes SE before lo/la/los/las ("se lo doy", never *"le lo doy").
  const dblCounts = {};
  const DBL_IOP = [
    { es: "me",  en: ["me"],         clash: 0 },
    { es: "te",  en: ["you"],        clash: 1 },
    { es: "le",  en: ["him", "her"], clash: null },
    { es: "nos", en: ["us"],         clash: 3 },
    { es: "les", en: ["them"],       clash: null },
  ];
  const DBL_DOP = [
    { es: "lo",  en: "it (masculine)" },
    { es: "la",  en: "it (feminine)" },
    { es: "los", en: "them (masculine)" },
    { es: "las", en: "them (feminine)" },
  ];
  // Ditransitive verbs (they take both a thing and a recipient). `prep` is the
  // English preposition — you buy something FOR someone, but give it TO someone.
  const DBL_VERBS = [
    { inf: "dar", prep: "to" },      { inf: "decir", prep: "to" },
    { inf: "traer", prep: "to" },    { inf: "comprar", prep: "for" },
    { inf: "enviar", prep: "to" },   { inf: "explicar", prep: "to" },
    { inf: "llevar", prep: "to" },   { inf: "vender", prep: "to" },
    { inf: "escribir", prep: "to" }, { inf: "leer", prep: "to" },
    { inf: "hacer", prep: "for" },
  ];

  // le/les → se before a direct object pronoun.
  const dblPairEs = (iop, dop) => `${iop.es === "le" || iop.es === "les" ? "se" : iop.es} ${dop.es}`;
  const dblPairJoined = (iop, dop) => `${iop.es === "le" || iop.es === "les" ? "se" : iop.es}${dop.es}`;

  // Attaching TWO pronouns to an infinitive always needs a written accent:
  // dar → dárselo, vender → vendérselo, escribir → escribírselo.
  const accentInfinitive = inf =>
    inf.replace(/ar$/, "ár").replace(/er$/, "ér").replace(/ir$/, "ír");

  function dblAvailableVerbs() {
    const have = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("VERBS")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        have.add((t.es || "").split("/")[0].trim().toLowerCase());
      });
    });
    return DBL_VERBS.filter(v => have.has(v.inf) && Conjugator.isDrillable(v.inf));
  }

  function dblVerbEnglish(inf, tense, third) {
    let w = tense === "present"
      ? Conjugator.englishForm(inf, "present", third ? 2 : 0)
      : Conjugator.englishForm(inf, "preterite", 0);
    // "read" is spelled the same in past — disambiguate.
    const other = tense === "present"
      ? Conjugator.englishForm(inf, "preterite", 0)
      : Conjugator.englishForm(inf, "present", third ? 2 : 0);
    if (tense === "preterite" && w.toLowerCase() === (other || "").toLowerCase()) w += " (past)";
    return w;
  }

  function generateDblRound() {
    const verbs = dblAvailableVerbs();
    const { tenses, unsupported } = selectedTenses();
    const personIdx = selectedPersons();
    const subjects = PP_SUBJECTS.filter(s => personIdx.includes(s.idx));
    const auxes = ppAvailableAux();

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (!verbs.length) notes.push("Check a set with a give/tell-type verb (dar, decir, traer, comprar, enviar, explicar, llevar, vender, escribir, leer, hacer).");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!verbs.length || !subjects.length) {
      $("drillStatus").textContent = "Need at least one ditransitive verb (dar, decir, comprar…) and one subject.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const combos = [];
    tenses.forEach(tense => verbs.forEach(v => {
      const forms = Conjugator.conjugate(v.inf, tense);
      if (!forms) return;
      subjects.forEach(subj => {
        DBL_IOP.forEach(iop => {
          if (iop.clash === subj.idx) return; // "I give it to me"
          DBL_DOP.forEach(dop => {
            combos.push({ tense, v, subj, iop, dop, verbConj: forms[subj.idx], periph: null });
            // Periphrastic variant exercises placement as well.
            auxes.forEach(aux => {
              if (aux.presentOnly && tense !== "present") return;
              const auxForms = Conjugator.conjugate(aux.inf, tense);
              if (!auxForms) return;
              combos.push({ tense, v, subj, iop, dop, verbConj: forms[subj.idx], periph: { aux, auxConj: auxForms[subj.idx] } });
            });
          });
        });
      });
    }));

    if (!combos.length) {
      $("drillStatus").textContent = "No drillable combinations — try checking more verbs or subjects.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const key = c =>
      `${c.v.inf}|${c.subj.idx}|${c.iop.es}|${c.dop.es}|${c.tense}|${c.periph ? c.periph.aux.inf : "-"}`;
    const ranked = combos
      .map(c => ({ c, n: dblCounts[key(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const k = itemsPerRound();
    const chosen = [];
    for (let i = 0; i < k; i++) chosen.push(ranked[i % ranked.length].c);

    let items = chosen.map(c => {
      const pick = Math.floor(Math.random() * 2);
      const subjEn = c.subj.en[pick % c.subj.en.length];
      const iopEn = c.iop.en[pick % c.iop.en.length];
      const pair = dblPairEs(c.iop, c.dop);
      const usedSe = c.iop.es === "le" || c.iop.es === "les";

      let prompt, accept, alt = null;
      if (!c.periph) {
        prompt = `${subjEn} ${dblVerbEnglish(c.v.inf, c.tense, c.subj.third)} ${c.dop.en} ${c.v.prep} ${iopEn}`;
        accept = [`${pair} ${c.verbConj}`];
      } else {
        const { aux, auxConj } = c.periph;
        const link = aux.link ? " " + aux.link : "";
        const proclitic = `${pair} ${auxConj}${link} ${c.v.inf}`;
        const enclitic = `${auxConj}${link} ${accentInfinitive(c.v.inf)}${dblPairJoined(c.iop, c.dop)}`;
        const auxEn = ppAuxEnglish(aux, c.subj.idx, c.tense);
        prompt = `${subjEn} ${auxEn} ${Conjugator.englishForm(c.v.inf, "present", 0)} ${c.dop.en} ${c.v.prep} ${iopEn}`;
        accept = [proclitic, enclitic];
        alt = enclitic;
      }

      return {
        kind: "dbl",
        prompt,
        correct: accept[0],
        accept,
        alt,
        usedSe,
        iopEs: c.iop.es,
        dopEs: c.dop.es,
        tense: c.tense,
        inf: c.v.inf,
        key: key(c),
      };
    });
    if ($("drillShuffle").checked) shuffle(items);

    items.forEach(it => (dblCounts[it.key] = (dblCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "dbl";

    $("drillStatus").textContent =
      `${verbs.length} verb(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · indirect + direct pronouns` +
      (auxes.length ? ` · ${auxes.length} auxiliary(ies) for placement` : "");
    renderItems(items);
  }

  // ======================= PRONOUN-PLACEMENT MODE =======================
  // In a verbal periphrasis (conjugated verb + infinitive) the object pronoun
  // may sit BEFORE the conjugated verb (proclitic: "te quiero ver") or attach
  // to the infinitive (enclitic: "quiero verte"). Both are accepted.
  // Only true periphrases are used — clitic climbing is not available with verbs
  // that take the infinitive as a plain object ("decidí comprarlo", not *"lo decidí comprar").
  const ppCounts = {};
  const PP_AUX = [
    { inf: "querer",    link: "",    en: { pres: ["want to", "wants to"], past: "wanted to" } },
    { inf: "poder",     link: "",    en: { pres: ["can", "can"],          past: "could" } },
    { inf: "tener",     link: "que", en: { pres: ["have to", "has to"],   past: "had to" } },
    { inf: "ir",        link: "a",   presentOnly: true, be: true },
    { inf: "necesitar", link: "",    en: { pres: ["need to", "needs to"], past: "needed to" } },
    { inf: "intentar",  link: "",    en: { pres: ["try to", "tries to"],  past: "tried to" } },
  ];
  const PP_BE = ["am", "are", "is", "are", "are"];
  const PP_SUBJECTS = [
    { idx: 0, en: ["I"],         clash: "me" },
    { idx: 1, en: ["You"],       clash: "te" },
    { idx: 2, en: ["He", "She"], clash: null },
    { idx: 3, en: ["We"],        clash: "nos" },
    { idx: 4, en: ["They"],      clash: null },
  ];

  function ppAuxEnglish(aux, personIdx, tense) {
    if (aux.be) return PP_BE[personIdx] + " going to";
    if (tense === "present") return aux.en.pres[personIdx === 2 ? 1 : 0];
    return aux.en.past;
  }

  // Transitive main verbs from the checked VERBS sets (excluding the auxiliaries).
  function ppMainVerbs() {
    const auxInfs = new Set(PP_AUX.map(a => a.inf));
    const out = [], seen = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("VERBS")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const inf = (t.es || "").split("/")[0].trim().toLowerCase();
        if (!/^[a-záéíóúñü]+$/i.test(inf) || seen.has(inf)) return;
        if (auxInfs.has(inf) || inf.endsWith("se")) return;
        if (!Conjugator.isDrillable(inf) || !Conjugator.canTakeObject(inf)) return;
        seen.add(inf);
        out.push({ inf, base: Conjugator.englishForm(inf, "present", 0) });
      });
    });
    return out;
  }

  // Which auxiliaries the user actually has checked.
  function ppAvailableAux() {
    const have = new Set();
    state.sets.filter(s => s.checked).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        have.add((t.es || "").split("/")[0].trim().toLowerCase());
      });
    });
    return PP_AUX.filter(a => have.has(a.inf));
  }

  function generatePpRound() {
    const auxes = ppAvailableAux();
    const mains = ppMainVerbs();
    const { tenses, unsupported } = selectedTenses();
    const personIdx = selectedPersons();
    const subjects = PP_SUBJECTS.filter(s => personIdx.includes(s.idx));

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (!auxes.length) notes.push("Check a set containing querer / poder / tener / ir / necesitar / intentar.");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!auxes.length || !mains.length || !subjects.length) {
      $("drillStatus").textContent =
        "Need an auxiliary (querer, poder, tener, ir…) plus at least one transitive verb and subject.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const combos = [];
    tenses.forEach(tense => auxes.forEach(aux => {
      if (aux.presentOnly && tense !== "present") return;
      const auxForms = Conjugator.conjugate(aux.inf, tense);
      if (!auxForms) return;
      subjects.forEach(subj => {
        const auxConj = auxForms[subj.idx];
        mains.forEach(main => DOP_OBJECTS.forEach(obj => {
          // "I want to see me" — skip subject/object person clashes.
          if (subj.clash && obj.dop === subj.clash) return;
          combos.push({ aux, auxConj, subj, main, obj, tense });
        }));
      });
    }));

    if (!combos.length) {
      $("drillStatus").textContent = "No drillable combinations — try checking more verbs.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const key = c => `${c.aux.inf}|${c.main.inf}|${c.subj.idx}|${c.obj.dop}|${c.tense}`;
    const ranked = combos
      .map(c => ({ c, n: ppCounts[key(c)] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const k = itemsPerRound();
    const chosen = [];
    for (let i = 0; i < k; i++) chosen.push(ranked[i % ranked.length].c);

    let items = chosen.map(c => {
      const link = c.aux.link ? " " + c.aux.link : "";
      const proclitic = `${c.obj.dop} ${c.auxConj}${link} ${c.main.inf}`;
      const enclitic = `${c.auxConj}${link} ${c.main.inf}${c.obj.dop}`;
      const subjEn = c.subj.en[Math.floor(Math.random() * c.subj.en.length)];
      const auxEn = ppAuxEnglish(c.aux, c.subj.idx, c.tense);
      return {
        kind: "pp",
        prompt: `${subjEn} ${auxEn} ${c.main.base} ${c.obj.en}`,
        correct: proclitic,
        accept: [proclitic, enclitic],
        alt: enclitic,
        tense: c.tense,
        auxInf: c.aux.inf,
        key: key(c),
      };
    });
    if ($("drillShuffle").checked) shuffle(items);

    items.forEach(it => (ppCounts[it.key] = (ppCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "pp";

    $("drillStatus").textContent =
      `${auxes.length} auxiliary(ies) · ${mains.length} verb(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · both placements accepted`;
    renderItems(items);
  }

  // ======================= GUSTAR-TYPE MODE =======================
  // These verbs take an indirect object pronoun (me/te/le/nos/les) and agree
  // with the THING, not the liker: "me gusta el carro" / "me gustan los carros".
  const gustarCounts = {};
  const gustarLikerCounts = {}; // weights liker CATEGORIES (e.g. "He/She" vs each noun) evenly
  const GUSTAR_VERBS = {
    gustar:    { pres: ["gusta", "gustan"],       pret: ["gustó", "gustaron"],       style: "like",     enPresent: "like", enPast: "liked", neg: true },
    encantar:  { pres: ["encanta", "encantan"],   pret: ["encantó", "encantaron"],   style: "like",     enPresent: "love", enPast: "loved", neg: false },
    interesar: { pres: ["interesa", "interesan"], pret: ["interesó", "interesaron"], style: "interest", neg: true },
    doler:     { pres: ["duele", "duelen"],       pret: ["dolió", "dolieron"],       style: "hurt",     neg: true },
  };

  const GUSTAR_PRONOUNS = [
    { idx: 0, en: ["I"],         dop: "me",  third: false, be: { present: "am",  preterite: "was" },  poss: ["My"] },
    { idx: 1, en: ["You"],       dop: "te",  third: false, be: { present: "are", preterite: "were" }, poss: ["Your"] },
    { idx: 2, en: ["He", "She"], dop: "le",  third: true,  be: { present: "is",  preterite: "was" },  poss: ["His", "Her"] },
    { idx: 3, en: ["We"],        dop: "nos", third: false, be: { present: "are", preterite: "were" }, poss: ["Our"] },
    { idx: 4, en: ["They"],      dop: "les", third: false, be: { present: "are", preterite: "were" }, poss: ["Their"] },
  ];

  function aPhrase(v) {
    if (v.article === "el") return `al ${v.word}`;
    return `a ${v.article} ${v.word}`;
  }

  // Which of the four verbs are in the user's checked sets?
  function availableGustarVerbs() {
    const found = [];
    state.sets.filter(s => s.checked).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const inf = (t.es || "").split("/")[0].trim().toLowerCase();
        if (GUSTAR_VERBS[inf] && !found.includes(inf)) found.push(inf);
      });
    });
    return found;
  }

  // Nouns usable as the liked "thing"; body parts tracked separately for doler.
  function gustarNouns() {
    const all = [], body = [], people = [];
    state.sets.filter(s => s.checked && s.name.startsWith("NOUNS")).forEach(s => {
      const isBody = /body/i.test(s.name);
      const isPeople = /people|family/i.test(s.name);
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const n = parseNoun(t);
        if (!n) return;
        all.push(n);
        if (isBody) body.push(n);
        if (isPeople) people.push(n);
      });
    });
    return { all, body, people };
  }

  function gustarLikers(people) {
    const persons = selectedPersons();
    const likers = GUSTAR_PRONOUNS.filter(p => persons.includes(p.idx)).map(p => ({
      key: `p${p.idx}`,
      enOptions: p.en,
      possOptions: p.poss,
      third: p.third,
      be: p.be,
      variants: [{ dop: p.dop, aPhrase: null }],
    }));
    people.forEach(n => {
      const plural = n.variants[0].number === "plural";
      // Noun subjects are 3rd person: singular ones need Él/Ella/Usted checked,
      // plural ones need Ellos/Ellas/Ustedes checked.
      if (!persons.includes(plural ? 4 : 2)) return;
      likers.push({
        key: `n:${n.variants[0].word}`,
        enOptions: [`The ${n.enNoun}`],
        possOptions: [`The ${n.enNoun}'s`],
        third: !plural,
        be: plural ? { present: "are", preterite: "were" } : { present: "is", preterite: "was" },
        variants: n.variants.map(v => ({ dop: v.number === "plural" ? "les" : "le", aPhrase: aPhrase(v) })),
      });
    });
    return likers;
  }

  function gustarSpanish(lv, tv, vf, tense, neg) {
    const forms = tense === "present" ? vf.pres : vf.pret;
    const form = tv.number === "plural" ? forms[1] : forms[0];
    const head = lv.aPhrase ? lv.aPhrase + " " : "";
    return `${head}${neg ? "no " : ""}${lv.dop} ${form} ${tv.article} ${tv.word}`;
  }

  function gustarEnglish(liker, thing, v, tense, neg, pick) {
    const subj = liker.enOptions[pick % liker.enOptions.length];
    const thingPhrase = `the ${thing.enNoun}`;
    if (v.style === "like") {
      if (tense === "present") {
        if (neg) return `${subj} ${liker.third ? "doesn't" : "don't"} ${v.enPresent} ${thingPhrase}`;
        return `${subj} ${liker.third ? v.enPresent + "s" : v.enPresent} ${thingPhrase}`;
      }
      if (neg) return `${subj} didn't ${v.enPresent} ${thingPhrase}`;
      return `${subj} ${v.enPast} ${thingPhrase}`;
    }
    if (v.style === "interest") {
      return `${subj} ${liker.be[tense]}${neg ? " not" : ""} interested in ${thingPhrase}`;
    }
    // doler — English uses a possessive where Spanish uses the definite article
    const poss = liker.possOptions[pick % liker.possOptions.length];
    const part = thing.enNoun;
    const plural = thing.number === "plural";
    if (tense === "present") {
      if (neg) return `${poss} ${part} ${plural ? "don't" : "doesn't"} hurt`;
      return `${poss} ${part} ${plural ? "hurt" : "hurts"}`;
    }
    if (neg) return `${poss} ${part} didn't hurt`;
    return `${poss} ${part} hurt (past)`;
  }

  function generateGustarRound() {
    const verbs = availableGustarVerbs();
    const { all, body, people } = gustarNouns();
    const { tenses, unsupported } = selectedTenses();
    const likers = gustarLikers(people);

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (verbs.includes("doler") && !body.length) notes.push("Skipping <i>doler</i> — check a body-parts NOUNS set to drill it.");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!verbs.length || !all.length || !likers.length) {
      $("drillStatus").textContent = !verbs.length
        ? "Check a set containing gustar / encantar / interesar / doler (e.g. \"MISC - gustar-type verbs\")."
        : "Check at least one NOUNS set (and one subject) to drill gustar-type verbs.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const combos = [];
    verbs.forEach(inf => {
      const vf = GUSTAR_VERBS[inf];
      const things = vf.style === "hurt" ? body : all;
      const negOpts = vf.neg ? [false, true] : [false];
      things.forEach(thing => likers.forEach(liker => tenses.forEach(tense => negOpts.forEach(neg => {
        combos.push({ inf, vf, thing, liker, tense, neg, key: `${inf}|${liker.key}|${thing.variants[0].word}|${tense}|${neg}` });
      }))));
    });

    if (!combos.length) {
      $("drillStatus").textContent = "No drillable combinations — try checking more nouns or verbs.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    // Two-stage pick: choose a LIKER CATEGORY first (so "He/She" gets picked as
    // often as any single noun, instead of being drowned out since there are
    // dozens of nouns but only one pronoun option), then pick a combo for it.
    const combosByLiker = new Map();
    combos.forEach(c => {
      if (!combosByLiker.has(c.liker.key)) combosByLiker.set(c.liker.key, []);
      combosByLiker.get(c.liker.key).push(c);
    });
    const likerKeys = [...combosByLiker.keys()];

    const k = itemsPerRound();
    const chosen = [];
    for (let i = 0; i < k; i++) {
      const rankedLikers = likerKeys
        .map(lk => ({ lk, n: gustarLikerCounts[lk] || 0, r: Math.random() }))
        .sort((a, b) => a.n - b.n || a.r - b.r);
      const lk = rankedLikers[i % rankedLikers.length].lk;
      const pool = combosByLiker.get(lk);
      const ranked = pool
        .map(c => ({ c, n: gustarCounts[c.key] || 0, r: Math.random() }))
        .sort((a, b) => a.n - b.n || a.r - b.r);
      const c = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].c;
      chosen.push(c);
      gustarLikerCounts[lk] = (gustarLikerCounts[lk] || 0) + 1;
    }

    let items = chosen.map(c => {
      const pick = Math.floor(Math.random() * 2);
      const accept = [];
      c.liker.variants.forEach(lv => c.thing.variants.forEach(tv => {
        accept.push(gustarSpanish(lv, tv, c.vf, c.tense, c.neg));
      }));
      return {
        kind: "gustar",
        prompt: gustarEnglish(c.liker, c.thing, c.vf, c.tense, c.neg, pick),
        correct: accept[0],
        accept,
        inf: c.inf,
        tense: c.tense,
        key: c.key,
      };
    });
    if ($("drillShuffle").checked) shuffle(items);

    items.forEach(it => (gustarCounts[it.key] = (gustarCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "gustar";

    $("drillStatus").textContent =
      `${verbs.join(", ")} · ${all.length} noun(s) · ${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · ${likers.length} subject(s)`;
    renderItems(items);
  }

  // ======================= DYNAMIC QUESTION MODE =======================
  const dqCounts = {};

  function parseNoun(term) {
    // A noun term may hold both genders, e.g. "El enfermero / La enfermera".
    const variants = [];
    (term.es || "").split("/").map(s => s.trim()).filter(Boolean).forEach(alt => {
      const m = alt.match(/^(el|la|los|las)\s+(.+)$/i);
      if (!m) return;
      const art = m[1].toLowerCase();
      variants.push({
        article: art,
        word: m[2].trim(),
        gender: (art === "el" || art === "los") ? "m" : "f",
        number: (art === "los" || art === "las") ? "plural" : "sing",
      });
    });
    if (!variants.length) return null;
    return {
      variants,
      number: variants[0].number,
      enNoun: (term.en || "").replace(/^the\s+/i, "").split("/")[0].trim(),
    };
  }

  // Verbs that don't work with English do-support ("Where do you be?") or are
  // otherwise awkward as the main verb of a question.
  const DQ_VERB_SKIP = new Set(["ser", "estar", "poder", "haber"]);
  // Only these make sense with "adónde" (where TO).
  const DQ_MOTION = new Set(["ir", "viajar", "caminar", "correr", "llegar", "salir", "volver", "nadar", "escalar"]);
  // Verbs that can sensibly take a PERSON as their direct object, so we don't
  // generate things like "Do you eat the man?".
  const DQ_PERSON_OBJECT_OK = new Set([
    "ver", "conocer", "llamar", "esperar", "ayudar", "escuchar", "encontrar",
    "necesitar", "querer", "recordar", "olvidar", "entender", "creer", "traer",
  ]);

  // English subject + do-support, keyed to the person indexes used elsewhere.
  const DQ_SUBJECTS = [
    { idx: 0, en: "I",   third: false },
    { idx: 1, en: "you", third: false },
    { idx: 2, en: "he",  third: true },
    { idx: 3, en: "we",  third: false },
    { idx: 4, en: "they", third: false },
  ];

  // Question words, matched against the checked "question words" terms by their
  // Spanish form (accent-insensitively).
  const DQ_QWORDS = [
    { es: "dónde",  en: "where",    adverbial: true },
    { es: "cuándo", en: "when",     adverbial: true },
    { es: "por qué", en: "why",     adverbial: true },
    { es: "cómo",   en: "how",      adverbial: true },
    { es: "adónde", en: "where", enTail: "to", motion: true },
    { es: "qué",    en: "what",     needsObject: true },
    { es: "quién",  en: "who",      subject: true },
    { es: "cuántos", en: "how many", counting: true },
  ];

  const dqNorm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  // Which question words are currently checked? Returns null when no question
  // word set is checked at all (so we can tell the user).
  function dqAvailableQWords() {
    let sawSet = false;
    const on = new Set();
    state.sets.filter(s => s.checked && /question/i.test(s.name)).forEach(s => {
      sawSet = true;
      s.terms.filter(t => t.checked !== false).forEach(t => on.add(dqNorm(t.es)));
    });
    if (!sawSet) return null;
    return DQ_QWORDS.filter(q => on.has(dqNorm(q.es)));
  }

  function dqVerbs() {
    const out = [], seen = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("VERBS")).forEach(s => {
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const inf = (t.es || "").split("/")[0].trim().toLowerCase();
        if (!/^[a-záéíóúñü]+$/i.test(inf) || seen.has(inf)) return;
        if (DQ_VERB_SKIP.has(inf) || !Conjugator.isDrillable(inf)) return;
        seen.add(inf);
        out.push({
          inf,
          // Base English form ("eat", "buy") for use after do/does/did.
          base: Conjugator.englishForm(inf, "present", 0),
          past: Conjugator.englishForm(inf, "preterite", 2),
          third: Conjugator.englishForm(inf, "present", 2),
          transitive: Conjugator.canTakeObject(inf),
          motion: DQ_MOTION.has(inf),
        });
      });
    });
    return out;
  }

  function dqNouns() {
    const all = [], plural = [], people = new Set();
    state.sets.filter(s => s.checked && s.name.startsWith("NOUNS")).forEach(s => {
      const isPeople = /people|family/i.test(s.name);
      s.terms.filter(t => t.checked !== false).forEach(t => {
        const n = parseNoun(t);
        if (!n) return;
        n.isPerson = isPeople;
        all.push(n);
        if (n.number === "plural") plural.push(n);
        if (isPeople) people.add(n);
      });
    });
    return { all, plural };
  }

  // "the car" / "the eyes"; people take the personal "a" as a direct object.
  function dqObjectEs(nv, isPerson) {
    if (!isPerson) return `${nv.article} ${nv.word}`;
    return nv.article === "el" ? `al ${nv.word}` : `a ${nv.article} ${nv.word}`;
  }

  function dqEnglish(qw, subj, verb, tense, objEn) {
    const aux = tense === "present" ? (subj.third ? "does" : "do") : "did";
    const parts = [];
    if (qw) parts.push(qw.en);
    parts.push(aux, subj.en, verb.base);
    if (objEn) parts.push(objEn);
    // "adónde" reads as "Where do you walk TO?" — but "go to" is redundant.
    if (qw && qw.enTail && verb.inf !== "ir") parts.push(qw.enTail);
    const s = parts.join(" ");
    return s.charAt(0).toUpperCase() + s.slice(1) + "?";
  }

  // Returns [{ key, prompt, accept:[...] }]
  function dqCombos(tenses, personIdx) {
    const combos = [];
    const qwords = dqAvailableQWords();
    const qw = qwords || [];
    const verbs = dqVerbs();
    const { all, plural } = dqNouns();
    const subjects = DQ_SUBJECTS.filter(s => personIdx.includes(s.idx));

    const has = pred => qw.filter(pred);
    const adverbials = has(q => q.adverbial);
    const motionQ = has(q => q.motion);
    const quéQ = has(q => q.needsObject);
    const quiénQ = has(q => q.subject);
    const countQ = has(q => q.counting);
    const dondeQ = qw.find(q => q.es === "dónde");

    tenses.forEach(tense => {
      const forms = inf => Conjugator.conjugate(inf, tense);

      verbs.forEach(v => {
        const f = forms(v.inf);
        if (!f) return;

        subjects.forEach(subj => {
          const conj = f[subj.idx];

          // T1 — question word + conjugated verb: "¿Dónde trabajas?"
          adverbials.forEach(q => combos.push({
            key: `t1|${q.es}|${v.inf}|${subj.idx}|${tense}`,
            prompt: dqEnglish(q, subj, v, tense),
            accept: [`¿${q.es} ${conj}?`],
          }));

          // T2 — adónde + motion verb: "¿Adónde vas?"
          if (v.motion) motionQ.forEach(q => combos.push({
            key: `t2|${q.es}|${v.inf}|${subj.idx}|${tense}`,
            prompt: dqEnglish(q, subj, v, tense),
            accept: [`¿${q.es} ${conj}?`],
          }));

          if (v.transitive) {
            // T3 — qué + transitive verb: "¿Qué comes?"
            quéQ.forEach(q => combos.push({
              key: `t3|${q.es}|${v.inf}|${subj.idx}|${tense}`,
              prompt: dqEnglish(q, subj, v, tense),
              accept: [`¿${q.es} ${conj}?`],
            }));

            all.forEach(n => {
              // Don't build "Do you eat the man?" — people are only objects of
              // verbs that sensibly take them.
              if (n.isPerson && !DQ_PERSON_OBJECT_OK.has(v.inf)) return;
              const objEn = `the ${n.enNoun}`;
              const objs = n.variants.map(nv => dqObjectEs(nv, n.isPerson));

              // T4 — yes/no + object: "¿Tienes el boleto?"
              combos.push({
                key: `t4|${v.inf}|${n.variants[0].word}|${subj.idx}|${tense}`,
                prompt: dqEnglish(null, subj, v, tense, objEn),
                accept: objs.map(o => `¿${conj} ${o}?`),
              });

              // T5 — question word + verb + object: "¿Cuándo compraste el carro?"
              adverbials.forEach(q => combos.push({
                key: `t5|${q.es}|${v.inf}|${n.variants[0].word}|${subj.idx}|${tense}`,
                prompt: dqEnglish(q, subj, v, tense, objEn),
                accept: objs.map(o => `¿${q.es} ${conj} ${o}?`),
              }));
            });
          }
        });

        // T6 — quién as the subject (always 3rd singular, no do-support):
        // "Who eats?" / "Who ate?"
        quiénQ.forEach(q => {
          const enVerb = tense === "present" ? v.third : v.past;
          combos.push({
            key: `t6|${q.es}|${v.inf}|${tense}`,
            prompt: `Who ${enVerb}?`,
            accept: [`¿${q.es} ${f[2]}?`],
          });
        });
      });

      // Present-only noun templates (location / counting use hay & estar).
      if (tense !== "present") return;

      if (dondeQ) all.forEach(n => {
        const isPl = n.number === "plural";
        combos.push({
          key: `t7|${n.variants[0].word}|${n.number}`,
          prompt: `Where ${isPl ? "are" : "is"} the ${n.enNoun}?`,
          accept: n.variants.map(nv => `¿dónde ${isPl ? "están" : "está"} ${nv.article} ${nv.word}?`),
        });
      });

      if (countQ.length) plural.forEach(n => combos.push({
        key: `t8|${n.variants[0].word}`,
        prompt: `How many ${n.enNoun} are there?`,
        accept: n.variants.map(nv => `¿${nv.gender === "m" ? "cuántos" : "cuántas"} ${nv.word} hay?`),
      }));
    });

    return { combos, sawQWordSet: qwords !== null, verbCount: verbs.length, nounCount: all.length };
  }

  function generateDqRound() {
    const { tenses, unsupported } = selectedTenses();
    const personIdx = selectedPersons();
    const { combos, sawQWordSet, verbCount, nounCount } = dqCombos(tenses, personIdx);

    const notes = [];
    if (unsupported.length) notes.push("Tenses not supported by local mode (use AI mode): " + unsupported.join(", ") + ".");
    if (!sawQWordSet) notes.push("Check a \"question words\" set to unlock question-word templates (dónde, cuándo, qué…).");
    $("drillUnavailable").innerHTML = notes.join("<br>");

    if (!combos.length) {
      $("drillStatus").textContent =
        "No questions can be built yet — check a VERBS set (and a question-words set), plus NOUNS for object questions.";
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const shuffleOn = $("drillShuffle").checked;
    const ranked = combos
      .map(c => ({ c, n: dqCounts[c.key] || 0, r: Math.random() }))
      .sort((a, b) => a.n - b.n || a.r - b.r);
    const k = itemsPerRound();
    let chosen = [];
    for (let i = 0; i < k; i++) chosen.push(ranked[i % ranked.length].c);

    let items = chosen.map(c => ({
      kind: "dq",
      prompt: c.prompt,
      correct: c.accept[0],
      accept: c.accept,
      key: c.key,
    }));
    if (shuffleOn) shuffle(items);

    items.forEach(it => (dqCounts[it.key] = (dqCounts[it.key] || 0) + 1));
    currentItems = items;
    currentKind = "dq";

    $("drillStatus").textContent =
      `${combos.length} question(s) in rotation · ${verbCount} verb(s) · ${nounCount} noun(s) · ` +
      `${tenses.map(t => TENSE_LABEL[t]).join(" & ")} · ${personIdx.length} subject(s)`;
    renderItems(items);
  }

  // ======================= VOCAB MODE =======================
  function splitAlts(s) {
    return (s || "").split(/\/|—/).map(x => x.trim()).filter(Boolean);
  }

  function pickLeastUsedTerms(terms, n) {
    return [...terms]
      .map(t => ({ t, r: Math.random() }))
      .sort((a, b) => (a.t.tally || 0) - (b.t.tally || 0) || a.r - b.r)
      .slice(0, Math.max(0, n))
      .map(x => x.t);
  }

  function buildVocabItem(term, setName, enToEs) {
    const rawCorrect = enToEs ? term.es : term.en;
    const prompt = enToEs ? term.en : term.es;
    return {
      kind: "vocab", term, setName, note: term.note,
      prompt, correct: rawCorrect, accept: splitAlts(rawCorrect),
    };
  }

  function generateVocabRound() {
    $("drillUnavailable").innerHTML = "";

    const onlyFocus = $("vocabOnlyFocus").checked;
    const onlyWrong = $("vocabOnlyWrong").checked;
    const activeSets = state.sets
      .filter(s => s.checked)
      .map(s => ({ ...s, terms: s.terms.filter(t => t.checked !== false && (!onlyFocus || t.focus) && (!onlyWrong || t.wrong)) }))
      .filter(s => s.terms.length);

    if (!activeSets.length) {
      let msg = "Check at least one set with at least one term enabled to start the vocab drill.";
      if (onlyWrong && onlyFocus) msg = "No terms are in BOTH your \"got wrong\" and \"needs work\" lists (within your checked sets).";
      else if (onlyWrong) msg = "Your \"got wrong\" list is empty (within your checked sets). Miss a term and it lands here automatically.";
      else if (onlyFocus) msg = "Your \"needs work\" list is empty (within your checked sets). Flag terms with ☆ during a round, then try again.";
      $("drillStatus").textContent = msg;
      $("drillItems").innerHTML = "";
      currentItems = [];
      return;
    }

    const enToEs = document.querySelector('input[name="direction"]:checked').value === "en-to-es";
    const shuffleOn = $("drillShuffle").checked;

    // term -> owning set name, for the meta line
    const setByTerm = new Map();
    const pool = [];
    activeSets.forEach(s => s.terms.forEach(t => { setByTerm.set(t, s.name); pool.push(t); }));

    const mustTerms = pool.filter(t => t.must);
    const mustTermSet = new Set(mustTerms);
    const mustSetsNeedingPick = activeSets.filter(s => s.must && !s.terms.some(t => mustTermSet.has(t)));
    const setPicks = mustSetsNeedingPick
      .map(s => pickLeastUsedTerms(s.terms.filter(t => !mustTermSet.has(t)), 1)[0])
      .filter(Boolean);

    const forced = [...mustTerms, ...setPicks];
    const forcedSet = new Set(forced);
    const want = Math.max(itemsPerRound(), forced.length);
    const remainingPool = pool.filter(t => !forcedSet.has(t));
    const extra = pickLeastUsedTerms(remainingPool, want - forced.length);

    let terms = [...forced, ...extra];
    if (shuffleOn) shuffle(terms);

    terms.forEach(t => (t.tally = (t.tally || 0) + 1));
    save();
    render();

    const items = terms.map(t => buildVocabItem(t, setByTerm.get(t), enToEs));
    currentItems = items;
    currentKind = "vocab";

    $("drillStatus").textContent =
      `${pool.length} term(s) available · ${enToEs ? "English → Spanish" : "Spanish → English"}` +
      (forced.length ? ` · ${forced.length} required this round` : "");
    renderItems(items);
  }

  // ======================= SHARED RENDER / GRADE =======================
  function renderItems(items) {
    $("drillResults").innerHTML = "";
    $("drillItems").innerHTML = items
      .map((it, i) => {
        const star = it.kind === "vocab"
          ? `<button type="button" class="drill-star${it.term.focus ? " on" : ""}" data-i="${i}" title="Add/remove from &quot;needs work&quot; list">${it.term.focus ? "★" : "☆"}</button>`
          : "";
        const copyBtn = it.kind === "dq"
          ? `<button type="button" class="drill-copy" data-i="${i}" title="Copy this question">📋</button>`
          : "";
        return `
        <div class="drill-item">
          <span class="drill-num">${i + 1}.</span>
          <span class="drill-prompt">${escapeHtml(it.prompt)}</span>
          ${copyBtn}
          <input type="text" class="drill-input" data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <span class="drill-mark" id="drillMark${i}"></span>
          ${star}
        </div>`;
      })
      .join("");

    document.querySelectorAll(".drill-star").forEach(btn => {
      btn.addEventListener("click", () => {
        const term = currentItems[+btn.dataset.i].term;
        term.focus = !term.focus;
        save();
        render(); // keep the sidebar ★ indicators in sync
        btn.textContent = term.focus ? "★" : "☆";
        btn.classList.toggle("on", term.focus);
        updateFocusUI();
      });
    });

    document.querySelectorAll(".drill-copy").forEach(btn => {
      btn.addEventListener("click", async () => {
        const it = currentItems[+btn.dataset.i];
        await navigator.clipboard.writeText(it.prompt);
        const prev = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => (btn.textContent = prev), 1200);
      });
    });

    const first = document.querySelector(".drill-input");
    if (first) first.focus();
    graded = false;
    const btn = $("drillCheckBtn");
    btn.disabled = false;
    btn.textContent = "Check answers";
  }

  // Lowercase, drop punctuation (¿ ¡ ? ! . , etc.), collapse spaces — so full
  // question sentences grade the same with or without their punctuation.
  const norm = s => (s || "")
    .toLowerCase()
    .replace(/[¿¡?!.,;:"'()]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  const stripAccents = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

  function stripLeadingSubject(s) {
    const parts = s.split(" ");
    if (parts.length > 1 && SUBJECT_PRONOUNS.has(parts[0])) return parts.slice(1).join(" ");
    return s;
  }

  function gradeOne(item, raw) {
    let giv = norm(raw);
    if (item.kind === "conj" || item.kind === "dop") giv = stripLeadingSubject(giv);
    if (!giv) return { kind: "bad", giv: "" };
    const acceptNorm = item.accept.map(norm);
    if (acceptNorm.includes(giv)) return { kind: "ok", giv };
    if (acceptNorm.some(a => stripAccents(a) === stripAccents(giv))) return { kind: "warn", giv };
    return { kind: "bad", giv };
  }

  function metaFor(item) {
    if (item.kind === "conj") {
      return `${TENSE_LABEL[item.tense]} of <b><i>${escapeHtml(item.display)}</i></b> for <i>${PERSONS[item.person].label}</i>`;
    }
    if (item.kind === "dop") {
      return `${escapeHtml(item.obj.en)} → <b>${escapeHtml(item.obj.dop)}</b>, ${TENSE_LABEL[item.tense]} of <i>${escapeHtml(item.display)}</i> for <i>${PERSONS[item.person].label}</i>`;
    }
    if (item.kind === "dq") return "question";
    if (item.kind === "gustar") return `${TENSE_LABEL[item.tense]} of <b><i>${escapeHtml(item.inf)}</i></b>`;
    if (item.kind === "pp") {
      return `${TENSE_LABEL[item.tense]} <i>${escapeHtml(item.auxInf)}</i> — also valid: <b><i>${escapeHtml(item.alt)}</i></b>`;
    }
    if (item.kind === "poss") {
      const why = item.copula === "estar" ? "<b>estar</b> — a temporary state/condition"
        : item.copula === "ser" ? "<b>ser</b> — an inherent characteristic"
        : "<b>ser or estar</b> — both accepted here (the meaning shifts slightly)";
      return `${TENSE_LABEL[item.tense]} · ${why}`;
    }
    if (item.kind === "iop") {
      return `${TENSE_LABEL[item.tense]} <i>${escapeHtml(item.inf)}</i> — indirect object <b>${escapeHtml(item.iopEs)}</b>` +
        (item.redundant ? " (the pronoun stays even when the recipient is named)" : "");
    }
    if (item.kind === "dbl") {
      const rule = item.usedSe
        ? `<b>${escapeHtml(item.iopEs)} + ${escapeHtml(item.dopEs)} → se ${escapeHtml(item.dopEs)}</b>`
        : `${escapeHtml(item.iopEs)} + ${escapeHtml(item.dopEs)}`;
      return `${TENSE_LABEL[item.tense]} <i>${escapeHtml(item.inf)}</i> — ${rule}` +
        (item.alt ? ` — also valid: <b><i>${escapeHtml(item.alt)}</i></b>` : "");
    }
    return `${escapeHtml(item.setName)}${item.note ? ` | ${escapeHtml(item.note)}` : ""}`;
  }

  function checkAnswers() {
    if (!currentItems.length) return;
    const inputs = [...document.querySelectorAll(".drill-input")];
    let correct = 0;
    const resultLines = [];

    currentItems.forEach((item, i) => {
      const raw = inputs[i] ? inputs[i].value : "";
      const res = gradeOne(item, raw);
      item._grade = res.kind;
      const mark = res.kind === "ok" ? "✅" : res.kind === "warn" ? "🟨" : "❌";
      const markEl = $("drillMark" + i);
      if (markEl) markEl.textContent = mark;
      if (inputs[i]) {
        inputs[i].classList.remove("gr-ok", "gr-warn", "gr-bad");
        inputs[i].classList.add(res.kind === "ok" ? "gr-ok" : res.kind === "warn" ? "gr-warn" : "gr-bad");
        inputs[i].disabled = true;
      }
      if (res.kind === "ok") {
        correct++;
        streak.cur++;
        if (streak.cur > streak.best) streak.best = streak.cur;
      } else {
        streak.cur = 0;
      }

      // Auto-manage the "got wrong" list for vocab terms.
      if (item.kind === "vocab") item.term.wrong = res.kind !== "ok";

      const meta = metaFor(item);
      if (res.kind === "ok") {
        resultLines.push(`${mark} <i>${escapeHtml(item.correct)}</i> — ${meta}`);
      } else if (res.kind === "warn") {
        resultLines.push(`${mark} <i>${escapeHtml(res.giv)}</i> — accent error. Correct: <i>${escapeHtml(item.correct)}</i> — ${meta}`);
      } else {
        const givTxt = res.giv ? `<i>${escapeHtml(res.giv)}</i>` : "<i>(blank)</i>";
        resultLines.push(`${mark} ${givTxt} — Correct: <i>${escapeHtml(item.correct)}</i> — ${meta}`);
      }
    });

    const total = currentItems.length;
    const header = correct === total
      ? `<div class="drill-summary ok">✅ ${correct}/${total} — Perfect!</div>`
      : `<div class="drill-summary bad">${correct}/${total} correct — ${total - correct} to fix</div>`;
    $("drillResults").innerHTML = header + resultLines.map(l => `<div class="drill-result">${l}</div>`).join("");

    if (currentKind === "vocab") {
      save(); // persist updated "got wrong" flags
      updateFocusUI();
    }

    score.correct += correct;
    score.total += total;
    renderScore();
    renderStreak();

    graded = true;
    const btn = $("drillCheckBtn");
    btn.textContent = "Next round";
    btn.disabled = false;
    btn.focus(); // so pressing Enter again advances to the next round
  }

  // ======================= MODE SELECTION / VISIBILITY =======================
  function activeKind() {
    if ($("vocabDrillMode").checked) return "vocab";
    if ($("possDrillMode").checked) return "poss";
    if ($("iopDrillMode").checked) return "iop";
    if ($("dblDrillMode").checked) return "dbl";
    if ($("ppDrillMode").checked) return "pp";
    if ($("gustarDrillMode").checked) return "gustar";
    if ($("dqDrillMode").checked) return "dq";
    if ($("dopDrillMode").checked) return "dop";
    if ($("drillMode").checked && $("localDrill").checked) return "conj";
    return null;
  }

  function generateRound() {
    if (currentKind === "vocab") generateVocabRound();
    else if (currentKind === "poss") generatePossRound();
    else if (currentKind === "iop") generateIopRound();
    else if (currentKind === "dbl") generateDblRound();
    else if (currentKind === "pp") generatePpRound();
    else if (currentKind === "gustar") generateGustarRound();
    else if (currentKind === "dq") generateDqRound();
    else if (currentKind === "dop") generateDopRound();
    else generateConjRound();
  }

  function updateVisibility() {
    const kind = activeKind();
    $("promptPanel").style.display = kind ? "none" : "";
    $("drillPanel").style.display = kind ? "" : "none";
    // "Needs work" / "got wrong" controls only apply to vocab mode.
    const vocab = kind === "vocab";
    $("drillFlagMissedBtn").style.display = vocab ? "" : "none";
    $("drillClearFocusBtn").style.display = vocab ? "" : "none";
    $("drillClearWrongBtn").style.display = vocab ? "" : "none";
    $("drillOnlyWrongRow").style.display = vocab ? "" : "none";
    if (kind) {
      const titles = {
        vocab: "Local Vocabulary Drill",
        poss: "Local Possessive Drill",
        iop: "Local Indirect Object Pronoun Drill",
        dbl: "Local Indirect + Direct Object Pronoun Drill",
        pp: "Local Direct Object Pronoun Placement Drill",
        gustar: "Local Gustar-Type Drill",
        dq: "Local Question Drill",
        dop: "Local Direct Object Pronoun Drill",
        conj: "Local Conjugation Drill",
      };
      $("drillTitle").textContent = titles[kind];
      currentKind = kind;
      updateFocusUI();
      generateRound();
    }
  }

  $("drillMode").addEventListener("change", updateVisibility);
  $("localDrill").addEventListener("change", updateVisibility);
  $("vocabDrillMode").addEventListener("change", updateVisibility);
  $("dopDrillMode").addEventListener("change", updateVisibility);
  $("dqDrillMode").addEventListener("change", updateVisibility);
  $("gustarDrillMode").addEventListener("change", updateVisibility);
  $("ppDrillMode").addEventListener("change", updateVisibility);
  $("dblDrillMode").addEventListener("change", updateVisibility);
  $("iopDrillMode").addEventListener("change", updateVisibility);
  $("possDrillMode").addEventListener("change", updateVisibility);
  $("drillNextBtn").addEventListener("click", generateRound);
  $("drillResetBtn").addEventListener("click", () => {
    if (currentKind === "vocab") {
      state.sets.forEach(s => s.terms.forEach(t => (t.tally = 0)));
      save();
      render();
    } else if (currentKind === "poss") {
      for (const k in possCounts) delete possCounts[k];
    } else if (currentKind === "iop") {
      for (const k in iopCounts) delete iopCounts[k];
    } else if (currentKind === "dbl") {
      for (const k in dblCounts) delete dblCounts[k];
    } else if (currentKind === "pp") {
      for (const k in ppCounts) delete ppCounts[k];
    } else if (currentKind === "gustar") {
      for (const k in gustarCounts) delete gustarCounts[k];
      for (const k in gustarLikerCounts) delete gustarLikerCounts[k];
    } else if (currentKind === "dq") {
      for (const k in dqCounts) delete dqCounts[k];
    } else if (currentKind === "dop") {
      for (const k in dopCounts) delete dopCounts[k];
    } else {
      for (const k in conjCounts) delete conjCounts[k];
    }
    generateRound();
  });
  $("drillResetScoreBtn").addEventListener("click", () => {
    score.correct = 0;
    score.total = 0;
    streak.cur = 0;
    streak.best = 0;
    renderScore();
    renderStreak();
  });
  $("drillFlagMissedBtn").addEventListener("click", () => {
    if (currentKind !== "vocab" || !graded) return;
    let added = 0;
    currentItems.forEach(it => {
      if (it.kind === "vocab" && it._grade && it._grade !== "ok" && !it.term.focus) {
        it.term.focus = true;
        added++;
      }
    });
    if (added) {
      save();
      render(); // sync sidebar ★ indicators
      // reflect stars on any still-visible rows
      document.querySelectorAll(".drill-star").forEach(btn => {
        const term = currentItems[+btn.dataset.i].term;
        btn.textContent = term.focus ? "★" : "☆";
        btn.classList.toggle("on", term.focus);
      });
      updateFocusUI();
    }
  });
  $("drillClearFocusBtn").addEventListener("click", () => {
    if (!confirm("Clear your entire \"needs work\" list?")) return;
    state.sets.forEach(s => s.terms.forEach(t => { if (t.focus) t.focus = false; }));
    save();
    render(); // sync sidebar ★ indicators
    updateFocusUI();
    if (currentKind === "vocab") {
      document.querySelectorAll(".drill-star").forEach(btn => {
        btn.textContent = "☆";
        btn.classList.remove("on");
      });
      if ($("vocabOnlyFocus").checked) generateRound();
    }
  });
  $("vocabOnlyFocus").addEventListener("change", () => {
    if (currentKind === "vocab") generateRound();
  });
  $("drillClearWrongBtn").addEventListener("click", () => {
    if (!confirm("Clear your entire \"got wrong\" list?")) return;
    state.sets.forEach(s => s.terms.forEach(t => { if (t.wrong) t.wrong = false; }));
    save();
    updateFocusUI();
    if (currentKind === "vocab" && $("vocabOnlyWrong").checked) generateRound();
  });
  $("vocabOnlyWrong").addEventListener("change", () => {
    $("drillOnlyWrongToggle").checked = $("vocabOnlyWrong").checked;
    if (currentKind === "vocab") generateRound();
  });
  $("drillOnlyWrongToggle").addEventListener("change", () => {
    $("vocabOnlyWrong").checked = $("drillOnlyWrongToggle").checked;
    if (currentKind === "vocab") generateRound();
  });
  $("drillForm").addEventListener("submit", e => { e.preventDefault(); if (!graded) checkAnswers(); });
  // Multiple text inputs suppress the form's implicit Enter-submit, so handle Enter directly.
  $("drillForm").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!graded) checkAnswers();
    }
  });
  $("drillCheckBtn").addEventListener("click", e => {
    e.preventDefault();
    if (graded) generateRound();
    else checkAnswers();
  });

  updateVisibility();
})();

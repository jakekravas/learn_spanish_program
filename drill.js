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
    $("focusCount").textContent = f ? `(${f} term${f > 1 ? "s" : ""})` : "(empty)";
    $("wrongCount").textContent = w ? `(${w} term${w > 1 ? "s" : ""})` : "(empty)";
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

  // ======================= DYNAMIC QUESTION MODE =======================
  const dqCounts = {};
  const DQ_VERB_BLOCK = new Set(["poder", "querer", "tener que"]); // awkward with "want to ..."

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

  function parseVerb(term) {
    const es = (term.es || "").trim();
    if (!/^[a-záéíóúñü]+$/i.test(es)) return null; // single-word infinitive only
    if (es.toLowerCase().endsWith("se")) return null; // skip reflexives
    if (DQ_VERB_BLOCK.has(es.toLowerCase())) return null;
    const enBase = (term.en || "").replace(/^to\s+/i, "").split("/")[0].replace(/\(.*/, "").trim();
    if (!enBase) return null;
    return { word: es.toLowerCase(), enBase };
  }

  // Noun templates: `en` uses the shared meta; `es` takes ONE gender variant
  // (so a dual-gender noun accepts either form).
  const NOUN_SING_TPL = [
    { en: m => `Where is the ${m.enNoun}?`, es: v => `¿dónde está ${v.article} ${v.word}?` },
    { en: m => `Do you have the ${m.enNoun}?`, es: v => `¿tienes ${v.article} ${v.word}?` },
    { en: m => `Do you need the ${m.enNoun}?`, es: v => `¿necesitas ${v.article} ${v.word}?` },
  ];
  const NOUN_PLUR_TPL = [
    { en: m => `Where are the ${m.enNoun}?`, es: v => `¿dónde están ${v.article} ${v.word}?` },
    { en: m => `How many ${m.enNoun} are there?`, es: v => `¿${v.gender === "m" ? "cuántos" : "cuántas"} ${v.word} hay?` },
  ];
  const VERB_TPL = [
    { en: v => `When do you want to ${v.enBase}?`, es: v => `¿cuándo quieres ${v.word}?` },
    { en: v => `Where do you want to ${v.enBase}?`, es: v => `¿dónde quieres ${v.word}?` },
    { en: v => `Why do you want to ${v.enBase}?`, es: v => `¿por qué quieres ${v.word}?` },
    { en: v => `When are you going to ${v.enBase}?`, es: v => `¿cuándo vas a ${v.word}?` },
  ];

  // Returns [{ key, prompt, accept:[...] }]
  function dqCombos() {
    const combos = [];
    state.sets.filter(s => s.checked).forEach(s => {
      const terms = s.terms.filter(t => t.checked !== false);
      if (s.name.startsWith("NOUNS")) {
        terms.forEach(t => {
          const n = parseNoun(t);
          if (!n) return;
          const tpls = n.number === "plural" ? NOUN_PLUR_TPL : NOUN_SING_TPL;
          tpls.forEach((tpl, idx) => combos.push({
            key: `n|${n.variants[0].word}|${n.number}|${idx}`,
            prompt: tpl.en(n),
            accept: n.variants.map(v => tpl.es(v)),
          }));
        });
      } else if (s.name.startsWith("VERBS")) {
        terms.forEach(t => {
          const v = parseVerb(t);
          if (!v) return;
          VERB_TPL.forEach((tpl, idx) => combos.push({
            key: `v|${v.word}|${idx}`,
            prompt: tpl.en(v),
            accept: [tpl.es(v)],
          }));
        });
      }
    });
    return combos;
  }

  function generateDqRound() {
    $("drillUnavailable").innerHTML = "";
    const combos = dqCombos();
    if (!combos.length) {
      $("drillStatus").textContent = "Check some NOUNS or VERBS sets to generate questions (nouns need an el/la/los/las article).";
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

    $("drillStatus").textContent = `${combos.length} question(s) in rotation · English → Spanish`;
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
        return `
        <div class="drill-item">
          <span class="drill-num">${i + 1}.</span>
          <span class="drill-prompt">${escapeHtml(it.prompt)}</span>
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
    if ($("dqDrillMode").checked) return "dq";
    if ($("dopDrillMode").checked) return "dop";
    if ($("drillMode").checked && $("localDrill").checked) return "conj";
    return null;
  }

  function generateRound() {
    if (currentKind === "vocab") generateVocabRound();
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
    if (kind) {
      const titles = { vocab: "Local Vocabulary Drill", dq: "Local Question Drill", dop: "Local Object-Pronoun Drill", conj: "Local Conjugation Drill" };
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
  $("drillNextBtn").addEventListener("click", generateRound);
  $("drillResetBtn").addEventListener("click", () => {
    if (currentKind === "vocab") {
      state.sets.forEach(s => s.terms.forEach(t => (t.tally = 0)));
      save();
      render();
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

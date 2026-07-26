const STORE_KEY = "spanishPractice.v1";

// state = { sets: [{name, terms:[{en,es,note?,tally?}], checked, open}] }
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      data.sets.forEach(s => {
        if (s.must === undefined) s.must = false;
        s.terms.forEach(t => {
          if (t.checked === undefined) t.checked = true;
          if (t.must === undefined) t.must = false;
        });
      });
      return data;
    }
  } catch (e) { console.error(e); }
  return {
    sets: DEFAULT_SETS.map(s => ({
      name: s.name,
      checked: false,
      must: false,
      open: false,
      terms: s.terms.map(t => ({ ...t, tally: 0, checked: true, must: false })),
    })),
  };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

// ---------- rendering ----------
const setsContainer = document.getElementById("setsContainer");
const focusSelect = document.getElementById("focusSet");

function render() {
  setsContainer.innerHTML = "";
  state.sets.forEach((set, i) => {
    const div = document.createElement("div");
    div.className = "set" + (set.open ? " open" : "");

    const header = document.createElement("div");
    header.className = "set-header";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.title = "Can be used (include this set)";
    cb.checked = set.checked;
    cb.addEventListener("click", e => e.stopPropagation());
    cb.addEventListener("change", () => {
      set.checked = cb.checked;
      if (!set.checked) set.must = false; // can't require an excluded set
      syncAllCheckbox();
      save();
      render();
    });

    const mustCb = document.createElement("input");
    mustCb.type = "checkbox";
    mustCb.className = "set-must-cb";
    mustCb.title = "Must be used (at least one checked term from this set is required each round)";
    mustCb.checked = set.must;
    mustCb.addEventListener("click", e => e.stopPropagation());
    mustCb.addEventListener("change", () => {
      set.must = mustCb.checked;
      if (set.must) set.checked = true; // a required set must also be eligible
      syncAllCheckbox();
      save();
      render();
    });

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = set.name;

    const count = document.createElement("span");
    count.className = "count";
    const focusN = set.terms.filter(t => t.focus).length;
    count.textContent = set.terms.length + " terms";
    if (focusN) {
      const star = document.createElement("span");
      star.className = "count-focus";
      star.textContent = ` ★${focusN}`;
      star.title = focusN + ' term(s) in your "needs work" list';
      count.appendChild(star);
    }

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "Delete set";
    del.addEventListener("click", e => {
      e.stopPropagation();
      if (confirm(`Delete set "${set.name}"?`)) {
        state.sets.splice(i, 1);
        save();
        render();
      }
    });

    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "▶";

    header.append(cb, mustCb, name, count, del, chev);
    header.addEventListener("click", () => {
      set.open = !set.open;
      save();
      render();
    });

    const body = document.createElement("div");
    body.className = "set-body";

    const termControls = document.createElement("div");
    termControls.className = "term-controls";
    const allBtn = document.createElement("button");
    allBtn.className = "secondary mini";
    allBtn.textContent = "Check all";
    allBtn.addEventListener("click", () => {
      set.terms.forEach(t => (t.checked = true));
      save(); render();
    });
    const noneBtn = document.createElement("button");
    noneBtn.className = "secondary mini";
    noneBtn.textContent = "Uncheck all";
    noneBtn.addEventListener("click", () => {
      set.terms.forEach(t => (t.checked = false, t.must = false));
      save(); render();
    });
    const noMustBtn = document.createElement("button");
    noMustBtn.className = "secondary mini";
    noMustBtn.textContent = "Clear \"must\"";
    noMustBtn.addEventListener("click", () => {
      set.terms.forEach(t => (t.must = false));
      save(); render();
    });
    termControls.append(allBtn, noneBtn, noMustBtn);
    body.appendChild(termControls);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML =
      '<tr><th title="Can be used">Can</th><th title="Must be used">Must</th><th>English</th><th>Spanish</th><th>Note</th><th></th><th title="Needs-work list">★</th></tr>';
    table.appendChild(thead);
    set.terms.forEach(t => {
      const tr = document.createElement("tr");
      if (t.checked === false) tr.className = "term-off";

      const tdCb = document.createElement("td"); tdCb.className = "term-cb";
      const termCb = document.createElement("input");
      termCb.type = "checkbox";
      termCb.title = "Can be used (include in vocabulary list)";
      termCb.checked = t.checked !== false;
      termCb.addEventListener("change", () => {
        t.checked = termCb.checked;
        if (!t.checked) t.must = false; // can't require a term that's excluded
        save(); render();
      });
      tdCb.appendChild(termCb);

      const tdMust = document.createElement("td"); tdMust.className = "term-must";
      const mustCb = document.createElement("input");
      mustCb.type = "checkbox";
      mustCb.title = "Must be used (force into every generated prompt)";
      mustCb.checked = !!t.must;
      mustCb.addEventListener("change", () => {
        t.must = mustCb.checked;
        if (t.must) t.checked = true; // a required term must also be eligible
        save(); render();
      });
      tdMust.appendChild(mustCb);

      const tdEn = document.createElement("td"); tdEn.textContent = t.en;
      const tdEs = document.createElement("td"); tdEs.className = "es"; tdEs.textContent = t.es;
      const tdNote = document.createElement("td"); tdNote.className = "note"; tdNote.textContent = t.note || "";
      const tdTally = document.createElement("td"); tdTally.className = "tally";
      tdTally.textContent = t.tally ? `×${t.tally}` : "";
      tdTally.title = "Times included as a required term";

      const tdFocus = document.createElement("td"); tdFocus.className = "term-focus";
      const starBtn = document.createElement("button");
      starBtn.type = "button";
      starBtn.className = "focus-star" + (t.focus ? " on" : "");
      starBtn.textContent = t.focus ? "★" : "☆";
      starBtn.title = "Add/remove from \"needs work\" list";
      starBtn.addEventListener("click", () => {
        t.focus = !t.focus;
        save(); render();
      });
      tdFocus.appendChild(starBtn);

      tr.append(tdCb, tdMust, tdEn, tdEs, tdNote, tdTally, tdFocus);
      table.appendChild(tr);
    });
    body.appendChild(table);

    div.append(header, body);
    setsContainer.appendChild(div);
  });

  // focus dropdown
  const prev = focusSelect.value;
  focusSelect.innerHTML = '<option value="">— none —</option>';
  state.sets.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    focusSelect.appendChild(opt);
  });
  if ([...focusSelect.options].some(o => o.value === prev)) focusSelect.value = prev;

  syncAllCheckbox();
}

const allSetsCb = document.getElementById("allSets");
function syncAllCheckbox() {
  allSetsCb.checked = state.sets.length > 0 && state.sets.every(s => s.checked);
}
allSetsCb.addEventListener("change", () => {
  state.sets.forEach(s => (s.checked = allSetsCb.checked));
  save();
  render();
});

document.getElementById("expandAll").addEventListener("click", () => {
  state.sets.forEach(s => (s.open = true)); save(); render();
});
document.getElementById("collapseAll").addEventListener("click", () => {
  state.sets.forEach(s => (s.open = false)); save(); render();
});

// ---------- add set ----------
function parseTerms(text) {
  const terms = [];
  for (let line of text.split("\n")) {
    line = line.trim().replace(/^​+/, "");
    if (!line) continue;
    // split on tab first, then en/em dash, then " - " (spaced hyphen only,
    // so hyphenated words like "Twenty-one" survive)
    let parts;
    if (line.includes("\t")) parts = line.split("\t");
    else if (/[–—]/.test(line)) parts = line.split(/[–—]/);
    else if (line.includes(" - ")) parts = line.split(" - ");
    else continue;
    parts = parts.map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    terms.push({ en: parts[0], es: parts.slice(1).join(" — "), tally: 0, checked: true });
  }
  return terms;
}

document.getElementById("addBtn").addEventListener("click", () => {
  const name = document.getElementById("addName").value.trim();
  const text = document.getElementById("addTerms").value;
  const flash = document.getElementById("addFlash");
  if (!name) { flash.textContent = "Give the set a name."; return; }
  const terms = parseTerms(text);
  if (!terms.length) { flash.textContent = "Couldn't parse any terms — check the format."; return; }
  state.sets.push({ name, checked: true, must: false, open: false, terms });
  save();
  render();
  document.getElementById("addName").value = "";
  document.getElementById("addTerms").value = "";
  flash.textContent = `Added "${name}" with ${terms.length} terms ✓`;
  setTimeout(() => (flash.textContent = ""), 4000);
});

// ---------- prompt generation ----------
function pickLeastUsed(terms, n) {
  // sort by tally asc with random tiebreak, take n
  return [...terms]
    .map(t => ({ t, r: Math.random() }))
    .sort((a, b) => (a.t.tally || 0) - (b.t.tally || 0) || a.r - b.r)
    .slice(0, n)
    .map(x => x.t);
}

function buildPrompt() {
  const checkedSets = state.sets.filter(s => s.checked);
  if (!checkedSets.length) return null;

  const direction = document.querySelector('input[name="direction"]:checked').value;
  const drillMode = document.getElementById("drillMode").checked;
  const drillPerMustVerb = document.getElementById("drillPerMustVerb").checked;
  const drillShuffle = document.getElementById("drillShuffle").checked;
  const tenses = [...document.querySelectorAll("#tenseRow input.can-cb:checked")].map(i => i.value);
  const mustTenses = [...document.querySelectorAll("#tenseRow input.must-cb:checked")].map(i => i.value);
  const persons = [...document.querySelectorAll("#personRow input.can-cb:checked")].map(i => i.value);
  const mustPersons = [...document.querySelectorAll("#personRow input.must-cb:checked")].map(i => i.value);
  const grammarReqs = [...document.querySelectorAll("#grammarRow input:checked")].map(i => i.value);
  const regularOnly = document.getElementById("regularOnly").checked;
  const focus = focusSelect.value;
  const useSampling = document.getElementById("useSampling").checked;
  const sampleCount = Math.max(2, Math.min(15, +document.getElementById("sampleCount").value || 6));
  const numSentencesVal = document.getElementById("numSentences").value;
  const numSentences = numSentencesVal === "random"
    ? Math.floor(Math.random() * 5) + 1
    : Math.max(1, Math.min(5, +numSentencesVal || 1));

  const activeSets = checkedSets
    .map(s => ({ ...s, terms: s.terms.filter(t => t.checked !== false) }))
    .filter(s => s.terms.length);
  if (!activeSets.length) return null;

  // In drill mode, only VERBS sets supply the tally/required-term pool (subjects
  // are drawn from persons + NOUNS sets, but aren't tracked/required themselves).
  const verbSets = activeSets.filter(s => s.name.startsWith("VERBS"));
  const nounSets = activeSets.filter(s => s.name.startsWith("NOUNS"));
  if (drillMode && !verbSets.length) return null;

  const tallySets = drillMode ? verbSets : activeSets;
  const mustSets = tallySets.filter(s => s.must);

  const pool = tallySets.flatMap(s => s.terms);
  const mustTerms = pool.filter(t => t.must);

  let sampledTerms = [];
  if (useSampling) {
    const samplePool = pool.filter(t => !t.must);
    sampledTerms = pickLeastUsed(samplePool, Math.min(sampleCount, samplePool.length));
  }

  const requiredTerms = [...mustTerms, ...sampledTerms];
  if (requiredTerms.length) {
    requiredTerms.forEach(t => (t.tally = (t.tally || 0) + 1));
    save();
    render();
  }

  const isEnToEs = direction === "en-to-es";
  const srcLang = isEnToEs ? "English" : "Spanish";
  const dstLang = isEnToEs ? "Spanish" : "English";

  // A "must" tense/person is implicitly allowed even if its Can box is unchecked.
  const allowedTenses = [...new Set([...tenses, ...mustTenses])];
  const allowedPersons = [...new Set([...persons, ...mustPersons])];

  const tenseText = allowedTenses.length ? allowedTenses.join(", ") : "present tense";
  const personText = allowedPersons.length ? allowedPersons.join(", ") : "any";

  const lines = [];
  const rules = [];

  if (drillMode) {
    // Per-must-verb mode: exactly one drill item for each must-checked verb.
    const perVerbMode = drillPerMustVerb && mustTerms.length > 0;
    const drillCount = perVerbMode ? mustTerms.length : numSentences;

    if (perVerbMode && drillShuffle) {
      // Shuffle in place so the listed order (and thus the AI's likely output order) varies each time.
      for (let i = mustTerms.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mustTerms[i], mustTerms[j]] = [mustTerms[j], mustTerms[i]];
      }
    }

    lines.push(
      `I'm learning Spanish and drilling verb conjugations. Below is my known vocabulary (verbs, plus nouns/pronouns usable as subjects). For each drill, give me ONLY a subject + verb in ${srcLang} — e.g. "she walks" or "the boyfriend arrived" — NOT a full sentence. I will reply with just the correctly conjugated Spanish verb (I may include the subject pronoun/noun or leave it implied), and you tell me if I'm right or wrong. I will copy and paste this text for each prompt.`
    );
    lines.push("");
    lines.push("STRICT RULES:");
    rules.push(`Give ONLY a subject + verb per item, in ${srcLang} — never a full sentence, never extra words, never an object.`);
    rules.push(`The verb in each item MUST come from the VERB vocabulary below. Do not use any verb not listed there.`);
    rules.push(`The subject of each item must be either one of these persons: ${personText} — OR a noun from the NOUN vocabulary below (used in place of a pronoun, e.g. "the boyfriend", "the girls"). Mix pronoun subjects and noun subjects across the round instead of only using pronouns.`);
    if (mustPersons.length) rules.push(`REQUIRED persons — at least one item this round MUST use EACH of these subjects: ${mustPersons.join(", ")}.`);
    rules.push(`Tense(s) allowed: ${tenseText}. Do not use any other tense.`);
    if (mustTenses.length) rules.push(`REQUIRED tenses — at least one item this round MUST use EACH of these tenses: ${mustTenses.join(", ")}.`);
    if (regularOnly) rules.push("Use ONLY regular verbs — I have not learned irregular conjugations in these tenses yet.");
    rules.push("Before showing me each item, silently verify the verb is in my list and the tense/subject rules are followed. If anything fails the check, rewrite it before showing it. Do not show me your check.");
    rules.push("No hints or tips unless I answer incorrectly.");
    rules.push("When grading my answer, start your reply with ✅ if I got it right, or ❌ if I got it wrong (before any explanation or correction).");
    rules.push('If something is very clearly an accidental typo, do not hold that against me as to whether I got it right. You can still point it out as a correction though.');
    if (perVerbMode) {
      rules.push(`Give me EXACTLY ${drillCount} drill item${drillCount > 1 ? "s" : ""} at a time as a numbered list — ONE item for EACH of the required verbs listed below (one distinct required verb per item, no repeats, no other verbs). Then wait for my ${drillCount > 1 ? "answers" : "answer"} (also as a numbered list).`);
      rules.push(drillShuffle
        ? "Present the items in a RANDOM order — do NOT use the order the required verbs are listed in below."
        : "Present the items in the SAME order the required verbs are listed in below.");
    } else {
      rules.push(`Give me ${drillCount} drill item${drillCount > 1 ? "s" : ""} at a time as a numbered list, then wait for my ${drillCount > 1 ? "answers" : "answer"} (also as a numbered list).`);
    }
    rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

    if (requiredTerms.length) {
      lines.push("");
      lines.push(perVerbMode
        ? "REQUIRED VERBS FOR THIS ROUND (give exactly one drill item for EACH of these — one per item):"
        : "REQUIRED VERBS FOR THIS ROUND (every one of these MUST appear somewhere in your drill items):");
      mustTerms.forEach(t => lines.push(`- ${t.en} (${t.es}) [always required]`));
      sampledTerms.forEach(t => lines.push(`- ${t.en} (${t.es}) [least-practiced pick]`));
    }

    if (mustSets.length) {
      lines.push("");
      lines.push("REQUIRED VERB SETS FOR THIS ROUND (use AT LEAST ONE verb from each of these sets — your choice which one):");
      mustSets.forEach(s => lines.push(`- ${s.name}`));
    }

    lines.push("");
    lines.push("MY VERB VOCABULARY:");
    verbSets.forEach(s => {
      lines.push("");
      lines.push(`## ${s.name}`);
      s.terms.forEach(t => lines.push(`${t.en} – ${t.es}${t.note ? ` | ${t.note}` : ""}`));
    });

    if (nounSets.length) {
      lines.push("");
      lines.push("MY NOUN VOCABULARY (usable as subjects instead of a pronoun):");
      nounSets.forEach(s => {
        lines.push("");
        lines.push(`## ${s.name}`);
        s.terms.forEach(t => lines.push(`${t.en} – ${t.es}${t.note ? ` | ${t.note}` : ""}`));
      });
    }

    lines.push("");
    lines.push("Give the first drill items now.");
    return lines.join("\n");
  }

  lines.push(
    `I'm learning Spanish and practicing by translating ${srcLang} sentences into ${dstLang}. Below is the COMPLETE list of Spanish vocabulary I know, organized by set. You will give me ${srcLang} sentences to translate; I'll reply with my ${dstLang} attempt, and you tell me if I'm right or wrong (and correct me if wrong). I will copy and paste this text for each prompt. Just to make sure the correct vocab terms aren't forgotten.`
  );
  lines.push("");
  lines.push("STRICT RULES:");
  rules.push(`Every content word (nouns, verbs, adjectives, adverbs) in your sentences MUST come from the vocabulary list below. Basic connectors/articles/prepositions (el/la/un/y/o/pero/en/a/de/con) are allowed. Give the practice sentences in ${srcLang}${isEnToEs ? "" : " (correctly conjugated)"}; I will translate them to ${dstLang}.`);
  rules.push(`Tense(s) allowed: ${tenseText}. Do not use any other tense.`);
  if (mustTenses.length) rules.push(`REQUIRED tenses — at least one sentence this round MUST use EACH of these tenses: ${mustTenses.join(", ")}.`);
  rules.push(`Subject(s)/person(s) allowed: ${personText}. Only conjugate verbs for these subjects.`);
  if (mustPersons.length) rules.push(`REQUIRED persons — at least one sentence this round MUST use EACH of these subjects: ${mustPersons.join(", ")}.`);
  if (regularOnly) rules.push("Use ONLY regular verbs — I have not learned irregular conjugations in these tenses yet.");
  if (grammarReqs.length) {
    rules.push("This round MUST satisfy ALL of these grammar requirements (across the set of sentences you give me):\n" + grammarReqs.map(r => `   - ${r}`).join("\n"));
  }
  rules.push("Before showing me each sentence, silently verify that every content word appears in my list, and that the tense and subject rules are followed. If anything fails the check, rewrite the sentence before showing it. Do not show me your check.");
  rules.push("No hints or tips unless I answer incorrectly.");
  rules.push("When grading my answer, start your reply with ✅ if I got it right, or ❌ if I got it wrong (before any explanation or correction).");
  rules.push('If something is very clearly an accidental typo (example: if I write "el gkimnasio" instead of "el gimnasio") then do not hold that against me as to whether the sentence is right or wrong. You can still point it out as a correction though.');
  rules.push('If you accidentally include a term that is NOT on my list, do not hold it against me as long as I translate it correctly. But please try NOT to include terms that are not on my list.');
  rules.push(`Give me ${numSentences} sentence${numSentences > 1 ? "s" : ""} at a time, then wait for my translation${numSentences > 1 ? "s" : ""}.`);
  if (numSentences > 1) rules.push(`The ${numSentences} sentences should be related to each other — a small connected scene or story that flows logically, NOT random unrelated sentences. Write them as normal running prose in a single paragraph (sentences one after another separated by spaces), NOT as a numbered/bulleted list or on separate lines.`);
  if (focus) rules.push(`Emphasize vocabulary from the "${focus}" set — that's what I'm currently learning.`);
  rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

  if (requiredTerms.length) {
    lines.push("");
    lines.push("REQUIRED TERMS FOR THIS ROUND (every one of these MUST appear somewhere in your sentences):");
    mustTerms.forEach(t => lines.push(`- ${t.en} (${t.es}) [always required]`));
    sampledTerms.forEach(t => lines.push(`- ${t.en} (${t.es}) [least-practiced pick]`));
  }

  if (mustSets.length) {
    lines.push("");
    lines.push("REQUIRED SETS FOR THIS ROUND (use AT LEAST ONE term from each of these sets somewhere in your sentences — your choice which term):");
    mustSets.forEach(s => lines.push(`- ${s.name}`));
  }

  lines.push("");
  lines.push("MY VOCABULARY:");
  activeSets.forEach(s => {
    lines.push("");
    lines.push(`## ${s.name}`);
    s.terms.forEach(t => {
      lines.push(`${t.en} – ${t.es}${t.note ? ` | ${t.note}` : ""}`);
    });
  });

  lines.push("");
  lines.push("Construct a sentence now.");
  lines.push("(Another reminder: ONLY USE TERMS THAT ARE ON THE ATTACHED VOCAB LIST.)");
  return lines.join("\n");
}

const promptOut = document.getElementById("promptOut");

document.getElementById("genBtn").addEventListener("click", () => {
  const p = buildPrompt();
  const drillMode = document.getElementById("drillMode").checked;
  promptOut.value =
    p ||
    (drillMode
      ? "⚠ Check at least one VERBS set (with at least one term enabled) for drill mode."
      : "⚠ Check at least one set with at least one term enabled.");
});

document.getElementById("copyBtn").addEventListener("click", async () => {
  if (!promptOut.value) return;
  await navigator.clipboard.writeText(promptOut.value);
  const flash = document.getElementById("copyFlash");
  flash.textContent = "Copied ✓";
  setTimeout(() => (flash.textContent = ""), 2000);
});

document.getElementById("resetTallies").addEventListener("click", () => {
  state.sets.forEach(s => s.terms.forEach(t => (t.tally = 0)));
  save();
  render();
});

// ---------- import / export ----------
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spanish-practice-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importBtn").addEventListener("click", () =>
  document.getElementById("importFile").click()
);
document.getElementById("importFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.sets || !Array.isArray(data.sets)) throw new Error("bad format");
      state = data;
      save();
      render();
    } catch {
      alert("Couldn't import that file — it doesn't look like an export from this app.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

function syncDrillModeUI() {
  const on = document.getElementById("drillMode").checked;
  const vocabOn = document.getElementById("vocabDrillMode").checked;
  const dopOn = document.getElementById("dopDrillMode").checked;
  const dqOn = document.getElementById("dqDrillMode").checked;
  const anyLocal = on || vocabOn || dopOn || dqOn;
  document.getElementById("grammarGroup").classList.toggle("opt-disabled", anyLocal);
  document.getElementById("focusGroup").classList.toggle("opt-disabled", anyLocal);
  document.getElementById("drillPerVerbRow").classList.toggle("opt-disabled", !on);
  document.getElementById("drillShuffleRow").classList.toggle("opt-disabled", !anyLocal);
  document.getElementById("localDrillRow").classList.toggle("opt-disabled", !on);
}
document.getElementById("drillMode").addEventListener("change", syncDrillModeUI);
document.getElementById("drillPerMustVerb").addEventListener("change", syncDrillModeUI);
document.getElementById("vocabDrillMode").addEventListener("change", syncDrillModeUI);
document.getElementById("dopDrillMode").addEventListener("change", syncDrillModeUI);
document.getElementById("dqDrillMode").addEventListener("change", syncDrillModeUI);
syncDrillModeUI();

// Keep Can/Must consistent in the tense & person grids:
// checking Must implies Can; unchecking Can clears Must.
["tenseRow", "personRow"].forEach(rowId => {
  const row = document.getElementById(rowId);
  const canCbs = [...row.querySelectorAll("input.can-cb")];
  const mustCbs = [...row.querySelectorAll("input.must-cb")];
  canCbs.forEach((canCb, i) => {
    const mustCb = mustCbs[i];
    mustCb.addEventListener("change", () => {
      if (mustCb.checked) canCb.checked = true;
    });
    canCb.addEventListener("change", () => {
      if (!canCb.checked) mustCb.checked = false;
    });
  });
});

render();

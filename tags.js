// Tag engine. Most tags are DERIVED at runtime from data we already have
// (set name, article, infinitive shape, conjugator knowledge) so they never
// drift out of sync and need no data entry. A term may also carry an authored
// `tags: [...]` array for semantic labels the app can't infer (topic:exercise).
//
// Tags are flat strings using a "group:value" convention so the UI can bucket
// them into sections without a rigid hierarchy.
(function (global) {
  const GROUP_ORDER = ["pos", "type", "gender", "number", "ending", "conj", "form", "topic", "list", "set"];
  const GROUP_LABEL = {
    pos: "Part of speech",
    type: "Kind",
    gender: "Gender",
    number: "Number",
    ending: "Verb ending",
    conj: "Conjugation pattern",
    form: "Verb form",
    topic: "Topic",
    list: "My lists",
    set: "Other",
  };

  function articleInfo(es) {
    // Handles "El enfermero / La enfermera" and plain "los ojos".
    const alts = (es || "").split("/").map(s => s.trim()).filter(Boolean);
    const genders = new Set(), numbers = new Set();
    alts.forEach(alt => {
      const m = alt.match(/^(el|la|los|las)\s+/i);
      if (!m) return;
      const art = m[1].toLowerCase();
      genders.add(art === "el" || art === "los" ? "masculine" : "feminine");
      numbers.add(art === "los" || art === "las" ? "plural" : "singular");
    });
    return { genders: [...genders], numbers: [...numbers] };
  }

  function derive(term, set) {
    const tags = [];
    const name = set.name || "";
    const es = (term.es || "").trim();
    const en = (term.en || "").trim();

    // --- part of speech, from the set name (or an English "To ..." fallback)
    let pos = null;
    if (/^NOUNS/i.test(name)) pos = "noun";
    else if (/^VERBS/i.test(name)) pos = "verb";
    else if (/^ADJECTIVES/i.test(name)) pos = "adjective";
    else if (/^to\s/i.test(en)) pos = "verb";
    if (pos) tags.push("pos:" + pos);

    // --- kind, from the set name
    if (/body\s*part/i.test(name)) tags.push("type:body part");
    else if (/place/i.test(name)) tags.push("type:place");
    else if (/people|family/i.test(name)) tags.push("type:person");
    if (/color/i.test(name)) tags.push("topic:color");
    if (/feeling/i.test(name)) tags.push("topic:feeling");
    if (/time words/i.test(name)) tags.push("topic:time");
    if (/number/i.test(name)) tags.push("topic:numbers");
    if (/question/i.test(name)) tags.push("topic:questions");
    if (/connecting/i.test(name)) tags.push("topic:connectors");

    // --- gender & number, from the article
    if (pos === "noun") {
      const { genders, numbers } = articleInfo(es);
      if (genders.length === 1) tags.push("gender:" + genders[0]);
      else if (genders.length > 1) tags.push("gender:either");
      numbers.forEach(n => tags.push("number:" + n));
    }

    // --- verb shape, straight from the conjugator
    if (pos === "verb" && global.Conjugator) {
      const inf = es.split("/")[0].trim().toLowerCase();
      const p = /^[a-záéíóúñü]+$/i.test(inf) ? global.Conjugator.pattern(inf) : null;
      if (p) {
        tags.push("ending:" + p.ending);
        if (p.reflexive) tags.push("form:reflexive");
        if (p.known) {
          tags.push("conj:present " + p.present);
          tags.push("conj:preterite " + p.preterite);
          if (p.present === "regular" && p.preterite === "regular") tags.push("conj:fully regular");
        }
        if (global.Conjugator.canTakeObject(inf)) tags.push("form:transitive");
      }
    }

    // --- personal lists
    if (term.focus) tags.push("list:needs work");
    if (term.wrong) tags.push("list:got wrong");

    // --- authored tags (optional, from data.js or added later)
    (term.tags || []).forEach(t => {
      tags.push(t.includes(":") ? t : "topic:" + t);
    });

    return [...new Set(tags)];
  }

  // Map of tag -> { tag, group, value, entries:[{term,set}] }
  function buildIndex(sets) {
    const index = new Map();
    sets.forEach(set => {
      (set.terms || []).forEach(term => {
        derive(term, set).forEach(tag => {
          if (!index.has(tag)) {
            const i = tag.indexOf(":");
            index.set(tag, { tag, group: tag.slice(0, i), value: tag.slice(i + 1), entries: [] });
          }
          index.get(tag).entries.push({ term, set });
        });
      });
    });
    return index;
  }

  // Groups, ordered, each with its tags sorted by value.
  function grouped(index) {
    const byGroup = new Map();
    index.forEach(t => {
      if (!byGroup.has(t.group)) byGroup.set(t.group, []);
      byGroup.get(t.group).push(t);
    });
    const order = [...GROUP_ORDER, ...[...byGroup.keys()].filter(g => !GROUP_ORDER.includes(g))];
    return order
      .filter(g => byGroup.has(g))
      .map(g => ({
        group: g,
        label: GROUP_LABEL[g] || g,
        tags: byGroup.get(g).sort((a, b) => a.value.localeCompare(b.value)),
      }));
  }

  global.Tags = { derive, buildIndex, grouped };
})(window);

(function () {
  'use strict';

  var CATS = window.CATEGORIES || {};
  var LIST = window.ARTICLES || [];
  var CAT_KEYS = Object.keys(CATS);
  var SEQ = ['var(--navy)', 'var(--gold)', 'var(--crimson)'];
  var app = document.getElementById('app');
  var nav = document.getElementById('nav');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Display order: grouped by category, in the order the categories are declared.
  var ORDER = CAT_KEYS.flatMap(function (k) { return LIST.filter(function (a) { return a.category === k; }); });
  var BY_ID = {};
  ORDER.forEach(function (a) { BY_ID[a.id] = a; });

  // The blog uses Western digits (1 2 3) everywhere, by the author's choice.
  function ar(v) { return String(v); }

  // Arabic counting: 1, 2, 3–10, 11+
  function count(n, forms) {
    if (n === 1) return forms[0];
    if (n === 2) return forms[1];
    return ar(n) + ' ' + (n <= 10 ? forms[2] : forms[3]);
  }
  var MINUTES = ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة'];
  var ARTICLES_N = ['مقال واحد', 'مقالان', 'مقالات', 'مقالاً'];

  function textOf(x) {
    if (x == null) return '';
    if (typeof x === 'string') return x;
    if (Array.isArray(x)) return x.map(textOf).join(' ');
    if (typeof x === 'object') return Object.keys(x).map(function (k) { return textOf(x[k]); }).join(' ');
    return '';
  }
  function wordCount(x) {
    return textOf(x).replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  }
  function readTime(a) { return Math.max(1, Math.round(wordCount([a.claim, a.sections]) / 160)); }

  var dateFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });
  function fmtDate(iso) {
    var d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : dateFmt.format(d);
  }

  function accented(title, word) {
    var i = word ? title.lastIndexOf(word) : -1;
    if (i < 0) return title;
    return title.slice(0, i) + '<span class="accent">' + word + '</span>' + title.slice(i + word.length);
  }
  function catOf(a) { return CATS[a.category] || { name: '', color: 'ink' }; }
  function catColor(key) { return 'var(--' + ((CATS[key] || {}).color || 'ink') + ')'; }
  function meta(a) { return fmtDate(a.date) + ' · مدة القراءة: ' + count(readTime(a), MINUTES); }

  function pageFoot(inner) { return '<footer class="page-foot">جدليات · ' + inner + '</footer>'; }

  /* ── Navigation ──────────────────────────────────────────────── */
  function renderNav(active) {
    var items = [['home', '#/', 'الرئيسية']]
      .concat(CAT_KEYS.map(function (k) { return [k, '#/c/' + k, CATS[k].name]; }))
      .concat([['about', '#/about', 'عن المدوّنة']]);
    nav.innerHTML = items.map(function (it) {
      return '<a href="' + it[1] + '"' + (it[0] === active ? ' aria-current="page"' : '') + '>' + it[2] + '</a>';
    }).join('');
  }

  /* ── Home / category ─────────────────────────────────────────── */
  // The three most recent articles get a "جديد" badge on the index.
  var NEWEST = LIST.slice().map(function (a, i) { return { a: a, i: i }; })
    .sort(function (x, y) { return x.a.date < y.a.date ? 1 : x.a.date > y.a.date ? -1 : y.i - x.i; })
    .slice(0, 3).map(function (x) { return x.a.id; });

  function row(a, n) {
    var hay = (a.title + ' ' + a.excerpt + ' ' + catOf(a).name).replace(/<[^>]*>/g, ' ').replace(/"/g, '');
    return '<a class="row" href="#/a/' + a.id + '" data-text="' + hay + '">' +
      '<span class="n">' + ar(n) + '</span>' +
      '<span class="t">' + a.title + (NEWEST.indexOf(a.id) >= 0 ? ' <span class="new">جديد</span>' : '') + '</span>' +
      '<span class="star" aria-hidden="true">✻</span>' +
      '<span class="x"><span class="ex">' + a.excerpt + '</span><small>' + meta(a) + '</small></span>' +
    '</a>';
  }

  function renderHome(cat) {
    var c = cat ? CATS[cat] : null;
    var items = cat ? ORDER.filter(function (a) { return a.category === cat; }) : ORDER;
    var title = c ? accented(c.name, c.name.split(' ').pop()) : 'جدليّاتُ <span class="accent">العقل</span>';
    var lede = c ? c.desc : 'مدوّنة <b>نقدية</b> بالعربية · قراءاتٌ في الحجج التي يُستدَل بها على صحة الدين — بالدليل لا بالتسليم';
    var stampNoun = count(items.length, ARTICLES_N).replace(/^[0-9]+ /, '');
    if (items.length <= 2) stampNoun = items.length === 1 ? 'مقال' : 'مقالان';

    var html =
      '<section class="hero">' +
        '<div><h1 class="display">' + title + '</h1><p class="lede">' + lede + '</p></div>' +
        '<div class="stamp" role="img" aria-label="' + count(items.length, ARTICLES_N) + '">' +
          '<b>' + ar(items.length) + '</b><span>' + stampNoun + '</span><span>العدد الأول</span>' +
        '</div>' +
      '</section>' +
      '<nav class="legend" aria-label="الأقسام">' +
        '<a href="#/" style="--c:var(--ink)"' + (!cat ? ' aria-current="page"' : '') + '>جميع المقالات</a>' +
        CAT_KEYS.map(function (k) {
          return '<a href="#/c/' + k + '" style="--c:' + catColor(k) + '"' + (k === cat ? ' aria-current="page"' : '') + '>' + CATS[k].name + '</a>';
        }).join('') +
      '</nav>';

    var f = !cat && (ORDER.filter(function (a) { return a.featured; })[0] || ORDER[0]);
    if (f) {
      html +=
        '<a class="feature" href="#/a/' + f.id + '">' +
          '<span class="tag">المقال المختار</span>' +
          '<span>' +
            '<span class="feature-title">' + accented(f.title, f.accent) + '</span>' +
            '<span class="feature-ex">' + f.excerpt + '</span>' +
            '<span class="feature-meta"><span>' + catOf(f).name + '</span><span>' + meta(f) + '</span><span class="more">اقرأ المقال ←</span></span>' +
          '</span>' +
        '</a>';
    }

    var n = 0;
    var groups = CAT_KEYS.filter(function (k) { return !cat || k === cat; }).map(function (k) {
      var arts = items.filter(function (a) { return a.category === k; });
      if (!arts.length) return '';
      return '<div class="group" style="--c:' + catColor(k) + '">' + arts.map(function (a) { return row(a, ++n); }).join('') + '</div>';
    }).join('');

    html +=
      '<div class="sec-head"><h2>فهرس المقالات</h2><span class="line"></span><span class="boxed">' + count(items.length, ARTICLES_N) + '</span></div>' +
      (items.length > 3 ? '<div class="search"><input type="search" id="find" placeholder="ابحث في العناوين والملخّصات…" aria-label="ابحث في المقالات" autocomplete="off"></div>' : '') +
      (groups || '<p class="empty">لا توجد مقالات في هذا القسم بعد.</p>') +
      '<p class="empty" id="no-hits" hidden>لا يوجد مقال يطابق بحثك.</p>' +
      '<div class="foot-notes"><p><b>منهج المدوّنة:</b> نناقش الحجج لا الأشخاص · <b>المصادر:</b> مذكورة في آخر كل مقال · <b>الألوان:</b> يدل لون الخط الجانبي على القسم</p></div>' +
      pageFoot('<b>الفهرس</b>');
    return html;
  }

  /* ── Article ─────────────────────────────────────────────────── */
  function block(b) {
    if (typeof b === 'string') return '<p>' + b + '</p>';
    if (b.list) return '<ul class="dl">' + b.list.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
    if (b.compare) {
      return '<div class="pair">' + b.compare.map(function (c) {
        return '<fieldset><legend>' + c.title + '</legend>' + (c.head ? '<div class="head">' + c.head + '</div>' : '') + '<p>' + c.text + '</p></fieldset>';
      }).join('') + '</div>';
    }
    if (b.steps) {
      return '<ol class="premises">' + b.steps.map(function (s, i) {
        return '<li style="--c:' + SEQ[i % SEQ.length] + '"><small>' + s.label + '</small>' + s.text + '</li>';
      }).join('') + '</ol>';
    }
    if (b.fallacy) {
      return '<div class="fallacy"><div class="fallacy-head"><span class="tag tag-red">مغالطة</span><strong>' + b.fallacy + '</strong>' +
        (b.en ? '<small dir="ltr">' + b.en + '</small>' : '') + '</div><p>' + b.text + '</p>' +
        (b.example ? '<p class="eg"><span>مثال من الحياة اليومية</span>' + b.example + '</p>' : '') + '</div>';
    }
    if (b.timeline) {
      return '<ol class="timeline">' + b.timeline.map(function (t) {
        return '<li><span class="when">' + t.when + '</span><div><b>' + t.who + '</b> ' + t.text + '</div></li>';
      }).join('') + '</ol>';
    }
    if (b.table) {
      return '<div class="tbl"><table><thead><tr>' + b.table.head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
        '</tr></thead><tbody>' + b.table.rows.map(function (r) {
          return '<tr>' + r.map(function (c, i) { return '<td data-label="' + b.table.head[i] + '">' + c + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (b.cards) {
      return '<div class="cards">' + b.cards.map(function (c, i) {
        return '<div class="card" style="--c:' + SEQ[i % SEQ.length] + '"><small>' + c.meta + '</small><b>' + c.title + '</b><p>' + c.text + '</p></div>';
      }).join('') + '</div>';
    }
    if (b.exhibits) {
      return '<div class="exhibits">' + b.exhibits.map(function (e, i) {
        return '<div class="exhibit"><span class="ex-no">الدليل ' + ar(i + 1) + '</span><b>' + e.name + '</b>' +
          '<dl><dt>المكان</dt><dd>' + e.where + '</dd><dt>التاريخ</dt><dd>' + e.when + '</dd></dl><p>' + e.text + '</p></div>';
      }).join('') + '</div>';
    }
    if (b.debate) {
      return '<div class="debate">' + b.debate.map(function (d, i) {
        return '<div class="round"><div class="obj"><span>اعتراض ' + ar(i + 1) + (d.who ? ' · ' + d.who : '') + '</span><p>' + d.q + '</p></div>' +
          '<div class="rep"><span>الجواب</span><p>' + d.a + '</p></div></div>';
      }).join('') + '</div>';
    }
    if (b.quote) return '<blockquote class="quote">' + b.quote + (b.cite ? '<cite>' + b.cite + '</cite>' : '') + '</blockquote>';
    if (b.note) return '<div class="note"><span class="tag">' + (b.label || 'منهجية') + '</span><p>' + b.note + '</p></div>';
    if (b.conclusion) return '<div class="wash"><span class="lbl">' + (b.label || 'الخلاصة') + '</span>' + b.conclusion + '</div>';
    return '';
  }

  var SECTIONS = ['محور واحد', 'محوران', 'محاور', 'محوراً'];

  // Numbered list of section titles with each section's reading time; reused in the floating panel.
  function tocList(a) {
    return '<ol class="toc-list">' + a.sections.map(function (s, i) {
      var mins = Math.max(1, Math.round(wordCount(s) / 160));
      return '<li><button type="button" data-jump="s' + (i + 1) + '" style="--c:' + SEQ[i % SEQ.length] + '">' +
        '<span class="tn">' + ar(i + 1) + '</span><span class="tt">' + s.title + '</span><small>' + ar(mins) + ' د</small></button></li>';
    }).join('') + '</ol>';
  }

  function renderArticle(a) {
    var idx = ORDER.indexOf(a);
    var prev = ORDER[idx - 1], next = ORDER[idx + 1];
    var c = catOf(a);
    var fallacies = [];
    a.sections.forEach(function (s) {
      s.blocks.forEach(function (b) {
        if (b && b.fallacy && fallacies.indexOf(b.fallacy) < 0) fallacies.push(b.fallacy);
      });
    });

    var html =
      '<article>' +
        '<header class="sec-head art-head"><h1>' + accented(a.title, a.accent) + '</h1><span class="line"></span>' +
          '<a class="boxed" href="#/c/' + a.category + '">' + c.name + '</a></header>' +
        '<p class="art-sub">' + a.subtitle + '</p>' +
        '<p class="art-meta">' + meta(a) + '</p>' +
        '<nav class="toc" aria-label="فهرس المقال">' +
          '<div class="toc-head"><span class="tag">فهرس المقال</span><small>' + count(a.sections.length, SECTIONS) + ' · ' + count(readTime(a), MINUTES) + '</small></div>' +
          tocList(a) +
        '</nav>' +
        (a.claim ? '<fieldset class="claim"><legend>' + (a.claimLabel || 'الحجة كما يطرحها أصحابها') + '</legend><p>' + a.claim + '</p></fieldset>' : '') +
        (fallacies.length ? '<p class="fallacy-index"><span class="tag tag-red">المغالطات في هذا المقال</span>' + fallacies.join(' · ') + '</p>' : '') +
        a.sections.map(function (s, i) {
          return '<section class="q" id="s' + (i + 1) + '">' +
            '<div class="q-num"><b>' + ar(i + 1) + '</b><small>المحور</small></div>' +
            '<div><h2>' + s.title + '</h2>' + s.blocks.map(block).join('') + '</div>' +
          '</section>';
        }).join('') +
        '<div class="foot-notes">' +
          (a.sources && a.sources.length ? '<p><b>المراجع:</b> ' + a.sources.join(' · ') + '</p>' : '') +
          (a.terms && a.terms.length ? '<p>' + a.terms.map(function (t) { return '<b>' + t.term + ':</b> ' + t.def; }).join(' · ') + '</p>' : '') +
        '</div>' +
        '<nav class="pager" aria-label="مقالات أخرى">' +
          (prev ? '<a class="prev" href="#/a/' + prev.id + '"><small>→ المقال السابق</small><span>' + prev.title + '</span></a>' : '<span></span>') +
          (next ? '<a class="next" href="#/a/' + next.id + '"><small>المقال التالي ←</small><span>' + next.title + '</span></a>' : '<span></span>') +
        '</nav>' +
        '<p class="back-index"><a href="#/c/' + a.category + '">كل مقالات «' + c.name + '»</a><a href="#/">فهرس المدوّنة</a></p>' +
      '</article>' +
      pageFoot('مقال <b>' + ar(idx + 1) + '</b> / ' + ar(ORDER.length));
    return html;
  }

  /* ── About ───────────────────────────────────────────────────── */
  function renderAbout() {
    var sections = [
      { title: 'ما هذه المدوّنة؟', blocks: [
        '«جدليات» مدوّنة عربية تفحص الحجج التي تُقدَّم عادةً دليلاً على وجود الله وصحة الدين، وتعرضها على <b>العقل والعلم والتاريخ</b>. هدفها أن يكون للقارئ العربي مكانٌ يجد فيه النقد الرصين بلغته.'
      ] },
      { title: 'منهجنا', blocks: [
        { list: [
          'نعرض كل حجة <b>بأقوى صيغها</b> قبل أن ننقدها.',
          'نذكر مصادرنا في آخر كل مقال ليتحقق منها القارئ.',
          'ننتقد الأفكار لا الأشخاص، ونحترم حق كل إنسان في معتقده.',
          'إن أخطأنا صحّحنا الخطأ علناً.'
        ] },
        { label: 'تنبيه', note: 'ما يُنشر هنا اجتهاداتٌ فكرية قابلة للنقاش، والردود المنهجية مرحَّب بها.' }
      ] }
    ];
    return '<div class="sec-head art-head"><h1>عن <span class="accent">المدوّنة</span></h1><span class="line"></span><span class="boxed">جدليات</span></div>' +
      sections.map(function (s, i) {
        return '<section class="q"><div class="q-num"><b>' + ar(i + 1) + '</b><small>المحور</small></div><div><h2>' + s.title + '</h2>' + s.blocks.map(block).join('') + '</div></section>';
      }).join('') +
      pageFoot('<b>عن المدوّنة</b>');
  }

  /* ── Router ──────────────────────────────────────────────────── */
  var started = false;
  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var kind = parts[0], id = parts[1];
    var active = 'home', title = 'جدليات';

    if (kind === 'a' && BY_ID[id]) {
      var a = BY_ID[id];
      app.innerHTML = renderArticle(a);
      active = a.category;
      title = a.title + ' — جدليات';
    } else if (kind === 'c' && CATS[id]) {
      app.innerHTML = renderHome(id);
      active = id;
      title = CATS[id].name + ' — جدليات';
    } else if (kind === 'about') {
      app.innerHTML = renderAbout();
      active = 'about';
      title = 'عن المدوّنة — جدليات';
    } else {
      app.innerHTML = renderHome(null);
    }

    renderNav(active);
    document.title = title;
    closePanel();
    setReader(kind === 'a' && BY_ID[id] ? BY_ID[id] : null);
    window.scrollTo(0, 0);
    if (started) app.focus({ preventScroll: true });
    started = true;
  }

  /* ── Reading bar: current section, progress, floating contents ── */
  var readbar = document.getElementById('readbar');
  var rbTitle = document.getElementById('rb-title');
  var rbProg = document.getElementById('rb-prog');
  var rbToc = document.getElementById('rb-toc');
  var panel = document.getElementById('toc-panel');
  var tpList = document.getElementById('tp-list');
  var reading = null, sections = [], current = -1, ticking = false;

  function setReader(a) {
    reading = a;
    current = -1;
    if (!readbar) return;
    readbar.hidden = true;
    if (!a) { sections = []; return; }
    tpList.innerHTML = tocList(a);
    sections = a.sections.map(function (s, i) { return document.getElementById('s' + (i + 1)); });
    onScroll();
  }

  function markCurrent(i) {
    if (i === current) return;
    current = i;
    rbTitle.textContent = i >= 0 ? ar(i + 1) + ' · ' + reading.sections[i].title.replace(/<[^>]*>/g, '') : reading.title;
    document.querySelectorAll('.toc-list button').forEach(function (b) {
      if (b.getAttribute('data-jump') === 's' + (i + 1)) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  function update() {
    ticking = false;
    if (!reading || !readbar) return;
    var toc = app.querySelector('.toc');
    var article = app.querySelector('article');
    if (!toc || !article) return;
    readbar.hidden = toc.getBoundingClientRect().bottom > 0;
    var top = article.getBoundingClientRect().top + window.scrollY;
    var span = article.offsetHeight - window.innerHeight;
    var p = span > 0 ? (window.scrollY - top) / span : 1;
    rbProg.style.transform = 'scaleX(' + Math.min(1, Math.max(0, p)) + ')';
    var i = -1;
    for (var k = 0; k < sections.length; k++) {
      if (sections[k] && sections[k].getBoundingClientRect().top < 120) i = k;
    }
    markCurrent(i);
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }

  function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    rbToc.setAttribute('aria-expanded', 'true');
    var cur = panel.querySelector('[aria-current]') || panel.querySelector('button[data-jump]');
    if (cur) cur.focus({ preventScroll: true });
  }
  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    rbToc.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-jump]');
    if (btn) {
      var target = document.getElementById(btn.getAttribute('data-jump'));
      closePanel();
      if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (e.target.closest('#rb-toc')) { panel.hidden ? openPanel() : closePanel(); return; }
    if (e.target.closest('[data-close]')) { closePanel(); return; }
    if (e.target.closest('#rb-top')) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ── Index search: filters rows by title, excerpt and section name ── */
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'find') return;
    var q = e.target.value.trim().replace(/[ً-ْٰـ]/g, '');
    var shown = 0;
    app.querySelectorAll('.group').forEach(function (g) {
      var any = false;
      g.querySelectorAll('.row').forEach(function (r) {
        var ok = !q || r.getAttribute('data-text').replace(/[ً-ْٰـ]/g, '').indexOf(q) >= 0;
        r.hidden = !ok;
        if (ok) { any = true; shown++; }
      });
      g.hidden = !any;
    });
    var none = document.getElementById('no-hits');
    if (none) none.hidden = shown > 0;
  });

  window.addEventListener('hashchange', route);
  route();
})();

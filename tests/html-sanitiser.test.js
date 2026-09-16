/**
 * .SYNOPSIS
 * With raw HTML allowed, what an author writes must not run in a reader's
 * browser - and nothing this project renders itself may be lost taking it out.
 *
 * .DESCRIPTION
 * Two halves, and the second is the one that breaks.
 *
 * The first half is the attacks. Every case here was written against the build
 * before htmlSanitiser existed and confirmed to come through untouched: the
 * script tag ran, the `onerror` fired, the `javascript:` href stayed on the
 * link, and an iframe pointed anywhere at all was rendered as written.
 *
 * The second half is the collateral. Sanitising happens on the whole rendered
 * string, because markdown-it hands out `html_inline` as individual unbalanced
 * tags - `<b>` and `</b>` arrive as separate tokens - and a sanitiser given
 * `<b>` on its own does not give it back. So the sanitiser also runs over
 * every callout, code block, footnote, contents list, SVG icon and piece of
 * KaTeX this project generates, and the kitchen sink is the document that has
 * all of them. It must come through with nothing removed.
 *
 * WHY THE KITCHEN-SINK COMPARISON IS AGAINST A RE-SERIALISED REFERENCE
 * DOMPurify parses HTML and serialises it back, so its output is always in the
 * serialiser's spelling, and the serialiser's spelling is not markdown-it's.
 * Two differences show up in this sample and neither is a removal:
 *
 *   `<path d="..."/>` is serialised `<path d="..."></path>`. Same element.
 *   `&#x27;` and `&quot;` in text, which is how highlight.js escapes quotes,
 *   are serialised as the characters themselves. Same text.
 *
 * Comparing raw markdown-it output against sanitised output would therefore
 * fail on spelling and say nothing about safety. So the reference is the same
 * render put through the same parse and serialise with no sanitiser in it -
 * which is exactly what the browser holds after assigning the raw string to
 * innerHTML. The comparison is then byte for byte, and any attribute, any
 * `open`, any piece of MathML that DOMPurify drops shows up as a difference.
 * `removed` being empty is asserted beside it as the second, independent
 * statement of the same thing.
 *
 * .USAGE
 *   npm test                                   every test
 *   node --test tests/html-sanitiser.test.js   this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { MarkdownProcessor, htmlSanitiser } = require('./helpers');

const { sanitiseRenderedHtml, isAllowedIframeHost, useSanitiserWindow, lastRemoved } = htmlSanitiser;

/* helpers.js installed a window already; this is the same one, named here so
   the few tests that swap it can put it back. */
const BLANK_WINDOW = () => new JSDOM('').window;

const permissive = () => new MarkdownProcessor({ allowHtml: true });

// ------------------------------------------------------------- what is blocked

/*
 * Every case below rendered exactly as written before this change. The three
 * in the bug report are the first three.
 */
const BLOCKED = {
  'a script tag': ['<script>alert(1)</script>', /script/i],
  'a script tag shouting': ['<SCRIPT SRC="https://evil.example/x.js"></SCRIPT>', /script/i],
  'a script tag spliced through itself':
    ['<scr<script>ipt>alert(1)</scr</script>ipt>', /<script/i],
  'an onerror handler': ['<img src=x onerror=alert(1)>', /onerror/i],
  'an onclick handler': ['<div onclick="alert(1)">hi</div>', /onclick/i],
  'an onload handler on an svg': ['<svg onload=alert(1)></svg>', /onload/i],
  'an object': ['<object data="x.swf"></object>', /<object/i],
  'an embed': ['<embed src="x.swf">', /<embed/i],
  'a base tag': ['<base href="https://evil.example/">', /<base/i],
  'a form': ['<form action="https://evil.example/">name</form>', /<form/i],
  'a refreshing meta tag':
    ['<meta http-equiv="refresh" content="0;url=https://evil.example/">', /<meta/i],
  'an iframe from anywhere at all': ['<iframe src="https://evil.example/x"></iframe>', /<iframe/i],
  'an iframe whose url merely mentions an allowed host':
    ['<iframe src="https://evil.example/?x=www.youtube.com"></iframe>', /<iframe/i],
  'an iframe on a host that starts with an allowed one':
    ['<iframe src="https://www.youtube.com.evil.example/x"></iframe>', /<iframe/i],
  'an iframe on a host that merely ends in the allowed words':
    ['<iframe src="https://evilsharepoint.com/x"></iframe>', /<iframe/i],
  'an iframe with no source at all': ['<iframe></iframe>', /<iframe/i],
  'an iframe carrying a document instead of a source':
    ['<iframe srcdoc="<script>alert(1)</script>"></iframe>', /<iframe|srcdoc/i],
  'an iframe holding a data url': [
    '<iframe src="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>', /<iframe/i
  ]
};

for (const [what, [markdown, forbidden]] of Object.entries(BLOCKED)) {
  test(`${what} does not survive`, () => {
    assert.doesNotMatch(permissive().render(markdown), forbidden);
  });
}

/*
 * A `javascript:` address cannot be judged by looking at the rendered text,
 * which is how an obfuscated one gets past a check written that way: the page
 * says `java&#115;cript:` and the browser reads `javascript:`. So the output is
 * parsed the way a browser parses it and the address read back off the
 * attribute afterwards. Spaces and control characters are dropped for the
 * comparison because a browser drops them too.
 */
function addresses(html) {
  const document = new JSDOM('<body>').window.document;
  document.body.innerHTML = html;
  return Array.prototype.slice.call(document.querySelectorAll('[href], [src]'))
    .map((element) => element.getAttribute('href') || element.getAttribute('src') || '')
    /* eslint-disable-next-line no-control-regex */
    .map((value) => value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase());
}

const SCRIPT_URLS = {
  'a javascript: href': '<a href="javascript:alert(1)">x</a>',
  'a javascript: href written as an entity': '<a href="java&#115;cript:alert(1)">x</a>',
  'a javascript: href whose first letter is an entity':
    '<a href="&#106;avascript:alert(1)">x</a>',
  'a javascript: href behind spaces': '<a href="  javascript:alert(1)">x</a>',
  'a javascript: href split by a tab': '<a href="jav\tascript:alert(1)">x</a>',
  'a javascript: href split by a control character':
    '<a href="jav\u0001ascript:alert(1)">x</a>',
  'a javascript: href shouting': '<a href="JaVaScRiPt:alert(1)">x</a>',
  'a javascript: image source': '<img src="javascript:alert(1)">',
  'a javascript: image source written as an entity': '<img src="javascr&#105;pt:alert(1)">'
};

for (const [what, markdown] of Object.entries(SCRIPT_URLS)) {
  test(`${what} does not survive`, () => {
    const found = addresses(permissive().render(markdown))
      .filter((value) => value.indexOf('javascript:') === 0);
    assert.deepEqual(found, [], 'a scripting address is still on the page');
  });
}

test('srcdoc goes even when the iframe is on an allowed host', () => {
  const html = permissive().render(
    '<iframe src="https://www.youtube.com/embed/x" srcdoc="<b>a</b>"></iframe>'
  );
  assert.match(html, /<iframe/);
  assert.doesNotMatch(html, /srcdoc/i);
});

test('a script tag takes what is inside it with it', () => {
  assert.equal(permissive().render('<script>alert(1)</script>').indexOf('alert'), -1);
});

// ----------------------------------------------------------- what is allowed

const EMBEDS = [
  'https://www.youtube.com/embed/x',
  'https://youtube.com/embed/x',
  'https://www.youtube-nocookie.com/embed/x',
  'https://youtube-nocookie.com/embed/x',
  'https://player.vimeo.com/video/1',
  'https://vimeo.com/1',
  'https://web.microsoftstream.com/embed/video/1',
  'https://forms.office.com/r/abc',
  'https://app.powerbi.com/reportEmbed?reportId=1',
  'https://teams.microsoft.com/l/meetup-join/1',
  'https://contoso.sharepoint.com/sites/x/page.aspx'
];

for (const address of EMBEDS) {
  test(`an iframe from ${address.split('/')[2]} survives`, () => {
    assert.match(permissive().render(`<iframe src="${address}"></iframe>`), /<iframe/);
  });
}

test('an embed keeps the attributes an embed needs', () => {
  const html = permissive().render(
    '<iframe src="https://www.youtube.com/embed/x" width="560" height="315" title="A video" '
    + 'frameborder="0" loading="lazy" allowfullscreen></iframe>'
  );
  ['src=', 'width="560"', 'height="315"', 'title="A video"', 'frameborder="0"',
    'loading="lazy"', 'allowfullscreen'].forEach((attribute) => {
    assert.ok(html.indexOf(attribute) !== -1, `an embed lost ${attribute}`);
  });
});

test('ordinary formatting HTML is left alone', () => {
  const html = permissive().render(
    '<p><sub>a</sub><sup>b</sup><kbd>Ctrl</kbd><br><span class="x">s</span></p>'
    + '<div class="y">d</div>'
  );
  ['<sub>a</sub>', '<sup>b</sup>', '<kbd>Ctrl</kbd>', '<br>', '<span class="x">s</span>',
    '<div class="y">d</div>'].forEach((fragment) => {
    assert.ok(html.indexOf(fragment) !== -1, `${fragment} did not survive`);
  });
});

test('a details block keeps its open state', () => {
  const html = permissive().render('<details open><summary>S</summary>body</details>');
  assert.match(html, /<details open(=""|)>/);
  assert.match(html, /<summary>S<\/summary>/);
});

test('a hand-written table survives whole', () => {
  const source = '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>';
  assert.equal(permissive().render(source), source);
});

// ------------------------------------------------- the host the page is on

test('an iframe from the page own host, and a relative one, are allowed', () => {
  try {
    useSanitiserWindow(new JSDOM('', { url: 'https://contoso.sharepoint.com/sites/x/p.aspx' }).window);
    const processor = new MarkdownProcessor({ allowHtml: true });
    assert.match(processor.render('<iframe src="/sites/x/embed.aspx"></iframe>'), /<iframe/);
    assert.match(processor.render('<iframe src="//www.youtube.com/embed/x"></iframe>'), /<iframe/);
    assert.doesNotMatch(processor.render('<iframe src="https://evil.example/x"></iframe>'), /<iframe/);
  } finally {
    useSanitiserWindow(BLANK_WINDOW());
  }
});

test('the page host is matched on the whole name, not on part of it', () => {
  assert.ok(isAllowedIframeHost('intranet.example', 'intranet.example'));
  assert.ok(!isAllowedIframeHost('intranet.example.evil', 'intranet.example'));
  assert.ok(!isAllowedIframeHost('', 'intranet.example'));
});

test('the sharepoint.com wildcard stops at the dot', () => {
  assert.ok(isAllowedIframeHost('contoso.sharepoint.com'));
  assert.ok(isAllowedIframeHost('contoso-my.sharepoint.com'));
  assert.ok(!isAllowedIframeHost('sharepoint.com.evil.example'));
  assert.ok(!isAllowedIframeHost('evilsharepoint.com'));
  assert.ok(!isAllowedIframeHost('sharepoint.com'));
});

// -------------------------------------------------- nothing of ours is lost

const KITCHEN_SINK = fs.readFileSync(
  path.join(__dirname, '..', 'samples', 'kitchen-sink.md'), 'utf8'
);

/** The same parse and serialise DOMPurify does, with no sanitiser in it. */
function reserialise(html) {
  const document = new JSDOM('<body>').window.document;
  document.body.innerHTML = html;
  return document.body.innerHTML;
}

const SINK_OPTIONS = {
  imageBasePath: '/sites/x/docs',
  enableMath: true,
  enableMermaid: true,
  enableAnchors: true,
  enableToc: true,
  allowHtml: true
};

/*
 * The document as markdown-it leaves it, with raw HTML on and before anything
 * has been taken out of it.
 *
 * Reached by standing the sanitiser aside for one render rather than by
 * rendering with the setting off, because the setting decides two things at
 * once - whether markdown-it escapes the author's tags, and whether the result
 * is sanitised - and only the second is meant to be off here.
 *
 * Rendered once and kept. The mermaid container carries an id built from the
 * clock, so two renders of one document are not the same string and never
 * were.
 */
const RENDERED = (() => {
  const real = htmlSanitiser.sanitiseRenderedHtml;
  htmlSanitiser.sanitiseRenderedHtml = (html) => html;
  try {
    return new MarkdownProcessor(SINK_OPTIONS).render(KITCHEN_SINK);
  } finally {
    htmlSanitiser.sanitiseRenderedHtml = real;
  }
})();

/*
 * A tripwire for the line above. If standing the sanitiser aside ever stops
 * working, RENDERED is a sanitised string, the comparison below passes for the
 * wrong reason and says nothing. A self-closing `<path/>` is markdown-it's
 * spelling and is one thing no serialiser gives back, so its presence is proof
 * that this really is the unsanitised render.
 */
test('the reference render really did skip the sanitiser', () => {
  assert.match(RENDERED, /<path d="M12 20h9"\/>/);
  assert.match(RENDERED, /<kbd>Ctrl<\/kbd>/);
});

test('sanitising the kitchen sink changes nothing at all', () => {
  assert.equal(sanitiseRenderedHtml(RENDERED), reserialise(RENDERED));
});

test('the kitchen sink loses no element and no attribute', () => {
  sanitiseRenderedHtml(RENDERED);
  assert.deepEqual(lastRemoved().map((entry) => (entry.attribute
    ? `${entry.attribute.name} from ${entry.from && entry.from.nodeName}`
    : `element ${entry.element && entry.element.nodeName}`)), []);
});

test('sanitising twice is the same as sanitising once', () => {
  const once = sanitiseRenderedHtml(RENDERED);
  assert.equal(sanitiseRenderedHtml(once), once);
});

/*
 * Named separately from the byte comparison so a failure says which feature
 * went, rather than only that the string moved.
 */
const SURVIVES = {
  'the heading anchors, ids and all': /<h2 id="images">/,
  'the contents list': /class="strata-toc"/,
  'a callout': /class="strata-callout"/,
  'a foldable callout as details and summary': /<details[^>]*><summary/,
  'the svg icons, focusable and all': /<svg[^>]*focusable="false"/,
  'a code block': /class="strata-code/,
  'the syntax highlighting inside it': /class="hljs-/,
  'the task list checkboxes': /type="checkbox"/,
  'the footnotes': /class="footnotes/,
  'the maths': /class="katex/,
  'the data URI image': /src="data:image\/png/,
  'the mermaid fence, still a pre for the browser to draw into': /<pre class="mermaid" id="strata-mermaid-/,
  'the table markup': /<table/
};

for (const [what, pattern] of Object.entries(SURVIVES)) {
  test(`sanitising keeps ${what}`, () => {
    assert.match(sanitiseRenderedHtml(RENDERED), pattern);
  });
}

test('the author own HTML in the sample comes through too', () => {
  const html = new MarkdownProcessor(SINK_OPTIONS).render(KITCHEN_SINK);
  assert.deepEqual(lastRemoved(), []);
  assert.match(html, /<kbd>Ctrl<\/kbd>/);
  assert.match(html, /<sub>markup<\/sub>/);
});

// --------------------------------------------- off means off, and not maybe

test('with raw HTML off the sanitiser never runs', () => {
  try {
    /* No window at all: anything that reaches the sanitiser now fails loudly
       rather than quietly handing back what it was given. */
    useSanitiserWindow(undefined);
    const quiet = new MarkdownProcessor({ allowHtml: false });
    assert.match(quiet.render('<b onclick="x()">hi</b>'), /&lt;b/);
    assert.match(quiet.render('# Heading\n\ntext'), /<h1/);

    const loud = new MarkdownProcessor({ allowHtml: true });
    assert.match(loud.render('<b>hi</b>'), /strata-error/);
  } finally {
    useSanitiserWindow(BLANK_WINDOW());
  }
});

test('a sanitiser with nowhere to run refuses rather than passing HTML through', () => {
  try {
    useSanitiserWindow(undefined);
    assert.throws(() => sanitiseRenderedHtml('<b>hi</b>'), /No window to sanitise HTML against/);
  } finally {
    useSanitiserWindow(BLANK_WINDOW());
  }
});

/*
 * YouTube's own Share > Embed gives you an iframe carrying `allow` and
 * `referrerpolicy`. Dropping them left the video playing, so nothing looked
 * broken, while silently changing what the author pasted - and `allow` is the
 * attribute that says what the frame may NOT do, so losing it quietly is the
 * wrong way round.
 */
test('a pasted YouTube embed keeps the attributes YouTube gives it', () => {
  const pasted = '<iframe width="560" height="315"'
    + ' src="https://www.youtube.com/embed/dQw4w9WgXcQ"'
    + ' title="YouTube video player" frameborder="0"'
    + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media;'
    + ' gyroscope; picture-in-picture; web-share"'
    + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  const document = new JSDOM('<body>').window.document;
  document.body.innerHTML = sanitiseRenderedHtml(pasted);
  const frame = document.querySelector('iframe');

  assert.ok(frame, 'the embed was removed');
  assert.match(frame.getAttribute('allow') || '', /encrypted-media/);
  assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
  assert.equal(frame.getAttribute('allowfullscreen'), '');
});

test('and a frame off the allowlist keeps nothing, allow included', () => {
  const html = sanitiseRenderedHtml(
    '<iframe src="https://evil.example/x" allow="camera; microphone"></iframe>'
  );
  const document = new JSDOM('<body>').window.document;
  document.body.innerHTML = html;
  assert.equal(document.querySelector('iframe'), null, 'the frame itself should be gone');
  assert.doesNotMatch(html, /camera/);
});

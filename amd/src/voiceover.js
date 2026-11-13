// AI Voiceover (Chirp HD) - SCORM voiceover injector
// AMD module: Injects floating toolbar + per-paragraph speaker icons into
// Articulate Rise 360 SCORM pages. Calls ajax.php proxy which routes to
// Google Chirp 3 HD TTS via lms-labs.com.
//
// @package    local_chirpvoice
// @copyright  2026 AI Grader
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

define([], function() {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────────────
    var mCfg = {};
    var toolbar = null;
    var iframeDoc = null;
    var iframeObs = null;
    var segments = []; // [{el, text}] current page segments
    var isPlaying = false;
    var isPaused = false;
    var curIdx = 0;

    // AudioContext playback (avoids autoplay policy blocking async play())
    var chirpCtx = null; // AudioContext — unlocked on first user gesture
    var activeSource = null; // AudioBufferSourceNode currently playing
    var activeBuffer = null; // AudioBuffer for the current segment (enables resume)
    var activeOnDone = null; // OnDone callback for when current segment ends
    var segStartTime = 0; // Ctx.currentTime when current segment started
    var pauseOffset = 0; // Playback position (seconds) when paused

    // Speed control
    var SPEED_STEPS = [0.9, 1.0, 1.1]; // UI-CV-SPEED-SIMPLE (v1.1.19): three steps only
    var chirpSpeed = 1.0; // Current playback rate multiplier

    // Prefetch: stores the next segment's decoded AudioBuffer to eliminate gaps
    var prefetchCache = {}; // { segmentIdx: AudioBuffer | 'pending' }

    // UI-CV-NO-STUDENT-VOICE (v1.1.12): Voice and language are admin/teacher
    // settings only — resolved once at toolbar build time from mCfg defaults
    // (validated against the admin-allowed list).  Students no longer see dropdowns.
    var resolvedVoice = 'Aoede';
    var resolvedLang = 'en-AU';


    // ── Elements that can NEVER contain readable narration ─────────────────────
    // NOTE: header/footer/figure are intentionally NOT here — Rise 360 uses
    // <header> for section titles and <figure> for content blocks. Only exclude
    // truly non-text elements.
    // FIX-CV-AUDIT-NAV (v1.0.6): Added 'nav' — Rise 360 navigation rails
    // (prev/next, course menu, breadcrumb) live inside <nav> elements. Short
    // labels like "Continue", "1 of 8" pass the length filter but must never
    // be read aloud. hasForbiddenAncestor() already walks the full ancestor
    // chain, so adding 'nav' here blocks any descendant of a <nav>.
    var SKIP_TAGS = {
        'script': 1, 'style': 1, 'svg': 1, 'img': 1, 'canvas': 1, 'video': 1, 'audio': 1,
        'noscript': 1, 'button': 1, 'input': 1, 'select': 1, 'textarea': 1,
        'iframe': 1, 'template': 1, 'meta': 1, 'link': 1,
        'nav': 1
    };

    // Rise 360 CSS class substrings that indicate UI chrome (not narration).
    // Keep this list SHORT and unambiguous — substring matching is greedy and
    // will block content if patterns like "label" or "tag" are included.
    var SKIP_CLASS_PATTERNS = [
        'sr-only', 'visually-hidden', 'skip-link', 'screen-reader',
        'breadcrumb', 'pagination',
        'tooltip', 'modal-backdrop', 'overlay--',
        'course-nav', 'sidebar--', 'top-nav', 'bottom-nav'
    ];

    // FIX-CV-IMG-LABELS (v1.1.8): Class substrings checked on ANCESTOR elements.
    // Prevents text nodes INSIDE image components from being narrated — the `p`
    // inside a .labeled-graphic__label won't have that class itself, so
    // SKIP_CLASS_PATTERNS (which checks the element) can't catch it. Ancestor
    // class checking mirrors the existing hasForbiddenAncestor tag check.
    var SKIP_ANCESTOR_CLASS_PATTERNS = [
        'labeled-graphic', // Rise 360: image with clickable hotspot labels
        'labeled-graphic__', // Sub-elements (labels, points, popups)
        'hotspot', // Generic hotspot containers on images
        'image-label', // Image label overlays
        'figure__description', // Figure/image description overlays
        'image__description', // Image description blocks
        'media-caption', // Caption overlays on media elements
        'image-caption', // Image caption wrappers
        'caption', // FIX-CV-IMG-CAPTIONS: catches all caption variants —
                             // gallery-item__caption, block-gallery__caption,
                             // image__caption, gallery__caption, etc.
        'block-gallery', // Rise 360 image gallery block (3-up photo rows)
        'image-gallery', // Rise 360 image gallery component
        'gallery-item' // Individual gallery item (image + caption pair)
    ];

    // ── Public API ─────────────────────────────────────────────────────────────
    /**
     * Start the voiceover module.
     *
     * @param {Object} config Settings passed from PHP.
     */
    function init(config) {
        mCfg = config || {};
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────────
    /**
     * Build the toolbar and start watching for the SCORM frame.
     */
    function setup() {
        buildToolbar();
        watchForIframe();
    }

    // ── Toolbar (lives in the Moodle player page, NOT inside iframe) ───────────
    // UI-CV-NO-STUDENT-VOICE (v1.1.12): Voice and language dropdowns removed —
    // these are admin/teacher settings configured in the plugin options, not
    // student choices.  resolvedVoice / resolvedLang are set here once from
    // mCfg, validated against the admin-allowed list, and used for every fetch.
    // FEAT-CV-COURSE-ACCENT (v1.1.28): mCfg.courseLanguage (single code set by
    // teacher via course_settings.php) takes priority over defaultLanguage.
    /**
     * Create the floating voiceover toolbar.
     */
    function buildToolbar() {
        // Resolve effective voice — use admin default, fall back to first allowed.
        var allowedVoiceList = mCfg.allowedVoices
            ? mCfg.allowedVoices.split(',').map(function(s) {
                return s.trim();
            }).filter(Boolean)
            : [];
        var allowedLangList = mCfg.allowedLanguages
            ? mCfg.allowedLanguages.split(',').map(function(s) {
                return s.trim();
            }).filter(Boolean)
            : [];

        // Course voice takes priority over site default; fall back to site default.
        // FEAT-CV-COURSE-VOICE (v1.1.29): mCfg.courseVoice set by teacher per-course.
        if (mCfg.courseVoice && mCfg.courseVoice.length > 0) {
            resolvedVoice = mCfg.courseVoice;
        } else {
            resolvedVoice = mCfg.defaultVoice || 'Aoede';
        }

        // Course accent takes priority: teacher sets one accent via gear icon.
        // Falls back to site default language if not set.
        if (mCfg.courseLanguage && mCfg.courseLanguage.length > 0) {
            resolvedLang = mCfg.courseLanguage;
        } else {
            resolvedLang = mCfg.defaultLanguage || 'en-AU';
        }

        // Validate against admin-allowed lists; fall back to first if not found.
        if (allowedVoiceList.length > 0 && allowedVoiceList.indexOf(resolvedVoice) === -1) {
            resolvedVoice = allowedVoiceList[0];
        }
        if (allowedLangList.length > 0 && allowedLangList.indexOf(resolvedLang) === -1) {
            resolvedLang = allowedLangList[0];
        }

        // FEAT-CV-TEACHER-LANG (v1.0.8): Gear icon visible only to teachers
        // (users with moodle/course:manageactivities) — links to course_settings.php
        // where the teacher can set the default language for their course.
        var gearLink = '';
        if (mCfg.canManageCourse && mCfg.courseSettingsUrl) {
            gearLink = '<a id="chirp-gear" class="chirp-gear" href="' +
                       mCfg.courseSettingsUrl +
                       '" target="_blank" title="Set accent language for this course. ' +
                       'Note: this changes the speaking accent, not the language of the content. ' +
                       'The text is still read in English using the selected accent.">&#9881;</a>';
        }

        toolbar = document.createElement('div');
        toolbar.id = 'chirp-toolbar';
        toolbar.innerHTML =
            '<span class="chirp-logo">&#128266; Voiceover</span>' +
            '<button id="chirp-slower" class="chirp-btn chirp-speed-btn" title="Slower playback">&#8722;</button>' +
            '<span id="chirp-speed-lbl" class="chirp-speed-lbl">1&#215;</span>' +
            '<button id="chirp-faster" class="chirp-btn chirp-speed-btn" title="Faster playback">&#43;</button>' +
            gearLink +
            '<button id="chirp-play" class="chirp-btn chirp-play" title="Play all sections">&#9654; Play</button>' +
            '<button id="chirp-pause" class="chirp-btn chirp-pause" disabled title="Pause/Resume">&#9646;&#9646; Pause</button>' +
            '<button id="chirp-stop" class="chirp-btn chirp-stop" disabled title="Stop playback">&#9632; Stop</button>';

        document.body.appendChild(toolbar);

        document.getElementById('chirp-play').addEventListener('click', onPlayAll);
        document.getElementById('chirp-pause').addEventListener('click', onPauseResume);
        document.getElementById('chirp-stop').addEventListener('click', onStop);

        document.getElementById('chirp-slower').addEventListener('click', function() {
            var idx = SPEED_STEPS.indexOf(chirpSpeed);
            if (idx > 0) {
                setSpeed(SPEED_STEPS[idx - 1]);
            }
        });
        document.getElementById('chirp-faster').addEventListener('click', function() {
            var idx = SPEED_STEPS.indexOf(chirpSpeed);
            if (idx < SPEED_STEPS.length - 1) {
                setSpeed(SPEED_STEPS[idx + 1]);
            }
        });
    }

    /**
     * Change the reading speed.
     *
     * @param {Number} rate Speed multiplier (0.9, 1.0 or 1.1).
     */
    function setSpeed(rate) {
        chirpSpeed = rate;
        var lbl = document.getElementById('chirp-speed-lbl');
        if (lbl) {
            lbl.textContent = rate.toFixed(2).replace(/\.?0+$/, '') + '\u00d7';
        }
        // FEAT-CV-SPEAKINGRATE (v1.1.18): Speed is now passed as speakingRate to the
        // Google TTS API so the audio is generated at the correct pace natively.
        // Changing AudioBufferSourceNode.playbackRate after the fact raised pitch
        // (chipmunk effect). Instead:
        //   1. Discard the prefetch cache — it holds audio baked at the old speed.
        //   2. Stop the current segment and restart it from the beginning so the
        //      new speed takes effect immediately, not just on the next paragraph.
        prefetchCache = {};
        if (isPlaying && !isPaused) {
            if (activeSource) {
                try {
                    activeSource.onended = null;
                    activeSource.stop();
                } catch (e) {
                    // Ignore: the source may already have stopped.
                }
                activeSource = null;
            }
            activeBuffer = null;
            activeOnDone = null;
            pauseOffset = 0;
            playSegAt(curIdx);
        }
    }

    /**
     * Status text is no longer shown; kept so existing calls stay valid.
     */
    function setStatus() {
        // Status display removed in v1.1.35.
    }

    /**
     * Show the play or pause state on the toolbar buttons.
     *
     * @param {Boolean} playing True while audio is playing.
     */
    function setBtns(playing) {
        var play = document.getElementById('chirp-play');
        var pause = document.getElementById('chirp-pause');
        var stop = document.getElementById('chirp-stop');
        if (!play) {
            return;
        }
        play.disabled = playing;
        pause.disabled = !playing;
        stop.disabled = !playing;
        if (!playing) {
            pause.innerHTML = '&#9646;&#9646; Pause';
        }
    }


    // ── SCORM iframe detection ─────────────────────────────────────────────────
    /**
     * Poll the page until the SCORM frame appears.
     */
    function watchForIframe() {
        var attempts = 0;
        var t = setInterval(function() {
            attempts++;
            var frame = findFrame();
            if (frame) {
                clearInterval(t);
                setStatus('SCORM found, loading&#8230;');
                onFrameFound(frame);
            }
            if (attempts > 120) { // 60 s timeout
                clearInterval(t);
                setStatus('SCORM iframe not detected');
            }
        }, 500);
    }

    /**
     * Find the SCORM player frame on the page.
     *
     * @returns {HTMLIFrameElement|null} The frame, or null if not found.
     */
    function findFrame() {
        return (
            document.getElementById('scorm_object') ||
            document.querySelector('iframe[name="scorm_object"]') ||
            document.querySelector('iframe[id*="scorm"]') ||
            document.querySelector('iframe[name*="scorm"]') ||
            document.querySelector('#scorm_wrapper iframe') ||
            document.querySelector('iframe[src*="scormcontent"]') ||
            document.querySelector('iframe[src*="index.html"]')
        );
    }

    /**
     * Return a child frame's document, or null when it is cross-origin or not loaded.
     *
     * @param {HTMLIFrameElement} frame The child frame.
     * @return {Document|null}
     */
    function childDocument(frame) {
        try {
            return frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
        } catch (e) {
            // Cross-origin frame: skip it.
            return null;
        }
    }

    // FIX-CV-RISE-DETECT (v1.1.0): Recursive Rise 360 document finder.
    //
    // Confirmed root cause (from live diagnostic console output):
    //   Wrapper page text:        0 chars
    //   Nested iframe count:      4
    //   Nested iframe #0 text:    14520 chars
    //   Nested iframe #0 .fr-view: 36 elements
    //
    // The outer SCORM wrapper frame has 0 chars of body text and 4 nested iframes.
    // The actual Rise 360 content lives in iframe #0, identifiable by .fr-view.
    // Text-length heuristics are unreliable when intermediate shell frames also
    // have > 100–300 chars (script blocks, status text, accessibility labels).
    //
    // Fix: use class-based fingerprinting to identify the Rise 360 document.
    // Articulate Rise ALWAYS renders .fr-view (Froala editor container) and
    // .block-text__container inside its lesson documents. Recursively drill into
    // child iframes until these classes are found. If not found (non-Rise SCORM),
    // fall back to text-length heuristic via findAnyContentDoc().
    /**
     * Find the Rise 360 lesson document, searching nested frames.
     *
     * @param {Document|null} doc Document to check.
     * @returns {Document|null} The Rise document, or null.
     */
    function findRiseDocument(doc) {
        try {
            if (!doc || !doc.body) {
                return null;
            }
            // Rise 360 fingerprint — present in every Rise lesson document.
            if (doc.querySelector('.fr-view') ||
                doc.querySelector('.block-text__container')) {
                return doc;
            }
            // Recursively check child iframes.
            var frames = doc.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                var found = findRiseDocument(childDocument(frames[i]));
                if (found) {
                    return found;
                }
            }
        } catch (e) {
            // Unreadable document: treat it as not Rise.
        }
        return null;
    }

    // Fallback for non-Rise SCORM: finds the child iframe with the most text,
    // or returns the outer doc itself when no nested frames have enough content.
    /**
     * Find the frame document with the most text, for SCORM that is not Rise.
     *
     * @param {Document} outerDoc The SCORM document.
     * @returns {Document} The content document.
     */
    function findAnyContentDoc(outerDoc) {
        try {
            var frames = outerDoc.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                var childDoc = childDocument(frames[i]);
                if (childDoc && childDoc.body && (childDoc.body.textContent || '').trim().length > 100) {
                    return childDoc;
                }
            }
        } catch (e) {
            // Unreadable document: use the outer document.
        }
        return outerDoc;
    }

    /**
     * Wait until the SCORM frame can be read, then load its content.
     *
     * @param {HTMLIFrameElement} frame The SCORM frame.
     */
    function onFrameFound(frame) {
        /**
         * Try to read the frame document, retrying while it loads.
         */
        function tryAccess() {
            try {
                var outerDoc = frame.contentDocument || frame.contentWindow.document;
                if (outerDoc && outerDoc.body) {
                    // Pass the outer frame directly — waitForContent() will call
                    // resolveContentDoc() on every poll tick so it can switch to a
                    // child iframe (e.g. scormdriver_content) once it has loaded.
                    waitForContent(frame);
                } else {
                    setTimeout(tryAccess, 1500);
                }
            } catch (e) {
                // Cross-origin — cannot inject
                setStatus('Cross-origin SCORM not supported');
            }
        }

        // Immediate check if already loaded
        try {
            var existing = frame.contentDocument;
            if (existing && existing.readyState === 'complete' && existing.body) {
                setTimeout(tryAccess, 800);
                return;
            }
        } catch (e) { /* Cross-origin check */ }

        frame.addEventListener('load', function() {
            setTimeout(tryAccess, 800);
        });
    }

    // ── Wait for Rise 360 content to render ───────────────────────────────────
    // Rise 360 is a React SPA — the iframe 'load' event fires before its JS
    // finishes rendering DOM. Poll until the body has substantial text (up to 40 s).
    //
    // FIX-CV-TABBLOCK (v1.0.4): Switched readiness check to body.textContent length
    // (>150 chars) — reliable for ALL Rise 360 block types including tabs/accordions.
    //
    // FIX-CV-RESOLVE-ALWAYS (v1.0.9): resolveContentDoc() is now called on EVERY tick
    // BEFORE the body-text threshold check. Previously the resolve only ran when
    // bodyText <= 150 — meaning if the outer SCORM shell had 151-500 chars (scripts,
    // status messages, a11y labels) the poller would proceed with the shell doc and
    // extractSegments would find zero lesson elements ("No text sections found").
    // The correct order is: resolve first (switch to child iframe if one has content),
    // then check whether the resolved doc has enough text to proceed.
    // FIX-CV-IMG-LABELS (v1.1.8): Removed figcaption (image captions), dt and dd
    // (definition list terms — used by Rise 360 for tab labels/accordion UI chrome).
    // Headings, paragraphs, and list items cover all real narration content.
    var CONTENT_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote';

    // Rise 360 non-semantic text containers used in tab, accordion, and statement
    // blocks. Used as fallback when CONTENT_SELECTOR finds nothing.
    // FIX-CV-IMG-LABELS (v1.1.8): Removed label-text (image hotspot labels),
    // marker__content (image map markers), and labeled-graphic (image-with-labels
    // component) — all select image annotation text that must not be narrated.
    var RISE_FALLBACK_SELECTOR = [
        '[class*="text-block"]',
        '[class*="block__body"]',
        '[class*="block__content"]',
        '[class*="paragraph-text"]',
        '[class*="accordion__panel"]',
        '[class*="tab__panel"]',
        '[class*="statement__text"]',
        '[class*="timeline__text"]',
        '[class*="flashcard__"]',
        '[class*="sorting-layout__text"]'
    ].join(',');

    /**
     * Wait until the lesson text has rendered inside the frame.
     *
     * @param {HTMLIFrameElement} frame The SCORM frame.
     */
    function waitForContent(frame) {
        var attempts = 0;

        var t = setInterval(function() {
            attempts++;
            try {
                var outerDoc = frame.contentDocument || frame.contentWindow.document;

                // FIX-CV-RISE-DETECT (v1.1.0): Try Rise 360 class fingerprinting first.
                // findRiseDocument() recursively drills into nested iframes looking for
                // .fr-view / .block-text__container — the CSS classes Articulate Rise
                // renders in every lesson document. This is reliable regardless of how
                // many SCORM wrapper frames exist or how much text they contain.
                var riseDoc = findRiseDocument(outerDoc);
                if (riseDoc) {
                    clearInterval(t);
                    iframeDoc = riseDoc;
                    onContentReady(riseDoc);
                    return;
                }

                // Fallback for non-Rise SCORM: use text-length heuristic.
                // Drills into child iframes looking for one with > 100 chars.
                var contentDoc = findAnyContentDoc(outerDoc);
                var bodyText = contentDoc.body ? (contentDoc.body.textContent || '').trim() : '';
                if (bodyText.length > 150) {
                    clearInterval(t);
                    iframeDoc = contentDoc;
                    onContentReady(contentDoc);
                } else if (attempts > 80) { // 40 s timeout
                    clearInterval(t);
                    setStatus('No readable text found \u2014 ensure SCORM is on a lesson page');
                } else {
                    setStatus('Loading content&#8230; (' + attempts + ')');
                }
            } catch (e) {
                clearInterval(t);
                setStatus('Cannot access content: ' + e.message);
            }
        }, 500);
    }

    // ── Content ready — inject everything ─────────────────────────────────────
    // FIX-CV-CONTENT-DELAY (v1.0.2): Rise 360 React SPA continues rendering for
    // up to ~1 s after the first text elements appear. Calling rebuildIcons()
    // immediately at that point finds far fewer segments than the final DOM.
    // Extra 1.2 s delay catches the full render before we scan for paragraphs.
    //
    // FIX-CV-RISE-DETECT (v1.1.0): Signature changed from (frame, doc) to just (doc).
    // We use the already-resolved iframeDoc directly in the setTimeout — previously
    // it re-accessed frame.contentDocument which would return the outer SCORM shell
    // document when frame was the outer wrapper (not the nested Rise 360 iframe).
    /**
     * Prepare the readable sections once the lesson has loaded.
     *
     * @param {Document} doc The lesson document.
     */
    function onContentReady(doc) {
        injectIframeStyles(doc);
        watchContentMutations(doc);
        setTimeout(function() {
            try {
                rebuildIcons(iframeDoc);
            } catch (e) { /* Cross-origin race */ }
        }, 1200);
    }

    // ── Extract text segments and inject speaker icons ─────────────────────────
    /**
     * Re-read the lesson sections and add the reading styles.
     *
     * @param {Document} doc The lesson document.
     */
    function rebuildIcons(doc) {
        // Remove any previously injected icons (from older plugin versions).
        var old = doc.querySelectorAll('.chirp-icon');
        for (var i = 0; i < old.length; i++) {
            if (old[i].parentNode) {
                old[i].parentNode.removeChild(old[i]);
            }
        }

        segments = extractSegments(doc);

        // Per-paragraph icons removed (v1.1.6) — use the toolbar Play button.
        var count = segments.length;
        if (count === 0) {
            setStatus('No text sections found \u2014 navigate to a lesson then click Play');
        }
    }

    /**
     * Collect the readable text sections of the lesson.
     *
     * @param {Document} doc The lesson document.
     * @returns {Array} Sections as {el, text}.
     */
    function extractSegments(doc) {
        // FIX-CV-FALLBACK (v1.0.5): Previously the Rise 360 fallback selector
        // only ran when candidates.length === 0 (no DOM nodes found at all).
        // But Rise 360 pages often have stray <p> tags in nav/accessibility
        // elements — these satisfy candidates.length > 0, then ALL get filtered
        // out (too short, aria-hidden, etc.), and results stays empty while the
        // fallback never fires. Fix: check results.length === 0 AFTER filtering,
        // not candidates.length === 0 BEFORE filtering.
        var results = extractFromCandidates(doc, doc.querySelectorAll(CONTENT_SELECTOR));

        if (results.length === 0) {
            try {
                results = extractFromCandidates(doc, doc.querySelectorAll(RISE_FALLBACK_SELECTOR));
            } catch (e) { /* Ignore invalid selector in older browsers */ }
        }

        return results;
    }

    /**
     * Turn candidate elements into readable sections, skipping hidden and duplicate text.
     *
     * @param {Document} doc The lesson document.
     * @param {NodeList} candidates Elements to consider.
     * @returns {Array} Sections as {el, text}.
     */
    function extractFromCandidates(doc, candidates) {
        var results = [];
        var seenEls = []; // Deduplicate DOM nodes
        var seenText = []; // FIX-CV-AUDIT-DUP (v1.0.6): deduplicate by text content.
                             // Rise 360 sometimes renders the same paragraph in both
                             // a visible element AND an aria-labelled screen-reader clone.
                             // Both pass isAriaHidden() (neither has aria-hidden="true")
                             // but are different DOM nodes — seenEls alone won't catch them.
                             // A second check on the extracted text string prevents the same
                             // sentence being read aloud twice.

        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];

            if (seenEls.indexOf(el) !== -1) {
                continue;
            }
            if (hasForbiddenAncestor(el)) {
                continue;
            }
            if (hasForbiddenAncestorClass(el)) {
                continue;
            } // FIX-CV-IMG-LABELS (v1.1.8)
            if (isAriaHidden(el)) {
                continue;
            }
            if (hasSkipClass(el)) {
                continue;
            }

            // FIX-CV-LI-DUP (v1.1.7): Rise 360 renders <li><p>text</p></li>.
            // Both the <li> and the child <p> are in CONTENT_SELECTOR, causing
            // the same sentence to be read twice. Skip any <li> that contains
            // block-level children — those children will be selected individually.
            var tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'li' && el.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote')) {
                continue;
            }

            var text = cleanText(el);
            if (!text || text.length < 6) {
                continue;
            }
            if (/^[\d\s\W]+$/.test(text)) {
                continue;
            }
            if (seenText.indexOf(text) !== -1) {
                continue;
            }

            seenEls.push(el);
            seenText.push(text);
            results.push({el: el, text: text});
        }

        return results;
    }

    /**
     * Check whether the element sits inside navigation, images or other parts that are not read.
     *
     * @param {Element} el Element to check.
     * @returns {Boolean} True if it should be skipped.
     */
    function hasForbiddenAncestor(el) {
        var node = el.parentElement;
        while (node && node !== document.body) {
            var tag = node.tagName ? node.tagName.toLowerCase() : '';
            if (SKIP_TAGS[tag]) {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    // FIX-CV-IMG-LABELS (v1.1.8): Check ancestor CSS classes as well as tags.
    // A <p> inside .labeled-graphic__label won't have that class itself — only
    // ancestor class matching can block it. Mirrors hasForbiddenAncestor logic.
    /**
     * Check whether an ancestor has a class marking image labels, captions or galleries.
     *
     * @param {Element} el Element to check.
     * @returns {Boolean} True if it should be skipped.
     */
    function hasForbiddenAncestorClass(el) {
        var node = el.parentElement;
        while (node && node !== document.body) {
            var cls = (node.className || '').toLowerCase();
            for (var j = 0; j < SKIP_ANCESTOR_CLASS_PATTERNS.length; j++) {
                if (cls.indexOf(SKIP_ANCESTOR_CLASS_PATTERNS[j]) !== -1) {
                    return true;
                }
            }
            node = node.parentElement;
        }
        return false;
    }

    /**
     * Check whether the element or an ancestor is hidden from screen readers.
     *
     * @param {Element} el Element to check.
     * @returns {Boolean} True if hidden.
     */
    function isAriaHidden(el) {
        var node = el;
        while (node) {
            if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    /**
     * Check whether the element has a class that marks it as not readable.
     *
     * @param {Element} el Element to check.
     * @returns {Boolean} True if it should be skipped.
     */
    function hasSkipClass(el) {
        var className = (el.className || '').toLowerCase();
        for (var i = 0; i < SKIP_CLASS_PATTERNS.length; i++) {
            if (className.indexOf(SKIP_CLASS_PATTERNS[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the readable text of an element, without hidden and image text.
     *
     * @param {Element} el Element to read.
     * @returns {String} The cleaned text.
     */
    function cleanText(el) {
        var clone = el.cloneNode(true);

        // Remove elements that must never contribute text.
        // FIX-CV-IMG-LABELS (v1.1.8): Added [role="img"] (elements acting as images
        // that may have text children serving as alt descriptions) and figcaption
        // (image captions embedded inside figure elements that may appear as children
        // of otherwise valid content blocks).
        var removables = clone.querySelectorAll(
            'img, svg, canvas, button, figcaption, [role="img"], ' +
            '[aria-hidden="true"], .sr-only, ' +
            '.visually-hidden, [aria-label]:not([role="text"]), noscript'
        );
        for (var i = 0; i < removables.length; i++) {
            if (removables[i].parentNode) {
                removables[i].parentNode.removeChild(removables[i]);
            }
        }

        return (clone.textContent || clone.innerText || '').replace(/\s+/g, ' ').trim();
    }

    // InjectIcon removed in v1.1.6 — per-paragraph icons replaced by toolbar-only UX.

    // ── Mutation observer: re-inject when Rise 360 navigates to next screen ────
    // FIX-CV-RISE-DETECT (v1.1.0): Signature changed from (frame, doc) to (doc).
    // Rise 360 uses React routing — navigating between lesson pages mutates the
    // existing document's DOM rather than loading a new iframe document. The
    // mutation callback now uses iframeDoc directly (already the resolved Rise 360
    // document) instead of re-accessing frame.contentDocument (which would return
    // the outer SCORM shell document if frame was the wrapper, not the Rise frame).
    /**
     * Rescan the lesson when Rise renders new content.
     *
     * @param {Document} doc The lesson document.
     */
    function watchContentMutations(doc) {
        if (iframeObs) {
            iframeObs.disconnect();
        }

        var debounce = null;

        iframeObs = new MutationObserver(function(mutations) {
            // Only react to substantial DOM additions (Rise 360 routing)
            var hasNewElements = false;
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    if (added[j].nodeType === 1) { // ELEMENT_NODE
                        hasNewElements = true;
                        break;
                    }
                }
                if (hasNewElements) {
                    break;
                }
            }
            if (!hasNewElements) {
                return;
            }

            if (debounce) {
                clearTimeout(debounce);
            }
            debounce = setTimeout(function() {
                try {
                    // IframeDoc is already the resolved Rise 360 content document.
                    stopAll();
                    rebuildIcons(iframeDoc);
                } catch (e) { /* Cross-origin race */ }
            }, 900);
        });

        iframeObs.observe(doc.body, {childList: true, subtree: true});
    }

    // ── Inject CSS into the Rise 360 iframe ───────────────────────────────────
    /**
     * Add the highlight styles to the lesson document.
     *
     * @param {Document} doc The lesson document.
     */
    function injectIframeStyles(doc) {
        if (doc.getElementById('chirp-iframe-css')) {
            return;
        }
        var s = doc.createElement('style');
        s.id = 'chirp-iframe-css';
        s.textContent =
            /* Currently-reading element highlight (v1.1.10).
               box-shadow: inset keeps the border INSIDE the element box so it
               never overlaps adjacent list items (outline would bleed outside).
               position:relative + z-index ensure the shadow renders above siblings. */
            '.chirp-hl{' +
            '  background:rgba(37,99,235,0.09)!important;' +
            '  border-radius:3px;' +
            '  box-shadow:inset 0 0 0 2px rgba(37,99,235,0.28);' +
            '  padding:5px 10px!important;' +
            '  position:relative;' +
            '  z-index:1;' +
            '  transition:background 0.25s,box-shadow 0.25s;' +
            '}';
        if (doc.head) {
            doc.head.appendChild(s);
        }
    }

    // ── AudioContext helpers ───────────────────────────────────────────────────
    // FIX-CV-AUTOPLAY (v1.1.5): browsers block audio.play() called from async
    // XHR callbacks because the user-gesture token has expired by the time the
    // TTS response arrives. AudioContext sidesteps this: creating/resuming the
    // context during the click unlocks it permanently for the page session, and
    // BufferSource.start() from any async callback plays without restriction.
    //
    // FIX-CV-MAC-RESUME (v1.1.32): .resume() returns a Promise. On Mac Safari
    // the AudioContext stays in 'suspended' state for a brief moment after the
    // synchronous .resume() call. Calling BufferSource.start() before the
    // promise resolves silently fails on Safari — audio never plays.
    // Fix: accept an optional callback that fires only once the context is
    // confirmed 'running'. AudioContext creation + .resume() still happen
    // synchronously inside the user-gesture handler (required by all browsers).
    // The callback fires in the .then() microtask — still within the gesture
    // window for Chrome, and safely after resume for Safari.
    /**
     * Unlock audio during the user's click, then run the callback.
     *
     * @param {Function} onReady Runs once audio can play.
     */
    function unlockAudioCtx(onReady) {
        /**
         * Run the ready callback.
         *
         * @returns {null} Nothing.
         */
        var run = function() {
            if (onReady) {
                onReady();
            }
            return null;
        };
        if (!chirpCtx) {
            chirpCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (chirpCtx.state === 'suspended') {
            // If resume fails, still try to play: the browser reports its own error.
            chirpCtx.resume().then(run).catch(run);
        } else {
            run();
        }
    }

    // Start playing an AudioBuffer from a given offset (seconds).
    // Stores references so pause/resume can stop and restart from same position.
    /**
     * Play decoded audio from an offset, keeping state for pause and resume.
     *
     * @param {AudioBuffer} buffer Decoded audio.
     * @param {Number} offset Start position in seconds.
     * @param {Function} onDone Runs when the audio ends.
     */
    function _playBuffer(buffer, offset, onDone) {
        activeBuffer = buffer;
        activeOnDone = onDone;
        segStartTime = chirpCtx.currentTime - offset;

        activeSource = chirpCtx.createBufferSource();
        activeSource.buffer = buffer;
        activeSource.connect(chirpCtx.destination);
        // Speed is controlled entirely by speakingRate on the server (Google TTS).
        // DO NOT set playbackRate here — it shifts pitch (chipmunk effect).
        activeSource.onended = function() {
            activeSource = null;
            pauseOffset = 0;
            if (onDone && isPlaying) {
                onDone();
            }
        };
        activeSource.start(0, offset);
    }

    // ── Playback: Play All ─────────────────────────────────────────────────────
    /**
     * Read every section from the start.
     */
    function onPlayAll() {
        // FIX-CV-CONTENT-DELAY (v1.0.2): if segments is still empty (e.g. the
        // user clicked Play before the async 1.2 s rebuild fired), do a
        // synchronous rescan of the current iframeDoc before giving up.
        if (segments.length === 0 && iframeDoc) {
            try {
                rebuildIcons(iframeDoc);
            } catch (e) {
                // Ignore: the rescan is a best-effort retry.
            }
        }
        if (segments.length === 0) {
            setStatus('No content found \u2014 navigate to a lesson page and try again.');
            return;
        }
        // FIX-CV-NO-CREDS (v1.1.32): Show a helpful message if the plugin has
        // not been configured (no Site ID / API Key). Previously the XHR would
        // fire, ajax.php would return an error JSON, and setStatus() would show
        // "Error: AI Voiceover is not configured..." — but since #chirp-status
        // had been removed from the toolbar in v1.1.13, the message was
        // invisible. Now we show it before even attempting the XHR.
        if (!mCfg.hasCredentials) {
            setStatus('Not configured \u2014 set Site ID & API Key in Site Admin \u2192 AI SCORM Voiceover.');
            return;
        }
        // FIX-CV-MAC-RESUME (v1.1.32): AudioContext creation + resume() happen
        // synchronously here (inside the click handler = user gesture context).
        // Playback starts in the callback once the context is confirmed running.
        // On Mac Safari, starting before resume() resolves silently fails.
        unlockAudioCtx(function() {
            stopAll();
            isPlaying = true;
            isPaused = false;
            curIdx = 0;
            setBtns(true);
            playSegAt(0);
        });
    }


    /**
     * Read the section at an index, then move to the next.
     *
     * @param {Number} idx Section index.
     */
    function playSegAt(idx) {
        if (!isPlaying || isPaused || idx >= segments.length) {
            if (idx >= segments.length && isPlaying) {
                finishAll();
            }
            return;
        }
        curIdx = idx;

        highlightSeg(idx);
        fetchAndPlay(segments[idx].text, function() {
            clearHl();
            if (isPlaying && !isPaused) {
                playSegAt(idx + 1);
            }
        });
    }

    // ── Playback: Pause / Resume ───────────────────────────────────────────────
    /**
     * Pause or resume reading.
     */
    function onPauseResume() {
        var btn = document.getElementById('chirp-pause');
        if (!chirpCtx) {
            return;
        }
        if (!isPaused) {
            // Pause: stop the source and record where we are
            if (activeSource) {
                pauseOffset = Math.max(0, chirpCtx.currentTime - segStartTime);
                try {
                    activeSource.onended = null;
                    activeSource.stop();
                } catch (e) {
                    // Ignore: the source may already have stopped.
                }
                activeSource = null;
            }
            isPaused = true;
            isPlaying = false;
            if (btn) {
                btn.innerHTML = '&#9654; Resume';
            }
        } else {
            // Resume: restart from saved offset
            if (activeBuffer) {
                isPaused = false;
                isPlaying = true;
                if (btn) {
                    btn.innerHTML = '&#9646;&#9646; Pause';
                }
                _playBuffer(activeBuffer, pauseOffset, activeOnDone);
            }
        }
    }

    // ── Playback: Stop ─────────────────────────────────────────────────────────
    /**
     * Stop reading.
     */
    function onStop() {
        stopAll();
        finishAll();
    }

    /**
     * Stop audio and clear the reading state.
     */
    function stopAll() {
        isPlaying = false;
        if (activeSource) {
            try {
                activeSource.onended = null;
                activeSource.stop();
            } catch (e) {
                // Ignore: the source may already have stopped.
            }
            activeSource = null;
        }
        activeBuffer = null;
        activeOnDone = null;
        pauseOffset = 0;
        prefetchCache = {}; // Discard any pre-fetched buffers on stop
        clearHl();
    }

    /**
     * Reset the toolbar after the last section.
     */
    function finishAll() {
        isPlaying = false;
        isPaused = false;
        clearHl();
        setBtns(false);
    }

    // ── Highlight currently-reading element ────────────────────────────────────
    // FIX-CV-HL-TARGET (v1.1.10): After v1.1.7, the segment element for a Rise 360
    // <li><p>text</p></li> bullet is the inner <p>, not the <li>.  Highlighting the
    // <p> leaves the list-item marker area unstyled and looks wrong.  Walk up to the
    // parent <li> (if one exists within two hops) so the highlight covers the whole
    // visual bullet.  Stop at ul/ol/div/section — never climb past a list container.
    /**
     * Choose the element to highlight; a bullet's paragraph highlights its whole list item.
     *
     * @param {Element} el The section element.
     * @returns {Element} The element to highlight.
     */
    function getHighlightEl(el) {
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'li') {
            return el;
        }
        var par = el.parentElement;
        while (par) {
            var ptag = par.tagName ? par.tagName.toLowerCase() : '';
            if (ptag === 'li') {
                return par;
            }
            if (ptag === 'ul' || ptag === 'ol' || ptag === 'div' ||
                ptag === 'section' || ptag === 'article' || ptag === 'body') {
                    break;
                }
            par = par.parentElement;
        }
        return el;
    }

    /**
     * Highlight a section and scroll it into view.
     *
     * @param {Number} idx Section index.
     */
    function highlightSeg(idx) {
        clearHl();
        var seg = segments[idx];
        if (!seg) {
            return;
        }
        var hlEl = getHighlightEl(seg.el);
        hlEl.classList.add('chirp-hl');
        try {
            hlEl.scrollIntoView({behavior: 'smooth', block: 'center'});
        } catch (e) {
            // Ignore: older browsers do not support smooth scrolling.
        }
    }

    /**
     * Remove the current highlight.
     */
    function clearHl() {
        if (!iframeDoc) {
            return;
        }
        var hls = iframeDoc.querySelectorAll('.chirp-hl');
        for (var i = 0; i < hls.length; i++) {
            hls[i].classList.remove('chirp-hl');
        }
    }

    // ── TTS fetch via ajax.php ─────────────────────────────────────────────────
    /**
     * Fetch speech for the text and play it.
     *
     * @param {String} text Text to read.
     * @param {Function} onDone Runs when playback ends.
     */
    function fetchAndPlay(text, onDone) {
        // PERF-CV-PREFETCH (v1.1.7): Check if the next segment was pre-fetched
        // while the previous one was playing — use it directly to eliminate gaps.
        if (prefetchCache[curIdx] && prefetchCache[curIdx] !== 'pending') {
            var cached = prefetchCache[curIdx];
            delete prefetchCache[curIdx];
            // FIX-CV-HL-PERSIST (v1.1.11): Do NOT call stopAll() here.
            // stopAll() calls clearHl(), erasing the highlight that playSegAt()
            // just set — so the segment played with no visual highlight at all.
            // stopAll() also wipes prefetchCache entirely, defeating the prefetch.
            // Instead, just defensively stop any lingering audio source.
            if (activeSource) {
                try {
                    activeSource.onended = null;
                    activeSource.stop();
                } catch (e) {
                    // Ignore: the source may already have stopped.
                }
                activeSource = null;
            }
            isPlaying = true;
            _playBuffer(cached, 0, onDone);
            prefetchNext(curIdx + 1);
            return;
        }

        var voice = resolvedVoice;
        var lang = resolvedLang;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', mCfg.proxyUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.onload = function() {
            if (!isPlaying && !isPaused) {
                return;
            }
            var resp;
            try {
                resp = JSON.parse(xhr.responseText);
            } catch (e) {
                setStatus('Parse error from TTS service');
                finishAll();
                return;
            }
            if (resp && resp.ok && resp.audioContent) {
                playBase64(resp.audioContent, onDone);
            } else {
                var msg = (resp && resp.error) ? resp.error : 'TTS request failed';
                setStatus('Error: ' + msg.substring(0, 80));
                finishAll();
            }
        };

        xhr.onerror = function() {
            setStatus('Network error. Check API credentials in plugin settings.');
            finishAll();
        };

        xhr.ontimeout = function() {
            setStatus('TTS request timed out. Try a shorter section.');
            finishAll();
        };

        xhr.timeout = 30000;

        var body = {
            sesskey: mCfg.sesskey,
            action: 'synthesize',
            text: text.substring(0, 4500),
            voice: voice,
            language: lang,
            speakingRate: chirpSpeed, // FEAT-CV-SPEAKINGRATE (v1.1.18)
            courseid: mCfg.courseId || 0
        };

        // FIX-CV-HEADING-GAP (v1.1.23): kick off the NEXT segment's fetch in parallel
        // with this one. Without this, the next segment only starts fetching after
        // the current one finishes playing — causing a ~3 s gap for short headings.
        // prefetchNext guards against double-fetching (no-op if already pending/done).
        prefetchNext(curIdx + 1);

        xhr.send(JSON.stringify(body));
    }

    // ── Prefetch next segment while current one is playing ────────────────────
    // PERF-CV-PREFETCH (v1.1.7): Fires a background TTS request for segment idx
    // while the previous segment is still audible. By the time the current audio
    // ends (~3–10 s), the next segment's audio is already decoded and ready in
    // prefetchCache — fetchAndPlay picks it up immediately with no gap.
    //
    // FIX-CV-CASCADE-PREFETCH (v1.1.25): After decoding segment idx, immediately
    // also start prefetchNext(idx+1) — one cascade level only (isCascade guard).
    // Root cause of heading→paragraph gap: the heading (e.g. "Porosity") was
    // pre-fetched while the previous long paragraph played, but paragraph idx+1
    // only started fetching when the heading STARTED playing (~0.5 s clip).
    // 0.5 s audio < 3–5 s paragraph TTS synthesis → 2–4 s silence gap.
    // With cascade: when the heading is DECODED (while previous paragraph still
    // plays), the paragraph fetch fires immediately.  By the time the previous
    // paragraph ends and the heading plays, the paragraph is already cached →
    // zero gap.
    //
    // FIX-CV-DEEP-CASCADE (v1.1.30): Extend cascade from 1 level to 2 levels.
    // Root cause of gap resurfacing on cold TTS cache (e.g. after switching to a
    // new voice/accent): changing voice or language invalidates all server-side
    // audio. On a cold cache each synthesis takes 3–5 s. A 1-level cascade fires
    // prefetch(N+1) when N is decoded, but if the segment BEFORE the heading is
    // short (<3 s), the 2nd-level paragraph (N+2) only starts fetching when N+1
    // STARTS playing — again too late. With a 2-level cascade, prefetch(N+2)
    // fires as soon as N+1 is decoded (while para0 is still playing), giving 10+
    // seconds for two cold-cache syntheses to complete before either short segment
    // can expose the gap.
    // isCascade is now a numeric depth (0 = normal, 1 = first cascade,
    // 2 = second cascade). Cascade stops at depth ≥ 2.
    /**
     * Fetch the next section's speech in the background so there is no gap.
     *
     * @param {Number} idx Section index.
     * @param {Number} cascadeDepth How many prefetches deep this call is (0 for the first).
     */
    function prefetchNext(idx, cascadeDepth) {
        cascadeDepth = cascadeDepth || 0;
        if (!isPlaying || !chirpCtx) {
            return;
        }
        if (idx >= segments.length) {
            return;
        }
        if (prefetchCache[idx]) {
            return;
        } // Already fetching or fetched

        prefetchCache[idx] = 'pending';

        var voice = resolvedVoice;
        var lang = resolvedLang;
        // FIX-CV-PREFETCH-SPEED (v1.1.24): capture speed at send time.
        // If the user changes speed before this XHR returns, the audio is stale
        // (baked at the old speakingRate). Discard it so the correct-speed audio
        // is fetched fresh when the segment actually plays.
        var speedWhenSent = chirpSpeed;

        var xhr = new XMLHttpRequest();
        xhr.open('POST', mCfg.proxyUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.timeout = 30000;

        xhr.onload = function() {
            if (!isPlaying || chirpSpeed !== speedWhenSent) {
                delete prefetchCache[idx]; return;
            }
            try {
                var resp = JSON.parse(xhr.responseText);
                if (resp && resp.ok && resp.audioContent) {
                    var raw = atob(resp.audioContent);
                    var buf = new Uint8Array(raw.length);
                    for (var i = 0; i < raw.length; i++) {
                        buf[i] = raw.charCodeAt(i);
                    }
                    chirpCtx.decodeAudioData(buf.buffer.slice(0), function(decoded) {
                        if (isPlaying) {
                            prefetchCache[idx] = decoded;
                            // FIX-CV-DEEP-CASCADE (v1.1.30): 2-level cascade.
                            // depth 0 → fires depth 1 (heading prefetch → para prefetch)
                            // depth 1 → fires depth 2 (para prefetch → next-para prefetch)
                            // depth 2 → stops. Eliminates gap on cold TTS cache.
                            if (cascadeDepth < 2) {
                                prefetchNext(idx + 1, cascadeDepth + 1);
                            }
                        } else {
                            delete prefetchCache[idx];
                        }
                    }, function() {
                        delete prefetchCache[idx];
                    });
                } else {
                    delete prefetchCache[idx];
                }
            } catch (e) {
                delete prefetchCache[idx];
            }
        };
        xhr.onerror = xhr.ontimeout = function() {
            delete prefetchCache[idx];
        };

        xhr.send(JSON.stringify({
            sesskey: mCfg.sesskey,
            action: 'synthesize',
            text: segments[idx].text.substring(0, 4500),
            voice: voice,
            language: lang,
            speakingRate: chirpSpeed, // FEAT-CV-SPEAKINGRATE (v1.1.18)
            courseid: mCfg.courseId || 0
        }));
    }

    // ── Base64 → AudioContext playback ────────────────────────────────────────
    // FIX-CV-AUTOPLAY (v1.1.5): AudioContext is unlocked during the user click
    // (via unlockAudioCtx in onPlayAll), so BufferSource.start()
    // can be called from any async callback without autoplay policy interference.
    /**
     * Decode base64 audio and play it.
     *
     * @param {String} b64 Base64 MP3 audio.
     * @param {Function} onDone Runs when playback ends.
     */
    function playBase64(b64, onDone) {
        if (!chirpCtx) {
            setStatus('Audio not ready \u2014 click Play again.');
            finishAll();
            return;
        }

        var raw, pcmBuf;
        try {
            raw = atob(b64);
            pcmBuf = new Uint8Array(raw.length);
            for (var i = 0; i < raw.length; i++) {
                pcmBuf[i] = raw.charCodeAt(i);
            }
        } catch (e) {
            setStatus('Audio decode error: ' + e.message);
            finishAll();
            return;
        }

        // DecodeAudioData needs a copy of the ArrayBuffer (it transfers ownership)
        chirpCtx.decodeAudioData(pcmBuf.buffer.slice(0), function(decoded) {
            if (!isPlaying) {
                return;
            } // Stop was clicked while TTS was decoding
            // FIX-CV-HL-MISSING (v1.1.17): Do NOT call stopAll() here.
            // stopAll() calls clearHl(), erasing the highlight that playSegAt()
            // already set before the async XHR + decode completed — so every
            // cache-miss segment (first segment, prefetch not ready yet) played
            // audio correctly but with the highlight gone.
            // The cache-hit path (line ~874) already uses this safer pattern.
            // Mirror it: stop only the lingering BufferSource, leave highlight/cache.
            if (activeSource) {
                try {
                    activeSource.onended = null;
                    activeSource.stop();
                } catch (e) {
                    // Ignore: the source may already have stopped.
                }
                activeSource = null;
            }
            isPlaying = true;
            _playBuffer(decoded, 0, onDone);
            prefetchNext(curIdx + 1); // Start fetching the next segment now
        }, function(e) {
            setStatus('Audio decode error: ' + (e && e.message ? e.message : 'unknown'));
            finishAll();
        });
    }

    // ── Public export ──────────────────────────────────────────────────────────
    return {init: init};
});

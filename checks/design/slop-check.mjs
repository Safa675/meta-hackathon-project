#!/usr/bin/env node
// Slop check: fail on the UI patterns DESIGN.md bans in every project.
//
//   node checks/design/slop-check.mjs              scan tracked files
//   node checks/design/slop-check.mjs a.tsx src/   scan only these files (a directory: its tracked files)
//   node checks/design/slop-check.mjs --strict     warnings fail too
//   node checks/design/slop-check.mjs --rules      list the rules
//
// Exit 0 = clean or warnings only. Exit 1 = errors (or warnings under --strict).
// Exit 2 = bad flag or missing path.
//
// Suppress one finding on the same or the previous line, and say why:
//   /* slop-ignore slop/glassmorphism: dialog backdrop, not a card surface */
// A suppression without a reason is itself an error.
//
// Patterns catch the literal forms only. How the page looks still needs a
// screenshot and a person. A rule that keeps needing suppressions belongs back
// in DESIGN.md prose, not here. Zero dependencies, Node 18+.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const LUCIDE_MAX_ICONS = 6;
const MAX_BYTES = 1_000_000;

// Always skipped. Build output is left to .gitignore: a folder named build/ or
// out/ inside src/ is real code.
const SKIP = /(^|\/)node_modules\/|^vendor\/|\.min\.|(^|\/)DESIGN\.md$|(^|\/)checks\/design\//;
// Also skipped by the fallback walk, which has no .gitignore to lean on.
const WALK_SKIP = /(^|\/)(\.git|dist|build|out|coverage|vendor|\.next|\.nuxt|\.svelte-kit|\.turbo|\.vercel)\//;
const LOCALE_DIR = /(^|\/)(locales?|i18n|messages|lang|translations)\//;

// style: stylesheets. sfc: markup that can hold <style> blocks. jsx: JSX/MDX.
// script: plain JS/TS (tailwind config, class-name helpers). locale: copy catalogs.
function kindOf(path) {
  const ext = extname(path).toLowerCase();
  if (['.css', '.scss', '.sass', '.less', '.pcss'].includes(ext)) return 'style';
  if (['.html', '.htm', '.vue', '.svelte', '.astro'].includes(ext)) return 'sfc';
  if (['.jsx', '.tsx', '.mdx'].includes(ext)) return 'jsx';
  if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return 'script';
  if (ext === '.json' && LOCALE_DIR.test(path)) return 'locale';
  return null;
}

const CODE = ['style', 'sfc', 'jsx', 'script'];
const CSSY = ['style', 'sfc'];
const UI = ['sfc', 'jsx', 'script'];
const COPY = ['sfc', 'jsx', 'locale'];

// ---------------------------------------------------------------- spacing scale

// The project's scale, or null while DESIGN.md has none or still holds a
// {{placeholder}} step. There is no built-in fallback: a default scale enforced
// in every project is the kind of shared default DESIGN.md exists to avoid.
function spacingScale(root) {
  const path = join(root, 'DESIGN.md');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1].match(/^spacing:\n((?:[ \t]+.*(?:\n|$))*)/m);
  if (!block || block[1].includes('{{')) return null;
  const values = new Set([0]);
  for (const [, n, unit] of block[1].matchAll(/:\s*["']?(\d*\.?\d+)(px|rem)["']?\s*$/gm)) {
    values.add(unit === 'rem' ? Number(n) * 16 : Number(n));
  }
  return values.size > 1 ? values : null;
}

let SCALE = null;
const toPx = (n, unit) => (unit === 'rem' || unit === 'em' ? Number(n) * 16 : Number(n));
// 1px and below is a hairline offset (sr-only margin: -1px, a border nudge), not spacing.
const onScale = (px) => Math.abs(px) <= 1 || SCALE.has(Math.abs(px));

// ---------------------------------------------------------------- helpers

function inComment(ctx, index, lineText, col) {
  if (/(^|[^:])\/\//.test(lineText.slice(0, col))) return true;
  // Block comments by their real extent, so an MDX "* item" line is not one.
  ctx.blocks ??= [...ctx.text.matchAll(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g)].map((m) => [m.index, m.index + m[0].length]);
  let lo = 0;
  let hi = ctx.blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = ctx.blocks[mid];
    if (index < start) hi = mid - 1;
    else if (index >= end) lo = mid + 1;
    else return true;
  }
  return false;
}

// Nearest non-space characters on either side of a match, looking a short way.
function neighbors(ctx, m) {
  const prev = ctx.text.slice(Math.max(0, m.index - 80), m.index).match(/(\S)\s*$/)?.[1] ?? '';
  const next = ctx.text.slice(m.index + m[0].length, m.index + m[0].length + 80).match(/^\s*(\S)/)?.[1] ?? '';
  return { prev, next };
}

// Quoted strings on one line: where class names live in every framework.
const QUOTED = /(["'`])((?:(?!\1)[^\n])*)\1/g;

// ---------------------------------------------------------------- rules

const RULES = [
  {
    id: 'slop/gradient-text',
    severity: 'error',
    kinds: CODE,
    message: 'Text filled with a gradient.',
    instead: 'Give text one solid color from the palette.',
    patterns: [/-?(?:webkit-)?background-clip\s*:\s*text\b/g, /\bbg-clip-text\b/g, /\bbackgroundClip\s*:\s*['"`]text/g],
  },
  {
    id: 'slop/glassmorphism',
    severity: 'error',
    kinds: CODE,
    message: 'Translucent surface over a backdrop blur.',
    instead: 'Use an opaque surface; show depth with tone or a hairline border.',
    patterns: [/backdrop-filter\s*:\s*blur/g, /\bbackdrop-blur(?:-[\w.[\]]+)?(?![\w-])/g, /\bbackdropFilter\s*:\s*['"`]blur/g],
    accept: (m) => m[0] !== 'backdrop-blur-none',
  },
  {
    id: 'slop/font-inter',
    severity: 'error',
    kinds: CODE,
    message: 'Inter as a typeface.',
    instead: 'Choose a family for this subject and write the reason in DESIGN.md > Typography.',
    patterns: [
      /font-family\s*:[^;{}\n]*?(?<![\w-])["']?Inter(?: var| Variable| Tight| Display)?["']?(?![\w-])/gi,
      /import\s*\{[^}]*\bInter(?:_Tight)?\b[^}]*\}\s*from\s*['"](?:@?next\/font)/g,
      /family=Inter(?:\+Tight)?(?=[:&"'\s)]|$)/g,
      /@fontsource(?:-variable)?\/inter(?:-tight)?\b/g,
      /['"`]Inter(?: var| Variable| Tight| Display)?['"`]/g,
      /\bfont-inter\b/g,
    ],
  },
  {
    id: 'slop/font-pair',
    severity: 'error',
    kinds: CODE,
    message: 'Space Grotesk paired with Instrument Serif (both appear in this project).',
    instead: 'Choose a pairing for this subject and write the reason in DESIGN.md > Typography.',
    // Collected per file, reported only if both families appear across the scan.
    patterns: [/space[\s_+-]?grotesk/gi, /instrument[\s_+-]?serif/gi],
    crossFile: true,
  },
  {
    id: 'slop/purple-blue-gradient',
    severity: 'error',
    kinds: CODE,
    message: 'Purple-to-blue gradient.',
    instead: 'Use a flat surface. A gradient is allowed only when it encodes data.',
    // (?!\1-) skips a same-hue stop (via-indigo after from-indigo) without
    // consuming the real partner further along.
    patterns: [
      /\b(?:from|via)-(purple|violet|fuchsia|indigo)-\d{2,3}\b[^"'`\n]*?\b(?:via|to)-(?!\1-)(?:blue|sky|cyan|indigo)-\d{2,3}\b/g,
      /\b(?:from|via)-(blue|sky|cyan|indigo)-\d{2,3}\b[^"'`\n]*?\b(?:via|to)-(?!\1-)(?:purple|violet|fuchsia|indigo)-\d{2,3}\b/g,
    ],
  },
  {
    id: 'slop/emoji-heading',
    severity: 'error',
    kinds: ['sfc', 'jsx'],
    message: 'Emoji in a heading.',
    instead: 'Let the words carry the heading.',
    patterns: [
      /<(h[1-6]|Heading|Title)\b[^>]*>[^<]*?(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gu,
      /^#{1,6}\s[^\n]*?(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/gmu,
    ],
  },
  {
    id: 'slop/em-dash-copy',
    severity: 'error',
    kinds: COPY,
    message: 'Em dash in UI copy.',
    instead: 'Use a period, comma, colon, or parentheses.',
    patterns: [/\u2014|&mdash;|&#8212;|\\u2014/g],
    skipComments: true,
    // A dash alone in a string or element ('\u2014', <td>\u2014</td>) is an empty-value
    // placeholder, not a sentence.
    accept: (m, ctx) => {
      const { prev, next } = neighbors(ctx, m);
      return !(/["'`>{]/.test(prev) && /["'`<}]/.test(next));
    },
  },
  {
    id: 'slop/off-scale-spacing',
    severity: 'error',
    kinds: CODE,
    message: 'Spacing value not on the scale.',
    instead: 'Use a step from DESIGN.md spacing, or add the step there first.',
    run(ctx) {
      const hits = [];
      if (!SCALE) return hits;
      if (UI.includes(ctx.kind)) {
        const tw =
          /(?<![\w-])(-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]))-\[(-?\d*\.?\d+)(px|rem|em)\]/g;
        for (const m of ctx.text.matchAll(tw)) {
          if (!onScale(toPx(m[2], m[3]))) hits.push({ index: m.index, detail: ` ${m[0]} is off DESIGN.md spacing.` });
        }
      }
      if (CSSY.includes(ctx.kind)) {
        const css =
          /(?<![\w-])(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?\s*:\s*([^;{}\n]+)/g;
        for (const m of ctx.text.matchAll(css)) {
          const bad = [...m[1].matchAll(/(-?\d*\.?\d+)(px|rem)\b/g)].filter(([, n, u]) => !onScale(toPx(n, u)));
          if (bad.length) {
            hits.push({ index: m.index, detail: ` ${bad.map((b) => b[0]).join(', ')} is off DESIGN.md spacing.` });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'slop/gradient',
    severity: 'warning',
    kinds: CODE,
    message: 'Gradient.',
    instead: 'Keep it only if it encodes data, and name it in DESIGN.md > Colors.',
    patterns: [/\b(?:repeating-)?(?:linear|radial|conic)-gradient\(/g, /\bbg-(?:gradient-to|linear|radial|conic)-[\w[\]-]+/g],
  },
  {
    id: 'slop/grain-overlay',
    severity: 'warning',
    kinds: CODE,
    message: 'Grain or noise texture.',
    instead: 'Remove it. Surfaces are flat.',
    patterns: [/\bfeTurbulence\b/g, /\b(?:noise|grain)\.(?:png|svg|webp|avif)\b/g],
  },
  {
    id: 'slop/opacity-hover',
    severity: 'warning',
    kinds: CODE,
    message: 'Hover only changes opacity.',
    instead: 'Change color, underline, or elevation, with a matching focus-visible style.',
    run(ctx) {
      const hits = [];
      if (UI.includes(ctx.kind)) {
        for (const m of ctx.text.matchAll(QUOTED)) {
          const classes = m[2];
          const at = classes.search(/\bhover:opacity-/);
          if (at >= 0 && !/\bhover:(?!opacity-)/.test(classes)) hits.push({ index: m.index + 1 + at });
        }
      }
      if (CSSY.includes(ctx.kind)) {
        // Match the block alone and look back for its selector: a selector group
        // in the regex backtracks quadratically over brace-free HTML.
        for (const m of ctx.text.matchAll(/\{([^{}]*)\}/g)) {
          const start = Math.max(ctx.text.lastIndexOf('}', m.index - 1), ctx.text.lastIndexOf('{', m.index - 1)) + 1;
          const selector = ctx.text.slice(start, m.index);
          const hover = selector.lastIndexOf(':hover');
          if (hover < 0) continue;
          const props = [...m[1].matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]);
          if (props.includes('opacity') && props.every((p) => /^(opacity|transition(-[\w-]+)?|cursor)$/.test(p))) {
            hits.push({ index: start + selector.slice(0, hover).search(/[^\s,;>]*$/) });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'slop/scroll-reveal',
    severity: 'warning',
    kinds: UI,
    message: 'Content animates in on scroll.',
    instead: 'Content is visible when it scrolls into view. Animate only in answer to an action.',
    patterns: [/\bwhileInView\b/g, /\bdata-aos\b/g, /\bAOS\.init\b/g, /from\s+['"]aos['"]/g, /\bScrollTrigger\b/g, /\banimate-on-scroll\b/g],
  },
  {
    id: 'slop/cursor-follow',
    severity: 'warning',
    kinds: UI,
    message: 'Effect that tracks the pointer.',
    instead: 'Remove it. Nothing follows the pointer.',
    run(ctx) {
      const move = ctx.text.search(/\b(?:mousemove|pointermove|onMouseMove|onPointerMove)\b/);
      const effect = /radial-gradient|--(?:mouse|cursor|pointer)[\w-]*|spotlight|beam|glow/i.test(ctx.text);
      return move >= 0 && effect ? [{ index: move }] : [];
    },
  },
  {
    id: 'slop/colored-border-card',
    severity: 'warning',
    kinds: CODE,
    message: 'Colored accent border on one side.',
    instead: 'Separate with space or tone, or a neutral outline all around.',
    run(ctx) {
      const hits = [];
      if (UI.includes(ctx.kind)) {
        for (const m of ctx.text.matchAll(QUOTED)) {
          const side = m[2].search(/\bborder-[lts]-(?:2|4|8)\b/);
          if (side >= 0 && /\bborder-(?!gray|slate|zinc|neutral|stone|white|black|transparent)[a-z]+-\d{2,3}\b/.test(m[2])) {
            hits.push({ index: m.index + 1 + side });
          }
        }
      }
      if (CSSY.includes(ctx.kind)) {
        for (const m of ctx.text.matchAll(/border-(?:left|top|inline-start|block-start)\s*:\s*(\d+)px\s+solid\b/g)) {
          if (Number(m[1]) >= 2) hits.push({ index: m.index });
        }
      }
      return hits;
    },
  },
  {
    id: 'slop/buzzword',
    severity: 'warning',
    kinds: COPY,
    message: 'Buzzword copy.',
    instead: 'Say what the product does, in words a competitor could not reuse.',
    patterns: [
      /\b(?:seamless(?:ly)?|effortless(?:ly)?|unlock|supercharge[ds]?|elevate[sd]?|empower(?:s|ed|ing)?|revolutioni[sz](?:e|es|ed|ing)|next-gen(?:eration)?|cutting-edge|game-chang(?:ing|er)|all-in-one|built for the modern)\b/gi,
    ],
    skipComments: true,
    // Skip identifiers: ({ unlock }), onClick={unlock}, unlock(), elevate: 2.
    accept: (m, ctx) => {
      const { prev, next } = neighbors(ctx, m);
      return !(/[.{(]/.test(prev) || /[(}=:)]/.test(next) || (prev === ',' && /[,}]/.test(next)));
    },
    detail: (m) => ` Found "${m[0]}".`,
  },
  {
    id: 'slop/icon-everywhere',
    severity: 'warning',
    kinds: UI,
    message: 'Too many Lucide icons in one file.',
    instead: 'Keep an icon only where it adds meaning the text does not carry.',
    run(ctx) {
      const hits = [];
      const re = /import\s*\{([^}]*)\}\s*from\s*['"](?:lucide-react|lucide-vue-next|lucide-svelte|lucide-solid|lucide-preact|@lucide\/[\w-]+)['"]/g;
      for (const m of ctx.text.matchAll(re)) {
        const count = m[1].split(',').filter((s) => s.trim()).length;
        if (count > LUCIDE_MAX_ICONS) hits.push({ index: m.index, detail: ` ${count} imported, limit ${LUCIDE_MAX_ICONS}.` });
      }
      return hits;
    },
  },
  {
    id: 'slop/ignore-without-reason',
    severity: 'error',
    kinds: [...CODE, 'locale'],
    message: 'slop-ignore without a rule id and reason.',
    instead: 'Write slop-ignore <rule-id>: <why this case is an exception>.',
    patterns: [/slop-ignore\b(?!\s+slop\/[\w-]+\s*:\s*\S)/g],
    unsuppressible: true,
  },
];

// ---------------------------------------------------------------- engine

const IGNORE = /slop-ignore\s+(slop\/[\w-]+)\s*:\s*\S/g;

function scanFile(display, kind, text) {
  const lines = text.split('\n');
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const pos = (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: index - starts[lo] + 1 };
  };
  const ctx = { kind, text };
  const ignored = (rule, line) =>
    !rule.unsuppressible &&
    [line, line - 1].some((n) => [...(lines[n - 1] ?? '').matchAll(IGNORE)].some((m) => m[1] === rule.id));

  const hits = [];
  for (const rule of RULES) {
    if (!rule.kinds.includes(kind)) continue;
    const raw = [];
    for (const [i, re] of (rule.patterns ?? []).entries()) {
      for (const m of text.matchAll(re)) {
        if (rule.accept && !rule.accept(m, ctx)) continue;
        raw.push({ index: m.index, detail: rule.detail?.(m) ?? '', family: i });
      }
    }
    if (rule.run) raw.push(...rule.run(ctx));
    const seen = new Set();
    for (const h of raw.sort((a, b) => a.index - b.index)) {
      const { line, col } = pos(h.index);
      if (rule.skipComments && inComment(ctx, h.index, lines[line - 1], col - 1)) continue;
      if (ignored(rule, line)) continue;
      // One finding per rule per line; the first match carries the column.
      const key = `${line}:${rule.crossFile ? h.family : ''}:${h.detail ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ file: display, line, col, rule, detail: h.detail ?? '', family: h.family });
    }
  }
  return hits;
}

function listFiles(root) {
  try {
    // Tracked files only. Under pre-commit these hold the staged content; an
    // untracked scratch file must not block an unrelated commit.
    const out = execFileSync('git', ['ls-files', '-z', '--cached'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (SKIP.test(`${rel}/`) || WALK_SKIP.test(`${rel}/`)) continue;
        if (entry.isDirectory()) walk(rel);
        else files.push(rel);
      }
    };
    walk('');
    return files;
  }
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const args = argv.filter((a) => !a.startsWith('--'));
  for (const f of flags) {
    if (!['--strict', '--rules', '--'].includes(f)) {
      console.error(`slop-check: unknown flag ${f}`);
      return 2;
    }
  }

  if (flags.has('--rules')) {
    for (const r of RULES) console.log(`${r.severity.padEnd(8)} ${r.id.padEnd(28)} ${r.message} ${r.instead}`);
    return 0;
  }

  const root = repoRoot();
  SCALE = spacingScale(root);
  let tracked;
  const all = () => (tracked ??= listFiles(root));
  const files = args.length ? [] : all();
  for (const a of args) {
    const rel = relative(root, resolve(a)).split('\\').join('/');
    if (!existsSync(join(root, rel))) {
      console.error(`slop-check: no such file or directory: ${a}`);
      return 2;
    }
    // A directory means the tracked files under it, not zero files and a pass.
    if (statSync(join(root, rel)).isDirectory()) files.push(...all().filter((f) => rel === '' || f.startsWith(`${rel}/`)));
    else files.push(rel);
  }

  let scanned = 0;
  const hits = [];
  for (const file of files) {
    const rel = file.split('\\').join('/');
    const kind = kindOf(rel);
    if (!kind || SKIP.test(rel)) continue;
    const abs = join(root, rel);
    if (!existsSync(abs) || statSync(abs).size > MAX_BYTES) continue;
    scanned++;
    hits.push(...scanFile(rel, kind, readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')));
  }

  // Cross-file rules report only when every family was seen somewhere.
  const final = hits.filter((h) => {
    if (!h.rule.crossFile) return true;
    const families = new Set(hits.filter((o) => o.rule === h.rule).map((o) => o.family));
    return families.size === h.rule.patterns.length;
  });
  // A purple-to-blue error already covers the generic gradient warning on that line.
  const covered = new Set(final.filter((h) => h.rule.id === 'slop/purple-blue-gradient').map((h) => `${h.file}:${h.line}`));
  const report = final
    .filter((h) => !(h.rule.id === 'slop/gradient' && covered.has(`${h.file}:${h.line}`)))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);

  for (const h of report) {
    console.log(
      `${h.file}:${h.line}:${h.col}  ${h.rule.severity.padEnd(7)}  ${h.rule.id}  ${h.rule.message}${h.detail} Instead: ${h.rule.instead}`,
    );
  }
  const errors = report.filter((h) => h.rule.severity === 'error').length;
  const warnings = report.length - errors;
  console.log(`slop-check: ${errors} error(s), ${warnings} warning(s) in ${scanned} file(s)`);
  if (!SCALE) console.log('slop-check: slop/off-scale-spacing skipped until DESIGN.md spacing is filled');
  if (report.length) {
    console.log("Reasons: DESIGN.md > Do's and Don'ts. Exception: slop-ignore <rule-id>: <reason>");
  }
  return errors || (flags.has('--strict') && warnings) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));

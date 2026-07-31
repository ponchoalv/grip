import re

try:
    from html import unescape
except ImportError:
    from HTMLParser import HTMLParser
    unescape = HTMLParser().unescape


INCOMPLETE_TASK_RE = re.compile(r'<li>\[ \] (.*?)(<ul.*?>|</li>)', re.DOTALL)
INCOMPLETE_TASK_SUB = (r'<li class="task-list-item">'
                       r'<input type="checkbox" '
                       r'class="task-list-item-checkbox" disabled=""> \1\2')
COMPLETE_TASK_RE = re.compile(r'<li>\[x\] (.*?)(<ul.*?>|</li>)', re.DOTALL)
COMPLETE_TASK_SUB = (r'<li class="task-list-item">'
                     r'<input type="checkbox" class="task-list-item-checkbox" '
                     r'checked="" disabled=""> \1\2')


HEADER_PATCH_RE = re.compile(r'<span>{:"aria-hidden"=&gt;"true", :class=&gt;'
                             r'"octicon octicon-link"}</span>', re.DOTALL)
HEADER_PATCH_SUB = r'<span class="octicon octicon-link"></span>'


DIAGRAM_LANGUAGES = ('mermaid', 'geojson', 'topojson', 'stl')
FENCE_RE = re.compile(
    r'^(?P<fence>`{3,}|~{3,})[ \t]*(?P<language>[\w-]+)[^\n]*\n'
    r'(?P<content>.*?)(?:\n(?P=fence))[ \t]*$', re.MULTILINE | re.DOTALL)
PRE_RE = re.compile(r'(?P<open><pre(?:\s[^>]*)?>)(?P<content>.*?)</pre>',
                    re.DOTALL)
HTML_TAG_RE = re.compile(r'<[^>]+>')


def _diagram_fences(text):
    return [(match.group('language').lower(), match.group('content'))
            for match in FENCE_RE.finditer(text)
            if match.group('language').lower() in DIAGRAM_LANGUAGES]


def _pre_text(content):
    return unescape(HTML_TAG_RE.sub('', content)).rstrip('\r\n')


def _add_diagram_markers(html, text):
    """Mark GitHub API code blocks which need a local diagram renderer."""
    fences = _diagram_fences(text)
    if not fences:
        return html

    replacements = []
    remaining = list(fences)
    for match in PRE_RE.finditer(html):
        source = _pre_text(match.group('content'))
        for index, (language, diagram) in enumerate(remaining):
            if source == diagram.rstrip('\r\n'):
                replacements.append((match.start('open'), match.end('open'),
                                     match.group('open')[:-1] +
                                     ' data-grip-diagram="{0}">'.format(
                                         language)))
                del remaining[index]
                break

    for start, end, replacement in reversed(replacements):
        html = html[:start] + replacement + html[end:]
    return html


def patch(html, user_content=False, text=None):
    """
    Processes the HTML rendered by the GitHub API, patching
    any inconsistencies from the main site.
    """
    # FUTURE: Remove this once GitHub API renders task lists
    # https://github.com/isaacs/github/issues/309
    if not user_content:
        html = INCOMPLETE_TASK_RE.sub(INCOMPLETE_TASK_SUB, html)
        html = COMPLETE_TASK_RE.sub(COMPLETE_TASK_SUB, html)

    # FUTURE: Remove this once GitHub API fixes the header bug
    # https://github.com/joeyespo/grip/issues/244
    html = HEADER_PATCH_RE.sub(HEADER_PATCH_SUB, html)

    if text:
        html = _add_diagram_markers(html, text)

    return html

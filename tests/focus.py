"""Browser regression tests against both real entry points and pinned releases."""
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright
from smoke import STUB, b64url, d

ROOT = Path(__file__).resolve().parents[1]
SNAP = {
    'projects': {'1': 'Работа', '2': 'Дом'}, 'focus': [1, 2, 3],
    'stats': {'done_week': 0}, 'tasks': [
        {'id': 1, 'n': 'Первый фокус', 'pr': 1, 'p': 1, 'd': d(0)},
        {'id': 2, 'n': 'Второй фокус', 'pr': 2, 'p': 1, 'd': d(0)},
        {'id': 3, 'n': 'Третий фокус', 'pr': 2, 'p': 2, 'd': d(-1)},
        {'id': 4, 'n': 'Следующая подходящая', 'pr': 1, 'p': 1, 'd': d(-3)},
        {'id': 5, 'n': 'Будущая обычная — не подходит', 'pr': 2, 'p': 1, 'd': d(3)},
        {'id': 6, 'n': 'Без срока обычная — не подходит', 'pr': 2, 'p': 1, 'd': None},
    ],
}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.route('https://telegram.org/js/telegram-web-app.js', lambda route: route.fulfill(body=STUB, content_type='application/javascript'))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def open_snap(variant, snapshot=SNAP):
                entry = '/' if variant == 'v1' else '/v2/'
                value = {**copy.deepcopy(snapshot), 'instance': variant}
                page.goto(base + entry + '?sync=' + b64url(value) + '&k=1')
                page.wait_for_selector('.stats')
                return base + entry

            for variant in ['v1', 'v2']:
                url = open_snap(variant)
                key = f'planner_pending_{variant}'
                assert page.locator('.focus').count() == 3
                assert page.locator('.focus [data-edit]').count() == 3
                assert page.locator('.focus [data-del]').count() == 3
                page.locator('[data-focus="1"] [data-edit]').click()
                page.wait_for_selector('#ed-name')
                assert page.evaluate(f'JSON.parse(localStorage.getItem("{key}") || "{{}}").done || []') == []
                page.fill('#ed-name', 'Изменено прямо из фокуса')
                page.click('#ed-go')
                assert 'Изменено прямо из фокуса' in page.locator('[data-focus="1"]').inner_text()
                page.locator('[data-focus="1"] [data-del]').click()
                assert page.locator('[data-focus="1"]').count() == 0
                assert page.locator('[data-focus="4"]').count() == 1
                assert page.locator('.focus').count() == 3
                pending = page.evaluate(f'JSON.parse(localStorage.getItem("{key}"))')
                assert pending['del'] == [1] and pending['done'] == []
                # Reload must retain pending deletion; old code lost pending due to TDZ.
                page.goto(url)
                page.wait_for_selector('.stats')
                assert page.locator('[data-focus="1"]').count() == 0
                assert page.locator('[data-focus="4"]').count() == 1
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                page.screenshot(path=str(ROOT / 'tests' / f'focus-{variant}.png'), full_page=True)
                page.evaluate('window.__mb.cb()')
                page.wait_for_function('window.__sent.length === 1')
                batch = json.loads(page.evaluate('window.__sent[0]'))
                assert batch['instance'] == variant and batch['del'] == [1] and batch['done'] == []
                # Server may not yet have refreshed the snapshot; replacement survives reopening.
                page.goto(url)
                page.wait_for_selector('.stats')
                assert page.locator('[data-focus="4"]').count() == 1

                page.evaluate(f'localStorage.removeItem("{key}")')
                open_snap(variant)
                page.locator('[data-proj="2"]').click()
                page.locator('[data-focus="3"] [data-del]').click()
                assert page.locator('.focus').count() == 0  # no cross-project replacement
                page.locator('[data-proj=""]').click()
                # Move task out of today's focus: a normal future task is ineligible.
                page.locator('[data-focus="2"] [data-edit]').click()
                page.fill('#date-custom', d(5))
                page.dispatch_event('#date-custom', 'change')
                page.click('#ed-go')
                assert page.locator('[data-focus="2"]').count() == 0
                assert page.locator('[data-focus="5"]').count() == 0
                assert page.locator('[data-focus="6"]').count() == 0
                # Keep a v1 draft while opening v2 at the same browser origin.
                if variant == 'v1':
                    assert page.evaluate(f'localStorage.getItem("{key}")')
                else:
                    assert page.evaluate('localStorage.getItem("planner_pending_v1")')

            # Bot identity is checked before caching a snapshot.
            page.goto(base + '/v2/?sync=' + b64url({**SNAP, 'instance': 'v1'}) + '&k=1')
            page.wait_for_selector('.center-box')
            assert 'другому боту' in page.inner_text('.center-box')
            assert not errors, errors
            browser.close()
        print('FOCUS_BOTH_VARIANTS_OK: controls, replacement, criteria, reload, isolation, actual release loaders')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()

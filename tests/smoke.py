# Смоук-тест Mini App планировщика: синк фрагментами → дашборд/список →
# действия (сделано/перенос/добавление) → батч sendData + оптимистичный снапшот.
# Запуск: python3 tests/smoke.py
import base64
import gzip
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

# CloudStorage-стаб на localStorage — переживает переходы между страницами
STUB = """
window.__sent = [];
window.__mb = { text: "", cb: null, visible: false };
window.Telegram = { WebApp: {
  ready() {}, expand() {},
  MainButton: {
    setText(t) { window.__mb.text = t; },
    show() { window.__mb.visible = true; }, hide() { window.__mb.visible = false; },
    enable() {}, onClick(cb) { window.__mb.cb = cb; }
  },
  BackButton: { show() {}, hide() {}, onClick() {} },
  HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  CloudStorage: {
    getItem(k, cb) { cb(null, localStorage.getItem("cs_" + k)); },
    setItem(k, v, cb) { localStorage.setItem("cs_" + k, String(v)); cb(null, true); },
    removeItem(k, cb) { localStorage.removeItem("cs_" + k); cb(null, true); }
  },
  sendData(d) { window.__sent.push(d); },
  showAlert(m) { window.__alert = m; }
}};
"""

SNAPSHOT = {
    "ts": "2026-07-17T09:00",
    "today": "2026-07-17",
    "projects": {"2": "Это База", "21": "Здоровье"},
    "tasks": [
        {"id": 341, "n": "Прописать use cases", "p": 2, "pr": 1, "d": "2026-06-10"},
        {"id": 313, "n": "Изменить дизайн лендинга", "p": 2, "pr": 2, "d": "2026-06-11"},
        {"id": 400, "n": "Утренняя зарядка", "p": 21, "pr": 2, "d": "2026-07-17"},
        {"id": 401, "n": "Проверить статистику", "p": 2, "pr": 2, "d": "2026-07-17"},
        {"id": 402, "n": "Подготовить отчёт", "p": 2, "pr": 2, "d": "2026-07-19"},
        {"id": 403, "n": "Бэклог без даты", "p": 2, "pr": 2, "d": None},
    ],
    "focus": [341, 400, 401],
    "stats": {"done_week": 12},
    "rituals": {"morning": True, "evening": False, "responded": False},
}


def b64url(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False).encode()
    return base64.urlsafe_b64encode(gzip.compress(raw)).decode().rstrip("=")


def mb_click(page):
    page.evaluate("window.__mb.cb()")
    page.wait_for_timeout(200)


def run():
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>"
        f"<div id='app'></div><script>{STUB}</script>"
        "<script src='../app.js'></script></body></html>"
    )
    test_html = ROOT / "tests" / "_smoke.html"
    test_html.write_text(html, encoding="utf-8")
    url = f"file://{test_html}"

    payload = b64url(SNAPSHOT)
    half = (len(payload) + 1) // 2
    chunks = [payload[:half], payload[half:]]

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ── быстрый путь: reply-кнопка с данными (k=1) → сразу дашборд, без экрана «переоткройте» ──
        page.goto(f"{url}?sync={payload}&k=1")
        page.wait_for_selector(".stats", timeout=10000)
        assert page.locator(".center-box").count() == 0, "k=1 не должен показывать промежуточный экран"
        assert "12" in page.inner_text(".stats")
        assert "sync" not in page.url and "k=1" not in page.url    # payload убран из URL
        page.evaluate("localStorage.clear()")                       # сброс для следующего сценария

        # ── синк двумя фрагментами, нарочно в обратном порядке ──
        page.goto(f"{url}?syncf=100:1:2:{chunks[1]}")
        page.wait_for_selector(".center-box", timeout=10000)
        box = page.inner_text(".center-box")
        assert "Кусок 2 из 2 получен" in box and "не получены: 1" in box, box

        page.goto(f"{url}?syncf=100:0:2:{chunks[0]}")
        page.wait_for_selector("#c-open", timeout=10000)
        assert "Данные обновлены" in page.inner_text(".center-box")
        page.click("#c-open")
        page.wait_for_timeout(300)

        # ── дашборд ──
        page.wait_for_selector(".stats", timeout=5000)
        stats = page.inner_text(".stats")
        assert "12" in stats, stats                    # done_week
        nums = page.locator(".stat .n").all_inner_texts()
        assert nums == ["2", "2", "12"], nums          # сегодня(2) просрочено(2) неделя(12)
        assert page.locator(".focus").count() == 3
        assert "Прописать use cases" in page.inner_text(".focus")

        # отметить главную задачу фокуса сделанной
        page.locator(".focus").first.click()
        page.wait_for_timeout(200)
        assert "сделана" in page.inner_text(".focus").lower()
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (1)"

        # ── вкладка «Сегодня» ──
        page.locator("[data-tab=today]").click()
        page.wait_for_timeout(200)
        body = page.inner_text("#app").lower()   # CSS капсит заголовки секций
        assert "просроченные" in body and "ближайшие 7 дней" in body
        assert "бэклог без даты" not in body           # задачи без даты скрыты

        # перенос просроченной задачи #313 на завтра
        page.locator("[data-open-defer='313']").click()
        page.wait_for_timeout(200)
        page.locator("[data-defer='313'][data-to='2026-07-18']").click()
        page.wait_for_timeout(200)
        assert "→" in page.inner_text("#app")
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (2)"

        # ── добавление задачи ──
        page.locator("[data-tab=dash]").click()
        page.wait_for_timeout(200)
        page.click("#qa-add")
        page.wait_for_selector("#add-name", timeout=5000)
        page.fill("#add-name", "Новая задача из теста")
        page.select_option("#add-proj", "2")
        page.locator("[data-due='2026-07-18']").click()
        page.click("#add-go")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (3)"

        # ── редактирование задачи #401 (имя + проект + срок на +7) ──
        page.locator("[data-tab=today]").click()
        page.wait_for_timeout(200)
        page.locator("[data-edit='401']").click()
        page.wait_for_selector("#ed-name", timeout=5000)
        assert page.input_value("#ed-name") == "Проверить статистику"   # префилл
        page.fill("#ed-name", "Проверить статистику (ред.)")
        page.select_option("#ed-proj", "21")
        # произвольная дата через нативный date-picker
        page.fill("#date-custom", "2026-08-15")
        page.dispatch_event("#date-custom", "change")
        page.wait_for_timeout(100)
        assert page.locator(".date-custom.on").count() == 1
        assert page.locator(".date-opt.on").count() == 0   # пресеты сняты
        page.click("#ed-go")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (4)"
        edit_buf = page.evaluate("JSON.parse(localStorage.getItem('planner_pending_v1')).edit")
        assert edit_buf == {"401": {"n": "Проверить статистику (ред.)", "p": 21, "d": "2026-08-15"}}, edit_buf

        # ── батч ──
        mb_click(page)
        sent = page.evaluate("window.__sent")
        assert len(sent) == 1, f"sendData: {sent}; ошибки: {errors}"
        batch = json.loads(sent[0])
        assert batch["done"] == [341]
        assert batch["postpone"] == {"313": "2026-07-18"}
        assert batch["add"] == [{"n": "Новая задача из теста", "p": 2, "d": "2026-07-18"}]
        assert batch["edit"] == {"401": {"n": "Проверить статистику (ред.)", "p": 21, "d": "2026-08-15"}}

        # оптимистичный снапшот: сделанная задача удалена, перенос применён
        snap = page.evaluate("JSON.parse(localStorage.getItem('cs_snap'))")
        ids = [t["id"] for t in snap["tasks"]]
        assert 341 not in ids
        assert [t for t in snap["tasks"] if t["id"] == 313][0]["d"] == "2026-07-18"
        assert snap["stats"]["done_week"] == 13
        # правка применена к снапшоту оптимистично
        t401 = [t for t in snap["tasks"] if t["id"] == 401][0]
        assert t401["n"] == "Проверить статистику (ред.)" and t401["p"] == 21 and t401["d"] == "2026-08-15"
        # буфер очищен
        assert page.evaluate("localStorage.getItem('planner_pending_v1')") is None

        assert not errors, f"JS-ошибки: {errors}"
        browser.close()
    test_html.unlink()
    print("SMOKE_PLANNER_OK")


if __name__ == "__main__":
    try:
        run()
    except AssertionError as e:
        print(f"FAIL: {e}")
        sys.exit(1)

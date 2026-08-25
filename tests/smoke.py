# Смоук-тест Mini App планировщика: синк фрагментами → дашборд/список →
# фильтры по проектам и приоритетам → действия (сделано/перенос/добавление/
# правка/удаление) →
# батч sendData + оптимистичный снапшот.
# Запуск: python3 tests/smoke.py
import base64
import gzip
import json
import pathlib
import sys
from datetime import date, datetime, timedelta

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

# Даты — относительно СЕГОДНЯ: приложение считает день по часам устройства,
# а не по snapshot.today, поэтому фиксированные даты в фикстуре протухают.
TODAY = date.today()
def d(offset):
    return (TODAY + timedelta(days=offset)).isoformat()

SNAPSHOT = {
    "ts": datetime.now().isoformat(timespec="minutes"),
    "today": d(0),
    "projects": {"2": "Это База", "21": "Здоровье"},
    "tasks": [
        # 341 старше 313, но приоритет ниже — проверяем, что приоритет главнее даты
        {"id": 341, "n": "Прописать use cases", "p": 2, "pr": 2, "d": d(-38)},
        {"id": 313, "n": "Изменить дизайн лендинга", "p": 2, "pr": 1, "d": d(-37)},
        {"id": 400, "n": "Утренняя зарядка", "p": 21, "pr": 2, "d": d(0)},
        {"id": 401, "n": "Проверить статистику", "p": 2, "pr": 3, "d": d(0)},
        {"id": 405, "n": "Срочный звонок", "p": 2, "pr": 1, "d": d(0)},
        {"id": 402, "n": "Подготовить отчёт", "p": 2, "pr": 2, "d": d(2)},
        {"id": 403, "n": "Бэклог без даты", "p": 2, "pr": 2, "d": None},
        {"id": 406, "n": "Идея без срока", "p": None, "pr": 1, "d": None},
        {"id": 404, "n": "Личное дело", "p": None, "pr": 2, "d": d(0)},
    ],
    "focus": [341, 400, 401],
    "stats": {"done_week": 12},
    "done_week_tasks": [
        {"id": 500, "n": "Сделано в Базе", "p": 2, "pr": 1, "d": d(-2), "cd": d(-2)},
        {"id": 501, "n": "Сделано в Здоровье", "p": 21, "pr": 3, "d": d(-3), "cd": d(-3)},
    ],
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
        assert nums == ["4", "2", "2", "12"], nums     # сегодня(4) просрочено(2) без срока(2) неделя(12)
        assert page.locator(".focus").count() == 3
        focus = "\n".join(page.locator(".focus").all_inner_texts())
        for name in ("Прописать use cases", "Утренняя зарядка", "Проверить статистику"):
            assert name in focus, focus          # все три из snapshot.focus, а не только первая

        # ── фильтр по проектам: чипы на дашборде ──
        chips = page.locator("[data-proj]").all_inner_texts()
        assert chips == ["Все", "Здоровье", "Это База", "Без проекта"], chips
        page.locator("[data-proj='21']").click()       # проект «Здоровье»
        page.wait_for_timeout(200)
        nums = page.locator(".stat .n").all_inner_texts()
        assert nums == ["1", "0", "0", "1"], nums      # считаются только задачи проекта
        assert page.locator(".focus").count() == 1     # фокус тоже сужен
        assert "Утренняя зарядка" in page.inner_text(".focus")

        # фильтр по приоритету работает и на главной: счётчики сужаются
        page.locator("[data-proj='']").click()
        page.wait_for_timeout(200)
        page.locator("[data-prio='1']").click()
        page.wait_for_timeout(200)
        assert page.locator(".stat .n").all_inner_texts()[:2] == ["1", "1"], \
            page.locator(".stat .n").all_inner_texts()      # P1: сегодня 405, просрочена 313
        # фокус пересчитан по фильтру, а не пересечён с тройкой бота (иначе было бы 0)
        assert page.locator(".focus").count() == 3
        focus = "\n".join(page.locator(".focus").all_inner_texts())   # inner_text даёт только первую карточку
        for name in ("Изменить дизайн лендинга", "Срочный звонок", "Идея без срока"):
            assert name in focus, focus
        assert "Прописать use cases" not in focus, focus      # P2 под фильтром P1 не показываем
        # «за неделю ✓» тоже сужается приоритетом: из двух выполненных P1 только 500
        assert page.locator(".stat .n").all_inner_texts()[3] == "1", \
            page.locator(".stat .n").all_inner_texts()
        page.locator(".stat[data-scope=doneweek]").click()
        page.wait_for_timeout(200)
        body = page.inner_text("#app")
        assert "Сделано в Базе" in body and "Сделано в Здоровье" not in body, body
        page.locator(".scope-chip[data-scope='today']").click()   # вернуть скоуп для след. шагов
        page.wait_for_timeout(200)
        page.locator("[data-tab=dash]").click()
        page.wait_for_timeout(200)
        page.locator("[data-prio='']").click()
        page.wait_for_timeout(200)

        # проект без единой задачи из фокуса бота: карточки всё равно есть
        page.locator("[data-proj='none']").click()            # «Без проекта»: 404, 406
        page.wait_for_timeout(200)
        assert page.locator(".focus").count() == 2, page.inner_text("#app")
        # пустая выборка: вместо молчаливой пустоты — надпись
        page.locator("[data-prio='3']").click()               # среди «без проекта» нет P3
        page.wait_for_timeout(200)
        assert page.locator(".focus").count() == 0
        assert "Нет задач под этим фильтром" in page.inner_text("#app")
        page.locator("[data-prio='']").click()
        page.wait_for_timeout(200)
        page.locator("[data-proj='']").click()
        page.wait_for_timeout(200)
        page.locator("[data-proj='21']").click()            # вернуть проектный фильтр для след. шага
        page.wait_for_timeout(200)

        # фильтр сквозной: переходит на вкладку «Задачи»
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        assert page.locator("[data-proj='21'].on").count() == 1
        body = page.inner_text("#app")
        assert "Утренняя зарядка" in body and "Прописать use cases" not in body, body

        # «Без проекта» — только задачи без проекта
        page.locator("[data-proj='none']").click()
        page.wait_for_timeout(200)
        body = page.inner_text("#app")
        assert "Личное дело" in body and "Утренняя зарядка" not in body, body

        # фильтр переживает перезапуск приложения (снапшот берётся из CloudStorage)
        page.goto(url)
        page.wait_for_selector("[data-proj]", timeout=5000)
        assert page.locator("[data-proj='none'].on").count() == 1, "фильтр не сохранился"
        page.locator("[data-proj='']").click()         # «Все» — назад к полной картине
        page.wait_for_timeout(200)
        assert page.locator(".stat .n").all_inner_texts() == ["4", "2", "2", "12"]

        # отметить главную задачу фокуса сделанной
        page.locator(".focus").first.click()
        page.wait_for_timeout(200)
        assert "сделана" in page.inner_text(".focus").lower()
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (1)"

        # ── вкладка «Задачи» (скоуп «Сегодня» по умолчанию) ──
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        body = page.inner_text("#app").lower()   # CSS капсит заголовки секций
        assert "просроченные" in body and "ближайшие 7 дней" in body
        assert "бэклог без даты" not in body           # задачи без даты скрыты

        # ── приоритеты: чип на каждой карточке ──
        chips = page.locator(".card .chip.p1, .card .chip.p2, .card .chip.p3").count()
        assert chips == page.locator(".card .t-name").count(), "приоритет показан не у всех задач"

        # сортировка: приоритет главнее даты (313 моложе 341, но P1)
        names = page.locator(".t-name").all_inner_texts()
        assert names.index("Изменить дизайн лендинга") < names.index("Прописать use cases"), names
        # внутри «Сегодня»: P1 → P2 → P3
        assert names.index("Срочный звонок") < names.index("Утренняя зарядка") < names.index("Проверить статистику"), names

        # фильтр по приоритету
        prio_chips = page.locator("[data-prio]").all_inner_texts()
        assert prio_chips == ["Любой", "Высокий", "Обычный", "Низкий"], prio_chips
        page.locator("[data-prio='3']").click()
        page.wait_for_timeout(200)
        names = page.locator(".t-name").all_inner_texts()
        assert names == ["Проверить статистику"], names        # единственная P3

        # ── скоуп «Без даты»: единственное место, где видны задачи без срока ──
        # плитка «без срока» на главной ведёт в новый вид
        page.locator("[data-tab=dash]").click()
        page.wait_for_timeout(200)
        page.locator(".stat[data-scope=nodate]").click()
        page.wait_for_timeout(300)
        assert "Без срока" in page.inner_text(".hdr"), page.inner_text(".hdr")

        page.locator("[data-prio='']").click()
        page.wait_for_timeout(200)
        page.locator(".scope-chip[data-scope=nodate]").click()
        page.wait_for_timeout(200)
        names = page.locator(".t-name").all_inner_texts()
        assert names == ["Идея без срока", "Бэклог без даты"], names   # P1 выше P2
        page.locator(".scope-chip[data-scope=today]").click()
        page.wait_for_timeout(200)
        page.locator("[data-prio='3']").click()
        page.wait_for_timeout(200)

        # приоритет и проект складываются (И), а не заменяют друг друга
        page.locator("[data-proj='21']").click()               # «Здоровье» — там только P2
        page.wait_for_timeout(200)
        assert page.locator(".t-name").count() == 0, page.inner_text("#app")
        page.locator("[data-proj='']").click(); page.wait_for_timeout(200)
        page.locator("[data-prio='']").click(); page.wait_for_timeout(200)
        assert page.locator(".t-name").count() > 1

        # перенос просроченной задачи #313 на завтра
        page.locator("[data-open-defer='313']").click()
        page.wait_for_timeout(200)
        page.locator(f"[data-defer='313'][data-to='{d(1)}']").click()
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
        page.locator("[data-prio-opt='3']").click()      # новая задача — низкий приоритет
        page.locator(f"[data-due='{d(1)}']").click()
        page.click("#add-go")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (3)"

        # вторая задача — чтобы проверить удаление ещё не сохранённой (из буфера)
        page.click("#qa-add")
        page.wait_for_selector("#add-name", timeout=5000)
        page.fill("#add-name", "Лишняя задача")
        page.locator(f"[data-due='{d(1)}']").click()
        page.click("#add-go")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (4)"
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        page.locator("[data-del-new='new1']").click()
        page.wait_for_timeout(200)
        assert "Лишняя задача" not in page.inner_text("#app")
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (3)"

        # ── редактирование задачи #401 (имя + проект + срок на +7) ──
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        page.locator("[data-edit='401']").click()
        page.wait_for_selector("#ed-name", timeout=5000)
        assert page.input_value("#ed-name") == "Проверить статистику"   # префилл
        page.fill("#ed-name", "Проверить статистику (ред.)")
        page.select_option("#ed-proj", "21")
        # произвольная дата через нативный date-picker
        page.locator("[data-prio-opt='1']").click()      # приоритет: Низкий → Высокий
        page.fill("#date-custom", d(28))
        page.dispatch_event("#date-custom", "change")
        page.wait_for_timeout(100)
        assert page.locator(".date-custom.on").count() == 1
        assert page.locator(".date-opt.on").count() == 0   # пресеты сняты
        page.click("#ed-go")
        page.wait_for_timeout(300)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (4)"
        edit_buf = page.evaluate("JSON.parse(localStorage.getItem('planner_pending_v1')).edit")
        assert edit_buf == {"401": {"n": "Проверить статистику (ред.)", "p": 21,
                                    "d": d(28), "pr": 1}}, edit_buf

        # ── удаление задачи #400: в буфер, обратимо, из счётчиков выпадает ──
        page.locator("[data-tab=dash]").click()
        page.wait_for_timeout(200)
        today_before = int(page.locator(".stat .n").all_inner_texts()[0])
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        page.locator("[data-del='400']").click()
        page.wait_for_timeout(200)
        card = page.locator(".card", has_text="Утренняя зарядка").inner_text()
        assert "удалена" in card, card                  # карточка остаётся, помечена
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (5)"
        page.locator("[data-tab=dash]").click()
        page.wait_for_timeout(200)
        today_after = int(page.locator(".stat .n").all_inner_texts()[0])
        assert today_after == today_before - 1, (today_before, today_after)

        # откат кнопкой ↩, затем удаляем снова
        page.locator("[data-tab=list]").click()
        page.wait_for_timeout(200)
        page.locator("[data-undel='400']").click()
        page.wait_for_timeout(200)
        assert "удалена" not in page.inner_text("#app")
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (4)"
        page.locator("[data-del='400']").click()
        page.wait_for_timeout(200)
        assert page.evaluate("window.__mb.text") == "Сохранить изменения (5)"

        # ── батч ──
        mb_click(page)
        sent = page.evaluate("window.__sent")
        assert len(sent) == 1, f"sendData: {sent}; ошибки: {errors}"
        batch = json.loads(sent[0])
        assert batch["done"] == [341]
        assert batch["postpone"] == {"313": d(1)}
        assert batch["add"] == [{"n": "Новая задача из теста", "p": 2, "d": d(1), "pr": 3}]
        assert batch["edit"] == {"401": {"n": "Проверить статистику (ред.)", "p": 21,
                                         "d": d(28), "pr": 1}}
        assert batch["del"] == [400], batch["del"]

        # оптимистичный снапшот: сделанная задача удалена, перенос применён
        snap = page.evaluate("JSON.parse(localStorage.getItem('cs_snap'))")
        ids = [t["id"] for t in snap["tasks"]]
        assert 341 not in ids
        assert 400 not in ids, "удалённая задача осталась в оптимистичном снапшоте"
        assert [t for t in snap["tasks"] if t["id"] == 313][0]["d"] == d(1)
        assert snap["stats"]["done_week"] == 13   # +1 за сделанную; удаление не считается
        # правка применена к снапшоту оптимистично
        t401 = [t for t in snap["tasks"] if t["id"] == 401][0]
        assert t401["n"] == "Проверить статистику (ред.)" and t401["p"] == 21 and t401["d"] == d(28)
        assert t401["pr"] == 1, t401
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

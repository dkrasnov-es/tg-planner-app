// Only this instance's config selects the immutable runtime. No latest/shared CDN alias.
(function () {
  var config = window.PLANNER_CONFIG;
  if (!config || !config.runtime || !['v1', 'v2'].includes(config.instance)) {
    document.getElementById('app').textContent = 'Не удалось загрузить настройки планировщика.';
    return;
  }
  var script = document.createElement('script');
  script.src = config.runtime;
  script.onerror = function () {
    document.getElementById('app').textContent = 'Не удалось загрузить приложение. Попробуйте открыть его снова.';
  };
  document.body.appendChild(script);
})();

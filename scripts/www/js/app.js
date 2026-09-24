/* ============================================================
   课时记账 · 应用入口
   路由分发 / 导航高亮 / 数据变更自动刷新 / toast
   ============================================================ */
(function boot() {
  const view = document.getElementById('view');
  const navLinks = document.querySelectorAll('#nav a[data-route]');
  let booted = false;

  /* ---------- toast ---------- */
  Utils.toast = function (msg) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.remove(); }, 2400);
  };

  /* ---------- 滚动位置保持（日历横向滚动不丢） ---------- */
  function saveScroll() {
    const sc = document.getElementById('cal-scroll');
    return { top: window.scrollY, calLeft: sc ? sc.scrollLeft : 0 };
  }
  function restoreScroll(st) {
    window.scrollTo(0, st.top);
    const sc = document.getElementById('cal-scroll');
    if (sc && st.calLeft) sc.scrollLeft = st.calLeft;
  }

  /* ---------- 路由 ---------- */
  function parseRoute() {
    const h = location.hash || '#/overview';
    return h.replace(/^#\/?/, '').split('/').filter(Boolean);
  }

  // 导航链接点击：若日历班次矩阵有未保存改动，先确认再跳转
  navLinks.forEach(a => {
    a.addEventListener('click', async function (e) {
      e.preventDefault();
      const guard = (App.pages.calendar && App.pages.calendar.confirmLeave)
        ? await App.pages.calendar.confirmLeave()
        : true;
      if (!guard) return;
      location.hash = '#/' + a.dataset.route;
    });
  });

  function renderRoute() {
    const parts = parseRoute();
    const root = parts[0] || 'overview';

    navLinks.forEach(a => {
      a.classList.toggle('active', a.dataset.route === root);
    });

    if (root === 'overview') {
      App.pages.overview.render(view);
    } else if (root === 'ledger') {
      App.pages.ledger.render(view);
    } else if (root === 'students') {
      if (parts[1]) App.pages.student.renderDetail(view, parts[1]);
      else App.pages.student.renderList(view);
    } else if (root === 'settings') {
      App.pages.settings.render(view);
    } else if (root === 'data') {
      App.pages.data.render(view);
    } else {
      if (App.pages.calendar.resetStudent) App.pages.calendar.resetStudent();
      App.pages.calendar.render(view);
    }
  }

  /* ---------- 数据变更自动刷新当前页 ---------- */
  App.store.onChange(function () {
    if (!booted) return;
    const st = saveScroll();
    renderRoute();
    restoreScroll(st);
  });

  window.addEventListener('hashchange', renderRoute);

  /* ---------- 启动 ---------- */
  App.store.init()
    .then(async function () {
      // 演示模式：?demo=1 且当前无数据时自动载入示例
      if (location.search.indexOf('demo=1') >= 0 && App.store.data.students.length === 0) {
        await App.sample.loadSample();
      }
      booted = true;
      renderRoute();
    })
    .catch(function (err) {
      view.innerHTML = '<div class="empty" style="padding:60px 16px;">' +
        '<div class="big">数据存储初始化失败</div>' +
        '浏览器不允许使用本地存储。请使用较新的 Chrome / Edge，或确认未开启隐私拦截。<br>' +
        '<span class="hint">' + String(err && err.message || err) + '</span></div>';
    });
})();

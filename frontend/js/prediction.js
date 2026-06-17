const HISTORY_STORE_KEY = 'cdss_proto_history_by_patient_v1';
const DB_HISTORY_CACHE_KEY = 'cdss_proto_db_history_v1';
const PATIENT_ID_CACHE_KEY = 'cdss_proto_patient_id_v1';

let _dbLoadTimer = null;
let _fioSearchTimer = null;
let _fioSuggestions = [];

let chartRiskTrend = null;
let chartDomainsLast = null;
let chartPredictionDomains = null;

let _activeVisitContext = { visitId: null, patientId: null };
let _lastSavedVisitComment = { visitId: null, text: '' };

const CHART_THEME = {
    brand: '#2C5F8D',
    brandDark: '#1a3d5c',
    grid: '#e9ecef',
    text: '#5a6a7a'
};

const RISK_OUTCOME_LABEL =
    'когнитивных нарушений дементного типа';

function domainLevel(pct) {
    if (pct == null || pct === '') return 'empty';
    const v = Number(pct);
    if (Number.isNaN(v) || v === 0) return 'empty';
    if (v >= 75) return 'high';
    if (v >= 50) return 'mid';
    return 'low';
}

function domainBarColor(pct) {
    const level = domainLevel(pct);
    const map = {
        high: '#9ec4e0',
        mid: '#6a94b8',
        low: '#3d6285',
        empty: '#dee2e6'
    };
    return map[level];
}

function chartScaleOptions(yTitle) {
    return {
        y: {
            min: 0,
            max: 100,
            title: yTitle ? { display: true, text: yTitle, color: CHART_THEME.text } : undefined,
            grid: { color: CHART_THEME.grid },
            ticks: { color: CHART_THEME.text }
        },
        x: {
            grid: { display: false },
            ticks: { color: CHART_THEME.text, maxRotation: 45, minRotation: 0 }
        }
    };
}

function domainBarChartOptions(yTitle, tooltipExtra) {
    return {
        maintainAspectRatio: false,
        responsive: true,
        layout: { padding: { bottom: 6, left: 6, right: 10, top: 8 } },
        datasets: {
            bar: {
                maxBarThickness: 56,
                categoryPercentage: 0.82,
                barPercentage: 0.88,
                borderRadius: 4
            }
        },
        scales: chartDomainScaleOptions(yTitle),
        plugins: {
            legend: { display: false },
            tooltip: tooltipExtra || {}
        }
    };
}

function chartDomainScaleOptions(yTitle) {
    const base = chartScaleOptions(yTitle);
    base.x.ticks = {
        color: '#212529',
        font: { size: 13, weight: '600', family: "'Segoe UI', system-ui, sans-serif" },
        maxRotation: 45,
        minRotation: 8,
        autoSkip: false,
        padding: 4
    };
    return base;
}

function formatVisitDateLabel(dateRaw) {
    if (dateRaw == null || dateRaw === '') return '';
    const s = String(dateRaw).trim();
    const cleaned = s.replace(/^Визит\s*\d*\s*:\s*/i, '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const [y, m, d] = cleaned.slice(0, 10).split('-');
        return `${d}.${m}.${y}`;
    }
    if (/^\d{2}\.\d{2}\.\d{4}/.test(cleaned)) {
        return cleaned.slice(0, 10);
    }
    const dt = new Date(cleaned);
    if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
    return cleaned.replace(/,?\s*\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();
}

function historyChartLabel(h) {
    if (h?.visit_date) return formatVisitDateLabel(h.visit_date);
    if (h?.date_label) return formatVisitDateLabel(h.date_label);
    return '';
}

function formatImpairmentDisplay(raw) {
    const t = String(raw || '').trim();
    if (!t) return null;

    if (t.includes('Полифункциональный амнестический')) {
        return {
            kind: 'amnestic',
            title: 'Полифункциональный амнестический тип',
            detail: 'Снижение памяти и других когнитивных доменов'
        };
    }
    if (t.includes('Монофункциональный амнестический')) {
        return {
            kind: 'amnestic',
            title: 'Монофункциональный амнестический тип',
            detail: 'Преимущественно нарушение памяти'
        };
    }
    if (t.includes('Монофункциональный неамнестический')) {
        return {
            kind: 'non-amnestic',
            title: 'Монофункциональный неамнестический тип',
            detail: 'Нарушение когнитивных доменов без выраженной амнезии'
        };
    }
    if (t.includes('пограничные') || t.includes('50–70') || t.includes('50-70')) {
        return {
            kind: 'borderline',
            title: 'Пограничный профиль',
            detail: 'Субъективные жалобы; по доменам сохранность 50–70%'
        };
    }
    if (t.includes('Норма') || t.includes('≥ 70') || t.includes('>= 70')) {
        return {
            kind: 'normal',
            title: 'Без выраженного дефицита',
            detail: 'По заполненным доменам сохранность не ниже 70%'
        };
    }
    if (t.includes('Недостаточно данных')) {
        return {
            kind: 'unknown',
            title: 'Тип не определён',
            detail: 'Заполните больше тестов по доменам'
        };
    }
    return { kind: 'default', title: t, detail: '' };
}

function impairmentPatternHtml(text) {
    const formatted = formatImpairmentDisplay(text);
    if (!formatted) return '';
    const detail = formatted.detail
        ? `<p class="impairment-pattern-card__detail">${escapeHtml(formatted.detail)}</p>`
        : '';
    return `<div class="impairment-pattern-card impairment-panel--${formatted.kind}">
        <p class="impairment-pattern-tag">${escapeHtml(formatted.title)}</p>
        ${detail}
    </div>`;
}

function setImpairmentBadge(text) {
    const wrap = document.getElementById('predictionImpairmentWrap');
    const titleEl = document.getElementById('predictionImpairmentTitle');
    const detailEl = document.getElementById('predictionImpairmentDetail');
    const formatted = formatImpairmentDisplay(text);

    if (!wrap || !titleEl) return;

    if (!formatted) {
        wrap.hidden = true;
        return;
    }

    wrap.hidden = false;
    wrap.className = `impairment-panel impairment-panel--${formatted.kind}`;

    titleEl.textContent = formatted.title;
    if (detailEl) {
        if (formatted.detail) {
            detailEl.textContent = formatted.detail;
            detailEl.hidden = false;
        } else {
            detailEl.textContent = '';
            detailEl.hidden = true;
        }
    }
}

function collectFormFlat() {
    const selectors = [
        '#patientForm input:not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
        '#patientForm select',
        '#patientForm textarea',
        '#testsForm input:not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
        '#testsForm select',
        '#testsForm textarea'
    ].join(', ');
    const out = {};
    document.querySelectorAll(selectors).forEach((el) => {
        const n = el.name;
        if (!n) return;
        if (el.value === '' || el.value == null) return;
        out[n] = el.value;
    });
    document
        .querySelectorAll('#patientForm input[type="checkbox"], #testsForm input[type="checkbox"]')
        .forEach((el) => {
            if (!el.name) return;
            if (el.checked) out[el.name] = el.value || '1';
        });
    return out;
}

function buildPatientPayload() {
    const gv = document.querySelector('select[name="gender"]')?.value || '';
    return {
        fio: document.querySelector('input[name="fio"]')?.value || '',
        age: parseFloat(document.querySelector('input[name="age"]')?.value) || null,
        gender: gv,
        education: document.querySelector('select[name="education"]')?.value ?? ''
    };
}

function buildVisitPayload() {
    return {
        date_osm: document.querySelector('input[name="date_osm"]')?.value || '',
        doctor: document.querySelector('input[name="doctor"]')?.value || '',
        visit_number: parseInt(document.querySelector('input[name="n_vizit"]')?.value, 10) || 1
    };
}

function patientHistoryKey() {
    const fio = (document.querySelector('input[name="fio"]')?.value || '').trim().toLowerCase();
    return fio || '__no_fio__';
}

function loadHistoryStore() {
    try {
        const raw = sessionStorage.getItem(HISTORY_STORE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function loadHistory() {
    const store = loadHistoryStore();
    const entries = store[patientHistoryKey()];
    return Array.isArray(entries) ? entries : [];
}

function saveHistory(entries) {
    const store = loadHistoryStore();
    store[patientHistoryKey()] = entries;
    sessionStorage.setItem(HISTORY_STORE_KEY, JSON.stringify(store));
}

function dbHistoryCacheStore() {
    try {
        const raw = sessionStorage.getItem(DB_HISTORY_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveDbHistoryForPatient(entries) {
    const store = dbHistoryCacheStore();
    store[patientHistoryKey()] = entries;
    sessionStorage.setItem(DB_HISTORY_CACHE_KEY, JSON.stringify(store));
}

function loadDbHistoryForPatient() {
    const store = dbHistoryCacheStore();
    const entries = store[patientHistoryKey()];
    return Array.isArray(entries) ? entries : [];
}

function historyEntryKey(h) {
    const d = h.visit_date || h.date_label || '';
    const n = h.visit_number != null ? String(h.visit_number) : '';
    return `${d}|${n}`;
}

function mergeSessionAndDbHistory() {
    const db = loadDbHistoryForPatient();
    const session = loadHistory();
    const map = new Map();
    db.forEach((h) => {
        if (h.risk_percent != null) map.set(historyEntryKey(h), { ...h });
    });
    session.forEach((h) => {
        map.set(historyEntryKey(h), { ...map.get(historyEntryKey(h)), ...h, from_session: true });
    });
    return [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

function refreshHistoryChartsForCurrentPatient() {
    const hist = mergeSessionAndDbHistory();
    renderVisitBlocks(hist);
    refreshRiskTrendChart(hist);
    refreshDomainsOverviewChart(hist);
}

function setFieldValue(name, value, { onlyIfEmpty = false } = {}) {
    if (value == null || value === '') {
        const els = document.querySelectorAll(
            `#patientForm [name="${CSS.escape(name)}"], #testsForm [name="${CSS.escape(name)}"]`
        );
        if (!els.length) return;
        els.forEach((el) => {
            if (onlyIfEmpty && String(el.value || '').trim() !== '' && el.type !== 'checkbox') return;
            if (el.type === 'checkbox') {
                el.checked = false;
            } else {
                el.value = '';
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return;
    }
    const els = document.querySelectorAll(
        `#patientForm [name="${CSS.escape(name)}"], #testsForm [name="${CSS.escape(name)}"]`
    );
    if (!els.length) return;
    els.forEach((el) => {
        if (onlyIfEmpty && String(el.value || '').trim() !== '') return;
        if (el.type === 'checkbox') {
            el.checked = value === true || value === '1' || value === 1 || value === 'on';
        } else if (el.type === 'radio') {
            el.checked = String(el.value) === String(value);
        } else {
            el.value = String(value);
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function applyPatientAllFields(patient) {
    if (!patient) return;
    if (patient.fio) setFieldValue('fio', patient.fio);
    if (patient.n_amb_karta) setFieldValue('n_amb_karta', patient.n_amb_karta);
    if (patient.age != null) setFieldValue('age', patient.age);
    if (patient.gender) setFieldValue('gender', patient.gender);
    if (patient.education !== undefined && patient.education !== '') {
        setFieldValue('education', patient.education);
    }
    if (patient.nasled_otya !== undefined && patient.nasled_otya !== '') {
        setFieldValue('nasled_otya', patient.nasled_otya);
    }
}

function applyRiskHistoryFromApi(data) {
    if (!data?.found) {
        saveDbHistoryForPatient([]);
        refreshHistoryChartsForCurrentPatient();
        return;
    }
    cachePatientId(data.patient_id);
    const dbHist = (data.risk_history || []).map((h) => ({
        ts: h.ts || Date.now(),
        visit_id: h.visit_id,
        visit_date: h.visit_date,
        visit_number: h.visit_number,
        date_label: h.date_label,
        risk_percent: h.risk_percent,
        domains: h.domains,
        impairment: h.impairment,
        doctor: h.doctor,
        notes: h.notes || '',
        from_db: true
    }));
    saveDbHistoryForPatient(dbHist);
    refreshHistoryChartsForCurrentPatient();

    const vid = _activeVisitContext.visitId;
    if (vid) {
        const row = dbHist.find((h) => h.visit_id === vid);
        const input = document.getElementById('visitCommentInput');
        const fromDb = (row?.notes || '').trim();
        if (input && fromDb && !input.value.trim()) {
            input.value = fromDb;
        }
        _lastSavedVisitComment = {
            visitId: vid,
            text: (input?.value ?? fromDb).trim()
        };
    }
}

async function selectPatientFromSuggestion(item) {
    hideFioSuggestions();
    if (!item?.patient_id) return;

    applyPatientAllFields(item);

    if (typeof fetchPatientContextFromDb !== 'function') return;
    const data = await fetchPatientContextFromDb({ patient_id: item.patient_id });
    if (data?.success && data.found) {
        if (data.patient) applyPatientAllFields(data.patient);
        applyRiskHistoryFromApi(data);
        showPredictStatus('Данные пациента загружены из базы.', 'ok');
    }
}

function hideFioSuggestions() {
    const list = document.getElementById('fioSuggestions');
    if (list) {
        list.hidden = true;
        list.innerHTML = '';
    }
    _fioSuggestions = [];
}

function renderFioSuggestions(items) {
    const list = document.getElementById('fioSuggestions');
    if (!list) return;
    _fioSuggestions = items || [];
    if (!_fioSuggestions.length) {
        hideFioSuggestions();
        return;
    }
    list.innerHTML = '';
    _fioSuggestions.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'fio-suggestion-item';
        li.textContent = item.label || item.fio || '';
        li.setAttribute('role', 'option');
        li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectPatientFromSuggestion(item);
        });
        list.appendChild(li);
    });
    list.hidden = false;
}

async function onFioInputForAutocomplete() {
    const input = document.querySelector('input[name="fio"]');
    if (!input) return;
    const q = (input.value || '').trim();
    refreshHistoryChartsForCurrentPatient();

    if (q.length < 2) {
        hideFioSuggestions();
        return;
    }

    if (typeof searchPatientsByFio !== 'function') return;
    const res = await searchPatientsByFio(q);
    if (res?.success && res.items?.length) {
        renderFioSuggestions(res.items);
    } else {
        hideFioSuggestions();
    }
}

function scheduleFioAutocomplete() {
    clearTimeout(_fioSearchTimer);
    _fioSearchTimer = setTimeout(onFioInputForAutocomplete, 280);
}

function cachePatientId(patientId) {
    if (patientId == null) return;
    const store = {};
    try {
        Object.assign(store, JSON.parse(sessionStorage.getItem(PATIENT_ID_CACHE_KEY) || '{}'));
    } catch (_) {}
    store[patientHistoryKey()] = patientId;
    sessionStorage.setItem(PATIENT_ID_CACHE_KEY, JSON.stringify(store));
}

async function syncPatientFromSupabase(options = {}) {
    const historyOnly = options.historyOnly === true;
    const fio = (document.querySelector('input[name="fio"]')?.value || '').trim();
    const card = (document.querySelector('input[name="n_amb_karta"]')?.value || '').trim();
    const ageRaw = document.querySelector('input[name="age"]')?.value;
    const age = ageRaw ? parseInt(ageRaw, 10) : null;

    if (!fio && !card) {
        saveDbHistoryForPatient([]);
        refreshHistoryChartsForCurrentPatient();
        return;
    }

    if (typeof fetchPatientContextFromDb !== 'function') return;

    const data = await fetchPatientContextFromDb({
        fio,
        n_amb_karta: card,
        age: Number.isNaN(age) ? null : age
    });

    if (!data?.success) return;

    if (!data.found) {
        saveDbHistoryForPatient([]);
        refreshHistoryChartsForCurrentPatient();
        return;
    }

    if (!historyOnly && data.patient) {
        applyPatientAllFields(data.patient);
    }
    applyRiskHistoryFromApi(data);
}

function scheduleSyncFromSupabase(options = {}) {
    clearTimeout(_dbLoadTimer);
    _dbLoadTimer = setTimeout(() => syncPatientFromSupabase(options), 700);
}

function calculateBostonCorrectInline() {
    if (typeof calculateBostonCorrect === 'function') {
        calculateBostonCorrect();
        return;
    }
    const spk = parseInt(document.querySelector('input[name="boston_spk"]')?.value, 10) || 0;
    const fpk = parseInt(document.querySelector('input[name="boston_fpk"]')?.value, 10) || 0;
    const out = document.querySelector('input[name="boston_correct"]');
    if (out) out.value = spk + fpk;
}

function domainsToChartPayload(domainsObj) {
    const labels = [];
    const vals = [];
    if (!domainsObj) return { labels, vals };
    Object.keys(domainsObj).forEach((k) => {
        const v = domainsObj[k];
        labels.push(k);
        vals.push(v == null ? 0 : v);
    });
    return { labels, vals };
}

function destroyChart(ch) {
    if (ch) {
        try {
            ch.destroy();
        } catch (_) {}
    }
    return null;
}

function refreshRiskTrendChart(history) {
    const canvas = document.getElementById('riskChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartRiskTrend = destroyChart(chartRiskTrend);
    const labels = history.map((h, i) => historyChartLabel(h) || `#${i + 1}`);
    const data = history.map((h) => h.risk_percent);
    chartRiskTrend = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Риск ${RISK_OUTCOME_LABEL}`,
                    data,
                    borderColor: '#2C5F8D',
                    backgroundColor: 'rgba(44,95,141,0.12)',
                    tension: 0.25,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    title: { display: true, text: '%', color: CHART_THEME.text },
                    grid: { color: CHART_THEME.grid },
                    ticks: { color: CHART_THEME.text }
                },
                x: {
                    title: { display: true, text: 'Дата осмотра', color: CHART_THEME.text },
                    grid: { display: false },
                    ticks: {
                        color: '#1a3d5c',
                        font: { size: 12, weight: '600' },
                        maxRotation: 40,
                        minRotation: 0
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const v = ctx.parsed.y;
                            const val = v == null ? '—' : Number(v).toFixed(2);
                            return `Риск КН дементного типа: ${val}%`;
                        }
                    }
                }
            }
        }
    });
}

function refreshDomainsOverviewChart(history) {
    const canvas = document.getElementById('domainsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartDomainsLast = destroyChart(chartDomainsLast);
    const last = history.length ? history[history.length - 1] : null;
    if (!last || !last.domains) return;
    const { labels, vals } = domainsToChartPayload(last.domains);
    const colors = vals.map((v) => domainBarColor(v));
    chartDomainsLast = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Сохранность домена',
                    data: vals,
                    backgroundColor: colors,
                    borderRadius: 4,
                    borderSkipped: false
                }
            ]
        },
        options: domainBarChartOptions('% (100 — норма)', {
            callbacks: {
                label(ctx) {
                    const v = last.domains[ctx.label];
                    if (v == null) return `${ctx.label}: нет данных`;
                    return `${ctx.label}: ${v}%`;
                }
            }
        })
    });
}

function refreshPredictionDomainsChart(domainsObj) {
    const canvas = document.getElementById('predictionDomainsChart');
    if (!canvas || typeof Chart === 'undefined') return;
    chartPredictionDomains = destroyChart(chartPredictionDomains);
    const { labels, vals } = domainsToChartPayload(domainsObj);
    chartPredictionDomains = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Доля сохранности',
                    data: vals,
                    backgroundColor: vals.map((v) => domainBarColor(v)),
                    borderRadius: 4,
                    borderSkipped: false
                }
            ]
        },
        options: domainBarChartOptions('%', {
            callbacks: {
                label(ctx) {
                    const nm = labels[ctx.dataIndex];
                    const orig = domainsObj[nm];
                    if (orig == null) return `${nm}: нет тестов (прочерк в протоколе)`;
                    return `${nm}: ${orig}% сохранности`;
                }
            }
        })
    });
}

function domainTableHtml(domains) {
    if (!domains || !Object.keys(domains).length) {
        return '<p class="visit-card__muted">Нет данных по доменам</p>';
    }
    const rows = Object.keys(domains)
        .map((k) => {
            const v = domains[k];
            const cell = v == null ? '—' : `${v}%`;
            return `<tr>
                <th scope="row">${escapeHtml(k)}</th>
                <td class="visit-domains-table__pct">${escapeHtml(cell)}</td>
            </tr>`;
        })
        .join('');
    return `<table class="visit-domains-table"><tbody>${rows}</tbody></table>`;
}

function setPredictButtonLoading(loading) {
    const btn = document.getElementById('btnPredict');
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.classList.add('btn-predict--loading');
        btn.textContent = 'Идёт расчёт риска…';
    } else {
        btn.disabled = false;
        btn.classList.remove('btn-predict--loading');
        btn.textContent = '🔮 Получить прогноз';
    }
}

function renderVisitBlocks(history) {
    const mount = document.getElementById('visitHistoryMount');
    if (!mount) return;
    mount.innerHTML = '';
    if (!history.length) {
        mount.innerHTML =
            '<p class="prediction-sub">Нет визитов с сохранённым риском. Укажите ФИО/карту — данные подтянутся из базы данных, либо нажмите «Получить прогноз».</p>';
        return;
    }

    const intro = document.createElement('div');
    intro.className = 'visit-history-intro';
    intro.innerHTML = '<h3 class="visit-history-intro__title">Расчёты по визитам</h3>';
    mount.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'visit-history-list';
    mount.appendChild(list);

    history.forEach((h, idx) => {
        const blk = document.createElement('article');
        blk.className = 'visit-card';
        const dateStr = historyChartLabel(h) || 'Дата не указана';
        const riskNum =
            h.risk_percent != null && h.risk_percent !== ''
                ? Number(h.risk_percent).toFixed(1).replace(/\.0$/, '')
                : null;
        const doctorName = (h.doctor || '').trim();
        const comment = (h.notes || '').trim();
        const isLatest = idx === history.length - 1;

        const patternBlock = h.impairment
            ? `<div class="visit-card__block">
                <h4 class="visit-card__block-title visit-card__block-title--pattern">Паттерн нарушения</h4>
                <div class="visit-card__pattern-wrap">${impairmentPatternHtml(h.impairment)}</div>
               </div>`
            : '';

        const commentHtml = comment
            ? `<p class="visit-card__comment">${escapeHtml(comment)}</p>`
            : '<p class="visit-card__comment visit-card__comment--empty">Комментарий не добавлен</p>';

        blk.innerHTML = `
            <button type="button" class="visit-card__head" aria-expanded="false" aria-controls="visit-${idx}-content">
                <div class="visit-card__head-risk" title="Риск КН дементного типа за 3 года">
                    ${
                        riskNum != null
                            ? `<span class="visit-card__risk-num">${escapeHtml(riskNum)}</span><span class="visit-card__risk-unit">%</span>`
                            : '<span class="visit-card__risk-num">—</span>'
                    }
                </div>
                <div class="visit-card__head-text">
                    <span class="visit-card__date">${escapeHtml(dateStr)}</span>
                    <span class="visit-card__sub">дата осмотра</span>
                </div>
                <span class="visit-card__chev" aria-hidden="true"></span>
            </button>
            <div class="visit-card__body" id="visit-${idx}-content" hidden>
                ${patternBlock}
                <div class="visit-card__block">
                    <h4 class="visit-card__block-title">Сохранность доменов</h4>
                    ${domainTableHtml(h.domains)}
                </div>
                <div class="visit-card__block visit-card__block--inline">
                    <h4 class="visit-card__block-title">Врач</h4>
                    <p class="visit-card__plain">${escapeHtml(doctorName || 'Не указан')}</p>
                </div>
                <div class="visit-card__block">
                    <h4 class="visit-card__block-title">Комментарий врача</h4>
                    ${commentHtml}
                </div>
            </div>
        `;
        const head = blk.querySelector('.visit-card__head');
        head.addEventListener('click', () => toggleVisit(idx));
        list.appendChild(blk);

        if (isLatest) {
            requestAnimationFrame(() => toggleVisit(idx));
        }
    });
}

function toggleVisit(ix) {
    const body = document.getElementById(`visit-${ix}-content`);
    const card = body?.closest('.visit-card');
    const head = card?.querySelector('.visit-card__head');
    if (!body || !card) return;
    const open = body.hidden;
    body.hidden = !open;
    card.classList.toggle('visit-card--open', open);
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function exportSessionHistory() {
    const h = loadHistory();
    const blob = new Blob([JSON.stringify(h, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cdss_session_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function hidePredictSaveCard() {
    const card = document.getElementById('predictSaveCard');
    if (card) card.hidden = true;
}

function renderPredictSaveCard(data, kind) {
    const card = document.getElementById('predictSaveCard');
    const statusLine = document.getElementById('predictStatusResult');
    if (statusLine) statusLine.hidden = true;

    if (!card) return;

    if (kind === 'ok' && data?.saved) {
        const tests =
            data.tests_saved != null
                ? `<span>Тестов в БД: <strong>${data.tests_saved}</strong></span>`
                : '';
        card.className = 'predict-save-card predict-save-card--ok';
        card.innerHTML = `
            <div class="predict-save-card__icon" aria-hidden="true">✓</div>
            <div class="predict-save-card__body">
                <p class="predict-save-card__title">Прогноз рассчитан и сохранён в базу данных</p>
                <p class="predict-save-card__meta">
                    <span>Пациент id: <strong>${escapeHtml(data.patient_id)}</strong></span>
                    <span>Визит id: <strong>${escapeHtml(data.visit_id)}</strong></span>
                    ${tests}
                </p>
            </div>`;
        card.hidden = false;
        return;
    }

    if (kind === 'warn') {
        card.className = 'predict-save-card predict-save-card--warn';
        card.innerHTML = `
            <div class="predict-save-card__icon" aria-hidden="true">!</div>
            <div class="predict-save-card__body">
                <p class="predict-save-card__title">Прогноз рассчитан</p>
                <p class="predict-save-card__meta">${escapeHtml(data?.save_error || data?.text || '')}</p>
            </div>`;
        card.hidden = false;
        return;
    }

    hidePredictSaveCard();
}

function showPredictStatus(message, kind = 'info') {
    const text = String(message || '').trim();
    const testsStatus = document.getElementById('predictStatus');
    const resultLine = document.getElementById('predictStatusResult');

    if (kind === 'ok' || (kind === 'warn' && text.includes('БД'))) {
        if (testsStatus) {
            testsStatus.hidden = true;
            testsStatus.textContent = '';
        }
        if (resultLine && kind !== 'ok') {
            resultLine.hidden = !text;
            resultLine.textContent = text;
            resultLine.className = `predict-status predict-status--${kind}`;
        }
        return;
    }

    hidePredictSaveCard();
    [testsStatus, resultLine].filter(Boolean).forEach((el) => {
        el.hidden = !text;
        el.textContent = text;
        el.className = `predict-status predict-status--${kind}`;
    });
    console.log('[predict]', kind, text);
}

function describeDbSave(data) {
    if (!data) return { kind: 'err', text: 'Нет ответа от сервера.' };
    if (data.saved === true) {
        return { kind: 'ok', data };
    }
    if (data.save_skipped && data.save_message) {
        return { kind: 'info', text: data.save_message };
    }
    if (data.save_error) {
        return { kind: 'warn', text: `В БД не сохранилось: ${data.save_error}`, save_error: data.save_error };
    }
    return {
        kind: 'warn',
        text:
            'Статус сохранения в БД неизвестен. Проверьте, что backend запущен (python app.py) и нет ошибок в консоли (F12).'
    };
}

function setVisitCommentStatus(message, isError = false) {
    const el = document.getElementById('visitCommentStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = isError ? 'visit-comment-status visit-comment-status--err' : 'visit-comment-status';
}

function showVisitCommentBlock(visitId, notes = '') {
    const block = document.getElementById('visitCommentBlock');
    const input = document.getElementById('visitCommentInput');
    if (!block || !visitId) return;
    block.hidden = false;
    const text = String(notes || '').trim();
    if (input) input.value = text;
    _lastSavedVisitComment = { visitId, text };
    setVisitCommentStatus('');
}

function hideVisitCommentBlock() {
    const block = document.getElementById('visitCommentBlock');
    if (block) block.hidden = true;
    setVisitCommentStatus('');
}

function bindActiveVisitFromPredict(data) {
    if (data?.saved && data.visit_id) {
        _activeVisitContext = {
            visitId: data.visit_id,
            patientId: data.patient_id ?? null
        };
        showVisitCommentBlock(data.visit_id, '');
        return;
    }
    _activeVisitContext = { visitId: null, patientId: null };
    hideVisitCommentBlock();
}

function patchSessionHistoryNotes(visitId, notes) {
    if (!visitId) return;
    const hist = loadHistory();
    for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].visit_id === visitId) {
            hist[i].notes = notes;
            saveHistory(hist);
            break;
        }
    }
}

async function saveVisitComment() {
    const visitId = _activeVisitContext.visitId;
    const input = document.getElementById('visitCommentInput');
    const btn = document.getElementById('btnSaveVisitComment');
    if (!visitId) {
        setVisitCommentStatus('Сначала получите прогноз — визит ещё не сохранён.', true);
        return;
    }
    const notes = (input?.value ?? '').trim();
    if (typeof saveVisitNotesToBackend !== 'function') {
        setVisitCommentStatus('Сервер недоступен.', true);
        return;
    }
    if (
        _lastSavedVisitComment.visitId === visitId &&
        _lastSavedVisitComment.text === notes
    ) {
        setVisitCommentStatus(
            'Текст уже в базе данных. Повторное сохранение ничего не меняет — отредактируйте поле и нажмите снова.',
            false
        );
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Сохранение…';
    }
    setVisitCommentStatus('');
    const res = await saveVisitNotesToBackend(visitId, notes);
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Сохранить комментарий';
    }
    if (!res?.success) {
        setVisitCommentStatus(res?.error || 'Не удалось сохранить.', true);
        return;
    }
    _lastSavedVisitComment = { visitId, text: notes };
    patchSessionHistoryNotes(visitId, notes);
    setVisitCommentStatus(
        notes
            ? 'Комментарий сохранён в базу данных. Повторное нажатие с тем же текстом изменений не внесёт.'
            : 'Комментарий очищен в базе данных.'
    );
    if (typeof syncPatientFromSupabase === 'function') {
        syncPatientFromSupabase({ historyOnly: true });
    }
}

async function calculatePrediction() {
    const btn = document.getElementById('btnPredict');
    try {
        showPredictStatus('⏳ Считаем прогноз и сохраняем в БД…', 'info');

        const formFlat = collectFormFlat();
        const patient = buildPatientPayload();
        const visit = buildVisitPayload();
        const fio = (document.querySelector('input[name="fio"]')?.value || '').trim();
        const dateOsm = (document.querySelector('input[name="date_osm"]')?.value || '').trim();
        if (!fio) {
            const msg = 'Укажите ФИО пациента на вкладке «Основные данные».';
            showPredictStatus(msg, 'warn');
            alert(msg);
            if (typeof switchTab === 'function') switchTab('patient');
            return;
        }
        if (!dateOsm) {
            const msg = 'Укажите дату осмотра на вкладке «Основные данные».';
            showPredictStatus(msg, 'warn');
            alert(msg);
            if (typeof switchTab === 'function') switchTab('patient');
            return;
        }
        if (!patient.age || !patient.gender) {
            const msg = 'Укажите возраст и пол на вкладке «Основные данные».';
            showPredictStatus(msg, 'warn');
            alert(msg);
            if (typeof switchTab === 'function') switchTab('patient');
            return;
        }

        if (typeof calculateMMSE === 'function') calculateMMSE();
        if (typeof calculateBenton === 'function') calculateBenton();
        calculateFABTotalInline();
        calculateBostonCorrectInline();

        Object.assign(formFlat, collectFormFlat());

        const payload = {
            patient,
            visit: {
                date_osm: visit.date_osm,
                doctor: visit.doctor
            },
            form: formFlat
        };

        setPredictButtonLoading(true);

        const data = await predictFromBackend(
            payload,
            typeof collectDrawingFiles === 'function' ? collectDrawingFiles() : {}
        );
        if (!data) {
            showPredictStatus(
                '❌ Сервер не ответил. Запустите в папке backend: python app.py и откройте http://localhost:5000/',
                'err'
            );
            return;
        }
        if (data.success === false) {
            const msg = data.error || 'Ошибка расчёта';
            showPredictStatus('❌ ' + msg, 'err');
            alert('❌ Прогноз: ' + msg);
            return;
        }

        const db = describeDbSave(data);
        if (db.kind === 'ok') {
            renderPredictSaveCard(db.data, 'ok');
            bindActiveVisitFromPredict(data);
        } else {
            hidePredictSaveCard();
            bindActiveVisitFromPredict({});
            showPredictStatus(db.text, db.kind);
            if (db.save_error) renderPredictSaveCard({ save_error: db.save_error }, 'warn');
        }

        if (data.drawings_saved) {
            const extra = `Фото сохранено: ${data.drawings_saved}.`;
            if (db.kind === 'ok') {
                showPredictStatus(`${db.text} ${extra}`, 'ok');
            }
        }
        if (data.drawings_errors?.length) {
            showPredictStatus(data.drawings_errors.join(' '), 'warn');
        }

        const riskEl = document.getElementById('riskPercentHero');
        if (riskEl) riskEl.textContent = String(data.dementia_risk_percent ?? '—');

        setImpairmentBadge(data.impairment_pattern_label || '');

        refreshPredictionDomainsChart(data.domains_preservation_percent || {});

        const dateLabel = visit.date_osm
            ? formatVisitDateLabel(visit.date_osm)
            : formatVisitDateLabel(new Date().toISOString().slice(0, 10));

        const entry = {
            ts: Date.now(),
            visit_id: data.visit_id ?? null,
            visit_date: visit.date_osm || new Date().toISOString().slice(0, 10),
            patient_fio: buildPatientPayload().fio || '',
            date_label: dateLabel,
            risk_percent: data.dementia_risk_percent,
            domains: data.domains_preservation_percent,
            impairment: data.impairment_pattern_label,
            doctor: visit.doctor,
            notes: ''
        };

        const hist = loadHistory();
        hist.push(entry);
        saveHistory(hist);

        refreshHistoryChartsForCurrentPatient();

        if (data.saved) {
            syncPatientFromSupabase({ historyOnly: true });
        }

        switchTab('prediction');
    } catch (err) {
        console.error(err);
        const msg = err?.message || String(err);
        showPredictStatus('❌ Ошибка в браузере: ' + msg, 'err');
        alert('❌ Ошибка: ' + msg);
    } finally {
        setPredictButtonLoading(false);
    }
}

function calculateFABTotalInline() {
    const fabInputs = ['fab1', 'fab2', 'fab3', 'fab4', 'fab5', 'fab6'];
    let total = 0;
    let any = false;
    fabInputs.forEach((id) => {
        const input = document.getElementById(id);
        const raw = input?.value;
        if (raw !== '' && raw != null) {
            any = true;
            total += parseInt(raw, 10) || 0;
        }
    });
    const fabTotalInput = document.getElementById('fab_total');
    if (fabTotalInput) fabTotalInput.value = any ? total : '';
}

const DEMO_IDENTITY_FIELDS = ['fio', 'doctor', 'n_amb_karta', 'date_osm'];

function clearDemoIdentityFields() {
    DEMO_IDENTITY_FIELDS.forEach((name) => setFieldValue(name, ''));
}

function set12wCheckbox(row, col, tableIndex, checked) {
    const boxes = document.querySelectorAll(
        `#testsForm input[name="12w_${row}_${col}"]`
    );
    const el = boxes[tableIndex === 2 ? 1 : 0] ?? boxes[0];
    if (!el) return;
    el.checked = !!checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fill12WordsDemo(mode) {
    if (mode === 'healthy') {
        for (let col = 1; col <= 12; col++) {
            set12wCheckbox('nv', col, 1, true);
            set12wCheckbox('skp', col, 1, true);
            set12wCheckbox('nv', col, 2, true);
            set12wCheckbox('skp', col, 2, true);
        }
    } else {
        for (let col = 1; col <= 12; col++) {
            set12wCheckbox('nv', col, 1, col <= 2);
            set12wCheckbox('skp', col, 1, false);
            set12wCheckbox('nv', col, 2, col === 1);
            set12wCheckbox('skp', col, 2, false);
        }
    }
}

function fillBentonDemo(mode) {
    for (let i = 1; i <= 15; i++) {
        ['a', 'b', 'c', 'd'].forEach((letter) => {
            const cb = document.querySelector(
                `#testsForm input[name="b${i}${letter}"]`
            );
            if (!cb) return;
            const isCorrect = cb.hasAttribute('data-correct');
            if (mode === 'healthy') {
                cb.checked = isCorrect;
            } else {
                cb.checked = !isCorrect && letter === 'a';
            }
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
}

const NPI_SYMPTOM_KEYS = [
    'delusions', 'halluc', 'agitation', 'depression', 'anxiety', 'euphoria',
    'apathy', 'disinhibition', 'irritability', 'motor', 'sleep', 'appetite'
];

const NEURO_SELECT_NAMES = [
    'mimic_tests', 'eye_restriction', 'tongue_deviation', 'oral_reflexes',
    'pseudobulbar_symptoms', 'bulbar_symptoms', 'pyramidal_syndrome', 'parkinsonism_syndrome',
    'chorea', 'myoclonia', 'other_hyperkineses', 'postural_tremor', 'intentional_tremor',
    'resting_tremor', 'deep_sensitivity', 'surface_sensitivity', 'polyneuropathic_syndrome',
    'postural_disorders', 'falls', 'cerebellar_ataxia', 'sensitive_ataxia', 'vestibular_ataxia',
    'frontal_ataxia', 'functional_ataxia', 'grasp_reflex', 'pelvic_disorders',
    'pelvic_disorder_type', 'counter_resistance'
];

const HACHINSKI_CHECKBOX_NAMES = [
    'hachinski_sudden_onset', 'hachinski_stepwise', 'hachinski_fluctuations',
    'hachinski_nocturnal_confusion', 'hachinski_personality_preserved', 'hachinski_depression',
    'hachinski_somatic_complaints', 'hachinski_emotional_incontinence', 'hachinski_hypertension',
    'hachinski_stroke_history', 'hachinski_other_arteriosclerosis',
    'hachinski_subjective_neuro_symptoms', 'hachinski_objective_neuro_symptoms'
];

const HACHINSKI_HIGH_CHECKS = [
    'hachinski_stepwise', 'hachinski_stroke_history', 'hachinski_hypertension',
    'hachinski_objective_neuro_symptoms', 'hachinski_sudden_onset', 'hachinski_fluctuations',
    'hachinski_nocturnal_confusion'
];

function neuroScalarsAllZero() {
    const o = {};
    NEURO_SELECT_NAMES.forEach((n) => {
        o[n] = '0';
    });
    return o;
}

function buildDemoScalars(mode) {
    const healthy = mode === 'healthy';
    const neuro = neuroScalarsAllZero();
    if (!healthy) {
        Object.assign(neuro, {
            oral_reflexes: '3',
            pyramidal_syndrome: '3',
            parkinsonism_syndrome: '2',
            pseudobulbar_symptoms: '2',
            postural_disorders: '2',
            falls: '2',
            grasp_reflex: '1',
            resting_tremor: '1'
        });
    }

    const patientCommon = {
        n_vizit: '1',
        ...neuro
    };

    const patientHealthy = {
        ...patientCommon,
        age: '62',
        gender: 'женский',
        education: '3',
        nasled_otya: '0',
        dlit_zabol: '6',
        dlit_nabl: '36',
        tip_sindroma_ukn: '1',
        tyazhest_narush: '1',
        techenie_bolezni: '0',
        dinamika_simptomov: '0',
        naprav_diagn: 'когнитивные нарушения',
        infarkt: '0',
        tyazh_serd: '0',
        sd_ana: '0',
        ag_ana: '1',
        onmk_ana: '0',
        kurenie_ana: '0',
        alkogol_ana: '0',
        yazva: '0',
        onkologia_ana: '0',
        schit_ana: '0',
        nevr_patol_ana: '0',
        behavior_disorders: '0',
        mri1_presence: '1',
        ct_presence: '0',
        mri2_periventricular: '0',
        mri3_subcortical: '0',
        mri4_external_atrophy: '0',
        mri5_internal_atrophy: '1',
        mri6_cysts: '0',
        МРТфазекас: 'отсутствует',
        МРТGCA: 'легкая',
        МРТатрофгиппокамп: 'МТА 1',
        локатрофия: 'нет',
        бетаамилоид: '920',
        общийтаубелок: '165',
        фосфорилиртаубелок: '16',
        treatment_duration_months: '0',
        treatment1_history: '0',
        treatment3_main: '0',
        treatment4_additional: '0',
        treatment5_tolerance: '0',
        treatment_change: '0',
        treatment_additional_appointment: '0',
        diagnoz: '',
        osobennosti_diagnoza: '0'
    };

    const patientHigh = {
        ...patientCommon,
        age: '82',
        gender: 'мужской',
        education: '0',
        nasled_otya: '1',
        dlit_zabol: '84',
        dlit_nabl: '60',
        tip_sindroma_ukn: '2',
        tyazhest_narush: '6',
        techenie_bolezni: '2',
        dinamika_simptomov: '3',
        naprav_diagn: 'БА',
        infarkt: '1',
        tyazh_serd: '3',
        sd_ana: '3',
        ag_ana: '3',
        onmk_ana: '3',
        kurenie_ana: '2',
        alkogol_ana: '2',
        yazva: '2',
        onkologia_ana: '0',
        schit_ana: '1',
        nevr_patol_ana: '3',
        behavior_disorders: '3',
        mri1_presence: '1',
        ct_presence: '1',
        mri2_periventricular: '3',
        mri3_subcortical: '3',
        mri4_external_atrophy: '3',
        mri5_internal_atrophy: '3',
        mri6_cysts: '3',
        МРТфазекас: 'фазекас 3',
        МРТGCA: 'выраженная',
        МРТатрофгиппокамп: 'МТА 4',
        локатрофия: 'лобная доля',
        бетаамилоид: '380',
        общийтаубелок: '780',
        фосфорилиртаубелок: '85',
        treatment_duration_months: '48',
        treatment1_history: '2',
        treatment3_main: '2',
        treatment4_additional: '1',
        treatment5_tolerance: '2',
        treatment_change: '2',
        treatment_additional_appointment: '4',
        diagnoz: '1',
        osobennosti_diagnoza: '3'
    };

    const testsHealthy = {
        '5w_nv': '5',
        '5w_ov': '5',
        clock: '0',
        cube: '0',
        graphomotor: '0',
        mmse_time: '5',
        mmse_place: '5',
        mmse_repeat: '3',
        mmse_count: '5',
        mmse_memory: '3',
        mmse_naming: '2',
        mmse_phrase: '1',
        mmse_command: '3',
        mmse_read: '1',
        mmse_write: '1',
        mmse_praxis: '1',
        fab1: '3',
        fab2: '3',
        fab3: '3',
        fab4: '3',
        fab5: '3',
        fab6: '3',
        tmt_a_seconds: '35',
        тмтB: '75',
        digit_symbol: '110',
        digit_symbol_correct: '110',
        assoc_c: '22',
        assoc_animals: '20',
        boston_spk: '0',
        boston_fpk: '0',
        cdr_memory: '0',
        cdr_orientation: '0',
        cdr_judgment: '0',
        cdr_community: '0',
        cdr_home: '0',
        cdr_care: '0',
        ГамильтонДепрессия: '2',
        ГамильтонТревога: '2',
        шкалаапатии: '5',
        beck: '5'
    };

    const testsHigh = {
        '5w_nv': '0',
        '5w_ov': '0',
        clock: '10',
        cube: '3',
        graphomotor: '3',
        mmse_time: '0',
        mmse_place: '0',
        mmse_repeat: '0',
        mmse_count: '0',
        mmse_memory: '0',
        mmse_naming: '0',
        mmse_phrase: '0',
        mmse_command: '0',
        mmse_read: '0',
        mmse_write: '0',
        mmse_praxis: '0',
        fab1: '0',
        fab2: '0',
        fab3: '0',
        fab4: '0',
        fab5: '0',
        fab6: '0',
        tmt_a_seconds: '300',
        тмтB: '300',
        digit_symbol: '0',
        digit_symbol_correct: '0',
        assoc_c: '0',
        assoc_animals: '0',
        boston_spk: '10',
        boston_fpk: '10',
        cdr_memory: '3',
        cdr_orientation: '3',
        cdr_judgment: '3',
        cdr_community: '3',
        cdr_home: '3',
        cdr_care: '3',
        ГамильтонДепрессия: '28',
        ГамильтонТревога: '30',
        шкалаапатии: '35',
        beck: '40'
    };

    return healthy
        ? { ...patientHealthy, ...testsHealthy }
        : { ...patientHigh, ...testsHigh };
}

function fillHachinskiDemo(mode) {
    HACHINSKI_CHECKBOX_NAMES.forEach((name) => {
        const checked = mode === 'high' && HACHINSKI_HIGH_CHECKS.includes(name);
        setFieldValue(name, checked ? '1' : '');
    });
    if (typeof calculateHachinski === 'function') {
        calculateHachinski();
    }
}

function fillNpiDemo(mode) {
    NPI_SYMPTOM_KEYS.forEach((symptom) => {
        const freq = document.querySelector(`select[name="npi_${symptom}_freq"]`);
        const sev = document.querySelector(`select[name="npi_${symptom}_sev"]`);
        if (!freq || !sev) return;
        if (mode === 'high') {
            freq.value = '4';
            sev.value = '3';
        } else {
            freq.value = '';
            sev.value = '';
        }
        freq.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (typeof window.calculateNPITotal === 'function') {
        window.calculateNPITotal();
    } else {
        const totalEl = document.getElementById('npi_total');
        if (totalEl) totalEl.value = mode === 'high' ? '144' : '0';
    }
}

function runDerivedFieldCalculations() {
    if (typeof calculateMMSE === 'function') calculateMMSE();
    if (typeof calculateBenton === 'function') calculateBenton();
    if (typeof calculateCDR === 'function') calculateCDR();
    calculateFABTotalInline();
    calculateBostonCorrectInline();
}

function fillAutofillDemo(mode) {
    const profile = mode === 'high' ? 'high' : 'healthy';
    clearDemoIdentityFields();
    const scalars = buildDemoScalars(profile);
    Object.entries(scalars).forEach(([name, value]) => setFieldValue(name, value));
    fillHachinskiDemo(profile);
    fill12WordsDemo(profile);
    fillBentonDemo(profile);
    fillNpiDemo(profile);
    runDerivedFieldCalculations();
    const label =
        profile === 'high'
            ? 'Заполнены «Основные данные» и «Когнитивные тесты» (макс. риск). Укажите ФИО и дату, затем «Получить прогноз».'
            : 'Заполнены «Основные данные» и «Когнитивные тесты» (здоровый профиль). Укажите ФИО и дату, затем «Получить прогноз».';
    showPredictStatus(label, 'info');
    if (typeof switchTab === 'function') switchTab('tests');
}

document.addEventListener('DOMContentLoaded', () => {
    refreshHistoryChartsForCurrentPatient();

    document.getElementById('btnDemoGood')?.addEventListener('click', () =>
        fillAutofillDemo('healthy')
    );
    document.getElementById('btnDemoBad')?.addEventListener('click', () =>
        fillAutofillDemo('high')
    );


    const fioInput = document.querySelector('input[name="fio"]');
    const cardInput = document.querySelector('input[name="n_amb_karta"]');
    const fioWrap = document.querySelector('.fio-autocomplete-wrap');

    if (fioInput) {
        fioInput.addEventListener('input', scheduleFioAutocomplete);
        fioInput.addEventListener('blur', () => {
            scheduleSyncFromSupabase({ historyOnly: false });
        });
        fioInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideFioSuggestions();
        });
    }
    if (fioWrap) {
        document.addEventListener('click', (e) => {
            if (!fioWrap.contains(e.target)) hideFioSuggestions();
        });
    }
    if (cardInput) {
        cardInput.addEventListener('blur', () => {
            scheduleSyncFromSupabase({ historyOnly: false });
        });
    }

    const btnComment = document.getElementById('btnSaveVisitComment');
    if (btnComment) btnComment.addEventListener('click', saveVisitComment);

    window.toggleVisit = toggleVisit;
    window.saveVisitComment = saveVisitComment;
    window.calculateBostonCorrectInline = calculateBostonCorrectInline;
});

window.calculatePrediction = calculatePrediction;

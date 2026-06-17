(function () {
    const PAGE_IDS = ['patient', 'tests', 'prediction', 'progression'];

    function getActiveTabId() {
        const page = document.querySelector('.page.active');
        return page ? page.id : 'tests';
    }

    function scopeForTab(tabId) {
        if (tabId === 'progression') return 'progression';
        if (tabId === 'prediction') return 'prediction';
        if (tabId === 'patient') return 'patient';
        return 'tests';
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function fieldValue(selector) {
        const el = document.querySelector(selector);
        if (!el) return '';
        return String(el.value || '').trim();
    }

    function formatDateRu(iso) {
        if (!iso) return '';
        const p = iso.split('-');
        if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
        return iso;
    }

    function buildPrintHeader() {
        const el = document.getElementById('printSheetHeader');
        if (!el) return;

        const fio = fieldValue('#fio') || fieldValue('input[name="fio"]');
        const age = fieldValue('#age') || fieldValue('input[name="age"]');
        const gender = fieldValue('#gender') || fieldValue('select[name="gender"]');
        const date = fieldValue('#date_osm') || fieldValue('input[name="date_osm"]');
        const card = fieldValue('#n_amb_karta') || fieldValue('input[name="n_amb_karta"]');
        const doctor = fieldValue('#doctor') || fieldValue('input[name="doctor"]');
        const visit = fieldValue('#n_vizit') || fieldValue('input[name="n_vizit"]');

        const meta = [];
        if (age) meta.push(`возраст ${escapeHtml(age)}`);
        if (gender) meta.push(escapeHtml(gender));
        if (date) meta.push(`осмотр ${escapeHtml(formatDateRu(date))}`);
        if (card) meta.push(`карта № ${escapeHtml(card)}`);
        if (visit) meta.push(`визит ${escapeHtml(visit)}`);
        if (doctor) meta.push(`врач: ${escapeHtml(doctor)}`);

        el.innerHTML = `
            <div class="print-sheet-header__brand">Система поддержки врачебных решений — когнитивный прототип</div>
            ${fio ? `<div class="print-sheet-header__fio">${escapeHtml(fio)}</div>` : ''}
            ${meta.length ? `<div class="print-sheet-header__meta">${meta.join(' · ')}</div>` : ''}
        `;
    }

    function resizeAllCharts() {
        if (typeof Chart === 'undefined') return;
        document.querySelectorAll('canvas').forEach((canvas) => {
            const chart = Chart.getChart(canvas);
            if (chart) {
                chart.resize();
            }
        });
    }

    function expandVisitCardsForPrint() {
        document.querySelectorAll('.visit-card__body[hidden]').forEach((body) => {
            body.dataset.printWasHidden = '1';
            body.removeAttribute('hidden');
        });
    }

    function restoreVisitCardsAfterPrint() {
        document.querySelectorAll('.visit-card__body[data-print-was-hidden]').forEach((body) => {
            body.setAttribute('hidden', '');
            delete body.dataset.printWasHidden;
        });
    }

    function preparePrint(scope) {
        buildPrintHeader();
        document.body.dataset.printScope = scope;
        expandVisitCardsForPrint();
        resizeAllCharts();
    }

    function clearPrint() {
        delete document.body.dataset.printScope;
        restoreVisitCardsAfterPrint();
    }

    function printApplication(forcedScope) {
        const scope = forcedScope || scopeForTab(getActiveTabId());
        preparePrint(scope);
        window.print();
    }

    window.printApplication = printApplication;

    window.addEventListener('beforeprint', () => {
        if (!document.body.dataset.printScope) {
            preparePrint(scopeForTab(getActiveTabId()));
        } else {
            buildPrintHeader();
            expandVisitCardsForPrint();
            resizeAllCharts();
        }
    });

    window.addEventListener('afterprint', clearPrint);
})();

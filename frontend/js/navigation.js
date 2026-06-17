function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', function() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
});

function calculateMMSE() {
    const fields = ['mmse_time', 'mmse_place', 'mmse_repeat', 'mmse_count', 'mmse_memory',
        'mmse_naming', 'mmse_phrase', 'mmse_command', 'mmse_read', 'mmse_write', 'mmse_praxis'];
    let total = 0;
    let any = false;
    fields.forEach(name => {
        const input = document.querySelector(`input[name="${name}"]`);
        if (input && input.value !== '') {
            any = true;
            total += parseInt(input.value, 10) || 0;
        }
    });

    const mmseTotal = document.querySelector('#mmse_total');
    if (mmseTotal) {
        mmseTotal.value = any ? total : '';
    }
}

const BENTON_ANSWERS = ['d', 'a', 'c', 'c', 'b', 'd', 'b', 'a', 'a', 'c', 'b', 'c', 'a', 'd', 'c'];
function calculateBenton() {
    let correct = 0;
    let any = false;
    for (let i = 1; i <= 15; i++) {
        const letters = ['a', 'b', 'c', 'd'];
        const checked = letters.some((letter) => {
            const cb = document.querySelector(`input[name="b${i}${letter}"]`);
            return cb && cb.checked;
        });
        if (checked) any = true;

        const correctAnswer = BENTON_ANSWERS[i - 1];
        const correctCheckbox = document.querySelector(`input[name="b${i}${correctAnswer}"]`);
        if (correctCheckbox && correctCheckbox.checked) {
            correct++;
        }
    }

    const bentonTotal = document.querySelector('#benton_total');
    if (bentonTotal) {
        bentonTotal.value = any ? correct : '';
    }
}

function calculateBostonCorrect() {
    const spk = parseInt(document.querySelector('input[name="boston_spk"]')?.value, 10) || 0;
    const fpk = parseInt(document.querySelector('input[name="boston_fpk"]')?.value, 10) || 0;
    const out = document.querySelector('input[name="boston_correct"]');
    if (out) {
        out.value = spk + fpk;
    }
}

function calculateCDR() {
    const fields = ['cdr_memory', 'cdr_orientation', 'cdr_judgment', 'cdr_community', 'cdr_home', 'cdr_care'];
    let total = 0;
    fields.forEach(name => {
        const select = document.querySelector(`select[name="${name}"]`);
        if (select && select.value) {
            total += parseFloat(select.value) || 0;
        }
    });

    const cdrSum = document.querySelector('#cdr_sum');
    if (cdrSum) {
        cdrSum.value = total.toFixed(1);
    }
}

function calculateNPI(symptom) {
    const freqSelect = document.querySelector(`select[name="npi_${symptom}_freq"]`);
    const sevSelect = document.querySelector(`select[name="npi_${symptom}_sev"]`);
    const prodInput = document.querySelector(`#npi_${symptom}_prod`);
    if (freqSelect && sevSelect && prodInput) {
        const freq = (freqSelect.value !== '') ? parseInt(freqSelect.value) : 0;
        const sev = (sevSelect.value !== '') ? parseInt(sevSelect.value) : 0;
        const product = freq * sev;
        prodInput.value = product;
    }
}

const HACHINSKI_SCORES = {
    'hachinski_sudden_onset': 2,
    'hachinski_stepwise': 1,
    'hachinski_fluctuations': 2,
    'hachinski_nocturnal_confusion': 1,
    'hachinski_personality_preserved': 1,
    'hachinski_depression': 1,
    'hachinski_somatic_complaints': 1,
    'hachinski_emotional_incontinence': 1,
    'hachinski_hypertension': 1,
    'hachinski_stroke_history': 2,
    'hachinski_other_arteriosclerosis': 1,
    'hachinski_subjective_neuro_symptoms': 2,
    'hachinski_objective_neuro_symptoms': 2
};

function calculateHachinski() {
    let total = 0;
    Object.keys(HACHINSKI_SCORES).forEach(name => {
        const checkbox = document.querySelector(`input[name="${name}"]`);
        if (checkbox && checkbox.checked) {
            total += HACHINSKI_SCORES[name];
        }
    });
    const hachinskiTotal = document.querySelector('#hachinski_total');
    if (hachinskiTotal) {
        hachinskiTotal.value = total;
    }
}

document.addEventListener('DOMContentLoaded', function() {

    function update12WordsRowSum(rowType, tableNum) {
        const sumId = `12w_${rowType}_sum${tableNum}`;
        const sumInput = document.getElementById(sumId);
        if (!sumInput) return;
        let count = 0;
        for (let col = 1; col <= 12; col++) {
            const checkboxes = document.querySelectorAll(`input[name="12w_${rowType}_${col}"]`);
            const checkbox = tableNum === 1 ? checkboxes[0] : checkboxes[1];
            if (checkbox && checkbox.checked) count++;
        }
        sumInput.value = count;
        update12WordsTotals();
    }

    function update12WordsTotals() {
        const pvplNv = parseInt(document.getElementById('12w_nv_sum1')?.value || 0);
        const pvplSkp = parseInt(document.getElementById('12w_skp_sum1')?.value || 0);
        const pvplTotal = document.querySelector('input[name="12w_pvpl"]');
        if (pvplTotal) pvplTotal.value = pvplNv + pvplSkp;

        const ovNv = parseInt(document.getElementById('12w_nv_sum2')?.value || 0);
        const ovSkp = parseInt(document.getElementById('12w_skp_sum2')?.value || 0);
        const ovTotal = document.querySelector('input[name="12w_ov"]');
        if (ovTotal) ovTotal.value = ovNv + ovSkp;
    }

    ['nv', 'skp'].forEach(rowType => {
        for (let col = 1; col <= 12; col++) {
            const checkboxes1 = document.querySelectorAll(`input[name="12w_${rowType}_${col}"]`);
            if (checkboxes1[0]) checkboxes1[0].addEventListener('change', () => update12WordsRowSum(rowType, 1));
            if (checkboxes1[1]) checkboxes1[1].addEventListener('change', () => update12WordsRowSum(rowType, 2));
        }
    });

    const mmseFields = ['mmse_time', 'mmse_place', 'mmse_repeat', 'mmse_count', 'mmse_memory',
        'mmse_naming', 'mmse_phrase', 'mmse_command', 'mmse_read', 'mmse_write', 'mmse_praxis'];
    mmseFields.forEach(name => {
        const input = document.querySelector(`input[name="${name}"]`);
        if (input) {
            input.addEventListener('input', calculateMMSE);
            input.addEventListener('change', calculateMMSE);
        }
    });

    for (let i = 1; i <= 15; i++) {
        ['a', 'b', 'c', 'd'].forEach(letter => {
            const checkbox = document.querySelector(`input[name="b${i}${letter}"]`);
            if (checkbox) {
                checkbox.addEventListener('change', calculateBenton);
            }
        });
    }

    ['boston_spk', 'boston_fpk'].forEach((name) => {
        const el = document.querySelector(`input[name="${name}"]`);
        if (el) {
            el.addEventListener('input', calculateBostonCorrect);
            el.addEventListener('change', calculateBostonCorrect);
        }
    });

    const cdrFields = ['cdr_memory', 'cdr_orientation', 'cdr_judgment', 'cdr_community', 'cdr_home', 'cdr_care'];
    cdrFields.forEach(name => {
        const select = document.querySelector(`select[name="${name}"]`);
        if (select) {
            select.addEventListener('change', calculateCDR);
        }
    });

    const npiSymptoms = ['delusions', 'halluc', 'agitation', 'depression', 'anxiety', 'euphoria',
        'apathy', 'disinhibition', 'irritability', 'motor', 'sleep', 'appetite'];
    npiSymptoms.forEach(symptom => {
        const freqSelect = document.querySelector(`select[name="npi_${symptom}_freq"]`);
        const sevSelect = document.querySelector(`select[name="npi_${symptom}_sev"]`);
        if (freqSelect) freqSelect.addEventListener('change', () => calculateNPI(symptom));
        if (sevSelect) sevSelect.addEventListener('change', () => calculateNPI(symptom));
    });

    function calculateNPITotal() {
        const productInputs = document.querySelectorAll("input[id$='_prod']");
        let total = 0;
        productInputs.forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        const npiTotalInput = document.getElementById("npi_total");
        if (npiTotalInput) {
            npiTotalInput.value = total;
        }
    }
    window.calculateNPITotal = calculateNPITotal;

    function initializeNPIHandlers() {
        const freqInputs = document.querySelectorAll("select[name$='_freq']");
        const sevInputs = document.querySelectorAll("select[name$='_sev']");

        freqInputs.forEach(input => {
            input.addEventListener("change", () => {
                const symptom = input.name.split('_')[1];
                calculateNPI(symptom);
                calculateNPITotal();
            });
        });

        sevInputs.forEach(input => {
            input.addEventListener("change", () => {
                const symptom = input.name.split('_')[1];
                calculateNPI(symptom);
                calculateNPITotal();
            });
        });
    }

    initializeNPIHandlers();
    calculateNPITotal();

    Object.keys(HACHINSKI_SCORES).forEach(name => {
        const checkbox = document.querySelector(`input[name="${name}"]`);
        if (checkbox) {
            checkbox.addEventListener('change', calculateHachinski);
        }
    });
});
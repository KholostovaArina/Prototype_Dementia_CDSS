const API_URL = 'http://localhost:5000/api';

async function fetchTwoStreamsAnalytics() {
    try {
        const response = await fetch(`${API_URL}/analytics/two-streams`);
        const result = await response.json();
        if (!response.ok) return { success: false };
        return result;
    } catch {
        return { success: false };
    }
}

async function searchPatientsByFio(query) {
    try {
        const params = new URLSearchParams({ q: query });
        const response = await fetch(`${API_URL}/patient/search?${params.toString()}`);
        const result = await response.json();
        if (!response.ok) return { success: false, items: [] };
        return result;
    } catch {
        return { success: false, items: [] };
    }
}

async function fetchPatientContextFromDb({ patient_id, fio, n_amb_karta, age } = {}) {
    try {
        const params = new URLSearchParams();
        if (patient_id != null) params.set('patient_id', String(patient_id));
        if (fio) params.set('fio', fio);
        if (n_amb_karta) params.set('n_amb_karta', n_amb_karta);
        if (age != null && age !== '') params.set('age', String(age));
        const response = await fetch(`${API_URL}/patient/context?${params.toString()}`);
        const result = await response.json();
        if (!response.ok) {
            return { success: false, error: result.error || response.statusText };
        }
        return result;
    } catch (err) {
        console.error(err);
        return { success: false, error: 'Нет соединения с сервером' };
    }
}

async function saveVisitNotesToBackend(visitId, notes) {
    try {
        const response = await fetch(`${API_URL}/visit/${visitId}/notes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: notes ?? '' })
        });
        const result = await response.json();
        if (!response.ok) {
            return { success: false, error: result.error || response.statusText };
        }
        return result;
    } catch (err) {
        console.error(err);
        return { success: false, error: 'Нет соединения с сервером' };
    }
}

const DRAWING_FILE_CODES = ['clock_drawing', 'cube_copy', 'graphomotor_fence'];

function collectDrawingFiles() {
    const files = {};
    for (const code of DRAWING_FILE_CODES) {
        const input = document.querySelector(`input[data-drawing="${code}"]`);
        const file = input?.files?.[0];
        if (file) files[code] = file;
    }
    return files;
}

async function predictFromBackend(payload, drawingFiles) {
    try {
        const files = drawingFiles || {};
        const names = Object.keys(files);
        let response;
        if (names.length) {
            const body = new FormData();
            body.append('payload', JSON.stringify(payload));
            for (const code of names) {
                body.append(code, files[code]);
            }
            response = await fetch(`${API_URL}/predict`, { method: 'POST', body });
        } else {
            response = await fetch(`${API_URL}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        const result = await response.json();
        if (!response.ok) {
            const msg = result.error || response.status;
            if (typeof showPredictStatus === 'function') {
                showPredictStatus('❌ Прогноз: ' + msg, 'err');
            }
            alert('❌ Прогноз: ' + msg);
            return null;
        }
        return result;
    } catch (err) {
        console.error(err);
        const hint =
            '❌ Нет соединения с сервером. Запустите: cd backend → python app.py → откройте http://localhost:5000/';
        if (typeof showPredictStatus === 'function') {
            showPredictStatus(hint, 'err');
        }
        alert(hint);
        return null;
    }
}

async function saveDataToBackend(patientData, visitData, testResults, mriData = []) {
    try {
        const response = await fetch(`${API_URL}/save_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient: patientData,
                visit: visitData,
                test_results: testResults,
                mri: mriData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Данные сохранены в базу!');
            return result;
        } else {
            alert('❌ Ошибка: ' + result.error);
            return null;
        }
    } catch (error) {
        console.error('API Error:', error);
        alert('❌ Нет соединения с сервером');
        return null;
    }
}

const _calcScoreBtn = document.getElementById("calculateScore");
if (_calcScoreBtn && document.getElementById("totalScore")) {
    _calcScoreBtn.addEventListener("click", function (event) {
        event.preventDefault();
        const frequencies = document.querySelectorAll(".frequency");
        const severities = document.querySelectorAll(".severity");
        let totalScore = 0;
        frequencies.forEach((freqInput, index) => {
            const freq = parseFloat(freqInput.value) || 0;
            const severity = parseFloat(severities[index].value) || 0;
            totalScore += freq * severity;
        });
        document.getElementById("totalScore").textContent = totalScore;
    });
}
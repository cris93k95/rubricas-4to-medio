/**
 * Video Rubric — Mock Job Interview
 * Frontend logic for the video evaluation rubric.
 * Uses server API for persistence instead of localStorage.
 */

const { jsPDF } = window.jspdf;
const coursesContainer = document.getElementById('coursesContainer');
const TOOL = 'video';

let coursesData = {};
let saveTimer = null;

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function api(url, opts = {}) {
    const response = await fetch(url, {
        headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
        ...opts,
    });
    if (!response.ok) {
        let msg = `Error ${response.status}`;
        try { const j = await response.json(); if (j.error) msg = j.error; } catch {}
        if (response.status === 401) { window.location.href = '/login'; return; }
        throw new Error(msg);
    }
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) return response.json();
    return response;
}

function saveData() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await api(`/api/state/${TOOL}`, { method: 'PUT', body: JSON.stringify(coursesData) });
        } catch (err) {
            console.error('Error saving:', err);
        }
    }, 300);
}

async function loadData() {
    try {
        coursesData = await api(`/api/state/${TOOL}`);
        if (!coursesData || !coursesData.courses) coursesData = { courses: {} };
        // Flatten: if the state has a 'courses' key, use it; otherwise treat the whole thing as courses
        if (coursesData.courses) {
            // Already in correct format
        } else {
            coursesData = { courses: coursesData };
        }
        renderAllCourses();
    } catch (err) {
        console.error('Error loading:', err);
        coursesData = { courses: {} };
        renderAllCourses();
    }
}

// ─── Rubric Structure ────────────────────────────────────────────────────────

const rubricStructure = [
    { id: 'c1', name: 'Pronunciation & Intonation', descriptions: { 1: 'La pronunciación es muy deficiente, haciendo imposible entender el mensaje. No hay variación en la entonación.', 2: 'La pronunciación dificulta la comprensión. La entonación es monótona y poco natural para el contexto de entrevista.', 3: 'La pronunciación es mayormente clara y comprensible. La entonación es apropiada para una entrevista, aunque con errores ocasionales.', 4: 'La pronunciación es clara, precisa y natural. La entonación refleja profesionalismo y confianza, apropiada para el contexto laboral.' }},
    { id: 'c2', name: 'Fluency & Confidence', descriptions: { 1: 'El discurso es extremadamente lento, con pausas excesivas. No se percibe confianza ni naturalidad.', 2: 'El discurso es entrecortado, con pausas frecuentes y largas. Se nota inseguridad en las respuestas.', 3: 'Habla con fluidez razonable, con algunas pausas naturales. Se percibe preparación y confianza moderada.', 4: 'Habla con fluidez natural y seguridad. Demuestra confianza y profesionalismo consistente durante toda la entrevista.' }},
    { id: 'c3', name: 'Use of Technical Vocabulary', descriptions: { 1: 'No utiliza vocabulario técnico de su especialidad. Respuestas exclusivamente con vocabulario básico/general.', 2: 'Incluye 1-2 términos técnicos, pero con errores de uso o fuera de contexto. Vocabulario limitado.', 3: 'Utiliza vocabulario técnico de su especialidad de forma correcta y contextualizada (3-4 términos). Vocabulario adecuado.', 4: 'Demuestra dominio del vocabulario técnico de su especialidad (5+ términos). Lo integra naturalmente en respuestas coherentes y profesionales.' }},
    { id: 'c4', name: 'Content & Coherence of Responses', descriptions: { 1: 'Las respuestas son incoherentes, irrelevantes o limitadas a "sí/no". No responden lo que se pregunta.', 2: 'Las respuestas son breves y poco desarrolladas. Se intentan responder las preguntas pero falta profundidad y conexión.', 3: 'Las respuestas son coherentes, relevantes y están desarrolladas. Se conectan con la experiencia y metas profesionales del estudiante.', 4: 'Las respuestas son excelentes: coherentes, bien desarrolladas, persuasivas y demuestran reflexión sobre metas profesionales. Destacan por su calidad y autenticidad.' }},
    { id: 'c5', name: 'Interviewer Performance', descriptions: { 1: 'El entrevistador no cumple su rol: solo lee preguntas sin interacción, o las preguntas son incoherentes.', 2: 'El entrevistador lee las preguntas con poca naturalidad. No hay repreguntas ni interacción real. Se siente forzado.', 3: 'El entrevistador hace las preguntas con naturalidad y claridad. Incluye al menos 1 repregunta o comentario espontáneo. Buen manejo del rol.', 4: 'El entrevistador es excelente: formula preguntas claras, reacciona a las respuestas, hace repreguntas pertinentes y mantiene un tono profesional creíble durante toda la entrevista.' }},
    { id: 'c6', name: 'Video Production Quality', descriptions: { 1: 'Video inaudible o inentendible. Calidad de imagen/sonido inaceptable. Sin edición mínima.', 2: 'Calidad de video deficiente: problemas de audio, imagen o iluminación que dificultan la comprensión. Se percibe poco esfuerzo en la producción.', 3: 'Buena calidad de video: audio claro, imagen estable, iluminación adecuada. Se nota un esfuerzo de producción apropiado.', 4: 'Excelente calidad de producción: audio cristalino, imagen cuidada, buena iluminación, ambientación profesional. La producción eleva la calidad del trabajo significativamente.' }},
    { id: 'c7', name: 'Puntualidad en la Entrega', descriptions: { 1: 'Entregado con 3 o más clases de retraso.', 2: 'Entregado con 2 clases de retraso.', 3: 'Entregado con 1 clase de retraso.', 4: 'Entregado en la fecha y hora acordada.' }}
];

// ─── Toggle Instructions ─────────────────────────────────────────────────────

document.getElementById('toggleInstructions').addEventListener('click', () => {
    const content = document.getElementById('instructionsContent');
    const icon = document.getElementById('instructionsIcon');
    content.classList.toggle('hidden');
    icon.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(90deg)';
});

// ─── Render Functions ────────────────────────────────────────────────────────

function renderAllCourses() {
    coursesContainer.innerHTML = '';
    const courses = coursesData.courses || {};
    const sortedCourseNames = Object.keys(courses).sort();
    sortedCourseNames.forEach(courseName => {
        const courseHTML = createCourseCard(courseName, courses[courseName]);
        coursesContainer.insertAdjacentHTML('beforeend', courseHTML);
        renderAllPairsForCourse(courseName);
    });
}

function renderAllPairsForCourse(courseName) {
    const pairsContainer = document.getElementById(`pairs-container-${courseName}`);
    if (!pairsContainer) return;
    pairsContainer.innerHTML = '';
    const courseData = coursesData.courses[courseName];
    (courseData.pairs || []).forEach(pair => {
        const pairHTML = createPairCard(courseName, pair);
        pairsContainer.insertAdjacentHTML('beforeend', pairHTML);
        updatePairUI(courseName, pair.id);
    });
}

function createCourseCard(courseName, courseData) {
    return `
        <div id="course-${courseName}" class="course-card bg-white p-6 rounded-xl shadow-lg border-t-4 border-slate-700 fade-in">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <span class="text-sm font-semibold text-gray-500">CURSO</span>
                    <h2 class="text-3xl font-bold text-slate-800">${courseName}</h2>
                    <p class="text-xs text-slate-400 mt-1">${(courseData.pairs || []).length} pareja(s) registrada(s)</p>
                </div>
                <div class="flex items-center space-x-3">
                    <label class="bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm cursor-pointer no-print">
                        📄 Carga Excel<input type="file" accept=".xlsx,.xls,.csv" class="hidden excel-upload-input" data-course-name="${courseName}">
                    </label>
                    <button class="delete-course-btn text-red-500 hover:text-red-700 font-semibold no-print" data-course-name="${courseName}">Eliminar Curso</button>
                </div>
            </div>
            <div id="pairs-container-${courseName}" class="space-y-4"></div>
            <div class="mt-8 pt-6 border-t border-slate-200 no-print">
                <button class="add-pair-btn bg-slate-700 text-white font-bold py-2 px-6 rounded-lg hover:bg-slate-800 transition-colors shadow-sm" data-course-name="${courseName}">+ Agregar Pareja a ${courseName}</button>
            </div>
        </div>`;
}

function createPairCard(courseName, pair) {
    const isOpen = pair.isOpen === true;
    let availableStudents = [];
    const courseData = coursesData.courses[courseName];
    if (courseData.roster) {
        const assignedStudents = (courseData.pairs || []).flatMap(p => p.members);
        availableStudents = courseData.roster.filter(s => !assignedStudents.includes(s) || pair.members.includes(s));
    }
    const studentOptions = availableStudents.sort().map(s => `<option value="${s}">${s}</option>`).join('');
    const interviewer = pair.interviewer || pair.members[0] || null;
    const interviewee = pair.interviewee || pair.members[1] || null;

    const membersHTML = pair.members.map(name => {
        const isInterviewer = name === interviewer;
        const isInterviewee = name === interviewee;
        const roleBadge = isInterviewer ? '<span class="role-badge role-interviewer ml-2">Entrevistador</span>' : isInterviewee ? '<span class="role-badge role-interviewee ml-2">Entrevistado</span>' : '';
        return `<li class="flex items-center justify-between py-1">
            <div class="flex items-center"><span>${name}</span>${roleBadge}</div>
            <div class="flex items-center space-x-2">
                <button class="set-interviewer-btn text-blue-600 text-xs font-bold hover:underline" data-student-name="${name}" title="Definir como Entrevistador">🎤</button>
                <button class="set-interviewee-btn text-amber-600 text-xs font-bold hover:underline" data-student-name="${name}" title="Definir como Entrevistado">💼</button>
                <button class="remove-student-btn text-red-500 text-xs font-bold ml-2" data-student-name="${name}">X</button>
            </div></li>`;
    }).join('');

    let rubricHTML = '<thead class="bg-slate-50 text-slate-600 text-sm"><tr><th>Criterio</th><th>Insuficiente (1)</th><th>Suficiente (2)</th><th>Bueno (3)</th><th>Excelente (4)</th></tr></thead><tbody>';
    rubricStructure.forEach(c => {
        rubricHTML += `<tr data-criterion-id="${c.id}"><td class="font-medium text-slate-800">${c.name}</td><td class="score-cell score-1" data-score="1">${c.descriptions[1]}</td><td class="score-cell score-2" data-score="2">${c.descriptions[2]}</td><td class="score-cell score-3" data-score="3">${c.descriptions[3]}</td><td class="score-cell score-4" data-score="4">${c.descriptions[4]}</td></tr>`;
    });
    rubricHTML += '</tbody>';

    return `
        <div id="pair-${courseName}-${pair.id}" class="pair-card bg-slate-50 p-4 sm:p-6 rounded-lg shadow-md border-l-4 border-slate-700 ${isOpen ? 'is-open' : ''}">
            <div class="pair-header-trigger flex justify-between items-center cursor-pointer">
                <div class="flex items-center space-x-3">
                    <span class="header-icon text-slate-500 text-xl font-bold">▶</span>
                    <h3 class="text-2xl font-bold text-slate-800">Pareja ${pair.number}</h3>
                    ${pair.members.length === 2 ? `<span class="text-xs text-slate-400 hidden sm:block">${pair.members[0].split(' ').slice(0,2).join(' ')} & ${pair.members[1].split(' ').slice(0,2).join(' ')}</span>` : ''}
                </div>
                <button class="delete-pair-btn text-red-500 hover:text-red-700 font-semibold z-10 relative no-print" data-pair-id="${pair.id}" data-course-name="${courseName}">Eliminar Pareja</button>
            </div>
            <div class="collapsible-content pt-4">
                <div class="mb-4 bg-blue-50 p-3 rounded-lg text-sm text-blue-800"><strong>💡 Tip:</strong> Agrega 2 estudiantes, luego usa los botones 🎤 (entrevistador) y 💼 (entrevistado) para asignar roles.</div>
                <div class="mb-6"><h4 class="font-semibold text-slate-700 mb-2">Integrantes:</h4><ul class="list-none text-slate-600 members-list mb-2 space-y-1">${membersHTML}</ul>
                <div class="flex items-center space-x-2">
                    <select class="student-select flex-grow border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-500 text-sm"><option value="">Selecciona un estudiante...</option>${studentOptions}</select>
                    <button class="add-student-btn bg-slate-200 text-slate-800 font-semibold px-4 py-1.5 rounded-md hover:bg-slate-300 transition-colors text-sm">Agregar</button>
                    <input type="text" class="manual-student-input border border-slate-300 rounded-md px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-slate-500" placeholder="O escribe nombre...">
                    <button class="add-manual-student-btn bg-slate-700 text-white font-semibold px-4 py-1.5 rounded-md hover:bg-slate-800 transition-colors text-sm">+</button>
                </div></div>
                <div class="overflow-x-auto"><table class="rubric-table w-full border-collapse">${rubricHTML}</table></div>
                <div class="mb-6 mt-6"><h4 class="font-semibold text-slate-700 mb-2">Retroalimentación:</h4><textarea class="feedback-textarea w-full border border-slate-300 rounded-md p-2" rows="4" placeholder="Escribe aquí la retroalimentación para la pareja...">${pair.feedback || ''}</textarea></div>
                <div class="mt-6 p-4 bg-white rounded-lg flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 sm:space-x-8">
                    <button class="download-pdf-btn bg-emerald-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm no-print">Descargar Informe PDF</button>
                    <div class="flex space-x-8">
                        <div class="text-center"><p class="text-sm font-medium text-slate-500">PUNTAJE TOTAL</p><p class="total-score text-3xl font-bold text-slate-800">0 / ${rubricStructure.length * 4}</p></div>
                        <div class="text-center"><p class="text-sm font-medium text-slate-500">NOTA FINAL (60%)</p><p class="final-grade text-3xl font-bold text-blue-600">1.0</p></div>
                    </div>
                </div>
            </div>
        </div>`;
}

function updatePairUI(courseName, pairId) {
    const pairData = (coursesData.courses[courseName].pairs || []).find(p => p.id == pairId);
    if (!pairData) return;
    const pairCard = document.getElementById(`pair-${courseName}-${pairId}`);
    if (!pairCard) return;

    pairCard.querySelectorAll('tr[data-criterion-id]').forEach(row => {
        const criterionId = row.dataset.criterionId;
        const savedScore = pairData.scores[criterionId];
        row.querySelectorAll('.score-cell').forEach(cell => {
            cell.classList.remove('selected', 'unselected-sibling');
            if (savedScore) {
                if (parseInt(cell.dataset.score) === savedScore) cell.classList.add('selected');
                else cell.classList.add('unselected-sibling');
            }
        });
    });
    calculateResults(courseName, pairId);
}

// ─── Grade Calculation ───────────────────────────────────────────────────────

function calculateGrade(score, maxScore, exigency) {
    if (score === null || score === undefined) return 1.0;
    const passingScore = maxScore * exigency;
    let grade;
    if (score >= passingScore) {
        grade = 4.0 + 3.0 * ((score - passingScore) / (maxScore - passingScore));
    } else {
        if (passingScore === 0) return 7.0;
        grade = 1.0 + 3.0 * (score / passingScore);
    }
    return Math.max(1.0, Math.min(7.0, grade));
}

function calculateResults(courseName, pairId) {
    const pairData = (coursesData.courses[courseName].pairs || []).find(p => p.id == pairId);
    if (!pairData) return;
    const totalScore = Object.values(pairData.scores).reduce((sum, s) => sum + (s || 0), 0);
    const maxScore = rubricStructure.length * 4;
    const finalGrade = calculateGrade(totalScore, maxScore, 0.60);
    const pairCard = document.getElementById(`pair-${courseName}-${pairId}`);
    if (!pairCard) return;
    pairCard.querySelector('.total-score').textContent = `${totalScore} / ${maxScore}`;
    const gradeEl = pairCard.querySelector('.final-grade');
    gradeEl.textContent = finalGrade.toFixed(1);
    gradeEl.className = `final-grade text-3xl font-bold ${finalGrade >= 4.0 ? 'text-blue-600' : 'text-red-600'}`;
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

document.getElementById('addCourseBtn').addEventListener('click', () => {
    const courseName = prompt("Ingresa el nombre del nuevo curso (ej: 4A, 4B, 4C, 4E):");
    if (courseName && courseName.trim() !== "") {
        const safeCourseName = courseName.trim().toUpperCase();
        if (!coursesData.courses) coursesData.courses = {};
        if (coursesData.courses[safeCourseName]) { alert("Ya existe un curso con ese nombre."); return; }
        coursesData.courses[safeCourseName] = { pairs: [], pairCounter: 0, roster: [] };
        saveData();
        renderAllCourses();
    }
});

document.getElementById('exportBtn').addEventListener('click', () => {
    window.open('/api/export', '_blank');
});

document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('¿Importar datos? Se reemplazarán los actuales.')) { e.target.value = ''; return; }
    const fd = new FormData();
    fd.append('file', file);
    api('/api/import', { method: 'POST', body: fd }).then(() => {
        alert('Datos importados correctamente.');
        loadData();
    }).catch(err => alert('Error: ' + err.message));
    e.target.value = '';
});

coursesContainer.addEventListener('click', e => {
    const target = e.target;

    if (target.matches('.add-pair-btn')) {
        const courseName = target.dataset.courseName;
        const courseData = coursesData.courses[courseName];
        courseData.pairCounter = (courseData.pairCounter || 0) + 1;
        const newPair = { id: Date.now(), number: courseData.pairCounter, members: [], interviewer: null, interviewee: null, scores: {}, feedback: '', isOpen: true };
        if (!courseData.pairs) courseData.pairs = [];
        courseData.pairs.push(newPair);
        saveData();
        renderAllPairsForCourse(courseName);
        document.getElementById(`pair-${courseName}-${newPair.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (target.matches('.delete-course-btn')) {
        const courseName = target.dataset.courseName;
        if (confirm(`¿Eliminar el curso "${courseName}" y todas sus parejas?`)) {
            delete coursesData.courses[courseName];
            saveData();
            renderAllCourses();
        }
    }

    const headerTrigger = target.closest('.pair-header-trigger');
    if (headerTrigger) {
        if (target.matches('.delete-pair-btn')) { /* handled below */ } else {
            const pairCard = headerTrigger.closest('.pair-card');
            const [, courseName, pairId] = pairCard.id.split('-');
            const pairData = (coursesData.courses[courseName].pairs || []).find(p => p.id == pairId);
            if (pairData) { pairData.isOpen = !pairData.isOpen; saveData(); pairCard.classList.toggle('is-open'); }
        }
    }

    const pairCard = target.closest('.pair-card');
    if (!pairCard) return;
    const idParts = pairCard.id.split('-');
    const courseName = idParts[1];
    const pairId = idParts[2];
    const pairData = (coursesData.courses[courseName]?.pairs || []).find(p => p.id == pairId);
    if (!pairData) return;

    if (target.matches('.add-student-btn')) {
        const select = target.previousElementSibling;
        const studentName = select.value;
        if (studentName && !pairData.members.includes(studentName)) {
            if (pairData.members.length >= 2) { alert('Máximo 2 integrantes por pareja.'); return; }
            pairData.members.push(studentName);
            if (pairData.members.length === 1) pairData.interviewer = studentName;
            if (pairData.members.length === 2) pairData.interviewee = studentName;
            saveData(); renderAllPairsForCourse(courseName);
        }
    }

    if (target.matches('.add-manual-student-btn')) {
        const input = target.previousElementSibling;
        const studentName = input.value.trim().toUpperCase();
        if (studentName && !pairData.members.includes(studentName)) {
            if (pairData.members.length >= 2) { alert('Máximo 2 integrantes por pareja.'); return; }
            pairData.members.push(studentName);
            if (!coursesData.courses[courseName].roster) coursesData.courses[courseName].roster = [];
            if (!coursesData.courses[courseName].roster.includes(studentName)) coursesData.courses[courseName].roster.push(studentName);
            if (pairData.members.length === 1) pairData.interviewer = studentName;
            if (pairData.members.length === 2) pairData.interviewee = studentName;
            saveData(); renderAllPairsForCourse(courseName);
        }
    }

    if (target.matches('.remove-student-btn')) {
        pairData.members = pairData.members.filter(m => m !== target.dataset.studentName);
        if (pairData.interviewer === target.dataset.studentName) pairData.interviewer = pairData.members[0] || null;
        if (pairData.interviewee === target.dataset.studentName) pairData.interviewee = pairData.members[1] || pairData.members[0] || null;
        saveData(); renderAllPairsForCourse(courseName);
    }

    if (target.matches('.set-interviewer-btn')) {
        pairData.interviewer = target.dataset.studentName;
        const other = pairData.members.find(m => m !== target.dataset.studentName);
        if (other) pairData.interviewee = other;
        saveData(); renderAllPairsForCourse(courseName);
    }

    if (target.matches('.set-interviewee-btn')) {
        pairData.interviewee = target.dataset.studentName;
        const other = pairData.members.find(m => m !== target.dataset.studentName);
        if (other) pairData.interviewer = other;
        saveData(); renderAllPairsForCourse(courseName);
    }

    if (target.matches('.delete-pair-btn')) {
        if (confirm(`¿Eliminar la Pareja ${pairData.number}?`)) {
            coursesData.courses[courseName].pairs = coursesData.courses[courseName].pairs.filter(p => p.id != pairId);
            saveData(); renderAllPairsForCourse(courseName);
        }
    }

    if (target.matches('.score-cell')) {
        const criterionId = target.closest('tr').dataset.criterionId;
        pairData.scores[criterionId] = parseInt(target.dataset.score);
        updatePairUI(courseName, pairId);
        saveData();
    }

    if (target.matches('.download-pdf-btn')) {
        generatePDF(courseName, pairId);
    }
});

// Excel upload
coursesContainer.addEventListener('change', e => {
    if (e.target.matches('.excel-upload-input')) {
        const file = e.target.files[0]; if (!file) return;
        const courseName = e.target.dataset.courseName;
        const fd = new FormData();
        fd.append('file', file);
        api(`/api/video/upload-excel/${encodeURIComponent(courseName)}`, { method: 'POST', body: fd })
            .then(res => {
                alert(`Se cargaron ${res.added} estudiantes al roster de ${courseName}.`);
                loadData();
            })
            .catch(err => alert('Error: ' + err.message));
        e.target.value = '';
    }
});

// Feedback
coursesContainer.addEventListener('input', e => {
    if (e.target.matches('.feedback-textarea')) {
        const pairCard = e.target.closest('.pair-card');
        const [, courseName, pairId] = pairCard.id.split('-');
        const pairData = (coursesData.courses[courseName]?.pairs || []).find(p => p.id == pairId);
        if (pairData) { pairData.feedback = e.target.value; saveData(); }
    }
});

// ─── PDF Generation ──────────────────────────────────────────────────────────

async function generatePDF(courseName, pairId) {
    const doc = new jsPDF();
    const pairData = (coursesData.courses[courseName].pairs || []).find(p => p.id == pairId);
    const pairCard = document.getElementById(`pair-${courseName}-${pairId}`);

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Mock Job Interview — Video", 105, 14, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("4° Medio — Unidad 1: Professional Profile & Workplace English", 105, 22, { align: "center" });
    doc.text("Nota 1 Semestre 1 — Exigencia 60%", 105, 29, { align: "center" });

    doc.setTextColor(30, 41, 59);
    let yPos = 45;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Curso:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(courseName, 50, yPos);
    yPos += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Pareja:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(String(pairData.number), 50, yPos);
    yPos += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Integrantes:", 20, yPos);
    yPos += 7;
    pairData.members.forEach(member => {
        const role = member === pairData.interviewer ? " (Entrevistador)" : member === pairData.interviewee ? " (Entrevistado)" : "";
        doc.setFont("helvetica", "normal");
        doc.text(`• ${member}${role}`, 25, yPos);
        yPos += 7;
    });
    yPos += 5;

    const totalScore = Object.values(pairData.scores).reduce((sum, s) => sum + (s || 0), 0);
    const maxScore = rubricStructure.length * 4;
    const finalGrade = calculateGrade(totalScore, maxScore, 0.60);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Puntaje: ${totalScore} / ${maxScore}`, 20, yPos);
    doc.text(`Nota Final: ${finalGrade.toFixed(1)}`, 120, yPos);
    yPos += 15;

    const chartCanvas = document.createElement('canvas');
    chartCanvas.width = 400; chartCanvas.height = 400;
    const data = rubricStructure.map(c => pairData.scores[c.id] || 0);
    new Chart(chartCanvas, {
        type: 'radar',
        data: { labels: rubricStructure.map(c => c.name), datasets: [{ label: 'Puntaje', data, fill: true, backgroundColor: 'rgba(30,41,59,0.15)', borderColor: 'rgb(30,41,59)', pointBackgroundColor: 'rgb(30,41,59)' }] },
        options: { scales: { r: { suggestedMin: 0, suggestedMax: 4, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
    });
    await new Promise(r => setTimeout(r, 500));
    doc.addImage(chartCanvas.toDataURL('image/png'), 'PNG', 25, yPos, 160, 80);
    yPos += 90;

    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Retroalimentación", 20, yPos);
    yPos += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(doc.splitTextToSize(pairData.feedback || "No se ha ingresado retroalimentación.", 170), 20, yPos);

    doc.addPage();
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Detalle de Calificación — Rúbrica", 105, 14, { align: "center" });
    const canvas = await html2canvas(pairCard.querySelector('.rubric-table'), { scale: 2 });
    const imgW = 170, imgH = (canvas.height * imgW) / canvas.width;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 30, imgW, imgH);
    doc.save(`MockInterview_Video_${courseName}_Pareja_${pairData.number}.pdf`);
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadData);

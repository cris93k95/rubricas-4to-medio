/**
 * CV Rubric — Curriculum Vitae en Inglés
 * Frontend logic for the CV evaluation rubric.
 * Uses server API for persistence instead of localStorage.
 */

const { jsPDF } = window.jspdf;
const coursesContainer = document.getElementById('coursesContainer');
const TOOL = 'cv';

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
        renderAllCourses();
    } catch (err) {
        console.error('Error loading:', err);
        coursesData = { courses: {} };
        renderAllCourses();
    }
}

// ─── Rubric Structure ────────────────────────────────────────────────────────

const rubricStructure = [
    { id: 'c1', name: 'Sections & Structure', descriptions: { 1: 'El CV no tiene secciones identificables o le faltan 4+ secciones esenciales. No sigue ningún formato reconocible.', 2: 'El CV incluye 3-4 secciones, pero faltan varias esenciales (ej: Objective, Skills). El orden es confuso.', 3: 'El CV incluye las secciones principales (Personal Info, Objective, Education, Skills, Languages). Buen orden y estructura general.', 4: 'El CV incluye todas las secciones requeridas en orden lógico y profesional: Personal Info, Objective, Education, Work Experience/Internship, Skills, Languages, References.' }},
    { id: 'c2', name: 'Grammar & Spelling', descriptions: { 1: 'Errores gramaticales y de ortografía constantes que impiden la comprensión. Mezcla excesiva de español e inglés.', 2: 'Múltiples errores gramaticales y de ortografía (5+). Se nota falta de revisión. Algunas frases en español.', 3: 'Pocos errores gramaticales o de ortografía (2-4). El texto es casi enteramente en inglés y se entiende bien.', 4: 'El CV está escrito en inglés correcto, sin errores de gramática ni ortografía. Uso apropiado de tiempos verbales (past tense para experiencia, present para habilidades).' }},
    { id: 'c3', name: 'Technical Vocabulary & Action Verbs', descriptions: { 1: 'No incluye vocabulario técnico de su especialidad. Sin verbos de acción. Vocabulario genérico o en español.', 2: 'Incluye 1-2 términos técnicos. Usa pocos o ningún verbo de acción. Vocabulario limitado y genérico.', 3: 'Incluye 3-4 términos técnicos de su especialidad y al menos 3 verbos de acción (operated, installed, maintained, etc.). Buen vocabulario.', 4: 'Incluye 5+ términos técnicos relevantes y variados. Usa verbos de acción de forma efectiva y variada (operated, maintained, installed, designed, diagnosed, repaired, programmed, etc.).' }},
    { id: 'c4', name: 'Relevance & Coherence of Content', descriptions: { 1: 'El contenido no es relevante para un puesto de trabajo en su especialidad. Información genérica o inventada sin sentido.', 2: 'El contenido es parcialmente relevante. El Objective no es claro o no se relaciona con su especialidad. Información incompleta.', 3: 'El contenido es coherente y relevante al puesto de su especialidad. El Objective es claro. Skills y Education corresponden al perfil TP.', 4: 'El contenido es excelente: Objective claro y persuasivo, Skills relevantes y específicas, Education detallada, información muy coherente con el puesto de trabajo de su especialidad TP.' }},
    { id: 'c5', name: 'Professional Presentation & Format', descriptions: { 1: 'Presentación descuidada: sin formato, desordenado, ilegible o en un formato inapropiado (ej: cuaderno roto).', 2: 'Presentación básica. El formato es inconsistente (diferentes fuentes, tamaños, alineaciones). Se ve poco profesional.', 3: 'Buena presentación: formato limpio, consistente y ordenado. Se percibe esfuerzo en la presentación. Legible y profesional.', 4: 'Presentación impecable: formato profesional, consistente, bien organizado. Uso de bullet points, alineación correcta, tipografía consistente. Podría ser un CV real.' }},
    { id: 'c6', name: 'Puntualidad en la Entrega', descriptions: { 1: 'Entregado con 3 o más clases de retraso.', 2: 'Entregado con 2 clases de retraso.', 3: 'Entregado con 1 clase de retraso.', 4: 'Entregado en la fecha y hora acordada.' }}
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
        renderAllStudentsForCourse(courseName);
    });
}

function renderAllStudentsForCourse(courseName) {
    const studentsContainer = document.getElementById(`students-container-${courseName}`);
    if (!studentsContainer) return;
    studentsContainer.innerHTML = '';
    const courseData = coursesData.courses[courseName];
    (courseData.students || []).forEach(student => {
        const studentHTML = createStudentCard(courseName, student);
        studentsContainer.insertAdjacentHTML('beforeend', studentHTML);
        updateStudentUI(courseName, student.id);
    });
}

function createCourseCard(courseName, courseData) {
    return `
        <div id="course-${courseName}" class="course-card bg-white p-6 rounded-xl shadow-lg border-t-4 border-teal-600 fade-in">
            <div class="flex justify-between items-center mb-6">
                <div>
                    <span class="text-sm font-semibold text-gray-500">CURSO</span>
                    <h2 class="text-3xl font-bold text-slate-800">${courseName}</h2>
                    <p class="text-xs text-slate-400 mt-1">${(courseData.students || []).length} estudiante(s)</p>
                </div>
                <div class="flex items-center space-x-3">
                    <label class="bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm cursor-pointer no-print">
                        📄 Carga Excel<input type="file" accept=".xlsx,.xls,.csv" class="hidden excel-upload-input" data-course-name="${courseName}">
                    </label>
                    <button class="delete-course-btn text-red-500 hover:text-red-700 font-semibold no-print" data-course-name="${courseName}">Eliminar Curso</button>
                </div>
            </div>
            <div class="mb-6 p-4 bg-teal-50 rounded-lg no-print">
                <h4 class="font-semibold text-teal-700 mb-2">Agregar Estudiante:</h4>
                <div class="flex items-center space-x-2">
                    <input type="text" class="add-student-name-input flex-grow border border-teal-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Nombre completo del estudiante..." data-course-name="${courseName}">
                    <button class="add-student-btn bg-teal-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-teal-700 transition-colors text-sm" data-course-name="${courseName}">+ Agregar</button>
                </div>
            </div>
            <div id="students-container-${courseName}" class="space-y-4"></div>
            <div class="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div class="flex flex-wrap gap-6 items-center justify-between">
                    <div class="text-sm text-slate-600"><span class="font-semibold">Total evaluados:</span> <span class="course-evaluated-count font-bold text-slate-800">0</span></div>
                    <div class="text-sm text-slate-600"><span class="font-semibold">Promedio curso:</span> <span class="course-avg-grade font-bold text-teal-700">-</span></div>
                    <div class="text-sm text-slate-600"><span class="font-semibold">Aprobación:</span> <span class="course-pass-rate font-bold text-emerald-700">-</span></div>
                </div>
            </div>
        </div>`;
}

function createStudentCard(courseName, student) {
    const isOpen = student.isOpen === true;
    const hasScores = Object.keys(student.scores || {}).length > 0;
    const statusBadge = hasScores ?
        '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ Evaluado</span>' :
        '<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Pendiente</span>';

    let rubricHTML = '<thead class="bg-teal-50 text-teal-700 text-sm"><tr><th>Criterio</th><th>Insuficiente (1)</th><th>Suficiente (2)</th><th>Bueno (3)</th><th>Excelente (4)</th></tr></thead><tbody>';
    rubricStructure.forEach(c => {
        rubricHTML += `<tr data-criterion-id="${c.id}"><td class="font-medium text-slate-800">${c.name}</td><td class="score-cell score-1" data-score="1">${c.descriptions[1]}</td><td class="score-cell score-2" data-score="2">${c.descriptions[2]}</td><td class="score-cell score-3" data-score="3">${c.descriptions[3]}</td><td class="score-cell score-4" data-score="4">${c.descriptions[4]}</td></tr>`;
    });
    rubricHTML += '</tbody>';

    return `
        <div id="student-${courseName}-${student.id}" class="student-card bg-slate-50 p-4 sm:p-6 rounded-lg shadow-md border-l-4 border-teal-500 ${isOpen ? 'is-open' : ''}">
            <div class="student-header-trigger flex justify-between items-center cursor-pointer">
                <div class="flex items-center space-x-3">
                    <span class="header-icon text-slate-500 text-xl font-bold">▶</span>
                    <h3 class="text-lg sm:text-xl font-bold text-slate-800">${student.name}</h3>
                    ${statusBadge}
                </div>
                <button class="delete-student-btn text-red-500 hover:text-red-700 font-semibold z-10 relative no-print" data-student-id="${student.id}" data-course-name="${courseName}">Eliminar</button>
            </div>
            <div class="collapsible-content pt-4">
                <div class="overflow-x-auto"><table class="rubric-table w-full border-collapse">${rubricHTML}</table></div>
                <div class="mb-6 mt-6"><h4 class="font-semibold text-slate-700 mb-2">Retroalimentación:</h4><textarea class="feedback-textarea w-full border border-slate-300 rounded-md p-2" rows="3" placeholder="Escribe aquí la retroalimentación...">${student.feedback || ''}</textarea></div>
                <div class="mt-6 p-4 bg-white rounded-lg flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 sm:space-x-8">
                    <button class="download-pdf-btn bg-emerald-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm no-print">Descargar Informe PDF</button>
                    <div class="flex space-x-8">
                        <div class="text-center"><p class="text-sm font-medium text-slate-500">PUNTAJE TOTAL</p><p class="total-score text-3xl font-bold text-slate-800">0 / ${rubricStructure.length * 4}</p></div>
                        <div class="text-center"><p class="text-sm font-medium text-slate-500">NOTA FINAL (60%)</p><p class="final-grade text-3xl font-bold text-teal-600">1.0</p></div>
                    </div>
                </div>
            </div>
        </div>`;
}

function updateStudentUI(courseName, studentId) {
    const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
    if (!studentData) return;
    const studentCard = document.getElementById(`student-${courseName}-${studentId}`);
    if (!studentCard) return;

    studentCard.querySelectorAll('tr[data-criterion-id]').forEach(row => {
        const criterionId = row.dataset.criterionId;
        const savedScore = (studentData.scores || {})[criterionId];
        row.querySelectorAll('.score-cell').forEach(cell => {
            cell.classList.remove('selected', 'unselected-sibling');
            if (savedScore) {
                if (parseInt(cell.dataset.score) === savedScore) cell.classList.add('selected');
                else cell.classList.add('unselected-sibling');
            }
        });
    });
    calculateResults(courseName, studentId);
    updateCourseSummary(courseName);
}

function updateCourseSummary(courseName) {
    const courseData = coursesData.courses[courseName];
    const courseCard = document.getElementById(`course-${courseName}`);
    if (!courseCard || !courseData) return;

    let totalGrades = 0, gradeSum = 0, passCount = 0;
    (courseData.students || []).forEach(student => {
        if (Object.keys(student.scores || {}).length > 0) {
            const totalScore = Object.values(student.scores).reduce((sum, s) => sum + (s || 0), 0);
            const grade = calculateGrade(totalScore, rubricStructure.length * 4, 0.60);
            totalGrades++;
            gradeSum += grade;
            if (grade >= 4.0) passCount++;
        }
    });

    courseCard.querySelector('.course-evaluated-count').textContent = totalGrades;
    courseCard.querySelector('.course-avg-grade').textContent = totalGrades > 0 ? (gradeSum / totalGrades).toFixed(1) : '-';
    courseCard.querySelector('.course-pass-rate').textContent = totalGrades > 0 ? `${Math.round(passCount / totalGrades * 100)}% (${passCount}/${totalGrades})` : '-';
}

// ─── Grade Calculation ───────────────────────────────────────────────────────

function calculateGrade(score, maxScore, exigency) {
    if (score === null || score === undefined) return 1.0;
    const passingScore = maxScore * exigency;
    let grade;
    if (score >= passingScore) grade = 4.0 + 3.0 * ((score - passingScore) / (maxScore - passingScore));
    else { if (passingScore === 0) return 7.0; grade = 1.0 + 3.0 * (score / passingScore); }
    return Math.max(1.0, Math.min(7.0, grade));
}

function calculateResults(courseName, studentId) {
    const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
    if (!studentData) return;
    const totalScore = Object.values(studentData.scores || {}).reduce((sum, s) => sum + (s || 0), 0);
    const maxScore = rubricStructure.length * 4;
    const finalGrade = calculateGrade(totalScore, maxScore, 0.60);
    const studentCard = document.getElementById(`student-${courseName}-${studentId}`);
    if (!studentCard) return;
    studentCard.querySelector('.total-score').textContent = `${totalScore} / ${maxScore}`;
    const gradeEl = studentCard.querySelector('.final-grade');
    gradeEl.textContent = finalGrade.toFixed(1);
    gradeEl.className = `final-grade text-3xl font-bold ${finalGrade >= 4.0 ? 'text-teal-600' : 'text-red-600'}`;
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

document.getElementById('addCourseBtn').addEventListener('click', () => {
    const courseName = prompt("Ingresa el nombre del nuevo curso (ej: 4A, 4B, 4C, 4E):");
    if (courseName && courseName.trim() !== "") {
        const safeCourseName = courseName.trim().toUpperCase();
        if (!coursesData.courses) coursesData.courses = {};
        if (coursesData.courses[safeCourseName]) { alert("Ya existe ese curso."); return; }
        coursesData.courses[safeCourseName] = { students: [], studentCounter: 0 };
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

    if (target.matches('.add-student-btn')) {
        const courseName = target.dataset.courseName;
        const input = target.previousElementSibling;
        const studentName = input.value.trim().toUpperCase();
        if (!studentName) { alert('Ingresa un nombre.'); return; }
        const courseData = coursesData.courses[courseName];
        if ((courseData.students || []).find(s => s.name === studentName)) { alert('Estudiante ya existe.'); return; }
        courseData.studentCounter = (courseData.studentCounter || 0) + 1;
        if (!courseData.students) courseData.students = [];
        const newStudent = { id: Date.now(), name: studentName, scores: {}, feedback: '', isOpen: true };
        courseData.students.push(newStudent);
        courseData.students.sort((a, b) => a.name.localeCompare(b.name));
        input.value = '';
        saveData();
        renderAllStudentsForCourse(courseName);
        updateCourseSummary(courseName);
        document.getElementById(`student-${courseName}-${newStudent.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (target.matches('.delete-course-btn')) {
        const courseName = target.dataset.courseName;
        if (confirm(`¿Eliminar "${courseName}" y todos sus estudiantes?`)) {
            delete coursesData.courses[courseName];
            saveData();
            renderAllCourses();
        }
    }

    const headerTrigger = target.closest('.student-header-trigger');
    if (headerTrigger) {
        if (target.matches('.delete-student-btn')) { /* handled below */ } else {
            const studentCard = headerTrigger.closest('.student-card');
            const idParts = studentCard.id.split('-');
            const courseName = idParts[1];
            const studentId = idParts[2];
            const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
            if (studentData) { studentData.isOpen = !studentData.isOpen; saveData(); studentCard.classList.toggle('is-open'); }
        }
    }

    const studentCard = target.closest('.student-card');
    if (!studentCard) return;
    const idParts = studentCard.id.split('-');
    const courseName = idParts[1];
    const studentId = idParts[2];
    const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
    if (!studentData) return;

    if (target.matches('.delete-student-btn')) {
        if (confirm(`¿Eliminar a ${studentData.name}?`)) {
            coursesData.courses[courseName].students = coursesData.courses[courseName].students.filter(s => s.id != studentId);
            saveData();
            renderAllStudentsForCourse(courseName);
            updateCourseSummary(courseName);
        }
    }

    if (target.matches('.score-cell')) {
        const criterionId = target.closest('tr').dataset.criterionId;
        if (!studentData.scores) studentData.scores = {};
        studentData.scores[criterionId] = parseInt(target.dataset.score);
        updateStudentUI(courseName, studentId);
        saveData();
    }

    if (target.matches('.download-pdf-btn')) {
        generatePDF(courseName, studentId);
    }
});

// Enter key on student input
coursesContainer.addEventListener('keydown', e => {
    if (e.target.matches('.add-student-name-input') && e.key === 'Enter') {
        e.target.nextElementSibling.click();
    }
});

// Excel upload
coursesContainer.addEventListener('change', e => {
    if (e.target.matches('.excel-upload-input')) {
        const file = e.target.files[0]; if (!file) return;
        const courseName = e.target.dataset.courseName;
        const fd = new FormData();
        fd.append('file', file);
        api(`/api/cv/upload-excel/${encodeURIComponent(courseName)}`, { method: 'POST', body: fd })
            .then(res => {
                alert(`Se cargaron ${res.added} estudiantes a ${courseName}.`);
                loadData();
            })
            .catch(err => alert('Error: ' + err.message));
        e.target.value = '';
    }
});

// Feedback
coursesContainer.addEventListener('input', e => {
    if (e.target.matches('.feedback-textarea')) {
        const studentCard = e.target.closest('.student-card');
        const [, courseName, studentId] = studentCard.id.split('-');
        const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
        if (studentData) { studentData.feedback = e.target.value; saveData(); }
    }
});

// ─── PDF Generation ──────────────────────────────────────────────────────────

async function generatePDF(courseName, studentId) {
    const doc = new jsPDF();
    const studentData = (coursesData.courses[courseName]?.students || []).find(s => s.id == studentId);
    const studentCard = document.getElementById(`student-${courseName}-${studentId}`);

    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text("Curriculum Vitae en Inglés — Evaluación", 105, 14, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text("4° Medio — Unidad 1: Professional Profile & Workplace English", 105, 22, { align: "center" });
    doc.text("Evaluación Individual — Exigencia 60%", 105, 29, { align: "center" });

    doc.setTextColor(30, 41, 59);
    let yPos = 45;
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("Curso:", 20, yPos); doc.setFont("helvetica", "normal"); doc.text(courseName, 50, yPos);
    yPos += 7;
    doc.setFont("helvetica", "bold"); doc.text("Estudiante:", 20, yPos); doc.setFont("helvetica", "normal"); doc.text(studentData.name, 50, yPos);
    yPos += 15;

    const totalScore = Object.values(studentData.scores || {}).reduce((sum, s) => sum + (s || 0), 0);
    const maxScore = rubricStructure.length * 4;
    const finalGrade = calculateGrade(totalScore, maxScore, 0.60);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`Puntaje: ${totalScore} / ${maxScore}`, 20, yPos);
    doc.text(`Nota Final: ${finalGrade.toFixed(1)}`, 120, yPos);
    yPos += 15;

    const chartCanvas = document.createElement('canvas');
    chartCanvas.width = 400; chartCanvas.height = 400;
    const data = rubricStructure.map(c => (studentData.scores || {})[c.id] || 0);
    new Chart(chartCanvas, {
        type: 'radar',
        data: { labels: rubricStructure.map(c => c.name), datasets: [{ label: 'Puntaje', data, fill: true, backgroundColor: 'rgba(15,118,110,0.15)', borderColor: 'rgb(15,118,110)', pointBackgroundColor: 'rgb(15,118,110)' }] },
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
    doc.text(doc.splitTextToSize(studentData.feedback || "No se ha ingresado retroalimentación.", 170), 20, yPos);

    doc.addPage();
    doc.setFillColor(15, 118, 110); doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Detalle de Calificación — Rúbrica", 105, 14, { align: "center" });
    const canvas = await html2canvas(studentCard.querySelector('.rubric-table'), { scale: 2 });
    const imgW = 170, imgH = (canvas.height * imgW) / canvas.width;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 30, imgW, imgH);
    doc.save(`CV_Evaluation_${courseName}_${studentData.name.replace(/\s+/g, '_').slice(0, 30)}.pdf`);
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadData);

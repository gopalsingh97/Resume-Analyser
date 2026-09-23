const $ = id => document.getElementById(id);

const uploadBox = $('uploadBox');
const fileInput = $('fileInput');
const fileSelected = $('fileSelected');
const fileName = $('fileName');
const fileSize = $('fileSize');
const fileRemove = $('fileRemove');
const analyzeBtn = $('analyzeBtn');
const uploadView = $('uploadView');
const loadingView = $('loadingView');
const resultsView = $('resultsView');
const backBtn = $('backBtn');

let currentFile = null;
let charts = {};

const loadMsgs = [
    'Extracting text from document...',
    'Analyzing your skills...',
    'Identifying job role matches...',
    'Generating AI suggestions...',
    'Calculating ATS score...',
    'Finalizing results...'
];

uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('dragover', e => { e.preventDefault(); uploadBox.classList.add('active'); });
uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('active'));
uploadBox.addEventListener('drop', e => {
    e.preventDefault();
    uploadBox.classList.remove('active');
    if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) selectFile(e.target.files[0]); });
fileRemove.addEventListener('click', e => { e.stopPropagation(); clearFile(); });
analyzeBtn.addEventListener('click', runAnalysis);
backBtn.addEventListener('click', resetView);

function selectFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'doc'].includes(ext)) {
        toast('Please upload a PDF or DOCX file', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        toast('File must be less than 10MB', 'error');
        return;
    }
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    uploadBox.style.display = 'none';
    fileSelected.classList.add('show');
    analyzeBtn.disabled = false;
}

function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

function clearFile() {
    currentFile = null;
    fileInput.value = '';
    fileSelected.classList.remove('show');
    uploadBox.style.display = 'block';
    analyzeBtn.disabled = true;
}

function resetView() {
    clearFile();
    resultsView.classList.remove('show');
    uploadView.style.display = 'flex';
    Object.values(charts).forEach(c => c?.destroy?.());
    charts = {};
}

async function runAnalysis() {
    if (!currentFile) return;

    uploadView.style.display = 'none';
    loadingView.classList.add('show');
    analyzeBtn.classList.add('loading');

    let msgIdx = 0;
    const msgTimer = setInterval(() => {
        $('loadingMsg').textContent = loadMsgs[msgIdx % loadMsgs.length];
        msgIdx++;
    }, 600);

    const form = new FormData();
    form.append('resume', currentFile);

    try {
        const res = await fetch('/api/analyze', { method: 'POST', body: form });
        const data = await res.json();

        clearInterval(msgTimer);
        loadingView.classList.remove('show');
        analyzeBtn.classList.remove('loading');

        if (data.success) {
            renderResults(data);
            toast('Analysis completed!', 'success');
        } else {
            toast(data.error || 'Analysis failed', 'error');
            resetView();
        }
    } catch (err) {
        clearInterval(msgTimer);
        loadingView.classList.remove('show');
        analyzeBtn.classList.remove('loading');
        toast('Connection error. Please try again.', 'error');
        resetView();
    }
}

function renderResults(data) {
    resultsView.classList.add('show');
    const { analysis, job_roles, insights } = data;

    animateScore(analysis.score);
    $('qualityTag').textContent = analysis.quality;
    $('qualityTag').className = 'quality-tag';
    $('qualityMsg').textContent = analysis.quality_desc;

    if (job_roles.length > 0) {
        $('topMatches').innerHTML = job_roles.slice(0, 3).map(r =>
            `<span class="match-tag">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                ${r.role}
            </span>`
        ).join('');
    } else {
        $('topMatches').innerHTML = '<span style="color:var(--text-3)">No strong matches found</span>';
    }

    $('statSkills').textContent = analysis.total_skills;
    $('statRoles').textContent = job_roles.length;
    $('statSections').textContent = analysis.sections_found;
    $('statWords').textContent = analysis.word_count;

    renderTips(analysis.suggestions);
    renderSkills(analysis.skills);
    renderRoles(job_roles);
    renderCharts(analysis, job_roles, insights);
    renderSalary(job_roles);

    resultsView.scrollIntoView({ behavior: 'smooth' });
}

function animateScore(target) {
    const ring = $('ringFill');
    const num = $('scoreNum');
    const circ = 2 * Math.PI * 80;
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ;

    let val = 0;
    const step = target / 70;
    const timer = setInterval(() => {
        val = Math.min(val + step, target);
        num.textContent = Math.round(val);
        ring.style.strokeDashoffset = circ - (val / 100) * circ;
        if (val >= target) clearInterval(timer);
    }, 15);
}

function renderTips(tips) {
    const card = $('tipsCard');
    const grid = $('tipsGrid');
    if (!tips || tips.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    grid.innerHTML = tips.map(t => `<div class="tip-item">${t}</div>`).join('');
}

function renderSkills(skills) {
    const wrap = $('skillsWrap');
    const total = Object.values(skills).flat().length;
    $('skillsTag').textContent = `${total} skills`;

    if (!skills || Object.keys(skills).length === 0) {
        wrap.innerHTML = `<div class="empty-msg">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            <p>No skills detected. Add technical keywords to your resume.</p>
        </div>`;
        return;
    }

    wrap.innerHTML = Object.entries(skills).map(([cat, list]) => `
        <div class="skill-group">
            <div class="skill-group-head">
                <span class="skill-group-name">${cat.replace(/_/g, ' ')}</span>
                <span class="skill-group-num">${list.length}</span>
            </div>
            <div class="skill-tags">${list.map(s => `<span class="skill-pill">${s}</span>`).join('')}</div>
        </div>
    `).join('');
}

function renderRoles(roles) {
    const wrap = $('rolesWrap');
    $('rolesTag').textContent = `${roles.length} matches`;

    if (!roles || roles.length === 0) {
        wrap.innerHTML = `<div class="empty-msg">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            <p>No matching roles found. Add more relevant skills.</p>
        </div>`;
        return;
    }

    wrap.innerHTML = roles.slice(0, 10).map((r, i) => `
        <div class="role-item">
            <div class="role-rank">${i + 1}</div>
            <div class="role-content">
                <div class="role-title">${r.role}</div>
                <div class="role-meta">
                    <span class="role-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        ${r.category}
                    </span>
                    <span class="role-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        ${r.level}
                    </span>
                </div>
                <div class="role-skills-row">
                    ${(r.matched_skills || []).slice(0, 4).map(s => `<span class="role-skill-tag match">✓ ${s}</span>`).join('')}
                    ${(r.skills_to_learn || []).slice(0, 2).map(s => `<span class="role-skill-tag learn">+ ${s}</span>`).join('')}
                </div>
            </div>
            <div class="role-score">
                <span class="role-score-num">${r.match_score}%</span>
                <span class="role-score-label">match</span>
                <span class="role-salary">₹${r.salary_min}-${r.salary_max} LPA</span>
            </div>
        </div>
    `).join('');
}

function renderCharts(analysis, roles, insights) {
    Object.values(charts).forEach(c => c?.destroy?.());
    charts = {};

    Chart.defaults.color = '#606075';
    Chart.defaults.font.family = 'Outfit';
    Chart.defaults.font.size = 11;

    const skillData = Object.entries(analysis.skills || {}).map(([k, v]) => ({ name: k.replace(/_/g, ' '), count: v.length }));
    if (skillData.length > 0) {
        charts.skills = new Chart($('chartSkills'), {
            type: 'doughnut',
            data: {
                labels: skillData.map(d => d.name),
                datasets: [{ data: skillData.map(d => d.count), backgroundColor: ['#6366f1', '#8b5cf6', '#a855f7', '#06b6d4', '#34d399', '#f59e0b', '#f43f5e'], borderWidth: 0, hoverOffset: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, pointStyle: 'circle' } } } }
        });
    }

    if (roles.length > 0) {
        const topRoles = roles.slice(0, 6);
        charts.roles = new Chart($('chartRoles'), {
            type: 'bar',
            data: {
                labels: topRoles.map(r => r.role.length > 18 ? r.role.slice(0, 18) + '...' : r.role),
                datasets: [{ data: topRoles.map(r => r.match_score), backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0, 0, ctx.chart.width, 0); g.addColorStop(0, '#6366f1'); g.addColorStop(1, '#a855f7'); return g; }, borderRadius: 8, barThickness: 18 }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }
        });
    }

    if (insights?.by_category) {
        const cats = Object.entries(insights.by_category).slice(0, 6);
        charts.cats = new Chart($('chartCategories'), {
            type: 'pie',
            data: {
                labels: cats.map(([k]) => k),
                datasets: [{ data: cats.map(([, v]) => v), backgroundColor: ['#6366f1', '#34d399', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyle: 'circle' } } } }
        });
    }

    if (insights?.top_skills) {
        const top = Object.entries(insights.top_skills).slice(0, 10);
        charts.demand = new Chart($('chartDemand'), {
            type: 'bar',
            data: {
                labels: top.map(([s]) => s),
                datasets: [{ data: top.map(([, c]) => c), backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0, ctx.chart.height, 0, 0); g.addColorStop(0, '#34d399'); g.addColorStop(1, '#06b6d4'); return g; }, borderRadius: 6, barThickness: 16 }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }, x: { grid: { display: false }, ticks: { maxRotation: 45 } } }, plugins: { legend: { display: false } } }
        });
    }
}

function renderSalary(roles) {
    const row = $('salaryRow');
    if (!roles || roles.length === 0) {
        row.innerHTML = '<p style="color:var(--text-3);text-align:center;width:100%">No salary data</p>';
        return;
    }
    const mins = roles.map(r => r.salary_min);
    const maxs = roles.map(r => r.salary_max);
    const minAvg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    const maxAvg = Math.round(maxs.reduce((a, b) => a + b, 0) / maxs.length);
    const highest = Math.max(...maxs);

    row.innerHTML = `
        <div class="salary-box"><span class="salary-val">₹${minAvg} LPA</span><span class="salary-label">Avg. Minimum</span></div>
        <div class="salary-box"><span class="salary-val">₹${maxAvg} LPA</span><span class="salary-label">Avg. Maximum</span></div>
        <div class="salary-box"><span class="salary-val">₹${highest} LPA</span><span class="salary-label">Highest</span></div>
    `;
}

function toast(msg, type = 'info') {
    const wrap = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type === 'error'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    el.innerHTML = `${icon}<span>${msg}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.style.animation = 'toastSlide 0.3s ease reverse forwards'; setTimeout(() => el.remove(), 300); }, 4000);
}

fetch('/api/health').then(r => r.json()).then(d => console.log('SmartResume AI:', d)).catch(() => {});
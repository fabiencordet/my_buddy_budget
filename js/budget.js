/**
 * budget.js
 * Gestion du budget prévisionnel : modal de configuration,
 * sauvegarde Supabase, rendu accordéon catégorie > poste > description.
 */

const DEFAULT_FORECAST_BUDGET = 1;

async function saveBudgetLines() {
    if (!_supabase || !currentUser) return;
    await _supabase.from('budget_lines').delete().neq('id', 0);
    if (budgetLines.length) {
        const rows = budgetLines.map(b => ({ poste: b.poste, description: b.description || '', amount: b.amount }));
        const { error } = await _supabase.from('budget_lines').insert(rows);
        if (error) console.error('Erreur save budget_lines:', error.message);
    }
}

function openBudgetModal() {
    const catSel = document.getElementById('budget-categorie-select');
    catSel.innerHTML = '';
    Object.keys(budgetStructure).sort().forEach(cat => {
        const o = document.createElement('option');
        o.value = cat; o.textContent = cat;
        catSel.appendChild(o);
    });
    catSel.onchange = () => populatePosteSelect(catSel.value);
    populatePosteSelect(catSel.value);

    renderBudgetLinesList();
    document.getElementById('budget-modal').classList.remove('hidden');
}

function populatePosteSelect(categorie) {
    const posteSel = document.getElementById('budget-poste-select');
    posteSel.innerHTML = '';
    Object.keys(budgetStructure[categorie] || {}).sort().forEach(p => {
        const o = document.createElement('option');
        o.value = p; o.textContent = p;
        posteSel.appendChild(o);
    });
    posteSel.onchange = () => populateDescriptionSelect(categorie, posteSel.value);
    populateDescriptionSelect(categorie, posteSel.value);
}

function populateDescriptionSelect(categorie, poste) {
    const descSel = document.getElementById('budget-description-select');
    descSel.innerHTML = '';
    (budgetStructure[categorie]?.[poste] || []).slice().sort().forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        descSel.appendChild(o);
    });
}

function closeBudgetModal() {
    document.getElementById('budget-modal').classList.add('hidden');
    refreshDashboard();
}

function addBudgetLine() {
    const poste = document.getElementById('budget-poste-select').value;
    const description = document.getElementById('budget-description-select').value;
    const amount = parseFloat(document.getElementById('budget-amount-input').value);
    if (!poste || !description || isNaN(amount) || amount <= 0) {
        alert('Sélectionnez une catégorie, un poste, une description et un montant valide.');
        return;
    }
    setBudgetAmount(poste, description, amount);
    document.getElementById('budget-amount-input').value = '';
    renderBudgetLinesList();
}

function deleteBudgetLine(index) {
    budgetLines.splice(index, 1);
    saveBudgetLines();
    renderBudgetLinesList();
}

function renderBudgetLinesList() {
    const list  = document.getElementById('budget-lines-list');
    const empty = document.getElementById('budget-lines-empty');
    list.innerHTML = '';
    if (!budgetLines.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');

    // Table de correspondance poste -> catégorie, à partir de budgetStructure
    const posteToCat = {};
    Object.entries(budgetStructure).forEach(([cat, postes]) => {
        Object.keys(postes).forEach(p => { posteToCat[p.toUpperCase().trim()] = cat; });
    });

    // Regroupement catégorie > poste > lignes
    const grouped = {};
    budgetLines.forEach((b, i) => {
        const cat = posteToCat[b.poste] || 'Autre';
        if (!grouped[cat]) grouped[cat] = {};
        if (!grouped[cat][b.poste]) grouped[cat][b.poste] = [];
        grouped[cat][b.poste].push({ ...b, index: i });
    });

    Object.keys(grouped).sort().forEach(cat => {
        const catBlock = document.createElement('div');
        catBlock.className = 'space-y-1.5';
        catBlock.innerHTML = `<p class="text-[10px] font-bold text-slate-500 uppercase tracking-wide pt-1">${cat}</p>`;

        Object.keys(grouped[cat]).sort().forEach(poste => {
            const posteBlock = document.createElement('div');
            posteBlock.className = 'space-y-1 pl-2 border-l-2 border-slate-100';
            posteBlock.innerHTML = `<p class="text-[10px] font-semibold text-slate-400 uppercase">${poste}</p>`;

            grouped[cat][poste].forEach(b => {
                const item = document.createElement('div');
                item.className = 'flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50';
                item.innerHTML = `
                    <div class="flex-1 min-w-0"><p class="text-[11px] text-slate-600 truncate">${b.description || '—'}</p></div>
                    <input type="number" min="0" step="10" value="${b.amount}"
                        class="field mono text-right w-24 text-xs"
                        onchange="budgetLines[${b.index}].amount=parseFloat(this.value)||0;saveBudgetLines();renderBudgetLinesList()">
                    <span class="text-[11px] text-slate-400">€/mois</span>
                    <button onclick="deleteBudgetLine(${b.index})" class="text-rose-400 hover:text-rose-600 text-lg font-light leading-none transition">×</button>`;
                posteBlock.appendChild(item);
            });
            catBlock.appendChild(posteBlock);
        });
        list.appendChild(catBlock);
    });
}

function setBudgetAmount(poste, description, amount) {
    const key = poste.toUpperCase().trim() + '||' + (description || '').toUpperCase().trim();
    const idx = budgetLines.findIndex(b => b.key === key);
    if (amount < 0 || isNaN(amount)) {
        if (idx >= 0) budgetLines.splice(idx, 1);
    } else {
        if (idx >= 0) budgetLines[idx].amount = amount;
        else budgetLines.push({ key, poste: poste.toUpperCase().trim(), description: (description || '').toUpperCase().trim(), amount });
    }
}

function getBudgetSeverity(actual, budget) {
    if (!budget || budget <= 0) {
        // Budget à 0€ (ou non défini) : toute dépense est un dépassement.
        return actual > 0 ? 'over' : 'ok';
    }
    return actual > budget ? 'over' : 'ok';
}

function getBudgetVisuals(actual, budget) {
    const severity = getBudgetSeverity(actual, budget);
    if (severity === 'over') return { color: '#e11d48', barClass: 'budget-over' };
    if (severity === 'ok')   return { color: '#059669', barClass: 'budget-ok' };
    return { color: '#0f172a', barClass: 'budget-ok' };
}

function hexToRgba(hex, alpha) {
    const raw = (hex || '').replace('#', '');
    if (raw.length !== 6) return `rgba(148,163,184,${alpha})`;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function getForecastAccentColor(category) {
    return categoryBarColor?.[category] || '#64748b';
}

// ── Rendu accordéon prévisionnel ────────────────────────
function renderBudgetPrevisionnel(activeMonth) {
    const container = document.getElementById('budget-previsionnel-container');
    if (!container) return;
    const forecastEntries = Object.entries(budgetStructure).filter(
        ([cat]) => cat.toUpperCase().trim() !== 'REVENUS'
    );
    const spentByDesc = {}, spentByPoste = {};
    transactions.forEach(t => {
        if (t.exclu_dashboard) return;
        const m = t.mois_affectation || getYearMonthString(t.date);
        if (m !== activeMonth) return;
        const amt = parseFloat(t.montant) || 0;
        if (!Number.isFinite(amt) || amt === 0) return;
        const p = (t.poste || '').toUpperCase().trim();
        const d = (t.description || '').toUpperCase().trim();
        const k = p + '||' + d;
        const absAmt = Math.abs(amt);
        spentByDesc[k]  = (spentByDesc[k]  || 0) + absAmt;
        spentByPoste[p] = (spentByPoste[p] || 0) + absAmt;
    });

    let totalBudget = 0, totalActual = 0;
    forecastEntries.forEach(([, postes]) => {
        Object.entries(postes).forEach(([poste, descs]) => {
            const pk = poste.toUpperCase().trim();
            descs.forEach(desc => {
                const dk = pk + '||' + desc.toUpperCase().trim();
                const b = budgetLines.find(x => x.key === dk);
                totalBudget += b ? b.amount : DEFAULT_FORECAST_BUDGET;
                totalActual += (spentByDesc[dk] || 0);
            });
        });
    });

    container.innerHTML = '';

    const totalVisuals = getBudgetVisuals(totalActual, totalBudget);
    const totalPct  = totalBudget > 0 ? Math.round(totalActual / totalBudget * 100) : 0;
    const totalColor = totalVisuals.color;
    const totalRow = document.createElement('div');
    totalRow.className = 'forecast-total-card';
    totalRow.innerHTML = `
        <div class="forecast-total-title-wrap">
            <span class="forecast-total-label">Vue prévisionnelle</span>
            <span class="forecast-total-sub">Dépensé vs objectif global</span>
        </div>
        <div class="forecast-values forecast-values-total">
            <span class="forecast-spent mono" style="color:${totalColor}">${fmt(totalActual)}</span>
            <span class="forecast-divider">/</span>
            <span class="forecast-target mono">${fmt(totalBudget)}</span>
            <span class="forecast-ratio mono" style="color:${totalColor}">${totalPct}%</span>
        </div>`;
    container.appendChild(totalRow);

    forecastEntries.forEach(([cat, postes]) => {
        let catBudget = 0, catActual = 0;
        Object.entries(postes).forEach(([poste, descs]) => {
            const pk = poste.toUpperCase().trim();
            descs.forEach(desc => {
                const dk = pk + '||' + desc.toUpperCase().trim();
                const b = budgetLines.find(x => x.key === dk);
                catBudget += b ? b.amount : DEFAULT_FORECAST_BUDGET;
                catActual += (spentByDesc[dk] || 0);
            });
        });
        const catVisuals = getBudgetVisuals(catActual, catBudget);
        const catColor = catVisuals.color;
        const catAccent = getForecastAccentColor(cat);

        const catWrap   = document.createElement('div');
        catWrap.className = 'forecast-cat-wrap';
        catWrap.style.borderColor = hexToRgba(catAccent, 0.35);
        catWrap.style.background = `linear-gradient(180deg, ${hexToRgba(catAccent, 0.07)} 0%, rgba(255,255,255,0.96) 72%)`;

        const catHeader = document.createElement('div');
        catHeader.className = 'forecast-head forecast-head-cat';
        catHeader.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <span class="text-base transition-transform duration-200 accordion-arrow">▶</span>
                <span class="text-[11px] font-bold text-slate-700 uppercase tracking-tight truncate">${cat}</span>
            </div>
            <div class="forecast-values">
                <span class="forecast-spent mono" style="color:${catColor}">${fmt(catActual)}</span>
                <span class="forecast-divider">/</span>
                <span class="forecast-target mono">${fmt(catBudget)}</span>
            </div>`;

        const catBody = document.createElement('div');
        catBody.className = 'hidden forecast-cat-body';

        Object.entries(postes).forEach(([poste, descs]) => {
            const pk = poste.toUpperCase().trim();
            let posteBudget = 0, posteActual = 0;
            descs.forEach(desc => {
                const dk = pk + '||' + desc.toUpperCase().trim();
                const b = budgetLines.find(x => x.key === dk);
                posteBudget += b ? b.amount : DEFAULT_FORECAST_BUDGET;
                posteActual += (spentByDesc[dk] || 0);
            });
            const posteVisuals = getBudgetVisuals(posteActual, posteBudget);
            const posteColor = posteVisuals.color;

            const posteWrap   = document.createElement('div');
            posteWrap.className = 'forecast-poste-wrap';
            posteWrap.style.borderColor = hexToRgba(catAccent, 0.22);

            const posteHeader = document.createElement('div');
            posteHeader.className = 'forecast-head forecast-head-poste';
            posteHeader.innerHTML = `
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-xs transition-transform duration-200 accordion-arrow">▶</span>
                    <span class="text-[11px] font-semibold text-slate-600 uppercase tracking-tight truncate">${poste}</span>
                </div>
                <div class="forecast-values">
                    <span class="forecast-spent mono" style="color:${posteColor}">${fmt(posteActual)}</span>
                    <span class="forecast-divider">/</span>
                    <span class="forecast-target mono">${fmt(posteBudget)}</span>
                </div>`;

            const posteBody = document.createElement('div');
            posteBody.className = 'hidden forecast-poste-body';

            descs.forEach(desc => {
                const dk     = pk + '||' + desc.toUpperCase().trim();
                const b      = budgetLines.find(x => x.key === dk);
                const budget = b ? b.amount : DEFAULT_FORECAST_BUDGET;
                const actual = spentByDesc[dk] || 0;
                const pct    = budget > 0 ? Math.min(Math.round(actual / budget * 100), 100) : 0;
                const descVisuals = getBudgetVisuals(actual, budget);
                const dColor = descVisuals.color;

                const descWrap = document.createElement('div');
                descWrap.className = 'forecast-desc-wrap';
                descWrap.style.borderColor = hexToRgba(catAccent, 0.2);

                const descTop = document.createElement('div');
                descTop.className = 'forecast-head forecast-head-desc';
                descTop.innerHTML = `
                    <div class="min-w-0 flex-1">
                        <span class="text-[11px] text-slate-600 truncate leading-tight block">${desc}</span>
                    </div>
                    <div class="forecast-values">
                        <span class="forecast-spent mono" style="color:${dColor}">${fmt(actual)}</span>
                        <span class="forecast-divider">/</span>
                        <span class="forecast-target mono budget-editable" title="Cliquer pour modifier le budget">${fmt(budget)}</span>
                    </div>`;
                descWrap.appendChild(descTop);

                const targetSpan = descTop.querySelector('.forecast-target');
                targetSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = '0';
                    input.step = '10';
                    input.value = budget;
                    input.className = 'field mono text-right w-20 text-[11px] py-0.5 px-1.5';
                    targetSpan.replaceWith(input);
                    input.focus();
                    input.select();
                    const commit = async () => {
                        const newVal = parseFloat(input.value) || 0;
                        setBudgetAmount(poste, desc, newVal); // met à jour budgetLines localement + lance la sauvegarde
                        await saveBudgetLines(); // attend la fin réelle de la sauvegarde Supabase
                        renderBudgetPrevisionnel(document.getElementById('dashboard-month-select')?.value || '');
                        renderMainBudgetChart();
                    };
                    input.addEventListener('blur', commit);
                    input.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') input.blur();
                        if (ev.key === 'Escape') input.replaceWith(targetSpan);
                    });
                });
                if (budget > 0) {
                    const barRow = document.createElement('div');
                    barRow.className = 'budget-desc-progress';
                    barRow.innerHTML = `<div class="budget-prog-track"><div class="budget-prog-fill" style="width:${pct}%;background:${catAccent}"></div></div>`;
                    descWrap.appendChild(barRow);
                }
                posteBody.appendChild(descWrap);
            });

            posteHeader.addEventListener('click', () => {
                const open = !posteBody.classList.contains('hidden');
                posteBody.classList.toggle('hidden', open);
                posteHeader.querySelector('.accordion-arrow').style.transform = open ? '' : 'rotate(90deg)';
            });
            posteWrap.appendChild(posteHeader);
            posteWrap.appendChild(posteBody);
            catBody.appendChild(posteWrap);
        });

        catHeader.addEventListener('click', () => {
            const open = !catBody.classList.contains('hidden');
            catBody.classList.toggle('hidden', open);
            catHeader.querySelector('.accordion-arrow').style.transform = open ? '' : 'rotate(90deg)';
        });
        catWrap.appendChild(catHeader);
        catWrap.appendChild(catBody);
        container.appendChild(catWrap);
    });
}

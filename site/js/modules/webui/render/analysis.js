// Shared render helpers for code analysis result visualizations.
// Used by both individual.js and pairwise.js.

// ─── Utility Helpers ────────────────────────────────────────────────────────

function escapeHTML(str) {
    if (str === null || str === undefined) {
        return '';
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatNumber(value, decimalPlaces = 2) {
    if (value === null || value === undefined) {
        return '-';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return '-';
    }
    return num.toFixed(decimalPlaces);
}

function formatPercent(value) {
    if (value === null || value === undefined) {
        return '-';
    }
    return formatNumber(value * 100, 1) + '%';
}

function msToSeconds(ms) {
    if (ms === null || ms === undefined) {
        return '-';
    }
    return formatNumber(ms / 1000) + 's';
}

// ─── Visual Render Helpers ───────────────────────────────────────────────────

// Renders a horizontal progress bar.
// maxValue should come from summary aggregate max — never hardcoded.
function scoreBar(value, maxValue) {
    if (value === null || value === undefined || !maxValue || maxValue === 0) {
        return `<span>-</span>`;
    }
    const pct = Math.min(100, (value / maxValue) * 100).toFixed(1);
    return `
        <div class='score-bar-container'>
            <div class='score-bar-track'>
                <div class='score-bar-fill' style='width:${pct}%'></div>
            </div>
            <span>${formatNumber(value)}</span>
        </div>
    `;
}

// Renders a colored similarity bar: green (low) / orange (mid) / red (high).
function similarityBar(score) {
    if (score === null || score === undefined) {
        return `<span>-</span>`;
    }
    let cls = 'similarity-low';
    if (score >= 0.5) {
        cls = 'similarity-high';
    } else if (score >= 0.2) {
        cls = 'similarity-mid';
    }
    const pct = Math.min(100, score * 100).toFixed(1);
    return `
        <div class='score-bar-container'>
            <div class='score-bar-track'>
                <div class='score-bar-fill ${cls}' style='width:${pct}%'></div>
            </div>
            <span>${formatPercent(score)}</span>
        </div>
    `;
}

// Renders cells: count | mean | median | min | max from an aggregate object.
function aggregateCells(aggregate) {
    if (!aggregate) {
        return `<td colspan='5'>-</td>`;
    }
    return `
        <td>${formatNumber(aggregate['count'], 0)}</td>
        <td>${formatNumber(aggregate['mean'])}</td>
        <td>${formatNumber(aggregate['median'])}</td>
        <td>${formatNumber(aggregate['min'])}</td>
        <td>${formatNumber(aggregate['max'])}</td>
    `;
}

// Returns styled pending/empty state paragraph.
function pendingState(message = 'Data pending or unavailable.') {
    return `<p class='analysis-pending'>${escapeHTML(message)}</p>`;
}

// Wraps content in a titled analysis section block.
function analysisSection(title, bodyHTML) {
    return `
        <div class='analysis-section'>
            <h3>${escapeHTML(title)}</h3>
            ${bodyHTML}
        </div>
    `;
}

// Collapsible raw JSON fallback for debugging.
function rawJsonFallback(result) {
    const json = JSON.stringify(result, null, 4);
    return `
        <details class='raw-json-fallback'>
            <summary>Raw JSON</summary>
            <pre class='code-block'>${escapeHTML(json)}</pre>
        </details>
    `;
}

// ─── Individual Analysis Sections ────────────────────────────────────────────

function renderIndividualAnalysis(result) {
    const summary = result['summary'];
    const results = result['results'] ?? {};
    const isComplete = result['complete'];

    let html = '';

    // Pending banner.
    if (!isComplete) {
        html += `<p class='analysis-pending'>⏳ Analysis is still running. Showing partial data.</p>`;
    }

    // --- Section A: Summary Stats ---
    const aggregateHeaders = `
        <tr>
            <th>Metric</th>
            <th>Count</th>
            <th>Mean</th>
            <th>Median</th>
            <th>Min</th>
            <th>Max</th>
        </tr>
    `;

    const summaryRows = [
        ['Score',         summary['aggregate-score']],
        ['Lines of Code', summary['aggregate-lines-of-code']],
        ['Time Delta',    summary['aggregate-submission-time-delta']],
        ['LOC Delta',     summary['aggregate-lines-of-code-delta']],
        ['Score Delta',   summary['aggregate-score-delta']],
        ['LOC / hr (Velocity)',   summary['aggregate-lines-of-code-per-hour']],
        ['Score / hr (Velocity)', summary['aggregate-score-per-hour']],
    ].map(([label, agg]) => `
        <tr>
            <th class='label'>${escapeHTML(label)}</th>
            ${aggregateCells(agg)}
        </tr>
    `).join('');

    let summaryHTML = `
        <table class='standard-table analysis-summary-table'>
            <thead>${aggregateHeaders}</thead>
            <tbody>${summaryRows}</tbody>
        </table>
    `;

    // Per-file LOC sub-table.
    const locPerFile = summary['aggregate-lines-of-code-per-file'];
    if (locPerFile) {
        const fileRows = Object.keys(locPerFile).sort().map((filename) => `
            <tr>
                <td>${escapeHTML(filename)}</td>
                ${aggregateCells(locPerFile[filename])}
            </tr>
        `).join('');

        summaryHTML += `
            <h4 style='margin-top:1em;margin-bottom:0.5em;'>Lines of Code per File</h4>
            <table class='standard-table analysis-loc-per-file-table'>
                <thead>
                    <tr>
                        <th>File</th><th>Count</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th>
                    </tr>
                </thead>
                <tbody>${fileRows}</tbody>
            </table>
        `;
    } else {
        summaryHTML += pendingState('Per-file LOC breakdown not yet available.');
    }

    html += analysisSection('Summary Statistics', summaryHTML);

    // --- Section B: Per-Submission Table ---
    const dynamicMax = summary['aggregate-score']?.['max'] ?? 1;
    const submissionIDs = Object.keys(results).sort();

    let resultsHTML = '';
    if (submissionIDs.length === 0) {
        resultsHTML = pendingState('No individual results yet.');
    } else {
        const rows = submissionIDs.map((id) => {
            const r = results[id];
            const score      = r['score']                 ?? null;
            const loc        = r['lines-of-code']         ?? null;
            const timeDelta  = r['submission-time-delta'] ?? null;
            const locDelta   = r['lines-of-code-delta']   ?? null;
            const scoreDelta = r['score-delta']           ?? null;
            const locPerHr   = r['lines-of-code-per-hour'] ?? null;
            const scorePerHr = r['score-per-hour']        ?? null;

            return `
                <tr>
                    <td title='${escapeHTML(id)}'>${escapeHTML(r['short-id'] ?? id)}</td>
                    <td>${scoreBar(score, dynamicMax)}</td>
                    <td>${formatNumber(loc, 0)}</td>
                    <td>${msToSeconds(timeDelta)}</td>
                    <td>${formatNumber(locDelta, 0)}</td>
                    <td>${formatNumber(scoreDelta)}</td>
                    <td>${formatNumber(locPerHr)}</td>
                    <td>${formatNumber(scorePerHr)}</td>
                </tr>
            `;
        }).join('');

        resultsHTML = `
            <table class='standard-table analysis-results-table'>
                <thead>
                    <tr>
                        <th>Submission ID</th>
                        <th>Score</th>
                        <th>LOC</th>
                        <th>Time Δ</th>
                        <th>LOC Δ</th>
                        <th>Score Δ</th>
                        <th>LOC / hr</th>
                        <th>Score / hr</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    html += analysisSection('Per-Submission Results', resultsHTML);

    // --- Raw JSON Fallback ---
    html += rawJsonFallback(result);

    return html;
}

// ─── Pairwise Analysis Sections ──────────────────────────────────────────────

function renderPairwiseAnalysis(result) {
    const summary = result['summary'];
    const results = result['results'] ?? {};
    const isComplete = result['complete'];

    let html = '';

    if (!isComplete) {
        html += `<p class='analysis-pending'>⏳ Analysis is still running. Showing partial data.</p>`;
    }

    // --- Section A: Summary ---
    const totalMean = summary['aggregate-total-mean-similarity'];
    let summaryHTML = `
        <div style='margin-bottom:1em;'>
            <strong>Overall Mean Similarity:</strong>
            ${similarityBar(totalMean?.['mean'] ?? null)}
        </div>
    `;

    const meanSims = summary['aggregate-mean-similarities'];
    if (meanSims) {
        const fileRows = Object.keys(meanSims).sort().map((filename) => `
            <tr>
                <td>${escapeHTML(filename)}</td>
                ${aggregateCells(meanSims[filename])}
            </tr>
        `).join('');

        summaryHTML += `
            <table class='standard-table pairwise-summary'>
                <thead>
                    <tr>
                        <th>File</th><th>Count</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th>
                    </tr>
                </thead>
                <tbody>${fileRows}</tbody>
            </table>
        `;
    } else {
        summaryHTML += pendingState('Per-file similarity summary not yet available.');
    }

    html += analysisSection('Similarity Summary', summaryHTML);

    // --- Section B: Per-Pair Flattened Table ---
    const pairKeys = Object.keys(results).sort();
    let pairsHTML = '';

    if (pairKeys.length === 0) {
        pairsHTML = pendingState('No pairwise results yet.');
    } else {
        let rows = '';
        for (const pairKey of pairKeys) {
            const pair = results[pairKey];
            const sims = pair['similarities'] ?? {};
            const fileNames = Object.keys(sims).sort();

            // Shorten pair key for display — keep only short IDs.
            const parts = pairKey.split('||');
            const shortDisplay = parts.map((p) => {
                const segs = p.split('::');
                return segs[segs.length - 1] ?? p;
            }).join(' || ');

            let pairHasRows = false;
            for (const filename of fileNames) {
                const toolEntries = sims[filename] ?? [];
                for (const entry of toolEntries) {
                    const score = entry['score'] ?? null;
                    rows += `
                        <tr>
                            <td title='${escapeHTML(pairKey)}'>${escapeHTML(shortDisplay)}</td>
                            <td>${escapeHTML(filename)}</td>
                            <td>${escapeHTML(entry['tool'] ?? '-')}</td>
                            <td>${similarityBar(score)}</td>
                        </tr>
                    `;
                    pairHasRows = true;
                }
            }

            // Fallback: no files at all, OR files exist but all tool entry arrays were empty.
            if (!pairHasRows) {
                rows += `
                    <tr>
                        <td title='${escapeHTML(pairKey)}'>${escapeHTML(shortDisplay)}</td>
                        <td colspan='3'>${pendingState('No tool results available.')}</td>
                    </tr>
                `;
            }
        }

        pairsHTML = `
            <table class='standard-table pairwise-pairs-table'>
                <thead>
                    <tr>
                        <th>Pair (short IDs)</th>
                        <th>File</th>
                        <th>Tool</th>
                        <th>Similarity</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    html += analysisSection('Per-Pair Comparisons', pairsHTML);

    // --- Raw JSON Fallback ---
    html += rawJsonFallback(result);

    return html;
}

export {
    escapeHTML,
    formatNumber,
    formatPercent,
    msToSeconds,
    scoreBar,
    similarityBar,
    aggregateCells,
    pendingState,
    analysisSection,
    rawJsonFallback,
    renderIndividualAnalysis,
    renderPairwiseAnalysis,
};
